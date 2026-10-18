// Extended creature catalogue: mouths, eyes, limbs, weapons, details, wings and tails across four tiers.
// House style (see creature-core.ts): chunky dark outlines, top-lit fills, gloss dots, palette colours
// plus natural materials. Local space: anchor at (0,0), +x forward (toward the head), +y down.
//
// Stat budget: tier 1 ≈ 2, tier 2 ≈ 4–5, tier 3 ≈ 7, tier 4 ≈ 9–10 (sight/grasp are utility and not counted).
// No stat above 5; every creature ability reaches 5 on at least one tier-3/4 part.
// Costs: eyes 10; tier 1 = 25, tier 2 = 75, tier 3 = 150, tier 4 = 250; legs and wings +25.
import { registerParts } from '../registry';
import { mix, outlineOf, rgba, shade } from '../color';
import { blinkAmount, bone, circlePath, claw, drawEye, drawLimb, ellipsePath, fillShaded, gloss, horn, OUTLINE_W, polyPath, smoothPath } from '../partkit';
import type { LimbPose, PartDef, PartDrawCtx } from '../types';
import { TAU } from '../../engine/math';

export type Pt = [number, number];
type G = CanvasRenderingContext2D;
/** Drawn bounds at rest in local units: [x0, y0, x1, y1]. */
export type PartBox = [number, number, number, number];

/**
 * Editor palette tiles centre a part on its anchor, which leaves one-sided parts (tails, wings,
 * mouths) off-centre and small. With a measured `box`, thumbnails are re-centred and fitted.
 */
export function fitThumb(def: PartDef, box?: PartBox): PartDef {
  if (!box) return def;
  const draw = def.draw;
  const bw = box[2] - box[0], bh = box[3] - box[1];
  const k = Math.min(1.7, ((2 * def.radius) / Math.max(bw * 0.84, bh, 1)) * 0.92);
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  def.draw = (g, c) => {
    if (!c.thumb) return draw(g, c);
    g.save();
    g.scale(k, k);
    g.translate(-cx, -cy);
    draw(g, c);
    g.restore();
  };
  return def;
}

const P = (d: Omit<PartDef, 'kind'> & { box?: PartBox }): PartDef => {
  const { box, ...rest } = d;
  return fitThumb({ kind: 'creature', ...rest }, box);
};

const INK = '#1a1410';
const MOUTH = '#3d1416';
const TONGUE = '#e8697f';
const TOOTH_OL = '#3b2f2a';

/** Fixed (non-palette) materials darken on the far side, like palette colours do. */
const farC = (c: PartDrawCtx, col: string) => (c.far ? shade(col, -0.32) : col);
const angTo = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);

/** Stroke an open path as a chunky outlined tube. Two path ops. */
export function tube(g: G, p: Path2D, w: number, color: string) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = outlineOf(color);
  g.lineWidth = w + OUTLINE_W * 2;
  g.stroke(p);
  g.strokeStyle = color;
  g.lineWidth = w;
  g.stroke(p);
}

/** Closed tapered outline around a centreline (width w0 → w1), with a rounded tip. */
export function taper(pts: Pt[], w0: number, w1: number): Path2D {
  const n = pts.length;
  const L: Pt[] = [], R: Pt[] = [];
  let dx = 1, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    dx = b[0] - a[0];
    dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    L.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w]);
    R.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w]);
  }
  const l = Math.hypot(dx, dy) || 1, e = pts[n - 1];
  const tip: Pt = [e[0] + (dx / l) * w1 * 0.55, e[1] + (dy / l) * w1 * 0.55];
  return smoothPath([...L, tip, ...R.reverse()]);
}

/** Open polyline as a Path2D (for tubes and strokes). */
export function line(pts: Pt[], smooth = true): Path2D {
  return smooth ? smoothPath(pts, false) : polyPath(pts, false);
}

/** Union several shapes into one silhouette (fillShaded on the result gives one clean outline). */
export function merge(...ps: Path2D[]): Path2D {
  const p = new Path2D();
  for (const q of ps) p.addPath(q);
  return p;
}

/** Rotate + translate a point list. */
export function xf(pts: Pt[], a: number, ox = 0, oy = 0, s = 1): Pt[] {
  const c = Math.cos(a), sn = Math.sin(a);
  return pts.map(([x, y]) => [ox + (x * c - y * sn) * s, oy + (x * sn + y * c) * s] as Pt);
}

/** One row of triangular teeth in a single path (2 ops, unlike partkit.teeth). */
export function toothRow(g: G, x0: number, x1: number, y: number, size: number, dir: 1 | -1, color = bone) {
  const n = Math.max(2, Math.round(Math.abs(x1 - x0) / (size * 1.1)));
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n;
    p.moveTo(a, y);
    p.lineTo((a + b) / 2, y + size * dir);
    p.lineTo(b, y);
    p.closePath();
  }
  g.fillStyle = color;
  g.fill(p);
  g.strokeStyle = TOOTH_OL;
  g.lineWidth = 1;
  g.stroke(p);
}

/** Many dots in one fill. */
export function dots(g: G, pts: Pt[], r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  for (const [x, y] of pts) {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, TAU);
  }
  g.fill();
}

/** Thin detail strokes (veins, ribs, wrinkles) in one op. */
export function strokes(g: G, segs: Pt[][], color: string, w = 1) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  for (const s of segs) s.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

