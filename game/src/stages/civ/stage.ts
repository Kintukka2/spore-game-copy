// The Civilization stage scene: owns the world state, camera, input and the per-frame loop,
// and routes simulation events to the HUD, sound and achievements.
import type { Game, Scene } from '../../game/game';
import type { PointerInfo } from '../../engine/input';
import { Camera } from '../../engine/camera';
import { audio, type Mood, type SfxName } from '../../engine/audio';
import { ui } from '../../engine/ui';
import { clamp, damp } from '../../engine/math';
import { RNG } from '../../engine/rng';
import { generateBuilding, generateCreature, generateVehicle } from '../../design/generate';
import type { Design, Palette } from '../../design/types';
import { nationTypeFor } from '../../game/cards';
import { Terrain } from './terrain';
import { generateWorld, nationArt } from './world';
import { Fx, PK } from './fx';
import { Sim } from './sim';
import { AI } from './ai';
import { Diplomacy } from './diplomacy';
import { Abilities } from './abilities';
import { Renderer } from './draw';
import { Hud } from './hud';
import { runEnding, runOpening, finishStage, offerVehicleDesign } from './flow';
import { restoreState, serializeState, type CivSave } from './save';
import {
  H, METHOD_OF, PLAYER, W, wdist, wdx, wrapX,
  type City, type Geyser, type Medium, type Method, type Nation, type NationArt, type NationType, type Projectile, type Vehicle,
} from './types';

export type Phase = 'intro' | 'play' | 'ending' | 'launch' | 'done';

export interface Tune {
  aiIncome: number; aiHp: number; turretDmg: number; convertRate: number; tradeRate: number;
  playerCitiesSafe: boolean; firstWave: number; waveEvery: number; waveMax: number; aiCapExtra: number;
  buyMul: number; startMoney: number;
}

export class CivStage implements Scene {
  name = 'civ';
  music: Mood = 'civ';
  game!: Game;
  terrain!: Terrain;
  cities: City[] = [];
  nations: Nation[] = [];
  geysers: Geyser[] = [];
  vehicles: Vehicle[] = [];
  vehicleMap = new Map<number, Vehicle>();
  projectiles: Projectile[] = [];
  art: NationArt[] = [];
  fx = new Fx();
  cam = new Camera();
  sim = new Sim(this);
  ai = new AI(this);
  diplo = new Diplomacy(this);
  abilities = new Abilities(this);
  renderer = new Renderer(this);
  hud!: Hud;
  tune!: Tune;
  playerType: NationType = 'economic';
  phase: Phase = 'intro';
  time = 0;
  real = 0;
  nextId = 1;
  income = 0;
  paused = false;
  /** Modal or sheet that pauses the simulation. */
  holds = new Set<string>();
  selected = new Set<number>();
  captures: Record<Method, number> = { convert: 0, buy: 0, military: 0 };
  stats = { lost: 0, kills: 0, built: 0, derricks: 0, citiesLost: 0, gifts: 0, superweapon: 0 };
  unlocked = { sea: false, air: false, sw: false };
  designed: string[] = [];
  hallCool: Record<number, number> = {};
  /** Ability waiting for a target tap. */
  targeting: string | null = null;
  dangerT = 0;
  launchT = 0;
  endingStarted = false;
  private flingVX = 0;
  private flingVY = 0;
  private dragging = false;
  private miniDrag: number | null = null;
  private toastSeen = new Map<string, number>();
  private toastQ: { msg: string; icon: string; kind: 'info' | 'good' | 'bad' | 'gold'; ms?: number; pri: number; at: number }[] = [];
  private toastT = 0;
  private roleDesigns = new Map<string, Design>();
  private seed = 1;
  private lastMusic: 'civ' | 'danger' = 'civ';

