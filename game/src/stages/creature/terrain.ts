// Terrain rendering: lazily built, cached ground chunks (1 px per world unit) plus live layers
// drawn every frame — animated shore foam, water sparkles, and swaying grass tufts and flowers.
import { makeNoise2D, RNG } from '../../engine/rng';
import { clamp, smoothstep, TAU } from '../../engine/math';
import type { Camera } from '../../engine/camera';
import { CHUNK, WORLD_SIZE } from './config';
import { H_DEEP, H_GRASS, T_GRASS, T_ROCK, T_SAND, T_SHALLOW, T_DEEP, type World } from './world';

interface Chunk {
  key: number;
  ci: number;
  cj: number;
  canvas: HTMLCanvasElement;
  /** x, y, height, phase, colour index */
  tufts: Float32Array;
  /** x, y, colour index, phase */
  flowers: Float32Array;
  /** x, y, phase */
  sparkles: Float32Array;
  used: number;
}

type RGB = [number, number, number];
const C: Record<string, RGB> = {
  deep0: [18, 74, 118], deep1: [30, 112, 160],
  shal0: [44, 150, 186], shal1: [112, 212, 206],
  wet: [208, 184, 122], sand0: [236, 212, 148], sand1: [247, 231, 174],
  grassLo: [160, 210, 96], meadow: [122, 196, 72], lush: [88, 170, 60], forest: [62, 140, 54],
  high: [128, 172, 92], rock: [164, 160, 146],
};
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const OCEAN = 'rgb(18,74,118)';
const TUFT_COLS = ['#5fae3f', '#77c24b', '#4c9a36'];
const FLOWER_COLS = ['#ffffff', '#ffd23f', '#ff7eb6', '#b48cff', '#ff9f43'];
const MAX_CHUNKS = 52;
/** Shore foam: a breathing line at the waterline plus one wave rolling in. */
const WAVES = [
  { base: 2.5, amp: 2.2, speed: 1.6, alpha: 0.85, width: 2.6, moving: false, ph: 0 },
  { base: 0, amp: 0, speed: 0.25, alpha: 0.55, width: 2.2, moving: true, ph: 0 },
];

export class TerrainRenderer {
  private chunks = new Map<number, Chunk>();
  private noise: ReturnType<typeof makeNoise2D>;
  private frame = 0;
  private tmp: HTMLCanvasElement;
  private tmpG: CanvasRenderingContext2D;
  private img: ImageData;

  constructor(private world: World) {
    this.noise = makeNoise2D(world.seed ^ 0x7777);
    this.tmp = document.createElement('canvas');
    this.tmp.width = CHUNK / 2;
    this.tmp.height = CHUNK / 2;
    this.tmpG = this.tmp.getContext('2d')!;
    this.img = this.tmpG.createImageData(CHUNK / 2, CHUNK / 2);
  }

  groundColor(h: number, m: number, v: number, sh: number): RGB {
    let c: RGB;
    if (h < H_DEEP) c = mixc(C.deep0, C.deep1, clamp((h + 0.22) / (H_DEEP + 0.22), 0, 1) ** 1.5);
    else if (h < 0) c = mixc(C.shal0, C.shal1, Math.pow((h - H_DEEP) / -H_DEEP, 1.4));
    else if (h < H_GRASS) {
      const t = h / H_GRASS;
      c = t < 0.22 ? mixc(C.wet, C.sand0, t / 0.22) : mixc(C.sand0, C.sand1, (t - 0.22) / 0.78);
      if (t > 0.8) c = mixc(c, C.grassLo, (t - 0.8) / 0.2 * 0.55);
      sh *= 0.5;
    } else {
      c = mixc(C.meadow, C.lush, smoothstep(0.42, 0.68, m));
      c = mixc(c, C.forest, smoothstep(0.62, 0.84, m));
      if (h < 0.09) c = mixc(C.grassLo, c, (h - H_GRASS) / (0.09 - H_GRASS));
      c = mixc(c, C.high, smoothstep(0.4, 0.6, h) * 0.8);
      if (h > 0.6) c = mixc(c, C.rock, smoothstep(0.6, 0.7, h));
    }
    const k = 1 + v * 0.07 + sh;
    return [c[0] * k, c[1] * k, c[2] * k];
  }