/** Glow halo (radial gradient), cheap enough for a couple per part. */
export function glow(g: G, x: number, y: number, r: number, color: string, a: number) {
  const gr = g.createRadialGradient(x, y, r * 0.15, x, y, r);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** Tail frame: mirror so +x points backward (away from the body), then raise by `lift` radians. */
function tailFrame(g: G, lift: number) {
  g.scale(-1, 1);
  g.rotate(-lift);
}

const pose = (c: PartDrawCtx, knee: { x: number; y: number }): LimbPose => ({ knee, foot: c.limb!.foot, plant: c.limb!.plant });

// ======================================================================= MOUTHS
const MOUTHS: PartDef[] = [
  // ---------------------------------------------------------- herbivore
  P({
    id: 'm-pucker', name: 'Pouty Pucker', category: 'mouth', tier: 1, cost: 25, diet: 'herbivore', snap: 'head-front', layer: 'front', radius: 16, box: [-8, -10, 18, 9],
    stats: { bite: 1, sing: 1 }, desc: 'Kissy fish lips. Slurps soft fruit, blows bubbly ballads.',
    draw(g, c) {
      const o = c.act * 3.5;
      const lip = mix(c.colors.base, '#ff6f91', 0.55);
      fillShaded(g, smoothPath([[-5, -7], [5, -6], [9, -1], [6, 6], [-5, 6]]), shade(c.colors.base, 0.06), { y0: -7, y1: 6 });
      g.fillStyle = MOUTH;
      g.beginPath(); g.ellipse(13.5, 0.6 + o * 0.1, 2.4, 1.3 + o * 0.6, 0, 0, TAU); g.fill();
      fillShaded(g, ellipsePath(10.5, 3.3 + o * 0.6, 4.6, 2.7, 0.25), shade(lip, -0.1), { y0: 0, y1: 6 });
      fillShaded(g, ellipsePath(11, -1.9 - o * 0.4, 5.2, 3, -0.2), lip, { y0: -5, y1: 1 });
      gloss(g, 11.5, -3 - o * 0.4, 1.8, 0.75);
    },
  }),
  P({
    id: 'm-seedcracker', name: 'Seed Cracker', category: 'mouth', tier: 2, cost: 75, diet: 'herbivore', snap: 'head-front', layer: 'front', radius: 18, box: [-9, -13, 21, 10],
    stats: { bite: 2, sing: 2 }, desc: 'A hooked parrot beak. Nuts don’t stand a chance.',
    draw(g, c) {
      const o = c.act * 0.4;
      const bk = mix('#f5b03c', c.colors.detail, 0.15);
      g.save(); g.translate(-2, 2); g.rotate(o);
      fillShaded(g, smoothPath([[0, -1], [10, 0], [14, 2], [10, 6], [0, 5]]), shade(bk, -0.18), { y0: -1, y1: 6 });
      g.restore();
      fillShaded(g, smoothPath([[-5, -9], [6, -10.5], [14, -7.5], [19, -1], [18.5, 5], [15.5, 2], [9, 0], [-5, 2]]), bk, { y0: -10, y1: 5 });
      g.fillStyle = shade(bk, -0.6);
      g.beginPath(); g.arc(4, -6, 1.2, 0, TAU); g.fill();
      strokes(g, [[[9, -9], [12.5, -3], [12, 1]]], shade(bk, -0.3), 1);
      gloss(g, 8, -7.2, 2.4, 0.55);
    },
  }),
  P({
    id: 'm-snoot', name: 'Snoot Tooter', category: 'mouth', tier: 3, cost: 150, diet: 'herbivore', snap: 'head-front', layer: 'front', radius: 23, box: [-7, -10, 21, 22],
    stats: { sing: 5, bite: 2 }, desc: 'A curly trunk that honks the sweetest songs in the valley.',
    draw(g, c) {
      const up = c.action === 'sing' ? Math.min(1, c.act * 1.6) : c.act * 0.4;
      const sway = Math.sin(c.t * 1.7) * 0.08;
      const turns = [0.35, 0.32, 0.18, -0.35, -0.55];
      const pts: Pt[] = [[-3, -3]];
      let x = -3, y = -3, a = 0.3 + sway - up * 1.25;
      for (let i = 0; i < 5; i++) {
        x += Math.cos(a) * 5.2; y += Math.sin(a) * 5.2;
        pts.push([x, y]);
        a += turns[i] * (1 - up * 1.4);
      }
      fillShaded(g, smoothPath([[-4, 3], [6, 4], [8, 7], [2, 9], [-4, 8]]), shade(c.colors.base, -0.08), { y0: 3, y1: 9 });
      fillShaded(g, taper(pts, 9, 4.5), c.colors.base, { y0: -8, y1: 22 });
      const e = pts[5], d = pts[4];
      const ta = Math.atan2(e[1] - d[1], e[0] - d[0]);
      const bell = 1 + up * 0.5;
      g.save(); g.translate(e[0], e[1]); g.rotate(ta);
      fillShaded(g, ellipsePath(1.5, 0, 2.2, 3.6 * bell), mix(c.colors.detail, '#ffb3c6', 0.3), { y0: -4, y1: 4 });
      g.fillStyle = MOUTH; g.beginPath(); g.ellipse(2.4, 0, 1, 2 * bell, 0, 0, TAU); g.fill();
      g.restore();
      const w: Pt[][] = [];
      for (let i = 1; i <= 3; i++) {
        const p = pts[i], q = pts[i + 1];
        const na = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
        const r = 3.6 - i * 0.6;
        w.push([[p[0] + Math.cos(na) * r, p[1] + Math.sin(na) * r], [p[0] - Math.cos(na) * r * 0.6, p[1] - Math.sin(na) * r * 0.6]]);
      }
      strokes(g, w, shade(c.colors.base, -0.35), 1.1);
      gloss(g, 2, -4, 2.4, 0.4);
    },
  }),
  P({
    id: 'm-cud', name: 'Cud Cruncher', category: 'mouth', tier: 3, cost: 150, diet: 'herbivore', snap: 'head-front', layer: 'front', radius: 18, box: [-10, -12, 21, 12],
    stats: { bite: 3, sing: 2, charge: 2 }, desc: 'A big soft muzzle with flat grinders. Moo-ves mountains.',
    draw(g, c) {
      const o = c.act * 4, chew = Math.sin(c.t * 3) * 0.7;
      fillShaded(g, smoothPath([[-4, 2], [10, 3 + o + chew], [15, 5 + o], [11, 9.5 + o], [-4, 8.5]]), shade(c.colors.base, -0.12), { y0: 2, y1: 10 });
      g.fillStyle = bone; g.strokeStyle = TOOTH_OL; g.lineWidth = 1;
      g.beginPath(); g.rect(9.2, 1, 2.8, 3.4); g.rect(12.2, 1, 2.8, 3.2); g.fill(); g.stroke();
      fillShaded(g, smoothPath([[-6, -9], [8, -8.5], [16, -5], [18.5, 0.5], [15, 3], [-6, 3]]), c.colors.base, { y0: -9, y1: 3 });
      fillShaded(g, ellipsePath(15.2, -1.6, 4.2, 4.4), mix(c.colors.detail, '#ff9eb0', 0.4), { y0: -6, y1: 3 });
      g.fillStyle = MOUTH;
      g.beginPath(); g.ellipse(16.8, -1.4, 1.1, 1.7, 0.3, 0, TAU); g.fill();
      gloss(g, 5, -6, 3, 0.35);
    },
  }),
  P({
    id: 'm-tusktrumpet', name: 'Tusk Trumpet', category: 'mouth', tier: 4, cost: 250, diet: 'herbivore', snap: 'head-front', layer: 'front', radius: 28, box: [-8, -12, 28, 29],
    stats: { sing: 4, bite: 3, charge: 3 }, desc: 'Mighty trunk, mightier tusks. Its fanfare shakes the ferns.',
    draw(g, c) {
      const up = c.action === 'sing' ? Math.min(1, c.act * 1.6) : c.act * 0.3;
      const sway = Math.sin(c.t * 1.4) * 0.07;
      const tusk = (dx: number, col: string) =>
        fillShaded(g, taper([[2 + dx, 4], [10 + dx, 9], [18 + dx, 9], [24 + dx, 3], [25 + dx, -2]], 5.2, 1.6), col, { ol: shade(col, -0.6), y0: -2, y1: 10 });
      tusk(-3, shade(bone, -0.25));
      const turns = [0.4, 0.3, 0.15, 0.05, -0.4, -0.6];
      const pts: Pt[] = [[-4, -4]];
      let x = -4, y = -4, a = 0.35 + sway - up * 1.3;
      for (let i = 0; i < 6; i++) {
        x += Math.cos(a) * 5.6; y += Math.sin(a) * 5.6;
        pts.push([x, y]);
        a += turns[i] * (1 - up * 1.3);
      }
      fillShaded(g, taper(pts, 12, 5.5), c.colors.base, { y0: -10, y1: 30 });
      const e = pts[6], d = pts[5];
      g.save(); g.translate(e[0], e[1]); g.rotate(Math.atan2(e[1] - d[1], e[0] - d[0]));
      fillShaded(g, ellipsePath(1.5, 0, 2.4, 4 * (1 + up * 0.5)), shade(c.colors.base, -0.12), { y0: -4, y1: 4 });
      g.fillStyle = MOUTH; g.beginPath(); g.ellipse(2.4, 0, 1.1, 2.2 * (1 + up * 0.5), 0, 0, TAU); g.fill();
      g.restore();
      const w: Pt[][] = [];
      for (let i = 1; i <= 4; i++) {
        const p = pts[i], q = pts[i + 1];
        const na = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
        const r = 5 - i * 0.7;
        w.push([[p[0] + Math.cos(na) * r, p[1] + Math.sin(na) * r], [p[0] - Math.cos(na) * r * 0.5, p[1] - Math.sin(na) * r * 0.5]]);
      }
      strokes(g, w, shade(c.colors.base, -0.35), 1.1);
      tusk(0, bone);
      gloss(g, 21, 6, 1.6, 0.6);
    },
  }),

  // ---------------------------------------------------------- carnivore
  P({
    id: 'm-nipper', name: 'Nipper Beak', category: 'mouth', tier: 1, cost: 25, diet: 'carnivore', snap: 'head-front', layer: 'front', radius: 18, box: [-8, -10, 21, 8],
    stats: { bite: 2 }, desc: 'A sharp little hook for snatching snacks.',
    draw(g, c) {
      const o = c.act * 0.45;
      const bk = mix('#d9c7a2', c.colors.coat, 0.15);
      g.save(); g.translate(-1, 1.5); g.rotate(o);
      fillShaded(g, smoothPath([[0, -1], [11, 0], [14, 1.5], [10, 4], [0, 4]]), shade(bk, -0.22), { y0: -1, y1: 4 });
      g.restore();
      fillShaded(g, smoothPath([[-4, -7], [7, -6.5], [15, -3], [19, 2.5], [15, 1], [-4, 1.5]]), bk, { y0: -7, y1: 2 });
      g.fillStyle = INK; g.beginPath(); g.ellipse(5, -4, 1.3, 0.8, 0, 0, TAU); g.fill();
      gloss(g, 8, -4.5, 2, 0.55);
    },
  }),
  P({
    id: 'm-mandible', name: 'Clackers', category: 'mouth', tier: 2, cost: 75, diet: 'carnivore', snap: 'head-front', layer: 'front', radius: 19, box: [-8, -10, 22, 13],
    stats: { bite: 3, sing: 1, charge: 1 }, desc: 'Bug mandibles that snip, clack and click.',
    draw(g, c) {
      const o = c.act * 0.55 + (Math.sin(c.t * 5) * 0.5 + 0.5) * 0.08;
      const plate = shade(c.colors.coat, -0.05);
      const md = mix(claw, c.colors.coat, 0.3);
      tube(g, line([[3, 4], [8, 9], [11, 8]]), 1.8, plate);
      fillShaded(g, smoothPath([[-5, -7], [6, -6], [10, 0], [6, 6], [-5, 6]]), plate, { y0: -7, y1: 6 });
      for (const s of [-1, 1]) {
        g.save(); g.translate(6, s * 1.4); g.rotate(s * o);
        fillShaded(g, smoothPath([[0, s * 3], [7, s * 4.8], [14, -s * 1], [8, s * 1], [0, s * 0.2]]), md, { y0: -5, y1: 5 });
        g.restore();
      }
      gloss(g, 0, -4, 2.6, 0.4);
    },
  }),
  P({
    id: 'm-sucker', name: 'Sucker Punch', category: 'mouth', tier: 3, cost: 150, diet: 'carnivore', snap: 'head-front', layer: 'front', radius: 15, box: [-8, -10, 18, 9],
    stats: { bite: 4, sing: 2, charge: 1 }, desc: 'A round lamprey sucker ringed with tiny teeth. Smooch of doom.',
    draw(g, c) {
      const o = c.act * 1.6;
      fillShaded(g, smoothPath([[-5, -7], [6, -7], [11, -6.5 - o * 0.4], [11, 6.5 + o * 0.4], [6, 6.5], [-5, 6]]), c.colors.base, { y0: -7, y1: 7 });
      strokes(g, [[[2.5, -6.5], [3.8, 0], [2.5, 6]], [[6.5, -6.6], [7.8, 0], [6.5, 6.2]]], shade(c.colors.base, -0.3), 1.2);
      fillShaded(g, ellipsePath(12.5, 0, 3.6 + o * 0.4, 7.4 + o), mix(c.colors.detail, '#ff8fa3', 0.45), { y0: -8, y1: 8 });
      g.fillStyle = MOUTH;
      g.beginPath(); g.ellipse(13.2, 0, 2.2 + o * 0.3, 4.8 + o, 0, 0, TAU); g.fill();
      const ring: Pt[] = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; ring.push([13.2 + Math.cos(a) * (1.7 + o * 0.25), Math.sin(a) * (3.9 + o * 0.8)]); }
      dots(g, ring, 0.75, bone);
      gloss(g, 11.5, -5, 1.5, 0.6);
    },
  }),
  P({
    id: 'm-sabre', name: 'Sabre Smile', category: 'mouth', tier: 3, cost: 150, diet: 'carnivore', snap: 'head-front', layer: 'front', radius: 17, box: [-10, -12, 20, 15],
    stats: { bite: 4, charge: 3 }, desc: 'Two enormous fangs. Grin first, ask questions later.',
    draw(g, c) {
      const o = c.act * 0.55;
      g.save(); g.translate(-3, 2.5); g.rotate(o);
      fillShaded(g, smoothPath([[0, -1], [12, 0], [15, 2], [11, 6], [0, 5]]), shade(c.colors.base, -0.12), { y0: -1, y1: 6 });
      toothRow(g, 4, 12, 0, 2, -1);
      g.restore();
      const fang = (x: number, col: string) =>
        fillShaded(g, smoothPath([[x - 2.2, 0], [x + 2, 0], [x + 1.4, 7], [x - 0.6, 13.5], [x - 1.8, 7]]), col, { ol: shade(col, -0.62), y0: 0, y1: 13 });
      fang(9, shade(bone, -0.2));
      fang(12.5, bone);
      fillShaded(g, smoothPath([[-6, -9], [8, -8.5], [16.5, -3.5], [16, 2.5], [-6, 2.5]]), c.colors.base, { y0: -9, y1: 3 });
      g.fillStyle = INK;
      g.beginPath(); g.moveTo(14.5, -4.5); g.lineTo(17.5, -3.5); g.lineTo(15.5, -1.5); g.closePath(); g.fill();
      dots(g, [[9, -1], [11, -1.8], [11.5, 0.4]], 0.7, shade(c.colors.base, -0.45));
      gloss(g, 5, -6, 3, 0.35);
    },
  }),
  P({
    id: 'm-gnasher', name: 'Mega Gnasher', category: 'mouth', tier: 4, cost: 250, diet: 'carnivore', snap: 'head-front', layer: 'front', radius: 28, box: [-13, -14, 32, 15],
    stats: { bite: 5, sing: 2, charge: 3 }, desc: 'Row upon row of teeth. The apex of chomp.',
    draw(g, c) {
      const o = c.act * 0.5;
      g.fillStyle = MOUTH;
      g.beginPath(); g.moveTo(-4, 2); g.lineTo(26, 1); g.lineTo(-4 + Math.cos(o) * 26, 3 + Math.sin(o) * 26); g.closePath(); g.fill();
      g.save(); g.translate(-4, 3); g.rotate(o);
      fillShaded(g, smoothPath([[0, -1], [21, -0.5], [26, 3], [20, 9.5], [0, 9.5]]), shade(c.colors.base, -0.14), { y0: -1, y1: 10 });
      toothRow(g, 3, 23, -0.5, 3.4, -1);
      g.restore();
      fillShaded(g, smoothPath([[-7, -11], [12, -10.5], [24, -5.5], [28.5, 0.5], [-7, 2.5]]), c.colors.base, { y0: -11, y1: 2 });
      toothRow(g, 2, 26, 1, 4.2, 1);
      const sc = new Path2D();
      for (const x of [2, 8, 14]) { sc.moveTo(x - 3, -9.8 + x * 0.25); sc.quadraticCurveTo(x, -15 + x * 0.25, x + 3, -9.6 + x * 0.28); sc.closePath(); }
      fillShaded(g, sc, c.colors.coat, { lw: 1.8, y0: -14, y1: -8 });
      g.fillStyle = INK; g.beginPath(); g.ellipse(24.5, -3.6, 1.6, 0.9, 0.3, 0, TAU); g.fill();
      gloss(g, 7, -7, 3.6, 0.35);
    },
  }),

  // ---------------------------------------------------------- omnivore
  P({
    id: 'm-snuffle', name: 'Snuffle Snout', category: 'mouth', tier: 1, cost: 25, diet: 'omnivore', snap: 'head-front', layer: 'front', radius: 15, box: [-9, -10, 18, 10],
    stats: { bite: 1, sing: 1 }, desc: 'A piggy snout that sniffs out truffles and leftovers.',
    draw(g, c) {
      const o = c.act * 3, sniff = Math.sin(c.t * 6) * 0.35;
      const pink = mix(c.colors.base, '#ff9eb5', 0.5);
      fillShaded(g, smoothPath([[-4, 3], [8, 3 + o], [11, 6 + o], [4, 8.5 + o * 0.5], [-4, 7]]), shade(c.colors.base, -0.1), { y0: 3, y1: 9 });
      fillShaded(g, smoothPath([[-5, -7], [8, -6.5], [12, -5], [12, 3], [8, 3.5], [-5, 3]]), c.colors.base, { y0: -7, y1: 4 });
      fillShaded(g, ellipsePath(12.6 + sniff, -1.2, 3, 5.2), pink, { y0: -6, y1: 4 });
      g.fillStyle = MOUTH;
      g.beginPath(); g.ellipse(13.4 + sniff, -3, 0.9, 1.4, 0, 0, TAU); g.ellipse(13.4 + sniff, 0.8, 0.9, 1.4, 0, 0, TAU); g.fill();
      gloss(g, 3, -4.5, 2.5, 0.4);
    },
  }),
  P({
    id: 'm-toucan', name: 'Two-Can Beak', category: 'mouth', tier: 2, cost: 75, diet: 'omnivore', snap: 'head-front', layer: 'front', radius: 28, box: [-8, -14, 32, 9],
    stats: { bite: 2, sing: 3 }, desc: 'A banana-bright beak. Two can sing louder than one.',
    draw(g, c) {
      const o = c.act * 0.3;
      const top = mix('#ffc531', c.colors.detail, 0.2), tip = mix('#ff5a3c', c.colors.coat, 0.25);
      g.save(); g.translate(-3, 1.5); g.rotate(o);
      fillShaded(g, smoothPath([[0, -0.5], [16, -0.5], [27, 0.5], [28, 2.5], [16, 5], [0, 5]]), shade(top, -0.2), { y0: 0, y1: 5 });
      g.restore();
      fillShaded(g, smoothPath([[-4, -9.5], [10, -11.5], [22, -8.5], [29.5, -2.5], [28, 1.5], [14, 1], [-4, 1.5]]), top, { y0: -11, y1: 2 });
      fillShaded(g, smoothPath([[21, -8.6], [29.5, -2.5], [28, 1.5], [21.5, 1]]), tip, { y0: -9, y1: 2 });
      strokes(g, [[[1, -9.6], [3, -4], [1, 1]]], shade(top, -0.45), 1.6);
      gloss(g, 12, -8.5, 3, 0.5);
    },
  }),
  P({
    id: 'm-tusky', name: 'Tusky Grin', category: 'mouth', tier: 2, cost: 75, diet: 'omnivore', snap: 'head-front', layer: 'front', radius: 17, box: [-10, -12, 19, 11],
    stats: { bite: 2, charge: 2, sing: 1 }, desc: 'A warty snout with upturned tusks. Charming, in its way.',
    draw(g, c) {
      const o = c.act * 3;
      fillShaded(g, taper([[7, 5], [13, 4], [15.5, -1.5], [14, -6.5]], 3, 1.2), shade(horn, -0.25), { ol: shade(horn, -0.65), y0: -8, y1: 5 });
      fillShaded(g, smoothPath([[-4, 2], [9, 2.5 + o], [13, 5 + o], [7, 9 + o * 0.6], [-4, 8]]), shade(c.colors.base, -0.1), { y0: 2, y1: 9 });
      fillShaded(g, smoothPath([[-6, -8], [6, -8], [12.5, -5], [13, 2.5], [-6, 3]]), c.colors.base, { y0: -8, y1: 3 });
      fillShaded(g, ellipsePath(13, -1.2, 2.4, 4.2), shade(c.colors.base, -0.15), { y0: -5, y1: 3 });
      g.fillStyle = MOUTH;
      g.beginPath(); g.ellipse(13.6, -2.4, 0.7, 1.1, 0, 0, TAU); g.ellipse(13.6, 0.6, 0.7, 1.1, 0, 0, TAU); g.fill();
      dots(g, [[2, -8.2], [6, -8.4]], 1.6, shade(c.colors.coat, 0.1));
      fillShaded(g, taper([[4, 5.5], [11, 5.5], [15.5, 1], [16, -5], [13.5, -9]], 4.4, 1.4), horn, { ol: shade(horn, -0.65), y0: -9, y1: 6 });
      gloss(g, 12, 3.6, 1.2, 0.6);
    },
  }),
  P({
    id: 'm-petal', name: 'Petal Maw', category: 'mouth', tier: 3, cost: 150, diet: 'omnivore', snap: 'head-front', layer: 'front', radius: 19, box: [-8, -9, 22, 9],
    stats: { bite: 3, sing: 3, charge: 1 }, desc: 'Blooms open to reveal… teeth. Lovely. Terrifying.',
    draw(g, c) {
      const o = c.act * 0.75 + Math.sin(c.t * 2) * 0.05;
      const pc = mix(c.colors.coat, '#ff7ab6', 0.4);
      fillShaded(g, smoothPath([[-5, -6], [6, -5], [9, 0], [6, 5], [-5, 6]]), shade(c.colors.coat, 0.08), { y0: -6, y1: 6 });
      g.fillStyle = MOUTH;
      g.beginPath(); g.ellipse(11, 0, 2.5 + o * 3, 3 + o * 4.5, 0, 0, TAU); g.fill();
      if (o > 0.15) {
        const ring: Pt[] = [];
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ring.push([11 + Math.cos(a) * (1.6 + o * 2.2), Math.sin(a) * (2 + o * 3.4)]); }
        dots(g, ring, 0.8, bone);
      }
      const petal = (rot: number, col: string, len: number) => {
        g.save(); g.translate(7.5, 0); g.rotate(rot);
        fillShaded(g, smoothPath([[0, -2.6], [len * 0.55, -4.2], [len, 0], [len * 0.55, 4.2], [0, 2.6]]), col, { y0: -4, y1: 4 });
        strokes(g, [[[1, 0], [len * 0.8, 0]]], shade(col, -0.3), 1);
        g.restore();
      };
      petal(0, shade(pc, -0.3), 11);
      petal(0.3 + o, shade(pc, -0.08), 13);
      petal(-0.3 - o, pc, 13);
    },
  }),
  P({
    id: 'm-lickety', name: 'Lickety Split', category: 'mouth', tier: 4, cost: 250, diet: 'omnivore', snap: 'head-front', layer: 'front', radius: 22, box: [-12, -13, 25, 13],
    stats: { bite: 4, sing: 4, charge: 2 }, desc: 'A wide froggy grin with a lightning tongue and a booming throat sac.',
    draw(g, c) {
      const sing = c.action === 'sing' ? c.act : 0;
      const lick = c.action === 'sing' ? 0 : c.act;
      if (sing > 0.02) {
        fillShaded(g, ellipsePath(3, 9 + sing * 2, 7 + sing * 5, 4 + sing * 4), mix(c.colors.detail, '#ffd0dc', 0.3), { y0: 4, y1: 16 });
      }
      g.save(); g.translate(-5, 2.5); g.rotate(lick * 0.35);
      fillShaded(g, smoothPath([[0, -1], [18, 0], [22, 3], [16, 8], [0, 8]]), shade(c.colors.base, -0.08), { y0: -1, y1: 8 });
      g.restore();
      if (lick > 0.05) {
        g.fillStyle = MOUTH;
        g.beginPath(); g.moveTo(-5, 2.5); g.lineTo(19, 1.5); g.lineTo(-5 + Math.cos(lick * 0.35) * 20, 2.5 + Math.sin(lick * 0.35) * 20); g.closePath(); g.fill();
        const tl = 6 + lick * 22;
        tube(g, line([[2, 4], [tl * 0.6, 4.5 + lick * 2], [tl, 2 + lick * 3]]), 3.2, TONGUE);
        fillShaded(g, circlePath(tl + 1, 2 + lick * 3, 3), TONGUE, { y0: -1, y1: 5 });
      }
      fillShaded(g, smoothPath([[-7, -10], [10, -10.5], [19, -6], [21.5, 1], [-7, 2.5]]), c.colors.base, { y0: -10, y1: 2 });
      strokes(g, [[[-5, 2], [8, 2.5], [20, 0.5]]], outlineOf(c.colors.base), 1.6);
      dots(g, [[16.5, -6.5]], 1.1, INK);
      gloss(g, 6, -7, 3.5, 0.35);
    },
  }),
];

