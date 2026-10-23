// Conversations in the style of the Fallout games. The speaker's face fills the screen, their words are typed
// across the top, and your replies sit in a framed terminal menu at the bottom. Arrow keys or W/S move the
// highlight, Enter or a tap picks a reply, 1-9 pick directly and Esc picks the goodbye reply.
import { h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { clamp, TAU } from '../../../engine/math';
import { getPart } from '../../../design/registry';
import { layoutDesign, renderDesign } from '../../../design/render';
import type { Design } from '../../../design/types';

export interface Reply {
  text: string;
  /** Shown in brackets before the text: a check, a price or an action, e.g. "Relation 70" or "§50,000". */
  tag?: string;
  /** The check fails right now. The reply is greyed out but can still be picked (the speaker turns you down). */
  fail?: boolean;
  /** The goodbye or back-out reply, picked by Esc. */
  leave?: boolean;
  /** What the speaker says next, or nothing to end the conversation. */
  go?: () => Line | void;
}

export type Mood = 'calm' | 'happy' | 'angry';

export interface Line {
  say: string;
  replies: Reply[];
  mood?: Mood;
  /** A warning box above the replies: the line is asking you to confirm something drastic. */
  warn?: string;
}

export interface Speaker {
  name: string;
  /** Small text next to the name, e.g. "Merchant · 6 systems". */
  sub?: string;
  design: Design;
  /** Glow behind the speaker. */
  color: string;
  /** Amber for living things, green for machines. */
  scheme?: 'amber' | 'green';
  /** Typing blip. */
  voice?: { sfx: 'tap' | 'click'; pitch: number };
  /** Their feelings about you, -100..100, shown in the frame. Changes are announced. */
  meter?: () => { v: number; label: string };
  /** Your credits, shown in the frame. */
  caps?: () => number;
}

interface Mote { x: number; y: number; z: number; s: number }

let current: { note: (text: string, kind?: 'good' | 'bad') => void } | null = null;

/** Show a short notice in the open conversation (e.g. "Mission accepted"). */
export function talkNote(text: string, kind?: 'good' | 'bad') {
  current?.note(text, kind);
}

export function talkOpen(): boolean { return !!current; }

/** The middle of the speaker's face in design space, and its radius. */
function faceOf(d: Design): { x: number; y: number; r: number } {
  const n = d.spine.length - 1;
  const hn = d.spine[n];
  if (!hn) {
    const L = layoutDesign(d);
    return { x: L.cx, y: L.top + L.height / 2, r: Math.max(10, L.height / 2) };
  }
  let x0 = hn.x - hn.r, x1 = hn.x + hn.r, y0 = hn.y - hn.r, y1 = hn.y + hn.r;
  for (const pi of d.parts) {
    if (pi.node !== n) continue;
    const p = getPart(pi.partId);
    if (!p || p.category === 'leg' || p.category === 'arm' || p.category === 'wing' || p.category === 'tail') continue;
    const r = Math.min(p.radius * pi.scale, hn.r * 1.1);
    const px = hn.x + pi.ox, py = hn.y + pi.oy;
    x0 = Math.min(x0, px - r); x1 = Math.max(x1, px + r);
    y0 = Math.min(y0, py - r); y1 = Math.max(y1, py + r);
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0) / 2 };
}