  // ------------------------------------------------------------------ lifecycle
  enter(game: Game) {
    this.game = game;
    const st = game.state!;
    this.seed = (st.seed ^ 0x51f15e) >>> 0;
    this.fx.reduced = game.settings.reducedMotion;
    this.playerType = nationTypeFor(st.cards);
    this.tune = {
      aiIncome: game.diff(0.55, 0.8, 1.05), aiHp: game.diff(0.85, 1, 1.15), turretDmg: game.diff(0.7, 1, 1.25),
      convertRate: game.diff(1.35, 1, 0.85), tradeRate: game.diff(1.3, 1, 0.85), playerCitiesSafe: game.difficulty === 'easy',
      firstWave: game.diff(330, 200, 130), waveEvery: game.diff(150, 105, 75), waveMax: game.diff(3, 5, 7), aiCapExtra: game.diff(0, 1, 2),
      buyMul: game.diff(0.75, 1, 1.25), startMoney: game.diff(3500, 2500, 2000),
    };
    this.terrain = new Terrain(this.seed);
    const homeName = typeof st.carry.homeName === 'string' ? st.carry.homeName : undefined;
    const wi = generateWorld(this.terrain, this.seed + 17, {
      playerType: this.playerType, playerName: `${st.speciesName} ${{ religious: 'Covenant', economic: 'Company', military: 'Legion' }[this.playerType]}`,
      homeName, nNations: game.diff(3, 4, 5),
      attitude: game.diff({ friendly: 0.5, neutral: 0.4, hostile: 0.1 }, { friendly: 0.3, neutral: 0.45, hostile: 0.25 }, { friendly: 0.15, neutral: 0.4, hostile: 0.45 }),
      aiTurrets: game.diff(-1, 0, 1),
    });
    this.cities = wi.cities;
    this.nations = wi.nations;
    this.geysers = wi.geysers;
    this.art = this.nations.map((n) => (n.id === PLAYER ? this.playerArt() : nationArt(this.seed, n)));
    this.cam.setViewport(game.w, game.h);
    const home = this.cities[0];
    this.cam.x = home.x; this.cam.y = home.y + 40; this.cam.zoom = 0.9;
    this.hud = new Hud(this);
    const saved = st.stageData.civ as CivSave | undefined;
    if (saved && saved.v === 1) {
      restoreState(this, saved);
      this.hud.build();
      this.art[PLAYER] = this.playerArt();
      if (this.phase === 'intro') runOpening(this);
      else if (this.phase === 'ending' || this.phase === 'launch') { this.phase = 'play'; this.endingStarted = false; }
    } else {
      this.nations[PLAYER].money = this.tune.startMoney;
      this.hud.build();
      runOpening(this);
    }
    this.clampCam();
  }

  exit() {}
  pause() { /* editor pushed on top */ }
  resume() {
    this.cam.setViewport(this.game.w, this.game.h);
    this.hud.refreshAll();
  }
  onResize(w: number, h: number) {
    this.cam.setViewport(w, h);
    this.clampCam();
  }
  serialize(): unknown {
    return serializeState(this);
  }

  // ------------------------------------------------------------------ art
  playerPalette(): Palette {
    const st = this.game.state!;
    const v = st.designs['vehicle-land'];
    return v ? { ...v.colors } : st.creature ? { ...st.creature.colors } : { base: '#3ee6c4', coat: '#1f8f7a', detail: '#f2f2ee', pattern: 'stripes' };
  }

  playerArt(): NationArt {
    const st = this.game.state!;
    const r = new RNG(this.seed ^ 0xabc);
    const pal = st.designs.cityhall?.colors ?? this.playerPalette();
    return {
      species: st.creature ?? generateCreature(r, { level: 3 }),
      hall: st.designs.cityhall ?? generateBuilding(r, 'cityhall', pal),
      house: st.designs.house ?? generateBuilding(r, 'house', pal),
      factory: st.designs.factory ?? generateBuilding(r, 'factory', pal),
      fun: st.designs.entertainment ?? generateBuilding(r, 'entertainment', pal),
      land: this.vehicleDesign(PLAYER, 'land', this.playerType),
      sea: this.vehicleDesign(PLAYER, 'sea', this.playerType),
      air: this.vehicleDesign(PLAYER, 'air', this.playerType),
    };
  }

