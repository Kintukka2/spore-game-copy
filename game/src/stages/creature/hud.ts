// DOM HUD for the Creature stage. Mobile-first: joystick zone on the left, ability cluster on the
// right, vitals and minimap on top. Text updates are throttled; nothing is rebuilt per frame.
import { abilityButton, button, h, progressBar, ui } from '../../engine/ui';
import { audio } from '../../engine/audio';
import { clamp, TAU } from '../../engine/math';
import { drawThumb } from '../../design/render';
import { ABILITY_INFO } from '../../editor/abilityInfo';
import { chip, createStageHud, type StageHud } from '../common';
import type { CreatureStage } from './stage';
import { BRAIN_AT, BRAIN_FULL, COMBAT_ABS, MAX_BRAIN, REL_INFO, SOCIAL_ABS, type StanceAb, WORLD_SIZE } from './config';
import type { TerrainRenderer } from './terrain';

const CSS = `
.cr-hud .cr-tl { position:absolute; left:calc(10px + var(--safe-l)); top:calc(58px + var(--safe-t)); display:flex; flex-direction:column; gap:6px; align-items:flex-start; width:min(214px, calc(100vw - 168px)); pointer-events:none; }
.cr-hud .cr-vitals { display:flex; flex-direction:column; gap:4px; width:min(172px, 100%); }
.cr-hud .cr-vrow { display:flex; align-items:center; gap:5px; font-size:13px; text-shadow:0 1px 2px #000; }
.cr-hud .cr-vrow .bar { flex:1; min-width:0; height:15px; }
.cr-hud .cr-vrow .bar-text { font-size:10.5px; }
.cr-hud .cr-obj { font-size:12.5px; line-height:1.3; color:#eaf6ff; background:rgba(4,14,24,.55); padding:5px 9px; border-radius:10px; max-width:100%; white-space:pre-line; }
.cr-hud .cr-obj:empty { display:none; }
.cr-hud .cr-pack { display:flex; gap:6px; pointer-events:auto; }
.cr-hud .cr-pslot { width:44px; height:44px; border-radius:50%; position:relative; background:rgba(0,0,0,.4); border:2px dashed rgba(255,255,255,.25); display:flex; align-items:center; justify-content:center; padding:0; cursor:pointer; }
.cr-hud .cr-pslot.full { border:2px solid rgba(76,217,123,.9); background:radial-gradient(circle at 40% 35%, rgba(255,255,255,.22), rgba(10,30,20,.85)); }
.cr-hud .cr-pslot canvas { width:38px; height:32px; pointer-events:none; }
.cr-hud .cr-pslot i { position:absolute; left:4px; right:4px; bottom:-3px; height:4px; border-radius:2px; background:#4cd97b; box-shadow:0 0 0 1px rgba(0,0,0,.6); }
.cr-hud .cr-tr { position:absolute; right:calc(10px + var(--safe-r)); top:calc(58px + var(--safe-t)); display:flex; gap:8px; align-items:flex-start; }
.cr-hud .cr-tr .btn.icon { width:44px; height:44px; }
.cr-hud .cr-map { width:96px; height:96px; border-radius:16px; border:2px solid rgba(255,255,255,.35); box-shadow:0 4px 14px rgba(0,0,0,.45); background:#124a76; padding:0; overflow:hidden; cursor:pointer; display:block; }
.cr-hud .cr-map canvas { width:100%; height:100%; display:block; pointer-events:none; }
.cr-hud .cr-cluster { position:absolute; right:calc(8px + var(--safe-r)); bottom:calc(10px + var(--safe-b)); width:240px; height:252px; pointer-events:none; }
.cr-hud .cr-slot { position:absolute; pointer-events:auto; }
.cr-hud .cr-slot > .ability { width:100%; height:100%; }
.cr-hud .ability.cr-want { box-shadow:0 0 0 3px #ffe48a, 0 0 22px 6px rgba(255,228,138,.75); animation:crwant .55s ease-in-out infinite alternate; }
@keyframes crwant { to { box-shadow:0 0 0 4px #fff3c4, 0 0 30px 10px rgba(255,228,138,.95); } }
.cr-hud .ability.cr-on { border-color:#7dffd8; box-shadow:0 0 16px 4px rgba(125,255,216,.6); }
.cr-hud .ability.cr-stance { border-color:rgba(255,255,255,.7); }
.cr-hud .ability.social { background:radial-gradient(circle at 35% 30%, rgba(190,255,215,.55), rgba(14,70,46,.9)); }
.cr-hud .ability.combat { background:radial-gradient(circle at 35% 30%, rgba(255,200,190,.55), rgba(80,18,20,.9)); }
.cr-hud .ability .ab-icon { filter:drop-shadow(0 0 1.5px rgba(255,255,255,.95)) drop-shadow(0 1px 2px rgba(0,0,0,.45)); }
.cr-hud .cr-ctx { position:absolute; right:calc(12px + var(--safe-r)); bottom:calc(272px + var(--safe-b)); font-size:17px; min-height:50px; padding:0 18px; }
.cr-hud .cr-sapwrap { position:absolute; left:0; right:0; bottom:calc(382px + var(--safe-b)); display:flex; justify-content:center; pointer-events:none; }
.cr-hud .cr-sapwrap > .btn { pointer-events:auto; }
.cr-hud .cr-tip { position:absolute; left:50%; top:57%; transform:translate(-50%,-50%); font-size:15px; font-weight:600; background:rgba(4,14,24,.75); padding:7px 14px; border-radius:12px; pointer-events:none; opacity:0; transition:opacity .25s; white-space:nowrap; max-width:92vw; overflow:hidden; text-overflow:ellipsis; }
.cr-hud .cr-tip.on { opacity:1; }
.cr-hud .cr-debug { position:absolute; right:calc(10px + var(--safe-r)); top:calc(162px + var(--safe-t)); display:flex; flex-direction:column; gap:6px; padding:8px; }
.cr-hud .cr-debug .btn { min-height:36px; font-size:13px; padding:6px 10px; }
.cr-hud .cr-stancechip { font-size:12px; }
body.cr-active .toasts { top:calc(160px + var(--safe-t)); }
@media (max-height: 520px) {
  .cr-hud .cr-cluster { transform:scale(.78); transform-origin:right bottom; }
  .cr-hud .cr-ctx { bottom:calc(12px + var(--safe-b)); right:calc(204px + var(--safe-r)); }
  .cr-hud .cr-map { width:74px; height:74px; }
  .cr-hud .cr-tl { width:min(260px, 34vw); top:calc(54px + var(--safe-t)); }
  .cr-hud .cr-tr { top:calc(54px + var(--safe-t)); }
  .cr-hud .cr-sapwrap { bottom:calc(74px + var(--safe-b)); right:220px; }
  .cr-hud .cr-debug { top:calc(134px + var(--safe-t)); flex-direction:row; flex-wrap:wrap; max-width:46vw; }
  body.cr-active .toasts { top:calc(54px + var(--safe-t)); }
}
`;

