// Social conquest: a short rhythm performance. Notes scroll toward a hit ring; tap the matching
// instrument button on the beat. Hits fill the tribe's admiration meter; at 100% they join you.
import { audio, type SfxName } from '../../engine/audio';
import { h, progressBar } from '../../engine/ui';
import { clamp } from '../../engine/math';
import { RNG } from '../../engine/rng';
import { PLAYER, relationFace, type ToolId, type Tribe, type Unit } from './types';
import type { TribalStage } from './stage';
import { INSTRUMENTS, TOOLS } from './tools';
import { drawIcon } from './sprites';
import { P } from './fx';
import { act } from './units';

interface Note {
  t: number;
  inst: ToolId;
  /** 0 pending, 1 perfect, 2 good, 3 missed */
  state: 0 | 1 | 2 | 3;
  fx: number;
}

const INST_COL: Partial<Record<ToolId, string>> = { drum: '#ff8a5c', horn: '#ffd166', rattle: '#7bd389' };
const INST_SFX: Partial<Record<ToolId, SfxName>> = { drum: 'drum', horn: 'horn', rattle: 'dance' };

export class Concert {
  readonly tribe: Tribe;
  private st: TribalStage;
  private band: Unit[];
  private insts: ToolId[];
  private notes: Note[] = [];
  private t = -1.2;
  private beat: number;
  private travel: number;
  private win: { perfect: number; good: number };
  private lastBeat = -99;
  private combo = 0;
  private hits = 0;
  private misses = 0;
  private ended = false;
  private endT = 0;
  private won = false;
  private judge = { text: '', color: '#fff', t: 0 };
  private ringPulse = 0;
  private el: HTMLElement;
  private laneEl: HTMLElement;
  private meter: ReturnType<typeof progressBar>;
  private faceEl: HTMLElement;
  private comboEl: HTMLElement;
  private btns = new Map<ToolId, HTMLElement>();
  private lane = { x: 0, y: 0, w: 0, h: 0 };