// ======================================================================= EYES
const EYES: PartDef[] = [
  P({
    id: 'e-googly', name: 'Googler', category: 'eye', tier: 1, cost: 10, snap: 'head', layer: 'top', radius: 7, box: [-9, -9, 8, 8],
    stats: { sight: 1 }, desc: 'A wobbly googly eye. Never stops jiggling.',
    draw(g, c) {
      const r = 6.5;
      fillShaded(g, circlePath(0, 0, r), '#fbfaf5', { ol: INK, y0: -r, y1: r });
      const w = c.t * 7;
      g.fillStyle = '#0d0a08';
      g.beginPath(); g.arc(Math.sin(w) * 1.3 + 0.8, 2.1 + Math.cos(w * 1.3) * 0.9, 3.5, 0, TAU); g.fill();
      gloss(g, -2.6, -3.2, 2, 0.9);
    },
  }),
  P({
    id: 'e-sleepy', name: 'Dozy Peeper', category: 'eye', tier: 1, cost: 10, snap: 'head', layer: 'top', radius: 6, box: [-8, -8, 7, 7],
    stats: { sight: 1 }, desc: 'Heavy-lidded and unbothered. Sees everything anyway.',
    draw(g, c) {
      const r = 5.5;
      drawEye(g, r, c, { look: 0.25 });
      const ly = -r + 2 * r * (0.48 + Math.sin(c.t * 0.9) * 0.07);
      g.save();
      g.beginPath(); g.arc(0, 0, r + 0.4, 0, TAU); g.clip();
      g.fillStyle = shade(c.colors.base, -0.05);
      g.fillRect(-r - 1, -r - 1, 2 * r + 2, ly + r + 1);
      g.restore();
      g.strokeStyle = INK; g.lineWidth = 1.7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-r * 0.98, ly); g.quadraticCurveTo(0, ly + 1.4, r * 0.98, ly);
      g.moveTo(r, 0); g.arc(0, 0, r, 0, TAU);
      g.stroke();
    },
  }),
  P({
    id: 'e-saucer', name: 'Saucer Eye', category: 'eye', tier: 1, cost: 10, snap: 'head', layer: 'top', radius: 13, box: [-14, -14, 11, 11],
    stats: { sight: 1 }, desc: 'One huge, adoring eye. Great for cyclopes.',
    draw(g, c) {
      const r = 9;
      const lash: Pt[][] = [];
      for (const a of [-2.5, -2.05, -1.6]) lash.push([[Math.cos(a) * r, Math.sin(a) * r], [Math.cos(a - 0.25) * (r + 4), Math.sin(a - 0.25) * (r + 4)]]);
      strokes(g, lash, INK, 1.8);
      drawEye(g, r, c, { look: 0.25 });
    },
  }),
  P({
    id: 'e-lash', name: 'Flutterlash', category: 'eye', tier: 1, cost: 10, snap: 'head', layer: 'top', radius: 9, box: [-8, -11, 9, 8],
    stats: { sight: 1 }, desc: 'Long lashes made for fluttering at friends.',
    draw(g, c) {
      const r = 5.6;
      const lash: Pt[][] = [];
      for (const a of [-1.15, -0.75, -0.35]) lash.push([[Math.cos(a) * r, Math.sin(a) * r], [Math.cos(a - 0.35) * (r + 3.6), Math.sin(a - 0.35) * (r + 3.6)]]);
      strokes(g, lash, INK, 1.5);
      drawEye(g, r, c, { look: 0.3, iris: shade(c.colors.coat, 0.1) });
    },
  }),
  P({
    id: 'e-bug', name: 'Bulgy Bug', category: 'eye', tier: 1, cost: 10, snap: 'head', layer: 'top', radius: 7, box: [-8, -9, 8, 8],
    stats: { sight: 1 }, desc: 'A big glossy bug eye. Very shiny, very judgy.',
    draw(g, c) {
      const col = mix('#8a1830', c.colors.coat, 0.2);
      fillShaded(g, ellipsePath(0, 0, 6, 6.6, -0.25), col, { ol: INK, y0: -6, y1: 6 });
      g.fillStyle = rgba('#ffffff', 0.18);
      g.beginPath(); g.ellipse(0.6, 0.8, 4, 4.6, -0.25, 0, TAU); g.fill();
      gloss(g, -2.2, -3, 2.6, 0.85);
      gloss(g, 2.6, 2.4, 1, 0.5);
    },
  }),
  P({
    id: 'e-compound', name: 'Faceteer', category: 'eye', tier: 2, cost: 10, snap: 'head', layer: 'top', radius: 7, box: [-9, -8, 9, 8],
    stats: { sight: 1 }, desc: 'A compound eye of a hundred tiny windows.',
    draw(g, c) {
      const p = ellipsePath(0, 0, 7, 6.4);
      const gr = g.createLinearGradient(-6, -6, 6, 6);
      gr.addColorStop(0, mix('#8ff7d0', c.colors.detail, 0.2));
      gr.addColorStop(0.45, mix('#6a4ee0', c.colors.coat, 0.2));
      gr.addColorStop(1, '#1d1430');
      g.lineWidth = OUTLINE_W; g.strokeStyle = INK; g.stroke(p);
      g.fillStyle = gr; g.fill(p);
      g.save(); g.clip(p);
      g.strokeStyle = rgba('#ffffff', 0.28); g.lineWidth = 0.8;
      g.beginPath();
      for (let row = -3; row <= 3; row++) for (let col = -3; col <= 3; col++) {
        const x = col * 2.6 + (row % 2 ? 1.3 : 0), y = row * 2.2;
        g.moveTo(x + 1.2, y); g.arc(x, y, 1.2, 0, TAU);
      }
      g.stroke();
      g.restore();
      gloss(g, -2.2, -3, 2.4, 0.75);
    },
  }),
  P({
    id: 'e-glow', name: 'Glowpeep', category: 'eye', tier: 2, cost: 10, snap: 'head', layer: 'top', radius: 7, box: [-8, -8, 8, 8],
    stats: { sight: 1 }, desc: 'A lamp-like eye from the deep. Glows softly in the dark.',
    draw(g, c) {
      const pulse = 0.75 + Math.sin(c.t * 3) * 0.25;
      const col = mix(c.colors.detail, '#8dffd8', 0.55);
      glow(g, 0, 0, 10, col, 0.55 * pulse);
      fillShaded(g, circlePath(0, 0, 5.2), col, { ol: INK, y0: -5, y1: 5 });
      const b = blinkAmount(c.t + 1.3);
      g.fillStyle = rgba('#ffffff', 0.9);
      g.beginPath(); g.ellipse(0.9, 0, 1.6, Math.max(0.3, 2.8 * (1 - b)), 0, 0, TAU); g.fill();
    },
  }),
];

