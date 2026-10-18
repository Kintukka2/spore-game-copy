// Starship parts (Space stage). Side view: anchor at (0,0), +x = the nose, +y = down.
// The hull is a sleek ribbon along the spine (render.ts): blunt at node 0 where engines mount, pointed at the head.
// Anchors used by generateShip(): engine just behind node 0, wing on the middle node's lower flank,
// cockpit and weapon at the head, detail on the middle node's back.
// Engines and wings sit on the 'back' layer; paired wings draw their far copy swept upward so ships get
// dorsal and ventral fins from one part. Engines scale with the tail node (c.nodeR).
// Stats (they add up per ship, cap 10): move (engines, wings), power (weapons), armor, energy.
import { registerParts } from '../registry';
import { mix, rgba, shade } from '../color';
import { circlePath, ellipsePath, fillShaded, gloss, polyPath, smoothPath } from '../partkit';
import type { PartDef, PartDrawCtx } from '../types';
import { TAU } from '../../engine/math';
import { bar, capsule, energy, flame, glassFill, glow, GUNMETAL, pilot, rivets, STEEL } from './vehicle';

const S = (d: Omit<PartDef, 'kind'>): PartDef => ({ kind: 'ship', ...d });

/** Engine size factor from the tail node, so nozzles match the hull. */
const ek = (c: PartDrawCtx) => Math.max(0.75, Math.min(1.45, c.nodeR / 11));

/** Paired fins: the far copy is swept upward from the hull's upper half. */
function finSpace(g: CanvasRenderingContext2D, c: PartDrawCtx) {
  if (c.far) {
    g.translate(2, -c.nodeR * 0.95);
    g.scale(1, -1);
  }
}

function navLight(g: CanvasRenderingContext2D, c: PartDrawCtx, x: number, y: number) {
  const on = Math.sin(c.t * 4.5 + (c.far ? 1.7 : 0)) > 0.1;
  const col = c.far ? '#ff5d5d' : '#66ff8a';
  if (on) glow(g, x, y, 5, col, 0.75);
  fillShaded(g, circlePath(x, y, 1.6), on ? col : shade(col, -0.5), { lw: 1, flat: true });
}

function plume(g: CanvasRenderingContext2D, x: number, y: number, len: number, w: number, col: string, t: number, seed = 0) {
  const f = 0.88 + 0.12 * Math.sin(t * 27 + seed);
  const gr = g.createLinearGradient(x, 0, x - len * f, 0);
  gr.addColorStop(0, rgba(col, 0.85));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x, y - w);
  g.quadraticCurveTo(x - len * 0.4, y - w * 0.9, x - len * f, y);
  g.quadraticCurveTo(x - len * 0.4, y + w * 0.9, x, y + w);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.ellipse(x - 1, y, len * 0.22 * f, w * 0.35, 0, 0, TAU);
  g.fill();
}

