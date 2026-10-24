// The Space-stage world model: galaxy, ownership, empires, the player's ship and empire,
// progression, and the per-frame simulation. Rendering and UI live elsewhere.
import type { Game } from '../../game/game';
import { RNG } from '../../engine/rng';
import { clamp } from '../../engine/math';
import { audio } from '../../engine/audio';
import { abilitiesFor, ARCHETYPES, type ArchetypeDef } from '../../game/cards';
import { computeStats } from '../../design/registry';
import { generateCreature } from '../../design/generate';
import { speciesName } from '../../game/names';
import type { Design, Stats } from '../../design/types';
import { Galaxy } from './galaxy';
import { BADGES, DRIVE_RANGE, ECO_ROW, PERK_DISCOUNT, RANKS, SCAN_ENERGY, SPICE_COLORS, TOOL_MAP, TOOLS, tScoreOf, type ToolDef } from './data';
import type { Empire, GEvent, Mission, Planet, PlanetState, SpaceSave, Specimen, Star } from './types';
import { createEmpires, empireTick, relation } from './empires';
import { colonyTick, ecoDriftTick, routeTick } from './economy';
import { zooTick } from './xenolab';
import { initMarket, marketTick, type MarketNews } from './market';
import { eventsTick } from './events';
import { checkMainMissions, missionsTick, startTutorial } from './missions';

export interface WorldHooks {
  toast(msg: string, icon?: string, kind?: 'info' | 'good' | 'bad' | 'gold'): void;
  ownerChanged(star: number): void;
  firstContact(e: Empire): void;
  tribute(e: Empire, amount: number): void;
  takeoverOffer(e: Empire, star: number, price: number): void;
  eventStarted(ev: GEvent): void;
  eventEnded(ev: GEvent, success: boolean): void;
  rankUp(rank: number): void;
  missionDone(m: Mission): void;
  changed(): void;
  /** Several items at once: shown as one itemised card. */
  loot?(title: string, items: { icon: string; text: string }[], icon?: string): void;
  /** You now hold a blueprint and every component it lists. */
  blueprintReady?(toolId: string): void;
  /** A headline ran on the Spice Exchange. */
  marketNews?(n: MarketNews): void;
}

const CARGO_CAP = [0, 20, 35, 60, 99];
const CELL_MULT = [0, 1, 1.5, 2, 3];
const HULL_MULT = [0, 1, 1.5, 2.2, 3];

export class World {
  game: Game;
  gal: Galaxy;
  s!: SpaceSave;
  empires: Empire[] = [];
  emap = new Map<string, Empire>();
  hooks: WorldHooks | null = null;
  perks = new Set<string>();
  arch: ArchetypeDef | null = null;
  shipStats: Stats = {};
  /** Generated (default) owners; the save stores overrides. */
  genOwner = new Map<number, string>();
  private ownerIdx = new Map<string, Set<number>>();
  private tick1 = 0;
  private tick05 = 0;
  private designCache = new Map<number, Design>();
  /** Set while the player is inside a system with hostiles (UI uses it). */
  inCombat = false;
  /** True while warping between stars (no recharging). */
  inWarp = false;
  /** "star:idx" of the world the ship has landed on, if any. */
  onSurface: string | null = null;
  /** The event whose minigame is open: its clock waits. */
  focusEvent: number | null = null;
  /** Set by the system view: the star the player currently flies in. */
  dirtyTerritory = true;
  rankCache = -1;

  constructor(game: Game, saved?: SpaceSave | null) {
    this.game = game;
    const st = game.state!;
    this.gal = new Galaxy(st.seed);
    for (const a of abilitiesFor(st.cards, 'space')) this.perks.add(a.id);
    this.arch = st.archetype ? ARCHETYPES[st.archetype] : ARCHETYPES.drifter;
    this.pickHome(saved?.homeStar);
    createEmpires(this);
    for (const s of this.gal.stars) if (s.hollow) this.genOwner.set(s.id, 'hollow');
    this.genOwner.set(this.gal.homeStar, 'player');
    if (saved && saved.v === 1) this.restore(saved);
    else this.fresh();
    this.rebuildOwnerIndex();
    this.refreshShipStats();
    this.rankCache = this.rank();
  }

