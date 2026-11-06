import { SLOTS, type Game, type Scene } from '../game/game';
import type { GameState } from '../game/state';
import { button, h, ui } from '../engine/ui';
import { RNG } from '../engine/rng';
import { generateCell, generateCreature } from '../design/generate';
import { renderCell, renderDesign } from '../design/render';
import type { Design } from '../design/types';
import { openEditor } from '../editor/editor';
import { blankDesign } from '../design/generate';
import { codexSave } from '../game/codex';
import { STAGE_ICONS, STAGE_NAMES } from '../game/cards';
import { TAU } from '../engine/math';
import { openSettings } from './settings';

interface Floater { d: Design; x: number; y: number; vx: number; vy: number; a: number; s: number; depth: number }

export class TitleScreen implements Scene {
  name = 'title';
  music = 'menu' as const;
  private game!: Game;
  private t = 0;
  private floaters: Floater[] = [];
  private walker: Design | null = null;
  private motes: { x: number; y: number; r: number; sp: number }[] = [];

  enter(game: Game) {
    this.game = game;
    const r = new RNG(Date.now());
    for (let i = 0; i < 14; i++) {
      const depth = r.range(0.4, 1.2);
      this.floaters.push({ d: generateCell(r, r.pick(['herbivore', 'carnivore', 'omnivore']), r.int(1, 3)), x: r.range(0, game.w), y: r.range(0, game.h), vx: r.range(-12, 12), vy: r.range(-8, 8), a: r.range(0, TAU), s: depth * r.range(1.2, 2.2), depth });
    }
    this.floaters.sort((a, b) => a.depth - b.depth);
    this.walker = generateCreature(r, { level: 2 });
    for (let i = 0; i < 60; i++) this.motes.push({ x: r.range(0, 1), y: r.range(0, 1), r: r.range(0.5, 2.2), sp: r.range(4, 18) });
    this.buildMenu();
  }

  private menuEl: HTMLElement | null = null;

  private buildMenu() {
    const game = this.game;
    const L = game.layer();
    this.menuEl = h('div', { class: 'menu' });
    L.append(h('div', { class: 'screen' },
      h('div', { style: 'flex:1' }),
      h('div', { class: 'title-logo' }, 'SPORADIUM'),
      h('div', { class: 'title-tag' }, 'From a single cell to the stars'),
      this.menuEl,
      h('div', { style: 'flex:1.2' }),
      h('div', { class: 'faint', style: 'font-size:11px' }, 'v0.1 · Made with procedural everything'),
    ));
    this.showMenu();
  }

  /** The main menu: Continue (the game played last), New Game, Load Game, and the rest. */
  private showMenu() {
    const game = this.game, menu = this.menuEl!;
    menu.className = 'menu';
    menu.innerHTML = '';
    const saves = game.slotSaves();
    const count = saves.filter(Boolean).length;
    const last = game.lastSlot();
    const save = last === null ? null : saves[last];
    if (save && last !== null) {
      menu.append(button([h('span', null, '▶'), `Continue · ${save.speciesName}`], () => this.play(last), { cls: 'primary big block' }));
      menu.append(h('div', { class: 'faint tc', style: 'font-size:12px;margin-top:-4px' }, `${STAGE_NAMES[save.stage]} stage · planet ${save.planetName} · slot ${last + 1}`));
    }
    menu.append(button('🌱 New Game', () => {
      // With nothing saved yet, the first slot it is; otherwise pick where the new world goes.
      if (!count) this.newGame(0);
      else this.showSlots('new');
    }, { cls: (save ? '' : 'primary big ') + 'block' }));
    if (count) menu.append(button(`💾 Load Game (${count})`, () => this.showSlots('load'), { cls: 'block' }));
    menu.append(button('🧬 Creature Creator', () => this.freeEditor('creature'), { cls: 'block' }));
    const row = h('div', { class: 'row' });
    row.append(button('📚 Codex', () => game.fade(() => game.setScene(game.screen('codex'))), { cls: 'grow' }));
    row.append(button('🏆', () => game.fade(() => game.setScene(game.screen('achievements'))), { cls: 'icon', title: 'Achievements' }));
    row.append(button('⚙️', () => openSettings(game), { cls: 'icon', title: 'Settings' }));
    menu.append(row);
  }

