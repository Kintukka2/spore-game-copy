// Offscreen sprite cache: designs (halls, houses, vehicles, holograms) are rendered once with
// renderDesign, and the procedural map art (turrets, derricks, huts, trees, mountains) is drawn here.
import { layoutDesign, renderDesign } from '../../design/render';
import { getPart } from '../../design/registry';
import type { Design } from '../../design/types';
import { outlineOf, rgba, shade } from '../../design/color';
import { TAU } from '../../engine/math';
import type { NationType } from './types';

export interface Sprite {
  c: HTMLCanvasElement;
  /** Anchor (ground contact) in sprite pixels. */
  ax: number;
  ay: number;
  /** Sprite pixels per world unit. */
  q: number;
}

const Q = 3;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  return c;
}

// ---------------------------------------------------------------- body winding probe
// Some core builds draw mechanical bodies with connector quads wound against the floor rectangles,
// which punches holes where they overlap. Detect that once and render a reordered copy instead.
let windingBroken: boolean | null = null;
function probeWinding(): boolean {
  if (windingBroken !== null) return windingBroken;
  try {
    const d: Design = { v: 1, kind: 'vehicle', name: 'probe', spine: [{ x: -20, y: 0, r: 12 }, { x: 20, y: 0, r: 12 }], parts: [], colors: { base: '#00ff00', coat: '#00ff00', detail: '#00ff00', pattern: 'none' } };
    const c = canvas(80, 50);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    renderDesign(g, d, 40, 40, 1, { t: 0 }, { shadow: false });
    const px = g.getImageData(27, 28, 1, 1).data;
    windingBroken = px[3] < 128;
  } catch {
    windingBroken = false;
  }
  return windingBroken;
}

export function renderable(d: Design): Design {
  if ((d.kind !== 'vehicle' && d.kind !== 'building') || !probeWinding()) return d;
  const n = d.spine.length;
  let bad = false;
  for (let i = 1; i < n; i++) if (d.spine[i].x > d.spine[i - 1].x + 0.5) bad = true;
  if (!bad) return d;
  const order = d.spine.map((_, i) => i).sort((a, b) => d.spine[b].x - d.spine[a].x || a - b);
  const remap = new Map(order.map((old, nu) => [old, nu]));
  return { ...d, spine: order.map((i) => d.spine[i]), parts: d.parts.map((p) => ({ ...p, node: remap.get(p.node) ?? p.node })) };
}

// ---------------------------------------------------------------- design sprites
const designCache = new WeakMap<Design, Map<number, Sprite>>();

/** Render a design (plus fallback parts) into g with its ground point at (ax, groundY). Returns the body offset. */
function paintDesign(g: CanvasRenderingContext2D, rd: Design, L: ReturnType<typeof layoutDesign>, fb: Fallback, ax: number, bodyY: number, size: number) {
  const inDesign = (fn: () => void) => {
    g.save();
    g.translate(ax, bodyY);
    g.scale(size, size);
    g.translate(-L.cx, -L.groundY);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    try { fn(); } catch (e) { console.error(e); }
    g.restore();
  };
  inDesign(() => fb.back(g));
  try { renderDesign(g, rd, ax, bodyY, size, { t: 0.3 }, { shadow: false }); } catch (e) { console.error(e); }
  inDesign(() => fb.front(g));
}

/** Sprite for a design scaled so that its height (or length for vehicles) is about `worldSize` units. */
export function designSprite(d: Design, worldSize: number, byWidth = false, medium?: string): Sprite {
  let m = designCache.get(d);
  if (!m) { m = new Map(); designCache.set(d, m); }
  const key = (worldSize * (byWidth ? -1 : 1)) + (medium === 'sea' ? 0.1 : medium === 'air' ? 0.2 : 0);
  const hit = m.get(key);
  if (hit) return hit;
  const rd = renderable(d);
  const L = layoutDesign(rd);
  const fb = fallbackPlan(rd, L, medium);
  const span = Math.max(10, byWidth ? L.width + fb.side * 2 : L.height + fb.above + fb.below);
  const ws = Math.min(1.4, worldSize / span);
  const size = ws * Q;
  const pad = 6;
  const c = canvas((L.width + pad * 2 + fb.side * 2) * size, (L.height + pad * 2 + fb.above + fb.below) * size);
  const g = c.getContext('2d')!;
  const ax = (L.cx - L.left + pad + fb.side) * size;
  const bodyY = (L.groundY - L.top + pad + fb.above) * size;
  paintDesign(g, rd, L, fb, ax, bodyY, size);
  const s: Sprite = { c, ax, ay: bodyY + fb.below * size, q: Q };
  m.set(key, s);
  return s;
}

