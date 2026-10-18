// Tuning tables for the Cell stage: levels, size classes, difficulty and water colours.
import type { Game } from '../../game/game';

export const LEVELS = 5;
export const DNA_PER_LEVEL = 25;
/** DNA earned (not spent) needed to fill the progress bar. */
export const DNA_GOAL = LEVELS * DNA_PER_LEVEL;
/** World scale of the player at each level (design units -> world units). */
export const LEVEL_SCALE = [1, 1.55, 2.4, 3.7, 5.7];
export const LEVEL_NAMES = ['Speck', 'Mote', 'Swimmer', 'Roamer', 'Colossus'];
/** Screen px per world unit at level 1 on a 390 px wide phone. */
export const BASE_ZOOM = 1.55;
export const MAX_HP = 100;
/** Seconds of invulnerability after taking a hit. */
export const HURT_IFRAMES = 0.7;
/** DNA needed (or a collected shard) before Call Mate unlocks. */
export const MATE_UNLOCK_DNA = 15;

export type SizeClass = 'prey' | 'peer' | 'predator' | 'giant';

/** Size class of `other` relative to `self` (rel = other.size / self.size). */
export function sizeClass(rel: number, giantFlag: boolean): SizeClass {
  if (rel < 0.72) return 'prey';
  if (rel < 1.4) return 'peer';
  if (rel >= 3 || (giantFlag && rel >= 2.3)) return 'giant';
  return 'predator';
}

/** Difficulty-scaled numbers, resolved once per stage via game.diff(). */
export interface Tuning {
  npcHp: number;
  damageTaken: number;
  predators: number;
  giants: number;
  peerAggro: number;
  chaseTime: number;
  npcSpeed: number;
  healPerFood: number;
  regen: number;
  /** Omnivore NPCs: 0 peaceful, 1 retaliate, 2 aggressive. */
  omniTemper: number;
  /** Player damage multiplier vs NPCs. */
  playerDamage: number;
  foodMul: number;
}

export function makeTuning(game: Game): Tuning {
  return {
    npcHp: game.diff(0.8, 1, 1.35),
    damageTaken: game.diff(0.6, 1, 1.3),
    predators: game.diff(1, 2, 3),
    giants: game.diff(0, 1, 2),
    peerAggro: game.diff(0.06, 0.28, 0.6),
    chaseTime: game.diff(3.5, 6.5, 10),
    npcSpeed: game.diff(0.86, 1, 1.08),
    healPerFood: game.diff(0.25, 0.12, 0.08),
    regen: game.diff(2.4, 1.1, 0.5),
    omniTemper: game.diff(0, 1, 2),
    playerDamage: game.diff(1.25, 1, 0.8),
    foodMul: game.diff(1.15, 1, 0.9),
  };
}

/** Water gradient (top, bottom) and accent per level; interpolated by the backdrop. */
export const WATER: { top: string; bottom: string; glow: string }[] = [
  { top: '#0b3d52', bottom: '#041722', glow: '#4fe0ff' },
  { top: '#0c4a5c', bottom: '#052029', glow: '#56f0e0' },
  { top: '#0f5966', bottom: '#062a31', glow: '#6ff5cf' },
  { top: '#18695f', bottom: '#09352f', glow: '#9cf5b8' },
  { top: '#3f7f63', bottom: '#1c4436', glow: '#ffe6a3' },
];

/** Food values in DNA. */
export const FOOD_DNA = { plant: 1, bigPlant: 2, meat: 1, bigMeat: 2, egg: 3, swallow: 2, drain: 1 };
