// Pre-rendered prop sprites (trees, bushes, rocks, shadows) and emoji/bubble caches.
// Props are drawn once into offscreen canvases at SPR px per world unit and blitted each frame.
import { shade, rgba } from '../../design/color';
import { TAU } from '../../engine/math';
import { RNG } from '../../engine/rng';

export const SPR = 2;

export interface Sprite {
  c: HTMLCanvasElement;
  /** Anchor (ground point) in world units from the sprite's top-left. */
  ax: number;
  ay: number;
  /** Size in world units. */
  w: number;
  h: number;
}

function makeSprite(w: number, h: number, ax: number, ay: number, draw: (g: CanvasRenderingContext2D) => void): Sprite {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * SPR);
  c.height = Math.ceil(h * SPR);
  const g = c.getContext('2d')!;
  g.scale(SPR, SPR);
  g.translate(ax, ay);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g);
  return { c, ax, ay, w, h };
}

export function blit(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1, dx = 0) {
  g.drawImage(s.c, x - s.ax * scale + dx, y - s.ay * scale, s.w * scale, s.h * scale);
}

// ------------------------------------------------------------------ trees
interface TreeSprites { trunk: Sprite; crown: Sprite; height: number; crownTop: number; crownBottom: number; crownR: number }

const CANOPY = [
  { base: '#5cae3d', dark: '#3c7f2a', light: '#93d662' },
  { base: '#3f9a5a', dark: '#2a6c3e', light: '#73c98a' },
  { base: '#8cc63f', dark: '#5f9628', light: '#c2e878' },
  { base: '#f29ab8', dark: '#c76488', light: '#ffd0e0' },
];

function blobUnion(g: CanvasRenderingContext2D, blobs: number[][], col: { base: string; dark: string; light: string }, rng: RNG) {
  const ol = shade(col.dark, -0.45);
  g.fillStyle = ol;
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r + 2.4, 0, TAU); g.fill(); }
  let top = Infinity, bot = -Infinity;
  for (const [, y, r] of blobs) { top = Math.min(top, y - r); bot = Math.max(bot, y + r); }
  const gr = g.createLinearGradient(0, top, 0, bot);
  gr.addColorStop(0, col.light);
  gr.addColorStop(0.45, col.base);
  gr.addColorStop(1, col.dark);
  g.fillStyle = gr;
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  // Inner shading crescents + leafy highlights.
  g.fillStyle = rgba(col.dark, 0.55);
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x + r * 0.25, y + r * 0.3, r * 0.62, 0, TAU); g.fill(); }
  g.fillStyle = rgba(col.base, 0.9);
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x - r * 0.12, y - r * 0.1, r * 0.6, 0, TAU); g.fill(); }
  g.fillStyle = rgba(col.light, 0.85);
  for (const [x, y, r] of blobs) {
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(x - r * 0.35 + rng.range(-r * 0.2, r * 0.2), y - r * 0.4 + rng.range(-r * 0.15, r * 0.15), r * rng.range(0.12, 0.22), 0, TAU);
      g.fill();
    }
  }
}