  suggestedVehicle(medium: Medium, role: NationType): Design {
    const r = new RNG(this.seed ^ (medium.length * 977) ^ (role.length * 131));
    const d = generateVehicle(r, role, medium, this.playerPalette());
    d.name = `${this.game.state!.speciesName} ${{ land: 'Rover', sea: 'Cutter', air: 'Glider' }[medium]}`.slice(0, 24);
    return d;
  }

  vehicleDesign(nation: number, medium: Medium, role: NationType): Design {
    if (nation !== PLAYER) return this.art[nation]?.[medium] ?? this.suggestedVehicle(medium, role);
    const st = this.game.state!;
    if (role === this.playerType) {
      const key = 'vehicle-' + medium;
      if (!st.designs[key]) {
        const d = this.suggestedVehicle(medium, role);
        d.meta = { ...(d.meta ?? {}), role, medium };
        st.designs[key] = d;
      }
      return st.designs[key];
    }
    // Cosmopolitan: vehicles of a captured city's type get their own design.
    const key = `vehicle-${medium}-${role}`;
    let d = (st.designs[key] as Design | undefined) ?? this.roleDesigns.get(key);
    if (!d) { d = this.suggestedVehicle(medium, role); this.roleDesigns.set(key, d); }
    return d;
  }

  // ------------------------------------------------------------------ helpers
  isOnScreen(x: number, y: number, margin = 60): boolean {
    const b = this.cam.bounds(margin);
    const sx = this.cam.x + wdx(this.cam.x, x);
    return sx >= b.x0 && sx <= b.x1 && y >= b.y0 && y <= b.y1;
  }

  sfxAt(name: SfxName, x: number, y: number, vol = 1, pitch = 1) {
    if (!this.isOnScreen(x, y, 200)) return;
    audio.sfx(name, { vol: vol * clamp(0.5 + this.cam.zoom * 0.5, 0.4, 1), pitch: pitch * (0.95 + Math.random() * 0.1) });
  }

  /** Queued toasts: at most one new toast every ~1.6 s, important ones first, stale chatter dropped. */
  toast(msg: string, icon = '💬', kind: 'info' | 'good' | 'bad' | 'gold' = 'info', ms?: number, pri?: number) {
    const last = this.toastSeen.get(msg) ?? -99;
    if (this.real - last < 4 || this.toastQ.some((q) => q.msg === msg)) return;
    this.toastSeen.set(msg, this.real);
    const p = pri ?? (kind === 'bad' || kind === 'gold' ? 2 : kind === 'good' ? 1 : 0);
    if (this.toastQ.length >= 4) {
      let lo = -1;
      for (let i = 0; i < this.toastQ.length; i++) if (this.toastQ[i].pri <= p && (lo < 0 || this.toastQ[i].pri < this.toastQ[lo].pri)) lo = i;
      if (lo < 0) return;
      this.toastQ.splice(lo, 1);
    }
    this.toastQ.push({ msg, icon, kind, ms, pri: p, at: this.real });
  }

  /** One-time hint (per save), routed through the toast queue. */
  hint(id: string, text: string, icon = '💡') {
    const st = this.game.state;
    if (!this.game.settings.hints || !st) return;
    const key = 'hint:civ-' + id;
    if (st.carry[key]) return;
    st.carry[key] = true;
    this.toast(text, icon, 'info', 5200, 1);
  }

  private pumpToasts(dt: number) {
    this.toastT -= dt;
    if (this.toastT > 0 || !this.toastQ.length) return;
    // Highest priority first; drop low-priority chatter that waited too long.
    this.toastQ = this.toastQ.filter((q) => q.pri > 0 || this.real - q.at < 6);
    if (!this.toastQ.length) return;
    let bi = 0;
    for (let i = 1; i < this.toastQ.length; i++) if (this.toastQ[i].pri > this.toastQ[bi].pri) bi = i;
    const q = this.toastQ.splice(bi, 1)[0];
    ui.toast(q.msg, { icon: q.icon, kind: q.kind, ms: q.ms });
    this.toastT = 1.6;
  }