/** Fit a design (with fallback parts) into a preview canvas, crisp at the device pixel ratio. */
export function drawPreview(cv: HTMLCanvasElement, d: Design, medium?: string) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = cv.clientWidth || 300, ch = cv.clientHeight || 150;
  cv.width = Math.round(cw * dpr);
  cv.height = Math.round(ch * dpr);
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  const rd = renderable(d);
  const L = layoutDesign(rd);
  const fb = fallbackPlan(rd, L, medium);
  const w = L.width + fb.side * 2, hgt = L.height + fb.above + fb.below;
  const size = Math.min((cw - 30) / Math.max(10, w), (ch - 24) / Math.max(10, hgt), 4);
  const ax = cw / 2 + (L.cx - (L.left + L.right) / 2) * size;
  const bodyY = ch / 2 - (hgt / 2) * size + (fb.above + (L.groundY - L.top)) * size;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(cw / 2, bodyY + fb.below * size + 2, Math.min(cw * 0.4, w * size * 0.45), 6, 0, 0, TAU); g.fill();
  paintDesign(g, rd, L, fb, ax, bodyY, size);
}

// ---------------------------------------------------------------- fallback parts
// Part catalogs can be sparse while they are being built, so body-only designs get simple
// wheels / hulls / wings / role tools / roofs drawn here (never stored in the design).
function hasCat(d: Design, cats: string[]): boolean {
  return d.parts.some((pi) => { const p = getPart(pi.partId); return !!p && cats.includes(p.category); });
}

interface Fallback { above: number; below: number; side: number; back: (g: CanvasRenderingContext2D) => void; front: (g: CanvasRenderingContext2D) => void }

