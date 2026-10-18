// Fully procedural audio: synthesized sound effects and a generative, mood-based ambient score
// (a nod to the original game's Eno-style "composing in probabilities"). No audio files.

export type SfxName =
  | 'click' | 'tap' | 'eat' | 'chomp' | 'hit' | 'hurt' | 'die' | 'pop' | 'levelup' | 'unlock'
  | 'error' | 'spit' | 'roar' | 'sing' | 'dance' | 'charm' | 'pose' | 'whoosh' | 'coin' | 'build'
  | 'explode' | 'laser' | 'warp' | 'zap' | 'splash' | 'heal' | 'card' | 'success' | 'fail' | 'place'
  | 'remove' | 'drum' | 'horn' | 'bell' | 'alarm';

export type Mood = 'none' | 'menu' | 'cell' | 'creature' | 'tribal' | 'civ' | 'space' | 'editor' | 'danger' | 'victory';

interface MoodDef {
  root: number; // MIDI
  scale: number[];
  bpm: number;
  density: number; // 0..1 note probability per step
  octaves: [number, number];
  voice: 'bell' | 'pluck' | 'soft' | 'glass';
  pad: boolean;
  drums: 0 | 1 | 2; // 0 none, 1 soft hand drums, 2 march
  bright: number; // filter cutoff multiplier
}

