// Draws a ship Design top-down-ish: the side-view design rotated to its heading, with engine glow.
import { layoutDesign, renderDesign, type Layout } from '../../../design/render';
import type { Design } from '../../../design/types';
import { blit, glow } from './sprites';

const layouts = new WeakMap<Design, Layout>();
export function shipLayout(d: Design): Layout {
  let L = layouts.get(d);
  if (!L) { L = layoutDesign(d); layouts.set(d, L); }
  return L;
}

/** Ship length in design units. */
export function shipLength(d: Design): number {
  return Math.max(30, shipLayout(d).width);
}

export interface ShipDrawOpts {
  thrust?: number;
  flash?: number;
  alpha?: number;
  engine?: string;
  /** Pixels below which a cheap silhouette is drawn. */
  lodPx?: number;
  shield?: number;
  frozen?: boolean;
}

export function drawShip(g: CanvasRenderingContext2D, d: Design, x: number, y: number, angle: number, size: number, t: number, o: ShipDrawOpts = {}) {
  const L = shipLayout(d);
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  if (Math.cos(angle) < 0) g.scale(1, -1);
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  // Engine glow behind the hull.
  const thrust = o.thrust ?? 0.3;
  const rear = (L.left - L.cx) * size;
  const eg = glow(o.engine ?? '#7fd8ff', 32);
  g.globalCompositeOperation = 'lighter';
  const fl = 0.85 + Math.sin(t * 40) * 0.15;
  const er = size * (10 + thrust * 18) * fl;
  blit(g, eg, rear - er * 0.3, 0, er);
  if (thrust > 0.2) blit(g, glow('#ffffff', 16), rear, 0, size * (5 + thrust * 6));
  g.globalCompositeOperation = 'source-over';
  if (d.parts.length === 0) bareHullTrim(g, d, L, size, 'back');
  renderDesign(g, d, 0, 0, size, { t, flash: o.flash ? '#ffffff' : undefined, flashAmt: o.flash ?? 0 }, { shadow: false, lodPx: o.lodPx ?? 6 });
  if (d.parts.length === 0) bareHullTrim(g, d, L, size, 'front');
  if (o.frozen) {
    g.globalAlpha = 0.45;
    g.fillStyle = '#9fe3ff';
    g.beginPath();
    g.ellipse(0, 0, L.width * size * 0.6, L.height * size * 0.7, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  if (o.shield && o.shield > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, o.shield) * (0.55 + Math.sin(t * 9) * 0.15);
    blit(g, glow('#5cc8ff', 48, 1.2), x, y, L.width * size * 0.85);
    g.restore();
  }
}

/** Hull-only designs get simple fins, a nozzle and a canopy so they still read as ships. */
function bareHullTrim(g: CanvasRenderingContext2D, d: Design, L: Layout, size: number, layer: 'back' | 'front') {
  const s = size;
  const left = (L.left - L.cx) * s, right = (L.right - L.cx) * s;
  const tail = d.spine[0], head = d.spine[d.spine.length - 1];
  const tr = (tail?.r ?? 10) * s, hr = (head?.r ?? 10) * s;
  const tx = ((tail?.x ?? -20) - L.cx) * s;
  const hx = ((head?.x ?? 20) - L.cx) * s;
  const coat = d.colors.coat, det = d.colors.detail;
  g.lineJoin = 'round';
  g.lineWidth = Math.max(1, 2.2 * s);
  g.strokeStyle = 'rgba(10,14,24,0.9)';
  if (layer === 'back') {
    // Swept fins above and below the tail
    for (const sy of [-1, 1]) {
      g.fillStyle = coat;
      g.beginPath();
      g.moveTo(tx + tr * 0.6, sy * tr * 0.5);
      g.lineTo(tx - tr * 0.9, sy * tr * 1.75);
      g.lineTo(tx - tr * 1.3, sy * tr * 1.6);
      g.lineTo(tx - tr * 0.6, sy * tr * 0.3);
      g.closePath();
      g.fill(); g.stroke();
    }
    // Nozzle
    g.fillStyle = '#4a5160';
    g.beginPath();
    g.moveTo(left + 3 * s, -tr * 0.45);
    g.lineTo(left - 7 * s, -tr * 0.62);
    g.lineTo(left - 7 * s, tr * 0.62);
    g.lineTo(left + 3 * s, tr * 0.45);
    g.closePath();
    g.fill(); g.stroke();
  } else {
    // Canopy
    g.fillStyle = det;
    g.globalAlpha *= 0.95;
    g.beginPath();
    g.ellipse(hx + hr * 0.15, -hr * 0.42, hr * 0.62, hr * 0.38, 0, Math.PI, 0);
    g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(hx + hr * 0.05, -hr * 0.62, hr * 0.2, hr * 0.08, -0.2, 0, Math.PI * 2);
    g.fill();
    void right;
  }
}
