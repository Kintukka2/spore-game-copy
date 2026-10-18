// Tribal outfit catalogue: hats, masks, chest pieces, shoulder pieces and trinkets worn over a creature.
// These are kind 'creature' parts in outfit categories; the Tribal Outfitter adds them on top of the
// (locked) species design. Stats: gather / combat / social / health, 1–3 each; tiers 1–3; cost 10–60 food.
//
// Sizing: pieces are drawn in fixed units and scaled by the attach node's radius, so they fit any body.
//   Head pieces use a reference head radius of 12 (scale k = nodeR / 12).
//   Body pieces use a reference body radius of 14 (scale k = nodeR / 14).
// Default placements (editor autoPlace) put the anchor at:
//   hat      head node (0, -0.9r)      → head centre at (0, 10.8) in hat units
//   mask     head node (0.3r, -0.1r)   → head centre at (-3.6, 1.2), default eye near (-2.4, -4.2)
//   chest    neck node (0.3r, 0.1r)    → node centre at (-4.2, -1.4)
//   shoulder neck node (0, -0.7r)      → node centre at (0, 9.8)
//   trinket  neck node (0.5r, 0.3r)    → hangs in front of the belly
import { registerParts } from '../registry';
import { luminance, mix, outlineOf, rgba, shade } from '../color';
import { bone, circlePath, ellipsePath, fillShaded, gloss, horn, OUTLINE_W, polyPath, smoothPath } from '../partkit';
import type { PartDef, PartDrawCtx } from '../types';
import { TAU } from '../../engine/math';
import { dots, fitThumb, glow, line, merge, strokes, taper, toothRow, tube, xf, type PartBox, type Pt } from './creature-extra';

type G = CanvasRenderingContext2D;

const O = (d: Omit<PartDef, 'kind'> & { box?: PartBox }): PartDef => {
  const { box, ...rest } = d;
  return fitThumb({ kind: 'creature', ...rest }, box);
};

// Natural tribal materials and pigments.
const OCHRE = '#c8553d';
const SUN = '#e9b949';
const TEAL = '#2a9d8f';
const STRAW = '#e2c27a';
const LEAF = '#6cbf4a';
const WOOD = '#a0683a';
const LEATHER = '#8a5a35';
const FUR = '#9a7458';
const SHELL = '#f6c6b8';
const INK = '#1a1410';

const clampK = (v: number) => Math.max(0.6, Math.min(2.2, v));
const headK = (c: PartDrawCtx) => clampK(c.nodeR / 12);
const bodyK = (c: PartDrawCtx) => clampK(c.nodeR / 14);

// Head reference: radius 12, centre 10.8 below a hat's anchor.
const HR = 12, HC = 10.8;
const onHead = (a: number, r = HR): Pt => [Math.cos(a) * r, HC + Math.sin(a) * r];
// Mask reference: head centre and default eye.
const MC: Pt = [-3.6, 1.2], EYE: Pt = [-2.4, -4.2];
// Body reference radius 14.
const BR = 14;
const CHEST: Pt = [-4.2, -1.4];
const SHOULDER: Pt = [0, 9.8];

/** Feather outline pointing along angle a from (x, y). */
function featherPath(x: number, y: number, a: number, L: number, w: number): Path2D {
  return smoothPath(xf([[0, 0], [L * 0.3, -w], [L * 0.8, -w * 0.75], [L, 0], [L * 0.8, w * 0.75], [L * 0.3, w]], a, x, y));
}
function feather(g: G, x: number, y: number, a: number, L: number, w: number, col: string) {
  fillShaded(g, featherPath(x, y, a, L, w), col, { y0: y - L, y1: y + 3 });
  const [[sx, sy], [ex, ey]] = xf([[0.5, 0], [L * 0.9, 0]], a, x, y);
  strokes(g, [[[sx, sy], [ex, ey]]], shade(col, -0.35), 0.9);
}

/** Leaf (lens) shape pointing along angle a. */
function leafPath(x: number, y: number, a: number, L: number, w: number): Path2D {
  return smoothPath(xf([[0, 0], [L * 0.35, -w], [L, 0], [L * 0.35, w]], a, x, y));
}

/** Scallop shell fanning out along angle a from its hinge at (x, y). */
function scallop(p: Path2D, ribs: Pt[][], x: number, y: number, a: number, s: number) {
  const pts: Pt[] = [[x, y]];
  for (let j = 0; j <= 8; j++) {
    const an = a - 0.85 + (j / 8) * 1.7, r = s * (j % 2 ? 0.86 : 1);
    pts.push([x + Math.cos(an) * r, y + Math.sin(an) * r]);
    if (j % 2 === 0 && j > 0 && j < 8) ribs.push([[x, y], [x + Math.cos(an) * r * 0.85, y + Math.sin(an) * r * 0.85]]);
  }
  p.addPath(smoothPath(pts));
}

/** fillShaded variant using the even-odd rule, so inner sub-paths become holes (mask eye holes). */
function fillShadedEO(g: G, path: Path2D, color: string, y0: number, y1: number) {
  g.lineJoin = 'round';
  g.strokeStyle = outlineOf(color);
  g.lineWidth = OUTLINE_W;
  g.stroke(path);
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, shade(color, 0.28));
  gr.addColorStop(0.55, color);
  gr.addColorStop(1, shade(color, -0.25));
  g.fillStyle = gr;
  g.fill(path, 'evenodd');
}

/** Point on a quadratic curve. */
function qpt(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
}

// Necklace curve on the chest node: from the top of the neck down to the front of the chest.
const NK0: Pt = [-6.5, -14.4], NKC: Pt = [-2, 5], NK1: Pt = [9.4, 5.2];

/** Trinkets swing gently on their cord (and jiggle during actions). */
function swing(g: G, c: PartDrawCtx) {
  g.translate(-2, -9);
  g.rotate(Math.sin(c.t * 2.4) * 0.1 + Math.sin(c.t * 22) * 0.12 * c.act);
  g.translate(2, 9);
}
const cord = (g: G) => strokes(g, [[[-2, -9], [-1, -4], [0, -0.5]]], shade(LEATHER, -0.3), 1.3);

