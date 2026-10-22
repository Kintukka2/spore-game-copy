// The core ending: a dive into the galactic heart, a meeting with Ori (a tiny, friendly
// cosmic being), the gift of the Genesis Seed, and a short credits roll. Play continues after.
import type { Game, Scene } from '../../game/game';
import { audio } from '../../engine/audio';
import { button, h } from '../../engine/ui';
import { TAU, clamp } from '../../engine/math';
import { blit, glow, starSprite } from './art/sprites';
import { drawShip } from './art/shipArt';
import type { SpaceStage } from './stage';

const LINES = [
  'Oh! A visitor! Hardly anyone gets past the grumpy Hollow.',
  'I\'m Ori. I keep the light on in here. It gets a little lonely at the middle of everything.',
  'You started as a speck of goo in a tide pool, didn\'t you? I can always tell. It\'s the best way to start.',
  'Here, take this. It\'s a Genesis Seed. Plant it on any world and it blooms: air, oceans, forests, creatures, the works.',
  'It has twelve charges. Use them kindly. Or wildly! Both are allowed.',
  'Now off you go. The galaxy is big, and it\'s yours to fill. Come back and visit. I mean it!',
];

export function playEnding(st: SpaceStage, done: () => void) {
  st.game.push(new CoreCinematic(st, done));
}

interface Mote { x: number; y: number; vx: number; vy: number; r: number; hue: number }

class CoreCinematic implements Scene {
  name = 'core-cinematic';
  music = 'victory' as const;
  private game!: Game;
  private t = 0;
  private phase: 'dive' | 'ori' | 'credits' = 'dive';
  private line = -1;
  private typed = 0;
  private layer!: HTMLElement;
  private sayEl: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private motes: Mote[] = [];
  private oriT = 0;
  private gift = -1;
  private finished = false;

  constructor(private st: SpaceStage, private done: () => void) {}

