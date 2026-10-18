// The universal creator: one editor for cells, creatures, outfits, vehicles, buildings and ships.
// Touch-first: tap a part to auto-place it, or drag it onto the body; tap a placed part to tune it.
import type { Game, Scene } from '../game/game';
import type { PointerInfo } from '../engine/input';
import { button, h, ui } from '../engine/ui';
import { audio } from '../engine/audio';
import { clamp, TAU } from '../engine/math';
import { uid } from '../engine/rng';
import { computeStats, designCost, getPart, partsFor } from '../design/registry';
import { drawPartThumb, layoutDesign, partAnchor, renderCell, renderDesign, type Pose } from '../design/render';
import { cloneDesign } from '../design/generate';
import { SWATCHES } from '../design/color';
import type { AbilityId, Design, DesignKind, PartCategory, PartDef, PartInstance, PatternId } from '../design/types';
import { ABILITY_INFO, BUILDING_STATS, CELL_STATS, CREATURE_STATS, OUTFIT_STATS, SHIP_STATS, VEHICLE_STATS } from './abilityInfo';
import { codexSave } from '../game/codex';

export interface EditorTab {
  id: string;
  label: string;
  icon: string;
  cats?: PartCategory[];
  special?: 'body' | 'paint' | 'test';
}

export type EditorBg = 'tide' | 'meadow' | 'workshop' | 'space' | 'city' | 'village';

export interface EditorConfig {
  design: Design;
  title?: string;
  mode: 'free' | 'stage';
  budget?: number;
  currency?: string;
  /** Part ids the player may use (stage mode). Tier-1 parts are always allowed unless strictUnlocks. */
  unlocked?: string[] | 'all';
  strictUnlocks?: boolean;
  /** Restrict mouths to a diet (diet card rule). */
  allowedDiets?: string[];
  tabs?: EditorTab[];
  allowBody?: boolean;
  /** Body nodes may be resized but not moved/added (cell editor). */
  bodyResizeOnly?: boolean;
  required?: { cat: PartCategory[]; msg: string }[];
  maxParts?: number;
  /** Parts that may not be moved or removed (e.g. the creature body when outfitting). */
  lockedUids?: string[];
  stats?: AbilityId[];
  background?: EditorBg;
  allowSave?: boolean;
  allowCancel?: boolean;
  hint?: string;
  lockedHint?: string;
  doneLabel?: string;
}

export interface EditorResult {
  design: Design;
  spent: number;
}

const DEFAULT_TABS: Record<DesignKind | 'outfit', EditorTab[]> = {
  creature: [
    { id: 'body', label: 'Body', icon: '🦴', special: 'body' },
    { id: 'mouth', label: 'Mouths', icon: '👄', cats: ['mouth'] },
    { id: 'eye', label: 'Eyes', icon: '👁️', cats: ['eye'] },
    { id: 'limb', label: 'Limbs', icon: '🦵', cats: ['leg', 'arm'] },
    { id: 'weapon', label: 'Weapons', icon: '🦂', cats: ['weapon'] },
    { id: 'detail', label: 'Details', icon: '✨', cats: ['detail', 'tail', 'wing'] },
    { id: 'paint', label: 'Paint', icon: '🎨', special: 'paint' },
    { id: 'test', label: 'Test', icon: '▶️', special: 'test' },
  ],
  cell: [
    { id: 'body', label: 'Body', icon: '🫧', special: 'body' },
    { id: 'mouth', label: 'Mouths', icon: '👄', cats: ['cell-mouth'] },
    { id: 'move', label: 'Movement', icon: '〰️', cats: ['cell-move'] },
    { id: 'weapon', label: 'Weapons', icon: '🔱', cats: ['cell-weapon'] },
    { id: 'eye', label: 'Eyes', icon: '👁️', cats: ['cell-eye'] },
    { id: 'paint', label: 'Paint', icon: '🎨', special: 'paint' },
  ],
  outfit: [
    { id: 'hat', label: 'Hats', icon: '👒', cats: ['hat'] },
    { id: 'mask', label: 'Masks', icon: '🎭', cats: ['mask'] },
    { id: 'chest', label: 'Chest', icon: '🦺', cats: ['chest'] },
    { id: 'shoulder', label: 'Shoulders', icon: '🪖', cats: ['shoulder'] },
    { id: 'trinket', label: 'Trinkets', icon: '📿', cats: ['trinket'] },
    { id: 'paint', label: 'Paint', icon: '🎨', special: 'paint' },
    { id: 'test', label: 'Test', icon: '▶️', special: 'test' },
  ],
  vehicle: [
    { id: 'body', label: 'Chassis', icon: '🧱', special: 'body' },
    { id: 'loco', label: 'Motion', icon: '🛞', cats: ['locomotion'] },
    { id: 'weapon', label: 'Weapons', icon: '🎯', cats: ['v-weapon'] },
    { id: 'tool', label: 'Tools', icon: '📡', cats: ['v-tool'] },
    { id: 'detail', label: 'Details', icon: '✨', cats: ['v-detail', 'cockpit'] },
    { id: 'paint', label: 'Paint', icon: '🎨', special: 'paint' },
    { id: 'test', label: 'Test', icon: '▶️', special: 'test' },
  ],
  building: [
    { id: 'body', label: 'Floors', icon: '🧱', special: 'body' },
    { id: 'roof', label: 'Roofs', icon: '🏠', cats: ['roof'] },
    { id: 'wall', label: 'Walls', icon: '🚪', cats: ['wall', 'door'] },
    { id: 'detail', label: 'Details', icon: '✨', cats: ['b-detail'] },
    { id: 'paint', label: 'Paint', icon: '🎨', special: 'paint' },
  ],
  ship: [
    { id: 'body', label: 'Hull', icon: '🛸', special: 'body' },
    { id: 'engine', label: 'Engines', icon: '🔥', cats: ['s-engine'] },
    { id: 'wing', label: 'Wings', icon: '🪽', cats: ['s-wing'] },
    { id: 'weapon', label: 'Weapons', icon: '🎯', cats: ['s-weapon'] },
    { id: 'detail', label: 'Details', icon: '✨', cats: ['s-detail', 'cockpit'] },
    { id: 'paint', label: 'Paint', icon: '🎨', special: 'paint' },
    { id: 'test', label: 'Test', icon: '▶️', special: 'test' },
  ],
};

export function defaultTabs(kind: DesignKind | 'outfit'): EditorTab[] {
  return DEFAULT_TABS[kind];
}