function fallbackPlan(d: Design, L: ReturnType<typeof layoutDesign>, medium?: string): Fallback {
  const none: Fallback = { above: 0, below: 0, side: 0, back: () => {}, front: () => {} };
  if (!d.spine.length) return none;
  const c = d.colors;
  const sp = d.spine;
  const bottom = Math.max(...sp.map((n) => n.y + n.r));
  const topN = sp.reduce((a, n) => (n.y - n.r < a.y - a.r ? n : a), sp[0]);
  const front = sp.reduce((a, n) => (n.x > a.x ? n : a), sp[0]);
  const rear = sp.reduce((a, n) => (n.x < a.x ? n : a), sp[0]);
  const avgR = sp.reduce((a, n) => a + n.r, 0) / sp.length;
  if (d.kind === 'vehicle') {
    const med = medium ?? (typeof d.meta?.medium === 'string' ? d.meta.medium : 'land');
    const role = typeof d.meta?.role === 'string' ? d.meta.role : 'military';
    const noLoco = !hasCat(d, ['locomotion']);
    const noTool = !hasCat(d, ['v-weapon', 'v-tool']);
    const f: Fallback = { above: noTool ? 14 : 0, below: 0, side: 0, back: () => {}, front: () => {} };
    const backs: ((g: CanvasRenderingContext2D) => void)[] = [];
    const fronts: ((g: CanvasRenderingContext2D) => void)[] = [];
    if (noLoco && med === 'land') {
      const wr = Math.max(6, avgR * 0.55);
      f.below = wr * 0.85;
      const xs = sp.length >= 3 && L.width > 70 ? [rear.x, (rear.x + front.x) / 2, front.x] : [rear.x + 2, front.x - 2];
      fronts.push((g) => {
        for (const x of xs) {
          const y = bottom + wr * 0.15;
          g.fillStyle = '#26262b'; g.strokeStyle = '#0e0e12'; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, wr, 0, TAU); g.fill(); g.stroke();
          g.fillStyle = '#b9c2cc';
          g.beginPath(); g.arc(x, y, wr * 0.52, 0, TAU); g.fill();
          g.fillStyle = c.coat;
          g.beginPath(); g.arc(x, y, wr * 0.24, 0, TAU); g.fill();
        }
      });
    } else if (noLoco && med === 'sea') {
      const depth = Math.max(9, avgR * 0.75);
      f.below = depth * 0.7;
      f.side = 8;
      fronts.push((g) => {
        const l = L.left - 4, r = L.right + 10, y0 = bottom - avgR * 0.35;
        const p = new Path2D();
        p.moveTo(l, y0); p.lineTo(r, y0 - 4); p.quadraticCurveTo(r - 6, y0 + depth * 0.7, r - 16, y0 + depth); p.lineTo(l + 8, y0 + depth); p.quadraticCurveTo(l, y0 + depth * 0.6, l, y0); p.closePath();
        shaded(g, p, c.coat, y0, y0 + depth, 2.2);
        g.fillStyle = c.detail;
        g.fillRect(l + 4, y0 + depth * 0.35, r - l - 18, 2.5);
      });
    } else if (noLoco && med === 'air') {
      f.side = 6;
      f.above += 6;
      const mid = sp[Math.floor(sp.length / 2)];
      backs.push((g) => {
        const p = new Path2D();
        p.moveTo(mid.x + 10, mid.y - 2); p.lineTo(mid.x - 26, mid.y - mid.r - 12); p.lineTo(mid.x - 34, mid.y - mid.r - 10); p.lineTo(mid.x - 10, mid.y + 2); p.closePath();
        shaded(g, p, shade(c.detail, -0.25), mid.y - mid.r - 12, mid.y, 2);
        const fin = new Path2D();
        fin.moveTo(rear.x + 4, rear.y - rear.r * 0.5); fin.lineTo(rear.x - rear.r - 2, rear.y - rear.r - 16); fin.lineTo(rear.x - rear.r + 8, rear.y - rear.r * 0.6); fin.closePath();
        shaded(g, fin, c.coat, rear.y - rear.r - 16, rear.y, 2);
      });
      fronts.push((g) => {
        const p = new Path2D();
        p.moveTo(mid.x + 12, mid.y + 2); p.lineTo(mid.x - 20, mid.y + mid.r * 0.6 + 8); p.lineTo(mid.x - 30, mid.y + mid.r * 0.6 + 7); p.lineTo(mid.x - 8, mid.y - 2); p.closePath();
        shaded(g, p, c.detail, mid.y, mid.y + mid.r + 8, 2);
        g.fillStyle = 'rgba(220,230,240,0.55)';
        g.beginPath(); g.ellipse(front.x + front.r * 1.2, front.y, 2.5, front.r * 0.95, 0, 0, TAU); g.fill();
      });
    }
    if (noTool) {
      const ty = topN.y - topN.r;
      const hx = front.x - front.r * 0.2;
      fronts.push((g) => {
        if (role === 'military') {
          g.strokeStyle = '#2f3440'; g.lineWidth = 4;
          g.beginPath(); g.moveTo(hx, ty - 4); g.lineTo(hx + 20, ty - 7); g.stroke();
          const dome = new Path2D(); dome.arc(hx - 2, ty, 7.5, Math.PI, 0); dome.closePath();
          shaded(g, dome, shade(c.coat, -0.1), ty - 8, ty, 1.8);
        } else if (role === 'religious') {
          g.strokeStyle = '#8a7340'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(hx - 2, ty); g.lineTo(hx - 2, ty - 8); g.stroke();
          g.fillStyle = 'rgba(255,240,170,0.35)';
          g.beginPath(); g.arc(hx - 2, ty - 12, 8, 0, TAU); g.fill();
          const orb = new Path2D(); orb.arc(hx - 2, ty - 12, 4.5, 0, TAU);
          shaded(g, orb, '#ffe58a', ty - 16, ty - 8, 1.2);
          g.strokeStyle = '#ffd166'; g.lineWidth = 1.6;
          g.beginPath(); g.ellipse(hx - 2, ty - 19, 6, 2, 0, 0, TAU); g.stroke();
        } else {
          const bx = (rear.x + front.x) / 2 - 8;
          const box = new Path2D(); box.rect(bx, ty - 11, 16, 11);
          shaded(g, box, '#c08552', ty - 11, ty, 1.6);
          g.strokeStyle = '#6d4c30'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(bx, ty - 5.5); g.lineTo(bx + 16, ty - 5.5); g.moveTo(bx + 8, ty - 11); g.lineTo(bx + 8, ty); g.stroke();
          g.fillStyle = '#ffd166';
          g.beginPath(); g.arc(bx + 22, ty - 6, 3.5, 0, TAU); g.fill();
        }
      });
    }
    f.back = (g) => backs.forEach((fn) => fn(g));
    f.front = (g) => fronts.forEach((fn) => fn(g));
    return f;
  }
  if (d.kind === 'building') {
    const noRoof = !hasCat(d, ['roof']);
    const noDoor = !hasCat(d, ['door']);
    const btype = typeof d.meta?.btype === 'string' ? d.meta.btype : 'house';
    const f: Fallback = { above: 0, below: 0, side: 0, back: () => {}, front: () => {} };
    const base = sp.reduce((a, n) => (n.y + n.r > a.y + a.r ? n : a), sp[0]);
    const tw = topN.r * 2.6, tx = topN.x, ty = topN.y - topN.r;
    if (noRoof) f.above = topN.r * (btype === 'cityhall' ? 1.9 : 1.1);
    f.front = (g) => {
      if (noRoof) {
        if (btype === 'cityhall') {
          const dome = new Path2D(); dome.ellipse(tx, ty + 1, tw * 0.36, topN.r * 0.9, 0, Math.PI, 0); dome.closePath();
          shaded(g, dome, c.coat, ty - topN.r, ty, 2);
          g.strokeStyle = '#4a4040'; g.lineWidth = 1.6;
          g.beginPath(); g.moveTo(tx, ty - topN.r * 0.85); g.lineTo(tx, ty - topN.r * 1.85); g.stroke();
          g.fillStyle = c.detail;
          g.beginPath(); g.moveTo(tx + 0.5, ty - topN.r * 1.85); g.lineTo(tx + 9, ty - topN.r * 1.65); g.lineTo(tx + 0.5, ty - topN.r * 1.45); g.closePath(); g.fill();
        } else if (btype === 'factory') {
          const roof = new Path2D(); roof.rect(tx - tw / 2 - 1, ty - 3, tw + 2, 4);
          shaded(g, roof, shade(c.coat, -0.1), ty - 3, ty + 1, 1.5);
          for (const k of [-0.28, 0.18]) {
            const st = new Path2D(); st.rect(tx + tw * k - 3, ty - topN.r * 1.05, 6, topN.r * 1.05);
            shaded(g, st, '#7a6a64', ty - topN.r, ty, 1.5);
          }
        } else if (btype === 'entertainment') {
          const dome = new Path2D(); dome.ellipse(tx, ty + 1, tw * 0.5, topN.r * 0.95, 0, Math.PI, 0); dome.closePath();
          shaded(g, dome, c.detail, ty - topN.r, ty, 2);
          g.save(); g.clip(dome);
          g.fillStyle = c.coat;
          for (let k = -4; k <= 4; k += 2) g.fillRect(tx + k * tw * 0.07, ty - topN.r, tw * 0.07, topN.r + 2);
          g.restore();
        } else {
          const roof = new Path2D(); roof.moveTo(tx - tw * 0.6, ty + 1); roof.lineTo(tx, ty - topN.r * 1.05); roof.lineTo(tx + tw * 0.6, ty + 1); roof.closePath();
          shaded(g, roof, c.coat, ty - topN.r, ty, 2);
        }
      }
      if (noDoor) {
        const dw = Math.max(6, base.r * 0.55), dh = Math.max(9, base.r * 0.85);
        const by = base.y + base.r;
        const door = new Path2D(); door.moveTo(base.x - dw / 2, by); door.lineTo(base.x - dw / 2, by - dh + dw / 2); door.arc(base.x, by - dh + dw / 2, dw / 2, Math.PI, 0); door.lineTo(base.x + dw / 2, by); door.closePath();
        shaded(g, door, '#6d4c41', by - dh, by, 1.6);
      }
    };
    return f;
  }
  if (d.kind === 'ship') {
    const noEngine = !hasCat(d, ['s-engine']);
    const noWing = !hasCat(d, ['s-wing']);
    const noCockpit = !hasCat(d, ['cockpit']);
    const f: Fallback = { above: noWing ? 12 : 0, below: noWing ? 12 : 0, side: noEngine ? 14 : 0, back: () => {}, front: () => {} };
    const mid = sp[Math.floor(sp.length / 2)];
    const rx = rear.x - rear.r * 1.45;
    f.back = (g) => {
      if (noWing) {
        const p = new Path2D();
        p.moveTo(mid.x + mid.r * 0.6, mid.y - mid.r * 0.6); p.lineTo(rear.x - rear.r * 0.8, mid.y - mid.r - 12); p.lineTo(rear.x - rear.r * 1.3, mid.y - mid.r - 10); p.lineTo(rear.x, mid.y - mid.r * 0.3); p.closePath();
        shaded(g, p, shade(c.coat, -0.2), mid.y - mid.r - 12, mid.y, 2);
      }
      if (noEngine) {
        const n = new Path2D();
        n.moveTo(rx + 4, rear.y - rear.r * 0.6); n.lineTo(rx - 12, rear.y - rear.r * 0.8); n.lineTo(rx - 12, rear.y + rear.r * 0.8); n.lineTo(rx + 4, rear.y + rear.r * 0.6); n.closePath();
        shaded(g, n, '#6c7686', rear.y - rear.r, rear.y + rear.r, 2);
        g.fillStyle = 'rgba(120,230,255,0.85)';
        g.beginPath(); g.ellipse(rx - 12, rear.y, 3, rear.r * 0.7, 0, 0, TAU); g.fill();
      }
    };
    f.front = (g) => {
      if (noWing) {
        const p = new Path2D();
        p.moveTo(mid.x + mid.r * 0.6, mid.y + mid.r * 0.6); p.lineTo(rear.x - rear.r * 0.8, mid.y + mid.r + 12); p.lineTo(rear.x - rear.r * 1.3, mid.y + mid.r + 10); p.lineTo(rear.x, mid.y + mid.r * 0.3); p.closePath();
        shaded(g, p, c.coat, mid.y, mid.y + mid.r + 12, 2);
        g.fillStyle = c.detail;
        g.fillRect(rear.x - rear.r * 0.4, mid.y + mid.r * 0.75, 8, 2.5);
      }
      if (noCockpit) {
        const cp = new Path2D(); cp.ellipse(front.x + front.r * 0.55, front.y - front.r * 0.45, front.r * 0.75, front.r * 0.42, -0.15, 0, TAU);
        shaded(g, cp, '#8fe3ff', front.y - front.r, front.y, 1.8);
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.beginPath(); g.ellipse(front.x + front.r * 0.4, front.y - front.r * 0.62, front.r * 0.25, front.r * 0.1, -0.2, 0, TAU); g.fill();
      }
    };
    return f;
  }
  return none;
}

