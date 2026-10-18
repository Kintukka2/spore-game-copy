// Draws the island: ground, water, decals (nests, bones, craters), y-sorted props and creatures,
// clouds and day lighting, then screen-space overlays (bubbles, health bars, indicators).
import { renderDesign, type Pose } from '../../design/render';
import { clamp, easeOutBack, TAU } from '../../engine/math';
import { RNG } from '../../engine/rng';
import type { CreatureStage } from './stage';
import type { BonePile, Corpse, Critter, Nest, Projectile, Tree, Bush, Rock } from './types';
import { OCEAN } from './terrain';
import { blit, bushSprites, drawBubble, drawEmoji, drawShadow, FRUIT_SPOTS, rockSprites, roundRect, treeSprites } from './sprites';
import { critterHeight } from './species';
import { REL_INFO } from './config';

interface Item { y: number; k: number; o: unknown }
const pool: Item[] = [];
const list: Item[] = [];
const byY = (a: Item, b: Item) => a.y - b.y;
let used = 0;
function push(y: number, k: number, o: unknown) {
  let it = pool[used];
  if (!it) { it = { y: 0, k: 0, o: null }; pool[used] = it; }
  it.y = y; it.k = k; it.o = o;
  used++;
  list.push(it);
}

const K_TREE = 0, K_BUSH = 1, K_ROCK = 2, K_CRITTER = 3, K_CORPSE = 4, K_PROJ = 5;

export function renderWorld(S: CreatureStage, g: CanvasRenderingContext2D, w: number, h: number) {
  const cam = S.cam;
  // Chunks cover the whole view (the camera is clamped to the world); only shake can reveal an edge.
  if (S.fx.shakeAmp > 0.05) { g.fillStyle = OCEAN; g.fillRect(0, 0, w, h); }
  g.save();
  g.translate(S.fx.shakeX, S.fx.shakeY);
  cam.apply(g);
  S.terrain.drawGround(g, cam);
  S.terrain.drawWater(g, cam, S.t);
  const wind = 0.65 + 0.35 * Math.sin(S.t * 0.21) + 0.15 * Math.sin(S.t * 0.67);
  drawDecals(S, g);
  if (S.quality > 0) S.terrain.drawFlora(g, cam, S.t, wind, S.quality > 1);
  drawSorted(S, g, wind);
  S.fx.drawWorld(g, cam);
  S.events.drawSky(g);
  if (S.quality > 1) drawClouds(S, g);
  g.restore();
  drawLighting(S, g, w, h);
  drawOverlays(S, g, w, h);
}

// ------------------------------------------------------------------ ground decals
const nestTwigs = new Map<number, Path2D>();
function twigPath(n: Nest, R: number): Path2D {
  let p = nestTwigs.get(n.id);
  if (p) return p;
  p = new Path2D();
  const r = new RNG(n.id * 977 + 13);
  for (let i = 0; i < 26; i++) {
    const a = r.range(0, TAU), rr = R * r.range(0.8, 1.15);
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.55;
    const b = a + Math.PI / 2 + r.range(-0.5, 0.5), l = r.range(8, 16);
    p.moveTo(x - Math.cos(b) * l, y - Math.sin(b) * l * 0.5);
    p.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l * 0.5);
  }
  nestTwigs.set(n.id, p);
  return p;
}