const MOODS: Record<Exclude<Mood, 'none'>, MoodDef> = {
  menu: { root: 50, scale: [0, 2, 4, 7, 9], bpm: 70, density: 0.32, octaves: [1, 3], voice: 'glass', pad: true, drums: 0, bright: 0.8 },
  cell: { root: 52, scale: [0, 2, 3, 7, 9, 10], bpm: 84, density: 0.38, octaves: [1, 3], voice: 'bell', pad: true, drums: 0, bright: 0.9 },
  creature: { root: 55, scale: [0, 2, 4, 7, 9], bpm: 92, density: 0.36, octaves: [1, 2], voice: 'pluck', pad: true, drums: 1, bright: 1.0 },
  tribal: { root: 50, scale: [0, 3, 5, 7, 10], bpm: 104, density: 0.34, octaves: [1, 2], voice: 'pluck', pad: false, drums: 2, bright: 0.9 },
  civ: { root: 53, scale: [0, 2, 4, 5, 7, 9, 11], bpm: 100, density: 0.3, octaves: [1, 2], voice: 'soft', pad: true, drums: 1, bright: 1.1 },
  space: { root: 45, scale: [0, 2, 3, 7, 8, 10], bpm: 60, density: 0.22, octaves: [1, 3], voice: 'glass', pad: true, drums: 0, bright: 0.7 },
  editor: { root: 57, scale: [0, 2, 4, 7, 9, 11], bpm: 96, density: 0.42, octaves: [1, 3], voice: 'bell', pad: true, drums: 1, bright: 1.1 },
  danger: { root: 48, scale: [0, 1, 3, 6, 7, 10], bpm: 120, density: 0.4, octaves: [0, 2], voice: 'pluck', pad: true, drums: 2, bright: 1.2 },
  victory: { root: 55, scale: [0, 4, 7, 11, 14], bpm: 80, density: 0.5, octaves: [1, 3], voice: 'glass', pad: true, drums: 0, bright: 1.2 },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private mood: Mood = 'none';
  private pendingMood: Mood = 'none';
  private timer: number | null = null;
  private nextStep = 0;
  private step = 0;
  private padNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  private lastSfx = new Map<string, number>();
  musicVol = 0.55;
  sfxVol = 0.8;
  muted = false;

  /** Must be called from a user gesture on mobile. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(c.destination);
      this.musicBus = c.createGain();
      this.musicBus.gain.value = this.musicVol;
      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = this.sfxVol;
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.8, 2.2);
      this.reverbSend = c.createGain();
      this.reverbSend.gain.value = 0.5;
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.master);
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (this.pendingMood !== 'none') this.music(this.pendingMood);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music, this.ctx.currentTime, 0.1);
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
  }
  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx!;
    const n = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  // ---------------------------------------------------------------- SFX
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, dest?: AudioNode, wet = 0.15) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, Math.min(0.01, dur * 0.2), vol, dur);
    o.connect(g);
    g.connect(dest ?? this.sfxBus);
    if (wet > 0) {
      const s = c.createGain();
      s.gain.value = wet;
      g.connect(s);
      s.connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private noise(t: number, dur: number, vol: number, filterType: BiquadFilterType, f0: number, f1 = f0, q = 1, dest?: AudioNode) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.005, vol, dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  sfx(name: SfxName, opts: { pitch?: number; vol?: number } = {}) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // Rate-limit identical sounds so swarms don't clip.
    const last = this.lastSfx.get(name) ?? -1;
    if (now - last < 0.04) return;
    this.lastSfx.set(name, now);
    const p = opts.pitch ?? 1;
    const v = opts.vol ?? 1;
    const t = now + 0.005;
    switch (name) {
      case 'click': this.tone('triangle', 900 * p, 700 * p, t, 0.05, 0.25 * v, undefined, 0); break;
      case 'tap': this.tone('sine', 660 * p, 520 * p, t, 0.06, 0.2 * v, undefined, 0.05); break;
      case 'eat': this.tone('sine', 420 * p, 880 * p, t, 0.09, 0.28 * v); break;
      case 'chomp': this.noise(t, 0.08, 0.35 * v, 'bandpass', 900 * p, 400 * p, 3); this.tone('square', 160 * p, 90 * p, t, 0.07, 0.12 * v, undefined, 0); break;
      case 'hit': this.noise(t, 0.12, 0.4 * v, 'lowpass', 2400 * p, 300, 1); this.tone('sine', 180 * p, 60, t, 0.12, 0.35 * v, undefined, 0); break;
      case 'hurt': this.tone('sawtooth', 300 * p, 120 * p, t, 0.18, 0.18 * v, undefined, 0.1); break;
      case 'die': this.tone('sawtooth', 400 * p, 60 * p, t, 0.6, 0.2 * v); this.noise(t, 0.4, 0.15 * v, 'lowpass', 1200, 100); break;
      case 'pop': this.tone('sine', 300 * p, 1200 * p, t, 0.07, 0.3 * v); break;
      case 'levelup': [0, 4, 7, 12].forEach((s, i) => this.tone('triangle', mtof(72 + s) * p, mtof(72 + s) * p, t + i * 0.08, 0.35, 0.22 * v, undefined, 0.35)); break;
      case 'unlock': [0, 7, 12, 16].forEach((s, i) => this.tone('sine', mtof(76 + s) * p, mtof(76 + s) * p, t + i * 0.06, 0.4, 0.18 * v, undefined, 0.4)); break;
      case 'success': [0, 4, 7].forEach((s, i) => this.tone('triangle', mtof(67 + s) * p, mtof(67 + s) * p, t + i * 0.1, 0.4, 0.2 * v, undefined, 0.3)); break;
      case 'fail': [0, -3, -6].forEach((s, i) => this.tone('triangle', mtof(62 + s) * p, mtof(62 + s) * p, t + i * 0.12, 0.35, 0.18 * v, undefined, 0.2)); break;
      case 'error': this.tone('square', 180 * p, 140 * p, t, 0.15, 0.12 * v, undefined, 0); break;
      case 'spit': this.noise(t, 0.15, 0.3 * v, 'bandpass', 2000 * p, 600 * p, 2); break;
      case 'roar': this.tone('sawtooth', 110 * p, 70 * p, t, 0.7, 0.25 * v, undefined, 0.3); this.noise(t, 0.7, 0.25 * v, 'lowpass', 900 * p, 200, 2); break;
      case 'sing': [0, 4, 7, 4].forEach((s, i) => this.tone('sine', mtof(70 + s) * p, mtof(70 + s) * p * 1.01, t + i * 0.12, 0.25, 0.18 * v, undefined, 0.4)); break;
      case 'dance': [0, 0.12, 0.24].forEach((d) => this.noise(t + d, 0.05, 0.3 * v, 'highpass', 5000, 5000, 1)); this.tone('sine', 120, 80, t, 0.1, 0.3 * v, undefined, 0); break;
      case 'charm': [0, 5, 9, 12, 16].forEach((s, i) => this.tone('sine', mtof(84 + s) * p, mtof(84 + s) * p, t + i * 0.05, 0.3, 0.1 * v, undefined, 0.6)); break;
      case 'pose': this.tone('triangle', 500 * p, 1000 * p, t, 0.25, 0.18 * v, undefined, 0.3); break;
      case 'whoosh': this.noise(t, 0.35, 0.25 * v, 'bandpass', 400 * p, 2400 * p, 1.5); break;
      case 'coin': this.tone('square', 990 * p, 990 * p, t, 0.06, 0.12 * v, undefined, 0.1); this.tone('square', 1320 * p, 1320 * p, t + 0.06, 0.15, 0.12 * v, undefined, 0.2); break;
      case 'build': [0, 0.09, 0.18].forEach((d) => this.noise(t + d, 0.06, 0.3 * v, 'bandpass', 800 * p, 800 * p, 4)); break;
      case 'explode': this.noise(t, 0.9, 0.5 * v, 'lowpass', 1800 * p, 60, 1); this.tone('sine', 90 * p, 30, t, 0.6, 0.4 * v, undefined, 0.2); break;
      case 'laser': this.tone('sawtooth', 1600 * p, 200 * p, t, 0.18, 0.14 * v, undefined, 0.15); break;
      case 'warp': this.tone('sine', 120 * p, 1800 * p, t, 0.8, 0.2 * v, undefined, 0.5); this.noise(t, 0.8, 0.12 * v, 'bandpass', 300, 4000, 2); break;
      case 'zap': this.tone('square', 1200 * p, 300 * p, t, 0.12, 0.12 * v, undefined, 0.1); this.noise(t, 0.1, 0.2 * v, 'highpass', 3000, 3000, 1); break;
      case 'splash': this.noise(t, 0.4, 0.3 * v, 'lowpass', 3000 * p, 400, 1); break;
      case 'heal': [0, 5, 9].forEach((s, i) => this.tone('sine', mtof(79 + s) * p, mtof(79 + s) * p, t + i * 0.07, 0.4, 0.14 * v, undefined, 0.5)); break;
      case 'card': this.noise(t, 0.12, 0.2 * v, 'highpass', 2500, 2500, 1); this.tone('triangle', mtof(79) * p, mtof(79) * p, t + 0.05, 0.6, 0.15 * v, undefined, 0.5); break;
      case 'place': this.tone('sine', 520 * p, 780 * p, t, 0.08, 0.22 * v, undefined, 0.1); break;
      case 'remove': this.tone('sine', 600 * p, 300 * p, t, 0.1, 0.2 * v, undefined, 0.05); break;
      case 'drum': this.tone('sine', 150 * p, 55 * p, t, 0.25, 0.45 * v, undefined, 0.1); break;
      case 'horn': this.tone('sawtooth', mtof(55) * p, mtof(55) * p, t, 0.6, 0.12 * v, undefined, 0.4); this.tone('sawtooth', mtof(62) * p, mtof(62) * p, t, 0.6, 0.08 * v, undefined, 0.4); break;
      case 'bell': this.bell(mtof(84) * p, t, 1.4, 0.18 * v, this.sfxBus); break;
      case 'alarm': [0, 0.25].forEach((d) => this.tone('square', 880 * p, 660 * p, t + d, 0.2, 0.1 * v, undefined, 0.1)); break;
    }
  }

  private bell(f: number, t: number, dur: number, vol: number, dest: AudioNode) {
    const c = this.ctx!;
    const g = c.createGain();
    this.env(g, t, 0.005, vol, dur);
    for (const [ratio, amp] of [[1, 1], [2.76, 0.4], [5.4, 0.2]] as const) {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    g.connect(dest);
    const s = c.createGain();
    s.gain.value = 0.5;
    g.connect(s);
    s.connect(this.reverbSend);
  }

  // ---------------------------------------------------------------- Generative music
  music(mood: Mood) {
    this.pendingMood = mood;
    if (!this.ctx) return;
    if (mood === this.mood) return;
    this.mood = mood;
    this.stopPad();
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (mood === 'none') return;
    const def = MOODS[mood];
    this.step = 0;
    this.nextStep = this.ctx.currentTime + 0.1;
    if (def.pad) this.startPad(def);
    this.timer = window.setInterval(() => this.schedule(def), 120);
  }

  private startPad(def: MoodDef) {
    const c = this.ctx!;
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.05, c.currentTime, 2.5);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 700 * def.bright;
    filt.connect(gain);
    gain.connect(this.musicBus);
    const s = c.createGain();
    s.gain.value = 0.8;
    gain.connect(s);
    s.connect(this.reverbSend);
    const osc: OscillatorNode[] = [];
    for (const [semi, det] of [[0, -6], [7, 5], [12, 3]] as const) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(def.root - 12 + semi);
      o.detune.value = det;
      o.connect(filt);
      o.start();
      osc.push(o);
    }
    // Slow filter breathing.
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 300 * def.bright;
    lfo.connect(lfoG);
    lfoG.connect(filt.frequency);
    lfo.start();
    osc.push(lfo);
    this.padNodes = { osc, gain };
  }
  private stopPad() {
    if (!this.padNodes || !this.ctx) return;
    const { osc, gain } = this.padNodes;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.0001, t, 0.6);
    for (const o of osc) { try { o.stop(t + 3); } catch { /* ignore */ } }
    this.padNodes = null;
  }

  private schedule(def: MoodDef) {
    const c = this.ctx!;
    const stepDur = 60 / def.bpm / 2; // eighth notes
    while (this.nextStep < c.currentTime + 0.4) {
      const t = this.nextStep;
      const s = this.step;
      // Melody: probabilistic notes from the scale, with a gentle preference for stepwise motion.
      if (Math.random() < def.density * (s % 4 === 0 ? 1.4 : 0.8)) {
        const oct = def.octaves[0] + Math.floor(Math.random() * (def.octaves[1] - def.octaves[0] + 1));
        const deg = def.scale[Math.floor(Math.random() * def.scale.length)];
        const f = mtof(def.root + 12 * oct + deg - 12);
        this.voice(def, f, t, stepDur);
      }
      // Bass on bar starts.
      if (s % 16 === 0) this.tone('triangle', mtof(def.root - 12), mtof(def.root - 12), t, stepDur * 6, 0.09, this.musicBus, 0.2);
      if (s % 16 === 8 && Math.random() < 0.6) {
        const deg = def.scale[Math.min(def.scale.length - 1, 3)];
        this.tone('triangle', mtof(def.root - 12 + deg), mtof(def.root - 12 + deg), t, stepDur * 5, 0.07, this.musicBus, 0.2);
      }
      if (def.drums) this.drums(def, s, t);
      this.nextStep += stepDur;
      this.step++;
    }
  }
  private voice(def: MoodDef, f: number, t: number, stepDur: number) {
    switch (def.voice) {
      case 'bell': this.bell(f, t, 1.6, 0.05, this.musicBus); break;
      case 'glass': this.bell(f, t, 2.6, 0.04, this.musicBus); break;
      case 'pluck': {
        const c = this.ctx!;
        const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = f;
        fl.type = 'lowpass';
        fl.frequency.setValueAtTime(3000 * def.bright, t);
        fl.frequency.exponentialRampToValueAtTime(300, t + 0.3);
        this.env(g, t, 0.005, 0.06, 0.5);
        o.connect(fl); fl.connect(g); g.connect(this.musicBus);
        const s = c.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(this.reverbSend);
        o.start(t); o.stop(t + 0.6);
        break;
      }
      case 'soft': this.tone('sine', f, f, t, stepDur * 3, 0.07, this.musicBus, 0.5); break;
    }
  }
  private drums(def: MoodDef, s: number, t: number) {
    const bus = this.musicBus;
    if (def.drums === 1) {
      if (s % 8 === 0) this.tone('sine', 140, 60, t, 0.25, 0.14, bus, 0.1);
      if (s % 8 === 5 && Math.random() < 0.7) this.tone('sine', 220, 120, t, 0.12, 0.08, bus, 0.1);
      if (Math.random() < 0.15) this.noise(t, 0.04, 0.04, 'highpass', 6000, 6000, 1, bus);
    } else {
      if (s % 4 === 0) this.tone('sine', 120, 50, t, 0.3, 0.18, bus, 0.1);
      if (s % 4 === 2 && Math.random() < 0.8) this.tone('sine', 200, 110, t, 0.15, 0.1, bus, 0.1);
      if (s % 2 === 1 && Math.random() < 0.5) this.noise(t, 0.05, 0.05, 'bandpass', 3000, 3000, 2, bus);
    }
  }
}

export const audio = new AudioEngine();
