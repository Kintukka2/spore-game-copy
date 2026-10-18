// Procedural island: perlin height + moisture fields, terrain classes, vegetation and
// placement of the home beach, migration sites, nests, Titan lairs and bone piles.
import { RNG, makeNoise2D } from '../../engine/rng';
import { clamp, smoothstep } from '../../engine/math';
import { CHUNK, GRID, WORLD_SIZE } from './config';
import type { Bush, Obstacle, Rock, Tree } from './types';

export const T_DEEP = 0, T_SHALLOW = 1, T_SAND = 2, T_GRASS = 3, T_ROCK = 4;
export const H_DEEP = -0.05, H_SAND = 0, H_GRASS = 0.055, H_ROCK = 0.6;

export interface Spot { x: number; y: number }
export interface NestSpot extends Spot { group: number }
export interface BoneSpot extends Spot { size: number }

const OBST_CELL = 128;
export const BERRIES = ['#ff3d6e', '#ff8c2e', '#b5179e', '#ffd23f', '#6c5ce7'];

export class World {
  readonly size = WORLD_SIZE;
  readonly n = Math.floor(WORLD_SIZE / GRID) + 1;
  readonly h: Float32Array;
  readonly m: Float32Array;
  readonly cx = WORLD_SIZE / 2;
  readonly cy = WORLD_SIZE / 2;
  readonly R = 1250;
  readonly seed: number;
  trees: Tree[] = [];
  bushes: Bush[] = [];
  rocks: Rock[] = [];
  /** Shoreline segments bucketed by chunk: [x1,y1,x2,y2,nx,ny,...] with the normal pointing to water. */
  foam = new Map<number, number[]>();
  home: Spot = { x: 0, y: 0 };
  shore: Spot = { x: 0, y: 0 };
  sea: Spot = { x: 0, y: 0 };
  mig: Spot[] = [];
  nestSpots: NestSpot[] = [];
  titanSpots: Spot[] = [];
  lonerSpots: Spot[] = [];
  boneSpots: BoneSpot[] = [];
  private obst = new Map<number, Obstacle[]>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const n = this.n;
    this.h = new Float32Array(n * n);
    this.m = new Float32Array(n * n);
    const nz = makeNoise2D(seed), nm = makeNoise2D(seed ^ 0x51ed27), nl = makeNoise2D(seed ^ 0x9e3779);
    const { cx, cy, R } = this;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = i * GRID, y = j * GRID;
        const dx = (x - cx) / R, dy = (y - cy) / R;
        const d = Math.sqrt(dx * dx + dy * dy);
        const dd = d + nz.fbm(x / 520 + 11.3, y / 520 - 4.1, 3) * 0.22;
        const base = 0.62 * (1 - smoothstep(0.5, 1.06, dd)) - 0.14 * smoothstep(0.98, 1.25, dd);
        const coastCalm = 1 - smoothstep(0.75, 1.0, dd) * 0.6;
        const hills = (nz.fbm(x / 640, y / 640, 4) * 0.24 + nz.noise(x / 160 + 3.3, y / 160 + 7.7) * 0.05) * coastCalm;
        let hh = base + hills - 0.07;
        if (dd < 0.72) {
          const lk = nl.fbm(x / 380, y / 380, 3);
          if (lk > 0.36) hh = Math.max(-0.044, Math.min(hh, 0.07 - (lk - 0.36) * 0.9));
        }
        this.h[j * n + i] = hh;
        this.m[j * n + i] = clamp(nm.fbm(x / 420, y / 420, 3) * 0.75 + 0.5, 0, 1);
      }
    }
    const r = new RNG(seed ^ 0xc0ffee);
    this.placeSites(r);
    this.placeVegetation(r);
    this.buildFoam();
  }

  // ------------------------------------------------------------------ queries
  hAt(x: number, y: number): number {
    const n = this.n;
    const fx = clamp(x / GRID, 0, n - 1.001), fy = clamp(y / GRID, 0, n - 1.001);
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * n + i;
    const a = this.h[k], b = this.h[k + 1], c = this.h[k + n], d = this.h[k + n + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  mAt(x: number, y: number): number {
    const n = this.n;
    const fx = clamp(x / GRID, 0, n - 1.001), fy = clamp(y / GRID, 0, n - 1.001);
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * n + i;
    const a = this.m[k], b = this.m[k + 1], c = this.m[k + n], d = this.m[k + n + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  typeAt(x: number, y: number): number {
    const h = this.hAt(x, y);
    if (h < H_DEEP) return T_DEEP;
    if (h < H_SAND) return T_SHALLOW;
    if (h < H_GRASS) return T_SAND;
    if (h < H_ROCK) return T_GRASS;
    return T_ROCK;
  }
  isLand(x: number, y: number): boolean {
    return this.hAt(x, y) >= H_SAND;
  }
  /** A site where every sample in a ring is comfortably on grass. */
  goodSite(x: number, y: number, rad: number): boolean {
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const px = k === 8 ? x : x + Math.cos(a) * rad, py = k === 8 ? y : y + Math.sin(a) * rad;
      const hh = this.hAt(px, py);
      if (hh < 0.075 || hh > 0.58) return false;
    }
    return true;
  }
  /** Nearest point on land (spiral search). */
  nearestLand(x: number, y: number): Spot {
    if (this.hAt(x, y) >= 0.06) return { x, y };
    for (let rad = 16; rad < 1600; rad += 16) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (this.hAt(px, py) >= 0.06) return { x: px, y: py };
      }
    }
    return { x: this.cx, y: this.cy };
  }
  private snapSite(x: number, y: number, rad: number): Spot {
    if (this.goodSite(x, y, rad)) return { x, y };
    for (let s = 20; s < 900; s += 20) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + s * 0.01;
        const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s;
        if (this.goodSite(px, py, rad)) return { x: px, y: py };
      }
    }
    return this.nearestLand(x, y);
  }

  // ------------------------------------------------------------------ obstacles
  private addObstacle(o: Obstacle) {
    const k = Math.floor(o.x / OBST_CELL) + Math.floor(o.y / OBST_CELL) * 1000;
    let a = this.obst.get(k);
    if (!a) { a = []; this.obst.set(k, a); }
    a.push(o);
  }
  /** Push a circle out of trees and rocks. Returns true if it collided. */
  pushOut(p: { x: number; y: number }, rad: number): boolean {
    const ci = Math.floor(p.x / OBST_CELL), cj = Math.floor(p.y / OBST_CELL);
    let hit = false;
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const a = this.obst.get(i + j * 1000);
        if (!a) continue;
        for (const o of a) {
          const dx = p.x - o.x, dy = p.y - o.y;
          const min = o.r + rad;
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            p.x = o.x + (dx / d) * min;
            p.y = o.y + (dy / d) * min;
            hit = true;
          }
        }
      }
    }
    return hit;
  }

  // ------------------------------------------------------------------ placement
  private placeSites(r: RNG) {
    const { cx, cy } = this;
    // Home beach: march in from the sea toward the centre along a southern bearing.
    const ang = Math.PI / 2 + r.range(-0.75, 0.75);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let s = 1550;
    while (s > 100 && this.hAt(cx + dx * s, cy + dy * s) < H_SAND) s -= 4;
    this.shore = { x: cx + dx * s, y: cy + dy * s };
    this.sea = { x: cx + dx * (s + 70), y: cy + dy * (s + 70) };
    let hs = s;
    while (hs > 100 && this.hAt(cx + dx * hs, cy + dy * hs) < 0.13) hs -= 6;
    this.home = this.snapSite(cx + dx * (hs - 70), cy + dy * (hs - 70), 70);
    // Migration sites lead inland.
    const toC = Math.atan2(cy - this.home.y, cx - this.home.x);
    const a1 = toC + r.range(-0.5, 0.5);
    const m1 = this.snapSite(this.home.x + Math.cos(a1) * 640, this.home.y + Math.sin(a1) * 640, 70);
    const a2 = a1 + r.range(-0.7, 0.7);
    const m2 = this.snapSite(m1.x + Math.cos(a2) * 620, m1.y + Math.sin(a2) * 620, 70);
    this.mig = [m1, m2];
    const fixed: Spot[] = [this.home, m1, m2];
    const far = (p: Spot, list: Spot[], d: number) => list.every((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 >= d * d);
    // Species nests (Poisson-ish).
    const spots: Spot[] = [];
    for (let pass = 0; pass < 3 && spots.length < 10; pass++) {
      const minD = [380, 320, 260][pass];
      for (let tries = 0; tries < 1400 && spots.length < 10; tries++) {
        const a = r.range(0, Math.PI * 2), rr = Math.sqrt(r.next()) * this.R * 0.9;
        const p = { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
        if (!this.goodSite(p.x, p.y, 70)) continue;
        if (!far(p, spots, minD) || !far(p, [this.home], 340) || !far(p, [m1, m2], 270)) continue;
        spots.push(p);
      }
    }
    const tagged: NestSpot[] = spots.map((p) => ({ ...p, group: 0 }));
    const dHome = (p: Spot) => Math.hypot(p.x - this.home.x, p.y - this.home.y);
    const byM1 = tagged.filter((p) => dHome(p) > 480).sort((a, b) => Math.hypot(a.x - m1.x, a.y - m1.y) - Math.hypot(b.x - m1.x, b.y - m1.y));
    byM1.slice(0, 2).forEach((p) => (p.group = 1));
    const byM2 = tagged.filter((p) => p.group === 0 && dHome(p) > 700).sort((a, b) => Math.hypot(a.x - m2.x, a.y - m2.y) - Math.hypot(b.x - m2.x, b.y - m2.y));
    if (byM2[0]) byM2[0].group = 2;
    this.nestSpots = tagged;
    // Titan lairs: far from home.
    const cands: Spot[] = [];
    for (let tries = 0; tries < 600; tries++) {
      const a = r.range(0, Math.PI * 2), rr = Math.sqrt(r.next()) * this.R * 0.85;
      const p = { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
      if (this.goodSite(p.x, p.y, 110) && far(p, spots, 260) && far(p, fixed, 420)) cands.push(p);
    }
    cands.sort((a, b) => dHome(b) - dHome(a));
    for (const c of cands) {
      if (this.titanSpots.length >= 2) break;
      if (far(c, this.titanSpots, 750)) this.titanSpots.push(c);
    }
    // Loner haunts: mid distance.
    for (let tries = 0; tries < 800 && this.lonerSpots.length < 2; tries++) {
      const a = r.range(0, Math.PI * 2), rr = Math.sqrt(r.next()) * this.R * 0.85;
      const p = { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
      const dh = dHome(p);
      if (dh < 600 || dh > 1500 || !this.goodSite(p.x, p.y, 60) || !far(p, spots, 220) || !far(p, this.lonerSpots, 600)) continue;
      this.lonerSpots.push(p);
    }
    // Bone piles: big ones near Titans and far nests, small ones anywhere.
    const avoid = [...spots, ...fixed];
    const bones: BoneSpot[] = [];
    const tryBone = (p: Spot, size: number) => {
      if (!this.goodSite(p.x, p.y, 30) || !far(p, avoid, 130) || !far(p, bones, 210)) return false;
      bones.push({ ...p, size });
      return true;
    };
    for (const t of this.titanSpots) {
      for (let k = 0; k < 40; k++) if (tryBone({ x: t.x + r.range(-170, 170), y: t.y + r.range(-170, 170) }, 3)) break;
    }
    const farNests = [...tagged].sort((a, b) => dHome(b) - dHome(a)).slice(0, 2);
    for (const t of farNests) {
      for (let k = 0; k < 40; k++) if (tryBone({ x: t.x + r.range(-220, 220), y: t.y + r.range(-220, 220) }, 3)) break;
    }
    // A starter pile close to home so players discover the mechanic early.
    for (let k = 0; k < 60; k++) {
      const a = r.range(0, Math.PI * 2), rr = r.range(230, 380);
      if (tryBone({ x: this.home.x + Math.cos(a) * rr, y: this.home.y + Math.sin(a) * rr }, 1)) break;
    }
    for (let tries = 0; tries < 2000 && bones.length < 15; tries++) {
      const a = r.range(0, Math.PI * 2), rr = Math.sqrt(r.next()) * this.R * 0.9;
      const p = { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
      const size = dHome(p) > 1100 ? (r.chance(0.5) ? 2 : 3) : dHome(p) > 600 ? (r.chance(0.6) ? 2 : 1) : 1;
      tryBone(p, size);
    }
    this.boneSpots = bones;
  }

  private placeVegetation(r: RNG) {
    const keep: { p: Spot; d: number }[] = [
      { p: this.home, d: 120 }, { p: this.mig[0], d: 120 }, { p: this.mig[1], d: 120 },
      { p: this.shore, d: 150 }, { p: this.sea, d: 140 },
      ...this.nestSpots.map((p) => ({ p, d: 115 })),
      ...this.titanSpots.map((p) => ({ p, d: 150 })),
      ...this.boneSpots.map((p) => ({ p, d: 60 })),
    ];
    // Keep the beach-to-nest path clear for the landfall walk.
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      keep.push({ p: { x: this.shore.x + (this.home.x - this.shore.x) * t, y: this.shore.y + (this.home.y - this.shore.y) * t }, d: 80 });
    }
    const clear = (x: number, y: number) => keep.every((k) => (k.p.x - x) ** 2 + (k.p.y - y) ** 2 > k.d * k.d);
    const lo = this.cx - this.R * 1.15, hi = this.cx + this.R * 1.15;
    // Trees.
    for (let y = lo; y < hi; y += 62) {
      for (let x = lo; x < hi; x += 62) {
        const px = x + r.range(-26, 26), py = y + r.range(-26, 26);
        const t = this.typeAt(px, py);
        const hh = this.hAt(px, py);
        const m = this.mAt(px, py);
        let p = 0;
        let kind = 0;
        if (t === T_GRASS) {
          const forest = smoothstep(0.55, 0.75, m);
          p = 0.035 + forest * 0.62;
          kind = hh > 0.42 && r.chance(0.6) ? 4 + r.int(0, 1) : r.int(0, 3);
          if (hh < 0.09) p *= 0.3;
        } else if (t === T_SAND && hh > 0.012) {
          p = 0.06;
          kind = 6;
        } else if (t === T_ROCK) {
          p = 0.07;
          kind = 4 + r.int(0, 1);
        }
        if (p <= 0 || !r.chance(p) || !clear(px, py)) continue;
        const s = r.range(0.8, 1.25);
        const tree: Tree = { x: px, y: py, kind, s, r: (kind === 6 ? 6 : 9) * s, ph: r.range(0, 6.28) };
        this.trees.push(tree);
        this.addObstacle({ x: px, y: py, r: tree.r });
      }
    }
    // Bushes with fruit.
    let bid = 0;
    for (let y = lo; y < hi; y += 88) {
      for (let x = lo; x < hi; x += 88) {
        const px = x + r.range(-36, 36), py = y + r.range(-36, 36);
        const t = this.typeAt(px, py);
        if (t !== T_GRASS) continue;
        const m = this.mAt(px, py);
        const p = 0.13 + smoothstep(0.45, 0.7, m) * 0.14;
        if (!r.chance(p) || !clear(px, py)) continue;
        this.addBush(r, px, py, bid++);
      }
    }
    // Guarantee food around the home nest.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + r.range(-0.3, 0.3), rr = r.range(150, 260);
      const px = this.home.x + Math.cos(a) * rr, py = this.home.y + Math.sin(a) * rr;
      if (this.typeAt(px, py) === T_GRASS) this.addBush(r, px, py, bid++, true);
    }
    // Rocks.
    for (let y = lo; y < hi; y += 104) {
      for (let x = lo; x < hi; x += 104) {
        const px = x + r.range(-44, 44), py = y + r.range(-44, 44);
        const t = this.typeAt(px, py);
        const p = t === T_ROCK ? 0.34 : t === T_GRASS ? 0.045 : t === T_SAND ? 0.05 : 0;
        if (!p || !r.chance(p) || !clear(px, py)) continue;
        const s = t === T_SAND ? r.range(0.45, 0.8) : r.range(0.6, 1.45);
        const rock: Rock = { x: px, y: py, kind: r.int(0, 5), s, r: 15 * s };
        this.rocks.push(rock);
        this.addObstacle({ x: px, y: py, r: rock.r });
      }
    }
  }

  private addBush(r: RNG, x: number, y: number, id: number, fruity = false) {
    const max = fruity ? r.int(3, 4) : r.int(2, 4);
    const region = Math.floor((x / 900) + (y / 700)) % BERRIES.length;
    this.bushes.push({ id, x, y, kind: r.int(0, 2), s: r.range(0.8, 1.2), fruit: fruity || r.chance(0.75) ? max : 0, max, regrow: r.range(0, 20), berry: BERRIES[(region + BERRIES.length) % BERRIES.length] });
  }

  /** Marching squares on h = 0 to get shoreline segments for animated foam. */
  private buildFoam() {
    const n = this.n, h = this.h;
    const pts: number[] = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i + 1], d = h[(j + 1) * n + i];
        const code = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
        if (code === 0 || code === 15) continue;
        pts.length = 0;
        if ((a > 0) !== (b > 0)) pts.push((i + a / (a - b)) * GRID, j * GRID);
        if ((b > 0) !== (c > 0)) pts.push((i + 1) * GRID, (j + b / (b - c)) * GRID);
        if ((d > 0) !== (c > 0)) pts.push((i + d / (d - c)) * GRID, (j + 1) * GRID);
        if ((a > 0) !== (d > 0)) pts.push(i * GRID, (j + a / (a - d)) * GRID);
        const gx = (b + c - a - d) / 2, gy = (d + c - a - b) / 2;
        const gl = Math.hypot(gx, gy) || 1;
        const nx = -gx / gl, ny = -gy / gl;
        for (let k = 0; k + 3 < pts.length; k += 4) {
          const mx = (pts[k] + pts[k + 2]) / 2, my = (pts[k + 1] + pts[k + 3]) / 2;
          const key = Math.floor(mx / CHUNK) + Math.floor(my / CHUNK) * 1000;
          let arr = this.foam.get(key);
          if (!arr) { arr = []; this.foam.set(key, arr); }
          arr.push(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], nx, ny);
        }
      }
    }
  }

  /** A random point on comfortable land (used for respawns and spawns). */
  randomLand(r: RNG, near: Spot, minR: number, maxR: number): Spot {
    for (let k = 0; k < 60; k++) {
      const a = r.range(0, Math.PI * 2), rr = r.range(minR, maxR);
      const x = near.x + Math.cos(a) * rr, y = near.y + Math.sin(a) * rr;
      const hh = this.hAt(x, y);
      if (hh > 0.07 && hh < 0.62) return { x, y };
    }
    return this.nearestLand(near.x, near.y);
  }
}
