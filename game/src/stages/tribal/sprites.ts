// Cached procedural sprites: emoji icons, trees, huts, tool huts, ruins and the pet pen.
// Everything is drawn once at 2x world resolution and blitted with drawImage.
import { RNG } from '../../engine/rng';
import { shade } from '../../design/color';
import type { HutStyle, ToolId } from './types';
import { TOOLS } from './tools';

export interface Sprite {
  cv: HTMLCanvasElement;
  /** Anchor offset in world units from the sprite's top-left. */
  ax: number;
  ay: number;
  /** Size in world units. */
  w: number;
  h: number;
}

const SS = 2;

function makeSprite(w: number, h: number, ax: number, ay: number, draw: (g: CanvasRenderingContext2D) => void): Sprite {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * SS);
  cv.height = Math.ceil(h * SS);
  const g = cv.getContext('2d')!;
  g.scale(SS, SS);
  g.translate(ax, ay);
  draw(g);
  return { cv, ax, ay, w, h };
}

export function drawSprite(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1) {
  g.drawImage(s.cv, x - s.ax * scale, y - s.ay * scale, s.w * scale, s.h * scale);
}

// ------------------------------------------------------------------ emoji icons

const icons = new Map<string, HTMLCanvasElement>();
export function iconCanvas(e: string): HTMLCanvasElement {
  let c = icons.get(e);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '50px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillText(e, 32, 36);
    icons.set(e, c);
  }
  return c;
}
/** Draw an emoji centred at (x, y) with the given size (in current units). */
export function drawIcon(g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number) {
  g.drawImage(iconCanvas(e), x - size / 2, y - size / 2, size, size);
}

// ------------------------------------------------------------------ trees

const treeCache = new Map<string, Sprite>();

function canopy(g: CanvasRenderingContext2D, blobs: [number, number, number][], col: string) {
  const ol = shade(col, -0.55);
  g.fillStyle = ol;
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r + 2, 0, Math.PI * 2); g.fill(); }
  for (const [x, y, r] of blobs) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r);
    gr.addColorStop(0, shade(col, 0.28));
    gr.addColorStop(0.7, col);
    gr.addColorStop(1, shade(col, -0.18));
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (const [x, y, r] of blobs.slice(0, 3)) { g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.45, r * 0.35, r * 0.18, -0.4, 0, Math.PI * 2); g.fill(); }
}

function trunk(g: CanvasRenderingContext2D, h: number, w: number, col = '#7a5230') {
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(0, 0, w * 3.2, w * 1.1, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3d2614';
  g.beginPath(); g.moveTo(-w - 1, 1); g.lineTo(-w * 0.6 - 1, -h); g.lineTo(w * 0.6 + 1, -h); g.lineTo(w + 1, 1); g.closePath(); g.fill();
  g.fillStyle = col;
  g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w * 0.6, -h); g.lineTo(w * 0.6, -h); g.lineTo(w, 0); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(-w * 0.5, -h, w * 0.35, h);
}