// ======================================================================= LEGS
const LEGS: PartDef[] = [
  P({
    id: 'l-bird', name: 'Twiggy Talons', category: 'leg', tier: 1, cost: 50, snap: 'bottom', layer: 'front', paired: true, limbLength: 40, radius: 20,
    stats: { speed: 1, sneak: 1 }, desc: 'Fluffy thighs, twiggy shins. Tiptoes everywhere.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      const sc = farC(c, mix('#f2b347', c.colors.detail, 0.25));
      drawLimb(g, c.limb, 3.2, 2.3, 1.9, sc);
      tube(g, line([[f.x - 4.5, f.y + 0.5], [f.x, f.y], [f.x + 7, f.y + 0.8]], false), 1.7, sc);
      tube(g, line([[f.x, f.y], [f.x + 5, f.y + 1.6]], false), 1.5, sc);
      fillShaded(g, ellipsePath(k.x * 0.38, k.y * 0.38, Math.hypot(k.x, k.y) * 0.42 + 1.5, 4.6, Math.atan2(k.y, k.x)), c.colors.base, { y0: -6, y1: k.y });
      dots(g, [[f.x + 7.6, f.y + 0.9], [f.x + 5.6, f.y + 1.8]], 0.9, farC(c, claw));
    },
  }),
  P({
    id: 'l-paw', name: 'Pussyfoot Pads', category: 'leg', tier: 1, cost: 50, snap: 'bottom', layer: 'front', paired: true, limbLength: 32, radius: 17,
    stats: { sneak: 1, dance: 1 }, desc: 'Soft toe-beans for sneaking up and boogieing down.',
    draw(g, c) {
      if (!c.limb) return;
      const f = c.limb.foot;
      drawLimb(g, c.limb, 7, 5, 4.5, c.colors.base);
      fillShaded(g, ellipsePath(f.x + 2.5, f.y - 2, 6.6, 4.2), shade(c.colors.base, 0.08), { y0: f.y - 6, y1: f.y + 2 });
      strokes(g, [[[f.x + 4, f.y - 4], [f.x + 4.6, f.y + 0.4]], [[f.x + 6.6, f.y - 3.4], [f.x + 7, f.y + 0.2]]], outlineOf(c.colors.base), 1.2);
      g.fillStyle = farC(c, '#ff9eb5');
      g.beginPath(); g.ellipse(f.x + 1, f.y + 1.2, 3.4, 1.1, 0, 0, TAU); g.fill();
    },
  }),
  P({
    id: 'l-insect', name: 'Skitter Sticks', category: 'leg', tier: 2, cost: 100, snap: 'bottom', layer: 'front', paired: true, limbLength: 40, radius: 20,
    stats: { speed: 2, sneak: 2, sprint: 1 }, desc: 'Jointed bug legs with spiky shins. Skitter-skitter.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      const side = k.x >= 0 ? 1 : -1;
      const kn = { x: f.x * 0.25 + side * 13, y: f.y - 44 };
      const ch = mix(c.colors.coat, '#3a2a40', 0.25);
      drawLimb(g, pose(c, kn), 3.8, 2.6, 1.4, ch);
      const sa = angTo(kn, f);
      const sp: Pt[][] = [];
      for (const t of [0.35, 0.6]) {
        const x = kn.x + (f.x - kn.x) * t, y = kn.y + (f.y - kn.y) * t;
        sp.push([[x, y], [x + Math.cos(sa - side * 1.2) * 4, y + Math.sin(sa - side * 1.2) * 4]]);
      }
      strokes(g, sp, outlineOf(ch), 1.4);
      tube(g, line([[f.x, f.y], [f.x + 3, f.y - 0.5], [f.x + 4.5, f.y + 1]]), 1.2, farC(c, claw));
    },
  }),
  P({
    id: 'l-elephant', name: 'Thunder Stumps', category: 'leg', tier: 3, cost: 175, snap: 'bottom', layer: 'front', paired: true, limbLength: 34, radius: 20,
    stats: { charge: 4, dance: 2, speed: 1 }, desc: 'Pillar legs that make the ground go boom.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      drawLimb(g, c.limb, 9, 8, 8, c.colors.base);
      fillShaded(g, smoothPath([[f.x - 8.5, f.y - 3], [f.x + 8.5, f.y - 3], [f.x + 9.5, f.y + 1.2], [f.x - 9, f.y + 1.2]]), shade(c.colors.base, -0.08), { y0: f.y - 4, y1: f.y + 2 });
      const nails = new Path2D();
      for (const dx of [3, 6.6]) { nails.moveTo(f.x + dx + 1.8, f.y + 1); nails.arc(f.x + dx, f.y + 1, 1.8, 0, Math.PI, true); }
      fillShaded(g, nails, farC(c, bone), { ol: farC(c, shade(bone, -0.6)), lw: 1.2, flat: true });
      const ka = angTo(k, f) + Math.PI / 2;
      strokes(g, [-2, 0, 2].map((o) => [[k.x + Math.cos(ka) * 5 + o, k.y + Math.sin(ka) * 5 + o * 0.6], [k.x - Math.cos(ka) * 3 + o, k.y - Math.sin(ka) * 3 + o * 0.6]] as Pt[]), shade(c.colors.base, -0.35), 1);
    },
  }),
  P({
    id: 'l-spider', name: 'Creepy Crawlers', category: 'leg', tier: 3, cost: 175, snap: 'bottom', layer: 'front', paired: true, limbLength: 44, radius: 24,
    stats: { sneak: 5, speed: 2 }, desc: 'Long, hairy, arching legs. Nobody hears you coming.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      const side = k.x >= 0 ? 1 : -1;
      const kn = { x: f.x * 0.3 + side * 17, y: f.y - 47 };
      const col = mix(c.colors.coat, '#2a2030', 0.55);
      drawLimb(g, pose(c, kn), 3.4, 2.6, 1.3, col);
      const sa = angTo(kn, f), hb: Pt[][] = [];
      for (const t of [0.2, 0.4, 0.6, 0.8]) {
        const x = kn.x + (f.x - kn.x) * t, y = kn.y + (f.y - kn.y) * t;
        hb.push([[x, y], [x + Math.cos(sa + side * 1.9) * 3.2, y + Math.sin(sa + side * 1.9) * 3.2]]);
      }
      hb.push([[kn.x * 0.5, kn.y * 0.5], [kn.x * 0.5 + 2, kn.y * 0.5 - 3]]);
      strokes(g, hb, outlineOf(col), 1.1);
      dots(g, [[kn.x, kn.y]], 3, shade(col, 0.15));
    },
  }),
  P({
    id: 'l-cheetah', name: 'Zippity Paws', category: 'leg', tier: 3, cost: 175, snap: 'bottom', layer: 'front', paired: true, limbLength: 44, radius: 22,
    stats: { speed: 5, sprint: 2 }, desc: 'Springy striped legs built for top speed.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      drawLimb(g, c.limb, 6.5, 3.6, 3, c.colors.base);
      const sa = angTo(k, f) + Math.PI / 2, st: Pt[][] = [];
      for (const t of [0.3, 0.6]) {
        const x = k.x + (f.x - k.x) * t, y = k.y + (f.y - k.y) * t, w = 3.4 - t * 1.4;
        st.push([[x + Math.cos(sa) * w, y + Math.sin(sa) * w], [x - Math.cos(sa) * w, y - Math.sin(sa) * w]]);
      }
      st.push([[k.x * 0.35 - 3, k.y * 0.35], [k.x * 0.35 + 3, k.y * 0.35 + 1]]);
      strokes(g, st, c.colors.coat, 2);
      fillShaded(g, polyPath([[f.x - 2, f.y - 6], [f.x - 7, f.y - 3.5], [f.x - 1, f.y - 2.5]]), c.colors.coat, { y0: f.y - 6, y1: f.y - 2 });
      fillShaded(g, ellipsePath(f.x + 2.5, f.y - 2, 5.6, 3.2), shade(c.colors.base, 0.06), { y0: f.y - 5, y1: f.y + 1 });
      dots(g, [[f.x + 7.6, f.y - 0.6], [f.x + 6.4, f.y + 0.8]], 0.9, farC(c, claw));
    },
  }),
  P({
    id: 'l-raptor', name: 'Razor Runners', category: 'leg', tier: 4, cost: 275, snap: 'bottom', layer: 'front', paired: true, limbLength: 46, radius: 24,
    stats: { sprint: 5, speed: 4, charge: 1 }, desc: 'Thunder thighs and a hooked toe claw. Gone in a blink.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      const sc = mix(c.colors.base, c.colors.coat, 0.4);
      drawLimb(g, c.limb, 5, 3.2, 2.5, sc);
      tube(g, line([[f.x - 1, f.y], [f.x + 8, f.y + 0.6]], false), 2.4, sc);
      fillShaded(g, smoothPath([[f.x + 0.5, f.y - 1.5], [f.x + 2.5, f.y - 7.5], [f.x + 7.5, f.y - 8], [f.x + 4.5, f.y - 6], [f.x + 3, f.y - 1]]), farC(c, claw), { y0: f.y - 8, y1: f.y });
      fillShaded(g, polyPath([[f.x + 7.5, f.y - 0.8], [f.x + 11, f.y + 1], [f.x + 7.5, f.y + 1.6]]), farC(c, claw), { lw: 1.2, flat: true });
      fillShaded(g, ellipsePath(k.x * 0.48, k.y * 0.48, Math.hypot(k.x, k.y) * 0.58 + 2, 7.6, Math.atan2(k.y, k.x)), c.colors.base, { y0: -8, y1: k.y + 6 });
      gloss(g, k.x * 0.4 - 2, k.y * 0.4 - 3, 2.6, 0.3);
    },
  }),
  P({
    id: 'l-frog', name: 'Leapfrog Haunches', category: 'leg', tier: 4, cost: 275, snap: 'bottom', layer: 'front', paired: true, limbLength: 44, radius: 24,
    stats: { jump: 5, speed: 2, dance: 2, sprint: 1 }, desc: 'Coiled froggy haunches and webbed feet. Boing!',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      drawLimb(g, c.limb, 6, 4, 3, c.colors.base);
      const web = mix(c.colors.detail, c.colors.base, 0.35);
      fillShaded(g, smoothPath([[f.x - 2, f.y - 2], [f.x + 6, f.y - 3.5], [f.x + 12.5, f.y - 1.2], [f.x + 11.5, f.y + 1.4], [f.x - 2, f.y + 1.4]]), web, { y0: f.y - 4, y1: f.y + 2 });
      strokes(g, [[[f.x, f.y - 0.5], [f.x + 12, f.y - 1]], [[f.x, f.y - 0.5], [f.x + 10, f.y + 1]]], shade(web, -0.4), 1);
      dots(g, [[f.x + 12.6, f.y - 1.2], [f.x + 11.4, f.y + 1.3]], 1.3, shade(web, 0.25));
      fillShaded(g, ellipsePath(k.x * 0.5, k.y * 0.5, Math.hypot(k.x, k.y) * 0.62 + 3, 8.8, Math.atan2(k.y, k.x)), c.colors.base, { y0: -9, y1: k.y + 6 });
      dots(g, [[k.x * 0.5 - 2, k.y * 0.5 - 2], [k.x * 0.62 + 1.5, k.y * 0.62 + 1]], 1.7, c.colors.coat);
      gloss(g, k.x * 0.42 - 3, k.y * 0.42 - 3.5, 2.8, 0.35);
    },
  }),
  P({
    id: 'l-flamingo', name: 'Cancan Stilts', category: 'leg', tier: 4, cost: 275, snap: 'bottom', layer: 'front', paired: true, limbLength: 56, radius: 28,
    stats: { dance: 5, jump: 3, speed: 2 }, desc: 'Tutu, knobbly knees and pointed toes. A born showstopper.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      const lc = mix(c.colors.coat, '#ff7aa8', 0.3);
      drawLimb(g, c.limb, 3.4, 2.4, 2, lc);
      fillShaded(g, circlePath(k.x, k.y, 3.6), lc, { y0: k.y - 4, y1: k.y + 4 });
      const sa = angTo(k, f);
      g.save(); g.translate(f.x, f.y); g.rotate(sa - Math.PI / 2 - 0.9);
      fillShaded(g, polyPath([[-2.6, -3], [2.6, -3], [0.6, 6], [-0.6, 6]]), shade(lc, -0.2), { y0: -3, y1: 6 });
      g.restore();
      const rb = (t: number) => [k.x + (f.x - k.x) * t, k.y + (f.y - k.y) * t] as Pt;
      strokes(g, [[rb(0.2), [rb(0.35)[0] + 2, rb(0.35)[1]]], [rb(0.45), [rb(0.6)[0] + 2, rb(0.6)[1]]]], farC(c, '#fff3f8'), 1.3);
      const tu: Pt[] = [];
      for (let i = 0; i <= 14; i++) { const a = -0.2 + (i / 14) * (Math.PI + 0.4); const r = i % 2 ? 7.4 : 8.8; tu.push([Math.cos(a) * r * 1.2, Math.sin(a) * r * 0.62 + 0.5]); }
      fillShaded(g, smoothPath(tu), farC(c, mix(c.colors.detail, '#ffa8cf', 0.45)), { y0: -2, y1: 7 });
    },
  }),
];