  underAttack() {
    if (this.dangerT <= 0) this.hint('attacked', 'You are under attack! Select your military vehicles and tap the raiders, or build turrets in the City Planner.', '🚨');
    this.dangerT = 10;
  }

  ownedCount(): number {
    return this.cities.filter((c) => c.owner === PLAYER).length;
  }
  get money(): number { return this.nations[PLAYER].money; }
  set money(v: number) { this.nations[PLAYER].money = v; }

  hold(key: string, on: boolean) {
    if (on) this.holds.add(key); else this.holds.delete(key);
  }

  // ------------------------------------------------------------------ simulation events
  onFounded(c: City) {
    const n = this.nations[c.owner];
    this.fx.wave(c.x, c.y, 150, n.color, 1.2);
    this.fx.burst(PK.Smoke, c.x, c.y, 14, 60, { life: 1.4, size: 14, grow: 16, color: '#e9e2d4' });
    const first = !this.cities.some((o) => o !== c && o.owner === c.owner && o.founded && o.foundAt < c.foundAt);
    if (first) {
      this.toast(`The ${n.name} rises! (${n.type})`, '🏳️', 'info', 3200);
      this.sfxAt('horn', c.x, c.y, 0.6);
      this.hint('rivals', 'Rival nations are rising from the old tribes. Tap one of their cities to see how to take it.', '🏙️');
    }
    this.hud.dirty = true;
  }

  onDerrick(g: Geyser, owner: number, how: 'built' | 'bribed' | 'converted', old = -1) {
    const n = this.nations[owner];
    this.fx.wave(g.x, g.y, 70, n.color, 0.8);
    this.fx.burst(PK.Smoke, g.x, g.y, 6, 30, { life: 1, size: 8, grow: 10, color: '#d9d4c8' });
    if (owner === PLAYER) {
      this.sfxAt('build', g.x, g.y, 1);
      audio.sfx('coin');
      this.stats.derricks++;
      this.game.stat('civ-derricks');
      this.toast(how === 'built' ? 'Derrick built! Spice is flowing.' : how === 'bribed' ? `You bribed the ${this.nations[old]?.name ?? ''} workers.` : 'The derrick workers have joined you.', '🛢️', 'good');
      this.hint('derrick', 'Geysers dry up over time. Tap your city to open the City Planner and build factories next to houses.', '🏭');
      if (this.geysers.every((q) => q.owner === PLAYER)) this.game.unlock('spice-baron');
    } else if (old === PLAYER) {
      this.toast(`The ${n.name} took one of your derricks!`, '🛢️', 'bad');
    }
    this.hud.dirty = true;
  }

  onCapture(c: City, old: number, owner: number, method: Method) {
    const n = this.nations[owner];
    this.hud.dirty = true;
    if (owner === PLAYER) {
      this.captures[method]++;
      const verb = method === 'convert' ? 'converted' : method === 'buy' ? 'bought' : 'captured';
      this.game.history(`${verb[0].toUpperCase() + verb.slice(1)} the city of ${c.name}`, method === 'convert' ? '🕊️' : method === 'buy' ? '💰' : '⚔️');
      this.game.stat('civ-' + method);
      audio.sfx('success');
      this.sfxAt('bell', c.x, c.y, 1, 1);
      this.game.banner(`City ${verb}`, c.name);
      const oldN = this.nations[old];
      if (oldN) {
        oldN.rel = Math.max(-100, oldN.rel + (method === 'military' ? -40 : method === 'convert' ? -20 : 8));
        if (method === 'military') for (const o of this.nations) if (o.id !== PLAYER && o.id !== old && o.alive) o.rel = Math.max(-100, o.rel - 6);
      }
      if (c.type !== this.playerType) this.hint('cosmo', `${c.name} keeps its ${c.type} ways: vehicles built there are ${c.type}. A cosmopolitan nation can mix all three.`, '🌐');
      this.checkUnlocks();
      if (this.ownedCount() >= this.cities.length) this.startEnding();
    } else if (old === PLAYER) {
      this.stats.citiesLost++;
      audio.sfx('alarm');
      this.toast(`The ${n.name} took ${c.name}!`, '🚨', 'bad', 4000);
      this.checkUnlocks();
    } else {
      if (this.isOnScreen(c.x, c.y)) this.toast(`The ${n.name} took ${c.name} from the ${this.nations[old]?.name ?? 'tribes'}.`, '⚑');
    }
  }