/** Any CSS colour as [r, g, b]. */
function rgbOf(c: string): [number, number, number] {
  const g = document.createElement('canvas').getContext('2d')!;
  g.fillStyle = '#000';
  g.fillStyle = c;
  const s = String(g.fillStyle);
  if (s.startsWith('#')) { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = s.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2]] : [255, 182, 66];
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a, 0, 1)})`;

export interface SceneOpts {
  design: Design;
  color: string;
  /** Screen area to frame the face in. */
  region: () => { top: number; height: number };
  speaking: () => boolean;
  angry: () => boolean;
  /** -1..1: a flash of warmth (or chill) after a reply moved them. */
  warmth?: () => number;
}

/** Paint a speaker's close-up into a full-screen canvas until it leaves the page: their colour glowing behind
 * them (redder when angry), drifting motes, the face framed in `region` with the body running off the edge, the
 * mouth moving while they speak, and signal noise as the channel opens. */
export function faceScene(cv: HTMLCanvasElement, o: SceneOpts) {
  const base = rgbOf(o.color), angry: [number, number, number] = [255, 70, 50];
  const face = faceOf(o.design);
  const L = layoutDesign(o.design);
  const motes: Mote[] = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, s: Math.random() }));
  let t = 0, last = performance.now(), moodK = 0, talkT = 0;
  const frame = (now: number) => {
    if (!cv.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    const speaking = o.speaking();
    talkT = speaking ? talkT + dt : 0;
    moodK += ((o.angry() ? 1 : 0) - moodK) * Math.min(1, dt * 4);
    const warm = o.warmth?.() ?? 0;
    const W = cv.clientWidth || window.innerWidth, H = cv.clientHeight || window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reg = o.region();
    const midH = Math.max(120, reg.height);
    const fx = W * 0.5 + Math.sin(t * 0.21) * W * 0.008;
    const fy = reg.top + midH * 0.5 + Math.sin(t * 0.27) * 4;
    const facePx = clamp(Math.min(W * 0.46, midH * 0.62), 110, 320) * (1 + Math.sin(t * 0.17) * 0.012);
    const col: [number, number, number] = [0, 1, 2].map((i) => base[i] + (angry[i] - base[i]) * moodK) as [number, number, number];
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const glowA = 0.42 + warm * 0.18 + moodK * Math.sin(t * 6) * 0.08;
    const bg = g.createRadialGradient(fx, fy, 0, fx, fy, Math.max(W, H) * 0.7);
    bg.addColorStop(0, rgba(col, glowA));
    bg.addColorStop(0.4, rgba(col, glowA * 0.32));
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    for (const m of motes) {
      m.y -= dt * 0.012 * m.z;
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
      const x = m.x * W + Math.sin(t * 0.4 + m.s * TAU) * 10 * m.z;
      g.fillStyle = rgba(col, 0.1 + m.z * 0.25);
      g.beginPath(); g.arc(x, m.y * H, 0.8 + m.z * 2.2, 0, TAU); g.fill();
    }
    const size = facePx / (face.r * 2);
    const sig = clamp(t / 0.5, 0, 1);
    g.save();
    g.globalAlpha = sig;
    const jx = speaking && moodK > 0.5 ? (Math.random() - 0.5) * 2.4 : 0;
    try {
      renderDesign(g, o.design, fx - (face.x - L.cx) * size + jx, fy - (face.y - L.groundY) * size, size,
        { t, action: speaking ? 'talk' : undefined, actionT: talkT * 3.2 }, { shadow: false });
    } catch { /* a broken design still lets you talk */ }
    g.restore();
    if (sig < 1) {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = rgba(col, (1 - sig) * 0.5 * Math.random());
        g.fillRect(0, Math.random() * H, W, 2 + Math.random() * 10);
      }
    }
    // Darken toward the bottom so the frame always reads.
    const fade = g.createLinearGradient(0, H * 0.45, 0, H);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = fade;
    g.fillRect(0, H * 0.45, W, H * 0.55);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Open a conversation. Resolves once it ends. */
export function openTalk(sp: Speaker, first: Line): Promise<void> {
  return new Promise((done) => {
    const scheme = sp.scheme ?? 'amber';
    const cv = h('canvas', { class: 'ft-cv' }) as HTMLCanvasElement;
    const say = h('div', { class: 'ft-say' });
    const notes = h('div', { class: 'ft-notes' });
    const mid = h('div', { class: 'ft-mid' }, notes);
    const opts = h('div', { class: 'ft-opts', role: 'listbox' });
    const warnEl = h('div', { class: 'ft-warn', role: 'alert' });
    warnEl.hidden = true;
    const relEl = h('span', { class: 'ft-rel' });
    const capsEl = h('span', { class: 'ft-caps' });
    const box = h('div', { class: 'ft-box' },
      h('div', { class: 'ft-tab' }, h('b', null, sp.name), sp.sub ? h('span', null, sp.sub) : null),
      h('div', { class: 'ft-info' }, capsEl, relEl),
      warnEl, opts);
    const root = h('div', { class: `ft ft-${scheme}` }, cv, h('div', { class: 'ft-scan' }), h('div', { class: 'ft-top' }, say), mid, box);
    document.body.append(root);

    const voice = sp.voice ?? { sfx: 'tap', pitch: 1.6 };
    const seen = new Set<string>();
    let line = first, text = '', shown = 0, pause = 0, sel = 0, guardUntil = 0, closing = false;
    let last = performance.now(), warm = 0;

    const info = () => {
      capsEl.textContent = sp.caps ? `§${Math.floor(sp.caps()).toLocaleString('en-US')}` : '';
      const m = sp.meter?.();
      relEl.innerHTML = '';
      if (m) relEl.append(h('span', null, m.label), h('span', { class: 'ft-bar' }, h('i', { style: `width:${(m.v + 100) / 2}%` })), h('span', null, `${m.v > 0 ? '+' : ''}${m.v}`));
    };
    const note = (msg: string, kind?: 'good' | 'bad') => {
      const n = h('div', { class: 'ft-note' + (kind ? ' ' + kind : '') }, msg);
      notes.append(n);
      setTimeout(() => n.remove(), 3600);
      while (notes.childElementCount > 4) notes.firstElementChild?.remove();
    };
    current = { note };

    const setSel = (i: number, scroll = false) => {
      const els = opts.children;
      if (!els.length) return;
      sel = (i + els.length) % els.length;
      for (let k = 0; k < els.length; k++) els[k].classList.toggle('on', k === sel);
      if (scroll) (els[sel] as HTMLElement).scrollIntoView({ block: 'nearest' });
    };
    const show = (l: Line) => {
      line = l;
      text = l.say;
      shown = 0; pause = 0;
      // A confirmation ignores clicks a little longer, so a double-click cannot answer it by accident.
      guardUntil = performance.now() + (l.warn ? 700 : 220);
      opts.innerHTML = '';
      warnEl.textContent = l.warn ?? '';
      warnEl.hidden = !l.warn;
      l.replies.forEach((r, i) => {
        const el = h('div', { class: 'ft-opt' + (r.fail ? ' fail' : '') + (seen.has(r.text) && !r.leave ? ' seen' : ''), role: 'option' },
          r.tag ? h('span', { class: 'ft-tag' }, `[${r.tag}] `) : null, r.text);
        el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setSel(i); });
        el.addEventListener('click', (e) => { e.stopPropagation(); pick(i); });
        opts.append(el);
      });
      opts.scrollTop = 0;
      setSel(0);
      say.textContent = '';
    };
    const finishTyping = () => { shown = text.length; say.textContent = text; };
    const pick = (i: number) => {
      if (closing || performance.now() < guardUntil) return;
      const r = line.replies[i];
      if (!r) return;
      audio.sfx('click', { pitch: 0.75 });
      seen.add(r.text);
      const before = sp.meter?.().v;
      const next = r.go?.();
      const after = sp.meter?.().v;
      if (before !== undefined && after !== undefined && after !== before) {
        note(`${sp.name} ${after > before ? 'liked' : 'disliked'} that (${after > before ? '+' : ''}${after - before}).`, after > before ? 'good' : 'bad');
        warm = after > before ? 1 : -1;
      }
      info();
      if (next) show(next);
      else close();
    };
    const close = () => {
      if (closing) return;
      closing = true;
      window.removeEventListener('keydown', onKey, true);
      root.classList.add('out');
      setTimeout(() => {
        root.remove();
        if (current?.note === note) current = null;
        done();
      }, 200);
    };
    const onKey = (e: KeyboardEvent) => {
      // The conversation owns the keyboard while it is open.
      e.stopPropagation();
      const k = e.key.toLowerCase();
      const n = line.replies.length;
      if (k === 'arrowdown' || k === 's') { setSel(sel + 1, true); e.preventDefault(); }
      else if (k === 'arrowup' || k === 'w') { setSel(sel - 1, true); e.preventDefault(); }
      else if (k === 'enter' || k === ' ') { e.preventDefault(); if (shown < text.length) finishTyping(); else pick(sel); }
      else if (/^[1-9]$/.test(k) && +k <= n) pick(+k - 1);
      else if (k === 'escape') { const j = line.replies.findIndex((r) => r.leave); if (j >= 0) pick(j); }
    };
    window.addEventListener('keydown', onKey, true);
    // Tapping the scene finishes the line being typed.
    root.addEventListener('pointerdown', (e) => { if (!box.contains(e.target as Node) && shown < text.length) finishTyping(); });

    const frame = (now: number) => {
      if (!root.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Typing, with a beat after each sentence.
      if (shown < text.length) {
        if (pause > 0) pause -= dt;
        else {
          const before = Math.floor(shown);
          shown = Math.min(text.length, shown + dt * 52);
          const after = Math.floor(shown);
          if (after > before) {
            say.textContent = text.slice(0, after);
            const ch = text[after - 1];
            if ('.!?'.includes(ch) && text[after] === ' ') pause = 0.22;
            if (after % 3 === 0 && ch !== ' ') audio.sfx(voice.sfx, { vol: 0.09, pitch: voice.pitch + Math.random() * 0.3 });
          }
        }
      }
      warm += (0 - warm) * Math.min(1, dt * 1.5);
      requestAnimationFrame(frame);
    };
    // The free space between the line and the reply box frames the face.
    faceScene(cv, {
      design: sp.design, color: sp.color,
      region: () => mid.getBoundingClientRect(),
      speaking: () => shown < text.length,
      angry: () => line.mood === 'angry',
      warmth: () => warm,
    });

    info();
    show(first);
    requestAnimationFrame(frame);
  });
}