function broadleaf(variant: number): TreeSprites {
  const col = CANOPY[variant];
  const rng = new RNG(1234 + variant);
  const trunk = makeSprite(40, 60, 20, 56, (g) => {
    const p = new Path2D();
    p.moveTo(-7, 1); p.quadraticCurveTo(-4, -8, -4, -20); p.lineTo(-3.5, -48); p.lineTo(3.5, -48); p.lineTo(4, -20); p.quadraticCurveTo(4, -8, 8, 1);
    p.quadraticCurveTo(0, 3, -7, 1);
    g.strokeStyle = '#3a2412'; g.lineWidth = 2.4; g.stroke(p);
    const gr = g.createLinearGradient(-6, 0, 6, 0);
    gr.addColorStop(0, '#a87645'); gr.addColorStop(0.5, '#86592f'); gr.addColorStop(1, '#5c3b1d');
    g.fillStyle = gr; g.fill(p);
    g.strokeStyle = 'rgba(60,35,15,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-1, -6); g.lineTo(0, -30); g.moveTo(2, -14); g.lineTo(1.5, -36); g.stroke();
    // Branch stubs.
    g.strokeStyle = '#5c3b1d'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-2, -36); g.lineTo(-11, -46); g.moveTo(2, -40); g.lineTo(10, -49); g.stroke();
  });
  const blobs = [[0, -70, 25], [-19, -60, 19], [19, -61, 19], [-11, -84, 18], [12, -85, 17], [0, -54, 17], [-25, -73, 13], [26, -74, 13]];
  const crown = makeSprite(80, 76, 40, 112 - 8, (g) => {
    g.translate(0, 8);
    blobUnion(g, blobs, col, rng);
    if (variant === 3) {
      g.fillStyle = '#fff';
      for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(rng.range(-26, 26), rng.range(-95, -50), 1.6, 0, TAU); g.fill(); }
    }
  });
  return { trunk, crown, height: 112, crownTop: -112, crownBottom: -36, crownR: 38 };
}

function pine(variant: number): TreeSprites {
  const base = variant === 0 ? '#2f7d4a' : '#3d8a74';
  const trunk = makeSprite(20, 24, 10, 22, (g) => {
    g.fillStyle = '#3a2412'; g.fillRect(-4.5, -20, 9, 21);
    g.fillStyle = '#7a5230'; g.fillRect(-3, -20, 6, 20);
  });
  const crown = makeSprite(64, 120, 32, 118, (g) => {
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const w = 30 - i * 5.5, yb = -12 - i * 21, yt = yb - 38 + i * 2;
      const p = new Path2D();
      p.moveTo(-w, yb);
      p.quadraticCurveTo(-w * 0.5, yb + 5, 0, yb + 2);
      p.quadraticCurveTo(w * 0.5, yb + 5, w, yb);
      p.lineTo(1, yt); p.lineTo(-1, yt);
      p.closePath();
      g.strokeStyle = shade(base, -0.55); g.lineWidth = 2.4; g.stroke(p);
      const gr = g.createLinearGradient(-w, 0, w, 0);
      gr.addColorStop(0, shade(base, 0.25)); gr.addColorStop(0.5, base); gr.addColorStop(1, shade(base, -0.3));
      g.fillStyle = gr; g.fill(p);
      g.strokeStyle = rgba(shade(base, 0.35), 0.7); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-w * 0.6, yb - 2); g.lineTo(-2, yt + 8); g.stroke();
    }
  });
  return { trunk, crown, height: 118, crownTop: -110, crownBottom: -12, crownR: 30 };
}

function palm(): TreeSprites {
  const trunk = makeSprite(40, 84, 14, 82, (g) => {
    const p = new Path2D();
    p.moveTo(-4, 0); p.quadraticCurveTo(-3, -40, 10, -76); p.lineTo(15, -75); p.quadraticCurveTo(3, -40, 5, 0); p.closePath();
    g.strokeStyle = '#4a3218'; g.lineWidth = 2.4; g.stroke(p);
    g.fillStyle = '#b08850'; g.fill(p);
    g.strokeStyle = 'rgba(80,50,20,0.6)'; g.lineWidth = 1.2;
    for (let k = 1; k < 9; k++) {
      const t = k / 9, x = -1 + t * t * 13, y = -t * 76;
      g.beginPath(); g.moveTo(x - 4, y + 1); g.lineTo(x + 5, y - 1); g.stroke();
    }
  });
  const crown = makeSprite(96, 60, 36, 98, (g) => {
    g.translate(12, -76);
    const fronds = [-2.7, -2.1, -1.4, -0.7, -0.1, 0.5];
    for (const a of fronds) {
      const ex = Math.cos(a) * 34, ey = Math.sin(a) * 18 + 10;
      const p = new Path2D();
      p.moveTo(0, 0);
      p.quadraticCurveTo(ex * 0.5, ey - 16, ex, ey);
      p.quadraticCurveTo(ex * 0.45, ey - 6, 0, 2);
      g.strokeStyle = '#1f5a28'; g.lineWidth = 2.2; g.stroke(p);
      g.fillStyle = a < -1.5 ? '#3f8f3a' : '#5db04a'; g.fill(p);
    }
    g.fillStyle = '#6b4423';
    for (const [x, y] of [[-3, 4], [3, 5], [0, 7]]) { g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill(); }
  });
  return { trunk, crown, height: 100, crownTop: -100, crownBottom: -60, crownR: 36 };
}

