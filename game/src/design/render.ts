// Renders any Design (creature, vehicle, building, ship) in side view, and cells top-down.
// Includes procedural animation: spine waves, IK legs with a gait cycle, arm swings, action poses.
import { getPart } from './registry';
import { hashString, RNG } from '../engine/rng';
import { clamp, TAU } from '../engine/math';
import { outlineOf, rgba, shade } from './color';
import { DRAW_LAYERS, type Design, type DrawLayer, type LimbPose, type Palette, type PartDef, type PartDrawCtx, type PartInstance, type SpineNode } from './types';

export interface Pose {
  /** Seconds (drives idle motion). */
  t: number;
  /** 0..1 locomotion speed fraction. */
  walk?: number;
  /** Gait phase accumulator; callers should advance by dt * stepsPerSecond. Defaults to t*1.6. */
  phase?: number;
  /** 1 = facing right (default), -1 = facing left. */
  facing?: number;
  action?: string;
  /** 0..1 progress through the action. */
  actionT?: number;
  /** Height above ground (jumping/gliding), in design units. */
  lift?: number;
  /** Flash colour overlay (e.g. damage). */
  flash?: string;
  flashAmt?: number;
  alpha?: number;
  /** Lying on side (dead / asleep). 0..1 */
  down?: number;
}

export interface RenderOpts {
  shadow?: boolean;
  selectedUid?: string | null;
  hoverNode?: number | null;
  showNodes?: boolean;
  /** Draw simplified when tiny. Pixels of on-screen height below which LOD kicks in. */
  lodPx?: number;
}

export interface Layout {
  cx: number;
  groundY: number;
  top: number;
  left: number;
  right: number;
  height: number;
  width: number;
}

const legReach = (p: PartDef, pi: PartInstance) => (p.limbLength ?? 40) * pi.scale;

/** Bounding info in design space (rest pose). */
export function layoutDesign(d: Design): Layout {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const n of d.spine) {
    left = Math.min(left, n.x - n.r);
    right = Math.max(right, n.x + n.r);
    top = Math.min(top, n.y - n.r);
    bottom = Math.max(bottom, n.y + n.r);
  }
  if (d.spine.length === 0) { left = -20; right = 20; top = -20; bottom = 20; }
  let ground = bottom;
  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    const n = d.spine[pi.node];
    if (!p || !n) continue;
    const px = n.x + pi.ox, py = n.y + pi.oy;
    if (p.category === 'leg' || p.category === 'locomotion') {
      const reach = p.category === 'leg' ? legReach(p, pi) * 0.92 : p.radius * pi.scale;
      ground = Math.max(ground, py + reach);
      left = Math.min(left, px - p.radius * pi.scale * 0.5);
      right = Math.max(right, px + p.radius * pi.scale * 0.5);
    } else {
      const r = p.radius * pi.scale;
      left = Math.min(left, px - r);
      right = Math.max(right, px + r);
      top = Math.min(top, py - r);
      if (d.kind !== 'cell') bottom = Math.max(bottom, py + r * 0.5);
    }
  }
  if (d.kind === 'ship' || d.kind === 'cell') ground = (top + Math.max(bottom, ground)) / 2;
  const cx = (left + right) / 2;
  return { cx, groundY: ground, top, left, right, height: Math.max(ground, bottom) - top, width: right - left };
}

function farPalette(c: Palette): Palette {
  return { base: shade(c.base, -0.32), coat: shade(c.coat, -0.32), detail: shade(c.detail, -0.32), pattern: c.pattern };
}

/** Effective draw layer of a part instance. */
export function partLayer(pi: PartInstance, p: PartDef | undefined = getPart(pi.partId)): DrawLayer {
  if (pi.layer) return pi.layer;
  if (!p) return 'front';
  if (p.category === 'leg' || p.category === 'arm') return 'limb';
  return p.layer;
}

/** Parts sorted back-to-front: by layer, then by their order in the design. */
export function drawOrder(d: Design): PartInstance[] {
  return d.parts
    .map((pi, i) => ({ pi, i, l: DRAW_LAYERS.indexOf(partLayer(pi)) }))
    .sort((a, b) => a.l - b.l || a.i - b.i)
    .map((x) => x.pi);
}

/** Animated spine positions. */
function animateSpine(d: Design, pose: Pose): SpineNode[] {
  const t = pose.t, walk = pose.walk ?? 0;
  const n = d.spine.length;
  const out: SpineNode[] = new Array(n);
  const organic = d.kind === 'creature';
  const act = pose.action, at = pose.actionT ?? 0;
  for (let i = 0; i < n; i++) {
    const s = d.spine[i];
    let x = s.x, y = s.y, r = s.r;
    if (organic) {
      const head = i / Math.max(1, n - 1);
      y += Math.sin(t * 2.2 + i * 0.5) * 0.8 + Math.sin((pose.phase ?? t * 1.6) * TAU * 2 + i * 0.7) * 1.6 * walk;
      r *= 1 + Math.sin(t * 2.4) * 0.015;
      if (act === 'dance') { y += Math.sin(at * TAU * 3 + i) * 5; x += Math.sin(at * TAU * 1.5) * 3; }
      if (act === 'sing') y -= Math.sin(at * Math.PI) * 6 * head;
      if (act === 'pose') { y -= Math.sin(at * Math.PI) * 8 * head; }
      if (act === 'charge' || act === 'bite') x += Math.sin(at * Math.PI) * 10 * head;
      if (act === 'eat') y += Math.sin(at * Math.PI * 4) * 4 * head;
      if (act === 'talk') y -= Math.abs(Math.sin(at * Math.PI)) * 1.2 * head;
    } else if (d.kind === 'ship') {
      y += Math.sin(t * 1.5) * 1.2;
    }
    out[i] = { x, y, r };
  }
  return out;
}

