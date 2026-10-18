// The Creature stage scene: an island of herds to befriend or hunt, a brain to grow, and a body to
// evolve. This class owns the state and the stage flow; systems live in sibling modules.
import type { Game, Scene } from '../../game/game';
import type { PointerInfo } from '../../engine/input';
import { Camera } from '../../engine/camera';
import { audio, type Mood } from '../../engine/audio';
import { h, ui } from '../../engine/ui';
import { clamp, easeInOutCubic, TAU } from '../../engine/math';
import { hashString } from '../../engine/rng';
import { openEditor, type EditorConfig } from '../../editor/editor';
import { ABILITY_INFO } from '../../editor/abilityInfo';
import { blankDesign, cloneDesign, creatureFromCell, generateCreature } from '../../design/generate';
import { computeStats, designDiet, getPart } from '../../design/registry';
import type { AbilityId, Design, Diet } from '../../design/types';
import { abilitiesFor, type AbilityDef } from '../../game/cards';
import {
  AB_ACTION, AB_SOURCE, BEFRIENDS_NEEDED, BONE_REWARD, BRAIN_AT, BRAIN_FULL, BRAIN_LEN, BRAIN_ZOOM, COMBAT_ABS, type CombatAb, GRAVITY,
  glideFlaps, jumpVel, MAX_BRAIN, PACK_SLOTS, playerSpeed, REL_INFO, SOCIAL_ABS, type SocialAb, SPRINT_MULT, sprintCd, sprintDur,
  UNITS_PER_M, WORLD_SIZE,
} from './config';
import type { BonePile, Corpse, CreatureSave, Critter, Nest, Projectile, Relation, Species } from './types';
import { H_DEEP, World } from './world';
import { TerrainRenderer } from './terrain';
import { Fx } from './fx';
import { Controls } from './controls';
import { CreatureHud } from './hud';
import { Social } from './social';
import { Events } from './events';
import { updateAI } from './ai';
import { execCombat, abRange, playerCombat, setAction, updateDash, updatePoison, updateProjectiles } from './combat';
import { critterHeight, critterRadius, isFighter, makeCritter, makeSpecies, nestDesigns, refreshSpecies, sizeFor, startRelation, strongDesign } from './species';
import * as P from './progress';
import { renderWorld } from './render';

type Intent =
  | { kind: 'combat'; ab: CombatAb; target: Critter }
  | { kind: 'social'; ab: SocialAb; target: Critter }
  | { kind: 'goto'; x: number; y: number; r: number; then?: () => void };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const PETALS = ['#ff9ec7', '#ffffff', '#9fd86b', '#ffd166', '#c6f08a'];
const LACK: Partial<Record<AbilityId, string>> = { ...AB_SOURCE, sprint: 'fast legs', glide: 'wings', jump: 'springy legs' };

export class CreatureStage implements Scene {
  name = 'creature';
  music: Mood = 'creature';
  game!: Game;
  world!: World;
  terrain!: TerrainRenderer;
  fx = new Fx();
  cam = new Camera();
  hud!: CreatureHud;
  ctrl!: Controls;
  social = new Social(this);
  events = new Events(this);

  species: Species[] = [];
  nests: Nest[] = [];
  homeNests: Nest[] = [];
  homeNest!: Nest;
  critters: Critter[] = [];
  pack: Critter[] = [];
  corpses: Corpse[] = [];
  projectiles: Projectile[] = [];
  bones: BonePile[] = [];
  own!: Species;
  player!: Critter;
  mate: Critter | null = null;

  t = 0;
  dna = 0;
  earned = 0;
  brain = 1;
  hunger = 100;
  stance: 'social' | 'combat' = 'social';
  target: Critter | null = null;
  intent: Intent | null = null;
  cool: Record<string, number> = {};
  coolMax: Record<string, number> = {};
  sprintT = 0;
  flapsLeft = 0;
  gliding = false;
  private airDist = 0;
  maxGlide = 0;
  inCombat = 0;
  invuln = 0;
  phase: 'intro' | 'landfall' | 'play' | 'cine' | 'final' | 'done' = 'intro';
  paused = false;
  /** False once the scene has exited (guards delayed callbacks). */
  active = true;
  migration = 0;
  migrating = false;
  sapientReady = false;
  special: AbilityDef | null = null;
  context: { label: string; act: () => void } | null = null;
  counts: Record<string, number> = {};
  titansDead = new Set<number>();
  lonersDone = new Set<number>();
  huntersSpawned = false;
  playerSwallowed = false;
  hatchT = 0;
  deathT = 0;
  callT = 0;
  moveMarker: { x: number; y: number; t: number } | null = null;
  speech = new Map<Critter, { text: string; t: number }>();
  private alive = true;
  private deadFor = 0;
  private landT = 0;
  private finalT = 0;
  private finalStarted = false;
  private zoomUser = 1;
  private deepT = 0;
  private dig: { b: BonePile; t: number } | null = null;
  private ctxT = 0;
  private scanT = 0;
  private calmT = 0;
  private dustT = 0;
  private hatchTimer = 0;
  private safeB = -1;
  private titanSpots: { x: number; y: number }[] = [];
  private lonerSpots: { x: number; y: number }[] = [];
  private corpseId = 1;
  private ambT = 1;
  private hintQ: { id: string; text: string; icon: string }[] = [];
  private hintT = 2;

  get playerAlive(): boolean { return this.alive && this.phase !== 'done'; }

  /** One-time hints, queued so only one shows at a time. */
  hint(id: string, text: string, icon = '💡') {
    const st = this.game.state;
    if (!st || !this.game.settings.hints || st.carry['hint:' + id] || this.hintQ.some((q) => q.id === id)) return;
    this.hintQ.push({ id, text, icon });
  }

  private updateHints(dt: number) {
    this.hintT -= dt;
    if (this.hintT > 0 || !this.hintQ.length) return;
    const q = this.hintQ.shift()!;
    this.game.hint(q.id, q.text, q.icon);
    this.hintT = 6.5;
  }

  // ================================================================== lifecycle
  enter(game: Game) {
    this.game = game;
    const st = game.state!;
    this.special = abilitiesFor(st.cards, 'creature')[0] ?? null;
    this.fx.setReducedMotion(game.settings.reducedMotion);
    this.world = new World((st.seed ^ hashString('creature-island')) >>> 0);
    this.terrain = new TerrainRenderer(this.world);
    this.ctrl = new Controls(game.input, (x, y) => this.onTapScreen(x, y), (f) => this.zoomBy(f));
    this.onResize(game.w, game.h);
    const raw = st.stageData.creature as CreatureSave | undefined;
    const saved = raw && raw.v === 1 && Array.isArray(raw.species) && st.creature ? raw : undefined;
    if (saved) { this.brain = clamp(saved.brain, 1, MAX_BRAIN); this.migration = saved.migration; }
    this.setupSpecies(saved);
    this.setupBones();
    if (saved) this.applySave(saved);
    this.spawnPlayer(saved);
    this.spawnAll(saved);
    this.hud = new CreatureHud(this, this.terrain);
    if (saved) {
      this.phase = 'play';
      this.snapCamera();
      ui.toast(`Welcome back to ${st.planetName}`, { icon: '🏝️' });
    } else if (!st.creature) {
      this.phase = 'intro';
      this.hud.setVisible(false);
      this.snapCamera();
      void this.earlyCreator();
    } else {
      this.beginLandfall();
    }
    this.terrain.warm(this.cam);
  }

  exit() {
    this.active = false;
    this.hud?.destroy();
    this.ctrl?.reset();
  }

  pause() { this.ctrl.reset(); }
  resume() {
    this.ctrl.reset();
    if (this.music) audio.music(this.music);
  }

  onResize(w: number, h: number) {
    this.cam.setViewport(w, h);
    if (this.ctrl) { this.ctrl.w = w; this.ctrl.h = h; }
    this.safeB = -1;
  }

  safeBottom(): number {
    if (this.safeB < 0) {
      const probe = h('div', { style: 'position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom, 0px);pointer-events:none;visibility:hidden' });
      document.body.append(probe);
      this.safeB = probe.offsetHeight || 0;
      probe.remove();
    }
    return this.safeB;
  }

  // ================================================================== setup
  private starterDesign(): Design {
    const st = this.game.state!;
    const card = st.cards.cell;
    const diet: Diet = card === 'green' ? 'herbivore' : card === 'red' ? 'carnivore' : 'omnivore';
    const d = creatureFromCell(st.cell ?? blankDesign('cell'), diet, st.speciesName);
    d.name = st.speciesName;
    return d;
  }

  /** Mouth diets the cell card allows in the creator (Omnivore or no card: all). */
  allowedDiets(): string[] | undefined {
    const c = this.game.state?.cards.cell;
    return c === 'green' ? ['herbivore'] : c === 'red' ? ['carnivore'] : undefined;
  }

