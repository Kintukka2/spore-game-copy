// Plain data types for everything that lives in the tide pool.
import type { Design, Diet } from '../../design/types';
import type { CellAbilities } from './abilities';

export type FoodKind = 'plant' | 'meat' | 'egg';

export interface Food {
  kind: FoodKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  value: number;
  rot: number;
  spin: number;
  variant: number;
  /** Seconds alive; meat rots away after a while. */
  age: number;
  life: number;
  dead: boolean;
  /** 0..1 pop-in animation. */
  pop: number;
  /** Part of a big plant cluster (decorative frond). */
  cluster: number;
}

export type NpcState = 'wander' | 'graze' | 'hunt' | 'flee' | 'drain' | 'sated' | 'retaliate' | 'court';

export interface Cell {
  id: number;
  npc: boolean;
  design: Design;
  ab: CellAbilities;
  diet: Diet | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  /** World units per design unit. */
  size: number;
  hp: number;
  maxHp: number;
  /** Animation clock. */
  t: number;
  /** Damage flash 0..1 and its colour. */
  flash: number;
  flashColor: string;
  /** Mouth animation 0..1 (counts down). */
  biteAnim: number;
  biteCd: number;
  ramCd: number;
  elecT: number;
  poisonDist: number;
  jetT: number;
  /** Desired swim direction (unit-ish) and throttle 0..1, set by input or AI. */
  steerX: number;
  steerY: number;
  throttle: number;
  dead: boolean;
  invuln: number;
  // ---- NPC fields
  giant: boolean;
  brood: boolean;
  state: NpcState;
  target: Cell | Food | null;
  stateT: number;
  thinkT: number;
  wander: number;
  /** Seconds spent chasing the player in the current chase. */
  chaseT: number;
  /** Won't start chasing the player until this reaches 0. */
  calmT: number;
  hurtBy: Cell | null;
  hurtT: number;
  /** 0..1 rising-from-the-depths fade-in. */
  emerge: number;
  /** Locked part id this cell carries (drops a shard when defeated by the player). */
  carries: string | null;
  latched: Cell | null;
  drainT: number;
  drainCount: number;
  showHpT: number;
  personality: number;
  eggT: number;
  /** Last attacker id and time, to rate-limit spike rams per pair. */
  lastRamId: number;
  despawnable: boolean;
}

export interface Puff {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  owner: Cell;
  dead: boolean;
}

export interface Shard {
  x: number;
  y: number;
  r: number;
  t: number;
  /** Specific part to unlock, or null for "next locked part". */
  partId: string | null;
  dead: boolean;
  vx: number;
  vy: number;
}

export interface Mate {
  cell: Cell;
  phase: 'approach' | 'court' | 'done';
  t: number;
}

let nextId = 1;

export function makeCell(design: Design, ab: CellAbilities, diet: Diet | null, x: number, y: number, size: number, npc: boolean): Cell {
  return {
    id: nextId++, npc, design, ab, diet, x, y, vx: 0, vy: 0, angle: Math.random() * Math.PI * 2, size,
    hp: 6, maxHp: 6, t: Math.random() * 10, flash: 0, flashColor: '#ffffff', biteAnim: 0, biteCd: 0, ramCd: 0,
    elecT: Math.random() * 3, poisonDist: 0, jetT: Math.random(), steerX: 0, steerY: 0, throttle: 0, dead: false, invuln: 0,
    giant: false, brood: false, state: 'wander', target: null, stateT: 0, thinkT: Math.random() * 0.3, wander: Math.random() * Math.PI * 2,
    chaseT: 0, calmT: 0, hurtBy: null, hurtT: 0, emerge: 1, carries: null, latched: null, drainT: 0, drainCount: 0, showHpT: 0,
    personality: Math.random(), eggT: 8 + Math.random() * 10, lastRamId: -1, despawnable: true,
  };
}

export function makeFood(kind: FoodKind, x: number, y: number, r: number, value: number, variant: number): Food {
  return {
    kind, x, y, vx: 0, vy: 0, r, value, rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.8, variant,
    age: 0, life: kind === 'meat' ? 55 + Math.random() * 20 : kind === 'egg' ? 70 : 1e9, dead: false, pop: 0, cluster: 0,
  };
}

/** World-space mouth tip of a cell. */
export function mouthPos(c: Cell): { x: number; y: number } {
  const d = c.ab.mouthX * c.size;
  return { x: c.x + Math.cos(c.angle) * d, y: c.y + Math.sin(c.angle) * d };
}

/** World-space centre of the cell's body circle. */
export function bodyX(c: Cell): number { return c.x + Math.cos(c.angle) * c.ab.centerX * c.size; }
export function bodyY(c: Cell): number { return c.y + Math.sin(c.angle) * c.ab.centerX * c.size; }
export function bodyR(c: Cell): number { return c.ab.radius * c.size; }