function bodyPath(nodes: SpineNode[], kind: Design['kind'], pad = 0): Path2D {
  const p = new Path2D();
  if (kind === 'vehicle') {
    // Chunky toy chassis: one rounded box per node (nose and tail corners swept), joined by bands.
    // Every sub-shape is wound clockwise so overlaps union under the nonzero rule.
    const head = nodes.length - 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const hw = a.r * 1.05 + pad, hh = a.r + pad;
      // Only the outer corners are rounded (a swept nose, a softer tail) so the nodes read as one chassis.
      const solo = head === 0, nose = i === head || solo, tail = i === 0 || solo;
      const inner = a.r * 0.16 + pad;
      roundRect4(p, a.x - hw, a.y - hh, hw * 2, hh * 2, tail ? a.r * 0.6 + pad : inner, nose ? a.r * 0.9 + pad : inner, nose ? a.r * 0.35 + pad : inner, tail ? a.r * 0.35 + pad : inner);
      if (i > 0) bandCW(p, nodes[i - 1], a, Math.min(a.r, nodes[i - 1].r) * 0.85 + pad);
    }
    return p;
  }
  if (kind === 'building') {
    // Floors with a cornice ledge on top of each, and a plinth under the ground floor.
    let gi = 0;
    for (let i = 1; i < nodes.length; i++) if (nodes[i].y + nodes[i].r > nodes[gi].y + nodes[gi].r) gi = i;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const hw = a.r * BLD_W + pad, hh = a.r + pad;
      roundRect4(p, a.x - hw, a.y - hh, hw * 2, hh * 2, 1.5, 1.5, 1, 1);
      const cw = hw + 2.5, ct = a.y - a.r - 1 - pad;
      roundRect4(p, a.x - cw, ct, cw * 2, 4.5 + pad * 2, 1.2, 1.2, 1.2, 1.2);
      if (i > 0) bandCW(p, nodes[i - 1], a, Math.min(a.r, nodes[i - 1].r) * 0.85 + pad);
    }
    const gn = nodes[gi];
    if (gn) {
      const pw = gn.r * BLD_W + 4 + pad;
      roundRect4(p, gn.x - pw, gn.y + gn.r - 5 - pad, pw * 2, 5 + pad * 2, 1.5, 1.5, 0.5, 0.5);
    }
    return p;
  }
  if (kind === 'ship') return shipHullPath(nodes, pad);
  const sx = 1;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    p.moveTo(a.x + (a.r + pad) * sx, a.y);
    p.ellipse(a.x, a.y, (a.r + pad) * sx, a.r + pad, 0, 0, TAU);
    if (i > 0) {
      const b = nodes[i - 1];
      const dx = a.x - b.x, dy = a.y - b.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      const ra = a.r + pad, rb = b.r + pad;
      p.moveTo(a.x + nx * ra, a.y + ny * ra);
      p.lineTo(b.x + nx * rb, b.y + ny * rb);
      p.lineTo(b.x - nx * rb, b.y - ny * rb);
      p.lineTo(a.x - nx * ra, a.y - ny * ra);
      p.closePath();
    }
  }
  return p;
}

/** Half-width of a building floor, as a multiple of the node radius. */
const BLD_W = 1.25;

/** Sleek starship hull: a smooth ribbon along the spine, blunt at the tail (engines) and pointed at the nose. */
function shipHullPath(nodes: SpineNode[], pad: number): Path2D {
  const n = nodes.length;
  if (n === 1) {
    const a = nodes[0];
    const p = new Path2D();
    p.ellipse(a.x, a.y, a.r * 1.2 + pad, a.r * 0.82 + pad, 0, 0, TAU);
    return p;
  }
  const tan = (i: number): [number, number] => {
    const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const top: [number, number][] = [], bot: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    const [tx, ty] = tan(i);
    const nx = -ty, ny = tx;
    const ru = a.r + pad, rd = a.r * 0.9 + pad;
    top.push([a.x - nx * ru, a.y - ny * ru]);
    bot.push([a.x + nx * rd, a.y + ny * rd]);
  }
  const at = (a: SpineNode, t: [number, number], along: number, side: number): [number, number] => [a.x + t[0] * along - t[1] * side, a.y + t[1] * along + t[0] * side];
  const a0 = nodes[0], t0 = tan(0), z = nodes[n - 1], tz = tan(n - 1);
  const pts: [number, number][] = [
    at(a0, t0, -(a0.r * 0.92 + pad), -(a0.r * 0.52 + pad * 0.7)),
    ...top,
    at(z, tz, z.r * 0.72 + pad * 0.7, -(z.r * 0.62 + pad * 0.8)),
    at(z, tz, z.r * 1.32 + pad, 0),
    at(z, tz, z.r * 0.72 + pad * 0.7, z.r * 0.55 + pad * 0.8),
    ...bot.reverse(),
    at(a0, t0, -(a0.r * 0.92 + pad), a0.r * 0.46 + pad * 0.7),
  ];
  return smoothClosed(pts);
}

/** Closed Catmull-Rom spline through points. */
function smoothClosed(pts: [number, number][]): Path2D {
  const p = new Path2D();
  const n = pts.length;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  p.closePath();
  return p;
}

/** A band joining two nodes, wound clockwise (screen space) to union with the node shapes. */
function bandCW(p: Path2D, a: SpineNode, b: SpineNode, k: number) {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
  if (l < 0.5) return;
  const nx = -dy / l * k, ny = dx / l * k;
  const q: [number, number][] = [[a.x - nx, a.y - ny], [b.x - nx, b.y - ny], [b.x + nx, b.y + ny], [a.x + nx, a.y + ny]];
  let area = 0;
  for (let i = 0; i < 4; i++) area += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1];
  if (area < 0) q.reverse();
  p.moveTo(q[0][0], q[0][1]);
  for (let i = 1; i < 4; i++) p.lineTo(q[i][0], q[i][1]);
  p.closePath();
}

/** Clockwise rounded rect with per-corner radii (top-left, top-right, bottom-right, bottom-left). */
function roundRect4(p: Path2D, x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number) {
  const m = Math.max(0, Math.min(w, h) / 2);
  tl = Math.max(0, Math.min(tl, m)); tr = Math.max(0, Math.min(tr, m)); br = Math.max(0, Math.min(br, m)); bl = Math.max(0, Math.min(bl, m));
  p.moveTo(x + tl, y);
  p.lineTo(x + w - tr, y);
  if (tr) p.arcTo(x + w, y, x + w, y + tr, tr);
  p.lineTo(x + w, y + h - br);
  if (br) p.arcTo(x + w, y + h, x + w - br, y + h, br);
  p.lineTo(x + bl, y + h);
  if (bl) p.arcTo(x, y + h, x, y + h - bl, bl);
  p.lineTo(x, y + tl);
  if (tl) p.arcTo(x, y, x + tl, y, tl);
  p.closePath();
}