/** A translucent cyan hologram of a species (religious conversion). */
const holoCache = new WeakMap<Design, Sprite>();
export function hologramSprite(d: Design): Sprite {
  const hit = holoCache.get(d);
  if (hit) return hit;
  const base = designSprite(d, 70);
  const c = canvas(base.c.width, base.c.height);
  const g = c.getContext('2d')!;
  g.drawImage(base.c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, 0, 0, c.height);
  gr.addColorStop(0, 'rgba(150,255,255,0.85)');
  gr.addColorStop(1, 'rgba(60,170,255,0.75)');
  g.fillStyle = gr;
  g.fillRect(0, 0, c.width, c.height);
  // Scanlines
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let y = 0; y < c.height; y += 6) g.fillRect(0, y, c.width, 2);
  const s: Sprite = { c, ax: base.ax, ay: base.ay, q: base.q };
  holoCache.set(d, s);
  return s;
}

export function drawSprite(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1, facing = 1) {
  const k = scale / s.q;
  if (facing < 0) {
    g.save();
    g.translate(x, y);
    g.scale(-1, 1);
    g.drawImage(s.c, -s.ax * k, -s.ay * k, s.c.width * k, s.c.height * k);
    g.restore();
  } else {
    g.drawImage(s.c, x - s.ax * k, y - s.ay * k, s.c.width * k, s.c.height * k);
  }
}