  // ------------------------------------------------------------------ setup
  private pickHome(saved?: number) {
    if (saved !== undefined && this.gal.stars[saved]) { this.gal.setHome(saved); return; }
    const r = this.game.rng('space-home');
    const R = 1000;
    const cands = this.gal.stars.filter((s) => s.type === 'yellow' && !s.hollow && s.arm >= 0 && s.r > R * 0.74 && s.r < R * 0.93 && this.gal.within(s.id, 85).length >= 3);
    const pick = cands.length ? r.pick(cands) : this.gal.stars.find((s) => s.type === 'yellow' && !s.hollow)!;
    this.gal.setHome(pick.id);
  }

  private fresh() {
    const home = this.gal.homeStar;
    this.s = {
      v: 1, t: 0, money: 100000, hp: 1, energy: 1, loc: home, shipX: 0, shipY: 0,
      tools: { colonypack: 0, repair: 1, recharge: 1, seeds: 0 },
      spice: { red: 0, yellow: 0, blue: 0, green: 0, pink: 0, purple: 0 },
      specimens: [], owners: {}, planets: {}, visited: [home], empires: {}, counters: {},
      missions: [], offers: {}, nextId: 1, events: [], flags: { tut: 0 }, powerCd: 0, tradeEarned: 0,
      homeStar: home, knownTwins: [],
    };
    // Spawn the ship beside the homeworld.
    const hp = this.gal.planets(home)[1];
    const pos = this.planetPos(hp, 0);
    this.s.shipX = pos.x + hp.size + 70;
    this.s.shipY = pos.y;
    this.refreshShipStats();
    this.s.hp = this.maxHp;
    this.s.energy = this.maxEnergy;
    this.ps(home, 1);
    this.s.market = initMarket();
    startTutorial(this);
  }

  private restore(saved: SpaceSave) {
    this.s = saved;
    // Fill in fields added later.
    this.s.offers ??= {};
    this.s.market ??= initMarket();
    this.s.knownTwins ??= [];
    this.s.counters ??= {};
    for (const e of this.empires) {
      const es = saved.empires[e.id];
      if (es) Object.assign(e, es);
    }
  }

  serialize(): SpaceSave {
    for (const e of this.empires) {
      this.s.empires[e.id] = {
        met: e.met, war: e.war, allied: e.allied, mods: e.mods, demand: e.demand, route: e.route, takeover: e.takeover,
        expandT: e.expandT, moodT: e.moodT, serenade: e.serenade, dead: e.dead, mult: e.mult, lastBeacon: e.lastBeacon, tributeAsked: e.tributeAsked, offered: e.offered,
      };
    }
    return this.s;
  }

  // ------------------------------------------------------------------ ownership
  ownerOf(star: number): string | null {
    const o = this.s?.owners[star];
    if (o !== undefined) return o;
    return this.genOwner.get(star) ?? null;
  }
  setOwner(star: number, owner: string | null) {
    const old = this.ownerOf(star);
    if (old === owner) return;
    this.s.owners[star] = owner;
    if (old) this.ownerIdx.get(old)?.delete(star);
    if (owner) {
      let set = this.ownerIdx.get(owner);
      if (!set) this.ownerIdx.set(owner, (set = new Set()));
      set.add(star);
    }
    this.dirtyTerritory = true;
    this.hooks?.ownerChanged(star);
    if (owner === 'player' && this.starsOf('player').length >= 10) this.game.unlock('empire');
  }
  rebuildOwnerIndex() {
    this.ownerIdx.clear();
    for (const s of this.gal.stars) {
      const o = this.ownerOf(s.id);
      if (!o) continue;
      let set = this.ownerIdx.get(o);
      if (!set) this.ownerIdx.set(o, (set = new Set()));
      set.add(s.id);
    }
    this.dirtyTerritory = true;
  }
  starsOf(owner: string): number[] {
    return [...(this.ownerIdx.get(owner) ?? [])];
  }
  countStars(owner: string): number {
    return this.ownerIdx.get(owner)?.size ?? 0;
  }
  /** At a system that recharges your energy: one you hold, or an ally's. */
  atDock(star = this.s.loc): boolean {
    if (this.inWarp) return false;
    return this.ownerOf(star) === 'player' || !!this.empireOf(star)?.allied;
  }
  empireOf(star: number): Empire | null {
    const o = this.ownerOf(star);
    return o && o !== 'player' ? this.emap.get(o) ?? null : null;
  }

