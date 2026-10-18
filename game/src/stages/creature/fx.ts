// Particles, floating numbers and screen shake. Pooled to avoid per-frame allocation.
import { TAU } from '../../engine/math';
import type { Camera } from '../../engine/camera';
import { drawEmoji } from './sprites';

export type PKind = 'dust' | 'smoke' | 'spark' | 'drop' | 'fire' | 'sparkle' | 'ring' | 'leaf' | 'dirt' | 'debris' | 'emoji' | 'glow';

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  rot: number;
  vr: number;
  grav: number;
  emoji: string;
}

export interface SpawnOpts {
  vx?: number; vy?: number; vz?: number; z?: number; life?: number; size?: number; grow?: number;
  color?: string; grav?: number; spread?: number; speed?: number; emoji?: string; vr?: number; up?: number;
}

interface Floater { x: number; y: number; z: number; text: string; color: string; t: number; life: number; size: number }

const MAX_PARTS = 420;

export class Fx {
  parts: Particle[] = [];
  private pool: Particle[] = [];
  private floaters: Floater[] = [];
  shakeAmp = 0;
  shakeX = 0;
  shakeY = 0;
  private reduced = false;

  setReducedMotion(b: boolean) { this.reduced = b; }

  spawn(kind: PKind, x: number, y: number, o: SpawnOpts = {}): Particle | null {
    if (this.parts.length >= MAX_PARTS) return null;
    const p = this.pool.pop() ?? ({} as Particle);
    const sp = o.speed ?? 0;
    const a = Math.random() * TAU;
    p.kind = kind;
    p.x = x + (o.spread ? (Math.random() - 0.5) * o.spread : 0);
    p.y = y + (o.spread ? (Math.random() - 0.5) * o.spread * 0.6 : 0);
    p.z = o.z ?? 0;
    p.vx = (o.vx ?? 0) + Math.cos(a) * sp * Math.random();
    p.vy = (o.vy ?? 0) + Math.sin(a) * sp * Math.random() * 0.6;
    p.vz = (o.vz ?? 0) + (o.up ?? 0) * (0.5 + Math.random() * 0.5);
    p.life = p.max = (o.life ?? 0.8) * (0.75 + Math.random() * 0.5);
    p.size = o.size ?? 4;
    p.grow = o.grow ?? 0;
    p.color = o.color ?? '#ffffff';
    p.rot = Math.random() * TAU;
    p.vr = o.vr ?? 0;
    p.grav = o.grav ?? 0;
    p.emoji = o.emoji ?? '';
    this.parts.push(p);
    return p;
  }

  burst(kind: PKind, x: number, y: number, n: number, o: SpawnOpts = {}) {
    for (let i = 0; i < n; i++) this.spawn(kind, x, y, o);
  }

  /** Floating text (damage numbers, DNA). World coords; z lifts it. */
  text(x: number, y: number, z: number, text: string, color = '#ffffff', size = 16) {
    if (this.floaters.length > 40) this.floaters.shift();
    this.floaters.push({ x: x + (Math.random() - 0.5) * 10, y, z, text, color, t: 0, life: 1.1, size });
  }

  shake(amount: number) {
    if (this.reduced) amount *= 0.3;
    this.shakeAmp = Math.min(22, Math.max(this.shakeAmp, amount));
  }