  enter(game: Game) {
    this.game = game;
    this.layer = game.layer('sp-cine-layer');
    audio.sfx('warp', { pitch: 0.5 });
    for (let i = 0; i < 70; i++) this.motes.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.02, vy: -0.01 - Math.random() * 0.03, r: 1 + Math.random() * 3, hue: 30 + Math.random() * 40 });
    const skip = button('Skip ⏭', () => this.skipAll(), { cls: 'small skip-btn' });
    skip.style.top = 'calc(12px + var(--safe-t))';
    skip.style.bottom = 'auto';
    this.layer.append(skip);
  }
  exit() {}

  update(dt: number) {
    this.t += dt;
    if (this.phase === 'dive' && this.t > 4.6) this.startOri();
    if (this.phase === 'ori') {
      this.oriT += dt;
      if (this.line >= 0 && this.textEl) {
        const full = LINES[this.line];
        if (this.typed < full.length) {
          const before = Math.floor(this.typed);
          this.typed = Math.min(full.length, this.typed + dt * 38);
          if (Math.floor(this.typed) !== before && Math.floor(this.typed) % 3 === 0) audio.sfx('tap', { vol: 0.25, pitch: 1.6 + Math.random() * 0.4 });
          this.textEl.textContent = full.slice(0, Math.floor(this.typed));
        }
      }
      if (this.gift >= 0) this.gift += dt;
    }
    for (const m of this.motes) {
      m.x = (m.x + m.vx * dt + 1) % 1;
      m.y = (m.y + m.vy * dt + 1) % 1;
    }
  }

  private startOri() {
    this.phase = 'ori';
    this.oriT = 0;
    audio.sfx('bell');
    this.textEl = h('span', null, '');
    this.sayEl = h('div', { class: 'sp-say', role: 'button' }, h('span', { class: 'sp-who' }, 'Ori'), this.textEl, h('span', { class: 'sp-next' }, 'tap ▸'));
    const wrap = h('div', { class: 'sp-cine' }, this.sayEl);
    wrap.addEventListener('click', () => this.advance());
    this.layer.prepend(wrap);
    setTimeout(() => { if (!this.finished) this.nextLine(); }, 900);
  }

  private nextLine() {
    if (this.phase !== 'ori' || this.finished) return;
    this.line++;
    this.typed = 0;
    if (this.line === 3) {
      this.gift = 0;
      audio.sfx('unlock');
      setTimeout(() => audio.sfx('levelup'), 600);
    }
    if (this.line >= LINES.length) { this.startCredits(); return; }
  }

  private advance() {
    if (this.phase !== 'ori' || this.line < 0) return;
    const full = LINES[this.line];
    if (this.typed < full.length) { this.typed = full.length; if (this.textEl) this.textEl.textContent = full; return; }
    audio.sfx('click');
    this.nextLine();
  }

  onTap() { this.advance(); }

  private startCredits() {
    this.phase = 'credits';
    this.t = 0;
    this.layer.querySelector('.sp-cine')?.remove();
    const s = this.game.state!;
    const w = this.st.w;
    const mins = Math.round(s.playSeconds / 60);
    const roll = h('div', { class: 'sp-credits-roll' },
      h('h1', null, 'SPORADIUM'),
      h('p', null, 'From a single cell to the heart of the galaxy'),
      h('h3', null, 'Your story'),
      h('p', null, `The ${s.speciesName} of ${s.planetName}`),
      h('p', null, `${w.arch?.name ?? 'Wanderer'} · ${w.arch?.philosophy ?? ''}`),
      h('p', null, `${w.s.visited.length} systems explored · ${w.countStars('player')} systems held`),
      h('p', null, `${w.s.counters.missions ?? 0} missions · ${w.s.counters.kills ?? 0} ships downed`),
      h('p', null, `${mins} minutes of evolution`),
      h('h3', null, 'Stages'),
      h('p', null, 'Cell · Creature · Tribal · Civilization · Space'),
      h('h3', null, 'Made of'),
      h('p', null, 'Procedural shapes, generative music,'),
      h('p', null, 'and many, many tiny creatures'),
      h('h3', null, 'Special thanks'),
      h('p', null, 'Ori, keeper of the light'),
      h('p', null, 'Every species that ever crawled out of a tide pool'),
      h('h3', null, 'And you'),
      h('p', null, 'for playing.'),
      h('p', { style: 'margin-top:40px;font-size:18px;color:#fff' }, 'The galaxy is still out there.'),
      h('p', null, 'Twelve Genesis charges are waiting.'),
    );
    roll.addEventListener('animationend', () => this.finish());
    const box = h('div', { class: 'sp-credits' }, roll);
    this.layer.prepend(box);
    setTimeout(() => this.finish(), 28000);
  }

  private skipAll() {
    if (this.phase === 'dive') this.startOri();
    if (this.phase !== 'credits') { this.startCredits(); return; }
    this.finish();
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.game.fade(() => {
      this.game.pop();
      this.done();
    }, 500);
  }

  // ------------------------------------------------------------------ render
  render(g: CanvasRenderingContext2D, W: number, H: number) {
    if (this.phase === 'dive') this.renderDive(g, W, H);
    else this.renderLight(g, W, H);
  }

  private renderDive(g: CanvasRenderingContext2D, W: number, H: number) {
    const t = this.t;
    const k = clamp(t / 4.6, 0, 1);
    g.fillStyle = '#05030c';
    g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    g.globalCompositeOperation = 'lighter';
    // Tunnel rings rushing outward
    const N = 26;
    for (let i = 0; i < N; i++) {
      const z = ((i / N) + t * (0.25 + k * 0.9)) % 1;
      const r = 8 + Math.pow(z, 3) * Math.max(W, H) * 1.2;
      const hue = 30 + i * 9 + t * 40;
      g.strokeStyle = `hsla(${hue},90%,${55 + z * 20}%,${(0.15 + z * 0.5) * (0.4 + k)})`;
      g.lineWidth = 1 + z * 10;
      g.beginPath();
      g.ellipse(cx + Math.sin(t + i) * 8 * (1 - z), cy + Math.cos(t * 0.7 + i) * 8 * (1 - z), r, r * 0.92, t * 0.3 + i, 0, TAU);
      g.stroke();
    }
    // Spiralling stars
    for (let i = 0; i < 90; i++) {
      const a = i * 2.39996 + t * (0.6 + k * 2.5);
      const d = ((i * 37) % 100) / 100;
      const dd = Math.pow((d + t * 0.35) % 1, 2) * Math.max(W, H) * 0.8;
      blit(g, starSprite(i % 3 ? '#ffe2a8' : '#c9b6ff', 16), cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, 3 + dd * 0.02);
    }
    blit(g, glow('#fff6e0', 64, 1.4), cx, cy, 60 + k * k * Math.max(W, H) * 1.3);
    g.globalCompositeOperation = 'source-over';
    // Our ship, falling in
    if (k < 0.8) drawShip(g, this.st.shipDesign, cx, cy + 140 - k * 120, -Math.PI / 2, 0.9 * (1 - k * 0.7), t, { thrust: 1 });
    if (k > 0.75) { g.fillStyle = `rgba(255,252,240,${(k - 0.75) / 0.25})`; g.fillRect(0, 0, W, H); }
  }

  private renderLight(g: CanvasRenderingContext2D, W: number, H: number) {
    const t = this.oriT;
    const credits = this.phase === 'credits';
    const bg = g.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.4, Math.max(W, H) * 0.8);
    if (credits) {
      bg.addColorStop(0, '#2a1f3a');
      bg.addColorStop(1, '#05040c');
    } else {
      const f = clamp(t / 1.2, 0, 1);
      bg.addColorStop(0, `rgb(${255},${250 - f * 30},${235 - f * 70})`);
      bg.addColorStop(0.45, `rgb(${255 - f * 60},${200 - f * 60},${150 - f * 40})`);
      bg.addColorStop(1, `rgb(${120 - f * 80},${70 - f * 40},${90 - f * 30})`);
    }
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // Motes
    g.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      g.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 2 + m.x * 30);
      blit(g, glow(credits ? '#9fb8ff' : '#ffe9b0', 16), m.x * W, m.y * H, m.r * 3);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const ox = W / 2, oy = H * (credits ? 0.18 : 0.34);
    const sc = Math.min(W, H) / 390 * (credits ? 0.6 : 1);
    drawOri(g, ox, oy + Math.sin(this.t * 1.6) * 8, sc, this.t, credits ? 0 : clamp(t / 1.2, 0, 1));
    // The Genesis Seed
    if (this.gift >= 0 && !credits) {
      const gk = clamp(this.gift / 1.6, 0, 1);
      const sx = ox + 70 * sc, sy = oy + 40 * sc;
      const tx = W / 2, ty = H * 0.62;
      const x = sx + (tx - sx) * gk, y = sy + (ty - sy) * gk - Math.sin(gk * Math.PI) * 60;
      g.globalCompositeOperation = 'lighter';
      blit(g, glow('#7bd389', 48), x, y, 40 + Math.sin(this.t * 6) * 6);
      for (let i = 0; i < 6; i++) { const a = this.t * 3 + (i * TAU) / 6; blit(g, glow('#ffffff', 16), x + Math.cos(a) * 26, y + Math.sin(a) * 26, 6); }
      g.globalCompositeOperation = 'source-over';
      drawSeed(g, x, y, 1.2 * sc, this.t);
      if (gk >= 1) {
        g.fillStyle = 'rgba(40,30,10,0.85)';
        g.font = '700 16px Fredoka, system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('Genesis Seed · 12 charges', x, y + 46);
      }
    }
    if (!credits && t < 1.2) { g.fillStyle = `rgba(255,252,240,${1 - t / 1.2})`; g.fillRect(0, 0, W, H); }
  }
}

