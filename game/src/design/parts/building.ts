// Building parts (Civilization stage: city halls, houses, factories, entertainment).
// Side view: anchor at (0,0), +y down. Parts size themselves from c.nodeR (the floor's radius), so a roof
// always spans its floor: floors are drawn 2.5 * r wide and 2 * r tall (render.ts, BLD_W = 1.25).
// Anchors used by generateBuilding(): roof on the top floor's upper edge, door at the ground floor's
// centre + 0.35 r (so the threshold lands on the ground at +0.65 r), walls at a floor's side, details on the roofline.
// Stats: house, produce, happy (buildings take the best value of each, no stacking).
import { registerParts } from '../registry';
import { mix, outlineOf, rgba, shade } from '../color';
import { circlePath, ellipsePath, fillShaded, gloss, OUTLINE_W, polyPath, smoothPath } from '../partkit';
import type { PartDef, PartDrawCtx } from '../types';
import { TAU } from '../../engine/math';
import { bar, BRASS, emblem, energy, glassFill, glow, GUNMETAL, rivets, STEEL, WOOD } from './vehicle';

const B = (d: Omit<PartDef, 'kind'>): PartDef => ({ kind: 'building', ...d });

const MARBLE = '#f2ecdf';
const STONE = '#a9a196';
const LEAF = '#4caf50';
const IRON = '#2e2c34';

/** Roof half-width for a floor of radius n: just past the cornice. */
const roofW = (c: PartDrawCtx) => c.nodeR * 1.25 + 3;

function archPath(hw: number, top: number, bottom: number): Path2D {
  const p = new Path2D();
  p.moveTo(-hw, bottom);
  p.lineTo(-hw, top + hw);
  p.arc(0, top + hw, hw, Math.PI, TAU);
  p.lineTo(hw, bottom);
  p.closePath();
  return p;
}

function warmGlass(g: CanvasRenderingContext2D, p: Path2D, y0: number, y1: number) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, '#fff3c4');
  gr.addColorStop(1, '#ffb84d');
  g.fillStyle = gr;
  g.fill(p);
  g.strokeStyle = '#4a2f12';
  g.lineWidth = 1.4;
  g.stroke(p);
}

function smoke(g: CanvasRenderingContext2D, x: number, y: number, t: number, n = 3, drift = 1) {
  for (let k = 0; k < n; k++) {
    const s = (t * 0.5 + k / n) % 1;
    g.fillStyle = `rgba(225,225,232,${0.6 * (1 - s)})`;
    g.beginPath();
    g.arc(x - s * 9 * drift + Math.sin(s * 5 + k) * 1.5, y - s * 16, 2.2 + s * 4.5, 0, TAU);
    g.fill();
  }
}

