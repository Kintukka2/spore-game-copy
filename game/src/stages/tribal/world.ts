// Static world generation: coast, river, villages, forests, fruit trees, fishing spots, herds,
// and a pre-baked terrain canvas (drawn once, blitted every frame).
import { RNG, makeNoise2D } from '../../engine/rng';
import { clamp, dist, distToSegment, lerp, smoothstep } from '../../engine/math';
import { WORLD, type HomeLayout } from './types';

export interface TreeDeco { x: number; y: number; v: number; s: number }
export interface FishSpot { x: number; y: number; sx: number; sy: number; river: boolean }
export interface Herd { x: number; y: number; kind: 'grazer' | 'hunter' }
export interface FruitSpot { x: number; y: number; v: number; near: number }

export interface WorldGen {
  seed: number;
  coast: Float32Array;
  river: { x: number; y: number; w: number }[];
  home: { x: number; y: number };
  rivals: { x: number; y: number }[];
  trees: TreeDeco[];
  fruit: FruitSpot[];
  fish: FishSpot[];
  herds: Herd[];
  paths: { x: number; y: number }[][];
  /** 0 land, 1 river, 2 sea, 3 beach; GRID x GRID cells of CELL units. */
  water: Uint8Array;
  rocks: { x: number; y: number; r: number }[];
}

export const CELL = 10;
export const GRID = WORLD / CELL;
const COAST_STEP = 10;
/** Terrain bitmap resolution (pixels per world unit). */
export const TERRAIN_SCALE = 0.6;

export function coastY(w: WorldGen, x: number): number {
  const f = clamp(x, 0, WORLD) / COAST_STEP;
  const i = Math.floor(f);
  const a = w.coast[Math.min(i, w.coast.length - 1)], b = w.coast[Math.min(i + 1, w.coast.length - 1)];
  return lerp(a, b, f - i);
}

export function waterAt(w: WorldGen, x: number, y: number): number {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return cy >= GRID ? 2 : 0;
  return w.water[cy * GRID + cx];
}

/** Home village layout around its centre. */
export function homeLayout(x: number, y: number): HomeLayout {
  return {
    x, y,
    hut: { x, y: y - 40 },
    fire: { x: x + 4, y: y + 62 },
    pile: { x: x - 96, y: y + 74 },
    totem: { x: x + 92, y: y + 58 },
    pen: { x: x + 6, y: y + 214 },
    slots: [
      { x: x - 210, y: y - 20 }, { x: x - 150, y: y - 150 }, { x: x + 150, y: y - 150 },
      { x: x + 212, y: y - 20 }, { x: x - 196, y: y + 128 }, { x: x + 200, y: y + 128 },
    ],
  };
}