const MAX_NODES: Record<DesignKind, number> = { cell: 6, creature: 8, vehicle: 6, building: 6, ship: 6 };
const NODE_R: Record<DesignKind, [number, number]> = { cell: [4, 13], creature: [6, 30], vehicle: [8, 26], building: [10, 28], ship: [8, 26] };
const PATTERNS: { id: PatternId; label: string }[] = [
  { id: 'none', label: 'Plain' }, { id: 'spots', label: 'Spots' }, { id: 'stripes', label: 'Stripes' }, { id: 'tiger', label: 'Tiger' },
  { id: 'bands', label: 'Back' }, { id: 'belly', label: 'Belly' }, { id: 'patches', label: 'Patches' }, { id: 'dots', label: 'Dots' },
  { id: 'scales', label: 'Scales' }, { id: 'gradient', label: 'Fade' },
];

type Drag =
  | { type: 'part'; pid: number; uid: string; grabDX: number; grabDY: number; moved: boolean }
  | { type: 'node'; pid: number; index: number }
  | { type: 'new'; pid: number; part: PartDef; sx: number; sy: number }
  | { type: 'pan'; pid: number }
  | null;

export function openEditor(game: Game, cfg: EditorConfig): Promise<EditorResult | null> {
  return new Promise((resolve) => game.push(new EditorScene(cfg, resolve)));
}

export class EditorScene implements Scene {
  name = 'editor';
  music = 'editor' as const;
  private game!: Game;
  private d: Design;
  private origCost: number;
  private tabs: EditorTab[];
  private tab: EditorTab;
  private selUid: string | null = null;
  private selNode: number | null = null;
  private drag: Drag = null;
  private dragPos = { x: 0, y: 0 };
  private view = { s: 3, ox: 0, oy: 0 };
  private undo: string[] = [];
  private t = 0;
  private paintChannel: 'base' | 'coat' | 'detail' = 'base';
  private testAction: { name: string; t: number } | null = null;
  private testX = 0;
  private testDir = 1;
  private phase = 0;
  private pinchStart = 0;
  // DOM
  private elStats!: HTMLElement;
  private elBudget!: HTMLElement;
  private elPalette!: HTMLElement;
  private elTabs!: HTMLElement;
  private elSel!: HTMLElement;
  private elTrash!: HTMLElement;
  private elName!: HTMLInputElement;
  private bottomH = 170;

  constructor(private cfg: EditorConfig, private resolve: (r: EditorResult | null) => void) {
    this.d = cloneDesign(cfg.design);
    this.origCost = designCost(cfg.design);
    const isOutfit = (cfg.tabs ?? []).some((t) => t.cats?.includes('hat'));
    this.tabs = cfg.tabs ?? defaultTabs(this.d.kind);
    if (cfg.allowBody === false && !cfg.bodyResizeOnly) this.tabs = this.tabs.filter((t) => t.special !== 'body');
    this.tab = this.tabs.find((t) => t.cats) ?? this.tabs[0];
    if (this.tabs[0]?.special === 'body' && !isOutfit && this.d.parts.length === 0 && cfg.allowBody !== false) this.tab = this.tabs[0];
  }

  // ------------------------------------------------------------------ lifecycle
  enter(game: Game) {
    this.game = game;
    this.buildUI();
    this.fitView();
    if (this.cfg.hint) setTimeout(() => ui.toast(this.cfg.hint!, { icon: '💡', ms: 5000 }), 400);
  }
  exit() {}
  onResize() { this.fitView(); this.updateBottomH(); }

  private get kind(): DesignKind { return this.d.kind; }
  private get free(): boolean { return this.cfg.mode === 'free'; }
  private get spent(): number { return this.free ? 0 : designCost(this.d) - this.origCost; }
  private get available(): number { return (this.cfg.budget ?? Infinity) - this.spent; }

  private fitView() {
    const L = layoutDesign(this.d);
    const w = this.game.w, hh = this.game.h;
    const usableH = hh - this.bottomH - 120;
    const s = clamp(Math.min((w * 0.62) / Math.max(40, L.width), (usableH * 0.7) / Math.max(40, L.height)), 1.2, this.kind === 'cell' ? 7 : 5);
    this.view.s = s;
    const cy = 70 + usableH * 0.5;
    if (this.kind === 'cell' || this.kind === 'ship') {
      this.view.ox = w / 2 - L.cx * s;
      this.view.oy = cy;
    } else {
      this.view.ox = w / 2 - L.cx * s;
      this.view.oy = cy + (L.height * s) / 2 - L.groundY * s;
    }
  }
  private toScreen(x: number, y: number) { return { x: this.view.ox + x * this.view.s, y: this.view.oy + y * this.view.s }; }
  private toDesign(sx: number, sy: number) { return { x: (sx - this.view.ox) / this.view.s, y: (sy - this.view.oy) / this.view.s }; }

  // ------------------------------------------------------------------ UI
  private buildUI() {
    const L = this.game.layer('editor');
    const top = h('div', { class: 'ed-top' });
    if (this.cfg.allowCancel !== false) top.append(button('✕', () => this.cancel(), { cls: 'icon', title: 'Cancel' }));
    this.elName = h('input', { class: 'ed-name', type: 'text', maxlength: '24', value: this.d.name, 'aria-label': 'Name' }) as HTMLInputElement;
    this.elName.addEventListener('input', () => { this.d.name = this.elName.value.slice(0, 24); });
    top.append(this.elName);
    top.append(button('↶', () => this.doUndo(), { cls: 'icon', title: 'Undo' }));
    if (this.cfg.allowSave !== false) top.append(button('💾', () => this.saveToCodex(), { cls: 'icon', title: 'Save to Codex' }));
    top.append(button(this.cfg.doneLabel ?? '✓', () => this.done(), { cls: 'primary ' + (this.cfg.doneLabel ? '' : 'icon'), title: 'Done' }));
    L.append(top);
    this.elStats = h('div', { class: 'ed-stats' });
    this.elBudget = h('div', { class: 'ed-budget' });
    L.append(this.elStats, this.elBudget);
    this.elSel = h('div', { class: 'ed-sel panel', style: 'display:none' });
    L.append(this.elSel);
    this.elTrash = h('div', { class: 'chip', style: 'position:absolute;left:50%;transform:translateX(-50%);top:calc(64px + var(--safe-t));display:none;background:rgba(200,40,40,.8)' }, '🗑️ Drop here or off the body to remove');
    L.append(this.elTrash);
    const bottom = h('div', { class: 'ed-bottom' });
    this.elTabs = h('div', { class: 'ed-tabs' });
    this.elPalette = h('div', { class: 'ed-palette' });
    bottom.append(this.elTabs, this.elPalette);
    L.append(bottom);
    this.renderTabs();
    this.renderPalette();
    this.refreshInfo();
    requestAnimationFrame(() => this.updateBottomH());
  }

  private updateBottomH() {
    const el = this.elPalette?.parentElement;
    if (el) this.bottomH = el.getBoundingClientRect().height || 170;
    this.elSel.style.bottom = `calc(${this.bottomH + 8}px)`;
  }