// ======================================================================= ARMS
const ARMS: PartDef[] = [
  P({
    id: 'a-flipper', name: 'Flapper Hands', category: 'arm', tier: 1, cost: 25, snap: 'side', layer: 'front', paired: true, limbLength: 26, radius: 15,
    stats: { pose: 1, dance: 1, grasp: 1 }, desc: 'Flippers with stubby fingers. Great for waving.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      drawLimb(g, c.limb, 4.6, 4, 3.6, c.colors.base);
      g.save(); g.translate(f.x, f.y); g.rotate(angTo(k, f) + Math.sin(c.t * 3) * 0.15);
      fillShaded(g, smoothPath([[-2, -3.6], [6, -4.6], [11, -1.4], [10.5, 2.6], [3, 4.2], [-2, 3]]), shade(c.colors.base, 0.06), { y0: -5, y1: 4 });
      strokes(g, [[[6.5, -2.2], [10, -1.2]], [[6.5, 0.6], [9.6, 1.6]]], outlineOf(c.colors.base), 1);
      g.restore();
    },
  }),
  P({
    id: 'a-crab', name: 'Pinchy Pincers', category: 'arm', tier: 2, cost: 75, snap: 'side', layer: 'front', paired: true, limbLength: 32, radius: 19,
    stats: { strike: 3, pose: 1, grasp: 1 }, desc: 'Snip-snap crab claws. Mind your fingers.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      const sh = mix(c.colors.coat, '#e8603a', 0.3);
      drawLimb(g, c.limb, 4, 3.2, 3.6, sh);
      const open = 0.15 + c.act * 0.55 + Math.sin(c.t * 2.2) * 0.06;
      g.save(); g.translate(f.x, f.y); g.rotate(angTo(k, f));
      g.save(); g.translate(7, 1.6); g.rotate(open);
      fillShaded(g, smoothPath([[0, -1], [6, 0.6], [9.5, 0], [6, 3.4], [0, 2.6]]), shade(sh, -0.12), { y0: -1, y1: 4 });
      g.restore();
      fillShaded(g, merge(ellipsePath(3.5, 0, 6.2, 4.4), smoothPath([[6, -3.4], [13, -3.8], [17, -1.4], [12.5, -0.2], [7, 1]])), sh, { y0: -5, y1: 4 });
      gloss(g, 2.5, -2, 2, 0.45);
      g.restore();
    },
  }),
  P({
    id: 'a-tentacle', name: 'Wiggle Arms', category: 'arm', tier: 2, cost: 75, snap: 'side', layer: 'front', paired: true, limbLength: 34, radius: 19,
    stats: { pose: 2, dance: 2, grasp: 1 }, desc: 'Boneless, bendy and always busy.',
    draw(g, c) {
      if (!c.limb) return;
      const f = c.limb.foot;
      const l = Math.hypot(f.x, f.y) || 1, nx = -f.y / l, ny = f.x / l;
      const pts: Pt[] = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, w = Math.sin(c.t * 3 + i * 1.1 + (c.far ? 1.5 : 0)) * 3.2 * t;
        pts.push([f.x * t + nx * w, f.y * t + ny * w]);
      }
      const e = pts[5];
      pts.push([e[0] + nx * 3 + f.x / l * 1.5, e[1] + ny * 3 + f.y / l * 1.5]);
      fillShaded(g, taper(pts, 7, 2.2), c.colors.base, { y0: -4, y1: f.y + 4 });
      const sk: Pt[] = [];
      for (let i = 1; i <= 4; i++) { const p = pts[i]; sk.push([p[0] - nx * (2.8 - i * 0.4), p[1] - ny * (2.8 - i * 0.4)]); }
      dots(g, sk, 1, shade(c.colors.detail, -0.05));
    },
  }),
  P({
    id: 'a-mantis', name: 'Reaper Scythes', category: 'arm', tier: 3, cost: 150, snap: 'side', layer: 'front', paired: true, limbLength: 34, radius: 22,
    stats: { strike: 5, pose: 2 }, desc: 'Folding mantis blades. One swipe and it’s harvest time.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      const bl = farC(c, mix(horn, '#c8f08a', 0.35));
      drawLimb(g, c.limb, 4.2, 3.4, 3.2, c.colors.coat);
      g.save(); g.translate(f.x, f.y); g.rotate(angTo(k, f) - 0.35 - c.act * 0.4);
      fillShaded(g, smoothPath([[-3, -2.5], [6, -5.5], [15, -4.5], [21, 1.5], [16.5, -0.5], [8, -1], [-1, 2.5]]), bl, { ol: shade(bl, -0.62), y0: -6, y1: 3 });
      const sr = new Path2D();
      for (const x of [5, 9, 13]) { sr.moveTo(x, -1.2); sr.lineTo(x + 1.2, 1.3); sr.lineTo(x + 2.2, -1); }
      g.fillStyle = shade(bl, -0.15); g.fill(sr);
      g.restore();
    },
  }),
  P({
    id: 'a-jazz', name: 'Jazz Hands', category: 'arm', tier: 3, cost: 150, snap: 'side', layer: 'front', paired: true, limbLength: 32, radius: 19,
    stats: { pose: 5, strike: 1, charm: 1, grasp: 1 }, desc: 'Big white-gloved hands. Ta-daaa!',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      const gl = farC(c, mix('#fbfaf5', c.colors.detail, 0.2));
      drawLimb(g, c.limb, 3.6, 2.8, 2.6, c.colors.base);
      const a = angTo(k, f);
      g.save(); g.translate(f.x, f.y); g.rotate(a);
      const jig = Math.sin(c.t * 9) * 0.12 * (0.3 + c.act);
      const fp = new Path2D();
      for (const fa of [-1, -0.35, 0.3, 0.95]) { fp.moveTo(3, 0); fp.lineTo(3 + Math.cos(fa + jig) * 7, Math.sin(fa + jig) * 7); }
      tube(g, fp, 2.8, gl);
      fillShaded(g, circlePath(3, 0, 4.2), gl, { y0: -4, y1: 4 });
      fillShaded(g, ellipsePath(-1.2, 0, 1.8, 4), shade(gl, -0.1), { y0: -4, y1: 4 });
      g.restore();
    },
  }),
  P({
    id: 'a-crusher', name: 'Mega Crushers', category: 'arm', tier: 4, cost: 250, snap: 'side', layer: 'front', paired: true, limbLength: 36, radius: 25,
    stats: { strike: 5, pose: 3, health: 2, grasp: 1 }, desc: 'Lumpy armoured crusher claws. Nutcracker of the wild.',
    draw(g, c) {
      if (!c.limb) return;
      const { knee: k, foot: f } = c.limb;
      const sh = shade(c.colors.coat, 0.05);
      drawLimb(g, c.limb, 5.6, 4.6, 5, sh);
      const open = 0.1 + c.act * 0.5;
      g.save(); g.translate(f.x, f.y); g.rotate(angTo(k, f) - 0.2);
      g.save(); g.translate(11, 3.5); g.rotate(open);
      fillShaded(g, smoothPath([[0, -1.5], [8, 0.5], [12, 0], [8, 4.5], [0, 3.5]]), shade(sh, -0.14), { y0: -1, y1: 5 });
      g.restore();
      fillShaded(g, merge(ellipsePath(6, 0, 9.6, 7.2), smoothPath([[10, -6], [19, -6.5], [24, -2.5], [18, 0.4], [11, 2.5]])), sh, { y0: -8, y1: 7 });
      dots(g, [[2, -3], [6, -4.5], [9.5, -2.8], [5, 1], [14, -4]], 1.3, shade(c.colors.detail, 0.05));
      gloss(g, 3, -4, 2.8, 0.4);
      g.restore();
    },
  }),
];

// ======================================================================= WEAPONS
const antlerShape = (big: boolean): Path2D => {
  const s = big ? 1.3 : 1;
  const main = taper(xf([[0, 3], [-2, -6], [-6, -13], [-8, -19], [-6.5, -24]], 0, 0, 0, s), 5.4 * s, 2.2);
  const t1 = taper(xf([[-2, -5], [3.5, -10], [5.5, -16]], 0, 0, 0, s), 3.2, 1.6);
  const t2 = taper(xf([[-6, -14], [-1.5, -18.5], [-0.5, -23]], 0, 0, 0, s), 2.8, 1.4);
  const t3 = taper(xf([[-4.5, -10], [-11, -12.5], [-14, -16]], 0, 0, 0, s), 2.6, 1.3);
  return big ? merge(main, t1, t2, t3, taper(xf([[-7.5, -18], [-13, -22], [-14.5, -27]], 0, 0, 0, s), 2.4, 1.2)) : merge(main, t1, t2, t3);
};

