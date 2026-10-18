// The glowing tide pool behind (and over) the playfield: water gradient, god rays, caustic light,
// a sea floor that rises into view late in the stage, drifting motes, bubbles, and parallax
// layers of huge blurred cells that "surface" into the foreground as the player grows.
//
// Performance: every soft, full-screen layer is composed into a low-resolution offscreen buffer
// (half size, DPR 1) and blitted once. Soft light looks better slightly blurred anyway, and it
// cuts fill cost by ~16x on high-DPR phones.
import type { Camera } from '../../engine/camera';
import { clamp, TAU } from '../../engine/math';
import { mix } from '../../design/color';
import type { Design } from '../../design/types';
import { RNG } from '../../engine/rng';
import { WATER } from './config';
import { caustics, sand, silhouetteSprite } from './sprites';

interface Mote { x: number; y: number; depth: number; size: number; ph: number }
interface Bubble { x: number; y: number; r: number; speed: number; ph: number }
interface Sil { design: Design; x: number; y: number; depth: number; angle: number; turn: number; speed: number; fade: number; dying: boolean }

/** Vision and damage info for the front buffer. */
export interface FrontFx {
  /** Screen position of the player. */
  px: number;
  py: number;
  /** Number of eyes (0 = nearly blind). */
  sight: number;
  hurt: number;
}

/** Offscreen buffer scale (CSS px), lowered in low-quality mode. */
let BUF = 0.4;

export class Backdrop {
  t = 0;
  /** Continuous level 0..4 used for colours; the stage animates it during growth. */
  levelF = 0;
  /** Extra warm "shore" light 0..1 (finale). */
  shore = 0;
  private motes: Mote[] = [];
  private bubbles: Bubble[] = [];
  private sils: Sil[] = [];
  private rng: RNG;
  private offX = 0;
  private offY = 0;
  private lastCam: { x: number; y: number } | null = null;
  private pending = 0;
  private beam: HTMLCanvasElement;
  private back: HTMLCanvasElement;
  private front: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private fctx: CanvasRenderingContext2D;
  private pats: { c: CanvasPattern | null; s: CanvasPattern | null } | null = null;
  private flowX = 0;
  private flowY = 0;

