// Pre-rendered sprites and textures, so the per-frame cost stays low on phones:
// food morsels, glows, low-detail cell sprites (LOD), caustic light and sand tiles.
import { renderCell } from '../../design/render';
import { outlineOf, rgba, shade } from '../../design/color';
import { smoothPath } from '../../design/partkit';
import type { Design } from '../../design/types';
import { RNG } from '../../engine/rng';
import { TAU } from '../../engine/math';

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ------------------------------------------------------------------ glows

const glowCache = new Map<string, HTMLCanvasElement>();
/** Soft radial glow (64 px), drawn additively. */
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = canvas(64, 64);
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(color, 0.9));
  gr.addColorStop(0.35, rgba(color, 0.35));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

// ------------------------------------------------------------------ food

const FOOD_PX = 64;
const R = 24; // radius inside the sprite
let foodSprites: { plant: HTMLCanvasElement[]; meat: HTMLCanvasElement[]; egg: HTMLCanvasElement[]; frond: HTMLCanvasElement; shard: HTMLCanvasElement } | null = null;

function leaf(g: CanvasRenderingContext2D, col: string, big: boolean) {
  const p = new Path2D();
  p.moveTo(-R, 0);
  p.quadraticCurveTo(-R * 0.1, -R * (big ? 0.95 : 0.72), R, 0);
  p.quadraticCurveTo(-R * 0.1, R * (big ? 0.95 : 0.72), -R, 0);
  g.lineWidth = 3.2;
  g.strokeStyle = outlineOf(col);
  g.stroke(p);
  const gr = g.createLinearGradient(0, -R * 0.7, 0, R * 0.7);
  gr.addColorStop(0, shade(col, 0.35));
  gr.addColorStop(0.6, col);
  gr.addColorStop(1, shade(col, -0.2));
  g.fillStyle = gr;
  g.fill(p);
  g.strokeStyle = shade(col, 0.45);
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-R * 0.8, 0);
  g.lineTo(R * 0.85, 0);
  for (let i = -2; i <= 2; i++) {
    g.moveTo(i * R * 0.28, 0);
    g.lineTo(i * R * 0.28 + R * 0.22, -R * 0.32);
    g.moveTo(i * R * 0.28, 0);
    g.lineTo(i * R * 0.28 + R * 0.22, R * 0.32);
  }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.ellipse(-R * 0.2, -R * 0.28, R * 0.32, R * 0.1, -0.2, 0, TAU);
  g.fill();
}

function algae(g: CanvasRenderingContext2D, col: string) {
  const blobs: [number, number, number][] = [[-8, 4, 11], [7, 6, 10], [0, -8, 11], [10, -6, 7]];
  for (const [x, y, r] of blobs) {
    g.fillStyle = outlineOf(col);
    g.beginPath(); g.arc(x, y, r + 1.8, 0, TAU); g.fill();
  }
  for (const [x, y, r] of blobs) {
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
    gr.addColorStop(0, shade(col, 0.45));
    gr.addColorStop(1, col);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = shade(col, -0.25);
    g.beginPath(); g.arc(x + r * 0.15, y + r * 0.1, r * 0.28, 0, TAU); g.fill();
  }
}

function diatom(g: CanvasRenderingContext2D, col: string) {
  g.fillStyle = outlineOf(col);
  g.beginPath(); g.arc(0, 0, R * 0.9 + 1.8, 0, TAU); g.fill();
  const gr = g.createRadialGradient(-6, -8, 2, 0, 0, R * 0.9);
  gr.addColorStop(0, shade(col, 0.5));
  gr.addColorStop(1, col);
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, R * 0.9, 0, TAU); g.fill();
  g.strokeStyle = shade(col, -0.3);
  g.lineWidth = 1.4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    g.beginPath(); g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); g.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); g.stroke();
  }
  g.fillStyle = shade(col, 0.55);
  g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
}

function meat(g: CanvasRenderingContext2D, seed: number) {
  const r = new RNG(seed);
  const pts: [number, number][] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.range(-0.2, 0.2);
    const rr = R * r.range(0.7, 0.98);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.85]);
  }
  const p = smoothPath(pts);
  const col = ['#e0574f', '#d9483f', '#ea6a55'][seed % 3];
  g.lineWidth = 3.4;
  g.strokeStyle = '#5c1414';
  g.stroke(p);
  const gr = g.createLinearGradient(0, -R, 0, R);
  gr.addColorStop(0, shade(col, 0.3));
  gr.addColorStop(1, shade(col, -0.25));
  g.fillStyle = gr;
  g.fill(p);
  g.save();
  g.clip(p);
  g.strokeStyle = 'rgba(255,200,190,0.55)';
  g.lineWidth = 2.2;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    const y = -10 + i * 9 + r.range(-2, 2);
    g.moveTo(-R, y);
    g.bezierCurveTo(-8, y - 6, 6, y + 6, R, y - 2);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,240,220,0.75)';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(r.range(-12, 12), r.range(-10, 10), r.range(2, 3.5), 0, TAU); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.beginPath(); g.ellipse(-6, -9, 7, 3, -0.3, 0, TAU); g.fill();
}

