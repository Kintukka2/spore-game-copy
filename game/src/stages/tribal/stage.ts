// The Tribal stage: a touch-first village RTS. This file owns the scene lifecycle, world setup,
// input and commands, the food economy and conquest resolution. Simulation lives in units.ts and
// ai.ts, drawing in draw.ts, the DOM HUD in hud.ts, the rhythm concert in concert.ts.
import type { Game, Scene } from '../../game/game';
import type { PointerInfo } from '../../engine/input';
import { Camera } from '../../engine/camera';
import { audio, type Mood } from '../../engine/audio';
import { ui, h } from '../../engine/ui';
import { RNG } from '../../engine/rng';
import { clamp, dist } from '../../engine/math';
import { abilitiesFor, type CardColor } from '../../game/cards';
import { computeStats, designDiet } from '../../design/registry';
import { generateCreature } from '../../design/generate';
import { hsl } from '../../design/color';
import { cityName, tribeName } from '../../game/names';
import type { Design, Diet } from '../../design/types';
import {
  COST, DAY_LENGTH, MAX_PETS, NUM_TRIBES, PLAYER, POP_CAPS, WILD, WORLD,
  type FoodKind, type HomeLayout, type NodeKind, type Obstacle, type Order, type ResourceNode, type Shot,
  type Snare, type Stance, type ToolHut, type ToolId, type Tribe, type Unit, type WildKind, relationFace,
} from './types';
import { bakeTerrain, generateWorld, homeLayout, waterAt, type WorldGen } from './world';
import { Fx, P } from './fx';
import { TOOLS, unlockedTools, unlockLevel, isInstrument } from './tools';
import { outfitBonus, openOutfitter, wornDesign, type OutfitBonus } from './outfit';
import { bodyMetrics, integrate, newUnit, updatePlayerUnit, killUnit, stopUnit, slotOffset, updateShots, healPass, sheltered } from './units';
import { updateTribes, updateRival, updateAnimal, updateWildlife, spawnTribeMember, spawnHerdMember, type HerdState } from './ai';
import { renderWorld } from './draw';
import { TribalHud } from './hud';
import { Concert } from './concert';
import { castAbility, castAt, updateAbilities, type ActiveAbility, type Effect } from './abilities';
import { restoreStage, serializeStage, type TribalSave } from './save';

export interface StageStats {
  gathered: number;
  deaths: number;
  kills: number;
  tamed: number;
  gifts: number;
  concerts: number;
  titans: number;
  maxPets: number;
}

export type Pick =
  | { type: 'unit'; u: Unit }
  | { type: 'tribe'; t: Tribe }
  | { type: 'home' }
  | { type: 'toolhut'; slot: number }
  | { type: 'node'; n: ResourceNode }
  | { type: 'pen' }
  | { type: 'fire' }
  | { type: 'pile' }
  | { type: 'totem' }
  | { type: 'ground' };

export class TribalStage implements Scene {
  name = 'tribal';
  music: Mood = 'tribal';
  game!: Game;
  cam = new Camera();
  w!: WorldGen;
  terrain!: HTMLCanvasElement;
  home!: HomeLayout;
  homeName = '';
  tribeLabel = '';
  diet: Diet = 'omnivore';
  /** Design table: 0 = our species (worn outfit), 1..4 rival tribes, then wild species, pets. */
  designs: Design[] = [];
  bonus: OutfitBonus = { gather: 0, combat: 0, social: 0, health: 0 };
  species = { speed: 1, dmg: 5, hp: 80, music: 0, sneak: 0 };

  time = 0;
  day = 0.12;
  paused = false;
  food = 40;
  stance: Stance = 'social';
  units: Unit[] = [];
  byId = new Map<number, Unit>();
  nodes: ResourceNode[] = [];
  nodeById = new Map<number, ResourceNode>();
  tribes: Tribe[] = [];
  toolHuts: (ToolHut | null)[] = [null, null, null, null, null, null];
  snares: Snare[] = [];
  shots: Shot[] = [];
  effects: Effect[] = [];
  herds: HerdState[] = [];
  totem: { tribe: number; allied: boolean; t: number }[] = [];
  abilities: ActiveAbility[] = [];
  obstacles: Obstacle[] = [];
  eggNode!: ResourceNode;
  fx = new Fx();
  hud!: TribalHud;
  concert: Concert | null = null;
  targetMode: 'firebombs' | null = null;
  stats: StageStats = { gathered: 0, deaths: 0, kills: 0, tamed: 0, gifts: 0, concerts: 0, titans: 0, maxPets: 0 };
  chiefT = 0;
  titanPlan: number[] = [];
  titanIdx = 0;
  outfitOffered = false;
  finished = false;
  danger = 0;
  private dangerOn = false;
  private nextUid = 1;
  private hudT = 0;
  private slowT = 0;
  private hintT = 0;
  private camVel = { x: 0, y: 0 };
  private camTween: { x: number; y: number; t: number } | null = null;
  private dragging = false;
  private resolvedAnnounced = false;
  private exited = false;
  private hintQ: { id: string; text: string; icon: string }[] = [];
  private hintCd = 2.5;

  // ------------------------------------------------------------------ ids & lookups
  uid(): number { return this.nextUid++; }
  get resolved(): number { return this.tribes.filter((t) => t.state !== 'active').length; }
  get allied(): number { return this.tribes.filter((t) => t.state === 'allied').length; }
  get defeated(): number { return this.tribes.filter((t) => t.state === 'defeated').length; }
  get popCap(): number { return POP_CAPS[Math.min(this.resolved, POP_CAPS.length - 1)]; }
  get isNight(): number {
    const d = this.day;
    if (d < 0.66 || d > 0.97) return d < 0.04 ? 1 - d / 0.04 : 0;
    if (d < 0.74) return (d - 0.66) / 0.08;
    if (d > 0.92) return 1 - (d - 0.92) / 0.05;
    return 1;
  }
  members(): Unit[] { return this.units.filter((u) => u.team === PLAYER && u.kind === 'member' && !u.dead); }
  pop(): number { let n = 0; for (const u of this.units) if (u.team === PLAYER && u.kind === 'member' && !u.dead) n++; if (this.chiefT > 0) n++; return n; }
  pets(): Unit[] { return this.units.filter((u) => u.pet && !u.dead); }
  selected(): Unit[] { return this.units.filter((u) => u.sel && !u.dead); }
  chief(): Unit | undefined { return this.units.find((u) => u.team === PLAYER && u.chief && !u.dead); }
  tribeMembers(t: Tribe): Unit[] { return this.units.filter((u) => u.team === t.id && u.kind === 'member' && !u.dead); }
  unlockedTools(): ToolId[] { return unlockedTools(this.diet, this.resolved); }

  // ------------------------------------------------------------------ lifecycle
  enter(game: Game) {
    this.game = game;
    const s = game.state!;
    this.cam.setViewport(game.w, game.h);
    const saved = s.stageData.tribal as TribalSave | undefined;
    this.setupWorld();
    this.refreshSpecies();
    if (saved && saved.v === 1) {
      try { restoreStage(this, saved); } catch (e) { console.error('tribal restore failed', e); this.units.length = 0; this.byId.clear(); this.freshStart(); }
    } else {
      this.freshStart();
    }
    this.hud = new TribalHud(this);
    this.cam.zoom = this.baseZoom();
    this.cam.x = this.home.x;
    this.cam.y = this.home.y + 40;
    this.clampCam();
    audio.music('tribal');
    s.carry.homeName = this.homeName;
    game.banner('Tribal stage', this.homeName);
    if (!saved) setTimeout(() => this.offerOutfitter(), 1800);
    else this.hud.refresh(true);
  }

  exit() {
    this.exited = true;
    this.hud?.destroy();
    this.concert?.destroy();
  }

  pause() { this.paused = true; }
  resume() {
    this.paused = false;
    if (this.dangerOn) audio.music('danger');
  }
  onResize(w: number, hh: number) {
    this.cam.setViewport(w, hh);
    this.clampCam();
    this.hud?.layout();
  }
  /** Mid-stage snapshot. Nothing once the stage is finished, so completeStage's save drops it. */
  serialize(): unknown { return this.finished || !this.home ? undefined : serializeStage(this); }

  /** Default zoom: shows about the same world area on any screen shape. */
  baseZoom(): number { return clamp(Math.sqrt(this.game.w * this.game.h) / 590, 0.7, 1.5); }