function drawPattern(g: CanvasRenderingContext2D, d: Design, nodes: SpineNode[], L: Layout) {
  const c = d.colors;
  const rng = new RNG(hashString(d.name + d.spine.length));
  const x0 = L.left - 10, x1 = L.right + 10, y0 = L.top - 10, y1 = L.groundY + 10;
  const w = x1 - x0, hgt = y1 - y0;
  const bodyTop = Math.min(...nodes.map((n) => n.y - n.r));
  const bodyBot = Math.max(...nodes.map((n) => n.y + n.r));
  switch (c.pattern) {
    case 'spots':
      g.fillStyle = c.coat;
      for (let i = 0; i < 26; i++) {
        const n = nodes[rng.int(0, nodes.length - 1)];
        const a = rng.range(0, TAU), rr = rng.range(0, n.r * 0.85);
        g.beginPath();
        g.arc(n.x + Math.cos(a) * rr, n.y + Math.sin(a) * rr * 0.8 - n.r * 0.15, rng.range(0.1, 0.22) * n.r, 0, TAU);
        g.fill();
      }
      break;
    case 'dots':
      g.fillStyle = c.detail;
      for (let x = x0; x < x1; x += 9) for (let y = bodyTop; y < bodyBot; y += 9) {
        g.beginPath();
        g.arc(x + ((y / 9) % 2) * 4.5, y, 1.8, 0, TAU);
        g.fill();
      }
      break;
    case 'stripes':
      g.fillStyle = c.coat;
      for (let x = x0; x < x1; x += 16) {
        g.beginPath();
        g.moveTo(x, y0);
        g.lineTo(x + 7, y0);
        g.lineTo(x + 3, y1);
        g.lineTo(x - 4, y1);
        g.closePath();
        g.fill();
      }
      break;
    case 'tiger':
      g.strokeStyle = c.coat;
      g.lineCap = 'round';
      for (const n of nodes) {
        for (let k = -1; k <= 1; k++) {
          g.lineWidth = n.r * 0.16;
          g.beginPath();
          const xx = n.x + k * n.r * 0.55;
          g.moveTo(xx - n.r * 0.1, n.y - n.r);
          g.quadraticCurveTo(xx + n.r * 0.25, n.y - n.r * 0.3, xx - n.r * 0.05, n.y + n.r * 0.1);
          g.stroke();
        }
      }
      break;
    case 'bands':
      g.fillStyle = c.coat;
      for (const n of nodes) {
        g.beginPath();
        g.ellipse(n.x, n.y - n.r * 0.55, n.r * 1.05, n.r * 0.55, 0, 0, TAU);
        g.fill();
      }
      break;
    case 'belly': {
      g.fillStyle = c.detail;
      for (const n of nodes) {
        g.beginPath();
        g.ellipse(n.x, n.y + n.r * 0.62, n.r * 0.95, n.r * 0.55, 0, 0, TAU);
        g.fill();
      }
      break;
    }
    case 'patches':
      g.fillStyle = c.coat;
      for (let i = 0; i < 7; i++) {
        const n = nodes[rng.int(0, nodes.length - 1)];
        g.beginPath();
        const cx = n.x + rng.range(-0.6, 0.6) * n.r, cy = n.y + rng.range(-0.6, 0.4) * n.r, rr = n.r * rng.range(0.35, 0.6);
        for (let k = 0; k <= 8; k++) {
          const a = (k / 8) * TAU, q = rr * rng.range(0.75, 1.15);
          const px = cx + Math.cos(a) * q, py = cy + Math.sin(a) * q;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
      }
      break;
    case 'gradient': {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, c.coat);
      gr.addColorStop(0.55, rgba(c.coat, 0));
      g.fillStyle = gr;
      g.fillRect(x0, y0, w, hgt);
      break;
    }
    case 'scales':
      g.strokeStyle = rgba(c.coat, 0.85);
      g.lineWidth = 1.3;
      for (let y = bodyTop; y < bodyBot; y += 6) for (let x = x0 + ((y / 6) % 2) * 4; x < x1; x += 8) {
        g.beginPath();
        g.arc(x, y, 4, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
      }
      break;
  }
}

function drawBody(g: CanvasRenderingContext2D, d: Design, nodes: SpineNode[], L: Layout, far: boolean) {
  if (nodes.length === 0) return;
  const c = far ? farPalette(d.colors) : d.colors;
  const ol = outlineOf(c.base);
  const lw = d.kind === 'building' ? 2 : 2.6;
  const outlinePath = bodyPath(nodes, d.kind, lw);
  g.fillStyle = ol;
  g.fill(outlinePath);
  const path = bodyPath(nodes, d.kind);
  g.save();
  g.clip(path);
  if (d.kind === 'vehicle' || d.kind === 'ship' || d.kind === 'building') {
    decorateMechBody(g, d, c, nodes, L);
    g.restore();
    return;
  }
  // Base with vertical light falloff.
  const top = L.top, bot = Math.max(...nodes.map((n) => n.y + n.r));
  const grad = g.createLinearGradient(0, top, 0, bot);
  grad.addColorStop(0, shade(c.base, 0.18));
  grad.addColorStop(0.6, c.base);
  grad.addColorStop(1, shade(c.base, -0.28));
  g.fillStyle = grad;
  g.fillRect(L.left - 50, top - 50, L.width + 100, bot - top + 100);
  drawPattern(g, d, nodes, L);
  // Rim light / gloss.
  g.fillStyle = 'rgba(255,255,255,0.16)';
  for (const n of nodes) {
    g.beginPath();
    g.ellipse(n.x - n.r * 0.15, n.y - n.r * 0.55, n.r * 0.55, n.r * 0.2, -0.1, 0, TAU);
    g.fill();
  }
  g.restore();
}

/** Body surface for the mechanical kinds (already clipped to the body path). */
function decorateMechBody(g: CanvasRenderingContext2D, d: Design, c: Palette, nodes: SpineNode[], L: Layout) {
  const top = Math.min(...nodes.map((n) => n.y - n.r)), bot = Math.max(...nodes.map((n) => n.y + n.r));
  const x0 = L.left - 50, w = L.width + 100;
  if (d.kind === 'building') {
    // Each floor is its own lit block: bright under the cornice, darker toward the floor below.
    // Upper floors first, so each lower floor's cornice sits in front of the floor above it.
    const floors = [...nodes].sort((a, b) => a.y - b.y);
    for (const n of floors) {
      const gr = g.createLinearGradient(0, n.y - n.r, 0, n.y + n.r);
      gr.addColorStop(0, shade(c.base, 0.22));
      gr.addColorStop(0.5, c.base);
      gr.addColorStop(1, shade(c.base, -0.22));
      g.fillStyle = gr;
      g.fillRect(n.x - n.r * 2, n.y - n.r - 6, n.r * 4, n.r * 2 + 12);
    }
    drawPattern(g, d, nodes, L);
    decorateBuilding(g, c, floors);
    return;
  }
  // Metal: a bright top sheen, a crisp shadow line just below the middle, a dark underside.
  const grad = g.createLinearGradient(0, top, 0, bot);
  grad.addColorStop(0, shade(c.base, 0.5));
  grad.addColorStop(0.3, shade(c.base, 0.1));
  grad.addColorStop(0.52, c.base);
  grad.addColorStop(0.56, shade(c.base, -0.12));
  grad.addColorStop(1, shade(c.base, -0.38));
  g.fillStyle = grad;
  g.fillRect(x0, top - 50, w, bot - top + 100);
  drawPattern(g, d, nodes, L);
  if (d.kind === 'vehicle') decorateVehicle(g, c, nodes);
  else decorateShip(g, c, nodes);
}

/** A polyline through each node at height n.y + k*n.r, extended past both ends (nodes sorted by x). */
function nodeLine(p: Path2D | CanvasRenderingContext2D, ns: SpineNode[], k: number) {
  const a = ns[0], z = ns[ns.length - 1];
  p.moveTo(a.x - a.r * 1.4, a.y + a.r * k);
  for (const n of ns) p.lineTo(n.x, n.y + n.r * k);
  p.lineTo(z.x + z.r * 1.4, z.y + z.r * k);
}

function decorateVehicle(g: CanvasRenderingContext2D, c: Palette, nodes: SpineNode[]) {
  const dark = shade(c.base, -0.6);
  const ns = [...nodes].sort((a, b) => a.x - b.x);
  // Undercarriage skirt below a continuous seam.
  const skirt = new Path2D();
  nodeLine(skirt, ns, 0.45);
  const z = ns[ns.length - 1], a0 = ns[0];
  skirt.lineTo(z.x + z.r * 1.4, z.y + z.r * 3);
  skirt.lineTo(a0.x - a0.r * 1.4, a0.y + a0.r * 3);
  skirt.closePath();
  g.fillStyle = rgba(dark, 0.3);
  g.fill(skirt);
  // Panel seams: the skirt line plus a vertical seam between neighbouring nodes.
  g.strokeStyle = rgba(dark, 0.6);
  g.lineWidth = 1;
  g.beginPath();
  nodeLine(g, ns, 0.45);
  for (let i = 1; i < ns.length; i++) {
    const a = ns[i - 1], b = ns[i];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, rr = Math.max(a.r, b.r);
    g.moveTo(mx, my - rr * 1.2); g.lineTo(mx, my + rr * 0.45);
  }
  g.stroke();
  // Accent pinstripe.
  g.strokeStyle = rgba(c.detail, 0.9);
  g.lineWidth = 1.5;
  g.beginPath();
  nodeLine(g, ns, 0.16);
  g.stroke();
  // Rivets along the skirt.
  g.fillStyle = rgba(shade(c.base, 0.55), 0.85);
  g.beginPath();
  for (const n of ns) for (let k = -1; k <= 1; k++) { const x = n.x + k * n.r * 0.6, y = n.y + n.r * 0.7; g.moveTo(x + 1, y); g.arc(x, y, 1, 0, TAU); }
  g.fill();
  // Specular streaks.
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.beginPath();
  for (const n of nodes) { g.moveTo(n.x + n.r * 0.65, n.y - n.r * 0.66); g.ellipse(n.x - n.r * 0.05, n.y - n.r * 0.66, n.r * 0.7, n.r * 0.13, 0, 0, TAU); }
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  for (const n of nodes) { const x = n.x - n.r * 0.62, y = n.y - n.r * 0.6; g.moveTo(x + 1.6, y); g.ellipse(x, y, 1.6, 1, -0.4, 0, TAU); }
  g.fill();
  // Headlight on the nose, tail light at the back, so front and back read at any size.
  if (nodes.length > 1) {
    const hd = nodes[nodes.length - 1], tl = nodes[0];
    const dir = hd.x >= tl.x ? 1 : -1;
    const lamp = (n: SpineNode, side: number, col: string, rim: string) => {
      const x = n.x + side * n.r * 1.05, y = n.y + n.r * 0.02;
      g.fillStyle = rim;
      g.beginPath(); g.ellipse(x, y, 3, Math.max(2.6, n.r * 0.24), 0, 0, TAU); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.ellipse(x, y, 2, Math.max(1.8, n.r * 0.17), 0, 0, TAU); g.fill();
    };
    lamp(hd, dir, '#fff6c4', shade(c.base, -0.55));
    lamp(tl, -dir, '#ff5a4f', shade(c.base, -0.55));
  }
}

function decorateShip(g: CanvasRenderingContext2D, c: Palette, nodes: SpineNode[]) {
  const n = nodes.length;
  const dark = shade(c.base, -0.6);
  // Painted nose cap past the head node, with a dark seam.
  if (n > 1) {
    const z = nodes[n - 1], y0 = nodes[n - 2];
    const dx = z.x - y0.x, dy = z.y - y0.y, l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    const cx = z.x + ux * z.r * 0.62, cy = z.y + uy * z.r * 0.62;
    const nose = new Path2D();
    nose.moveTo(cx - uy * z.r * 2, cy + ux * z.r * 2);
    nose.quadraticCurveTo(cx + ux * z.r * 0.25, cy + uy * z.r * 0.25, cx + uy * z.r * 2, cy - ux * z.r * 2);
    nose.lineTo(cx + uy * z.r * 2 + ux * z.r * 3, cy - ux * z.r * 2 + uy * z.r * 3);
    nose.lineTo(cx - uy * z.r * 2 + ux * z.r * 3, cy + ux * z.r * 2 + uy * z.r * 3);
    nose.closePath();
    g.fillStyle = rgba(c.coat, 0.92);
    g.fill(nose);
    g.strokeStyle = rgba(dark, 0.55);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx - uy * z.r * 2, cy + ux * z.r * 2);
    g.quadraticCurveTo(cx + ux * z.r * 0.25, cy + uy * z.r * 0.25, cx + uy * z.r * 2, cy - ux * z.r * 2);
    g.stroke();
  }
  // Hull plate seams across the body between nodes.
  g.strokeStyle = rgba(dark, 0.45);
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < n; i++) {
    const a = nodes[i - 1], b = nodes[i];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, rr = Math.max(a.r, b.r) * 1.2;
    g.moveTo(mx, my - rr); g.quadraticCurveTo(mx + rr * 0.18, my, mx, my + rr);
  }
  g.stroke();
  // Glowing seam along the flank: a soft wide glow under a bright core line.
  const seam = new Path2D();
  const pt = (i: number) => {
    const a = nodes[i], b = nodes[Math.min(n - 1, i + 1)], z = nodes[Math.max(0, i - 1)];
    const dx = b.x - z.x, dy = b.y - z.y, l = Math.hypot(dx, dy) || 1;
    return { x: a.x - (dy / l) * a.r * 0.36, y: a.y + (dx / l) * a.r * 0.36 };
  };
  if (n === 1) {
    const a = nodes[0];
    seam.ellipse(a.x, a.y + a.r * 0.1, a.r * 1.05, a.r * 0.22, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  } else {
    const first = pt(0), last = pt(n - 1);
    seam.moveTo(first.x - nodes[0].r * 1.2, first.y);
    let prev = first;
    seam.lineTo(first.x, first.y);
    for (let i = 1; i < n; i++) {
      const q = pt(i);
      seam.quadraticCurveTo(prev.x, prev.y, (prev.x + q.x) / 2, (prev.y + q.y) / 2);
      prev = q;
    }
    seam.lineTo(last.x, last.y);
    seam.lineTo(last.x + nodes[n - 1].r * 0.95, last.y - nodes[n - 1].r * 0.1);
  }
  g.lineCap = 'round';
  g.strokeStyle = rgba(c.detail, 0.32);
  g.lineWidth = 4;
  g.stroke(seam);
  g.strokeStyle = shade(c.detail, 0.45);
  g.lineWidth = 1.3;
  g.stroke(seam);
  // A row of tiny lit portholes on the upper flank, evenly spaced between tail and head.
  const lights: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    for (let k = 0; k < 3; k++) {
      const f = (k + 0.5) / 3;
      lights.push([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - (a.r + (b.r - a.r) * f) * 0.18]);
    }
  }
  g.fillStyle = rgba(dark, 0.85);
  g.beginPath();
  for (const [x, y] of lights) { g.moveTo(x + 1.5, y); g.arc(x, y, 1.5, 0, TAU); }
  g.fill();
  g.fillStyle = shade(c.detail, 0.6);
  g.beginPath();
  for (const [x, y] of lights) { g.moveTo(x + 0.85, y); g.arc(x, y, 0.85, 0, TAU); }
  g.fill();
  // Dorsal sheen.
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath();
  for (const a of nodes) { g.moveTo(a.x + a.r * 0.9, a.y - a.r * 0.62); g.ellipse(a.x, a.y - a.r * 0.62, a.r * 0.9, a.r * 0.14, 0, 0, TAU); }
  g.fill();
}