  constructor(rng: RNG, private designs: Design[], private level: number) {
    this.rng = rng;
    this.levelF = level;
    BUF = 0.4;
    for (let i = 0; i < 60; i++) {
      this.motes.push({ x: rng.range(0, 1), y: rng.range(0, 1), depth: rng.range(0.25, 1), size: rng.range(0.6, 2.2), ph: rng.range(0, TAU) });
    }
    for (let i = 0; i < 12; i++) this.bubbles.push(this.newBubble(true));
    this.beam = document.createElement('canvas');
    this.beam.width = 32; this.beam.height = 2;
    const bg = this.beam.getContext('2d')!;
    const gr = bg.createLinearGradient(0, 0, 32, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    bg.fillStyle = gr;
    bg.fillRect(0, 0, 32, 2);
    this.back = document.createElement('canvas');
    this.front = document.createElement('canvas');
    this.bctx = this.back.getContext('2d', { alpha: false })!;
    this.fctx = this.front.getContext('2d')!;
    const n = level >= 4 ? 0 : 7;
    for (let i = 0; i < n; i++) this.sils.push(this.newSil(rng.range(1.2, 3.4), true));
  }

  private newBubble(anywhere: boolean): Bubble {
    const r = this.rng;
    return { x: r.range(0, 1), y: anywhere ? r.range(0, 1) : 1.08, r: r.range(2, 6), speed: r.range(0.04, 0.09), ph: r.range(0, TAU) };
  }

  private newSil(depth: number, anywhere: boolean): Sil {
    const r = this.rng;
    return {
      design: r.pick(this.designs), x: r.range(0, 1.5), y: r.range(0, 1.5), depth, angle: r.range(0, TAU), turn: r.range(-0.15, 0.15),
      speed: r.range(8, 22), fade: anywhere ? 1 : 0, dying: false,
    };
  }

  /** Cheaper rendering for slow devices: smaller buffers, one caustic layer, fewer motes. */
  low = false;
  setLowQuality() {
    this.low = true;
    BUF = 0.3;
    this.motes.length = Math.min(this.motes.length, 30);
  }

  /** Called when the player grows: the deep layer drifts up toward the foreground. */
  surface(newLevel: number) {
    this.level = newLevel;
    this.pending += 0.85;
  }

  setFlow(fx: number, fy: number) { this.flowX = fx; this.flowY = fy; }

  update(dt: number, cam: Camera, w: number, h: number) {
    this.t += dt;
    let dx = 0, dy = 0;
    if (this.lastCam) { dx = (cam.x - this.lastCam.x) * cam.zoom; dy = (cam.y - this.lastCam.y) * cam.zoom; }
    this.lastCam = { x: cam.x, y: cam.y };
    if (Math.abs(dx) > w || Math.abs(dy) > h) { dx = 0; dy = 0; } // teleports (respawn, hatching elsewhere)
    this.offX += dx; this.offY += dy;
    const fx = this.flowX * cam.zoom, fy = this.flowY * cam.zoom;
    for (const m of this.motes) {
      m.x -= (dx * m.depth * 0.85 - fx * dt * m.depth) / w;
      m.y -= (dy * m.depth * 0.85 - fy * dt * m.depth) / h;
      m.x -= Math.sin(this.t * 0.6 + m.ph) * 0.002 * dt;
      m.x = ((m.x % 1) + 1) % 1;
      m.y = ((m.y % 1) + 1) % 1;
    }
    for (const b of this.bubbles) {
      b.y -= b.speed * dt + (dy * 0.75) / h;
      b.x -= (dx * 0.75) / w;
      b.x = ((b.x % 1) + 1) % 1;
      if (b.y < -0.05) Object.assign(b, this.newBubble(false));
      if (b.y > 1.1) b.y -= 1.1;
    }
    // Depth shift (growth): every silhouette drifts closer.
    if (this.pending > 0) {
      const step = Math.min(this.pending, dt * 0.55);
      this.pending -= step;
      for (const s of this.sils) s.depth -= step;
    }
    const W = 1.5;
    for (const s of this.sils) {
      const par = 0.35 / Math.max(0.5, s.depth);
      s.x -= (dx * par) / w;
      s.y -= (dy * par) / h;
      s.angle += s.turn * dt;
      s.x += (Math.cos(s.angle) * s.speed * dt) / w / s.depth;
      s.y += (Math.sin(s.angle) * s.speed * dt) / h / s.depth;
      s.x = ((s.x % W) + W) % W;
      s.y = ((s.y % W) + W) % W;
      if (s.depth < 0.95) s.dying = true;
      s.fade = s.dying ? s.fade - dt * 0.7 : Math.min(1, s.fade + dt * 0.25);
    }
    for (let i = this.sils.length - 1; i >= 0; i--) {
      if (this.sils[i].dying && this.sils[i].fade <= 0) {
        this.sils.splice(i, 1);
        if (this.level < 4) this.sils.push(this.newSil(this.rng.range(2.8, 3.5), false));
      }
    }
  }

  private colors() {
    const lf = clamp(this.levelF, 0, WATER.length - 1);
    const i = Math.min(WATER.length - 2, Math.floor(lf)), k = lf - i;
    const a = WATER[i], b = WATER[i + 1];
    let top = mix(a.top, b.top, k), bottom = mix(a.bottom, b.bottom, k);
    if (this.shore > 0) { top = mix(top, '#d9b673', this.shore * 0.75); bottom = mix(bottom, '#7a6a3c', this.shore * 0.6); }
    return { top, bottom, glow: mix(a.glow, b.glow, k) };
  }

  private size(c: HTMLCanvasElement, w: number, h: number) {
    const bw = Math.max(16, Math.round(w * BUF)), bh = Math.max(16, Math.round(h * BUF));
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; this.pats = null; }
  }