// ---------------------------------------------------------------- procedural art
const procCache = new Map<string, Sprite>();
function proc(key: string, w: number, h: number, ax: number, ay: number, draw: (g: CanvasRenderingContext2D) => void): Sprite {
  const hit = procCache.get(key);
  if (hit) return hit;
  const c = canvas(w * Q, h * Q);
  const g = c.getContext('2d')!;
  g.scale(Q, Q);
  g.translate(ax, ay);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g);
  const s: Sprite = { c, ax: ax * Q, ay: ay * Q, q: Q };
  procCache.set(key, s);
  return s;
}

function shaded(g: CanvasRenderingContext2D, path: Path2D, color: string, y0: number, y1: number, lw = 1.6) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, shade(color, 0.3));
  gr.addColorStop(0.6, color);
  gr.addColorStop(1, shade(color, -0.3));
  g.fillStyle = gr;
  g.fill(path);
  g.strokeStyle = outlineOf(color);
  g.lineWidth = lw;
  g.stroke(path);
}

export function turretSprite(type: NationType, color: string): Sprite {
  return proc(`tur:${type}:${color}`, 34, 40, 17, 34, (g) => {
    const base = new Path2D();
    base.moveTo(-9, 0); base.lineTo(-7, -14); base.lineTo(7, -14); base.lineTo(9, 0); base.closePath();
    shaded(g, base, '#b9b3a6', -14, 0);
    const band = new Path2D();
    band.rect(-8, -9, 16, 3);
    g.fillStyle = color; g.fill(band);
    if (type === 'military') {
      const head = new Path2D(); head.ellipse(0, -17, 8, 5.5, 0, 0, TAU);
      shaded(g, head, shade(color, -0.1), -22, -12);
      g.strokeStyle = '#3a3f48'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(3, -18.5); g.lineTo(15, -23); g.moveTo(3, -15.5); g.lineTo(15, -20); g.stroke();
    } else if (type === 'religious') {
      g.strokeStyle = '#6a5a3a'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(0, -14); g.lineTo(0, -24); g.moveTo(-6, -14); g.lineTo(-8, -22); g.moveTo(6, -14); g.lineTo(8, -22); g.stroke();
      const orb = new Path2D(); orb.arc(0, -27, 4.5, 0, TAU);
      g.fillStyle = 'rgba(255,240,170,0.35)'; g.beginPath(); g.arc(0, -27, 8, 0, TAU); g.fill();
      shaded(g, orb, '#ffe58a', -31, -23, 1.2);
    } else {
      const dome = new Path2D(); dome.arc(0, -14, 8, Math.PI, 0); dome.closePath();
      shaded(g, dome, shade(color, 0.1), -22, -14);
      g.strokeStyle = '#4a5260'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(4, -19); g.lineTo(13, -24); g.stroke();
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(-2, -18, 1.6, 0, TAU); g.fill();
    }
  });
}