let treeCache: TreeSprites[] | null = null;
export function treeSprites(): TreeSprites[] {
  if (!treeCache) treeCache = [broadleaf(0), broadleaf(1), broadleaf(2), broadleaf(3), pine(0), pine(1), palm()];
  return treeCache;
}

// ------------------------------------------------------------------ bushes & rocks
export const FRUIT_SPOTS = [[-9, -13], [7, -17], [12, -8], [-1, -21], [-14, -6]];

let bushCache: Sprite[] | null = null;
export function bushSprites(): Sprite[] {
  if (bushCache) return bushCache;
  const cols = [
    { base: '#4f9e3a', dark: '#2f6e25', light: '#86cc5e' },
    { base: '#3d8f52', dark: '#25603a', light: '#6cc083' },
    { base: '#6aa83a', dark: '#477a22', light: '#a2d468' },
  ];
  bushCache = cols.map((col, i) => makeSprite(50, 34, 25, 30, (g) => {
    const rng = new RNG(77 + i);
    blobUnion(g, [[0, -12, 12], [-11, -8, 9], [11, -8, 10], [-5, -18, 9], [6, -19, 8]], col, rng);
  }));
  return bushCache;
}

let rockCache: Sprite[] | null = null;
export function rockSprites(): Sprite[] {
  if (rockCache) return rockCache;
  const tones = ['#a8a59a', '#9c8f7d', '#8f9a88'];
  rockCache = [];
  for (let i = 0; i < 6; i++) {
    const tone = tones[i % 3];
    const rng = new RNG(900 + i);
    rockCache.push(makeSprite(44, 34, 22, 28, (g) => {
      const pts: [number, number][] = [];
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = Math.PI + (k / (n - 1)) * Math.PI;
        const rr = rng.range(0.75, 1.05);
        pts.push([Math.cos(a) * 17 * rr, Math.sin(a) * 19 * rr * (i % 2 ? 0.8 : 1) - 1]);
      }
      const p = new Path2D();
      p.moveTo(-18, 0);
      for (const [x, y] of pts) p.lineTo(x, y);
      p.lineTo(18, 0);
      p.quadraticCurveTo(0, 4, -18, 0);
      p.closePath();
      g.strokeStyle = shade(tone, -0.6); g.lineWidth = 2.4; g.stroke(p);
      const gr = g.createLinearGradient(0, -20, 0, 2);
      gr.addColorStop(0, shade(tone, 0.3)); gr.addColorStop(0.5, tone); gr.addColorStop(1, shade(tone, -0.3));
      g.fillStyle = gr; g.fill(p);
      g.save(); g.clip(p);
      g.fillStyle = rgba(shade(tone, -0.35), 0.5);
      g.beginPath(); g.ellipse(8, -4, 12, 9, 0.3, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.beginPath(); g.ellipse(-6, -13, 7, 3.2, -0.3, 0, TAU); g.fill();
      if (i % 3 === 2) {
        g.fillStyle = 'rgba(110,170,70,0.75)';
        for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(rng.range(-12, 10), rng.range(-17, -10), rng.range(2, 4), 0, TAU); g.fill(); }
      }
      g.strokeStyle = rgba(shade(tone, -0.5), 0.6); g.lineWidth = 1;
      g.beginPath(); g.moveTo(-3, -16); g.lineTo(1, -9); g.lineTo(-1, -4); g.stroke();
      g.restore();
    }));
  }
  return rockCache;
}

