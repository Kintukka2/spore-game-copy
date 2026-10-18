// Juice: pooled particles (smoke, fire, sparks, notes, rain, fireworks...), floating numbers and
// command markers. World-space particles are drawn by the renderer; texts are drawn in screen space.
import type { Camera } from '../../engine/camera';
import { drawIcon } from './sprites';

export enum P {
  Smoke, Ember, Fire, Note, Leaf, Splash, Rain, Spark, Heart, Dust, Fish, Star, Zzz, Fruit,
}

export interface Particle {
  k: P;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
  icon: string;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  big: boolean;
}

export interface Marker {
  x: number;
  y: number;
  life: number;
  icon: string;
  color: string;
  label: string;
}

const MAX_PARTS = 520;

export class Fx {
  parts: Particle[] = [];
  texts: FloatText[] = [];
  marks: Marker[] = [];
  /** Screen shake intensity (px). */
  shake = 0;
  private pool: Particle[] = [];

  add(k: P, x: number, y: number, o: Partial<Particle> = {}): Particle | null {
    if (this.parts.length >= MAX_PARTS) return null;
    const p = this.pool.pop() ?? ({} as Particle);
    p.k = k; p.x = x; p.y = y; p.z = o.z ?? 0;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.max = p.life = o.life ?? 1;
    p.size = o.size ?? 4;
    p.color = o.color ?? '#fff';
    p.icon = o.icon ?? '';
    this.parts.push(p);
    return p;
  }

