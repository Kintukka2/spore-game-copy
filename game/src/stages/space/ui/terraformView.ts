// Terraforming: a focused full-screen view of one world. Every tool plays out on the globe (storm pods seed
// cyclones, meteors crater the crust, comets frost the poles, the ship's engines and lances work the sky), and
// the climate chart shows where each one pushes the world before you fire it. The globe follows the numbers as
// they change: cross a T ring and the planet visibly turns.
import { button, h, ui } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { TAU, clamp } from '../../../engine/math';
import { T_RING, tScoreOf } from '../data';
import { drawPlanet, SphereSprite, styleFor, type PlanetLook } from '../art/planetArt';
import { blit, glow } from '../art/sprites';
import { drawShip, shipLength } from '../art/shipArt';
import { genesis, terraform, type TerraTool } from '../economy';
import type { World } from '../world';
import type { SpaceStage } from '../stage';

export interface TerraDef {
  id: TerraTool | 'genesis';
  /** The tool it needs: a consumable spent per use, or a unique tool that costs energy. */
  item: string;
  name: string;
  icon: string;
  /** Which way it pushes the dot on the climate chart (atmosphere across, temperature up). */
  arrow: string;
  axis: string;
  da: number;
  dt: number;
  color: string;
  blurb: string;
}

export const TERRA_TOOLS: TerraDef[] = [
  { id: 'stormpod', item: 'stormpod', name: 'Storm Pod', icon: '🌧️', arrow: '→', axis: 'Air', da: 0.11, dt: 0, color: '#8fd0ff', blurb: 'Seeds a world-wide storm. The sky thickens.' },
  { id: 'droughtpod', item: 'droughtpod', name: 'Drought Pod', icon: '🏜️', arrow: '←', axis: 'Air', da: -0.11, dt: 0, color: '#ffc46a', blurb: 'A shockwave boils the sky off into space.' },
  { id: 'meteor', item: 'meteor', name: 'Meteor Call', icon: '☄️', arrow: '↑', axis: 'Heat', da: 0, dt: 0.11, color: '#ff8a4c', blurb: 'Calls down a meteor shower. The impacts heat the crust.' },
  { id: 'icecomet', item: 'icecomet', name: 'Ice Comet', icon: '🧊', arrow: '↓', axis: 'Heat', da: 0, dt: -0.11, color: '#9fe0ff', blurb: 'Drops a frozen comet. Frost spreads over the world.' },
  { id: 'atm+', item: 'cloudengine', name: 'Cloud Engine', icon: '🌀', arrow: '→', axis: 'Air', da: 0.045, dt: 0, color: '#8fd0ff', blurb: 'Your ship vents vapour into the sky. A gentle push.' },
  { id: 'atm-', item: 'cloudengine', name: 'Cloud Siphon', icon: '🌀', arrow: '←', axis: 'Air', da: -0.045, dt: 0, color: '#ffc46a', blurb: 'Your ship drinks the sky. A gentle pull.' },
  { id: 'temp+', item: 'thermlance', name: 'Heat Lance', icon: '🔥', arrow: '↑', axis: 'Heat', da: 0, dt: 0.045, color: '#ff8a4c', blurb: 'Your ship burns a line across the crust.' },
  { id: 'temp-', item: 'thermlance', name: 'Frost Lance', icon: '❄️', arrow: '↓', axis: 'Heat', da: 0, dt: -0.045, color: '#9fe0ff', blurb: 'Your ship freezes a line across the crust.' },
  { id: 'genesis', item: 'genesis', name: 'Genesis Seed', icon: '🌱', arrow: '◎', axis: 'T3', da: 0, dt: 0, color: '#7bd389', blurb: 'Ori\'s gift. The world becomes a T3 paradise, full of life.' },
];

const ENERGY = 8;