// ======================================================================= HATS
const HATS: PartDef[] = [
  O({
    id: 'o-feather-band', name: 'Feather Fancy', category: 'hat', tier: 1, cost: 15, snap: 'top', layer: 'top', radius: 23, box: [-21, -24, 18, 10],
    stats: { social: 1 }, desc: 'A headband with three bright feathers. Instant flair.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      const sw = Math.sin(c.t * 2.2) * 0.06 + c.act * 0.15;
      const [bx, by] = onHead(-2.0, HR * 1.12);
      feather(g, bx, by, -2.3 + sw, 14, 3, c.colors.coat);
      feather(g, bx, by, -1.9 + sw, 18, 3.4, mix(OCHRE, c.colors.detail, 0.1));
      feather(g, bx, by, -1.5 + sw, 12, 2.8, mix(SUN, c.colors.detail, 0.25));
      const band = new Path2D(); band.arc(0, HC, HR * 1.1, -2.65, -0.6);
      tube(g, band, 2.6, mix(OCHRE, c.colors.coat, 0.35));
      dots(g, [-2.35, -1.85, -1.35, -0.9].map((a) => onHead(a, HR * 1.1)), 1.1, SUN);
      g.restore();
    },
  }),
  O({
    id: 'o-leaf-cap', name: 'Leaf Lid', category: 'hat', tier: 1, cost: 10, snap: 'top', layer: 'top', radius: 20, box: [-25, -8, 20, 13],
    stats: { gather: 1 }, desc: 'One big leaf, worn with pride. Keeps the sun off while foraging.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      const lf = mix(LEAF, c.colors.coat, 0.15);
      const outer = [-2.8, -2.35, -1.85, -1.35, -0.85, -0.45];
      const pts: Pt[] = outer.map((a) => onHead(a, HR * 1.32));
      pts.push([Math.cos(-0.2) * HR * 1.25, HC + Math.sin(-0.2) * HR * 1.25 + 1.5]);
      for (const a of [...outer].reverse()) pts.push(onHead(a, HR * 1.0));
      tube(g, line([onHead(-2.75, HR * 1.15), [-HR * 1.42, HC - HR * 0.55], [-HR * 1.35, HC - HR * 0.9]]), 1.6, shade(lf, -0.15));
      fillShaded(g, smoothPath(pts), lf, { y0: HC - HR * 1.2, y1: HC - HR * 0.4 });
      const rib = new Path2D(); rib.arc(0, HC, HR * 1.15, -2.7, -0.35);
      g.strokeStyle = shade(lf, -0.4); g.lineWidth = 1.1; g.stroke(rib);
      strokes(g, [-2.2, -1.7, -1.2, -0.7].map((a) => [onHead(a + 0.14, HR * 1.28), onHead(a, HR * 1.15), onHead(a + 0.14, HR * 1.03)]), shade(lf, -0.4), 0.9);
      gloss(g, -3, HC - HR * 1.24, 2.4, 0.35);
      g.restore();
    },
  }),
  O({
    id: 'o-straw-hat', name: 'Straw Sunhat', category: 'hat', tier: 2, cost: 30, snap: 'top', layer: 'top', radius: 18, box: [-22, -17, 21, 6],
    stats: { gather: 2, health: 1 }, desc: 'A wide woven brim for long days in the berry patch.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k); g.translate(-0.5, -2.6); g.rotate(-0.1);
      const st = mix(STRAW, c.colors.detail, 0.15);
      fillShaded(g, ellipsePath(0, 2.2, 16.5, 3.6), shade(st, -0.06), { y0: -1, y1: 6 });
      fillShaded(g, smoothPath([[-8, 2.6], [-7.6, -5], [-3, -9.8], [3, -9.8], [7.6, -5], [8, 2.6]]), st, { y0: -10, y1: 3 });
      strokes(g, [[[-7.2, -4.4], [7.2, -4.4]], [[-5, -7.6], [5, -7.6]], [[-13, 2.8], [-15, 3.8]], [[-6.5, 4.4], [-7, 5.6]], [[4, 4.8], [4.4, 5.8]], [[11.5, 3.2], [13.5, 4.2]]], shade(st, -0.35), 0.9);
      fillShaded(g, polyPath([[-7.9, -1.8], [7.9, -1.8], [8.1, 1.6], [-8.1, 1.6]]), mix(OCHRE, c.colors.coat, 0.4), { y0: -2, y1: 2 });
      fillShaded(g, merge(leafPath(-6, -1, -2.6, 7, 2.4), leafPath(-6, -1, -2.1, 6, 2.2)), LEAF, { lw: 1.6, y0: -6, y1: 0 });
      dots(g, [[-6, -0.5]], 1.6, '#e85d75');
      g.restore();
    },
  }),
  O({
    id: 'o-flower-crown', name: 'Bloom Crown', category: 'hat', tier: 2, cost: 25, snap: 'top', layer: 'top', radius: 16, box: [-19, -10, 20, 10],
    stats: { social: 2 }, desc: 'A ring of fresh flowers. Everybody wants to be your friend.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      const band = new Path2D(); band.arc(0, HC, HR * 1.1, -2.7, -0.5);
      tube(g, band, 1.8, mix(LEAF, c.colors.coat, 0.25));
      const [l1x, l1y] = onHead(-2.55, HR * 1.1), [l2x, l2y] = onHead(-0.65, HR * 1.1);
      fillShaded(g, merge(leafPath(l1x, l1y, -2.2, 6, 2), leafPath(l2x, l2y, -0.6, 6, 2)), LEAF, { lw: 1.6, y0: -6, y1: 6 });
      const cols = ['#ff8fb8', '#fff6e8', '#ffd166', '#c9a7ff'];
      const centres: Pt[] = [];
      [-2.3, -1.8, -1.3, -0.8].forEach((a, i) => {
        const [x, y] = onHead(a, HR * 1.16);
        const bob = Math.sin(c.t * 2 + i) * 0.3;
        const p = new Path2D();
        for (let j = 0; j < 5; j++) {
          const pa = (j / 5) * TAU + i, px = x + Math.cos(pa) * 2.3, py = y + bob + Math.sin(pa) * 2.3;
          p.moveTo(px + 2, py); p.arc(px, py, 2, 0, TAU);
        }
        fillShaded(g, p, mix(cols[i], c.colors.detail, 0.12), { lw: 1.5, y0: y - 4, y1: y + 4 });
        centres.push([x, y + bob]);
      });
      dots(g, centres, 1.3, '#f4a62a');
      g.restore();
    },
  }),
  O({
    id: 'o-bone-helm', name: 'Bone Helm', category: 'hat', tier: 2, cost: 40, snap: 'top', layer: 'top', radius: 17, box: [-19, -18, 18, 12],
    stats: { combat: 2, health: 1 }, desc: 'A horned skull cap. Bonks back.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      const hornL = taper([onHead(-2.15, HR * 1.12), onHead(-2.25, HR * 1.45), [-HR * 0.95, HC - HR * 1.7], [-HR * 0.6, HC - HR * 1.9]], 4.2, 1.4);
      const hornR = taper([onHead(-1.25, HR * 1.12), onHead(-1.2, HR * 1.45), [HR * 0.5, HC - HR * 1.75], [HR * 0.2, HC - HR * 1.95]], 4.2, 1.4);
      fillShaded(g, merge(hornL, hornR), horn, { ol: shade(horn, -0.62), y0: -14, y1: 0 });
      const cap: Pt[] = [-2.95, -2.45, -1.9, -1.3, -0.75, -0.35].map((a) => onHead(a, HR * 1.2));
      cap.push(onHead(-0.45, HR * 0.98), onHead(-1.0, HR * 0.95), onHead(-1.6, HR * 0.92), onHead(-2.2, HR * 0.94), onHead(-2.8, HR * 0.98));
      fillShaded(g, smoothPath(cap), bone, { ol: shade(bone, -0.62), y0: HC - HR * 1.2, y1: HC - HR * 0.6 });
      strokes(g, [[onHead(-1.65, HR * 1.18), onHead(-1.55, HR * 1.06), onHead(-1.66, HR * 0.97)]], shade(bone, -0.4), 1);
      dots(g, [onHead(-2.3, HR * 1.04), onHead(-1.6, HR * 1.02), onHead(-0.9, HR * 1.03)], 1, shade(bone, -0.5));
      gloss(g, -3, HC - HR * 1.1, 2.6, 0.5);
      g.restore();
    },
  }),
  O({
    id: 'o-shell-tiara', name: 'Shell Tiara', category: 'hat', tier: 2, cost: 35, snap: 'top', layer: 'top', radius: 15, box: [-18, -12, 17, 9],
    stats: { social: 1, health: 2 }, desc: 'Seashells on a golden cord, gathered from the shore.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      const band = new Path2D(); band.arc(0, HC, HR * 1.1, -2.6, -0.6);
      tube(g, band, 1.8, SUN);
      const sh = new Path2D(), ribs: Pt[][] = [];
      [[-2.05, 4.2], [-1.55, 5.6], [-1.05, 4.2]].forEach(([a, s]) => { const [x, y] = onHead(a, HR * 1.1); scallop(sh, ribs, x, y, a, s); });
      fillShaded(g, sh, mix(SHELL, c.colors.detail, 0.2), { y0: HC - HR - 6, y1: HC - HR + 2 });
      strokes(g, ribs, shade(SHELL, -0.3), 0.9);
      dots(g, [-2.35, -1.8, -1.3, -0.8].map((a) => onHead(a, HR * 1.1)), 1.2, '#fffaf2');
      g.restore();
    },
  }),
  O({
    id: 'o-plume-crest', name: 'Chief Plumes', category: 'hat', tier: 3, cost: 60, snap: 'top', layer: 'top', radius: 28, box: [-22, -33, 17, 9],
    stats: { social: 3, combat: 1 }, desc: 'A towering fan of plumes. Only the boldest wear it.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      const [bx, by] = onHead(-1.75, HR * 1.08);
      const lens = [17, 21, 24, 25, 23, 20, 16];
      const A = new Path2D(), B = new Path2D(), tips = new Path2D(), shafts: Pt[][] = [];
      const lift = c.act * 0.12;
      lens.forEach((L, i) => {
        const a = -2.6 + (i / 6) * 1.7 + Math.sin(c.t * 1.8 + i) * 0.02 - lift * (3 - i) * 0.3;
        (i % 2 ? B : A).addPath(featherPath(bx, by, a, L, 3.3));
        tips.addPath(smoothPath(xf([[L * 0.74, -2.4], [L, 0], [L * 0.74, 2.4], [L * 0.82, 0]], a, bx, by)));
        shafts.push(xf([[2, 0], [L * 0.75, 0]], a, bx, by));
      });
      fillShaded(g, A, mix(SUN, c.colors.detail, 0.2), { y0: -18, y1: 8 });
      fillShaded(g, B, mix(OCHRE, c.colors.coat, 0.2), { y0: -18, y1: 8 });
      g.fillStyle = '#2b2320'; g.fill(tips);
      strokes(g, shafts, rgba('#000000', 0.25), 0.9);
      const band = new Path2D(); band.arc(0, HC, HR * 1.1, -2.55, -0.7);
      tube(g, band, 2.8, mix(TEAL, c.colors.coat, 0.2));
      dots(g, [-2.35, -1.85, -1.35, -0.9].map((a) => onHead(a, HR * 1.1)), 1.2, SUN);
      dots(g, [-2.1, -1.6, -1.1].map((a) => onHead(a, HR * 1.1)), 1.2, '#fff6e8');
      g.restore();
    },
  }),
];