  private setupSpecies(saved?: CreatureSave) {
    const st = this.game.state!;
    const w = this.world;
    const r = this.game.rng('creature-pop');
    const sd = (id: number) => saved?.species.find((s) => s.id === id)?.design as Design | undefined;
    const ownDesign = st.creature ?? this.starterDesign();
    this.own = makeSpecies(0, 'own', ownDesign, 1, 'allied', BRAIN_LEN[this.brain]);
    this.own.diet = designDiet(ownDesign) ?? 'omnivore';
    this.species.push(this.own);
    [w.home, w.mig[0], w.mig[1]].forEach((p, i) => {
      const n: Nest = { id: i, x: p.x, y: p.y, r: 120, species: this.own, eggs: i === 0 ? 2 : 0, active: i === 0, discovered: true, group: i, home: true };
      this.nests.push(n);
      this.homeNests.push(n);
    });
    this.homeNest = this.homeNests[0];
    // Species nests, levelled by distance from home.
    const spots = w.nestSpots.map((p, i) => ({ ...p, i, d: Math.hypot(p.x - w.home.x, p.y - w.home.y) }));
    const levels = spots.map(() => 1);
    // Starting nests: the two closest are level 1, then 2, 2, 3, 3, 4… by distance.
    const LADDER = [1, 1, 2, 2, 3, 3, 4, 4, 4, 4];
    spots.filter((s) => s.group === 0).sort((a, b) => a.d - b.d).forEach((s, k) => (levels[s.i] = LADDER[k] ?? 4));
    // Species that arrive with the migrations are tougher.
    spots.filter((s) => s.group === 1).sort((a, b) => a.d - b.d).forEach((s, k) => (levels[s.i] = k === 0 ? 2 : 3));
    spots.filter((s) => s.group === 2).forEach((s) => (levels[s.i] = 4));
    const designs = saved
      ? spots.map((_, i) => sd(10 + i) ?? generateCreature(r, { level: levels[i] }))
      : nestDesigns(levels, (st.seed ^ 0x5eed) >>> 0, r, [ownDesign.name]);
    spots.forEach((s, i) => {
      const lvl = levels[i];
      const d = designs[i];
      const sp = makeSpecies(10 + i, 'nest', d, lvl, startRelation(designDiet(d) ?? 'herbivore', lvl, this.game.difficulty, r));
      const n: Nest = { id: 10 + i, x: s.x, y: s.y, r: 150 + lvl * 15, species: sp, eggs: 2 + (lvl >= 2 ? 1 : 0), active: s.group === 0, discovered: false, group: s.group };
      sp.nest = n;
      this.species.push(sp);
      this.nests.push(n);
    });
    // Titans: huge, always hostile.
    const combatScore = (d: Design) => { const s = computeStats(d); return (s.bite ?? 0) + (s.charge ?? 0) + (s.strike ?? 0) + (s.spit ?? 0) + (s.health ?? 0); };
    const titanN = this.game.diff(1, 2, 2);
    w.titanSpots.slice(0, titanN).forEach((p, i) => {
      const id = 40 + i;
      const d = sd(id) ?? strongDesign(r, 'carnivore', 5, combatScore);
      const sp = makeSpecies(id, 'titan', d, 4, 'hostile');
      sp.hp = this.game.diff(600, 800, 1000);
      sp.speed = 60;
      this.species.push(sp);
      this.titanSpots.push(p);
    });
    // Loners: strong nestless wanderers.
    const allScore = (d: Design) => { const s = computeStats(d); return combatScore(d) + (s.sing ?? 0) + (s.dance ?? 0) + (s.charm ?? 0) + (s.pose ?? 0); };
    w.lonerSpots.forEach((p, i) => {
      const id = 50 + i;
      const d = sd(id) ?? strongDesign(r, 'omnivore', 6, allScore);
      const sp = makeSpecies(id, 'loner', d, 4, this.game.diff('neutral', 'neutral', 'annoyed') as Relation);
      this.species.push(sp);
      this.lonerSpots.push(p);
    });
    // The hunting pack that roams the first migration route.
    const hd = sd(60) ?? generateCreature(r, { level: 2, diet: 'carnivore' });
    const hunters = makeSpecies(60, 'hunter', hd, 2, 'hostile');
    hunters.killsNeeded = 3;
    this.species.push(hunters);
  }

  private setupBones() {
    this.world.boneSpots.forEach((b, i) => this.bones.push({ id: i, x: b.x, y: b.y, size: b.size, kind: 'bone', dug: false, discovered: false, dig: 0 }));
  }

  private applySave(s: CreatureSave) {
    for (const x of s.species) {
      const sp = this.species.find((q) => q.id === x.id);
      if (!sp || sp.kind === 'own') continue;
      sp.relation = x.relation;
      sp.befriended = x.befriended;
      sp.kills = x.kills;
      sp.met = x.met;
    }
    for (const x of s.nests) {
      const n = this.nests.find((q) => q.id === x.id);
      if (!n) continue;
      n.discovered = x.discovered;
      n.active = x.active;
      n.eggs = x.eggs;
    }
    for (const x of s.bones) {
      const b = this.bones.find((q) => q.id === x.id);
      if (b) { b.dug = x.dug; b.discovered = x.discovered; }
    }
    s.sky.forEach((k, i) => this.bones.push({ id: 100 + i, x: k.x, y: k.y, size: 3, kind: 'sky', dug: k.dug, discovered: true, dig: 0 }));
    this.events.skyStones = s.sky.length;
    this.t = s.t;
    this.dna = s.dna;
    this.earned = s.earned;
    this.hunger = s.hunger;
    this.migrating = s.migrating;
    this.homeNest = this.homeNests[clamp(s.homeNest, 0, 2)];
    for (let i = 0; i < this.homeNests.length; i++) this.homeNests[i].active = i <= s.homeNest || (s.migrating && i === s.homeNest + 1);
    s.titansDead.forEach((id) => this.titansDead.add(id));
    s.lonersDone.forEach((id) => this.lonersDone.add(id));
    this.huntersSpawned = s.huntersSpawned;
    this.events.meteorDone = s.events.meteor;
    this.events.nextUfo = s.events.nextUfo;
    this.counts = { ...s.counts };
    this.maxGlide = s.maxGlide;
    this.sapientReady = this.earned >= BRAIN_FULL;
  }

  private spawnPlayer(saved?: CreatureSave) {
    const p = makeCritter(this.own, 'player', this.world.home.x, this.world.home.y);
    this.player = p;
    this.critters.push(p);
    this.applyBrainSize();
    p.maxHp = this.playerMaxHp();
    p.hp = p.maxHp;
    p.state = 'idle';
    if (saved) {
      const land = this.world.nearestLand(saved.px, saved.py);
      p.x = land.x; p.y = land.y;
      p.hp = clamp(saved.hp, 1, p.maxHp);
    }
  }

  private spawnAll(saved?: CreatureSave) {
    for (const n of this.nests) if (n.active && !n.home) this.spawnNest(n);
    this.spawnKin();
    for (const sp of this.species) {
      if (sp.kind === 'titan' && !this.titansDead.has(sp.id)) {
        const at = this.titanSpots[sp.id - 40];
        const c = makeCritter(sp, 'titan', at.x, at.y);
        c.homeR = 380;
        this.critters.push(c);
      }
      if (sp.kind === 'loner' && !this.lonersDone.has(sp.id)) {
        const at = this.lonerSpots[sp.id - 50];
        const c = makeCritter(sp, 'loner', at.x, at.y);
        c.homeR = 420;
        this.critters.push(c);
      }
    }
    if (this.huntersSpawned) {
      const hs = this.species.find((s) => s.kind === 'hunter')!;
      if (hs.relation !== 'extinct') this.spawnHunters(Math.max(0, 3 - hs.kills));
    }
    // Pack and allied loners from the save.
    if (saved) {
      for (const pm of saved.pack) {
        const sp = this.species.find((s) => s.id === pm.sp);
        if (!sp) continue;
        let c = this.critters.find((x) => x.sp === sp && x.role !== 'pack' && x.role !== 'titan' && !x.gone);
        if (!c) {
          c = makeCritter(sp, sp.kind === 'loner' ? 'loner' : 'adult', this.player.x, this.player.y);
          this.critters.push(c);
        }
        c.x = this.player.x - 40; c.y = this.player.y + 20;
        this.recruit(c, true, true);
        c.hp = clamp(pm.hp, 1, c.maxHp);
      }
      for (const sp of this.species) {
        if (sp.kind !== 'loner' || !this.lonersDone.has(sp.id) || sp.relation !== 'allied') continue;
        if (this.pack.some((m) => m.sp === sp)) continue;
        const at = this.lonerSpots[sp.id - 50];
        const c = makeCritter(sp, 'loner', at.x, at.y);
        c.befriended = true;
        c.homeR = 300;
        this.critters.push(c);
      }
    }
  }

  /** A carcass beside the first nest, so meat-eaters have an early meal. */
  private spawnStarterCarcass() {
    if (this.own.diet === 'herbivore' || this.migration > 0 || this.corpses.length) return;
    const sp = this.species.find((s) => s.kind === 'nest' && s.level === 1) ?? this.species[1];
    if (!sp) return;
    const p = this.world.randomLand(this.game.rng('creature-carcass'), this.homeNest, 120, 180);
    this.corpses.push({ id: this.corpseId++, x: p.x, y: p.y, sp, size: sp.size, facing: 1, meat: 6, age: 0, life: 400 });
  }

  spawnNest(n: Nest) {
    const sp = n.species;
    if (!sp || sp.relation === 'extinct') return;
    const lvl = sp.level;
    const adults = 2 + (lvl >= 2 ? 1 : 0) + (lvl >= 3 ? 1 : 0);
    const alpha = lvl >= 2;
    sp.maxPop = adults + 1 + (alpha ? 1 : 0);
    const r = this.game.rng('creature-nest-' + n.id + '-' + this.t.toFixed(0));
    let first: Critter | null = null;
    const add = (role: Critter['role']) => {
      const p = this.world.randomLand(r, n, 10, n.r * 0.55);
      const c = makeCritter(sp, role, p.x, p.y);
      c.homeX = n.x; c.homeY = n.y; c.homeR = n.r * 0.8;
      if (sp.relation === 'allied') c.befriended = true;
      if (role === 'baby') c.parent = first;
      if (!first && role !== 'baby') first = c;
      this.critters.push(c);
      return c;
    };
    if (alpha) add('alpha');
    for (let i = 0; i < adults; i++) add('adult');
    add('baby');
  }

  private spawnKin() {
    for (const c of this.critters) if (c.role === 'kin') c.gone = true;
    for (let i = 0; i < 2; i++) {
      const p = this.world.randomLand(this.game.rng('creature-kin' + i), this.homeNest, 20, 80);
      const c = makeCritter(this.own, 'kin', p.x, p.y);
      c.size = this.own.size * 0.9;
      c.r = critterRadius(this.own, c.size);
      c.homeX = this.homeNest.x; c.homeY = this.homeNest.y; c.homeR = 90;
      this.critters.push(c);
    }
  }

  spawnHunters(n = 3) {
    const sp = this.species.find((s) => s.kind === 'hunter');
    if (!sp || n <= 0) return;
    this.huntersSpawned = true;
    // They prowl the far half of the first migration route, away from the old nest.
    const a = this.homeNests[0], b = this.homeNests[1];
    const mid = this.world.randomLand(this.game.rng('creature-hunters'), { x: a.x + (b.x - a.x) * 0.62, y: a.y + (b.y - a.y) * 0.62 }, 60, 160);
    for (let i = 0; i < n; i++) {
      const p = this.world.randomLand(this.game.rng('creature-hunter' + i), mid, 10, 60);
      const c = makeCritter(sp, 'hunter', p.x, p.y);
      c.homeX = mid.x; c.homeY = mid.y; c.homeR = 200;
      this.critters.push(c);
    }
  }