/** Ability cluster layout: centre offsets from the cluster's bottom-right corner, and size. */
const SLOTS: Record<string, { rx: number; by: number; s: number }> = {
  a0: { rx: 46, by: 50, s: 72 },
  a1: { rx: 130, by: 38, s: 60 },
  a2: { rx: 122, by: 118, s: 60 },
  a3: { rx: 46, by: 140, s: 60 },
  jump: { rx: 208, by: 38, s: 60 },
  sprint: { rx: 200, by: 114, s: 54 },
  stance: { rx: 46, by: 222, s: 54 },
  special: { rx: 128, by: 200, s: 58 },
};

type Btn = ReturnType<typeof abilityButton>;

export class CreatureHud {
  base: StageHud;
  private root: HTMLElement;
  private hp = progressBar('hp');
  private hunger = progressBar('hunger');
  private dnaChip = chip('🧬', '0');
  private obj: HTMLElement;
  private packEl: HTMLElement;
  private packSlots: HTMLButtonElement[] = [];
  private packCanvases: HTMLCanvasElement[] = [];
  private packBars: HTMLElement[] = [];
  private packKey = '';
  private mapCanvas: HTMLCanvasElement;
  private mapBase: HTMLCanvasElement | null = null;
  private abBtns: Btn[] = [];
  private jumpBtn: Btn;
  private sprintBtn: Btn;
  private stanceBtn: Btn;
  private specialBtn: Btn | null = null;
  private ctxBtn: HTMLButtonElement;
  private sapientBtn: HTMLButtonElement;
  private tip: HTMLElement;
  private tipT = 0;
  private acc = 0;
  private mapAcc = 0;
  private last: Record<string, string | number | boolean> = {};

