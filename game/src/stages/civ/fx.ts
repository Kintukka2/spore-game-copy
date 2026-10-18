// Visual effects: pooled particles, floating numbers, explosions, ability waves, beams and screen shake.
import type { Camera } from '../../engine/camera';
import { TAU } from '../../engine/math';
import { puffTint } from './sprites';
import { wdx } from './types';

export enum PK { Smoke, Fire, Spark, Debris, Confetti, Coin, Heal, Dust, Ice, Glow }

interface Particle {
  k: PK; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; max: number; size: number; grow: number; color: string; rot: number;
}
interface Floater { x: number; y: number; text: string; color: string; life: number; max: number; size: number }
interface Boom { x: number; y: number; t: number; size: number }
interface Wave { x: number; y: number; t: number; max: number; r: number; color: string; fill: boolean }
interface Beam { x1: number; y1: number; x2: number; y2: number; t: number; max: number; color: string; w: number; arc: number }

const MAXP = 700;

export class Fx {
  private ps: Particle[] = [];
  private n = 0;
  floaters: Floater[] = [];
  booms: Boom[] = [];
  waves: Wave[] = [];
  beams: Beam[] = [];
  shake = 0;
  reduced = false;

  constructor() {
    for (let i = 0; i < MAXP; i++) this.ps.push({ k: PK.Smoke, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grow: 0, color: '#fff', rot: 0 });
  }

  spawn(k: PK, x: number, y: number, o: { z?: number; vx?: number; vy?: number; vz?: number; life?: number; size?: number; grow?: number; color?: string } = {}) {
    if (this.n >= MAXP) return;
    const p = this.ps[this.n++];
    p.k = k; p.x = x; p.y = y; p.z = o.z ?? 0;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.max = p.life = o.life ?? 1; p.size = o.size ?? 4; p.grow = o.grow ?? 0;
    p.color = o.color ?? '#ffffff'; p.rot = Math.random() * TAU;
  }

