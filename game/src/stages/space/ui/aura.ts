// Tier auras for the big icon of a part that comes in a line (Star Drive II to V, Cargo Bay II to IV, the two
// lasers, …). Every step up burns brighter: a green glow and halo, then a blue turning ring with orbiting motes,
// a violet double ring with twinkles, and at the top of each line a gold corona of rays, embers and three rings.
// Pips under the icon count the tier. The icon itself never moves, so every preview sits in the same spot.
import { TAU } from '../../../engine/math';
import { TOOLS, type ToolDef } from '../data';

/** One colour per step, after the rarity colours: green and blue as for components, then violet and gold. */
const STEP_COLOR = ['#62e07c', '#5ab0ff', '#b67cff', '#ffc145'];

/** Step 1–4 sets the effects; `n` of `of` is the tier, shown as pips. */
export interface Aura { step: number; n: number; of: number }

/** Where a tool sits in its line, or null for a one-off. The top of every line is the gold step. */
export function toolAura(t: ToolDef): Aura | undefined {
  if (!t.group) return undefined;
  const line = TOOLS.filter((o) => o.group === t.group).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const n = line.indexOf(t) + 1;
  if (line.length < 2 || !n) return undefined;
  return { step: Math.max(1, Math.round((n / line.length) * 4)), n, of: line.length };
}

const rgba = (hex: string, a: number) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};
/** A steady pseudo-random number for particle `i`. */
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Draw the aura behind `big` (the icon), on a canvas filling `host`, until it leaves the page. */
export function tierAura(host: HTMLElement, big: HTMLElement, a: Aura) {
  const cv = document.createElement('canvas');
  cv.className = 'nb-aura';
  host.prepend(cv);
  const s = Math.max(1, Math.min(4, a.step)), col = STEP_COLOR[s - 1];
  big.style.filter = `drop-shadow(0 0 ${4 + s * 4}px ${rgba(col, 0.55 + s * 0.1)})`;
  let t = 0, last = performance.now();
  const paint = (now: number) => {
    if (!cv.isConnected && t > 0.2) return;
    t += Math.min(0.1, (now - last) / 1000);
    last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, hh = cv.clientHeight;
    if (w && hh) {
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, hh);
      const cb = cv.getBoundingClientRect(), ib = big.getBoundingClientRect();
      const x = ib.left + ib.width / 2 - cb.left, y = ib.top + ib.height / 2 - cb.top;
      // Rings scale with the icon, but shrink to fit a short screen (the outermost ring is 1.3–2.1 icon radii).
      const outer = [1.3, 1.3, 1.76, 2.12][s - 1];
      const r = Math.min(Math.max(ib.width, ib.height) / 2 || hh * 0.2, (Math.min(hh / 2 - 14, w / 2) - 2) / outer);
      draw(g, w, hh, x, y, r, t, s, col, a);
      if (s >= 3) big.style.transform = `scale(${1 + Math.sin(t * 2.2) * 0.025 * (s - 2)})`;
    }
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}

