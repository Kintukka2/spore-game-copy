// Drawing helpers for part artists. All parts share this look: chunky dark outline,
// soft top-lit shading, a small specular highlight. Coordinates are part-local.
import { outlineOf, shade } from './color';
import type { LimbPose, PartDrawCtx } from './types';
import { TAU } from '../engine/math';

export const OUTLINE_W = 2.2;

/** Fill a path with top-lit shading and a dark outline. */
export function fillShaded(g: CanvasRenderingContext2D, path: Path2D, color: string, opts: { ol?: string; lw?: number; y0?: number; y1?: number; flat?: boolean } = {}) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = opts.ol ?? outlineOf(color);
  g.lineWidth = opts.lw ?? OUTLINE_W;
  g.stroke(path);
  if (opts.flat) {
    g.fillStyle = color;
  } else {
    const gr = g.createLinearGradient(0, opts.y0 ?? -12, 0, opts.y1 ?? 12);
    gr.addColorStop(0, shade(color, 0.28));
    gr.addColorStop(0.55, color);
    gr.addColorStop(1, shade(color, -0.25));
    g.fillStyle = gr;
  }
  g.fill(path);
}

export function circlePath(x: number, y: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(x, y, r, 0, TAU);
  return p;
}
export function ellipsePath(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, TAU);
  return p;
}
/** Closed smooth path through points (Catmull-Rom → Bezier). */
export function smoothPath(pts: [number, number][], closed = true): Path2D {
  const p = new Path2D();
  const n = pts.length;
  if (n < 2) return p;
  const get = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  p.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    p.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  if (closed) p.closePath();
  return p;
}
export function polyPath(pts: [number, number][], closed = true): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  if (closed) p.closePath();
  return p;
}

/** Small white specular dot. */
export function gloss(g: CanvasRenderingContext2D, x: number, y: number, r: number, a = 0.55) {
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.6, -0.4, 0, TAU);
  g.fill();
}

/** A cartoon eye: white sclera, coloured iris, pupil looking forward, blinking. */
export function drawEye(g: CanvasRenderingContext2D, r: number, c: PartDrawCtx, opts: { iris?: string; pupil?: 'round' | 'slit' | 'goat'; lid?: string; look?: number } = {}) {
  const blink = blinkAmount(c.t + r * 0.37);
  g.save();
  g.lineWidth = OUTLINE_W;
  g.strokeStyle = '#1a1410';
  g.fillStyle = '#fbfaf5';
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.stroke();
  const look = opts.look ?? 0.35;
  g.fillStyle = opts.iris ?? shade(c.colors.detail, -0.1);
  g.beginPath();
  g.arc(r * look, 0, r * 0.6, 0, TAU);
  g.fill();
  g.fillStyle = '#0d0a08';
  g.beginPath();
  if (opts.pupil === 'slit') g.ellipse(r * look, 0, r * 0.14, r * 0.5, 0, 0, TAU);
  else if (opts.pupil === 'goat') g.ellipse(r * look, 0, r * 0.45, r * 0.16, 0, 0, TAU);
  else g.arc(r * look * 1.1, 0, r * 0.32, 0, TAU);
  g.fill();
  gloss(g, r * (look - 0.15), -r * 0.35, r * 0.2, 0.9);
  if (blink > 0) {
    g.fillStyle = opts.lid ?? c.colors.base;
    g.beginPath();
    g.rect(-r - 1, -r - 1, r * 2 + 2, (r * 2 + 2) * blink);
    g.save();
    g.clip();
    g.beginPath();
    g.arc(0, 0, r + 0.5, 0, TAU);
    g.fill();
    g.restore();
    g.strokeStyle = '#1a1410';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-r * 0.9, -r + r * 2 * blink);
    g.lineTo(r * 0.9, -r + r * 2 * blink);
    g.stroke();
  }
  g.restore();
}

/** 0 (open) .. 1 (closed): a quick blink every few seconds, de-synchronised by seed. */
export function blinkAmount(t: number): number {
  const period = 3.7;
  const p = ((t % period) + period) % period;
  if (p > 0.16) return 0;
  return Math.sin((p / 0.16) * Math.PI);
}

/** Draw a tapered two-segment limb from (0,0) through knee to foot. */
export function drawLimb(g: CanvasRenderingContext2D, pose: LimbPose, w0: number, w1: number, w2: number, color: string) {
  const { knee, foot } = pose;
  const seg = (ax: number, ay: number, bx: number, by: number, wa: number, wb: number) => {
    const dx = bx - ax, dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const p = new Path2D();
    p.moveTo(ax + nx * wa, ay + ny * wa);
    p.lineTo(bx + nx * wb, by + ny * wb);
    p.arc(bx, by, wb, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
    p.lineTo(ax - nx * wa, ay - ny * wa);
    p.arc(ax, ay, wa, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
    p.closePath();
    return p;
  };
  const p1 = seg(0, 0, knee.x, knee.y, w0, w1);
  const p2 = seg(knee.x, knee.y, foot.x, foot.y, w1, w2);
  const ol = outlineOf(color);
  g.lineJoin = 'round';
  g.strokeStyle = ol;
  g.lineWidth = OUTLINE_W;
  g.stroke(p1);
  g.stroke(p2);
  g.fillStyle = color;
  g.fill(p1);
  g.fill(p2);
  // Joint
  g.beginPath();
  g.arc(knee.x, knee.y, w1 * 1.05, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.beginPath();
  g.arc(knee.x - w1 * 0.3, knee.y - w1 * 0.3, w1 * 0.45, 0, TAU);
  g.fill();
}

/** Rows of triangular teeth along a line. */
export function teeth(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, size: number, dir: 1 | -1, color = '#fffaf0') {
  const n = Math.max(2, Math.round(Math.abs(x1 - x0) / (size * 1.1)));
  g.fillStyle = color;
  g.strokeStyle = '#3b2f2a';
  g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n;
    g.beginPath();
    g.moveTo(a, y);
    g.lineTo((a + b) / 2, y + size * dir);
    g.lineTo(b, y);
    g.closePath();
    g.fill();
    g.stroke();
  }
}

export const bone = '#f3ead7';
export const horn = '#e9dcc0';
export const claw = '#2f2723';
export const metal = '#9fb3c8';
export const glass = '#8fe3ff';