  constructor(private S: CreatureStage, private terrain: TerrainRenderer) {
    const game = S.game;
    if (!document.getElementById('cr-hud-css')) {
      const st = document.createElement('style');
      st.id = 'cr-hud-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    document.body.classList.add('cr-active');
    this.base = createStageHud(game, 'creature', { onPause: () => (S.paused = true), onResume: () => (S.paused = false) });
    this.root = this.base.root;
    this.root.classList.add('cr-hud');
    // Don't leave HUD buttons focused: Space (jump) would otherwise also "click" them.
    this.root.addEventListener('click', () => requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur?.()), true);
    this.base.progress.marks([BRAIN_AT[2], BRAIN_AT[3], BRAIN_AT[4], BRAIN_AT[5]].map((v) => v / BRAIN_FULL));
    this.base.right.append(this.dnaChip.el);
    // Top-left column: vitals, pack, objective.
    const vit = h('div', { class: 'cr-vitals' },
      h('div', { class: 'cr-vrow' }, '❤️', this.hp.el),
      h('div', { class: 'cr-vrow' }, '🍖', this.hunger.el));
    this.packEl = h('div', { class: 'cr-pack' });
    this.obj = h('div', { class: 'cr-obj' });
    this.root.append(h('div', { class: 'cr-tl' }, vit, this.packEl, this.obj));
    // Top-right: debug, call, minimap.
    this.mapCanvas = h('canvas') as HTMLCanvasElement;
    const mapBtn = h('button', { class: 'cr-map', 'aria-label': 'Map' }, this.mapCanvas);
    mapBtn.addEventListener('click', (e) => { e.stopPropagation(); audio.sfx('tap'); void this.openBigMap(); });
    const callBtn = button('📣', () => S.callMate(), { cls: 'icon', title: 'Mating call: evolve at your nest', sound: false });
    const tr = h('div', { class: 'cr-tr' });
    if (game.debug) tr.append(button('🐞', () => this.toggleDebug(), { cls: 'icon', title: 'Debug' }));
    tr.append(callBtn, mapBtn);
    this.root.append(tr);
    // Ability cluster.
    const cluster = h('div', { class: 'cr-cluster' });
    const place = (key: string, b: Btn) => {
      const L = SLOTS[key];
      const slot = h('div', { class: 'cr-slot', style: `right:${L.rx - L.s / 2}px;bottom:${L.by - L.s / 2}px;width:${L.s}px;height:${L.s}px` }, b.el);
      cluster.append(slot);
    };
    for (let i = 0; i < 4; i++) {
      const b = abilityButton('?', '?', () => S.pressStanceAbility(i), 'social');
      this.abBtns.push(b);
      place('a' + i, b);
    }
    this.jumpBtn = abilityButton('🦘', 'Jump', () => S.jump());
    place('jump', this.jumpBtn);
    this.sprintBtn = abilityButton('⚡', 'Sprint', () => S.sprint());
    place('sprint', this.sprintBtn);
    this.stanceBtn = abilityButton('⚔️', 'Fight', () => S.toggleStance(), 'cr-stance');
    place('stance', this.stanceBtn);
    const sp = S.special;
    if (sp) {
      this.specialBtn = abilityButton(sp.icon, sp.name, () => S.useSpecial(), 'special');
      place('special', this.specialBtn);
    }
    this.root.append(cluster);
    this.ctxBtn = button('', () => S.contextAction(), { cls: 'gold cr-ctx', sound: false });
    this.ctxBtn.style.display = 'none';
    this.sapientBtn = button('🧠 Become sapient', () => S.offerSapience(), { cls: 'primary big pulse' });
    this.sapientBtn.style.display = 'none';
    this.tip = h('div', { class: 'cr-tip' });
    this.root.append(this.ctxBtn, h('div', { class: 'cr-sapwrap' }, this.sapientBtn), this.tip);
    this.refreshStance();
    this.update(1, true);
  }

