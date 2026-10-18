// The tide pool simulation: an endless pool streamed around the player. Food, NPC cells, poison
// clouds and meteor shards spawn in a ring just outside the view and despawn far away, so the
// active population stays small (good for phones) while the pool feels infinite.
import type { SfxName } from '../../engine/audio';
import { makeNoise2D, RNG, uid } from '../../engine/rng';
import { clamp, TAU, turnToward, wrapAngle } from '../../engine/math';
import { designDiet, getPart, partsFor } from '../../design/registry';
import { generateCell } from '../../design/generate';
import { wildPool } from '../../game/codex';
import { shade } from '../../design/color';
import type { Design, Diet, PartDef } from '../../design/types';
import { computeAbilities, swimSpeed } from './abilities';
import { FOOD_DNA, LEVEL_SCALE, sizeClass, type SizeClass, type Tuning } from './config';
import { bodyR, bodyX, bodyY, makeCell, makeFood, mouthPos, type Cell, type Food, type FoodKind, type Mate, type Puff, type Shard } from './entities';
import type { Fx } from './fx';
import { npcSteer } from './ai';
import { electricPulse, resolveContacts, updatePoison } from './combat';

export interface WorldHost {
  tune: Tuning;
  fx: Fx;
  playerEats(kind: FoodKind, value: number, x: number, y: number, food: Food | null): void;
  playerHurt(amount: number, src: Cell | null, how: string): void;
  npcKilled(c: Cell, byPlayer: boolean, how: string): void;
  collectShard(s: Shard): void;
  lockedParts(): string[];
  wrongFood(kind: FoodKind): void;
  sfxAt(name: SfxName, x: number, y: number, opts?: { pitch?: number; vol?: number }): void;
}

type SpawnKind = 'prey' | 'peer' | 'predator' | 'giant' | 'brood';

const MAX_NPCS = 24;
const MAX_PUFFS = 130;

export class World {
  npcs: Cell[] = [];
  foods: Food[] = [];
  puffs: Puff[] = [];
  shards: Shard[] = [];
  mate: Mate | null = null;
  level = 0;
  /** Spawn scale for the current level. */
  S = 1;
  /** Half-diagonal of the view in world units (set by the stage each frame). */
  viewR = 340;
  t = 0;
  hidden = false;
  /** Opening grace period: nothing hunts the newborn player yet. */
  graceT = 25;
  /** While > 0 every NPC scatters away from the player (finale). */
  scatterT = 0;
  private noise: ReturnType<typeof makeNoise2D>;
  private pools: Record<Diet, Design[]>[] = [];
  private giants: Design[] = [];
  private broods: Design[] = [];
  private spawnT = 0;
  private giantCd = 0;
  private contacts: Cell[] = [];
  private flowOut = { x: 0, y: 0 };
  private wrongT = 0;

  constructor(readonly host: WorldHost, readonly rng: RNG, public player: Cell, seed: number) {
    this.noise = makeNoise2D(seed ^ 0x51ab);
    this.buildPools(seed);
  }

  // ------------------------------------------------------------------ designs

  private buildPools(seed: number) {
    const r = this.rng;
    for (let tier = 1; tier <= 3; tier++) {
      const pool: Record<Diet, Design[]> = { herbivore: [], carnivore: [], omnivore: [] };
      for (const d of wildPool('cell', 12, (seed + tier * 7919) >>> 0, tier)) {
        if (d.kind !== 'cell' || d.spine.length === 0) continue;
        const diet = designDiet(d);
        if (!diet) continue;
        if (!d.meta?.author) this.decorate(d, tier);
        pool[diet].push(d);
      }
      for (const diet of ['herbivore', 'carnivore', 'omnivore'] as Diet[]) {
        while (pool[diet].length < 3) {
          const d = generateCell(r, diet, tier);
          this.decorate(d, tier);
          pool[diet].push(d);
        }
      }
      this.pools.push(pool);
    }
    for (let i = 0; i < 3; i++) {
      const d = generateCell(r, r.chance(0.75) ? 'carnivore' : 'omnivore', 3);
      this.decorate(d, 3, true);
      d.colors.base = shade(d.colors.base, -0.25);
      d.colors.coat = shade(d.colors.coat, -0.2);
      this.giants.push(d);
    }
    for (let i = 0; i < 2; i++) {
      const d = generateCell(r, 'herbivore', 2);
      for (const n of d.spine) n.r = Math.round(n.r * 1.3);
      this.decorate(d, 2);
      d.meta = { ...(d.meta ?? {}), brood: true };
      this.broods.push(d);
    }
  }