  activateGroup(k: number) {
    let n = 0;
    for (const nest of this.nests) {
      if (nest.home || nest.group !== k || nest.active) continue;
      nest.active = true;
      this.spawnNest(nest);
      n++;
    }
    if (n) ui.toast(`${n} new species ${n > 1 ? 'have' : 'has'} appeared near your new home`, { icon: '🐾' });
  }

  // ================================================================== early creator & landfall
  private async earlyCreator() {
    const st = this.game.state!;
    const res = await openEditor(this.game, {
      design: cloneDesign(this.own.design),
      title: 'Early Creature Creator',
      mode: 'stage',
      budget: 100,
      currency: 'DNA',
      unlocked: st.unlocked,
      allowedDiets: this.allowedDiets(),
      required: [{ cat: ['mouth'], msg: 'Your creature needs a mouth to eat.' }],
      doneLabel: 'Walk ashore 🏝️',
      allowCancel: false,
      background: 'tide',
      hint: 'Your cell is ready for land! Add legs to walk. You have 100 DNA to spend.',
    });
    const d = res?.design ?? this.own.design;
    this.applyDesign(d, false);
    this.beginLandfall();
  }

  private beginLandfall() {
    const w = this.world;
    this.phase = 'landfall';
    this.landT = 0;
    const p = this.player;
    p.x = w.sea.x; p.y = w.sea.y;
    p.facing = w.home.x >= w.sea.x ? 1 : -1;
    this.hud.setVisible(false);
    this.ctrl.enabled = false;
    this.snapCamera();
    audio.sfx('splash', { pitch: 0.7 });
  }

