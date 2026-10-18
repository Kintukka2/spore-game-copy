// Touch controls for the island: a floating joystick that appears where a drag starts (with a ghost
// stick at the bottom-left as a resting hint), quick taps for targeting / tap-to-move, two-finger
// pinch and mouse wheel to zoom. Keyboard WASD/arrows feed the same vector.
import type { Input, PointerInfo } from '../../engine/input';
import { TAU } from '../../engine/math';

interface Ptr { id: number; x: number; y: number; sx: number; sy: number; t0: number; mode: 'pending' | 'stick' | 'pinch' }

const TAP_MOVE = 12;
const TAP_MS = 380;

export class Controls {
  vec = { x: 0, y: 0 };
  private ptrs = new Map<number, Ptr>();
  private stickId = -1;
  private origin = { x: 0, y: 0 };
  private knob = { x: 0, y: 0 };
  private pinchD = 0;
  enabled = true;
  readonly radius = 56;
  w = 390;
  h = 844;

  constructor(
    private input: Input,
    private onTap: (x: number, y: number) => void,
    private onZoom: (factor: number, cx: number, cy: number) => void,
  ) {}

  get stickActive() { return this.stickId >= 0; }

  down(p: PointerInfo): boolean {
    if (!this.enabled) return false;
    if (p.y < 58) return false;
    const ptr: Ptr = { id: p.id, x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), mode: 'pending' };
    this.ptrs.set(p.id, ptr);
    // A second free finger turns both into a pinch (unless one is already steering).
    const free = [...this.ptrs.values()].filter((q) => q.mode !== 'stick');
    if (free.length === 2 && this.stickId < 0) {
      for (const q of free) q.mode = 'pinch';
      this.pinchD = Math.hypot(free[0].x - free[1].x, free[0].y - free[1].y);
    }
    return true;
  }

  move(p: PointerInfo) {
    const q = this.ptrs.get(p.id);
    if (!q) return;
    q.x = p.x; q.y = p.y;
    if (q.mode === 'pending' && Math.hypot(q.x - q.sx, q.y - q.sy) > TAP_MOVE && this.stickId < 0) {
      q.mode = 'stick';
      this.stickId = q.id;
      this.origin = { x: q.sx, y: q.sy };
    }
    if (q.mode === 'stick') {
      const dx = q.x - this.origin.x, dy = q.y - this.origin.y;
      const d = Math.hypot(dx, dy), r = this.radius;
      if (d > r * 1.5) {
        const pull = (d - r * 1.5) / d;
        this.origin.x += dx * pull;
        this.origin.y += dy * pull;
      }
      const ex = q.x - this.origin.x, ey = q.y - this.origin.y, e = Math.hypot(ex, ey);
      const k = e > r ? r / e : 1;
      this.knob = { x: this.origin.x + ex * k, y: this.origin.y + ey * k };
      this.vec = { x: (ex * k) / r, y: (ey * k) / r };
    } else if (q.mode === 'pinch') {
      const ps = [...this.ptrs.values()].filter((o) => o.mode === 'pinch');
      if (ps.length === 2) {
        const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        if (this.pinchD > 0 && d > 0) this.onZoom(d / this.pinchD, (ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2);
        this.pinchD = d;
      }
    }
  }

  up(p: PointerInfo) {
    const q = this.ptrs.get(p.id);
    if (!q) return;
    this.ptrs.delete(p.id);
    if (q.mode === 'stick') {
      this.stickId = -1;
      this.vec = { x: 0, y: 0 };
    } else if (q.mode === 'pending' && performance.now() - q.t0 < TAP_MS && Math.hypot(q.x - q.sx, q.y - q.sy) <= TAP_MOVE) {
      this.onTap(q.x, q.y);
    } else if (q.mode === 'pinch') {
      for (const o of this.ptrs.values()) if (o.mode === 'pinch') o.mode = 'pending';
      this.pinchD = 0;
    }
  }

  reset() {
    this.ptrs.clear();
    this.stickId = -1;
    this.vec = { x: 0, y: 0 };
  }

  /** Steering vector 0..1 from touch or keyboard. */
  value(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    if (this.stickId >= 0) return this.vec;
    let x = 0, y = 0;
    const k = this.input.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  render(g: CanvasRenderingContext2D, safeBottom: number) {
    const r = this.radius;
    g.save();
    if (this.stickId >= 0) {
      g.globalAlpha = 0.55;
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(this.origin.x, this.origin.y, r, 0, TAU); g.fill(); g.stroke();
      g.globalAlpha = 0.9;
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); g.arc(this.knob.x, this.knob.y, r * 0.42, 0, TAU); g.fill();
    } else if (this.enabled) {
      // Ghost stick: where the left thumb naturally rests.
      const x = 22 + r, y = this.h - safeBottom - 30 - r;
      g.globalAlpha = 0.22;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.setLineDash([6, 6]);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.arc(x, y, r * 0.38, 0, TAU); g.fill();
    }
    g.restore();
  }
}