function egg(g: CanvasRenderingContext2D) {
  g.fillStyle = 'rgba(80,60,30,0.9)';
  g.beginPath(); g.arc(0, 0, R * 0.92 + 1.8, 0, TAU); g.fill();
  const gr = g.createRadialGradient(-7, -8, 2, 0, 0, R * 0.92);
  gr.addColorStop(0, '#fffdf2');
  gr.addColorStop(0.7, '#f6e7b8');
  gr.addColorStop(1, '#d9bf7a');
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, R * 0.92, 0, TAU); g.fill();
  const y = g.createRadialGradient(3, 4, 1, 3, 4, 10);
  y.addColorStop(0, '#ffb347');
  y.addColorStop(1, 'rgba(255,150,40,0.15)');
  g.fillStyle = y;
  g.beginPath(); g.arc(3, 4, 10, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath(); g.ellipse(-8, -10, 6, 3.2, -0.5, 0, TAU); g.fill();
}

function frond(g: CanvasRenderingContext2D) {
  // A decorative kelp rosette that marks a big plant cluster.
  const col = '#3fae5c';
  for (let i = 0; i < 6; i++) {
    g.save();
    g.rotate((i / 6) * TAU);
    g.translate(R * 0.45, 0);
    g.scale(0.55, 0.5);
    leaf(g, i % 2 ? col : '#58c46b', true);
    g.restore();
  }
  g.fillStyle = '#2b7a41';
  g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
  g.fillStyle = '#c6f58a';
  g.beginPath(); g.arc(-1.5, -1.5, 2.5, 0, TAU); g.fill();
}

function shard(g: CanvasRenderingContext2D) {
  const crystals: [number, number, number, number, string][] = [
    [0, 0, 0, 1, '#ffd166'], [-0.5, 0.25, -0.55, 0.7, '#7ff3ff'], [0.55, 0.2, 0.6, 0.65, '#ffe9a8'],
  ];
  for (const [ox, oy, rot, s, col] of crystals) {
    g.save();
    g.translate(ox * R * 0.6, oy * R * 0.5);
    g.rotate(rot);
    g.scale(s, s);
    const p = new Path2D();
    p.moveTo(0, -R);
    p.lineTo(R * 0.38, -R * 0.15);
    p.lineTo(R * 0.22, R * 0.7);
    p.lineTo(-R * 0.22, R * 0.7);
    p.lineTo(-R * 0.38, -R * 0.15);
    p.closePath();
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.strokeStyle = shade(col, -0.6);
    g.stroke(p);
    const gr = g.createLinearGradient(-R * 0.4, -R, R * 0.4, R * 0.7);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.35, col);
    gr.addColorStop(1, shade(col, -0.35));
    g.fillStyle = gr;
    g.fill(p);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, -R * 0.9); g.lineTo(0, R * 0.6); g.stroke();
    g.restore();
  }
}

function sprite(draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = canvas(FOOD_PX, FOOD_PX);
  const g = c.getContext('2d')!;
  g.translate(FOOD_PX / 2, FOOD_PX / 2);
  draw(g);
  return c;
}

export function foodArt() {
  if (foodSprites) return foodSprites;
  foodSprites = {
    plant: [
      sprite((g) => leaf(g, '#7ddc5a', false)),
      sprite((g) => algae(g, '#a6e84f')),
      sprite((g) => diatom(g, '#63d6a0')),
      sprite((g) => leaf(g, '#5fcf62', true)),
    ],
    meat: [0, 1, 2].map((s) => sprite((g) => meat(g, s + 3))),
    egg: [sprite(egg)],
    frond: sprite(frond),
    shard: sprite(shard),
  };
  return foodSprites;
}
/** Sprite radius in sprite pixels (scale = worldRadius / FOOD_R). */
export const FOOD_R = R;
export const FOOD_HALF = FOOD_PX / 2;

// ------------------------------------------------------------------ cells

export interface CellSprite {
  img: HTMLCanvasElement;
  /** Design-space origin inside the sprite, in sprite px. */
  ox: number;
  oy: number;
  /** Sprite px per design unit. */
  ppu: number;
}

const cellCache = new WeakMap<Design, CellSprite>();
const silCache = new WeakMap<Design, CellSprite>();