  onEliminated(n: Nation) {
    this.toast(`The ${n.name} has fallen.`, '🏴', 'info', 3500);
    this.hud.dirty = true;
  }

  onBuyoutReady(c: City) {
    this.hint('buy', `${c.name}'s buyout bar is full! Tap the city and press Buy.`, '💰');
    this.toast(`${c.name} is ready to be bought!`, '💰', 'gold');
    this.hud.dirty = true;
  }

  onTradeOpened(c: City) {
    this.toast(`Trade route opened with ${c.name}.`, '🚚', 'good');
    this.sfxAt('coin', c.x, c.y, 0.8);
  }

  warnUnreachable(v: Vehicle, what: string) {
    const msg = v.medium === 'land' ? `Land vehicles can't reach ${what} — it's across the sea. Use sea or air vehicles.` : v.medium === 'sea' ? `Sea vehicles can't get close enough to ${what}.` : `Can't reach ${what}.`;
    this.toast(msg, '🧭', 'bad');
  }

  checkUnlocks() {
    const n = this.ownedCount();
    if (!this.unlocked.sea && n >= 2) {
      this.unlocked.sea = true;
      this.toast('Sea vehicles unlocked! Build them at coastal cities.', '🚢', 'gold', 4000);
      offerVehicleDesign(this, 'sea');
    }
    if (!this.unlocked.air && n >= 4) {
      this.unlocked.air = true;
      this.toast('Air vehicles unlocked! They fly over any terrain.', '✈️', 'gold', 4000);
      offerVehicleDesign(this, 'air');
    }
    if (!this.unlocked.sw && n >= 6) {
      this.unlocked.sw = true;
      const sw = this.abilities.superweapon();
      this.toast(`Superweapon ready: ${sw.name}! Find it under Powers.`, sw.icon, 'gold', 4500);
      this.hint('sw', `${sw.name} takes every remaining city at once. It costs §12,000 per city you don't own.`, sw.icon);
    }
    this.hud.dirty = true;
  }

  // ------------------------------------------------------------------ city actions
  buyCity(c: City) {
    const price = this.buyPrice(c);
    if (c.buyout < 100) { this.toast('Fill the buyout bar with trade deliveries first.', '🚚'); return; }
    if (this.money < price) { audio.sfx('error'); this.toast(`You need ${'§' + price.toLocaleString('en-US')} to buy ${c.name}.`, '💸', 'bad'); return; }
    this.money -= price;
    audio.sfx('coin');
    this.fx.float(c.x, c.y - 90, '-§' + price.toLocaleString('en-US'), '#ff9f8f', 16);
    this.fx.burst(PK.Coin, c.x, c.y - 40, 30, 140, { vz: 200, life: 1.8, size: 4 });
    this.sim.capture(c, PLAYER, 'buy');
  }

  buyPrice(c: City): number {
    const n = this.nations[c.owner];
    const base = c.large ? 14000 : 8000;
    const relK = n ? clamp(1.15 - n.rel / 250, 0.75, 1.4) : 1;
    return Math.round((base * relK * this.tune.buyMul) / 100) * 100;
  }

  // ------------------------------------------------------------------ ending
  startEnding() {
    if (this.endingStarted) return;
    this.endingStarted = true;
    this.selected.clear();
    runEnding(this);
  }

  finish() {
    finishStage(this);
  }

