// The Game: owns the canvas, the main loop, the scene stack, saves, achievements and stage flow.
import { Input, type InputHandler } from '../engine/input';
import { audio, type Mood } from '../engine/audio';
import { h, ui } from '../engine/ui';
import { loadJSON, removeKey, saveJSON } from '../engine/storage';
import { RNG, hashString, uid } from '../engine/rng';
import type { Design } from '../design/types';
import { ACHIEVEMENT_MAP } from './achievements';
import { archetypeFor, CARDS, type CardColor, type CardStage, STAGE_ORDER, type StageId } from './cards';
import { DEFAULT_SETTINGS, type Difficulty, type GameState, type Settings } from './state';

export interface Scene extends InputHandler {
  /** Short id used for debugging. */
  name: string;
  music?: Mood;
  /** If true, the scene beneath is rendered first (overlay scenes). */
  transparent?: boolean;
  enter(game: Game): void;
  exit(): void;
  update(dt: number): void;
  render(g: CanvasRenderingContext2D, w: number, h: number): void;
  /** Another scene was pushed on top. */
  pause?(): void;
  /** The scene above was popped. */
  resume?(): void;
  onResize?(w: number, h: number): void;
  /** Stages: return a JSON-safe blob to store in state.stageData for mid-stage saves. */
  serialize?(): unknown;
}

interface StackEntry {
  scene: Scene;
  root: HTMLElement;
  input: InputHandler[] | null;
}

// Storage keys keep the game's first name (Primordia) so existing saves carry over.
const SAVE_KEY = 'primordia.save.v1';
const SETTINGS_KEY = 'primordia.settings.v1';
const ACH_KEY = 'primordia.achievements.v1';