  /** Add a few extra parts by category so NPCs show off the whole (growing) catalog. */
  private decorate(d: Design, tier: number, giant = false) {
    const r = this.rng;
    const sp = d.spine;
    const head = sp.length - 1;
    const add = (p: PartDef, scale = 1) => {
      let node: number, a: number;
      if (p.snap === 'head-front') { node = head; a = 0; }
      else if (p.snap === 'back') { node = 0; a = Math.PI + r.range(-0.5, 0.5); }
      else { node = r.int(1, Math.max(1, head - 1)); a = (r.chance(0.5) ? 1 : -1) * r.range(0.9, 2.2); }
      const n = sp[node];
      d.parts.push({ uid: uid(), partId: p.id, node, ox: Math.cos(a) * n.r * 0.92, oy: Math.sin(a) * n.r * 0.92, rot: a, scale, sym: Math.abs(Math.sin(a)) > 0.15 });
    };
    const pick = (cat: 'cell-move' | 'cell-weapon' | 'cell-eye', minTier: number) => {
      const list = partsFor('cell', cat).filter((p) => p.tier <= tier && p.tier >= minTier);
      return list.length ? r.pick(list) : null;
    };
    if (r.chance(0.2 + tier * 0.12)) { const p = pick('cell-move', 2); if (p) add(p); }
    if (r.chance(0.12 + tier * 0.12) || giant) { const p = pick('cell-weapon', 1); if (p) add(p); }
    if (giant) {
      const spike = partsFor('cell', 'cell-weapon').find((p) => (p.stats.charge ?? 0) > 0);
      if (spike) { add(spike, 1.3); add(spike, 1.2); }
      for (const pi of d.parts) if (getPart(pi.partId)?.category === 'cell-mouth') pi.scale = 1.35;
    }
    if (r.chance(0.25)) { const p = pick('cell-eye', 1); if (p) add(p); }
    if (d.parts.length > 12) d.parts.length = 12;
  }

  /** Big designs for the blurred parallax layers. */
  backgroundDesigns(): Design[] {
    return [...this.giants, ...this.pools[2].carnivore, ...this.pools[2].herbivore, ...this.broods];
  }

  private tierFor(level: number): number {
    return level < 1 ? 1 : level < 3 ? 2 : 3;
  }

  // ------------------------------------------------------------------ helpers

  playerHidden(): boolean {
    return this.hidden || this.player.dead;
  }

  /** Cells that can touch each other this frame. */
  contactList(): Cell[] {
    return this.contacts;
  }

  flow(x: number, y: number): { x: number; y: number } {
    const f = 0.0011 / this.player.size;
    const a = this.noise.noise(x * f + this.t * 0.015, y * f) * TAU * 1.3;
    const m = (0.55 + 0.45 * this.noise.noise(x * f * 0.7 + 40, y * f * 0.7 - this.t * 0.01)) * 13 * this.player.size;
    this.flowOut.x = Math.cos(a) * m;
    this.flowOut.y = Math.sin(a) * m;
    return this.flowOut;
  }

  classOf(c: Cell): SizeClass {
    return sizeClass(c.size / this.player.size, c.giant);
  }

  /** Swim speed cap for any cell. NPC speeds are relative to a reference player speed, so upgrades help escape. */
  maxSpeed(c: Cell): number {
    const p = this.player;
    if (c === p) return swimSpeed(c.ab) * c.size;
    const cls = this.classOf(c);
    const f = cls === 'prey' ? 0.62 : cls === 'peer' ? 0.84 : cls === 'predator' ? 0.86 : 0.58;
    const ref = swimSpeed({ speed: 1.5 } as Cell['ab']) * p.size;
    const brood = c.brood ? 0.6 : 1;
    return ref * f * (0.86 + 0.07 * Math.min(3, c.ab.speed)) * this.host.tune.npcSpeed * brood;
  }

  private ringPos(minK: number, maxK: number): { x: number; y: number } {
    const a = this.rng.range(0, TAU), d = this.viewR * this.rng.range(minK, maxK);
    return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
  }