const WEAPONS: PartDef[] = [
  P({
    id: 'w-nub', name: 'Pokey Nub', category: 'weapon', tier: 1, cost: 25, snap: 'top', layer: 'front', radius: 13, box: [-7, -14, 7, 6],
    stats: { charge: 1, strike: 1 }, desc: 'A little spiral horn. Small but pointy.',
    draw(g, c) {
      const p = smoothPath([[-4.5, 3], [-3, -3], [1.5, -9], [4.5, -12], [4.2, -5], [4, 3]]);
      fillShaded(g, p, horn, { ol: shade(horn, -0.62), y0: -12, y1: 3 });
      strokes(g, [[[-3.4, -1], [3.8, -2.5]], [[-1.6, -5], [3.9, -6.5]], [[1, -8.5], [4, -9.5]]], shade(horn, -0.35), 1);
      gloss(g, -1, -2, 1.6, 0.5);
    },
  }),
  P({
    id: 'w-dome', name: 'Bonk Dome', category: 'weapon', tier: 1, cost: 25, snap: 'top', layer: 'front', radius: 13, box: [-15, -12, 14, 8],
    stats: { charge: 1, health: 1 }, desc: 'A thick bony skullcap for friendly headbutts.',
    draw(g, c) {
      const knobs = new Path2D();
      for (const [x, y] of [[-10.5, 3], [-9, -2.5], [10, 1.5], [7.5, -4.5]] as Pt[]) { knobs.moveTo(x + 2, y); knobs.arc(x, y, 2, 0, TAU); }
      fillShaded(g, merge(smoothPath([[-11, 5], [-9.5, -3], [-4, -8.5], [3, -9.5], [9, -5.5], [11, 3], [0, 5.5]]), knobs), bone, { ol: shade(bone, -0.62), y0: -10, y1: 5 });
      strokes(g, [[[-6, -3], [-1, -6.5], [5, -6]]], shade(bone, -0.25), 1.2);
      gloss(g, -2, -5.5, 3, 0.55);
    },
  }),
  P({
    id: 'w-quills', name: 'Quill Crown', category: 'weapon', tier: 2, cost: 75, snap: 'top', layer: 'back', radius: 21, box: [-17, -22, 5, 3],
    stats: { strike: 2, health: 2 }, desc: 'A crest of porcupine quills. Rattle them to warn off bullies.',
    draw(g, c) {
      const shaft = new Path2D(), tips = new Path2D();
      const rattle = Math.sin(c.t * 30) * 0.03 * c.act;
      for (let i = 0; i < 6; i++) {
        const a = -2.75 + i * 0.27 - c.act * 0.12 * (i - 2.5) + rattle * (i % 2 ? 1 : -1);
        const L = 16 + (i % 2 ? 3 : 0) + (i > 1 && i < 4 ? 3 : 0);
        const q = xf([[0, -1.7], [L, 0], [0, 1.7]], a);
        shaft.moveTo(q[0][0], q[0][1]); shaft.lineTo(q[1][0], q[1][1]); shaft.lineTo(q[2][0], q[2][1]); shaft.closePath();
        const tp = xf([[L * 0.8, -0.35], [L, 0], [L * 0.8, 0.35]], a);
        tips.moveTo(tp[0][0], tp[0][1]); tips.lineTo(tp[1][0], tp[1][1]); tips.lineTo(tp[2][0], tp[2][1]); tips.closePath();
      }
      fillShaded(g, shaft, bone, { ol: shade(bone, -0.62), lw: 1.8, y0: -16, y1: 2 });
      g.strokeStyle = claw; g.lineWidth = 1.6; g.lineJoin = 'round';
      g.stroke(tips); g.fillStyle = claw; g.fill(tips);
    },
  }),
  P({
    id: 'w-goo', name: 'Goo Gun', category: 'weapon', tier: 2, cost: 75, snap: 'any', layer: 'front', radius: 14, box: [-10, -8, 16, 8],
    stats: { spit: 3, strike: 1 }, desc: 'A gurgling gland with a snorkel. Splat!',
    draw(g, c) {
      const goo = mix('#c77dff', c.colors.detail, 0.15);
      const pulse = 1 + Math.sin(c.t * 3) * 0.05 + c.act * 0.22;
      fillShaded(g, polyPath([[3, -2.6], [12, -3.6], [12, 3.6], [3, 2.6]]), bone, { ol: shade(bone, -0.62), y0: -4, y1: 4 });
      strokes(g, [[[6.5, -3], [6.5, 3]], [[9.5, -3.3], [9.5, 3.3]]], shade(bone, -0.35), 1);
      fillShaded(g, ellipsePath(-1, 0, 7 * pulse, 6 * pulse), goo, { y0: -6, y1: 6 });
      dots(g, [[-3, 1.5], [0.5, -0.5 + Math.sin(c.t * 2) * 1], [-0.5, 3]], 1.1, rgba('#ffffff', 0.45));
      fillShaded(g, circlePath(13.6, 1 + c.act * 2.5, 1 + c.act * 1.6), goo, { lw: 1.4, y0: -1, y1: 4 });
      gloss(g, -3.5, -3, 2.4, 0.6);
    },
  }),
  P({
    id: 'w-rhino', name: 'Rhino Rammer', category: 'weapon', tier: 3, cost: 150, snap: 'top', layer: 'front', radius: 22, box: [-10, -21, 15, 7],
    stats: { charge: 4, strike: 2, health: 1 }, desc: 'A great curved battering horn. Doors optional.',
    draw(g, c) {
      const p = merge(
        smoothPath([[-7, 4], [-5, -4], [1, -12], [9, -18.5], [13.5, -18], [8, -10], [5.5, -2], [6.5, 4]]),
        polyPath([[4, 1], [12, -4], [7, 3.5]]),
      );
      fillShaded(g, p, horn, { ol: shade(horn, -0.62), y0: -18, y1: 4 });
      strokes(g, [[[-4.5, -1], [4.5, -0.5]], [[-1.5, -6.5], [5.5, -5.5]], [[3, -11.5], [8, -10.5]]], shade(horn, -0.3), 1.1);
      gloss(g, -1, -6, 2.4, 0.5);
    },
  }),
  P({
    id: 'w-antler', name: 'Branchy Antlers', category: 'weapon', tier: 3, cost: 150, snap: 'top', layer: 'front', paired: true, radius: 24, box: [-17, -27, 8, 6],
    stats: { charge: 3, pose: 2, charm: 2 }, desc: 'Handsome forked antlers for jousting and showing off.',
    draw(g, c) {
      const col = farC(c, '#dcc49a');
      g.save(); g.rotate(c.act * 0.35);
      fillShaded(g, antlerShape(false), col, { ol: shade(col, -0.62), y0: -24, y1: 3 });
      gloss(g, -3, -9, 1.6, 0.45);
      g.restore();
    },
  }),
  P({
    id: 'w-elder', name: 'Elder Antlers', category: 'weapon', tier: 4, cost: 250, snap: 'top', layer: 'front', paired: true, radius: 38, box: [-22, -38, 12, 7],
    stats: { charge: 5, pose: 3, health: 2 }, desc: 'Ancient glowing antlers. The whole forest steps aside.',
    draw(g, c) {
      const col = farC(c, '#e3cfa6');
      const tip = mix(c.colors.detail, '#9ff7ff', 0.5);
      const pulse = 0.7 + Math.sin(c.t * 2.5) * 0.3;
      g.save(); g.rotate(c.act * 0.35);
      fillShaded(g, antlerShape(true), col, { ol: shade(col, -0.62), y0: -32, y1: 4 });
      const tips: Pt[] = [[-8.4, -31.4], [7.2, -21], [-0.6, -30], [-18.3, -21.1], [-18.9, -35.3]];
      for (const [x, y] of tips.slice(0, c.far ? 0 : 2)) glow(g, x, y, 6, tip, 0.5 * pulse);
      dots(g, tips, 2, farC(c, tip));
      g.restore();
    },
  }),
  P({
    id: 'w-volcano', name: 'Venom Volcano', category: 'weapon', tier: 4, cost: 250, snap: 'any', layer: 'front', radius: 16, box: [-16, -10, 19, 10],
    stats: { spit: 5, strike: 3, health: 2 }, desc: 'Twin bubbling glands and an erupting nozzle. Kaboom of goo.',
    draw(g, c) {
      const goo = mix('#b6f03a', c.colors.detail, 0.12);
      const pulse = 1 + Math.sin(c.t * 2.6) * 0.05 + c.act * 0.15;
      fillShaded(g, ellipsePath(-6, 1, 7.5 * pulse, 6.5 * pulse), shade(goo, -0.15), { y0: -6, y1: 7 });
      fillShaded(g, polyPath([[0, -5], [10, -8], [14, -6.5], [14.5, 2.5], [10, 4], [0, 5]]), c.colors.coat, { y0: -8, y1: 5 });
      strokes(g, [[[5, -6], [5, 4.5]], [[9.5, -7.5], [9.5, 3.8]]], shade(c.colors.coat, -0.4), 1.2);
      fillShaded(g, ellipsePath(14.5, -2, 2.2, 5), shade(c.colors.coat, -0.1), { y0: -7, y1: 3 });
      g.fillStyle = shade(goo, -0.25); g.beginPath(); g.ellipse(15, -2, 1, 3.4, 0, 0, TAU); g.fill();
      fillShaded(g, ellipsePath(-1, 2.5, 6 * pulse, 5 * pulse), goo, { y0: -3, y1: 8 });
      const sp = c.act;
      if (sp > 0.05) fillShaded(g, merge(circlePath(17 + sp * 6, -2 - sp * 3, 1.6 + sp * 1.8), circlePath(19 + sp * 9, -1 + sp * 2, 1.2 + sp)), goo, { lw: 1.4, y0: -6, y1: 2 });
      dots(g, [[-7, -1], [-2, 1 + Math.sin(c.t * 3) * 1.2], [-4.5, 4]], 1.1, rgba('#ffffff', 0.5));
      gloss(g, -8, -3, 2.5, 0.55);
    },
  }),
];

