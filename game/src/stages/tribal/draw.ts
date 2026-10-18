// Rendering for the Tribal stage: terrain, water, buildings, totem, fire, units, overlays,
// day/night palette and off-screen threat indicators.
import { renderDesign, type Pose } from '../../design/render';
import { clamp, easeOutBack, lerp } from '../../engine/math';
import { hexToRgb, mix, shade } from '../../design/color';
import { PLAYER, WORLD, relationFace, type ResourceNode, type Tribe, type Unit } from './types';
import type { Design } from '../../design/types';
import type { TribalStage } from './stage';
import { TERRAIN_SCALE, coastY } from './world';
import { FRUIT_COLS, FRUIT_SLOTS, drawIcon, drawSprite, mainHutSprite, penSprite, ruinSprite, toolHutSprite, treeSprite } from './sprites';
import { drawFlame, drawTool } from './tools';
import { growth, layoutOf } from './units';

interface DItem { y: number; k: number; o: unknown }
const items: DItem[] = [];
let nItems = 0;
function push(y: number, k: number, o: unknown) {
  let it = items[nItems];
  if (!it) { it = { y: 0, k: 0, o: null }; items[nItems] = it; }
  it.y = y; it.k = k; it.o = o;
  nItems++;
}
const byY = (a: DItem, b: DItem) => a.y - b.y;
const pose: Pose = { t: 0 };

const K_TREE = 0, K_FRUIT = 1, K_UNIT = 2, K_HOME = 3, K_TOOL = 4, K_RIVAL = 5, K_TOTEM = 6, K_FIRE = 7, K_PILE = 8, K_PEN = 9, K_NODE = 10, K_RFIRE = 11;

const FONT = 'Fredoka, ui-rounded, system-ui, sans-serif';

export function playerHutStyle(st: TribalStage) {
  return st.diet === 'herbivore' ? 'clay' : st.diet === 'carnivore' ? 'hide' : 'wood';
}

export function renderWorld(st: TribalStage, g: CanvasRenderingContext2D, w: number, hh: number) {
  const cam = st.cam;
  const t = st.time;
  g.fillStyle = '#2c5a35';
  g.fillRect(0, 0, w, hh);
  g.save();
  const sh = st.fx.shake;
  if (sh > 0) g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  cam.apply(g);
  const b = cam.bounds(0);
  // sea beyond the bottom edge
  if (b.y1 > 1750) {
    g.fillStyle = '#22629c';
    g.fillRect(b.x0, Math.max(b.y0, 1750), b.x1 - b.x0, b.y1 - Math.max(b.y0, 1750));
  }
  const x0 = clamp(b.x0, 0, WORLD), y0 = clamp(b.y0, 0, WORLD), x1 = clamp(b.x1, 0, WORLD), y1 = clamp(b.y1, 0, WORLD);
  if (x1 > x0 && y1 > y0) {
    g.imageSmoothingEnabled = true;
    g.drawImage(st.terrain, x0 * TERRAIN_SCALE, y0 * TERRAIN_SCALE, (x1 - x0) * TERRAIN_SCALE, (y1 - y0) * TERRAIN_SCALE, x0, y0, x1 - x0, y1 - y0);
  }
  drawWater(st, g, b, t);
  drawGround(st, g, t);

  // ---- y-sorted pass
  nItems = 0;
  const vis = (x: number, y: number, r: number) => x > b.x0 - r && x < b.x1 + r && y > b.y0 - r && y < b.y1 + r * 1.6;
  for (const tr of st.w.trees) if (vis(tr.x, tr.y - 40, 70)) push(tr.y, K_TREE, tr);
  for (const n of st.nodes) {
    if (n.kind === 'tree') { if (vis(n.x, n.y - 40, 70)) push(n.y, K_FRUIT, n); }
    else if (n.kind === 'carcass' || n.kind === 'cache') { if (vis(n.x, n.y, 30)) push(n.y, K_NODE, n); }
  }
  let shownUnits = 0;
  for (const u of st.units) {
    const hgt = u.hgt * u.size;
    if (vis(u.x, u.y - hgt / 2, Math.max(40, hgt))) { push(u.y, K_UNIT, u); shownUnits++; }
  }
  impostorPx = shownUnits > 36 ? 44 : shownUnits > 24 ? 34 : 26;
  const H = st.home;
  if (vis(H.hut.x, H.hut.y - 60, 120)) push(H.hut.y, K_HOME, null);
  st.toolHuts.forEach((th, i) => { if (th && vis(H.slots[i].x, H.slots[i].y - 40, 70)) push(H.slots[i].y, K_TOOL, i); });
  for (const tr of st.tribes) {
    if (vis(tr.x, tr.y - 60, 140)) push(tr.y, K_RIVAL, tr);
    if (tr.state !== 'defeated' && vis(tr.x, tr.y + 50, 40)) push(tr.y + 50, K_RFIRE, tr);
  }
  if (vis(H.totem.x, H.totem.y - 60, 80)) push(H.totem.y, K_TOTEM, null);
  if (vis(H.fire.x, H.fire.y, 60)) push(H.fire.y, K_FIRE, H.fire);
  if (vis(H.pile.x, H.pile.y, 60)) push(H.pile.y + 2, K_PILE, null);
  if (vis(H.pen.x, H.pen.y, 120)) push(H.pen.y + 48, K_PEN, null);
  items.length = nItems;
  items.sort(byY);
  for (let i = 0; i < nItems; i++) {
    const it = items[i];
    switch (it.k) {
      case K_TREE: { const tr = it.o as { x: number; y: number; v: number; s: number }; drawSprite(g, treeSprite(tr.v), tr.x, tr.y, tr.s); break; }
      case K_FRUIT: drawFruitTree(st, g, it.o as ResourceNode, t); break;
      case K_UNIT: drawUnit(st, g, it.o as Unit); break;
      case K_HOME: drawHomeHut(st, g, t); break;
      case K_TOOL: {
        const i2 = it.o as number, th = st.toolHuts[i2]!;
        const s = H.slots[i2];
        drawSprite(g, toolHutSprite(th.tool, playerHutStyle(st)), s.x, s.y, th.grow < 1 ? easeOutBack(th.grow) : 1);
        break;
      }
      case K_RIVAL: drawRivalHut(st, g, it.o as Tribe, t); break;
      case K_TOTEM: drawTotem(st, g, H.totem.x, H.totem.y, t); break;
      case K_FIRE: drawFire(g, H.fire.x, H.fire.y, t, 1.15); break;
      case K_RFIRE: { const tr = it.o as Tribe; drawFire(g, tr.x + 4, tr.y + 50, t + tr.id, 0.75); break; }
      case K_PILE: drawPile(st, g, H.pile.x, H.pile.y); break;
      case K_PEN: drawSprite(g, penSprite(true), H.pen.x, H.pen.y); break;
      case K_NODE: drawFoodNode(g, it.o as ResourceNode, t); break;
    }
  }
  // ---- overlays
  drawShots(st, g);
  st.fx.draw(g, cam, t);
  for (const u of st.units) if (!u.dead && vis(u.x, u.y - 30, 60)) drawUnitOverlay(st, g, u, t);
  g.restore();
  drawLighting(st, g, w, hh);
  // ---- screen space
  drawHutLabels(st, g);
  st.fx.drawTexts(g, cam);
  drawIndicators(st, g, w, hh, t);
}