export function generateWorld(seed: number): WorldGen {
  const r = new RNG(seed);
  const nz = makeNoise2D(seed ^ 0x5eed);
  // ---- coast (sea along the south edge)
  const coast = new Float32Array(WORLD / COAST_STEP + 1);
  for (let i = 0; i < coast.length; i++) {
    const x = i * COAST_STEP;
    coast[i] = 1838 + nz.fbm(x * 0.0026, 3.7, 3) * 70 + nz.noise(x * 0.012, 9.1) * 16;
  }
  const w: WorldGen = {
    seed, coast, river: [], home: { x: 0, y: 0 }, rivals: [], trees: [], fruit: [], fish: [], herds: [], paths: [],
    water: new Uint8Array(GRID * GRID), rocks: [],
  };
  // ---- villages
  w.home = { x: 1000 + r.range(-60, 60), y: 1430 + r.range(-20, 20) };
  const bases = [[330, 1170], [1700, 1090], [430, 440], [1570, 380]];
  w.rivals = bases.map(([x, y]) => ({ x: x + r.range(-45, 45), y: y + r.range(-45, 45) }));

  // ---- river: NW source to the sea, kept well east of home
  const ctrl: [number, number][] = [
    [700 + r.range(-60, 60), -40], [770 + r.range(-50, 50), 300], [990 + r.range(-50, 50), 620], [1160 + r.range(-40, 40), 900],
    [1390 + r.range(-30, 30), 1150], [1430 + r.range(-20, 30), 1450], [1460 + r.range(-20, 40), 1700],
  ];
  const endX = ctrl[ctrl.length - 1][0] + 30;
  ctrl.push([endX, coastY(w, endX) + 60]);
  const pts: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const steps = 16;
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      const k = (i + t) / (ctrl.length - 1);
      pts.push({ x, y, w: 42 + k * 30 + nz.noise(x * 0.01, y * 0.01) * 8 });
    }
  }
  pts.push({ x: ctrl[ctrl.length - 1][0], y: ctrl[ctrl.length - 1][1], w: 80 });
  w.river = pts;

  // ---- water grid
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const x = (cx + 0.5) * CELL, y = (cy + 0.5) * CELL;
      const c = coastY(w, x);
      w.water[cy * GRID + cx] = y > c ? 2 : y > c - 46 ? 3 : 0;
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6);
    for (let k = 0; k <= n; k++) {
      const x = lerp(a.x, b.x, k / n), y = lerp(a.y, b.y, k / n), rad = lerp(a.w, b.w, k / n) / 2;
      const x0 = Math.floor((x - rad) / CELL), x1 = Math.floor((x + rad) / CELL);
      const y0 = Math.floor((y - rad) / CELL), y1 = Math.floor((y + rad) / CELL);
      for (let cy = Math.max(0, y0); cy <= Math.min(GRID - 1, y1); cy++) {
        for (let cx = Math.max(0, x0); cx <= Math.min(GRID - 1, x1); cx++) {
          const px = (cx + 0.5) * CELL, py = (cy + 0.5) * CELL;
          if ((px - x) ** 2 + (py - y) ** 2 <= rad * rad && w.water[cy * GRID + cx] !== 2) w.water[cy * GRID + cx] = 1;
        }
      }
    }
  }

  // ---- paths from home to each rival
  for (const v of w.rivals) {
    const mx = (w.home.x + v.x) / 2, my = (w.home.y + v.y) / 2;
    const dx = v.x - w.home.x, dy = v.y - w.home.y, l = Math.hypot(dx, dy) || 1;
    const off = r.range(-160, 160);
    const cx = mx + (-dy / l) * off, cy = my + (dx / l) * off;
    const path: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = (1 - t) ** 2 * w.home.x + 2 * (1 - t) * t * cx + t * t * v.x;
      const y = (1 - t) ** 2 * w.home.y + 2 * (1 - t) * t * cy + t * t * v.y;
      path.push({ x: x + nz.noise(x * 0.01, y * 0.01) * 14, y: y + nz.noise(y * 0.01, x * 0.01) * 14 });
    }
    w.paths.push(path);
  }

  const villages = [w.home, ...w.rivals];
  const isLand = (x: number, y: number, pad = 0) => {
    for (const [ox, oy] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
      if (waterAt(w, x + ox, y + oy) !== 0) return false;
    }
    return x > 30 && x < WORLD - 30 && y > 30;
  };
  const nearPath = (x: number, y: number, d: number) => {
    for (const p of w.paths) for (let i = 0; i < p.length - 1; i += 1) if (distToSegment({ x, y }, p[i], p[i + 1]) < d) return true;
    return false;
  };

  // ---- fruit trees
  const fruitOk = (x: number, y: number) => isLand(x, y, 24) && w.fruit.every((f) => Math.hypot(f.x - x, f.y - y) > 70);
  const homeAngles = [-2.6, -2.15, -1.7, -1.25, -0.8, -0.35, 0.15, 2.95];
  for (const a of homeAngles) {
    for (let tries = 0; tries < 12; tries++) {
      const rad = r.range(300, 370);
      const x = w.home.x + Math.cos(a + r.range(-0.12, 0.12)) * rad, y = w.home.y + Math.sin(a + r.range(-0.12, 0.12)) * rad * 0.9;
      if (fruitOk(x, y)) { w.fruit.push({ x, y, v: r.int(0, 2), near: 0 }); break; }
    }
  }
  w.rivals.forEach((v, i) => {
    let placed = 0;
    for (let tries = 0; tries < 60 && placed < 4; tries++) {
      const a = r.range(0, Math.PI * 2), rad = r.range(170, 250);
      const x = v.x + Math.cos(a) * rad, y = v.y + Math.sin(a) * rad;
      if (fruitOk(x, y) && Math.hypot(x - v.x, y - v.y - 60) > 120) { w.fruit.push({ x, y, v: r.int(0, 2), near: i + 1 }); placed++; }
    }
  });
  for (let tries = 0, placed = 0; tries < 400 && placed < 14; tries++) {
    const x = r.range(120, WORLD - 120), y = r.range(120, 1700);
    if (!fruitOk(x, y)) continue;
    if (villages.some((v) => Math.hypot(v.x - x, v.y - y) < 420)) continue;
    w.fruit.push({ x, y, v: r.int(0, 2), near: -1 });
    placed++;
  }

  // ---- fishing spots
  for (let x = 140; x < WORLD - 100; x += 200) {
    const fx = x + r.range(-50, 50);
    const c = coastY(w, fx);
    if (waterAt(w, fx, c - 14) === 1) continue;
    w.fish.push({ x: fx, y: c + 30, sx: fx, sy: c - 16, river: false });
  }
  {
    // guarantee spots close to home
    for (const dx of [-120, 140]) {
      const fx = w.home.x + dx, c = coastY(w, fx);
      if (w.fish.every((f) => Math.abs(f.x - fx) > 90)) w.fish.push({ x: fx, y: c + 30, sx: fx, sy: c - 16, river: false });
      else {
        const f = w.fish.reduce((b, f2) => (Math.abs(f2.x - fx) < Math.abs(b.x - fx) ? f2 : b));
        f.x = fx; f.y = c + 30; f.sx = fx; f.sy = c - 16;
      }
    }
  }
  for (const frac of [0.18, 0.38, 0.58, 0.76]) {
    const i = Math.floor(frac * (pts.length - 2));
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    // stand on the bank closer to home
    const side = (w.home.x - a.x) * nx + (w.home.y - a.y) * ny > 0 ? 1 : -1;
    w.fish.push({ x: a.x + nx * side * a.w * 0.12, y: a.y + ny * side * a.w * 0.12, sx: a.x + nx * side * (a.w / 2 + 14), sy: a.y + ny * side * (a.w / 2 + 14), river: true });
  }

  // ---- herds
  const herdOk = (x: number, y: number) => isLand(x, y, 40) && villages.every((v) => Math.hypot(v.x - x, v.y - y) > 360) && w.herds.every((h) => Math.hypot(h.x - x, h.y - y) > 300);
  const want: ('grazer' | 'hunter')[] = ['grazer', 'grazer', 'grazer', 'grazer', 'hunter', 'hunter', 'hunter'];
  for (const kind of want) {
    for (let tries = 0; tries < 200; tries++) {
      const x = r.range(150, WORLD - 150), y = r.range(150, 1650);
      if (!herdOk(x, y)) continue;
      // hunters prefer the far north
      if (kind === 'hunter' && y > 1100) continue;
      w.herds.push({ x, y, kind });
      break;
    }
  }

  // ---- forest trees and palms
  const treeOk = (x: number, y: number) => {
    if (!isLand(x, y, 18)) return false;
    if (Math.hypot(w.home.x - x, w.home.y - y) < 360) return false;
    if (w.rivals.some((v) => Math.hypot(v.x - x, v.y - y) < 230)) return false;
    if (w.fruit.some((f) => Math.hypot(f.x - x, f.y - y) < 50)) return false;
    if (nearPath(x, y, 34)) return false;
    return true;
  };
  for (let gy = 20; gy < 1800; gy += 44) {
    for (let gx = 20; gx < WORLD; gx += 44) {
      const x = gx + r.range(-16, 16), y = gy + r.range(-16, 16);
      const f = nz.fbm(x * 0.0024 + 11, y * 0.0024 - 7, 3);
      const edge = Math.max(0, 1 - Math.min(x, y, WORLD - x) / 150);
      const dense = f > 0.16 || (f > 0.05 && r.chance(0.35)) || r.chance(edge * 0.95) || r.chance(0.012);
      if (!dense || !treeOk(x, y)) continue;
      w.trees.push({ x, y, v: f > 0.32 || y < 400 ? (r.chance(0.6) ? 2 : r.int(0, 1)) : r.chance(0.18) ? 3 : r.int(0, 1), s: r.range(0.8, 1.25) });
    }
  }
  for (let x = 60; x < WORLD - 40; x += r.range(70, 150)) {
    const c = coastY(w, x);
    const y = c - r.range(30, 52);
    if (waterAt(w, x, y) === 1 || Math.abs(x - w.home.x) < 80) continue;
    if (r.chance(0.55)) w.trees.push({ x, y, v: 4, s: r.range(0.85, 1.15) });
  }
  for (let i = 0; i < 90; i++) {
    const x = r.range(40, WORLD - 40), y = r.range(40, 1780);
    if (!isLand(x, y, 10) || villages.some((v) => Math.hypot(v.x - x, v.y - y) < 260)) continue;
    w.rocks.push({ x, y, r: r.range(5, 13) });
  }
  return w;
}