function drawNest(S: CreatureStage, g: CanvasRenderingContext2D, n: Nest) {
  const sp = n.species;
  const ext = sp?.relation === 'extinct';
  const R = n.home ? 46 : 40;
  g.fillStyle = 'rgba(110,80,45,0.25)';
  g.beginPath(); g.ellipse(n.x, n.y, R * 1.9, R * 1.05, 0, 0, TAU); g.fill();
  const heals = n.home ? n === S.homeNest : sp && (sp.relation === 'friendly' || sp.relation === 'allied' || ext);
  if (heals) {
    const pulse = 0.5 + 0.5 * Math.sin(S.t * 2.2 + n.id);
    g.strokeStyle = n.home ? `rgba(255,255,255,${(0.25 + pulse * 0.25).toFixed(3)})` : `rgba(120,255,170,${(0.2 + pulse * 0.2).toFixed(3)})`;
    g.lineWidth = 3;
    g.setLineDash([10, 8]);
    g.beginPath(); g.ellipse(n.x, n.y, 118, 66, 0, 0, TAU); g.stroke();
    g.setLineDash([]);
  }
  g.fillStyle = ext ? 'rgba(60,55,50,0.6)' : 'rgba(70,45,22,0.55)';
  g.beginPath(); g.ellipse(n.x, n.y, R * 0.78, R * 0.42, 0, 0, TAU); g.fill();
  g.lineWidth = 10;
  g.strokeStyle = ext ? '#5f5a52' : '#6e4a26';
  g.beginPath(); g.ellipse(n.x, n.y, R, R * 0.55, 0, 0, TAU); g.stroke();
  g.save();
  g.translate(n.x, n.y);
  g.lineCap = 'round';
  g.lineWidth = 3;
  g.strokeStyle = ext ? '#8a8478' : '#b08a52';
  g.stroke(twigPath(n, R));
  g.restore();
  if (sp && n.eggs > 0) {
    const c = sp.design.colors;
    for (let i = 0; i < n.eggs; i++) {
      const ex = n.x - 12 + i * 12, ey = n.y - 2 + (i % 2) * 6;
      g.fillStyle = '#3a2a18';
      g.beginPath(); g.ellipse(ex, ey + 1, 7.4, 9.4, 0, 0, TAU); g.fill();
      g.fillStyle = c.detail;
      g.beginPath(); g.ellipse(ex, ey, 6, 8, 0, 0, TAU); g.fill();
      g.fillStyle = c.base;
      g.beginPath(); g.arc(ex - 2, ey - 2, 1.8, 0, TAU); g.arc(ex + 2, ey + 2, 1.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath(); g.ellipse(ex - 2, ey - 4, 1.6, 2.4, -0.4, 0, TAU); g.fill();
    }
  }
}

function drawBonePile(S: CreatureStage, g: CanvasRenderingContext2D, b: BonePile) {
  if (b.dug) {
    g.fillStyle = 'rgba(120,85,50,0.5)';
    g.beginPath(); g.ellipse(b.x, b.y, 26, 12, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(55,35,20,0.6)';
    g.beginPath(); g.ellipse(b.x, b.y, 16, 7, 0, 0, TAU); g.fill();
    return;
  }
  const t = S.t;
  if (b.kind === 'sky') {
    drawShadow(g, b.x, b.y, 50, 16);
    const glow = 0.6 + 0.4 * Math.sin(t * 3 + b.id);
    g.fillStyle = `rgba(120,230,255,${(0.25 * glow).toFixed(3)})`;
    g.beginPath(); g.ellipse(b.x, b.y - 8, 34, 22, 0, 0, TAU); g.fill();
    const p = new Path2D();
    p.moveTo(b.x - 16, b.y); p.lineTo(b.x - 10, b.y - 20); p.lineTo(b.x - 2, b.y - 30); p.lineTo(b.x + 9, b.y - 22); p.lineTo(b.x + 15, b.y - 4); p.lineTo(b.x + 6, b.y + 3); p.closePath();
    g.strokeStyle = '#1a3a52'; g.lineWidth = 2.6; g.stroke(p);
    const gr = g.createLinearGradient(b.x, b.y - 30, b.x, b.y);
    gr.addColorStop(0, '#d8fbff'); gr.addColorStop(0.5, '#6fd6f2'); gr.addColorStop(1, '#2d7fa8');
    g.fillStyle = gr; g.fill(p);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(b.x - 9, b.y - 18); g.lineTo(b.x - 2, b.y - 27); g.stroke();
    return;
  }
  const k = [0, 0.8, 1.1, 1.55][b.size] ?? 1;
  g.fillStyle = 'rgba(140,105,65,0.55)';
  g.beginPath(); g.ellipse(b.x, b.y, 30 * k, 12 * k, 0, 0, TAU); g.fill();
  const ribs = 3 + b.size;
  const ribPath = new Path2D();
  for (let i = 0; i < ribs; i++) {
    const rx = b.x - 14 * k + i * 7 * k, rr = (9 - Math.abs(i - ribs / 2) * 1.2) * k;
    ribPath.moveTo(rx - rr, b.y - 1);
    ribPath.arc(rx, b.y - 1, rr, Math.PI, TAU);
  }
  ribPath.moveTo(b.x - 20 * k, b.y);
  ribPath.lineTo(b.x + 14 * k, b.y - 1);
  g.lineCap = 'round';
  g.strokeStyle = '#4e3d28'; g.lineWidth = 5.6 * Math.min(1.2, k); g.stroke(ribPath);
  g.strokeStyle = '#f3e9cf'; g.lineWidth = 3.2 * Math.min(1.2, k); g.stroke(ribPath);
  // Skull.
  const sx = b.x + 20 * k, sy = b.y - 5 * k;
  g.fillStyle = '#4e3d28';
  g.beginPath(); g.ellipse(sx, sy, 9.5 * k, 7.5 * k, -0.2, 0, TAU); g.fill();
  g.fillStyle = '#f3e9cf';
  g.beginPath(); g.ellipse(sx, sy, 8 * k, 6 * k, -0.2, 0, TAU); g.fill();
  g.fillStyle = '#3a2c1c';
  g.beginPath(); g.arc(sx + 2 * k, sy - 1 * k, 2 * k, 0, TAU); g.fill();
  if (b.size >= 3) {
    g.strokeStyle = '#f3e9cf'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(sx + 6 * k, sy + 3 * k); g.lineTo(sx + 14 * k, sy + 4 * k); g.stroke();
  }
  // Glint to attract the eye.
  const gl = Math.sin(t * 2.4 + b.id * 1.7);
  if (gl > 0.85) {
    const a = (gl - 0.85) / 0.15;
    g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    const gx = b.x - 6 * k, gy = b.y - 10 * k;
    g.beginPath(); g.moveTo(gx, gy - 7); g.lineTo(gx + 1.6, gy - 1.6); g.lineTo(gx + 7, gy); g.lineTo(gx + 1.6, gy + 1.6); g.lineTo(gx, gy + 7); g.lineTo(gx - 1.6, gy + 1.6); g.lineTo(gx - 7, gy); g.lineTo(gx - 1.6, gy - 1.6); g.fill();
  }
}

function drawDecals(S: CreatureStage, g: CanvasRenderingContext2D) {
  const cam = S.cam;
  S.events.drawGround(g);
  for (const n of S.nests) if (n.active && cam.isVisible(n.x, n.y, 140)) drawNest(S, g, n);
  for (const b of S.bones) if (cam.isVisible(b.x, b.y, 60)) drawBonePile(S, g, b);
  // Migration trail.
  const mt = S.migrating ? S.migTarget() : null;
  if (mt) {
    const from = S.homeNest;
    const dx = mt.x - from.x, dy = mt.y - from.y, d = Math.hypot(dx, dy);
    const nx = -dy / d, ny = dx / d;
    for (let s = 60; s < d - 40; s += 34) {
      const x = from.x + (dx / d) * s, y = from.y + (dy / d) * s;
      if (!cam.isVisible(x, y, 20)) continue;
      const side = (Math.floor(s / 34) % 2 ? 1 : -1) * 6;
      const a = 0.35 + 0.25 * Math.sin(S.t * 4 - s * 0.05);
      g.fillStyle = `rgba(90,60,30,${a.toFixed(3)})`;
      g.beginPath(); g.ellipse(x + nx * side, y + ny * side, 4, 2.6, Math.atan2(dy, dx), 0, TAU); g.fill();
    }
    const pulse = (S.t * 0.8) % 1;
    g.strokeStyle = `rgba(255,236,140,${(1 - pulse).toFixed(3)})`;
    g.lineWidth = 3;
    g.beginPath(); g.ellipse(mt.x, mt.y, 40 + pulse * 70, (40 + pulse * 70) * 0.55, 0, 0, TAU); g.stroke();
  }
  // A soft ring marks the player among look-alike kin.
  const pl = S.player;
  if (!pl.gone && !S.playerSwallowed && S.deathT < 0.5) {
    const rr = pl.r + 10;
    g.fillStyle = 'rgba(125,255,216,0.16)';
    g.beginPath(); g.ellipse(pl.x, pl.y + 2, rr, rr * 0.42, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(125,255,216,0.75)';
    g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(pl.x, pl.y + 2, rr, rr * 0.42, 0, 0, TAU); g.stroke();
  }
  // Target ring.
  const tg = S.target;
  if (tg && !tg.gone) {
    const col = tg.role === 'titan' ? '#b06bff' : tg.befriended ? '#ff9ec7' : REL_INFO[tg.sp.relation].color;
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.setLineDash([9, 6]);
    g.lineDashOffset = -S.t * 20;
    g.beginPath(); g.ellipse(tg.x, tg.y + 2, tg.r + 12, (tg.r + 12) * 0.45, 0, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.lineDashOffset = 0;
  }
  // Tap-to-move marker.
  const m = S.moveMarker;
  if (m && m.t > 0) {
    const k = m.t;
    g.strokeStyle = `rgba(255,255,255,${(k * 0.9).toFixed(3)})`;
    g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(m.x, m.y, 18 - k * 8, (18 - k * 8) * 0.5, 0, 0, TAU); g.stroke();
  }
}

// ------------------------------------------------------------------ sorted pass
function drawSorted(S: CreatureStage, g: CanvasRenderingContext2D, wind: number) {
  const cam = S.cam;
  used = 0;
  list.length = 0;
  const b = cam.bounds(130);
  const w = S.world;
  for (const t of w.trees) if (t.x > b.x0 && t.x < b.x1 && t.y > b.y0 && t.y < b.y1 + 120) push(t.y, K_TREE, t);
  for (const t of w.bushes) if (t.x > b.x0 && t.x < b.x1 && t.y > b.y0 && t.y < b.y1 + 40) push(t.y, K_BUSH, t);
  for (const t of w.rocks) if (t.x > b.x0 && t.x < b.x1 && t.y > b.y0 && t.y < b.y1 + 40) push(t.y, K_ROCK, t);
  for (const c of S.critters) {
    if (c.gone) continue;
    const hh = critterHeight(c) + c.z;
    if (c.x + c.r * 2 < b.x0 || c.x - c.r * 2 > b.x1 || c.y < b.y0 || c.y - hh > b.y1) continue;
    push(c.y, K_CRITTER, c);
  }
  for (const c of S.corpses) if (cam.isVisible(c.x, c.y, 120)) push(c.y - 1, K_CORPSE, c);
  for (const p of S.projectiles) push(p.y, K_PROJ, p);
  list.sort(byY);
  const p = S.player;
  const tg = S.social.target ?? (S.target && !S.target.gone ? S.target : null);
  const trees = treeSprites(), bushes = bushSprites(), rocks = rockSprites();
  /** Is critter c standing behind tree t's canopy? */
  const hidden = (c: Critter | null, t: Tree, spr: { crownTop: number; crownBottom: number; crownR: number }) =>
    !!c && c.y < t.y && c.y > t.y + spr.crownTop * t.s - 10 && Math.abs(c.x - t.x) < spr.crownR * t.s + c.r && c.y - critterHeight(c) - c.z < t.y + spr.crownBottom * t.s;
  for (const it of list) {
    switch (it.k) {
      case K_TREE: {
        const t = it.o as Tree;
        const spr = trees[t.kind];
        drawShadow(g, t.x + 12 * t.s, t.y + 2, (spr.crownR * 2.1) * t.s, 26 * t.s);
        blit(g, spr.trunk, t.x, t.y, t.s);
        // Fade canopies that hide the player or their target.
        if (hidden(p, t, spr) || hidden(tg, t, spr)) g.globalAlpha = 0.42;
        const sway = Math.sin(S.t * 1.3 + t.ph) * 2.4 * t.s * wind;
        blit(g, spr.crown, t.x, t.y, t.s, sway);
        g.globalAlpha = 1;
        break;
      }
      case K_BUSH: {
        const t = it.o as Bush;
        drawShadow(g, t.x + 4, t.y + 1, 52 * t.s, 14 * t.s);
        const spr = bushes[t.kind];
        const sway = Math.sin(S.t * 1.7 + t.id) * 0.8 * wind;
        blit(g, spr, t.x, t.y, t.s, sway);
        if (t.fruit > 0) {
          for (let i = 0; i < t.fruit && i < FRUIT_SPOTS.length; i++) {
            const fx = t.x + (FRUIT_SPOTS[i][0] + sway) * t.s, fy = t.y + FRUIT_SPOTS[i][1] * t.s;
            g.fillStyle = '#3b1020';
            g.beginPath(); g.arc(fx, fy, 4.4 * t.s, 0, TAU); g.fill();
            g.fillStyle = t.berry;
            g.beginPath(); g.arc(fx, fy, 3.4 * t.s, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.75)';
            g.beginPath(); g.arc(fx - 1.1 * t.s, fy - 1.2 * t.s, 1.1 * t.s, 0, TAU); g.fill();
          }
        }
        break;
      }
      case K_ROCK: {
        const t = it.o as Rock;
        drawShadow(g, t.x + 5 * t.s, t.y + 1, 46 * t.s, 14 * t.s);
        blit(g, rocks[t.kind], t.x, t.y, t.s);
        break;
      }
      case K_CRITTER: drawCritter(S, g, it.o as Critter); break;
      case K_CORPSE: drawCorpse(S, g, it.o as Corpse); break;
      case K_PROJ: {
        const pr = it.o as Projectile;
        drawShadow(g, pr.x, pr.y, 16, 6);
        g.fillStyle = '#2f7d1f';
        g.beginPath(); g.arc(pr.x, pr.y - pr.z, 6.5, 0, TAU); g.fill();
        g.fillStyle = '#8bea5a';
        g.beginPath(); g.arc(pr.x, pr.y - pr.z, 5, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.beginPath(); g.arc(pr.x - 1.6, pr.y - pr.z - 1.8, 1.6, 0, TAU); g.fill();
        break;
      }
    }
  }
}

const pose: Pose = { t: 0 };

export function drawCritter(S: CreatureStage, g: CanvasRenderingContext2D, c: Critter) {
  let size = c.size;
  const isP = c === S.player;
  if (isP && S.playerSwallowed) return;
  if (isP && S.hatchT > 0) size *= 0.35 + 0.65 * easeOutBack(clamp(1 - S.hatchT / 1.1, 0, 1));
  if (c.state === 'abducted') size *= 1 - c.anim * 0.55;
  pose.t = S.t + c.id * 0.731;
  pose.walk = c.walk;
  pose.phase = c.phase;
  pose.facing = c.facing;
  pose.action = c.action ?? undefined;
  pose.actionT = c.action ? 1 - c.actT / c.actDur : undefined;
  if (!c.action && c.z > 2 && c.state !== 'abducted' && c.state !== 'ascend') {
    pose.action = isP && S.gliding ? 'glide' : 'jump';
    pose.actionT = 0.5;
  }
  pose.lift = c.z / size;
  pose.flash = undefined;
  pose.flashAmt = 0;
  if (c.flash > 0) { pose.flash = '#ffffff'; pose.flashAmt = c.flash * 4; }
  else if (c.poison > 0) { pose.flash = '#6be04a'; pose.flashAmt = 0.3 + 0.2 * Math.sin(S.t * 10); }
  else if (c.lulled > 0) { pose.flash = '#e9b8ff'; pose.flashAmt = 0.3; }
  else if (c.stun > 0) { pose.flash = '#fff3a0'; pose.flashAmt = 0.25; }
  pose.alpha = c.state === 'ascend' ? clamp(1 - c.anim / 1.6, 0, 1) : isP && S.invuln > 0 && S.phase === 'play' ? 0.55 + 0.45 * Math.abs(Math.sin(S.t * 14)) : undefined;
  pose.down = isP ? S.deathT : undefined;
  const sub = c.z <= 1 ? S.submersion(c) : 0;
  if (sub > 0) {
    const H = critterHeight(c);
    const cut = sub * H;
    g.save();
    g.beginPath();
    g.rect(c.x - 600, c.y - 2000, 1200, 2000 - cut);
    g.clip();
    renderDesign(g, c.sp.design, c.x, c.y, size, pose, { lodPx: S.quality > 0 ? 14 : 28, shadow: false });
    g.restore();
    const moving = Math.hypot(c.vx, c.vy) > 10;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 2;
    const rw = c.r * 1.3 + (moving ? Math.sin(S.t * 8) * 3 : 0);
    g.beginPath(); g.ellipse(c.x, c.y - cut, rw, rw * 0.3, 0, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    const r2 = rw + 8 + ((S.t * 20) % 14);
    g.beginPath(); g.ellipse(c.x, c.y - cut, r2, r2 * 0.3, 0, 0, TAU); g.stroke();
  } else {
    renderDesign(g, c.sp.design, c.x, c.y, size, pose, { lodPx: S.quality > 0 ? 14 : 28 });
  }
}

function drawCorpse(S: CreatureStage, g: CanvasRenderingContext2D, c: Corpse) {
  const fade = clamp((c.life - c.age) / 8, 0, 1);
  if (fade <= 0) return;
  pose.t = 0; pose.walk = 0; pose.phase = 0; pose.facing = c.facing; pose.action = undefined; pose.actionT = undefined;
  pose.lift = 0; pose.flash = '#4a3a2e'; pose.flashAmt = 0.75; pose.alpha = fade * 0.95; pose.down = 1;
  renderDesign(g, c.sp.design, c.x, c.y, c.size, pose, { lodPx: 14 });
}

// ------------------------------------------------------------------ clouds & light
let cloudSpr: HTMLCanvasElement | null = null;
function drawClouds(S: CreatureStage, g: CanvasRenderingContext2D) {
  if (!cloudSpr) {
    cloudSpr = document.createElement('canvas');
    cloudSpr.width = 128; cloudSpr.height = 64;
    const c = cloudSpr.getContext('2d')!;
    for (const [x, y, r] of [[40, 34, 24], [64, 28, 28], [88, 36, 22], [62, 40, 22]]) {
      const gr = c.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(10,30,40,0.55)');
      gr.addColorStop(1, 'rgba(10,30,40,0)');
      c.fillStyle = gr;
      c.fillRect(0, 0, 128, 64);
    }
  }
  const cam = S.cam;
  const P = 2600;
  for (let i = 0; i < 4; i++) {
    const bx = i * 917 + S.t * 14, by = i * 613 + S.t * 5;
    const x = cam.x + ((((bx - cam.x) % P) + P) % P) - P / 2;
    const y = cam.y + ((((by - cam.y) % P) + P) % P) - P / 2;
    const sw = 620 + i * 90, sh = sw * 0.5;
    if (!cam.isVisible(x, y, sw)) continue;
    g.globalAlpha = 0.16;
    g.drawImage(cloudSpr, x - sw / 2, y - sh / 2, sw, sh);
  }
  g.globalAlpha = 1;
}

let vignette: { c: HTMLCanvasElement; w: number; h: number } | null = null;
function drawLighting(S: CreatureStage, g: CanvasRenderingContext2D, w: number, h: number) {
  const d = ((S.t + 90) / 420) % 1;
  let col = '', a = 0;
  if (d < 0.08) { col = '255,160,120'; a = 0.12 * (1 - d / 0.08); }
  else if (d > 0.55 && d < 0.75) { col = '255,170,70'; a = 0.12 * ((d - 0.55) / 0.2); }
  else if (d >= 0.75 && d < 0.9) { col = '110,70,170'; a = 0.12 + 0.08 * ((d - 0.75) / 0.15); }
  else if (d >= 0.9) { col = '70,70,150'; a = 0.2 * (1 - (d - 0.9) / 0.1); }
  if (a > 0.005) { g.fillStyle = `rgba(${col},${a.toFixed(3)})`; g.fillRect(0, 0, w, h); }
  const sky = S.events.skyTint;
  if (sky > 0) { g.fillStyle = `rgba(110,30,10,${(sky * 0.22).toFixed(3)})`; g.fillRect(0, 0, w, h); }
  if (S.quality <= 0) return;
  // Vignette, baked once at device resolution so it is a 1:1 blit each frame.
  const tr = g.getTransform();
  const dw = Math.round(w * tr.a), dh = Math.round(h * tr.d);
  if (!vignette || vignette.w !== dw || vignette.h !== dh) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, dw); c.height = Math.max(1, dh);
    const vg = c.getContext('2d')!;
    const gr = vg.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
    gr.addColorStop(0, 'rgba(0,10,20,0)');
    gr.addColorStop(1, 'rgba(0,10,20,0.38)');
    vg.fillStyle = gr;
    vg.fillRect(0, 0, c.width, c.height);
    vignette = { c, w: dw, h: dh };
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(vignette.c, 0, 0);
  g.restore();
}

// ------------------------------------------------------------------ overlays (screen space)
function drawOverlays(S: CreatureStage, g: CanvasRenderingContext2D, w: number, h: number) {
  const cam = S.cam;
  // Nest relation badges.
  for (const n of S.nests) {
    if (!n.active || n.home || !n.species || !n.discovered) continue;
    if (!cam.isVisible(n.x, n.y, 40)) continue;
    const s = cam.worldToScreen(n.x, n.y - 30);
    drawBubble(g, REL_INFO[n.species.relation].face, s.x, s.y - 20, 0.85);
  }
  // Creature bubbles, bars and tags.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const c of S.critters) {
    if (c.gone || !c.near) continue;
    const hh = critterHeight(c) + c.z;
    if (!cam.isVisible(c.x, c.y - hh / 2, hh)) continue;
    const top = cam.worldToScreen(c.x, c.y - hh);
    let y = top.y - 6;
    const inSocial = S.social.target === c;
    const isT = c === S.target && !inSocial;
    if ((isT || c.hpShow > 0) && !inSocial && c !== S.player && c.state !== 'ascend') {
      const bw = Math.max(40, Math.min(90, c.r * cam.zoom * 1.5)), bh = 6;
      const f = clamp(c.hp / c.maxHp, 0, 1);
      g.fillStyle = 'rgba(8,16,26,0.8)';
      roundRect(g, top.x - bw / 2 - 2, y - bh - 2, bw + 4, bh + 4, 4); g.fill();
      g.fillStyle = c.role === 'pack' ? '#4cd97b' : c.role === 'titan' ? '#b06bff' : f > 0.5 ? '#ffd166' : '#ff6b6b';
      roundRect(g, top.x - bw / 2, y - bh, bw * f, bh, 3); g.fill();
      y -= bh + 8;
      if (isT) {
        const lvl = c.role === 'titan' ? 'TITAN' : c.role === 'loner' ? 'Loner' : `Lv ${c.sp.level}`;
        const label = `${c.sp.name} · ${lvl}${c.role === 'alpha' ? ' ⭐' : ''}${c.role === 'baby' ? ' (baby)' : ''}`;
        g.font = '600 12px Fredoka, system-ui, sans-serif';
        g.lineWidth = 3.5;
        g.strokeStyle = 'rgba(8,16,26,0.9)';
        g.strokeText(label, top.x, y - 2);
        g.fillStyle = '#ffffff';
        g.fillText(label, top.x, y - 2);
        y -= 14;
      }
    }
    if (c.role === 'alpha' && !isT) drawEmoji(g, '⭐', top.x + 14, top.y - 2, 12);
    if (c.befriended && c.role !== 'pack' && !c.emote) drawEmoji(g, '❤️', top.x - 14, top.y - 2, 11);
    if (c.emote && !(S.social.target === c)) drawBubble(g, c.emote, top.x, y, 0.85);
    const sp = S.speech.get(c);
    if (sp) drawSpeech(g, sp.text, top.x, y - (c.emote ? 40 : 0));
  }
  S.social.render(g);
  S.fx.drawScreen(g, cam);
  drawIndicators(S, g, w, h);
  S.ctrl.render(g, S.safeBottom());
}

function drawSpeech(g: CanvasRenderingContext2D, text: string, x: number, y: number) {
  g.font = '600 13px Fredoka, system-ui, sans-serif';
  const tw = g.measureText(text).width + 18;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.strokeStyle = 'rgba(30,40,60,0.85)';
  g.lineWidth = 2;
  roundRect(g, x - tw / 2, y - 34, tw, 26, 11);
  g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 5, y - 9); g.lineTo(x, y - 2); g.lineTo(x + 5, y - 9); g.closePath();
  g.fill();
  g.fillStyle = '#1b2633';
  g.fillText(text, x, y - 21);
}

function drawIndicators(S: CreatureStage, g: CanvasRenderingContext2D, w: number, h: number) {
  if (S.phase !== 'play') return;
  const cam = S.cam;
  const marks: { x: number; y: number; icon: string; col: string }[] = [];
  const mt = S.migrating ? S.migTarget() : null;
  if (mt) marks.push({ x: mt.x, y: mt.y, icon: '🏡', col: '#ffe48a' });
  if (S.callT > 0 || S.mate) marks.push({ x: S.homeNest.x, y: S.homeNest.y, icon: '💕', col: '#ff9ec7' });
  if (S.target && !S.target.gone) marks.push({ x: S.target.x, y: S.target.y - 20, icon: '🎯', col: '#ffffff' });
  // Keep arrows inside the playfield, clear of the HUD columns (portrait) or the right cluster (landscape).
  const portrait = h >= w;
  const x0 = 30, x1 = portrait ? w - 30 : w - 230;
  const y0 = portrait ? 175 : 120, y1 = portrait ? h - 290 : h - 40;
  for (const m of marks) {
    const s = cam.worldToScreen(m.x, m.y);
    if (s.x > 0 && s.x < w && s.y > 60 && s.y < h - 10) continue;
    const cx = w / 2, cy = (y0 + y1) / 2;
    const dx = s.x - cx, dy = s.y - cy;
    const k = Math.min(Math.abs((dx > 0 ? x1 - cx : x0 - cx) / (dx || 1e-6)), Math.abs((dy > 0 ? y1 - cy : y0 - cy) / (dy || 1e-6)));
    const px = cx + dx * k, py = cy + dy * k;
    const a = Math.atan2(dy, dx);
    g.save();
    g.translate(px, py);
    g.fillStyle = 'rgba(8,16,26,0.75)';
    g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.fill();
    g.rotate(a);
    g.fillStyle = m.col;
    g.beginPath(); g.moveTo(26, 0); g.lineTo(16, -8); g.lineTo(16, 8); g.closePath(); g.fill();
    g.restore();
    drawEmoji(g, m.icon, px, py, 18);
  }
}
