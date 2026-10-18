// Planets as shaded spheres: procedural equirectangular textures (fbm noise per planet style)
// projected onto a rotating sphere with a per-size lookup table, plus lighting, atmosphere,
// rings and city lights drawn as overlays.
import { makeNoise2D } from '../../../engine/rng';
import { TAU, clamp } from '../../../engine/math';
import { hexToRgb } from '../../../design/color';
import { canvas } from './sprites';

const TW = 128, TH = 64;

export type PlanetStyle = 'terran' | 'barren' | 'lava' | 'ice' | 'toxic' | 'gas' | 'hollow' | 'rubble';

export interface PlanetLook {
  seed: number;
  style: PlanetStyle;
  /** T-score (terran detail) */
  t: number;
  atm: number;
  temp: number;
  hue: number;
}

export function styleFor(kind: 'rocky' | 'gas', t: number, atm: number, temp: number, hollow: boolean, destroyed: boolean): PlanetStyle {
  if (destroyed) return 'rubble';
  if (kind === 'gas') return 'gas';
  if (hollow) return 'hollow';
  if (t >= 1) return 'terran';
  if (temp > 0.72) return 'lava';
  if (temp < 0.25) return 'ice';
  if (atm > 0.75) return 'toxic';
  return 'barren';
}

/** Atmosphere glow colour for a look. */
export function atmColor(l: PlanetLook): string {
  switch (l.style) {
    case 'terran': return l.temp < 0.4 ? '#9fd8ff' : '#7cc4ff';
    case 'lava': return '#ff8a4c';
    case 'ice': return '#cfe8ff';
    case 'toxic': return '#d8e05a';
    case 'gas': return `hsl(${l.hue},70%,70%)`;
    case 'hollow': return '#ff4a5a';
    default: return '#c9c3b6';
  }
}

type RGB = [number, number, number];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function hslRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const texCache = new Map<string, Uint8ClampedArray>();

function texKey(l: PlanetLook) {
  return `${l.seed}:${l.style}:${l.t}:${Math.round(l.atm * 10)}:${Math.round(l.temp * 10)}`;
}