  destroy() {
    document.body.classList.remove('cr-active');
  }

  setVisible(b: boolean) {
    this.root.style.display = b ? '' : 'none';
  }

  flashTip(text: string, secs = 1.6) {
    this.tip.textContent = text;
    this.tip.classList.add('on');
    this.tipT = secs;
  }

  refreshStance() {
    const S = this.S;
    const social = S.stance === 'social';
    const abs = social ? SOCIAL_ABS : COMBAT_ABS;
    abs.forEach((ab, i) => {
      const b = this.abBtns[i];
      (b.el.querySelector('.ab-icon') as HTMLElement).textContent = ABILITY_INFO[ab].icon;
      (b.el.querySelector('.ab-label') as HTMLElement).textContent = ABILITY_INFO[ab].name;
      b.el.classList.toggle('social', social);
      b.el.classList.toggle('combat', !social);
      b.el.setAttribute('aria-label', ABILITY_INFO[ab].name);
    });
    (this.stanceBtn.el.querySelector('.ab-icon') as HTMLElement).textContent = social ? '⚔️' : '🎵';
    (this.stanceBtn.el.querySelector('.ab-label') as HTMLElement).textContent = social ? 'Fight' : 'Social';
    this.stanceBtn.el.classList.toggle('combat', social);
    this.stanceBtn.el.classList.toggle('social', !social);
    this.last = {};
    this.refreshSocialWant();
  }

  refreshSocialWant() {
    const S = this.S;
    const want = S.social.target && S.stance === 'social' && S.game.difficulty !== 'hard' ? S.social.want : null;
    SOCIAL_ABS.forEach((ab, i) => this.abBtns[i].el.classList.toggle('cr-want', S.stance === 'social' && want === ab));
  }

  private setText(key: string, el: HTMLElement, v: string) {
    if (this.last[key] === v) return;
    this.last[key] = v;
    el.textContent = v;
  }