/** Variants: 0/1 broadleaf, 2 conifer, 3 bush, 4 palm, 10+v fruit tree (v = fruit colour). */
export function treeSprite(v: number): Sprite {
  const key = 't' + v;
  let s = treeCache.get(key);
  if (s) return s;
  const r = new RNG(1000 + v);
  switch (v) {
    case 0:
    case 1: {
      const col = v === 0 ? '#4f9e3e' : '#3c8a4a';
      s = makeSprite(76, 92, 38, 88, (g) => {
        trunk(g, 34, 5);
        const blobs: [number, number, number][] = [[0, -58, 22], [-16, -46, 16], [16, -46, 17], [-8, -70, 15], [10, -68, 14]];
        canopy(g, blobs.map(([x, y, rr]) => [x + r.range(-2, 2), y, rr * (v ? 0.95 : 1)]), col);
      });
      break;
    }
    case 2:
      s = makeSprite(60, 100, 30, 96, (g) => {
        trunk(g, 22, 4.5, '#6b4526');
        const col = '#2f7a4c';
        for (let i = 0; i < 4; i++) {
          const y = -20 - i * 17, wdt = 26 - i * 5;
          g.fillStyle = shade(col, -0.55);
          g.beginPath(); g.moveTo(-wdt - 2, y + 2); g.lineTo(0, y - 30); g.lineTo(wdt + 2, y + 2); g.closePath(); g.fill();
          const gr = g.createLinearGradient(-wdt, 0, wdt, 0);
          gr.addColorStop(0, shade(col, 0.22));
          gr.addColorStop(1, shade(col, -0.2));
          g.fillStyle = gr;
          g.beginPath(); g.moveTo(-wdt, y); g.lineTo(0, y - 28); g.lineTo(wdt, y); g.closePath(); g.fill();
        }
      });
      break;
    case 3:
      s = makeSprite(60, 44, 30, 40, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.beginPath(); g.ellipse(0, 0, 24, 6, 0, 0, Math.PI * 2); g.fill();
        canopy(g, [[0, -14, 14], [-12, -9, 11], [12, -9, 11], [-4, -22, 9]], '#5aa646');
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(r.range(-14, 14), r.range(-22, -6), 1.6, 0, Math.PI * 2); g.fill(); }
      });
      break;
    case 4:
      s = makeSprite(80, 100, 40, 96, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.beginPath(); g.ellipse(4, 0, 16, 5, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#3d2614';
        g.lineWidth = 8;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-4, -40, 8, -70); g.stroke();
        g.strokeStyle = '#9b7447';
        g.lineWidth = 5.5;
        g.stroke();
        g.strokeStyle = 'rgba(60,40,20,0.6)';
        g.lineWidth = 1;
        for (let i = 1; i < 8; i++) { const y = -i * 9; g.beginPath(); g.moveTo(-4 + i * 0.6, y); g.lineTo(3 + i * 0.6, y - 2); g.stroke(); }
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i - 3) * 0.5;
          g.save();
          g.translate(8, -70);
          g.rotate(a);
          const p = new Path2D();
          p.moveTo(0, 0);
          p.quadraticCurveTo(14, -8, 32, 4);
          p.quadraticCurveTo(14, 0, 0, 0);
          g.fillStyle = '#245c2c';
          g.lineWidth = 3;
          g.strokeStyle = '#245c2c';
          g.stroke(p);
          g.fillStyle = i % 2 ? '#4fa046' : '#3d8c3c';
          g.fill(p);
          g.restore();
        }
      });
      break;
    default: {
      // fruit tree
      s = makeSprite(80, 92, 40, 88, (g) => {
        trunk(g, 32, 5.5, '#87592f');
        canopy(g, [[0, -56, 24], [-18, -46, 17], [18, -46, 17], [-8, -68, 16], [11, -67, 15]], '#5fae45');
      });
    }
  }
  treeCache.set(key, s);
  return s;
}

/** Fruit positions relative to a fruit tree's base (12 slots). */
export const FRUIT_SLOTS: [number, number][] = [
  [-14, -44], [8, -40], [20, -50], [-22, -54], [0, -60], [-6, -46], [14, -64], [-14, -68], [24, -40], [-26, -42], [4, -74], [-2, -52],
];
export const FRUIT_COLS = ['#ff4d4d', '#ffa62b', '#b366ff'];

// ------------------------------------------------------------------ huts

const hutCache = new Map<string, Sprite>();
const WALL: Record<HutStyle, string> = { clay: '#c98d5a', wood: '#9c6b3e', hide: '#dcbd8e' };
const ROOF: Record<HutStyle, string> = { clay: '#8ab84c', wood: '#d9b35b', hide: '#a7794d' };