function decorateBuilding(g: CanvasRenderingContext2D, c: Palette, nodes: SpineNode[]) {
  let gi = 0;
  for (let i = 1; i < nodes.length; i++) if (nodes[i].y + nodes[i].r > nodes[gi].y + nodes[gi].r) gi = i;
  for (let ni = 0; ni < nodes.length; ni++) {
    const n = nodes[ni];
    const hw = n.r * BLD_W;
    // Side face in shade gives each block some depth.
    g.fillStyle = rgba(shade(c.base, -0.55), 0.18);
    g.fillRect(n.x + hw * 0.78, n.y - n.r + 3, hw * 0.3, n.r * 2 - 3);
    // Masonry courses.
    g.strokeStyle = rgba(shade(c.base, -0.5), 0.12);
    g.lineWidth = 1;
    g.beginPath();
    for (let y = n.y - n.r + 9; y < n.y + n.r - 2; y += 6) { g.moveTo(n.x - hw, y); g.lineTo(n.x + hw, y); }
    g.stroke();
    // Windows: arched frames, warm lit panes or cool dark glass, a sill below.
    const cols = Math.max(1, Math.round((hw * 2) / 15));
    const ww = Math.min(7.5, (hw * 2) / cols - 5), wh = Math.max(6, n.r * 0.85);
    const wy = n.y - n.r * 0.42 + (ni === gi ? -n.r * 0.08 : 0);
    const frame = new Path2D(), glassLit = new Path2D(), glassDark = new Path2D();
    for (let k = 0; k < cols; k++) {
      const wx = n.x - hw + (k + 0.5) * ((hw * 2) / cols);
      const lit = (k * 7 + ni * 3 + Math.round(n.y)) % 5 > 1;
      roundRect4(frame, wx - ww / 2 - 1.3, wy - 1.3, ww + 2.6, wh + 2.6, ww / 2 + 1.3, ww / 2 + 1.3, 0.6, 0.6);
      roundRect4(lit ? glassLit : glassDark, wx - ww / 2, wy, ww, wh, ww / 2, ww / 2, 0, 0);
    }
    g.fillStyle = shade(c.base, -0.6);
    g.fill(frame);
    const gl = g.createLinearGradient(0, wy, 0, wy + wh);
    gl.addColorStop(0, '#fff6cf');
    gl.addColorStop(1, '#ffc65a');
    g.fillStyle = gl;
    g.fill(glassLit);
    const gd = g.createLinearGradient(0, wy, 0, wy + wh);
    gd.addColorStop(0, '#6f90b8');
    gd.addColorStop(1, '#1f2f4c');
    g.fillStyle = gd;
    g.fill(glassDark);
    // Sills and a glint.
    g.fillStyle = shade(c.base, 0.45);
    g.beginPath();
    for (let k = 0; k < cols; k++) {
      const wx = n.x - hw + (k + 0.5) * ((hw * 2) / cols);
      g.rect(wx - ww / 2 - 2.2, wy + wh + 1, ww + 4.4, 1.8);
    }
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < cols; k++) {
      const wx = n.x - hw + (k + 0.5) * ((hw * 2) / cols);
      g.moveTo(wx - ww * 0.25, wy + wh * 0.55); g.lineTo(wx + ww * 0.15, wy + wh * 0.25);
    }
    g.stroke();
    // Cornice trim.
    g.fillStyle = shade(c.base, 0.5);
    g.fillRect(n.x - hw - 3, n.y - n.r - 1, hw * 2 + 6, 2.2);
    g.fillStyle = rgba(shade(c.base, -0.5), 0.35);
    g.fillRect(n.x - hw - 3, n.y - n.r + 2.2, hw * 2 + 6, 1.4);
  }
  // Plinth: darker stone under the ground floor.
  const gn = nodes[gi];
  const pw = gn.r * BLD_W + 4;
  g.fillStyle = mixStone(c.base);
  g.fillRect(gn.x - pw - 2, gn.y + gn.r - 5, pw * 2 + 4, 6);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(gn.x - pw - 2, gn.y + gn.r - 5, pw * 2 + 4, 1.2);
}