  // ------------------------------------------------------------------ spawning

  spawnNpc(kind: SpawnKind, opts: { x?: number; y?: number; emerge?: boolean; near?: boolean } = {}): Cell | null {
    if (this.npcs.length >= MAX_NPCS + (kind === 'giant' ? 2 : 0)) {
      // Make room by retiring a leftover speck from an earlier level, if there is one.
      const p = this.player;
      const speck = this.npcs.find((n) => !n.dead && n.size < p.size * 0.3);
      if (!speck) return null;
      speck.dead = true;
    }
    const r = this.rng;
    const S = this.S;
    const tier = this.tierFor(this.level);
    let design: Design;
    let size: number;
    let diet: Diet;
    if (kind === 'giant') {
      design = r.pick(this.giants);
      size = S * r.range(3.7, 4.6);
    } else if (kind === 'brood') {
      design = r.pick(this.broods);
      size = S * r.range(1.6, 2.0);
    } else {
      const wD: Record<SpawnKind, [number, number, number]> = {
        prey: [0.72, 0.18, 0.1], peer: [0.48, 0.32, 0.2], predator: [0.15, 0.68, 0.17], giant: [0, 1, 0], brood: [1, 0, 0],
      };
      const [h, c] = wD[kind];
      const roll = r.next();
      diet = roll < h ? 'herbivore' : roll < h + c ? 'carnivore' : 'omnivore';
      const pool = this.pools[Math.max(0, Math.min(2, tier - 1 + (kind === 'predator' ? 1 : 0)))][diet];
      design = r.pick(pool);
      size = S * (kind === 'prey' ? r.range(0.38, 0.62) : kind === 'peer' ? r.range(0.82, 1.22) : r.range(1.6, 2.3));
    }
    diet = designDiet(design) ?? 'herbivore';
    const pos = opts.x !== undefined ? { x: opts.x, y: opts.y! } : opts.near ? this.ringPos(0.45, 0.9) : this.ringPos(1.05, 1.5);
    const ab = computeAbilities(design);
    const c = makeCell(design, ab, diet, pos.x, pos.y, size, true);
    c.giant = kind === 'giant';
    c.brood = kind === 'brood';
    c.maxHp = c.hp = (c.giant ? 20 : 6) * this.host.tune.npcHp;
    c.emerge = opts.emerge ? 0 : 1;
    if (opts.near) c.calmT = 5;
    if (c.giant) c.calmT = 3;
    // Golden-star carriers drop the part they carry when defeated.
    const locked = this.host.lockedParts();
    if (!c.giant && locked.length && this.npcs.filter((n) => n.carries).length < 2 && kind !== 'predator') {
      const has = design.parts.map((pi) => pi.partId).find((id) => locked.includes(id));
      if (has && r.chance(0.6)) c.carries = has;
    }
    this.npcs.push(c);
    return c;
  }

  spawnFood(kind: FoodKind, x: number, y: number, big = false): Food {
    const S = this.S;
    let f: Food;
    if (kind === 'plant') {
      f = big ? makeFood('plant', x, y, 7.2 * S, FOOD_DNA.bigPlant, 3) : makeFood('plant', x, y, 5.4 * S * this.rng.range(0.85, 1.15), FOOD_DNA.plant, this.rng.int(0, 2));
    } else if (kind === 'meat') {
      f = makeFood('meat', x, y, (big ? 7 : 5.6) * S, big ? FOOD_DNA.bigMeat : FOOD_DNA.meat, this.rng.int(0, 2));
    } else {
      f = makeFood('egg', x, y, 5.4 * S, FOOD_DNA.egg, 0);
    }
    this.foods.push(f);
    return f;
  }

