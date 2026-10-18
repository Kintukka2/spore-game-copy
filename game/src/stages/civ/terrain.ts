// Planet terrain: wrapped noise continents, a baked colour map, vector coastlines,
// decorations (forests, mountains, waves) and a coarse navigation grid with A*.
import { RNG, makeNoise2D, hash2 } from '../../engine/rng';
import { clamp, smoothstep } from '../../engine/math';
import { H, W, wdx, wrapX, type Medium } from './types';

const G = 16; // height grid spacing
const COLS = W / G;
const ROWS = H / G;
export const NAV = 32; // nav grid spacing
export const NCOLS = W / NAV;
export const NROWS = H / NAV;
const TEX = 0.5; // texture px per world unit

export interface Deco { x: number; y: number; s: number; v: number; snow?: boolean }

export class Terrain {
  h = new Float32Array(COLS * ROWS);
  moist = new Float32Array(COLS * ROWS);
  rough = new Float32Array(COLS * ROWS);
  sea = 0;
  hMax = 1;
  hMin = 0;
  tex!: HTMLCanvasElement;
  mini!: HTMLCanvasElement;
  coast = new Path2D();
  shelf = new Path2D();
  trees: Deco[] = [];
  mountains: Deco[] = [];
  waves: Deco[] = [];
  /** Nav grid: 1 = land, 0 = water. */
  land = new Uint8Array(NCOLS * NROWS);
  compLand = new Int16Array(NCOLS * NROWS);
  compWater = new Int16Array(NCOLS * NROWS);
  compSize: Map<number, number> = new Map();
  /** Land cells: distance (in nav cells) to the nearest water cell. */
  coastDist = new Uint8Array(NCOLS * NROWS);
  // A* scratch
  private gs = new Float32Array(NCOLS * NROWS);
  private from = new Int32Array(NCOLS * NROWS);
  private stamp = new Uint32Array(NCOLS * NROWS);
  private closed = new Uint32Array(NCOLS * NROWS);
  private stampN = 1;
  private heap: number[] = [];
  private heapF: number[] = [];

  constructor(seed: number) {
    this.generate(seed);
  }

  // ------------------------------------------------------------------ generation
  private generate(seed: number) {
    const r = new RNG(seed);
    const nA = makeNoise2D(r.seedInt());
    const nB = makeNoise2D(r.seedInt());
    const nC = makeNoise2D(r.seedInt());
    const wrapped = (fbm: (x: number, y: number, o?: number) => number, x: number, y: number, s: number, oct: number) => {
      const t = x / W;
      const a = fbm(x * s, y * s, oct), b = fbm((x - W) * s, y * s, oct);
      return (a * (1 - t) + b * t) / Math.sqrt(t * t + (1 - t) * (1 - t));
    };
    // Continent blobs: one big home continent plus 3-4 others and a few islands.
    interface Blob { x: number; y: number; rx: number; ry: number; s: number }
    const blobs: Blob[] = [];
    const nCont = r.chance(0.5) ? 5 : 4;
    const x0 = r.range(0, W);
    for (let i = 0; i < nCont; i++) {
      const cx = wrapX(x0 + (i + r.range(-0.08, 0.08)) * (W / nCont) + (i === 0 ? 0 : (W / nCont) * 0.12));
      const cy = H * (0.5 + r.range(-0.13, 0.13));
      const big = i === 0;
      const rx = big ? r.range(380, 420) : r.range(210, nCont === 5 ? 270 : 300);
      const ry = big ? r.range(300, 340) : r.range(190, 270);
      const k = r.int(3, 5);
      for (let j = 0; j < k; j++) {
        blobs.push({ x: cx + r.range(-0.4, 0.4) * rx, y: cy + r.range(-0.35, 0.35) * ry, rx: rx * r.range(0.5, 0.75), ry: ry * r.range(0.5, 0.75), s: r.range(0.75, 1.0) });
      }
      blobs.push({ x: cx, y: cy, rx: rx * 0.75, ry: ry * 0.75, s: 0.95 });
    }
    for (let i = 0; i < 5; i++) blobs.push({ x: r.range(0, W), y: H * r.range(0.22, 0.78), rx: r.range(55, 110), ry: r.range(50, 95), s: r.range(0.6, 0.9) });
    this.homeX = blobs[0].x;
    this.homeY = blobs[0].y;
    const hh = this.h;
    for (let j = 0; j < ROWS; j++) {
      const y = j * G;
      for (let i = 0; i < COLS; i++) {
        const x = i * G;
        let b = 0;
        for (const bl of blobs) {
          const dx = wdx(bl.x, x) / bl.rx, dy = (y - bl.y) / bl.ry;
          const d2 = dx * dx + dy * dy;
          if (d2 < 9) b += bl.s * Math.exp(-d2 * 1.6);
        }
        b = 1.25 * (1 - Math.exp(-b * 1.1));
        const ridge = 1 - Math.abs(wrapped(nC.fbm, x + 917, y + 331, 1 / 300, 4));
        const rough = smoothstep(0.74, 0.93, ridge) * smoothstep(0.45, 0.85, b);
        let v = b + 0.3 * wrapped(nA.fbm, x, y, 1 / 380, 5) + 0.08 * wrapped(nC.fbm, x, y, 1 / 90, 3) + 0.2 * rough;
        const pole = Math.min(y, H - y);
        v -= (1 - smoothstep(60, 330, pole)) * 0.9;
        hh[j * COLS + i] = v;
        this.rough[j * COLS + i] = rough;
        this.moist[j * COLS + i] = wrapped(nB.fbm, x, y, 1 / 300, 4);
      }
    }
    // Sea level: ~35% land.
    const sorted = Array.from(hh).sort((a, b) => a - b);
    this.sea = sorted[Math.floor(sorted.length * 0.65)];
    this.hMax = sorted[sorted.length - 1];
    this.hMin = sorted[0];
    this.buildNav();
    this.buildCoast();
    this.buildDecor(r);
    this.bake(nC);
  }
  homeX = 0;
  homeY = 0;

