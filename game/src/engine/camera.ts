import type { Vec2 } from './math';

/** 2D camera. (x, y) is the world point at the screen centre; zoom is screen px per world unit. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  w = 1;
  h = 1;
  minZoom = 0.05;
  maxZoom = 8;

  setViewport(w: number, h: number) {
    this.w = w;
    this.h = h;
  }
  worldToScreen(wx: number, wy: number): Vec2 {
    return { x: (wx - this.x) * this.zoom + this.w / 2, y: (wy - this.y) * this.zoom + this.h / 2 };
  }
  screenToWorld(sx: number, sy: number): Vec2 {
    return { x: (sx - this.w / 2) / this.zoom + this.x, y: (sy - this.h / 2) / this.zoom + this.y };
  }
  /** Multiply the camera transform onto the context (call inside save/restore). */
  apply(g: CanvasRenderingContext2D) {
    g.translate(this.w / 2, this.h / 2);
    g.scale(this.zoom, this.zoom);
    g.translate(-this.x, -this.y);
  }
  /** Zoom by factor keeping the world point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }
  /** Visible world rectangle (with optional margin in world units). */
  bounds(margin = 0) {
    const hw = this.w / 2 / this.zoom + margin, hh = this.h / 2 / this.zoom + margin;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
  isVisible(x: number, y: number, r = 0): boolean {
    const b = this.bounds(r);
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }
}