/** RGBA texture (TW×TH, equirectangular) for a planet look. */
export function texture(l: PlanetLook): Uint8ClampedArray {
  const key = texKey(l);
  let tex = texCache.get(key);
  if (tex) return tex;
  if (texCache.size > 120) texCache.clear();
  tex = new Uint8ClampedArray(TW * TH * 4);
  const N = makeNoise2D(l.seed);
  const N2 = makeNoise2D(l.seed ^ 0x9e37);
  const hue = l.hue;
  // Palettes
  const vegH = 70 + (hue % 110);
  const seaDeep = hslRgb(205 + (hue % 30), 0.65, 0.22), seaShallow = hslRgb(195 + (hue % 30), 0.6, 0.4);
  const sand = hslRgb(38 + (hue % 14), 0.45, 0.62), rock = hslRgb(25 + (hue % 20), 0.22, 0.38);
  const veg = hslRgb(vegH, 0.5, 0.36), vegLight = hslRgb(vegH + 15, 0.5, 0.48);
  const ice: RGB = [232, 242, 252];
  const seaLevel = [0, -0.12, 0.0, 0.06][l.t] ?? 0;
  const vegAmt = [0, 0.25, 0.6, 0.95][l.t] ?? 0;
  for (let v = 0; v < TH; v++) {
    const lat = (v / (TH - 1) - 0.5) * Math.PI;
    const la = Math.abs(lat) / (Math.PI / 2);
    for (let u = 0; u < TW; u++) {
      const lon = (u / TW) * TAU;
      const cx = Math.cos(lon), sy = Math.sin(lon);
      const e = N.fbm(cx * 1.2 + 3.1, sy * 1.2 + lat * 1.3, 5) * 0.75 + N2.fbm(cx * 2.4 - 7, lat * 2.4 + sy * 2.2, 3) * 0.35;
      let c: RGB;
      switch (l.style) {
        case 'terran': {
          if (e < seaLevel) {
            c = lerp3(seaDeep, seaShallow, clamp((e - seaLevel + 0.35) / 0.35, 0, 1));
          } else {
            const hgt = clamp((e - seaLevel) / 0.5, 0, 1);
            const moist = N2.fbm(cx * 1.6 + 11, sy * 1.6 - lat, 3) * 0.5 + 0.5;
            const warm = clamp(l.temp + (0.5 - la) * 0.3, 0, 1);
            let land = lerp3(sand, rock, hgt);
            const vg = clamp(vegAmt * (moist * 1.4 - 0.1) - (warm > 0.7 ? (warm - 0.7) * 2 : 0), 0, 1);
            land = lerp3(land, lerp3(veg, vegLight, moist), vg);
            if (hgt > 0.75) land = lerp3(land, [220, 220, 225], (hgt - 0.75) * 2);
            c = land;
          }
          const capLat = 0.95 - (1 - l.temp) * 0.45;
          if (la > capLat + e * 0.08) c = lerp3(c, ice, clamp((la - capLat) * 8, 0, 1));
          break;
        }
        case 'barren': {
          const base = lerp3(hslRgb(30 + (hue % 30), 0.12, 0.3), hslRgb(30 + (hue % 30), 0.15, 0.6), clamp(e * 0.8 + 0.5, 0, 1));
          const crater = N2.noise(cx * 6 + sy * 2, lat * 7) ;
          c = crater > 0.42 ? lerp3(base, [40, 36, 34], 0.5) : crater > 0.36 ? lerp3(base, [235, 228, 215], 0.35) : base;
          break;
        }
        case 'lava': {
          const crack = 1 - Math.abs(N2.fbm(cx * 3, lat * 3 + sy * 3, 3));
          c = lerp3([42, 28, 26], [70, 46, 40], clamp(e + 0.5, 0, 1));
          if (crack > 0.86) c = lerp3(c, [255, 120 + (crack - 0.86) * 900, 40], clamp((crack - 0.86) * 9, 0, 1));
          break;
        }
        case 'ice': {
          c = lerp3([168, 198, 228], [242, 248, 255], clamp(e + 0.55, 0, 1));
          const crack = 1 - Math.abs(N2.fbm(cx * 4, lat * 4 + sy * 4, 2));
          if (crack > 0.93) c = lerp3(c, [90, 140, 200], 0.6);
          break;
        }
        case 'toxic': {
          const swirl = Math.sin(lat * 7 + N.fbm(cx * 2, sy * 2 + lat, 3) * 4);
          c = lerp3(hslRgb(58 + (hue % 30), 0.5, 0.35), hslRgb(75 + (hue % 30), 0.55, 0.55), swirl * 0.5 + 0.5);
          break;
        }
        case 'gas': {
          const b = Math.sin(lat * (7 + (hue % 5)) + N.fbm(cx * 1.4, lat * 2.6 + sy * 1.4, 4) * 2.6);
          const c1 = hslRgb(hue, 0.55, 0.62), c2 = hslRgb(hue + 25, 0.5, 0.42), c3 = hslRgb(hue - 30, 0.4, 0.75);
          c = b > 0.3 ? lerp3(c1, c3, (b - 0.3) / 0.7) : lerp3(c2, c1, (b + 1) / 1.3);
          const storm = N2.noise(cx * 3 + 40, lat * 5);
          if (storm > 0.55) c = lerp3(c, hslRgb(hue + 180, 0.4, 0.7), clamp((storm - 0.55) * 4, 0, 0.7));
          break;
        }
        case 'hollow': {
          c = lerp3([44, 47, 56], [86, 92, 106], clamp(e + 0.5, 0, 1));
          const gu = (u / TW) * 24, gv = (v / TH) * 12;
          const line = Math.min(Math.abs(gu - Math.round(gu)), Math.abs(gv - Math.round(gv)));
          if (line < 0.07 && N2.noise(Math.round(gu) * 0.7, Math.round(gv) * 0.7 + lon) > -0.1) c = [255, 60, 74];
          break;
        }
        default: {
          c = lerp3([60, 30, 24], [120, 70, 50], clamp(e + 0.5, 0, 1));
          if (N2.noise(cx * 5, lat * 5) > 0.3) c = [255, 110, 40];
        }
      }
      // Clouds
      if (l.style === 'terran' || l.style === 'toxic') {
        const cl = N2.fbm(cx * 2.2 + 50, lat * 3.2 + sy * 2.2, 4);
        const amt = clamp((cl - 0.12) * 2.4, 0, 1) * clamp(l.atm * 1.3, 0, 0.85);
        if (amt > 0) c = lerp3(c, l.style === 'toxic' ? [220, 215, 140] : [250, 252, 255], amt);
      }
      const i = (v * TW + u) * 4;
      tex[i] = c[0]; tex[i + 1] = c[1]; tex[i + 2] = c[2]; tex[i + 3] = 255;
    }
  }
  texCache.set(key, tex);
  return tex;
}

// ------------------------------------------------------------------ sphere projection
interface Lut { S: number; idx: Int32Array; u: Float32Array; v: Float32Array; shade: Float32Array; n: number }
const luts = new Map<number, Lut>();