  private build(ci: number, cj: number): Chunk {
    const w = this.world, nz = this.noise;
    const S = CHUNK / 2;
    const data = this.img.data;
    const x0 = ci * CHUNK, y0 = cj * CHUNK;
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        const x = x0 + u * 2 + 1, y = y0 + v * 2 + 1;
        const h = w.hAt(x, y);
        const m = w.mAt(x, y);
        const vv = nz.noise(x / 34, y / 34) * 0.7 + nz.noise(x / 9, y / 9) * 0.3;
        const sh = clamp((w.hAt(x - 7, y - 7) - w.hAt(x + 7, y + 7)) * 5.5, -0.12, 0.12);
        const c = this.groundColor(h, m, vv, h < 0 ? sh * 0.3 : sh);
        const k = (v * S + u) * 4;
        data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
      }
    }
    this.tmpG.putImageData(this.img, 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = CHUNK; canvas.height = CHUNK;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.tmp, 0, 0, CHUNK, CHUNK);
    // Baked detail strokes.
    const r = new RNG((ci * 7919 + cj * 104729 + w.seed) >>> 0);
    g.lineCap = 'round';
    const tufts: number[] = [], flowers: number[] = [], sparkles: number[] = [];
    for (let k = 0; k < 260; k++) {
      const lx = r.range(0, CHUNK), ly = r.range(0, CHUNK);
      const x = x0 + lx, y = y0 + ly;
      const t = w.typeAt(x, y);
      if (t === T_GRASS) {
        g.strokeStyle = r.chance(0.5) ? 'rgba(40,90,25,0.28)' : 'rgba(200,240,140,0.22)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(lx, ly); g.lineTo(lx - 1.5, ly - 4);
        g.moveTo(lx + 2, ly); g.lineTo(lx + 2.5, ly - 5);
        g.stroke();
      } else if (t === T_SAND) {
        if (r.chance(0.35)) {
          g.strokeStyle = 'rgba(255,250,225,0.45)';
          g.lineWidth = 1.2;
          g.beginPath(); g.arc(lx, ly + 6, 7, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
        } else if (r.chance(0.25)) {
          g.fillStyle = r.chance(0.5) ? 'rgba(255,255,255,0.7)' : 'rgba(200,120,110,0.6)';
          g.beginPath(); g.ellipse(lx, ly, 1.8, 1.2, r.range(0, 3), 0, TAU); g.fill();
        }
      } else if (t === T_ROCK) {
        g.fillStyle = r.chance(0.5) ? 'rgba(90,90,80,0.35)' : 'rgba(230,230,215,0.3)';
        g.beginPath(); g.ellipse(lx, ly, r.range(1.5, 4), r.range(1, 2.5), 0, 0, TAU); g.fill();
      } else if (t === T_DEEP) {
        if (r.chance(0.3)) {
          g.strokeStyle = 'rgba(120,190,230,0.18)';
          g.lineWidth = 1.5;
          g.beginPath(); g.arc(lx, ly, 9, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        }
      }
      // Live layers.
      if (t === T_GRASS && k % 4 === 0) tufts.push(x, y, r.range(6, 11), r.range(0, TAU), r.int(0, 2));
      if (t === T_GRASS && k % 13 === 0 && w.hAt(x, y) < 0.5) flowers.push(x, y, r.int(0, FLOWER_COLS.length - 1), r.range(0, TAU));
      if ((t === T_SHALLOW || t === T_DEEP) && k % 6 === 0) sparkles.push(x, y, r.range(0, TAU));
    }
    return { key: ci + cj * 1000, ci, cj, canvas, tufts: new Float32Array(tufts), flowers: new Float32Array(flowers), sparkles: new Float32Array(sparkles), used: this.frame };
  }

  private visibleRange(cam: Camera, margin = 0) {
    const b = cam.bounds(margin);
    const max = Math.ceil(WORLD_SIZE / CHUNK) - 1;
    return {
      i0: clamp(Math.floor(b.x0 / CHUNK), 0, max), i1: clamp(Math.floor(b.x1 / CHUNK), 0, max),
      j0: clamp(Math.floor(b.y0 / CHUNK), 0, max), j1: clamp(Math.floor(b.y1 / CHUNK), 0, max),
    };
  }

  /** Make sure every visible chunk exists (call once before the first frame). */
  warm(cam: Camera) {
    const v = this.visibleRange(cam, 64);
    for (let j = v.j0; j <= v.j1; j++) for (let i = v.i0; i <= v.i1; i++) this.get(i, j, true);
  }

  private budget = 0;
  private get(i: number, j: number, force = false): Chunk | null {
    const key = i + j * 1000;
    let c = this.chunks.get(key);
    if (!c) {
      if (!force && this.budget <= 0) return null;
      this.budget--;
      c = this.build(i, j);
      this.chunks.set(key, c);
      if (this.chunks.size > MAX_CHUNKS) {
        let oldest: Chunk | null = null;
        for (const ch of this.chunks.values()) if (!oldest || ch.used < oldest.used) oldest = ch;
        if (oldest) this.chunks.delete(oldest.key);
      }
    }
    c.used = this.frame;
    return c;
  }

  /** Draw the ground (inside camera transform). */
  drawGround(g: CanvasRenderingContext2D, cam: Camera) {
    this.frame++;
    this.budget = 2;
    const v = this.visibleRange(cam, 24);
    for (let j = v.j0; j <= v.j1; j++) {
      for (let i = v.i0; i <= v.i1; i++) {
        const c = this.get(i, j);
        if (c) g.drawImage(c.canvas, i * CHUNK, j * CHUNK, CHUNK + 0.6, CHUNK + 0.6);
        else {
          const h = this.world.hAt((i + 0.5) * CHUNK, (j + 0.5) * CHUNK);
          const col = this.groundColor(h, 0.5, 0, 0);
          g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
          g.fillRect(i * CHUNK, j * CHUNK, CHUNK + 0.6, CHUNK + 0.6);
        }
      }
    }
    // Prefetch one ring beyond the view while there is budget left.
    if (this.budget > 0) {
      const p = this.visibleRange(cam, CHUNK);
      for (let j = p.j0; j <= p.j1 && this.budget > 0; j++) for (let i = p.i0; i <= p.i1 && this.budget > 0; i++) {
        if (!this.chunks.has(i + j * 1000)) this.get(i, j);
      }
    }
  }

  /** Animated shoreline foam and water sparkles (inside camera transform). */
  drawWater(g: CanvasRenderingContext2D, cam: Camera, t: number) {
    const v = this.visibleRange(cam, 40);
    g.lineCap = 'round';
    for (const wv of WAVES) {
      let off = wv.base;
      let alpha = wv.alpha;
      if (wv.moving) {
        const p = (t * wv.speed + wv.ph) % 1;
        off = 4 + (1 - p) * 26;
        alpha = Math.sin(p * Math.PI) * wv.alpha;
      }
      if (alpha < 0.03) continue;
      g.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      g.lineWidth = wv.width;
      g.beginPath();
      for (let j = v.j0; j <= v.j1; j++) for (let i = v.i0; i <= v.i1; i++) {
        const seg = this.world.foam.get(i + j * 1000);
        if (!seg) continue;
        for (let k = 0; k < seg.length; k += 6) {
          const x1 = seg[k], y1 = seg[k + 1], x2 = seg[k + 2], y2 = seg[k + 3], nx = seg[k + 4], ny = seg[k + 5];
          const o = off + (wv.moving ? 0 : Math.sin(t * wv.speed + x1 * 0.045 + y1 * 0.03) * wv.amp) + Math.sin(x1 * 0.02 + y1 * 0.017) * 2;
          g.moveTo(x1 + nx * o, y1 + ny * o);
          g.lineTo(x2 + nx * o, y2 + ny * o);
        }
      }
      g.stroke();
    }
    // Sparkles.
    g.fillStyle = '#ffffff';
    for (let j = v.j0; j <= v.j1; j++) for (let i = v.i0; i <= v.i1; i++) {
      const c = this.chunks.get(i + j * 1000);
      if (!c) continue;
      const s = c.sparkles;
      for (let k = 0; k < s.length; k += 3) {
        const a = Math.sin(t * 1.7 + s[k + 2]);
        if (a < 0.55) continue;
        const x = s[k] + Math.sin(t * 0.6 + s[k + 2]) * 4, y = s[k + 1];
        g.globalAlpha = (a - 0.55) / 0.45 * 0.8;
        g.fillRect(x - 3, y - 0.7, 6, 1.4);
        g.fillRect(x - 0.7, y - 2, 1.4, 4);
      }
    }
    g.globalAlpha = 1;
  }

  /** Swaying grass tufts and flowers (inside camera transform). */
  drawFlora(g: CanvasRenderingContext2D, cam: Camera, t: number, wind: number, tufts = true) {
    if (cam.zoom < 0.45) return;
    const v = this.visibleRange(cam, 20);
    const b = cam.bounds(20);
    g.lineCap = 'round';
    g.lineWidth = 1.7;
    for (let ci = 0; tufts && ci < TUFT_COLS.length; ci++) {
      g.strokeStyle = TUFT_COLS[ci];
      g.beginPath();
      for (let j = v.j0; j <= v.j1; j++) for (let i = v.i0; i <= v.i1; i++) {
        const c = this.chunks.get(i + j * 1000);
        if (!c) continue;
        const a = c.tufts;
        for (let k = 0; k < a.length; k += 5) {
          if (a[k + 4] !== ci) continue;
          const x = a[k], y = a[k + 1];
          if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
          const hh = a[k + 2];
          const sw = Math.sin(t * 1.9 + x * 0.021 + y * 0.013 + a[k + 3] * 0.3) * wind * hh * 0.35;
          g.moveTo(x - 3, y); g.lineTo(x - 5 + sw, y - hh * 0.85);
          g.moveTo(x, y); g.lineTo(x + sw * 1.2, y - hh);
          g.moveTo(x + 3, y); g.lineTo(x + 5 + sw, y - hh * 0.8);
        }
      }
      g.stroke();
    }
    // Flowers: petals per colour, then centres.
    for (let ci = 0; ci < FLOWER_COLS.length; ci++) {
      g.fillStyle = FLOWER_COLS[ci];
      g.beginPath();
      for (let j = v.j0; j <= v.j1; j++) for (let i = v.i0; i <= v.i1; i++) {
        const c = this.chunks.get(i + j * 1000);
        if (!c) continue;
        const a = c.flowers;
        for (let k = 0; k < a.length; k += 4) {
          if (a[k + 2] !== ci) continue;
          const x0 = a[k], y0 = a[k + 1];
          if (x0 < b.x0 || x0 > b.x1 || y0 < b.y0 || y0 > b.y1) continue;
          const x = x0 + Math.sin(t * 1.7 + a[k + 3]) * wind * 1.6, y = y0 - 5;
          for (let p = 0; p < 5; p++) {
            const ang = (p / 5) * TAU + a[k + 3];
            const px = x + Math.cos(ang) * 2.3, py = y + Math.sin(ang) * 2.3;
            g.moveTo(px + 1.9, py);
            g.arc(px, py, 1.9, 0, TAU);
          }
        }
      }
      g.fill();
    }
    g.fillStyle = '#ffcf33';
    g.beginPath();
    for (let j = v.j0; j <= v.j1; j++) for (let i = v.i0; i <= v.i1; i++) {
      const c = this.chunks.get(i + j * 1000);
      if (!c) continue;
      const a = c.flowers;
      for (let k = 0; k < a.length; k += 4) {
        const x0 = a[k], y0 = a[k + 1];
        if (x0 < b.x0 || x0 > b.x1 || y0 < b.y0 || y0 > b.y1) continue;
        const x = x0 + Math.sin(t * 1.7 + a[k + 3]) * wind * 1.6, y = y0 - 5;
        g.moveTo(x + 1.5, y);
        g.arc(x, y, 1.5, 0, TAU);
      }
    }
    g.fill();
  }

  /** Small top-down island image for the minimap. */
  minimapImage(px: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d')!;
    const img = g.createImageData(px, px);
    const w = this.world;
    for (let v = 0; v < px; v++) for (let u = 0; u < px; u++) {
      const x = ((u + 0.5) / px) * WORLD_SIZE, y = ((v + 0.5) / px) * WORLD_SIZE;
      const h = w.hAt(x, y);
      const col = this.groundColor(h, w.mAt(x, y), 0, 0);
      const k = (v * px + u) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

export { T_SHALLOW, T_DEEP };