export function rubbleSprite(): Sprite {
  return proc('rubble', 30, 14, 15, 10, (g) => {
    const cols = ['#7b746a', '#958d80', '#5d5850', '#a9a092'];
    for (let i = 0; i < 9; i++) {
      const x = -11 + ((i * 37) % 22), y = -1 - ((i * 13) % 5);
      const p = new Path2D(); p.rect(x - 2.5, y - 2.5, 5, 4);
      g.fillStyle = cols[i % 4]; g.fill(p); g.strokeStyle = '#3d3934'; g.lineWidth = 0.8; g.stroke(p);
    }
  });
}

export function derrickSprite(color: string): Sprite {
  return proc(`der:${color}`, 34, 50, 17, 44, (g) => {
    const plat = new Path2D(); plat.ellipse(0, 0, 13, 4.5, 0, 0, TAU);
    shaded(g, plat, '#8c8378', -4, 4, 1.2);
    g.strokeStyle = '#3c3a40'; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-9, -1); g.lineTo(-2, -36); g.lineTo(2, -36); g.lineTo(9, -1);
    for (let k = 0; k < 4; k++) { const y = -4 - k * 8; const w = 8 - k * 1.6; g.moveTo(-w, y); g.lineTo(w, y - 8); g.moveTo(w, y); g.lineTo(-w, y - 8); }
    g.stroke();
    const tank = new Path2D(); tank.roundRect(-12, -10, 9, 9, 2);
    shaded(g, tank, color, -10, -1, 1.2);
    const cap = new Path2D(); cap.moveTo(-4, -36); cap.lineTo(4, -36); cap.lineTo(0, -41); cap.closePath();
    shaded(g, cap, color, -41, -36, 1.2);
    g.fillStyle = color; g.beginPath(); g.moveTo(1, -41); g.lineTo(1, -48); g.lineTo(9, -45.5); g.lineTo(1, -43); g.fill();
  });
}