  // ------------------------------------------------------------------ planets
  star(id: number): Star { return this.gal.stars[id]; }
  planet(star: number, idx: number): Planet { return this.gal.planets(star)[idx]; }
  pkey(star: number, idx: number) { return star + ':' + idx; }
  hasPS(star: number, idx: number) { return !!this.s.planets[this.pkey(star, idx)]; }

  /** Mutable planet state (created from defaults on first access). */
  ps(star: number, idx: number): PlanetState {
    const k = this.pkey(star, idx);
    let p = this.s.planets[k];
    if (!p) {
      p = this.defaultPS(star, idx);
      this.s.planets[k] = p;
    }
    return p;
  }

  /** Read-only view without creating saved state. */
  peekPS(star: number, idx: number): PlanetState {
    return this.s.planets[this.pkey(star, idx)] ?? this.defaultPS(star, idx);
  }

  private defaultPS(star: number, idx: number): PlanetState {
    const pl = this.planet(star, idx);
    const ps: PlanetState = { atm: pl.atm, temp: pl.temp, eco: new Array(12).fill(null), cities: 0, bld: { factory: 0, leisure: 0, turret: 0 }, stored: 0 };
    const nt = pl.kind === 'gas' ? 0 : tScoreOf(pl.atm, pl.temp);
    if (pl.life) {
      const natives = this.natives(pl);
      for (let i = 0; i < nt * 4 && i < natives.length; i++) ps.eco[i] = natives[i];
    } else if (nt > 0) {
      // Lifeless but habitable worlds still have a little native life to stay stable.
      const natives = this.natives(pl);
      for (let i = 0; i < nt * 4 && i < natives.length; i++) ps.eco[i] = natives[i];
    }
    const owner = this.genOwner.get(star) ?? null;
    if (star === this.gal.homeStar) {
      if (idx === 1) { ps.owner = 'player'; ps.cities = 3; ps.bld = { factory: 3, leisure: 3, turret: 2 }; ps.orbTurret = true; }
    } else if (owner && owner !== 'player' && idx === this.gal.colonyIdx(star)) {
      ps.owner = owner;
      ps.cities = pl.feature === 'empire-home' ? 3 : owner === 'hollow' ? 2 : 1;
      ps.def = 300 * ps.cities;
      ps.cityHp = 450;
    }
    return ps;
  }

  /** Native species of a living world: rows × [plant, plant, herb, pred]. */
  natives(pl: Planet): Specimen[] {
    const r = new RNG(pl.seed ^ 0x5eed);
    const out: Specimen[] = [];
    for (let row = 0; row < 3; row++) {
      for (const k of ECO_ROW) {
        const seed = r.seedInt();
        const nr = new RNG(seed);
        const diet = k === 'plant' ? 'plant' : k === 'herb' ? 'herbivore' : r.chance(0.3) ? 'omnivore' : 'carnivore';
        out.push({ seed, name: k === 'plant' ? plantName(nr) : speciesName(nr), diet });
      }
    }
    return out;
  }

  /** Creature design for a specimen (cached). */
  specimenDesign(sp: Specimen): Design | null {
    if (sp.diet === 'plant') return null;
    if (sp.design) return sp.design;
    let d = this.designCache.get(sp.seed);
    if (!d) {
      d = generateCreature(new RNG(sp.seed), { level: 2, diet: sp.diet, name: sp.name });
      this.designCache.set(sp.seed, d);
    }
    return d;
  }

  tscore(star: number, idx: number): number {
    const pl = this.planet(star, idx);
    if (pl.kind === 'gas') return 0;
    const ps = this.peekPS(star, idx);
    if (ps.destroyed) return 0;
    return tScoreOf(ps.atm, ps.temp);
  }

  /** Number of complete ecosystem rows, counted from T1 upward. */
  ecoRows(ps: PlanetState): number {
    let rows = 0;
    for (let row = 0; row < 3; row++) {
      if (ps.eco.slice(row * 4, row * 4 + 4).every((x) => x)) rows++;
      else break;
    }
    return rows;
  }