// ======================================================================= MASKS
const eyeHole = (p: Path2D, r: number) => { p.moveTo(EYE[0] + r, EYE[1]); p.arc(EYE[0], EYE[1], r, 0, TAU); };

const MASKS: PartDef[] = [
  O({
    id: 'o-war-paint', name: 'War Paint', category: 'mask', tier: 1, cost: 10, snap: 'head-front', layer: 'top', radius: 14, box: [-17, -11, 10, 11],
    stats: { combat: 1 }, desc: 'Bold stripes of clay. Look fierce, feel fierce.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      if (c.thumb) {
        g.fillStyle = 'rgba(255,255,255,0.1)';
        g.beginPath(); g.arc(MC[0], MC[1], HR, 0, TAU); g.fill();
      }
      g.beginPath(); g.arc(MC[0], MC[1], HR - 0.5, 0, TAU); g.clip();
      const paint = luminance(c.colors.base) > 0.6 ? '#b8352a' : '#f4efe4';
      strokes(g, [[[-12, 2.5], [-10, 7.5]], [[-9, 2.2], [-7, 7.8]], [[-6, 2], [-4, 7.6]]], paint, 2.3);
      strokes(g, [[[-13, -5], [-9.5, -4.6]], [[4, -8.5], [7, -6.5]]], paint, 2.3);
      dots(g, [[4.6, -3.2], [6.4, -1.4]], 1.2, paint);
      g.restore();
    },
  }),
  O({
    id: 'o-beak-mask', name: 'Beak Visor', category: 'mask', tier: 1, cost: 20, snap: 'head-front', layer: 'top', radius: 24, box: [-27, -16, 21, 4],
    stats: { gather: 1, social: 1 }, desc: 'A painted bird mask with a long beak. Peck, peck.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      const mk = mix(TEAL, c.colors.coat, 0.2);
      feather(g, -10, -5, -2.75, 12, 2.6, mix(OCHRE, c.colors.detail, 0.15));
      feather(g, -10, -3.5, -3.05, 10, 2.4, mix(SUN, c.colors.detail, 0.25));
      fillShaded(g, smoothPath([[2, -7], [9, -5], [16, -1.2], [9, -0.4], [2, -1]]), mix(SUN, '#f08a2a', 0.35), { y0: -7, y1: 0 });
      const p = smoothPath([[-11, -5], [-7, -10.8], [0.5, -10.6], [5.5, -6], [4, 0.2], [-3, 1.8], [-9.5, 0.5]]);
      eyeHole(p, 4.2);
      fillShadedEO(g, p, mk, -11, 2);
      strokes(g, [[[-8.5, -7.5], [-7, -9.2]], [[-9, -3], [-7.4, -1.6]], [[2, -8.8], [3.6, -7.2]]], shade(mk, 0.45), 1.3);
      g.restore();
    },
  }),
  O({
    id: 'o-tiki-mask', name: 'Tiki Grin', category: 'mask', tier: 2, cost: 35, snap: 'head-front', layer: 'top', radius: 15, box: [-14, -17, 15, 13],
    stats: { social: 2, combat: 1 }, desc: 'A carved wooden face with a big friendly grin.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      const wd = mix(WOOD, c.colors.coat, 0.15);
      const p = smoothPath([[-8.5, -11.5], [2, -12.5], [7.5, -8.5], [8, -1.5], [10.5, 2], [8.5, 7.5], [-1, 9.5], [-8.5, 6.5], [-10, -3]]);
      eyeHole(p, 3.9);
      fillShadedEO(g, p, wd, -12, 10);
      g.strokeStyle = mix(TEAL, c.colors.detail, 0.2); g.lineWidth = 1.6;
      g.beginPath(); g.arc(EYE[0], EYE[1], 5.3, 0, TAU); g.stroke();
      fillShaded(g, ellipsePath(8.6, 0.6, 2.6, 2.3), shade(wd, 0.12), { lw: 1.6, y0: -2, y1: 3 });
      g.fillStyle = '#2b1810';
      g.beginPath(); g.moveTo(-6.5, 3); g.quadraticCurveTo(1, 10, 8, 3.4); g.quadraticCurveTo(1, 5.8, -6.5, 3); g.fill();
      strokes(g, [[[-3, 4.6], [-3, 6.4]], [[0.2, 5.1], [0.2, 7.3]], [[3.4, 4.9], [3.4, 6.7]]], bone, 1.5);
      strokes(g, [[[-7.5, -9.8], [-5.5, -11.2], [-3.5, -9.8], [-1.5, -11.2], [0.5, -9.8], [2.5, -11.2], [4.5, -9.6]]], mix(OCHRE, c.colors.detail, 0.15), 1.4);
      g.restore();
    },
  }),
  O({
    id: 'o-skull-mask', name: 'Skull Mask', category: 'mask', tier: 2, cost: 40, snap: 'head-front', layer: 'top', radius: 14, box: [-14, -17, 17, 11],
    stats: { combat: 2, social: 1 }, desc: 'The bleached skull of a long-gone beast. Spooky.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      fillShaded(g, smoothPath([[-9.5, -9], [-1, -12.8], [6, -9.5], [8.5, -3.8], [12.5, -1.2], [12, 3], [6, 4.4], [3, 7.6], [-4, 7.2], [-9.5, 2]]), bone, { ol: shade(bone, -0.62), y0: -12, y1: 7 });
      g.fillStyle = '#2b2320';
      g.beginPath(); g.ellipse(EYE[0], EYE[1], 4.2, 4.8, 0.1, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(8.6, -2.6); g.lineTo(10.6, 0.6); g.lineTo(7.6, 0.8); g.closePath(); g.fill();
      const pulse = 0.6 + Math.sin(c.t * 3) * 0.25;
      glow(g, EYE[0] + 0.6, EYE[1], 4, '#ffb03a', 0.7 * pulse);
      dots(g, [[EYE[0] + 0.6, EYE[1]]], 1.3, '#ffd27a');
      toothRow(g, 1, 11, 4.2, 2.4, 1);
      strokes(g, [[[-4, -11.8], [-3, -8.8], [-5, -7.2]], [[3, 6.6], [1.6, 4.8]]], shade(bone, -0.4), 1);
      g.restore();
    },
  }),
  O({
    id: 'o-spirit-mask', name: 'Spirit Face', category: 'mask', tier: 3, cost: 60, snap: 'head-front', layer: 'top', radius: 23, box: [-26, -26, 23, 16],
    stats: { combat: 3, social: 2 }, desc: 'A sunburst war mask with tusks. Rivals think twice.',
    draw(g, c) {
      const k = headK(c);
      g.save(); g.scale(k, k);
      const cx = -1, cy = -1.5;
      const A = new Path2D(), B = new Path2D();
      const spread = 1 + c.act * 0.12;
      for (let i = 0; i < 9; i++) {
        const a = -3.4 + (i / 8) * 3.1, L = (i % 2 ? 17 : 20) * spread;
        (i % 2 ? B : A).addPath(polyPath(xf([[8, -2.6], [L, 0], [8, 2.6]], a, cx, cy)));
      }
      fillShaded(g, A, mix(OCHRE, c.colors.coat, 0.15), { y0: -20, y1: 8 });
      fillShaded(g, B, mix(SUN, c.colors.detail, 0.2), { y0: -20, y1: 8 });
      const face = smoothPath([[-9, -10], [1, -12], [7.5, -8.5], [8.5, -2], [11, 1.5], [8.5, 7], [-1, 9], [-9, 6], [-10.5, -2]]);
      eyeHole(face, 3.9);
      fillShadedEO(g, face, '#efe6d6', -12, 9);
      strokes(g, [[[-9.5, -0.5], [-5.6, -1.2]], [[1, -1.6], [7.6, -2]]], TEAL, 2.4);
      strokes(g, [[[-7, 2.5], [-5, 7.5]], [[-3.5, 3], [-1.6, 8]]], OCHRE, 2);
      fillShaded(g, merge(taper([[4, 6.5], [8.5, 9.5], [12, 8], [13, 3.5]], 3, 1.1), taper([[-1, 8], [2.5, 11], [5.5, 10.5], [7, 7]], 2.4, 0.9)), bone, { ol: shade(bone, -0.62), y0: 3, y1: 11 });
      g.restore();
    },
  }),
];