  private renderTabs() {
    this.elTabs.innerHTML = '';
    for (const t of this.tabs) {
      const b = h('button', { class: 'ed-tab' + (t === this.tab ? ' on' : '') }, h('span', { class: 'ti' }, t.icon), t.label);
      b.addEventListener('click', () => {
        audio.sfx('tap');
        this.tab = t;
        this.selUid = null;
        this.selNode = null;
        this.testAction = null;
        this.renderTabs();
        this.renderPalette();
        this.refreshSel();
        requestAnimationFrame(() => { this.updateBottomH(); this.fitView(); });
      });
      this.elTabs.append(b);
    }
  }

  private isUnlocked(p: PartDef): boolean {
    if (this.free || this.cfg.unlocked === 'all') return true;
    if (p.tier <= 1 && !this.cfg.strictUnlocks) return true;
    return (this.cfg.unlocked ?? []).includes(p.id);
  }
  private dietAllowed(p: PartDef): boolean {
    if (!p.diet || !this.cfg.allowedDiets || this.free) return true;
    return this.cfg.allowedDiets.includes(p.diet);
  }

  private renderPalette() {
    const pal = this.elPalette;
    pal.innerHTML = '';
    pal.style.flexWrap = '';
    pal.style.display = 'flex';
    if (this.tab.special === 'paint') return this.renderPaint();
    if (this.tab.special === 'test') return this.renderTest();
    if (this.tab.special === 'body') return this.renderBodyTools();
    const parts = (this.tab.cats ?? []).flatMap((c) => partsFor(this.kind, c));
    if (parts.length === 0) pal.append(h('div', { class: 'dim', style: 'padding:20px' }, 'No parts in this category yet.'));
    for (const p of parts) {
      const unlocked = this.isUnlocked(p) && this.dietAllowed(p);
      const c = h('canvas', { width: '72', height: '60' }) as HTMLCanvasElement;
      const tile = h('div', { class: 'ed-part' + (unlocked ? '' : ' locked') + (!this.free && unlocked && p.cost > this.available ? ' cant' : ''), title: p.desc ?? p.name },
        c, h('div', { class: 'pn' }, p.name), this.free ? null : h('div', { class: 'pc' }, String(p.cost)));
      pal.append(tile);
      requestAnimationFrame(() => drawPartThumb(c, p, this.d.colors));
      tile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!unlocked) {
          audio.sfx('error');
          ui.toast(!this.dietAllowed(p) ? `Your diet doesn't allow the ${p.name}.` : this.cfg.lockedHint ?? 'Locked. Keep playing to unlock this part.', { icon: '🔒' });
          return;
        }
        this.startNewPartDrag(p, e);
      });
    }
  }

  private renderBodyTools() {
    const pal = this.elPalette;
    const col = h('div', { class: 'col', style: 'padding:4px 6px;gap:8px;width:100%' });
    if (this.cfg.bodyResizeOnly) {
      col.append(h('div', { class: 'dim', style: 'font-size:13px' }, 'Tap a ring on the body to select it, then use the slider to make it fatter or thinner.'));
    } else {
      col.append(h('div', { class: 'dim', style: 'font-size:13px' }, 'Drag the rings to reshape. Tap a ring to resize it. The gold ring is the head.'));
      const row = h('div', { class: 'row', style: 'flex-wrap:wrap' });
      row.append(
        button('➕ Head', () => this.addNode('head'), { cls: 'small' }),
        button('➕ Tail', () => this.addNode('tail'), { cls: 'small' }),
        button('➖ Head', () => this.removeNode('head'), { cls: 'small' }),
        button('➖ Tail', () => this.removeNode('tail'), { cls: 'small' }),
        button('⤢ Fit', () => this.fitView(), { cls: 'small' }),
      );
      col.append(row);
    }
    pal.append(col);
  }

  private renderPaint() {
    const pal = this.elPalette;
    pal.style.display = 'block';
    const seg = h('div', { class: 'seg', style: 'margin:0 10px 6px' });
    for (const ch of ['base', 'coat', 'detail'] as const) {
      const b = h('button', { class: ch === this.paintChannel ? 'on' : '' }, h('span', { style: `display:inline-block;width:12px;height:12px;border-radius:50%;background:${this.d.colors[ch]};margin-right:6px;vertical-align:-1px;border:1px solid #fff8` }), ch === 'base' ? 'Base' : ch === 'coat' ? 'Pattern' : 'Accent');
      b.addEventListener('click', () => { this.paintChannel = ch; this.renderPalette(); });
      seg.append(b);
    }
    const sw = h('div', { class: 'swatches' });
    for (const col of SWATCHES) {
      const s = h('div', { class: 'swatch' + (this.d.colors[this.paintChannel] === col ? ' on' : ''), style: `background:${col}` });
      s.addEventListener('click', () => {
        this.pushUndo();
        this.d.colors[this.paintChannel] = col;
        audio.sfx('pop', { pitch: 0.8 + Math.random() * 0.4 });
        this.renderPalette();
      });
      sw.append(s);
    }
    const pats = h('div', { class: 'pattern-row' });
    for (const p of PATTERNS) {
      const b = button(p.label, () => { this.pushUndo(); this.d.colors.pattern = p.id; this.renderPalette(); }, { cls: 'small' + (this.d.colors.pattern === p.id ? ' on' : '') });
      pats.append(b);
    }
    const rnd = button('🎲 Surprise me', () => {
      this.pushUndo();
      const pick = () => SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
      this.d.colors = { base: pick(), coat: pick(), detail: pick(), pattern: PATTERNS[Math.floor(Math.random() * PATTERNS.length)].id };
      this.renderPalette();
    }, { cls: 'small' });
    pats.prepend(rnd);
    pal.append(seg, sw, pats);
  }

  private renderTest() {
    const pal = this.elPalette;
    const acts = this.kind === 'creature'
      ? [['walk', '🚶 Walk'], ['dance', '💃 Dance'], ['sing', '🎵 Sing'], ['bite', '🦷 Bite'], ['strike', '🗡️ Strike'], ['charge', '💥 Charge'], ['pose', '🙌 Pose'], ['jump', '🦘 Jump']]
      : [['walk', '▶️ Drive'], ['idle', '⏸ Idle']];
    const row = h('div', { class: 'row', style: 'flex-wrap:wrap;padding:4px 8px;gap:6px' });
    for (const [id, label] of acts) {
      row.append(button(label, () => {
        if (id === 'walk' || id === 'idle') { this.testAction = { name: id, t: 0 }; return; }
        this.testAction = { name: id, t: 0 };
        audio.sfx((id === 'jump' ? 'whoosh' : id === 'bite' ? 'chomp' : id === 'strike' || id === 'charge' ? 'hit' : id) as never);
      }, { cls: 'small' }));
    }
    pal.append(row);
  }

  private refreshInfo() {
    // Stats
    const stats = computeStats(this.d);
    const which = this.cfg.stats ?? (this.kind === 'creature' ? CREATURE_STATS : this.kind === 'cell' ? CELL_STATS : this.kind === 'vehicle' ? VEHICLE_STATS : this.kind === 'ship' ? SHIP_STATS : BUILDING_STATS);
    this.elStats.innerHTML = '';
    const max = this.kind === 'vehicle' || this.kind === 'ship' ? 10 : 5;
    for (const id of which) {
      const v = stats[id] ?? 0;
      if (v <= 0 && which.length > 8) continue;
      const pips = h('span', { class: 'pips' });
      for (let i = 0; i < Math.min(max, 5); i++) pips.append(h('i', { class: v > (max === 10 ? i * 2 : i) ? 'on' : '' }));
      this.elStats.append(h('div', { class: 'st' }, ABILITY_INFO[id].icon, ' ', ABILITY_INFO[id].name, ' ', pips));
    }
    // Budget + complexity
    this.elBudget.innerHTML = '';
    if (!this.free && this.cfg.budget !== undefined) {
      this.elBudget.append(h('div', { class: 'chip' }, h('span', { class: 'k' }, this.cfg.currency ?? 'DNA'), ' ', String(Math.round(this.available))));
    }
    const maxP = this.cfg.maxParts ?? (this.kind === 'cell' ? 12 : 24);
    const n = this.d.parts.length - (this.cfg.lockedUids?.length ?? 0);
    const cx = h('div', { class: 'bar' + (n >= maxP ? ' hp' : ''), style: 'width:96px;height:12px;min-width:0' }, h('div', { class: 'bar-fill', style: `width:${clamp(n / maxP, 0, 1) * 100}%` }));
    this.elBudget.append(h('div', { class: 'chip', style: 'flex-direction:column;align-items:flex-end;gap:4px' }, h('span', { class: 'k', style: 'font-size:11px' }, `Complexity ${n}/${maxP}`), cx));
  }

  private refreshSel() {
    const el = this.elSel;
    el.innerHTML = '';
    const pi = this.d.parts.find((p) => p.uid === this.selUid);
    if (pi) {
      const p = getPart(pi.partId);
      if (!p) return;
      const isLimb = p.category === 'leg' || p.category === 'arm';
      const size = h('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: String(pi.scale), 'aria-label': 'Size' }) as HTMLInputElement;
      size.addEventListener('pointerdown', () => this.pushUndo());
      size.addEventListener('input', () => { pi.scale = Number(size.value); this.refreshInfo(); });
      el.append(h('span', { class: 'dim', style: 'font-size:12px' }, '↔'), size);
      if (!isLimb && this.kind !== 'cell') {
        const rot = h('input', { type: 'range', min: '-180', max: '180', step: '5', value: String(Math.round((pi.rot * 180) / Math.PI)), 'aria-label': 'Rotate', style: 'width:90px' }) as HTMLInputElement;
        rot.addEventListener('pointerdown', () => this.pushUndo());
        rot.addEventListener('input', () => { pi.rot = (Number(rot.value) * Math.PI) / 180; });
        el.append(h('span', { class: 'dim', style: 'font-size:12px' }, '⟳'), rot);
      }
      el.append(button('⧉', () => this.duplicate(pi), { cls: 'icon small', title: 'Duplicate' }));
      el.append(button('🗑️', () => this.removePart(pi.uid), { cls: 'icon small danger', title: 'Remove' }));
      el.style.display = 'flex';
      return;
    }
    if (this.selNode !== null && this.tab.special === 'body') {
      const n = this.d.spine[this.selNode];
      if (!n) return;
      const [lo, hi] = NODE_R[this.kind];
      const r = h('input', { type: 'range', min: String(lo), max: String(hi), step: '1', value: String(n.r), 'aria-label': 'Thickness', style: 'width:170px' }) as HTMLInputElement;
      r.addEventListener('pointerdown', () => this.pushUndo());
      r.addEventListener('input', () => { n.r = Number(r.value); this.refreshInfo(); });
      el.append(h('span', { class: 'dim', style: 'font-size:13px' }, 'Thickness'), r);
      el.style.display = 'flex';
      return;
    }
    el.style.display = 'none';
  }

  // ------------------------------------------------------------------ editing ops
  private pushUndo() {
    this.undo.push(JSON.stringify(this.d));
    if (this.undo.length > 50) this.undo.shift();
  }
  private doUndo() {
    const s = this.undo.pop();
    if (!s) { audio.sfx('error'); return; }
    this.d = JSON.parse(s);
    this.selUid = null;
    this.selNode = null;
    this.refreshSel();
    this.refreshInfo();
    if (this.tab.special === 'paint') this.renderPalette();
  }

  private canAfford(p: PartDef): boolean {
    if (this.free) return true;
    if (p.cost > this.available) {
      audio.sfx('error');
      ui.toast(`Not enough ${this.cfg.currency ?? 'DNA'} (${p.cost} needed).`, { icon: '🧬', kind: 'bad' });
      return false;
    }
    const maxP = this.cfg.maxParts ?? (this.kind === 'cell' ? 12 : 24);
    if (this.d.parts.length - (this.cfg.lockedUids?.length ?? 0) >= maxP) {
      audio.sfx('error');
      ui.toast('Too complex! Remove a part first.', { icon: '🧩', kind: 'bad' });
      return false;
    }
    return true;
  }

  /** Compute a snapped attachment for part p at design point (x, y). Returns null if too far from body. */
  private snap(p: PartDef, x: number, y: number, strict = true): { node: number; ox: number; oy: number; rot: number; sym?: boolean } | null {
    const sp = this.d.spine;
    if (sp.length === 0) return null;
    let best = 0, bd = Infinity;
    for (let i = 0; i < sp.length; i++) {
      const d = Math.hypot(x - sp[i].x, y - sp[i].y) - sp[i].r;
      if (d < bd) { bd = d; best = i; }
    }
    const tol = Math.max(14, 34 / this.view.s);
    if (strict && bd > tol) return null;
    let node = best;
    const n = sp[node];
    let ox = x - n.x, oy = y - n.y;
    const head = sp.length - 1;
    if (this.kind === 'cell') {
      if (p.snap === 'head-front') { node = head; }
      const nn = sp[node];
      let a = Math.atan2(y - nn.y, x - nn.x);
      if (p.snap === 'head-front') a = clamp(a, -1, 1);
      if (p.snap === 'back') { node = 0; a = Math.PI + clamp(((Math.atan2(y - sp[0].y, x - sp[0].x) + TAU) % TAU) - Math.PI, -1, 1); }
      const r2 = sp[node].r * 0.92;
      ox = Math.cos(a) * r2;
      oy = Math.sin(a) * r2;
      return { node, ox, oy, rot: a, sym: Math.abs(oy) > 2 };
    }
    const r = n.r;
    switch (p.snap) {
      case 'head-front': {
        node = head;
        const hn = sp[head];
        ox = clamp(x - hn.x, hn.r * 0.2, hn.r * 1.0);
        oy = clamp(y - hn.y, -hn.r * 0.6, hn.r * 0.6);
        break;
      }
      case 'bottom':
        ox = clamp(ox, -r * 0.8, r * 0.8);
        oy = clamp(oy, r * 0.15, r * 0.85);
        break;
      case 'top': {
        const l = Math.hypot(ox, oy) || 1;
        if (oy > -r * 0.2) oy = -r * 0.2;
        if (l > r * 1.05) { ox *= (r * 1.05) / l; oy *= (r * 1.05) / l; }
        break;
      }
      default: {
        const l = Math.hypot(ox, oy) || 1;
        const lim = r * 1.1;
        if (l > lim) { ox *= lim / l; oy *= lim / l; }
      }
    }
    return { node, ox, oy, rot: 0 };
  }

  /** Default placement when a palette tile is tapped. */
  private autoPlace(p: PartDef): { node: number; ox: number; oy: number; rot: number; sym?: boolean } {
    const sp = this.d.spine;
    const head = sp.length - 1;
    const count = this.d.parts.filter((pi) => pi.partId === p.id).length;
    const k = count;
    if (this.kind === 'cell') {
      const pick = (node: number, a: number) => ({ node, ox: Math.cos(a) * sp[node].r * 0.92, oy: Math.sin(a) * sp[node].r * 0.92, rot: a, sym: Math.abs(Math.sin(a)) > 0.15 });
      if (p.snap === 'head-front') return pick(head, 0);
      if (p.snap === 'back') return pick(0, Math.PI + (k % 2 ? 0.5 : k ? -0.5 : 0));
      const node = clamp(head - 1 - (k % 4), 0, head);
      return pick(node, p.category === 'cell-eye' ? -1.2 : -Math.PI / 2);
    }
    const n = (i: number) => sp[clamp(i, 0, head)];
    switch (p.category) {
      case 'mouth': return { node: head, ox: n(head).r * 0.55, oy: n(head).r * 0.15, rot: 0 };
      case 'eye': return { node: head, ox: n(head).r * [0.1, 0.55, -0.35, 0.8][k % 4], oy: -n(head).r * [0.45, 0.3, 0.55, 0.1][k % 4], rot: 0 };
      case 'leg': {
        const order = [Math.floor(head / 2), 1, head - 1, 0, head];
        const i = clamp(order[k % order.length], 0, head);
        return { node: i, ox: 0, oy: n(i).r * 0.55, rot: 0 };
      }
      case 'arm': { const i = Math.max(0, head - 1 - k); return { node: i, ox: n(i).r * 0.3, oy: n(i).r * 0.2, rot: 0 }; }
      case 'tail': return { node: 0, ox: -n(0).r * 0.6, oy: 0, rot: 0 };
      case 'wing': { const i = Math.floor(head / 2); return { node: i, ox: 0, oy: -n(i).r * 0.7, rot: 0 }; }
      case 'weapon': return p.snap === 'top' ? { node: head, ox: -n(head).r * 0.1, oy: -n(head).r * 0.75, rot: 0 } : { node: head, ox: n(head).r * 0.4, oy: n(head).r * 0.3, rot: 0 };
      case 'detail': { const i = clamp(Math.floor(head / 2) + (k % 2 ? 1 : 0), 0, head); return { node: i, ox: 0, oy: -n(i).r * 0.85, rot: 0 }; }
      case 'hat': return { node: head, ox: 0, oy: -n(head).r * 0.9, rot: 0 };
      case 'mask': return { node: head, ox: n(head).r * 0.3, oy: -n(head).r * 0.1, rot: 0 };
      case 'chest': { const i = Math.max(0, head - 1); return { node: i, ox: n(i).r * 0.3, oy: n(i).r * 0.1, rot: 0 }; }
      case 'shoulder': { const i = Math.max(0, head - 1); return { node: i, ox: 0, oy: -n(i).r * 0.7, rot: 0 }; }
      case 'trinket': { const i = Math.max(0, head - 1); return { node: i, ox: n(i).r * 0.5, oy: n(i).r * 0.3, rot: 0 }; }
      case 'locomotion': {
        if (p.snap === 'top') { const i = Math.floor(head / 2); return { node: i, ox: 0, oy: -n(i).r * 0.9, rot: 0 }; }
        if (p.snap !== 'bottom') { const i = Math.floor(head / 2); return { node: i, ox: (k % 2 ? -1 : 1) * n(i).r * 0.3, oy: n(i).r * 0.1, rot: 0 }; }
        const nodes = [0, head, Math.floor(head / 2)];
        const i = nodes[k % nodes.length];
        return { node: i, ox: 0, oy: n(i).r * 0.85, rot: 0 };
      }
      case 'b-detail':
        if (p.snap === 'bottom') return { node: 0, ox: (k % 2 ? -1 : 1) * n(0).r * 0.9, oy: n(0).r * 0.6, rot: 0 };
        return { node: head, ox: (k % 3 - 1) * n(head).r * 0.6, oy: -n(head).r * 0.95, rot: 0 };
      case 'wall': { const i = clamp(Math.floor(head / 2) + (k % 2), 0, head); return { node: i, ox: (k % 2 ? -1 : 1) * n(i).r * 1.1, oy: 0, rot: 0 }; }
      case 'roof': return { node: head, ox: 0, oy: -n(head).r * 1.0, rot: 0 };
      case 'door': return { node: 0, ox: 0, oy: n(0).r * 0.35, rot: 0 };
      case 's-engine': return { node: 0, ox: -n(0).r * 1.2, oy: (k % 2 ? 1 : -1) * k * 3, rot: 0 };
      case 's-wing': { const i = Math.floor(head / 2); return { node: i, ox: -n(i).r * 0.2, oy: (k % 2 ? -1 : 1) * n(i).r * 0.6, rot: 0 }; }
      case 'cockpit': return { node: head, ox: n(head).r * 0.2, oy: -n(head).r * 0.7, rot: 0 };
      default: {
        const i = clamp(Math.floor(head / 2) + (k % 3) - 1, 0, head);
        if (p.snap === 'top') return { node: i, ox: 0, oy: -n(i).r * 0.9, rot: 0 };
        if (p.snap === 'bottom') return { node: i, ox: 0, oy: n(i).r * 0.8, rot: 0 };
        return { node: i, ox: n(i).r * 0.4, oy: 0, rot: 0 };
      }
    }
  }

  private addPart(p: PartDef, at: { node: number; ox: number; oy: number; rot: number; sym?: boolean }) {
    if (!this.canAfford(p)) return;
    this.pushUndo();
    const pi: PartInstance = { uid: uid(), partId: p.id, node: at.node, ox: at.ox, oy: at.oy, rot: at.rot, scale: 1, sym: at.sym };
    if (this.kind === 'creature' && (p.category === 'mouth' || p.category === 'eye')) {
      const r = this.d.spine[at.node]?.r ?? 12;
      pi.scale = clamp(r / 13, 0.7, 1.6);
    }
    this.d.parts.push(pi);
    this.selUid = pi.uid;
    audio.sfx('place', { pitch: 0.9 + Math.random() * 0.2 });
    this.refreshInfo();
    this.refreshSel();
    this.renderPaletteCosts();
  }

  private renderPaletteCosts() {
    if (this.free || !this.tab.cats) return;
    // Cheap refresh of affordability classes.
    this.renderPalette();
  }

  private removePart(uid: string) {
    if (this.cfg.lockedUids?.includes(uid)) { audio.sfx('error'); return; }
    this.pushUndo();
    this.d.parts = this.d.parts.filter((p) => p.uid !== uid);
    if (this.selUid === uid) this.selUid = null;
    audio.sfx('remove');
    this.refreshInfo();
    this.refreshSel();
    this.renderPaletteCosts();
  }

  private duplicate(pi: PartInstance) {
    const p = getPart(pi.partId);
    if (!p || !this.canAfford(p)) return;
    this.pushUndo();
    const n = this.d.spine[pi.node];
    const copy: PartInstance = { ...pi, uid: uid(), ox: pi.ox + (n ? n.r * 0.35 : 6), oy: pi.oy };
    this.d.parts.push(copy);
    this.selUid = copy.uid;
    audio.sfx('place');
    this.refreshInfo();
    this.refreshSel();
  }

  private addNode(where: 'head' | 'tail') {
    const sp = this.d.spine;
    if (sp.length >= MAX_NODES[this.kind]) { audio.sfx('error'); ui.toast('That\'s as long as it gets.'); return; }
    this.pushUndo();
    if (where === 'head') {
      const a = sp[sp.length - 1], b = sp[sp.length - 2] ?? { x: a.x - 10, y: a.y, r: a.r };
      const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1;
      const step = Math.max(8, a.r * 0.9);
      const isBuilding = this.kind === 'building';
      const nn = isBuilding ? { x: a.x, y: a.y - a.r * 2, r: Math.round(a.r * 0.92) } : { x: Math.round(a.x + (dx / l) * step), y: Math.round(a.y + (dy / l) * step), r: Math.round(a.r * 0.85) };
      const oldHead = sp.length - 1;
      sp.push(nn);
      // Head parts migrate to the new head.
      for (const pi of this.d.parts) {
        const p = getPart(pi.partId);
        if (pi.node === oldHead && p && (p.snap === 'head-front' || p.snap === 'head' || p.category === 'hat' || p.category === 'mask')) pi.node = sp.length - 1;
      }
    } else {
      const a = sp[0], b = sp[1] ?? { x: a.x + 10, y: a.y, r: a.r };
      const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1;
      const step = Math.max(8, a.r * 0.9);
      const isBuilding = this.kind === 'building';
      const nn = isBuilding ? { x: a.x, y: a.y + a.r * 2, r: Math.round(a.r * 1.08) } : { x: Math.round(a.x + (dx / l) * step), y: Math.round(a.y + (dy / l) * step), r: Math.round(a.r * 0.85) };
      sp.unshift(nn);
      for (const pi of this.d.parts) {
        const p = getPart(pi.partId);
        pi.node += 1;
        if (pi.node === 1 && p && p.snap === 'back') pi.node = 0;
      }
    }
    audio.sfx('pop');
    this.refreshInfo();
  }

  private removeNode(where: 'head' | 'tail') {
    const sp = this.d.spine;
    if (sp.length <= 2) { audio.sfx('error'); return; }
    this.pushUndo();
    if (where === 'head') {
      const idx = sp.length - 1;
      sp.pop();
      for (const pi of this.d.parts) if (pi.node === idx) pi.node = idx - 1;
    } else {
      sp.shift();
      for (const pi of this.d.parts) pi.node = Math.max(0, pi.node - 1);
    }
    audio.sfx('remove');
    this.refreshInfo();
  }

  // ------------------------------------------------------------------ drag & drop
  private startNewPartDrag(p: PartDef, e: PointerEvent) {
    const rect = this.game.canvas.getBoundingClientRect();
    const pid = e.pointerId;
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    this.drag = { type: 'new', pid, part: p, sx, sy };
    this.dragPos = { x: sx, y: sy };
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      this.dragPos = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      if (Math.hypot(this.dragPos.x - sx, this.dragPos.y - sy) > 14) moved = true;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.drag = null;
      if (!moved) { this.addPart(p, this.autoPlace(p)); return; }
      const lift = this.liftY();
      const dp = this.toDesign(this.dragPos.x, this.dragPos.y - lift);
      const at = this.snap(p, dp.x, dp.y);
      if (at && this.dragPos.y < this.game.h - this.bottomH) this.addPart(p, at);
      else audio.sfx('remove');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Touch: lift the dragged item above the finger so it's visible. */
  private liftY(): number { return matchMedia('(pointer: coarse)').matches ? 46 : 0; }

  private hitPart(sx: number, sy: number): PartInstance | null {
    const p = this.toDesign(sx, sy);
    let best: PartInstance | null = null, bd = Infinity;
    for (let i = this.d.parts.length - 1; i >= 0; i--) {
      const pi = this.d.parts[i];
      if (this.cfg.lockedUids?.includes(pi.uid)) continue;
      const def = getPart(pi.partId);
      if (!def) continue;
      const a = partAnchor(this.d, pi);
      let cx = a.x, cy = a.y;
      if (def.category === 'leg') cy += (def.limbLength ?? 40) * pi.scale * 0.45;
      else if (def.category === 'arm') { cx += (def.limbLength ?? 30) * pi.scale * 0.2; cy += (def.limbLength ?? 30) * pi.scale * 0.35; }
      else if (this.kind === 'cell') { cx += Math.cos(pi.rot) * def.radius * 0.4; cy += Math.sin(pi.rot) * def.radius * 0.4; }
      else { cx += Math.cos(pi.rot) * def.radius * 0.35 * (pi.flip ? -1 : 1); cy += Math.sin(pi.rot) * def.radius * 0.35; }
      const r = Math.max(def.radius * pi.scale * 0.75, 18 / this.view.s);
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < r && d < bd) { bd = d; best = pi; }
      if (pi.sym && this.kind === 'cell') {
        const d2 = Math.hypot(p.x - cx, p.y + cy - 2 * this.d.spine[pi.node].y);
        if (d2 < r && d2 < bd) { bd = d2; best = pi; }
      }
    }
    return best;
  }

  private hitNode(sx: number, sy: number): number | null {
    const p = this.toDesign(sx, sy);
    let best: number | null = null, bd = Infinity;
    this.d.spine.forEach((n, i) => {
      const d = Math.hypot(p.x - n.x, p.y - n.y);
      if (d < Math.max(n.r, 20 / this.view.s) && d < bd) { bd = d; best = i; }
    });
    return best;
  }

  onPointerDown(pt: PointerInfo): boolean {
    if (this.drag) return false;
    if (this.tab.special === 'test' || this.tab.special === 'paint') return false;
    if (pt.y > this.game.h - this.bottomH) return false;
    if (this.tab.special === 'body') {
      const ni = this.hitNode(pt.x, pt.y);
      if (ni !== null) {
        this.selNode = ni;
        this.selUid = null;
        this.refreshSel();
        if (!this.cfg.bodyResizeOnly) { this.pushUndo(); this.drag = { type: 'node', pid: pt.id, index: ni }; }
        audio.sfx('tap');
        return true;
      }
    }
    const hit = this.hitPart(pt.x, pt.y);
    if (hit) {
      this.pushUndo();
      const a = partAnchor(this.d, hit);
      const s = this.toScreen(a.x, a.y);
      this.drag = { type: 'part', pid: pt.id, uid: hit.uid, grabDX: s.x - pt.x, grabDY: s.y - pt.y, moved: false };
      this.selUid = hit.uid;
      this.selNode = null;
      this.refreshSel();
      audio.sfx('tap');
      return true;
    }
    return false;
  }

  onPointerMove(pt: PointerInfo) {
    const dg = this.drag;
    if (!dg || dg.pid !== pt.id) return;
    if (dg.type === 'node') {
      const p = this.toDesign(pt.x, pt.y);
      const sp = this.d.spine;
      const n = sp[dg.index];
      let nx = p.x, ny = p.y;
      // Keep neighbours connected.
      for (const j of [dg.index - 1, dg.index + 1]) {
        const m = sp[j];
        if (!m) continue;
        const maxD = (n.r + m.r) * 1.15, minD = Math.max(4, Math.min(n.r, m.r) * 0.3);
        const dx = nx - m.x, dy = ny - m.y, l = Math.hypot(dx, dy) || 1;
        if (l > maxD) { nx = m.x + (dx / l) * maxD; ny = m.y + (dy / l) * maxD; }
        if (l < minD) { nx = m.x + (dx / l) * minD; ny = m.y + (dy / l) * minD; }
      }
      n.x = Math.round(nx);
      n.y = Math.round(ny);
    } else if (dg.type === 'part') {
      dg.moved = true;
      const pi = this.d.parts.find((q) => q.uid === dg.uid);
      const def = pi && getPart(pi.partId);
      if (!pi || !def) return;
      const dp = this.toDesign(pt.x + dg.grabDX, pt.y + dg.grabDY);
      const at = this.snap(def, dp.x, dp.y, false);
      const sp = this.d.spine;
      let minEdge = Infinity;
      for (const n of sp) minEdge = Math.min(minEdge, Math.hypot(dp.x - n.x, dp.y - n.y) - n.r);
      const off = minEdge > Math.max(26, 60 / this.view.s) || pt.y > this.game.h - this.bottomH;
      this.elTrash.style.display = off ? '' : 'none';
      (pi as PartInstance & { _off?: boolean })._off = off;
      if (at) { pi.node = at.node; pi.ox = at.ox; pi.oy = at.oy; if (this.kind === 'cell') { pi.rot = at.rot; pi.sym = at.sym; } }
    }
  }

  onPointerUp(pt: PointerInfo) {
    const dg = this.drag;
    if (!dg || dg.pid !== pt.id) return;
    this.drag = null;
    this.elTrash.style.display = 'none';
    if (dg.type === 'part') {
      const pi = this.d.parts.find((q) => q.uid === dg.uid) as (PartInstance & { _off?: boolean }) | undefined;
      if (pi?._off) { delete pi._off; this.undo.pop(); this.removePart(pi.uid); return; }
      if (pi) delete pi._off;
      if (!dg.moved) this.undo.pop();
      else audio.sfx('place', { pitch: 1.1 });
    }
    this.refreshInfo();
  }

  onTap(x: number, y: number) {
    if (y > this.game.h - this.bottomH) return;
    if (!this.hitPart(x, y)) {
      this.selUid = null;
      if (this.tab.special !== 'body' || this.hitNode(x, y) === null) this.selNode = null;
      this.refreshSel();
    }
  }

  onPinch(f: number, cx: number, cy: number) {
    const pi = this.d.parts.find((q) => q.uid === this.selUid);
    if (pi && !this.drag) {
      pi.scale = clamp(pi.scale * f, 0.5, 2);
      this.refreshSel();
      return;
    }
    const before = this.toDesign(cx, cy);
    this.view.s = clamp(this.view.s * f, 0.8, 10);
    this.view.ox = cx - before.x * this.view.s;
    this.view.oy = cy - before.y * this.view.s;
  }
  onWheel(dy: number, x: number, y: number) { this.onPinch(dy < 0 ? 1.1 : 0.9, x, y); }
  onDrag(_p: PointerInfo, dx: number, dy: number) {
    if (this.tab.special === 'test') return;
    this.view.ox += dx;
    this.view.oy += dy;
  }

  // ------------------------------------------------------------------ finish
  private validate(): boolean {
    for (const req of this.cfg.required ?? []) {
      const ok = this.d.parts.some((pi) => { const p = getPart(pi.partId); return p && req.cat.includes(p.category); });
      if (!ok) {
        audio.sfx('error');
        ui.modal({ title: 'Almost there', body: h('p', null, req.msg) });
        return false;
      }
    }
    if (!this.free && this.available < 0) {
      ui.modal({ title: 'Over budget', body: h('p', null, `You're ${Math.round(-this.available)} ${this.cfg.currency ?? 'DNA'} over budget. Remove some parts.`) });
      return false;
    }
    return true;
  }

  private done() {
    if (!this.validate()) return;
    this.d.name = (this.elName.value || this.d.name || 'Unnamed').trim().slice(0, 24);
    const result: EditorResult = { design: cloneDesign(this.d), spent: this.spent };
    audio.sfx('success');
    this.game.pop();
    this.resolve(result);
  }

  private async cancel() {
    if (this.undo.length > 0) {
      const ok = await ui.confirm('Discard changes?', 'Your edits will be lost.', 'Discard', 'Keep editing');
      if (!ok) return;
    }
    this.game.pop();
    this.resolve(null);
  }

  private saveToCodex() {
    this.d.name = (this.elName.value || this.d.name || 'Unnamed').trim().slice(0, 24);
    codexSave(this.d);
    const n = (this.game.achievements.size, 0);
    void n;
    audio.sfx('success');
    ui.toast(`Saved “${this.d.name}” to the Codex`, { icon: '📚', kind: 'good' });
    const count = Number(localStorage.getItem('primordia.saves') ?? '0') + 1;
    try { localStorage.setItem('primordia.saves', String(count)); } catch { /* ignore */ }
    if (count >= 5) this.game.unlock('designer');
    if (count >= 20) this.game.unlock('archivist');
  }

  // ------------------------------------------------------------------ loop
  update(dt: number) {
    this.t += dt;
    if (this.testAction) {
      this.testAction.t += dt;
      const dur = this.testAction.name === 'walk' || this.testAction.name === 'idle' ? Infinity : 1.3;
      if (this.testAction.t > dur) this.testAction = null;
    }
    if (this.tab.special === 'test' && (!this.testAction || this.testAction.name === 'walk')) {
      const L = layoutDesign(this.d);
      const range = (this.game.w / this.view.s) * 0.28;
      this.testX += this.testDir * dt * (30 + 10 * (computeStats(this.d).speed ?? 1));
      if (Math.abs(this.testX) > range) { this.testDir *= -1; this.testX = Math.sign(this.testX) * range; }
      this.phase += dt * 1.8;
      void L;
    } else {
      this.testX *= Math.pow(0.02, dt);
    }
  }

  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    this.drawBackground(g, w, hh);
    const testing = this.tab.special === 'test';
    const walking = testing && (!this.testAction || this.testAction.name === 'walk');
    const pose: Pose = {
      t: this.t,
      walk: walking ? 1 : 0,
      phase: this.phase,
      facing: walking ? this.testDir : 1,
      action: this.testAction && this.testAction.name !== 'walk' && this.testAction.name !== 'idle' ? (this.testAction.name === 'jump' ? 'jump' : this.testAction.name) : undefined,
      actionT: this.testAction ? Math.min(1, this.testAction.t / 1.3) : 0,
      lift: this.testAction?.name === 'jump' ? Math.sin(Math.min(1, this.testAction.t / 1.0) * Math.PI) * 40 : 0,
    };
    const s = this.view.s;
    if (this.kind === 'cell') {
      g.save();
      renderCell(g, this.d, this.view.ox, this.view.oy, 0, s, { t: this.t }, { selectedUid: this.selUid, showNodes: this.tab.special === 'body', hoverNode: this.selNode });
      g.restore();
    } else {
      const L = layoutDesign(this.d);
      const groundS = this.toScreen(L.cx, L.groundY);
      const x = groundS.x + (testing ? this.testX * s : 0);
      // Platform
      if (this.kind !== 'ship') {
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.beginPath();
        g.ellipse(w / 2, groundS.y, Math.min(w * 0.46, (L.width * s) * 0.9 + 40), 16, 0, 0, TAU);
        g.fill();
      }
      g.save();
      renderDesign(g, this.d, x, groundS.y, s, pose, { selectedUid: testing ? null : this.selUid, showNodes: this.tab.special === 'body', hoverNode: this.selNode, shadow: true });
      g.restore();
    }
    // Ghost of a part being dragged from the palette.
    const dg = this.drag;
    if (dg && dg.type === 'new' && Math.hypot(this.dragPos.x - dg.sx, this.dragPos.y - dg.sy) > 14) {
      const lift = this.liftY();
      const dp = this.toDesign(this.dragPos.x, this.dragPos.y - lift);
      const at = this.snap(dg.part, dp.x, dp.y);
      g.save();
      let gx = this.dragPos.x, gy = this.dragPos.y - lift, rot = 0;
      if (at) {
        const n = this.d.spine[at.node];
        const sp = this.toScreen(n.x + at.ox, n.y + at.oy);
        gx = sp.x; gy = sp.y; rot = at.rot;
      }
      g.globalAlpha = at ? 0.9 : 0.45;
      g.translate(gx, gy);
      g.rotate(rot);
      g.scale(s, s);
      const ctx = { colors: this.d.colors, t: this.t, act: 0, nodeR: 12 } as Parameters<PartDef['draw']>[1];
      if (dg.part.category === 'leg' || dg.part.category === 'arm') {
        const reach = dg.part.limbLength ?? 40;
        ctx.limb = { knee: { x: reach * 0.15, y: reach * 0.45 }, foot: { x: reach * 0.1, y: reach * 0.9 }, plant: 1 };
      }
      dg.part.draw(g, ctx);
      g.restore();
    }
  }

  private drawBackground(g: CanvasRenderingContext2D, w: number, hh: number) {
    const bg = this.cfg.background ?? (this.kind === 'cell' ? 'tide' : this.kind === 'ship' ? 'space' : this.kind === 'building' || this.kind === 'vehicle' ? 'workshop' : 'meadow');
    const grads: Record<EditorBg, [string, string]> = {
      tide: ['#0b3a4a', '#04161f'],
      meadow: ['#2b5a6b', '#13262f'],
      workshop: ['#3a3f4f', '#16181f'],
      space: ['#120e2b', '#03030a'],
      city: ['#40527a', '#151b2b'],
      village: ['#5a4632', '#1f160e'],
    };
    const [a, b] = grads[bg];
    const gr = g.createLinearGradient(0, 0, 0, hh);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, hh);
    // Soft radial spotlight behind the creation.
    const sp = g.createRadialGradient(w / 2, hh * 0.4, 10, w / 2, hh * 0.4, Math.max(w, hh) * 0.6);
    sp.addColorStop(0, 'rgba(255,255,255,0.10)');
    sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp;
    g.fillRect(0, 0, w, hh);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    if (bg === 'space') {
      for (let i = 0; i < 80; i++) {
        const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * w, y = (Math.sin(i * 47.3) * 0.5 + 0.5) * hh;
        g.fillStyle = `rgba(255,255,255,${0.2 + ((i * 37) % 10) / 20})`;
        g.fillRect(x, y, 1.5, 1.5);
      }
    } else if (bg === 'tide') {
      for (let i = 0; i < 24; i++) {
        const x = (Math.sin(i * 12.9 + this.t * 0.1) * 0.5 + 0.5) * w;
        const y = ((i * 97 + this.t * 12 * (1 + (i % 3))) % (hh + 40)) - 20;
        g.beginPath();
        g.arc(x, hh - y, 2 + (i % 4), 0, TAU);
        g.fillStyle = 'rgba(180,255,240,0.08)';
        g.fill();
      }
    } else {
      g.strokeStyle = 'rgba(255,255,255,0.04)';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); }
      for (let y = 0; y < hh; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    }
  }
}