  burst(k: PK, x: number, y: number, count: number, speed: number, o: { z?: number; vz?: number; life?: number; size?: number; grow?: number; color?: string; colors?: string[] } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.75);
      this.spawn(k, x, y, { ...o, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: (o.vz ?? 0) * (0.6 + Math.random() * 0.8), life: (o.life ?? 1) * (0.6 + Math.random() * 0.6), color: o.colors ? o.colors[i % o.colors.length] : o.color });
    }
  }

  explode(x: number, y: number, size = 1, z = 0) {
    this.booms.push({ x, y: y - z, t: 0, size });
    this.burst(PK.Fire, x, y, Math.round(8 * size), 50 * size, { z, life: 0.55, size: 9 * size, grow: 10 });
    this.burst(PK.Smoke, x, y, Math.round(7 * size), 26 * size, { z: z + 4, vz: 22, life: 1.6, size: 10 * size, grow: 14, color: '#5d5a58' });
    this.burst(PK.Debris, x, y, Math.round(7 * size), 70 * size, { z, vz: 90, life: 1.1, size: 2.6, color: '#3b3632' });
    this.burst(PK.Spark, x, y, Math.round(6 * size), 120 * size, { z, life: 0.35, size: 2 });
    this.shake = Math.min(14, this.shake + 3 * size);
  }

  float(x: number, y: number, text: string, color = '#ffd166', size = 15) {
    if (this.floaters.length > 30) this.floaters.shift();
    this.floaters.push({ x, y, text, color, life: 1.6, max: 1.6, size });
  }

  wave(x: number, y: number, r: number, color: string, max = 0.8, fill = true) {
    this.waves.push({ x, y, t: 0, max, r, color, fill });
  }

  beam(x1: number, y1: number, x2: number, y2: number, color: string, max = 0.18, w = 2.5, arc = 0) {
    if (this.beams.length > 80) this.beams.shift();
    this.beams.push({ x1, y1, x2, y2, t: 0, max, color, w, arc });
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.n--;
        const last = this.ps[this.n];
        this.ps[this.n] = p;
        this.ps[i] = last;
        i--;
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
      switch (p.k) {
        case PK.Debris: case PK.Confetti: case PK.Coin:
          p.vz -= 260 * dt;
          if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
          p.rot += dt * 8;
          break;
        case PK.Smoke: case PK.Dust:
          p.vx *= 1 - dt * 1.2; p.vy *= 1 - dt * 1.2;
          break;
        default:
          p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2;
      }
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
    for (let i = this.booms.length - 1; i >= 0; i--) { this.booms[i].t += dt; if (this.booms[i].t > 0.5) this.booms.splice(i, 1); }
    for (let i = this.waves.length - 1; i >= 0; i--) { this.waves[i].t += dt; if (this.waves[i].t > this.waves[i].max) this.waves.splice(i, 1); }
    for (let i = this.beams.length - 1; i >= 0; i--) { this.beams[i].t += dt; if (this.beams[i].t > this.beams[i].max) this.beams.splice(i, 1); }
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  /** World-space effects under units (waves). Camera transform already applied. */
  drawUnder(g: CanvasRenderingContext2D, cam: Camera) {
    for (const w of this.waves) {
      const x = cam.x + wdx(cam.x, w.x);
      const k = w.t / w.max;
      const r = w.r * (0.25 + 0.75 * Math.sqrt(k));
      g.globalAlpha = (1 - k) * 0.55;
      if (w.fill) {
        g.fillStyle = w.color;
        g.beginPath(); g.ellipse(x, w.y, r, r * 0.7, 0, 0, TAU); g.fill();
      }
      g.globalAlpha = 1 - k;
      g.strokeStyle = w.color;
      g.lineWidth = 3 / Math.max(0.4, cam.zoom);
      g.beginPath(); g.ellipse(x, w.y, r, r * 0.7, 0, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  }

  /** World-space effects over units. */
  drawOver(g: CanvasRenderingContext2D, cam: Camera) {
    const b = cam.bounds(80);
    // Particles (normal blend first, then additive).
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.n; i++) {
        const p = this.ps[i];
        const add = p.k === PK.Fire || p.k === PK.Spark || p.k === PK.Glow || p.k === PK.Heal;
        if ((pass === 1) !== add) continue;
        const x = cam.x + wdx(cam.x, p.x);
        const y = p.y - p.z;
        if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
        const k = p.life / p.max;
        switch (p.k) {
          case PK.Smoke: case PK.Dust: {
            g.globalAlpha = k * (p.k === PK.Dust ? 0.4 : 0.55);
            const s = p.size;
            g.drawImage(puffTint(p.color), x - s, y - s, s * 2, s * 2);
            break;
          }
          case PK.Fire: case PK.Glow: {
            g.globalAlpha = k * 0.9;
            const s = p.size;
            g.drawImage(puffTint(p.k === PK.Fire ? (k > 0.6 ? '#fff1a8' : k > 0.3 ? '#ff9a3c' : '#c8402a') : p.color), x - s, y - s, s * 2, s * 2);
            break;
          }
          case PK.Spark: case PK.Heal: {
            g.globalAlpha = k;
            g.fillStyle = p.k === PK.Heal ? '#7dffb0' : p.color;
            const s = p.size;
            if (p.k === PK.Heal) { g.fillRect(x - s, y - s * 0.3, s * 2, s * 0.6); g.fillRect(x - s * 0.3, y - s, s * 0.6, s * 2); }
            else g.fillRect(x - s / 2, y - s / 2, s, s);
            break;
          }
          case PK.Debris: case PK.Confetti: case PK.Ice: {
            g.globalAlpha = Math.min(1, k * 2);
            g.fillStyle = p.color;
            const s = p.size;
            const w = Math.abs(Math.cos(p.rot)) * s + 0.6;
            g.fillRect(x - w / 2, y - s / 2, w, s);
            break;
          }
          case PK.Coin: {
            g.globalAlpha = Math.min(1, k * 2);
            g.fillStyle = '#ffd166';
            const w = Math.abs(Math.cos(p.rot)) * p.size + 0.8;
            g.beginPath(); g.ellipse(x, y, w, p.size, 0, 0, TAU); g.fill();
            g.fillStyle = '#b07a10';
            g.fillRect(x - w * 0.3, y - 0.6, w * 0.6, 1.2);
            break;
          }
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    // Beams
    for (const bm of this.beams) {
      const x1 = cam.x + wdx(cam.x, bm.x1);
      const x2 = x1 + wdx(bm.x1, bm.x2);
      const k = 1 - bm.t / bm.max;
      g.globalAlpha = k;
      g.strokeStyle = bm.color;
      g.lineWidth = bm.w;
      g.beginPath();
      g.moveTo(x1, bm.y1);
      if (bm.arc) g.quadraticCurveTo((x1 + x2) / 2, Math.min(bm.y1, bm.y2) - bm.arc, x2, bm.y2);
      else g.lineTo(x2, bm.y2);
      g.stroke();
      g.globalAlpha = k * 0.5;
      g.strokeStyle = '#ffffff';
      g.lineWidth = bm.w * 0.4;
      g.stroke();
    }
    // Explosion flashes
    for (const e of this.booms) {
      const x = cam.x + wdx(cam.x, e.x);
      const k = e.t / 0.5;
      const r = (10 + 40 * k) * e.size;
      g.globalAlpha = (1 - k) * 0.9;
      g.drawImage(puffTint('#fff3c0'), x - r, e.y - r, r * 2, r * 2);
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#ffd9a0';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, e.y + 4 * e.size, r * 1.2, r * 0.6, 0, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  }

  /** Floating texts, drawn in screen space so they stay readable at any zoom. */
  drawText(g: CanvasRenderingContext2D, cam: Camera) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const f of this.floaters) {
      const k = 1 - f.life / f.max;
      const sx = (cam.x + wdx(cam.x, f.x) - cam.x) * cam.zoom + cam.w / 2;
      const sy = (f.y - cam.y) * cam.zoom + cam.h / 2 - k * 34;
      if (sx < -60 || sx > cam.w + 60 || sy < -30 || sy > cam.h + 30) continue;
      const pop = k < 0.12 ? 0.7 + (k / 0.12) * 0.4 : 1.1 - Math.min(0.1, (k - 0.12));
      g.globalAlpha = Math.min(1, (1 - k) * 2.2);
      g.font = `700 ${Math.round(f.size * pop)}px Fredoka, system-ui, sans-serif`;
      g.lineWidth = 3.5;
      g.strokeStyle = 'rgba(10,16,26,0.85)';
      g.strokeText(f.text, sx, sy);
      g.fillStyle = f.color;
      g.fillText(f.text, sx, sy);
    }
    g.globalAlpha = 1;
  }
}