  constructor(st: TribalStage, tribe: Tribe, band: Unit[]) {
    this.st = st;
    this.tribe = tribe;
    this.band = band;
    this.insts = INSTRUMENTS.filter((i) => band.some((u) => u.tool === i));
    const g = st.game;
    const bpm = 92 + tribe.rank * 7 + g.diff(-8, 0, 10);
    this.beat = 60 / bpm;
    this.travel = g.diff(2.5, 2.1, 1.75);
    this.win = { perfect: g.diff(0.09, 0.075, 0.06), good: g.diff(0.22, 0.17, 0.13) };
    const r = new RNG((st.game.state!.seed ^ (tribe.id * 977) ^ Math.floor(st.time * 10)) >>> 0);
    const n = 13 + tribe.rank * 2 + g.diff(-2, 0, 2);
    const gaps = g.diff([2, 2, 1.5, 2, 1], [1, 1.5, 2, 1, 1], [1, 0.5, 1, 1.5, 0.5]);
    let at = 0.8;
    for (let i = 0; i < n; i++) {
      this.notes.push({ t: at, inst: r.pick(this.insts), state: 0, fx: 0 });
      at += r.pick(gaps) * this.beat;
    }
    // Build the overlay.
    this.meter = progressBar('tb-adm');
    this.faceEl = h('div', { class: 'tb-c-face' }, relationFace(tribe).icon);
    this.comboEl = h('div', { class: 'tb-c-combo' });
    this.laneEl = h('div', { class: 'tb-c-lane' });
    const btnRow = h('div', { class: 'tb-c-btns' });
    this.insts.forEach((inst, i) => {
      const count = band.filter((u) => u.tool === inst).length;
      const b = h('button', { class: 'tb-c-btn', style: `--c:${INST_COL[inst]}`, 'aria-label': TOOLS[inst].name },
        h('div', { class: 'i' }, TOOLS[inst].icon), h('div', { class: 'l' }, TOOLS[inst].name), h('div', { class: 'n' }, `×${count}`), h('div', { class: 'k' }, String(i + 1)));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio.unlock(); this.press(inst); b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 90); });
      btnRow.append(b);
      this.btns.set(inst, b);
    });
    const close = h('button', { class: 'btn icon small', 'aria-label': 'Stop the concert', title: 'Stop' }, '✕');
    close.addEventListener('click', (e) => { e.stopPropagation(); this.finish(false); });
    const dancers = band.filter((u) => !u.tool || !INSTRUMENTS.includes(u.tool)).length;
    this.el = h('div', { class: 'tb-concert' },
      h('div', { class: 'tb-c-card' },
        h('div', { class: 'tb-c-head' },
          h('div', { class: 'tb-c-title' }, `🎶 Concert for the ${tribe.name}`),
          close),
        h('div', { class: 'tb-c-meter' }, this.faceEl, this.meter.el, this.comboEl),
        h('div', { class: 'tb-c-sub' }, `Band: ${band.length}${dancers ? ` (${dancers} dancing)` : ''}${band.some((u) => u.chief) ? ' · Chieftain conducts' : ''} · tap when a note reaches the ring`)),
      this.laneEl,
      h('div', { class: 'tb-c-card' }, btnRow));
    st.hud.root.append(this.el);
    st.hud.setConcertMode(true);
    this.updateMeter();
    requestAnimationFrame(() => this.measure());
    audio.music('none');
    audio.sfx('horn', { pitch: 1.25 });
    for (const u of band) { u.bubble = '🎵'; u.bubbleT = 2; }
  }

  private measure() {
    const r = this.laneEl.getBoundingClientRect();
    this.lane = { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  key(k: string) {
    const i = Number(k) - 1;
    if (i >= 0 && i < this.insts.length) {
      this.press(this.insts[i]);
      const b = this.btns.get(this.insts[i]);
      b?.classList.add('hit');
      setTimeout(() => b?.classList.remove('hit'), 90);
    }
    if (k === 'escape') this.finish(false);
  }

  private mult(inst: ToolId): number {
    const st = this.st;
    const players = this.band.filter((u) => !u.dead && u.tool === inst).length;
    const dancers = this.band.filter((u) => !u.dead && (!u.tool || !INSTRUMENTS.includes(u.tool))).length;
    const chief = this.band.some((u) => u.chief && !u.dead) ? 0.1 : 0;
    return clamp(0.6 + 0.13 * Math.min(3, players) + 0.03 * Math.min(4, dancers) + chief + 0.04 * st.bonus.social + 0.015 * st.species.music, 0.6, 1.5);
  }

  private press(inst: ToolId) {
    if (this.ended) return;
    audio.sfx(INST_SFX[inst] ?? 'drum', { pitch: inst === 'horn' ? 1 : 0.9 + Math.random() * 0.2 });
    let best: Note | null = null, bd = Infinity;
    for (const n of this.notes) {
      if (n.state !== 0) continue;
      const d = Math.abs(n.t - this.t);
      if (d < this.win.good && d < bd) { bd = d; best = n; }
    }
    if (!best) {
      this.adjust(-2);
      this.setJudge('Off beat', '#ffb0a0');
      this.combo = 0;
      return;
    }
    if (best.inst !== inst) {
      best.state = 3;
      best.fx = 0;
      this.miss('Wrong one!');
      return;
    }
    const perfect = bd < this.win.perfect;
    best.state = perfect ? 1 : 2;
    best.fx = 0;
    this.hits++;
    this.combo++;
    // Later tribes are harder to impress: a typical band needs two or three concerts.
    const base = (100 / this.notes.length) * 0.7 * (1 - 0.08 * this.tribe.rank);
    const gain = base * this.mult(inst) * (perfect ? 1 : 0.6) * (1 + Math.min(0.3, this.combo * 0.03));
    this.adjust(gain);
    this.tribe.relation = Math.min(100, this.tribe.relation + 1.5);
    this.setJudge(perfect ? 'Perfect!' : 'Good', perfect ? '#ffe27a' : '#b8f5c8');
    this.ringPulse = 1;
    // performers and audience react
    for (const u of this.band) {
      if (u.dead) continue;
      if (u.tool === inst) act(u, inst === 'horn' ? 'sing' : 'dance', 0.5);
      else if (!u.tool || !INSTRUMENTS.includes(u.tool)) act(u, 'dance', 0.6);
      if (Math.random() < 0.5) this.st.fx.add(P.Note, u.x + (Math.random() - 0.5) * 10, u.y - u.hgt * u.size - 6, { vz: 34, life: 1.2, size: 16, icon: Math.random() < 0.5 ? '🎵' : '🎶' });
    }
    const watchers = this.st.tribeMembers(this.tribe);
    if (watchers.length && Math.random() < (perfect ? 0.8 : 0.4)) {
      const w = watchers[Math.floor(Math.random() * watchers.length)];
      w.bubble = Math.random() < 0.5 ? '😍' : '👏';
      w.bubbleT = 1;
      act(w, 'dance', 0.8);
      this.st.fx.add(P.Heart, w.x, w.y - w.hgt * w.size, { vz: 30, life: 1, size: 14, icon: '💗' });
    }
    if (this.tribe.admiration >= 100) this.finish(true);
  }

  private miss(text: string) {
    this.misses++;
    this.combo = 0;
    this.adjust(-7);
    this.setJudge(text, '#ff8a80');
    audio.sfx('error', { vol: 0.6 });
    const watchers = this.st.tribeMembers(this.tribe);
    if (watchers.length) {
      const w = watchers[Math.floor(Math.random() * watchers.length)];
      w.bubble = '😒';
      w.bubbleT = 1.2;
    }
  }

  private adjust(d: number) {
    this.tribe.admiration = clamp(this.tribe.admiration + d, 0, 100);
    this.updateMeter();
  }

  private setJudge(text: string, color: string) { this.judge = { text, color, t: 0.6 }; }

  private updateMeter() {
    const a = this.tribe.admiration;
    this.meter.set(a / 100, `Admiration ${Math.round(a)}%`);
    this.faceEl.textContent = a >= 100 ? '😍' : a > 70 ? '😊' : a > 40 ? '🙂' : relationFace(this.tribe).icon;
    this.comboEl.textContent = this.combo >= 3 ? `×${this.combo}` : '';
  }

  update(dt: number) {
    if (this.ended) {
      this.endT += dt;
      if (this.endT > 1.8) { this.destroy(); this.st.endConcert(this.won); }
      return;
    }
    this.t += dt;
    this.judge.t -= dt;
    this.ringPulse = Math.max(0, this.ringPulse - dt * 3);
    for (const n of this.notes) {
      if (n.state !== 0) n.fx += dt;
      else if (this.t > n.t + this.win.good) { n.state = 3; n.fx = 0; this.miss('Miss'); }
    }
    // metronome
    const b = Math.floor(this.t / this.beat);
    if (b !== this.lastBeat && this.t > -this.beat * 4) {
      this.lastBeat = b;
      audio.sfx('tap', { pitch: b % 4 === 0 ? 0.55 : 0.45, vol: 0.5 });
    }
    // band keeps moving to the beat
    for (const u of this.band) if (!u.dead && !u.action && Math.random() < dt * 0.8) act(u, 'dance', this.beat * 2);
    // the band must stay alive and present
    if (this.band.every((u) => u.dead || u.team !== PLAYER)) { this.finish(false); return; }
    const last = this.notes[this.notes.length - 1];
    if (this.t > last.t + this.win.good + 0.6 && this.notes.every((n) => n.state !== 0)) this.finish(this.tribe.admiration >= 100);
  }

  private finish(win: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.won = win;
    this.endT = 0;
    const st = this.st;
    const res = h('div', { class: 'tb-c-result ' + (win ? 'win' : 'lose') },
      win ? `💚 The ${this.tribe.name} love your music!` : `They want more… admiration ${Math.round(this.tribe.admiration)}%`);
    (this.el.firstElementChild as HTMLElement).append(res);
    if (win) {
      audio.sfx('success');
      st.effects.push({ kind: 'fireworks', t: 0, dur: 3, x: this.tribe.x, y: this.tribe.y - 150 });
      for (const u of this.band) if (!u.dead) act(u, 'pose', 1.4);
      for (const w of st.tribeMembers(this.tribe)) { w.bubble = '💚'; w.bubbleT = 2; act(w, 'dance', 1.4); }
    } else {
      audio.sfx('fail');
      st.hint('concert-retry', 'Admiration carries over between concerts. More players per instrument, gifts and social clothing make it easier.', '🎶');
    }
  }

  destroy() {
    this.el.remove();
  }

  /** Lane, notes and judgement (screen space). */
  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    if (!this.lane.w) this.measure();
    const L = this.lane;
    if (!L.w) return;
    const cy = L.y + L.h / 2 + 8;
    const x0 = L.x + 48;
    const span = L.w - 70;
    g.save();
    // lane
    g.fillStyle = 'rgba(30,18,8,0.72)';
    g.beginPath();
    g.roundRect(L.x, L.y, L.w, L.h, 18);
    g.fill();
    g.strokeStyle = 'rgba(255,220,170,0.25)';
    g.lineWidth = 1.5;
    g.stroke();
    // beat lines
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 2;
    const first = Math.ceil(this.t / this.beat);
    for (let b = first; b < first + 12; b++) {
      const x = x0 + ((b * this.beat - this.t) / this.travel) * span;
      if (x > L.x + L.w - 10) break;
      g.beginPath();
      g.moveTo(x, L.y + 10);
      g.lineTo(x, L.y + L.h - 10);
      g.stroke();
    }
    // hit ring
    const beatPhase = ((this.t % this.beat) + this.beat) % this.beat / this.beat;
    const pulse = 1 + (1 - beatPhase) * 0.08 + this.ringPulse * 0.15;
    g.strokeStyle = '#fff4d6';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(x0, cy, 30 * pulse, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,240,200,0.12)';
    g.fill();
    // notes
    g.save();
    g.beginPath();
    g.roundRect(L.x + 2, L.y, L.w - 4, L.h, 18);
    g.clip();
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      const x = x0 + ((n.t - this.t) / this.travel) * span;
      if (x > L.x + L.w + 30) continue;
      let alpha = 1, scale = 1, y = cy;
      if (n.state === 1 || n.state === 2) { alpha = 1 - n.fx * 3; scale = 1 + n.fx * 3; if (alpha <= 0) continue; }
      if (n.state === 3) { alpha = 1 - n.fx * 2; y += n.fx * 60; if (alpha <= 0) continue; }
      g.globalAlpha = Math.max(0, alpha);
      const col = n.state === 3 ? '#777' : INST_COL[n.inst] ?? '#fff';
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.arc(x, y + 3, 25 * scale, 0, Math.PI * 2); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.arc(x, y, 25 * scale, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2b1a0e';
      g.lineWidth = 2.5;
      g.stroke();
      drawIcon(g, TOOLS[n.inst].icon, x, y, 30 * scale);
    }
    g.restore();
    g.globalAlpha = 1;
    // judgement & countdown
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    if (this.t < 0.6 && !this.ended) {
      const k = this.t < 0 ? '♪ Ready…' : 'Go!';
      g.font = '700 24px Fredoka, ui-rounded, system-ui, sans-serif';
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 5;
      g.strokeText(k, L.x + L.w / 2, cy);
      g.fillStyle = '#fff';
      g.fillText(k, L.x + L.w / 2, cy);
    }
    if (this.judge.t > 0) {
      g.globalAlpha = Math.min(1, this.judge.t * 3);
      g.font = `700 ${18 + this.judge.t * 10}px Fredoka, ui-rounded, system-ui, sans-serif`;
      g.strokeStyle = 'rgba(0,0,0,0.65)';
      g.lineWidth = 5;
      g.strokeText(this.judge.text, x0 + 70, L.y + 20);
      g.fillStyle = this.judge.color;
      g.fillText(this.judge.text, x0 + 70, L.y + 20);
    }
    g.restore();
    void w; void hh;
  }
}