// ======================================================================= CHEST
const clipBody = (g: G, cx: number, cy: number, r = BR * 1.03) => { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip(); };

const CHESTS: PartDef[] = [
  O({
    id: 'o-beads', name: 'Bead String', category: 'chest', tier: 1, cost: 10, snap: 'any', layer: 'front', radius: 14, box: [-9, -16, 10, 9],
    stats: { social: 1 }, desc: 'Painted clay beads on a string. Simple and charming.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      clipBody(g, CHEST[0], CHEST[1]);
      strokes(g, [[NK0, qpt(NK0, NKC, NK1, 0.5), NK1]], shade(LEATHER, -0.2), 1.1);
      const A = new Path2D(), B = new Path2D();
      for (let i = 1; i <= 8; i++) { const [x, y] = qpt(NK0, NKC, NK1, i / 8.6); (i % 2 ? A : B).addPath(circlePath(x, y, 1.9)); }
      fillShaded(g, A, mix(TEAL, c.colors.detail, 0.1), { lw: 1.4, y0: -12, y1: 8 });
      fillShaded(g, B, mix(SUN, c.colors.detail, 0.1), { lw: 1.4, y0: -12, y1: 8 });
      const [px, py] = qpt(NK0, NKC, NK1, 0.62);
      fillShaded(g, ellipsePath(px + 0.5, py + 2.6, 2.4, 3), mix(OCHRE, c.colors.coat, 0.2), { lw: 1.5, y0: py, y1: py + 6 });
      g.restore();
    },
  }),
  O({
    id: 'o-fang-necklace', name: 'Fang Necklace', category: 'chest', tier: 1, cost: 20, snap: 'any', layer: 'front', radius: 16, box: [-10, -18, 12, 11],
    stats: { combat: 1, social: 1 }, desc: 'Trophy teeth on a cord. Tells a story or two.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      clipBody(g, CHEST[0], CHEST[1], BR * 1.15);
      tube(g, line([NK0, qpt(NK0, NKC, NK1, 0.3), qpt(NK0, NKC, NK1, 0.6), NK1]), 1.2, LEATHER);
      const f = new Path2D();
      for (const t of [0.3, 0.45, 0.6, 0.75, 0.9]) {
        const [x, y] = qpt(NK0, NKC, NK1, t), [x2, y2] = qpt(NK0, NKC, NK1, t + 0.02);
        const a = Math.atan2(y2 - y, x2 - x) + Math.PI / 2;
        const L = t === 0.6 ? 6 : 4.4;
        f.addPath(smoothPath(xf([[-1.6, 0], [1.6, 0], [0.3, L * 0.7], [-0.2, L]], a - Math.PI / 2, x, y)));
      }
      fillShaded(g, f, bone, { ol: shade(bone, -0.62), lw: 1.5, y0: -6, y1: 12 });
      dots(g, [qpt(NK0, NKC, NK1, 0.375), qpt(NK0, NKC, NK1, 0.675)], 1.3, OCHRE);
      g.restore();
    },
  }),
  O({
    id: 'o-leaf-vest', name: 'Leaf Vest', category: 'chest', tier: 1, cost: 15, snap: 'any', layer: 'front', radius: 11, box: [-11, -12, 11, 12],
    stats: { gather: 1 }, desc: 'Big leaves stitched together. Fresh every morning.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      clipBody(g, CHEST[0], CHEST[1]);
      const lf = mix(LEAF, c.colors.coat, 0.15);
      const A = new Path2D(), B = new Path2D(), veins: Pt[][] = [];
      const row = (P: Path2D, y: number, xs: number[], a: number) => xs.forEach((x) => {
        P.addPath(leafPath(x, y, a, 12, 4.4));
        veins.push(xf([[1, 0], [10, 0]], a, x, y));
      });
      row(A, -10, [-4, 1.5, 7], 1.75);
      row(B, -1, [-1.5, 4, 9.5], 1.85);
      fillShaded(g, A, lf, { y0: -12, y1: 4 });
      fillShaded(g, B, shade(lf, -0.1), { y0: -3, y1: 12 });
      strokes(g, veins, shade(lf, -0.4), 0.9);
      g.restore();
    },
  }),
  O({
    id: 'o-woven-sash', name: 'Gatherer’s Sash', category: 'chest', tier: 2, cost: 25, snap: 'any', layer: 'front', radius: 18, box: [-17, -16, 16, 18],
    stats: { gather: 2 }, desc: 'A woven sling with a handy pouch for seeds and snacks.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      const st = mix(STRAW, c.colors.detail, 0.1);
      g.save(); clipBody(g, CHEST[0], CHEST[1]);
      const a0: Pt = [-13, -14], a1: Pt = [7.5, 11];
      tube(g, line([a0, a1], false), 4.6, st);
      const ticks: Pt[][] = [];
      for (let t = 0.08; t < 1; t += 0.11) {
        const x = a0[0] + (a1[0] - a0[0]) * t, y = a0[1] + (a1[1] - a0[1]) * t;
        ticks.push([[x - 1.8, y + 1.4], [x + 1.8, y - 1.4]]);
      }
      strokes(g, ticks, shade(st, -0.35), 0.9);
      g.restore();
      fillShaded(g, smoothPath([[5.5, 8.5], [12.5, 8.5], [13.5, 14], [9, 16.5], [4.5, 14]]), LEATHER, { y0: 8, y1: 17 });
      fillShaded(g, polyPath([[5.2, 8.2], [12.8, 8.2], [9, 12]]), shade(LEATHER, 0.15), { lw: 1.6, y0: 8, y1: 12 });
      dots(g, [[9, 11.2]], 1, bone);
      g.restore();
    },
  }),
  O({
    id: 'o-shell-bib', name: 'Shell Bib', category: 'chest', tier: 2, cost: 30, snap: 'any', layer: 'front', radius: 13, box: [-8, -16, 11, 12],
    stats: { health: 2, social: 1 }, desc: 'Overlapping shells, tough as armour and twice as pretty.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      clipBody(g, CHEST[0], CHEST[1]);
      const [cx, cy] = CHEST;
      fillShaded(g, smoothPath([[cx + 1, cy - 12], [cx + 12, cy - 9], [cx + 16, cy + 1], [cx + 10, cy + 12], [cx + 2, cy + 9], [cx - 1.5, cy - 2]]), mix(LEATHER, c.colors.coat, 0.25), { y0: cy - 12, y1: cy + 12 });
      const r1 = new Path2D(), r2 = new Path2D(), ribs: Pt[][] = [];
      for (const [x, y] of [[cx + 4, cy - 10], [cx + 10, cy - 7.5]] as Pt[]) scallop(r1, ribs, x, y, Math.PI / 2, 4.6);
      for (const [x, y] of [[cx + 3, cy - 3], [cx + 9, cy - 0.5], [cx + 6, cy + 5]] as Pt[]) scallop(r2, ribs, x, y, Math.PI / 2, 4.8);
      const shc = mix(SHELL, c.colors.detail, 0.2);
      fillShaded(g, r1, shc, { y0: cy - 10, y1: cy - 3 });
      fillShaded(g, r2, shade(shc, -0.05), { y0: cy - 3, y1: cy + 10 });
      strokes(g, ribs, shade(SHELL, -0.32), 0.9);
      g.restore();
    },
  }),
  O({
    id: 'o-bone-plate', name: 'Rib Armour', category: 'chest', tier: 3, cost: 55, snap: 'any', layer: 'front', radius: 16, box: [-16, -17, 11, 14],
    stats: { health: 3, combat: 2 }, desc: 'Bone ribs lashed over hide. Hits bounce right off.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      clipBody(g, CHEST[0], CHEST[1], BR * 1.06);
      const [cx, cy] = CHEST;
      fillShaded(g, ellipsePath(cx + 3, cy + 0.5, BR * 0.92, BR * 0.98), mix(LEATHER, c.colors.coat, 0.2), { y0: cy - BR, y1: cy + BR });
      const ribs = new Path2D();
      for (let i = 0; i < 4; i++) {
        const x = cx - 3 + i * 4.4;
        ribs.moveTo(x - 2.5, cy - BR + 1); ribs.quadraticCurveTo(x + 4.5, cy, x - 1, cy + BR - 1.5);
      }
      tube(g, ribs, 2.6, bone);
      tube(g, line([[cx + BR * 0.9, cy - 8], [cx + BR * 0.96, cy], [cx + BR * 0.88, cy + 8]]), 3.2, shade(bone, -0.05));
      dots(g, [[cx + BR * 0.92, cy - 4], [cx + BR * 0.95, cy + 3]], 1, shade(bone, -0.55));
      g.restore();
    },
  }),
];

