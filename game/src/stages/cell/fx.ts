// Juice: pooled particles, floating number pops, shock rings, lightning arcs, screen shake and flashes.
import type { Camera } from '../../engine/camera';
import { TAU } from '../../engine/math';
import { glowSprite } from './sprites';

const enum PK { Dot, Bubble, Heart, Spark, Glow }

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; kind: PK; drag: number; grow: number;
}
interface Popup { x: number; y: number; text: string; color: string; life: number; big: boolean }
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; width: number }
interface Arc { x1: number; y1: number; x2: number; y2: number; life: number }

const MAX_P = 360;

export class Fx {
  private ps: Particle[] = [];
  private pops: Popup[] = [];
  private rings: Ring[] = [];
  private arcs: Arc[] = [];
  shakeAmp = 0;
  flashColor = '#ffffff';
  flashA = 0;
  hurtA = 0;
  reduced = false;

  clear() { this.ps.length = 0; this.pops.length = 0; this.rings.length = 0; this.arcs.length = 0; }

  private add(p: Particle) {
    if (this.ps.length >= MAX_P) this.ps[Math.floor(Math.random() * MAX_P)] = p;
    else this.ps.push(p);
  }

  burst(x: number, y: number, n: number, color: string, speed: number, size: number, kind: 'dot' | 'spark' | 'bubble' | 'heart' | 'glow' = 'dot', life = 0.7) {
    const k = kind === 'spark' ? PK.Spark : kind === 'bubble' ? PK.Bubble : kind === 'heart' ? PK.Heart : kind === 'glow' ? PK.Glow : PK.Dot;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.75);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.7), color, kind: k, drag: kind === 'bubble' ? 1.2 : 2.6, grow: kind === 'bubble' ? 0.6 : 0 });
    }
  }

  /** Bubbles rising gently (jet bursts, eating, hatching). */
  bubbles(x: number, y: number, n: number, size: number, dirX = 0, dirY = 0, speed = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this.add({ x: x + Math.cos(a) * size, y: y + Math.sin(a) * size, vx: dirX * speed * (0.5 + Math.random()) + Math.cos(a) * speed * 0.3, vy: dirY * speed * (0.5 + Math.random()) + Math.sin(a) * speed * 0.3 - speed * 0.2, life: 0.9 + Math.random() * 0.6, max: 1.4, size: size * (0.3 + Math.random() * 0.5), color: '#e6fbff', kind: PK.Bubble, drag: 1.6, grow: 0.3 });
    }
  }

  hearts(x: number, y: number, n: number, size: number) {
    for (let i = 0; i < n; i++) {
      this.add({ x: x + (Math.random() - 0.5) * size * 2, y: y + (Math.random() - 0.5) * size, vx: (Math.random() - 0.5) * size, vy: -size * (1 + Math.random()), life: 1.2 + Math.random() * 0.5, max: 1.6, size: size * (0.35 + Math.random() * 0.25), color: '#ff7ab8', kind: PK.Heart, drag: 0.8, grow: 0 });
    }
  }

  popup(x: number, y: number, text: string, color: string, big = false) {
    if (this.pops.length > 22) this.pops.shift();
    this.pops.push({ x, y, text, color, life: big ? 1.6 : 1.1, big });
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, life = 0.5, width = 3) {
    if (this.rings.length > 24) this.rings.shift();
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }

  arc(x1: number, y1: number, x2: number, y2: number, life = 0.22) {
    if (this.arcs.length > 30) this.arcs.shift();
    this.arcs.push({ x1, y1, x2, y2, life });
  }

  shake(amount: number) {
    if (this.reduced) return;
    this.shakeAmp = Math.min(18, Math.max(this.shakeAmp, amount));
  }

  flash(color: string, a: number) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }

  shakeOffset(t: number): { x: number; y: number } {
    if (this.shakeAmp < 0.05) return { x: 0, y: 0 };
    return { x: Math.sin(t * 91) * this.shakeAmp, y: Math.cos(t * 77) * this.shakeAmp };
  }

  update(dt: number) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      if (p.kind === PK.Bubble) p.vy -= 18 * dt * (p.size * 0.1 + 1);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += p.grow * p.size * dt;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life -= dt;
      if (p.life <= 0) this.pops.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= dt;
      if (a.life <= 0) this.arcs.splice(i, 1);
    }
    this.shakeAmp *= Math.exp(-9 * dt);
    this.flashA *= Math.exp(-3.2 * dt);
    this.hurtA *= Math.exp(-2.6 * dt);
  }

  /** World-space effects; call inside the camera transform. */
  renderWorld(g: CanvasRenderingContext2D, cam: Camera) {
    const b = cam.bounds(40 / cam.zoom);
    // Rings
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2));
      g.globalAlpha = (1 - k) * 0.9;
      g.strokeStyle = r.color;
      g.lineWidth = (r.width * (1 - k * 0.6)) / cam.zoom;
      g.beginPath();
      g.arc(r.x, r.y, rad, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
    // Particles
    for (const p of this.ps) {
      if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
      const a = Math.min(1, p.life / (p.max * 0.5));
      switch (p.kind) {
        case PK.Dot:
          g.globalAlpha = a;
          g.fillStyle = p.color;
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
          break;
        case PK.Spark: {
          g.globalAlpha = a;
          g.strokeStyle = p.color;
          g.lineWidth = Math.max(1 / cam.zoom, p.size * 0.5);
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); g.stroke();
          break;
        }
        case PK.Bubble:
          g.globalAlpha = a * 0.75;
          g.strokeStyle = p.color;
          g.lineWidth = Math.max(0.8 / cam.zoom, p.size * 0.18);
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.5)';
          g.beginPath(); g.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.25, 0, TAU); g.fill();
          break;
        case PK.Heart: {
          g.globalAlpha = a;
          g.fillStyle = p.color;
          const s = p.size;
          g.beginPath();
          g.moveTo(p.x, p.y + s * 0.7);
          g.bezierCurveTo(p.x - s * 1.2, p.y - s * 0.1, p.x - s * 0.5, p.y - s * 0.9, p.x, p.y - s * 0.35);
          g.bezierCurveTo(p.x + s * 0.5, p.y - s * 0.9, p.x + s * 1.2, p.y - s * 0.1, p.x, p.y + s * 0.7);
          g.fill();
          break;
        }
        case PK.Glow: {
          g.globalAlpha = a;
          const s = p.size * 2;
          g.globalCompositeOperation = 'lighter';
          g.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          g.globalCompositeOperation = 'source-over';
          break;
        }
      }
    }
    g.globalAlpha = 1;
    // Lightning arcs
    if (this.arcs.length) {
      g.globalCompositeOperation = 'lighter';
      for (const a of this.arcs) {
        const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        for (const [w, col] of [[5, 'rgba(92,200,255,0.35)'], [1.8, 'rgba(230,250,255,0.95)']] as const) {
          g.strokeStyle = col;
          g.lineWidth = w / cam.zoom;
          g.beginPath();
          g.moveTo(a.x1, a.y1);
          const seg = 7;
          for (let i = 1; i < seg; i++) {
            const k = i / seg, j = (Math.random() - 0.5) * len * 0.22;
            g.lineTo(a.x1 + dx * k + nx * j, a.y1 + dy * k + ny * j);
          }
          g.lineTo(a.x2, a.y2);
          g.stroke();
        }
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  /** Screen-space number pops. */
  renderScreen(g: CanvasRenderingContext2D, cam: Camera) {
    if (!this.pops.length) return;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of this.pops) {
      const max = p.big ? 1.6 : 1.1;
      const k = 1 - p.life / max;
      const s = cam.worldToScreen(p.x, p.y);
      const y = s.y - 18 - k * (p.big ? 50 : 34);
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
      g.globalAlpha = Math.min(1, (1 - k) * 2.2);
      g.font = `700 ${Math.round((p.big ? 24 : 17) * pop)}px Fredoka, system-ui, sans-serif`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,20,30,0.75)';
      g.strokeText(p.text, s.x, y);
      g.fillStyle = p.color;
      g.fillText(p.text, s.x, y);
    }
    g.globalAlpha = 1;
  }

  /** Full-screen flashes (level up, shards, finale). The hurt vignette is drawn by the backdrop's front buffer. */
  renderOverlay(g: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flashA > 0.02) {
      g.globalAlpha = Math.min(1, this.flashA);
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
  }
}
