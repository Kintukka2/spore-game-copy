// Unified pointer/touch/keyboard input with a handler stack and built-in gestures (tap, drag, pinch, wheel).
// Coordinates are CSS pixels relative to the canvas (screen space).

export interface PointerInfo {
  id: number;
  x: number;
  y: number;
  /** start position */
  sx: number;
  sy: number;
  /** previous position (for deltas) */
  px: number;
  py: number;
  t0: number;
  moved: boolean;
  button: number;
}

export interface InputHandler {
  /** Return true to claim this pointer; all its move/up events then go only to this handler. */
  onPointerDown?(p: PointerInfo): boolean | void;
  onPointerMove?(p: PointerInfo): void;
  onPointerUp?(p: PointerInfo): void;
  /** Gesture callbacks (delivered when the handler did not claim the raw pointer). */
  onTap?(x: number, y: number, p: PointerInfo): void;
  onLongPress?(x: number, y: number): void;
  onDragStart?(p: PointerInfo): void;
  onDrag?(p: PointerInfo, dx: number, dy: number): void;
  onDragEnd?(p: PointerInfo): void;
  /** factor >1 = zoom in; center in screen px */
  onPinch?(factor: number, cx: number, cy: number): void;
  onWheel?(deltaY: number, x: number, y: number): void;
  onKey?(key: string, down: boolean): void;
}

const TAP_MOVE = 12;
const TAP_TIME = 350;
const LONG_PRESS = 550;

export class Input {
  readonly pointers = new Map<number, PointerInfo>();
  readonly keys = new Set<string>();
  private stack: InputHandler[] = [];
  private owner = new Map<number, InputHandler | 'gesture'>();
  private gestureTarget: InputHandler | null = null;
  private pinchDist = 0;
  private longTimer: number | null = null;
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.el.getBoundingClientRect();
      this.top()?.onWheel?.(e.deltaY, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) {
        this.keys.add(k);
        for (let i = this.stack.length - 1; i >= 0; i--) this.stack[i].onKey?.(k, true);
      }
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      for (let i = this.stack.length - 1; i >= 0; i--) this.stack[i].onKey?.(k, false);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Push a handler on top of the stack. Returns a function that removes it. */
  push(h: InputHandler): () => void {
    this.stack.push(h);
    return () => this.remove(h);
  }
  remove(h: InputHandler) {
    const i = this.stack.indexOf(h);
    if (i >= 0) this.stack.splice(i, 1);
    for (const [id, o] of this.owner) if (o === h) this.owner.delete(id);
    if (this.gestureTarget === h) this.gestureTarget = null;
  }
  /** Detach and return the whole handler stack (used when an overlay scene takes over). */
  suspend(): InputHandler[] {
    const s = this.stack.slice();
    this.stack.length = 0;
    this.owner.clear();
    this.pointers.clear();
    this.gestureTarget = null;
    return s;
  }
  restore(stack: InputHandler[]) {
    this.stack = stack.slice();
    this.owner.clear();
    this.pointers.clear();
    this.gestureTarget = null;
  }
  clear() {
    this.stack.length = 0;
    this.owner.clear();
    this.pointers.clear();
    this.gestureTarget = null;
  }
  private top(): InputHandler | undefined {
    return this.stack[this.stack.length - 1];
  }
  isDown(k: string): boolean {
    return this.keys.has(k);
  }

  private pos(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent) {
    const { x, y } = this.pos(e);
    const p: PointerInfo = { id: e.pointerId, x, y, sx: x, sy: y, px: x, py: y, t0: performance.now(), moved: false, button: e.button };
    this.pointers.set(e.pointerId, p);
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const h = this.stack[i];
      if (h.onPointerDown?.(p) === true) {
        this.owner.set(p.id, h);
        return;
      }
    }
    // Unclaimed: route to gestures of the topmost handler.
    this.owner.set(p.id, 'gesture');
    this.gestureTarget = this.top() ?? null;
    const gp = this.gesturePointers();
    if (gp.length === 2) {
      this.pinchDist = Math.hypot(gp[0].x - gp[1].x, gp[0].y - gp[1].y);
      this.cancelLong();
    } else if (gp.length === 1) {
      this.cancelLong();
      this.longTimer = window.setTimeout(() => {
        const q = this.pointers.get(p.id);
        if (q && !q.moved) this.gestureTarget?.onLongPress?.(q.x, q.y);
        this.longTimer = null;
      }, LONG_PRESS);
    }
  }

  private gesturePointers(): PointerInfo[] {
    const out: PointerInfo[] = [];
    for (const [id, o] of this.owner) if (o === 'gesture') { const p = this.pointers.get(id); if (p) out.push(p); }
    return out;
  }

  private cancelLong() {
    if (this.longTimer !== null) { clearTimeout(this.longTimer); this.longTimer = null; }
  }

  private move(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const { x, y } = this.pos(e);
    p.px = p.x; p.py = p.y;
    p.x = x; p.y = y;
    const own = this.owner.get(p.id);
    if (!p.moved && Math.hypot(x - p.sx, y - p.sy) > TAP_MOVE) {
      p.moved = true;
      this.cancelLong();
      if (own === 'gesture' && this.gesturePointers().length === 1) this.gestureTarget?.onDragStart?.(p);
    }
    if (own && own !== 'gesture') { own.onPointerMove?.(p); return; }
    if (own !== 'gesture') return;
    const gp = this.gesturePointers();
    if (gp.length >= 2) {
      const d = Math.hypot(gp[0].x - gp[1].x, gp[0].y - gp[1].y);
      if (this.pinchDist > 0 && d > 0) {
        this.gestureTarget?.onPinch?.(d / this.pinchDist, (gp[0].x + gp[1].x) / 2, (gp[0].y + gp[1].y) / 2);
      }
      this.pinchDist = d;
    } else if (p.moved) {
      this.gestureTarget?.onDrag?.(p, p.x - p.px, p.y - p.py);
    }
  }

  private up(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const own = this.owner.get(p.id);
    this.owner.delete(p.id);
    this.pointers.delete(p.id);
    if (own && own !== 'gesture') { own.onPointerUp?.(p); return; }
    if (own !== 'gesture') return;
    this.cancelLong();
    const remaining = this.gesturePointers().length;
    if (!p.moved && performance.now() - p.t0 < TAP_TIME && remaining === 0) {
      this.gestureTarget?.onTap?.(p.x, p.y, p);
    } else if (p.moved && remaining === 0) {
      this.gestureTarget?.onDragEnd?.(p);
    }
    if (remaining < 2) this.pinchDist = 0;
  }
}