  update(dt: number, force = false) {
    const S = this.S;
    if (this.tipT > 0) { this.tipT -= dt; if (this.tipT <= 0) this.tip.classList.remove('on'); }
    this.acc += dt;
    this.mapAcc += dt;
    if (this.mapAcc > 0.2 || force) { this.mapAcc = 0; this.drawMinimap(); }
    if (this.acc < 0.1 && !force) return;
    this.acc = 0;
    // Brain bar.
    const full = S.earned >= BRAIN_FULL;
    const brainLabel = full ? '🧠 Brain fully grown!' : `🧠 Brain ${S.brain} · ${Math.floor(S.earned)}/${BRAIN_AT[Math.min(MAX_BRAIN + 1, S.brain + 1)]}`;
    if (this.last.brain !== brainLabel || this.last.earnedFrac !== Math.round(S.earned)) {
      this.last.brain = brainLabel;
      this.last.earnedFrac = Math.round(S.earned);
      this.base.progress.set(clamp(S.earned / BRAIN_FULL, 0, 1), brainLabel);
    }
    const dna = String(Math.floor(S.dna));
    if (this.last.dna !== dna) { this.last.dna = dna; this.dnaChip.set(dna); }
    const p = S.player;
    const hpKey = `${Math.ceil(p.hp)}/${p.maxHp}`;
    if (this.last.hp !== hpKey) { this.last.hp = hpKey; this.hp.set(p.hp / p.maxHp, hpKey); }
    const hgKey = Math.ceil(S.hunger);
    if (this.last.hunger !== hgKey) { this.last.hunger = hgKey; this.hunger.set(S.hunger / 100, S.hunger < 25 ? 'Starving!' : `${hgKey}%`); }
    this.setText('obj', this.obj, S.objective());
    // Abilities.
    const abs: StanceAb[] = S.stance === 'social' ? SOCIAL_ABS : COMBAT_ABS;
    abs.forEach((ab, i) => {
      const b = this.abBtns[i];
      const lvl = S.abLevel(ab);
      const key = 'ab' + i;
      if (this.last[key] !== lvl) { this.last[key] = lvl; b.setLevel(lvl); b.el.style.opacity = lvl > 0 ? '' : '0.45'; }
      const cd = S.stance === 'social' ? (S.cool.social ?? 0) / 0.45 : (S.cool[ab] ?? 0) / Math.max(0.01, S.coolMax[ab] ?? 1);
      b.setCooldown(clamp(cd, 0, 1));
    });
    this.jumpBtn.setLevel(S.abLevel('jump'));
    this.jumpBtn.el.classList.toggle('cr-on', S.player.z > 0 && S.abLevel('glide') > 0 && S.flapsLeft > 0);
    const sl = S.abLevel('sprint');
    if (this.last.sprintLvl !== sl) { this.last.sprintLvl = sl; this.sprintBtn.setLevel(sl); this.sprintBtn.el.style.opacity = sl > 0 ? '' : '0.45'; }
    this.sprintBtn.setCooldown(S.sprintT > 0 ? 0 : clamp((S.cool.sprint ?? 0) / Math.max(1, S.coolMax.sprint ?? 1), 0, 1));
    this.sprintBtn.el.classList.toggle('cr-on', S.sprintT > 0);
    if (this.specialBtn && S.special) this.specialBtn.setCooldown(clamp((S.cool.special ?? 0) / (S.special.cooldown ?? 60), 0, 1));
    // Context + sapience.
    const ctx = S.context?.label ?? '';
    if (this.last.ctx !== ctx) {
      this.last.ctx = ctx;
      this.ctxBtn.textContent = ctx;
      this.ctxBtn.style.display = ctx ? '' : 'none';
    }
    const sap = S.sapientReady && S.phase === 'play';
    if (this.last.sap !== sap) { this.last.sap = sap; this.sapientBtn.style.display = sap ? '' : 'none'; }
    this.updatePack();
  }

  private updatePack() {
    const S = this.S;
    const slots = S.packSlots();
    const key = slots + ':' + S.pack.map((m) => m.id).join(',');
    if (key !== this.packKey) {
      this.packKey = key;
      this.packEl.innerHTML = '';
      this.packSlots = []; this.packCanvases = []; this.packBars = [];
      for (let i = 0; i < slots; i++) {
        const m = S.pack[i];
        const cv = h('canvas', { width: '38', height: '32' }) as HTMLCanvasElement;
        const bar = h('i');
        const el = h('button', { class: 'cr-pslot' + (m ? ' full' : ''), 'aria-label': m ? m.sp.name : 'Empty pack slot' }, m ? cv : h('span', { style: 'opacity:.5;font-size:16px' }, '+'), m ? bar : null) as HTMLButtonElement;
        el.addEventListener('click', (e) => { e.stopPropagation(); audio.sfx('tap'); void S.packSlotTapped(i); });
        this.packEl.append(el);
        this.packSlots.push(el); this.packCanvases.push(cv); this.packBars.push(bar);
        if (m) requestAnimationFrame(() => drawThumb(cv, m.sp.design));
      }
    }
    S.pack.forEach((m, i) => {
      const b = this.packBars[i];
      if (b) {
        const f = clamp(m.hp / m.maxHp, 0, 1);
        b.style.right = `${4 + (1 - f) * 32}px`;
        b.style.background = f < 0.35 ? '#ff6b6b' : '#4cd97b';
      }
    });
  }

