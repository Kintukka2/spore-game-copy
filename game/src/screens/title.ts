import type { Game, Scene } from '../game/game';
import { button, h, ui } from '../engine/ui';
import { RNG } from '../engine/rng';
import { generateCell, generateCreature } from '../design/generate';
import { renderCell, renderDesign } from '../design/render';
import type { Design } from '../design/types';
import { openEditor } from '../editor/editor';
import { blankDesign } from '../design/generate';
import { codexSave } from '../game/codex';
import { STAGE_NAMES } from '../game/cards';
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

  private buildMenu() {
    const game = this.game;
    const L = game.layer();
    const hasSave = game.hasSave();
    const save = hasSave ? game.loadSave() : null;
    const menu = h('div', { class: 'menu' });
    if (save) {
      menu.append(button([h('span', null, '▶'), `Continue · ${save.speciesName}`], () => { game.state = save; game.startStage(save.stage); }, { cls: 'primary big block' }));
      menu.append(h('div', { class: 'faint tc', style: 'font-size:12px;margin-top:-4px' }, `${STAGE_NAMES[save.stage]} stage · planet ${save.planetName}`));
    }
    menu.append(button('🌱 New Game', async () => {
      if (save && !(await ui.confirm('Start over?', 'Starting a new game replaces your current save. Your Codex creations are kept.', 'New game', 'Cancel'))) return;
      game.fade(() => game.setScene(game.screen('newgame')));
    }, { cls: (save ? '' : 'primary big ') + 'block' }));
    menu.append(button('🧬 Creature Creator', () => this.freeEditor('creature'), { cls: 'block' }));
    const row = h('div', { class: 'row' });
    row.append(button('📚 Codex', () => game.fade(() => game.setScene(game.screen('codex'))), { cls: 'grow' }));
    row.append(button('🏆', () => game.fade(() => game.setScene(game.screen('achievements'))), { cls: 'icon', title: 'Achievements' }));
    row.append(button('⚙️', () => openSettings(game), { cls: 'icon', title: 'Settings' }));
    menu.append(row);
    L.append(h('div', { class: 'screen' },
      h('div', { style: 'flex:1' }),
      h('div', { class: 'title-logo' }, 'SPORK'),
      h('div', { class: 'title-tag' }, 'From a single cell to the stars'),
      menu,
      h('div', { style: 'flex:1.2' }),
      h('div', { class: 'faint', style: 'font-size:11px' }, 'v0.1 · Made with procedural everything'),
    ));
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