  private updateLandfall(dt: number) {
    const p = this.player, w = this.world;
    this.landT += dt;
    const t = this.landT;
    if (t > 0.6) {
      const dx = w.home.x - p.x, dy = w.home.y - p.y, d = Math.hypot(dx, dy);
      const sp = 58;
      p.vx = d > 60 ? (dx / d) * sp : 0;
      p.vy = d > 60 ? (dy / d) * sp : 0;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.abs(p.vx) > 3) p.facing = p.vx > 0 ? 1 : -1;
      p.walk = d > 60 ? 0.8 : 0;
      p.phase += dt * 2.2;
    }
    if (t < 1.6 && Math.random() < dt * 30) this.fx.spawn('drop', p.x + (Math.random() - 0.5) * p.r * 2, p.y, { up: 160, grav: 600, size: 2.6, life: 0.7, color: '#dff6ff', z: 10 });
    if (t > 1.0 && t - dt <= 1.0) { this.game.banner('Landfall · Creature stage', this.own.name || 'Creature'); audio.sfx('levelup', { pitch: 0.8 }); }
    if (t > 1.6 && t < 3.2 && Math.random() < dt * 6) this.fx.spawn('drop', p.x + (Math.random() - 0.5) * p.r, p.y, { z: critterHeight(p) * 0.6, grav: 400, size: 2, life: 0.6, color: '#bfeaff' });
    if (t > 5.2 || (t > 2 && dist(p, w.home) < 70)) this.endLandfall();
  }

  private skipLandfall() {
    const p = this.player;
    p.x = this.world.home.x + 50; p.y = this.world.home.y + 30;
    this.endLandfall();
  }

  private endLandfall() {
    if (this.phase !== 'landfall') return;
    this.phase = 'play';
    this.player.vx = this.player.vy = 0;
    this.player.walk = 0;
    this.hud.setVisible(true);
    this.ctrl.enabled = true;
    this.spawnStarterCarcass();
    this.game.history('Walked ashore onto land', '🏝️');
    this.speak(this.player, 'Land!', 2);
    this.hintQ.unshift(
      { id: 'cr-move', text: 'Drag anywhere to walk. Tap a creature to target it, or tap the ground to walk there.', icon: '👆' },
      { id: 'cr-goal', text: 'Befriend 🎵 or hunt ⚔️ the island\'s creatures to earn DNA and grow your brain.', icon: '🧠' },
    );
    this.hintT = 0.8;
  }

  // ================================================================== frame
  update(dt: number) {
    if (this.paused) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.fx.update(dt);
    if (this.moveMarker) { this.moveMarker.t -= dt * 1.6; if (this.moveMarker.t <= 0) this.moveMarker = null; }
    for (const [c, s] of this.speech) { s.t -= dt; if (s.t <= 0 || c.gone) this.speech.delete(c); }
    switch (this.phase) {
      case 'intro':
        break;
      case 'landfall':
        this.updateLandfall(dt);
        updateAI(this, dt);
        break;
      case 'cine':
        updateAI(this, dt);
        this.events.update(dt);
        break;
      case 'final':
        this.updateFinal(dt);
        updateAI(this, dt);
        break;
      case 'play':
        this.updatePlayer(dt);
        updateAI(this, dt);
        updateProjectiles(this, dt);
        updatePoison(this, dt);
        this.social.update(dt);
        this.events.update(dt);
        this.updateWorld(dt);
        break;
    }
    if (this.critters.some((c) => c.gone)) this.critters = this.critters.filter((c) => !c.gone);
    if (this.phase === 'play') this.updateHints(dt);
    this.updateCamera(dt);
    this.hud.update(dt);
  }

  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    renderWorld(this, g, w, hh);
    if (this.phase === 'landfall' || this.phase === 'final') {
      const k = this.phase === 'final' ? clamp(this.finalT / 0.8, 0, 1) : clamp(1 - (this.landT - 4.4) / 0.8, 0, 1);
      const bar = 54 * k;
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, bar);
      g.fillRect(0, hh - bar, w, bar);
    }
    if (this.phase === 'final') this.renderAscension(g, w, hh);
  }

  // ================================================================== player
  private updatePlayer(dt: number) {
    const p = this.player;
    for (const k in this.cool) if (this.cool[k] > 0) this.cool[k] -= dt;
    if (this.sprintT > 0) this.sprintT -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.inCombat > 0) this.inCombat -= dt;
    if (this.callT > 0) this.callT -= dt;
    if (this.hatchT > 0) this.hatchT -= dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.emoteT > 0) { p.emoteT -= dt; if (p.emoteT <= 0) p.emote = null; }
    if (p.action) { p.actT -= dt; if (p.actT <= 0) p.action = null; }
    if (p.stun > 0) p.stun -= dt;
    if (!this.alive) {
      this.deadFor += dt;
      this.deathT = clamp(this.deadFor / 0.7, 0, 1);
      p.vx = p.vy = 0;
      if (this.deadFor > 1.9 && this.deadFor - dt <= 1.9) this.game.fade(() => this.respawn('You were reborn at your nest.'));
      return;
    }
    if (p.dash > 0) { updateDash(this, p, dt); return; }
    const v = this.ctrl.value();
    const mag = Math.hypot(v.x, v.y);
    if (mag > 0.15) {
      if (this.intent) this.intent = null;
      if (this.dig) { this.dig = null; this.hud.flashTip('Digging interrupted'); }
    }
    const st = this.own.stats;
    let speed = playerSpeed(st.speed ?? 0);
    if (this.sprintT > 0) speed *= SPRINT_MULT;
    const hh = this.world.hAt(p.x, p.y);
    if (hh < 0 && p.z <= 0) speed *= 0.62;
    if (p.z > 0 && (st.glide ?? 0) > 0) speed *= 1.3 + (st.glide ?? 0) * 0.06;
    let tx = 0, ty = 0;
    if (p.stun > 0 || this.social.target || this.dig || this.hatchT > 0.3) { /* rooted */ }
    else if (mag > 0.15) { tx = v.x * speed * Math.min(1, mag * 1.15); ty = v.y * speed * Math.min(1, mag * 1.15); }
    else if (this.intent) {
      const goal = this.intentGoal();
      if (goal) {
        const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy);
        if (d > 2) { tx = (dx / d) * speed; ty = (dy / d) * speed; }
      }
    }
    const k = 1 - Math.exp(-(p.z > 0 ? 4 : 12) * dt);
    p.vx += (tx - p.vx) * k;
    p.vy += (ty - p.vy) * k;
    const ox = p.x, oy = p.y;
    p.x = clamp(p.x + p.vx * dt, 40, WORLD_SIZE - 40);
    p.y = clamp(p.y + p.vy * dt, 40, WORLD_SIZE - 40);
    if (p.z < 18) this.world.pushOut(p, p.r * 0.45);
    const moved = Math.hypot(p.x - ox, p.y - oy);
    const spd = moved / Math.max(dt, 1e-4);
    p.walk += (clamp(spd / 75, 0, 1) - p.walk) * Math.min(1, dt * 10);
    if (spd > 3 && p.z <= 0) p.phase += dt * clamp(spd / (24 * p.size), 0.5, 4.8);
    if (this.social.target) p.facing = this.social.target.x > p.x ? 1 : -1;
    else if (Math.abs(p.vx) > 10) p.facing = p.vx > 0 ? 1 : -1;
    // Jumping and gliding.
    if (p.z > 0 || p.vz > 0) {
      const glide = st.glide ?? 0;
      this.gliding = glide > 0 && p.vz < 0;
      p.vz -= (this.gliding ? GRAVITY * 0.16 : GRAVITY) * dt;
      if (this.gliding) p.vz = Math.max(p.vz, -(78 - glide * 9));
      p.z += p.vz * dt;
      if (glide > 0) this.airDist += moved;
      if (this.gliding && Math.random() < dt * 8) this.fx.spawn('leaf', p.x - p.facing * p.r, p.y, { z: p.z + critterHeight(p) * 0.5, color: '#ffffff', size: 2.5, life: 0.6, vr: 5, grav: 40 });
      if (p.z <= 0) this.land();
    }
    // Sprint dust.
    if (this.sprintT > 0 && spd > 40 && p.z <= 0) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.05;
        this.fx.spawn('dust', p.x - p.facing * p.r * 0.6, p.y, { size: 5, grow: 22, life: 0.55, color: hh < 0 ? '#e6f7ff' : '#e9dcb4', vx: -p.vx * 0.15, vy: -p.vy * 0.15, spread: 6 });
      }
    }
    // Water: shallows slow you; the deep belongs to the sea monster.
    if (hh < 0 && p.z <= 0 && spd > 20 && Math.random() < dt * 10) this.fx.spawn('drop', p.x + (Math.random() - 0.5) * p.r, p.y, { up: 100, grav: 500, size: 2, life: 0.5, color: '#e6f7ff' });
    if (hh < -0.02 && p.z <= 0) this.hint('cr-deep', 'Careful! Something enormous lurks in the deep water past the shallows.', '🌊');
    if (hh < H_DEEP && p.z <= 0) {
      this.deepT += dt;
      if (this.deepT > 0.9) { this.deepT = 0; this.events.seaMonster(); }
    } else this.deepT = Math.max(0, this.deepT - dt);
    // Hunger.
    const drain = (spd > 20 ? 0.55 : 0.18) * (this.sprintT > 0 ? 2 : 1) * this.game.diff(0.7, 1, 1.2);
    this.hunger = Math.max(0, this.hunger - drain * dt);
    if (this.hunger <= 0) {
      p.hp -= 1.2 * dt;
      if (Math.random() < dt * 0.3) this.speak(p, 'So hungry…', 2);
      if (p.hp <= 0) this.playerDied();
    } else if (this.hunger < 30) this.hint('cr-hungry', this.own.diet === 'carnivore' ? 'You are hungry! Eat meat from carcasses 🍖 (hunt to make more).' : this.own.diet === 'herbivore' ? 'You are hungry! Eat berries from bushes 🍓.' : 'You are hungry! Eat berries 🍓 or meat 🍖.', '🍖');
    this.updateIntent();
    this.updateDig(dt);
  }

  private land() {
    const p = this.player;
    p.z = 0; p.vz = 0;
    this.gliding = false;
    this.fx.burst('dust', p.x, p.y, 6, { speed: 70, size: 5, grow: 14, life: 0.45, color: '#e9dcb4' });
    if (this.airDist > this.maxGlide) this.maxGlide = this.airDist;
    const m = this.airDist / UNITS_PER_M;
    if ((this.own.stats.glide ?? 0) > 0 && m > 18) this.hud.flashTip(`Glided ${Math.round(m)} m`);
    if (m >= 60) this.game.unlock('aviator');
    this.airDist = 0;
  }

  jump() {
    const p = this.player;
    if (this.phase !== 'play' || !this.alive || p.stun > 0 || this.social.target) return;
    const glide = this.own.stats.glide ?? 0;
    if (p.z <= 0.5 && p.vz <= 0) {
      p.vz = jumpVel(this.own.stats.jump ?? 0);
      p.z = 0.6;
      this.flapsLeft = glideFlaps(glide);
      this.airDist = 0;
      this.dig = null;
      audio.sfx('whoosh', { pitch: 1.35, vol: 0.6 });
      this.fx.burst('dust', p.x, p.y, 5, { speed: 60, size: 5, grow: 12, life: 0.4, color: '#e9dcb4' });
      if (glide > 0) this.hint('cr-glide', 'Tap Jump again in the air to flap. Wings let you glide a long way!', '🪽');
    } else if (glide > 0 && this.flapsLeft > 0) {
      this.flapsLeft--;
      p.vz = Math.max(p.vz, 230 + glide * 28);
      audio.sfx('whoosh', { pitch: 1.8, vol: 0.5 });
      this.fx.burst('leaf', p.x, p.y, 5, { z: p.z + critterHeight(p) * 0.5, color: '#ffffff', size: 3, speed: 60, life: 0.7, vr: 6, grav: 60 });
    }
  }

  sprint() {
    if (this.phase !== 'play' || !this.alive) return;
    const lvl = this.own.stats.sprint ?? 0;
    if (lvl <= 0) { this.lackAbility('sprint'); return; }
    if ((this.cool.sprint ?? 0) > 0 || this.sprintT > 0) { audio.sfx('error'); return; }
    this.sprintT = sprintDur(lvl);
    this.cool.sprint = this.coolMax.sprint = sprintCd(lvl) + this.sprintT;
    audio.sfx('whoosh', { pitch: 0.9 });
    audio.sfx('zap', { pitch: 1.6, vol: 0.4 });
    this.fx.burst('dust', this.player.x, this.player.y, 8, { speed: 120, size: 6, grow: 16, life: 0.5, color: '#e9dcb4' });
  }

  // ================================================================== abilities
  abLevel(ab: AbilityId): number {
    const v = this.own.stats[ab] ?? 0;
    if (ab === 'bite' && v <= 0 && this.own.design.parts.some((pi) => getPart(pi.partId)?.category === 'mouth')) return 1;
    return v;
  }

  lackAbility(ab: AbilityId) {
    audio.sfx('error');
    this.hud.flashTip(`No ${ABILITY_INFO[ab].name} yet: add ${LACK[ab] ?? 'new parts'} at your nest (📣)`, 2.4);
  }

  pressStanceAbility(i: number) {
    if (this.phase !== 'play' || !this.alive) return;
    if (this.stance === 'social') this.useSocial(SOCIAL_ABS[i]);
    else playerCombat(this, COMBAT_ABS[i]);
  }

  toggleStance() {
    this.stance = this.stance === 'social' ? 'combat' : 'social';
    if (this.stance === 'combat' && this.social.target) this.social.cancel('stance');
    audio.sfx('tap', { pitch: this.stance === 'combat' ? 0.8 : 1.3 });
    this.hud.refreshStance();
    this.hud.flashTip(this.stance === 'combat' ? '⚔️ Combat stance' : '🎵 Social stance', 1);
  }

  private useSocial(ab: SocialAb) {
    if (this.abLevel(ab) <= 0) { this.lackAbility(ab); return; }
    if (this.social.target) { this.social.press(ab); return; }
    const t = this.socialTarget();
    if (!t) {
      if ((this.cool.social ?? 0) <= 0) { this.performSocial(ab); this.cool.social = 0.45; this.hud.flashTip('Nobody nearby to impress'); }
      return;
    }
    const why = this.social.blocker(t);
    if (why) { this.target = t; this.hud.flashTip(why, 2); audio.sfx('error'); return; }
    this.target = t;
    if (dist(this.player, t) > 160) { this.intent = { kind: 'social', ab, target: t }; return; }
    this.social.start(t);
  }

  performSocial(ab: SocialAb) {
    const p = this.player;
    setAction(p, AB_ACTION[ab].action, AB_ACTION[ab].dur);
    audio.sfx(ab);
    const icon = ab === 'sing' ? '🎵' : ab === 'dance' ? '💃' : ab === 'charm' ? '✨' : '🙌';
    this.fx.burst('emoji', p.x, p.y, 2, { emoji: icon, size: 15, speed: 40, up: 70, life: 0.9, z: critterHeight(p) * 0.8 });
    for (const m of this.pack) setAction(m, AB_ACTION[ab].action, AB_ACTION[ab].dur);
  }

  packSocialBonus(ab: SocialAb): number {
    let s = 0;
    for (const m of this.pack) s += (m.sp.stats[ab] ?? 0) * 0.5;
    return s;
  }
  flockSocialBonus(): number { return this.events.flockSocialBonus(); }

  useSpecial() {
    const sp = this.special;
    if (!sp || this.phase !== 'play' || !this.alive) return;
    if ((this.cool.special ?? 0) > 0) { audio.sfx('error'); this.hud.flashTip(`${sp.name} recharging: ${Math.ceil(this.cool.special)}s`); return; }
    this.cool.special = this.coolMax.special = sp.cooldown ?? 60;
    if (sp.id === 'lullaby') { setAction(this.player, 'sing', 1.2); this.events.lullaby(); }
    else if (sp.id === 'flock') { setAction(this.player, 'pose', 1); this.events.flock(); }
    else if (sp.id === 'roar') { setAction(this.player, 'bite', 0.8); this.events.roar(); }
    this.game.stat('creature.special');
  }

  playerSpeed(): number { return playerSpeed(this.own.stats.speed ?? 0) * (this.sprintT > 0 ? SPRINT_MULT : 1); }

  setIntent(i: Intent) { this.intent = i; }

  private intentGoal(): { x: number; y: number } | null {
    const i = this.intent;
    if (!i) return null;
    if (i.kind === 'goto') return i;
    return i.target.gone ? null : i.target;
  }

  private updateIntent() {
    const i = this.intent;
    if (!i) return;
    const p = this.player;
    if (i.kind === 'goto') {
      if (dist(p, i) <= i.r + 2) { this.intent = null; i.then?.(); }
      return;
    }
    const t = i.target;
    if (t.gone || t.state === 'abducted') { this.intent = null; return; }
    if (i.kind === 'combat') {
      if (dist(p, t) <= abRange(this, i.ab, t)) {
        this.intent = null;
        if ((this.cool[i.ab] ?? 0) <= 0) execCombat(this, i.ab, t);
      }
    } else if (dist(p, t) <= 150) {
      this.intent = null;
      const why = this.social.blocker(t);
      if (why) this.hud.flashTip(why, 2);
      else this.social.start(t);
    }
  }

  combatTarget(): Critter | null {
    const p = this.player, t = this.target;
    if (t && !t.gone && this.isEnemy(t) && !this.isFriendlyTarget(t) && dist(t, p) < 460) return t;
    let best: Critter | null = null, bd = 400;
    for (const c of this.critters) {
      if (c.gone || !c.near || !this.isEnemy(c) || this.isFriendlyTarget(c) || c.state === 'ascend' || c.state === 'abducted') continue;
      let d = dist(c, p);
      if (c.aggro > 0 && c.target && this.isPlayerSide(c.target)) d *= 0.5;
      if (d < bd) { bd = d; best = c; }
    }
    if (best) this.target = best;
    return best;
  }

  private socialTarget(): Critter | null {
    const p = this.player, t = this.target;
    if (t && !t.gone && t.role !== 'player' && dist(t, p) < 420) return t;
    let best: Critter | null = null, bd = 300;
    for (const c of this.critters) {
      if (c.gone || !c.near || c === p || this.social.blocker(c)) continue;
      const d = dist(c, p);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  isPlayerSide(c: Critter): boolean { return c === this.player || c.role === 'pack'; }
  isEnemy(c: Critter): boolean {
    return !c.gone && c !== this.player && c.role !== 'pack' && c.role !== 'kin' && c.role !== 'mate' && c.sp !== this.own;
  }
  isFriendlyTarget(c: Critter): boolean {
    return c.befriended || c.sp.relation === 'allied' || c.role === 'kin' || c.role === 'mate' || c.role === 'pack';
  }

  say(c: Critter, emote: string, dur: number) { c.emote = emote; c.emoteT = dur; }
  speak(c: Critter, text: string, dur: number) { this.speech.set(c, { text, t: dur }); }

  setRelation(sp: Species, rel: Relation) { P.setRelation(this, sp, rel); }

  /** Rally a victim's nest-mates. Without `react`, nearby fighters simply join the attack on the player. */
  alertAttacked(victim: Critter, attacker?: Critter, react?: (c: Critter) => void) {
    for (const o of this.critters) {
      if (o === victim || o.gone || o.sp !== victim.sp || !o.near || o.role === 'pack') continue;
      if (Math.hypot(o.x - victim.x, o.y - victim.y) > 320) continue;
      if (react) react(o);
      else if (isFighter(o.sp) && !o.befriended && o.role !== 'baby' && o.lulled <= 0) { o.target = attacker ?? this.player; o.aggro = 6; }
    }
  }

  onPlayerHurt(amt: number, src: Critter | null) {
    audio.sfx('hurt', { pitch: 0.9 + Math.random() * 0.2 });
    this.fx.shake(Math.min(9, 3 + amt * 0.4));
    this.inCombat = Math.max(this.inCombat, 6);
    if (this.social.target) this.social.cancel('hurt');
    if (this.dig) this.dig = null;
    if (src && (!this.target || this.target.gone || this.isFriendlyTarget(this.target))) this.target = src;
    this.hint('cr-combat', 'You are under attack! Tap ⚔️ Fight to switch stance, then Bite back, or run away.', '⚔️');
  }

  // ================================================================== deaths, respawn, cinematics
  playerDied() {
    if (!this.alive) return;
    this.alive = false;
    this.deadFor = 0;
    this.player.hp = 0;
    this.social.cancel('dead');
    this.intent = null;
    this.dig = null;
    this.player.poison = 0;
    audio.sfx('die');
    this.fx.shake(8);
    this.counts.deaths = (this.counts.deaths ?? 0) + 1;
    this.hud.flashTip('You were defeated…', 2);
  }

  respawn(msg: string) {
    const p = this.player, n = this.homeNest;
    const at = this.world.randomLand(this.game.rng('creature-respawn' + (this.counts.deaths ?? 0)), n, 30, 70);
    p.x = at.x; p.y = at.y; p.z = 0; p.vz = 0; p.vx = p.vy = 0;
    p.hp = p.maxHp; p.stun = 0; p.poison = 0; p.dash = 0;
    this.hunger = Math.max(this.hunger, 70);
    this.alive = true;
    this.deathT = 0;
    this.invuln = 2.5;
    this.deepT = 0;
    this.target = null;
    this.intent = null;
    if (this.phase === 'cine') this.phase = 'play';
    for (const m of this.pack) { m.x = p.x - 40 + Math.random() * 30; m.y = p.y + 20; m.vx = m.vy = 0; m.hp = m.maxHp; }
    for (const c of this.critters) {
      if (c.target && this.isPlayerSide(c.target)) { c.target = null; c.aggro = 0; }
      if (c.role === 'titan') c.hp = c.maxHp;
    }
    this.snapCamera();
    ui.toast(msg, { icon: '🥚' });
  }

  beginCine(kind: 'monster') {
    this.phase = 'cine';
    this.intent = null;
    this.social.cancel('cine');
    this.player.vx = this.player.vy = 0;
    void kind;
  }

  addCorpse(c: Critter) {
    if (c.role === 'kin' || c.role === 'mate') return;
    const meat = Math.round(2 + c.sp.level + (c.role === 'titan' ? 12 : 0) + (c.role === 'baby' ? -1 : 0));
    this.corpses.push({ id: this.corpseId++, x: c.x, y: c.y, sp: c.sp, size: c.size, facing: c.facing, meat: Math.max(1, meat), age: 0, life: c.role === 'titan' ? 400 : 110 });
    if (this.corpses.length > 30) this.corpses.shift();
  }

  addSkyStone(x: number, y: number) {
    if (!this.world.isLand(x, y)) return;
    this.bones.push({ id: 100 + this.events.skyStones, x, y, size: 3, kind: 'sky', dug: false, discovered: true, dig: 0 });
    this.hint('cr-sky', 'A glowing sky-stone fell! Dig it up for a rare part.', '☄️');
  }

  onAbducted(c: Critter) {
    if (this.target === c) this.target = null;
    if (this.cam.isVisible(c.x, c.y, 100)) this.hud.flashTip(`A ${c.sp.name} was abducted!`, 2);
    this.game.stat('creature.abducted');
  }

  onKilled(c: Critter, playerSide: boolean) { P.onKilled(this, c, playerSide); }
  onBefriended(c: Critter) { P.onBefriended(this, c); }

  titanSeen(c: Critter) {
    if (c.sp.met) return;
    c.sp.met = true;
    audio.sfx('roar', { pitch: 0.45, vol: 0.7 });
    this.hint('cr-titan', `A Titan: the ${c.sp.name}! It cannot be befriended and hits very hard. Only fight it with a strong pack.`, '🦖');
  }

  // ================================================================== pack
  packSlots(): number { return PACK_SLOTS[this.brain]; }

  private canRecruit(c: Critter): boolean {
    return !c.gone && c.role !== 'pack' && c.role !== 'titan' && c.role !== 'kin' && c.role !== 'mate' && c.role !== 'player'
      && c.sp.relation === 'allied' && (c.sp.kind === 'nest' || c.sp.kind === 'loner') && this.pack.length < this.packSlots();
  }

  recruit(c: Critter, auto = false, silent = false): boolean {
    if (this.pack.includes(c)) return true;
    if (this.pack.length >= this.packSlots()) {
      if (!auto) { this.hud.flashTip(this.packSlots() ? 'Your pack is full' : 'Grow your brain to lead a pack', 2); audio.sfx('error'); }
      return false;
    }
    c.role = 'pack';
    c.befriended = true;
    c.aggro = 0; c.target = null; c.lulled = 0; c.fear = 0;
    c.state = 'follow';
    c.maxHp = Math.round(c.maxHp * 1.2);
    c.hp = c.maxHp;
    this.pack.push(c);
    if (this.target === c) this.target = null;
    if (!silent) {
      this.say(c, '💚', 2);
      audio.sfx('success', { pitch: 1.2 });
      ui.toast(`${c.sp.name} joined your pack!`, { icon: '🐾', kind: 'good' });
      this.game.history(`A ${c.sp.name} joined the pack`, '🐾');
    }
    if (this.pack.length >= 3) this.game.unlock('pack-leader');
    return true;
  }

  removeFromPack(c: Critter) {
    this.pack = this.pack.filter((m) => m !== c);
  }

  async packSlotTapped(i: number) {
    const m = this.pack[i];
    if (!m) { this.hud.flashTip('Ally a species, then target a member and tap Recruit', 2.4); return; }
    this.paused = true;
    const r = await ui.modal({
      title: `${m.sp.name}`,
      body: h('p', null, `Health ${Math.ceil(m.hp)}/${m.maxHp}. Pack members fight beside you and add their social skills to yours.`),
      buttons: [{ id: 'dismiss', label: 'Send home', danger: true }, { id: 'ok', label: 'Keep', primary: true }],
      dismissable: true,
    });
    this.paused = false;
    if (r !== 'dismiss') return;
    this.removeFromPack(m);
    m.role = m.sp.kind === 'loner' ? 'loner' : 'adult';
    const n = m.sp.nest;
    m.homeX = n?.x ?? m.x; m.homeY = n?.y ?? m.y; m.homeR = n ? n.r * 0.8 : 300;
    m.state = 'return';
    this.say(m, '👋', 1.5);
  }

  unlockFromAlpha(c: Critter) {
    const part = P.unlockRandomPart(this, 2);
    if (part) {
      ui.toast(`The alpha's might inspires you: ${part.name} unlocked!`, { icon: '⭐', kind: 'gold', ms: 3500 });
      this.game.history(`Learned the ${part.name} from an alpha ${c.sp.name}`, '⭐');
    }
  }

  // ================================================================== world upkeep
  private updateWorld(dt: number) {
    const p = this.player;
    // Bushes regrow, corpses rot.
    for (const b of this.world.bushes) {
      if (b.fruit >= b.max) continue;
      b.regrow += dt;
      if (b.regrow > 24) { b.regrow = 0; b.fruit++; }
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.age += dt;
      if (c.age > c.life || c.meat <= 0) this.corpses.splice(i, 1);
    }
    // Nests hatch new members so species never run out.
    this.hatchTimer += dt;
    if (this.hatchTimer > 1) {
      this.hatchTimer = 0;
      for (const n of this.nests) {
        const sp = n.species;
        if (!n.active || n.home || !sp || sp.relation === 'extinct') continue;
        sp.hatchT -= 1;
        if (sp.hatchT > 0) continue;
        sp.hatchT = 40;
        let alive = 0;
        for (const c of this.critters) if (!c.gone && c.sp === sp && c.role !== 'pack') alive++;
        if (alive >= sp.maxPop) { if (n.eggs < 3) n.eggs++; continue; }
        const at = this.world.randomLand(this.game.rng('creature-hatch-' + n.id + '-' + Math.floor(this.t)), n, 10, 50);
        const c = makeCritter(sp, n.eggs > 0 || alive >= 2 ? 'baby' : 'adult', at.x, at.y);
        if (n.eggs > 0) n.eggs--;
        c.homeX = n.x; c.homeY = n.y; c.homeR = n.r * 0.8;
        c.parent = this.critters.find((o) => o.sp === sp && !o.gone && o.role !== 'baby' && o.role !== 'pack') ?? null;
        if (sp.relation === 'allied') c.befriended = true;
        this.critters.push(c);
        if (c.near) this.fx.burst('drop', at.x, at.y, 6, { up: 80, grav: 400, size: 2, color: '#fff3c4', life: 0.6 });
      }
    }
    // Healing at friendly nests.
    let healing = false;
    for (const n of this.nests) {
      if (!n.active) continue;
      const ok = n.home ? n === this.homeNest : n.species && (n.species.relation === 'friendly' || n.species.relation === 'allied' || n.species.relation === 'extinct');
      if (ok && dist(p, n) < 125) { healing = true; break; }
    }
    if (healing && this.alive) {
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.08 * dt);
        if (Math.random() < dt * 4) this.fx.spawn('emoji', p.x + (Math.random() - 0.5) * p.r * 2, p.y, { emoji: '➕', size: 12, vz: 40, life: 0.9, z: critterHeight(p) * 0.6 });
        this.hint('cr-heal', 'Resting at your nest, or at friendly, allied or extinct nests, heals you.', '💚');
      }
      for (const m of this.pack) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt);
    } else if (this.alive && this.hunger > 40 && this.inCombat <= 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.01 * dt);
    }
    // Migration arrival.
    const mt = this.migrating ? this.migTarget() : null;
    if (mt && dist(p, mt) < 110) P.completeMigration(this);
    // Ambient petals and leaves drifting on the wind.
    this.ambT -= dt;
    if (this.ambT <= 0 && !this.game.settings.reducedMotion) {
      this.ambT = 0.45 + Math.random() * 0.6;
      const b = this.cam.bounds(0);
      const x = b.x0 + Math.random() * (b.x1 - b.x0), y = b.y0 + Math.random() * (b.y1 - b.y0);
      if (this.world.hAt(x, y) > 0.06) {
        const col = PETALS[Math.floor(Math.random() * PETALS.length)];
        this.fx.spawn('leaf', x, y, { z: 50 + Math.random() * 70, vx: 16 + Math.random() * 14, vy: 3, grav: 10, life: 4.5, size: 2.4, color: col, vr: 2.5 });
      }
    }
    // Throttled scans: discovery, context, music.
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.4; this.scan(); }
    this.ctxT -= dt;
    if (this.ctxT <= 0) { this.ctxT = 0.12; this.computeContext(); }
    this.updateMood(dt);
  }

  private scan() {
    const p = this.player;
    for (const n of this.nests) {
      if (!n.active || n.home || n.discovered || !n.species) continue;
      if (dist(p, n) < 520) {
        n.discovered = true;
        n.species.met = true;
        const info = REL_INFO[n.species.relation];
        ui.toast(`Found the ${n.species.name} nest · ${info.face} ${info.label}`, { icon: '🪺' });
        audio.sfx('pop', { pitch: 0.8 });
        this.hint('cr-nest', 'Nests are colour-coded on the minimap by how the species feels about you. Tap the minimap for the full map.', '🗺️');
      }
    }
    for (const b of this.bones) {
      if (b.discovered || b.dug) continue;
      if (dist(p, b) < 320) {
        b.discovered = true;
        this.hint('cr-bone', 'A bone pile! Stand on it and tap ⛏️ Dig to unlock a new part.', '🦴');
      }
    }
    for (const c of this.critters) {
      if (c.gone || c.sp.met || !c.near) continue;
      if (dist(p, c) < 420) {
        c.sp.met = true;
        if (c.role === 'loner') {
          this.hint('cr-loner', `A Loner: the ${c.sp.name}. These strong wanderers join your pack after a single successful socialization.`, '🌟');
          this.speak(c, '…?', 2);
        }
      }
    }
  }

  private updateMood(dt: number) {
    let danger = false;
    if (this.alive) for (const c of this.critters) {
      if (c.gone || !c.near || c.aggro <= 0 || !c.target) continue;
      if (this.isPlayerSide(c.target) && dist(c, this.player) < 600) { danger = true; break; }
    }
    if (danger) this.calmT = 0; else this.calmT += dt;
    const mood: Mood = danger || (this.calmT < 3 && this.music === 'danger') ? 'danger' : 'creature';
    if (mood !== this.music) { this.music = mood; audio.music(mood); }
  }

  private computeContext() {
    const p = this.player;
    this.context = null;
    if (this.phase !== 'play' || !this.alive || this.dig || this.social.target) return;
    if (this.mate && !this.mate.gone && dist(p, this.mate) < 140) { this.context = { label: '💕 Evolve', act: () => void this.mateAndEvolve() }; return; }
    for (const b of this.bones) {
      if (!b.dug && dist(p, b) < 46 + p.r * 0.4) { this.context = { label: '⛏️ Dig', act: () => this.startDig(b) }; return; }
    }
    const t = this.target;
    if (t && this.canRecruit(t) && dist(t, p) < 280) { this.context = { label: '➕ Recruit', act: () => this.recruit(t) }; return; }
    const food = this.nearestFood(64);
    if (food) this.context = food;
  }

  contextAction() {
    if (this.phase !== 'play' || !this.alive) return;
    const c = this.context;
    if (!c) return;
    audio.sfx('click');
    c.act();
    this.ctxT = 0;
  }

  private nearestFood(range: number): { label: string; act: () => void } | null {
    const p = this.player;
    const diet = this.own.diet;
    const eatsFruit = diet !== 'carnivore', eatsMeat = diet !== 'herbivore';
    let fruit: (typeof this.world.bushes)[number] | null = null, fd = range + 14;
    for (const b of this.world.bushes) {
      if (b.fruit <= 0) continue;
      const d = dist(p, b);
      if (d < fd) { fd = d; fruit = b; }
    }
    let meat: Corpse | null = null, md = range + 20;
    for (const c of this.corpses) {
      if (c.meat <= 0) continue;
      const d = dist(p, c) - c.size * 10;
      if (d < md) { md = d; meat = c; }
    }
    let egg: Nest | null = null;
    for (const n of this.nests) {
      if (!n.active || n.home || !n.species || n.eggs <= 0 || n.species.relation === 'allied' || n.species.relation === 'extinct') continue;
      if (dist(p, n) < 52) egg = n;
    }
    const f = fruit, m = meat, e = egg;
    if (f && eatsFruit) return { label: '🍓 Eat', act: () => this.eatBush(f) };
    if (m && eatsMeat) return { label: '🍖 Eat', act: () => this.eatCorpse(m) };
    if (e) return { label: '🥚 Eat egg', act: () => P.eatEgg(this, e.species!) };
    if (f) return { label: '🍓 Eat?', act: () => this.eatBush(f) };
    if (m) return { label: '🍖 Eat?', act: () => this.eatCorpse(m) };
    return null;
  }

  private eatBush(b: (typeof this.world.bushes)[number]) {
    const p = this.player;
    p.facing = b.x > p.x ? 1 : -1;
    setAction(p, 'eat', 0.8);
    if (this.own.diet === 'carnivore') { this.vomit('fruit'); return; }
    b.fruit--;
    const omni = this.own.diet === 'omnivore';
    this.hunger = Math.min(100, this.hunger + (omni ? 20 : 26));
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (omni ? 0.06 : 0.12));
    audio.sfx('eat');
    this.fx.burst('drop', b.x, b.y, 8, { z: 14, up: 80, grav: 400, size: 2.6, color: b.berry, speed: 60, life: 0.6 });
    this.game.stat('creature.fruit');
  }

  private eatCorpse(c: Corpse) {
    const p = this.player;
    p.facing = c.x > p.x ? 1 : -1;
    setAction(p, 'eat', 0.8);
    if (this.own.diet === 'herbivore') { this.vomit('meat'); return; }
    c.meat--;
    const omni = this.own.diet === 'omnivore';
    this.hunger = Math.min(100, this.hunger + (omni ? 22 : 30));
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (omni ? 0.06 : 0.1));
    audio.sfx('chomp');
    audio.sfx('eat', { pitch: 0.7 });
    this.fx.burst('drop', c.x, c.y, 8, { z: 8, up: 80, grav: 400, size: 2.6, color: '#c0392b', speed: 60, life: 0.6 });
    this.game.stat('creature.meat');
  }

  private vomit(what: 'fruit' | 'meat') {
    const p = this.player;
    this.hunger = Math.max(0, this.hunger - 5);
    this.say(p, '🤢', 1.6);
    audio.sfx('hurt', { pitch: 0.6 });
    this.fx.burst('drop', p.x + p.facing * p.r, p.y, 14, { z: critterHeight(p) * 0.5, up: 60, grav: 500, size: 3, color: '#a8d14f', speed: 90, life: 0.8 });
    this.hud.flashTip(what === 'fruit' ? 'Yuck! Your carnivore mouth can\'t digest fruit.' : 'Yuck! Your herbivore mouth can\'t digest meat.', 2.4);
    this.hint('cr-vomit', 'What you can eat depends on the mouth you wear: herbivore mouths eat fruit, carnivore mouths eat meat, omnivore mouths eat both.', '🤢');
  }

  private startDig(b: BonePile) {
    if (b.dug) return;
    this.dig = { b, t: 0 };
    this.intent = null;
    this.player.vx = this.player.vy = 0;
    audio.sfx('build', { pitch: 0.8 });
  }

  private updateDig(dt: number) {
    const d = this.dig;
    if (!d) return;
    const p = this.player;
    d.t += dt;
    if (!p.action) setAction(p, 'eat', 0.5);
    p.facing = d.b.x > p.x ? 1 : -1;
    if (Math.random() < dt * 22) this.fx.spawn('dirt', d.b.x + (Math.random() - 0.5) * 20, d.b.y, { up: 140, grav: 500, size: 3, color: d.b.kind === 'sky' ? '#7fdcff' : '#8a6a42', speed: 60, life: 0.7 });
    if (Math.random() < dt * 3) audio.sfx('build', { pitch: 0.9 + Math.random() * 0.4, vol: 0.4 });
    if (d.t >= 1.3) { this.dig = null; this.finishDig(d.b); }
  }

  private finishDig(b: BonePile) {
    b.dug = true;
    b.discovered = true;
    audio.sfx('unlock');
    this.fx.burst('sparkle', b.x, b.y, 16, { z: 12, color: '#ffe48a', speed: 120, size: 8, up: 100, life: 1 });
    P.addDNA(this, BONE_REWARD, b.x, b.y);
    const part = P.unlockRandomPart(this, b.kind === 'sky' ? 3 : b.size);
    if (part) {
      ui.toast(`New part unlocked: ${part.name}`, { icon: b.kind === 'sky' ? '☄️' : '🦴', kind: 'gold', ms: 3600 });
      this.game.history(`Dug up the ${part.name}`, '🦴');
      this.hint('cr-call', 'New parts are waiting! Tap 📣 to call your mate, then evolve at your nest.', '📣');
    } else {
      P.addDNA(this, 15, b.x, b.y);
      this.hud.flashTip('Nothing new to learn here, but the DNA is useful');
    }
    if (b.kind === 'bone') {
      this.counts.bones = (this.counts.bones ?? 0) + 1;
      this.game.stat('creature.bones');
      if (this.counts.bones >= 10) this.game.unlock('paleontologist');
    }
  }

  // ================================================================== mating & editing
  callMate() {
    if (this.phase !== 'play' || !this.alive) return;
    const p = this.player;
    setAction(p, 'sing', 0.9);
    audio.sfx('horn', { pitch: 1.3 });
    audio.sfx('sing', { pitch: 1.2 });
    this.fx.burst('emoji', p.x, p.y, 3, { emoji: '📣', size: 16, speed: 50, up: 80, life: 1, z: critterHeight(p) });
    this.callT = 8;
    if (!this.mate || this.mate.gone) {
      const at = this.world.randomLand(this.game.rng('creature-mate' + Math.floor(this.t)), this.homeNest, 20, 50);
      const m = makeCritter(this.own, 'mate', at.x, at.y);
      m.state = 'swoon';
      m.homeX = this.homeNest.x; m.homeY = this.homeNest.y;
      this.critters.push(m);
      this.mate = m;
    }
    if (dist(p, this.homeNest) < 240) this.hud.flashTip('Your mate is here. Tap 💕 Evolve!', 2.4);
    else ui.toast('Your mate answers from the nest. Follow the 💕 arrow home!', { icon: '💕' });
    // Calling near grumpy nests draws attention.
    for (const c of this.critters) {
      if (c.gone || !c.near || c.befriended || c.role === 'baby') continue;
      const rel = c.sp.relation;
      if ((rel === 'hostile' || rel === 'annoyed') && isFighter(c.sp) && dist(c, p) < 320 && c.role !== 'titan') { c.target = p; c.aggro = 5; }
    }
  }

  private async mateAndEvolve() {
    if (this.phase !== 'play') return;
    const p = this.player, m = this.mate;
    this.phase = 'cine';
    this.intent = null;
    audio.sfx('charm');
    if (m) this.fx.burst('emoji', (p.x + m.x) / 2, (p.y + m.y) / 2, 8, { emoji: '💗', size: 18, speed: 60, up: 100, life: 1.2, z: 30 });
    await new Promise((r) => setTimeout(r, 900));
    if (!this.active) return;
    const res = await openEditor(this.game, this.editorConfig('Creature Creator', 'Hatch 🥚', 'Changes apply to your whole species. Parts dug from bone piles appear unlocked.'));
    if (res) {
      this.dna = Math.max(0, this.dna - res.spent);
      this.applyDesign(res.design, true);
      this.game.history('A new generation hatched', '🥚');
      this.game.stat('creature.editors');
    }
    if (this.mate) { this.mate.gone = true; this.mate = null; }
    this.callT = 0;
    this.hatchT = 1.1;
    p.hp = p.maxHp;
    audio.sfx('pop');
    this.fx.burst('debris', p.x, p.y, 12, { up: 160, grav: 600, size: 4, color: '#fff3dc', speed: 120, life: 0.9 });
    this.phase = 'play';
  }

  private editorConfig(title: string, done: string, hint: string): EditorConfig {
    const st = this.game.state!;
    return {
      design: cloneDesign(this.own.design),
      title, mode: 'stage', budget: Math.floor(this.dna), currency: 'DNA',
      unlocked: st.unlocked, allowedDiets: this.allowedDiets(),
      required: [{ cat: ['mouth'], msg: 'Your creature needs a mouth to eat and sing.' }],
      doneLabel: done, background: 'meadow', hint,
    };
  }

  applyDesign(d: Design, announce: boolean) {
    const oldDiet = this.own.diet;
    d.name = d.name || this.game.state?.speciesName || 'Creature';
    this.game.setDesign('creature', d);
    this.own.design = d;
    refreshSpecies(this.own, BRAIN_LEN[this.brain]);
    this.applyBrainSize();
    const p = this.player;
    const frac = p.maxHp ? p.hp / p.maxHp : 1;
    p.maxHp = this.playerMaxHp();
    p.hp = Math.max(1, Math.round(p.maxHp * frac));
    this.hud?.refreshStance();
    if (announce && oldDiet !== this.own.diet) ui.toast(`Your species is now ${this.own.diet === 'omnivore' ? 'an' : 'a'} ${this.own.diet}`, { icon: '👄' });
  }

  applyBrainSize() {
    const sp = this.own;
    sp.size = sizeFor(sp.design, BRAIN_LEN[this.brain]);
    for (const c of this.critters) {
      if (c.sp !== sp) continue;
      c.size = sp.size * (c.role === 'kin' ? 0.9 : 1);
      c.r = critterRadius(sp, c.size);
    }
  }

  playerMaxHp(): number { return P.maxHpFor(this.brain, this.own.stats.health ?? 0); }

  /** Fraction of a creature's height hidden below the water surface. */
  submersion(c: Critter): number {
    if (c.state === 'abducted' || c.state === 'ascend') return 0;
    const hh = this.world.hAt(c.x, c.y);
    let s = hh >= 0 ? 0 : hh < H_DEEP ? 0.6 : clamp(-hh / 0.05, 0, 1) * 0.42;
    if (c === this.player && this.phase === 'landfall') s = Math.max(s, clamp(1 - this.landT / 1.3, 0, 1) * 0.92);
    return s;
  }

  migTarget(): { x: number; y: number } | null {
    return this.migrating ? this.homeNests[this.migration + 1] ?? null : null;
  }

  speciesCounts() {
    let allied = 0, extinct = 0, met = 0, total = 0;
    for (const sp of this.species) {
      if (sp.kind !== 'nest' && sp.kind !== 'loner') continue;
      if (sp.kind === 'nest' && !sp.nest?.active) continue;
      total++;
      if (sp.met || sp.nest?.discovered) met++;
      if (sp.relation === 'allied') allied++;
      if (sp.relation === 'extinct') extinct++;
    }
    return { allied, extinct, met, total };
  }

  objective(): string {
    if (this.phase !== 'play' && this.phase !== 'cine') return '';
    if (this.sapientReady) return '🧠 Brain fully grown! Tap “Become sapient” when ready.';
    if (this.migrating) return '🧭 Migrate: follow the 🏡 arrow to your new nest.';
    if (!this.alive) return '';
    if (this.hunger < 25) return this.own.diet === 'carnivore' ? '🍖 Starving! Find meat to eat.' : '🍓 Starving! Find a berry bush.';
    const c = this.speciesCounts();
    if (c.allied + c.extinct === 0 && this.earned < 40) return 'Befriend 🎵 or hunt ⚔️ creatures to grow your brain.';
    return `🤝 ${c.allied} allied · ☠️ ${c.extinct} extinct\n🧠 ${Math.max(0, BRAIN_FULL - Math.floor(this.earned))} DNA to sapience`;
  }

  // ================================================================== sapience & ending
  async offerSapience() {
    if (!this.sapientReady || this.phase !== 'play' || !this.alive) return;
    this.paused = true;
    const ok = await ui.confirm('Become sapient?', 'Your species is ready to think, plan and make tools. After one final edit your body becomes permanent and your story continues in the Tribal stage.', 'Final edit', 'Not yet');
    this.paused = false;
    if (!ok) return;
    this.phase = 'final';
    this.finalT = 0;
    this.finalStarted = false;
    this.intent = null;
    this.social.cancel('final');
    this.hud.setVisible(false);
    this.ctrl.enabled = false;
    this.player.vx = this.player.vy = 0;
    audio.sfx('levelup', { pitch: 0.7 });
    audio.sfx('bell');
    audio.music('victory');
    this.music = 'victory';
  }

  private updateFinal(dt: number) {
    this.finalT += dt;
    const p = this.player;
    p.walk = 0;
    if (Math.random() < dt * 25) this.fx.spawn('sparkle', p.x + (Math.random() - 0.5) * 80, p.y - Math.random() * 90, { color: '#fff1b0', size: 6, life: 1, vz: 40 });
    if (this.finalT > 1.2 && this.finalT - dt <= 1.2) this.speak(p, 'I think…', 1.6);
    if (this.finalT > 3 && !this.finalStarted) { this.finalStarted = true; void this.finalEdit(); }
  }

  private renderAscension(g: CanvasRenderingContext2D, w: number, hh: number) {
    const k = clamp(this.finalT / 2.5, 0, 1);
    const s = this.cam.worldToScreen(this.player.x, this.player.y - critterHeight(this.player));
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(s.x, s.y);
    g.rotate(this.t * 0.2);
    for (let i = 0; i < 12; i++) {
      g.rotate(TAU / 12);
      g.fillStyle = `rgba(255,230,150,${(0.08 * k).toFixed(3)})`;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.max(w, hh), -30); g.lineTo(Math.max(w, hh), 30); g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, 120);
    gr.addColorStop(0, `rgba(255,250,220,${(0.6 * k).toFixed(3)})`);
    gr.addColorStop(1, 'rgba(255,250,220,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, 120, 0, TAU); g.fill();
    g.restore();
    void easeInOutCubic;
  }

  private async finalEdit() {
    const cfg = this.editorConfig('Final Creature Edit', 'Become sapient 🧠', 'This is your species\' final body. After this, only clothing can change it.');
    cfg.allowCancel = false;
    const res = await openEditor(this.game, cfg);
    if (res) {
      this.dna = Math.max(0, this.dna - res.spent);
      this.applyDesign(res.design, false);
    }
    this.complete();
  }

  complete() {
    const st = this.game.state!;
    const card = P.computeCard(this);
    st.allies = this.allyDesigns();
    const legs = this.own.design.parts.some((pi) => getPart(pi.partId)?.category === 'leg');
    if (!legs) this.game.unlock('slug-life');
    P.checkSpeciesAchievements(this);
    const c = this.speciesCounts();
    const mins = Math.max(1, Math.round(this.t / 60));
    const summary = [
      `🤝 ${c.allied} species allied · ☠️ ${c.extinct} driven extinct`,
      `❤️ ${this.counts.befriended ?? 0} befriended · 🐾 ${this.counts.kills ?? 0} hunted · 🦴 ${this.counts.bones ?? 0} bone piles`,
      `🧠 Sapience reached in ${mins} min`,
    ];
    if (st.allies.length) summary.push(`🐾 Pets for your tribe: ${st.allies.map((d) => d.name).join(', ')}`);
    this.game.history('Became sapient', '🧠');
    this.game.stat('creature.completed');
    this.phase = 'done';
    this.game.completeStage(card, summary);
  }

  /** Designs of allied species in the pack (then other allies), at most 3, to become tribal pets. */
  allyDesigns(): Design[] {
    const out: Design[] = [];
    const seen = new Set<number>();
    for (const m of this.pack) {
      if (m.sp === this.own || seen.has(m.sp.id)) continue;
      seen.add(m.sp.id);
      out.push(cloneDesign(m.sp.design));
    }
    for (const sp of this.species) {
      if (out.length >= 3) break;
      if (sp.relation !== 'allied' || (sp.kind !== 'nest' && sp.kind !== 'loner') || seen.has(sp.id)) continue;
      seen.add(sp.id);
      out.push(cloneDesign(sp.design));
    }
    return out.slice(0, 3);
  }

  // ================================================================== camera & input
  private updateCamera(dt: number, snap = false) {
    const p = this.player, cam = this.cam;
    const sf = clamp(Math.min(this.game.w, this.game.h) / 400, 0.8, 1.7);
    let z = BRAIN_ZOOM[this.brain] * sf * this.zoomUser;
    if (this.phase === 'final') z *= 1 + 0.45 * easeInOutCubic(clamp(this.finalT / 2.2, 0, 1));
    const hh = critterHeight(p);
    const look = this.phase === 'play' ? 0.32 : 0;
    const shift = this.game.h > this.game.w ? 50 : 20;
    let tx = p.x + p.vx * look;
    let ty = p.y - hh * 0.5 - p.z * 0.4 + p.vy * look * 0.7 + shift / z;
    const st = this.social.target;
    if (st && !st.gone) { tx = (tx + st.x) / 2; ty = (ty + st.y - critterHeight(st) * 0.5) / 2; }
    if (snap) { cam.zoom = z; cam.x = tx; cam.y = ty; }
    else {
      const k = 1 - Math.exp(-5 * dt);
      cam.zoom += (z - cam.zoom) * (1 - Math.exp(-4 * dt));
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
    }
    const hw = cam.w / 2 / cam.zoom, hv = cam.h / 2 / cam.zoom;
    cam.x = clamp(cam.x, hw, WORLD_SIZE - hw);
    cam.y = clamp(cam.y, hv, WORLD_SIZE - hv);
  }

  private snapCamera() { this.updateCamera(0, true); }

  private zoomBy(f: number) {
    this.zoomUser = clamp(this.zoomUser * f, 0.55, 1.8);
  }

  private pickCritter(x: number, y: number): Critter | null {
    const tol = 16 / this.cam.zoom;
    let best: Critter | null = null, bd = Infinity;
    for (const c of this.critters) {
      if (c.gone || !c.near || c.state === 'ascend' || c.state === 'abducted') continue;
      const L = c.sp.layout;
      const hw = (L.width * c.size) / 2 + tol, top = c.y - c.z - L.height * c.size - tol, bot = c.y + tol * 0.6;
      if (x < c.x - hw || x > c.x + hw || y < top || y > bot) continue;
      const d = Math.hypot(x - c.x, y - (c.y - c.z - L.height * c.size * 0.5)) - (c === this.player ? -20 : 0);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  private onTapScreen(sx: number, sy: number) {
    if (this.phase === 'landfall') { this.skipLandfall(); return; }
    if (this.phase !== 'play' || !this.alive) return;
    const wp = this.cam.screenToWorld(sx - this.fx.shakeX, sy - this.fx.shakeY);
    const c = this.pickCritter(wp.x, wp.y);
    if (c && c !== this.player) {
      this.target = c;
      c.hpShow = Math.max(c.hpShow, 2);
      audio.sfx('tap');
      if (c === this.mate) { this.intent = { kind: 'goto', x: c.x, y: c.y, r: 90, then: () => void this.mateAndEvolve() }; return; }
      const rel = c.role === 'titan' ? 'Titan' : c.role === 'pack' ? 'Pack member' : c.befriended ? 'Friend' : REL_INFO[c.sp.relation].label;
      this.hud.flashTip(`${c.sp.name} · ${rel}${this.canRecruit(c) ? ' · tap Recruit' : ''}`, 1.6);
      this.hint('cr-target', 'Targeted! In 🎵 Social stance tap an action to impress it; in ⚔️ Fight stance tap an attack.', '🎯');
      return;
    }
    if (c === this.player) { this.jump(); return; }
    for (const b of this.bones) {
      if (!b.dug && dist(wp, b) < 40) { this.intent = { kind: 'goto', x: b.x, y: b.y + 6, r: 30, then: () => this.startDig(b) }; this.marker(b.x, b.y); return; }
    }
    for (const b of this.world.bushes) {
      if (b.fruit > 0 && dist(wp, { x: b.x, y: b.y - 12 }) < 30) { this.intent = { kind: 'goto', x: b.x, y: b.y + 8, r: 40, then: () => this.eatBush(b) }; this.marker(b.x, b.y); return; }
    }
    for (const co of this.corpses) {
      if (co.meat > 0 && dist(wp, co) < 30 + co.size * 12) { this.intent = { kind: 'goto', x: co.x, y: co.y, r: 40, then: () => this.eatCorpse(co) }; this.marker(co.x, co.y); return; }
    }
    this.intent = { kind: 'goto', x: wp.x, y: wp.y, r: 8 };
    if (this.target && !this.social.target) this.target = null;
    this.marker(wp.x, wp.y);
  }

  private marker(x: number, y: number) { this.moveMarker = { x, y, t: 1 }; }

  onPointerDown(p: PointerInfo): boolean { return this.ctrl.down(p); }
  onPointerMove(p: PointerInfo) { this.ctrl.move(p); }
  onPointerUp(p: PointerInfo) { this.ctrl.up(p); }
  onWheel(dy: number) { this.zoomBy(dy < 0 ? 1.1 : 0.9); }

  onKey(key: string, down: boolean) {
    if (!down || this.paused) return;
    if (this.phase === 'landfall' && (key === ' ' || key === 'enter' || key === 'escape')) { this.skipLandfall(); return; }
    if (this.phase !== 'play') return;
    if (key >= '1' && key <= '4') this.pressStanceAbility(Number(key) - 1);
    else if (key === ' ') this.jump();
    else if (key === 'shift') this.sprint();
    else if (key === 'q') this.toggleStance();
    else if (key === 'e') this.useSpecial();
    else if (key === 'c') this.callMate();
    else if (key === 'x' || key === 'enter') this.contextAction();
    else if (key === 'f') { this.target = null; if (this.stance === 'combat') this.combatTarget(); else this.target = this.socialTarget(); }
  }

  // ================================================================== debug
  addDNA(n: number) { P.addDNA(this, n); }
  debugBrainUp() {
    if (this.brain >= MAX_BRAIN) { P.addDNA(this, Math.max(1, BRAIN_FULL - this.earned)); return; }
    P.addDNA(this, Math.max(1, BRAIN_AT[this.brain + 1] - this.earned + 1));
  }
  debugWin() {
    this.game.state!.usedCheats = true;
    P.addDNA(this, Math.max(1, BRAIN_FULL - this.earned + 1));
  }
  debugAllyTarget() {
    const t = this.target;
    if (!t || t.gone) { this.hud.flashTip('Tap a creature first'); return; }
    if (t.sp.kind === 'nest' && t.sp.relation !== 'allied' && t.sp.relation !== 'extinct') {
      t.sp.befriended = Math.max(t.sp.befriended, BEFRIENDS_NEEDED - 1);
      t.befriended = true;
      P.onBefriended(this, t);
    } else if (t.sp.kind === 'loner') P.onBefriended(this, t);
  }

  // ================================================================== save
  serialize(): CreatureSave | undefined {
    if (this.phase !== 'play' && this.phase !== 'cine') return undefined;
    const p = this.player;
    return {
      v: 1,
      phase: 'play',
      t: this.t,
      dna: this.dna,
      earned: this.earned,
      brain: this.brain,
      hp: Math.max(1, p.hp),
      hunger: this.hunger,
      px: this.alive ? p.x : this.homeNest.x,
      py: this.alive ? p.y : this.homeNest.y,
      homeNest: this.homeNests.indexOf(this.homeNest),
      migration: this.migration,
      migrating: this.migrating,
      species: this.species.filter((s) => s.kind !== 'own').map((s) => ({ id: s.id, design: s.design, relation: s.relation, befriended: s.befriended, kills: s.kills, met: s.met })),
      nests: this.nests.map((n) => ({ id: n.id, discovered: n.discovered, active: n.active, eggs: n.eggs })),
      bones: this.bones.filter((b) => b.kind === 'bone').map((b) => ({ id: b.id, dug: b.dug, discovered: b.discovered })),
      sky: this.bones.filter((b) => b.kind === 'sky').map((b) => ({ x: b.x, y: b.y, dug: b.dug })),
      pack: this.pack.map((m) => ({ sp: m.sp.id, hp: m.hp })),
      titansDead: [...this.titansDead],
      lonersDone: [...this.lonersDone],
      huntersSpawned: this.huntersSpawned,
      events: { meteor: this.events.meteorDone, nextUfo: this.events.nextUfo },
      counts: { ...this.counts },
      maxGlide: this.maxGlide,
    };
  }
}