export const SHIP_PARTS: PartDef[] = [
  // ============================================================ Engines
  S({
    id: 's-eng-rocket', name: 'Rocket Bell', category: 's-engine', tier: 1, cost: 80, snap: 'back', layer: 'back', radius: 20,
    stats: { move: 2 }, desc: 'A trusty chemical rocket. Loud and orange.',
    draw(g, c) {
      const k = ek(c);
      g.save();
      g.scale(k, k);
      flame(g, -5, 0, 17 + c.act * 8, 5, c.t, '#ff8a3d', '#fff2b0');
      const bell = polyPath([[7, -4], [-5, -7], [-6.5, -7], [-6.5, 7], [-5, 7], [7, 4]]);
      fillShaded(g, bell, GUNMETAL, { y0: -7, y1: 7 });
      g.fillStyle = c.colors.coat;
      g.fillRect(-1, -6, 2.6, 12);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(-4, -5.6, 9, 1.4);
      g.restore();
    },
  }),
  S({
    id: 's-eng-ion', name: 'Ion Thruster', category: 's-engine', tier: 1, cost: 140, snap: 'back', layer: 'back', radius: 22,
    stats: { move: 3, energy: 1 }, desc: 'A whisper-quiet blue glow. Efficient.',
    draw(g, c) {
      const k = ek(c);
      g.save();
      g.scale(k, k);
      const e = energy(c, '#6fd8ff');
      plume(g, -4, 0, 22 + c.act * 8, 5.5, e, c.t);
      fillShaded(g, capsule(-3, 6, 0, 6), mix(STEEL, c.colors.base, 0.3), { y0: -6, y1: 6 });
      fillShaded(g, ellipsePath(-4, 0, 2.4, 5.4), shade(e, 0.2), { ol: shade(e, -0.6), lw: 1.5, flat: true });
      glow(g, -5, 0, 9, e, 0.55);
      for (const x of [0, 3.5]) { g.fillStyle = rgba(shade(c.colors.base, -0.6), 0.5); g.fillRect(x, -5.6, 1, 11.2); }
      g.restore();
    },
  }),
  S({
    id: 's-eng-twin', name: 'Twin Boosters', category: 's-engine', tier: 2, cost: 200, snap: 'back', layer: 'back', radius: 22,
    stats: { move: 3 }, desc: 'Two stacked boosters. Double the whoosh.',
    draw(g, c) {
      const k = ek(c);
      g.save();
      g.scale(k, k);
      for (const [i, y] of [[0, -4.6], [1, 4.6]] as [number, number][]) {
        flame(g, -4, y, 13 + c.act * 6, 3, c.t, '#ff7a3d', '#fff4c0', i * 2.3);
        fillShaded(g, polyPath([[6, y - 2.6], [-3, y - 4], [-4.5, y - 4], [-4.5, y + 4], [-3, y + 4], [6, y + 2.6]]), GUNMETAL, { y0: y - 4, y1: y + 4, lw: 1.8 });
      }
      fillShaded(g, polyPath([[7, -6.5], [1, -6.5], [1, 6.5], [7, 6.5]]), c.colors.coat, { y0: -6.5, y1: 6.5, lw: 1.8 });
      rivets(g, [[4, -4], [4, 4]]);
      g.restore();
    },
  }),
  S({
    id: 's-eng-plasma', name: 'Plasma Drive', category: 's-engine', tier: 3, cost: 340, snap: 'back', layer: 'back', radius: 24,
    stats: { move: 4 }, desc: 'Rings of plasma fling you across the stars.',
    draw(g, c) {
      const k = ek(c);
      g.save();
      g.scale(k, k);
      const e = '#ff6bd6';
      plume(g, -10, 0, 20 + c.act * 10, 4.4, e, c.t, 1);
      const nac = capsule(-9, 6, 0, 4.6);
      fillShaded(g, nac, mix(STEEL, c.colors.coat, 0.35), { y0: -5, y1: 5 });
      g.save();
      g.clip(nac);
      for (let i = 0; i < 3; i++) {
        const x = 5 - (((c.t * 14) + i * 5) % 15);
        g.fillStyle = rgba(shade(e, 0.3), 0.85);
        g.fillRect(x, -5, 1.8, 10);
      }
      g.restore();
      fillShaded(g, ellipsePath(-10, 0, 1.8, 3.8), shade(e, 0.4), { ol: shade(e, -0.6), lw: 1.3, flat: true });
      glow(g, -11, 0, 7, e, 0.6);
      g.restore();
    },
  }),
  S({
    id: 's-eng-warp', name: 'Warp Ring', category: 's-engine', tier: 3, cost: 380, snap: 'back', layer: 'back', radius: 22,
    stats: { move: 4, energy: 1 }, desc: 'Folds space behind you. Shimmery!',
    draw(g, c) {
      const k = ek(c);
      g.save();
      g.scale(k, k);
      const e = energy(c, '#9b8cff');
      for (let i = 0; i < 3; i++) {
        const s = (c.t * 0.9 + i / 3) % 1;
        g.strokeStyle = rgba(e, 0.6 * (1 - s));
        g.lineWidth = 1.4;
        g.beginPath();
        g.ellipse(-6 - s * 13, 0, 2 + s, 8 + s * 1.5, 0, 0, TAU);
        g.stroke();
      }
      bar(g, 6, -3, -2, -6, 2.4, GUNMETAL);
      bar(g, 6, 3, -2, 6, 2.4, GUNMETAL);
      glow(g, -4, 0, 12, e, 0.45);
      g.lineWidth = 4.6;
      g.strokeStyle = shade(e, -0.55);
      g.beginPath(); g.ellipse(-4, 0, 3.4, 10, 0, 0, TAU); g.stroke();
      g.lineWidth = 2.6;
      g.strokeStyle = e;
      g.stroke();
      g.setLineDash([2, 3]);
      g.lineDashOffset = -c.t * 20;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.2;
      g.stroke();
      g.setLineDash([]);
      g.restore();
    },
  }),

  // ============================================================ Wings
  S({
    id: 's-wing-delta', name: 'Delta Wing', category: 's-wing', tier: 1, cost: 80, snap: 'side', layer: 'back', paired: true, radius: 24,
    stats: { move: 1, armor: 1 }, desc: 'Big triangular wings. Classic.',
    draw(g, c) {
      g.save();
      finSpace(g, c);
      const w = polyPath([[10, -1], [-14, -1], [-22, 19], [-17, 20]]);
      fillShaded(g, w, c.colors.coat, { y0: -1, y1: 20 });
      g.save();
      g.clip(w);
      g.fillStyle = rgba(c.colors.detail, 0.95);
      g.beginPath(); g.moveTo(-10, -2); g.lineTo(-6, -2); g.lineTo(-17, 22); g.lineTo(-21, 22); g.closePath(); g.fill();
      g.restore();
      navLight(g, c, -19.5, 19.5);
      g.restore();
    },
  }),
  S({
    id: 's-wing-swept', name: 'Swept Wing', category: 's-wing', tier: 1, cost: 110, snap: 'side', layer: 'back', paired: true, radius: 26,
    stats: { move: 2 }, desc: 'Racing wings swept back with winglets.',
    draw(g, c) {
      g.save();
      finSpace(g, c);
      const w = smoothPath([[12, -1.5], [13, 1.5], [-14, 15], [-20, 19], [-24, 18.5], [-22, 14], [-6, -1.8]]);
      fillShaded(g, w, c.colors.base, { y0: -2, y1: 19 });
      g.save();
      g.clip(w);
      g.fillStyle = c.colors.coat;
      g.beginPath(); g.moveTo(-24, 10); g.lineTo(-12, 10); g.lineTo(-12, 24); g.lineTo(-24, 24); g.closePath(); g.fill();
      g.restore();
      fillShaded(g, polyPath([[-20, 18.5], [-25, 12.5], [-26.5, 13], [-23.5, 19.5]]), c.colors.coat, { y0: 12, y1: 20, lw: 1.6 });
      g.strokeStyle = rgba(shade(c.colors.base, -0.6), 0.5);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(6, 1); g.lineTo(-16, 13); g.stroke();
      navLight(g, c, -25, 13.5);
      g.restore();
    },
  }),
  S({
    id: 's-wing-manta', name: 'Manta Wing', category: 's-wing', tier: 2, cost: 160, snap: 'side', layer: 'back', paired: true, radius: 24,
    stats: { move: 2, energy: 1 }, desc: 'A living-looking wing that ripples as you fly.',
    draw(g, c) {
      g.save();
      finSpace(g, c);
      const r = Math.sin(c.t * 3 + (c.far ? 1 : 0)) * 1.5;
      const w = new Path2D();
      w.moveTo(12, -1);
      w.quadraticCurveTo(4, 12, -12, 19 + r);
      w.quadraticCurveTo(-13, 14, -17, 14 + r * 0.5);
      w.quadraticCurveTo(-17, 8, -21, 7);
      w.quadraticCurveTo(-15, 2, -13, -1);
      w.closePath();
      fillShaded(g, w, c.colors.coat, { y0: -1, y1: 19 });
      g.save();
      g.clip(w);
      g.fillStyle = rgba(c.colors.detail, 0.85);
      g.beginPath();
      for (const [x, y] of [[-4, 6], [-9, 10], [-2, 1.5]]) { g.moveTo(x + 1.6, y); g.arc(x, y, 1.6, 0, TAU); }
      g.fill();
      g.restore();
      g.restore();
    },
  }),
  S({
    id: 's-wing-solar', name: 'Solar Panels', category: 's-wing', tier: 1, cost: 120, snap: 'side', layer: 'back', paired: true, radius: 26,
    stats: { energy: 3 }, desc: 'Sun-drinking panels. Lots of energy.',
    draw(g, c) {
      g.save();
      finSpace(g, c);
      bar(g, 0, 0, -6, 9, 1.8, STEEL);
      g.translate(-6, 9);
      g.rotate(0.35);
      const p = polyPath([[-11, 0], [11, 0], [11, 9], [-11, 9]]);
      const blue = '#2f5fc4';
      fillShaded(g, p, blue, { y0: 0, y1: 9, ol: '#0e1c3d' });
      g.strokeStyle = 'rgba(160,200,255,0.55)';
      g.lineWidth = 0.8;
      g.beginPath();
      for (let x = -11 + 3.7; x < 11; x += 3.7) { g.moveTo(x, 0); g.lineTo(x, 9); }
      g.moveTo(-11, 4.5); g.lineTo(11, 4.5);
      g.stroke();
      const s = (c.t * 0.35 + (c.far ? 0.5 : 0)) % 1;
      g.save();
      g.clip(p);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath(); g.moveTo(-16 + s * 34, 0); g.lineTo(-12 + s * 34, 0); g.lineTo(-17 + s * 34, 9); g.lineTo(-21 + s * 34, 9); g.closePath(); g.fill();
      g.restore();
      g.restore();
    },
  }),
  S({
    id: 's-wing-fin', name: 'Tail Fins', category: 's-wing', tier: 1, cost: 60, snap: 'side', layer: 'back', paired: true, radius: 16,
    stats: { move: 1, armor: 1 }, desc: 'Retro rocket fins. Very stylish.',
    draw(g, c) {
      g.save();
      finSpace(g, c);
      const f = smoothPath([[8, -1], [-4, 4], [-12, 14], [-15, 14.5], [-12, 6], [-10, -1.5]]);
      fillShaded(g, f, c.colors.coat, { y0: -1, y1: 15 });
      g.save();
      g.clip(f);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.beginPath(); g.moveTo(8, -2); g.lineTo(-12, 13); g.lineTo(-14, 11); g.lineTo(2, -2); g.closePath(); g.fill();
      g.restore();
      g.restore();
    },
  }),
  S({
    id: 's-wing-halo', name: 'Halo Ring', category: 's-wing', tier: 2, cost: 220, snap: 'side', layer: 'back', radius: 22,
    stats: { move: 1, energy: 2 }, desc: 'A glowing ring that circles the hull.',
    draw(g, c) {
      const e = energy(c, '#7ff7d4');
      const cy = -c.nodeR * 0.5, ry = c.nodeR * 1.35 + 3;
      glow(g, 0, cy - ry, 6, e, 0.5);
      glow(g, 0, cy + ry, 6, e, 0.5);
      g.lineWidth = 5;
      g.strokeStyle = shade(e, -0.6);
      g.beginPath(); g.ellipse(0, cy, 4.5, ry, 0, 0, TAU); g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = e;
      g.stroke();
      g.setLineDash([2.5, 4]);
      g.lineDashOffset = -c.t * 16;
      g.lineWidth = 1.2;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.setLineDash([]);
    },
  }),

  // ============================================================ Weapons
  S({
    id: 's-gun-pulse', name: 'Pulse Cannon', category: 's-weapon', tier: 1, cost: 100, snap: 'any', layer: 'front', radius: 16,
    stats: { power: 2 }, desc: 'Fires bright pulses of energy.',
    draw(g, c) {
      const e = energy(c, '#7dff9b');
      const pulse = (Math.sin(c.t * 4) + 1) / 2;
      if (c.act > 0.1) {
        const x = 15 + c.act * 22;
        glow(g, x, 0, 6, e, 0.9);
        fillShaded(g, circlePath(x, 0, 2.4), '#ffffff', { ol: e, lw: 1.2, flat: true });
      }
      fillShaded(g, polyPath([[-1, -2], [14, -2], [14, 2], [-1, 2]]), GUNMETAL, { y0: -2, y1: 2, lw: 1.8 });
      fillShaded(g, polyPath([[12, -3.2], [15.5, -3.2], [15.5, 3.2], [12, 3.2]]), shade(GUNMETAL, -0.15), { y0: -3.2, y1: 3.2, lw: 1.5 });
      glow(g, 15.5, 0, 4 + pulse * 2, e, 0.6);
      fillShaded(g, ellipsePath(-2, 0, 6.5, 4.6), c.colors.coat, { y0: -4.6, y1: 4.6 });
      gloss(g, -4, -2, 1.6, 0.5);
    },
  }),
  S({
    id: 's-gun-laser', name: 'Laser Emitter', category: 's-weapon', tier: 2, cost: 220, snap: 'any', layer: 'front', radius: 16,
    stats: { power: 3, energy: 1 }, desc: 'A focusing crystal that throws a long beam.',
    draw(g, c) {
      const e = '#ff5d8f';
      const pulse = (Math.sin(c.t * 6) + 1) / 2;
      if (c.act > 0.1) {
        g.strokeStyle = rgba(e, 0.45);
        g.lineCap = 'round';
        g.lineWidth = 5 * c.act;
        g.beginPath(); g.moveTo(12, 0); g.lineTo(70, 0); g.stroke();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.6 * c.act;
        g.stroke();
      }
      bar(g, -4, -4, 6, -4, 2, STEEL);
      bar(g, -4, 4, 6, 4, 2, STEEL);
      glow(g, 6, 0, 7 + pulse * 3, e, 0.65);
      fillShaded(g, polyPath([[0, 0], [5, -3.6], [12, 0], [5, 3.6]]), shade(e, 0.35), { ol: shade(e, -0.6), lw: 1.5, y0: -4, y1: 4 });
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath(); g.moveTo(1.5, -0.3); g.lineTo(5, -2.6); g.lineTo(7, -0.8); g.closePath(); g.fill();
      fillShaded(g, ellipsePath(-4, 0, 3.6, 5.6), c.colors.coat, { y0: -5.6, y1: 5.6 });
    },
  }),
  S({
    id: 's-gun-torpedo', name: 'Torpedo Tube', category: 's-weapon', tier: 2, cost: 240, snap: 'any', layer: 'front', radius: 16,
    stats: { power: 3 }, desc: 'Launches homing torpedoes. Boom!',
    draw(g, c) {
      const out = c.act * 14;
      fillShaded(g, smoothPath([[4 + out, -2.6], [11 + out, -2.4], [15 + out, 0], [11 + out, 2.4], [4 + out, 2.6]]), '#e9483b', { y0: -3, y1: 3, lw: 1.6 });
      if (c.act > 0.15) flame(g, 4 + out, 0, 7, 2, c.t);
      const tube = capsule(-6, 9, 0, 4.4);
      fillShaded(g, tube, c.colors.coat, { y0: -4.4, y1: 4.4 });
      fillShaded(g, ellipsePath(11.4, 0, 1.6, 4), '#1f1c26', { lw: 1.4, flat: true });
      g.fillStyle = rgba(shade(c.colors.coat, -0.6), 0.6);
      g.fillRect(-2, -4.4, 1.2, 8.8);
      g.fillRect(4, -4.4, 1.2, 8.8);
      gloss(g, -3, -2, 1.6, 0.5);
    },
  }),
  S({
    id: 's-gun-gatling', name: 'Spinner Gatling', category: 's-weapon', tier: 2, cost: 260, snap: 'any', layer: 'front', radius: 16,
    stats: { power: 3 }, desc: 'Whirring barrels spray a stream of bolts.',
    draw(g, c) {
      const spin = c.t * (6 + c.act * 30);
      const rows: [number, number][] = [];
      for (let k = 0; k < 4; k++) { const a = spin + (k * TAU) / 4; rows.push([Math.sin(a) * 3.2, Math.cos(a)]); }
      rows.sort((a, b) => a[1] - b[1]);
      for (const [y, z] of rows) {
        const col = shade(STEEL, z * 0.25);
        bar(g, 1, y, 15, y, 1.8, col);
      }
      fillShaded(g, polyPath([[13, -4.6], [15, -4.6], [15, 4.6], [13, 4.6]]), GUNMETAL, { lw: 1.4, y0: -5, y1: 5 });
      if (c.act > 0.1 && Math.sin(c.t * 60) > 0) glow(g, 17, 0, 6, '#ffd34d', 0.9);
      fillShaded(g, polyPath([[-7, -5], [2, -5], [3, 0], [2, 5], [-7, 5]]), c.colors.coat, { y0: -5, y1: 5 });
      rivets(g, [[-4, -2.5], [-4, 2.5]]);
    },
  }),
  S({
    id: 's-gun-lance', name: 'Star Lance', category: 's-weapon', tier: 3, cost: 380, snap: 'any', layer: 'front', radius: 20,
    stats: { power: 4 }, desc: 'A long spear of light. The big one.',
    draw(g, c) {
      const e = energy(c, '#ffe066');
      const pulse = (Math.sin(c.t * 5) + 1) / 2;
      if (c.act > 0.1) {
        g.strokeStyle = rgba(e, 0.5);
        g.lineCap = 'round';
        g.lineWidth = 8 * c.act;
        g.beginPath(); g.moveTo(22, 0); g.lineTo(90, 0); g.stroke();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2.6 * c.act;
        g.stroke();
      }
      bar(g, -4, 0, 20, 0, 2.2, STEEL);
      for (const x of [3, 8, 13]) fillShaded(g, ellipsePath(x, 0, 1.4, 3.4), shade(e, -0.1), { ol: shade(e, -0.65), lw: 1.2, y0: -3.4, y1: 3.4 });
      glow(g, 21, 0, 6 + pulse * 3, e, 0.75);
      fillShaded(g, polyPath([[19, 0], [21.5, -2.4], [25, 0], [21.5, 2.4]]), '#fffbe0', { ol: shade(e, -0.6), lw: 1.2, y0: -2.4, y1: 2.4 });
      fillShaded(g, smoothPath([[-9, -4], [0, -4.5], [2, 0], [0, 4.5], [-9, 4]]), c.colors.coat, { y0: -4.5, y1: 4.5 });
    },
  }),

  // ============================================================ Details
  S({
    id: 's-dome', name: 'Bio Dome', category: 's-detail', tier: 1, cost: 90, snap: 'top', layer: 'top', radius: 12,
    stats: { energy: 1 }, desc: 'A little garden under glass for long trips.',
    draw(g, c) {
      const dome = new Path2D();
      dome.moveTo(-10, 1);
      dome.bezierCurveTo(-10, -12.5, 10, -12.5, 10, 1);
      dome.closePath();
      g.save();
      g.clip(dome);
      const sw = Math.sin(c.t * 1.2) * 0.5;
      bar(g, 2, 1, 2 + sw * 0.3, -4, 1.6, '#7a5134');
      fillShaded(g, circlePath(2 + sw, -6, 3.6), '#46b356', { y0: -10, y1: -2, lw: 1.4 });
      fillShaded(g, circlePath(-4, -1, 2.8), '#5cc261', { y0: -4, y1: 2, lw: 1.4 });
      g.fillStyle = '#ff7eb3';
      g.beginPath(); g.arc(-4.5, -2, 0.9, 0, TAU); g.arc(3 + sw, -7.5, 0.9, 0, TAU); g.fill();
      g.restore();
      glassFill(g, dome, -10, 1, '#b9f3ff');
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 1.5;
      g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, 7, Math.PI * 1.12, Math.PI * 1.4); g.stroke();
      fillShaded(g, capsule(-10, 10, 1.4, 1.8), STEEL, { y0: -1, y1: 3, lw: 1.6 });
    },
  }),
  S({
    id: 's-antenna', name: 'Antenna Array', category: 's-detail', tier: 1, cost: 70, snap: 'top', layer: 'back', radius: 20,
    stats: { energy: 2 }, desc: 'Listens to the whole galaxy at once.',
    draw(g, c) {
      const ants: [number, number, number][] = [[-5, -18, 0], [0, -12, 1], [5, -15, 2]];
      for (const [x, h, i] of ants) {
        bar(g, x * 0.4, 1, x, h, 1.2, STEEL);
        const on = Math.sin(c.t * 4 + i * 2.1) > 0.3;
        if (on) glow(g, x, h, 4.5, c.colors.detail, 0.7);
        fillShaded(g, circlePath(x, h, 1.6), on ? shade(c.colors.detail, 0.3) : shade(c.colors.detail, -0.4), { lw: 1, flat: true });
      }
      g.save();
      g.translate(-1, -6);
      g.rotate(-0.5 + Math.sin(c.t * 0.7) * 0.4);
      const bowl = new Path2D();
      bowl.moveTo(-5, -1.5);
      bowl.quadraticCurveTo(0, 4, 5, -1.5);
      bowl.quadraticCurveTo(0, 1, -5, -1.5);
      bowl.closePath();
      fillShaded(g, bowl, '#eef2f6', { y0: -2, y1: 2, lw: 1.5 });
      g.restore();
      fillShaded(g, polyPath([[-7, 1.5], [-5, -2], [5, -2], [7, 1.5]]), c.colors.coat, { y0: -2, y1: 1.5, lw: 1.6 });
    },
  }),
  S({
    id: 's-rings', name: 'Gyro Rings', category: 's-detail', tier: 2, cost: 200, snap: 'top', layer: 'front', radius: 14,
    stats: { energy: 3 }, desc: 'Spinning rings that stabilise the reactor.',
    draw(g, c) {
      const e = energy(c);
      bar(g, 0, 1, 0, -5, 2.6, GUNMETAL);
      const cy = -11;
      glow(g, 0, cy, 9, e, 0.5);
      fillShaded(g, circlePath(0, cy, 3.4), shade(e, 0.2), { ol: shade(e, -0.6), y0: cy - 3, y1: cy + 3, lw: 1.5 });
      for (const [i, sp] of [[0, 1.3], [1, -0.9]] as [number, number][]) {
        const a = c.t * sp + i;
        const rx = 9 * Math.abs(Math.cos(a)) + 1.2;
        g.lineWidth = 3.2;
        g.strokeStyle = shade(STEEL, -0.6);
        g.beginPath(); g.ellipse(0, cy, i ? 8 : rx, i ? rx * 0.9 : 8, 0, 0, TAU); g.stroke();
        g.lineWidth = 1.6;
        g.strokeStyle = i ? c.colors.coat : STEEL;
        g.stroke();
      }
      gloss(g, -1, cy - 1.2, 1.1, 0.8);
    },
  }),
  S({
    id: 's-lights', name: 'Running Lights', category: 's-detail', tier: 1, cost: 50, snap: 'any', layer: 'top', radius: 12,
    stats: {}, desc: 'A strip of chasing lights. Look sharp.',
    draw(g, c) {
      fillShaded(g, capsule(-10, 10, 0, 2.6), GUNMETAL, { y0: -2.6, y1: 2.6, lw: 1.6 });
      const k0 = Math.floor(c.t * 6) % 5;
      for (let k = 0; k < 5; k++) {
        const x = -10 + k * 5;
        const on = k === k0 || k === (k0 + 4) % 5;
        const col = k === k0 ? '#ffffff' : c.colors.detail;
        if (on) glow(g, x, 0, 4.5, c.colors.detail, k === k0 ? 0.9 : 0.4);
        g.fillStyle = on ? col : shade(c.colors.detail, -0.55);
        g.beginPath(); g.arc(x, 0, 1.6, 0, TAU); g.fill();
      }
    },
  }),
  S({
    id: 's-saucer', name: 'Saucer Rim', category: 's-detail', tier: 2, cost: 180, snap: 'any', layer: 'back', radius: 30,
    stats: { armor: 2, energy: 1 }, desc: 'A classic flying-saucer brim with spinning lights.',
    draw(g, c) {
      const disc = new Path2D();
      disc.ellipse(0, 0, 30, 5.5, 0, 0, TAU);
      fillShaded(g, disc, mix(STEEL, c.colors.base, 0.4), { y0: -5.5, y1: 5.5 });
      g.save();
      g.clip(disc);
      g.fillStyle = rgba(shade(c.colors.base, -0.6), 0.35);
      g.fillRect(-31, 1, 62, 6);
      g.restore();
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + c.t * 1.5;
        if (Math.sin(a) < 0) continue;
        const x = Math.cos(a) * 26, y = Math.sin(a) * 3.4 + 0.5;
        const col = k % 3 === 0 ? '#ffe066' : k % 3 === 1 ? '#ff6b9a' : '#6ff2ff';
        glow(g, x, y, 3.5, col, 0.7);
        g.fillStyle = shade(col, 0.4);
        g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.ellipse(-8, -2.4, 14, 1.2, 0, 0, TAU); g.fill();
    },
  }),
  S({
    id: 's-tractor', name: 'Tractor Beam', category: 's-detail', tier: 2, cost: 240, snap: 'bottom', layer: 'back', radius: 22,
    stats: { power: 1, energy: 1 }, desc: 'Beams things up. Cows not included.',
    draw(g, c) {
      const e = energy(c, '#b4ff8f');
      const on = 0.75 + 0.25 * Math.sin(c.t * 3) + c.act * 0.3;
      const gr = g.createLinearGradient(0, 3, 0, 24);
      gr.addColorStop(0, rgba(e, 0.55 * on));
      gr.addColorStop(1, rgba(e, 0));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(-4, 3); g.lineTo(4, 3); g.lineTo(11, 24); g.lineTo(-11, 24); g.closePath(); g.fill();
      for (let i = 0; i < 2; i++) {
        const s = (c.t * 0.8 + i * 0.5) % 1;
        g.strokeStyle = rgba(e, 0.7 * (1 - s));
        g.lineWidth = 1.3;
        g.beginPath(); g.ellipse(0, 5 + s * 18, 4.5 + s * 6, 1 + s * 1.2, 0, 0, TAU); g.stroke();
      }
      fillShaded(g, smoothPath([[-7, -1], [7, -1], [5, 3.5], [-5, 3.5]]), GUNMETAL, { y0: -1, y1: 3.5 });
      fillShaded(g, ellipsePath(0, 3.6, 4, 1.2), shade(e, 0.3), { ol: shade(e, -0.55), lw: 1.1, flat: true });
    },
  }),
  S({
    id: 's-armor', name: 'Hull Plating', category: 's-detail', tier: 1, cost: 120, snap: 'any', layer: 'front', radius: 12,
    stats: { armor: 3 }, desc: 'Thick riveted plates. Takes a beating.',
    draw(g, c) {
      const p = smoothPath([[-11, -6], [8, -7], [12, 0], [8, 7], [-11, 6], [-12.5, 0]]);
      fillShaded(g, p, mix(GUNMETAL, c.colors.coat, 0.3), { y0: -7, y1: 7 });
      g.strokeStyle = rgba(shade(GUNMETAL, -0.6), 0.6);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-2, -6.5); g.lineTo(-2, 6.5); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.3)';
      g.beginPath(); g.moveTo(-9, -4.5); g.lineTo(7, -5.2); g.stroke();
      rivets(g, [[-8.5, -3], [-8.5, 3], [4.5, -3.5], [4.5, 3.5]], 1);
    },
  }),
  S({
    id: 's-nose', name: 'Sensor Spike', category: 's-detail', tier: 1, cost: 60, snap: 'head-front', layer: 'back', radius: 14,
    stats: { move: 1 }, desc: 'A needle nose with a glowing sensor tip.',
    draw(g, c) {
      const cone = smoothPath([[-3, -4.5], [8, -2.4], [16, 0], [8, 2.4], [-3, 4.5]]);
      fillShaded(g, cone, mix(STEEL, c.colors.coat, 0.3), { y0: -4.5, y1: 4.5 });
      g.fillStyle = c.colors.coat;
      g.fillRect(2, -3.6, 2, 7.2);
      const on = Math.sin(c.t * 3) > -0.3;
      if (on) glow(g, 16.5, 0, 5, '#ff6060', 0.8);
      fillShaded(g, circlePath(16.5, 0, 1.4), on ? '#ff7070' : '#7a2a2a', { lw: 1, flat: true });
    },
  }),

  // ============================================================ Cockpits (the Bubble Canopy is shared from vehicle.ts)
  S({
    id: 's-visor', name: 'Star Visor', category: 'cockpit', tier: 1, cost: 80, snap: 'top', layer: 'top', radius: 14,
    stats: {}, desc: 'A sleek wraparound canopy for ace pilots.',
    draw(g, c) {
      const v = smoothPath([[-12, 1.5], [-8, -4], [2, -7.5], [10, -5], [14, 1.5]]);
      g.save();
      g.clip(v);
      pilot(g, 2, -2, 0.8);
      g.restore();
      glassFill(g, v, -7.5, 1.5, '#9fd8ff');
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(-6, -3); g.quadraticCurveTo(0, -6.5, 6, -5.5); g.stroke();
      g.strokeStyle = shade(c.colors.coat, -0.3);
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-3, -5.8); g.lineTo(-1, 1); g.stroke();
    },
  }),
  S({
    id: 's-bridge', name: 'Command Bridge', category: 'cockpit', tier: 2, cost: 150, snap: 'top', layer: 'top', radius: 16,
    stats: { armor: 1, energy: 1 }, desc: 'A proper bridge for a proper captain.',
    draw(g, c) {
      const tw = smoothPath([[-11, 2], [-9, -9], [-4, -12], [8, -12], [12, -7], [12, 2]]);
      fillShaded(g, tw, c.colors.base, { y0: -12, y1: 2 });
      const win = new Path2D();
      for (let k = 0; k < 4; k++) { const x = -6 + k * 4.5; win.rect(x, -9, 3, 3); }
      win.moveTo(9, -9.5); win.lineTo(11.5, -6.5); win.lineTo(9, -6.5); win.closePath();
      const gr = g.createLinearGradient(0, -9.5, 0, -6);
      gr.addColorStop(0, '#e9fbff');
      gr.addColorStop(1, energy(c));
      g.fillStyle = gr;
      g.fill(win);
      g.strokeStyle = 'rgba(10,20,30,0.7)';
      g.lineWidth = 0.9;
      g.stroke(win);
      g.fillStyle = c.colors.coat;
      g.fillRect(-10, -3.5, 22, 2);
      bar(g, -5, -12, -6, -17, 1, STEEL);
      const on = Math.sin(c.t * 3.3) > 0;
      fillShaded(g, circlePath(-6, -17.5, 1.3), on ? '#ff6060' : '#6a2a2a', { lw: 0.9, flat: true });
      gloss(g, -6, -10, 1.6, 0.5);
    },
  }),
];

registerParts(SHIP_PARTS);