  private patterns() {
    if (!this.pats) {
      this.pats = { c: this.bctx.createPattern(caustics(), 'repeat'), s: this.bctx.createPattern(sand(), 'repeat') };
    }
    return this.pats;
  }

  private caustic(g: CanvasRenderingContext2D, pat: CanvasPattern, w: number, h: number, sc: number, par: number, driftX: number, driftY: number, alpha: number, rot: number) {
    const T = 256 * sc;
    const ox = -((((this.offX * par + driftX) % T) + T) % T), oy = -((((this.offY * par + driftY) % T) + T) % T);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    if (rot) { g.translate(w / 2, h / 2); g.rotate(rot); g.translate(-w / 2, -h / 2); }
    g.translate(ox, oy);
    g.scale(sc, sc);
    g.fillStyle = pat;
    const pad = rot ? Math.max(w, h) * 0.6 : 0;
    g.fillRect((-pad - T) / sc, (-pad - T) / sc, (w + T * 2 + pad * 2) / sc, (h + T * 2 + pad * 2) / sc);
    g.restore();
  }

  private rays(b: CanvasRenderingContext2D, w: number, h: number) {
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const bx = w * (0.08 + i * 0.3) + Math.sin(this.t * 0.17 + i * 1.7) * w * 0.08;
      const bw = w * (0.18 + 0.08 * Math.sin(this.t * 0.23 + i));
      b.save();
      b.translate(bx, -h * 0.1);
      b.rotate(-0.28);
      b.globalAlpha = 0.06 + 0.025 * Math.sin(this.t * 0.4 + i * 2) + this.shore * 0.08;
      b.drawImage(this.beam, -bw / 2, 0, bw, h * 1.4);
      b.restore();
    }
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
  }

  private vignette(b: CanvasRenderingContext2D, w: number, h: number, v: FrontFx, onlyCosmetic: boolean) {
    const diag = Math.hypot(w, h);
    if (onlyCosmetic && v.sight < 2) return;
    const [inner, outer, a] = v.sight <= 0 ? [0.12, 0.36, 0.93] : v.sight === 1 ? [0.3, 0.62, 0.55] : [0.42, 0.82, 0.36];
    const vg = b.createRadialGradient(v.px, v.py, diag * inner, v.px, v.py, diag * outer);
    vg.addColorStop(0, 'rgba(0,8,14,0)');
    vg.addColorStop(1, `rgba(0,8,14,${a})`);
    b.fillStyle = vg;
    b.fillRect(0, 0, w, h);
  }

  /** Everything behind the playfield, composed at low resolution, plus crisp motes. */
  renderBack(g: CanvasRenderingContext2D, w: number, h: number, v: FrontFx) {
    this.size(this.back, w, h);
    const b = this.bctx;
    const col = this.colors();
    const pats = this.patterns();
    b.setTransform(BUF, 0, 0, BUF, 0, 0);
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
    const gr = b.createLinearGradient(0, 0, w * 0.3, h);
    gr.addColorStop(0, col.top);
    gr.addColorStop(1, col.bottom);
    b.fillStyle = gr;
    b.fillRect(0, 0, w, h);
    // Sea floor, rising into view in the last levels.
    const floorA = clamp((this.levelF - 2.4) / 1.6, 0, 1) * 0.5 + this.shore * 0.35;
    if (floorA > 0.01 && pats.s) {
      b.save();
      b.globalAlpha = floorA;
      const sc = 1.5, T = 256 * sc;
      const ox = -(((this.offX * 0.45) % T) + T) % T, oy = -(((this.offY * 0.45) % T) + T) % T;
      b.translate(ox, oy);
      b.scale(sc, sc);
      b.fillStyle = pats.s;
      b.fillRect(0, 0, (w + T * 2) / sc, (h + T * 2) / sc);
      b.restore();
      b.globalAlpha = 0.35;
      b.fillStyle = col.bottom;
      b.fillRect(0, 0, w, h);
      b.globalAlpha = 1;
    }
    // Deep caustics: two drifting layers that interfere for a shimmering, organic look.
    if (pats.c) {
      this.caustic(b, pats.c, w, h, 2.4, 0.4, this.t * 9, this.t * 5, 0.07 + floorA * 0.1, 0);
      if (!this.low) this.caustic(b, pats.c, w, h, 1.7, 0.55, -this.t * 6, this.t * 8, 0.05 + floorA * 0.06, 0.7);
    }
    // Parallax giants (deepest first).
    const scale = Math.min(w, h) / 390;
    this.sils.sort((a, c) => c.depth - a.depth);
    for (const s of this.sils) {
      const spr = silhouetteSprite(s.design, col.bottom);
      const lenPx = (200 * scale) / s.depth;
      const k = lenPx / (spr.img.width || 1);
      const x = s.x * w - w * 0.25, y = s.y * h - h * 0.25;
      if (x < -lenPx || x > w + lenPx || y < -lenPx || y > h + lenPx) continue;
      b.save();
      b.globalAlpha = clamp(0.62 / Math.pow(s.depth, 0.9), 0, 0.5) * clamp(s.fade, 0, 1);
      b.translate(x, y);
      b.rotate(s.angle);
      b.drawImage(spr.img, -spr.ox * k, -spr.oy * k, spr.img.width * k, spr.img.height * k);
      b.restore();
    }
    this.rays(b, w, h);
    this.vignette(b, w, h, v, true);
    g.drawImage(this.back, 0, 0, w, h);
    // Motes (crisp, on the main canvas)
    g.fillStyle = col.glow;
    for (const m of this.motes) {
      g.globalAlpha = 0.12 + m.depth * 0.3 + Math.sin(this.t * 1.3 + m.ph) * 0.06;
      const s = m.size * (0.6 + m.depth);
      g.fillRect(m.x * w, m.y * h, s, s);
    }
    g.globalAlpha = 1;
  }

  /**
   * Shadow and light over the playfield, only when needed: poor eyesight (vision vignette),
   * a damage flash, or the finale's shore glow. Composed at low resolution and blitted once.
   */
  renderFront(g: CanvasRenderingContext2D, w: number, h: number, v: FrontFx) {
    const need = v.sight < 2 || v.hurt > 0.02 || this.shore > 0.01;
    if (need) {
      this.size(this.front, w, h);
      const f = this.fctx;
      f.setTransform(BUF, 0, 0, BUF, 0, 0);
      f.globalCompositeOperation = 'source-over';
      f.globalAlpha = 1;
      f.clearRect(0, 0, w, h);
      if (this.shore > 0.01) {
        const sg = f.createLinearGradient(0, 0, 0, h * 0.6);
        sg.addColorStop(0, `rgba(255,236,190,${0.75 * this.shore})`);
        sg.addColorStop(1, 'rgba(255,236,190,0)');
        f.fillStyle = sg;
        f.fillRect(0, 0, w, h * 0.6);
      }
      // Vision: eyes widen what you can see; without them the pool's edges go dark.
      if (v.sight < 2) this.vignette(f, w, h, v, false);
      if (v.hurt > 0.02) {
        const hg = f.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        hg.addColorStop(0, 'rgba(255,40,60,0)');
        hg.addColorStop(1, `rgba(255,40,60,${Math.min(0.55, v.hurt)})`);
        f.fillStyle = hg;
        f.fillRect(0, 0, w, h);
      }
      g.drawImage(this.front, 0, 0, w, h);
    }
    // Bubbles drifting up (crisp)
    g.lineWidth = 1.2;
    for (const bb of this.bubbles) {
      const x = bb.x * w + Math.sin(this.t * 2 + bb.ph) * 6, y = bb.y * h;
      g.strokeStyle = 'rgba(220,250,255,0.35)';
      g.beginPath(); g.arc(x, y, bb.r, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.arc(x - bb.r * 0.35, y - bb.r * 0.35, bb.r * 0.3, 0, TAU); g.fill();
    }
  }
}