function mixStone(base: string): string {
  return shade(base, -0.38);
}

/** Two-bone IK. Returns knee position. bend = +1/-1 chooses elbow side. */
function ik2(hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, bend: number) {
  let dx = fx - hx, dy = fy - hy;
  let dd = Math.hypot(dx, dy);
  const maxR = l1 + l2 - 0.01;
  if (dd > maxR) { dx *= maxR / dd; dy *= maxR / dd; dd = maxR; fx = hx + dx; fy = hy + dy; }
  const a = Math.acos(clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * Math.max(dd, 0.001)), -1, 1));
  const base = Math.atan2(dy, dx);
  const ang = base + a * bend;
  return { knee: { x: hx + Math.cos(ang) * l1, y: hy + Math.sin(ang) * l1 }, foot: { x: fx, y: fy } };
}

interface LimbJob { pi: PartInstance; p: PartDef; ax: number; ay: number; pose: LimbPose; far: boolean }

function computeLimbs(d: Design, nodes: SpineNode[], L: Layout, pose: Pose): LimbJob[] {
  const jobs: LimbJob[] = [];
  const walk = pose.walk ?? 0;
  const phase = pose.phase ?? pose.t * 1.6;
  const lift = pose.lift ?? 0;
  const legs = d.parts.filter((pi) => getPart(pi.partId)?.category === 'leg');
  const sortedLegs = [...legs].sort((a, b) => (d.spine[a.node]?.x ?? 0) + a.ox - ((d.spine[b.node]?.x ?? 0) + b.ox));
  const act = pose.action, at = pose.actionT ?? 0;
  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    const n = nodes[pi.node];
    if (!p || !n) continue;
    if (p.category !== 'leg' && p.category !== 'arm') continue;
    const ax = n.x + pi.ox, ay = n.y + pi.oy;
    const reach = (p.limbLength ?? 40) * pi.scale;
    const l1 = reach * 0.5, l2 = reach * 0.5;
    for (const far of p.paired ? [true, false] : [false]) {
      let fx: number, fy: number;
      let plant = 1;
      if (p.category === 'leg') {
        const idx = sortedLegs.indexOf(pi);
        const off = (idx % 2) * 0.5 + (far ? 0.5 : 0) + idx * 0.13;
        const ph = (((phase + off) % 1) + 1) % 1;
        const stride = reach * 0.55 * walk;
        const restX = ax + reach * 0.08;
        if (walk < 0.02) {
          fx = restX + (far ? -reach * 0.06 : reach * 0.04);
          fy = L.groundY - lift;
        } else if (ph < 0.62) {
          const k = ph / 0.62;
          fx = restX + stride * (0.5 - k);
          fy = L.groundY - lift;
        } else {
          const k = (ph - 0.62) / 0.38;
          fx = restX + stride * (-0.5 + k);
          fy = L.groundY - lift - Math.sin(k * Math.PI) * reach * 0.22 * Math.min(1, walk * 2);
          plant = 0;
        }
        if (lift > 0) { fy = Math.min(fy, ay + reach * 0.75); fx = ax - reach * 0.25; plant = 0; }
        if (act === 'dance') fy -= Math.max(0, Math.sin(at * TAU * 3 + (far ? Math.PI : 0))) * reach * 0.25;
        if (pose.down) { fx = ax + reach * 0.6 * pose.down; fy = ay + reach * 0.4; }
      } else {
        // Arms hang forward-down and swing with gait; raise for some actions.
        const sw = Math.sin((phase + (far ? 0.5 : 0)) * TAU) * 0.35 * walk;
        let ang = Math.PI * 0.42 + sw;
        let ext = 0.85;
        if (act === 'strike') { ang = -0.2 + (1 - at) * 1.4; ext = 0.98; }
        if (act === 'pose') { ang = -Math.PI * 0.35 + Math.sin(at * TAU * 2) * 0.2; ext = 0.95; }
        if (act === 'dance') { ang = -Math.PI * 0.2 + Math.sin(at * TAU * 3 + (far ? 1 : 0)) * 0.9; }
        if (act === 'sing') { ang = Math.PI * 0.1; }
        if (act === 'grab') { ang = Math.PI * 0.15; ext = 1; }
        fx = ax + Math.cos(ang) * reach * ext;
        fy = ay + Math.sin(ang) * reach * ext;
        plant = 0;
      }
      const bend = p.category === 'leg' ? (pi.ox + (d.spine[pi.node]?.x ?? 0) > L.cx ? -1 : 1) : 1;
      const sol = ik2(ax, ay, fx, fy, l1, l2, bend);
      const s = pi.scale;
      jobs.push({
        pi, p, ax, ay, far,
        pose: { knee: { x: (sol.knee.x - ax) / s, y: (sol.knee.y - ay) / s }, foot: { x: (sol.foot.x - ax) / s, y: (sol.foot.y - ay) / s }, plant },
      });
    }
  }
  return jobs;
}