// ------------------------------------------------------------------ terrain baking

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export const PAL = {
  lush: hex('#6fb24e'),
  light: hex('#94c65a'),
  dry: hex('#b9c062'),
  dirt: hex('#c9a46c'),
  sand: hex('#ead69c'),
  wetSand: hex('#d5bc84'),
  shallow: hex('#5fcad3'),
  deep: hex('#2a73ad'),
  river: hex('#47a5c9'),
};

export function bakeTerrain(w: WorldGen): HTMLCanvasElement {
  const nz = makeNoise2D(w.seed ^ 0x7e44);
  // 1. Soft low-res colour field.
  const lo = document.createElement('canvas');
  lo.width = GRID;
  lo.height = GRID;
  const lg = lo.getContext('2d')!;
  const img = lg.createImageData(GRID, GRID);
  const villages = [{ ...w.home, r: 290 }, ...w.rivals.map((v) => ({ ...v, r: 190 }))];
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const x = (cx + 0.5) * CELL, y = (cy + 0.5) * CELL;
      const wt = w.water[cy * GRID + cx];
      let c: [number, number, number];
      if (wt === 2) {
        const depth = clamp((y - coastY(w, x)) / 150, 0, 1);
        c = mixRgb(PAL.shallow, PAL.deep, depth);
      } else if (wt === 1) {
        c = PAL.river;
      } else if (wt === 3) {
        c = mixRgb(PAL.sand, PAL.wetSand, clamp(1 - (coastY(w, x) - y) / 46, 0, 1));
      } else {
        const g1 = nz.fbm(x * 0.004, y * 0.004, 3) * 0.5 + 0.5;
        const dry = smoothstep(0.1, 0.5, nz.fbm(x * 0.0016 + 40, y * 0.0016, 2));
        c = mixRgb(PAL.lush, PAL.light, clamp(g1, 0, 1));
        c = mixRgb(c, PAL.dry, dry * 0.7);
        for (const v of villages) {
          const d = Math.hypot((x - v.x) / 1.15, y - v.y);
          if (d < v.r) c = mixRgb(c, PAL.dirt, smoothstep(v.r, v.r * 0.55, d) * 0.85);
        }
        // sandy fringe near water
        if (y > coastY(w, x) - 90) c = mixRgb(c, PAL.sand, smoothstep(coastY(w, x) - 90, coastY(w, x) - 46, y) * 0.6);
      }
      const k = (cy * GRID + cx) * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = 255;
    }
  }
  lg.putImageData(img, 0, 0);
  const S = Math.round(WORLD * TERRAIN_SCALE);
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(lo, 0, 0, S, S);
  g.scale(TERRAIN_SCALE, TERRAIN_SCALE);
  const r = new RNG(w.seed ^ 0xbeef);

  // 2. Crisp sea + beach.
  const coastPath = (off: number) => {
    const p = new Path2D();
    p.moveTo(-10, coastY(w, 0) + off);
    for (let x = 0; x <= WORLD; x += 10) p.lineTo(x, coastY(w, x) + off);
    p.lineTo(WORLD + 10, WORLD + 10);
    p.lineTo(-10, WORLD + 10);
    p.closePath();
    return p;
  };
  g.fillStyle = 'rgba(234,214,156,0.85)';
  g.fill(coastPath(-40));
  g.fillStyle = 'rgba(213,188,132,0.9)';
  g.fill(coastPath(-12));
  const sea = g.createLinearGradient(0, 1760, 0, WORLD);
  sea.addColorStop(0, '#62cdd4');
  sea.addColorStop(0.35, '#3c97c4');
  sea.addColorStop(1, '#22629c');
  g.fillStyle = sea;
  g.fill(coastPath(0));
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 3;
  g.stroke(coastPath(1));

  // 3. Paths.
  for (const p of w.paths) {
    const path = new Path2D();
    p.forEach((q, i) => (i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y)));
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(150,112,62,0.35)';
    g.lineWidth = 30;
    g.stroke(path);
    g.strokeStyle = 'rgba(214,176,118,0.9)';
    g.lineWidth = 20;
    g.stroke(path);
    g.fillStyle = 'rgba(120,90,50,0.35)';
    for (let i = 0; i < p.length; i++) {
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        g.arc(p[i].x + r.range(-8, 8), p[i].y + r.range(-8, 8), r.range(1, 2.4), 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // 4. River with banks.
  const rp = new Path2D();
  w.river.forEach((q, i) => (i ? rp.lineTo(q.x, q.y) : rp.moveTo(q.x, q.y)));
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 0; i < w.river.length - 1; i++) {
    const a = w.river[i], b = w.river[i + 1];
    g.strokeStyle = 'rgba(196,174,116,0.95)';
    g.lineWidth = a.w + 18;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  for (let i = 0; i < w.river.length - 1; i++) {
    const a = w.river[i], b = w.river[i + 1];
    g.strokeStyle = '#3f9dc4';
    g.lineWidth = a.w;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  for (let i = 0; i < w.river.length - 1; i++) {
    const a = w.river[i], b = w.river[i + 1];
    g.strokeStyle = 'rgba(110,200,228,0.55)';
    g.lineWidth = a.w * 0.45;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }

  // 5. Village clearings: trodden rings.
  for (const v of [w.home, ...w.rivals]) {
    const rr = v === w.home ? 250 : 165;
    g.strokeStyle = 'rgba(140,100,55,0.18)';
    g.lineWidth = 10;
    g.beginPath();
    g.ellipse(v.x, v.y + 20, rr * 1.1, rr * 0.92, 0, 0, Math.PI * 2);
    g.stroke();
  }

  // 6. Grass tufts, flowers, rocks (batched into a few paths).
  const tuftCols = ['rgba(60,120,40,0.55)', 'rgba(150,200,90,0.55)', 'rgba(95,150,55,0.5)'];
  const tufts = tuftCols.map(() => new Path2D());
  for (let i = 0; i < 9000; i++) {
    const x = r.range(0, WORLD), y = r.range(0, WORLD);
    if (waterAt(w, x, y) !== 0) continue;
    if (Math.hypot(x - w.home.x, y - w.home.y) < 200) continue;
    const p = tufts[i % 3], s = r.range(3, 6);
    p.moveTo(x - s * 0.6, y - s);
    p.lineTo(x, y);
    p.lineTo(x + s * 0.6, y - s);
    p.moveTo(x, y);
    p.lineTo(x + 0.1, y - s * 1.2);
  }
  g.lineWidth = 1.4;
  g.lineCap = 'round';
  tufts.forEach((p, i) => { g.strokeStyle = tuftCols[i]; g.stroke(p); });
  const flowerCols = ['#ffffff', '#ffe066', '#ff8fb8', '#c49bff', '#ff7a59'];
  for (let i = 0; i < 420; i++) {
    const x = r.range(0, WORLD), y = r.range(0, 1800);
    if (waterAt(w, x, y) !== 0 || Math.hypot(x - w.home.x, y - w.home.y) < 230) continue;
    g.fillStyle = r.pick(flowerCols);
    const n = r.int(3, 6);
    for (let k = 0; k < n; k++) {
      g.beginPath();
      g.arc(x + r.range(-9, 9), y + r.range(-6, 6), r.range(1.4, 2.4), 0, Math.PI * 2);
      g.fill();
    }
  }
  // Forest floor shade.
  g.fillStyle = 'rgba(30,70,30,0.13)';
  for (const t of w.trees) {
    if (t.v === 4) continue;
    g.beginPath();
    g.ellipse(t.x, t.y + 4, 34 * t.s, 20 * t.s, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (const k of w.rocks) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(k.x + 2, k.y + 3, k.r * 1.1, k.r * 0.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8f949a';
    g.strokeStyle = '#4f5359';
    g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(k.x, k.y, k.r, k.r * 0.7, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(k.x - k.r * 0.3, k.y - k.r * 0.3, k.r * 0.4, k.r * 0.2, -0.3, 0, Math.PI * 2); g.fill();
  }
  // Pebbles and footprints in the home clearing.
  g.fillStyle = 'rgba(110,80,45,0.3)';
  for (let i = 0; i < 160; i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(40, 250);
    g.beginPath();
    g.arc(w.home.x + Math.cos(a) * d * 1.1, w.home.y + Math.sin(a) * d * 0.9, r.range(1, 2.6), 0, Math.PI * 2);
    g.fill();
  }
  void dist;
  return cv;
}
