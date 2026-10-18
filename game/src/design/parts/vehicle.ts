// Vehicle parts (Civilization stage). Side view: anchor at (0,0), +x = forward (direction of travel), +y = down.
//
// Conventions:
// - Locomotion parts put their lowest point at y = radius, because layoutDesign() puts the ground line at
//   anchor.y + radius * scale for the 'locomotion' category.
// - generateVehicle() picks parts by id substrings:
//     medium  sea parts contain 'sea'; air parts contain 'air'. Land ids avoid sea|air|prop|hull|wing|jet|motor,
//             and sea ids avoid 'prop' (the air filter matches it).
//     role    weapons are 'v-mil-…', economic tools 'v-eco-…', religious tools 'v-rel-…'.
// - Stats: move (locomotion), power (weapons, tools), armor (plates). They add up per vehicle (cap 10).
// The helpers exported at the top are shared with the ship and building catalogs.
import { registerParts } from '../registry';
import { mix, outlineOf, rgba, shade } from '../color';
import { circlePath, ellipsePath, fillShaded, gloss, OUTLINE_W, polyPath, smoothPath } from '../partkit';
import type { PartDef, PartDrawCtx } from '../types';
import { TAU } from '../../engine/math';

// ------------------------------------------------------------------ shared mechanical helpers

export const RUBBER = '#2f2d35';
export const STEEL = '#aebbcb';
export const GUNMETAL = '#5f6a78';
export const BRASS = '#eab54c';
export const WOOD = '#b57b45';
export const GLASS = '#9fe6ff';

/** Energy/glow colour, nudged toward the design's accent colour. */
export const energy = (c: PartDrawCtx, base = '#6ff2ff') => mix(base, c.colors.detail, 0.3);

/** Soft radial glow. */
export function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 0.55) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** A thick rounded bar with the house outline (struts, masts, pipes). */
export function bar(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string, ol = outlineOf(color)) {
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokeStyle = ol;
  g.lineWidth = w + OUTLINE_W;
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = w;
  g.stroke();
}

/** Small bright rivets. */
export function rivets(g: CanvasRenderingContext2D, pts: [number, number][], r = 0.95, color = 'rgba(255,255,255,0.7)') {
  g.fillStyle = color;
  g.beginPath();
  for (const [x, y] of pts) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
  g.fill();
}

/** Flickering flame pointing toward -x from (x, y). */
export function flame(g: CanvasRenderingContext2D, x: number, y: number, len: number, w: number, t: number, warm = '#ff9640', hot = '#fff4b8', seed = 0) {
  const f = 0.82 + 0.12 * Math.sin(t * 31 + seed) + 0.08 * Math.sin(t * 17.3 + seed * 2.1);
  const wob = Math.sin(t * 23 + seed) * w * 0.18;
  const L = len * f;
  g.fillStyle = rgba(warm, 0.88);
  g.beginPath();
  g.moveTo(x, y - w);
  g.quadraticCurveTo(x - L * 0.5, y - w * 1.1, x - L, y + wob);
  g.quadraticCurveTo(x - L * 0.5, y + w * 1.1, x, y + w);
  g.closePath();
  g.fill();
  g.fillStyle = hot;
  g.beginPath();
  g.moveTo(x, y - w * 0.55);
  g.quadraticCurveTo(x - L * 0.35, y - w * 0.55, x - L * 0.62, y + wob * 0.6);
  g.quadraticCurveTo(x - L * 0.35, y + w * 0.55, x, y + w * 0.55);
  g.closePath();
  g.fill();
}

/** A capsule (pill) path from x0 to x1 centred on y. */
export function capsule(x0: number, x1: number, y: number, r: number): Path2D {
  const p = new Path2D();
  p.moveTo(x0, y - r);
  p.lineTo(x1, y - r);
  p.arc(x1, y, r, -Math.PI / 2, Math.PI / 2);
  p.lineTo(x0, y + r);
  p.arc(x0, y, r, Math.PI / 2, Math.PI * 1.5);
  p.closePath();
  return p;
}

/** A little pilot silhouette looking forward (+x), for canopies and cabs. */
export function pilot(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = 'rgba(18,22,38,0.72)';
  g.beginPath();
  g.ellipse(x - s * 0.6, y + s * 5.6, s * 5.8, s * 3.4, 0, 0, TAU);
  g.moveTo(x + s * 4.2, y);
  g.ellipse(x, y, s * 4.2, s * 4.5, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#fffdf2';
  g.beginPath();
  g.arc(x + s * 1.5, y - s * 0.7, s * 1.15, 0, TAU);
  g.arc(x + s * 3.4, y - s * 0.5, s * 0.9, 0, TAU);
  g.fill();
}

/** Glassy fill: translucent tinted gradient, outline, and a curved specular streak. */
export function glassFill(g: CanvasRenderingContext2D, p: Path2D, y0: number, y1: number, tint = GLASS, ol = '#1d3a4f') {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, rgba(shade(tint, 0.55), 0.7));
  gr.addColorStop(0.45, rgba(tint, 0.22));
  gr.addColorStop(1, rgba(shade(tint, -0.3), 0.5));
  g.fillStyle = gr;
  g.fill(p);
  g.lineJoin = 'round';
  g.strokeStyle = ol;
  g.lineWidth = OUTLINE_W;
  g.stroke(p);
}

/** Two-bone IK in the plane: returns the knee for hip (hx,hy) and foot (fx,fy). bend +1/-1 picks the side. */
export function ik(hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, bend: number) {
  const dx = fx - hx, dy = fy - hy;
  const d = Math.min(l1 + l2 - 0.01, Math.max(0.01, Math.hypot(dx, dy)));
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const base = Math.atan2(dy, dx) + a * bend;
  return { x: hx + Math.cos(base) * l1, y: hy + Math.sin(base) * l1 };
}

/** Emblem used by religious parts: a radiant eye in a sun. */
export function emblem(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, t: number) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = 1.2 * s;
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = k * (TAU / 8) + t * 0.6;
    g.moveTo(Math.cos(a) * 4.6 * s, Math.sin(a) * 4.6 * s);
    g.lineTo(Math.cos(a) * 6.4 * s, Math.sin(a) * 6.4 * s);
  }
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-3.8 * s, 0);
  g.quadraticCurveTo(0, -3.6 * s, 3.8 * s, 0);
  g.quadraticCurveTo(0, 3.6 * s, -3.8 * s, 0);
  g.fill();
  g.fillStyle = 'rgba(20,16,30,0.85)';
  g.beginPath();
  g.arc(0.3 * s, 0, 1.4 * s, 0, TAU);
  g.fill();
  g.restore();
}