function drawPartInstance(g: CanvasRenderingContext2D, d: Design, pi: PartInstance, p: PartDef, nodes: SpineNode[], pose: Pose, far: boolean, limb?: LimbPose, selected?: boolean) {
  const n = nodes[pi.node];
  if (!n) return;
  const ctx: PartDrawCtx = {
    travel: pose.phase ?? 0,
    colors: far ? farPalette(d.colors) : d.colors,
    t: pose.t,
    act: actIntensity(p, pose),
    action: pose.action,
    far,
    nodeR: n.r,
    limb,
  };
  const draw = (mirrorY: boolean) => {
    g.save();
    let ox = pi.ox, oy = pi.oy;
    if (far && p.paired && !limb) { ox -= 3; oy -= 2; }
    if (mirrorY) oy = -oy;
    g.translate(n.x + ox, n.y + oy);
    if (!limb) g.rotate(mirrorY ? -pi.rot : pi.rot);
    g.scale(pi.flip ? -pi.scale : pi.scale, mirrorY ? -pi.scale : pi.scale);
    p.draw(g, ctx);
    if (selected) {
      g.strokeStyle = '#3ee6c4';
      g.lineWidth = 2 / pi.scale;
      g.setLineDash([4 / pi.scale, 3 / pi.scale]);
      g.beginPath();
      g.arc(0, 0, p.radius * 0.9, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  };
  draw(false);
  if (pi.sym && d.kind === 'cell' && Math.abs(pi.oy) > 2) draw(true);
}

function actIntensity(p: PartDef, pose: Pose): number {
  const a = pose.action, t = pose.actionT ?? 0;
  if (!a) return 0;
  // Talking only moves the mouth (actionT runs freely: one syllable per unit).
  if (a === 'talk') return p.category === 'mouth' || p.category === 'cell-mouth' ? Math.abs(Math.sin(t * Math.PI)) * 0.8 : 0;
  const pulse = Math.sin(clamp(t, 0, 1) * Math.PI);
  switch (p.category) {
    case 'mouth': case 'cell-mouth': return a === 'bite' || a === 'eat' || a === 'sing' || a === 'roar' ? Math.abs(Math.sin(t * Math.PI * (a === 'sing' ? 4 : 2))) : 0;
    case 'wing': return a === 'glide' || a === 'jump' || a === 'dance' ? (Math.sin(pose.t * 18) + 1) / 2 : 0;
    case 'weapon': return a === 'charge' || a === 'strike' || a === 'spit' ? pulse : 0;
    case 'detail': return a === 'charm' ? pulse : 0;
    default: return pulse;
  }
}

/**
 * Draw a side-view design with its ground contact point at (x, y).
 * `size` scales design units to pixels (in the current transform).
 */
export function renderDesign(g: CanvasRenderingContext2D, d: Design, x: number, y: number, size: number, pose: Pose, opts: RenderOpts = {}) {
  if (d.kind === 'cell') { renderCell(g, d, x, y, 0, size, pose, opts); return; }
  const L = layoutDesign(d);
  const facing = (pose.facing ?? 1) >= 0 ? 1 : -1;
  const tr = g.getTransform();
  const pxHeight = L.height * size * Math.hypot(tr.a, tr.b);
  g.save();
  if (pose.alpha !== undefined) g.globalAlpha *= pose.alpha;
  if (opts.shadow !== false && d.kind !== 'ship') {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(x, y, (L.width * 0.45) * size, Math.max(2, L.width * 0.09 * size), 0, 0, TAU);
    g.fill();
  }
  g.translate(x, y - (pose.lift ?? 0) * size);
  if (pose.down) g.rotate(pose.down * 1.35 * facing);
  g.scale(size * facing, size);
  g.translate(-L.cx, -L.groundY);

  if (pxHeight < (opts.lodPx ?? 0)) {
    // Simplified blob for distant crowds.
    g.fillStyle = d.colors.base;
    g.strokeStyle = outlineOf(d.colors.base);
    g.lineWidth = 3 / size;
    g.beginPath();
    g.ellipse(L.cx, L.top + L.height * 0.45, L.width * 0.45, L.height * 0.4, 0, 0, TAU);
    g.fill();
    g.stroke();
    g.restore();
    return;
  }

  const nodes = animateSpine(d, pose);
  const limbs = computeLimbs(d, nodes, L, pose);
  const sel = opts.selectedUid ?? null;

  // 1. Far-side paired parts (legs/arms/wings/ears...) always sit behind the body.
  for (const j of limbs) if (j.far) drawPartInstance(g, d, j.pi, j.p, nodes, pose, true, j.pose);
  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    if (!p || p.category === 'leg' || p.category === 'arm') continue;
    if (p.paired) drawPartInstance(g, d, pi, p, nodes, pose, true);
  }
  // 2. Near-side parts in draw order; the body goes in after the 'back' layer.
  const nearLimb = new Map<string, LimbJob>();
  for (const j of limbs) if (!j.far) nearLimb.set(j.pi.uid, j);
  let bodyDrawn = false;
  for (const pi of drawOrder(d)) {
    const p = getPart(pi.partId);
    if (!p) continue;
    if (!bodyDrawn && partLayer(pi, p) !== 'back') { drawBody(g, d, nodes, L, false); bodyDrawn = true; }
    if (p.category === 'leg' || p.category === 'arm') {
      const j = nearLimb.get(pi.uid);
      if (j) drawPartInstance(g, d, pi, p, nodes, pose, false, j.pose, pi.uid === sel);
    } else {
      drawPartInstance(g, d, pi, p, nodes, pose, false, undefined, pi.uid === sel);
    }
  }
  if (!bodyDrawn) drawBody(g, d, nodes, L, false);
  if (pose.flash && pose.flashAmt) {
    g.globalAlpha *= clamp(pose.flashAmt, 0, 1) * 0.6;
    g.fillStyle = pose.flash;
    g.fill(bodyPath(nodes, d.kind, 2));
  }
  if (opts.showNodes) {
    g.globalAlpha = 1;
    nodes.forEach((n, i) => {
      g.strokeStyle = i === opts.hoverNode ? '#ffd166' : 'rgba(255,255,255,0.75)';
      g.lineWidth = (i === opts.hoverNode ? 3 : 1.5) / size;
      g.setLineDash([3 / size, 3 / size]);
      g.beginPath();
      g.arc(n.x, n.y, n.r, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = i === nodes.length - 1 ? '#ffd166' : '#ffffff';
      g.beginPath();
      g.arc(n.x, n.y, 4 / size, 0, TAU);
      g.fill();
    });
  }
  g.restore();
}

// ------------------------------------------------------------------ Cells (top-down)

/** Draw a cell centred at (x, y), heading `angle` radians (0 = +x). */
export function renderCell(g: CanvasRenderingContext2D, d: Design, x: number, y: number, angle: number, size: number, pose: Pose, opts: RenderOpts = {}) {
  const c = d.colors;
  g.save();
  if (pose.alpha !== undefined) g.globalAlpha *= pose.alpha;
  g.translate(x, y);
  g.rotate(angle);
  g.scale(size, size);
  const t = pose.t;
  // Membrane wobble.
  const nodes = d.spine.map((n, i) => ({ x: n.x, y: n.y + Math.sin(t * 3 + i * 0.9) * 0.8, r: n.r * (1 + Math.sin(t * 2.5 + i) * 0.03) }));
  const sel = opts.selectedUid ?? null;
  // Back parts (flagella, cilia...).
  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    if (p && partLayer(pi, p) === 'back') drawPartInstance(g, d, pi, p, nodes, pose, false, undefined, pi.uid === sel);
  }
  const ol = outlineOf(c.base);
  g.fillStyle = ol;
  g.fill(bodyPath(nodes, 'creature', 2.4));
  const path = bodyPath(nodes, 'creature');
  g.save();
  g.clip(path);
  const L = layoutDesign(d);
  const gr = g.createRadialGradient(L.cx - 4, -6, 2, L.cx, 0, Math.max(L.width, 20) * 0.7);
  gr.addColorStop(0, shade(c.base, 0.35));
  gr.addColorStop(0.7, c.base);
  gr.addColorStop(1, shade(c.base, -0.25));
  g.fillStyle = gr;
  g.fillRect(L.left - 20, L.top - 20, L.width + 40, L.height + 40);
  drawPattern(g, d, nodes, L);
  // Organelles.
  const rng = new RNG(hashString(d.name || 'cell'));
  g.fillStyle = rgba(c.detail, 0.55);
  for (let i = 0; i < 6; i++) {
    const n = nodes[rng.int(0, nodes.length - 1)];
    g.beginPath();
    g.arc(n.x + rng.range(-0.5, 0.5) * n.r + Math.sin(t + i) * 1.2, n.y + rng.range(-0.5, 0.5) * n.r, rng.range(1.2, 2.6), 0, TAU);
    g.fill();
  }
  // Nucleus.
  const mid = nodes[Math.floor(nodes.length / 2)] ?? { x: 0, y: 0, r: 10 };
  g.fillStyle = rgba(shade(c.coat, -0.1), 0.9);
  g.beginPath();
  g.arc(mid.x - 2, mid.y + 1, Math.min(9, mid.r * 0.45), 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.ellipse(L.cx - L.width * 0.1, -L.height * 0.22, L.width * 0.28, L.height * 0.12, 0, 0, TAU);
  g.fill();
  g.restore();
  for (const pi of drawOrder(d)) {
    const p = getPart(pi.partId);
    if (p && partLayer(pi, p) !== 'back') drawPartInstance(g, d, pi, p, nodes, pose, false, undefined, pi.uid === sel);
  }
  if (pose.flash && pose.flashAmt) {
    g.globalAlpha *= clamp(pose.flashAmt, 0, 1) * 0.6;
    g.fillStyle = pose.flash;
    g.fill(bodyPath(nodes, 'creature', 2));
  }
  if (opts.showNodes) {
    nodes.forEach((n, i) => {
      g.strokeStyle = i === opts.hoverNode ? '#ffd166' : 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.5 / size;
      g.setLineDash([3 / size, 3 / size]);
      g.beginPath();
      g.arc(n.x, n.y, n.r, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    });
  }
  g.restore();
}

// ------------------------------------------------------------------ Thumbnails

/** Render a design centred and fitted into a canvas (for palettes, codex, cards). */
export function drawThumb(canvas: HTMLCanvasElement, d: Design, opts: { bg?: string; t?: number; pad?: number } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(cw * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, cw, ch); }
  const L = layoutDesign(d);
  const pad = opts.pad ?? 6;
  const s = Math.min((cw - pad * 2) / Math.max(10, L.width), (ch - pad * 2) / Math.max(10, L.height));
  if (d.kind === 'cell') {
    renderCell(g, d, cw / 2 - (L.cx) * s, ch / 2, 0, s, { t: opts.t ?? 0 });
  } else {
    const groundScreen = ch / 2 + (L.groundY - (L.top + L.height / 2)) * s;
    renderDesign(g, d, cw / 2, groundScreen, s, { t: opts.t ?? 0 }, { shadow: false });
  }
}

/** Render a single part (palette tile). */
export function drawPartThumb(canvas: HTMLCanvasElement, p: PartDef, colors: Palette) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth || 72, ch = canvas.clientHeight || 60;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  const s = Math.min(cw, ch) / (p.radius * 2.4 + 4);
  g.translate(cw / 2, ch / 2);
  g.scale(s, s);
  const ctx: PartDrawCtx = { colors, t: 0, act: 0, nodeR: 14, thumb: true };
  if (p.category === 'leg' || p.category === 'arm') {
    const reach = p.limbLength ?? 40;
    g.translate(-reach * 0.1, -reach * 0.45);
    const sol = ik2(0, 0, reach * 0.18, p.category === 'leg' ? reach * 0.9 : reach * 0.75, reach * 0.5, reach * 0.5, p.category === 'leg' ? -1 : 1);
    ctx.limb = { knee: sol.knee, foot: sol.foot, plant: 1 };
  }
  p.draw(g, ctx);
}

/** Part anchor position in design space (rest pose). */
export function partAnchor(d: Design, pi: PartInstance): { x: number; y: number } {
  const n = d.spine[pi.node];
  return n ? { x: n.x + pi.ox, y: n.y + pi.oy } : { x: 0, y: 0 };
}