type StageFactory = () => Scene;

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly input: Input;
  readonly audio = audio;
  w = 1;
  h = 1;
  dpr = 1;
  time = 0;
  state: GameState | null = null;
  settings: Settings;
  achievements: Set<string>;
  debug = false;
  private stack: StackEntry[] = [];
  private last = 0;
  private saveTimer = 0;
  private stageFactories: Partial<Record<StageId, StageFactory>> = {};
  private screenFactories: Record<string, (arg?: unknown) => Scene> = {};
  private fadeEl: HTMLElement;
  fps = 60;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false })!;
    ui.init(uiRoot);
    this.input = new Input(canvas);
    this.settings = { ...DEFAULT_SETTINGS, ...loadJSON<Partial<Settings>>(SETTINGS_KEY, {}) };
    this.achievements = new Set(loadJSON<string[]>(ACH_KEY, []));
    audio.setVolumes(this.settings.music, this.settings.sfx);
    audio.setMuted(this.settings.muted);
    this.fadeEl = h('div', { class: 'fade-black' });
    document.body.append(this.fadeEl);
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.save(); audio.ctx?.suspend().catch(() => {}); }
      else audio.ctx?.resume().catch(() => {});
    });
    this.resize();
  }

  // ------------------------------------------------------------------ registry
  registerStage(id: StageId, f: StageFactory) { this.stageFactories[id] = f; }
  registerScreen(id: string, f: (arg?: unknown) => Scene) { this.screenFactories[id] = f; }
  screen(id: string, arg?: unknown): Scene {
    const f = this.screenFactories[id];
    if (!f) throw new Error('Unknown screen ' + id);
    return f(arg);
  }

  // ------------------------------------------------------------------ loop
  start() {
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000)) || 1 / 60;
      this.last = now;
      this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
      this.frame(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame((t) => { this.last = t; requestAnimationFrame(tick); });
  }

  private frame(dt: number) {
    this.time += dt;
    const top = this.stack[this.stack.length - 1];
    if (top) {
      try { top.scene.update(dt); } catch (e) { console.error(e); }
    }
    if (this.state) {
      this.state.playSeconds += dt;
      this.saveTimer += dt;
      if (this.saveTimer > 30) { this.saveTimer = 0; this.save(); }
    }
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalAlpha = 1;
    // Render from the lowest non-covered scene upward.
    let from = this.stack.length - 1;
    while (from > 0 && this.stack[from].scene.transparent) from--;
    if (from < 0) { g.fillStyle = '#07131f'; g.fillRect(0, 0, this.w, this.h); }
    for (let i = Math.max(0, from); i < this.stack.length; i++) {
      g.save();
      try { this.stack[i].scene.render(g, this.w, this.h); } catch (e) { console.error(e); }
      g.restore();
    }
  }

  resize() {
    const vv = window.visualViewport;
    this.w = Math.round(vv?.width ?? window.innerWidth);
    this.h = Math.round(vv?.height ?? window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    for (const e of this.stack) e.scene.onResize?.(this.w, this.h);
  }

  // ------------------------------------------------------------------ scenes
  get scene(): Scene | null {
    return this.stack[this.stack.length - 1]?.scene ?? null;
  }

  /** Replace the entire scene stack. */
  setScene(s: Scene) {
    while (this.stack.length) {
      const e = this.stack.pop()!;
      try { e.scene.exit(); } catch (err) { console.error(err); }
      e.root.remove();
    }
    this.input.clear();
    this.enterScene(s);
  }

  /** Push an overlay scene (e.g. editor). The scene below is paused and its HUD hidden. */
  push(s: Scene) {
    const below = this.stack[this.stack.length - 1];
    if (below) {
      below.input = this.input.suspend();
      below.root.style.display = s.transparent ? '' : 'none';
      if (s.transparent) below.root.style.pointerEvents = 'none';
      below.scene.pause?.();
    }
    this.enterScene(s);
  }

  pop() {
    const e = this.stack.pop();
    if (!e) return;
    try { e.scene.exit(); } catch (err) { console.error(err); }
    e.root.remove();
    this.input.clear();
    const below = this.stack[this.stack.length - 1];
    if (below) {
      below.root.style.display = '';
      below.root.style.pointerEvents = '';
      if (below.input) this.input.restore(below.input);
      below.input = null;
      below.scene.resume?.();
      if (below.scene.music) audio.music(below.scene.music);
    }
  }

  private enterScene(s: Scene) {
    const root = h('div', { class: 'layer scene-root', 'data-scene': s.name });
    ui.root.append(root);
    const entry: StackEntry = { scene: s, root, input: null };
    this.stack.push(entry);
    this.input.push(s);
    if (s.music) audio.music(s.music);
    s.enter(this);
  }

  /** A full-screen, pointer-transparent container in the current scene's UI root. Removed with the scene. */
  layer(cls = ''): HTMLElement {
    const top = this.stack[this.stack.length - 1];
    const l = h('div', { class: 'layer ' + cls });
    (top?.root ?? ui.root).append(l);
    return l;
  }

  async fade(fn: () => void | Promise<void>, ms = 450) {
    this.fadeEl.style.transitionDuration = ms + 'ms';
    this.fadeEl.classList.add('on');
    await new Promise((r) => setTimeout(r, ms));
    await fn();
    await new Promise((r) => setTimeout(r, 60));
    this.fadeEl.classList.remove('on');
  }

  banner(small: string, big: string) {
    const b = h('div', { class: 'stage-banner' }, h('div', { class: 'sb-small' }, small), h('div', { class: 'sb-big' }, big));
    this.layer('passthrough').append(b);
    setTimeout(() => b.remove(), 3400);
  }

  // ------------------------------------------------------------------ state
  hasSave(): boolean {
    return !!loadJSON<GameState | null>(SAVE_KEY, null);
  }

  newState(o: { planetName: string; speciesName: string; difficulty: Difficulty; seed?: number }): GameState {
    const seed = o.seed ?? (hashString(o.planetName + Date.now()) >>> 0);
    const s: GameState = {
      v: 1, id: uid(), seed, planetName: o.planetName, speciesName: o.speciesName, difficulty: o.difficulty,
      stage: 'cell', createdAt: Date.now(), playSeconds: 0, cards: {}, cell: null, creature: null, outfit: null,
      designs: {}, unlocked: [], allies: [], stageData: {}, carry: {}, stats: {}, history: [],
    };
    this.state = s;
    return s;
  }

  save() {
    if (!this.state) return;
    // Let the active stage contribute its mid-stage snapshot.
    for (const e of this.stack) {
      if (e.scene.serialize && (STAGE_ORDER as string[]).includes(e.scene.name)) {
        try { this.state.stageData[e.scene.name as StageId] = e.scene.serialize(); } catch (err) { console.error(err); }
      }
    }
    saveJSON(SAVE_KEY, this.state);
  }

  loadSave(): GameState | null {
    const s = loadJSON<GameState | null>(SAVE_KEY, null);
    if (s && s.v === 1) { this.state = s; return s; }
    return null;
  }

  deleteSave() {
    removeKey(SAVE_KEY);
    this.state = null;
  }

  saveSettings() {
    saveJSON(SETTINGS_KEY, this.settings);
    audio.setVolumes(this.settings.music, this.settings.sfx);
    audio.setMuted(this.settings.muted);
  }

  /** Deterministic RNG scoped to the current save and a purpose string. */
  rng(purpose: string): RNG {
    return new RNG(((this.state?.seed ?? 1) ^ hashString(purpose)) >>> 0);
  }

  get difficulty(): Difficulty {
    return this.state?.difficulty ?? 'normal';
  }
  /** Multiplier helper: easy → a, normal → b, hard → c. */
  diff<T>(easy: T, normal: T, hard: T): T {
    const d = this.difficulty;
    return d === 'easy' ? easy : d === 'hard' ? hard : normal;
  }

  stat(key: string, delta = 1): number {
    if (!this.state) return 0;
    this.state.stats[key] = (this.state.stats[key] ?? 0) + delta;
    return this.state.stats[key];
  }

  history(text: string, icon?: string) {
    if (!this.state) return;
    this.state.history.push({ stage: this.state.stage, text, icon, at: Date.now() });
    if (this.state.history.length > 200) this.state.history.shift();
  }

  unlock(id: string) {
    if (this.achievements.has(id)) return;
    const a = ACHIEVEMENT_MAP[id];
    if (!a) return;
    this.achievements.add(id);
    saveJSON(ACH_KEY, [...this.achievements]);
    audio.sfx('unlock');
    ui.toast(`Achievement: ${a.name}`, { icon: a.icon, kind: 'gold', ms: 3500 });
  }

  hint(id: string, text: string, icon = '💡') {
    if (!this.settings.hints || !this.state) return;
    const key = 'hint:' + id;
    if (this.state.carry[key]) return;
    this.state.carry[key] = true;
    ui.toast(text, { icon, ms: 5000 });
  }

  /** Unlock a part for the species (creature/cell editors). Returns true if newly unlocked. */
  unlockPart(partId: string): boolean {
    if (!this.state || this.state.unlocked.includes(partId)) return false;
    this.state.unlocked.push(partId);
    return true;
  }

  // ------------------------------------------------------------------ stage flow
  startStage(id: StageId) {
    if (!this.state) return;
    this.state.stage = id;
    const f = this.stageFactories[id];
    if (!f) { ui.toast('Stage not available yet: ' + id, { kind: 'bad' }); return; }
    this.fade(() => {
      this.setScene(f());
      this.save();
    });
  }

  /**
   * Called by a stage when its goal is met. Records the consequence card and shows the
   * evolution screen, which then advances to the next stage.
   */
  completeStage(card: CardColor, summary: string[] = []) {
    const s = this.state;
    if (!s) return;
    const stage = s.stage as CardStage;
    if (stage !== ('space' as string)) {
      s.cards[stage] = card;
      this.history(`Earned the ${CARDS[stage][card].name} card`, CARDS[stage][card].icon);
      if (stage === 'civ') s.archetype = archetypeFor(s.cards);
    }
    delete s.stageData[stage];
    this.save();
    this.fade(() => this.setScene(this.screen('evolve', { stage, card, summary })));
  }

  /** Move to the stage after the current one. */
  advance() {
    const s = this.state;
    if (!s) return;
    const i = STAGE_ORDER.indexOf(s.stage);
    const next = STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, i + 1)];
    this.startStage(next);
  }

  goTitle() {
    this.save();
    this.fade(() => this.setScene(this.screen('title')));
  }

  /** Set a species design and keep the codex copy current. */
  setDesign(slot: 'cell' | 'creature' | 'outfit', d: Design) {
    if (!this.state) return;
    this.state[slot] = d;
  }
}