  /** The save slots. `load` plays a game (or starts one in an empty slot); `new` picks where a new game goes. */
  private showSlots(mode: 'load' | 'new') {
    const game = this.game, menu = this.menuEl!;
    menu.className = 'menu slots';
    menu.innerHTML = '';
    const saves = game.slotSaves();
    const last = game.lastSlot();
    menu.append(h('div', { class: 'slots-head' }, h('b', null, mode === 'new' ? 'Where should your new world go?' : 'Your worlds'),
      h('span', null, `${saves.filter(Boolean).length} of ${SLOTS} slots used`)));
    const list = h('div', { class: 'slot-list' });
    saves.forEach((sv, i) => list.append(sv ? this.slotCard(i, sv, mode, i === last) : this.emptyCard(i, mode)));
    menu.append(list, button('Back', () => this.showMenu(), { cls: 'ghost block' }));
  }

  private emptyCard(i: number, mode: 'load' | 'new'): HTMLElement {
    const card = h('div', { class: 'slot empty', role: 'button', tabindex: '0' },
      h('div', { class: 'slot-pic' }, '＋'),
      h('div', { class: 'slot-txt' }, h('b', null, 'Empty slot'), h('span', null, mode === 'new' ? 'Start your new world here' : 'Start a new world here')),
      h('span', { class: 'slot-n' }, String(i + 1)));
    card.addEventListener('click', () => this.newGame(i));
    return card;
  }

