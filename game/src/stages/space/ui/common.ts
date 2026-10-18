// Shared UI pieces for the Space stage: bottom sheets, thumbnails, plant glyphs, relation meters.
import { button, h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { RNG } from '../../../engine/rng';
import { TAU } from '../../../engine/math';
import { drawThumb } from '../../../design/render';
import { hsl, shade } from '../../../design/color';
import type { Design } from '../../../design/types';
import type { Empire, Specimen } from '../types';
import { relation, stanceInfo } from '../empires';
import type { World } from '../world';

export interface Sheet {
  wrap: HTMLElement;
  head: HTMLElement;
  tabs: HTMLElement;
  body: HTMLElement;
  close(): void;
  onClose?: () => void;
}

let openSheets: Sheet[] = [];

/** A bottom sheet with a title, optional tab strip and a scrolling body. */
export function sheet(title: string, o: { onClose?: () => void } = {}): Sheet {
  const tabs = h('div', { class: 'sp-tabs' });
  const body = h('div', { class: 'sp-sheet-body' });
  const titleEl = h('h2', null, title);
  const s: Sheet = {
    wrap: null as unknown as HTMLElement, head: null as unknown as HTMLElement, tabs, body, onClose: o.onClose,
    close() {
      s.wrap.remove();
      openSheets = openSheets.filter((x) => x !== s);
      s.onClose?.();
    },
  };
  const head = h('div', { class: 'sp-sheet-head' }, titleEl, button('✕', () => s.close(), { cls: 'icon', title: 'Close' }));
  const panel = h('div', { class: 'sp-sheet' }, head, tabs, body);
  const wrap = h('div', { class: 'sp-sheet-wrap' }, panel);
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) { audio.sfx('click'); s.close(); } });
  s.wrap = wrap;
  s.head = head;
  document.body.append(wrap);
  openSheets.push(s);
  return s;
}
export function closeAllSheets() {
  for (const s of [...openSheets]) s.close();
}
export function anySheetOpen(): boolean {
  return openSheets.length > 0;
}

/** Simple tab strip helper. */
export function tabStrip(el: HTMLElement, tabs: { id: string; label: string; badge?: number }[], cur: string, onPick: (id: string) => void) {
  el.innerHTML = '';
  for (const t of tabs) {
    const b = h('button', { class: 'sp-tab' + (t.id === cur ? ' on' : '') }, t.label, t.badge ? h('span', { class: 'sp-badge' }, String(t.badge)) : null);
    b.addEventListener('click', () => { audio.sfx('tap'); onPick(t.id); });
    el.append(b);
  }
}

export function fmtTime(s: number): string {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function money(n: number): string {
  return '§' + Math.round(n).toLocaleString('en-US');
}

/** A canvas thumbnail of a design. */
export function designThumb(d: Design, w = 92, hh = 64): HTMLCanvasElement {
  const c = h('canvas', { style: `width:${w}px;height:${hh}px` }) as HTMLCanvasElement;
  requestAnimationFrame(() => { try { drawThumb(c, d, { pad: 4 }); } catch { /* parts may be missing */ } });
  return c;
}

/** A small procedural alien plant. */
export function drawPlant(c: HTMLCanvasElement, seed: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = c.clientWidth || 80, ch = c.clientHeight || 52;
  c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = new RNG(seed);
  const hue = r.range(70, 330);
  const stem = hsl(hue - 30, 0.4, 0.38), leaf = hsl(hue, 0.55, 0.5), bloom = hsl((hue + 150) % 360, 0.7, 0.62);
  const x = cw / 2, y = ch - 4;
  const hgt = ch * r.range(0.55, 0.85);
  const kind = r.int(0, 3);
  g.lineCap = 'round';
  g.strokeStyle = shade(stem, -0.5);
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + r.range(-8, 8), y - hgt * 0.5, x, y - hgt); g.stroke();
  g.strokeStyle = stem;
  g.lineWidth = 3;
  g.stroke();
  const ol = shade(leaf, -0.55);
  if (kind === 0) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.55;
      g.fillStyle = leaf; g.strokeStyle = ol; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(x + Math.cos(a) * hgt * 0.32, y - hgt + Math.sin(a) * hgt * 0.32, hgt * 0.32, hgt * 0.1, a, 0, TAU); g.fill(); g.stroke();
    }
  } else if (kind === 1) {
    g.fillStyle = leaf; g.strokeStyle = ol; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y - hgt, hgt * 0.36, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = bloom;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + r.range(-1, 1) * hgt * 0.22, y - hgt + r.range(-1, 1) * hgt * 0.2, 3, 0, TAU); g.fill(); }
  } else if (kind === 2) {
    for (let i = 0; i < 3; i++) {
      const yy = y - hgt * (0.35 + i * 0.25);
      g.fillStyle = leaf; g.strokeStyle = ol; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(x - 7, yy, 9, 4, -0.5, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(x + 7, yy, 9, 4, 0.5, 0, TAU); g.fill(); g.stroke();
    }
    g.fillStyle = bloom;
    g.beginPath(); g.arc(x, y - hgt, 5, 0, TAU); g.fill();
  } else {
    g.fillStyle = bloom; g.strokeStyle = shade(bloom, -0.55); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, y - hgt - 8);
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i / 6) * TAU; g.lineTo(x + Math.cos(a) * 10, y - hgt + Math.sin(a) * 10); }
    g.closePath(); g.fill(); g.stroke();
  }
}

export function specimenThumb(w: World, sp: Specimen, cw = 80, ch = 52): HTMLCanvasElement {
  const c = h('canvas', { style: `width:${cw}px;height:${ch}px` }) as HTMLCanvasElement;
  requestAnimationFrame(() => {
    if (sp.diet === 'plant') drawPlant(c, sp.seed);
    else { const d = w.specimenDesign(sp); if (d) try { drawThumb(c, d, { pad: 3 }); } catch { /* ignore */ } }
  });
  return c;
}

export function dietIcon(d: Specimen['diet']): string {
  return d === 'plant' ? '🌿' : d === 'herbivore' ? '🐄' : d === 'carnivore' ? '🦖' : '🐗';
}

export function stanceChip(e: Empire): HTMLElement {
  const s = stanceInfo(e);
  return h('span', { class: 'sp-stance', style: `background:${s.color}` }, s.icon, ' ', s.label);
}

export function relMeter(e: Empire): HTMLElement {
  const r = relation(e);
  return h('div', { class: 'sp-meter' }, h('i', { style: `left:${(r + 100) / 2}%` }));
}

export function modsList(e: Empire): HTMLElement {
  const box = h('div', { class: 'sp-mods' });
  const mods = [...e.mods].filter((m) => Math.round(m.v) !== 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 7);
  for (const m of mods) {
    const v = Math.round(m.v);
    box.append(h('div', null, h('span', { class: v > 0 ? 'pos' : 'neg' }, (v > 0 ? '+' : '') + v), ' ', m.label));
  }
  if (!mods.length) box.append(h('div', null, 'No strong feelings either way.'));
  return box;
}

/** Live animated portrait of a creature, stops when detached. */
export function portrait(d: Design, cls = 'sp-portrait'): HTMLCanvasElement {
  const c = h('canvas', { class: cls }) as HTMLCanvasElement;
  let t = 0, last = performance.now();
  const tick = (now: number) => {
    if (!c.isConnected) { if (t > 0.5) return; }
    t += (now - last) / 1000;
    last = now;
    try { drawThumb(c, d, { pad: 10, t }); } catch { /* ignore */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return c;
}