  // ------------------------------------------------------------------ loop
  update(dt: number) {
    this.real += dt;
    const simPaused = this.paused || this.holds.size > 0;
    if (this.phase === 'play' && !simPaused) {
      this.time += dt;
      this.sim.update(dt);
      this.ai.update(dt);
      this.diplo.update(dt);
      this.abilities.update(dt);
    }
    if (this.phase === 'launch') this.updateLaunch(dt);
    if (!simPaused || this.phase !== 'play') this.fx.update(dt);
    // Camera fling.
    if (!this.dragging && (Math.abs(this.flingVX) > 1 || Math.abs(this.flingVY) > 1)) {
      this.cam.x -= (this.flingVX * dt) / this.cam.zoom;
      this.cam.y -= (this.flingVY * dt) / this.cam.zoom;
      this.flingVX = damp(this.flingVX, 0, 4, dt);
      this.flingVY = damp(this.flingVY, 0, 4, dt);
      this.clampCam();
    }
    // Music mood.
    if (this.dangerT > 0) this.dangerT -= dt;
    const want = this.dangerT > 0 && this.phase === 'play' ? 'danger' : 'civ';
    if (want !== this.lastMusic && this.phase === 'play') {
      this.lastMusic = want;
      this.music = want;
      audio.music(want);
      if (want === 'danger') audio.sfx('horn', { vol: 0.6 });
    }
    // Drop dead selections.
    for (const id of this.selected) if (!this.vehicleMap.has(id)) this.selected.delete(id);
    this.pumpToasts(dt);
    this.hud.update(dt);
  }

