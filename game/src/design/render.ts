// Renders any Design (creature, vehicle, building, ship) in side view, and cells top-down.
// Includes procedural animation: spine waves, IK legs with a gait cycle, arm swings, action poses.
import { getPart } from './registry';
import { hashString, RNG } from '../engine/rng';
import { clamp, TAU } from '../engine/math';
import { outlineOf, rgba, shade } from './color';
import type { Design, LimbPose, Palette, PartDef, PartDrawCtx, PartInstance, SpineNode } from './types';

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
    } else if (d.kind === 'ship') {
      y += Math.sin(t * 1.5) * 1.2;
    }
    out[i] = { x, y, r };
  }
  return out;
}

function bodyPath(nodes: SpineNode[], kind: Design['kind'], pad = 0): Path2D {
  const p = new Path2D();
  if (kind === 'vehicle' || kind === 'building') {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const w = kind === 'building' ? a.r * 2.6 : a.r * 2.3;
      const hh = a.r + pad;
      roundRectPath(p, a.x - w / 2 - pad, a.y - hh, w + pad * 2, hh * 2, Math.min(a.r * (kind === 'building' ? 0.15 : 0.45), hh));
      if (i > 0) {
        const b = nodes[i - 1];
        const r = Math.min(a.r, b.r) * 0.85 + pad;
        p.moveTo(a.x, a.y - r);
        p.lineTo(b.x, b.y - r);
        p.lineTo(b.x, b.y + r);
        p.lineTo(a.x, a.y + r);
        p.closePath();
      }
    }
    return p;
  }
  const sx = kind === 'ship' ? 1.45 : 1;
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

function roundRectPath(p: Path2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h - r);
  p.arcTo(x + w, y + h, x + w - r, y + h, r);
  p.lineTo(x + r, y + h);
  p.arcTo(x, y + h, x, y + h - r, r);
  p.lineTo(x, y + r);
  p.arcTo(x, y, x + r, y, r);
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
  // Base with vertical light falloff.
  const top = L.top, bot = Math.max(...nodes.map((n) => n.y + n.r));
  const grad = g.createLinearGradient(0, top, 0, bot);
  if (d.kind === 'vehicle' || d.kind === 'ship') {
    grad.addColorStop(0, shade(c.base, 0.45));
    grad.addColorStop(0.35, c.base);
    grad.addColorStop(0.55, shade(c.base, -0.12));
    grad.addColorStop(1, shade(c.base, -0.35));
  } else {
    grad.addColorStop(0, shade(c.base, 0.18));
    grad.addColorStop(0.6, c.base);
    grad.addColorStop(1, shade(c.base, -0.28));
  }
  g.fillStyle = grad;
  g.fillRect(L.left - 50, top - 50, L.width + 100, bot - top + 100);
  drawPattern(g, d, nodes, L);
  if (d.kind === 'building') {
    // Windows grid.
    g.fillStyle = rgba('#fff3c4', 0.85);
    for (const n of nodes) {
      const w = n.r * 2.6;
      const cols = Math.max(1, Math.floor(w / 16));
      for (let k = 0; k < cols; k++) {
        const wx = n.x - w / 2 + (k + 0.5) * (w / cols);
        g.fillStyle = (k + Math.round(n.y)) % 3 === 0 ? rgba('#1d2b44', 0.8) : rgba('#ffe7a3', 0.9);
        g.fillRect(wx - 3.5, n.y - n.r * 0.45, 7, n.r * 0.6);
      }
    }
  }
  if (d.kind === 'vehicle' || d.kind === 'ship') {
    g.strokeStyle = rgba(shade(c.base, -0.5), 0.5);
    g.lineWidth = 1;
    for (const n of nodes) {
      g.beginPath();
      g.moveTo(n.x - n.r * 1.1, n.y + n.r * 0.15);
      g.lineTo(n.x + n.r * 1.1, n.y + n.r * 0.15);
      g.stroke();
    }
  }
  // Rim light / gloss.
  g.fillStyle = 'rgba(255,255,255,0.16)';
  for (const n of nodes) {
    g.beginPath();
    g.ellipse(n.x - n.r * 0.15, n.y - n.r * 0.55, n.r * 0.55 * (d.kind === 'ship' ? 1.4 : 1), n.r * 0.2, -0.1, 0, TAU);
    g.fill();
  }
  g.restore();
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

  // 1. Far-side paired parts (legs/arms/wings/ears...).
  for (const j of limbs) if (j.far) drawPartInstance(g, d, j.pi, j.p, nodes, pose, true, j.pose);
  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    if (!p || p.category === 'leg' || p.category === 'arm') continue;
    if (p.paired) drawPartInstance(g, d, pi, p, nodes, pose, true);
  }
  // 2. Back-layer parts.
  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    if (!p || p.layer !== 'back' || p.category === 'leg' || p.category === 'arm') continue;
    drawPartInstance(g, d, pi, p, nodes, pose, false, undefined, pi.uid === sel);
  }
  // 3. Body.
  drawBody(g, d, nodes, L, false);
  // 4. Front parts (non-limb), then near limbs, then top layer.
  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    if (!p || p.layer !== 'front' || p.category === 'leg' || p.category === 'arm') continue;
    drawPartInstance(g, d, pi, p, nodes, pose, false, undefined, pi.uid === sel);
  }
  for (const j of limbs) if (!j.far) drawPartInstance(g, d, j.pi, j.p, nodes, pose, false, j.pose, j.pi.uid === sel);
  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    if (!p || p.layer !== 'top' || p.category === 'leg' || p.category === 'arm') continue;
    drawPartInstance(g, d, pi, p, nodes, pose, false, undefined, pi.uid === sel);
  }
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
    if (p && p.layer === 'back') drawPartInstance(g, d, pi, p, nodes, pose, false, undefined, pi.uid === sel);
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
  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    if (p && p.layer !== 'back') drawPartInstance(g, d, pi, p, nodes, pose, false, undefined, pi.uid === sel);
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
    const groundScreen = ch / 2 + (L.height / 2) * s;
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
