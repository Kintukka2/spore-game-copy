import type { Game, Scene } from '../game/game';
import { button, h } from '../engine/ui';
import { RNG } from '../engine/rng';
import { planetName, speciesName } from '../game/names';
import type { Difficulty } from '../game/state';
import { TAU } from '../engine/math';
import { hsl } from '../design/color';

export class NewGameScreen implements Scene {
  name = 'newgame';
  music = 'menu' as const;
  private game!: Game;
  private t = 0;
  private hue = 200;
  private planet = '';

  enter(game: Game) {
    this.game = game;
    const r = new RNG(Date.now());
    this.planet = planetName(r);
    let species = speciesName(r);
    let diff: Difficulty = 'normal';
    this.hue = r.range(0, 360);
    const L = game.layer();
    const pIn = h('input', { type: 'text', value: this.planet, maxlength: '18', 'aria-label': 'Planet name' }) as HTMLInputElement;
    const sIn = h('input', { type: 'text', value: species, maxlength: '16', 'aria-label': 'Species name' }) as HTMLInputElement;
    pIn.addEventListener('input', () => { this.planet = pIn.value; });
    const reroll = (inp: HTMLInputElement, f: () => string) => button('🎲', () => { inp.value = f(); inp.dispatchEvent(new Event('input')); this.hue = (this.hue + 67) % 360; }, { cls: 'icon', title: 'Randomize' });
    const seg = h('div', { class: 'seg' });
    const diffs: [Difficulty, string][] = [['easy', 'Relaxed'], ['normal', 'Normal'], ['hard', 'Brutal']];
    for (const [id, label] of diffs) {
      const b = h('button', { class: id === diff ? 'on' : '' }, label);
      b.addEventListener('click', () => { diff = id; seg.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); });
      seg.append(b);
    }
    const form = h('div', { class: 'panel col', style: 'width:min(360px,92vw);gap:14px;padding:18px' },
      h('h2', null, 'A new world'),
      h('div', { class: 'field' }, h('label', null, 'Planet'), h('div', { class: 'row' }, pIn, reroll(pIn, () => planetName(new RNG(Date.now()))))),
      h('div', { class: 'field' }, h('label', null, 'Species'), h('div', { class: 'row' }, sIn, reroll(sIn, () => speciesName(new RNG(Date.now()))))),
      h('div', { class: 'field' }, h('label', null, 'Difficulty'), seg),
      button('☄️ Begin', () => {
        const pn = (pIn.value || this.planet).trim().slice(0, 18) || 'Gaia';
        species = (sIn.value || species).trim().slice(0, 16) || 'Blob';
        game.newState({ planetName: pn, speciesName: species, difficulty: diff });
        game.history(`A comet seeded life on ${pn}`, '☄️');
        game.save();
        game.fade(() => game.setScene(game.screen('intro')));
      }, { cls: 'primary big block' }),
      button('Back', () => game.fade(() => game.setScene(game.screen('title'))), { cls: 'ghost block' }),
    );
    L.append(h('div', { class: 'screen', style: 'justify-content:flex-end;padding-bottom:calc(30px + var(--safe-b))' }, form));
  }
  exit() {}
  update(dt: number) { this.t += dt; }
  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    g.fillStyle = '#03060d';
    g.fillRect(0, 0, w, hh);
    for (let i = 0; i < 120; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1, y = (Math.sin(i * 78.233) * 12345.678) % 1;
      g.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) * 0.12})`;
      g.fillRect(Math.abs(x) * w, Math.abs(y) * hh, 1.4, 1.4);
    }
    // Spinning planet preview
    const R = Math.min(w, hh) * 0.26, cx = w / 2, cy = hh * 0.27;
    const base = hsl(this.hue, 0.55, 0.45);
    const gr = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R);
    gr.addColorStop(0, hsl(this.hue, 0.6, 0.7));
    gr.addColorStop(0.7, base);
    gr.addColorStop(1, hsl(this.hue, 0.6, 0.15));
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
    g.fillStyle = hsl((this.hue + 100) % 360, 0.45, 0.42);
    for (let i = 0; i < 7; i++) {
      const lon = ((this.t * 0.12 + i * 0.9) % (Math.PI * 2)) - Math.PI;
      const x = cx + Math.sin(lon) * R * 0.85, y = cy + Math.sin(i * 2.1) * R * 0.6;
      g.globalAlpha = Math.max(0, Math.cos(lon));
      g.beginPath(); g.ellipse(x, y, R * 0.28 * Math.cos(lon), R * 0.18, 0, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    g.restore();
    g.strokeStyle = 'rgba(160,220,255,0.35)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, R + 3, 0, TAU); g.stroke();
  }
}