/** Ori: a tiny glowing being with big eyes, two antennae and fluttering fins, riding a halo. */
function drawOri(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, appear: number) {
  if (appear <= 0) appear = 1;
  const R = 34 * s * (0.6 + 0.4 * appear);
  g.save();
  g.globalCompositeOperation = 'lighter';
  blit(g, glow('#ffe2a8', 64), x, y, R * 3.6);
  g.globalCompositeOperation = 'source-over';
  // Halo ring it rides on
  g.strokeStyle = 'rgba(255,240,200,0.9)';
  g.lineWidth = 4 * s;
  g.beginPath(); g.ellipse(x, y + R * 1.05, R * 1.4, R * 0.3, 0, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,200,120,0.6)';
  g.lineWidth = 9 * s;
  g.beginPath(); g.ellipse(x, y + R * 1.05, R * 1.4, R * 0.3, 0, 0.1, Math.PI - 0.1); g.stroke();
  // Fins
  const flap = Math.sin(t * 9) * 0.5;
  for (const side of [-1, 1]) {
    g.save();
    g.translate(x + side * R * 0.85, y + R * 0.1);
    g.rotate(side * (0.6 + flap));
    g.fillStyle = 'rgba(255,190,220,0.85)';
    g.strokeStyle = '#b8507a';
    g.lineWidth = 2 * s;
    g.beginPath(); g.ellipse(side * R * 0.35, 0, R * 0.45, R * 0.2, 0, 0, TAU); g.fill(); g.stroke();
    g.restore();
  }
  // Antennae
  for (const side of [-1, 1]) {
    const tipX = x + side * R * 0.75 + Math.sin(t * 2 + side) * 5 * s, tipY = y - R * 1.55 + Math.cos(t * 2.4 + side) * 4 * s;
    g.strokeStyle = '#a0603a';
    g.lineWidth = 3 * s;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + side * R * 0.3, y - R * 0.8); g.quadraticCurveTo(x + side * R * 0.2, y - R * 1.4, tipX, tipY); g.stroke();
    g.globalCompositeOperation = 'lighter';
    blit(g, glow('#9fe3ff', 24), tipX, tipY, 12 * s);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#e9fbff';
    g.beginPath(); g.arc(tipX, tipY, 4.5 * s, 0, TAU); g.fill();
  }
  // Body
  const bg = g.createRadialGradient(x - R * 0.3, y - R * 0.4, R * 0.1, x, y, R);
  bg.addColorStop(0, '#fffdf2');
  bg.addColorStop(0.5, '#ffd98a');
  bg.addColorStop(1, '#ff9e5c');
  g.fillStyle = bg;
  g.strokeStyle = '#8a4a20';
  g.lineWidth = 3 * s;
  g.beginPath(); g.ellipse(x, y, R, R * 0.95, 0, 0, TAU); g.fill(); g.stroke();
  // Cheeks
  g.fillStyle = 'rgba(255,120,140,0.35)';
  for (const side of [-1, 1]) { g.beginPath(); g.ellipse(x + side * R * 0.55, y + R * 0.25, R * 0.16, R * 0.1, 0, 0, TAU); g.fill(); }
  // Eyes (with blinks)
  const blink = (t % 3.4) > 3.25 ? 0.12 : 1;
  for (const side of [-1, 1]) {
    const ex = x + side * R * 0.32, ey = y - R * 0.12;
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#5a3018';
    g.lineWidth = 2 * s;
    g.beginPath(); g.ellipse(ex, ey, R * 0.22, R * 0.27 * blink, 0, 0, TAU); g.fill(); g.stroke();
    if (blink > 0.5) {
      g.fillStyle = '#2a1a3a';
      g.beginPath(); g.ellipse(ex + R * 0.03, ey + R * 0.04, R * 0.13, R * 0.16, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(ex - R * 0.03, ey - R * 0.05, R * 0.05, 0, TAU); g.fill();
    }
  }
  // Smile
  g.strokeStyle = '#5a3018';
  g.lineWidth = 2.5 * s;
  g.beginPath(); g.arc(x, y + R * 0.22, R * 0.2, 0.2, Math.PI - 0.2); g.stroke();
  g.restore();
}

function drawSeed(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  g.save();
  g.translate(x, y);
  g.rotate(Math.sin(t * 2) * 0.2);
  g.fillStyle = '#5a3a1a';
  g.strokeStyle = '#2a1a08';
  g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, 4 * s, 9 * s, 12 * s, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#7bd389';
  g.strokeStyle = '#2a6a3a';
  for (const side of [-1, 1]) {
    g.beginPath(); g.ellipse(side * 7 * s, -10 * s, 8 * s, 4 * s, side * -0.6, 0, TAU); g.fill(); g.stroke();
  }
  g.restore();
}
