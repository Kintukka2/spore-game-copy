// World-space rendering of the pool's inhabitants, with culling and sprite LOD for small cells.
import type { Camera } from '../../engine/camera';
import { renderCell, type Pose } from '../../design/render';
import { clamp, TAU } from '../../engine/math';
import { bodyR, bodyX, bodyY, type Cell, type Food, type Shard } from './entities';
import type { World } from './world';
import { cellSprite, drawCellSprite, FOOD_HALF, FOOD_R, foodArt, glowSprite, shadowSprite, silhouetteSprite } from './sprites';

/** LOD settings; the stage switches to cheaper values if the frame rate stays low. */
export const drawCfg = { fullPx: 30, fullMax: 14 };


const visible: Cell[] = [];
const fullSet = new Set<Cell>();

export function drawPuffs(g: CanvasRenderingContext2D, w: World, cam: Camera) {
  if (!w.puffs.length) return;
  const b = cam.bounds(60 / cam.zoom);
  const mine = glowSprite('#9dff5a'), theirs = glowSprite('#c6ff4a');
  for (const p of w.puffs) {
    if (p.dead || p.x < b.x0 - p.r || p.x > b.x1 + p.r || p.y < b.y0 - p.r || p.y > b.y1 + p.r) continue;
    const k = p.life / p.max;
    const r = p.r * (1.3 + (1 - k) * 0.7);
    g.globalAlpha = Math.min(1, k * 1.6) * 0.55;
    g.drawImage(p.owner === w.player ? mine : theirs, p.x - r, p.y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  // Tiny bubbles inside the clouds for texture.
  g.fillStyle = 'rgba(210,255,150,0.5)';
  for (let i = 0; i < w.puffs.length; i += 2) {
    const p = w.puffs[i];
    if (p.dead || p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
    const a = p.life * 2 + i;
    g.beginPath();
    g.arc(p.x + Math.cos(a) * p.r * 0.5, p.y + Math.sin(a) * p.r * 0.5, p.r * 0.12, 0, TAU);
    g.fill();
  }
}

export function drawFoods(g: CanvasRenderingContext2D, w: World, cam: Camera, t: number) {
  const art = foodArt();
  const b = cam.bounds(30 / cam.zoom);
  // Glow pass (additive): plants and eggs shimmer.
  g.globalCompositeOperation = 'lighter';
  const pg = glowSprite('#7dffa0'), eg = glowSprite('#ffe9a0');
  for (const f of w.foods) {
    if (f.dead || f.kind === 'meat' || f.x < b.x0 || f.x > b.x1 || f.y < b.y0 || f.y > b.y1) continue;
    const r = f.r * (f.cluster ? 2.4 : 2.6) * f.pop;
    g.globalAlpha = 0.22 + Math.sin(t * 2 + f.rot * 3) * 0.06;
    g.drawImage(f.kind === 'egg' ? eg : pg, f.x - r, f.y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  for (const f of w.foods) {
    if (f.dead || f.x < b.x0 - f.r || f.x > b.x1 + f.r || f.y < b.y0 - f.r || f.y > b.y1 + f.r) continue;
    drawFood(g, f, art);
  }
}

function drawFood(g: CanvasRenderingContext2D, f: Food, art: ReturnType<typeof foodArt>) {
  const img = f.cluster ? art.frond : f.kind === 'plant' ? art.plant[f.variant] ?? art.plant[0] : f.kind === 'meat' ? art.meat[f.variant] ?? art.meat[0] : art.egg[0];
  const pop = f.pop < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - f.pop, 3)) * (1 + Math.sin(f.pop * Math.PI) * 0.2) : 1;
  const k = (f.r / FOOD_R) * pop;
  const fade = clamp((f.life - f.age) / (f.kind === 'meat' ? 4 : 1.5), 0, 1);
  g.save();
  g.translate(f.x, f.y);
  g.rotate(f.rot);
  if (fade < 1) g.globalAlpha = fade;
  g.drawImage(img, -FOOD_HALF * k, -FOOD_HALF * k, FOOD_HALF * 2 * k, FOOD_HALF * 2 * k);
  g.restore();
}

export function drawShards(g: CanvasRenderingContext2D, w: World, cam: Camera) {
  const art = foodArt();
  const b = cam.bounds(80 / cam.zoom);
  for (const s of w.shards) {
    if (s.dead || s.x < b.x0 || s.x > b.x1 || s.y < b.y0 || s.y > b.y1) continue;
    drawShard(g, s, art.shard);
  }
}

function drawShard(g: CanvasRenderingContext2D, s: Shard, img: HTMLCanvasElement) {
  const pulse = 1 + Math.sin(s.t * 4) * 0.12;
  const gr = s.r * 4.2 * pulse;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.75;
  g.drawImage(glowSprite('#ffd166'), s.x - gr, s.y - gr, gr * 2, gr * 2);
  g.globalAlpha = 0.5;
  const g2 = s.r * 2.2;
  g.drawImage(glowSprite('#9ff6ff'), s.x - g2, s.y - g2, g2 * 2, g2 * 2);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  // Light rays
  g.save();
  g.translate(s.x, s.y);
  g.rotate(s.t * 0.6);
  g.fillStyle = 'rgba(255,240,190,0.18)';
  for (let i = 0; i < 6; i++) {
    g.rotate(TAU / 6);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s.r * 3.4, -s.r * 0.35); g.lineTo(s.r * 3.4, s.r * 0.35); g.fill();
  }
  g.restore();
  const k = (s.r / FOOD_R) * 1.25 * pulse;
  g.save();
  g.translate(s.x, s.y + Math.sin(s.t * 2) * s.r * 0.15);
  g.rotate(Math.sin(s.t * 1.3) * 0.3);
  g.drawImage(img, -FOOD_HALF * k, -FOOD_HALF * k, FOOD_HALF * 2 * k, FOOD_HALF * 2 * k);
  g.restore();
}

function poseFor(c: Cell) {
  return {
    t: c.t,
    action: c.biteAnim > 0 ? 'bite' : undefined,
    actionT: 1 - c.biteAnim,
    flash: c.flash > 0 ? c.flashColor : undefined,
    flashAmt: c.flash,
  };
}

/** NPC cells, smallest first, with LOD and status indicators. */
export function drawNpcs(g: CanvasRenderingContext2D, w: World, cam: Camera) {
  const b = cam.bounds(0);
  visible.length = 0;
  for (const c of w.npcs) {
    if (c.dead) continue;
    const r = (c.ab.length * 0.75 + 20) * c.size;
    if (c.x < b.x0 - r || c.x > b.x1 + r || c.y < b.y0 - r || c.y > b.y1 + r) continue;
    visible.push(c);
  }
  visible.sort((a, b2) => a.size - b2.size);
  fullSet.clear();
  let budget = drawCfg.fullMax;
  for (let i = visible.length - 1; i >= 0 && budget > 0; i--) {
    const c = visible[i];
    if (c.ab.length * c.size * cam.zoom >= drawCfg.fullPx) { fullSet.add(c); budget--; }
  }
  // Soft drop shadows (light comes from the surface, top-left) for the cells drawn in detail.
  for (const c of visible) {
    if (!fullSet.has(c) || c.emerge < 0.4) continue;
    const off = Math.max(3 / cam.zoom, bodyR(c) * 0.2);
    drawCellSprite(g, shadowSprite(c.design), c.x + off * 0.6, c.y + off, c.angle, c.size * 1.04, 0.2 * c.emerge);
  }
  for (const c of visible) {
    const em = c.emerge;
    const size = c.size * (0.86 + 0.14 * em);
    if (em < 1) {
      // Rising out of the blurred depths.
      const sil = silhouetteSprite(c.design, '#06202b');
      drawCellSprite(g, sil, c.x, c.y, c.angle, size * 1.05, (1 - em) * 0.7);
      if (em < 0.05) continue;
    }
    if (fullSet.has(c)) {
      const pose = poseFor(c) as Pose;
      if (em < 1) pose.alpha = em * em;
      renderCell(g, c.design, c.x, c.y, c.angle, size, pose);
    } else {
      drawCellSprite(g, cellSprite(c.design), c.x, c.y, c.angle, size, em * em);
      if (c.flash > 0.05) {
        g.globalAlpha = c.flash * 0.5;
        g.fillStyle = c.flashColor;
        g.beginPath(); g.arc(bodyX(c), bodyY(c), bodyR(c), 0, TAU); g.fill();
        g.globalAlpha = 1;
      }
    }
  }
  // Indicators on top
  const px = 1 / cam.zoom;
  for (const c of visible) {
    if (c.emerge < 0.9) continue;
    const r = bodyR(c);
    const cx = bodyX(c), cy = bodyY(c);
    if (c.showHpT > 0 && c.hp < c.maxHp) {
      const wbar = Math.max(26 * px, r * 1.6), hbar = 5 * px;
      const y = cy - r - 12 * px;
      g.globalAlpha = Math.min(1, c.showHpT * 2);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(cx - wbar / 2 - px, y - px, wbar + 2 * px, hbar + 2 * px);
      g.fillStyle = c.hp / c.maxHp > 0.4 ? '#7dff9a' : '#ff6b6b';
      g.fillRect(cx - wbar / 2, y, wbar * clamp(c.hp / c.maxHp, 0, 1), hbar);
      g.globalAlpha = 1;
    }
    if (c.carries) drawStar(g, cx + r * 0.7, cy - r * 0.9, 7 * px, w.t);
    if (c.state === 'hunt' && c.target === w.player) drawGrowl(g, cx, cy - r - 8 * px, 9 * px, w.t);
  }
}

function drawStar(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const k = 1 + Math.sin(t * 5) * 0.12;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.6;
  g.drawImage(glowSprite('#ffd166'), x - s * 3, y - s * 3, s * 6, s * 6);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = (i % 2 ? s * 0.45 : s) * k;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = '#ffd166';
  g.strokeStyle = '#7a4d00';
  g.lineWidth = s * 0.22;
  g.fill();
  g.stroke();
}

/** Orange "growl" sparks over a cell that is hunting the player. */
function drawGrowl(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  g.strokeStyle = '#ff9b3d';
  g.lineWidth = s * 0.28;
  g.lineCap = 'round';
  const j = Math.sin(t * 20) * s * 0.15;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(x + side * s * 0.4, y - s * 1.2 + j);
    g.lineTo(x + side * s * 0.9, y - s * 0.6);
    g.lineTo(x + side * s * 0.5, y - s * 0.4);
    g.lineTo(x + side * s * 1.0, y + s * 0.2 - j);
    g.stroke();
  }
}

/** The player (and the mate) with a soft glow so they stand out. */
export function drawPlayerCell(g: CanvasRenderingContext2D, c: Cell, alpha: number, glow: string, sizeMul = 1) {
  const r = bodyR(c) * sizeMul;
  const off = r * 0.22;
  drawCellSprite(g, shadowSprite(c.design), c.x + off * 0.6, c.y + off, c.angle, c.size * sizeMul * 1.04, 0.24 * alpha);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.28 * alpha;
  g.drawImage(glowSprite(glow), bodyX(c) - r * 2.4, bodyY(c) - r * 2.4, r * 4.8, r * 4.8);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  const pose = poseFor(c) as Pose;
  pose.alpha = alpha;
  renderCell(g, c.design, c.x, c.y, c.angle, c.size * sizeMul, pose);
}

/** Screen-edge arrow toward an off-screen point of interest. */
export function drawEdgeArrow(g: CanvasRenderingContext2D, cam: Camera, wx: number, wy: number, color: string, icon: string, t: number, top: number) {
  const s = cam.worldToScreen(wx, wy);
  const m = 34;
  if (s.x > m && s.x < cam.w - m && s.y > top + m && s.y < cam.h - m) return;
  const cx = cam.w / 2, cy = (cam.h + top) / 2;
  const dx = s.x - cx, dy = s.y - cy;
  const kx = (cam.w / 2 - m) / Math.max(1e-3, Math.abs(dx)), ky = ((cam.h - top) / 2 - m) / Math.max(1e-3, Math.abs(dy));
  const k = Math.min(kx, ky);
  const x = cx + dx * k, y = cy + dy * k;
  const a = Math.atan2(dy, dx);
  const bob = Math.sin(t * 5) * 3;
  g.save();
  g.translate(x + Math.cos(a) * bob, y + Math.sin(a) * bob);
  g.globalAlpha = 0.9;
  g.fillStyle = 'rgba(0,10,20,0.55)';
  g.beginPath(); g.arc(0, 0, 17, 0, TAU); g.fill();
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.stroke();
  g.rotate(a);
  g.fillStyle = color;
  g.beginPath(); g.moveTo(25, 0); g.lineTo(17, -6); g.lineTo(17, 6); g.closePath(); g.fill();
  g.rotate(-a);
  g.font = '16px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, 0, 1);
  g.restore();
}