/** Coin with a § mark (Sporebucks). */
export function coin(g: CanvasRenderingContext2D, x: number, y: number, r: number, squash = 1) {
  fillShaded(g, ellipsePath(x, y, r, r * squash), '#ffd24a', { ol: '#7a4b0c', lw: 1.4, y0: y - r, y1: y + r });
  if (squash > 0.6) {
    g.fillStyle = '#b07510';
    g.font = `bold ${(r * 1.5).toFixed(1)}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('§', x, y + r * 0.08);
  }
}

// ------------------------------------------------------------------ vehicle-only helpers

const V = (d: Omit<PartDef, 'kind'> & { kind?: PartDef['kind'] }): PartDef => ({ kind: 'vehicle', ...d });

type WheelStyle = 'roller' | 'big' | 'spike';

function drawWheel(g: CanvasRenderingContext2D, c: PartDrawCtx, cx: number, cy: number, R: number, style: WheelStyle) {
  const spin = c.t * (60 / R);
  if (style === 'spike') {
    g.save();
    g.translate(cx, cy);
    g.rotate(spin);
    const sp = new Path2D();
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8;
      sp.moveTo(Math.cos(a - 0.2) * (R - 1), Math.sin(a - 0.2) * (R - 1));
      sp.lineTo(Math.cos(a) * (R + 4.2), Math.sin(a) * (R + 4.2));
      sp.lineTo(Math.cos(a + 0.2) * (R - 1), Math.sin(a + 0.2) * (R - 1));
      sp.closePath();
    }
    fillShaded(g, sp, STEEL, { y0: -R - 4, y1: R + 4, lw: 1.8 });
    g.restore();
  }
  // Tyre (top-lit, not rotated).
  fillShaded(g, circlePath(cx, cy, R), RUBBER, { ol: '#121016', y0: cy - R, y1: cy + R });
  // Tread blocks spin with the wheel.
  g.save();
  g.translate(cx, cy);
  g.rotate(spin);
  const n = style === 'big' ? 10 : 8;
  g.strokeStyle = '#4f4c58';
  g.lineCap = 'butt';
  g.lineWidth = style === 'big' ? 3.2 : 2;
  g.beginPath();
  for (let k = 0; k < n; k++) {
    const a = (k * TAU) / n;
    g.moveTo(Math.cos(a) * (R - (style === 'big' ? 3.4 : 2.4)), Math.sin(a) * (R - (style === 'big' ? 3.4 : 2.4)));
    g.lineTo(Math.cos(a) * (R - 0.6), Math.sin(a) * (R - 0.6));
  }
  g.stroke();
  g.restore();
  // Rim.
  const rr = R * (style === 'big' ? 0.52 : 0.6);
  const rimCol = style === 'spike' ? GUNMETAL : mix(STEEL, c.colors.detail, 0.35);
  fillShaded(g, circlePath(cx, cy, rr), rimCol, { y0: cy - rr, y1: cy + rr, lw: 1.6 });
  // Bolt holes spin, so the motion reads even when tiny.
  g.save();
  g.translate(cx, cy);
  g.rotate(spin);
  g.fillStyle = shade(rimCol, -0.55);
  g.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = (k * TAU) / 5;
    const x = Math.cos(a) * rr * 0.62, y = Math.sin(a) * rr * 0.62;
    g.moveTo(x + rr * 0.17, y);
    g.arc(x, y, rr * 0.17, 0, TAU);
  }
  g.fill();
  g.restore();
  // Hub cap in the paint colour.
  fillShaded(g, circlePath(cx, cy, rr * 0.36), c.colors.coat, { y0: cy - rr * 0.4, y1: cy + rr * 0.4, lw: 1.2 });
  gloss(g, cx - R * 0.45, cy - R * 0.5, R * 0.22, 0.35);
}

/** Stadium (track loop) path between two wheel centres. */
function trackLoop(x0: number, x1: number, cy: number, r: number): Path2D {
  return capsule(x0, x1, cy, r);
}

// ------------------------------------------------------------------ catalog

export const VEHICLE_PARTS: PartDef[] = [
  // ============================================================ Locomotion: land
  V({
    id: 'v-wheel', name: 'Roller Wheel', category: 'locomotion', tier: 1, cost: 50, snap: 'bottom', layer: 'front', radius: 13,
    stats: { move: 1 }, desc: 'A trusty wheel. Add two or more.',
    draw(g, c) { drawWheel(g, c, 0, 4, 9, 'roller'); },
  }),
  V({
    id: 'v-wheel-big', name: 'Bigfoot Tyre', category: 'locomotion', tier: 1, cost: 120, snap: 'bottom', layer: 'front', radius: 19,
    stats: { move: 2 }, desc: 'Monster tread for rough ground.',
    draw(g, c) { drawWheel(g, c, 0, 6, 13, 'big'); },
  }),
  V({
    id: 'v-wheel-spike', name: 'Spiker Wheel', category: 'locomotion', tier: 2, cost: 200, snap: 'bottom', layer: 'front', radius: 19,
    stats: { move: 3 }, desc: 'Studded rims that bite into anything.',
    draw(g, c) { drawWheel(g, c, 0, 4.8, 10, 'spike'); },
  }),
  V({
    id: 'v-treads', name: 'Crawler Treads', category: 'locomotion', tier: 1, cost: 160, snap: 'bottom', layer: 'front', radius: 19,
    stats: { move: 2, armor: 1 }, desc: 'Slow and unstoppable. A little extra armour.',
    draw(g, c) {
      const L = 14, cy = 12, r = 7;
      fillShaded(g, trackLoop(-L, L, cy, r), RUBBER, { ol: '#121016', y0: cy - r, y1: cy + r });
      // Links crawl around the loop.
      g.save();
      g.setLineDash([2.4, 2.2]);
      g.lineDashOffset = -c.t * 26;
      g.strokeStyle = '#5a5664';
      g.lineWidth = 2.2;
      g.stroke(trackLoop(-L, L, cy, r - 1.2));
      g.restore();
      g.fillStyle = '#1d1b22';
      g.fill(trackLoop(-L, L, cy, r - 2.6));
      // Road wheels and drive sprockets.
      const spin = c.t * 8;
      for (const [x, rr] of [[-L, 4.4], [-L / 3, 3.4], [L / 3, 3.4], [L, 4.4]] as [number, number][]) {
        fillShaded(g, circlePath(x, cy, rr), mix(STEEL, c.colors.detail, 0.3), { y0: cy - rr, y1: cy + rr, lw: 1.4 });
        g.strokeStyle = shade(STEEL, -0.55);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + Math.cos(spin) * rr * 0.75, cy + Math.sin(spin) * rr * 0.75);
        g.lineTo(x - Math.cos(spin) * rr * 0.75, cy - Math.sin(spin) * rr * 0.75);
        g.stroke();
      }
      // Armoured side skirt over the top run.
      const skirt = smoothPath([[-L - 6, cy - r + 1], [-L - 2, cy - r - 3], [L + 2, cy - r - 3], [L + 7, cy - r + 1], [L + 3, cy - r + 4.5], [-L - 3, cy - r + 4.5]]);
      fillShaded(g, skirt, c.colors.coat, { y0: cy - r - 3, y1: cy - r + 5 });
      rivets(g, [[-L + 2, cy - r + 0.8], [0, cy - r + 0.8], [L - 2, cy - r + 0.8]], 0.9);
    },
  }),
  V({
    id: 'v-hover', name: 'Hover Pad', category: 'locomotion', tier: 2, cost: 240, snap: 'bottom', layer: 'front', radius: 18,
    stats: { move: 3 }, desc: 'Glides on a cushion of humming light.',
    draw(g, c) {
      const bob = Math.sin(c.t * 3.1) * 1.2;
      const e = energy(c);
      // Light cushion and ground ripple.
      const gr = g.createLinearGradient(0, 8 + bob, 0, 18);
      gr.addColorStop(0, rgba(e, 0.55));
      gr.addColorStop(1, rgba(e, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-9, 8 + bob); g.lineTo(9, 8 + bob); g.lineTo(14, 18); g.lineTo(-14, 18); g.closePath();
      g.fill();
      const rip = (c.t * 1.6) % 1;
      g.strokeStyle = rgba(e, 0.6 * (1 - rip));
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(0, 17, 6 + rip * 9, 1 + rip * 1.2, 0, 0, TAU);
      g.stroke();
      // Strut and pad.
      bar(g, 0, -1, 0, 4 + bob, 4, GUNMETAL);
      const pad = smoothPath([[-15, 6 + bob], [-9, 2 + bob], [9, 2 + bob], [15, 6 + bob], [9, 9.5 + bob], [-9, 9.5 + bob]]);
      fillShaded(g, pad, mix(STEEL, c.colors.base, 0.35), { y0: 2 + bob, y1: 10 + bob });
      fillShaded(g, ellipsePath(0, 9 + bob, 8, 1.7), shade(e, 0.3), { ol: shade(e, -0.5), lw: 1.2, flat: true });
      glow(g, 0, 10 + bob, 9, e, 0.5);
      const blink = (Math.sin(c.t * 6) + 1) / 2;
      rivets(g, [[-11, 5.5 + bob], [11, 5.5 + bob]], 1.1, rgba(e, 0.5 + blink * 0.5));
    },
  }),
  V({
    id: 'v-mech-legs', name: 'Strider Legs', category: 'locomotion', tier: 3, cost: 280, snap: 'bottom', layer: 'front', paired: true, radius: 28,
    stats: { move: 3 }, desc: 'Stompy walker legs. Steps over anything.',
    draw(g, c) {
      const ph = c.t * 3.4 + (c.far ? Math.PI : 0);
      const fx = Math.sin(ph) * 7, lift = Math.max(0, Math.cos(ph)) * 4;
      const ax = fx, ay = 22.5 - lift;
      const k = ik(0, 1, ax, ay, 13, 13, 1);
      const legCol = c.colors.base;
      // Shin, piston, thigh.
      bar(g, k.x, k.y, ax, ay, 4.8, GUNMETAL);
      bar(g, k.x * 0.4, 1 + (k.y - 1) * 0.4, k.x * 0.4 + ax * 0.6, k.y * 0.4 + ay * 0.6, 1.8, STEEL);
      const tx = k.x, ty = k.y;
      const thigh = smoothPath([[-5, -1], [5, 0], [tx + 3.5, ty - 1], [tx + 1, ty + 4], [tx - 3, ty + 2], [-5, 4]]);
      fillShaded(g, thigh, legCol, { y0: -1, y1: ty + 4 });
      fillShaded(g, circlePath(k.x, k.y, 3.8), c.colors.coat, { y0: k.y - 4, y1: k.y + 4, lw: 1.8 });
      fillShaded(g, circlePath(0, 1, 4.6), mix(STEEL, legCol, 0.4), { y0: -4, y1: 6, lw: 1.8 });
      rivets(g, [[0, 1]], 1.3);
      // Clawed foot.
      const foot = smoothPath([[ax - 7.5, ay + 5.5], [ax - 5, ay - 0.8], [ax + 4, ay - 0.8], [ax + 10.5, ay + 5.5]]);
      fillShaded(g, foot, GUNMETAL, { y0: ay - 1, y1: ay + 6 });
      g.fillStyle = shade(GUNMETAL, -0.5);
      g.fillRect(ax - 7, ay + 4, 17, 1.5);
      gloss(g, k.x - 1.2, k.y - 1.4, 1.4, 0.55);
    },
  }),

  // ============================================================ Locomotion: sea
  V({
    id: 'v-sea-hull', name: 'Tug Hull', category: 'locomotion', tier: 1, cost: 100, snap: 'bottom', layer: 'front', radius: 22,
    stats: { move: 2 }, desc: 'A sturdy boat hull. Floats your vehicle.',
    draw(g, c) {
      const hull = new Path2D();
      hull.moveTo(-31, -3);
      hull.lineTo(30, -6);
      hull.quadraticCurveTo(36, -9.5, 37, -9);
      hull.quadraticCurveTo(33, 12, 18, 21.5);
      hull.lineTo(-17, 21.5);
      hull.quadraticCurveTo(-29, 20, -31, 7);
      hull.closePath();
      g.lineJoin = 'round';
      g.strokeStyle = outlineOf(c.colors.coat);
      g.lineWidth = OUTLINE_W * 1.2;
      g.stroke(hull);
      g.save();
      g.clip(hull);
      const top = g.createLinearGradient(0, -9, 0, 10);
      top.addColorStop(0, shade(c.colors.coat, 0.3));
      top.addColorStop(1, shade(c.colors.coat, -0.1));
      g.fillStyle = top;
      g.fillRect(-40, -12, 80, 24);
      g.fillStyle = c.colors.detail;
      g.fillRect(-40, 9.5, 80, 3);
      const bot = g.createLinearGradient(0, 12, 0, 22);
      bot.addColorStop(0, '#c4473f');
      bot.addColorStop(1, '#7e2228');
      g.fillStyle = bot;
      g.fillRect(-40, 12.5, 80, 12);
      g.restore();
      // Rub rail and portholes.
      g.strokeStyle = shade(c.colors.coat, -0.55);
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-30, 0.5); g.lineTo(33, -3); g.stroke();
      for (const x of [-17, -5, 7, 19]) {
        fillShaded(g, circlePath(x, 4.5, 2.4), '#e8edf2', { lw: 1.4, y0: 2, y1: 7 });
        g.fillStyle = '#2d4766';
        g.beginPath(); g.arc(x, 4.5, 1.4, 0, TAU); g.fill();
      }
      // Bow wave.
      const w = Math.sin(c.t * 4) * 1.2;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1.6;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(33, 9 + w * 0.3); g.quadraticCurveTo(37 + w, 11, 40 + w, 9); g.stroke();
      g.beginPath(); g.moveTo(-31, 12); g.quadraticCurveTo(-35 - w, 13, -38 - w, 11.5); g.stroke();
    },
  }),
  V({
    id: 'v-sea-pontoon', name: 'Twin Floats', category: 'locomotion', tier: 1, cost: 120, snap: 'bottom', layer: 'front', radius: 22,
    stats: { move: 2 }, desc: 'A pair of torpedo floats. Light and quick.',
    draw(g, c) {
      const float = (dx: number, dy: number, col: string) => {
        const p = smoothPath([[-25 + dx, 13 + dy], [17 + dx, 12.5 + dy], [30 + dx, 17 + dy], [17 + dx, 21.5 + dy], [-25 + dx, 21 + dy], [-27 + dx, 17 + dy]]);
        fillShaded(g, p, col, { y0: 12 + dy, y1: 22 + dy });
        g.save();
        g.clip(p);
        g.fillStyle = rgba(c.colors.coat, 0.9);
        g.fillRect(-10 + dx, 10 + dy, 5, 14);
        g.fillRect(4 + dx, 10 + dy, 5, 14);
        g.restore();
        return p;
      };
      float(-3, -3, shade(c.colors.detail, -0.35));
      bar(g, -12, -1, -12, 13, 3, GUNMETAL);
      bar(g, 11, -1, 11, 13, 3, GUNMETAL);
      float(0, 0, c.colors.detail);
      gloss(g, 14, 14.8, 2.2, 0.6);
      const w = Math.sin(c.t * 4) * 1.2;
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(-27, 19); g.quadraticCurveTo(-31 - w, 20, -34 - w, 18.5); g.stroke();
    },
  }),
  V({
    id: 'v-sea-keel', name: 'Racer Keel', category: 'locomotion', tier: 2, cost: 180, snap: 'bottom', layer: 'front', radius: 23,
    stats: { move: 3 }, desc: 'A slim racing hull with a deep keel.',
    draw(g, c) {
      // Keel fin with a ballast bulb, and the rudder.
      fillShaded(g, polyPath([[-4, 6], [8, 6], [3, 19], [-3, 19]]), GUNMETAL, { y0: 6, y1: 19 });
      fillShaded(g, ellipsePath(1, 19.6, 8, 3.2), shade(GUNMETAL, -0.2), { y0: 16, y1: 23 });
      fillShaded(g, polyPath([[-27, 2], [-22, 2], [-24, 12], [-28, 11]]), GUNMETAL, { y0: 2, y1: 12 });
      const hull = new Path2D();
      hull.moveTo(-30, -2.5);
      hull.lineTo(34, -4);
      hull.quadraticCurveTo(26, 6.5, 10, 8);
      hull.lineTo(-22, 8);
      hull.quadraticCurveTo(-29, 7, -30, -2.5);
      hull.closePath();
      fillShaded(g, hull, c.colors.coat, { y0: -4, y1: 8 });
      g.strokeStyle = c.colors.detail;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(-28, 1.8); g.lineTo(28, 0.5); g.stroke();
      gloss(g, 18, -1.5, 3, 0.4);
      const w = Math.sin(c.t * 5) * 1.5;
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(30, 3); g.quadraticCurveTo(35 + w, 5, 38 + w, 3); g.stroke();
    },
  }),
  V({
    id: 'v-sea-paddle', name: 'Paddle Wheeler', category: 'locomotion', tier: 1, cost: 140, snap: 'bottom', layer: 'front', radius: 19,
    stats: { move: 2 }, desc: 'A flat hull pushed along by a big paddle wheel.',
    draw(g, c) {
      const hull = smoothPath([[-29, 6], [27, 5], [33, 4], [26, 15], [16, 19], [-24, 19], [-30, 14]]);
      fillShaded(g, hull, shade(c.colors.coat, -0.05), { y0: 4, y1: 19 });
      g.save();
      g.clip(hull);
      g.fillStyle = c.colors.detail;
      g.fillRect(-35, 10, 70, 2.4);
      g.restore();
      // Wheel: paddles turn, housing stays.
      const cx = -4, cy = 7, R = 12;
      g.save();
      g.translate(cx, cy);
      g.rotate(c.t * 3.2);
      g.lineCap = 'butt';
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 8;
        g.strokeStyle = '#3a2416';
        g.lineWidth = 4.2;
        g.beginPath(); g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke();
        g.strokeStyle = WOOD;
        g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); g.lineTo(Math.cos(a) * (R - 0.8), Math.sin(a) * (R - 0.8)); g.stroke();
      }
      g.restore();
      fillShaded(g, circlePath(cx, cy, 3.6), BRASS, { y0: cy - 4, y1: cy + 4, lw: 1.4 });
      // Half-moon wheel housing with sunburst slats.
      const hous = new Path2D();
      hous.moveTo(cx - R - 2.5, cy - 1);
      hous.arc(cx, cy - 1, R + 2.5, Math.PI, 0);
      hous.closePath();
      fillShaded(g, hous, c.colors.base, { y0: cy - R - 3, y1: cy });
      g.strokeStyle = rgba(shade(c.colors.base, -0.55), 0.6);
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 1; k < 6; k++) {
        const a = Math.PI + (k * Math.PI) / 6;
        g.moveTo(cx + Math.cos(a) * 3, cy - 1 + Math.sin(a) * 3);
        g.lineTo(cx + Math.cos(a) * (R + 1.5), cy - 1 + Math.sin(a) * (R + 1.5));
      }
      g.stroke();
      // Splash under the paddles.
      const s = (c.t * 2) % 1;
      g.fillStyle = `rgba(255,255,255,${0.8 * (1 - s)})`;
      g.beginPath();
      g.arc(cx - 10 - s * 6, 16 - s * 4, 1.4, 0, TAU);
      g.arc(cx - 6 - s * 4, 17 - s * 6, 1.1, 0, TAU);
      g.fill();
    },
  }),
  V({
    id: 'v-sea-foil', name: 'Skimmer Foil', category: 'locomotion', tier: 3, cost: 300, snap: 'bottom', layer: 'front', radius: 23,
    stats: { move: 4 }, desc: 'A hydrofoil that lifts you above the waves.',
    draw(g, c) {
      bar(g, 0, -1, -3, 15, 3.4, GUNMETAL);
      // Torpedo nacelle with a spinning screw at the back.
      const ph = c.t * 22;
      const bl = Math.cos(ph) * 5.5;
      g.fillStyle = rgba(STEEL, 0.3);
      g.beginPath(); g.ellipse(-15.5, 18, 1.8, 5.5, 0, 0, TAU); g.fill();
      bar(g, -15.5, 18 - bl, -15.5, 18 + bl, 1.8, STEEL);
      fillShaded(g, smoothPath([[-14, 15], [6, 14.5], [13, 18], [6, 21.5], [-14, 21], [-15.5, 18]]), c.colors.coat, { y0: 14, y1: 22 });
      // Foil wing.
      fillShaded(g, smoothPath([[-12, 22], [8, 21.5], [12, 22.6], [-12, 23.2]]), GUNMETAL, { y0: 21, y1: 23.5, lw: 1.6 });
      gloss(g, 4, 16, 1.8, 0.55);
      const w = Math.sin(c.t * 6) * 1.2;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(-6, 9); g.quadraticCurveTo(-12 - w, 7, -16 - w, 9); g.stroke();
    },
  }),

  // ============================================================ Locomotion: air
  V({
    id: 'v-air-wing', name: 'Glider Wing', category: 'locomotion', tier: 1, cost: 120, snap: 'side', layer: 'front', paired: true, radius: 26,
    stats: { move: 2 }, desc: 'Swept wings. Put one on and take to the sky.',
    draw(g, c) {
      g.save();
      if (c.far) g.scale(1, -1);
      const wing = smoothPath([[15, -2], [16, 2], [-17, 18.5], [-28, 19.5], [-31, 16.5], [-10, -2.4]]);
      fillShaded(g, wing, c.colors.coat, { y0: -2, y1: 19 });
      g.save();
      g.clip(wing);
      g.fillStyle = c.colors.detail;
      g.beginPath(); g.moveTo(-20, 0); g.lineTo(-15, 0); g.lineTo(-23, 24); g.lineTo(-28, 24); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.moveTo(15, -2); g.lineTo(-10, -2.4); g.lineTo(-28, 17); g.lineTo(-24, 17); g.closePath(); g.fill();
      g.restore();
      g.strokeStyle = rgba(shade(c.colors.coat, -0.6), 0.55);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(9, 1.5); g.lineTo(-21, 15.5); g.stroke();
      const on = Math.sin(c.t * 5 + (c.far ? 1.7 : 0)) > 0.2;
      const lc = c.far ? '#ff5d5d' : '#66ff8a';
      if (on) glow(g, -29.5, 17.5, 5, lc, 0.7);
      fillShaded(g, circlePath(-29.5, 17.5, 1.7), on ? lc : shade(lc, -0.5), { lw: 1, flat: true });
      g.restore();
    },
  }),
  V({
    id: 'v-air-rotor', name: 'Whirly Rotor', category: 'locomotion', tier: 2, cost: 200, snap: 'top', layer: 'back', radius: 28,
    stats: { move: 3 }, desc: 'Helicopter blades. Drag it on top.',
    draw(g, c) {
      bar(g, 0, 2, 0, -12, 3.6, GUNMETAL);
      const hy = -13.5;
      g.fillStyle = rgba('#e7f0fa', 0.3);
      g.strokeStyle = rgba('#ffffff', 0.35);
      g.lineWidth = 1;
      g.beginPath(); g.ellipse(0, hy, 29, 3.2, 0, 0, TAU); g.fill(); g.stroke();
      const th = c.t * 9;
      for (const off of [0, Math.PI]) {
        const x = Math.cos(th + off) * 28, y = Math.sin(th + off) * 3;
        bar(g, 0, hy, x, hy + y, 3.2, '#3b3f4a');
        if (Math.abs(x) > 6) bar(g, x * 0.8, hy + y * 0.8, x, hy + y, 3.2, c.colors.coat);
      }
      fillShaded(g, ellipsePath(0, hy, 5, 3.4), c.colors.coat, { y0: hy - 3.4, y1: hy + 3.4, lw: 1.8 });
      gloss(g, -1.6, hy - 1.3, 1.5, 0.7);
    },
  }),
  V({
    id: 'v-air-jet', name: 'Jet Booster', category: 'locomotion', tier: 2, cost: 320, snap: 'any', layer: 'front', radius: 22,
    stats: { move: 4 }, desc: 'Afterburner pod. Very fast, very loud.',
    draw(g, c) {
      flame(g, -16, 0, 13 + c.act * 6, 3.6, c.t, '#ff8a3d', '#fff2b0');
      fillShaded(g, polyPath([[-17.5, -4], [-12, -5.2], [-12, 5.2], [-17.5, 4]]), GUNMETAL, { y0: -5, y1: 5, lw: 1.8 });
      const pod = smoothPath([[-13, -5.6], [4, -6.4], [12, -4], [13, 0], [12, 4], [4, 6.4], [-13, 5.6]]);
      fillShaded(g, pod, mix(STEEL, c.colors.base, 0.45), { y0: -6.5, y1: 6.5 });
      g.save();
      g.clip(pod);
      g.fillStyle = c.colors.coat;
      g.fillRect(-6, -8, 4, 16);
      g.restore();
      fillShaded(g, ellipsePath(12, 0, 2, 4.4), '#26232c', { lw: 1.4, flat: true });
      g.strokeStyle = shade(STEEL, 0.2);
      g.lineWidth = 1;
      const a = c.t * 30;
      g.beginPath(); g.moveTo(12, -Math.cos(a) * 3.6); g.lineTo(12, Math.cos(a) * 3.6); g.stroke();
      gloss(g, 2, -3.5, 2.6, 0.5);
    },
  }),
  V({
    id: 'v-air-spinner', name: 'Prop Engine', category: 'locomotion', tier: 1, cost: 100, snap: 'top', layer: 'front', radius: 24,
    stats: { move: 2 }, desc: 'A propeller nacelle. Whirr!',
    draw(g, c) {
      bar(g, -2, 0, -2, -9, 3, GUNMETAL);
      const cy = -12;
      const plank = smoothPath([[-2, cy - 2.6], [-24, cy - 1.6], [-27, cy], [-24, cy + 1.4], [-2, cy + 2]]);
      fillShaded(g, plank, c.colors.base, { y0: cy - 3, y1: cy + 2, lw: 1.8 });
      g.fillStyle = c.colors.detail;
      g.fillRect(-21, cy - 2, 3, 3.6);
      const nac = smoothPath([[-14, cy - 3], [0, cy - 5], [8, cy - 4.2], [8, cy + 4.2], [0, cy + 5], [-14, cy + 3]]);
      fillShaded(g, nac, c.colors.coat, { y0: cy - 5, y1: cy + 5 });
      g.strokeStyle = rgba(shade(c.colors.coat, -0.6), 0.6);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-3, cy - 4.4); g.lineTo(-3, cy + 4.4); g.stroke();
      // Prop disc (edge-on) with two blades.
      g.fillStyle = rgba('#e7f0fa', 0.25);
      g.beginPath(); g.ellipse(10.5, cy, 2.2, 14, 0, 0, TAU); g.fill();
      const th = c.t * 16;
      for (const off of [0, Math.PI]) {
        const l = Math.cos(th + off) * 13.5;
        bar(g, 10.5, cy, 10.5 + Math.sin(th + off) * 1.6, cy + l, 2.4, '#4a3b30');
      }
      fillShaded(g, smoothPath([[8.5, cy - 3.4], [13, cy - 1.5], [15, cy], [13, cy + 1.5], [8.5, cy + 3.4]]), c.colors.detail, { y0: cy - 3.4, y1: cy + 3.4, lw: 1.5 });
      gloss(g, -4, cy - 2.6, 2.2, 0.5);
    },
  }),
  V({
    id: 'v-air-balloon', name: 'Sky Balloon', category: 'locomotion', tier: 1, cost: 80, snap: 'top', layer: 'back', radius: 30,
    stats: { move: 1 }, desc: 'A lazy, lovely blimp. Drag it on top.',
    draw(g, c) {
      const bob = Math.sin(c.t * 1.6) * 1.2;
      const cy = -19 + bob;
      g.strokeStyle = '#4b3a2c';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-6, 0); g.lineTo(-13, cy + 9);
      g.moveTo(6, 0); g.lineTo(13, cy + 9);
      g.moveTo(0, 0); g.lineTo(0, cy + 11);
      g.stroke();
      // Tail fins and a little pusher prop.
      fillShaded(g, polyPath([[-17, cy - 2], [-28, cy - 10], [-27, cy - 2]]), c.colors.coat, { y0: cy - 10, y1: cy });
      fillShaded(g, polyPath([[-17, cy + 2], [-28, cy + 9], [-27, cy + 2]]), c.colors.coat, { y0: cy, y1: cy + 9 });
      const env = ellipsePath(0, cy, 24, 11.5);
      fillShaded(g, env, c.colors.detail, { y0: cy - 12, y1: cy + 12 });
      g.save();
      g.clip(env);
      g.fillStyle = rgba(c.colors.coat, 0.9);
      for (const x of [-14, 0, 14]) { g.beginPath(); g.ellipse(x, cy, 3.4, 13, 0, 0, TAU); g.fill(); }
      g.restore();
      g.strokeStyle = outlineOf(c.colors.detail);
      g.lineWidth = OUTLINE_W;
      g.stroke(env);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath(); g.ellipse(-4, cy - 6, 13, 3, -0.08, 0, TAU); g.fill();
      const pl = Math.cos(c.t * 14) * 4;
      bar(g, -29, cy - pl, -29, cy + pl, 1.6, '#4a3b30');
    },
  }),

  // ============================================================ Weapons (military)
  V({
    id: 'v-mil-cannon', name: 'Boomer Cannon', category: 'v-weapon', tier: 1, cost: 150, snap: 'top', layer: 'front', radius: 22,
    stats: { power: 2 }, desc: 'A classic turret cannon. Boom.',
    draw(g, c) {
      const rec = c.act * 5;
      g.save();
      g.rotate(-0.1);
      fillShaded(g, polyPath([[3 - rec, -9], [22 - rec, -9], [22 - rec, -4.5], [3 - rec, -4.5]]), GUNMETAL, { y0: -9, y1: -4.5 });
      fillShaded(g, polyPath([[20 - rec, -10.5], [25 - rec, -10.5], [25 - rec, -3], [20 - rec, -3]]), shade(GUNMETAL, -0.15), { y0: -10.5, y1: -3, lw: 1.8 });
      if (c.act > 0.35) {
        g.fillStyle = rgba('#ffe066', 0.9);
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU, r = k % 2 ? 3 : 7 * c.act + 3;
          g.lineTo(28 + Math.cos(a) * r, -6.8 + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
      }
      g.restore();
      const dome = new Path2D();
      dome.moveTo(-11, 1);
      dome.quadraticCurveTo(-10, -12, 1, -12);
      dome.quadraticCurveTo(11, -12, 11, 1);
      dome.closePath();
      fillShaded(g, dome, c.colors.coat, { y0: -12, y1: 1 });
      g.fillStyle = rgba(shade(c.colors.coat, -0.6), 0.55);
      g.fillRect(-9, -3, 18, 1.5);
      rivets(g, [[-6, -6], [0, -8], [6, -6]]);
      gloss(g, -3, -9, 2.6, 0.5);
    },
  }),
  V({
    id: 'v-mil-twin', name: 'Twin Popper', category: 'v-weapon', tier: 2, cost: 240, snap: 'top', layer: 'front', radius: 20,
    stats: { power: 3 }, desc: 'Two quick-fire barrels taking turns.',
    draw(g, c) {
      const ph = c.act > 0 ? Math.floor(c.act * 6) % 2 : -1;
      for (const [i, y] of [[0, -11.5], [1, -6.5]] as [number, number][]) {
        const rec = ph === i ? 3 : 0;
        fillShaded(g, polyPath([[2 - rec, y - 1.8], [20 - rec, y - 1.8], [20 - rec, y + 1.8], [2 - rec, y + 1.8]]), GUNMETAL, { y0: y - 2, y1: y + 2, lw: 1.8 });
        if (ph === i) glow(g, 22, y, 5, '#ffd34d', 0.9);
      }
      const box = smoothPath([[-10, 1], [-10, -12], [-6, -15], [7, -15], [9, -11], [9, 1]]);
      fillShaded(g, box, c.colors.coat, { y0: -15, y1: 1 });
      g.fillStyle = '#ffd166';
      g.fillRect(-7, -4, 13, 2.4);
      g.fillStyle = '#2a2a2a';
      for (let x = -6; x < 6; x += 4) g.fillRect(x, -4, 2, 2.4);
      rivets(g, [[-7, -12], [5, -12]]);
      gloss(g, -4, -11.5, 2.4, 0.45);
    },
  }),
  V({
    id: 'v-mil-missile', name: 'Missile Pod', category: 'v-weapon', tier: 2, cost: 280, snap: 'top', layer: 'front', radius: 20,
    stats: { power: 3 }, desc: 'A box of fizzing rockets.',
    draw(g, c) {
      bar(g, 0, 1, 0, -5, 3.4, GUNMETAL);
      g.save();
      g.translate(0, -7);
      g.rotate(-0.38);
      const out = c.act * 7;
      for (const y of [-4.2, 0, 4.2]) {
        fillShaded(g, smoothPath([[8 + out, y - 1.7], [13 + out, y - 1.2], [15.5 + out, y], [13 + out, y + 1.2], [8 + out, y + 1.7]]), '#e9483b', { y0: y - 2, y1: y + 2, lw: 1.5 });
      }
      const box = polyPath([[-11, -7], [10, -7], [10, 7], [-11, 7]]);
      fillShaded(g, box, c.colors.coat, { y0: -7, y1: 7 });
      g.strokeStyle = rgba(shade(c.colors.coat, -0.6), 0.6);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-11, -2.1); g.lineTo(10, -2.1);
      g.moveTo(-11, 2.1); g.lineTo(10, 2.1);
      g.stroke();
      fillShaded(g, polyPath([[-11, -7], [-6, -7], [-6, 7], [-11, 7]]), shade(c.colors.coat, -0.2), { y0: -7, y1: 7, lw: 1.4 });
      gloss(g, 0, -5, 2.4, 0.45);
      if (c.act > 0.2) flame(g, -11, 0, 8 * c.act, 2.6, c.t);
      g.restore();
    },
  }),
  V({
    id: 'v-mil-laser', name: 'Ray Turret', category: 'v-weapon', tier: 3, cost: 380, snap: 'top', layer: 'front', radius: 22,
    stats: { power: 4 }, desc: 'Humming energy turret. Hits hard.',
    draw(g, c) {
      const e = '#ff5d8f';
      const pulse = (Math.sin(c.t * 5) + 1) / 2;
      if (c.act > 0.15) {
        g.strokeStyle = rgba(e, 0.45);
        g.lineWidth = 6 * c.act;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(24, -9); g.lineTo(60, -9); g.stroke();
        g.strokeStyle = '#fff';
        g.lineWidth = 2 * c.act;
        g.stroke();
      }
      fillShaded(g, polyPath([[2, -10.6], [20, -10.6], [20, -7.4], [2, -7.4]]), STEEL, { y0: -11, y1: -7, lw: 1.8 });
      for (const x of [8, 12.5, 17]) fillShaded(g, ellipsePath(x, -9, 1.6, 3.3), energy(c, e), { y0: -12, y1: -6, lw: 1.3 });
      glow(g, 22, -9, 6 + pulse * 2, e, 0.7);
      fillShaded(g, polyPath([[19.5, -9], [22, -12.2], [25, -9], [22, -5.8]]), shade(e, 0.4), { ol: shade(e, -0.6), lw: 1.4, y0: -12, y1: -6 });
      const dome = ellipsePath(0, -4, 10, 8);
      fillShaded(g, dome, shade(c.colors.coat, -0.05), { y0: -12, y1: 4 });
      g.fillStyle = shade(c.colors.coat, -0.4);
      g.fillRect(-10, 1.5, 20, 2.6);
      glow(g, -1, -6, 3.5, e, 0.6 + pulse * 0.3);
      gloss(g, -3.5, -8.5, 2.6, 0.55);
    },
  }),
  V({
    id: 'v-mil-flame', name: 'Flame Spitter', category: 'v-weapon', tier: 1, cost: 160, snap: 'any', layer: 'front', radius: 18,
    stats: { power: 2 }, desc: 'Spits a roaring tongue of fire forward.',
    draw(g, c) {
      g.save();
      g.scale(-1, 1);
      flame(g, -15.5, -1, 3.5 + c.act * 26, 1.6 + c.act * 4, c.t, '#ff7a2f', '#ffe38a', 3);
      g.restore();
      bar(g, 2, -1, 14, -1, 3, GUNMETAL);
      fillShaded(g, polyPath([[13, -3.6], [16.5, -3.6], [16.5, 1.6], [13, 1.6]]), shade(GUNMETAL, -0.2), { y0: -4, y1: 2, lw: 1.5 });
      const tank = capsule(-9, 1, -1, 5.4);
      fillShaded(g, tank, '#d8473b', { y0: -6.4, y1: 4.4 });
      g.fillStyle = '#ffd166';
      g.fillRect(-6, -6.4, 2.2, 10.8);
      g.fillRect(-1.5, -6.4, 2.2, 10.8);
      gloss(g, -8, -4, 2.2, 0.55);
    },
  }),

  // ============================================================ Tools: economic
  V({
    id: 'v-eco-cargo', name: 'Cargo Pod', category: 'v-tool', tier: 1, cost: 80, snap: 'top', layer: 'front', radius: 16,
    stats: { power: 1 }, desc: 'Hauls goods along trade routes.',
    draw(g, c) {
      const box = polyPath([[-13, 1], [-13, -15], [13, -15], [13, 1]]);
      fillShaded(g, box, c.colors.coat, { y0: -15, y1: 1 });
      g.strokeStyle = rgba(shade(c.colors.coat, -0.6), 0.55);
      g.lineWidth = 1.2;
      g.beginPath();
      for (let x = -9; x <= 9; x += 3.6) { g.moveTo(x, -13.5); g.lineTo(x, -0.5); }
      g.stroke();
      fillShaded(g, polyPath([[-14, -16.5], [14, -16.5], [14, -13.5], [-14, -13.5]]), shade(c.colors.coat, 0.2), { y0: -17, y1: -13, lw: 1.6 });
      fillShaded(g, polyPath([[-5, -11], [5, -11], [5, -4], [-5, -4]]), '#fff6dc', { lw: 1.3, y0: -11, y1: -4 });
      g.fillStyle = '#2f7a3e';
      g.font = 'bold 7px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('§', 0, -7.3);
    },
  }),
  V({
    id: 'v-eco-crate', name: 'Coin Crate', category: 'v-tool', tier: 1, cost: 140, snap: 'top', layer: 'front', radius: 15,
    stats: { power: 2 }, desc: 'An open crate of shiny Sporebucks. Very persuasive.',
    draw(g, c) {
      for (const [x, y, r] of [[-6, -9, 3.6], [1, -11.5, 3.6], [7, -9.5, 3.4], [-1.5, -8, 3.4], [4, -13.5, 3.2]] as [number, number, number][]) coin(g, x, y, r, 0.55);
      coin(g, 1, -14.5, 3.6, 1);
      const crate = polyPath([[-11, 1], [-12, -9], [12, -9], [11, 1]]);
      fillShaded(g, crate, WOOD, { y0: -9, y1: 1 });
      g.strokeStyle = rgba('#4a2a12', 0.6);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-11.5, -4); g.lineTo(11.5, -4); g.moveTo(-6, -9); g.lineTo(-6, 1); g.moveTo(6, -9); g.lineTo(6, 1); g.stroke();
      const tw = (c.t * 1.3) % 1;
      g.fillStyle = `rgba(255,255,255,${Math.sin(tw * Math.PI)})`;
      g.beginPath();
      const sx = -4 + ((c.t * 1.3) | 0) % 3 * 5, sy = -13;
      g.moveTo(sx, sy - 3); g.lineTo(sx + 0.8, sy); g.lineTo(sx, sy + 3); g.lineTo(sx - 0.8, sy); g.closePath();
      g.moveTo(sx - 3, sy); g.lineTo(sx, sy + 0.8); g.lineTo(sx + 3, sy); g.lineTo(sx, sy - 0.8); g.closePath();
      g.fill();
    },
  }),
  V({
    id: 'v-eco-dish', name: 'Deal Dish', category: 'v-tool', tier: 2, cost: 260, snap: 'top', layer: 'front', radius: 18,
    stats: { power: 3 }, desc: 'Beams offers to every city in range.',
    draw(g, c) {
      bar(g, 0, 1, 0, -7, 3.2, GUNMETAL);
      const sw = Math.sin(c.t * 0.9) * 0.25;
      g.save();
      g.translate(0, -8);
      g.rotate(-0.6 + sw);
      // Signal arcs out of the dish.
      const s = (c.t * 1.2) % 1;
      g.strokeStyle = rgba(c.colors.detail, 0.9 * (1 - s));
      g.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        const r = 10 + ((s + k * 0.5) % 1) * 9;
        g.beginPath(); g.arc(0, -2, r, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.stroke();
      }
      const bowl = new Path2D();
      bowl.moveTo(-11, -3);
      bowl.quadraticCurveTo(0, 8, 11, -3);
      bowl.quadraticCurveTo(0, 1.5, -11, -3);
      bowl.closePath();
      fillShaded(g, bowl, '#eef2f6', { y0: -3, y1: 3 });
      bar(g, 0, 2, 0, -7, 1.2, STEEL);
      fillShaded(g, circlePath(0, -8, 1.8), c.colors.coat, { lw: 1.2 });
      g.restore();
    },
  }),
  V({
    id: 'v-eco-antenna', name: 'Trade Mast', category: 'v-tool', tier: 2, cost: 180, snap: 'top', layer: 'back', radius: 24,
    stats: { power: 2 }, desc: 'Broadcasts market prices. Good for business.',
    draw(g, c) {
      bar(g, 0, 1, 0, -22, 2.2, STEEL);
      bar(g, -6, -8, 6, -8, 1.6, STEEL);
      bar(g, -4, -15, 4, -15, 1.6, STEEL);
      const s = (c.t * 0.9) % 1;
      g.strokeStyle = rgba('#7bd389', 0.85 * (1 - s));
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(0, -24, 4 + s * 12, 2 + s * 5, 0, 0, TAU);
      g.stroke();
      coin(g, 0, -24.5, 3.6, 0.35 + Math.abs(Math.cos(c.t * 2.2)) * 0.65);
      const on = Math.sin(c.t * 4) > 0;
      rivets(g, [[-6, -8], [6, -8]], 1.2, on ? '#7bd389' : '#2c5a35');
    },
  }),

  // ============================================================ Tools: religious
  V({
    id: 'v-rel-horn', name: 'Hymn Horn', category: 'v-tool', tier: 1, cost: 120, snap: 'top', layer: 'front', radius: 18,
    stats: { power: 2 }, desc: 'A loudspeaker that sings the faith.',
    draw(g, c) {
      bar(g, -2, 1, -2, -6, 3, GUNMETAL);
      g.save();
      g.translate(-2, -8);
      g.rotate(-0.35);
      const s = (c.t * 1.4) % 1;
      g.strokeStyle = rgba(c.colors.detail, 1 - s);
      g.lineWidth = 1.6 + c.act;
      g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const r = 15 + ((s + k / 3) % 1) * 10 * (1 + c.act);
        g.beginPath(); g.arc(4, 0, r, -0.45, 0.45); g.stroke();
      }
      const horn = smoothPath([[-5, -2.5], [6, -3.5], [15, -9], [16.5, 0], [15, 9], [6, 3.5], [-5, 2.5]]);
      fillShaded(g, horn, BRASS, { y0: -9, y1: 9 });
      fillShaded(g, ellipsePath(15.6, 0, 2.2, 8.4), shade(BRASS, -0.45), { lw: 1.2, flat: true });
      fillShaded(g, capsule(-8, -3, 0, 3.6), c.colors.coat, { y0: -4, y1: 4, lw: 1.6 });
      gloss(g, 8, -3.5, 2.2, 0.6);
      g.restore();
    },
  }),
  V({
    id: 'v-rel-holo', name: 'Holo Beacon', category: 'v-tool', tier: 3, cost: 360, snap: 'top', layer: 'front', radius: 24,
    stats: { power: 4 }, desc: 'Projects a giant glowing sign of the faith.',
    draw(g, c) {
      const e = energy(c, '#8ff7ff');
      const flick = 0.75 + 0.25 * Math.sin(c.t * 23) * Math.sin(c.t * 7);
      const gr = g.createLinearGradient(0, -4, 0, -26);
      gr.addColorStop(0, rgba(e, 0.55 * flick));
      gr.addColorStop(1, rgba(e, 0.05));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(-2.5, -4); g.lineTo(2.5, -4); g.lineTo(12, -26); g.lineTo(-12, -26); g.closePath(); g.fill();
      g.save();
      g.globalAlpha *= flick;
      emblem(g, 0, -19 + Math.sin(c.t * 2) * 1, 1.25 + c.act * 0.3, shade(e, 0.35), c.t);
      g.strokeStyle = rgba(e, 0.35);
      g.lineWidth = 1;
      const sy = -9 - ((c.t * 14) % 17);
      g.beginPath(); g.moveTo(-9, sy); g.lineTo(9, sy); g.stroke();
      g.restore();
      const base = smoothPath([[-9, 1], [-7, -3], [7, -3], [9, 1]]);
      fillShaded(g, base, c.colors.coat, { y0: -3, y1: 1 });
      fillShaded(g, ellipsePath(0, -3.6, 3.4, 1.6), shade(e, 0.3), { ol: shade(e, -0.5), lw: 1.2, flat: true });
      glow(g, 0, -4, 6, e, 0.6);
    },
  }),
  V({
    id: 'v-rel-pipes', name: 'Choir Pipes', category: 'v-tool', tier: 2, cost: 220, snap: 'top', layer: 'front', radius: 20,
    stats: { power: 3 }, desc: 'Organ pipes that play hymns as you drive.',
    draw(g, c) {
      const hs = [12, 17, 21, 17, 12];
      for (let i = 0; i < 5; i++) {
        const x = -10 + i * 5, h = hs[i];
        fillShaded(g, polyPath([[x - 2.1, -2], [x - 2.1, -h], [x + 2.1, -h], [x + 2.1, -2]]), BRASS, { y0: -h, y1: -2, lw: 1.6 });
        g.fillStyle = '#5a3a10';
        g.beginPath(); g.ellipse(x, -h + 3.5, 1.2, 1.6, 0, 0, TAU); g.fill();
      }
      fillShaded(g, polyPath([[-14, 1], [-13, -3], [13, -3], [14, 1]]), WOOD, { y0: -3, y1: 1 });
      // Floating notes.
      for (let k = 0; k < 2; k++) {
        const s = (c.t * 0.7 + k * 0.5) % 1;
        const x = -4 + k * 9 + Math.sin(s * 6 + k) * 2.5, y = -20 - s * 10;
        g.fillStyle = rgba(c.colors.detail, Math.sin(s * Math.PI));
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 1.1;
        g.beginPath(); g.ellipse(x, y, 1.8, 1.3, -0.4, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(x + 1.6, y); g.lineTo(x + 1.6, y - 5); g.lineTo(x + 3.6, y - 4); g.stroke();
      }
      gloss(g, 0, -17, 1.4, 0.6);
    },
  }),
  V({
    id: 'v-rel-banner', name: 'Faith Banner', category: 'v-tool', tier: 1, cost: 70, snap: 'top', layer: 'back', radius: 26,
    stats: { power: 1 }, desc: 'A holy standard that rallies the crowd.',
    draw(g, c) {
      bar(g, 0, 1, 0, -26, 2, WOOD);
      bar(g, -1, -24, 13, -24, 1.6, WOOD);
      const pts: [number, number][] = [];
      for (let k = 0; k <= 4; k++) { const y = -24 + k * 4.2; pts.push([1 + Math.sin(c.t * 3 - k * 0.8) * 1.1 * (k / 4), y]); }
      for (let k = 4; k >= 0; k--) { const y = -24 + k * 4.2; pts.push([12.5 + Math.sin(c.t * 3 - k * 0.8 + 0.6) * 1.4 * (k / 4), y + (k === 4 ? 3 : 0)]); }
      const cloth = new Path2D();
      pts.forEach(([x, y], i) => (i ? cloth.lineTo(x, y) : cloth.moveTo(x, y)));
      cloth.closePath();
      fillShaded(g, cloth, c.colors.coat, { y0: -24, y1: -4 });
      emblem(g, 6.8 + Math.sin(c.t * 3 - 1.6) * 0.6, -15, 0.75, c.colors.detail, 0);
      fillShaded(g, circlePath(0, -27, 1.9), BRASS, { lw: 1.2 });
    },
  }),
  V({
    id: 'v-rel-orb', name: 'Glory Orb', category: 'v-tool', tier: 2, cost: 260, snap: 'top', layer: 'front', radius: 18,
    stats: { power: 3 }, desc: 'A floating orb of pure conviction.',
    draw(g, c) {
      const e = energy(c, '#ffe9a8');
      const bob = Math.sin(c.t * 2.2) * 1.5;
      const cy = -13 + bob;
      glow(g, 0, cy, 13 + c.act * 6, e, 0.55);
      g.save();
      g.translate(0, cy);
      g.rotate(c.t * 0.8);
      g.strokeStyle = rgba(e, 0.7);
      g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6; g.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); g.lineTo(Math.cos(a) * 11.5, Math.sin(a) * 11.5); }
      g.stroke();
      g.restore();
      fillShaded(g, circlePath(0, cy, 5.6), shade(e, 0.15), { ol: shade(e, -0.55), y0: cy - 6, y1: cy + 6 });
      gloss(g, -1.8, cy - 2.2, 1.8, 0.85);
      const cup = new Path2D();
      cup.moveTo(-7, -4); cup.quadraticCurveTo(0, 1, 7, -4); cup.lineTo(3, -1); cup.lineTo(4, 1); cup.lineTo(-4, 1); cup.lineTo(-3, -1); cup.closePath();
      fillShaded(g, cup, BRASS, { y0: -4, y1: 1 });
    },
  }),

  // ============================================================ Details
  V({
    id: 'v-light', name: 'Beam Lamp', category: 'v-detail', tier: 1, cost: 50, snap: 'any', layer: 'front', radius: 11,
    stats: {}, desc: 'A headlight. Lights the road ahead.',
    draw(g, c) {
      const gr = g.createLinearGradient(3, 0, 26, 0);
      gr.addColorStop(0, 'rgba(255,246,200,0.55)');
      gr.addColorStop(1, 'rgba(255,246,200,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(3, -3); g.lineTo(26, -9); g.lineTo(26, 9); g.lineTo(3, 3); g.closePath(); g.fill();
      fillShaded(g, smoothPath([[-5, -4.5], [3, -5.2], [5.5, 0], [3, 5.2], [-5, 4.5], [-6, 0]]), STEEL, { y0: -5, y1: 5 });
      fillShaded(g, ellipsePath(3.6, 0, 2.2, 4.2), '#fff6c8', { ol: '#7a6a2a', lw: 1.3, flat: true });
      glow(g, 4, 0, 6, '#fff3b0', 0.6);
      gloss(g, -2, -2.5, 1.6, 0.6);
    },
  }),
  V({
    id: 'v-fin', name: 'Shark Fin', category: 'v-detail', tier: 1, cost: 60, snap: 'top', layer: 'back', radius: 17,
    stats: { move: 1 }, desc: 'Stabilizer fin. Looks fast, is fast.',
    draw(g, c) {
      const fin = smoothPath([[10, 2], [3, -4], [-6, -15], [-11, -16], [-10, -9], [-9, 2]]);
      fillShaded(g, fin, c.colors.coat, { y0: -16, y1: 2 });
      g.save();
      g.clip(fin);
      g.fillStyle = rgba(c.colors.detail, 0.95);
      g.beginPath(); g.moveTo(-14, -12); g.lineTo(4, -2); g.lineTo(4, 1); g.lineTo(-14, -9); g.closePath(); g.fill();
      g.restore();
      gloss(g, -4, -9, 1.8, 0.5);
    },
  }),
  V({
    id: 'v-spoiler', name: 'Spoiler', category: 'v-detail', tier: 1, cost: 90, snap: 'top', layer: 'back', radius: 15,
    stats: { move: 1 }, desc: 'Rear wing. Pushes you into the road.',
    draw(g, c) {
      bar(g, -6, 1, -4, -8, 2.4, GUNMETAL);
      bar(g, 4, 1, 3, -8, 2.4, GUNMETAL);
      const w = smoothPath([[-14, -10], [0, -12.5], [10, -11], [10, -8], [-14, -7.5]]);
      fillShaded(g, w, c.colors.coat, { y0: -13, y1: -7 });
      fillShaded(g, polyPath([[-15.5, -14], [-12.5, -14], [-12.5, -5.5], [-15.5, -5.5]]), shade(c.colors.coat, -0.25), { y0: -14, y1: -5, lw: 1.6 });
      gloss(g, 2, -11, 2, 0.5);
    },
  }),
  V({
    id: 'v-flag', name: 'Pennant Whip', category: 'v-detail', tier: 1, cost: 50, snap: 'top', layer: 'back', radius: 26,
    stats: {}, desc: 'A springy antenna flying your colours.',
    draw(g, c) {
      const sway = Math.sin(c.t * 2.4) * 2;
      g.strokeStyle = '#2b2b33';
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 1); g.quadraticCurveTo(0, -12, sway - 1, -25); g.stroke();
      const tx = sway - 1, ty = -25;
      const f = new Path2D();
      f.moveTo(tx, ty);
      f.quadraticCurveTo(tx - 6, ty - 1 + Math.sin(c.t * 7) * 1.4, tx - 13, ty + 2.5 + Math.sin(c.t * 7 - 1) * 1.6);
      f.quadraticCurveTo(tx - 6, ty + 4 + Math.sin(c.t * 7 - 0.5) * 1.2, tx + 0.3, ty + 6);
      f.closePath();
      fillShaded(g, f, c.colors.coat, { y0: ty - 2, y1: ty + 6, lw: 1.8 });
      fillShaded(g, circlePath(tx, ty - 0.6, 1.5), BRASS, { lw: 1 });
    },
  }),
  V({
    id: 'v-exhaust', name: 'Exhaust Stacks', category: 'v-detail', tier: 1, cost: 70, snap: 'top', layer: 'back', radius: 18,
    stats: { move: 1 }, desc: 'Chrome pipes that puff happy smoke.',
    draw(g, c) {
      for (let k = 0; k < 3; k++) {
        const s = (c.t * 0.9 + k / 3) % 1;
        g.fillStyle = `rgba(210,210,220,${0.55 * (1 - s)})`;
        g.beginPath(); g.arc(-3 - s * 10, -15 - s * 8, 2 + s * 4, 0, TAU); g.fill();
      }
      for (const [x, h] of [[-4, 14], [3, 11]] as [number, number][]) {
        fillShaded(g, polyPath([[x - 1.8, 1], [x - 1.8 - 1.5, -h], [x + 1.8 - 1.5, -h], [x + 1.8, 1]]), STEEL, { y0: -h, y1: 1, lw: 1.8 });
        fillShaded(g, ellipsePath(x - 1.5, -h, 2.6, 1.1), '#2b2930', { lw: 1.3, flat: true });
      }
      gloss(g, -4.8, -8, 0.9, 0.8);
    },
  }),
  V({
    id: 'v-plate', name: 'Armour Plate', category: 'v-detail', tier: 1, cost: 120, snap: 'any', layer: 'front', radius: 12,
    stats: { armor: 2 }, desc: 'Riveted plating. Shrugs off hits.',
    draw(g, c) {
      const p = smoothPath([[-10, -7], [9, -7.5], [11, 0], [9, 7.5], [-10, 7], [-11.5, 0]]);
      fillShaded(g, p, mix(STEEL, c.colors.coat, 0.3), { y0: -8, y1: 8 });
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-8, -5); g.lineTo(7, -5.4); g.stroke();
      rivets(g, [[-7.5, -4], [6.5, -4], [-7.5, 4], [6.5, 4]], 1.1);
    },
  }),
  V({
    id: 'v-plate-heavy', name: 'Bulwark Plate', category: 'v-detail', tier: 2, cost: 240, snap: 'any', layer: 'front', radius: 15,
    stats: { armor: 4 }, desc: 'Massive spiked plating. Nothing gets through.',
    draw(g, c) {
      const sp = new Path2D();
      for (const y of [-6, 0, 6]) { sp.moveTo(10, y - 2.2); sp.lineTo(16, y); sp.lineTo(10, y + 2.2); sp.closePath(); }
      fillShaded(g, sp, STEEL, { y0: -9, y1: 9, lw: 1.6 });
      const p = smoothPath([[-12, -9.5], [10, -10], [12, 0], [10, 10], [-12, 9.5], [-13.5, 0]]);
      fillShaded(g, p, GUNMETAL, { y0: -10, y1: 10 });
      g.save();
      g.clip(p);
      g.fillStyle = '#ffd166';
      for (let x = -16; x < 14; x += 8) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 4, 4); g.lineTo(x + 8, 10); g.lineTo(x + 4, 10); g.closePath(); g.fill(); }
      g.restore();
      rivets(g, [[-9, -6.5], [0, -7], [8, -6.5], [-9, 1], [8, 1]], 1.2);
      gloss(g, -5, -6, 2.4, 0.4);
    },
  }),

  // ============================================================ Cockpits
  V({
    id: 'v-canopy', name: 'Bubble Canopy', kind: ['vehicle', 'ship'], category: 'cockpit', tier: 1, cost: 60, snap: 'top', layer: 'top', radius: 12,
    stats: {}, desc: 'A glass bubble with a happy pilot inside.',
    draw(g, c) {
      const dome = new Path2D();
      dome.moveTo(-10, 1);
      dome.bezierCurveTo(-10, -13, 10, -13, 10, 1);
      dome.closePath();
      g.save();
      g.clip(dome);
      pilot(g, 0.8, -3.6 + Math.sin(c.t * 1.7) * 0.4, 0.78);
      g.restore();
      glassFill(g, dome, -11, 1);
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 1.6;
      g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, 7, Math.PI * 1.12, Math.PI * 1.4); g.stroke();
      fillShaded(g, capsule(-10, 10, 1.4, 1.8), STEEL, { y0: -1, y1: 3, lw: 1.6 });
    },
  }),
  V({
    id: 'v-cabin', name: 'Driver Cab', category: 'cockpit', tier: 1, cost: 80, snap: 'top', layer: 'top', radius: 15,
    stats: { armor: 1 }, desc: 'A sturdy cab with a wide windscreen.',
    draw(g, c) {
      const cab = smoothPath([[-12, 1.5], [-12, -12], [-9, -14.5], [3, -14.5], [12, 1.5]]);
      fillShaded(g, cab, c.colors.base, { y0: -15, y1: 1.5 });
      const win = polyPath([[-1, -12], [3, -12], [9.5, -1], [-1, -1]]);
      g.save();
      g.clip(win);
      pilot(g, 3.2, -6.4, 0.8);
      g.restore();
      glassFill(g, win, -12, -1);
      const side = polyPath([[-9.5, -12], [-4, -12], [-4, -4.5], [-9.5, -4.5]]);
      glassFill(g, side, -12, -4.5);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(1.5, -10); g.lineTo(4, -4); g.stroke();
      gloss(g, -6, -13, 1.6, 0.5);
    },
  }),
  V({
    id: 'v-periscope', name: 'Periscope', category: 'cockpit', tier: 1, cost: 50, snap: 'top', layer: 'back', radius: 20,
    stats: {}, desc: 'Peek over the waves (or the hills).',
    draw(g, c) {
      const up = Math.sin(c.t * 0.8) * 1.5;
      bar(g, 0, 2, 0, -16 + up, 3.4, GUNMETAL);
      const hy = -18 + up;
      const head = smoothPath([[-3.5, hy - 2.6], [5, hy - 2.8], [7.5, hy], [5, hy + 2.8], [-3.5, hy + 2.6]]);
      fillShaded(g, head, c.colors.coat, { y0: hy - 3, y1: hy + 3 });
      fillShaded(g, ellipsePath(7, hy, 1.3, 2.2), GLASS, { ol: '#1d3a4f', lw: 1.2, flat: true });
      const glint = Math.max(0, Math.sin(c.t * 1.9)) ** 8;
      if (glint > 0.05) glow(g, 7.5, hy - 0.5, 5, '#ffffff', glint);
    },
  }),
];

registerParts(VEHICLE_PARTS);