function lut(S: number): Lut {
  let L = luts.get(S);
  if (L) return L;
  const idx = new Int32Array(S * S), u = new Float32Array(S * S), v = new Float32Array(S * S), shade = new Float32Array(S * S);
  let n = 0;
  const r = S / 2;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const nx = (px + 0.5 - r) / r, ny = (py + 0.5 - r) / r;
    const d2 = nx * nx + ny * ny;
    if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2);
    const lat = Math.asin(ny), lon = Math.atan2(nx, nz);
    idx[n] = (py * S + px) * 4;
    u[n] = (lon / TAU) * TW;
    v[n] = Math.min(TH - 1.001, Math.max(0, (lat / Math.PI + 0.5) * TH - 0.5));
    // Edge anti-aliasing via alpha, limb darkening via shade.
    shade[n] = 0.62 + 0.38 * Math.pow(nz, 0.6);
    n++;
  }
  L = { S, idx, u, v, shade, n };
  luts.set(S, L);
  return L;
}

/** A planet's rotating sphere image at a given pixel size. */
export class SphereSprite {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private img: ImageData;
  private lastRot = -1;
  private lastKey = '';
  constructor(readonly S: number) {
    this.canvas = canvas(S, S);
    this.g = this.canvas.getContext('2d')!;
    this.img = this.g.createImageData(S, S);
  }
  /** Re-render if the look or rotation (0..1 turns) changed noticeably. */
  update(l: PlanetLook, rot: number, force = false) {
    const key = texKey(l);
    const rotPx = rot * TW;
    if (!force && key === this.lastKey && Math.abs(rotPx - this.lastRot) < 0.35 * (TW / this.S) * 2) return;
    this.lastKey = key;
    this.lastRot = rotPx;
    const tex = texture(l);
    const L = lut(this.S);
    const d = this.img.data;
    for (let k = 0; k < L.n; k++) {
      let tu = (L.u[k] + rotPx) % TW;
      if (tu < 0) tu += TW;
      const u0 = tu | 0, fu = tu - u0, u1 = u0 + 1 === TW ? 0 : u0 + 1;
      const vv = L.v[k], v0 = vv | 0, fv = vv - v0, v1 = v0 + 1;
      const a = (v0 * TW + u0) * 4, b = (v0 * TW + u1) * 4, c = (v1 * TW + u0) * 4, e = (v1 * TW + u1) * 4;
      const s = L.shade[k];
      const o = L.idx[k];
      const w00 = (1 - fu) * (1 - fv) * s, w10 = fu * (1 - fv) * s, w01 = (1 - fu) * fv * s, w11 = fu * fv * s;
      d[o] = tex[a] * w00 + tex[b] * w10 + tex[c] * w01 + tex[e] * w11;
      d[o + 1] = tex[a + 1] * w00 + tex[b + 1] * w10 + tex[c + 1] * w01 + tex[e + 1] * w11;
      d[o + 2] = tex[a + 2] * w00 + tex[b + 2] * w10 + tex[c + 2] * w01 + tex[e + 2] * w11;
      d[o + 3] = 255;
    }
    this.g.putImageData(this.img, 0, 0);
  }
}

const spriteCache = new Map<string, SphereSprite>();
/** Shared sprite per planet id and size bucket. */
export function sphereFor(id: string, px: number): SphereSprite {
  const S = px <= 24 ? 24 : px <= 48 ? 48 : px <= 96 ? 96 : px <= 160 ? 160 : 256;
  const key = id + '@' + S;
  let sp = spriteCache.get(key);
  if (!sp) {
    if (spriteCache.size > 80) spriteCache.clear();
    sp = new SphereSprite(S);
    spriteCache.set(key, sp);
  }
  return sp;
}

// ------------------------------------------------------------------ composite drawing
export interface PlanetDrawOpts {
  /** Direction toward the light source (radians). Undefined = lit from the upper left. */
  light?: number;
  rings?: boolean;
  ringTilt?: number;
  ringHue?: number;
  /** Colony city lights on the night side. */
  lights?: number;
  lightColor?: string;
  ownerColor?: string;
  t?: number;
  hollowPulse?: boolean;
}

function ringPath(g: CanvasRenderingContext2D, r: number) {
  g.beginPath();
  g.ellipse(0, 0, r * 2.2, r * 2.2, 0, 0, TAU);
  g.ellipse(0, 0, r * 1.45, r * 1.45, 0, 0, TAU, true);
}