  private slotCard(i: number, sv: GameState, mode: 'load' | 'new', isLast: boolean): HTMLElement {
    const pic = h('canvas', { class: 'slot-pic', width: '128', height: '128' }) as HTMLCanvasElement;
    this.drawSpecies(pic, sv);
    const diff = sv.difficulty === 'easy' ? 'Relaxed' : sv.difficulty === 'hard' ? 'Brutal' : 'Normal';
    const acts = h('div', { class: 'slot-acts' });
    if (mode === 'load') {
      acts.append(button('▶ Play', () => this.play(i), { cls: 'primary small' }));
      acts.append(button('🗑', async () => {
        const ok = await ui.confirm(`Delete ${sv.speciesName}?`, `This erases slot ${i + 1}: ${sv.speciesName} of ${sv.planetName} (${STAGE_NAMES[sv.stage]} stage, ${playTime(sv.playSeconds)} played). Codex creations and achievements are kept.`, 'Delete', 'Keep it');
        if (!ok) return;
        this.game.deleteSave(i);
        ui.toast(`Slot ${i + 1} is empty now.`, { icon: '🗑' });
        if (this.game.hasSave()) this.showSlots('load'); else this.showMenu();
      }, { cls: 'small ghost', title: 'Delete this save' }));
    } else {
      acts.append(button('Overwrite', async () => {
        const ok = await ui.confirm(`Replace ${sv.speciesName}?`, `Slot ${i + 1} holds ${sv.speciesName} of ${sv.planetName} (${STAGE_NAMES[sv.stage]} stage, ${playTime(sv.playSeconds)} played). A new world here erases it.`, 'Replace it', 'Cancel');
        if (ok) this.newGame(i);
      }, { cls: 'small danger' }));
    }
    const card = h('div', { class: 'slot' + (isLast ? ' last' : '') },
      pic,
      h('div', { class: 'slot-txt' },
        h('b', null, sv.speciesName, isLast ? h('i', { class: 'slot-tag' }, 'Last played') : null),
        h('span', null, `${STAGE_ICONS[sv.stage]} ${STAGE_NAMES[sv.stage]} stage · planet ${sv.planetName}`),
        h('span', { class: 'faint' }, `${playTime(sv.playSeconds)} played · ${diff} · saved ${ago(sv.savedAt ?? sv.createdAt)}`)),
      h('span', { class: 'slot-n' }, String(i + 1)),
      acts);
    // Tapping the card itself plays it (in the load list).
    if (mode === 'load') card.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('button')) this.play(i); });
    return card;
  }

  /** The species as it looks now: its creature, or its cell before that. */
  private drawSpecies(c: HTMLCanvasElement, sv: GameState) {
    const g = c.getContext('2d');
    if (!g) return;
    try {
      if (sv.creature) renderDesign(g, sv.creature, 64, 104, 1.05, { t: 0, facing: 1 });
      else if (sv.cell) renderCell(g, sv.cell, 64, 64, -Math.PI / 2, 1.5, { t: 0 });
    } catch { /* a design from an older version: leave the tile blank */ }
  }

  private play(i: number) {
    const s = this.game.loadSlot(i);
    if (s) this.game.startStage(s.stage);
  }

  private newGame(i: number) {
    this.game.slot = i;
    this.game.state = null;
    this.game.fade(() => this.game.setScene(this.game.screen('newgame')));
  }

  private async freeEditor(kind: 'creature') {
    const res = await openEditor(this.game, { design: blankDesign(kind, 'My Creature'), mode: 'free', title: 'Creature Creator', required: [{ cat: ['mouth'], msg: 'Give your creature a mouth so it can eat!' }], hint: 'Tap a part to add it, or drag it onto the body. Tap a placed part to resize or remove it.' });
    if (res) {
      codexSave(res.design);
      ui.toast(`“${res.design.name}” saved to the Codex`, { icon: '📚', kind: 'good' });
    }
  }

  exit() {}

  update(dt: number) {
    this.t += dt;
    const { w, h: hh } = this.game;
    for (const f of this.floaters) {
      f.x += f.vx * dt * f.depth;
      f.y += f.vy * dt * f.depth;
      f.a += Math.sin(this.t * 0.3 + f.depth * 10) * dt * 0.4;
      if (f.x < -60) f.x = w + 60; if (f.x > w + 60) f.x = -60;
      if (f.y < -60) f.y = hh + 60; if (f.y > hh + 60) f.y = -60;
    }
  }

  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    const gr = g.createLinearGradient(0, 0, 0, hh);
    gr.addColorStop(0, '#0e4a5c');
    gr.addColorStop(0.55, '#082a3a');
    gr.addColorStop(1, '#04121c');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, hh);
    // Light rays
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = w * (0.15 + i * 0.2) + Math.sin(this.t * 0.2 + i) * 30;
      const ray = g.createLinearGradient(x, 0, x + 80, hh);
      ray.addColorStop(0, 'rgba(120,255,230,0.07)');
      ray.addColorStop(1, 'rgba(120,255,230,0)');
      g.fillStyle = ray;
      g.beginPath();
      g.moveTo(x - 30, 0); g.lineTo(x + 40, 0); g.lineTo(x + 160, hh); g.lineTo(x + 40, hh);
      g.fill();
    }
    g.restore();
    for (const m of this.motes) {
      const y = ((m.y * hh - this.t * m.sp) % hh + hh) % hh;
      g.fillStyle = 'rgba(200,255,245,0.25)';
      g.beginPath();
      g.arc(m.x * w + Math.sin(this.t + m.y * 10) * 6, y, m.r, 0, TAU);
      g.fill();
    }
    for (const f of this.floaters) {
      g.save();
      g.globalAlpha = 0.35 + f.depth * 0.5;
      renderCell(g, f.d, f.x, f.y, f.a, f.s, { t: this.t + f.depth * 3 });
      g.restore();
    }
    // A little creature strolling along the bottom.
    if (this.walker) {
      const span = w + 200;
      const x = ((this.t * 40) % span) - 100;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, hh - 34, w, 34);
      renderDesign(g, this.walker, x, hh - 30, 0.9, { t: this.t, walk: 1, phase: this.t * 1.6, facing: 1 });
    }
  }
}

function playTime(sec: number): string {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

function ago(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} day${Math.round(s / 86400) === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString();
}