  /** Planet position in system space at world time t. */
  planetPos(pl: Planet, t = this.s?.t ?? 0): { x: number; y: number } {
    const a = pl.phase + pl.speed * t;
    return { x: Math.cos(a) * pl.orbit, y: Math.sin(a) * pl.orbit };
  }

  /** Every player colony as [star, idx]. */
  colonies(): [number, number][] {
    const out: [number, number][] = [];
    for (const [k, p] of Object.entries(this.s.planets)) {
      if (p.owner === 'player' && !p.destroyed) {
        const [a, b] = k.split(':').map(Number);
        out.push([a, b]);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ ship & tools
  get maxHp(): number {
    const base = this.game.diff(1500, 1000, 650);
    return Math.round(base * HULL_MULT[this.groupLevel('hull', 1)] * (this.perks.has('iron-hull') ? 1.5 : 1) * (1 + (this.shipStats.armor ?? 0) * 0.03));
  }
  get maxEnergy(): number {
    return Math.round(100 * CELL_MULT[this.groupLevel('cell', 1)] * (this.perks.has('overcharge') ? 1.5 : 1) * (1 + (this.shipStats.energy ?? 0) * 0.03));
  }
  get cargoCap(): number { return CARGO_CAP[this.groupLevel('cargo', 1)]; }
  get cargoUsed(): number {
    let n = this.s.specimens.length;
    for (const c of SPICE_COLORS) n += this.s.spice[c];
    return n;
  }
  get driveLevel(): number { return this.groupLevel('drive', 1); }
  get driveRange(): number { return DRIVE_RANGE[this.driveLevel]; }
  rangeFrom(star: number): number { return this.gal.rangeFrom(star, this.driveRange); }
  get laserLevel(): number { return this.groupLevel('laser', 1); }
  get missileLevel(): number { return this.groupLevel('missile', 1); }
  get pulseLevel(): number { return this.groupLevel('pulse', 0); }
  get speedMult(): number { return 1 + (this.shipStats.move ?? 0) * 0.04; }
  get damageMult(): number { return 1 + (this.shipStats.power ?? 0) * 0.04; }

  groupLevel(group: string, base: number): number {
    let lv = base;
    for (const t of TOOLS) if (t.group === group && (this.s?.tools[t.id] ?? 0) > 0) lv = Math.max(lv, t.level ?? 0);
    return lv;
  }
  has(id: string): boolean { return (this.s.tools[id] ?? 0) > 0; }
  count(id: string): number { return this.s.tools[id] ?? 0; }
  use(id: string, n = 1): boolean {
    if ((this.s.tools[id] ?? 0) < n) return false;
    this.s.tools[id] -= n;
    this.hooks?.changed();
    return true;
  }
  give(id: string, n = 1) {
    const def = TOOL_MAP[id];
    const max = def?.max ?? 99;
    this.s.tools[id] = Math.min(def?.kind === 'consumable' ? max : 1, (this.s.tools[id] ?? 0) + n);
    this.hooks?.changed();
  }

  refreshShipStats() {
    const d = this.game.state?.designs.ship;
    this.shipStats = d ? computeStats(d) : {};
    if (this.s) {
      this.s.hp = Math.min(this.s.hp, this.maxHp);
      this.s.energy = Math.min(this.s.energy, this.maxEnergy);
    }
  }

  /** Price after the archetype-free card discounts. */
  toolPrice(t: ToolDef, seller: 'own' | 'ally'): number {
    let p = t.price;
    for (const [perk, cats] of Object.entries(PERK_DISCOUNT)) if (this.perks.has(perk) && cats.includes(t.cat)) p *= 0.8;
    if (seller === 'ally') p *= 0.9;
    return Math.round(p / 100) * 100;
  }

  /** Pay for `n` scans (⚡1 each). Says why not when the cells run dry. */
  spendScan(n = 1): boolean {
    const cost = SCAN_ENERGY * n;
    if (this.s.energy < cost) {
      this.hooks?.toast(`Not enough energy to scan: it takes ⚡${cost}${n > 1 ? ` for ${n} worlds` : ''}. Recharge at a friendly dock or use an Energy Pack.`, '⚡', 'bad');
      audio.sfx('error');
      return false;
    }
    this.s.energy -= cost;
    return true;
  }

  addMoney(n: number) {
    this.s.money = clamp(Math.round(this.s.money + n), 0, 99999999);
    this.hooks?.changed();
  }

  // ------------------------------------------------------------------ progression
  counter(key: string, d = 1): number {
    const c = this.s.counters;
    c[key] = (c[key] ?? 0) + d;
    this.game.stat('space-' + key, d);
    return c[key];
  }
  badgeLevel(id: string): number {
    const b = BADGES.find((x) => x.id === id)!;
    const v = this.s.counters[b.counter] ?? 0;
    let lv = 0;
    for (const t of b.levels) if (v >= t) lv++;
    return lv;
  }
  badgePoints(): number {
    let pts = 0;
    for (const b of BADGES) { const lv = this.badgeLevel(b.id); pts += (lv * (lv + 1)) / 2; }
    return pts + Number(this.s.flags.bonusPts ?? 0);
  }
  rank(): number {
    if (!this.s.flags.tutDone) return 0;
    const pts = this.badgePoints();
    let r = 1;
    for (let i = 1; i < RANKS.length; i++) if (pts >= RANKS[i].pts) r = i;
    return r;
  }
  nextRankPts(): number | null {
    const r = this.rank();
    return r + 1 < RANKS.length ? RANKS[r + 1].pts : null;
  }

  visit(star: number) {
    if (!this.s.visited.includes(star)) {
      this.s.visited.push(star);
      const n = this.counter('visited');
      if (n >= 40) this.game.unlock('explorer');
    }
  }
  visited(star: number): boolean { return this.s.visited.includes(star); }
  /** How many of a system's planets the player has scanned, landed on or settled. */
  surveyed(star: number): { done: number; total: number } {
    const pls = this.gal.planets(star);
    let done = 0;
    for (const p of pls) {
      const ps = this.s.planets[this.pkey(star, p.idx)];
      if (ps && (ps.scanned || ps.landed || ps.owner === 'player')) done++;
    }
    return { done, total: pls.length };
  }
  /** A planet counts as explored once scanned, landed on or settled by the player. */
  explored(star: number, idx: number): boolean {
    const ps = this.s.planets[this.pkey(star, idx)];
    return !!ps && (!!ps.scanned || !!ps.landed || ps.owner === 'player');
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    const s = this.s;
    s.t += dt;
    if (s.powerCd > 0) s.powerCd = Math.max(0, s.powerCd - dt);
    // Energy only recharges at a friendly dock: your homeworld and colonies, or an ally's systems.
    const own = this.ownerOf(s.loc) === 'player' && !this.inWarp;
    if (this.atDock() && !this.inCombat) s.energy = Math.min(this.maxEnergy, s.energy + 12 * dt);
    if (own && !this.inCombat) s.hp = Math.min(this.maxHp, s.hp + this.maxHp * 0.08 * dt);
    this.tick05 += dt;
    if (this.tick05 >= 0.5) {
      ecoDriftTick(this, this.tick05);
      this.tick05 = 0;
    }
    this.tick1 += dt;
    if (this.tick1 >= 1) {
      const d = this.tick1;
      this.tick1 = 0;
      colonyTick(this, d);
      zooTick(this, d);
      routeTick(this, d);
      marketTick(this, d);
      for (const e of this.empires) empireTick(this, e, d);
      eventsTick(this, d);
      missionsTick(this, d);
      const rk = this.rank();
      if (rk !== this.rankCache) {
        const up = rk > this.rankCache;
        this.rankCache = rk;
        if (up) this.hooks?.rankUp(rk);
        checkMainMissions(this);
      }
    }
  }

  /** Relation shortcut used by UI. */
  rel(e: Empire): number { return relation(e); }

  nid(): number { return this.s.nextId++; }
}

function plantName(r: RNG): string {
  const a = ['Glow', 'Puff', 'Spire', 'Fan', 'Bulb', 'Frond', 'Coil', 'Bell', 'Thorn', 'Moss', 'Plume', 'Cap'];
  const b = ['weed', 'wort', 'bloom', 'reed', 'tree', 'shrub', 'vine', 'grass', 'palm', 'cane'];
  return r.pick(a) + r.pick(b);
}