  private updateLaunch(dt: number) {
    this.launchT += dt;
    const home = this.cities.find((c) => c.home) ?? this.cities[0];
    this.cam.x = home.x + wdx(home.x, this.cam.x) * Math.exp(-dt * 3);
    const lift = this.launchT > 3 ? Math.pow(this.launchT - 3, 2.2) * 60 : 0;
    this.cam.y = damp(this.cam.y, home.y - 40 - lift * 0.8, 3, dt);
    this.cam.zoom = damp(this.cam.zoom, 1.6, 1.5, dt);
    if (this.launchT > 2.6 && this.launchT < 7) {
      const y = home.y - 60 - lift;
      for (let i = 0; i < 3; i++) this.fx.spawn(PK.Fire, home.x + (Math.random() - 0.5) * 10, y + 18, { vy: 80 + Math.random() * 60, vx: (Math.random() - 0.5) * 40, life: 0.6, size: 9, grow: 8 });
      this.fx.spawn(PK.Smoke, home.x + (Math.random() - 0.5) * 30, home.y - 10, { vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.3) * 30, life: 2.2, size: 14, grow: 18, color: '#e4e0d8' });
      this.fx.shake = Math.max(this.fx.shake, 5 - (this.launchT - 3));
    }
    if (this.launchT > 7.2 && this.phase === 'launch') {
      this.phase = 'done';
      this.finish();
    }
  }

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    this.renderer.render(g, w, h);
  }

  // ------------------------------------------------------------------ camera & input
  clampCam() {
    const c = this.cam;
    c.minZoom = Math.max(0.16, (c.h / H) * 0.98);
    c.maxZoom = 2.4;
    c.zoom = clamp(c.zoom, c.minZoom, c.maxZoom);
    c.x = wrapX(c.x);
    const vh = c.h / c.zoom;
    if (vh >= H) c.y = H / 2;
    else c.y = clamp(c.y, vh / 2, H - vh / 2);
  }

  focus(x: number, y: number, zoom?: number) {
    this.cam.x = x;
    this.cam.y = y;
    if (zoom) this.cam.zoom = zoom;
    this.flingVX = this.flingVY = 0;
    this.clampCam();
  }

  private canInteract(): boolean {
    return this.phase === 'play' && this.holds.size === 0;
  }

  onPointerDown(p: PointerInfo): boolean {
    this.flingVX = this.flingVY = 0;
    if (this.phase !== 'play') return false;
    const m = this.renderer.miniRect;
    if (m && p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) {
      this.miniDrag = p.id;
      this.miniJump(p.x, p.y);
      return true;
    }
    return false;
  }
  onPointerMove(p: PointerInfo) {
    if (this.miniDrag === p.id) this.miniJump(p.x, p.y);
  }
  onPointerUp(p: PointerInfo) {
    if (this.miniDrag === p.id) this.miniDrag = null;
  }
  private miniJump(x: number, y: number) {
    const m = this.renderer.miniRect!;
    const wx = ((x - m.x) / m.w) * W, wy = ((y - m.y) / m.h) * H;
    this.cam.x = wx; this.cam.y = wy;
    this.clampCam();
  }

  onDragStart() { this.dragging = true; this.flingVX = this.flingVY = 0; }
  onDrag(_p: PointerInfo, dx: number, dy: number) {
    if (this.phase === 'launch') return;
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.flingVX = this.flingVX * 0.5 + dx * 30;
    this.flingVY = this.flingVY * 0.5 + dy * 30;
    this.flingVX = clamp(this.flingVX, -2400, 2400);
    this.flingVY = clamp(this.flingVY, -2400, 2400);
    this.clampCam();
  }
  onDragEnd() { this.dragging = false; }
  onPinch(f: number, cx: number, cy: number) {
    if (this.phase === 'launch') return;
    this.cam.zoomAt(f, cx, cy);
    this.clampCam();
  }
  onWheel(dy: number, x: number, y: number) {
    this.cam.zoomAt(dy < 0 ? 1.12 : 1 / 1.12, x, y);
    this.clampCam();
  }
  onKey(key: string, down: boolean) {
    if (!down || !this.canInteract()) return;
    if (key === 'escape') { this.selected.clear(); this.targeting = null; this.hud.dirty = true; }
    if (key === 'a') this.selectAll();
  }

  selectAll(filter?: (v: Vehicle) => boolean) {
    this.selected.clear();
    for (const v of this.vehicles) if (v.nation === PLAYER && v.spawn <= 0 && (!filter || filter(v))) this.selected.add(v.id);
    if (this.selected.size) audio.sfx('tap'); else this.toast('You have no vehicles. Buy some with Build.', '🚙');
    this.hud.dirty = true;
  }

  /** Screen-space picking. */
  pick(sx: number, sy: number): { vehicle?: Vehicle; city?: City; geyser?: Geyser } {
    const cam = this.cam;
    const toS = (x: number, y: number) => ({ x: (cam.x + wdx(cam.x, x) - cam.x) * cam.zoom + cam.w / 2, y: (y - cam.y) * cam.zoom + cam.h / 2 });
    let bv: Vehicle | undefined, bd = 30 * 30;
    for (const v of this.vehicles) {
      const p = toS(v.x, v.y - (v.medium === 'air' ? 30 : 10));
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      const own = v.nation === PLAYER ? 0.7 : 1; // own units are a little easier to hit
      if (d * own < bd) { bd = d * own; bv = v; }
    }
    if (bv) return { vehicle: bv };
    let bg: Geyser | undefined; bd = Math.max(26, 30 * cam.zoom) ** 2;
    for (const g of this.geysers) {
      const p = toS(g.x, g.y - 12);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; bg = g; }
    }
    if (bg) return { geyser: bg };
    let bc: City | undefined; bd = Infinity;
    for (const c of this.cities) {
      const p = toS(c.x, c.y - 20);
      const rx = Math.max(34, 92 * cam.zoom), ry = Math.max(34, 74 * cam.zoom);
      const d = ((p.x - sx) / rx) ** 2 + ((p.y - sy) / ry) ** 2;
      if (d < 1 && d < bd) { bd = d; bc = c; }
    }
    if (bc) return { city: bc };
    return {};
  }

  onTap(x: number, y: number) {
    if (!this.canInteract()) return;
    const m = this.renderer.miniRect;
    if (m && x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return;
    const wp = this.cam.screenToWorld(x, y);
    const wx = wrapX(wp.x), wy = wp.y;
    if (this.targeting) {
      const hit = this.pick(x, y);
      this.abilities.target(this.targeting, wx, wy, hit.city);
      return;
    }
    const hit = this.pick(x, y);
    if (hit.vehicle && hit.vehicle.nation === PLAYER) {
      this.selected.clear();
      this.selected.add(hit.vehicle.id);
      audio.sfx('tap', { pitch: 1.2 });
      this.hint('select', 'Tap ground to move, a geyser to build a derrick, or a rival city to use your vehicle\'s power. Long-press other vehicles to add them.', '👆');
      this.hud.dirty = true;
      return;
    }
    if (this.selected.size) {
      const ids = [...this.selected];
      let color = '#7dffb0';
      if (hit.vehicle) {
        this.sim.command(ids, wx, wy, { vehicle: hit.vehicle });
        color = '#ff6b5a';
        if (!this.sim.hostile(PLAYER, hit.vehicle.nation)) this.toast(`Attacking the ${this.nations[hit.vehicle.nation].name} will anger them.`, '⚠️');
      } else if (hit.geyser) {
        this.sim.command(ids, wx, wy, { geyser: hit.geyser });
        color = '#ffb347';
      } else if (hit.city) {
        this.sim.command(ids, wx, wy, { city: hit.city });
        color = hit.city.owner === PLAYER ? '#7dffb0' : '#ffd166';
        if (hit.city.owner !== PLAYER) this.explainCityCommand(hit.city, ids);
      } else {
        this.sim.command(ids, wx, wy, {});
      }
      const tx = hit.vehicle?.x ?? hit.geyser?.x ?? hit.city?.x ?? wx;
      const ty = hit.vehicle?.y ?? hit.geyser?.y ?? hit.city?.y ?? wy;
      this.fx.wave(tx, ty, hit.city ? 120 : 34, color, 0.6, false);
      audio.sfx('place', { pitch: 1.2 });
      this.hud.dirty = true;
      return;
    }
    if (hit.city) {
      if (hit.city.owner === PLAYER) this.hud.openPlanner(hit.city);
      else this.hud.showCity(hit.city);
      audio.sfx('tap');
      return;
    }
    if (hit.geyser) { this.hud.showGeyser(hit.geyser); audio.sfx('tap'); return; }
    if (hit.vehicle) { this.hud.showVehicle(hit.vehicle); audio.sfx('tap'); return; }
    this.hud.clearContext();
  }

  private explainCityCommand(c: City, ids: number[]) {
    const roles = new Set(ids.map((id) => this.vehicleMap.get(id)?.role));
    const n = this.nations[c.owner];
    if (!c.founded) { this.toast('That is still a tribe. Wait for it to found a city.', '⛺'); return; }
    if (roles.has('military') && !this.sim.hostile(PLAYER, c.owner)) this.toast(`Attacking ${c.name} will start a war with the ${n.name}.`, '⚔️');
    if (roles.has('religious')) this.hint('convert', 'Religious vehicles project your faith over the city. Beams shut down turrets and entertainment, which resist conversion.', '🕊️');
    if (roles.has('economic') && c.trade) this.hint('trade', 'Each delivery fills the buyout bar and earns §. When it is full, tap the city and buy it.', '🚚');
  }

  onLongPress(x: number, y: number) {
    if (!this.canInteract()) return;
    const hit = this.pick(x, y);
    if (hit.vehicle && hit.vehicle.nation === PLAYER) {
      if (this.selected.has(hit.vehicle.id)) this.selected.delete(hit.vehicle.id); else this.selected.add(hit.vehicle.id);
      audio.sfx('pop');
      this.hud.dirty = true;
    }
  }

  methodForPlayer(): Method { return METHOD_OF[this.playerType]; }
  distTo(a: { x: number; y: number }, b: { x: number; y: number }) { return wdist(a.x, a.y, b.x, b.y); }
}