export const BUILDING_PARTS: PartDef[] = [
  // ============================================================ Roofs
  B({
    id: 'b-roof-gable', name: 'Gable Roof', category: 'roof', tier: 1, cost: 60, snap: 'top', layer: 'front', radius: 24,
    stats: { house: 2 }, desc: 'A cosy pitched roof. Homey.',
    draw(g, c) {
      const W = roofW(c), H = W * 0.55 + 5;
      const tri = polyPath([[-W - 1.5, 1.5], [0, -H], [W + 1.5, 1.5]]);
      fillShaded(g, tri, c.colors.coat, { y0: -H, y1: 2 });
      g.save();
      g.clip(tri);
      g.strokeStyle = rgba(shade(c.colors.coat, -0.6), 0.45);
      g.lineWidth = 1;
      let row = 0;
      for (let y = -H + 5; y < 2; y += 4.2, row++) {
        g.beginPath();
        for (let x = -W - 4 + (row % 2) * 2.6; x < W + 4; x += 5.2) { g.moveTo(x + 2.6, y); g.arc(x, y, 2.6, 0, Math.PI); }
        g.stroke();
      }
      g.restore();
      const wr = Math.min(4.2, H * 0.18), wy = -H * 0.42;
      fillShaded(g, circlePath(0, wy, wr + 1.6), c.colors.detail, { lw: 1.5, y0: wy - wr, y1: wy + wr });
      warmGlass(g, circlePath(0, wy, wr), wy - wr, wy + wr);
      g.strokeStyle = '#4a2f12';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-wr, wy); g.lineTo(wr, wy); g.moveTo(0, wy - wr); g.lineTo(0, wy + wr); g.stroke();
      bar(g, -W - 2.5, 2, W + 2.5, 2, 2.2, c.colors.detail);
      gloss(g, -W * 0.35, -H * 0.45, 2.4, 0.35);
    },
  }),
  B({
    id: 'b-roof-dome', name: 'Grand Dome', category: 'roof', tier: 1, cost: 150, snap: 'top', layer: 'front', radius: 28,
    stats: { happy: 2, house: 1 }, desc: 'A stately dome for halls of power.',
    draw(g, c) {
      const W = roofW(c), rx = W * 0.8, ry = Math.min(rx * 0.92, 21), dh = 5;
      fillShaded(g, polyPath([[-rx - 1.5, 1], [-rx - 1.5, -dh], [rx + 1.5, -dh], [rx + 1.5, 1]]), shade(c.colors.base, 0.12), { y0: -dh, y1: 1 });
      g.fillStyle = rgba(shade(c.colors.base, -0.6), 0.7);
      for (let x = -rx + 4; x < rx - 2; x += 5) g.fillRect(x, -dh + 1.5, 2, 2.6);
      const dome = new Path2D();
      dome.moveTo(-rx, -dh);
      dome.bezierCurveTo(-rx, -dh - ry * 1.33, rx, -dh - ry * 1.33, rx, -dh);
      dome.closePath();
      fillShaded(g, dome, c.colors.coat, { y0: -dh - ry, y1: -dh });
      g.save();
      g.clip(dome);
      g.strokeStyle = rgba(shade(c.colors.coat, -0.55), 0.5);
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(0, -dh, rx * 0.5, ry, 0, Math.PI, TAU);
      g.moveTo(0, -dh); g.lineTo(0, -dh - ry);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.beginPath(); g.ellipse(-rx * 0.35, -dh - ry * 0.6, rx * 0.22, ry * 0.3, -0.5, 0, TAU); g.fill();
      g.restore();
      const ty = -dh - ry;
      bar(g, 0, ty, 0, ty - 5, 1.8, BRASS);
      fillShaded(g, circlePath(0, ty - 6.5, 2.4), c.colors.detail, { lw: 1.4 });
    },
  }),
  B({
    id: 'b-roof-spire', name: 'Needle Spire', category: 'roof', tier: 1, cost: 120, snap: 'top', layer: 'front', radius: 40,
    stats: { happy: 1, produce: 1 }, desc: 'A tall pointed spire you can see for miles.',
    draw(g, c) {
      const W = roofW(c), bw = W * 0.6, H = 28 + c.nodeR * 0.5;
      fillShaded(g, polyPath([[-bw - 2, 1], [-bw - 2, -4], [bw + 2, -4], [bw + 2, 1]]), shade(c.colors.base, 0.1), { y0: -4, y1: 1 });
      const cone = new Path2D();
      cone.moveTo(-bw, -4);
      cone.quadraticCurveTo(-bw * 0.22, -4 - H * 0.45, 0, -4 - H);
      cone.quadraticCurveTo(bw * 0.22, -4 - H * 0.45, bw, -4);
      cone.closePath();
      fillShaded(g, cone, c.colors.coat, { y0: -4 - H, y1: -4 });
      g.save();
      g.clip(cone);
      g.fillStyle = rgba(c.colors.detail, 0.9);
      for (const f of [0.18, 0.42, 0.66]) g.fillRect(-bw, -4 - H * f, bw * 2, 2.2);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.beginPath(); g.moveTo(0, -4 - H); g.lineTo(-bw * 0.55, -4); g.lineTo(-bw * 0.2, -4); g.closePath(); g.fill();
      g.restore();
      const dy = -4 - H * 0.28;
      warmGlass(g, polyPath([[-1.8, dy + 3], [-1.8, dy - 1], [0, dy - 3], [1.8, dy - 1], [1.8, dy + 3]]), dy - 3, dy + 3);
      fillShaded(g, circlePath(0, -6 - H, 2.6), BRASS, { lw: 1.4 });
      glow(g, 0, -6 - H, 5, '#fff2b0', 0.35 + 0.25 * Math.sin(c.t * 2));
    },
  }),
  B({
    id: 'b-roof-pagoda', name: 'Pagoda Tiers', category: 'roof', tier: 2, cost: 140, snap: 'top', layer: 'front', radius: 32,
    stats: { happy: 2 }, desc: 'Graceful upswept eaves, stacked twice.',
    draw(g, c) {
      const W = roofW(c);
      const eave = (y0: number, half: number) => {
        const p = new Path2D();
        p.moveTo(-half - 5, y0 - 3);
        p.quadraticCurveTo(-half, y0 - 3, -half * 0.55, y0 - 8);
        p.lineTo(half * 0.55, y0 - 8);
        p.quadraticCurveTo(half, y0 - 3, half + 5, y0 - 3);
        p.lineTo(half + 2, y0 + 1);
        p.lineTo(-half - 2, y0 + 1);
        p.closePath();
        fillShaded(g, p, c.colors.coat, { y0: y0 - 8, y1: y0 + 1 });
        g.fillStyle = c.colors.detail;
        g.fillRect(-half - 1, y0 - 0.6, half * 2 + 2, 1.6);
      };
      const h1 = W * 0.62;
      fillShaded(g, polyPath([[-h1 * 0.5, -6], [-h1 * 0.5, -13], [h1 * 0.5, -13], [h1 * 0.5, -6]]), shade(c.colors.base, 0.08), { y0: -13, y1: -6 });
      g.fillStyle = '#ffd36b';
      g.fillRect(-2, -12, 4, 5);
      eave(0, W);
      eave(-13, h1);
      const ty = -21;
      fillShaded(g, polyPath([[-4, ty], [0, ty - 5], [4, ty]]), c.colors.coat, { y0: ty - 5, y1: ty });
      bar(g, 0, ty - 4, 0, ty - 10, 1.6, BRASS);
      fillShaded(g, circlePath(0, ty - 7, 1.8), BRASS, { lw: 1 });
      // Little bells swinging at the eave tips.
      const sw = Math.sin(c.t * 2.5) * 0.6;
      for (const x of [-W - 4, W + 4]) fillShaded(g, circlePath(x + sw, 0, 1.4), BRASS, { lw: 1, flat: true });
    },
  }),
  B({
    id: 'b-roof-onion', name: 'Onion Dome', category: 'roof', tier: 2, cost: 220, snap: 'top', layer: 'front', radius: 36,
    stats: { happy: 3 }, desc: 'A swirly onion dome. Pure delight.',
    draw(g, c) {
      const W = roofW(c), rx = Math.min(W * 0.58, 15), bh = rx * 1.55 + 6;
      fillShaded(g, polyPath([[-rx * 0.8, 1], [-rx * 0.8, -6], [rx * 0.8, -6], [rx * 0.8, 1]]), shade(c.colors.base, 0.1), { y0: -6, y1: 1 });
      g.fillStyle = rgba(shade(c.colors.base, -0.6), 0.75);
      for (const x of [-rx * 0.45, 0, rx * 0.45]) { g.beginPath(); g.moveTo(x - 1.2, 0); g.lineTo(x - 1.2, -3); g.arc(x, -3, 1.2, Math.PI, TAU); g.lineTo(x + 1.2, 0); g.fill(); }
      const b0 = -6;
      const bulb = new Path2D();
      bulb.moveTo(-rx * 0.6, b0);
      bulb.bezierCurveTo(-rx * 1.35, b0 - bh * 0.35, -rx * 0.9, b0 - bh * 0.72, 0, b0 - bh);
      bulb.bezierCurveTo(rx * 0.9, b0 - bh * 0.72, rx * 1.35, b0 - bh * 0.35, rx * 0.6, b0);
      bulb.closePath();
      fillShaded(g, bulb, c.colors.coat, { y0: b0 - bh, y1: b0 });
      g.save();
      g.clip(bulb);
      g.strokeStyle = rgba(c.colors.detail, 0.9);
      g.lineWidth = 2.2;
      for (let k = -3; k <= 3; k++) {
        g.beginPath();
        g.moveTo(k * rx * 0.45, b0 + 2);
        g.bezierCurveTo(k * rx * 0.45 + rx * 0.6, b0 - bh * 0.4, k * rx * 0.2 - rx * 0.2, b0 - bh * 0.7, 0, b0 - bh);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.beginPath(); g.ellipse(-rx * 0.45, b0 - bh * 0.45, rx * 0.2, bh * 0.2, -0.3, 0, TAU); g.fill();
      g.restore();
      bar(g, 0, b0 - bh + 1, 0, b0 - bh - 7, 1.6, BRASS);
      fillShaded(g, circlePath(0, b0 - bh - 3, 1.8), BRASS, { lw: 1 });
    },
  }),
  B({
    id: 'b-roof-garden', name: 'Sky Garden', category: 'roof', tier: 2, cost: 180, snap: 'top', layer: 'front', radius: 24,
    stats: { happy: 2, house: 1 }, desc: 'A leafy rooftop terrace.',
    draw(g, c) {
      const W = roofW(c) - 1.5;
      const sw = Math.sin(c.t * 1.3) * 0.7;
      // Tree.
      bar(g, W * 0.55, -3, W * 0.55 + sw * 0.3, -13, 2.4, '#7a5134');
      fillShaded(g, circlePath(W * 0.55 + sw, -17, 7), '#3f9e4d', { y0: -24, y1: -10 });
      fillShaded(g, circlePath(W * 0.55 + sw - 3, -14, 4), '#4fbf5e', { y0: -18, y1: -10, lw: 1.6 });
      // Bushes with flowers.
      fillShaded(g, circlePath(-W * 0.5 + sw * 0.4, -6, 5.5), LEAF, { y0: -12, y1: 0 });
      fillShaded(g, circlePath(-W * 0.05, -7, 6.5), '#5cc261', { y0: -14, y1: 0 });
      g.fillStyle = '#ff7eb3';
      g.beginPath();
      for (const [x, y] of [[-W * 0.55, -8], [-W * 0.38, -5], [-W * 0.08, -10], [W * 0.05, -6]]) { g.moveTo(x + 1.3, y); g.arc(x + sw * 0.4, y, 1.3, 0, TAU); }
      g.fill();
      g.fillStyle = '#ffe066';
      g.beginPath(); g.arc(-W * 0.2, -9, 1.1, 0, TAU); g.arc(W * 0.6 + sw, -20, 1.1, 0, TAU); g.fill();
      // Slab and railing.
      fillShaded(g, polyPath([[-W - 1, 1.5], [-W - 1, -2.5], [W + 1, -2.5], [W + 1, 1.5]]), c.colors.detail, { y0: -3, y1: 2, lw: 1.8 });
      g.strokeStyle = shade(c.colors.detail, -0.55);
      g.lineWidth = 1.2;
      g.beginPath();
      for (let x = -W + 1; x <= W - 1; x += 4.5) { g.moveTo(x, -2.5); g.lineTo(x, -7); }
      g.moveTo(-W, -7); g.lineTo(W, -7);
      g.stroke();
    },
  }),
  B({
    id: 'b-roof-crystal', name: 'Crystal Crown', category: 'roof', tier: 3, cost: 320, snap: 'top', layer: 'front', radius: 30,
    stats: { produce: 3, happy: 1 }, desc: 'Humming spice crystals that power the city.',
    draw(g, c) {
      const W = roofW(c);
      const e = energy(c, '#b48bff');
      const pulse = (Math.sin(c.t * 2.2) + 1) / 2;
      glow(g, 0, -12, 18 + pulse * 4, e, 0.45);
      const xs: [number, number, number, number][] = [[-W * 0.42, 15, 4.5, -0.3], [W * 0.45, 17, 5, 0.25], [0, 26, 6.5, 0], [-W * 0.18, 12, 3.6, -0.12], [W * 0.2, 11, 3.6, 0.14]];
      for (const [x, h, w, tilt] of xs) {
        g.save();
        g.translate(x, -1);
        g.rotate(tilt);
        const p = polyPath([[-w, 0], [-w, -h * 0.72], [0, -h], [w, -h * 0.72], [w, 0]]);
        fillShaded(g, p, shade(e, 0.1), { ol: shade(e, -0.6), y0: -h, y1: 0 });
        g.fillStyle = 'rgba(255,255,255,0.32)';
        g.beginPath(); g.moveTo(-w, -h * 0.72); g.lineTo(0, -h); g.lineTo(0, 0); g.lineTo(-w, 0); g.closePath(); g.fill();
        g.restore();
      }
      const rock = smoothPath([[-W - 1, 1.5], [-W * 0.7, -3], [0, -4], [W * 0.7, -3], [W + 1, 1.5]]);
      fillShaded(g, rock, STONE, { y0: -4, y1: 2 });
      const s = (c.t * 0.7) % 1;
      const sx = -W * 0.4 + s * W * 0.8, sy = -8 - Math.sin(s * Math.PI) * 12;
      g.fillStyle = `rgba(255,255,255,${Math.sin(s * Math.PI)})`;
      g.beginPath();
      g.moveTo(sx, sy - 3); g.lineTo(sx + 0.8, sy); g.lineTo(sx, sy + 3); g.lineTo(sx - 0.8, sy); g.closePath();
      g.moveTo(sx - 3, sy); g.lineTo(sx, sy + 0.8); g.lineTo(sx + 3, sy); g.lineTo(sx, sy - 0.8); g.closePath();
      g.fill();
    },
  }),

  // ============================================================ Walls
  B({
    id: 'b-wall-columns', name: 'Colonnade', category: 'wall', tier: 1, cost: 100, snap: 'side', layer: 'front', radius: 16,
    stats: { happy: 1, house: 1 }, desc: 'Noble columns for a grand facade.',
    draw(g, c) {
      const n = c.nodeR, h = n * 0.97, hw = n * 0.78;
      for (const x of [-n * 0.45, n * 0.45]) {
        fillShaded(g, polyPath([[x - 2.6, -h + 6], [x + 2.6, -h + 6], [x + 2.6, h - 3], [x - 2.6, h - 3]]), MARBLE, { y0: -h, y1: h });
        g.strokeStyle = rgba(shade(MARBLE, -0.5), 0.5);
        g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(x - 0.9, -h + 7); g.lineTo(x - 0.9, h - 4); g.moveTo(x + 0.9, -h + 7); g.lineTo(x + 0.9, h - 4); g.stroke();
        fillShaded(g, polyPath([[x - 3.8, -h + 3.5], [x + 3.8, -h + 3.5], [x + 3.2, -h + 6.5], [x - 3.2, -h + 6.5]]), MARBLE, { y0: -h + 3, y1: -h + 7, lw: 1.6 });
        fillShaded(g, polyPath([[x - 3.8, h - 3], [x + 3.8, h - 3], [x + 3.8, h], [x - 3.8, h]]), MARBLE, { y0: h - 3, y1: h, lw: 1.6 });
      }
      fillShaded(g, polyPath([[-hw, -h - 1], [hw, -h - 1], [hw, -h + 3.5], [-hw, -h + 3.5]]), MARBLE, { y0: -h - 1, y1: -h + 4 });
      g.fillStyle = rgba(c.colors.detail, 0.9);
      g.fillRect(-hw + 1.5, -h + 0.6, hw * 2 - 3, 1.4);
    },
  }),
  B({
    id: 'b-wall-balcony', name: 'Flower Balcony', category: 'wall', tier: 1, cost: 80, snap: 'side', layer: 'front', radius: 15,
    stats: { house: 2 }, desc: 'A sunny balcony with a striped awning.',
    draw(g, c) {
      const n = c.nodeR, sy = n * 0.42, x0 = -n * 0.42, x1 = n * 0.42;
      // French door.
      const door = polyPath([[x0 + 1, sy], [x0 + 1, -n * 0.45], [x1 - 1, -n * 0.45], [x1 - 1, sy]]);
      fillShaded(g, door, shade(c.colors.base, -0.35), { y0: -n * 0.45, y1: sy, lw: 1.6 });
      warmGlass(g, polyPath([[x0 + 2.6, sy - 1], [x0 + 2.6, -n * 0.38], [-0.6, -n * 0.38], [-0.6, sy - 1]]), -n * 0.4, sy);
      warmGlass(g, polyPath([[0.6, sy - 1], [0.6, -n * 0.38], [x1 - 2.6, -n * 0.38], [x1 - 2.6, sy - 1]]), -n * 0.4, sy);
      // Awning.
      const ay = -n * 0.48, flap = Math.sin(c.t * 2) * 0.4;
      const aw = polyPath([[x0 - 3, ay + 5 + flap], [x0, ay - 2], [x1, ay - 2], [x1 + 3, ay + 5 + flap]]);
      fillShaded(g, aw, '#fbf6ec', { y0: ay - 2, y1: ay + 5 });
      g.save();
      g.clip(aw);
      g.fillStyle = c.colors.coat;
      for (let x = x0 - 3; x < x1 + 3; x += 5) g.fillRect(x, ay - 3, 2.5, 10);
      g.restore();
      // Slab, railing, flower box.
      fillShaded(g, polyPath([[x0 - 4, sy], [x1 + 6, sy], [x1 + 4, sy + 3], [x0 - 4, sy + 3]]), MARBLE, { y0: sy, y1: sy + 3, lw: 1.8 });
      g.strokeStyle = IRON;
      g.lineWidth = 1.1;
      g.beginPath();
      for (let x = x0 - 3; x <= x1 + 5; x += 2.6) { g.moveTo(x, sy); g.lineTo(x, sy - 6); }
      g.moveTo(x0 - 3.5, sy - 6); g.lineTo(x1 + 5.5, sy - 6);
      g.stroke();
      fillShaded(g, polyPath([[x0 - 1, sy - 9], [x1 + 3, sy - 9], [x1 + 2, sy - 5.5], [x0, sy - 5.5]]), WOOD, { y0: sy - 9, y1: sy - 5, lw: 1.4 });
      g.fillStyle = LEAF;
      g.beginPath();
      for (let x = x0; x <= x1 + 2; x += 3) { g.moveTo(x + 1.8, sy - 9.5); g.arc(x, sy - 9.5, 1.8, 0, TAU); }
      g.fill();
      g.fillStyle = '#ff6f9e';
      g.beginPath();
      for (let x = x0 + 1.5; x <= x1 + 2; x += 4.5) { g.moveTo(x + 1.2, sy - 11); g.arc(x, sy - 11 + Math.sin(c.t * 2 + x) * 0.3, 1.2, 0, TAU); }
      g.fill();
    },
  }),
  B({
    id: 'b-wall-buttress', name: 'Buttress', category: 'wall', tier: 1, cost: 90, snap: 'side', layer: 'front', radius: 16,
    stats: { house: 1, produce: 1 }, desc: 'Stone props that let you build taller.',
    draw(g, c) {
      const n = c.nodeR;
      const p = polyPath([[-3, -n * 0.95], [4, -n * 0.95], [4, -n * 0.35], [n * 0.35 + 4, n * 0.05], [n * 0.35 + 4, n * 0.4], [n * 0.7 + 4, n], [-3, n]]);
      const col = mix(STONE, c.colors.base, 0.3);
      fillShaded(g, p, col, { y0: -n, y1: n });
      g.save();
      g.clip(p);
      g.strokeStyle = rgba(shade(col, -0.55), 0.45);
      g.lineWidth = 1;
      g.beginPath();
      let row = 0;
      for (let y = -n * 0.95 + 4.5; y < n; y += 4.5, row++) {
        g.moveTo(-4, y); g.lineTo(n, y);
        for (let x = -3 + (row % 2) * 3.5; x < n; x += 7) { g.moveTo(x, y - 4.5); g.lineTo(x, y); }
      }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.beginPath(); g.moveTo(4, -n * 0.35); g.lineTo(n * 0.35 + 4, n * 0.05); g.lineTo(n * 0.35 + 2, n * 0.05 + 2); g.lineTo(2, -n * 0.35 + 2); g.closePath(); g.fill();
      g.restore();
      fillShaded(g, polyPath([[-4, -n * 0.95], [0.5, -n * 0.95 - 5], [5, -n * 0.95]]), shade(col, 0.1), { y0: -n - 5, y1: -n, lw: 1.6 });
    },
  }),
  B({
    id: 'b-wall-banners', name: 'Hanging Banners', category: 'wall', tier: 1, cost: 70, snap: 'side', layer: 'front', radius: 16,
    stats: { happy: 2 }, desc: 'Long festival banners in your colours.',
    draw(g, c) {
      const n = c.nodeR, ry = -n * 0.88, bw = n * 0.2, by = n * 0.55;
      for (const [i, x] of [[0, -n * 0.38], [1, n * 0.38]] as [number, number][]) {
        const w1 = Math.sin(c.t * 2 + i * 1.3) * 1.6;
        const cloth = new Path2D();
        cloth.moveTo(x - bw, ry);
        cloth.lineTo(x + bw, ry);
        cloth.quadraticCurveTo(x + bw + w1 * 0.4, (ry + by) / 2, x + bw + w1, by);
        cloth.lineTo(x + w1, by - 4);
        cloth.lineTo(x - bw + w1, by);
        cloth.quadraticCurveTo(x - bw + w1 * 0.4, (ry + by) / 2, x - bw, ry);
        cloth.closePath();
        fillShaded(g, cloth, c.colors.coat, { y0: ry, y1: by });
        g.save();
        g.clip(cloth);
        g.fillStyle = rgba(c.colors.detail, 0.95);
        g.fillRect(x - bw - 3, ry, 1.8 + 3, by - ry);
        g.fillRect(x + bw - 1.8, ry, 1.8 + 3, by - ry);
        g.restore();
        emblem(g, x + w1 * 0.35, ry + (by - ry) * 0.38, Math.min(0.8, n / 22), c.colors.detail, 0);
      }
      bar(g, -n * 0.72, ry, n * 0.72, ry, 1.8, BRASS);
      fillShaded(g, circlePath(-n * 0.74, ry, 1.8), BRASS, { lw: 1 });
      fillShaded(g, circlePath(n * 0.74, ry, 1.8), BRASS, { lw: 1 });
    },
  }),
  B({
    id: 'b-wall-vines', name: 'Ivy Vines', category: 'wall', tier: 1, cost: 50, snap: 'side', layer: 'front', radius: 15,
    stats: { happy: 1, house: 1 }, desc: 'Climbing ivy with little blossoms.',
    draw(g, c) {
      const n = c.nodeR;
      const leaves = new Path2D(), flowers = new Path2D();
      g.lineCap = 'round';
      for (const [i, x0] of [[0, -n * 0.45], [1, 0], [2, n * 0.42]] as [number, number][]) {
        const top = -n * (0.55 + (i % 2) * 0.35);
        const pts: [number, number][] = [];
        for (let k = 0; k <= 7; k++) {
          const f = k / 7, y = n - (n - top) * f;
          pts.push([x0 + Math.sin(f * 7 + i * 2 + c.t * 0.9) * 2.2, y]);
        }
        g.strokeStyle = '#1f4a22';
        g.lineWidth = 2.6;
        g.beginPath();
        pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
        g.strokeStyle = '#3c7d3c';
        g.lineWidth = 1.2;
        g.stroke();
        pts.forEach(([x, y], k) => {
          if (k === 0) return;
          const s = k % 2 ? 1 : -1;
          leaves.moveTo(x + s * 2.8 + 2.2, y);
          leaves.ellipse(x + s * 2.8, y, 2.2, 1.4, s * 0.5, 0, TAU);
          if ((k + i) % 3 === 0) { flowers.moveTo(x - s * 1.8 + 1.1, y - 1); flowers.arc(x - s * 1.8, y - 1, 1.1, 0, TAU); }
        });
      }
      g.fillStyle = '#1f4a22';
      g.save(); g.translate(0.4, 0.4); g.fill(leaves); g.restore();
      g.fillStyle = LEAF;
      g.fill(leaves);
      g.fillStyle = mix('#ff9fd0', c.colors.detail, 0.3);
      g.fill(flowers);
    },
  }),

  // ============================================================ Doors
  B({
    id: 'b-door-arch', name: 'Grand Arch', category: 'door', tier: 1, cost: 60, snap: 'bottom', layer: 'front', radius: 14,
    stats: { house: 1, happy: 1 }, desc: 'Heavy wooden doors under a stone arch.',
    draw(g, c) {
      const n = c.nodeR, gy = n * 0.65, hw = n * 0.4, h = n * 1.15;
      fillShaded(g, archPath(hw + 3, gy - h - 3, gy), MARBLE, { y0: gy - h - 3, y1: gy });
      const door = archPath(hw, gy - h, gy);
      fillShaded(g, door, WOOD, { y0: gy - h, y1: gy, ol: '#3a2010' });
      g.save();
      g.clip(door);
      g.strokeStyle = 'rgba(58,32,16,0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, gy - h); g.lineTo(0, gy);
      for (const x of [-hw * 0.5, hw * 0.5]) { g.moveTo(x, gy - h); g.lineTo(x, gy); }
      g.stroke();
      g.restore();
      rivets(g, [[-hw * 0.72, gy - h * 0.55], [hw * 0.72, gy - h * 0.55], [-hw * 0.72, gy - h * 0.2], [hw * 0.72, gy - h * 0.2]], 0.8, '#3a2a20');
      g.strokeStyle = BRASS;
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(-1.8, gy - h * 0.42, 1.4, 0, TAU); g.moveTo(3.2, gy - h * 0.42); g.arc(1.8, gy - h * 0.42, 1.4, 0, TAU); g.stroke();
      fillShaded(g, polyPath([[-2.6, gy - h - 4.5], [2.6, gy - h - 4.5], [1.8, gy - h + 0.5], [-1.8, gy - h + 0.5]]), c.colors.detail, { lw: 1.4, y0: gy - h - 5, y1: gy - h + 1 });
      fillShaded(g, polyPath([[-hw - 6, gy - 2.4], [hw + 6, gy - 2.4], [hw + 6, gy], [-hw - 6, gy]]), STONE, { lw: 1.4, y0: gy - 2.4, y1: gy });
    },
  }),
  B({
    id: 'b-door-gate', name: 'Iron Gate', category: 'door', tier: 1, cost: 80, snap: 'bottom', layer: 'front', radius: 15,
    stats: { produce: 1, house: 1 }, desc: 'Wrought-iron gates between stone pillars.',
    draw(g, c) {
      const n = c.nodeR, gy = n * 0.65, hw = n * 0.42, h = n * 1.0;
      g.fillStyle = 'rgba(20,16,28,0.55)';
      g.fillRect(-hw, gy - h, hw * 2, h);
      const sw = Math.sin(c.t * 0.7) * 0.06;
      for (const s of [-1, 1]) {
        g.save();
        g.translate(s * hw, 0);
        g.scale(1 - Math.abs(sw) * 2, 1);
        g.strokeStyle = IRON;
        g.lineWidth = 1.4;
        g.beginPath();
        for (let k = 0; k < 3; k++) {
          const x = -s * (k + 0.5) * (hw / 3);
          g.moveTo(x, gy); g.lineTo(x, gy - h + 3);
        }
        g.moveTo(0, gy - h * 0.25); g.lineTo(-s * hw, gy - h * 0.25);
        g.moveTo(0, gy - h * 0.7); g.lineTo(-s * hw, gy - h * 0.7);
        g.stroke();
        g.fillStyle = IRON;
        for (let k = 0; k < 3; k++) {
          const x = -s * (k + 0.5) * (hw / 3);
          g.beginPath(); g.moveTo(x - 1.4, gy - h + 3); g.lineTo(x, gy - h - 0.5); g.lineTo(x + 1.4, gy - h + 3); g.fill();
        }
        g.restore();
      }
      for (const s of [-1, 1]) {
        const x = s * (hw + 2.6);
        fillShaded(g, polyPath([[x - 2.8, gy], [x - 2.8, gy - h - 2], [x + 2.8, gy - h - 2], [x + 2.8, gy]]), mix(STONE, c.colors.base, 0.25), { y0: gy - h, y1: gy });
        fillShaded(g, circlePath(x, gy - h - 4.2, 2.6), c.colors.detail, { lw: 1.4 });
      }
    },
  }),
  B({
    id: 'b-door-slide', name: 'Glide Doors', category: 'door', tier: 2, cost: 140, snap: 'bottom', layer: 'front', radius: 14,
    stats: { produce: 2 }, desc: 'Modern glass doors that whoosh open.',
    draw(g, c) {
      const n = c.nodeR, gy = n * 0.65, hw = n * 0.4, h = n * 1.0;
      fillShaded(g, polyPath([[-hw - 2, gy], [-hw - 2, gy - h - 2], [hw + 2, gy - h - 2], [hw + 2, gy]]), GUNMETAL, { y0: gy - h, y1: gy });
      const inner = polyPath([[-hw, gy], [-hw, gy - h], [hw, gy - h], [hw, gy]]);
      const lit = g.createLinearGradient(0, gy - h, 0, gy);
      lit.addColorStop(0, '#fff6d6');
      lit.addColorStop(1, '#ffd17a');
      g.fillStyle = lit;
      g.fill(inner);
      const o = Math.max(0, Math.min(1, Math.sin(c.t * 0.9) * 1.6)) * hw * 0.8;
      g.save();
      g.clip(inner);
      glassFill(g, polyPath([[-hw - o, gy], [-hw - o, gy - h], [-o, gy - h], [-o, gy]]), gy - h, gy, '#9fd8ff', '#2f4a62');
      glassFill(g, polyPath([[o, gy], [o, gy - h], [hw + o, gy - h], [hw + o, gy]]), gy - h, gy, '#9fd8ff', '#2f4a62');
      g.restore();
      fillShaded(g, polyPath([[-hw - 4, gy - h - 2], [hw + 4, gy - h - 2], [hw + 4, gy - h - 5], [-hw - 4, gy - h - 5]]), c.colors.coat, { lw: 1.4, y0: gy - h - 5, y1: gy - h - 2 });
      g.fillStyle = '#7bd389';
      g.fillRect(-2, gy - h - 4.4, 4, 1.8);
    },
  }),
  B({
    id: 'b-door-portcullis', name: 'Portcullis', category: 'door', tier: 2, cost: 160, snap: 'bottom', layer: 'front', radius: 17,
    stats: { house: 2 }, desc: 'A castle gate with a creaky iron grille.',
    draw(g, c) {
      const n = c.nodeR, gy = n * 0.65, hw = n * 0.38, h = n * 1.05;
      const col = mix(STONE, c.colors.base, 0.2);
      const fw = hw + 4.5, ft = gy - h - 5;
      const frame = new Path2D();
      frame.moveTo(-fw, gy);
      const seg = (fw * 2) / 5;
      for (let k = 0; k < 5; k++) {
        const y = k % 2 ? ft : ft - 3.5;
        frame.lineTo(-fw + k * seg, y);
        frame.lineTo(-fw + (k + 1) * seg, y);
      }
      frame.lineTo(fw, ft - 3.5);
      frame.lineTo(fw, gy);
      frame.closePath();
      fillShaded(g, frame, col, { y0: ft - 4, y1: gy });
      const open = archPath(hw, gy - h, gy);
      g.fillStyle = '#16121c';
      g.fill(open);
      const lift = (Math.sin(c.t * 0.6) * 0.5 + 0.5) * h * 0.55;
      g.save();
      g.clip(open);
      g.translate(0, -lift);
      g.strokeStyle = '#5b5560';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let x = -hw + 2; x < hw; x += 3.4) { g.moveTo(x, gy - h - 2); g.lineTo(x, gy + 1); }
      for (let y = gy - h + 2; y < gy; y += 4) { g.moveTo(-hw, y); g.lineTo(hw, y); }
      g.stroke();
      g.fillStyle = '#5b5560';
      g.beginPath();
      for (let x = -hw + 2; x < hw; x += 3.4) { g.moveTo(x - 1, gy + 1); g.lineTo(x, gy + 3); g.lineTo(x + 1, gy + 1); }
      g.fill();
      g.restore();
      g.strokeStyle = shade(col, -0.6);
      g.lineWidth = OUTLINE_W;
      g.stroke(open);
    },
  }),

  // ============================================================ Details
  B({
    id: 'b-flag', name: 'Civic Flag', category: 'b-detail', tier: 1, cost: 50, snap: 'top', layer: 'front', radius: 26,
    stats: { happy: 1 }, desc: 'Fly the city colours high.',
    draw(g, c) {
      bar(g, 0, 1, 0, -26, 1.8, STEEL);
      const pts: [number, number][] = [];
      for (let k = 0; k <= 5; k++) pts.push([1 + k * 3, -25 + Math.sin(c.t * 4 - k * 0.9) * k * 0.45]);
      for (let k = 5; k >= 0; k--) pts.push([1 + k * 3, -15 + Math.sin(c.t * 4 - k * 0.9 + 0.3) * k * 0.45]);
      const f = new Path2D();
      pts.forEach(([x, y], i) => (i ? f.lineTo(x, y) : f.moveTo(x, y)));
      f.closePath();
      fillShaded(g, f, c.colors.coat, { y0: -26, y1: -14, lw: 1.8 });
      g.save();
      g.clip(f);
      g.fillStyle = c.colors.detail;
      g.fillRect(0, -21.5 + Math.sin(c.t * 4 - 2) * 1, 18, 3);
      g.restore();
      fillShaded(g, circlePath(0, -27, 1.8), BRASS, { lw: 1 });
    },
  }),
  B({
    id: 'b-antenna', name: 'Radio Mast', category: 'b-detail', tier: 1, cost: 120, snap: 'top', layer: 'front', radius: 30,
    stats: { produce: 2 }, desc: 'Lattice tower with a blinking beacon.',
    draw(g, c) {
      const H = 28;
      g.strokeStyle = outlineOf('#c9d3de');
      g.lineWidth = 3.2;
      g.lineCap = 'round';
      const lattice = () => {
        g.beginPath();
        g.moveTo(-5, 1); g.lineTo(-1, -H); g.moveTo(5, 1); g.lineTo(1, -H);
        for (let k = 0; k < 6; k++) {
          const y0 = 1 - (k * (H + 1)) / 6, y1 = 1 - ((k + 1) * (H + 1)) / 6;
          const w0 = 5 - (k * 4) / 6, w1 = 5 - ((k + 1) * 4) / 6;
          g.moveTo(-w0, y0); g.lineTo(w1, y1);
          g.moveTo(-w1, y1); g.lineTo(w1, y1);
        }
        g.stroke();
      };
      lattice();
      g.strokeStyle = '#d65a4a';
      g.lineWidth = 1.3;
      lattice();
      const on = Math.sin(c.t * 3) > 0;
      if (on) glow(g, 0, -H - 1.5, 7, '#ff4d4d', 0.75);
      fillShaded(g, circlePath(0, -H - 1.5, 2), on ? '#ff5a5a' : '#7a2222', { lw: 1.2, flat: true });
      fillShaded(g, ellipsePath(-4, -H * 0.55, 2.4, 3.2), '#eef2f6', { lw: 1.2, y0: -H * 0.55 - 3, y1: -H * 0.55 + 3 });
    },
  }),
  B({
    id: 'b-clock', name: 'Clock Face', category: 'b-detail', tier: 1, cost: 100, snap: 'any', layer: 'front', radius: 10,
    stats: { produce: 1, happy: 1 }, desc: 'Keeps the whole city on time.',
    draw(g, c) {
      fillShaded(g, circlePath(0, 0, 9), c.colors.detail, { y0: -9, y1: 9 });
      fillShaded(g, circlePath(0, 0, 7), '#fffaf0', { ol: shade(c.colors.detail, -0.6), lw: 1.4, flat: true });
      g.strokeStyle = '#3a2a20';
      g.lineCap = 'round';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = (k * TAU) / 12, r0 = k % 3 ? 5.6 : 4.8;
        g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * 6.3, Math.sin(a) * 6.3);
      }
      g.stroke();
      const m = c.t * 0.8 - Math.PI / 2, hh = c.t * 0.066 - Math.PI / 2 + 1.2;
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(hh) * 3.6, Math.sin(hh) * 3.6); g.stroke();
      g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(m) * 5.6, Math.sin(m) * 5.6); g.stroke();
      fillShaded(g, circlePath(0, 0, 1.1), '#c0392b', { lw: 0.8, flat: true });
      gloss(g, -3.5, -4, 2, 0.5);
    },
  }),
  B({
    id: 'b-statue', name: 'Hero Statue', category: 'b-detail', tier: 3, cost: 250, snap: 'top', layer: 'front', radius: 22,
    stats: { happy: 3 }, desc: 'A bronze founder raising a star. Inspiring!',
    draw(g, c) {
      const bronze = '#c98a4a';
      fillShaded(g, polyPath([[-7, 1], [-6, -6], [6, -6], [7, 1]]), MARBLE, { y0: -6, y1: 1 });
      fillShaded(g, polyPath([[-8, -6], [8, -6], [8, -8], [-8, -8]]), MARBLE, { y0: -8, y1: -6, lw: 1.4 });
      const body = smoothPath([[-4.5, -8], [-5, -14], [-2, -19], [3, -18], [5, -13], [4.5, -8]]);
      fillShaded(g, body, bronze, { y0: -19, y1: -8 });
      bar(g, 2.5, -16.5, 6.5, -23, 2.2, bronze);
      fillShaded(g, circlePath(0, -21.5, 3.6), bronze, { y0: -25, y1: -18 });
      g.fillStyle = shade(bronze, -0.55);
      g.beginPath(); g.arc(1.6, -22, 0.7, 0, TAU); g.fill();
      const tw = 0.7 + 0.3 * Math.sin(c.t * 3);
      glow(g, 7, -25.5, 6 * tw + 2, '#fff2a8', 0.6);
      g.fillStyle = '#ffe066';
      g.strokeStyle = '#8a5a0a';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * TAU) / 10, r = k % 2 ? 1.3 : 3.2;
        g.lineTo(7 + Math.cos(a) * r, -25.5 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      gloss(g, -2, -16, 1.6, 0.4);
    },
  }),
  B({
    id: 'b-chimney', name: 'Smokestack', category: 'b-detail', tier: 1, cost: 70, snap: 'top', layer: 'front', radius: 22,
    stats: { produce: 2 }, desc: 'Busy brick chimney. Factories love these.',
    draw(g, c) {
      smoke(g, 0, -16, c.t);
      const brick = '#b4553f';
      const p = polyPath([[-4.5, 2], [-4.5, -14], [4.5, -14], [4.5, 2]]);
      fillShaded(g, p, brick, { y0: -14, y1: 2 });
      g.save();
      g.clip(p);
      g.strokeStyle = 'rgba(70,20,10,0.45)';
      g.lineWidth = 0.9;
      g.beginPath();
      for (let y = -12, row = 0; y < 2; y += 3, row++) {
        g.moveTo(-5, y); g.lineTo(5, y);
        for (let x = -4.5 + (row % 2) * 2.2; x < 5; x += 4.4) { g.moveTo(x, y); g.lineTo(x, y + 3); }
      }
      g.stroke();
      g.restore();
      fillShaded(g, polyPath([[-6, -14], [6, -14], [6, -17], [-6, -17]]), shade(brick, -0.15), { y0: -17, y1: -14, lw: 1.6 });
    },
  }),
  B({
    id: 'b-windmill', name: 'Windmill', category: 'b-detail', tier: 2, cost: 200, snap: 'top', layer: 'front', radius: 26,
    stats: { produce: 3 }, desc: 'Turns wind into flour and power.',
    draw(g, c) {
      const tower = polyPath([[-6, 1], [-4, -16], [4, -16], [6, 1]]);
      fillShaded(g, tower, MARBLE, { y0: -16, y1: 1 });
      warmGlass(g, polyPath([[-1.3, -5], [-1.3, -8.5], [1.3, -8.5], [1.3, -5]]), -9, -5);
      fillShaded(g, polyPath([[-5.5, -16], [0, -21], [5.5, -16]]), c.colors.coat, { y0: -21, y1: -16, lw: 1.8 });
      const hy = -17, a0 = c.t * 1.6;
      for (let k = 0; k < 4; k++) {
        g.save();
        g.translate(0, hy);
        g.rotate(a0 + (k * Math.PI) / 2);
        bar(g, 0, 0, 0, -16, 1.2, WOOD);
        const sail = polyPath([[1, -4], [5, -4.5], [5, -16], [1, -16]]);
        fillShaded(g, sail, '#f6f0e2', { y0: -16, y1: -4, lw: 1.4, flat: true });
        g.strokeStyle = rgba(WOOD, 0.8);
        g.lineWidth = 0.7;
        g.beginPath();
        for (let y = -7; y > -16; y -= 3) { g.moveTo(1, y); g.lineTo(5, y); }
        g.stroke();
        g.restore();
      }
      fillShaded(g, circlePath(0, hy, 2), c.colors.detail, { lw: 1.2 });
    },
  }),
  B({
    id: 'b-dish', name: 'Sat Dish', category: 'b-detail', tier: 2, cost: 180, snap: 'top', layer: 'front', radius: 18,
    stats: { produce: 2, happy: 1 }, desc: 'Brings the whole planet’s news home.',
    draw(g, c) {
      fillShaded(g, polyPath([[-5, 1], [-3, -4], [3, -4], [5, 1]]), GUNMETAL, { y0: -4, y1: 1 });
      bar(g, 0, -3, 0, -7, 2.6, STEEL);
      g.save();
      g.translate(0, -8);
      g.rotate(-0.55 + Math.sin(c.t * 0.5) * 0.3);
      const bowl = new Path2D();
      bowl.moveTo(-12, -3);
      bowl.quadraticCurveTo(0, 9, 12, -3);
      bowl.quadraticCurveTo(0, 2, -12, -3);
      bowl.closePath();
      fillShaded(g, bowl, '#eef2f6', { y0: -3, y1: 4 });
      bar(g, -7, -1, 0, -9, 1, STEEL);
      bar(g, 7, -1, 0, -9, 1, STEEL);
      const on = Math.sin(c.t * 5) > 0;
      fillShaded(g, circlePath(0, -9.5, 1.8), on ? c.colors.detail : shade(c.colors.detail, -0.4), { lw: 1.2 });
      g.restore();
    },
  }),
  B({
    id: 'b-neon', name: 'Neon Sign', category: 'b-detail', tier: 2, cost: 150, snap: 'any', layer: 'front', radius: 14,
    stats: { happy: 2, produce: 1 }, desc: 'Buzzing neon that lights up the night.',
    draw(g, c) {
      const board = polyPath([[-12, -8], [12, -8], [12, 8], [-12, 8]]);
      fillShaded(g, board, '#2a2238', { y0: -8, y1: 8, ol: '#0e0a14' });
      const fl = Math.sin(c.t * 9) * Math.sin(c.t * 2.3) > 0.85 ? 0.25 : 1;
      const pink = '#ff5fae', cyan = '#57f0ff';
      const star = new Path2D();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * TAU) / 10, r = k % 2 ? 2.2 : 5;
        const x = -5 + Math.cos(a) * r, y = Math.sin(a) * r;
        if (k) star.lineTo(x, y); else star.moveTo(x, y);
      }
      star.closePath();
      const heart = new Path2D();
      heart.moveTo(6, 4.5);
      heart.bezierCurveTo(-0.5, 0, 2.5, -6.5, 6, -2.5);
      heart.bezierCurveTo(9.5, -6.5, 12.5, 0, 6, 4.5);
      g.lineJoin = 'round';
      for (const [p, col, a] of [[star, cyan, fl], [heart, pink, 1]] as [Path2D, string, number][]) {
        g.strokeStyle = rgba(col, 0.35 * a);
        g.lineWidth = 3.6;
        g.stroke(p);
        g.strokeStyle = a > 0.5 ? shade(col, 0.5) : shade(col, -0.4);
        g.lineWidth = 1.3;
        g.stroke(p);
      }
      g.strokeStyle = rgba(pink, 0.8);
      g.lineWidth = 1;
      g.setLineDash([1.6, 1.6]);
      g.lineDashOffset = -c.t * 6;
      g.strokeRect(-10.5, -6.5, 21, 13);
      g.setLineDash([]);
    },
  }),
];

registerParts(BUILDING_PARTS);