function hutBody(g: CanvasRenderingContext2D, style: HutStyle, color: string, k: number, seed: number) {
  const r = new RNG(seed);
  const W = 46 * k, H = 44 * k, R = 62 * k, apex = 114 * k;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 4 * k, 66 * k, 16 * k, 0, 0, Math.PI * 2); g.fill();
  // wall
  const wall = new Path2D();
  wall.moveTo(-W, -H);
  wall.lineTo(-W, -4 * k);
  wall.ellipse(0, -4 * k, W, 11 * k, 0, Math.PI, 0, true);
  wall.lineTo(W, -H);
  wall.closePath();
  const wc = WALL[style];
  const wg = g.createLinearGradient(-W, 0, W, 0);
  wg.addColorStop(0, shade(wc, 0.18));
  wg.addColorStop(0.55, wc);
  wg.addColorStop(1, shade(wc, -0.3));
  g.lineJoin = 'round';
  g.strokeStyle = '#2b1a0e';
  g.lineWidth = 2.6;
  g.stroke(wall);
  g.fillStyle = wg;
  g.fill(wall);
  g.save();
  g.clip(wall);
  if (style === 'wood') {
    g.strokeStyle = 'rgba(60,35,15,0.45)';
    g.lineWidth = 1.4;
    for (let x = -W + 8 * k; x < W; x += 9 * k) { g.beginPath(); g.moveTo(x, -H); g.lineTo(x, 10 * k); g.stroke(); }
  } else if (style === 'clay') {
    g.fillStyle = 'rgba(120,70,35,0.25)';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(r.range(-W, W), r.range(-H, 0), r.range(3, 7) * k, r.range(2, 4) * k, 0, 0, Math.PI * 2); g.fill(); }
  } else {
    g.strokeStyle = 'rgba(90,60,35,0.5)';
    g.setLineDash([3 * k, 3 * k]);
    g.lineWidth = 1.2;
    for (const x of [-W * 0.45, W * 0.4]) { g.beginPath(); g.moveTo(x, -H); g.lineTo(x + 3 * k, 8 * k); g.stroke(); }
    g.setLineDash([]);
    g.fillStyle = 'rgba(120,80,40,0.3)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(r.range(-W, W), r.range(-H, -4 * k), r.range(2, 5) * k, 0, Math.PI * 2); g.fill(); }
  }
  // painted tribe band
  g.fillStyle = color;
  g.globalAlpha = 0.85;
  g.fillRect(-W, -H * 0.62, W * 2, 5 * k);
  g.globalAlpha = 1;
  g.fillStyle = shade(color, 0.4);
  for (let x = -W + 5 * k; x < W; x += 12 * k) {
    g.beginPath(); g.moveTo(x, -H * 0.62); g.lineTo(x + 4 * k, -H * 0.62 - 4 * k); g.lineTo(x + 8 * k, -H * 0.62); g.fill();
  }
  g.restore();
  // door
  const dw = 13 * k;
  const door = new Path2D();
  door.moveTo(-dw, 7 * k);
  door.lineTo(-dw, -20 * k);
  door.arc(0, -20 * k, dw, Math.PI, 0);
  door.lineTo(dw, 7 * k);
  door.closePath();
  g.strokeStyle = '#2b1a0e';
  g.lineWidth = 3;
  g.stroke(door);
  g.fillStyle = '#2a170b';
  g.fill(door);
  g.fillStyle = 'rgba(255,170,80,0.18)';
  g.beginPath(); g.ellipse(0, 2 * k, dw * 0.7, 6 * k, 0, 0, Math.PI * 2); g.fill();
  if (style === 'hide') {
    g.fillStyle = shade(wc, -0.1);
    g.beginPath(); g.moveTo(-dw, -20 * k); g.quadraticCurveTo(-dw * 0.2, -4 * k, -dw * 0.4, 7 * k); g.lineTo(-dw, 7 * k); g.closePath(); g.fill();
  }
  // roof
  const roof = new Path2D();
  roof.moveTo(-R, -40 * k);
  roof.quadraticCurveTo(-R * 0.62, -apex * 0.84, 0, -apex);
  roof.quadraticCurveTo(R * 0.62, -apex * 0.84, R, -40 * k);
  roof.ellipse(0, -40 * k, R, 15 * k, 0, 0, Math.PI, false);
  roof.closePath();
  const rc = ROOF[style];
  g.strokeStyle = '#2b1a0e';
  g.lineWidth = 2.8;
  g.stroke(roof);
  const rg = g.createLinearGradient(-R, -apex, R, 0);
  rg.addColorStop(0, shade(rc, 0.25));
  rg.addColorStop(0.5, rc);
  rg.addColorStop(1, shade(rc, -0.3));
  g.fillStyle = rg;
  g.fill(roof);
  g.save();
  g.clip(roof);
  // straw strands
  g.lineWidth = 1.2;
  for (let i = 0; i < 70; i++) {
    const x = r.range(-R, R);
    g.strokeStyle = r.chance(0.5) ? shade(rc, -0.35) : shade(rc, 0.3);
    g.globalAlpha = 0.55;
    g.beginPath();
    g.moveTo(x * 0.15, -apex + 6 * k);
    g.lineTo(x * 1.04, -30 * k + Math.abs(x) * -0.05);
    g.stroke();
  }
  g.globalAlpha = 1;
  // scalloped layers
  for (let L = 1; L <= 3; L++) {
    const y = -apex + (apex - 40 * k) * (L / 3.6) + 10 * k;
    const span = R * (0.25 + 0.75 * (L / 3.3));
    g.fillStyle = shade(rc, -0.3);
    g.beginPath();
    for (let x = -span; x <= span; x += 9 * k) {
      g.moveTo(x, y);
      g.arc(x + 4.5 * k, y, 4.5 * k, Math.PI, 0, true);
    }
    g.fill();
  }
  g.restore();
  // fringe
  g.strokeStyle = shade(rc, -0.45);
  g.lineWidth = 1.5;
  for (let a = 0.05; a < Math.PI - 0.05; a += 0.12) {
    const x = Math.cos(a) * R, y = -40 * k + Math.sin(a) * 15 * k;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x * 1.02, y + 5 * k); g.stroke();
  }
  // apex knot
  g.fillStyle = '#5a3a1e';
  g.strokeStyle = '#2b1a0e';
  g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, -apex + 3 * k, 7 * k, 4 * k, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  if (style === 'hide') {
    for (const sgn of [-1, 1]) {
      const p = new Path2D();
      p.moveTo(sgn * 4 * k, -apex + 2 * k);
      p.quadraticCurveTo(sgn * 22 * k, -apex - 4 * k, sgn * 20 * k, -apex - 22 * k);
      p.quadraticCurveTo(sgn * 14 * k, -apex - 8 * k, sgn * 1 * k, -apex - 2 * k);
      p.closePath();
      g.fillStyle = '#efe4c8';
      g.lineWidth = 2;
      g.stroke(p);
      g.fill(p);
    }
  } else if (style === 'clay') {
    for (let i = 0; i < 5; i++) {
      g.save();
      g.translate(0, -apex + 2 * k);
      g.rotate(-Math.PI / 2 + (i - 2) * 0.45);
      g.fillStyle = i % 2 ? '#6fa83c' : '#8ccf52';
      g.beginPath(); g.ellipse(9 * k, 0, 9 * k, 3.4 * k, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
}

/** The main hut of a tribe. Anchor is the base centre. */
export function mainHutSprite(style: HutStyle, color: string): Sprite {
  const key = `m:${style}:${color}`;
  let s = hutCache.get(key);
  if (!s) {
    s = makeSprite(150, 160, 75, 136, (g) => {
      // banner pole behind the roof
      g.strokeStyle = '#2b1a0e';
      g.lineWidth = 4.6;
      g.beginPath(); g.moveTo(26, -60); g.lineTo(30, -132); g.stroke();
      g.strokeStyle = '#8a5a32';
      g.lineWidth = 2.8;
      g.stroke();
      hutBody(g, style, color, 1, 7);
    });
    hutCache.set(key, s);
  }
  return s;
}

/** A smaller tool hut with a sign showing the tool icon. */
export function toolHutSprite(tool: ToolId, style: HutStyle): Sprite {
  const key = `t:${tool}:${style}`;
  let s = hutCache.get(key);
  if (!s) {
    s = makeSprite(96, 104, 48, 88, (g) => {
      hutBody(g, style, '#e9d3a3', 0.62, 31);
      // sign plaque
      g.fillStyle = '#2b1a0e';
      g.beginPath(); g.roundRect(-14, -54, 28, 24, 5); g.fill();
      g.fillStyle = '#c99a5e';
      g.beginPath(); g.roundRect(-12.5, -52.5, 25, 21, 4); g.fill();
      g.drawImage(iconCanvas(TOOLS[tool].icon), -11, -53, 22, 22);
    });
    hutCache.set(key, s);
  }
  return s;
}

export function ruinSprite(): Sprite {
  let s = hutCache.get('ruin');
  if (!s) {
    const r = new RNG(77);
    s = makeSprite(150, 90, 75, 70, (g) => {
      g.fillStyle = 'rgba(30,20,15,0.55)';
      g.beginPath(); g.ellipse(0, 0, 70, 22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(80,70,65,0.8)';
      for (let i = 0; i < 18; i++) { g.beginPath(); g.ellipse(r.range(-50, 50), r.range(-10, 10), r.range(4, 12), r.range(2, 5), 0, 0, Math.PI * 2); g.fill(); }
      g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = r.range(-44, 44), hgt = r.range(14, 44), a = r.range(-0.4, 0.4);
        g.strokeStyle = '#1a120c';
        g.lineWidth = 6;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + Math.sin(a) * hgt, -hgt); g.stroke();
        g.strokeStyle = '#3d2a1c';
        g.lineWidth = 3.5;
        g.stroke();
      }
    });
    hutCache.set('ruin', s);
  }
  return s;
}

/** Pet pen fence, split into a back and a front half for depth sorting. Anchor = pen centre. */
export function penSprite(front: boolean): Sprite {
  const key = front ? 'pen:f' : 'pen:b';
  let s = hutCache.get(key);
  if (s) return s;
  const RX = 92, RY = 48;
  s = makeSprite(200, 130, 100, 80, (g) => {
    if (!front) {
      g.fillStyle = 'rgba(214,190,120,0.55)';
      g.beginPath(); g.ellipse(0, 0, RX - 4, RY - 4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(180,150,80,0.6)';
      const r = new RNG(5);
      for (let i = 0; i < 40; i++) { g.fillRect(r.range(-70, 70), r.range(-30, 30), r.range(4, 9), 1.2); }
    }
    const posts: [number, number][] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const x = Math.cos(a) * RX, y = Math.sin(a) * RY;
      if (front ? y >= -1 : y < 1) posts.push([x, y]);
    }
    posts.sort((a, b) => a[0] - b[0]);
    // rails
    g.lineCap = 'round';
    for (const off of [-14, -6]) {
      g.strokeStyle = '#2b1a0e';
      g.lineWidth = 4.2;
      g.beginPath();
      posts.forEach(([x, y], i) => (i ? g.lineTo(x, y + off) : g.moveTo(x, y + off)));
      g.stroke();
      g.strokeStyle = '#a77a48';
      g.lineWidth = 2.4;
      g.stroke();
    }
    for (const [x, y] of posts) {
      g.fillStyle = '#2b1a0e';
      g.fillRect(x - 3, y - 22, 6, 23);
      g.fillStyle = '#8a5a32';
      g.fillRect(x - 2, y - 21, 4, 21);
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.fillRect(x - 2, y - 21, 1.3, 21);
    }
  });
  hutCache.set(key, s);
  return s;
}