function drawRingHalf(g: CanvasRenderingContext2D, x: number, y: number, r: number, tilt: number, hue: number, front: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.scale(1, 0.28);
  g.beginPath();
  if (front) g.rect(-r * 3, 0, r * 6, r * 3);
  else g.rect(-r * 3, -r * 3, r * 6, r * 3);
  g.clip();
  const gr = g.createRadialGradient(0, 0, r * 1.45, 0, 0, r * 2.2);
  gr.addColorStop(0, `hsla(${hue},40%,80%,0.15)`);
  gr.addColorStop(0.3, `hsla(${hue},45%,75%,0.55)`);
  gr.addColorStop(0.55, `hsla(${hue},35%,60%,0.25)`);
  gr.addColorStop(0.75, `hsla(${hue},40%,78%,0.5)`);
  gr.addColorStop(1, `hsla(${hue},40%,70%,0.05)`);
  g.fillStyle = gr;
  ringPath(g, r);
  g.fill('evenodd');
  g.restore();
}

/** Draw a planet sphere (sprite must be updated by the caller) with light, atmosphere and rings. */
export function drawPlanet(g: CanvasRenderingContext2D, sprite: SphereSprite, l: PlanetLook, x: number, y: number, r: number, o: PlanetDrawOpts = {}) {
  const la = o.light ?? -2.3;
  const lx = Math.cos(la), ly = Math.sin(la);
  if (o.rings) drawRingHalf(g, x, y, r, o.ringTilt ?? -0.35, o.ringHue ?? l.hue, false);
  // Atmosphere halo
  if (l.style !== 'rubble') {
    const ac = atmColor(l);
    const a = l.style === 'gas' ? 0.35 : clamp(l.atm * 0.6, 0.08, 0.55);
    const hg = g.createRadialGradient(x + lx * r * 0.2, y + ly * r * 0.2, r * 0.8, x, y, r * 1.28);
    hg.addColorStop(0, rgbaStr(ac, 0));
    hg.addColorStop(0.35, rgbaStr(ac, a));
    hg.addColorStop(1, rgbaStr(ac, 0));
    g.fillStyle = hg;
    g.beginPath();
    g.arc(x, y, r * 1.28, 0, TAU);
    g.fill();
  }
  g.drawImage(sprite.canvas, x - r, y - r, r * 2, r * 2);
  // Terminator shading toward the light
  const sh = g.createRadialGradient(x + lx * r * 0.55, y + ly * r * 0.55, r * 0.15, x + lx * r * 0.25, y + ly * r * 0.25, r * 1.55);
  sh.addColorStop(0, 'rgba(255,250,235,0.10)');
  sh.addColorStop(0.42, 'rgba(0,0,10,0)');
  sh.addColorStop(0.72, 'rgba(2,4,14,0.62)');
  sh.addColorStop(1, 'rgba(2,3,10,0.94)');
  g.fillStyle = sh;
  g.beginPath();
  g.arc(x, y, r + 0.5, 0, TAU);
  g.fill();
  // Soft rim light on the lit edge (a crescent, clipped to the disc)
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.clip();
  g.globalCompositeOperation = 'lighter';
  const ox = x - lx * r * 0.3, oy = y - ly * r * 0.3;
  const rim = g.createRadialGradient(ox, oy, r * 0.95, ox, oy, r * 1.3);
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(0.55, rgbaStr(atmColor(l), 0.28));
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rim;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
  g.save();
  // City lights on the night side
  if (o.lights && r > 8) {
    const n = Math.min(14, o.lights * 4);
    g.fillStyle = o.lightColor ?? '#ffd88a';
    for (let i = 0; i < n; i++) {
      const a = la + Math.PI + Math.sin(i * 12.9898 + l.seed) * 1.1;
      const d = r * (0.25 + ((i * 0.37 + (l.seed % 7) * 0.11) % 0.6));
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      const tw = 0.6 + 0.4 * Math.sin((o.t ?? 0) * 2 + i);
      g.globalAlpha = tw;
      g.beginPath();
      g.arc(px, py, Math.max(0.8, r * 0.035), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  if (o.hollowPulse && r > 6) {
    const p = 0.5 + 0.5 * Math.sin((o.t ?? 0) * 3);
    const hg = g.createRadialGradient(x, y, r * 0.2, x, y, r * 1.1);
    hg.addColorStop(0, `rgba(255,40,60,${0.12 * p})`);
    hg.addColorStop(1, 'rgba(255,40,60,0)');
    g.fillStyle = hg;
    g.beginPath(); g.arc(x, y, r * 1.1, 0, TAU); g.fill();
  }
  g.restore();
  if (o.rings) drawRingHalf(g, x, y, r, o.ringTilt ?? -0.35, o.ringHue ?? l.hue, true);
}

function rgbaStr(c: string, a: number): string {
  if (c.startsWith('#')) {
    const [r, g, b] = hexToRgb(c);
    return `rgba(${r},${g},${b},${a})`;
  }
  // hsl(...) → hsla(...)
  return c.replace('hsl(', 'hsla(').replace(')', `,${a})`);
}