  // ------------------------------------------------------------------ minimap
  private drawMinimap() {
    const c = this.mapCanvas;
    const css = c.clientWidth || 96;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(css * dpr)) { c.width = Math.round(css * dpr); c.height = Math.round(css * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = this.S;
    // A local view around the player; better eyes see a wider patch of the island.
    const span = 1300 + 100 * S.sightLvl();
    const k = css / span;
    const cx = S.player.x, cy = S.player.y;
    if (!this.mapBase) this.mapBase = this.terrain.minimapImage(160);
    g.fillStyle = '#124a76';
    g.fillRect(0, 0, css, css);
    const bs = this.mapBase.width / WORLD_SIZE;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.mapBase, (cx - span / 2) * bs, (cy - span / 2) * bs, span * bs, span * bs, 0, 0, css, css);
    const tx = (x: number) => (x - cx) * k + css / 2, ty = (y: number) => (y - cy) * k + css / 2;
    this.drawMarkers(g, tx, ty, Math.max(4, css / 20), false);
    // Player arrow.
    g.save();
    g.translate(css / 2, css / 2);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0b1a28';
    g.lineWidth = 1.5;
    g.beginPath();
    const f = S.player.facing;
    g.moveTo(6 * f, 0); g.lineTo(-4 * f, -4.5); g.lineTo(-2 * f, 0); g.lineTo(-4 * f, 4.5); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }

