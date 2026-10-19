// Shared data shapes for the Creature stage.
import type { Design, Diet, Stats } from '../../design/types';
import type { Layout } from '../../design/render';

export type Relation = 'curious' | 'neutral' | 'annoyed' | 'hostile' | 'afraid' | 'friendly' | 'allied' | 'extinct';
export type SpeciesKind = 'own' | 'nest' | 'titan' | 'loner' | 'hunter';

export interface Species {
  id: number;
  kind: SpeciesKind;
  design: Design;
  name: string;
  /** 1..4 for nests (by distance from home); titans and loners are 4. */
  level: number;
  stats: Stats;
  diet: Diet;
  layout: Layout;
  /** Render size of an adult (design units → world units). */
  size: number;
  relation: Relation;
  befriended: number;
  kills: number;
  killsNeeded: number;
  nest: Nest | null;
  maxPop: number;
  hatchT: number;
  /** Seen by the player at least once. */
  met: boolean;
  hp: number;
  dmg: number;
  speed: number;
  /** True once the player has attacked this species (used for first-hit reactions). */
  provoked: boolean;
}

export interface Nest {
  id: number;
  x: number;
  y: number;
  /** Territory radius. */
  r: number;
  species: Species | null;
  eggs: number;
  active: boolean;
  discovered: boolean;
  /** 0 = present from the start, 1/2 = appears with migration 1/2. */
  group: number;
  home?: boolean;
}

export type Role = 'player' | 'adult' | 'baby' | 'alpha' | 'titan' | 'loner' | 'pack' | 'kin' | 'mate' | 'hunter';
export type AIState =
  | 'idle' | 'wander' | 'graze' | 'flee' | 'chase' | 'warn' | 'curious' | 'social' | 'return'
  | 'follow' | 'lulled' | 'abducted' | 'ascend' | 'cheer' | 'migrate' | 'swoon' | 'hatch';

export interface Critter {
  id: number;
  sp: Species;
  role: Role;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Height above ground (world units) and vertical speed. */
  z: number;
  vz: number;
  facing: number;
  size: number;
  /** Collision radius (world units). */
  r: number;
  hp: number;
  maxHp: number;
  state: AIState;
  st: number;
  tx: number;
  ty: number;
  target: Critter | null;
  phase: number;
  walk: number;
  action: string | null;
  actT: number;
  actDur: number;
  flash: number;
  stun: number;
  poison: number;
  poisonDps: number;
  poisonByPlayer: boolean;
  cd: number;
  cd2: number;
  emote: string | null;
  emoteT: number;
  befriended: boolean;
  dead: boolean;
  gone: boolean;
  lulled: number;
  fear: number;
  /** Seconds this critter stays angry at its target. */
  aggro: number;
  hpShow: number;
  /** Babies grow up when this reaches 0. */
  grow: number;
  homeX: number;
  homeY: number;
  homeR: number;
  parent: Critter | null;
  /** Active charge dash time left and direction. */
  dash: number;
  dashX: number;
  dashY: number;
  dashHit: boolean;
  dashDmg: number;
  /** Off-screen cheap-AI accumulator. */
  tick: number;
  near: boolean;
  /** Socialization rounds still needed (alphas need an extra one). */
  rounds: number;
  socialCd: number;
  /** Time the last hit came from the player's side. */
  hitByPlayer: number;
  /** Abduction / ascend / hatch animation progress. */
  anim: number;
  /** Idle wait before wandering again. */
  wait: number;
  /** Family only: seconds left defending you, your pack or the nest against an attacker. */
  guard: number;
}

export interface Tree {
  x: number;
  y: number;
  kind: number;
  s: number;
  r: number;
  ph: number;
}

export interface Bush {
  id: number;
  x: number;
  y: number;
  kind: number;
  s: number;
  fruit: number;
  max: number;
  regrow: number;
  berry: string;
}

export interface Rock {
  x: number;
  y: number;
  kind: number;
  s: number;
  r: number;
}

export interface BonePile {
  id: number;
  x: number;
  y: number;
  /** 1 small ribcage .. 3 huge skeleton */
  size: number;
  kind: 'bone' | 'sky';
  dug: boolean;
  discovered: boolean;
  dig: number;
}

export interface Corpse {
  id: number;
  x: number;
  y: number;
  sp: Species;
  size: number;
  facing: number;
  meat: number;
  age: number;
  life: number;
}

export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  target: Critter;
  fromPlayerSide: boolean;
  dmg: number;
  poison: number;
  t: number;
  src: Critter;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

/** Mid-stage save blob stored in state.stageData.creature. */
export interface CreatureSave {
  v: 1;
  phase: 'play' | 'final';
  t: number;
  dna: number;
  earned: number;
  brain: number;
  hp: number;
  hunger: number;
  px: number;
  py: number;
  homeNest: number;
  migration: number;
  migrating: boolean;
  species: {
    id: number;
    design: unknown;
    relation: Relation;
    befriended: number;
    kills: number;
    met: boolean;
  }[];
  nests: { id: number; discovered: boolean; active: boolean; eggs: number }[];
  bones: { id: number; dug: boolean; discovered: boolean }[];
  sky: { x: number; y: number; dug: boolean }[];
  pack: { sp: number; hp: number }[];
  titansDead: number[];
  lonersDone: number[];
  huntersSpawned: boolean;
  events: { meteor: boolean; nextUfo: number };
  counts: Record<string, number>;
  maxGlide: number;
}
