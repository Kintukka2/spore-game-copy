// Deep-space backdrop: pre-rendered parallax starfield tiles and soft nebula washes.
import { RNG } from '../../../engine/rng';
import { TAU } from '../../../engine/math';
import { canvas } from './sprites';

const TILE = 512;

interface Layer { img: HTMLCanvasElement; factor: number; alpha: number }

export class Backdrop {
  private layers: Layer[] = [];
  private nebula: HTMLCanvasElement;
  private nebulaHue = -1;

  constructor(seed = 1) {
    const r = new RNG(seed);
    const specs = [
      { n: 260, size: [0.4, 1.0], bright: [0.25, 0.6], factor: 0.04 },
      { n: 120, size: [0.6, 1.4], bright: [0.4, 0.85], factor: 0.12 },
      { n: 40, size: [1.0, 2.0], bright: [0.6, 1], factor: 0.26 },
    ];
    for (const sp of specs) {
      const c = canvas(TILE * 2, TILE * 2);
      const g = c.getContext('2d')!;
      g.scale(2, 2);
      for (let i = 0; i < sp.n; i++) {
        const x = r.range(0, TILE), y = r.range(0, TILE);
        const s = r.range(sp.size[0], sp.size[1]);
        const b = r.range(sp.bright[0], sp.bright[1]);
        const tint = r.pick(['255,255,255', '200,220,255', '255,230,200', '220,200,255', '190,255,240']);
        if (s > 1.3) {
          const gr = g.createRadialGradient(x, y, 0, x, y, s * 3);
          gr.addColorStop(0, `rgba(${tint},${b * 0.5})`);
          gr.addColorStop(1, `rgba(${tint},0)`);
          g.fillStyle = gr;
          g.beginPath(); g.arc(x, y, s * 3, 0, TAU); g.fill();
        }
        g.fillStyle = `rgba(${tint},${b})`;
        g.beginPath(); g.arc(x, y, s * 0.6, 0, TAU); g.fill();
      }
      this.layers.push({ img: c, factor: sp.factor, alpha: 1 });
    }
    this.nebula = canvas(256, 256);
  }

  /** Paint the soft nebula wash for a given hue family (cached until the hue changes). */
  private paintNebula(hue: number, seed: number) {
    if (Math.round(hue) === this.nebulaHue) return;
    this.nebulaHue = Math.round(hue);
    const r = new RNG(seed);
    const g = this.nebula.getContext('2d')!;
    g.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 9; i++) {
      const x = r.range(0, 256), y = r.range(0, 256), rad = r.range(50, 130);
      const h = (hue + r.range(-50, 50) + 360) % 360;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `hsla(${h},70%,45%,${r.range(0.12, 0.28)})`);
      gr.addColorStop(1, `hsla(${h},70%,30%,0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      // wrap copies so the tile is seamless
      for (const [ox, oy] of [[-256, 0], [256, 0], [0, -256], [0, 256]]) {
        const gr2 = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr2.addColorStop(0, `hsla(${h},70%,45%,0.12)`);
        gr2.addColorStop(1, `hsla(${h},70%,30%,0)`);
        g.fillStyle = gr2;
        g.fillRect(0, 0, 256, 256);
      }
    }
  }

  /**
   * Draw the background for a camera at (cx, cy). `base` is the deep-space gradient colour pair.
   * `hue` tints the nebula (pass -1 for none).
   */
  draw(g: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, hue: number, seed = 7, top = '#050a18', bottom = '#0b0820') {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, top);
    bg.addColorStop(1, bottom);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (hue >= 0) {
      this.paintNebula(hue, seed);
      const s = Math.max(w, h) * 1.4;
      const pm = (a: number) => ((a % s) + s) % s;
      const ox = -pm(cx * 0.02), oy = -pm(cy * 0.02);
      g.globalAlpha = 0.9;
      g.drawImage(this.nebula, ox, oy, s, s);
      g.drawImage(this.nebula, ox + s, oy, s, s);
      g.drawImage(this.nebula, ox, oy + s, s, s);
      g.drawImage(this.nebula, ox + s, oy + s, s, s);
      g.globalAlpha = 1;
    }
    for (const L of this.layers) {
      let ox = -(cx * L.factor) % TILE, oy = -(cy * L.factor) % TILE;
      if (ox > 0) ox -= TILE;
      if (oy > 0) oy -= TILE;
      for (let x = ox; x < w; x += TILE) for (let y = oy; y < h; y += TILE) g.drawImage(L.img, x, y, TILE, TILE);
    }
  }
}