  /** Static world and anything derived deterministically from the seed. */
  private setupWorld() {
    const game = this.game, s = game.state!;
    this.w = generateWorld((s.seed ^ 0x7a1b) >>> 0);
    this.terrain = bakeTerrain(this.w);
    this.home = homeLayout(this.w.home.x, this.w.home.y);
    const hr = game.rng('tribal-home');
    this.homeName = (s.carry.homeName as string) || cityName(hr);
    this.tribeLabel = `${s.speciesName} tribe`;
    const body = wornDesign(game);
    this.diet = designDiet(body) ?? 'omnivore';
    this.designs = [body];
    // Rival tribes
    const hues = [6, 272, 42, 318];
    const d = (e: number[], n: number[], hd: number[]) => game.diff(e, n, hd);
    const maxM = d([3, 4, 5, 5], [5, 5, 6, 8], [6, 7, 8, 10]);
    const base = d([12, 0, -20, -10], [5, -20, -30, -60], [-20, -35, -60, -70]);
    for (let i = 0; i < NUM_TRIBES; i++) {
      const r = game.rng('tribal-tribe-' + i);
      const des = generateCreature(r, { level: 2 + (i >= 2 ? 1 : 0) });
      des.colors.base = hsl(hues[i] + r.range(-8, 8), 0.55, 0.57);
      des.colors.coat = hsl((hues[i] + 28) % 360, 0.6, 0.4);
      des.colors.detail = hsl((hues[i] + 200) % 360, 0.45, 0.85);
      const diet = designDiet(des) ?? 'omnivore';
      const v = this.w.rivals[i];
      const hutMax = game.diff(460, 640, 800) + 130 * i;
      this.designs.push(des);
      this.tribes.push({
        id: i + 1, rank: i, name: tribeName(r), design: des, color: hsl(hues[i], 0.78, 0.58),
        style: diet === 'herbivore' ? 'clay' : diet === 'carnivore' ? 'hide' : 'wood',
        x: v.x, y: v.y, hutHp: hutMax, hutMax, burn: 0, relation: base[i], base: base[i], admiration: 0,
        state: 'active', food: 30, maxMembers: maxM[i], weapon: (['axe', 'spear', 'torch', 'axe'] as ToolId[])[i],
        raidT: game.diff(260, 170, 120) + i * 20, giftT: 50 + i * 10, thiefT: game.diff(140, 100, 70) + i * 15,
        spawnT: 10, chiefT: 0, alarm: 0, concertCd: 0, since: 0, hitT: 0,
      });
    }
    // Wild species: one per herd plus a titan.
    const wr = game.rng('tribal-wild');
    const hunterHerds = game.diff(1, 2, 3);
    let hunters = 0;
    this.w.herds.forEach((hd, i) => {
      if (hd.kind === 'hunter' && ++hunters > hunterHerds) return;
      const des = generateCreature(wr, { level: hd.kind === 'hunter' ? 3 : 2, diet: hd.kind === 'hunter' ? 'carnivore' : 'herbivore' });
      this.designs.push(des);
      this.herds.push({ x: hd.x, y: hd.y, kind: hd.kind, dIdx: this.designs.length - 1, size: hd.kind === 'hunter' ? 2 : 4, respawn: 30 + i * 3 });
    });
    const titan = generateCreature(wr, { level: 4, diet: 'carnivore', size: 1.2 });
    titan.name = 'Titan ' + titan.name;
    this.designs.push(titan);
    this.titanIdx = this.designs.length - 1;
    this.titanPlan = game.diff([300], [200, 470], [150, 340, 540]);
    // Ally pets keep their designs in the table too.
    for (const a of s.allies.slice(0, MAX_PETS)) this.designs.push(a);
    // Resource nodes
    for (const f of this.w.fruit) this.addNode('tree', 'fruit', f.x, f.y, f.x, f.y + 14, 10, 10, 1 / 5, f.v, f.near);
    for (const f of this.w.fish) this.addNode('fish', 'fish', f.x, f.y, f.sx, f.sy, 99, 99, 0, 0, -1);
    const pen = this.home.pen;
    this.eggNode = this.addNode('eggs', 'eggs', pen.x - 56, pen.y + 6, pen.x - 112, pen.y + 14, 0, 30, 0, 0, 0);
    this.rebuildObstacles();
  }