let shadowCache: HTMLCanvasElement | null = null;
/** A soft round shadow (64×32). */
export function shadowSprite(): HTMLCanvasElement {
  if (shadowCache) return shadowCache;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d')!;
  g.translate(32, 16);
  g.scale(1, 0.5);
  const gr = g.createRadialGradient(0, 0, 2, 0, 0, 31);
  gr.addColorStop(0, 'rgba(20,45,15,0.42)');
  gr.addColorStop(0.6, 'rgba(20,45,15,0.25)');
  gr.addColorStop(1, 'rgba(20,45,15,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, 31, 0, TAU); g.fill();
  shadowCache = c;
  return c;
}
export function drawShadow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.drawImage(shadowSprite(), x - w / 2, y - h / 2, w, h);
}

// ------------------------------------------------------------------ emoji & bubbles (screen space)
const emojiCache = new Map<string, HTMLCanvasElement>();
const DPR = () => Math.min(2, window.devicePixelRatio || 1);

/** An emoji rendered once to a canvas of `px` CSS pixels. */
export function emojiSprite(ch: string, px: number): HTMLCanvasElement {
  const key = ch + '|' + px;
  let c = emojiCache.get(key);
  if (c) return c;
  const d = DPR();
  c = document.createElement('canvas');
  const s = Math.ceil(px * 1.3);
  c.width = Math.ceil(s * d); c.height = Math.ceil(s * d);
  const g = c.getContext('2d')!;
  g.scale(d, d);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.fillText(ch, s / 2, s / 2 + px * 0.06);
  emojiCache.set(key, c);
  return c;
}
export function drawEmoji(g: CanvasRenderingContext2D, ch: string, x: number, y: number, px: number) {
  const c = emojiSprite(ch, px);
  const s = px * 1.3;
  g.drawImage(c, x - s / 2, y - s / 2, s, s);
}

const bubbleCache = new Map<string, HTMLCanvasElement>();
/** White speech bubble with a tail; centred horizontally on x, tail tip at y. */
export function drawBubble(g: CanvasRenderingContext2D, ch: string, x: number, y: number, scale = 1, tint = '#ffffff') {
  const key = ch + tint;
  let c = bubbleCache.get(key);
  const W = 38, H = 44;
  if (!c) {
    const d = DPR();
    c = document.createElement('canvas');
    c.width = W * d; c.height = H * d;
    const b = c.getContext('2d')!;
    b.scale(d, d);
    b.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(b, 3, 4, W - 6, H - 14, 12); b.fill();
    b.fillStyle = tint;
    b.strokeStyle = 'rgba(30,40,60,0.85)';
    b.lineWidth = 2;
    const p = new Path2D();
    const x0 = 2, y0 = 1, w = W - 4, h = H - 13, r = 12;
    p.moveTo(x0 + r, y0); p.lineTo(x0 + w - r, y0); p.arcTo(x0 + w, y0, x0 + w, y0 + r, r);
    p.lineTo(x0 + w, y0 + h - r); p.arcTo(x0 + w, y0 + h, x0 + w - r, y0 + h, r);
    p.lineTo(W / 2 + 5, y0 + h); p.lineTo(W / 2, H - 2); p.lineTo(W / 2 - 5, y0 + h);
    p.lineTo(x0 + r, y0 + h); p.arcTo(x0, y0 + h, x0, y0 + h - r, r);
    p.lineTo(x0, y0 + r); p.arcTo(x0, y0, x0 + r, y0, r); p.closePath();
    b.stroke(p); b.fill(p);
    b.drawImage(emojiSprite(ch, 20), W / 2 - 13, (H - 12) / 2 - 13, 26, 26);
    bubbleCache.set(key, c);
  }
  g.drawImage(c, x - (W / 2) * scale, y - H * scale, W * scale, H * scale);
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
