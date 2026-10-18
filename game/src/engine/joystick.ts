import type { Input, InputHandler, PointerInfo } from './input';

export interface JoystickOptions {
  /** Fraction of screen width (from the left) where a touch starts the stick. 1 = anywhere. */
  zoneX?: number;
  /** Ignore touches above this many px from the top (HUD area). */
  topInset?: number;
  radius?: number;
}

/**
 * Floating virtual joystick. Touch anywhere in its zone to spawn it; drag to steer.
 * Keyboard (WASD / arrows) also feeds `vec` so desktop testing works.
 */
export class Joystick implements InputHandler {
  vec = { x: 0, y: 0 };
  active = false;
  enabled = true;
  private origin = { x: 0, y: 0 };
  private knob = { x: 0, y: 0 };
  private pid = -1;
  private opts: Required<JoystickOptions>;
  private detach: () => void;
  private input: Input;
  private w = 0;

  constructor(input: Input, opts: JoystickOptions = {}) {
    this.input = input;
    this.opts = { zoneX: opts.zoneX ?? 0.6, topInset: opts.topInset ?? 70, radius: opts.radius ?? 56 };
    this.detach = input.push(this);
  }
  setViewportWidth(w: number) { this.w = w; }
  destroy() { this.detach(); }

  onPointerDown(p: PointerInfo): boolean {
    if (!this.enabled || this.active) return false;
    if (p.y < this.opts.topInset) return false;
    if (this.w && p.x > this.w * this.opts.zoneX) return false;
    this.active = true;
    this.pid = p.id;
    this.origin = { x: p.x, y: p.y };
    this.knob = { x: p.x, y: p.y };
    this.vec = { x: 0, y: 0 };
    return true;
  }
  onPointerMove(p: PointerInfo) {
    if (p.id !== this.pid) return;
    const dx = p.x - this.origin.x, dy = p.y - this.origin.y;
    const d = Math.hypot(dx, dy), r = this.opts.radius;
    const k = d > r ? r / d : 1;
    this.knob = { x: this.origin.x + dx * k, y: this.origin.y + dy * k };
    // Let the base trail the finger a little when pulled far, like modern mobile games.
    if (d > r * 1.6) {
      const pull = (d - r * 1.6) / d;
      this.origin.x += dx * pull;
      this.origin.y += dy * pull;
    }
    this.vec = { x: (dx * k) / r, y: (dy * k) / r };
  }
  onPointerUp(p: PointerInfo) {
    if (p.id !== this.pid) return;
    this.active = false;
    this.pid = -1;
    this.vec = { x: 0, y: 0 };
  }

  /** Current steering vector, magnitude 0..1, including keyboard. */
  get value(): { x: number; y: number } {
    if (this.active) return this.vec;
    let x = 0, y = 0;
    const k = this.input.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  render(g: CanvasRenderingContext2D) {
    if (!this.active) return;
    const r = this.opts.radius;
    g.save();
    g.globalAlpha = 0.5;
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(this.origin.x, this.origin.y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.globalAlpha = 0.85;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(this.knob.x, this.knob.y, r * 0.42, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}
