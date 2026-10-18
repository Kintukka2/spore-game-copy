// Cell-stage parts (top-down). Anchor sits on the membrane; +x points outward from the body.
// In the cell stage, parts stack (two flagella = more speed), as in the original game.
import { registerParts } from '../registry';
import { shade } from '../color';
import { drawEye, ellipsePath, fillShaded, gloss, polyPath, smoothPath, teeth } from '../partkit';
import type { PartDef } from '../types';
import { TAU } from '../../engine/math';

const C = (d: Omit<PartDef, 'kind'>): PartDef => ({ kind: 'cell', ...d });

export const CELL_PARTS: PartDef[] = [
  C({
    id: 'c-filter', name: 'Filter Mouth', category: 'cell-mouth', tier: 1, cost: 15, diet: 'herbivore', snap: 'head-front', layer: 'front', radius: 8,
    stats: { bite: 0, sing: 1 }, desc: 'Sucks up plant flakes. Harmless.',
    draw(g, c) {
      const o = c.act * 2;
      fillShaded(g, smoothPath([[-3, -7], [5, -6 - o], [8, 0], [5, 6 + o], [-3, 7]]), shade(c.colors.detail, 0.1), { y0: -7, y1: 7 });
      g.strokeStyle = shade(c.colors.detail, -0.5); g.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(1, i * 2.4); g.lineTo(7, i * 2.6); g.stroke(); }
    },
  }),
  C({
    id: 'c-jaw', name: 'Jaw', category: 'cell-mouth', tier: 1, cost: 15, diet: 'carnivore', snap: 'head-front', layer: 'front', radius: 9,
    stats: { bite: 1, sing: 1 }, desc: 'Chomps meat and small cells.',
    draw(g, c) {
      const o = 0.35 + c.act * 0.5 + Math.sin(c.t * 5) * 0.08;
      for (const s of [-1, 1]) {
        g.save(); g.rotate(s * o);
        const p = smoothPath([[-2, 0], [4, s * 1], [10, s * 2], [11, s * 5], [2, s * 6]]);
        fillShaded(g, p, shade(c.colors.coat, 0), { y0: -6, y1: 6 });
        teeth(g, 2, 10, s * 1.6, 2.2, (s * -1) as 1 | -1);
        g.restore();
      }
    },
  }),
  C({
    id: 'c-proboscis', name: 'Proboscis', category: 'cell-mouth', tier: 2, cost: 25, diet: 'omnivore', snap: 'head-front', layer: 'front', radius: 14,
    stats: { bite: 1, sing: 1 }, desc: 'Impales live cells and drains them; also sips plants.',
    draw(g, c) {
      const ext = 1 + c.act * 0.25;
      fillShaded(g, polyPath([[-2, -3.5], [16 * ext, -0.8], [18 * ext, 0], [16 * ext, 0.8], [-2, 3.5]]), shade(c.colors.coat, -0.1), { y0: -4, y1: 4 });
      fillShaded(g, ellipsePath(0, 0, 4, 5), c.colors.coat);
    },
  }),
  C({
    id: 'c-flagellum', name: 'Flagellum', category: 'cell-move', tier: 1, cost: 15, snap: 'back', layer: 'back', radius: 16,
    stats: { speed: 1 }, desc: 'A whip tail. Smooth, steady swimming.',
    draw(g, c) {
      g.strokeStyle = shade(c.colors.coat, -0.55); g.lineWidth = 4; g.lineCap = 'round';
      const path = () => {
        g.beginPath(); g.moveTo(0, 0);
        for (let i = 1; i <= 12; i++) { const x = i * 1.8; g.lineTo(x, Math.sin(c.t * 14 - i * 0.7) * (i * 0.35)); }
      };
      path(); g.stroke();
      g.strokeStyle = c.colors.coat; g.lineWidth = 2; path(); g.stroke();
    },
  }),
  C({
    id: 'c-cilia', name: 'Cilia', category: 'cell-move', tier: 2, cost: 15, snap: 'perimeter', layer: 'back', radius: 8,
    stats: { speed: 1, jump: 1 }, desc: 'Tiny hairs. Lets you turn on a dime.',
    draw(g, c) {
      g.strokeStyle = shade(c.colors.detail, -0.2); g.lineWidth = 1.3; g.lineCap = 'round';
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.28 + Math.sin(c.t * 18 + i) * 0.25;
        g.beginPath(); g.moveTo(0, i * 1.8); g.lineTo(Math.cos(a) * 7, i * 1.8 + Math.sin(a) * 7); g.stroke();
      }
    },
  }),
  C({
    id: 'c-jet', name: 'Jet', category: 'cell-move', tier: 2, cost: 25, snap: 'back', layer: 'back', radius: 9,
    stats: { speed: 2, sprint: 1 }, desc: 'Moves in powerful bursts.',
    draw(g, c) {
      fillShaded(g, polyPath([[-2, -4], [7, -6], [9, 0], [7, 6], [-2, 4]]), shade(c.colors.detail, -0.05), { y0: -6, y1: 6 });
      const flick = (Math.sin(c.t * 9) + 1) / 2;
      g.fillStyle = `rgba(160,230,255,${0.25 + flick * 0.35})`;
      g.beginPath(); g.moveTo(9, -3.5); g.lineTo(15 + flick * 4, 0); g.lineTo(9, 3.5); g.fill();
    },
  }),
  C({
    id: 'c-spike', name: 'Spike', category: 'cell-weapon', tier: 1, cost: 10, snap: 'perimeter', layer: 'front', radius: 10,
    stats: { charge: 1 }, desc: 'Ram enemies. Pops big cells.',
    draw(g, c) {
      fillShaded(g, polyPath([[-1, -3.5], [12, 0], [-1, 3.5]]), '#f0e7d0', { ol: '#5a4c33', y0: -4, y1: 4 });
    },
  }),
  C({
    id: 'c-poison', name: 'Poison Sac', category: 'cell-weapon', tier: 2, cost: 15, snap: 'back', layer: 'front', radius: 7,
    stats: { spit: 1 }, desc: 'Leaves a toxic trail behind you.',
    draw(g, c) {
      const p = 1 + Math.sin(c.t * 4) * 0.08;
      fillShaded(g, ellipsePath(3, 0, 5 * p, 4.2 * p), '#a6ef4f', { ol: '#3f6a14', y0: -5, y1: 5 });
      g.fillStyle = '#6fb52a';
      g.beginPath(); g.arc(4, 1, 1.4, 0, TAU); g.arc(2, -1.5, 1, 0, TAU); g.fill();
      gloss(g, 1.5, -2, 1.4, 0.7);
    },
  }),
  C({
    id: 'c-electric', name: 'Electric Node', category: 'cell-weapon', tier: 3, cost: 25, snap: 'perimeter', layer: 'front', radius: 8,
    stats: { charm: 1, strike: 1 }, desc: 'Periodically shocks everything nearby.',
    draw(g, c) {
      fillShaded(g, ellipsePath(3, 0, 4.5, 4.5), '#5cc8ff', { ol: '#1d4f73', y0: -5, y1: 5 });
      const z = (Math.sin(c.t * 11) + 1) / 2;
      g.strokeStyle = `rgba(220,245,255,${0.4 + z * 0.6})`; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(6, 0); g.lineTo(9, -2); g.lineTo(10, 1); g.lineTo(13, -1); g.stroke();
    },
  }),
  C({
    id: 'c-eye', name: 'Beady Eye', category: 'cell-eye', tier: 1, cost: 5, snap: 'perimeter', layer: 'top', radius: 5,
    stats: { sight: 1 },
    draw(g, c) { g.save(); g.rotate(-Math.PI / 2); drawEye(g, 3.6, c, { look: 0 }); g.restore(); },
  }),
  C({
    id: 'c-eyestalk', name: 'Stalk Eye', category: 'cell-eye', tier: 1, cost: 5, snap: 'perimeter', layer: 'top', radius: 9,
    stats: { sight: 1 },
    draw(g, c) {
      g.strokeStyle = shade(c.colors.base, -0.5); g.lineWidth = 2.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(7, Math.sin(c.t * 2) * 1.5); g.stroke();
      g.save(); g.translate(8.5, Math.sin(c.t * 2) * 1.5); g.rotate(-Math.PI / 2); drawEye(g, 3.2, c, { look: 0 }); g.restore();
    },
  }),
];

registerParts(CELL_PARTS);