// ======================================================================= SHOULDER
const onBody = (a: number, r = BR): Pt => [SHOULDER[0] + Math.cos(a) * r, SHOULDER[1] + Math.sin(a) * r];

const SHOULDERS: PartDef[] = [
  O({
    id: 'o-leaf-cape', name: 'Leaf Cape', category: 'shoulder', tier: 1, cost: 15, snap: 'top', layer: 'front', radius: 23, box: [-22, -12, 13, 21],
    stats: { gather: 1 }, desc: 'Shingled leaves over the back. Blends right into the brush.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      const lf = mix(LEAF, c.colors.coat, 0.2);
      const A = new Path2D(), B = new Path2D(), veins: Pt[][] = [];
      [-0.75, -1.2, -1.65, -2.1, -2.55, -3.0].forEach((a, i) => {
        const [x, y] = onBody(a, BR * 0.92);
        const d = a - Math.PI / 2 + 0.2 + Math.sin(c.t * 2 + i) * 0.04;
        (i % 2 ? B : A).addPath(leafPath(x, y, d, 12, 4));
        veins.push(xf([[1, 0], [10, 0]], d, x, y));
      });
      fillShaded(g, B, shade(lf, -0.12), { y0: -6, y1: 12 });
      fillShaded(g, A, lf, { y0: -6, y1: 12 });
      strokes(g, veins, shade(lf, -0.4), 0.9);
      g.restore();
    },
  }),
  O({
    id: 'o-plume-pads', name: 'Plume Pads', category: 'shoulder', tier: 1, cost: 15, snap: 'top', layer: 'front', radius: 19, box: [-11, -22, 10, 2],
    stats: { social: 1 }, desc: 'A jaunty tuft of feathers on each shoulder.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      const [x, y] = onBody(-1.3, BR * 0.95);
      const sw = Math.sin(c.t * 2.5) * 0.05 + c.act * 0.2;
      feather(g, x, y, -2.5 + sw, 15, 3.2, c.colors.coat);
      feather(g, x, y, -2.05 + sw, 19, 3.6, mix(OCHRE, c.colors.detail, 0.1));
      feather(g, x, y, -1.65 + sw, 14, 3, mix(SUN, c.colors.detail, 0.25));
      fillShaded(g, ellipsePath(x, y, 5, 2.6, -0.3), mix(LEATHER, c.colors.coat, 0.2), { lw: 1.8, y0: y - 3, y1: y + 3 });
      dots(g, [[x, y]], 1.2, SUN);
      g.restore();
    },
  }),
  O({
    id: 'o-bone-pauldron', name: 'Bone Pauldron', category: 'shoulder', tier: 2, cost: 35, snap: 'top', layer: 'front', radius: 19, box: [-13, -13, 18, 19],
    stats: { combat: 2, health: 1 }, desc: 'A spiked bone shoulder guard. Very serious business.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      tube(g, line([onBody(-0.55, BR * 0.95), onBody(-0.1, BR * 0.98), onBody(0.45, BR * 0.92)]), 2.2, mix(LEATHER, c.colors.coat, 0.2));
      const pts: Pt[] = [];
      for (let i = 0; i <= 6; i++) pts.push(onBody(-2.3 + (i / 6) * 1.75, BR * 1.17));
      for (let i = 6; i >= 0; i--) pts.push(onBody(-2.3 + (i / 6) * 1.75, BR * 0.74));
      const spikes = new Path2D();
      for (const a of [-1.85, -1.3]) {
        const [bx, by] = onBody(a, BR * 1.1);
        spikes.addPath(polyPath(xf([[0, -2.2], [6.5, 0], [0, 2.2]], a, bx, by)));
      }
      fillShaded(g, merge(smoothPath(pts), spikes), bone, { ol: shade(bone, -0.62), y0: -8, y1: 6 });
      strokes(g, [[onBody(-2.1, BR * 0.95), onBody(-1.55, BR * 1.0), onBody(-0.75, BR * 0.95)]], shade(bone, -0.3), 1);
      dots(g, [onBody(-2.0, BR * 0.86), onBody(-0.8, BR * 0.86)], 1.1, shade(bone, -0.55));
      gloss(g, onBody(-1.7, BR * 1.02)[0], onBody(-1.7, BR * 1.02)[1], 2.4, 0.5);
      g.restore();
    },
  }),
  O({
    id: 'o-fur-mantle', name: 'Fur Mantle', category: 'shoulder', tier: 2, cost: 40, snap: 'top', layer: 'front', radius: 21, box: [-19, -9, 17, 21],
    stats: { health: 2, social: 1 }, desc: 'A cosy shaggy cape for cold nights by the fire.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      const fu = mix(FUR, c.colors.coat, 0.2);
      const pts: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * 0.82 + (i / 12) * Math.PI * 1.04;
        pts.push(onBody(a, BR * (i % 2 ? 1.08 : 1.2)));
      }
      for (let i = 0; i <= 6; i++) {
        const x = BR * 0.92 - (i / 6) * BR * 1.85;
        pts.push([x, SHOULDER[1] + (i % 2 ? BR * 0.28 : BR * 0.02) + Math.sin(c.t * 1.5 + i) * 0.3]);
      }
      fillShaded(g, smoothPath(pts), fu, { y0: -6, y1: 14 });
      const tufts: Pt[][] = [];
      for (const a of [-2.6, -2.1, -1.6, -1.1, -0.6]) tufts.push([onBody(a, BR * 0.82), onBody(a + 0.12, BR * 1.02)]);
      strokes(g, tufts, shade(fu, -0.35), 1.2);
      fillShaded(g, merge(ellipsePath(BR * 0.78, SHOULDER[1] - 4.5, 3.4, 1.4, 0.5), circlePath(BR * 0.55, SHOULDER[1] - 6, 1.2), circlePath(BR * 1.0, SHOULDER[1] - 3, 1.2)), bone, { ol: shade(bone, -0.62), lw: 1.6, y0: -8, y1: 0 });
      g.restore();
    },
  }),
  O({
    id: 'o-harvest-basket', name: 'Harvest Basket', category: 'shoulder', tier: 3, cost: 55, snap: 'top', layer: 'front', radius: 21, box: [-14, -24, 17, 13],
    stats: { gather: 3, health: 1 }, desc: 'A big woven backpack basket, brimming with goodies.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      const st = mix(STRAW, c.colors.detail, 0.1);
      tube(g, line([[2, -10], [9, -6], [BR * 0.95, SHOULDER[1] - 1]]), 1.8, LEATHER);
      fillShaded(g, merge(leafPath(-4, -15, -2.1, 8, 2.6), leafPath(-1, -15, -1.1, 7, 2.4)), LEAF, { lw: 1.8, y0: -22, y1: -14 });
      dots(g, [[-7, -15.5], [-5, -17], [-2.6, -16.2]], 2.2, '#d63a4a');
      fillShaded(g, circlePath(0.5, -15.5, 3.2), '#f39a2b', { lw: 1.8, y0: -19, y1: -12 });
      const body = polyPath([[-9.5, -15], [4, -15], [2.8, -2.5], [-8.2, -2.5]]);
      fillShaded(g, body, st, { y0: -15, y1: -2 });
      const w: Pt[][] = [];
      for (const y of [-11.5, -8, -4.8]) w.push([[-9 + (y + 15) * 0.1, y], [3.6 - (y + 15) * 0.08, y]]);
      for (const x of [-6, -2.6, 0.8]) w.push([[x, -14.5], [x + 0.3, -3]]);
      strokes(g, w, shade(st, -0.35), 0.9);
      tube(g, line([[-10, -15], [4.6, -15]], false), 2, shade(st, -0.12));
      g.restore();
    },
  }),
];

