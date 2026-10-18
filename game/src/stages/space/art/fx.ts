// Pooled particle effects: thruster trails, sparks, smoke, explosions, shockwave rings, beams.
import { TAU } from '../../../engine/math';
import { blit, glow } from './sprites';

interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; grow: number;
  color: string; kind: 0 | 1 | 2; drag: number;
}
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; w: number }
interface Beam { x0: number; y0: number; x1: number; y1: number; life: number; max: number; color: string; w: number }

const MAX = 900;

export class Fx {
  private pool: P[] = [];
  private live: P[] = [];
  rings: Ring[] = [];
  beams: Beam[] = [];
  shake = 0;
  flashA = 0;
  flashColor = '#ffffff';

  private take(): P | null {
    if (this.live.length >= MAX) return null;
    return this.pool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, grow: 0, color: '#fff', kind: 0, drag: 0 };
  }

  /** kind 0 = additive glow, 1 = spark streak, 2 = smoke (normal blend). */
  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind: 0 | 1 | 2 = 0, drag = 0, grow = 0) {
    const p = this.take();
    if (!p) return;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color; p.kind = kind; p.drag = drag; p.grow = grow;
    this.live.push(p);
  }

  explosion(x: number, y: number, scale = 1, color = '#ffb347') {
    const n = Math.round(26 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = (60 + Math.random() * 260) * scale;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.5, 2 + Math.random() * 2.5 * scale, i % 3 === 0 ? '#ffffff' : color, 1, 2.2);
    }
    for (let i = 0; i < 10 * scale; i++) {
      const a = Math.random() * TAU, s = Math.random() * 60 * scale;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.6 + Math.random() * 0.6, (10 + Math.random() * 14) * scale, color, 0, 1.5, 30 * scale);
    }
    for (let i = 0; i < 8 * scale; i++) {
      const a = Math.random() * TAU, s = Math.random() * 40 * scale;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 1.2 + Math.random() * 0.8, (8 + Math.random() * 10) * scale, 'rgba(60,55,70,0.5)', 2, 1, 22 * scale);
    }
    this.ring(x, y, 6 * scale, 90 * scale, 0.45, color, 4 * scale);
    this.shake = Math.max(this.shake, 6 * scale);
  }

  ring(x: number, y: number, r0: number, r1: number, life: number, color: string, w = 3) {
    if (this.rings.length > 60) this.rings.shift();
    this.rings.push({ x, y, r0, r1, life, max: life, color, w });
  }

  beam(x0: number, y0: number, x1: number, y1: number, color: string, w = 3, life = 0.08) {
    if (this.beams.length > 60) this.beams.shift();
    this.beams.push({ x0, y0, x1, y1, life, max: life, color, w });
  }

  screenFlash(color: string, a = 0.6) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  }

  clear() {
    for (const p of this.live) this.pool.push(p);
    this.live.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
  }

  update(dt: number) {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) {
        live[i] = live[live.length - 1];
        live.pop();
        this.pool.push(p);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) if ((this.rings[i].life -= dt) <= 0) this.rings.splice(i, 1);
    for (let i = this.beams.length - 1; i >= 0; i--) if ((this.beams[i].life -= dt) <= 0) this.beams.splice(i, 1);
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
  }

  /** Draw in world space (camera transform applied). `zoom` keeps lines readable. */
  draw(g: CanvasRenderingContext2D, zoom = 1) {
    // Smoke first (normal blend), then additive light.
    for (const p of this.live) {
      if (p.kind !== 2) continue;
      g.globalAlpha = (p.life / p.max) * 0.8;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    for (const p of this.live) {
      const a = p.life / p.max;
      if (p.kind === 0) {
        g.globalAlpha = a;
        blit(g, glow(p.color, 24), p.x, p.y, p.size * 2);
      } else if (p.kind === 1) {
        g.globalAlpha = a;
        g.strokeStyle = p.color;
        g.lineWidth = p.size / Math.max(0.6, zoom * 0.9);
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        g.stroke();
      }
    }
    for (const b of this.beams) {
      const a = b.life / b.max;
      g.globalAlpha = a;
      g.lineCap = 'round';
      g.strokeStyle = b.color;
      g.lineWidth = (b.w * 3) / Math.max(0.5, zoom);
      g.globalAlpha = a * 0.35;
      g.beginPath(); g.moveTo(b.x0, b.y0); g.lineTo(b.x1, b.y1); g.stroke();
      g.globalAlpha = a;
      g.lineWidth = b.w / Math.max(0.5, zoom);
      g.strokeStyle = '#ffffff';
      g.beginPath(); g.moveTo(b.x0, b.y0); g.lineTo(b.x1, b.y1); g.stroke();
    }
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      g.globalAlpha = (1 - t) * 0.9;
      g.strokeStyle = r.color;
      g.lineWidth = r.w * (1 - t * 0.6);
      g.beginPath();
      g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t)), 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** Full-screen flash overlay (screen space). */
  drawFlash(g: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flashA <= 0.01) return;
    g.globalAlpha = this.flashA;
    g.fillStyle = this.flashColor;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
  }
}