function draw(g: CanvasRenderingContext2D, w: number, hh: number, x: number, y: number, r: number, t: number, s: number, col: string, a: Aura) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
  g.globalCompositeOperation = 'lighter';

  // The corona: slow-turning rays, at the top of a line only.
  if (s >= 4) {
    const rays = 14, len = r * 3.4;
    g.save();
    g.translate(x, y);
    g.rotate(t * 0.22);
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * TAU, wd = (i % 2 ? 0.07 : 0.12) * (0.8 + 0.2 * Math.sin(t * 1.7 + i));
      const gr = g.createRadialGradient(0, 0, r * 0.8, 0, 0, len * (i % 2 ? 0.75 : 1));
      gr.addColorStop(0, rgba(col, 0.32));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, len, ang - wd, ang + wd);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // The glow: bigger and brighter with every step.
  const gr0 = r * (1.2 + s * 0.25 + pulse * 0.08 * s);
  const glow = g.createRadialGradient(x, y, r * 0.2, x, y, gr0);
  glow.addColorStop(0, rgba(col, 0.16 + s * 0.07));
  glow.addColorStop(1, rgba(col, 0));
  g.fillStyle = glow;
  g.beginPath(); g.arc(x, y, gr0, 0, TAU); g.fill();

  // Rings: a halo, then it turns and breaks into dashes, then a ticked ring the other way, then a dotted outer one.
  g.lineCap = 'round';
  const ring = (rad: number, alpha: number, lw: number, dash: number[] = [], off = 0) => {
    g.strokeStyle = rgba(col, alpha);
    g.lineWidth = lw;
    g.setLineDash(dash);
    g.lineDashOffset = off;
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
  };
  g.shadowColor = rgba(col, 0.9);
  g.shadowBlur = 4 + s * 2;
  if (s === 1) ring(r * 1.3, 0.35 + pulse * 0.15, 1.5);
  else ring(r * 1.3, 0.55, 2, [r * 0.42, r * 0.16], -t * r * 0.6);
  if (s >= 3) {
    ring(r * 1.62, 0.4, 1.2);
    g.save();
    g.translate(x, y);
    g.rotate(-t * 0.5);
    g.strokeStyle = rgba(col, 0.75);
    g.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * TAU, k = i % 6 ? 0.06 : 0.14;
      g.beginPath();
      g.moveTo(Math.cos(ang) * r * 1.62, Math.sin(ang) * r * 1.62);
      g.lineTo(Math.cos(ang) * r * (1.62 + k), Math.sin(ang) * r * (1.62 + k));
      g.stroke();
    }
    g.restore();
  }
  if (s >= 4) {
    ring(r * 1.98, 0.5, 2.2, [1, r * 0.13], t * r * 0.4);
    // Three bright arcs sweep the outer ring.
    for (let i = 0; i < 3; i++) {
      const a0 = t * 1.1 + (i * TAU) / 3;
      g.strokeStyle = rgba(col, 0.85);
      g.lineWidth = 3;
      g.setLineDash([]);
      g.beginPath(); g.arc(x, y, r * 1.98, a0, a0 + 0.5); g.stroke();
    }
  }
  g.setLineDash([]);

  // Motes orbiting the halo.
  const motes = [0, 0, 3, 6, 10][s];
  for (let i = 0; i < motes; i++) {
    const orb = r * (1.3 + (s >= 3 ? (i % 3) * 0.16 : 0)), sp = (0.9 + rnd(i) * 0.6) * (i % 2 && s >= 3 ? -1 : 1);
    const ang = t * sp + (i / motes) * TAU;
    const mx = x + Math.cos(ang) * orb, my = y + Math.sin(ang) * orb * (s >= 4 ? 0.92 : 1);
    g.fillStyle = rgba('#ffffff', 0.9);
    g.shadowBlur = 10;
    g.beginPath(); g.arc(mx, my, 1.6 + s * 0.3, 0, TAU); g.fill();
  }

  // Twinkles: four-pointed stars that flare and fade around the icon.
  if (s >= 3) {
    const n = s >= 4 ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const cyc = 2.2 + rnd(i + 9) * 1.6, ph = (t / cyc + rnd(i + 3)) % 1, k = Math.sin(ph * Math.PI);
      const seed = i * 13 + Math.floor(t / cyc + rnd(i + 3));
      const ang = rnd(seed) * TAU, d = r * (1.15 + rnd(seed + 1) * 1.1);
      star(g, x + Math.cos(ang) * d, y + Math.sin(ang) * d, (3 + s * 1.5) * k, rgba('#ffffff', 0.95 * k), rgba(col, k));
    }
  }

  // Embers rising through the corona.
  if (s >= 4) {
    for (let i = 0; i < 16; i++) {
      const life = 2.5 + rnd(i) * 2, p = (t / life + rnd(i + 40)) % 1;
      const ex = x + (rnd(i + 20) - 0.5) * r * 3 + Math.sin(t * 2 + i) * 4, ey = y + r * 1.6 - p * r * 3.6;
      g.fillStyle = rgba(col, Math.sin(p * Math.PI) * 0.9);
      g.shadowBlur = 8;
      g.beginPath(); g.arc(ex, ey, 1.2 + rnd(i + 60) * 1.4, 0, TAU); g.fill();
    }
  }
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'source-over';

  // Tier pips along the bottom: lit up to this tier.
  const gap = 15, px = w / 2 - ((a.of - 1) * gap) / 2, py = hh - 8;
  for (let i = 0; i < a.of; i++) {
    const on = i < a.n, cx = px + i * gap;
    g.beginPath();
    g.moveTo(cx, py - 5); g.lineTo(cx + 5, py); g.lineTo(cx, py + 5); g.lineTo(cx - 5, py); g.closePath();
    if (on) { g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8; g.fill(); g.shadowBlur = 0; }
    else { g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.5; g.stroke(); }
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, sz: number, core: string, glow: string) {
  if (sz <= 0.3) return;
  g.fillStyle = core;
  g.shadowColor = glow;
  g.shadowBlur = sz * 2;
  g.beginPath();
  g.moveTo(x, y - sz); g.quadraticCurveTo(x, y, x + sz * 0.35, y);
  g.quadraticCurveTo(x, y, x, y + sz); g.quadraticCurveTo(x, y, x - sz * 0.35, y);
  g.quadraticCurveTo(x, y, x, y - sz);
  g.moveTo(x - sz, y); g.quadraticCurveTo(x, y, x, y + sz * 0.35);
  g.quadraticCurveTo(x, y, x + sz, y); g.quadraticCurveTo(x, y, x, y - sz * 0.35);
  g.quadraticCurveTo(x, y, x - sz, y);
  g.fill();
}
