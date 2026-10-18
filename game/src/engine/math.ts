// Small 2D math toolkit used everywhere. Plain objects, no classes, so data stays JSON-friendly.

export interface Vec2 {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export const v2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const norm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const fromAngle = (a: number, l = 1): Vec2 => ({ x: Math.cos(a) * l, y: Math.sin(a) * l });
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const rotate = (a: Vec2, r: number): Vec2 => {
  const c = Math.cos(r), s = Math.sin(r);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpV = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Wrap an angle to (-PI, PI]. */
export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
};
/** Rotate angle `a` toward `b` by at most `maxStep` radians. */
export const turnToward = (a: number, b: number, maxStep: number): number => {
  const d = wrapAngle(b - a);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
};
/** Frame-rate independent exponential approach. `rate` ~ 1/seconds. */
export const damp = (cur: number, target: number, rate: number, dt: number): number =>
  lerp(cur, target, 1 - Math.exp(-rate * dt));
export const approach = (cur: number, target: number, step: number): number =>
  cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Distance from point p to segment ab. */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2 : 0;
  t = clamp01(t);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

export const fmt = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString('en-US');
};
