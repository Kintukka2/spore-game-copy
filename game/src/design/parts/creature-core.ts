// Reference creature parts. These define the house style; creature-extra.ts adds the wider catalog.
// Local space: anchor at (0,0), forward = +x, down = +y. Body radius at the node is c.nodeR.
import { registerParts } from '../registry';
import { shade } from '../color';
import { claw, drawEye, drawLimb, ellipsePath, fillShaded, gloss, horn, OUTLINE_W, polyPath, smoothPath } from '../partkit';
import type { PartDef } from '../types';
import { fitThumb, toothRow, type PartBox } from './creature-extra';
import { TAU } from '../../engine/math';

// `box` (drawn bounds) lets editor thumbnails re-centre one-sided parts; see fitThumb in creature-extra.ts.
const P = (d: Omit<PartDef, 'kind'> & { kind?: PartDef['kind']; box?: PartBox }): PartDef => {
  const { box, ...rest } = d;
  return fitThumb({ kind: 'creature', ...rest }, box);
};

export const CREATURE_CORE: PartDef[] = [
  // ------------------------------------------------------------ Mouths
  P({
    id: 'm-nibbler', name: 'Nibbler', category: 'mouth', tier: 1, cost: 15, diet: 'herbivore', snap: 'head-front', layer: 'front', radius: 12, box: [-7, -10, 15, 10],
    stats: { bite: 1, sing: 1 }, desc: 'Soft lips for fruit and leaves.',
    draw(g, c) {
      const o = c.act * 5;
      fillShaded(g, smoothPath([[-4, -7], [8, -6], [13, -2], [9, 1], [-3, 2]]), shade(c.colors.base, 0.12));
      fillShaded(g, smoothPath([[-3, 2 + o * 0.3], [9, 2 + o], [12, 5 + o], [6, 8 + o], [-4, 7]]), shade(c.colors.base, -0.05));
      g.fillStyle = '#3a1f1f';
      g.beginPath(); g.ellipse(9, 2 + o / 2, 3, 1 + o / 2, 0, 0, TAU); g.fill();
      g.fillStyle = '#2b1a14';
      g.beginPath(); g.arc(10, -4, 1, 0, TAU); g.fill();
    },
  }),
  P({
    id: 'm-fang', name: 'Fang Snout', category: 'mouth', tier: 1, cost: 15, diet: 'carnivore', snap: 'head-front', layer: 'front', radius: 14, box: [-9, -11, 21, 11],
    stats: { bite: 1, sing: 1 }, desc: 'A toothy snout for meat.',
    draw(g, c) {
      const o = c.act * 7;
      g.save(); g.translate(0, 1); g.rotate(o * 0.04);
      const jaw = smoothPath([[-4, 1], [12, 2], [16, 4], [11, 8], [-4, 7]]);
      fillShaded(g, jaw, shade(c.colors.base, -0.08));
      toothRow(g, 2, 13, 2, 3, -1);
      g.restore();
      g.save(); g.rotate(-o * 0.05);
      const top = smoothPath([[-5, -8], [10, -7], [18, -2], [16, 2], [-5, 2]]);
      fillShaded(g, top, c.colors.base);
      toothRow(g, 3, 16, 1.5, 3.4, 1);
      g.fillStyle = '#1d1210';
      g.beginPath(); g.arc(15, -3, 1.2, 0, TAU); g.fill();
      gloss(g, 6, -5, 3, 0.35);
      g.restore();
    },
  }),
  P({
    id: 'm-grin', name: 'Gobbler Grin', category: 'mouth', tier: 1, cost: 15, diet: 'omnivore', snap: 'head-front', layer: 'front', radius: 13, box: [-9, -11, 17, 9],
    stats: { bite: 1, sing: 1 }, desc: 'Eats anything. Smiles about it.',
    draw(g, c) {
      const o = c.act * 6;
      const head = smoothPath([[-5, -8], [9, -8], [15, -1], [11, 6 + o * 0.4], [-5, 6]]);
      fillShaded(g, head, shade(c.colors.base, 0.05));
      g.fillStyle = '#3d1416';
      g.beginPath();
      g.moveTo(1, 0); g.quadraticCurveTo(9, 2 + o, 14, -1); g.quadraticCurveTo(9, 6 + o * 1.4, 1, 0); g.fill();
      g.strokeStyle = '#1c0d0d'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(1, 0); g.quadraticCurveTo(9, 2 + o * 0.2, 14, -1); g.stroke();
      g.fillStyle = '#fffaf0';
      g.fillRect(8, -0.5, 2.5, 2.4);
      gloss(g, 4, -5, 3, 0.35);
    },
  }),
  P({
    id: 'm-croc', name: 'Snapjaw', category: 'mouth', tier: 2, cost: 75, diet: 'carnivore', snap: 'head-front', layer: 'front', radius: 20, box: [-11, -11, 31, 11],
    stats: { bite: 3, sing: 1 }, desc: 'Long jaws lined with daggers.',
    draw(g, c) {
      const o = c.act * 9;
      g.save(); g.rotate(o * 0.03);
      fillShaded(g, smoothPath([[-4, 1], [20, 2], [26, 5], [20, 8], [-4, 8]]), shade(c.colors.base, -0.1));
      toothRow(g, 2, 24, 2, 3, -1);
      g.restore();
      g.save(); g.rotate(-o * 0.035);
      fillShaded(g, smoothPath([[-6, -9], [12, -6], [27, -2], [26, 2], [-6, 2]]), c.colors.base);
      toothRow(g, 3, 25, 1.6, 3.6, 1);
      g.fillStyle = shade(c.colors.coat, -0.1);
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(4 + i * 5, -5 + i * 0.6, 1.4, 0, TAU); g.fill(); }
      g.fillStyle = '#1d1210';
      g.beginPath(); g.arc(24, -3.5, 1.2, 0, TAU); g.fill();
      g.restore();
    },
  }),
  P({
    id: 'm-trumpet', name: 'Trumpet Beak', category: 'mouth', tier: 2, cost: 75, diet: 'herbivore', snap: 'head-front', layer: 'front', radius: 16, box: [-7, -9, 24, 9],
    stats: { bite: 1, sing: 3 }, desc: 'A resonant beak that carries a tune.',
    draw(g, c) {
      const o = c.act * 3;
      const p = smoothPath([[-3, -6], [10, -4], [20, -7 - o], [22, 0], [20, 7 + o], [10, 4], [-3, 6]]);
      fillShaded(g, p, horn, { ol: shade(horn, -0.6) });
      g.fillStyle = '#5a3b23';
      g.beginPath(); g.ellipse(21, 0, 1.8, 5 + o, 0, 0, TAU); g.fill();
      g.strokeStyle = shade(horn, -0.35); g.lineWidth = 1;
      g.beginPath(); g.moveTo(2, 0); g.lineTo(18, 0); g.stroke();
    },
  }),

  // ------------------------------------------------------------ Eyes
  P({
    id: 'e-round', name: 'Bright Eye', category: 'eye', tier: 1, cost: 10, snap: 'head', layer: 'top', radius: 6,
    stats: { sight: 1 }, desc: 'All eyes see equally well. Pick your favourite.',
    draw(g, c) { drawEye(g, 5.5, c); },
  }),
  P({
    id: 'e-stalk', name: 'Stalk Eye', category: 'eye', tier: 1, cost: 10, snap: 'head', layer: 'top', radius: 14, box: [-5, -21, 12, 4],
    stats: { sight: 1 },
    draw(g, c) {
      const sway = Math.sin(c.t * 2) * 2;
      g.strokeStyle = shade(c.colors.base, -0.6); g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(2, -6, 3 + sway, -12); g.stroke();
      g.strokeStyle = c.colors.base; g.lineWidth = 3.4;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(2, -6, 3 + sway, -12); g.stroke();
      g.save(); g.translate(3 + sway, -14); drawEye(g, 5, c); g.restore();
    },
  }),
  P({
    id: 'e-slit', name: 'Hunter Eye', category: 'eye', tier: 1, cost: 10, snap: 'head', layer: 'top', radius: 6,
    stats: { sight: 1 },
    draw(g, c) { drawEye(g, 5, c, { iris: '#f2c84b', pupil: 'slit', look: 0.25 }); },
  }),

  // ------------------------------------------------------------ Legs
  P({
    id: 'l-stub', name: 'Stomper', category: 'leg', tier: 1, cost: 50, snap: 'bottom', layer: 'front', paired: true, limbLength: 34, radius: 18,
    stats: { speed: 1, dance: 1 }, desc: 'Sturdy and dependable.',
    draw(g, c) {
      if (!c.limb) return;
      drawLimb(g, c.limb, 6.5, 5, 4.5, c.colors.base);
      const f = c.limb.foot;
      fillShaded(g, ellipsePath(f.x + 3, f.y - 1, 7, 3.6), shade(c.colors.base, -0.1), { y0: f.y - 5, y1: f.y + 3 });
      g.fillStyle = claw;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(f.x + 6 + i * 2.3, f.y + 0.5, 1.3, 0, TAU); g.fill(); }
    },
  }),
  P({
    id: 'l-hoof', name: 'Galloper', category: 'leg', tier: 2, cost: 75, snap: 'bottom', layer: 'front', paired: true, limbLength: 48, radius: 24,
    stats: { speed: 3, sprint: 2, charge: 1 }, desc: 'Long legs with hard hooves.',
    draw(g, c) {
      if (!c.limb) return;
      drawLimb(g, c.limb, 6, 3.6, 2.8, c.colors.base);
      const f = c.limb.foot;
      fillShaded(g, polyPath([[f.x - 4, f.y - 5], [f.x + 4, f.y - 5], [f.x + 5, f.y + 1], [f.x - 4, f.y + 1]]), '#3a2c25', { y0: f.y - 5, y1: f.y + 1 });
    },
  }),
  P({
    id: 'l-hopper', name: 'Springer', category: 'leg', tier: 2, cost: 75, snap: 'bottom', layer: 'front', paired: true, limbLength: 42, radius: 22,
    stats: { speed: 2, jump: 3, dance: 2 }, desc: 'Coiled legs for big leaps.',
    draw(g, c) {
      if (!c.limb) return;
      drawLimb(g, c.limb, 8, 4, 3, shade(c.colors.base, 0.05));
      const f = c.limb.foot;
      fillShaded(g, smoothPath([[f.x - 3, f.y - 3], [f.x + 10, f.y - 2], [f.x + 12, f.y + 1], [f.x - 3, f.y + 1]]), shade(c.colors.detail, 0), { y0: f.y - 4, y1: f.y + 2 });
    },
  }),

  // ------------------------------------------------------------ Arms
  P({
    id: 'a-claw', name: 'Grabber Claw', category: 'arm', tier: 1, cost: 25, snap: 'side', layer: 'front', paired: true, limbLength: 30, radius: 16,
    stats: { strike: 1, pose: 1, grasp: 1 }, desc: 'Lets you hold things and swipe.',
    draw(g, c) {
      if (!c.limb) return;
      drawLimb(g, c.limb, 4.5, 3.6, 3.2, c.colors.base);
      const f = c.limb.foot;
      const a = Math.atan2(c.limb.foot.y - c.limb.knee.y, c.limb.foot.x - c.limb.knee.x);
      g.save(); g.translate(f.x, f.y); g.rotate(a);
      g.fillStyle = claw;
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(0, s * 2); g.quadraticCurveTo(6, s * 4, 8, s * 1); g.lineTo(2, 0); g.closePath(); g.fill();
      }
      g.restore();
    },
  }),
  P({
    id: 'a-hand', name: 'Nimble Hand', category: 'arm', tier: 2, cost: 75, snap: 'side', layer: 'front', paired: true, limbLength: 34, radius: 18,
    stats: { pose: 3, strike: 1, grasp: 1 }, desc: 'Expressive five-fingered hands.',
    draw(g, c) {
      if (!c.limb) return;
      drawLimb(g, c.limb, 4, 3.2, 2.8, c.colors.base);
      const f = c.limb.foot;
      fillShaded(g, ellipsePath(f.x, f.y, 4.5, 4), shade(c.colors.base, 0.1), { y0: f.y - 4, y1: f.y + 4 });
      g.strokeStyle = shade(c.colors.base, -0.55); g.lineWidth = 2.6; g.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(f.x + 3, f.y + i * 2); g.lineTo(f.x + 7, f.y + i * 2.8); g.stroke(); }
      g.strokeStyle = shade(c.colors.base, 0.1); g.lineWidth = 1.4;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(f.x + 3, f.y + i * 2); g.lineTo(f.x + 7, f.y + i * 2.8); g.stroke(); }
    },
  }),

  // ------------------------------------------------------------ Weapons
  P({
    id: 'w-horn', name: 'Ram Horn', category: 'weapon', tier: 1, cost: 25, snap: 'top', layer: 'front', radius: 14, box: [-7, -14, 15, 5],
    stats: { charge: 1, health: 1 }, desc: 'Lower your head and charge.',
    draw(g, c) {
      const p = smoothPath([[-5, 2], [-2, -8], [6, -12], [13, -9], [10, -6], [4, -6], [3, 2]]);
      fillShaded(g, p, horn, { ol: shade(horn, -0.62) });
      g.strokeStyle = shade(horn, -0.3); g.lineWidth = 1;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(4, -4, 4 + i * 2.5, -2.4, -1.2); g.stroke(); }
    },
  }),
  P({
    id: 'w-spitter', name: 'Venom Sac', category: 'weapon', tier: 1, cost: 25, snap: 'any', layer: 'front', radius: 10, box: [-9, -8, 13, 8],
    stats: { spit: 1 }, desc: 'Ranged attack. Homes in on targets.',
    draw(g, c) {
      const pulse = 1 + Math.sin(c.t * 3) * 0.05 + c.act * 0.25;
      fillShaded(g, ellipsePath(0, 0, 7 * pulse, 6 * pulse), '#9ae35b');
      fillShaded(g, polyPath([[5, -2], [11, -1], [11, 1], [5, 2]]), '#5e9c2f');
      gloss(g, -2, -3, 2.5, 0.6);
    },
  }),

  // ------------------------------------------------------------ Details
  P({
    id: 'd-crest', name: 'Sun Crest', category: 'detail', tier: 1, cost: 25, snap: 'top', layer: 'back', radius: 14, box: [-14, -17, 7, 2],
    stats: { charm: 1 }, desc: 'A showy crest. Raise it to charm.',
    draw(g, c) {
      const up = 1 + c.act * 0.35;
      for (let i = 0; i < 4; i++) {
        g.save(); g.rotate(-0.9 + i * 0.4);
        const p = smoothPath([[0, 0], [-3, -8 * up], [0, -15 * up], [3, -8 * up]]);
        fillShaded(g, p, i % 2 ? c.colors.coat : c.colors.detail, { y0: -15, y1: 0 });
        g.restore();
      }
    },
  }),
  P({
    id: 'd-plates', name: 'Back Plates', category: 'detail', tier: 1, cost: 25, snap: 'top', layer: 'back', radius: 14, box: [-15, -14, 15, 4],
    stats: { health: 1 }, desc: 'Armour plating. More health.',
    draw(g, c) {
      for (let i = -1; i <= 1; i++) {
        const p = polyPath([[i * 8 - 5, 2], [i * 8, -12 + Math.abs(i) * 3], [i * 8 + 5, 2]]);
        fillShaded(g, p, shade(c.colors.coat, -0.05), { y0: -12, y1: 2 });
      }
    },
  }),
  P({
    id: 'wg-feather', name: 'Down Wings', category: 'wing', tier: 1, cost: 50, snap: 'top', layer: 'back', paired: true, radius: 22, box: [-27, -26, 2, 2],
    stats: { glide: 1, jump: 1 }, desc: 'Lets you glide after a jump.',
    draw(g, c) {
      const flap = Math.sin(c.act * Math.PI) * 0.9 + Math.sin(c.t * 1.5) * 0.05;
      g.save(); g.rotate(0.45 + flap * 0.8 + (c.far ? 0.3 : 0));
      const p = smoothPath([[0, 0], [-6, -6], [-24, -14], [-30, -8], [-26, -4], [-28, 0], [-20, 2], [-10, 3]]);
      fillShaded(g, p, c.colors.coat, { y0: -14, y1: 3 });
      g.strokeStyle = shade(c.colors.coat, -0.4); g.lineWidth = 1;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-6, -1); g.lineTo(-20 - i * 3, -9 + i * 4); g.stroke(); }
      g.restore();
    },
  }),
  P({
    id: 't-tuft', name: 'Tufted Tail', category: 'tail', tier: 1, cost: 25, snap: 'back', layer: 'back', radius: 18, box: [-30, -17, 5, 5],
    stats: { charm: 1, dance: 1 }, desc: 'Wag it. Everyone loves a wag.',
    draw(g, c) {
      const wag = Math.sin(c.t * 4) * 0.25 + c.act * 0.4;
      g.save(); g.rotate(Math.PI + 0.3 + wag);
      g.strokeStyle = shade(c.colors.base, -0.6); g.lineWidth = 7.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -4, 18, -2); g.stroke();
      g.strokeStyle = c.colors.base; g.lineWidth = 5;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -4, 18, -2); g.stroke();
      fillShaded(g, smoothPath([[16, -2], [22, -8], [28, -3], [24, 3], [19, 3]]), c.colors.coat, { y0: -8, y1: 3 });
      g.restore();
    },
  }),
];

// Unused import guard for linters that dislike unused symbols in some builds.
void OUTLINE_W;

registerParts(CREATURE_CORE);