// ======================================================================= DETAILS
const DETAILS: PartDef[] = [
  P({
    id: 'd-antennae', name: 'Feelers', category: 'detail', tier: 1, cost: 25, snap: 'top', layer: 'back', radius: 21, box: [-8, -21, 16, 6],
    stats: { sneak: 1, charm: 1 }, desc: 'Bobbly antennae that sense trouble (and snacks).',
    draw(g, c) {
      const sw = Math.sin(c.t * 2.2) * 1.6, up = c.act * 3;
      const one = (dx: number, s: number, col: string, bob: string) => {
        const pts: Pt[] = [[dx, 2], [dx + 1.5, -6], [dx + 5 + sw * s, -13 - up], [dx + 10 + sw * s, -16 - up]];
        tube(g, line(pts), 2.1, col);
        fillShaded(g, circlePath(pts[3][0], pts[3][1], 2.9), bob, { y0: pts[3][1] - 3, y1: pts[3][1] + 3 });
      };
      one(-4, 0.7, shade(c.colors.base, -0.3), shade(c.colors.detail, -0.3));
      one(0, 1, shade(c.colors.base, -0.05), c.colors.detail);
      gloss(g, 9.3 + sw, -17 - up, 1, 0.8);
    },
  }),
  P({
    id: 'd-leaftuft', name: 'Leafy Tuft', category: 'detail', tier: 1, cost: 25, snap: 'top', layer: 'back', radius: 16, box: [-12, -19, 11, 2],
    stats: { sneak: 2 }, desc: 'A sprig of leaves. Stand still and you’re a bush.',
    draw(g, c) {
      const lf = mix('#6cbf4a', c.colors.coat, 0.2);
      const sw = Math.sin(c.t * 1.6) * 0.06;
      const veins: Pt[][] = [];
      [[-2.35, 14, -0.08], [-1.6, 17, 0], [-0.85, 13, 0.08]].forEach(([a, L, d], i) => {
        const q = xf([[0, 0], [L * 0.35, -3], [L, 0], [L * 0.35, 3]], a + sw);
        fillShaded(g, smoothPath(q), i === 1 ? lf : shade(lf, -0.12 + d), { y0: -12, y1: 2 });
        veins.push(xf([[1, 0], [L * 0.85, 0]], a + sw));
      });
      strokes(g, veins, shade(lf, -0.4), 1);
    },
  }),
  P({
    id: 'd-frill', name: 'Ruffle Frill', category: 'detail', tier: 2, cost: 75, snap: 'top', layer: 'back', radius: 16, box: [-18, -14, 18, 11],
    stats: { charm: 2, pose: 2 }, desc: 'A pop-up neck frill. Flare it to impress.',
    draw(g, c) {
      const s = 1 + c.act * 0.35;
      const out: Pt[] = [], ribs: Pt[][] = [];
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI * 0.97 + (i / 10) * Math.PI * 0.94, r = (i % 2 ? 12.5 : 16) * s;
        out.push([Math.cos(a) * r, Math.sin(a) * r * 0.95 + 3]);
        if (i % 2 === 0) ribs.push([[0, 3], [Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.87 + 3]]);
      }
      out.push([0, 6]);
      fillShaded(g, smoothPath(out), c.colors.coat, { y0: -14, y1: 4 });
      fillShaded(g, ellipsePath(0, 3, 7 * s, 6 * s), shade(c.colors.detail, -0.05), { y0: -3, y1: 6 });
      strokes(g, ribs, shade(c.colors.coat, -0.35), 1.1);
    },
  }),
  P({
    id: 'd-fin', name: 'Sharky Fin', category: 'detail', tier: 2, cost: 75, snap: 'top', layer: 'back', radius: 21, box: [-14, -23, 16, 9],
    stats: { sprint: 2, speed: 1, strike: 1 }, desc: 'A sleek dorsal fin. Instantly 40% more menacing.',
    draw(g, c) {
      const sw = Math.sin(c.t * 1.5) * 0.6;
      g.save(); g.scale(1.3, 1.3);
      fillShaded(g, smoothPath([[10, 4], [6, -4], [0, -11], [-5 + sw, -16], [-4.5 + sw, -9], [-8, 4]]), c.colors.coat, { y0: -16, y1: 4 });
      fillShaded(g, smoothPath([[8, 1], [5, -4], [0, -9.5], [-3.6 + sw, -13.5], [1, -5], [3, 1]]), shade(c.colors.detail, -0.1), { lw: 1.2, y0: -14, y1: 1 });
      gloss(g, 2, -6, 1.6, 0.45);
      g.restore();
    },
  }),
  P({
    id: 'd-mane', name: 'Shaggy Mane', category: 'detail', tier: 2, cost: 75, snap: 'top', layer: 'back', radius: 20, box: [-26, -12, 25, 26],
    stats: { pose: 2, charm: 1, health: 1 }, desc: 'A big fluffy mane. Instant majesty.',
    draw(g, c) {
      // A shaggy crescent hugging the top of the body node (the body hides its inner edge).
      const R = Math.max(8, Math.min(26, c.nodeR)) + 5 + c.act * 2;
      const cy = c.nodeR * 0.85, pts: Pt[] = [[0, cy + R * 0.2]], curls: Pt[][] = [];
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI * 0.82 + (i / 14) * Math.PI * 1.36 + Math.sin(c.t * 2 + i) * 0.015, r = R + (i % 2 ? 0 : 3.4);
        pts.push([Math.cos(a) * r * 1.05, cy + Math.sin(a) * r]);
        if (i % 3 === 1) curls.push([[Math.cos(a) * (R - 3.5), cy + Math.sin(a) * (R - 3.5)], [Math.cos(a + 0.1) * (R + 0.5), cy + Math.sin(a + 0.1) * (R + 0.5)]]);
      }
      fillShaded(g, smoothPath(pts), c.colors.coat, { y0: cy - R, y1: cy + R * 0.3 });
      strokes(g, curls, shade(c.colors.coat, -0.35), 1.3);
    },
  }),
  P({
    id: 'd-shell', name: 'Turtle Shell', category: 'detail', tier: 3, cost: 150, snap: 'top', layer: 'front', radius: 20, box: [-21, -7, 21, 19],
    stats: { health: 5, sneak: 2 }, desc: 'A domed shell of plates. Hide inside when it gets scary.',
    draw(g, c) {
      const R = Math.max(8, Math.min(28, c.nodeR)) * 1.06 + 2, cy = c.nodeR * 0.85;
      const col = mix('#9a7a44', c.colors.coat, 0.35);
      const p = new Path2D();
      p.moveTo(-R * 1.12, cy + R * 0.12);
      p.ellipse(0, cy + R * 0.05, R * 1.12, R * 1.05, 0, Math.PI, TAU);
      p.lineTo(R * 1.12, cy + R * 0.12);
      p.quadraticCurveTo(0, cy + R * 0.32, -R * 1.12, cy + R * 0.12);
      fillShaded(g, p, col, { y0: cy - R, y1: cy + R * 0.3 });
      const ty = cy - R * 0.45;
      strokes(g, [
        [[-R * 0.38, ty], [R * 0.38, ty], [R * 0.52, cy - R * 0.02], [-R * 0.52, cy - R * 0.02], [-R * 0.38, ty]],
        [[-R * 0.38, ty], [-R * 0.62, cy - R * 0.84]], [[R * 0.38, ty], [R * 0.62, cy - R * 0.84]],
        [[-R * 0.52, cy - R * 0.02], [-R * 1.05, cy - R * 0.3]], [[R * 0.52, cy - R * 0.02], [R * 1.05, cy - R * 0.3]],
      ], shade(col, -0.45), 1.4);
      strokes(g, [[[-R * 1.08, cy + R * 0.14], [0, cy + R * 0.3], [R * 1.08, cy + R * 0.14]]], shade(col, 0.3), 1.6);
      gloss(g, -R * 0.35, cy - R * 0.75, R * 0.2, 0.4);
    },
  }),
  P({
    id: 'd-moss', name: 'Moss Cloak', category: 'detail', tier: 3, cost: 150, snap: 'top', layer: 'front', radius: 20, box: [-20, -14, 20, 17],
    stats: { sneak: 5, health: 2 }, desc: 'A shaggy coat of moss and sprigs. Perfect camouflage.',
    draw(g, c) {
      const R = Math.max(8, Math.min(28, c.nodeR)) + 2.5, cy = c.nodeR * 0.85;
      const col = mix('#5c9a3c', c.colors.coat, 0.15);
      const pts: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * 1.04 + (i / 12) * Math.PI * 0.92, r = R * (1 + ((i * 7) % 3) * 0.05);
        pts.push([Math.cos(a) * r * 1.08, cy + Math.sin(a) * r]);
      }
      for (let i = 0; i <= 6; i++) { const x = R * 1.0 - (i / 6) * R * 2.0; pts.push([x, cy - R * 0.1 + (i % 2 ? R * 0.28 : 0) + Math.sin(c.t * 2 + i) * 0.5]); }
      fillShaded(g, smoothPath(pts), col, { y0: cy - R, y1: cy + R * 0.2 });
      const sp = (x: number, a: number, s: number) => {
        const q = xf([[0, 0], [3, -2.2], [7, 0], [3, 2.2]], a, x, cy - R * 0.95 - Math.abs(x) * 0.15, s);
        fillShaded(g, smoothPath(q), shade(col, 0.2), { lw: 1.6, y0: cy - R - 8, y1: cy - R });
      };
      sp(-R * 0.4, -2.2, 1);
      sp(R * 0.2, -1.2, 1.15);
      dots(g, [[-R * 0.1, cy - R * 0.45], [R * 0.5, cy - R * 0.3], [-R * 0.65, cy - R * 0.2]], 1.4, shade(col, -0.3));
      dots(g, [[R * 0.32, cy - R * 0.98]], 1.6, '#ffd166');
    },
  }),
  P({
    id: 'd-lure', name: 'Lure Lantern', category: 'detail', tier: 4, cost: 250, snap: 'top', layer: 'back', radius: 25, box: [-7, -24, 24, 7],
    stats: { charm: 5, sing: 3, pose: 2 }, desc: 'A glowing lure on a stalk. Utterly irresistible.',
    draw(g, c) {
      const sw = Math.sin(c.t * 1.8) * 1.6;
      const lc = mix('#fff27a', c.colors.detail, 0.3);
      const pts: Pt[] = [[0, 3], [-2, -7], [2 + sw * 0.4, -16], [10 + sw, -20], [15 + sw, -16.5]];
      tube(g, line(pts), 2.6, shade(c.colors.base, -0.05));
      const bx = 15.5 + sw, by = -13;
      const pulse = 0.65 + Math.sin(c.t * 3.2) * 0.2 + c.act * 0.35;
      glow(g, bx, by, 9 + c.act * 5, lc, 0.6 * pulse);
      fillShaded(g, circlePath(bx, by, 3.8), lc, { y0: by - 4, y1: by + 4 });
      g.fillStyle = rgba('#ffffff', 0.9);
      g.beginPath(); g.arc(bx - 0.8, by - 0.8, 1.5, 0, TAU); g.fill();
    },
  }),
  P({
    id: 'd-sail', name: 'Sunsail', category: 'detail', tier: 4, cost: 250, snap: 'top', layer: 'back', radius: 29, box: [-21, -33, 20, 11],
    stats: { pose: 4, charm: 3, health: 3 }, desc: 'A towering spined sail that soaks up sun and stares.',
    draw(g, c) {
      const s = 1 + c.act * 0.15;
      const hs = [15, 23, 27, 23, 15];
      const out: Pt[] = [[-17, 6]], sp: Pt[][] = [], spots: Pt[] = [], tips = new Path2D();
      for (let i = 0; i < 5; i++) {
        const x = -13 + i * 6.5, h = hs[i] * s + Math.sin(c.t * 2 + i) * 0.6;
        out.push([x - 0.4, -h]);
        if (i < 4) out.push([x + 3.2, -(h + hs[i + 1] * s) * 0.4]);
        sp.push([[x + 0.6, 4], [x - 0.3, -h + 1]]);
        if (i < 4) spots.push([x + 3.2, -h * 0.55]);
        tips.moveTo(x - 1.6, -h + 1); tips.lineTo(x - 0.5, -h - 4); tips.lineTo(x + 0.8, -h + 1); tips.closePath();
      }
      out.push([17, 6]);
      fillShaded(g, tips, farC(c, bone), { ol: shade(bone, -0.62), lw: 1.6, y0: -32, y1: -10 });
      const sail = smoothPath(out);
      const gr = g.createLinearGradient(0, -28, 0, 6);
      gr.addColorStop(0, shade(c.colors.detail, -0.05));
      gr.addColorStop(0.45, c.colors.coat);
      gr.addColorStop(1, shade(c.colors.coat, -0.3));
      g.lineJoin = 'round'; g.strokeStyle = outlineOf(c.colors.coat); g.lineWidth = OUTLINE_W; g.stroke(sail);
      g.fillStyle = gr; g.fill(sail);
      strokes(g, sp, shade(c.colors.coat, -0.4), 1.4);
      dots(g, spots, 1.8, shade(c.colors.base, 0.1));
    },
  }),
];

// ======================================================================= WINGS
const WINGS: PartDef[] = [
  P({
    id: 'wg-buzz', name: 'Buzzy Wings', category: 'wing', tier: 1, cost: 50, snap: 'top', layer: 'back', paired: true, radius: 22, box: [-19, -18, 2, 2],
    stats: { glide: 1, dance: 1 }, desc: 'See-through bug wings. Bzzzz.',
    draw(g, c) {
      const buzz = c.act > 0.02 ? Math.sin(c.t * 60) * 0.45 : Math.sin(c.t * 9) * 0.04;
      const mem = mix('#c8f0ff', c.colors.coat, 0.3);
      const a0 = 0.75 + c.act * 0.7 + buzz + (c.far ? 0.35 : 0);
      for (let i = 0; i < 2; i++) {
        g.save(); g.rotate(a0 - i * 0.45);
        const L = i ? 18 : 23;
        const p = smoothPath([[0, 0], [-L * 0.35, -3.6], [-L * 0.85, -3.4], [-L, 0], [-L * 0.8, 2.6], [-L * 0.3, 2]]);
        g.fillStyle = rgba(mem, 0.6); g.fill(p);
        g.strokeStyle = shade(mem, -0.55); g.lineWidth = 1.6; g.stroke(p);
        strokes(g, [[[-1, 0], [-L * 0.9, -0.5]], [[-L * 0.4, -0.2], [-L * 0.7, -2.6]], [[-L * 0.5, -0.3], [-L * 0.75, 1.8]]], rgba(shade(mem, -0.5), 0.6), 0.8);
        g.restore();
      }
    },
  }),
  P({
    id: 'wg-leaf', name: 'Leafy Gliders', category: 'wing', tier: 2, cost: 100, snap: 'top', layer: 'back', paired: true, radius: 34, box: [-29, -30, 3, 2],
    stats: { glide: 3, sneak: 1 }, desc: 'Broad leaf wings. Drift down like an autumn leaf.',
    draw(g, c) {
      const lf = mix('#7bc950', c.colors.coat, 0.3);
      g.save(); g.rotate(0.75 + c.act * 0.75 + Math.sin(c.t * 1.4) * 0.04 + (c.far ? 0.35 : 0));
      fillShaded(g, smoothPath([[0, 0], [-7, -6.5], [-19, -9.5], [-31, -6.5], [-37, -1], [-29, 3.5], [-16, 4.5], [-6, 3]]), lf, { y0: -10, y1: 5 });
      strokes(g, [[[0, 0], [-18, -1.6], [-35, -1.2]], [[-9, -1], [-14, -6.5]], [[-17, -1.5], [-23, -7.5]], [[-25, -1.5], [-30, -5.5]], [[-12, -1.2], [-17, 3]], [[-21, -1.4], [-26, 2.6]]], shade(lf, -0.38), 1.1);
      gloss(g, -15, -5, 3, 0.3);
      g.restore();
    },
  }),
  P({
    id: 'wg-bat', name: 'Batty Wings', category: 'wing', tier: 3, cost: 175, snap: 'top', layer: 'back', paired: true, radius: 35, box: [-29, -34, 4, 4],
    stats: { glide: 4, sneak: 2, jump: 1 }, desc: 'Leathery night wings with a clawed thumb.',
    draw(g, c) {
      g.save(); g.rotate(0.55 + c.act * 0.8 + Math.sin(c.t * 1.2) * 0.04 + (c.far ? 0.35 : 0));
      const E: Pt = [-10, -11], T1: Pt = [-33, -14], T2: Pt = [-31, -2], T3: Pt = [-21, 6];
      fillShaded(g, smoothPath([[0, 1], [-4, -6], E, [-20, -14.5], T1, [-28, -8.5], T2, [-25, 0], T3, [-14, 2], [-5, 4]]), shade(c.colors.coat, -0.08), { y0: -15, y1: 6 });
      const bones = new Path2D();
      bones.moveTo(0, 0); bones.lineTo(E[0], E[1]);
      for (const t of [T1, T2, T3]) { bones.moveTo(E[0], E[1]); bones.lineTo(t[0], t[1]); }
      tube(g, bones, 1.8, shade(c.colors.base, -0.1));
      fillShaded(g, polyPath([[E[0] - 1, E[1] - 1], [E[0] + 2.5, E[1] - 5], [E[0] + 1.5, E[1] - 0.5]]), farC(c, claw), { lw: 1, flat: true });
      g.restore();
    },
  }),
  P({
    id: 'wg-plume', name: 'Grand Plumes', category: 'wing', tier: 4, cost: 275, snap: 'top', layer: 'back', paired: true, radius: 49, box: [-46, -35, 6, 3],
    stats: { glide: 5, jump: 2, charm: 2, pose: 1 }, desc: 'Magnificent layered feathers. Soar like royalty.',
    draw(g, c) {
      g.save(); g.rotate(0.6 + c.act * 0.75 + Math.sin(c.t * 1.3) * 0.04 + (c.far ? 0.35 : 0));
      const row = (n: number, x0: number, x1: number, y: number, L: number, w: number, tilt: number) => {
        const p = new Path2D();
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1), x = x0 + (x1 - x0) * t, a = Math.PI * 0.5 + tilt * (0.4 + t);
          const len = L * (0.75 + t * 0.4);
          const cx = x + Math.cos(a) * len * 0.5, cy = y + Math.sin(a) * len * 0.5;
          p.moveTo(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5);
          p.ellipse(cx, cy, len * 0.5, w, a, 0, TAU);
        }
        return p;
      };
      fillShaded(g, row(6, -6, -36, -6, 16, 3.4, 0.9), c.colors.coat, { y0: -8, y1: 12 });
      fillShaded(g, row(5, -4, -26, -9, 10, 3.2, 0.7), shade(c.colors.detail, -0.1), { y0: -10, y1: 4 });
      fillShaded(g, smoothPath([[2, -2], [-4, -10], [-18, -14], [-30, -11], [-26, -6], [-12, -4], [-2, 2]]), c.colors.base, { y0: -14, y1: 2 });
      gloss(g, -14, -10.5, 3.4, 0.35);
      g.restore();
    },
  }),
];