// ------------------------------------------------------------------ water & ground

function drawWater(st: TribalStage, g: CanvasRenderingContext2D, b: { x0: number; y0: number; x1: number; y1: number }, t: number) {
  const wg = st.w;
  // coast foam
  const xa = Math.max(0, Math.floor(b.x0 / 16) * 16), xb = Math.min(WORLD, b.x1 + 16);
  if (b.y1 > 1700 && xb > xa) {
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      g.strokeStyle = k ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.55)';
      g.beginPath();
      for (let x = xa; x <= xb; x += 16) {
        const y = coastY(wg, x) + 3 + k * (9 + Math.sin(t * 0.9 + x * 0.01) * 4) + Math.sin(t * 1.6 + x * 0.05) * 2.2;
        if (x === xa) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // river flow
  g.save();
  g.setLineDash([10, 28]);
  g.lineDashOffset = -t * 36;
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 2.4;
  g.beginPath();
  let any = false;
  for (let i = 0; i < wg.river.length; i++) {
    const p = wg.river[i];
    if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
    if (p.x > b.x0 - 80 && p.x < b.x1 + 80 && p.y > b.y0 - 80 && p.y < b.y1 + 80) any = true;
  }
  if (any) g.stroke();
  g.restore();
  // fishing ripples
  for (const n of st.nodes) {
    if (n.kind !== 'fish' || n.x < b.x0 - 40 || n.x > b.x1 + 40 || n.y < b.y0 - 40 || n.y > b.y1 + 40) continue;
    for (let k = 0; k < 2; k++) {
      const ph = ((t * 0.6 + k * 0.5 + n.id * 0.13) % 1);
      g.strokeStyle = `rgba(255,255,255,${0.55 * (1 - ph)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(n.x, n.y, 8 + ph * 22, (8 + ph * 22) * 0.4, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (n.boost > 0) drawIcon(g, '✨', n.x + 14, n.y - 14, 14);
    if (st.cam.zoom < 0.75) drawIcon(g, '🐟', n.x, n.y - 6, 18);
  }
}

function drawGround(st: TribalStage, g: CanvasRenderingContext2D, t: number) {
  const H = st.home;
  // food mat
  g.fillStyle = '#7a5530';
  g.beginPath(); g.ellipse(H.pile.x, H.pile.y, 40, 17, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9a06a';
  g.beginPath(); g.ellipse(H.pile.x, H.pile.y - 1, 37, 15, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(110,75,40,0.6)';
  g.lineWidth = 1.2;
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(H.pile.x + k * 9 - 4, H.pile.y - 12); g.lineTo(H.pile.x + k * 9 + 4, H.pile.y + 12); g.stroke(); }
  // pen floor, eggs
  drawSprite(g, penSprite(false), H.pen.x, H.pen.y);
  drawEggBasket(g, st.eggNode);
  // fire pits (stones)
  const pits: [number, number, number][] = [[H.fire.x, H.fire.y, 1.15]];
  for (const tr of st.tribes) if (tr.state !== 'defeated') pits.push([tr.x + 4, tr.y + 50, 0.75]);
  for (const [x, y, s] of pits) {
    g.fillStyle = 'rgba(40,25,15,0.5)';
    g.beginPath(); g.ellipse(x, y, 26 * s, 11 * s, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.fillStyle = i % 2 ? '#8d8f93' : '#a7a9ad';
      g.strokeStyle = '#4b4d52';
      g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(x + Math.cos(a) * 23 * s, y + Math.sin(a) * 10 * s, 6 * s, 4.4 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }
  // empty hut slots: little stake markers
  st.toolHuts.forEach((th, i) => {
    if (th) return;
    const s = H.slots[i];
    g.strokeStyle = 'rgba(90,60,30,0.45)';
    g.lineWidth = 1.5;
    g.setLineDash([4, 4]);
    g.beginPath(); g.ellipse(s.x, s.y, 30, 13, 0, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(90,60,30,0.55)';
    for (const [dx, dy] of [[-26, -4], [26, -4], [-18, 8], [18, 8]]) g.fillRect(s.x + dx - 1.2, s.y + dy - 8, 2.4, 9);
  });
  // snares
  for (const s of st.snares) {
    g.globalAlpha = s.sprung > 0 ? s.sprung : 0.75;
    g.strokeStyle = '#5a3d1e';
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(s.x, s.y, 12, 5, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#a7a9ad';
    g.lineWidth = 1.5;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(s.x + k * 4, s.y - 2); g.lineTo(s.x + k * 4, s.y - (s.sprung > 0 ? 10 : 6)); g.stroke(); }
    g.globalAlpha = 1;
  }
  // unit rings
  for (const u of st.units) {
    if (u.dead || u.kind === 'porter' || !st.cam.isVisible(u.x, u.y, 60)) continue;
    const rx = u.r * growth(u) * 0.95, ry = rx * 0.38;
    let col: string | null = null, a = 0.45, lw = 2;
    if (u.sel) { col = '#3ee6c4'; a = 1; lw = 2.6; }
    else if (u.team === PLAYER) col = u.pet ? '#ff9ccf' : u.charmed ? '#7bd389' : u.kind === 'member' ? '#3ee6c4' : null;
    else if (u.team >= 1) col = st.tribes[u.team - 1].color;
    else if (u.wild === 'titan' || (u.wild === 'hunter' && u.order.type === 'attack')) { col = '#ff5a4f'; a = 0.6; }
    if (!col) continue;
    if (u.sel) {
      g.fillStyle = 'rgba(62,230,196,0.18)';
      g.beginPath(); g.ellipse(u.x, u.y + 1, rx + 3, ry + 2, 0, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = a;
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.beginPath(); g.ellipse(u.x, u.y + 1, rx + (u.sel ? Math.sin(t * 6) * 1.5 : 0), ry, 0, 0, Math.PI * 2); g.stroke();
    if (u.raid) {
      g.strokeStyle = '#ff5a4f';
      g.setLineDash([3, 3]);
      g.beginPath(); g.ellipse(u.x, u.y + 1, rx + 4, ry + 2, 0, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
    }
    g.globalAlpha = 1;
  }
}

function drawEggBasket(g: CanvasRenderingContext2D, n: ResourceNode) {
  const x = n.x, y = n.y;
  g.fillStyle = '#5a3a1e';
  g.beginPath(); g.ellipse(x, y + 2, 20, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b4834c';
  g.beginPath(); g.ellipse(x, y, 18, 8, 0, 0, Math.PI * 2); g.fill();
  const eggs = Math.min(12, Math.floor(n.amount));
  for (let i = 0; i < eggs; i++) {
    const a = i * 2.4, r = 3 + (i % 4) * 3;
    const ex = x + Math.cos(a) * r, ey = y - 3 - (i > 6 ? 4 : 0) + Math.sin(a) * r * 0.4;
    g.fillStyle = '#3a2a1a';
    g.beginPath(); g.ellipse(ex, ey, 4.2, 5.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = i % 3 ? '#fbf3df' : '#e9d6ff';
    g.beginPath(); g.ellipse(ex, ey, 3.4, 4.6, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#7a5530';
  g.lineWidth = 2;
  g.beginPath(); g.ellipse(x, y + 1, 18, 8, 0, 0.1, Math.PI - 0.1); g.stroke();
}

// ------------------------------------------------------------------ structures

function drawFlag(g: CanvasRenderingContext2D, x: number, y: number, col: string, t: number) {
  g.fillStyle = shade(col, -0.5);
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 0; i <= 6; i++) g.lineTo(x + i * 4.5, y + Math.sin(t * 5 + i * 0.8) * 2.2 * (i / 6));
  for (let i = 6; i >= 0; i--) g.lineTo(x + i * 4.5, y + 15 + Math.sin(t * 5 + i * 0.8) * 2.2 * (i / 6));
  g.closePath();
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x + 1, y + 1.5);
  for (let i = 0; i <= 6; i++) g.lineTo(x + 1 + i * 4.2, y + 1.5 + Math.sin(t * 5 + i * 0.8) * 2.2 * (i / 6));
  for (let i = 6; i >= 0; i--) g.lineTo(x + 1 + i * 4.2, y + 13.5 + Math.sin(t * 5 + i * 0.8) * 2.2 * (i / 6));
  g.closePath();
  g.fill();
}

function drawHomeHut(st: TribalStage, g: CanvasRenderingContext2D, t: number) {
  const p = st.home.hut;
  drawSprite(g, mainHutSprite(playerHutStyle(st), '#3ee6c4'), p.x, p.y);
  drawFlag(g, p.x + 30, p.y - 132, '#3ee6c4', t);
}

function drawRivalHut(st: TribalStage, g: CanvasRenderingContext2D, tr: Tribe, t: number) {
  if (tr.state === 'defeated') {
    drawSprite(g, ruinSprite(), tr.x, tr.y);
    if (tr.since < 40) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const a = Math.sin(t * 3 + i * 2) * 0.5 + 0.5;
        g.fillStyle = `rgba(255,${100 + i * 15},40,${0.4 * a})`;
        g.beginPath(); g.arc(tr.x - 40 + i * 16, tr.y - 4 + (i % 2) * 6, 3 + a * 2, 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    return;
  }
  const jig = tr.hitT > 0 ? Math.sin(t * 60) * 2 : 0;
  drawSprite(g, mainHutSprite(tr.style, tr.color), tr.x + jig, tr.y);
  drawFlag(g, tr.x + 30 + jig, tr.y - 132, tr.state === 'allied' ? '#4cd97b' : tr.color, t + tr.id);
  const dmg = 1 - tr.hutHp / tr.hutMax;
  if (dmg > 0.25) {
    g.globalAlpha = Math.min(0.55, dmg * 0.7);
    g.fillStyle = '#1a120c';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(tr.x - 40 + i * 20, tr.y - 50 - (i % 2) * 22, 10 + dmg * 6, 7, 0.4, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }
  if (tr.burn > 0) {
    for (let i = 0; i < 4; i++) drawFlame(g, tr.x - 36 + i * 24, tr.y - 52 - (i % 2) * 24, 1.6, t * 1.3 + i);
  }
  if (tr.state === 'allied') {
    // garland of flowers over the door
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.15 + 0.7 * (i / 6));
      g.fillStyle = ['#ff8fb8', '#ffe066', '#ffffff'][i % 3];
      g.beginPath(); g.arc(tr.x + Math.cos(a) * -18, tr.y - 26 - Math.sin(a) * 12, 3, 0, Math.PI * 2); g.fill();
    }
  }
}

function drawFire(g: CanvasRenderingContext2D, x: number, y: number, t: number, s: number) {
  // logs
  g.lineCap = 'round';
  for (const [a, c] of [[0.5, '#5a3a1e'], [-0.5, '#6b4526'], [0.05, '#4a2d16']] as [number, string][]) {
    g.strokeStyle = '#21140a';
    g.lineWidth = 7 * s;
    g.beginPath(); g.moveTo(x - Math.cos(a) * 16 * s, y + Math.sin(a) * 5 * s); g.lineTo(x + Math.cos(a) * 16 * s, y - Math.sin(a) * 5 * s); g.stroke();
    g.strokeStyle = c;
    g.lineWidth = 5 * s;
    g.stroke();
  }
  g.globalCompositeOperation = 'lighter';
  const gl = g.createRadialGradient(x, y - 10 * s, 2, x, y - 10 * s, 46 * s);
  gl.addColorStop(0, 'rgba(255,170,70,0.45)');
  gl.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gl;
  g.beginPath(); g.arc(x, y - 10 * s, 46 * s, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  drawFlame(g, x - 7 * s, y - 2, 1.5 * s, t * 1.1);
  drawFlame(g, x + 7 * s, y - 2, 1.4 * s, t * 0.9 + 2);
  drawFlame(g, x, y - 1, 2.1 * s, t);
}

function drawPile(st: TribalStage, g: CanvasRenderingContext2D, x: number, y: number) {
  const n = Math.min(30, Math.round(Math.sqrt(Math.max(0, st.food)) * 1.6));
  for (let i = 0; i < n; i++) {
    const layer = i < 14 ? 0 : i < 24 ? 1 : 2;
    const a = i * 2.39996;
    const rr = (layer === 0 ? 26 : layer === 1 ? 16 : 7) * Math.sqrt(((i * 7) % 10) / 10 + 0.1);
    const px = x + Math.cos(a) * rr, py = y - 3 - layer * 6 + Math.sin(a) * rr * 0.38;
    const kind = i % 5;
    g.strokeStyle = '#2b1a0e';
    g.lineWidth = 1.2;
    if (kind === 1) { g.fillStyle = '#7fb2d6'; g.beginPath(); g.ellipse(px, py, 7, 3.4, 0.3, 0, Math.PI * 2); g.fill(); g.stroke(); }
    else if (kind === 3) { g.fillStyle = '#c0574a'; g.beginPath(); g.ellipse(px, py, 5.4, 4.2, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    else { g.fillStyle = FRUIT_COLS[i % 3]; g.beginPath(); g.arc(px, py, 4.2, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(px - 1.3, py - 1.4, 1.2, 0, Math.PI * 2); g.fill(); }
  }
}

function drawFruitTree(st: TribalStage, g: CanvasRenderingContext2D, n: ResourceNode, t: number) {
  const jig = n.shake > 0 ? Math.sin(t * 50) * 2.5 * n.shake * 3 : 0;
  drawSprite(g, treeSprite(10), n.x + jig, n.y);
  const cnt = Math.min(FRUIT_SLOTS.length, Math.floor(n.amount));
  const col = FRUIT_COLS[n.variant % 3];
  for (let i = 0; i < cnt; i++) {
    const [fx, fy] = FRUIT_SLOTS[i];
    const x = n.x + fx + jig, y = n.y + fy;
    g.fillStyle = '#2b1a0e';
    g.beginPath(); g.arc(x, y, 4.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(x - 1.2, y - 1.2, 1.1, 0, Math.PI * 2); g.fill();
  }
  if (n.boost > 0 && Math.sin(t * 4 + n.id) > 0.6) drawIcon(g, '✨', n.x + 18, n.y - 70, 14);
}

function drawFoodNode(g: CanvasRenderingContext2D, n: ResourceNode, t: number) {
  const k = clamp(n.amount / Math.max(1, n.max), 0.35, 1);
  if (n.kind === 'carcass') {
    const s = (n.max > 60 ? 2 : 1) * (0.6 + 0.4 * k);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(n.x, n.y + 2, 16 * s, 5 * s, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2b1a0e';
    g.lineWidth = 2;
    g.fillStyle = '#c0574a';
    g.beginPath(); g.ellipse(n.x, n.y - 5 * s, 12 * s, 7 * s, -0.2, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#f3ead7';
    g.beginPath(); g.ellipse(n.x + 13 * s, n.y - 9 * s, 3.4 * s, 2.4 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath(); g.ellipse(n.x - 3 * s, n.y - 8 * s, 5 * s, 2 * s, -0.2, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(n.x, n.y + 2, 14, 5, 0, 0, Math.PI * 2); g.fill();
    drawIcon(g, n.food === 'fish' ? '🐟' : n.food === 'meat' ? '🍖' : n.food === 'eggs' ? '🥚' : '🍎', n.x, n.y - 8 + Math.sin(t * 3 + n.id) * 1.5, 20 * (0.7 + 0.3 * k));
  }
}

function drawTotem(st: TribalStage, g: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const heads = st.totem;
  const poleH = 52 + heads.length * 26;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(x, y + 2, 20, 7, 0, 0, Math.PI * 2); g.fill();
  for (const [dx, c] of [[-10, '#8d8f93'], [9, '#a7a9ad'], [0, '#9a9ca0']] as [number, string][]) {
    g.fillStyle = c;
    g.strokeStyle = '#4b4d52';
    g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(x + dx, y - 2, 9, 6, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.fillStyle = '#2b1a0e';
  g.fillRect(x - 8, y - poleH - 4, 16, poleH);
  g.fillStyle = '#8a5a32';
  g.fillRect(x - 6.5, y - poleH - 2, 13, poleH - 2);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(x - 6, y - poleH - 2, 3, poleH - 2);
  // base head: our species
  const sp = st.designs[0].colors;
  drawTotemHead(g, x, y - 26, sp.base, sp.coat, 'calm', 1, t);
  heads.forEach((hd, i) => {
    const tr = st.tribes[hd.tribe - 1];
    const k = hd.t < 0.6 ? easeOutBack(clamp(hd.t / 0.6, 0, 1)) : 1;
    const hy = y - 52 - i * 26;
    if (hd.t < 2.5) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = hd.allied ? `rgba(90,255,150,${0.5 * (1 - hd.t / 2.5)})` : `rgba(255,90,60,${0.5 * (1 - hd.t / 2.5)})`;
      g.beginPath(); g.arc(x, hy, 30, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    drawTotemHead(g, x, hy, tr.design.colors.base, tr.color, hd.allied ? 'happy' : 'war', k, t);
  });
  // crown feathers
  const ty = y - poleH - 6;
  for (let i = 0; i < 5; i++) {
    g.save();
    g.translate(x, ty);
    g.rotate(-Math.PI / 2 + (i - 2) * 0.38 + Math.sin(t * 1.5 + i) * 0.04);
    g.fillStyle = '#2b1a0e';
    g.beginPath(); g.ellipse(13, 0, 13, 4.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = ['#e9483b', '#ffd166', '#3ee6c4', '#ffd166', '#e9483b'][i];
    g.beginPath(); g.ellipse(13, 0, 11.5, 3.2, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

function drawTotemHead(g: CanvasRenderingContext2D, x: number, y: number, base: string, paint: string, mood: 'calm' | 'happy' | 'war', k: number, t: number) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  const wood = mix('#9a6a3d', base, 0.45);
  g.fillStyle = '#2b1a0e';
  g.beginPath(); g.roundRect(-15, -12, 30, 25, 7); g.fill();
  g.fillStyle = wood;
  g.beginPath(); g.roundRect(-13.5, -10.5, 27, 22, 6); g.fill();
  g.fillStyle = paint;
  g.fillRect(-13.5, -4, 27, 3);
  // ears / wings
  g.fillStyle = shade(wood, -0.2);
  g.beginPath(); g.moveTo(-14, -6); g.lineTo(-22, -10); g.lineTo(-14, 2); g.fill();
  g.beginPath(); g.moveTo(14, -6); g.lineTo(22, -10); g.lineTo(14, 2); g.fill();
  // eyes
  g.fillStyle = '#fff6e0';
  g.beginPath(); g.ellipse(-6, -6.5, 4, 3.4, 0, 0, Math.PI * 2); g.ellipse(6, -6.5, 4, 3.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a120c';
  const look = Math.sin(t * 0.7) * 0.8;
  g.beginPath(); g.arc(-6 + look, -6.3, 1.8, 0, Math.PI * 2); g.arc(6 + look, -6.3, 1.8, 0, Math.PI * 2); g.fill();
  if (mood === 'war') {
    g.strokeStyle = '#1a120c';
    g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-10, -11); g.lineTo(-2, -8.5); g.moveTo(10, -11); g.lineTo(2, -8.5); g.stroke();
    g.fillStyle = '#c2271d';
    g.fillRect(-11, 1, 3, 6); g.fillRect(8, 1, 3, 6);
  }
  // mouth
  g.fillStyle = '#1a120c';
  if (mood === 'happy') { g.beginPath(); g.arc(0, 3, 5.5, 0, Math.PI); g.fill(); }
  else if (mood === 'war') { g.fillRect(-6, 4, 12, 4); g.fillStyle = '#fff6e0'; for (let i = 0; i < 4; i++) g.fillRect(-5.5 + i * 3, 4, 1.6, 2); }
  else g.fillRect(-5, 4, 10, 3);
  g.restore();
}

// ------------------------------------------------------------------ units

// ------------------------------------------------------------------ creature impostors (LOD)
// Small on-screen creatures are blitted from a cached bitmap instead of being re-tessellated every
// frame; up close they get the full procedural renderDesign animation.
interface Impostor { cv: HTMLCanvasElement; s: number; ax: number; ay: number; w: number; h: number }
const impostors = new WeakMap<Design, Impostor>();
function impostorOf(d: Design): Impostor {
  let im = impostors.get(d);
  if (!im) {
    const L = layoutOf(d);
    const s = Math.min(2.4, 80 / Math.max(10, L.height, L.width * 0.6));
    const pad = 10 + Math.max(L.width, L.height) * s * 0.18;
    const w = Math.ceil(L.width * s + pad * 2), h = Math.ceil(L.height * s + pad * 2);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ax = pad + (L.cx - L.left) * s, ay = pad + (L.groundY - L.top) * s;
    renderDesign(cv.getContext('2d')!, d, ax, ay, s, { t: 0.4 }, { shadow: false });
    im = { cv, s, ax, ay, w, h };
    impostors.set(d, im);
  }
  return im;
}
/** On-screen height (px) below which impostors are used; raised when the view is crowded. */
let impostorPx = 26;

function drawImpostor(g: CanvasRenderingContext2D, u: Unit, s: number) {
  const im = impostorOf(u.design);
  const L = layoutOf(u.design);
  const k = s / im.s;
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.ellipse(u.x, u.y, L.width * 0.45 * s, Math.max(1.5, L.width * 0.09 * s), 0, 0, Math.PI * 2);
  g.fill();
  const bob = Math.abs(Math.sin(u.phase * Math.PI * 2)) * 2.2 * u.walk;
  const lunge = u.action && u.action !== 'dance' ? Math.sin(clamp(u.actionT / u.actionDur, 0, 1) * Math.PI) * 4 : 0;
  const hop = u.action === 'dance' ? Math.abs(Math.sin(u.actionT * 9)) * 3 : 0;
  g.save();
  if (u.kind === 'porter') g.globalAlpha = 0.95;
  g.translate(u.x + u.facing * lunge, u.y - bob - hop);
  if (u.facing < 0) g.scale(-1, 1);
  g.drawImage(im.cv, -im.ax * k, -im.ay * k, im.w * k, im.h * k);
  g.restore();
}

function drawUnit(st: TribalStage, g: CanvasRenderingContext2D, u: Unit) {
  const s = u.size * growth(u);
  if (!u.dead && u.flash <= 0 && u.burn <= 0 && u.hgt * s * st.cam.zoom < impostorPx) {
    drawImpostor(g, u, s);
    drawUnitExtras(st, g, u, s);
    return;
  }
  pose.t = u.t;
  pose.walk = u.walk;
  pose.phase = u.phase;
  pose.facing = u.facing;
  pose.action = u.dead ? undefined : u.action ?? undefined;
  pose.actionT = u.action ? clamp(u.actionT / u.actionDur, 0, 1) : 0;
  pose.lift = 0;
  if (u.flash > 0) { pose.flash = '#ffffff'; pose.flashAmt = u.flash * 3; }
  else if (u.burn > 0) { pose.flash = '#ff7a2a'; pose.flashAmt = 0.55; }
  else if (u.charmed) { pose.flash = '#7bd389'; pose.flashAmt = 0.35 + Math.sin(u.t * 4) * 0.1; }
  else { pose.flash = undefined; pose.flashAmt = 0; }
  pose.down = u.dead && !u.fear ? clamp(u.actionT * 3, 0, 1) : 0;
  pose.alpha = u.dead ? clamp(u.dying / 0.8, 0, 1) : u.kind === 'porter' ? 0.95 : 1;
  renderDesign(g, u.design, u.x, u.y, s, pose, { lodPx: 6 });
  if (!u.dead) drawUnitExtras(st, g, u, s);
}

/** Tools, the chief's headdress and carried food. */
function drawUnitExtras(st: TribalStage, g: CanvasRenderingContext2D, u: Unit, s: number) {
  if (u.kind === 'animal') return;
  const L = layoutOf(u.design);
  const wdt = L.width * s, hgt = L.height * s;
  if (u.age >= 1) {
    const swing = u.action === 'strike' ? clamp(u.actionT / u.actionDur, 0, 1) : 0;
    if (u.chief) drawTool(g, 'chief', u.x + u.facing * wdt * 0.36, u.y - 4, 0.68, u.facing, u.t, swing * 0.6);
    else if (u.tool) drawTool(g, u.tool, u.x + u.facing * wdt * 0.3, u.y - hgt * 0.32, 0.6, u.facing, u.t, swing);
  }
  if (u.chief) drawHeaddress(g, u, s, t0(u));
  if (u.kind === 'porter') drawIcon(g, '🧺', u.x - u.facing * wdt * 0.1, u.y - hgt - 6, 18);
  else if (u.carry > 0) drawIcon(g, u.carryKind === 'fish' ? '🐟' : u.carryKind === 'meat' ? '🍖' : u.carryKind === 'eggs' ? '🥚' : '🍎', u.x - u.facing * wdt * 0.15, u.y - hgt - 5, 14);
}
const t0 = (u: Unit) => u.t;

/** A feathered headdress on the chieftain's head node. */
function drawHeaddress(g: CanvasRenderingContext2D, u: Unit, s: number, t: number) {
  const d = u.design;
  const L = layoutOf(d);
  const head = d.spine[d.spine.length - 1];
  if (!head) return;
  const hx = u.x + (head.x - L.cx) * s * u.facing, hy = u.y + (head.y - L.groundY - head.r * 0.8) * s;
  const cols = u.team === PLAYER ? ['#e9483b', '#ffd166', '#3ee6c4', '#ffd166', '#e9483b'] : ['#2b1a0e', '#ffffff', '#2b1a0e'];
  const n = cols.length;
  for (let i = 0; i < n; i++) {
    g.save();
    g.translate(hx, hy);
    g.rotate(-Math.PI / 2 + (i - (n - 1) / 2) * 0.32 + Math.sin(t * 2 + i) * 0.05);
    g.fillStyle = '#2b1a0e';
    g.beginPath(); g.ellipse(9, 0, 9.5, 3.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = cols[i];
    g.beginPath(); g.ellipse(9, 0, 8.2, 2.4, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.fillStyle = u.team === PLAYER ? '#ffd166' : '#c9a06a';
  g.strokeStyle = '#2b1a0e';
  g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(hx, hy + 1, 7, 2.6, 0, 0, Math.PI * 2); g.fill(); g.stroke();
}

function drawUnitOverlay(st: TribalStage, g: CanvasRenderingContext2D, u: Unit, t: number) {
  if (u.kind === 'porter') return;
  const s = u.size * growth(u);
  const top = u.y - u.hgt * s - 8;
  const z = st.cam.zoom;
  const showHp = u.sel || (u.hp < u.maxHp && (u.team === PLAYER || u.aggroT > 0 || u.wild === 'titan' || u.order.type === 'attack'));
  if (showHp) {
    const bw = Math.max(26, u.r * 1.5) / Math.max(0.8, z), bh = 4.5 / Math.max(0.8, z);
    const k = clamp(u.hp / u.maxHp, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(u.x - bw / 2 - 1, top - 1, bw + 2, bh + 2);
    g.fillStyle = k > 0.5 ? '#6ee07a' : k > 0.25 ? '#ffd166' : '#ff5a4f';
    if (u.team !== PLAYER) g.fillStyle = k > 0.5 ? '#ff9a6a' : '#ff5a4f';
    g.fillRect(u.x - bw / 2, top, bw * k, bh);
  }
  if (u.age < 1) {
    // growth ring for babies
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(u.x, top - 6, 6, -Math.PI / 2, -Math.PI / 2 + u.age * Math.PI * 2); g.stroke();
  }
  if (u.bubble) {
    const bob = Math.sin(t * 4 + u.id) * 1.5;
    const by = top - (showHp ? 12 : 6) + bob;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath(); g.ellipse(u.x, by, 11, 10, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(u.x - 3, by + 8); g.lineTo(u.x, by + 13); g.lineTo(u.x + 3, by + 8); g.fill();
    drawIcon(g, u.bubble, u.x, by, 16);
  }
  if (u.stun > 0) {
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i / 3) * Math.PI * 2;
      drawIcon(g, '⭐', u.x + Math.cos(a) * 10, top - 4 + Math.sin(a) * 3, 9);
    }
  }
}

function drawShots(st: TribalStage, g: CanvasRenderingContext2D) {
  for (const s of st.shots) {
    if (s.t < 0) continue;
    const k = Math.min(1, s.t / s.dur);
    if (s.kind === 'spear') {
      const ang = Math.atan2((s.ty - s.sy) - Math.cos(k * Math.PI) * Math.PI * s.arc, s.tx - s.sx);
      g.save();
      g.translate(s.x, s.y);
      g.rotate(ang);
      g.strokeStyle = '#2b1a0e';
      g.lineWidth = 3.4;
      g.beginPath(); g.moveTo(-16, 0); g.lineTo(10, 0); g.stroke();
      g.strokeStyle = '#a77a48';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#9aa3ab';
      g.beginPath(); g.moveTo(10, -3); g.lineTo(17, 0); g.lineTo(10, 3); g.closePath(); g.fill();
      g.restore();
    } else {
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath(); g.ellipse(lerp(s.sx, s.tx, k), lerp(s.sy, s.ty, k) + 30, 6, 2.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2b1a0e';
      g.beginPath(); g.arc(s.x, s.y, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9b5d3a';
      g.beginPath(); g.arc(s.x, s.y, 5.5, 0, Math.PI * 2); g.fill();
      drawFlame(g, s.x, s.y - 4, 0.8, st.time * 3);
    }
  }
}

// ------------------------------------------------------------------ lighting

const DAY_KEYS: [number, string, number][] = [
  [0, '#ffae78', 0.34], [0.08, '#ffe2b0', 0.12], [0.2, '#fff4dc', 0.05], [0.5, '#fff4dc', 0.05], [0.62, '#ffc48a', 0.2],
  [0.69, '#d9779a', 0.36], [0.75, '#34449a', 0.62], [0.92, '#34449a', 0.62], [0.97, '#a0789a', 0.4], [1, '#ffae78', 0.34],
];

function dayTint(d: number): string {
  let i = 0;
  while (i < DAY_KEYS.length - 2 && d > DAY_KEYS[i + 1][0]) i++;
  const [a, ca, sa] = DAY_KEYS[i], [b, cb, sb] = DAY_KEYS[i + 1];
  const k = clamp((d - a) / Math.max(1e-6, b - a), 0, 1);
  const col = mix(ca, cb, k), s = lerp(sa, sb, k);
  return mix('#ffffff', col, s);
}

function drawLighting(st: TribalStage, g: CanvasRenderingContext2D, w: number, hh: number) {
  let tint = dayTint(st.day);
  if (st.effects.some((e) => e.kind === 'rain')) tint = mix(tint, '#9fb0c8', 0.35);
  if (tint !== '#ffffff') {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint;
    g.fillRect(0, 0, w, hh);
  }
  const night = st.isNight;
  if (night > 0.05) {
    g.globalCompositeOperation = 'lighter';
    const cam = st.cam;
    const light = (x: number, y: number, r: number, col: string, a: number) => {
      const p = cam.worldToScreen(x, y);
      const R = r * cam.zoom;
      if (p.x < -R || p.y < -R || p.x > w + R || p.y > hh + R) return;
      const [cr, cg, cb] = hexToRgb(col);
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
      gr.addColorStop(0, `rgba(${cr},${cg},${cb},${a * night})`);
      gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = gr;
      g.fillRect(p.x - R, p.y - R, R * 2, R * 2);
    };
    const H = st.home;
    light(H.fire.x, H.fire.y - 10, 210, '#ff9a4a', 0.42);
    light(H.hut.x, H.hut.y - 10, 70, '#ffb35c', 0.3);
    for (const tr of st.tribes) {
      if (tr.state !== 'defeated') light(tr.x + 4, tr.y + 44, 150, '#ff9a4a', 0.32);
      if (tr.burn > 0) light(tr.x, tr.y - 50, 200, '#ff6a2a', 0.5);
    }
    for (const u of st.units) if (!u.dead && u.tool === 'torch') light(u.x, u.y - 30, 90, '#ffb35c', 0.35);
  }
  g.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ screen-space labels & indicators

function drawHutLabels(st: TribalStage, g: CanvasRenderingContext2D) {
  const cam = st.cam;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const tr of st.tribes) {
    const p = cam.worldToScreen(tr.x, tr.y - 150);
    if (p.x < -80 || p.x > cam.w + 80 || p.y < -40 || p.y > cam.h + 40) continue;
    const f = relationFace(tr);
    g.font = `700 13px ${FONT}`;
    const label = tr.name;
    const wdt = g.measureText(label).width + 40;
    g.fillStyle = 'rgba(24,14,4,0.72)';
    g.beginPath(); g.roundRect(p.x - wdt / 2, p.y - 13, wdt, 26, 13); g.fill();
    g.strokeStyle = tr.color;
    g.lineWidth = 2;
    g.stroke();
    drawIcon(g, f.icon, p.x - wdt / 2 + 14, p.y, 18);
    g.fillStyle = '#fff4de';
    g.fillText(label, p.x + 10, p.y + 0.5);
    if (tr.state === 'active') {
      let y = p.y + 18;
      if (tr.admiration > 0) {
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(p.x - 40, y, 80, 6);
        g.fillStyle = '#ff8fc8'; g.fillRect(p.x - 40, y, 80 * tr.admiration / 100, 6);
        y += 9;
      }
      if (tr.hutHp < tr.hutMax) {
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(p.x - 40, y, 80, 6);
        g.fillStyle = '#ff5a4f'; g.fillRect(p.x - 40, y, 80 * Math.max(0, tr.hutHp) / tr.hutMax, 6);
      }
    }
  }
}

function drawIndicators(st: TribalStage, g: CanvasRenderingContext2D, w: number, hh: number, t: number) {
  const cam = st.cam;
  const top = 120, bottom = hh - 176, left = 22, right = w - 88;
  const shown = new Set<number>();
  for (const u of st.units) {
    if (u.dead) continue;
    const threat = u.wild === 'titan' || (u.raid && u.team >= 1);
    if (!threat || Math.hypot(u.x - st.home.x, u.y - st.home.y) > 1100) continue;
    if (shown.has(u.team)) continue;
    shown.add(u.team);
    const p = cam.worldToScreen(u.x, u.y - 20);
    if (p.x > 0 && p.x < w && p.y > 60 && p.y < hh - 150) continue;
    const cx = w / 2, cy = (top + bottom) / 2;
    const dx = p.x - cx, dy = p.y - cy;
    const k = Math.min((dx > 0 ? right - cx : left - cx) / (dx || 1e-6), (dy > 0 ? bottom - cy : top - cy) / (dy || 1e-6));
    const ix = cx + dx * k, iy = cy + dy * k;
    const ang = Math.atan2(dy, dx);
    const pulse = 1 + Math.sin(t * 8) * 0.08;
    g.save();
    g.translate(ix, iy);
    g.fillStyle = 'rgba(200,40,30,0.85)';
    g.beginPath(); g.arc(0, 0, 16 * pulse, 0, Math.PI * 2); g.fill();
    g.rotate(ang);
    g.beginPath(); g.moveTo(16, -7); g.lineTo(26, 0); g.lineTo(16, 7); g.closePath(); g.fill();
    g.restore();
    drawIcon(g, u.wild === 'titan' ? '🦖' : '⚔️', ix, iy, 18);
  }
  if (st.targetMode) {
    g.strokeStyle = 'rgba(255,90,79,0.5)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, hh - 6);
  }
}
