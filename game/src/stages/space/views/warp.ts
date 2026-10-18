// Warp-jump transition: radial star streaks accelerating out of the screen centre.
import { TAU, clamp } from '../../../engine/math';
import { hexToRgb } from '../../../design/color';
import { blit, glow } from '../art/sprites';
import { drawShip } from '../art/shipArt';
import type { Design } from '../../../design/types';

interface Streak { a: number; d: number; v: number; len: number; w: number }

export class WarpFx {
  t = 0;
  dur = 1;
  active = false;
  color = '#9fd8ff';
  label = '';
  sub = '';
  private streaks: Streak[] = [];
  onDone: (() => void) | null = null;

  start(dur: number, color: string, label: string, sub: string, onDone: () => void) {
    this.t = 0;
    this.dur = dur;
    this.active = true;
    this.color = color;
    this.label = label;
    this.sub = sub;
    this.onDone = onDone;
    this.streaks = [];
    for (let i = 0; i < 170; i++) this.streaks.push({ a: Math.random() * TAU, d: Math.random() * 600, v: 0.4 + Math.random() * 1.2, len: 0, w: 0.6 + Math.random() * 1.6 });
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const k = clamp(this.t / this.dur, 0, 1);
    const speed = 200 + 2600 * Math.sin(k * Math.PI);
    for (const s of this.streaks) {
      s.d += speed * s.v * dt;
      s.len = speed * s.v * 0.06;
      if (s.d > 900) { s.d = Math.random() * 40; s.a = Math.random() * TAU; }
    }
    if (this.t >= this.dur) {
      this.active = false;
      const f = this.onDone;
      this.onDone = null;
      f?.();
    }
  }

  render(g: CanvasRenderingContext2D, W: number, H: number, ship: Design | null) {
    const k = clamp(this.t / this.dur, 0, 1);
    const cx = W / 2, cy = H / 2;
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    const [r, gg, b] = hexToRgb(this.color);
    bg.addColorStop(0, `rgba(${r},${gg},${b},${0.25 + Math.sin(k * Math.PI) * 0.3})`);
    bg.addColorStop(0.4, '#070a1c');
    bg.addColorStop(1, '#020309');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const s of this.streaks) {
      const ca = Math.cos(s.a), sa = Math.sin(s.a);
      const d0 = s.d, d1 = s.d + s.len;
      const al = clamp(s.d / 200, 0, 1);
      g.strokeStyle = `rgba(${Math.min(255, r + 80)},${Math.min(255, gg + 80)},${Math.min(255, b + 80)},${al * 0.8})`;
      g.lineWidth = s.w * (1 + s.d / 400);
      g.beginPath();
      g.moveTo(cx + ca * d0, cy + sa * d0);
      g.lineTo(cx + ca * d1, cy + sa * d1);
      g.stroke();
    }
    blit(g, glow(this.color, 64), cx, cy, 90 + Math.sin(k * Math.PI) * 60);
    g.globalCompositeOperation = 'source-over';
    if (ship) drawShip(g, ship, cx, cy, -Math.PI / 2 + Math.sin(this.t * 3) * 0.04, 0.9, this.t, { thrust: 1 });
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = '700 20px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = clamp(Math.sin(k * Math.PI) * 2, 0, 1);
    g.fillText(this.label, cx, cy + 120);
    g.font = '500 13px Fredoka, system-ui, sans-serif';
    g.fillStyle = 'rgba(200,220,255,0.8)';
    g.fillText(this.sub, cx, cy + 146);
    g.globalAlpha = 1;
    // Exit flash
    if (k > 0.85) {
      g.fillStyle = `rgba(255,255,255,${(k - 0.85) / 0.15 * 0.85})`;
      g.fillRect(0, 0, W, H);
    }
  }
}
