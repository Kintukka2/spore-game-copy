// Shared data types and tuning constants for the Tribal stage.
import type { Design } from '../../design/types';

/** World is a square of WORLD x WORLD units (1 unit ~ 1 CSS px at zoom 1). */
export const WORLD = 2000;
export const PLAYER = 0;
export const WILD = -1;
export const NUM_TRIBES = 4;

export type ToolId = 'drum' | 'horn' | 'rattle' | 'spear' | 'axe' | 'torch' | 'fishspear' | 'staff' | 'heal';
export type Stance = 'social' | 'attack';
export type FoodKind = 'fruit' | 'fish' | 'meat' | 'eggs';
export type NodeKind = 'tree' | 'fish' | 'carcass' | 'eggs' | 'cache';
export type HutStyle = 'clay' | 'wood' | 'hide';
export type WildKind = 'grazer' | 'hunter' | 'titan';

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  food: FoodKind;
  /** Where the node is drawn. */
  x: number;
  y: number;
  /** Where gatherers stand. */
  sx: number;
  sy: number;
  amount: number;
  max: number;
  /** Units regrown per second (trees, fish spots, eggs). */
  regrow: number;
  /** Seconds of boosted regrow / harvest left (Bounty Rain, Fish Frenzy). */
  boost: number;
  /** Seconds until it disappears (carcasses, caches). Infinity = permanent. */
  ttl: number;
  /** Fruit colour / sprite variant. */
  variant: number;
  shake: number;
  /** -1 wild, 0 home, 1..4 a rival tribe's grove. */
  owner: number;
}

export type Order =
  | { type: 'idle' }
  | { type: 'move'; x: number; y: number }
  | { type: 'gather'; node: number; phase: 'go' | 'work' | 'return'; t: number }
  | { type: 'attack'; target: number }
  | { type: 'hut'; tribe: number }
  | { type: 'tool'; slot: number }
  | { type: 'perform'; tribe: number }
  | { type: 'tame'; target: number }
  | { type: 'steal'; phase: 'go' | 'take' | 'home'; t: number }
  | { type: 'home' }
  | { type: 'deliver'; tribe: number; amount: number; toPlayer: boolean }
  | { type: 'follow'; target: number };

export interface Unit {
  id: number;
  kind: 'member' | 'animal' | 'porter';
  /** PLAYER, 1..4 for rival tribes, WILD for animals. Pets and charmed beasts use PLAYER. */
  team: number;
  design: Design;
  /** Index into the stage's design table (for saves). */
  dIdx: number;
  /** Render scale for renderDesign at full growth. */
  size: number;
  /** Body radius in world units (separation, hit tests, melee reach). */
  r: number;
  /** Design height in design units (multiply by size for world units). */
  hgt: number;
  x: number;
  y: number;
  /** Steering goal for this frame and its speed multiplier (0 = stand still). */
  gx: number;
  gy: number;
  gs: number;
  facing: number;
  speed: number;
  hp: number;
  maxHp: number;
  chief: boolean;
  /** 0..1 growth; adults are 1. */
  age: number;
  tool: ToolId | null;
  carry: number;
  carryKind: FoodKind | null;
  order: Order;
  /** Order to resume after an automatic fight. */
  resume: Order | null;
  /** Formation slot within the current group command. */
  slot: number;
  // animation
  t: number;
  phase: number;
  walk: number;
  action: string | null;
  actionT: number;
  actionDur: number;
  flash: number;
  /** Death animation seconds remaining (only meaningful when dead). */
  dying: number;
  dead: boolean;
  cd: number;
  stun: number;
  burn: number;
  sel: boolean;
  think: number;
  bubble: string | null;
  bubbleT: number;
  /** Last hostile that hit this unit, and for how long to remember it. */
  aggro: number;
  aggroT: number;
  // animals
  wild?: WildKind;
  herd?: number;
  pet?: boolean;
  charmed?: number;
  fear?: number;
  // rivals
  raid?: boolean;
  /** Rival chief or wild home position. */
  hx?: number;
  hy?: number;
}

export interface Tribe {
  id: number;
  rank: number;
  name: string;
  design: Design;
  color: string;
  style: HutStyle;
  x: number;
  y: number;
  hutHp: number;
  hutMax: number;
  burn: number;
  relation: number;
  base: number;
  admiration: number;
  state: 'active' | 'allied' | 'defeated';
  food: number;
  maxMembers: number;
  weapon: ToolId;
  raidT: number;
  giftT: number;
  thiefT: number;
  spawnT: number;
  chiefT: number;
  alarm: number;
  concertCd: number;
  /** Seconds since resolved (for ruin smoke / celebration animations). */
  since: number;
  hitT: number;
}

export interface Shot {
  kind: 'spear' | 'bomb';
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  arc: number;
  target: number;
  from: number;
  team: number;
  dmg: number;
}

export interface ToolHut {
  slot: number;
  tool: ToolId;
  /** Build animation 0..1 */
  grow: number;
}

export interface Snare {
  x: number;
  y: number;
  ttl: number;
  sprung: number;
}

export interface HomeLayout {
  x: number;
  y: number;
  hut: { x: number; y: number };
  fire: { x: number; y: number };
  pile: { x: number; y: number };
  totem: { x: number; y: number };
  pen: { x: number; y: number };
  slots: { x: number; y: number }[];
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

/** Relationship face used in the HUD. */
export function relationFace(t: Tribe): { icon: string; label: string; color: string } {
  if (t.state === 'allied') return { icon: '💚', label: 'Allied', color: '#4cd97b' };
  if (t.state === 'defeated') return { icon: '💀', label: 'Defeated', color: '#8a8580' };
  const r = t.relation;
  if (r <= -50) return { icon: '😡', label: 'Enemy', color: '#ff5a4f' };
  if (r <= -15) return { icon: '😒', label: 'Wary', color: '#ff9a4f' };
  if (r < 25) return { icon: '😐', label: 'Neutral', color: '#ffd166' };
  return { icon: '😊', label: 'Friendly', color: '#5cc8ff' };
}

export const COST = { member: 10, hut: 25, gift: 10, tame: 15 } as const;
export const POP_CAPS = [6, 8, 10, 12, 12];
export const MAX_PETS = 3;
export const DAY_LENGTH = 240;