export function hutSprite(color: string): Sprite {
  return proc(`hut:${color}`, 30, 30, 15, 26, (g) => {
    const wall = new Path2D(); wall.rect(-8, -9, 16, 9);
    shaded(g, wall, '#b08a5a', -9, 0, 1.2);
    const roof = new Path2D(); roof.moveTo(-11, -8); roof.lineTo(0, -22); roof.lineTo(11, -8); roof.closePath();
    shaded(g, roof, '#c9a061', -22, -8, 1.2);
    g.fillStyle = '#3a2a1a'; g.fillRect(-2.5, -6, 5, 6);
    g.fillStyle = color; g.beginPath(); g.moveTo(0, -22); g.lineTo(0, -27); g.lineTo(6, -25); g.closePath(); g.fill();
  });
}

const TREE_COLS = ['#4f9a4a', '#5aa652', '#3f8a46', '#6aae4e'];
export function treeSprite(v: number): Sprite {
  return proc(`tree:${v}`, 40, 40, 20, 34, (g) => {
    const conifer = v === 3;
    const pts = v === 0 ? [[-8, 0], [6, -2], [-1, 4]] : v === 1 ? [[-6, 2], [7, 0]] : v === 2 ? [[0, 0], [-10, 3], [9, 4]] : [[-6, 2], [6, 0], [0, 5]];
    for (const [x, y] of pts.sort((a, b) => a[1] - b[1])) {
      const col = TREE_COLS[(v + x + 40) % 4];
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath(); g.ellipse(x + 2, y + 1, 7, 2.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#6b4a2e'; g.fillRect(x - 1.2, y - 6, 2.4, 6);
      if (conifer) {
        const p = new Path2D(); p.moveTo(x - 7, y - 4); p.lineTo(x, y - 24); p.lineTo(x + 7, y - 4); p.closePath();
        shaded(g, p, '#3d8250', y - 24, y - 4, 1.3);
      } else {
        const p = new Path2D(); p.arc(x, y - 12, 7.5, 0, TAU);
        shaded(g, p, col, y - 20, y - 4, 1.3);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.arc(x - 2.5, y - 15, 2.6, 0, TAU); g.fill();
      }
    }
  });
}

export function mountainSprite(v: number, snow: boolean): Sprite {
  return proc(`mtn:${v}:${snow}`, 90, 64, 45, 56, (g) => {
    const peaks = v === 0 ? [[-14, 30, 34], [10, 40, 30]] : v === 1 ? [[0, 44, 38]] : [[-18, 28, 26], [4, 46, 32], [22, 30, 22]];
    for (const [x, hgt, wd] of peaks) {
      const p = new Path2D(); p.moveTo(x - wd, 0); p.lineTo(x - wd * 0.15, -hgt); p.lineTo(x + wd * 0.1, -hgt * 0.96); p.lineTo(x + wd, 0); p.closePath();
      g.fillStyle = '#9b8f7f'; g.fill(p);
      // Shadow side
      const s = new Path2D(); s.moveTo(x - wd * 0.15, -hgt); s.lineTo(x + wd * 0.1, -hgt * 0.96); s.lineTo(x + wd, 0); s.lineTo(x + wd * 0.1, 0); s.closePath();
      g.fillStyle = '#7d7264'; g.fill(s);
      if (snow) {
        const c = new Path2D(); c.moveTo(x - wd * 0.15 - wd * 0.3, -hgt * 0.66); c.lineTo(x - wd * 0.15, -hgt); c.lineTo(x + wd * 0.1, -hgt * 0.96); c.lineTo(x + wd * 0.38, -hgt * 0.62); c.lineTo(x + wd * 0.05, -hgt * 0.7); c.lineTo(x - wd * 0.12, -hgt * 0.6); c.closePath();
        g.fillStyle = '#f6f7f4'; g.fill(c);
      }
      g.strokeStyle = '#4e463d'; g.lineWidth = 1.4; g.stroke(p);
    }
  });
}

/** Small nation pennant drawn above units. */
export function flagSprite(color: string): Sprite {
  return proc(`flag:${color}`, 14, 18, 2, 16, (g) => {
    g.strokeStyle = '#2b2b30'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -15); g.stroke();
    const p = new Path2D(); p.moveTo(0.6, -15); p.lineTo(10, -12); p.lineTo(0.6, -9); p.closePath();
    g.fillStyle = color; g.fill(p);
    g.strokeStyle = outlineOf(color); g.lineWidth = 0.8; g.stroke(p);
  });
}