function bake(d: Design, ppu: number): CellSprite {
  let left = Infinity, right = -Infinity, half = 0;
  for (const n of d.spine) {
    left = Math.min(left, n.x - n.r);
    right = Math.max(right, n.x + n.r);
    half = Math.max(half, Math.abs(n.y) + n.r);
  }
  left -= 26; right += 22; half += 16;
  const img = canvas((right - left) * ppu, half * 2 * ppu);
  const g = img.getContext('2d')!;
  const ox = -left * ppu, oy = half * ppu;
  renderCell(g, d, ox, oy, 0, ppu, { t: 0.3 });
  return { img, ox, oy, ppu };
}

/** Low-detail sprite of a cell design (for small or distant cells). */
export function cellSprite(d: Design): CellSprite {
  let s = cellCache.get(d);
  if (!s) { s = bake(d, 1.6); cellCache.set(d, s); }
  return s;
}

/** Blurry, water-tinted silhouette for parallax background layers. */
export function silhouetteSprite(d: Design, tint: string): CellSprite {
  let s = silCache.get(d);
  if (s) return s;
  const small = bake(d, 0.42);
  const g = small.img.getContext('2d')!;
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = rgba(tint, 0.55);
  g.fillRect(0, 0, small.img.width, small.img.height);
  s = small;
  silCache.set(d, s);
  return s;
}

const shadowCache = new WeakMap<Design, CellSprite>();
/** Soft dark silhouette used as a drop shadow (low resolution, so it blurs when scaled). */
export function shadowSprite(d: Design): CellSprite {
  let s = shadowCache.get(d);
  if (s) return s;
  s = bake(d, 0.5);
  const g = s.img.getContext('2d')!;
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#000814';
  g.fillRect(0, 0, s.img.width, s.img.height);
  shadowCache.set(d, s);
  return s;
}

/** Draw a cached cell sprite at world position with rotation and size (world units per design unit). */
export function drawCellSprite(g: CanvasRenderingContext2D, s: CellSprite, x: number, y: number, angle: number, size: number, alpha = 1) {
  const k = size / s.ppu;
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  if (alpha < 1) g.globalAlpha *= alpha;
  g.drawImage(s.img, -s.ox * k, -s.oy * k, s.img.width * k, s.img.height * k);
  g.restore();
}

// ------------------------------------------------------------------ textures

let causticTile: HTMLCanvasElement | null = null;
/** Tileable caustic light network (Worley F2-F1), white with alpha. */
export function caustics(): HTMLCanvasElement {
  if (causticTile) return causticTile;
  const size = 256, cells = 6;
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const r = new RNG(7331);
  const px: number[] = [], py: number[] = [];
  for (let i = 0; i < cells * cells; i++) { px.push(r.range(0.1, 0.9)); py.push(r.range(0.1, 0.9)); }
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * cells, v = (y / size) * cells;
      const gx = Math.floor(u), gy = Math.floor(v);
      let f1 = 9, f2 = 9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx, cy = gy + dy;
          const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
          const k = wy * cells + wx;
          const fx = cx + px[k], fy = cy + py[k];
          const d = Math.hypot(u - fx, v - fy);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
      }
      const e = Math.min(1, (f2 - f1) / 0.32);
      const b = Math.pow(1 - e, 3.2) * 0.95 + Math.pow(1 - Math.min(1, f1 / 0.9), 2) * 0.08;
      const i = (y * size + x) * 4;
      data[i] = 220; data[i + 1] = 255; data[i + 2] = 250; data[i + 3] = Math.min(255, b * 255);
    }
  }
  g.putImageData(img, 0, 0);
  causticTile = c;
  return c;
}

let sandTile: HTMLCanvasElement | null = null;
/** Tileable sea-floor texture: rippled sand with pebbles (only seen in the last levels). */
export function sand(): HTMLCanvasElement {
  if (sandTile) return sandTile;
  const size = 256;
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const warp = Math.sin(TAU * (2 * v + 0.3 * Math.sin(TAU * u))) * 0.06;
      const rip = Math.sin(TAU * (5 * u + 2 * v + warp * 4 + 0.4 * Math.sin(TAU * (3 * v))));
      const grain = Math.sin(TAU * (31 * u + 17 * v)) * Math.sin(TAU * (23 * v - 13 * u));
      const b = 0.5 + rip * 0.32 + grain * 0.08;
      const i = (y * size + x) * 4;
      d[i] = 214 + b * 30; d[i + 1] = 186 + b * 28; d[i + 2] = 132 + b * 22; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const r = new RNG(99);
  for (let i = 0; i < 26; i++) {
    const x = r.range(0, size), y = r.range(0, size), rr = r.range(2, 7);
    const col = r.pick(['#9c8466', '#b9a07a', '#7f6e5a', '#c9b48e']);
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      g.fillStyle = 'rgba(70,50,30,0.35)';
      g.beginPath(); g.ellipse(x + ox + 1, y + oy + 1.5, rr, rr * 0.75, 0, 0, TAU); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.ellipse(x + ox, y + oy, rr, rr * 0.75, 0, 0, TAU); g.fill();
    }
  }
  sandTile = c;
  return c;
}