  private drawMarkers(g: CanvasRenderingContext2D, tx: (x: number) => number, ty: (y: number) => number, r: number, big: boolean) {
    const S = this.S;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const mt = S.migrating ? S.migTarget() : null;
    if (mt) {
      const pulse = 0.5 + 0.5 * Math.sin(S.t * 5);
      g.strokeStyle = `rgba(255,236,140,${0.5 + pulse * 0.5})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(tx(mt.x), ty(mt.y), r * (1.3 + pulse * 0.6), 0, TAU); g.stroke();
      g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(tx(S.player.x), ty(S.player.y)); g.lineTo(tx(mt.x), ty(mt.y)); g.stroke();
      g.setLineDash([]);
    }
    for (const b of S.bones) {
      if (b.dug || !b.discovered) continue;
      g.fillStyle = b.kind === 'sky' ? '#9fe8ff' : '#fff6dd';
      g.beginPath(); g.arc(tx(b.x), ty(b.y), r * 0.45, 0, TAU); g.fill();
    }
    for (const n of S.nests) {
      if (!n.active) continue;
      const x = tx(n.x), y = ty(n.y);
      if (n.home) {
        if (n !== S.homeNest) continue;
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#0b1a28';
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x, y - r * 1.1); g.lineTo(x + r, y); g.lineTo(x + r * 0.7, y); g.lineTo(x + r * 0.7, y + r * 0.9); g.lineTo(x - r * 0.7, y + r * 0.9); g.lineTo(x - r * 0.7, y); g.lineTo(x - r, y); g.closePath();
        g.fill(); g.stroke();
        continue;
      }
      if (!n.discovered || !n.species) continue;
      const rel = n.species.relation;
      g.fillStyle = REL_INFO[rel].color;
      g.strokeStyle = '#0b1a28';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke();
      if (rel === 'extinct' || big) {
        g.font = `${Math.round(r * 1.4)}px sans-serif`;
        g.fillText(REL_INFO[rel].face, x, y + 0.5);
      }
    }
    for (const c of S.critters) {
      if (c.gone) continue;
      if (c.role === 'titan' && (c.sp.met || big)) {
        g.fillStyle = '#b06bff';
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(tx(c.x), ty(c.y), r * 0.9, 0, TAU); g.fill(); g.stroke();
      } else if (c.role === 'pack') {
        g.fillStyle = '#7dffd8';
        g.beginPath(); g.arc(tx(c.x), ty(c.y), r * 0.45, 0, TAU); g.fill();
      } else if (c.role === 'loner' && c.sp.met) {
        g.fillStyle = '#ffd166';
        g.beginPath(); g.arc(tx(c.x), ty(c.y), r * 0.55, 0, TAU); g.fill();
      }
    }
  }

  private async openBigMap() {
    const S = this.S;
    S.paused = true;
    const size = Math.min(320, window.innerWidth - 72);
    const cv = h('canvas', { style: `width:${size}px;height:${size}px;border-radius:14px;display:block;margin:0 auto` }) as HTMLCanvasElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr; cv.height = size * dpr;
    const g = cv.getContext('2d')!;
    g.scale(dpr, dpr);
    const img = this.terrain.minimapImage(220);
    const pad = WORLD_SIZE * 0.08;
    const span = WORLD_SIZE - pad * 2;
    const k = size / span;
    g.drawImage(img, (pad / WORLD_SIZE) * img.width, (pad / WORLD_SIZE) * img.height, (span / WORLD_SIZE) * img.width, (span / WORLD_SIZE) * img.height, 0, 0, size, size);
    const tx = (x: number) => (x - pad) * k, ty = (y: number) => (y - pad) * k;
    this.drawMarkers(g, tx, ty, 7, true);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(tx(S.player.x), ty(S.player.y), 5, 0, TAU); g.fill();
    g.strokeStyle = '#0b1a28'; g.lineWidth = 2; g.stroke();
    const legend = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12.5px;margin-top:10px;justify-content:center' },
      ...(['curious', 'neutral', 'annoyed', 'hostile', 'afraid', 'friendly', 'allied', 'extinct'] as const).map((r) =>
        h('span', null, h('span', { style: `display:inline-block;width:10px;height:10px;border-radius:50%;background:${REL_INFO[r].color};margin-right:4px` }), REL_INFO[r].label)),
      h('span', null, '🟣 Titan'), h('span', null, '🟡 Loner'), h('span', null, '⚪ Bones'));
    const counts = S.speciesCounts();
    await ui.modal({
      title: `🗺️ ${S.game.state?.planetName ?? 'Island'}`,
      body: [cv, legend, h('p', { style: 'margin:10px 0 0;text-align:center' }, `Allies ${counts.allied} · Extinct ${counts.extinct} · Species found ${counts.met}/${counts.total}`)],
      buttons: [{ id: 'ok', label: 'Close', primary: true }],
      dismissable: true,
    });
    S.paused = false;
  }

  // ------------------------------------------------------------------ debug
  private dbg: HTMLElement | null = null;
  private toggleDebug() {
    if (this.dbg) { this.dbg.remove(); this.dbg = null; return; }
    const S = this.S;
    this.dbg = h('div', { class: 'cr-debug panel' },
      button('+100 DNA', () => S.addDNA(100), { cls: 'small' }),
      button('Brain +1', () => S.debugBrainUp(), { cls: 'small' }),
      button('Win', () => S.debugWin(), { cls: 'small' }),
      button('Ally target', () => S.debugAllyTarget(), { cls: 'small' }),
      button('Meteors', () => S.events.startMeteors(), { cls: 'small' }),
      button('UFO', () => S.events.startUfo(), { cls: 'small' }),
    );
    this.root.append(this.dbg);
  }
}