  update(dt: number) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        this.pool.push(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.grav) {
        p.vz -= p.grav * dt;
        if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      }
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'dust' || p.kind === 'smoke') { p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2; }
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= f.life) this.floaters.splice(i, 1);
    }
    if (this.shakeAmp > 0.05) {
      this.shakeX = (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.shakeY = (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.shakeAmp *= Math.exp(-dt * 9);
    } else {
      this.shakeAmp = 0; this.shakeX = 0; this.shakeY = 0;
    }
  }

  /** World-space particles (inside the camera transform). */
  drawWorld(g: CanvasRenderingContext2D, cam: Camera) {
    const b = cam.bounds(60);
    let additive = false;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) { g.globalCompositeOperation = 'lighter'; additive = true; }
      for (const p of this.parts) {
        if (p.kind === 'emoji') continue;
        const add = p.kind === 'fire' || p.kind === 'sparkle' || p.kind === 'glow';
        if (add !== additive) continue;
        if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
        const k = p.life / p.max;
        const y = p.y - p.z;
        switch (p.kind) {
          case 'dust':
          case 'smoke':
            g.globalAlpha = k * (p.kind === 'dust' ? 0.55 : 0.5);
            g.fillStyle = p.color;
            g.beginPath(); g.arc(p.x, y, p.size, 0, TAU); g.fill();
            break;
          case 'spark': {
            g.globalAlpha = k;
            g.strokeStyle = p.color;
            g.lineWidth = p.size * 0.5;
            g.beginPath(); g.moveTo(p.x, y); g.lineTo(p.x - p.vx * 0.05, y - (p.vy - p.vz) * 0.05); g.stroke();
            break;
          }
          case 'drop':
          case 'dirt':
          case 'debris':
            g.globalAlpha = Math.min(1, k * 2);
            g.fillStyle = p.color;
            if (p.kind === 'drop') { g.beginPath(); g.arc(p.x, y, p.size, 0, TAU); g.fill(); }
            else { g.save(); g.translate(p.x, y); g.rotate(p.rot); g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); g.restore(); }
            break;
          case 'leaf':
            g.globalAlpha = Math.min(1, k * 2);
            g.fillStyle = p.color;
            g.save(); g.translate(p.x, y); g.rotate(p.rot);
            g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU); g.fill();
            g.restore();
            break;
          case 'ring':
            g.globalAlpha = k * 0.8;
            g.strokeStyle = p.color;
            g.lineWidth = 3 + 4 * k;
            g.beginPath(); g.ellipse(p.x, y, p.size, p.size * 0.55, 0, 0, TAU); g.stroke();
            break;
          case 'fire':
          case 'glow':
            g.globalAlpha = k * (p.kind === 'glow' ? 0.5 : 0.9);
            g.fillStyle = p.color;
            g.beginPath(); g.arc(p.x, y, p.size * (p.kind === 'fire' ? 0.4 + k * 0.6 : 1), 0, TAU); g.fill();
            break;
          case 'sparkle': {
            g.globalAlpha = k;
            g.fillStyle = p.color;
            const s = p.size * (0.5 + 0.5 * Math.sin(k * Math.PI));
            g.save(); g.translate(p.x, y); g.rotate(p.rot);
            g.beginPath();
            g.moveTo(0, -s); g.lineTo(s * 0.25, -s * 0.25); g.lineTo(s, 0); g.lineTo(s * 0.25, s * 0.25);
            g.lineTo(0, s); g.lineTo(-s * 0.25, s * 0.25); g.lineTo(-s, 0); g.lineTo(-s * 0.25, -s * 0.25);
            g.closePath(); g.fill();
            g.restore();
            break;
          }
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  /** Screen-space emoji particles and floating text (outside the camera transform). */
  drawScreen(g: CanvasRenderingContext2D, cam: Camera) {
    for (const p of this.parts) {
      if (p.kind !== 'emoji') continue;
      const s = cam.worldToScreen(p.x, p.y - p.z);
      if (s.x < -40 || s.y < -40 || s.x > cam.w + 40 || s.y > cam.h + 40) continue;
      const k = p.life / p.max;
      g.globalAlpha = Math.min(1, k * 2.5);
      drawEmoji(g, p.emoji, s.x, s.y, p.size * (0.8 + 0.2 * Math.min(1, (1 - k) * 6)));
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const f of this.floaters) {
      const s = cam.worldToScreen(f.x, f.y - f.z);
      const k = f.t / f.life;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : k < 0.3 ? 1.2 - ((k - 0.15) / 0.15) * 0.2 : 1;
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.font = `700 ${Math.round(f.size * pop)}px Fredoka, system-ui, sans-serif`;
      const y = s.y - 26 * k - 10;
      g.strokeStyle = 'rgba(10,20,30,0.85)';
      g.lineWidth = 4;
      g.strokeText(f.text, s.x, y);
      g.fillStyle = f.color;
      g.fillText(f.text, s.x, y);
    }
    g.globalAlpha = 1;
  }
}