  /** New game: tribe, chief, pets, wildlife. */
  private freshStart() {
    const game = this.game, s = game.state!;
    this.food = game.diff(60, 45, 35);
    const H = this.home;
    const chief = this.spawnMember(PLAYER, H.fire.x - 30, H.fire.y + 26, { chief: true });
    chief.facing = 1;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this.spawnMember(PLAYER, H.fire.x + Math.cos(a) * 62, H.fire.y + Math.sin(a) * 40, {});
    }
    for (let i = 0; i < Math.min(MAX_PETS, s.allies.length); i++) this.spawnPet(this.designs.indexOf(s.allies[i]));
    for (const t of this.tribes) {
      spawnTribeMember(this, t, true);
      for (let i = 0; i < t.maxMembers - 1; i++) spawnTribeMember(this, t, false);
    }
    for (const hd of this.herds) for (let i = 0; i < hd.size; i++) spawnHerdMember(this, hd);
    this.abilities = abilitiesFor(s.cards, 'tribal').map((def) => ({ def, cd: 0 }));
  }

  /** Recompute species and outfit derived numbers (after the outfitter or on load). */
  refreshSpecies() {
    const game = this.game;
    const worn = wornDesign(game);
    this.designs[0] = worn;
    this.bonus = outfitBonus(game);
    const st = computeStats(game.state!.creature ?? worn);
    this.species = {
      speed: st.speed ?? 1,
      dmg: 5 + 0.9 * Math.max(st.bite ?? 0, st.strike ?? 0, st.charge ?? 0, st.spit ?? 0),
      hp: 80 + (st.health ?? 0) * 8 + this.bonus.health * 8,
      music: (st.sing ?? 0) + (st.dance ?? 0) + (st.charm ?? 0) + (st.pose ?? 0),
      sneak: st.sneak ?? 0,
    };
    if (!this.abilities.length) this.abilities = abilitiesFor(game.state!.cards, 'tribal').map((def) => ({ def, cd: 0 }));
    for (const u of this.units) {
      if (u.team !== PLAYER || u.kind !== 'member') continue;
      u.design = worn;
      const m = bodyMetrics(worn, u.chief ? 1.25 : 1);
      u.size = m.size; u.r = m.r; u.hgt = m.hgt;
      const max = Math.round(this.species.hp * (u.chief ? 1.5 : 1));
      u.hp = Math.min(max, u.hp + Math.max(0, max - u.maxHp));
      u.maxHp = max;
      u.speed = 62 + this.species.speed * 6;
    }
  }

  // ------------------------------------------------------------------ factories
  addNode(kind: NodeKind, food: FoodKind, x: number, y: number, sx: number, sy: number, amount: number, max: number, regrow: number, variant: number, owner: number, ttl = Infinity): ResourceNode {
    const n: ResourceNode = { id: this.uid(), kind, food, x, y, sx, sy, amount, max, regrow, boost: 0, ttl, variant, shake: 0, owner };
    this.nodes.push(n);
    this.nodeById.set(n.id, n);
    return n;
  }
  removeNode(n: ResourceNode) {
    const i = this.nodes.indexOf(n);
    if (i >= 0) this.nodes.splice(i, 1);
    this.nodeById.delete(n.id);
  }

  addUnit(u: Unit): Unit {
    this.units.push(u);
    this.byId.set(u.id, u);
    return u;
  }

  spawnMember(team: number, x: number, y: number, o: { chief?: boolean; baby?: boolean }): Unit {
    const des = team === PLAYER ? this.designs[0] : this.designs[team];
    const t = team === PLAYER ? null : this.tribes[team - 1];
    const diffHp = team === PLAYER ? 1 : this.game.diff(0.8, 1, 1.2);
    const hp = team === PLAYER ? this.species.hp * (o.chief ? 1.5 : 1) : 58 * diffHp * (o.chief ? 1.8 : 1);
    const u = newUnit(this, {
      kind: 'member', team, design: des, dIdx: team === PLAYER ? 0 : team, x, y, hp: Math.round(hp),
      speed: team === PLAYER ? 62 + this.species.speed * 6 : 58, chief: !!o.chief, age: o.baby ? 0 : 1, scaleMul: o.chief ? 1.25 : 1,
    });
    if (t && !o.chief && Math.random() < (t.rank === 0 ? 0.4 : 0.7)) u.tool = t.weapon;
    return this.addUnit(u);
  }

  spawnAnimal(dIdx: number, x: number, y: number, wild: WildKind, herd: number): Unit {
    const des = this.designs[dIdx];
    const st = computeStats(des);
    const d = this.game.diff(0.8, 1, 1.15);
    const hp = wild === 'titan' ? 900 * this.game.diff(0.7, 1, 1.3) : wild === 'hunter' ? 66 * d : 40 + (st.health ?? 0) * 8;
    const u = newUnit(this, {
      kind: 'animal', team: WILD, design: des, dIdx, x, y, hp: Math.round(hp),
      speed: wild === 'titan' ? 36 : wild === 'hunter' ? 66 : 48 + (st.speed ?? 1) * 4, chief: false, age: 1,
      scaleMul: wild === 'titan' ? 3.2 : wild === 'hunter' ? 1.05 : 0.95,
    });
    u.wild = wild;
    u.herd = herd;
    u.hx = x;
    u.hy = y;
    return this.addUnit(u);
  }

  spawnPet(dIdx: number, at?: { x: number; y: number }): Unit | null {
    if (dIdx < 0 || !this.designs[dIdx]) return null;
    const pen = this.home.pen;
    const u = newUnit(this, {
      kind: 'animal', team: PLAYER, design: this.designs[dIdx], dIdx, x: at?.x ?? pen.x + (Math.random() - 0.5) * 80, y: at?.y ?? pen.y + (Math.random() - 0.5) * 30,
      hp: 90, speed: 60, chief: false, age: 1, scaleMul: 0.85,
    });
    u.pet = true;
    this.addUnit(u);
    this.updatePets();
    return u;
  }

  updatePets() {
    const n = this.pets().length;
    this.eggNode.regrow = n / 22;
    this.stats.maxPets = Math.max(this.stats.maxPets, n);
    if (n >= 3) this.game.unlock('rancher');
  }

  rebuildObstacles() {
    const H = this.home;
    const ob: Obstacle[] = [
      { x: H.hut.x, y: H.hut.y - 12, r: 50 },
      { x: H.fire.x, y: H.fire.y, r: 20 },
      { x: H.totem.x, y: H.totem.y, r: 12 },
      { x: H.pile.x, y: H.pile.y - 4, r: 22 },
    ];
    this.toolHuts.forEach((th, i) => { if (th) ob.push({ x: H.slots[i].x, y: H.slots[i].y - 10, r: 30 }); });
    for (const t of this.tribes) if (t.state !== 'defeated') ob.push({ x: t.x, y: t.y - 12, r: 50 });
    this.obstacles = ob;
  }

  slotDoor(i: number) { const s = this.home.slots[i]; return { x: s.x, y: s.y + 30 }; }
  tribeDoor(t: Tribe) { return { x: t.x, y: t.y + 50 }; }
  /** Where a band stands to perform for a tribe. */
  stagePoint(t: Tribe, slot: number) {
    const a = ((slot % 7) - 3) * 0.26;
    const rr = 156 + Math.floor(slot / 7) * 34;
    return { x: t.x + Math.sin(a) * rr, y: t.y + 24 + Math.cos(a) * rr * 0.75 };
  }

  // ------------------------------------------------------------------ economy
  addFood(n: number, x?: number, y?: number, kind?: FoodKind) {
    if (n <= 0) return;
    this.food += n;
    this.stats.gathered += n;
    if (x !== undefined && y !== undefined) {
      const icon = kind === 'fish' ? '🐟' : kind === 'meat' ? '🍖' : kind === 'eggs' ? '🥚' : '🍎';
      this.fx.text(x, y - 36, `+${Math.round(n)} ${icon}`, '#ffe9a8');
    }
    audio.sfx('coin', { pitch: 0.9 + Math.random() * 0.2, vol: 0.6 });
  }

  spend(n: number, what: string): boolean {
    if (this.food < n) {
      audio.sfx('error');
      this.notify('food:' + what, `Not enough food for ${what} (${n} 🍎 needed).`, '🍎', 'bad', 2);
      this.hud.flashFood();
      return false;
    }
    this.food -= n;
    return true;
  }

  buyMember() {
    if (this.concert) return;
    if (this.pop() >= this.popCap) {
      audio.sfx('error');
      ui.toast(`Your tribe is at its limit (${this.popCap}). Win over or defeat tribes to grow.`, { icon: '👥', kind: 'bad' });
      return;
    }
    if (!this.spend(COST.member, 'a new member')) return;
    const H = this.home;
    const u = this.spawnMember(PLAYER, H.hut.x + (Math.random() - 0.5) * 30, H.hut.y + 52, { baby: true });
    u.bubble = '🥚';
    u.bubbleT = 2;
    this.fx.burst(P.Star, u.x, u.y - 10, 12, { color: ['#ffd166', '#fff'], speed: 50, up: 40 });
    audio.sfx('pop');
    this.hint('baby', 'A baby joined the tribe! It grows up in about 30 seconds.', '🐣');
    this.hud.refresh(true);
  }

  buildToolHut(tool: ToolId): boolean {
    if (!this.unlockedTools().includes(tool)) {
      audio.sfx('error');
      ui.toast(`${TOOLS[tool].name} unlocks after ${unlockLevel(this.diet, tool)} tribe${unlockLevel(this.diet, tool) === 1 ? '' : 's'} won over or defeated.`, { icon: '🔒' });
      return false;
    }
    if (this.toolHuts.some((t) => t?.tool === tool)) { ui.toast(`You already have a ${TOOLS[tool].name} hut.`, { icon: TOOLS[tool].icon }); return false; }
    const slot = this.toolHuts.findIndex((t) => !t);
    if (slot < 0) {
      audio.sfx('error');
      ui.toast('All 6 hut slots are used. Tap a tool hut to tear it down.', { icon: '🛖', kind: 'bad' });
      return false;
    }
    if (!this.spend(COST.hut, 'a tool hut')) return false;
    this.toolHuts[slot] = { slot, tool, grow: 0 };
    this.rebuildObstacles();
    const s = this.home.slots[slot];
    this.fx.burst(P.Dust, s.x, s.y, 14, { color: '#c9a46c', speed: 60, up: 10, size: 6 });
    audio.sfx('build');
    this.game.stat('tribal-huts');
    this.hint('fetch-tool', `Select members, then tap the ${TOOLS[tool].name} hut so they pick up the tool.`, TOOLS[tool].icon);
    this.focus(s.x, s.y);
    return true;
  }

  demolishToolHut(slot: number) {
    const th = this.toolHuts[slot];
    if (!th) return;
    this.toolHuts[slot] = null;
    this.food += 10;
    for (const u of this.units) if (u.order.type === 'tool' && u.order.slot === slot) u.order = { type: 'idle' };
    const s = this.home.slots[slot];
    this.fx.burst(P.Dust, s.x, s.y, 18, { color: '#a07a50', speed: 70, size: 7 });
    this.fx.text(s.x, s.y - 40, '+10 🍎', '#ffe9a8');
    audio.sfx('remove');
    this.rebuildObstacles();
  }

  sendGift(t: Tribe) {
    if (t.state !== 'active') return;
    if (!this.spend(COST.gift, 'a gift')) return;
    this.stats.gifts++;
    const H = this.home;
    const porter = newUnit(this, {
      kind: 'porter', team: PLAYER, design: this.designs[0], dIdx: 0, x: H.pile.x, y: H.pile.y + 10, hp: 999, speed: 120, chief: false, age: 1, scaleMul: 0.9,
    });
    porter.order = { type: 'deliver', tribe: t.id, amount: COST.gift, toPlayer: false };
    porter.carry = COST.gift;
    porter.carryKind = 'fruit';
    this.addUnit(porter);
    audio.sfx('pop');
    ui.toast(`A gift basket is on its way to the ${t.name}.`, { icon: '🎁', kind: 'good' });
    this.hint('gift', 'Gifts warm a tribe up. Wary tribes will only listen to music once they are neutral.', '🎁');
  }

  /** Called when a gift porter arrives. */
  deliverGift(p: Unit, toPlayer: boolean, tribeId: number, amount: number) {
    const t = this.tribes[tribeId - 1];
    if (toPlayer) {
      this.food += amount;
      this.fx.text(this.home.pile.x, this.home.pile.y - 40, `+${amount} 🎁`, '#9df2c9', true);
      ui.toast(`The ${t.name} sent you a gift of ${amount} food!`, { icon: '🎁', kind: 'good' });
      audio.sfx('success');
    } else if (t.state === 'active') {
      t.relation = Math.min(100, t.relation + 16);
      t.admiration = Math.min(95, t.admiration + 6);
      t.food += amount;
      this.fx.burst(P.Heart, t.x, t.y - 20, 6, { icon: '💖', size: 18, speed: 30, up: 50, life: 1.4 });
      this.fx.text(t.x, t.y - 90, `${relationFace(t).icon} +16`, '#ff9ccf', true);
      audio.sfx('charm');
    }
    p.dead = true;
    p.dying = 0.6;
  }

  tame(by: Unit, a: Unit) {
    if (a.dead || a.team !== WILD || a.wild === 'titan') { by.order = { type: 'idle' }; return; }
    if (this.pets().length >= MAX_PETS) {
      ui.toast('The pen is full (3 pets).', { icon: '🐾', kind: 'bad' });
      by.order = { type: 'idle' };
      return;
    }
    if (!this.spend(COST.tame, 'a treat')) { by.order = { type: 'idle' }; return; }
    a.dead = true;
    a.dying = 0.01;
    a.hp = 0;
    const pet = this.spawnPet(a.dIdx, { x: a.x, y: a.y });
    if (pet) {
      pet.order = { type: 'move', x: this.home.pen.x, y: this.home.pen.y };
      this.fx.burst(P.Heart, a.x, a.y - 20, 8, { icon: '💗', size: 18, speed: 40, up: 50, life: 1.4 });
      this.stats.tamed++;
      ui.toast(`A ${a.design.name} joined your pen! Pets lay eggs.`, { icon: '🐾', kind: 'good' });
      audio.sfx('charm');
    }
    by.order = { type: 'idle' };
  }

  // ------------------------------------------------------------------ outfitter
  async offerOutfitter() {
    if (this.outfitOffered || this.finished || this.exited) return;
    this.outfitOffered = true;
    this.paused = true;
    const body = h('div', { class: 'col' },
      h('p', null, `The ${this.tribeLabel} gathers around its first fire. You are their Chieftain.`),
      h('p', null, 'Dress your tribe in the Outfitter? The elders offer 100 food worth of clothing. Clothes boost gathering, combat, music and health.'));
    const r = await ui.modal({ title: '🔥 A tribe is born', body, buttons: [{ id: 'skip', label: 'Maybe later' }, { id: 'go', label: '👕 Outfitter', primary: true }] });
    this.paused = false;
    if (r === 'go') await this.outfitter(true);
    this.hint('start', 'Tap a tribe member to select them (or use All), then tap a fruit tree, a fishing spot or an animal.', '👆', true);
  }

  async outfitter(free = false) {
    if (this.concert) return;
    const budget = free ? 100 : this.food;
    const spent = await openOutfitter(this.game, budget, this.resolved, free);
    if (spent === null) return;
    if (!free) this.food = Math.max(0, this.food - spent);
    this.refreshSpecies();
    this.hud.refresh(true);
    const b = this.bonus;
    if (b.gather + b.combat + b.social + b.health > 0) ui.toast(`Outfit bonus: 🧺${b.gather} ⚔️${b.combat} 🎶${b.social} ❤️${b.health}`, { icon: '👕', kind: 'good' });
  }

  // ------------------------------------------------------------------ conquest
  /** Recent notable events (relation drops, deaths) for debugging and tests. */
  eventLog: string[] = [];
  logEvent(msg: string) {
    this.eventLog.push(`${Math.round(this.time)}s ${msg}`);
    if (this.eventLog.length > 200) this.eventLog.shift();
  }

  hostileToward(t: Tribe, amount: number, reason: string) {
    if (t.state !== 'active') return;
    const was = t.relation;
    if (was > -99) this.logEvent(`rel T${t.id} -${amount} (${reason}) ${Math.round(was)}`);
    t.relation = Math.max(-100, t.relation - amount);
    t.base = Math.min(t.base, -55);
    t.alarm = 25;
    t.admiration = Math.max(0, t.admiration - amount);
    if (was > -50 && t.relation <= -50) ui.toast(`The ${t.name} are now your enemies (${reason}).`, { icon: '😡', kind: 'bad' });
  }

  damageHut(t: Tribe, dmg: number, from: Unit | null, burn = false) {
    if (t.state !== 'active') return;
    t.hutHp -= dmg;
    t.hitT = 0.25;
    if (burn) t.burn = Math.max(t.burn, 6);
    if (from && from.team === PLAYER) this.hostileToward(t, 6, 'you attacked their hut');
    if (Math.random() < 0.5) this.fx.burst(P.Dust, t.x + (Math.random() - 0.5) * 60, t.y - 30, 3, { color: '#8a6a40', speed: 40, size: 5 });
    if (t.hutHp <= 0) this.defeatTribe(t);
  }

  allyTribe(t: Tribe) {
    if (t.state !== 'active') return;
    t.state = 'allied';
    t.relation = 100;
    t.admiration = 100;
    t.since = 0;
    t.giftT = 30;
    for (const u of this.tribeMembers(t)) { u.raid = false; u.order = { type: 'home' }; u.bubble = '💚'; u.bubbleT = 3; }
    this.totem.push({ tribe: t.id, allied: true, t: 0 });
    this.game.history(`Allied with the ${t.name}`, '🎶');
    this.game.banner('Alliance!', t.name);
    audio.sfx('levelup');
    setTimeout(() => audio.sfx('bell'), 400);
    this.afterResolve(t);
  }

  defeatTribe(t: Tribe) {
    if (t.state !== 'active') return;
    t.state = 'defeated';
    t.hutHp = 0;
    t.since = 0;
    t.burn = 8;
    for (const u of this.tribeMembers(t)) { u.raid = false; u.order = { type: 'idle' }; u.fear = 6; u.bubble = '😱'; u.bubbleT = 2; }
    const loot = Math.round(Math.max(40, t.food) * this.game.diff(1.2, 1, 0.9));
    this.food += loot;
    this.stats.gathered += loot;
    this.fx.text(t.x, t.y - 100, `+${loot} 🍖 loot`, '#ffd166', true);
    this.fx.burst(P.Ember, t.x, t.y - 40, 40, { color: ['#ff7a2a', '#ffd166', '#ff4d2d'], speed: 90, up: 120, life: 1.4, size: 3 });
    this.fx.shake = 8;
    this.totem.push({ tribe: t.id, allied: false, t: 0 });
    this.game.history(`Burned the village of the ${t.name}`, '🔥');
    this.game.banner('Village burned', t.name);
    audio.sfx('explode');
    setTimeout(() => audio.sfx('horn'), 300);
    this.rebuildObstacles();
    this.afterResolve(t);
  }

  private afterResolve(t: Tribe) {
    for (const u of this.units) {
      if (u.team === PLAYER && ((u.order.type === 'perform' || u.order.type === 'hut') && (u.order as { tribe: number }).tribe === t.id)) u.order = { type: 'idle' };
    }
    const n = this.resolved;
    const newTools = unlockedTools(this.diet, n).filter((x) => !unlockedTools(this.diet, n - 1).includes(x));
    const cap = this.popCap;
    setTimeout(() => {
      if (n >= NUM_TRIBES || this.finished || this.exited) return;
      const tools = newTools.length ? ` New tools: ${newTools.map((x) => TOOLS[x].icon + ' ' + TOOLS[x].name).join(', ')}.` : '';
      ui.toast(`Your tribe can now grow to ${cap}.${tools}`, { icon: '🗿', kind: 'good', ms: 4500 });
    }, 1500);
    if (n >= NUM_TRIBES) this.onAllResolved();
    this.hud.refresh(true);
  }

  private onAllResolved() {
    if (this.resolvedAnnounced) return;
    this.resolvedAnnounced = true;
    setTimeout(() => {
      if (this.exited) return;
      this.game.banner('The totem is complete', 'Found a city!');
      audio.music('victory');
      this.hud.refresh(true);
    }, 2600);
  }

  cardColor(): CardColor {
    const a = this.allied, d = this.defeated;
    let score = (a - d) / NUM_TRIBES;
    // Industrious: a huge harvest pulls the card toward blue.
    const avg = this.game.diff(700, 900, 1100);
    if (this.stats.gathered > avg * 2.2) score *= 0.6;
    return score >= 0.75 ? 'green' : score <= -0.75 ? 'red' : 'blue';
  }

  foundCity() {
    if (this.finished || this.resolved < NUM_TRIBES) return;
    this.finished = true;
    const game = this.game, s = game.state!;
    const card = this.cardColor();
    s.carry.homeName = this.homeName;
    if (this.allied === NUM_TRIBES) game.unlock('harmony');
    if (this.defeated === NUM_TRIBES) game.unlock('warpath');
    if (this.stats.deaths === 0) game.unlock('no-losses');
    if (this.stats.maxPets >= 3) game.unlock('rancher');
    game.stat('tribal-food', this.stats.gathered);
    game.history(`Founded the city of ${this.homeName}`, '🏙️');
    const summary = [
      `Allied ${this.allied} · Defeated ${this.defeated}`,
      `Gathered ${Math.round(this.stats.gathered)} food`,
      `Tribe of ${this.pop()} · ${this.pets().length} pet${this.pets().length === 1 ? '' : 's'}`,
      this.stats.deaths === 0 ? 'Not a single member lost' : `Members lost: ${this.stats.deaths}`,
      `${this.homeName} becomes your first city`,
    ];
    audio.sfx('success');
    game.completeStage(card, summary);
  }

  // ------------------------------------------------------------------ selection & commands
  selectOnly(u: Unit | null) {
    for (const x of this.units) x.sel = false;
    if (u) u.sel = true;
    this.hud.refresh(true);
  }
  selectAll() {
    let n = 0;
    for (const u of this.units) { u.sel = this.isSelectable(u); if (u.sel) n++; }
    audio.sfx(n ? 'tap' : 'error');
    this.hud.refresh(true);
  }
  selectIdle() {
    let n = 0;
    for (const u of this.units) {
      u.sel = this.isSelectable(u) && (u.order.type === 'idle' || u.order.type === 'move' && dist(u, u.order) < 10);
      if (u.sel) n++;
    }
    audio.sfx(n ? 'tap' : 'error');
    if (!n) ui.toast('Nobody is idle. Everyone is busy!', { icon: '💪' });
    this.hud.refresh(true);
  }
  isSelectable(u: Unit) { return u.team === PLAYER && u.kind === 'member' && !u.dead && u.age >= 1; }

  setStance(s: Stance) {
    this.stance = s;
    audio.sfx(s === 'attack' ? 'drum' : 'charm');
    this.hint('stance-' + s, s === 'attack'
      ? 'Attack stance: tapping rivals or wild animals attacks them. Torches burn huts fast.'
      : 'Social stance: tapping a rival village sends your band to perform; tapping an animal tames it.', s === 'attack' ? '⚔️' : '🎶');
    this.hud.refresh(true);
  }

  /** Give an order to a set of units, assigning formation slots. */
  command(units: Unit[], make: (u: Unit) => Order) {
    units.forEach((u, i) => {
      u.slot = i;
      u.resume = null;
      u.order = make(u);
      if (u.bubble === '💤') u.bubble = null;
    });
  }

  pick(wx: number, wy: number): Pick {
    const z = this.cam.zoom;
    const slop = 16 / z;
    let best: Unit | null = null, bd = Infinity;
    for (const u of this.units) {
      if (u.dead || u.kind === 'porter') continue;
      const cy = u.y - u.hgt * u.size * 0.5 * (0.6 + 0.4 * u.age);
      const rx = u.r * (0.6 + 0.4 * u.age) + slop, ry = u.hgt * u.size * 0.5 + slop;
      const dx = (wx - u.x) / rx, dy = (wy - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const pri = u.team === PLAYER && u.kind === 'member' ? 0 : u.team !== WILD ? 0.3 : 0.5;
      if (d + pri < bd) { bd = d + pri; best = u; }
    }
    if (best) return { type: 'unit', u: best };
    const H = this.home;
    const near = (x: number, y: number, rx: number, ry: number) => ((wx - x) / (rx + slop)) ** 2 + ((wy - y) / (ry + slop)) ** 2 <= 1;
    for (const t of this.tribes) if (near(t.x, t.y - 45, 64, 64)) return { type: 'tribe', t };
    if (near(H.hut.x, H.hut.y - 45, 60, 62)) return { type: 'home' };
    for (let i = 0; i < 6; i++) if (this.toolHuts[i] && near(H.slots[i].x, H.slots[i].y - 28, 34, 38)) return { type: 'toolhut', slot: i };
    if (near(this.eggNode.x, this.eggNode.y, 26, 20)) return { type: 'node', n: this.eggNode };
    if (near(H.pen.x, H.pen.y, 92, 50)) return { type: 'pen' };
    if (near(H.fire.x, H.fire.y - 10, 30, 30)) return { type: 'fire' };
    if (near(H.pile.x, H.pile.y - 8, 34, 24)) return { type: 'pile' };
    if (near(H.totem.x, H.totem.y - 40, 18, 50)) return { type: 'totem' };
    let bn: ResourceNode | null = null; bd = Infinity;
    for (const n of this.nodes) {
      if (n.kind === 'eggs') continue;
      const cy = n.kind === 'tree' ? n.y - 50 : n.y;
      const rx = n.kind === 'tree' ? 30 : n.kind === 'fish' ? 34 : 22;
      const ry = n.kind === 'tree' ? 48 : 24;
      const dx = (wx - n.x) / (rx + slop), dy = (wy - cy) / (ry + slop);
      const d = dx * dx + dy * dy;
      if (d <= 1 && d < bd) { bd = d; bn = n; }
    }
    if (bn) return { type: 'node', n: bn };
    return { type: 'ground' };
  }

  onTap(x: number, y: number) {
    if (this.paused || this.finished) return;
    if (this.concert) return;
    const wp = this.cam.screenToWorld(x, y);
    if (this.targetMode) {
      castAt(this, this.targetMode, wp.x, wp.y);
      this.targetMode = null;
      this.hud.refresh(true);
      return;
    }
    const pk = this.pick(wp.x, wp.y);
    const sel = this.selected();
    const has = sel.length > 0;
    switch (pk.type) {
      case 'unit': {
        const u = pk.u;
        if (this.isSelectable(u)) {
          if (!u.sel || sel.length > 1) this.selectOnly(u);
          audio.sfx('tap', { pitch: 1.2 });
          this.hud.closePanel();
          return;
        }
        if (u.team === PLAYER && u.kind === 'member') { ui.toast('Babies can\'t take orders yet. They grow up soon.', { icon: '🐣' }); return; }
        if (u.pet) { if (has) this.orderMove(sel, wp.x, wp.y); else ui.toast(`${u.design.name}: one of your pets. Pets lay eggs and defend the village.`, { icon: '🐾' }); return; }
        if (u.team === PLAYER && u.charmed) { if (has) this.orderMove(sel, wp.x, wp.y); return; }
        if (u.team === WILD) {
          if (!has) { ui.toast(`${u.design.name}${u.wild === 'titan' ? ' — a deadly Titan!' : u.wild === 'hunter' ? ' (dangerous predator)' : ''}. Select members, then tap it to ${this.stance === 'attack' || u.wild !== 'grazer' ? 'hunt' : 'tame'} it.`, { icon: u.wild === 'grazer' ? '🦌' : '⚠️' }); return; }
          if (this.stance === 'social' && u.wild === 'grazer') {
            if (this.pets().length >= MAX_PETS) { ui.toast('Your pen is full. Switch to ⚔️ stance to hunt.', { icon: '🐾' }); return; }
            const tamer = sel.reduce((b, x) => (dist(x, u) < dist(b, u) ? x : b));
            this.command([tamer], () => ({ type: 'tame', target: u.id }));
            this.fx.mark(u.x, u.y, '🦴', `Tame · ${COST.tame} 🍎`, '#ff9ccf');
            audio.sfx('charm');
          } else {
            this.command(sel, () => ({ type: 'attack', target: u.id }));
            this.fx.mark(u.x, u.y, '🍖', 'Hunt', '#ff7a59');
            audio.sfx('drum');
            this.hint('hunt', 'Hunted animals leave meat. Your hunters carry it home automatically.', '🍖');
          }
          return;
        }
        // rival member
        const t = this.tribes[u.team - 1];
        if (!has || t.state !== 'active') { this.hud.showTribe(t); return; }
        if (this.stance === 'attack') {
          this.command(sel, () => ({ type: 'attack', target: u.id }));
          this.fx.mark(u.x, u.y, '⚔️', 'Attack', '#ff5a4f');
          audio.sfx('drum');
        } else this.orderPerform(sel, t);
        return;
      }
      case 'tribe': {
        const t = pk.t;
        if (!has || t.state !== 'active') { this.hud.showTribe(t); return; }
        if (this.stance === 'attack') {
          this.command(sel, () => ({ type: 'hut', tribe: t.id }));
          this.fx.mark(t.x, t.y, '🔥', 'Raze hut', '#ff5a4f');
          audio.sfx('horn');
          this.hint('raze', 'Burn their hut to defeat a tribe. Torches do the most damage; defenders will fight back.', '🔥');
        } else this.orderPerform(sel, t);
        return;
      }
      case 'toolhut': {
        const th = this.toolHuts[pk.slot]!;
        if (!has) { this.hud.showToolHut(pk.slot); return; }
        const takers = sel.filter((u) => !u.chief);
        if (!takers.length) { ui.toast('The Chieftain keeps the staff and never takes tools.', { icon: '🪶' }); return; }
        this.command(takers, () => ({ type: 'tool', slot: pk.slot }));
        const s = this.slotDoor(pk.slot);
        this.fx.mark(s.x, s.y, TOOLS[th.tool].icon, `Take ${TOOLS[th.tool].name}`);
        audio.sfx('tap');
        return;
      }
      case 'node': {
        const n = pk.n;
        if (!has) {
          const what = n.kind === 'tree' ? `Fruit tree · ${Math.floor(n.amount)} fruit` : n.kind === 'fish' ? 'Fishing spot' : n.kind === 'eggs' ? `Egg basket · ${Math.floor(n.amount)} eggs` : `${Math.floor(n.amount)} food`;
          ui.toast(`${what}. Select members, then tap it to gather.`, { icon: n.kind === 'fish' ? '🐟' : n.kind === 'eggs' ? '🥚' : n.kind === 'tree' ? '🍎' : '🍖' });
          return;
        }
        this.orderGather(sel, n);
        return;
      }
      case 'pen':
        if (has) this.orderGather(sel, this.eggNode);
        else ui.toast(`Pet pen · ${this.pets().length}/${MAX_PETS} pets. Pets lay eggs; tap the egg basket with members selected to collect them.`, { icon: '🐾' });
        return;
      case 'fire':
        if (has) { this.orderMove(sel, this.home.fire.x, this.home.fire.y + 40, '🔥', 'Rest by the fire'); this.hint('fire', 'Members resting by the fire slowly heal.', '🔥'); }
        else ui.toast('The village fire. Members resting here heal.', { icon: '🔥' });
        return;
      case 'home':
        if (has) this.orderMove(sel, this.home.hut.x, this.home.hut.y + 70);
        else this.hud.showHome();
        return;
      case 'pile':
        if (has) this.orderMove(sel, wp.x, wp.y + 30);
        else ui.toast(`Food pile: ${Math.floor(this.food)} food. Raiders will try to steal it!`, { icon: '🍎' });
        return;
      case 'totem':
        ui.toast(`The totem has ${this.resolved}/${NUM_TRIBES} heads. Win over or defeat every tribe to complete it.`, { icon: '🗿' });
        return;
      case 'ground':
        if (has) this.orderMove(sel, wp.x, wp.y);
        else this.hud.closePanel();
        return;
    }
  }

  orderMove(sel: Unit[], x: number, y: number, icon = '📍', label = '') {
    this.command(sel, (u) => {
      const o = slotOffset(u.slot, 22);
      return { type: 'move', x: x + o.x, y: y + o.y };
    });
    this.fx.mark(x, y, icon, label);
    audio.sfx('tap');
  }

  orderGather(sel: Unit[], n: ResourceNode) {
    this.command(sel, () => ({ type: 'gather', node: n.id, phase: 'go', t: 0 }));
    const label = n.kind === 'tree' ? 'Gather fruit' : n.kind === 'fish' ? 'Fish' : n.kind === 'eggs' ? 'Collect eggs' : 'Collect food';
    this.fx.mark(n.sx, n.sy, n.kind === 'fish' ? '🐟' : n.kind === 'eggs' ? '🥚' : n.kind === 'tree' ? '🍎' : '🍖', label, '#ffd166');
    audio.sfx('tap');
    if (n.kind === 'fish') this.hint('fishspear', 'Fishing spears triple every catch.', '🎣');
    if (n.kind === 'tree') this.hint('staff', 'Gathering staffs knock fruit down three times faster.', '🧺');
  }

  orderPerform(sel: Unit[], t: Tribe) {
    if (t.relation <= -15) {
      audio.sfx('error');
      ui.toast(`The ${t.name} are ${relationFace(t).label.toLowerCase()} and won't listen. Send a gift 🎁 first, or switch to ⚔️ stance.`, { icon: relationFace(t).icon, kind: 'bad', ms: 4200 });
      this.hud.showTribe(t);
      return;
    }
    this.command(sel, () => ({ type: 'perform', tribe: t.id }));
    const p = this.stagePoint(t, 3);
    this.fx.mark(p.x, p.y, '🎶', 'Perform', '#7bd389');
    audio.sfx('horn', { pitch: 1.2 });
    if (!sel.some((u) => isInstrument(u.tool))) {
      ui.toast('Nobody in this band holds an instrument. Build a 🥁/📯/🪇 hut and pick one up first.', { icon: '🎶', ms: 4500 });
    } else {
      this.hint('concert', 'When your band arrives, tap “Start concert” and hit the instrument buttons on the beat.', '🎶');
    }
  }

  /** Band members gathered at a tribe's stage, ready to play. */
  bandAt(t: Tribe): Unit[] {
    return this.units.filter((u) => u.team === PLAYER && u.kind === 'member' && !u.dead && u.age >= 1 && u.order.type === 'perform' && u.order.tribe === t.id && dist(u, this.stagePoint(t, u.slot)) < 60);
  }

  startConcert(t: Tribe) {
    if (this.concert || t.state !== 'active') return;
    const band = this.bandAt(t);
    if (!band.some((u) => isInstrument(u.tool))) {
      audio.sfx('error');
      ui.toast('You need at least one member with an instrument at the village.', { icon: '🥁', kind: 'bad' });
      return;
    }
    if (t.relation <= -15) { this.orderPerform(band, t); return; }
    if (t.concertCd > 0) { ui.toast(`The ${t.name} need a moment before the next concert.`, { icon: '⏳' }); return; }
    this.selectOnly(null);
    this.hud.closePanel();
    this.concert = new Concert(this, t, band);
    this.stats.concerts++;
    this.focus(t.x, t.y + 80);
  }

  endConcert(win: boolean) {
    const c = this.concert;
    if (!c) return;
    this.concert = null;
    c.tribe.concertCd = win ? 0 : 6;
    audio.music(this.dangerOn ? 'danger' : this.resolved >= NUM_TRIBES ? 'victory' : 'tribal');
    if (win) this.allyTribe(c.tribe);
    this.hud.setConcertMode(false);
    this.hud.refresh(true);
  }

  // ------------------------------------------------------------------ camera
  focus(x: number, y: number) { this.camTween = { x, y, t: 0 }; }
  clampCam() {
    const c = this.cam;
    const hw = c.w / 2 / c.zoom, hh = c.h / 2 / c.zoom;
    c.x = hw * 2 >= WORLD ? WORLD / 2 : clamp(c.x, hw - 40, WORLD - hw + 40);
    c.y = hh * 2 >= WORLD ? WORLD / 2 : clamp(c.y, hh - 60, WORLD - hh + 60);
  }
  onDragStart() { this.dragging = true; this.camTween = null; this.camVel.x = 0; this.camVel.y = 0; }
  onDrag(_p: PointerInfo, dx: number, dy: number) {
    if (this.concert) return;
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.camVel.x = -dx / this.cam.zoom * 60;
    this.camVel.y = -dy / this.cam.zoom * 60;
    this.clampCam();
  }
  onDragEnd() { this.dragging = false; }
  onPinch(f: number, cx: number, cy: number) {
    this.camTween = null;
    const bz = this.baseZoom();
    this.cam.minZoom = bz * 0.42;
    this.cam.maxZoom = bz * 2.2;
    this.cam.zoomAt(f, cx, cy);
    this.clampCam();
  }
  onWheel(dy: number, x: number, y: number) { this.onPinch(dy < 0 ? 1.12 : 1 / 1.12, x, y); }
  onLongPress(x: number, y: number) {
    if (this.concert || this.paused) return;
    const wp = this.cam.screenToWorld(x, y);
    const pk = this.pick(wp.x, wp.y);
    if (pk.type === 'unit' && this.isSelectable(pk.u)) {
      pk.u.sel = !pk.u.sel;
      audio.sfx('tap', { pitch: pk.u.sel ? 1.3 : 0.8 });
      this.hud.refresh(true);
      return;
    }
    if (pk.type === 'ground') {
      let n = 0;
      for (const u of this.units) if (this.isSelectable(u) && dist(u, wp) < 150) { u.sel = true; n++; }
      if (n) { audio.sfx('tap', { pitch: 1.3 }); this.fx.mark(wp.x, wp.y, '👥', `${n} selected`); }
      this.hud.refresh(true);
    }
  }
  onKey(k: string, down: boolean) {
    if (!down) return;
    if (this.concert) { this.concert.key(k); return; }
    if (k === 'a') this.selectAll();
    else if (k === 'i') this.selectIdle();
    else if (k === 's') this.setStance(this.stance === 'social' ? 'attack' : 'social');
    else if (k === 'escape') { this.selectOnly(null); this.targetMode = null; this.hud.closePanel(); }
  }
  onPointerDown(_p: PointerInfo): boolean { this.camVel.x = 0; this.camVel.y = 0; return false; }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    if (this.paused) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.day = (this.day + dt / DAY_LENGTH) % 1;
    // camera
    if (this.camTween) {
      this.camTween.t += dt;
      const k = 1 - Math.exp(-dt * 7);
      this.cam.x += (this.camTween.x - this.cam.x) * k;
      this.cam.y += (this.camTween.y - this.cam.y) * k;
      if (this.camTween.t > 1.2) this.camTween = null;
      this.clampCam();
    } else if (!this.dragging && (Math.abs(this.camVel.x) > 1 || Math.abs(this.camVel.y) > 1)) {
      this.cam.x += this.camVel.x * dt;
      this.cam.y += this.camVel.y * dt;
      this.camVel.x *= Math.exp(-dt * 5);
      this.camVel.y *= Math.exp(-dt * 5);
      this.clampCam();
    }
    this.concert?.update(dt);
    updateTribes(this, dt);
    updateWildlife(this, dt);
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead) continue;
      if (u.team === PLAYER && u.kind === 'member') updatePlayerUnit(this, u, dt);
      else if (u.kind === 'animal') updateAnimal(this, u, dt);
      else if (u.kind === 'member') updateRival(this, u, dt);
      else this.updatePorter(u, dt);
    }
    integrate(this, dt);
    healPass(this, dt);
    updateShots(this, dt);
    updateAbilities(this, dt);
    this.updateNodes(dt);
    this.updateSnares(dt);
    this.updateChief(dt);
    this.ambient(dt);
    this.fx.update(dt);
    for (const tm of this.totem) tm.t += dt;
    for (const th of this.toolHuts) if (th && th.grow < 1) th.grow = Math.min(1, th.grow + dt * 1.6);
    // reap dead
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.dead) {
        u.dying -= dt;
        if (u.dying <= 0) { this.units.splice(i, 1); this.byId.delete(u.id); }
      }
    }
    this.slowT -= dt;
    if (this.slowT <= 0) { this.slowT = 0.5; this.checkDanger(); }
    this.hintT -= dt;
    if (this.hintT <= 0) { this.hintT = 1; this.timedHints(); }
    this.pumpHints(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.hud.refresh(false); }
  }

  private updatePorter(u: Unit, dt: number) {
    const o = u.order;
    if (o.type !== 'deliver') { u.dead = true; u.dying = 0.5; return; }
    const t = this.tribes[o.tribe - 1];
    const dest = o.toPlayer ? { x: this.home.pile.x, y: this.home.pile.y + 16 } : this.tribeDoor(t);
    u.gx = dest.x; u.gy = dest.y; u.gs = 1;
    if (dist(u, dest) < 14) this.deliverGift(u, o.toPlayer, o.tribe, o.amount);
    void dt;
  }

  private updateNodes(dt: number) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (n.shake > 0) n.shake -= dt;
      if (n.boost > 0) n.boost -= dt;
      if (n.regrow > 0 && n.amount < n.max) n.amount = Math.min(n.max, n.amount + n.regrow * dt * (n.boost > 0 ? 4 : 1));
      if (n.ttl !== Infinity) {
        n.ttl -= dt;
        if (n.ttl <= 0 || (n.amount < 1 && n.kind !== 'tree')) this.removeNode(n);
      }
    }
  }

  private updateSnares(dt: number) {
    for (let i = this.snares.length - 1; i >= 0; i--) {
      const s = this.snares[i];
      s.ttl -= dt;
      if (s.sprung > 0) { s.sprung -= dt; if (s.sprung <= 0) { this.snares.splice(i, 1); } continue; }
      if (s.ttl <= 0) { this.snares.splice(i, 1); continue; }
      for (const u of this.units) {
        if (u.dead || u.team === PLAYER || u.kind === 'porter') continue;
        if (u.team !== WILD && !u.raid && this.tribes[u.team - 1].relation > -50) continue;
        if (u.team === WILD && u.wild === 'grazer') continue;
        if (dist(u, s) < 22 + u.r * 0.5) {
          s.sprung = 1.2;
          u.stun = Math.max(u.stun, u.wild === 'titan' ? 3 : 6);
          this.hitUnit(u, u.wild === 'titan' ? 80 : 22, null);
          this.fx.burst(P.Dust, s.x, s.y, 12, { color: '#9a7a50', speed: 50, size: 5 });
          this.fx.text(s.x, s.y - 30, 'Snared!', '#ffd166');
          audio.sfx('chomp');
          break;
        }
      }
    }
  }

  private updateChief(dt: number) {
    if (this.chiefT > 0) {
      this.chiefT -= dt;
      if (this.chiefT <= 0) {
        const H = this.home;
        const c = this.spawnMember(PLAYER, H.hut.x, H.hut.y + 52, { chief: true });
        this.fx.burst(P.Star, c.x, c.y - 20, 16, { color: ['#ffd166', '#fff'], speed: 60, up: 60 });
        ui.toast('Your Chieftain has returned to the village.', { icon: '🪶', kind: 'good' });
        audio.sfx('levelup');
      }
    }
  }

  private ambient(dt: number) {
    const H = this.home;
    const r = Math.random;
    if (r() < dt * 4) this.fx.add(P.Smoke, H.fire.x + (r() - 0.5) * 10, H.fire.y - 18, { vy: -20 - r() * 10, vx: (r() - 0.5) * 6, life: 2.2, size: 3.5, color: '#d8d0c6' });
    if (r() < dt * 14) this.fx.add(P.Ember, H.fire.x + (r() - 0.5) * 14, H.fire.y - 10, { vz: 40 + r() * 40, vx: (r() - 0.5) * 20, life: 0.9, size: 1.6, color: '#ffb347' });
    for (const t of this.tribes) {
      if (t.state === 'defeated') {
        if (t.since < 60 && r() < dt * 5) this.fx.add(P.Smoke, t.x + (r() - 0.5) * 60, t.y - 10, { vy: -14, vx: 4, life: 3, size: 8, color: '#5a524c' });
      } else if (r() < dt * 3) {
        this.fx.add(P.Smoke, t.x + 4, t.y + 48, { vy: -16, life: 2.2, size: 5, color: '#cfc6bb' });
      }
      if (t.burn > 0 && r() < dt * 30) {
        this.fx.add(P.Fire, t.x + (r() - 0.5) * 90, t.y - 40 - r() * 50, { vy: -30, life: 0.7, size: 7 + r() * 6, color: r() < 0.5 ? '#ff7a2a' : '#ffcf4a' });
        if (r() < 0.3) this.fx.add(P.Smoke, t.x + (r() - 0.5) * 60, t.y - 90, { vy: -22, life: 2.4, size: 9, color: '#3d3733' });
      }
    }
    for (const n of this.nodes) {
      if (n.kind !== 'fish') continue;
      if (r() < dt * 0.35 && this.cam.isVisible(n.x, n.y, 60)) {
        this.fx.add(P.Fish, n.x + (r() - 0.5) * 20, n.y, { vx: (r() - 0.5) * 40, vz: 70, life: 0.75, size: 16, icon: '🐟' });
        this.fx.burst(P.Splash, n.x, n.y, 4, { color: '#e8fbff', speed: 30, up: 40, life: 0.5, size: 2 });
      }
    }
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.burn > 0 && r() < dt * 12) this.fx.add(P.Fire, u.x + (r() - 0.5) * 16, u.y - u.hgt * u.size * 0.6, { vy: -24, life: 0.5, size: 5, color: '#ff8a2a' });
      if (u.tool === 'torch' && r() < dt * 4) this.fx.add(P.Ember, u.x + u.facing * u.r * 0.9, u.y - u.hgt * u.size - 10, { vz: 30, life: 0.6, size: 1.4, color: '#ffcf4a' });
      if (u.walk > 0.3 && waterAt(this.w, u.x, u.y) === 1 && r() < dt * 8) this.fx.burst(P.Splash, u.x, u.y, 2, { color: '#d8f6ff', speed: 30, up: 30, life: 0.4, size: 2 });
    }
  }

  // ------------------------------------------------------------------ combat hooks
  hitUnit(u: Unit, dmg: number, from: Unit | null, burn = false) {
    if (u.dead || u.kind === 'porter' || sheltered(this, u)) return;
    u.hp -= dmg;
    u.flash = 0.25;
    if (burn) u.burn = Math.max(u.burn, 3);
    if (from) {
      u.aggro = from.id;
      u.aggroT = 6;
      if (u.wild === 'grazer') u.fear = 4;
      // Hitting a rival makes the whole tribe angry, unless they started it.
      if (from.team === PLAYER && u.team >= 1) {
        const t = this.tribes[u.team - 1];
        // Striking back at raiders or at anyone who attacked us first is fair game.
        if (!u.raid && !((u.fightT ?? 0) > 0)) this.hostileToward(t, 18, 'you attacked them');
        else t.alarm = Math.max(t.alarm, 8);
      }
      if (from.team >= 1 && u.team === PLAYER) from.fightT = 10;
    }
    if (dmg >= 8 && this.cam.isVisible(u.x, u.y, 40)) this.fx.text(u.x + (Math.random() - 0.5) * 10, u.y - u.hgt * u.size - 8, `-${Math.round(dmg)}`, u.team === PLAYER ? '#ff8a80' : '#ffffff');
    if (u.hp <= 0) killUnit(this, u, from);
  }

  onUnitKilled(u: Unit, by: Unit | null) {
    if (u.team === PLAYER) this.logEvent(`death ${u.pet ? 'pet' : u.age < 1 ? 'baby' : u.chief ? 'chief' : 'member'} by ${by ? by.wild ?? 'T' + by.team + (by.raid ? 'raid' : '') : 'burn/other'} order=${u.order.type}`);
    if (u.team === PLAYER && u.kind === 'member') {
      this.stats.deaths++;
      audio.sfx('die');
      if (u.chief) {
        this.chiefT = 40;
        ui.toast('Your Chieftain has fallen! They will return to the hut in 40 seconds.', { icon: '🪶', kind: 'bad', ms: 4000 });
      } else this.notify('death', u.age < 1 ? 'A baby of your tribe was killed!' : 'A member of your tribe has fallen.', '💀', 'bad', 4);
      if (this.members().filter((m) => m.age >= 1).length === 0 && this.chiefT > 0) {
        // The ancestors watch over a wiped-out tribe.
        const H = this.home;
        setTimeout(() => {
          if (this.exited) return;
          for (let i = 0; i < 2; i++) this.spawnMember(PLAYER, H.hut.x + (i - 0.5) * 30, H.hut.y + 56, {});
          ui.toast('Two wanderers have joined your tribe.', { icon: '🧭', kind: 'good' });
        }, 3000);
      }
    } else if (u.pet) {
      ui.toast(`Your pet ${u.design.name} was killed.`, { icon: '🐾', kind: 'bad' });
      this.updatePets();
    } else if (u.team === WILD) {
      if (by?.team === PLAYER) this.stats.kills++;
      const food = u.wild === 'titan' ? 160 : u.wild === 'hunter' ? 22 : 16;
      const meat = this.addNode('carcass', 'meat', u.x, u.y, u.x, u.y + 4, food, food, 0, 0, -1, 90);
      // Hunters who chose this prey butcher it and carry the meat home.
      let i = 0;
      for (const m of this.units) {
        if (m.team !== PLAYER || m.kind !== 'member' || m.dead || m.order.type !== 'attack' || m.order.target !== u.id || m.resume) continue;
        m.order = { type: 'gather', node: meat.id, phase: 'go', t: 0 };
        m.slot = i++;
      }
      if (u.wild === 'titan') {
        this.stats.titans++;
        this.game.banner('Titan slain!', u.design.name);
        this.game.unlock('titan-slayer');
        audio.sfx('roar', { pitch: 0.6 });
      }
    } else if (u.team >= 1 && u.kind === 'member') {
      if (by?.team === PLAYER) this.stats.kills++;
      const t = this.tribes[u.team - 1];
      if (u.chief && t.state === 'active') t.chiefT = 60;
    }
    if (u.carry > 0 && u.kind === 'member') {
      this.addNode('cache', u.carryKind ?? 'fruit', u.x, u.y, u.x, u.y + 4, u.carry, u.carry, 0, 0, -1, 60);
      u.carry = 0;
    }
  }

  private notified = new Map<string, number>();
  /** A toast that is shown at most once every `cooldown` seconds per key. */
  notify(key: string, msg: string, icon: string, kind: 'info' | 'good' | 'bad' = 'info', cooldown = 8) {
    const last = this.notified.get(key);
    if (last !== undefined && this.time - last < cooldown) return;
    this.notified.set(key, this.time);
    ui.toast(msg, { icon, kind });
  }

  // ------------------------------------------------------------------ danger, hints, objective
  /** One-time hints, paced so they never stack up. Urgent hints jump the queue. */
  hint(id: string, text: string, icon = '💡', urgent = false) {
    const s = this.game.state;
    if (!s || !this.game.settings.hints || s.carry['hint:' + id] || this.hintQ.some((q) => q.id === id)) return;
    if (urgent) { this.hintQ.unshift({ id, text, icon }); this.hintCd = Math.min(this.hintCd, 0.8); }
    else this.hintQ.push({ id, text, icon });
  }
  private pumpHints(dt: number) {
    this.hintCd -= dt;
    if (this.hintCd > 0 || !this.hintQ.length || this.concert) return;
    const q = this.hintQ.shift()!;
    this.game.hint(q.id, q.text, q.icon);
    this.hintCd = 8;
  }

  private checkDanger() {
    const H = this.home;
    let threat: Unit | null = null;
    for (const u of this.units) {
      if (u.dead || u.team === PLAYER) continue;
      const hostile = (u.raid) || u.wild === 'titan' || (u.wild === 'hunter' && u.order.type === 'attack');
      if (hostile && dist(u, H) < 520) { threat = u; break; }
    }
    if (threat) {
      this.danger = 6;
      if (!this.dangerOn) {
        this.dangerOn = true;
        if (!this.concert) audio.music('danger');
        audio.sfx('alarm');
        const who = threat.team >= 1 ? `The ${this.tribes[threat.team - 1].name} are raiding` : threat.wild === 'titan' ? 'A Titan is coming' : 'A predator is prowling';
        ui.toast(`${who}! Defend the village!`, { icon: '⚠️', kind: 'bad', ms: 3500 });
        this.hint('raid', 'Your idle members defend automatically. Select All and tap the raiders to strike back.', '🛡️', true);
      }
    } else if (this.dangerOn) {
      this.danger -= 0.5;
      if (this.danger <= 0) {
        this.dangerOn = false;
        if (!this.concert) audio.music(this.resolved >= NUM_TRIBES ? 'victory' : 'tribal');
      }
    }
  }

  private timedHints() {
    const g = this.game;
    if (this.time > 25) this.hint('food-econ', 'Food is your currency: buy members 🥚, build tool huts 🛖, send gifts 🎁 and dress your tribe 👕.', '🍎');
    if (this.time > 55) this.hint('rivals', 'Four rival tribes live nearby. Tap their badges on the right to visit them.', '🗺️');
    if (this.time > 90 && this.toolHuts.every((t) => !t)) this.hint('build', 'Build a tool hut 🛖: instruments win tribes over, weapons and torches defeat them.', '🛖');
    if (this.time > 140 && this.pets().length) this.hint('eggs', 'Your pets lay eggs. Tap the egg basket by the pen with members selected to collect them.', '🥚');
    if (this.time > 200) this.hint('pinch', 'Pinch to zoom, drag to pan. Long-press the ground to select everyone nearby.', '🤏');
  }

  objective(): string {
    if (this.resolved >= NUM_TRIBES) return '🗿 The totem is complete! Found your city.';
    if (this.concert) return `🎶 Win the ${this.concert.tribe.name} over!`;
    if (this.time < 60 && this.stats.gathered < 25) return '🍎 Gather food: select members, then tap a fruit tree';
    return `Win over 🎶 or defeat ⚔️ the rival tribes (${this.resolved}/${NUM_TRIBES})`;
  }

  // ------------------------------------------------------------------ render
  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    renderWorld(this, g, w, hh);
    this.concert?.render(g, w, hh);
  }

  // ------------------------------------------------------------------ debug & test helpers
  debugFood(n = 100) { this.food += n; this.game.state!.usedCheats = true; this.hud.refresh(true); }
  debugResolve(how: 'ally' | 'defeat') {
    const t = this.tribes.find((x) => x.state === 'active');
    if (!t) return;
    this.game.state!.usedCheats = true;
    if (how === 'ally') this.allyTribe(t); else this.defeatTribe(t);
  }
  debugWin() {
    this.game.state!.usedCheats = true;
    for (const t of this.tribes) if (t.state === 'active') this.allyTribe(t);
    setTimeout(() => this.foundCity(), 300);
  }
  castAbilityById(id: string) { const a = this.abilities.find((x) => x.def.id === id); if (a) castAbility(this, a); }
  stopAll() { for (const u of this.selected()) stopUnit(u); }
}