  /** Bilinear height at a world point. */
  heightAt(x: number, y: number): number {
    const fx = wrapX(x) / G, fy = clamp(y / G, 0, ROWS - 1.001);
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const tx = fx - i0, ty = fy - j0;
    const i1 = (i0 + 1) % COLS, j1 = Math.min(ROWS - 1, j0 + 1);
    const a = this.h[j0 * COLS + (i0 % COLS)], b = this.h[j0 * COLS + i1], c = this.h[j1 * COLS + (i0 % COLS)], d = this.h[j1 * COLS + i1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  private bil(arr: Float32Array, x: number, y: number): number {
    const fx = wrapX(x) / G, fy = clamp(y / G, 0, ROWS - 1.001);
    const i0 = Math.floor(fx) % COLS, j0 = Math.floor(fy);
    const tx = fx - Math.floor(fx), ty = fy - j0;
    const i1 = (i0 + 1) % COLS, j1 = Math.min(ROWS - 1, j0 + 1);
    return (arr[j0 * COLS + i0] * (1 - tx) + arr[j0 * COLS + i1] * tx) * (1 - ty) + (arr[j1 * COLS + i0] * (1 - tx) + arr[j1 * COLS + i1] * tx) * ty;
  }
  moistAt(x: number, y: number): number {
    return this.bil(this.moist, x, y);
  }
  /** 0..1 mountain-range mask (ridges inside continents). */
  mtnAt(x: number, y: number): number {
    return this.bil(this.rough, x, y) * smoothstep(0.0, 0.1, this.elev(x, y));
  }
  isLand(x: number, y: number): boolean {
    return this.heightAt(x, y) > this.sea;
  }
  /** 0..1 elevation above sea level (land only). */
  elev(x: number, y: number): number {
    return (this.heightAt(x, y) - this.sea) / (this.hMax - this.sea);
  }

  // ------------------------------------------------------------------ nav grid
  cell(x: number, y: number): number {
    const i = Math.floor(wrapX(x) / NAV) % NCOLS;
    const j = clamp(Math.floor(y / NAV), 0, NROWS - 1);
    return j * NCOLS + i;
  }
  cellX(c: number): number { return (c % NCOLS) * NAV + NAV / 2; }
  cellY(c: number): number { return Math.floor(c / NCOLS) * NAV + NAV / 2; }

  private buildNav() {
    for (let j = 0; j < NROWS; j++) for (let i = 0; i < NCOLS; i++) {
      const x = i * NAV + NAV / 2, y = j * NAV + NAV / 2;
      const pole = Math.min(y, H - y);
      this.land[j * NCOLS + i] = this.isLand(x, y) && pole > 70 ? 1 : 0;
    }
    const label = (want: number, out: Int16Array) => {
      out.fill(-1);
      let id = 0;
      const q: number[] = [];
      for (let c = 0; c < out.length; c++) {
        if (out[c] !== -1 || this.land[c] !== want) continue;
        const myId = want ? id : 1000 + id;
        id++;
        out[c] = myId;
        q.length = 0;
        q.push(c);
        let n = 0;
        while (q.length) {
          const k = q.pop()!;
          n++;
          const ki = k % NCOLS, kj = Math.floor(k / NCOLS);
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const nj = kj + dj;
            if (nj < 0 || nj >= NROWS) continue;
            const ni = (ki + di + NCOLS) % NCOLS;
            const nc = nj * NCOLS + ni;
            if (out[nc] === -1 && this.land[nc] === want) { out[nc] = myId; q.push(nc); }
          }
        }
        this.compSize.set(myId, n);
      }
    };
    label(1, this.compLand);
    label(0, this.compWater);
    // Distance from coast (BFS from water cells).
    this.coastDist.fill(255);
    const q: number[] = [];
    for (let c = 0; c < this.land.length; c++) if (!this.land[c]) { this.coastDist[c] = 0; q.push(c); }
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      const ki = k % NCOLS, kj = Math.floor(k / NCOLS);
      const d = this.coastDist[k];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [di, dj] of nb) {
        const nj = kj + dj;
        if (nj < 0 || nj >= NROWS) continue;
        const nc = nj * NCOLS + ((ki + di + NCOLS) % NCOLS);
        if (this.coastDist[nc] > d + 1) { this.coastDist[nc] = d + 1; q.push(nc); }
      }
    }
  }

  passable(medium: Medium, c: number): boolean {
    if (medium === 'air') return true;
    return medium === 'land' ? this.land[c] === 1 : this.land[c] === 0;
  }
  comp(medium: Medium, c: number): number {
    if (medium === 'air') return 0;
    return medium === 'land' ? this.compLand[c] : this.compWater[c];
  }
  canStand(medium: Medium, x: number, y: number): boolean {
    if (medium === 'air') return y > 20 && y < H - 20;
    return this.passable(medium, this.cell(x, y));
  }

  /** Nearest passable cell to c (optionally inside component `comp`), searching rings up to maxR. */
  nearest(medium: Medium, c: number, comp = -999, maxR = 14): number {
    const ok = (k: number) => this.passable(medium, k) && (comp === -999 || this.comp(medium, k) === comp);
    if (ok(c)) return c;
    const ci = c % NCOLS, cj = Math.floor(c / NCOLS);
    for (let rr = 1; rr <= maxR; rr++) {
      let best = -1, bd = Infinity;
      for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== rr) continue;
        const nj = cj + dj;
        if (nj < 0 || nj >= NROWS) continue;
        const k = nj * NCOLS + ((ci + di + NCOLS * 4) % NCOLS);
        if (!ok(k)) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  private los(medium: Medium, ax: number, ay: number, bx: number, by: number): boolean {
    const dx = wdx(ax, bx), dy = by - ay;
    const l = Math.hypot(dx, dy);
    const n = Math.ceil(l / (NAV * 0.4));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!this.passable(medium, this.cell(ax + dx * t, ay + dy * t))) return false;
    }
    return true;
  }

  /**
   * Path from (sx,sy) toward (tx,ty) for the given medium. If the target is unreachable, the path ends at the
   * closest reachable cell near it (within a search radius); returns null when nothing is reachable at all.
   */
  path(medium: Medium, sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
    if (medium === 'air') return [{ x: wrapX(tx), y: clamp(ty, 30, H - 30) }];
    let s = this.cell(sx, sy);
    if (!this.passable(medium, s)) s = this.nearest(medium, s);
    if (s < 0) return null;
    const comp = this.comp(medium, s);
    let t = this.cell(tx, ty);
    const exact = this.passable(medium, t) && this.comp(medium, t) === comp;
    if (!exact) t = this.nearest(medium, t, comp, 16);
    if (t < 0) return null;
    const cells = this.astar(medium, s, t);
    if (!cells) return null;
    const pts = cells.map((c) => ({ x: this.cellX(c), y: this.cellY(c) }));
    if (exact) pts[pts.length - 1] = { x: wrapX(tx), y: ty };
    // String pulling.
    const out: { x: number; y: number }[] = [];
    let cx = sx, cy = sy, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.los(medium, cx, cy, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      cx = pts[j].x; cy = pts[j].y;
      i = j + 1;
    }
    return out;
  }

  private astar(medium: Medium, s: number, t: number): number[] | null {
    if (s === t) return [t];
    const stamp = ++this.stampN;
    const gs = this.gs, from = this.from, st = this.stamp, cl = this.closed;
    const heap = this.heap, hf = this.heapF;
    heap.length = 0; hf.length = 0;
    const ti = t % NCOLS, tj = Math.floor(t / NCOLS);
    const hfn = (c: number) => {
      let di = Math.abs((c % NCOLS) - ti); di = Math.min(di, NCOLS - di);
      const dj = Math.abs(Math.floor(c / NCOLS) - tj);
      return Math.max(di, dj) + 0.414 * Math.min(di, dj);
    };
    const push = (c: number, f: number) => {
      heap.push(c); hf.push(f);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hf[p] <= hf[k]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]];
        k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const lc = heap.pop()!, lf = hf.pop()!;
      if (heap.length) {
        heap[0] = lc; hf[0] = lf;
        let k = 0;
        for (;;) {
          const a = 2 * k + 1, b = a + 1;
          let m = k;
          if (a < heap.length && hf[a] < hf[m]) m = a;
          if (b < heap.length && hf[b] < hf[m]) m = b;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]];
          k = m;
        }
      }
      return top;
    };
    st[s] = stamp; gs[s] = 0; from[s] = -1;
    push(s, hfn(s));
    let iter = 0;
    while (heap.length && iter++ < 20000) {
      const c = pop();
      if (cl[c] === stamp) continue;
      cl[c] = stamp;
      if (c === t) {
        const out: number[] = [];
        let k = c;
        while (k !== -1) { out.push(k); k = from[k]; }
        return out.reverse();
      }
      const ci = c % NCOLS, cj = Math.floor(c / NCOLS);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const nj = cj + dj;
        if (nj < 0 || nj >= NROWS) continue;
        const ni = (ci + di + NCOLS) % NCOLS;
        const nc = nj * NCOLS + ni;
        if (!this.passable(medium, nc) || cl[nc] === stamp) continue;
        if (di && dj) {
          // No corner cutting.
          if (!this.passable(medium, cj * NCOLS + ni) || !this.passable(medium, nj * NCOLS + ci)) continue;
        }
        const g2 = gs[c] + (di && dj ? 1.414 : 1);
        if (st[nc] !== stamp || g2 < gs[nc]) {
          st[nc] = stamp; gs[nc] = g2; from[nc] = c;
          push(nc, g2 + hfn(nc));
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ coastlines
  private contour(level: number, path: Path2D) {
    const v = (i: number, j: number) => this.h[j * COLS + (i % COLS)] - level;
    for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS; i++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
      const idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = i * G, y = j * G;
      const top = () => [x + G * (a / (a - b)), y] as const;
      const right = () => [x + G, y + G * (b / (b - c))] as const;
      const bottom = () => [x + G * (d / (d - c)), y + G] as const;
      const left = () => [x, y + G * (a / (a - d))] as const;
      const seg = (p: readonly [number, number], q: readonly [number, number]) => { path.moveTo(p[0], p[1]); path.lineTo(q[0], q[1]); };
      switch (idx) {
        case 1: case 14: seg(left(), bottom()); break;
        case 2: case 13: seg(bottom(), right()); break;
        case 3: case 12: seg(left(), right()); break;
        case 4: case 11: seg(top(), right()); break;
        case 5: seg(left(), top()); seg(bottom(), right()); break;
        case 6: case 9: seg(top(), bottom()); break;
        case 7: case 8: seg(left(), top()); break;
        case 10: seg(top(), right()); seg(left(), bottom()); break;
      }
    }
  }
  private buildCoast() {
    this.contour(this.sea, this.coast);
    this.contour(this.sea - (this.sea - this.hMin) * 0.12, this.shelf);
  }

  // ------------------------------------------------------------------ decorations
  private buildDecor(r: RNG) {
    const T = 42;
    for (let y = 120; y < H - 120; y += T) for (let x = 0; x < W; x += T) {
      const px = x + r.range(0, T), py = y + r.range(0, T);
      const h = this.heightAt(px, py);
      if (h <= this.sea) continue;
      const e = this.elev(px, py);
      const m = this.moistAt(px, py);
      const mt = this.mtnAt(px, py);
      if (mt > 0.45 && r.chance(0.55 + mt * 0.4)) {
        this.mountains.push({ x: px, y: py, s: 0.7 + mt * 0.55 + r.range(-0.1, 0.12), v: r.int(0, 2), snow: mt > 0.8 });
      } else if (e > 0.03 && mt < 0.3 && m > -0.02 && r.chance(0.3 + m * 1.2)) {
        this.trees.push({ x: px, y: py, s: r.range(0.75, 1.2), v: r.int(0, 3) });
      }
    }
    for (let i = 0; i < 260; i++) {
      const x = r.range(0, W), y = r.range(150, H - 150);
      if (this.heightAt(x, y) < this.sea - (this.sea - this.hMin) * 0.05) this.waves.push({ x, y, s: r.range(0.7, 1.3), v: r.range(0, 10) });
    }
    this.mountains.sort((a, b) => a.y - b.y);
    this.trees.sort((a, b) => a.y - b.y);
  }

  /** Remove decorations within `rad` of a point (cities, geysers). */
  clearDecor(x: number, y: number, rad: number) {
    const keep = (d: Deco) => Math.hypot(wdx(x, d.x), d.y - y) > rad;
    this.trees = this.trees.filter(keep);
    this.mountains = this.mountains.filter(keep);
  }

  // ------------------------------------------------------------------ colour map
  private bake(nC: ReturnType<typeof makeNoise2D>) {
    const tw = Math.round(W * TEX), th = Math.round(H * TEX);
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const g = c.getContext('2d')!;
    const img = g.createImageData(tw, th);
    const d = img.data;
    const sea = this.sea, landSpan = this.hMax - sea, waterSpan = sea - this.hMin;
    // Precompute per-node hillshade.
    const shade = new Float32Array(COLS * ROWS);
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const hx = this.h[j * COLS + ((i + 1) % COLS)] - this.h[j * COLS + ((i - 1 + COLS) % COLS)];
      const hy = this.h[Math.min(ROWS - 1, j + 1) * COLS + i] - this.h[Math.max(0, j - 1) * COLS + i];
      shade[j * COLS + i] = clamp(0.5 - (hx + hy) * 2.6, 0, 1);
    }
    const shadeAt = (x: number, y: number) => {
      const fx = x / G, fy = clamp(y / G, 0, ROWS - 1.001);
      const i0 = Math.floor(fx) % COLS, j0 = Math.floor(fy);
      const tx = fx - Math.floor(fx), ty = fy - j0;
      const i1 = (i0 + 1) % COLS, j1 = Math.min(ROWS - 1, j0 + 1);
      return (shade[j0 * COLS + i0] * (1 - tx) + shade[j0 * COLS + i1] * tx) * (1 - ty) + (shade[j1 * COLS + i0] * (1 - tx) + shade[j1 * COLS + i1] * tx) * ty;
    };
    const mixc = (a: number[], b: number[], t: number, o: number[]) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; };
    const SAND = [236, 222, 168], GRASS_D = [143, 196, 104], GRASS_W = [104, 172, 92], FOREST = [78, 140, 78], SAV = [214, 198, 128];
    const HILL = [168, 172, 118], ROCK = [156, 144, 128], SNOW = [246, 246, 242];
    const SHALLOW = [112, 196, 214], DEEP = [30, 82, 138], FOAM = [196, 236, 240], ICE = [234, 244, 250];
    const col = [0, 0, 0], tmp = [0, 0, 0];
    for (let py = 0; py < th; py++) {
      const y = (py + 0.5) / TEX;
      for (let px = 0; px < tw; px++) {
        const x = (px + 0.5) / TEX;
        const hv = this.heightAt(x, y);
        const s = shadeAt(x, y);
        if (hv > sea) {
          const e = (hv - sea) / landSpan;
          const m = this.moistAt(x, y);
          const m01 = clamp(m * 1.6 + 0.5, 0, 1);
          mixc(GRASS_D, GRASS_W, m01, col);
          if (m < -0.12) { mixc(col, SAV, clamp((-0.12 - m) * 4, 0, 0.8), tmp); col[0] = tmp[0]; col[1] = tmp[1]; col[2] = tmp[2]; }
          if (m > 0.05 && e < 0.45) { mixc(col, FOREST, clamp((m - 0.05) * 3, 0, 0.55), tmp); col[0] = tmp[0]; col[1] = tmp[1]; col[2] = tmp[2]; }
          const mt = this.bil(this.rough, x, y) * smoothstep(0.0, 0.1, e);
          if (mt > 0.1) { mixc(col, HILL, smoothstep(0.1, 0.4, mt), tmp); col[0] = tmp[0]; col[1] = tmp[1]; col[2] = tmp[2]; }
          if (mt > 0.4) { mixc(col, ROCK, smoothstep(0.4, 0.7, mt), tmp); col[0] = tmp[0]; col[1] = tmp[1]; col[2] = tmp[2]; }
          if (mt > 0.8) { mixc(col, SNOW, smoothstep(0.8, 0.95, mt), tmp); col[0] = tmp[0]; col[1] = tmp[1]; col[2] = tmp[2]; }
          if (e < 0.035) { mixc(col, SAND, 1 - smoothstep(0.02, 0.035, e), tmp); col[0] = tmp[0]; col[1] = tmp[1]; col[2] = tmp[2]; }
          const k = 0.78 + s * 0.42;
          col[0] *= k; col[1] *= k; col[2] *= k;
        } else {
          const dd = (sea - hv) / waterSpan;
          mixc(SHALLOW, DEEP, smoothstep(0.0, 0.45, dd), col);
          if (dd < 0.03) { mixc(col, FOAM, 1 - dd / 0.03, tmp); col[0] = tmp[0]; col[1] = tmp[1]; col[2] = tmp[2]; }
          const k = 0.94 + s * 0.12;
          col[0] *= k; col[1] *= k; col[2] *= k;
        }
        // Polar ice.
        const pole = Math.min(y, H - y);
        const ang = (x / W) * Math.PI * 2;
        const iceEdge = 120 + nC.noise(Math.cos(ang) * 4.2 + (y > H / 2 ? 9 : 0), Math.sin(ang) * 4.2) * 60;
        if (pole < iceEdge + 10) { mixc(col, ICE, clamp((iceEdge + 10 - pole) / 14, 0, 1), tmp); col[0] = tmp[0]; col[1] = tmp[1]; col[2] = tmp[2]; }
        const n = (hash2(px, py, 7) - 0.5) * 7;
        const o = (py * tw + px) * 4;
        d[o] = col[0] + n; d[o + 1] = col[1] + n; d[o + 2] = col[2] + n; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.tex = c;
    const m = document.createElement('canvas');
    m.width = 200; m.height = Math.round(200 * H / W);
    const mg = m.getContext('2d')!;
    mg.imageSmoothingQuality = 'high';
    mg.drawImage(c, 0, 0, m.width, m.height);
    this.mini = m;
  }
}