// ======================================================================= TRINKETS
const TRINKETS: PartDef[] = [
  O({
    id: 'o-rattle', name: 'Gourd Rattle', category: 'trinket', tier: 1, cost: 15, snap: 'any', layer: 'front', radius: 11, box: [-8, -11, 8, 14],
    stats: { social: 1 }, desc: 'A dried gourd full of seeds. Shake-a-shake!',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k); swing(g, c);
      cord(g);
      const gd = mix(SUN, '#e08a3a', 0.35);
      fillShaded(g, merge(circlePath(0, 2, 2.7), circlePath(0, 7.2, 4.4)), gd, { y0: -1, y1: 12 });
      strokes(g, [[[-4, 6.4], [0, 7.4], [4, 6.4]]], OCHRE, 1.5);
      dots(g, [[-1.6, 9], [1.6, 9], [0, 10.4]], 0.7, shade(gd, -0.45));
      gloss(g, -1.6, 5, 1.4, 0.55);
      g.restore();
    },
  }),
  O({
    id: 'o-pouch', name: 'Forage Pouch', category: 'trinket', tier: 1, cost: 15, snap: 'any', layer: 'front', radius: 8, box: [-9, -11, 9, 11],
    stats: { gather: 1 }, desc: 'A little leather bag for nuts, seeds and shiny pebbles.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k); swing(g, c);
      cord(g);
      fillShaded(g, smoothPath([[-3.6, -0.5], [3.6, -0.5], [5.4, 5], [0, 8.6], [-5.4, 5]]), LEATHER, { y0: -1, y1: 9 });
      fillShaded(g, smoothPath([[-4, -0.8], [4, -0.8], [3, 2.6], [0, 3.8], [-3, 2.6]]), shade(LEATHER, 0.15), { lw: 1.6, y0: -1, y1: 4 });
      strokes(g, [[[-2.6, 5.6], [-1.6, 6.6]], [[2.6, 5.6], [1.6, 6.6]]], shade(LEATHER, -0.4), 0.9);
      dots(g, [[0, 3]], 1.1, bone);
      g.restore();
    },
  }),
  O({
    id: 'o-lucky-bones', name: 'Lucky Bones', category: 'trinket', tier: 2, cost: 30, snap: 'any', layer: 'front', radius: 16, box: [-10, -11, 10, 19],
    stats: { combat: 1, health: 1 }, desc: 'Crossed bones in a hoop, with a feather for luck.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k); swing(g, c);
      cord(g);
      feather(g, 0, 9.5, Math.PI / 2 + Math.sin(c.t * 3) * 0.15, 8, 2, mix(OCHRE, c.colors.detail, 0.1));
      const hoop = new Path2D(); hoop.arc(0, 4.6, 4.8, 0, TAU);
      tube(g, hoop, 1.4, WOOD);
      const b = (a: number) => merge(polyPath(xf([[-3.4, -0.7], [3.4, -0.7], [3.4, 0.7], [-3.4, 0.7]], a, 0, 4.6)),
        ...xf([[-3.6, -0.9], [-3.6, 0.9], [3.6, -0.9], [3.6, 0.9]], a, 0, 4.6).map(([x, y]) => circlePath(x, y, 1.05)));
      fillShaded(g, merge(b(0.7), b(-0.7)), bone, { ol: shade(bone, -0.62), lw: 1.4, y0: 0, y1: 9 });
      g.restore();
    },
  }),
  O({
    id: 'o-belly-drum', name: 'Belly Drum', category: 'trinket', tier: 2, cost: 40, snap: 'any', layer: 'front', radius: 15, box: [-13, -15, 8, 11],
    stats: { social: 2, combat: 1 }, desc: 'A little hide drum. Rally the tribe, or rattle the rivals.',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k);
      tube(g, line([[-9, -11], [-5, -5], [-3, 0]]), 1.6, LEATHER);
      const wd = mix(WOOD, c.colors.coat, 0.2);
      fillShaded(g, polyPath([[-5.6, 0], [5.6, 0], [4.6, 9], [-4.6, 9]]), wd, { y0: 0, y1: 9 });
      strokes(g, [[[-5.4, 1.4], [-3.4, 8.6], [-1.2, 1.4], [1.2, 8.6], [3.4, 1.4], [5.4, 8.4]]], shade(bone, -0.1), 1);
      strokes(g, [[[-4.8, 8.2], [4.8, 8.2]]], OCHRE, 1.6);
      const bounce = 1 + Math.sin(c.t * 30) * 0.15 * c.act;
      fillShaded(g, ellipsePath(0, 0, 5.8, 1.9 * bounce), '#f0dfbd', { lw: 1.6, y0: -2, y1: 2 });
      g.restore();
    },
  }),
  O({
    id: 'o-totem-charm', name: 'Totem Charm', category: 'trinket', tier: 3, cost: 55, snap: 'any', layer: 'front', radius: 11, box: [-9, -11, 9, 14],
    stats: { social: 2, health: 2, gather: 1 }, desc: 'A carved little totem with a glowing heart-stone. Blessed!',
    draw(g, c) {
      const k = bodyK(c);
      g.save(); g.scale(k, k); swing(g, c);
      cord(g);
      const wd = mix(WOOD, c.colors.coat, 0.2);
      fillShaded(g, merge(polyPath([[-6.5, 1], [-3, 0.5], [-3, 3.5]]), polyPath([[6.5, 1], [3, 0.5], [3, 3.5]])), mix(TEAL, c.colors.detail, 0.15), { lw: 1.6, y0: 0, y1: 4 });
      fillShaded(g, merge(polyPath([[-3.4, -0.5], [3.4, -0.5], [3.4, 5.4], [-3.4, 5.4]]), polyPath([[-3, 5.4], [3, 5.4], [3, 11.5], [-3, 11.5]])), wd, { y0: -1, y1: 12 });
      dots(g, [[-1.5, 1.8], [1.5, 1.8]], 1.1, bone);
      dots(g, [[-1.3, 1.9], [1.7, 1.9]], 0.5, INK);
      fillShaded(g, polyPath([[-1, 3], [1, 3], [0, 5]]), SUN, { lw: 1.2, y0: 3, y1: 5 });
      strokes(g, [[[-2, 10], [0, 10.8], [2, 10]]], INK, 1);
      const gem = mix(c.colors.detail, '#7ff0e0', 0.5);
      const pulse = 0.6 + Math.sin(c.t * 2.6) * 0.25 + c.act * 0.3;
      glow(g, 0, 7.6, 5, gem, 0.6 * pulse);
      fillShaded(g, polyPath([[0, 5.8], [1.6, 7.6], [0, 9.4], [-1.6, 7.6]]), gem, { lw: 1.2, y0: 6, y1: 9 });
      g.restore();
    },
  }),
];

export const OUTFIT_PARTS: PartDef[] = [...HATS, ...MASKS, ...CHESTS, ...SHOULDERS, ...TRINKETS];
registerParts(OUTFIT_PARTS);