// ======================================================================= TAILS
const TAILS: PartDef[] = [
  P({
    id: 't-curly', name: 'Curly Q', category: 'tail', tier: 1, cost: 25, snap: 'back', layer: 'back', radius: 18, box: [-15, -20, 6, 5],
    stats: { dance: 1, charm: 1 }, desc: 'A springy corkscrew tail. Boing-boing.',
    draw(g, c) {
      g.save(); tailFrame(g, 0.35 + Math.sin(c.t * 5) * 0.12 + c.act * 0.3);
      tube(g, line(xf([[-1, 0], [5, -0.5], [9.5, -3.5], [10.5, -8], [7.5, -10], [4.5, -8], [5.5, -5], [8.5, -5.5]], 0, 0, 0, 1.2)), 4, c.colors.base);
      g.restore();
    },
  }),
  P({
    id: 't-fox', name: 'Fluffbrush', category: 'tail', tier: 2, cost: 75, snap: 'back', layer: 'back', radius: 35, box: [-37, -29, 3, 4],
    stats: { charm: 2, sneak: 2 }, desc: 'A big bushy tail with a snowy tip. Doubles as a blanket.',
    draw(g, c) {
      g.save(); tailFrame(g, 0.35 + Math.sin(c.t * 2.6) * 0.1 + c.act * 0.3);
      // Fluffy silhouette: a spine curve with a zig-zag fur edge on both sides.
      const sp: Pt[] = [[0, -0.5], [7, -3], [14, -6], [21, -8], [27, -8.5], [32, -7]];
      const wd = [3, 5.5, 7.5, 8.5, 8, 5.5];
      const up: Pt[] = [], dn: Pt[] = [];
      sp.forEach(([x, y], i) => { const z = i % 2 ? 1.6 : 0; up.push([x - z, y - wd[i] - z]); dn.push([x + z, y + wd[i] * 0.8 + z]); });
      const fluff = smoothPath([...up, [37, -7], ...dn.reverse()]);
      fillShaded(g, fluff, c.colors.coat, { y0: -16, y1: 4 });
      g.save(); g.clip(fluff);
      g.fillStyle = c.colors.detail;
      g.beginPath(); g.ellipse(36, -7.5, 9.5, 12, 0.2, 0, TAU); g.fill();
      g.restore();
      strokes(g, [[[29, -15], [26, -10], [28, -1]]], outlineOf(c.colors.coat), 1.4);
      strokes(g, [[[8, -3.5], [14, -6]], [[13, 0], [19, -3]], [[17, -9], [22, -11]]], shade(c.colors.coat, -0.35), 1.1);
      g.restore();
    },
  }),
  P({
    id: 't-fish', name: 'Swish Fin', category: 'tail', tier: 2, cost: 75, snap: 'back', layer: 'back', radius: 29, box: [-32, -21, 4, 8],
    stats: { sprint: 2, speed: 1, dance: 1 }, desc: 'A finned tail for a quick swish and a splashy getaway.',
    draw(g, c) {
      const sw = Math.sin(c.t * 4) * 0.15 + c.act * 0.25;
      g.save(); tailFrame(g, 0.1 + sw * 0.5);
      fillShaded(g, taper([[0, 0], [8, -1], [15, -1.5 - sw * 2]], 10, 5), c.colors.base, { y0: -6, y1: 5 });
      g.translate(16, -1.5 - sw * 2); g.rotate(-sw);
      fillShaded(g, smoothPath([[-2, 0], [6, -6], [12, -11], [9, -2], [8, 0], [9, 2], [12, 10], [6, 5]]), c.colors.coat, { y0: -11, y1: 10 });
      strokes(g, [[[0, 0], [10, -8]], [[0, 0], [8, -1]], [[0, 0], [8, 1]], [[0, 0], [10, 7.5]]], shade(c.colors.coat, -0.35), 1);
      g.restore();
    },
  }),
  P({
    id: 't-fan', name: 'Peacock Fan', category: 'tail', tier: 3, cost: 150, snap: 'back', layer: 'back', radius: 29, box: [-31, -30, 2, 3],
    stats: { charm: 4, pose: 3 }, desc: 'A fan of eye-spotted plumes. Pop it open and dazzle.',
    draw(g, c) {
      const open = 0.25 + c.act * 0.75;
      g.save(); g.scale(-1, 1);
      const fe = new Path2D(), ey: Pt[] = [], pu: Pt[] = [], st: Pt[][] = [];
      for (let i = 0; i < 7; i++) {
        const a = -0.15 - (i / 6) * (0.9 + open * 1.0), L = 22 + (i % 2) * 3;
        const tx = Math.cos(a) * L, ty = Math.sin(a) * L;
        fe.moveTo(tx + Math.cos(a) * 5, ty + Math.sin(a) * 5);
        fe.ellipse(tx, ty, 5.6, 4, a, 0, TAU);
        ey.push([tx + Math.cos(a) * 0.6, ty + Math.sin(a) * 0.6]);
        pu.push([tx + Math.cos(a) * 1, ty + Math.sin(a) * 1]);
        st.push([[0, 0], [tx - Math.cos(a) * 4, ty - Math.sin(a) * 4]]);
      }
      strokes(g, st, shade(c.colors.coat, -0.3), 1.6);
      fillShaded(g, fe, c.colors.coat, { y0: -28, y1: 2 });
      dots(g, ey, 2.4, c.colors.detail);
      dots(g, pu, 1.3, mix(c.colors.coat, '#1d3a8a', 0.6));
      g.restore();
    },
  }),
  P({
    id: 't-club', name: 'Thwack Club', category: 'tail', tier: 3, cost: 150, snap: 'back', layer: 'back', radius: 30, box: [-34, -17, 4, 6],
    stats: { strike: 5, health: 2 }, desc: 'A stiff armoured tail ending in a bony club. Thwack!',
    draw(g, c) {
      g.save(); tailFrame(g, 0.15 + Math.sin(c.t * 1.5) * 0.06 + c.act * 0.55);
      fillShaded(g, taper([[0, 0], [10, -1.5], [20, -2.5]], 9, 5), c.colors.base, { y0: -6, y1: 5 });
      strokes(g, [[[7, -4.6], [7.6, 3.4]], [[13, -4.6], [13.4, 2.4]]], c.colors.coat, 2);
      const club = merge(ellipsePath(25, -2.5, 6.8, 5.4), circlePath(24, -7.6, 2.2), circlePath(29.5, -6, 2.2), circlePath(29.5, 1.5, 2.2), circlePath(24, 2.6, 2));
      fillShaded(g, club, bone, { ol: shade(bone, -0.62), y0: -9, y1: 4 });
      gloss(g, 23, -4.5, 2.2, 0.55);
      g.restore();
    },
  }),
  P({
    id: 't-stinger', name: 'Zinger Stinger', category: 'tail', tier: 3, cost: 150, snap: 'back', layer: 'back', radius: 26, box: [-18, -30, 13, 5],
    stats: { spit: 4, strike: 3 }, desc: 'A segmented scorpion tail with a dripping barb. Zing!',
    draw(g, c) {
      const k = c.act;
      g.save(); g.scale(-1, 1);
      const pts: Pt[] = [[2, 0], [9, -4], [13, -11.5], [11.5, -19.5 + k * 1.5], [5.5 - k * 2, -24.5 + k * 2], [-2 - k * 5, -25 + k * 4]];
      for (let i = 0; i < 5; i++) {
        const [x, y] = pts[i], [nx, ny] = pts[i + 1];
        fillShaded(g, ellipsePath((x + nx) / 2, (y + ny) / 2, Math.hypot(nx - x, ny - y) * 0.62, 4.6 - i * 0.45, Math.atan2(ny - y, nx - x)), i % 2 ? shade(c.colors.coat, -0.08) : c.colors.coat, { y0: -26, y1: 4 });
      }
      const [bx, by] = pts[5];
      fillShaded(g, ellipsePath(bx, by + 1, 4.2, 3.4, 0.5), mix(c.colors.detail, '#c9f06a', 0.3), { y0: by - 3, y1: by + 4 });
      fillShaded(g, smoothPath([[bx - 2.5, by + 2.5], [bx - 6.5, by + 5.5], [bx - 9, by + 9.5], [bx - 4, by + 4.5]]), farC(c, claw), { y0: by, y1: by + 9 });
      dots(g, [[bx - 9, by + 11 + Math.abs(Math.sin(c.t * 2)) * 1.5]], 1, '#b6f03a');
      g.restore();
    },
  }),
  P({
    id: 't-monkey', name: 'Swingaling', category: 'tail', tier: 4, cost: 250, snap: 'back', layer: 'back', radius: 31, box: [-25, -32, 5, 5],
    stats: { dance: 4, jump: 3, sneak: 2, grasp: 1 }, desc: 'A long curling tail for swinging, balancing and grooving.',
    draw(g, c) {
      g.save(); tailFrame(g, 0.25 + Math.sin(c.t * 1.8) * 0.12 + c.act * 0.3);
      const cu = Math.sin(c.t * 2.4) * 1.2;
      const pts: Pt[] = [[0, 0], [8, 0.5], [16, -2.5], [22, -8.5], [24, -16], [21 + cu * 0.3, -21], [16 + cu * 0.5, -21.5], [13.5 + cu * 0.5, -17.5], [16.5 + cu * 0.3, -14.5]];
      tube(g, line(pts), 3.4, c.colors.base);
      strokes(g, [[[9, -1.9], [8, 2]], [[17, -4.6], [15, -1]], [[21.5, -11], [18.2, -9.5]]], c.colors.coat, 1.6);
      g.restore();
    },
  }),
];

export const CREATURE_EXTRA: PartDef[] = [...MOUTHS, ...EYES, ...LEGS, ...ARMS, ...WEAPONS, ...DETAILS, ...WINGS, ...TAILS];
registerParts(CREATURE_EXTRA);