  private spawnCluster(x: number, y: number) {
    const S = this.S;
    const center = makeFood('plant', x, y, 13 * S, 2, 3);
    center.cluster = 1;
    center.spin = 0.12;
    this.foods.push(center);
    const n = this.rng.int(4, 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.rng.range(-0.3, 0.3), d = 22 * S * this.rng.range(1.2, 2.2);
      this.spawnFood('plant', x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
  }

  spawnShard(near: boolean, partId: string | null = null, x?: number, y?: number): Shard {
    const pos = x !== undefined ? { x, y: y! } : near ? this.ringPos(0.35, 0.6) : this.ringPos(1.1, 1.6);
    const s: Shard = { x: pos.x, y: pos.y, r: 9 * this.S, t: 0, partId, dead: false, vx: 0, vy: 0 };
    this.shards.push(s);
    return s;
  }

  /** Fill the pool on stage start or after loading. */
  populate() {
    this.npcs.length = 0;
    this.foods.length = 0;
    this.puffs.length = 0;
    const R = this.viewR;
    const place = () => {
      const a = this.rng.range(0, TAU), d = R * Math.sqrt(this.rng.range(0.04, 1)) * 1.5;
      return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
    };
    const t = this.targets();
    for (let i = 0; i < t.plants; i++) { const p = place(); this.spawnFood('plant', p.x, p.y, this.level >= 1 && this.rng.chance(0.15)); }
    for (let i = 0; i < t.meat; i++) { const p = place(); this.spawnFood('meat', p.x, p.y); }
    for (let i = 0; i < t.clusters; i++) { const p = place(); this.spawnCluster(p.x, p.y); }
    for (const [k, n] of [['prey', t.prey], ['peer', t.peer], ['predator', t.predator], ['brood', t.brood]] as [SpawnKind, number][]) {
      for (let i = 0; i < n; i++) {
        let p = place();
        // Keep hunters out of the opening view.
        if (k === 'predator') p = this.ringPos(1.1, 1.6);
        this.spawnNpc(k, { x: p.x, y: p.y });
      }
    }
    this.giantCd = 40;
  }

  private targets() {
    const L = this.level, tune = this.host.tune;
    return {
      plants: Math.round((26 + L * 2) * tune.foodMul),
      meat: Math.round((8 + L) * tune.foodMul),
      clusters: L >= 1 ? 2 : 0,
      prey: 8,
      peer: 7,
      predator: (L === 0 ? Math.max(1, tune.predators - 1) : tune.predators) + (L >= 3 ? 1 : 0),
      giant: L >= (tune.giants >= 2 ? 1 : 2) ? tune.giants : 0,
      brood: L >= 2 ? 1 : 0,
    };
  }

  /** After a growth spurt: a fresh bloom of food and new neighbours at the new scale, around the (now wider) view. */
  refill() {
    const t = this.targets();
    const p = this.player;
    const R = this.viewR;
    const tiny = 2.6 * this.S;
    let plants = 0, meat = 0;
    for (const f of this.foods) {
      if (f.dead || f.cluster || f.r < tiny) continue;
      if (f.kind === 'plant') plants++; else if (f.kind === 'meat') meat++;
    }
    const place = () => {
      const a = this.rng.range(0, TAU), d = R * this.rng.range(0.35, 1.4);
      return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
    };
    for (; plants < t.plants; plants++) { const q = place(); this.spawnFood('plant', q.x, q.y, this.rng.chance(0.15)); }
    for (; meat < t.meat; meat++) { const q = place(); this.spawnFood('meat', q.x, q.y); }
    const q = place();
    if (t.clusters) this.spawnCluster(q.x, q.y);
    for (let i = 0; i < 3; i++) this.spawnNpc('prey', { near: true, emerge: true });
    for (let i = 0; i < 2; i++) this.spawnNpc('peer', { near: true, emerge: true });
  }

  /** Called on level up: the world's spawn scale follows the player. */
  setLevel(level: number) {
    const grew = level > this.level;
    this.level = level;
    this.S = LEVEL_SCALE[level];
    if (!grew) return;
    // Morsels sized for the old level dissolve away over a couple of seconds.
    const tiny = 2.6 * this.S;
    for (const f of this.foods) if (f.r < tiny && !f.cluster) f.life = Math.min(f.life, f.age + 1.5 + Math.random() * 2);
  }

  private manageSpawns() {
    const p = this.player;
    const R = this.viewR;
    const far2 = (R * 2.1) ** 2;
    // Despawn far or now-insignificant things.
    for (const c of this.npcs) {
      if (c.dead || !c.despawnable) continue;
      const d2 = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
      const tiny = c.size < p.size * 0.26 && d2 > (R * 1.1) ** 2;
      if (d2 > far2 * (c.giant ? 1.4 : 1) || tiny) {
        c.dead = true;
        if (c.giant) this.giantCd = 30;
      }
    }
    const foodFar2 = (R * 1.9) ** 2;
    const tinyFood = 2.2 * this.S;
    for (const f of this.foods) {
      if (f.dead) continue;
      const d2 = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
      if (d2 > foodFar2 || (f.r < tinyFood && d2 > (R * 1.05) ** 2)) f.dead = true;
    }
    // Spawn deficits (one of each per tick, so arrivals trickle in).
    const t = this.targets();
    let prey = 0, peer = 0, pred = 0, giant = 0, brood = 0;
    for (const c of this.npcs) {
      if (c.dead) continue;
      if (c.brood) { brood++; continue; }
      // Leftover specks from earlier levels don't count as real prey.
      if (c.size < p.size * 0.3) continue;
      const k = this.classOf(c);
      if (k === 'prey') prey++; else if (k === 'peer') peer++; else if (k === 'predator') pred++; else giant++;
    }
    if (prey < t.prey) this.spawnNpc('prey', { emerge: true });
    if (peer < t.peer) this.spawnNpc('peer', { emerge: true });
    if (pred < t.predator) this.spawnNpc('predator', { emerge: true });
    if (brood < t.brood) this.spawnNpc('brood', { emerge: true });
    if (giant < t.giant && this.giantCd <= 0) { this.spawnNpc('giant', { emerge: true }); this.giantCd = 45; }
    let plants = 0, meat = 0, clusters = 0;
    for (const f of this.foods) {
      if (f.dead) continue;
      if (f.cluster) clusters++;
      else if (f.kind === 'plant') plants++;
      else if (f.kind === 'meat') meat++;
    }
    for (let i = 0; i < 3 && plants < t.plants; i++, plants++) { const q = this.ringPos(1.05, 1.55); this.spawnFood('plant', q.x, q.y, this.level >= 1 && this.rng.chance(0.15)); }
    if (meat < t.meat) { const q = this.ringPos(1.05, 1.55); this.spawnFood('meat', q.x, q.y); }
    if (clusters < t.clusters) { const q = this.ringPos(1.1, 1.5); this.spawnCluster(q.x, q.y); }
    // Keep shards findable: pull far-away ones back into the ring.
    for (const s of this.shards) {
      const d2 = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
      if (d2 > (R * 3.2) ** 2) { const q = this.ringPos(1.2, 1.6); s.x = q.x; s.y = q.y; }
      s.r = Math.max(s.r, 9 * this.S);
    }
  }

  // ------------------------------------------------------------------ simulation

  /** Shared swim physics: turn toward the steer vector and thrust with water drag and currents. */
  swim(c: Cell, dt: number) {
    const vmax = this.maxSpeed(c);
    const p = this.player;
    const turn = c === p ? c.ab.turn : c.ab.turn * clamp(Math.pow(p.size / c.size, 0.35), 0.3, 1.3);
    const thr = clamp(c.throttle, 0, 1);
    const want = thr > 0.02 ? Math.atan2(c.steerY, c.steerX) : c.angle;
    if (thr > 0.02) c.angle = turnToward(c.angle, want, turn * dt);
    const diff = wrapAngle(want - c.angle);
    const drag = 2.3;
    let force = thr * vmax * drag * (c.ab.jet > 0 ? 0.74 : 1);
    let tx: number, ty: number;
    if (c.ab.cilia > 0) {
      force *= 0.55 + 0.45 * Math.max(0, Math.cos(diff));
      tx = Math.cos(want) * force; ty = Math.sin(want) * force;
    } else {
      const al = Math.max(0, Math.cos(diff));
      force *= 0.2 + 0.8 * al * al;
      tx = Math.cos(c.angle) * force; ty = Math.sin(c.angle) * force;
    }
    const e = Math.exp(-drag * dt);
    c.vx = c.vx * e + (tx / drag) * (1 - e);
    c.vy = c.vy * e + (ty / drag) * (1 - e);
    // Jet bursts
    if (c.ab.jet > 0 && thr > 0.3) {
      c.jetT -= dt;
      if (c.jetT <= 0) {
        c.jetT = Math.max(0.5, 1.15 - 0.13 * (c.ab.jet - 1));
        const imp = vmax * (0.85 + 0.12 * Math.min(3, c.ab.jet));
        c.vx += Math.cos(c.angle) * imp;
        c.vy += Math.sin(c.angle) * imp;
        const tx2 = c.x - Math.cos(c.angle) * c.ab.tailX * c.size, ty2 = c.y - Math.sin(c.angle) * c.ab.tailX * c.size;
        if ((tx2 - p.x) ** 2 + (ty2 - p.y) ** 2 < (this.viewR * 1.2) ** 2) {
          this.host.fx.bubbles(tx2, ty2, c === p ? 7 : 4, 2.6 * c.size, -Math.cos(c.angle), -Math.sin(c.angle), 70 * c.size);
          if (c === p) this.host.sfxAt('whoosh', c.x, c.y, { vol: 0.35, pitch: 1.5 });
        }
      }
    }
    const f = this.flow(c.x, c.y);
    const cur = c === p ? 0.35 : 0.55;
    c.x += (c.vx + f.x * cur) * dt;
    c.y += (c.vy + f.y * cur) * dt;
    const sp = Math.hypot(c.vx, c.vy);
    c.t += dt * (0.7 + Math.min(1.6, (sp / Math.max(1, vmax)) * 1.4));
  }

  /** Poison trails and electric pulses for any armed cell. */
  private weapons(c: Cell, dt: number) {
    const p = this.player;
    if (c.ab.poison > 0) {
      const sp = Math.hypot(c.vx, c.vy);
      const emits = c === p ? sp > this.maxSpeed(c) * 0.2 : (c.state === 'flee' || c.state === 'hunt') && sp > this.maxSpeed(c) * 0.3;
      if (emits) {
        c.poisonDist += sp * dt;
        const step = bodyR(c) * 0.75;
        if (c.poisonDist > step) {
          c.poisonDist = 0;
          const tx = c.x - Math.cos(c.angle) * c.ab.tailX * c.size * 0.9, ty = c.y - Math.sin(c.angle) * c.ab.tailX * c.size * 0.9;
          const n = c.ab.poison;
          if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
          this.puffs.push({ x: tx, y: ty, r: bodyR(c) * (0.55 + 0.12 * (n - 1)), life: 2.4 + 0.9 * (n - 1), max: 2.4 + 0.9 * (n - 1), owner: c, dead: false });
        }
      }
    }
    if (c.ab.electric > 0) {
      c.elecT -= dt;
      if (c.elecT <= 0) {
        const period = (c === p ? 5.2 : 7) / (1 + 0.38 * (c.ab.electric - 1));
        c.elecT = Math.max(2.2, period);
        if (c === p) { if (!this.playerHidden()) electricPulse(this, c); }
        else {
          // NPCs only discharge when something is close.
          const R = bodyR(c) * 3;
          const near = (o: Cell) => o !== c && o.ab.electric === 0 && (bodyX(o) - bodyX(c)) ** 2 + (bodyY(o) - bodyY(c)) ** 2 < (R + bodyR(o)) ** 2;
          const pNear = !this.playerHidden() && near(p);
          if (pNear || (c.target && (c.target as Cell).ab && near(c.target as Cell))) electricPulse(this, c);
          else c.elecT = 0.8;
        }
      }
    }
  }

  update(dt: number) {
    this.t += dt;
    this.giantCd -= dt;
    this.scatterT -= dt;
    this.wrongT -= dt;
    const p = this.player;
    // Contact list for this frame
    const cl = this.contacts;
    cl.length = 0;
    if (!this.playerHidden()) cl.push(p);
    for (const c of this.npcs) if (!c.dead && c.emerge >= 0.7) cl.push(c);

    for (const c of this.npcs) {
      if (c.dead) continue;
      if (c.emerge < 1) c.emerge = Math.min(1, c.emerge + dt / (c.size > p.size * 1.3 ? 2.6 : 1.1));
      if (c.state !== 'court') npcSteer(this, c, dt);
      this.swim(c, dt);
      this.weapons(c, dt);
      c.flash = Math.max(0, c.flash - dt * 4);
      c.biteAnim = Math.max(0, c.biteAnim - dt * 3);
      c.biteCd -= dt;
      c.ramCd -= dt;
      c.showHpT -= dt;
      // Grazers eat what their mouth reaches.
      if (c.state === 'graze' && c.target) {
        const f = c.target as Food;
        const m = mouthPos(c);
        const rr = f.r + c.ab.radius * c.size * 0.5;
        if (!f.dead && (m.x - f.x) ** 2 + (m.y - f.y) ** 2 < rr * rr) {
          f.dead = true;
          c.biteAnim = 1;
          c.hp = Math.min(c.maxHp, c.hp + 1);
          c.state = 'sated';
          c.stateT = 1 + Math.random() * 2;
        }
      }
      // Brood cells lay clutches of eggs.
      if (c.brood) {
        c.eggT -= dt;
        if (c.eggT <= 0) {
          c.eggT = 18 + Math.random() * 10;
          if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 < (this.viewR * 1.6) ** 2) {
            const bx = c.x - Math.cos(c.angle) * c.ab.tailX * c.size, by = c.y - Math.sin(c.angle) * c.ab.tailX * c.size;
            for (let i = 0; i < 3; i++) {
              const e = this.spawnFood('egg', bx + (Math.random() - 0.5) * 14 * this.S, by + (Math.random() - 0.5) * 14 * this.S);
              e.vx = -Math.cos(c.angle) * 20 * this.S + (Math.random() - 0.5) * 10;
              e.vy = -Math.sin(c.angle) * 20 * this.S + (Math.random() - 0.5) * 10;
            }
            this.host.sfxAt('pop', bx, by, { pitch: 0.7, vol: 0.6 });
          }
        }
      }
    }
    if (!this.playerHidden()) this.weapons(p, dt);

    resolveContacts(this, dt);
    updatePoison(this, dt);

    // Food drift
    for (const f of this.foods) {
      if (f.dead) continue;
      f.age += dt;
      f.pop = Math.min(1, f.pop + dt * 2.5);
      const fl = this.flow(f.x, f.y);
      const e = Math.exp(-1.6 * dt);
      f.vx = f.vx * e + fl.x * 0.9 * (1 - e);
      f.vy = f.vy * e + fl.y * 0.9 * (1 - e);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.spin * dt;
      if (f.age > f.life) f.dead = true;
    }
    // Puffs
    for (const pf of this.puffs) { pf.life -= dt; if (pf.life <= 0) pf.dead = true; }
    // Shards drift and get collected
    for (const s of this.shards) {
      if (s.dead) continue;
      s.t += dt;
      const fl = this.flow(s.x, s.y);
      s.x += fl.x * 0.3 * dt;
      s.y += fl.y * 0.3 * dt;
      if (!this.playerHidden()) {
        const rr = s.r + bodyR(p);
        if ((s.x - bodyX(p)) ** 2 + (s.y - bodyY(p)) ** 2 < rr * rr) {
          s.dead = true;
          this.host.collectShard(s);
        }
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.4; this.manageSpawns(); }
    this.compact();
  }

  private compact() {
    if (this.npcs.some((c) => c.dead)) {
      for (const c of this.npcs) {
        if (c.dead) continue;
        if (c.target && (c.target as Cell).dead) c.target = null;
        if (c.latched?.dead) c.latched = null;
      }
      if (this.player.latched?.dead) this.player.latched = null;
      this.npcs = this.npcs.filter((c) => !c.dead);
    }
    if (this.foods.some((f) => f.dead)) this.foods = this.foods.filter((f) => !f.dead);
    if (this.puffs.length && this.puffs[0].dead) this.puffs = this.puffs.filter((f) => !f.dead);
    if (this.shards.some((s) => s.dead)) this.shards = this.shards.filter((s) => !s.dead);
  }

  /** Player mouth: suction toward the mouth, then eat what fits the diet. */
  playerEat(dt: number) {
    const p = this.player;
    if (this.playerHidden()) return;
    const m = mouthPos(p);
    const pr = bodyR(p);
    const suck = pr * (p.ab.filter > 0 ? 2.6 : 2.0);
    const eatR = pr * 0.6;
    const bx = bodyX(p), by = bodyY(p);
    for (const f of this.foods) {
      if (f.dead || f.pop < 0.6) continue;
      const dx = f.x - m.x, dy = f.y - m.y;
      const d2 = dx * dx + dy * dy;
      const reach = suck + f.r;
      if (d2 > reach * reach && (f.x - bx) ** 2 + (f.y - by) ** 2 > (pr + f.r) ** 2) continue;
      const edible = f.kind === 'egg' ? p.ab.hasMouth : f.kind === 'plant' ? p.ab.eatsPlants : p.ab.eatsMeat;
      const bd2 = (f.x - bx) ** 2 + (f.y - by) ** 2;
      if (!edible) {
        if (bd2 < (pr + f.r) ** 2) {
          const d = Math.sqrt(bd2) || 1;
          f.vx += ((f.x - bx) / d) * 120 * p.size * dt * 8;
          f.vy += ((f.y - by) / d) * 120 * p.size * dt * 8;
          if (this.wrongT <= 0) { this.wrongT = 4; this.host.wrongFood(f.kind); }
        }
        continue;
      }
      const ang = Math.abs(wrapAngle(Math.atan2(f.y - p.y, f.x - p.x) - p.angle));
      if (d2 < (eatR + f.r) ** 2 || (bd2 < (pr + f.r) ** 2 && ang < Math.PI / 2)) {
        f.dead = true;
        p.biteAnim = 1;
        this.host.playerEats(f.kind, f.value, f.x, f.y, f);
        continue;
      }
      if (ang < 1.2) {
        const d = Math.sqrt(d2) || 1;
        const pull = 260 * p.size * (p.ab.filter > 0 ? 1.4 : 1);
        f.vx -= (dx / d) * pull * dt;
        f.vy -= (dy / d) * pull * dt;
      }
    }
  }

  // ------------------------------------------------------------------ deaths

  /** A cell bursts into meat chunks. */
  killNpc(c: Cell, byPlayer: boolean, how: string) {
    if (c.dead) return;
    c.dead = true;
    const cls = this.classOf(c);
    const n = c.giant ? 8 : cls === 'prey' ? 1 : cls === 'peer' ? 3 : 4;
    const bx = bodyX(c), by = bodyY(c), br = bodyR(c);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.6;
      const big = c.size > this.player.size * 1.3;
      const f = makeFood('meat', bx + Math.cos(a) * br * 0.4, by + Math.sin(a) * br * 0.4, clamp(br * 0.3, 3.5 * this.S, 8 * this.S), big ? FOOD_DNA.bigMeat : FOOD_DNA.meat, this.rng.int(0, 2));
      f.vx = Math.cos(a) * 60 * c.size;
      f.vy = Math.sin(a) * 60 * c.size;
      f.pop = 0.6;
      this.foods.push(f);
    }
    const fx = this.host.fx;
    fx.burst(bx, by, 16 + n * 2, c.design.colors.base, 110 * c.size, 2.2 * c.size, 'dot', 0.8);
    fx.burst(bx, by, 8, '#ffffff', 140 * c.size, 1.2 * c.size, 'spark', 0.4);
    fx.ring(bx, by, br * 0.5, br * 2.2, c.design.colors.detail, 0.5, 4);
    fx.bubbles(bx, by, 6, 2.5 * c.size);
    this.host.sfxAt(c.giant ? 'explode' : 'pop', bx, by, { pitch: c.giant ? 1 : 0.6 + Math.random() * 0.2 });
    if (c.carries && byPlayer) this.spawnShard(false, c.carries, bx, by);
    this.host.npcKilled(c, byPlayer, how);
  }

  /** `att` swallows `vic` whole (prey-sized). */
  swallow(att: Cell, vic: Cell) {
    vic.dead = true;
    const bx = bodyX(vic), by = bodyY(vic);
    this.host.fx.burst(bx, by, 10, vic.design.colors.base, 60 * att.size, 1.4 * att.size, 'dot', 0.5);
    if (att === this.player) {
      this.host.playerEats('meat', FOOD_DNA.swallow, bx, by, null);
      this.host.sfxAt('pop', bx, by, { pitch: 0.8 });
      if (vic.carries) this.spawnShard(false, vic.carries, bx, by);
      this.host.npcKilled(vic, true, 'swallow');
    } else {
      att.state = 'sated';
      att.stateT = 3;
      att.hp = Math.min(att.maxHp, att.hp + 2);
      this.host.sfxAt('chomp', bx, by, { vol: 0.5 });
      this.host.npcKilled(vic, false, 'swallow');
    }
  }
}