/** "→ Air +11%": which way a tool moves the chart dot, and how far. */
export function terraTag(d: TerraDef): string {
  if (d.id === 'genesis') return '◎ T3';
  const v = d.da || d.dt;
  return `${d.arrow} ${d.axis} ${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
}

/** Whether a tool shows, whether it can fire now, its count or cost, and why not. */
export function terraState(w: World, d: TerraDef): { show: boolean; ok: boolean; n: string; why: string } {
  if (d.item === 'cloudengine' || d.item === 'thermlance') {
    return { show: w.has(d.item), ok: w.s.energy >= ENERGY, n: `⚡${ENERGY}`, why: 'Not enough energy. Recharge at a friendly dock.' };
  }
  const n = w.count(d.item);
  return { show: d.id !== 'genesis' || n > 0, ok: n > 0, n: `×${n}`, why: `No ${d.name}s left. Buy more at your tool shop.` };
}

/** Where a tool would leave the world on the chart. */
export function terraTarget(d: TerraDef, atm: number, temp: number): { a: number; t: number } {
  if (d.id === 'genesis') return { a: 0.5, t: 0.5 };
  return { a: clamp(atm + d.da, 0, 1), t: clamp(temp + d.dt, 0, 1) };
}

// ------------------------------------------------------------------ climate chart
export interface ChartOpts {
  /** A predicted move: an arrow from `from` (or the dot) to here. */
  arrow?: { a: number; t: number; color: string } | null;
  from?: { a: number; t: number };
  /** Past positions as [atm, temp, atm, temp, ...]. */
  trail?: number[];
}

/** The climate chart: atmosphere across, temperature up, the T rings in the middle and the world as a dot. */
export function drawClimate(c: HTMLCanvasElement, atm: number, temp: number, time: number, o: ChartOpts = {}) {
  if (!c.isConnected) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const S = c.clientWidth || 220;
  if (c.width !== Math.round(S * dpr)) { c.width = Math.round(S * dpr); c.height = Math.round(S * dpr); }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, S, S);
  const pad = Math.max(15, S * 0.08), A = S - pad * 2;
  const X = (v: number) => pad + v * A, Y = (v: number) => pad + (1 - v) * A;
  // Cold at the bottom, hot at the top; thin on the left, dense on the right.
  const bg = g.createLinearGradient(0, Y(0), 0, Y(1));
  bg.addColorStop(0, 'rgba(90,168,255,0.16)');
  bg.addColorStop(0.5, 'rgba(255,255,255,0.03)');
  bg.addColorStop(1, 'rgba(255,106,42,0.18)');
  g.fillStyle = bg;
  g.fillRect(pad, pad, A, A);
  const cols = ['rgba(255,209,102,0.12)', 'rgba(124,220,140,0.18)', 'rgba(76,217,123,0.32)'];
  const small = S < 160;
  g.textAlign = 'center';
  for (let i = 0; i < 3; i++) {
    g.fillStyle = cols[i];
    g.beginPath(); g.arc(X(0.5), Y(0.5), T_RING[i] * A, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = `600 ${small ? 9 : 10}px Fredoka, system-ui`;
    g.fillText(`T${i + 1}`, X(0.5), Y(0.5) - T_RING[i] * A + (small ? 9 : 11));
  }
  g.fillStyle = 'rgba(200,220,240,0.75)';
  g.font = `600 ${small ? 10 : 11}px Fredoka, system-ui`;
  g.fillText(small ? 'Air →' : 'Atmosphere →', S / 2, S - 3);
  g.save(); g.translate(small ? 9 : 10, S / 2); g.rotate(-Math.PI / 2); g.fillText(small ? 'Heat →' : 'Temperature →', 0, 0); g.restore();
  // Where the world has been.
  const tr = o.trail;
  if (tr && tr.length >= 4) {
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.setLineDash([2, 3]);
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < tr.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(tr[i]), Y(tr[i + 1]));
    g.lineTo(X(atm), Y(temp));
    g.stroke();
    g.setLineDash([]);
  }
  // Where a tool would push it.
  const ar = o.arrow;
  if (ar) {
    const f = o.from ?? { a: atm, t: temp };
    const x0 = X(f.a), y0 = Y(f.t), x1 = X(ar.a), y1 = Y(ar.t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    g.strokeStyle = ar.color;
    g.fillStyle = ar.color;
    if (len > 3) {
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const hl = Math.min(9, len * 0.6);
      g.lineWidth = 3;
      g.setLineDash([5, 3]);
      g.lineDashOffset = -time * 20;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(ang) * hl * 0.7, y1 - Math.sin(ang) * hl * 0.7); g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x1 - Math.cos(ang - 0.5) * hl, y1 - Math.sin(ang - 0.5) * hl);
      g.lineTo(x1 - Math.cos(ang + 0.5) * hl, y1 - Math.sin(ang + 0.5) * hl);
      g.closePath(); g.fill();
    }
    g.globalAlpha = 0.5;
    g.lineWidth = 2;
    g.beginPath(); g.arc(x1, y1, 7, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    const before = tScoreOf(f.a, f.t), after = tScoreOf(ar.a, ar.t);
    const lbl = len <= 3 ? 'No change' : after === before ? `T${after}` : `T${before}→T${after}`;
    g.font = `700 ${small ? 10 : 12}px Fredoka, system-ui`;
    // Beyond the arrow's tip, clear of the dot.
    const ux = len > 3 ? (x1 - x0) / len : 0, uy = len > 3 ? (y1 - y0) / len : -1;
    const lx = clamp(x1 + ux * 30, 24, S - 24), ly = clamp(y1 + uy * 18 + (Math.abs(uy) < 0.5 ? -12 : 0), 10, S - 8);
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(lbl, lx, ly);
    g.fillStyle = after > before ? '#9dff8a' : after < before ? '#ff8a7a' : '#ffffff';
    g.fillText(lbl, lx, ly);
  }
  const x = X(atm), y = Y(temp);
  const pul = 1 + Math.sin(time * 5) * 0.15;
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath(); g.arc(x, y, 12 * pul, 0, TAU); g.fill();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#3ee6c4';
  g.lineWidth = 3;
  g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); g.stroke();
}

// ------------------------------------------------------------------ the view
type MarkKind = 'ember' | 'frost' | 'storm' | 'dust' | 'cloud' | 'bloom';
/** `soft` marks are a lance's trail: overlapping smudges that read as one line. */
interface Mark { lon: number; lat: number; kind: MarkKind; age: number; life: number; size: number; soft?: boolean }
type PartKind = 'spark' | 'rain' | 'flake' | 'puff' | 'wisp';
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: PartKind; clip?: boolean; drag?: number; grav?: number; grow?: number }
interface Shot { kind: 'pod' | 'meteor' | 'comet' | 'seed'; x0: number; y0: number; mx: number; my: number; x1: number; y1: number; t0: number; dur: number; color: string; px: number; py: number; done: boolean; onHit: () => void }
interface Ring { x: number; y: number; t: number; dur: number; max: number; color: string; w: number; clip: boolean }
interface Anim { def: TerraDef; t: number; dur: number; q: { at: number; fn: () => void; done?: boolean }[]; tick?: (t: number, dt: number) => void; ship: boolean; fromA: number; fromT: number; before: number; applied: boolean; beam?: { p0: { x: number; y: number }; p1: { x: number; y: number }; hot: boolean } }

/** The sun sits up and to the left. */
const LIGHT = -2.4;
const LX = Math.cos(LIGHT), LY = Math.sin(LIGHT);
const ease3 = (k: number) => 1 - (1 - clamp(k, 0, 1)) ** 3;
const qb = (a: number, m: number, b: number, k: number) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * m + k * k * b;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const airWord = (v: number) => v < 0.2 ? 'Thin' : v > 0.8 ? 'Dense' : 'Fair';
const heatWord = (v: number) => v < 0.2 ? 'Frozen' : v < 0.38 ? 'Cold' : v > 0.8 ? 'Scorching' : v > 0.62 ? 'Hot' : 'Mild';
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Open the terraforming view for a world. `fire` starts with that tool. */
export function openTerraform(st: SpaceStage, star: number, idx: number, onClose?: () => void, fire?: TerraDef['id']) {
  const w = st.w;
  const pl = w.planet(star, idx);
  const PS = () => w.peekPS(star, idx);
  const sprite = new SphereSprite(448, 256);
  const cv = h('canvas', { class: 'ob-cv tf-cv', 'aria-label': pl.name }) as HTMLCanvasElement;
  const chart = h('canvas', { class: 'tf-chart', 'aria-label': 'Climate chart' }) as HTMLCanvasElement;
  const banner = h('div', { class: 'ob-banner' });
  const hint = h('div', { class: 'ob-hint tf-hint' });
  const tEl = h('b'), tStars = h('span', { class: 'tf-stars' }), tSub = h('span', { class: 'tf-sub' });
  const airV = h('b'), airMk = h('i', { class: 'tf-mk' }), heatV = h('b'), heatMk = h('i', { class: 'tf-mk' });
  const track = (mk: HTMLElement, cls: string) => h('div', { class: 'tf-track ' + cls }, h('i', { class: 'tf-band b1' }), h('i', { class: 'tf-band b2' }), h('i', { class: 'tf-band b3' }), mk);
  const tools = h('div', { class: 'tf-tools' });
  let alive = true;
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-wrap')) return;
    if (e.key === 'Escape') { close(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= cards.length) start(cards[n - 1].d);
  };
  const close = () => {
    if (!alive) return;
    alive = false;
    root.remove();
    window.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const root = h('div', { class: 'sp-focus tf' },
    h('div', { class: 'sp-focus-head' }, h('h2', null, `🌍 Terraforming ${pl.name}`), button('✕', () => { audio.sfx('click'); close(); }, { cls: 'icon', title: 'Leave' })),
    h('div', { class: 'ob-stats tf-stats' },
      h('div', { class: 'ob-stat tf-t' }, h('div', null, tEl, tStars), tSub),
      h('div', { class: 'ob-stat tf-ax' }, h('span', null, '💨 ', h('i', { class: 'tf-long' }, 'Atmosphere'), h('i', { class: 'tf-short' }, 'Air'), ' · ', airV), track(airMk, 'air')),
      h('div', { class: 'ob-stat tf-ax' }, h('span', null, '🌡️ ', h('i', { class: 'tf-long' }, 'Temperature'), h('i', { class: 'tf-short' }, 'Heat'), ' · ', heatV), track(heatMk, 'heat'))),
    h('div', { class: 'ob-stage' }, cv, chart, banner),
    tools, hint);
  document.body.append(root);
  window.addEventListener('keydown', onKey);
  audio.sfx('warp', { pitch: 1.4, vol: 0.35 });

  let rot = Math.random(), spin = 0, time = 0, last = performance.now();
  let shake = 0, flashA = 0, flashC = '#ffffff', capT = -1, bannerT = 0;
  let marks: Mark[] = [], parts: Part[] = [], shots: Shot[] = [], rings: Ring[] = [];
  let bolts: { pts: [number, number][]; life: number }[] = [];
  let floats: { x: number; y: number; text: string; color: string; life: number }[] = [];
  let auras: { color: string; a: number }[] = [];
  let tints: { color: string; a: number; add: boolean }[] = [];
  let anim: Anim | null = null;
  let preview: TerraDef | null = null;
  /** A tool picked while another is still playing: it fires next. */
  let queued: TerraDef | null = null;
  const ps0 = PS();
  const disp = { a: ps0.atm, t: ps0.temp };
  let shownT = tScoreOf(disp.a, disp.t);
  const trail: number[] = [disp.a, disp.t];
  const stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() < 0.15 ? 2 : 1, b: rnd(0.25, 0.9), f: rnd(0.5, 2.5), p: rnd(0, TAU) }));

  const geom = () => {
    const cw = cv.clientWidth || 300, ch = cv.clientHeight || 300;
    const narrow = cw < 560;
    const r = Math.max(40, Math.min(cw * (narrow ? 0.36 : 0.3), ch * 0.36));
    return { cw, ch, cx: cw / 2, cy: ch / 2 + (narrow ? Math.min(34, ch * 0.05) : 0), r };
  };
  /** Screen position of a surface point (texture longitude moves left as `rot` grows, like the sprite). */
  const project = (lon: number, lat: number) => {
    const { cx, cy, r } = geom();
    const a = lon - rot * TAU;
    return { x: cx + Math.cos(lat) * Math.sin(a) * r, y: cy + Math.sin(lat) * r, z: Math.cos(lat) * Math.cos(a) };
  };
  const unproject = (px: number, py: number) => {
    const { cx, cy, r } = geom();
    let nx = (px - cx) / r, ny = (py - cy) / r;
    const d = Math.hypot(nx, ny);
    if (d > 0.97) { nx *= 0.97 / d; ny *= 0.97 / d; }
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return { lon: Math.atan2(nx, nz) + rot * TAU, lat: Math.asin(ny) };
  };
  /** A random point on the near face of the world. */
  const facePoint = (spread = 0.7) => {
    const { cx, cy, r } = geom();
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * spread;
    return { x: cx + Math.cos(a) * d * r, y: cy + Math.sin(a) * d * r };
  };
  const mark = (x: number, y: number, kind: MarkKind, life: number, size: number, delay = 0, soft = false) => marks.push({ ...unproject(x, y), kind, age: -delay, life, size, soft });
  const burst = (x: number, y: number, color: string, n: number, speed: number, kind: PartKind = 'spark') => {
    const sc = geom().r / 150;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = rnd(0.3, 1) * speed * sc;
      const life = rnd(0.4, 0.9);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: rnd(1.5, 3) * Math.max(0.8, sc), color, kind, drag: 2.5 });
    }
  };
  const ring = (x: number, y: number, color: string, max: number, dur: number, clip: boolean, wd = 4) => rings.push({ x, y, t: 0, dur, max, color, w: wd, clip });
  const flash = (color: string, a: number) => { flashC = color; flashA = Math.max(flashA, a); };
  const aura = (color: string, a: number) => auras.push({ color, a });
  const tint = (color: string, a: number, add = false) => tints.push({ color, a, add });
  const float = (text: string, color: string) => {
    const { cx, cy, r } = geom();
    floats.push({ x: cx, y: cy - r - 16, text, color, life: 1.8 });
  };
  const launch = (s: Omit<Shot, 't0' | 'px' | 'py' | 'done'>) => shots.push({ ...s, t0: time, px: s.x0, py: s.y0, done: false });
  const bolt = (x: number, y: number, len: number) => {
    const pts: [number, number][] = [[x, y]];
    let a = Math.random() * TAU, px = x, py = y;
    for (let i = 0; i < 6; i++) { a += rnd(-0.7, 0.7); px += Math.cos(a) * len / 6; py += Math.sin(a) * len / 6; pts.push([px, py]); }
    bolts.push({ pts, life: 0.24 });
    flash('#dff0ff', 0.12);
    audio.sfx('zap', { pitch: rnd(0.4, 0.7), vol: 0.45 });
    setTimeout(() => audio.sfx('hit', { pitch: 0.35, vol: 0.5 }), 140);
  };
  /** The ship, for the tools it works itself: in from the left, hold station, then off again. */
  const shipAt = (t: number, dur: number) => {
    const { cw, cx, cy, r } = geom();
    const ox = cx - Math.min(r * 1.45, cw / 2 - 50), oy = cy - r * 0.95;
    const kin = ease3(t / 0.8), kout = clamp((t - (dur - 0.7)) / 0.7, 0, 1) ** 2;
    const sx = -90, sy = oy - r * 0.5, ex = -110, ey = oy - r * 1.2;
    let x = sx + (ox - sx) * kin, y = sy + (oy - sy) * kin + Math.sin(time * 2.2) * 3;
    x += (ex - x) * kout; y += (ey - y) * kout;
    const face = Math.atan2(cy - y, cx - x), away = Math.atan2(ey - oy, ex - ox);
    let d = away - face; d -= Math.round(d / TAU) * TAU;
    const ang = face + d * clamp(kout * 3, 0, 1);
    const len = r * 0.42;
    const d0 = st.shipDesign;
    const size = len / shipLength(d0);
    return { x, y, ang, size, nx: x + Math.cos(ang) * len * 0.5, ny: y + Math.sin(ang) * len * 0.5, thrust: kin < 1 || kout > 0 ? 1 : 0.25 };
  };

  // ---------------------------------------------------------------- tool cards
  const cards: { d: TerraDef; el: HTMLButtonElement; n: HTMLElement }[] = [];
  for (const d of TERRA_TOOLS) {
    if (!terraState(w, d).show) continue;
    const n = h('span', { class: 'tf-n' });
    const el = h('button', { class: 'tf-card', style: `--c:${d.color}`, title: d.blurb },
      h('span', { class: 'tf-key' }, String(cards.length + 1)),
      h('span', { class: 'tf-ic' }, d.icon), h('b', null, d.name), h('span', { class: 'tf-arrow' }, terraTag(d)), n) as HTMLButtonElement;
    el.addEventListener('click', (e) => { e.stopPropagation(); start(d); });
    el.addEventListener('pointerenter', () => { preview = d; });
    el.addEventListener('pointerleave', () => { if (preview === d) preview = null; });
    el.addEventListener('focus', () => { preview = d; });
    el.addEventListener('blur', () => { if (preview === d) preview = null; });
    tools.append(el);
    cards.push({ d, el, n });
  }
  const refreshCards = () => {
    for (const c of cards) {
      const s = terraState(w, c.d);
      c.n.textContent = s.n;
      c.el.classList.toggle('off', !s.ok);
      c.el.classList.toggle('busy', !!anim && queued !== c.d);
      c.el.classList.toggle('queued', queued === c.d);
    }
  };
  const idleHint = () => {
    hint.innerHTML = '';
    const any = cards.some((c) => terraState(w, c.d).ok);
    hint.append(any
      ? 'Each tool\'s arrow is the way it pushes the world on the climate chart. Hover a tool to preview it, then steer the dot into the green rings.'
      : 'You have no terraforming tools left. Buy pods at your tool shop (rank Captain).');
  };
  idleHint();

  // ---------------------------------------------------------------- firing
  const start = (d: TerraDef) => {
    if (!alive) return;
    const s = terraState(w, d);
    if (anim) {
      if (!s.ok) { audio.sfx('error'); return; }
      queued = queued === d ? null : d;
      audio.sfx('tap', { vol: 0.5 });
      refreshCards();
      return;
    }
    if (!s.ok) { st.ui.toast(s.why, d.icon); audio.sfx('error'); return; }
    if (d.id === 'genesis') {
      void ui.confirm('Plant the Genesis Seed?', `${pl.name} will become a thriving T3 world with a full ecosystem.`, 'Plant it', 'Not yet')
        .then((ok) => { if (ok && alive && !anim) play(d); });
      return;
    }
    play(d);
  };

  const play = (d: TerraDef) => {
    const ps = PS();
    const A: Anim = { def: d, t: 0, dur: 3.5, q: [], ship: false, fromA: ps.atm, fromT: ps.temp, before: tScoreOf(ps.atm, ps.temp), applied: false };
    const at = (s: number, fn: () => void) => A.q.push({ at: s, fn });
    const apply = () => {
      if (A.applied) return;
      A.applied = true;
      const err = d.id === 'genesis' ? genesis(w, star, idx) : terraform(w, star, idx, d.id);
      if (err) { st.ui.toast(err, '🌍'); audio.sfx('error'); return; }
      const now = PS();
      trail.push(now.atm, now.temp);
      if (d.id === 'genesis') float('◎ Paradise', d.color);
      else float(`${d.arrow} ${d.axis} ${d.da + d.dt > 0 ? '+' : '−'}${Math.round(Math.abs(d.da + d.dt) * 100)}%`, d.color);
    };
    const { cw, ch, cx, cy, r } = geom();
    switch (d.id) {
      case 'stormpod':
      case 'droughtpod': {
        const storm = d.id === 'stormpod';
        const tx = cx + r * 0.3, ty = cy - r * 0.15;
        A.dur = 3.7;
        at(0, () => {
          audio.sfx('whoosh', { pitch: 0.8 });
          launch({ kind: 'pod', x0: cw + 30, y0: ch * 0.95, mx: cx + r * 1.5, my: cy - r * 1.3, x1: tx, y1: ty, dur: 0.9, color: d.color, onHit: () => {
            apply();
            if (storm) {
              mark(tx, ty, 'storm', 4.4, 0.5);
              for (let i = 0; i < 4; i++) { const p = facePoint(0.8); mark(p.x, p.y, 'cloud', 4.2, rnd(0.18, 0.3), 0.3 + i * 0.25); }
              burst(tx, ty, '#e8f6ff', 26, 170);
              ring(tx, ty, '#cfeeff', r * 0.7, 0.9, true);
              aura('#bfe6ff', 0.55);
              audio.sfx('splash', { pitch: 0.8 });
            } else {
              mark(tx, ty, 'dust', 4, 0.55);
              ring(tx, ty, '#ffd08a', r * 1.9, 1.2, true, 6);
              ring(tx, ty, '#fff2d0', r * 1.2, 0.8, true, 3);
              burst(tx, ty, '#ffd08a', 30, 220);
              tint('#b5793a', 0.4);
              aura('#ffc46a', 0.45);
              flash('#ffd08a', 0.25);
              shake = 7;
              audio.sfx('explode', { pitch: 1.5, vol: 0.5 });
              audio.sfx('whoosh', { pitch: 0.5 });
            }
          } });
        });
        A.tick = (t, dt) => {
          const g = geom();
          if (storm && t > 1 && t < 3.4) {
            // Rain sweeps across the face; lightning cracks inside the storm.
            for (let i = 0; i < 3; i++) {
              const p = facePoint(0.95);
              const life = rnd(0.25, 0.45);
              parts.push({ x: p.x, y: p.y - g.r * 0.1, vx: -g.r * 0.35, vy: g.r * 1.6, life, max: life, size: 1.4, color: '#d6ecff', kind: 'rain', clip: true });
            }
            if (Math.random() < dt * 2.6) { const p = facePoint(0.6); bolt(p.x, p.y, g.r * rnd(0.25, 0.45)); }
          }
          if (!storm && t > 1 && t < 3.1) {
            // The sky boils off the limb into space.
            for (let i = 0; i < 3; i++) {
              const a = Math.random() * TAU, v = rnd(40, 110) * g.r / 150;
              const life = rnd(0.8, 1.4);
              parts.push({ x: g.cx + Math.cos(a) * g.r * 1.03, y: g.cy + Math.sin(a) * g.r * 1.03, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: rnd(2, 3.5), color: Math.random() < 0.5 ? '#ffe2b0' : '#bfe0ff', kind: 'wisp', grow: 2 });
            }
          }
        };
        break;
      }
      case 'meteor': {
        A.dur = 3.9;
        for (let i = 0; i < 5; i++) at(0.05 + i * 0.32 + rnd(0, 0.08), () => {
          const g = geom();
          const p = facePoint(0.72);
          const sx = p.x - g.r * rnd(1.6, 2.4), sy = p.y - g.r * rnd(2.0, 2.6);
          audio.sfx('whoosh', { pitch: rnd(1.4, 1.9), vol: 0.35 });
          launch({ kind: 'meteor', x0: sx, y0: sy, mx: (sx + p.x) / 2 + g.r * 0.2, my: (sy + p.y) / 2, x1: p.x, y1: p.y, dur: 0.55, color: '#ffb347', onHit: () => {
            apply();
            mark(p.x, p.y, 'ember', 6, rnd(0.09, 0.15));
            burst(p.x, p.y, '#ffd27a', 20, 230);
            burst(p.x, p.y, '#ff5a1a', 12, 140);
            ring(p.x, p.y, '#ffb347', g.r * 0.32, 0.5, true, 3);
            flash('#ffb347', 0.18);
            tint('#ff5a1a', 0.05, true);
            aura('#ff7a3a', 0.3);
            shake = 9;
            audio.sfx('explode', { pitch: rnd(0.8, 1.3), vol: 0.55 });
          } });
        });
        A.tick = (t) => {
          // Heat haze rising off the fresh craters.
          if (t > 0.7 && t < 3.4 && Math.random() < 0.6) {
            const g = geom(), p = facePoint(0.8);
            parts.push({ x: p.x, y: p.y, vx: rnd(-6, 6), vy: -rnd(20, 40) * g.r / 150, life: 0.9, max: 0.9, size: rnd(1.2, 2.4), color: '#ff9a4a', kind: 'spark', clip: false });
          }
        };
        break;
      }
      case 'icecomet': {
        A.dur = 4.1;
        const tx = cx - r * 0.12, ty = cy - r * 0.45;
        at(0, () => {
          audio.sfx('warp', { pitch: 0.45, vol: 0.5 });
          launch({ kind: 'comet', x0: cw + r * 0.6, y0: cy - r * 2.1, mx: cx + r * 1.6, my: cy - r * 1.9, x1: tx, y1: ty, dur: 1.3, color: '#dff4ff', onHit: () => {
            apply();
            mark(tx, ty, 'frost', 5.5, 0.42);
            for (let i = 0; i < 5; i++) { const p = facePoint(0.85); mark(p.x, p.y, 'frost', 4.5, rnd(0.12, 0.22), 0.25 + i * 0.18); }
            ring(tx, ty, '#e8fbff', r * 2, 1.5, true, 6);
            ring(tx, ty, '#9fdcff', r * 1.3, 1.1, true, 3);
            burst(tx, ty, '#ffffff', 34, 210, 'flake');
            flash('#e8fbff', 0.55);
            tint('#cfeeff', 0.3);
            aura('#9fdcff', 0.55);
            capT = 0;
            shake = 7;
            audio.sfx('splash', { pitch: 1.4 });
            audio.sfx('bell', { pitch: 1.6 });
          } });
        });
        A.tick = (t) => {
          if (t > 1.35 && t < 3.7) {
            const g = geom();
            for (let i = 0; i < 2; i++) {
              const p = facePoint(1.05), life = rnd(0.8, 1.4);
              parts.push({ x: p.x, y: p.y - g.r * 0.2, vx: rnd(-14, 14), vy: rnd(18, 40) * g.r / 150, life, max: life, size: rnd(1.2, 2.4), color: '#ffffff', kind: 'flake', clip: true });
            }
          }
        };
        break;
      }
      case 'atm+':
      case 'atm-': {
        const vent = d.id === 'atm+';
        A.dur = 3.8;
        A.ship = true;
        at(0, () => audio.sfx('warp', { pitch: 1.7, vol: 0.35 }));
        for (let i = 0; i < 4; i++) at(0.9 + i * 0.45, () => audio.sfx('whoosh', { pitch: vent ? 0.6 + i * 0.05 : 1.3 - i * 0.05, vol: 0.5 }));
        at(1.6, () => { apply(); aura(vent ? '#e0f4ff' : '#ffe2b0', 0.4); if (vent) tint('#ffffff', 0.18); });
        A.tick = (t) => {
          if (t < 0.85 || t > 2.95) return;
          const g = geom(), sh = shipAt(t, A.dur);
          const face = Math.atan2(sh.ny - g.cy, sh.nx - g.cx);
          for (let i = 0; i < 2; i++) {
            const a = face + rnd(-0.9, 0.9);
            const rx = g.cx + Math.cos(a) * g.r * 0.92, ry = g.cy + Math.sin(a) * g.r * 0.92;
            const life = rnd(0.8, 1.1);
            if (vent) {
              parts.push({ x: sh.nx, y: sh.ny, vx: (rx - sh.nx) / life, vy: (ry - sh.ny) / life, life, max: life, size: rnd(5, 8) * g.r / 150, grow: 16 * g.r / 150, color: '#f2fbff', kind: 'puff' });
              if (Math.random() < 0.08) { const p = facePoint(0.85); mark(p.x, p.y, 'cloud', 3.5, rnd(0.16, 0.26)); }
            } else {
              parts.push({ x: rx, y: ry, vx: (sh.nx - rx) / life, vy: (sh.ny - ry) / life, life, max: life, size: rnd(4, 7) * g.r / 150, grow: -3 * g.r / 150, color: Math.random() < 0.5 ? '#ffe2b0' : '#cfe8ff', kind: 'puff' });
            }
          }
        };
        break;
      }
      case 'temp+':
      case 'temp-': {
        const hot = d.id === 'temp+';
        A.dur = 3.6;
        A.ship = true;
        const p0 = { x: cx - r * 0.38, y: cy + r * 0.32 }, p1 = { x: cx + r * 0.36, y: cy - r * 0.1 };
        let drop = 0, buzz = 0;
        at(0, () => audio.sfx('warp', { pitch: 1.7, vol: 0.35 }));
        at(0.95, () => audio.sfx('laser', { pitch: hot ? 0.5 : 1.3, vol: 0.8 }));
        at(1.5, () => { apply(); aura(hot ? '#ff7a3a' : '#9fdcff', 0.45); tint(hot ? '#ff5a1a' : '#cfeeff', 0.2, hot); if (!hot) capT = 0; });
        A.tick = (t, dt) => {
          if (t < 0.95 || t > 2.6) return;
          const k = (t - 0.95) / 1.65, e = k * k * (3 - 2 * k);
          const x = p0.x + (p1.x - p0.x) * e, y = p0.y + (p1.y - p0.y) * e;
          drop -= dt; buzz -= dt;
          if (drop <= 0) { drop = 0.04; mark(x, y, hot ? 'ember' : 'frost', hot ? 5 : 4.5, rnd(0.07, 0.09), 0, true); }
          if (buzz <= 0) { buzz = 0.28; audio.sfx('zap', { pitch: hot ? 0.5 : 1.5, vol: 0.25 }); }
          burst(x, y, hot ? '#ffd27a' : '#e8fbff', 2, 120, hot ? 'spark' : 'flake');
        };
        A.beam = { p0, p1, hot };
        break;
      }
      case 'genesis': {
        A.dur = 4.4;
        const tx = cx, ty = cy - r * 0.1;
        at(0, () => {
          audio.sfx('charm');
          launch({ kind: 'seed', x0: cx, y0: -30, mx: cx + r * 0.6, my: cy - r * 1.6, x1: tx, y1: ty, dur: 1.1, color: '#7bd389', onHit: () => {
            apply();
            ring(tx, ty, '#9dff8a', r * 2.1, 1.6, true, 8);
            ring(tx, ty, '#ffffff', r * 1.5, 1.1, true, 3);
            flash('#d8ffd0', 0.5);
            aura('#7dff9a', 0.7);
            tint('#4fd67b', 0.25, true);
            burst(tx, ty, '#9dff8a', 40, 240);
            burst(tx, ty, '#ffd166', 20, 180);
            for (let i = 0; i < 16; i++) { const p = facePoint(0.95); mark(p.x, p.y, 'bloom', 4, rnd(0.08, 0.16), Math.hypot(p.x - tx, p.y - ty) / r * 0.6); }
            audio.sfx('heal');
          } });
        });
        break;
      }
    }
    anim = A;
    preview = null;
    refreshCards();
    hint.innerHTML = '';
    hint.append(h('b', { style: `color:${d.color}` }, `${d.icon} ${d.name}`), ` · ${d.blurb}`);
  };

  const finishAnim = (A: Anim) => {
    anim = null;
    refreshCards();
    const ps = PS();
    const T = tScoreOf(ps.atm, ps.temp), rows = w.ecoRows(ps);
    hint.innerHTML = '';
    if (!A.applied) { idleHint(); return; }
    const d = A.def;
    const bits: (string | HTMLElement)[] = [h('b', { style: `color:${d.color}` }, `${d.icon} ${d.name}`), ' · '];
    if (d.da) bits.push(`Atmosphere ${pct(A.fromA)} → ${pct(ps.atm)}`);
    else if (d.dt) bits.push(`Temperature ${pct(A.fromT)} → ${pct(ps.temp)}`);
    else bits.push('The world blooms.');
    bits.push(' · ', h('b', { style: `color:${T > A.before ? '#9dff8a' : T < A.before ? '#ff8a7a' : 'var(--ink)'}` }, T === A.before ? `still T${T}` : `T${A.before} → T${T}`));
    if (T > rows) bits.push(h('div', { class: 'tf-warn' }, `⚠ Unstable: fill the T${rows + 1} ecosystem row in the Life tab, or the climate drifts back.`));
    else if (T === 3) bits.push(h('div', { class: 'tf-good' }, 'A paradise, and it is stable.'));
    hint.append(...bits);
    if (T >= 1) st.game.hint('terra-eco', 'Higher T-scores need life: fill the matching ecosystem row in the Life tab to make it stable.', '🌿');
    const next = queued;
    queued = null;
    if (next) setTimeout(() => { if (alive && !anim) start(next); else refreshCards(); }, 250);
  };

  /** The displayed climate crossed a ring. */
  const tChanged = (from: number, to: number) => {
    const { cx, cy, r } = geom();
    bannerT = 1.8;
    if (to > from) {
      banner.className = 'ob-banner on win';
      banner.textContent = `🌍 T${to} world! ${'★'.repeat(to)}`;
      for (let i = 0; i < 36; i++) {
        const a = Math.random() * TAU;
        burst(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05, i % 2 ? '#ffd166' : '#9dff8a', 2, 160);
      }
      aura('#9dff8a', 0.6);
    } else {
      banner.className = 'ob-banner on lose';
      banner.textContent = to === 0 ? '☠️ Lifeless again' : `⚠ Down to T${to}`;
    }
  };

  const updateStats = () => {
    tEl.textContent = `T${shownT} `;
    tStars.textContent = '★'.repeat(shownT) + '☆'.repeat(3 - shownT);
    const rows = w.ecoRows(PS());
    const unstable = shownT > rows;
    tSub.textContent = unstable ? '⚠ Unstable' : shownT === 3 ? 'Paradise' : shownT === 0 ? 'Lifeless' : 'Stable';
    tSub.classList.toggle('bad', unstable);
    airV.textContent = `${airWord(disp.a)} ${pct(disp.a)}`;
    heatV.textContent = `${heatWord(disp.t)} ${pct(disp.t)}`;
    airMk.style.left = `${disp.a * 100}%`;
    heatMk.style.left = `${disp.t * 100}%`;
  };

  // ---------------------------------------------------------------- spin by dragging
  let down: { x: number; rot: number; id: number; lx: number; lt: number } | null = null;
  cv.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, rot, id: e.pointerId, lx: e.clientX, lt: performance.now() };
    spin = 0;
    try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const wdt = geom().r * 2 * 1.6;
    rot = (((down.rot - (e.clientX - down.x) / wdt) % 1) + 1) % 1;
    const now = performance.now();
    spin = -(e.clientX - down.lx) / wdt / Math.max(0.008, (now - down.lt) / 1000);
    down.lx = e.clientX; down.lt = now;
  });
  const up = (e: PointerEvent) => { if (down && e.pointerId === down.id) down = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  // ---------------------------------------------------------------- frame
  let cardAcc = 0;
  const frame = (now: number) => {
    if (!alive) return;
    if (!root.isConnected) { close(); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (!down) {
      rot = (((rot + (0.01 + spin) * dt) % 1) + 1) % 1;
      spin *= Math.exp(-2.5 * dt);
    }
    const A = anim;
    if (A) {
      A.t += dt;
      for (const e of A.q) if (!e.done && A.t >= e.at) { e.done = true; e.fn(); }
      A.tick?.(A.t, dt);
    }
    // The shown climate eases toward the real one, so the globe turns over a second or two.
    const ps = PS();
    const k = 1 - Math.exp(-dt * 2.2);
    disp.a += (ps.atm - disp.a) * k;
    disp.t += (ps.temp - disp.t) * k;
    if (Math.abs(ps.atm - disp.a) < 0.002) disp.a = ps.atm;
    if (Math.abs(ps.temp - disp.t) < 0.002) disp.t = ps.temp;
    const nt = tScoreOf(disp.a, disp.t);
    if (nt !== shownT) { tChanged(shownT, nt); shownT = nt; }
    if (bannerT > 0 && (bannerT -= dt) <= 0) banner.classList.remove('on');
    updateStats();
    if ((cardAcc += dt) > 0.25) { cardAcc = 0; refreshCards(); }
    render(dt);
    if (A && A.t >= A.dur && !shots.length) finishAnim(A);
    const pv = anim?.def ?? preview;
    const from = anim ? { a: anim.fromA, t: anim.fromT } : undefined;
    const tgt = pv ? terraTarget(pv, from?.a ?? ps.atm, from?.t ?? ps.temp) : null;
    drawClimate(chart, disp.a, disp.t, time, { arrow: tgt && pv ? { ...tgt, color: pv.color } : null, from, trail });
    requestAnimationFrame(frame);
  };

  const render = (dt: number) => {
    const { cw, ch, cx, cy, r } = geom();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    shake = Math.max(0, shake - dt * 22);
    g.save();
    if (shake) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const sc = r / 150;
    // Stars, the sun, and a glow behind the world that tells its climate at a glance.
    g.fillStyle = '#ffffff';
    for (const s of stars) { g.globalAlpha = s.b * (0.6 + 0.4 * Math.sin(time * s.f + s.p)); g.fillRect(s.x * cw, s.y * ch, s.s, s.s); }
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.45;
    blit(g, glow('#ffe2a8', 64), cx + LX * r * 2.7, cy + LY * r * 2.7, r * 2.1);
    const tt = tScoreOf(disp.a, disp.t);
    const ac = tt >= 1 ? '#4fd67b' : disp.t > 0.65 ? '#ff6a2a' : disp.t < 0.35 ? '#5aa8ff' : disp.a > 0.72 ? '#d8e05a' : '#b8a27a';
    g.globalAlpha = 0.14 + tt * 0.05;
    blit(g, glow(ac, 64), cx, cy, r * 2.5);
    for (const au of auras) { au.a -= dt * 0.3; if (au.a > 0) { g.globalAlpha = au.a; blit(g, glow(au.color, 64), cx, cy, r * 1.75); } }
    auras = auras.filter((au) => au.a > 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // The world, drawn from the shown climate.
    const ps = PS();
    const look: PlanetLook = { seed: pl.seed, style: styleFor(pl.kind, tt, disp.a, disp.t, ps.owner === 'hollow', !!ps.destroyed), t: tt, atm: disp.a, temp: disp.t, hue: pl.hue };
    sprite.update(look, rot);
    drawPlanet(g, sprite, look, cx, cy, r, { light: LIGHT, rings: pl.rings, ringTilt: -0.3, t: time, lights: ps.owner && ps.owner !== 'hollow' ? ps.cities : 0, lightColor: ps.owner === 'player' ? '#9ff5e2' : '#ffd88a' });

    // ---------------- on the surface (clipped to the disc)
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
    for (const tn of tints) {
      tn.a -= dt * 0.18;
      if (tn.a <= 0) continue;
      g.globalCompositeOperation = tn.add ? 'lighter' : 'source-over';
      g.globalAlpha = tn.a;
      g.fillStyle = tn.color;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    tints = tints.filter((tn) => tn.a > 0);
    g.globalCompositeOperation = 'source-over';
    if (capT >= 0) {
      // Frost creeps down from the poles, then the texture takes over.
      capT += dt;
      const grow = ease3(capT / 1.1), fade = clamp(1 - (capT - 1.6) / 2.2, 0, 1);
      g.globalAlpha = 0.7 * fade;
      g.fillStyle = '#f2fbff';
      g.beginPath(); g.ellipse(cx, cy - r, r * 0.95, r * 0.45 * grow, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(cx, cy + r, r * 0.95, r * 0.38 * grow, 0, 0, TAU); g.fill();
      if (fade <= 0) capT = -1;
    }
    for (const m of marks) drawMark(g, m, dt, r);
    marks = marks.filter((m) => m.age < m.life);
    for (const rg of rings) if (rg.clip) drawRing(g, rg);
    for (const p of parts) if (p.clip) drawPart(g, p);
    g.restore();

    // ---------------- in space
    g.globalAlpha = 1;
    for (const rg of rings) if (!rg.clip) drawRing(g, rg);
    for (const rg of rings) rg.t += dt;
    rings = rings.filter((rg) => rg.t < rg.dur);
    const A = anim;
    if (A?.ship) {
      const sh = shipAt(A.t, A.dur);
      if (A.beam && A.t > 0.95 && A.t < 2.6) {
        // The lance: a wobbling beam from the ship's nose to a point sweeping across the crust.
        const k = (A.t - 0.95) / 1.65, e = k * k * (3 - 2 * k);
        const x = A.beam.p0.x + (A.beam.p1.x - A.beam.p0.x) * e + Math.sin(time * 40) * 1.5, y = A.beam.p0.y + (A.beam.p1.y - A.beam.p0.y) * e;
        const col = A.beam.hot ? '#ff7a3a' : '#8fe0ff';
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';
        g.strokeStyle = col;
        g.globalAlpha = 0.3; g.lineWidth = 14 * sc;
        g.beginPath(); g.moveTo(sh.nx, sh.ny); g.lineTo(x, y); g.stroke();
        g.globalAlpha = 0.9; g.lineWidth = 5 * sc;
        g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = 1.8 * sc;
        g.stroke();
        g.globalAlpha = 1;
        blit(g, glow(col, 32), x, y, r * 0.28 * (0.9 + 0.2 * Math.sin(time * 30)));
        blit(g, glow('#ffffff', 16), x, y, r * 0.08);
        blit(g, glow(col, 32), sh.nx, sh.ny, r * 0.12);
        g.globalCompositeOperation = 'source-over';
        g.lineCap = 'butt';
      }
      if (A.def.id === 'atm-' && A.t > 0.85 && A.t < 2.95) {
        // The siphon: a pale funnel from the limb into the ship.
        const face = Math.atan2(sh.ny - cy, sh.nx - cx);
        const pul = 0.06 + 0.03 * Math.sin(time * 9);
        const gr = g.createLinearGradient(cx + Math.cos(face) * r, cy + Math.sin(face) * r, sh.nx, sh.ny);
        gr.addColorStop(0, 'rgba(255,226,176,0)');
        gr.addColorStop(0.4, `rgba(255,226,176,${pul})`);
        gr.addColorStop(1, `rgba(220,240,255,${pul * 3})`);
        g.fillStyle = gr;
        g.globalCompositeOperation = 'lighter';
        g.beginPath();
        g.moveTo(cx + Math.cos(face - 0.8) * r * 0.95, cy + Math.sin(face - 0.8) * r * 0.95);
        g.lineTo(sh.nx, sh.ny);
        g.lineTo(cx + Math.cos(face + 0.8) * r * 0.95, cy + Math.sin(face + 0.8) * r * 0.95);
        g.closePath(); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      drawShip(g, st.shipDesign, sh.x, sh.y, sh.ang, sh.size, time, { thrust: sh.thrust, engine: '#7fd8ff' });
    }
    for (const p of parts) {
      p.life -= dt;
      if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
      if (p.grav) p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grow) p.size = Math.max(0.5, p.size + p.grow * dt);
      if (!p.clip) drawPart(g, p);
    }
    parts = parts.filter((p) => p.life > 0);
    for (const s of shots) drawShot(g, s, r);
    shots = shots.filter((s) => !s.done);
    // Lightning
    g.globalCompositeOperation = 'lighter';
    for (const b of bolts) {
      b.life -= dt;
      g.globalAlpha = clamp(b.life / 0.24, 0, 1) * (Math.random() < 0.3 ? 0.4 : 1);
      g.strokeStyle = '#eaf6ff';
      g.lineWidth = 2.2;
      g.beginPath();
      b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      blit(g, glow('#bfe0ff', 32), b.pts[0][0], b.pts[0][1], r * 0.35);
    }
    bolts = bolts.filter((b) => b.life > 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // Words
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 18px Fredoka, system-ui, sans-serif';
    for (const fl of floats) {
      fl.life -= dt; fl.y -= 22 * dt;
      g.globalAlpha = clamp(fl.life * 1.5, 0, 1);
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.65)'; g.strokeText(fl.text, fl.x, fl.y);
      g.fillStyle = fl.color; g.fillText(fl.text, fl.x, fl.y);
    }
    floats = floats.filter((fl) => fl.life > 0);
    g.globalAlpha = 1;
    g.restore();
    if (flashA > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = flashA;
      g.fillStyle = flashC;
      g.fillRect(0, 0, cw, ch);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      flashA = Math.max(0, flashA - dt * 2.4);
    }
  };

  const drawRing = (g: CanvasRenderingContext2D, rg: Ring) => {
    const k = rg.t / rg.dur;
    if (k >= 1) return;
    g.globalAlpha = (1 - k) * 0.85;
    g.strokeStyle = rg.color;
    g.lineWidth = rg.w * (1 - k * 0.6);
    g.beginPath(); g.arc(rg.x, rg.y, Math.max(1, rg.max * (1 - (1 - k) ** 2)), 0, TAU); g.stroke();
    g.globalAlpha = 1;
  };

  const drawPart = (g: CanvasRenderingContext2D, p: Part) => {
    const f = clamp(p.life / p.max, 0, 1);
    switch (p.kind) {
      case 'spark':
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = Math.min(1, f * 1.6);
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + 0.6 * f), 0, TAU); g.fill();
        break;
      case 'rain':
        g.globalAlpha = 0.55 * Math.min(1, f * 2);
        g.strokeStyle = p.color;
        g.lineWidth = p.size;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); g.stroke();
        break;
      case 'flake':
        g.globalAlpha = Math.min(1, f * 2) * (0.7 + 0.3 * Math.sin(p.x + time * 8));
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
        break;
      case 'puff':
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.45 * Math.sin(f * Math.PI);
        blit(g, glow(p.color, 32), p.x, p.y, p.size * 2);
        break;
      case 'wisp':
        g.globalAlpha = 0.6 * f;
        g.strokeStyle = p.color;
        g.lineWidth = p.size;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.12, p.y - p.vy * 0.12); g.stroke();
        g.lineCap = 'butt';
        break;
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };

  const drawMark = (g: CanvasRenderingContext2D, m: Mark, dt: number, r: number) => {
    m.age += dt;
    if (m.age < 0) return;
    const f = m.age / m.life;
    const p = project(m.lon, m.lat);
    if (p.z < 0.02) return;
    const vis = clamp(p.z * 4, 0, 1);
    const R = m.size * r * (0.45 + 0.55 * p.z);
    const fade = f < 0.12 ? f / 0.12 : f > 0.6 ? (1 - f) / 0.4 : 1;
    switch (m.kind) {
      case 'ember': {
        // A dark crater whose molten core cools from white-hot to red.
        const heat = clamp(1 - f * 1.4, 0, 1);
        if (m.soft) {
          g.globalAlpha = vis * fade * 0.3;
          blit(g, glow('#2a1208', 32, 1.4), p.x, p.y, R * 1.3);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = vis * heat * 0.7;
          blit(g, glow(heat > 0.6 ? '#ffb347' : '#ff5a1a', 32), p.x, p.y, R * (0.8 + heat * 0.6));
          break;
        }
        g.globalAlpha = vis * clamp(1.3 - f, 0, 1) * 0.7;
        g.fillStyle = '#1c0f0a';
        g.beginPath(); g.arc(p.x, p.y, R * 0.8, 0, TAU); g.fill();
        g.globalAlpha = vis * clamp(1.3 - f, 0, 1) * 0.5;
        g.strokeStyle = '#6a4a38';
        g.lineWidth = Math.max(1, R * 0.18);
        g.stroke();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = vis * Math.max(heat, 0.2 * (1 - f)) * 0.85;
        blit(g, glow(heat > 0.6 ? '#ffd27a' : heat > 0.3 ? '#ff7a2a' : '#c2381a', 32), p.x, p.y, R * (0.7 + heat * 0.8));
        g.globalAlpha = vis * heat;
        blit(g, glow('#ffffff', 16), p.x, p.y, R * 0.35 * heat);
        break;
      }
      case 'frost': {
        const grow = ease3(m.age / 0.6);
        if (m.soft) {
          g.globalAlpha = vis * fade * 0.55;
          blit(g, glow('#f2fbff', 32, 1.3), p.x, p.y, R * 1.4 * grow);
          break;
        }
        g.globalAlpha = vis * fade * 0.75;
        g.fillStyle = '#eef9ff';
        g.beginPath(); g.arc(p.x, p.y, R * grow, 0, TAU); g.fill();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + m.lon;
          g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a) * R * 1.5 * grow, p.y + Math.sin(a) * R * 1.5 * grow);
        }
        g.stroke();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = vis * fade * 0.5;
        blit(g, glow('#bfe9ff', 32), p.x, p.y, R * 1.8 * grow);
        break;
      }
      case 'storm': {
        // A cyclone: three spiral arms wheeling round a bright eye.
        const Rr = R * (0.3 + 0.7 * ease3(m.age / 0.8));
        g.globalAlpha = vis * fade * 0.4;
        blit(g, glow('#ffffff', 32), p.x, p.y, Rr * 1.2);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(-m.age * 2.6);
        g.strokeStyle = '#f4fbff';
        g.lineCap = 'round';
        g.lineWidth = Math.max(2, Rr * 0.14);
        g.globalAlpha = vis * fade * 0.7;
        for (let arm = 0; arm < 3; arm++) {
          g.beginPath();
          for (let i = 0; i <= 18; i++) {
            const k = i / 18, a = arm * TAU / 3 + k * 4.4, rr = Rr * (0.12 + k * 0.88);
            (i ? g.lineTo : g.moveTo).call(g, Math.cos(a) * rr, Math.sin(a) * rr);
          }
          g.stroke();
        }
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(0, 0, Rr * 0.1, 0, TAU); g.fill();
        g.restore();
        break;
      }
      case 'dust': {
        // A choking dust storm, billowing outward.
        const Rr = R * (0.4 + 0.9 * ease3(m.age / 1.2));
        const dust = glow('#c9995a', 32, 1.3);
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4 + m.age * (0.5 + (i % 3) * 0.2), d = Rr * (0.2 + (i % 4) * 0.17);
          g.globalAlpha = vis * fade * (0.35 + (i % 2) * 0.15);
          blit(g, dust, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, Rr * (0.45 + (i % 3) * 0.12));
        }
        break;
      }
      case 'cloud': {
        g.globalAlpha = vis * fade * 0.55;
        blit(g, glow('#ffffff', 32, 1.4), p.x, p.y, R * 1.6);
        break;
      }
      case 'bloom': {
        const grow = ease3(m.age / 0.7);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = vis * fade * 0.6;
        blit(g, glow('#5fdc6a', 32), p.x, p.y, R * 2 * grow);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = vis * fade;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.26 + m.lat * 9;
          g.fillStyle = ['#ff8ad8', '#ffd166', '#ffffff', '#b28dff', '#ff9a6a'][i];
          g.beginPath(); g.arc(p.x + Math.cos(a) * R * 0.8 * grow, p.y + Math.sin(a) * R * 0.8 * grow, Math.max(1.2, R * 0.16), 0, TAU); g.fill();
        }
        break;
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };

  const drawShot = (g: CanvasRenderingContext2D, s: Shot, r: number) => {
    const u = clamp((time - s.t0) / s.dur, 0, 1);
    const e = s.kind === 'meteor' ? u * u * 0.5 + u * 0.5 : s.kind === 'seed' ? ease3(u) * 0.3 + u * 0.7 : u;
    const x = qb(s.x0, s.mx, s.x1, e), y = qb(s.y0, s.my, s.y1, e);
    const ang = Math.atan2(y - s.py, x - s.px) || Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
    s.px = x; s.py = y;
    const sc = r / 150;
    g.globalCompositeOperation = 'lighter';
    switch (s.kind) {
      case 'pod': {
        parts.push({ x, y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.4, max: 0.4, size: 2 * sc + 1, color: s.color, kind: 'spark' });
        blit(g, glow(s.color, 32), x - Math.cos(ang) * 10 * sc, y - Math.sin(ang) * 10 * sc, 16 * sc + 6);
        g.globalCompositeOperation = 'source-over';
        g.save();
        g.translate(x, y);
        g.rotate(ang);
        const L = Math.max(12, 16 * sc);
        g.fillStyle = '#e8eef4';
        g.strokeStyle = '#5d6b7a';
        g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(0, 0, L / 2, L * 0.24, 0, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = s.color;
        g.fillRect(-L * 0.08, -L * 0.22, L * 0.16, L * 0.44);
        g.restore();
        break;
      }
      case 'meteor': {
        const len = r * 0.6;
        const tg = g.createLinearGradient(x, y, x - Math.cos(ang) * len, y - Math.sin(ang) * len);
        tg.addColorStop(0, 'rgba(255,236,170,0.95)');
        tg.addColorStop(0.3, 'rgba(255,130,50,0.6)');
        tg.addColorStop(1, 'rgba(255,60,20,0)');
        g.strokeStyle = tg;
        g.lineCap = 'round';
        g.lineWidth = Math.max(3, 7 * sc);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); g.stroke();
        g.lineCap = 'butt';
        blit(g, glow('#ffb347', 32), x, y, 22 * sc + 6);
        blit(g, glow('#ffffff', 16), x, y, 7 * sc + 2);
        if (Math.random() < 0.7) parts.push({ x, y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.35, max: 0.35, size: 2 * sc + 0.8, color: '#ffb347', kind: 'spark' });
        break;
      }
      case 'comet': {
        // Its tail streams away from the sun.
        const ta = LIGHT + Math.PI, len = r * 1.5;
        for (const [spr, col, l] of [[0.16, 'rgba(225,245,255,', 1], [0.06, 'rgba(140,200,255,', 1.3]] as const) {
          const tg = g.createLinearGradient(x, y, x + Math.cos(ta) * len * l, y + Math.sin(ta) * len * l);
          tg.addColorStop(0, col + '0.75)');
          tg.addColorStop(1, col + '0)');
          g.fillStyle = tg;
          g.beginPath();
          g.moveTo(x + Math.cos(ta + Math.PI / 2) * 10 * sc, y + Math.sin(ta + Math.PI / 2) * 10 * sc);
          g.lineTo(x + Math.cos(ta + spr) * len * l, y + Math.sin(ta + spr) * len * l);
          g.lineTo(x + Math.cos(ta - spr) * len * l, y + Math.sin(ta - spr) * len * l);
          g.lineTo(x + Math.cos(ta - Math.PI / 2) * 10 * sc, y + Math.sin(ta - Math.PI / 2) * 10 * sc);
          g.closePath(); g.fill();
        }
        blit(g, glow('#dff4ff', 32), x, y, 34 * sc + 8);
        blit(g, glow('#ffffff', 16), x, y, 11 * sc + 3);
        parts.push({ x, y, vx: Math.cos(ta) * 60 * sc + rnd(-25, 25), vy: Math.sin(ta) * 60 * sc + rnd(-25, 25), life: 0.7, max: 0.7, size: rnd(1, 2.2), color: '#ffffff', kind: 'flake' });
        break;
      }
      case 'seed': {
        blit(g, glow('#7bd389', 32), x, y, 30 * sc + 8);
        blit(g, glow('#ffffff', 16), x, y, 8 * sc + 3);
        const a = time * 9;
        for (let i = 0; i < 3; i++) parts.push({ x: x + Math.cos(a + i * 2.1) * 14 * sc, y: y + Math.sin(a + i * 2.1) * 14 * sc, vx: 0, vy: 8, life: 0.6, max: 0.6, size: 2, color: i ? '#9dff8a' : '#ffd166', kind: 'spark' });
        break;
      }
    }
    g.globalCompositeOperation = 'source-over';
    if (u >= 1) { s.done = true; s.onHit(); }
  };

  requestAnimationFrame(frame);
  refreshCards();
  st.game.hint('terraview', 'Each tool\'s arrow shows the way it pushes the world on the climate chart. Hover a tool to preview where the dot lands.', '🌍');
  const first = fire && cards.find((c) => c.d.id === fire);
  if (first) setTimeout(() => start(first.d), 350);
}