/** Role badge: halo (religious), coin (economic), chevrons (military). */
export function emblemSprite(role: NationType): Sprite {
  return proc(`emb:${role}`, 14, 14, 7, 7, (g) => {
    g.fillStyle = 'rgba(10,20,30,0.75)';
    g.beginPath(); g.arc(0, 0, 6.2, 0, TAU); g.fill();
    if (role === 'religious') {
      g.strokeStyle = '#ffe58a'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(0, -1.5, 3.6, 1.5, 0, 0, TAU); g.stroke();
      g.fillStyle = '#fff6c9'; g.beginPath(); g.arc(0, 1.8, 1.8, 0, TAU); g.fill();
    } else if (role === 'economic') {
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(0, 0, 4.2, 0, TAU); g.fill();
      g.fillStyle = '#7a5200'; g.font = 'bold 6px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('§', 0, 0.4);
    } else {
      g.strokeStyle = '#ff8a7a'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-3.5, -0.5); g.lineTo(0, -3.5); g.lineTo(3.5, -0.5); g.moveTo(-3.5, 2.8); g.lineTo(0, -0.2); g.lineTo(3.5, 2.8); g.stroke();
    }
  });
}

/** Soft round puff used by smoke, spice and glow particles. */
let puff: HTMLCanvasElement | null = null;
export function puffSprite(): HTMLCanvasElement {
  if (puff) return puff;
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  puff = c;
  return c;
}

/** Tinted puff (cached per colour). */
const tinted = new Map<string, HTMLCanvasElement>();
export function puffTint(color: string): HTMLCanvasElement {
  const hit = tinted.get(color);
  if (hit) return hit;
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  g.drawImage(puffSprite(), 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  tinted.set(color, c);
  return c;
}

export function cloudSprite(seed: number): HTMLCanvasElement {
  const key = 'cloud' + seed;
  const hit = tinted.get(key);
  if (hit) return hit;
  const c = canvas(260, 140);
  const g = c.getContext('2d')!;
  const p = puffSprite();
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 9; i++) {
    const r = 30 + rnd() * 34;
    g.globalAlpha = 0.6;
    g.drawImage(p, 130 + (rnd() - 0.5) * 150 - r, 70 + (rnd() - 0.5) * 50 - r, r * 2, r * 2);
  }
  tinted.set(key, c);
  return c;
}

export { rgba };