  burst(k: P, x: number, y: number, n: number, o: { speed?: number; up?: number; life?: number; size?: number; color?: string | string[]; icon?: string; z?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 40) * (0.4 + Math.random() * 0.8);
      const col = Array.isArray(o.color) ? o.color[i % o.color.length] : o.color;
      this.add(k, x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: (o.up ?? 30) * (0.5 + Math.random()),
        life: (o.life ?? 0.8) * (0.7 + Math.random() * 0.6), size: (o.size ?? 3) * (0.7 + Math.random() * 0.6), color: col, icon: o.icon, z: o.z ?? 0,
      });
    }
  }

  text(x: number, y: number, text: string, color = '#ffffff', big = false) {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x, y, text, color, life: big ? 2 : 1.4, max: big ? 2 : 1.4, big });
  }

  mark(x: number, y: number, icon: string, label: string, color = '#3ee6c4') {
    if (this.marks.length > 6) this.marks.shift();
    this.marks.push({ x, y, life: 1.1, icon, color, label });
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
      switch (p.k) {
        case P.Smoke: p.vx += 6 * dt; p.size += 9 * dt; break;
        case P.Ember: case P.Spark: case P.Splash: case P.Fruit: case P.Fish:
          p.vz -= (p.k === P.Spark ? 60 : 160) * dt;
          if (p.z < 0 && p.k !== P.Spark) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; }
          break;
        case P.Fire: p.size *= 1 - 1.2 * dt; break;
        case P.Note: case P.Heart: case P.Zzz: p.vx = Math.sin(p.life * 5 + p.x) * 12; break;
        case P.Leaf: p.vx = Math.sin(p.life * 4) * 20; p.vz -= 10 * dt; if (p.z < 0) { p.z = 0; p.vz = 0; p.vx = 0; } break;
        case P.Rain: if (p.z <= 0) { p.life = 0; } break;
        case P.Dust: p.size += 14 * dt; break;
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= (t.big ? 18 : 26) * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i].life -= dt;
      if (this.marks[i].life <= 0) this.marks.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  /** World-space particles (call inside the camera transform). */
  draw(g: CanvasRenderingContext2D, cam: Camera, t: number) {
    const b = cam.bounds(60);
    let additive = false;
    const setAdd = (on: boolean) => {
      if (on !== additive) { g.globalCompositeOperation = on ? 'lighter' : 'source-over'; additive = on; }
    };
    for (const p of this.parts) {
      if (p.x < b.x0 || p.x > b.x1 || p.y - p.z < b.y0 || p.y > b.y1 + 80) continue;
      const a = Math.min(1, p.life / p.max * 1.6);
      const y = p.y - p.z;
      switch (p.k) {
        case P.Smoke:
          setAdd(false);
          g.globalAlpha = a * 0.35;
          g.fillStyle = p.color;
          g.beginPath(); g.arc(p.x, y, p.size, 0, 6.283); g.fill();
          break;
        case P.Fire: case P.Ember: case P.Spark: case P.Star:
          setAdd(true);
          g.globalAlpha = a;
          g.fillStyle = p.color;
          g.beginPath(); g.arc(p.x, y, p.size, 0, 6.283); g.fill();
          break;
        case P.Rain:
          setAdd(false);
          g.globalAlpha = 0.55;
          g.strokeStyle = '#cfe8ff';
          g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(p.x, y); g.lineTo(p.x - 2, y - 12); g.stroke();
          break;
        case P.Splash: case P.Dust: case P.Leaf: case P.Fruit:
          setAdd(false);
          g.globalAlpha = p.k === P.Dust ? a * 0.4 : a;
          g.fillStyle = p.color;
          g.beginPath();
          if (p.k === P.Leaf) g.ellipse(p.x, y, p.size, p.size * 0.5, p.life * 3, 0, 6.283);
          else g.arc(p.x, y, p.size, 0, 6.283);
          g.fill();
          break;
        case P.Note: case P.Heart: case P.Fish: case P.Zzz:
          setAdd(false);
          g.globalAlpha = a;
          drawIcon(g, p.icon, p.x, y, p.size);
          break;
      }
    }
    setAdd(false);
    g.globalAlpha = 1;
    // command markers
    for (const m of this.marks) {
      const k = m.life / 1.1;
      g.globalAlpha = Math.min(1, k * 2);
      g.strokeStyle = m.color;
      g.lineWidth = 3 / cam.zoom;
      g.beginPath();
      g.ellipse(m.x, m.y, 10 + 22 * k, (10 + 22 * k) * 0.45, 0, 0, 6.283);
      g.stroke();
      g.beginPath();
      g.ellipse(m.x, m.y, 6 + 10 * k * k, (6 + 10 * k * k) * 0.45, 0, 0, 6.283);
      g.stroke();
      const bob = Math.sin(t * 8) * 2;
      drawIcon(g, m.icon, m.x, m.y - 30 - (1 - k) * 10 + bob, 22 / Math.max(0.6, cam.zoom));
    }
    g.globalAlpha = 1;
  }

  /** Screen-space floating texts and marker labels. */
  drawTexts(g: CanvasRenderingContext2D, cam: Camera) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const t of this.texts) {
      const s = cam.worldToScreen(t.x, t.y);
      if (s.x < -60 || s.y < -40 || s.x > cam.w + 60 || s.y > cam.h + 40) continue;
      const k = t.life / t.max;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      g.globalAlpha = Math.min(1, k * 2.5);
      g.font = `700 ${Math.round((t.big ? 22 : 15) * pop)}px Fredoka, ui-rounded, system-ui, sans-serif`;
      g.strokeStyle = 'rgba(20,12,4,0.85)';
      g.lineWidth = 4;
      g.strokeText(t.text, s.x, s.y);
      g.fillStyle = t.color;
      g.fillText(t.text, s.x, s.y);
    }
    for (const m of this.marks) {
      if (!m.label) continue;
      const s = cam.worldToScreen(m.x, m.y);
      const k = m.life / 1.1;
      g.globalAlpha = Math.min(1, k * 2);
      g.font = '700 13px Fredoka, ui-rounded, system-ui, sans-serif';
      const wdt = g.measureText(m.label).width + 14;
      g.fillStyle = 'rgba(8,18,30,0.75)';
      g.beginPath();
      g.roundRect(s.x - wdt / 2, s.y + 14, wdt, 20, 10);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText(m.label, s.x, s.y + 24.5);
    }
    g.globalAlpha = 1;
  }
}
