// Tuning tables for the Creature stage. Everything balance-related lives here.
import type { AbilityId } from '../../design/types';

/** World is a square of this many units; the island sits in the middle, ringed by ocean. */
export const WORLD_SIZE = 3200;
/** Terrain sample spacing (world units). */
export const GRID = 8;
/** Terrain render chunk size (world units, rendered at 1 px per unit). */
export const CHUNK = 256;
/** Display metres: 1 m = 8 world units. */
export const UNITS_PER_M = 8;

/** Cumulative DNA earned at which each brain level starts. Index 5 = bar full (sapient). */
export const BRAIN_AT = [0, 0, 80, 190, 330, 500, 700];
export const BRAIN_FULL = BRAIN_AT[6];
export const MAX_BRAIN = 5;
/** Player max HP by brain level (index 1..5). */
export const BRAIN_HP = [0, 40, 55, 75, 100, 130];
/** Player body length (world units) by brain level. */
export const BRAIN_LEN = [0, 46, 53, 61, 70, 80];
/** Pack slots by brain level. */
export const PACK_SLOTS = [0, 0, 1, 2, 3, 3];
/** Default camera zoom by brain level (multiplied by a screen factor and pinch zoom). */
export const BRAIN_ZOOM = [0, 1.3, 1.22, 1.14, 1.06, 1.0];

/** NPC adult body length and HP by species level (1..4). */
export const LEVEL_LEN = [0, 42, 54, 66, 80];
export const LEVEL_HP = [0, 18, 32, 50, 75];
/** Kills needed to drive a species extinct, by level. */
export const KILLS_NEEDED = [0, 3, 4, 4, 5];
export const BEFRIENDS_NEEDED = 3;

export type SocialAb = 'sing' | 'dance' | 'charm' | 'pose';
export type CombatAb = 'bite' | 'charge' | 'strike' | 'spit';
export const SOCIAL_ABS: SocialAb[] = ['sing', 'dance', 'charm', 'pose'];
export const COMBAT_ABS: CombatAb[] = ['bite', 'charge', 'strike', 'spit'];
export type StanceAb = SocialAb | CombatAb;

/** Which pose action each ability plays, and for how long (s). */
export const AB_ACTION: Record<StanceAb, { action: string; dur: number }> = {
  bite: { action: 'bite', dur: 0.38 },
  charge: { action: 'charge', dur: 0.55 },
  strike: { action: 'strike', dur: 0.45 },
  spit: { action: 'spit', dur: 0.45 },
  sing: { action: 'sing', dur: 0.9 },
  dance: { action: 'dance', dur: 1.0 },
  charm: { action: 'charm', dur: 0.9 },
  pose: { action: 'pose', dur: 0.9 },
};

/** Hint shown when the player lacks a social or combat ability. */
export const AB_SOURCE: Record<StanceAb, string> = {
  bite: 'a mouth', charge: 'horns or hooves', strike: 'claws or hands', spit: 'a spitter',
  sing: 'a mouth', dance: 'legs or a tail', charm: 'a crest or tail', pose: 'arms or hands',
};

// ------------------------------------------------------------------ combat numbers
// Player-side ability numbers by level (0..5). Level 0 = unavailable (bite falls back to 1).
export const biteDmg = (l: number) => 3 + 2 * l;
export const biteCd = (l: number) => 0.95 - l * 0.04;
export const chargeDmg = (l: number) => 6 + 3 * l;
export const chargeCd = (l: number) => 12.5 - l * 1.1;
export const chargeRange = 290;
export const strikeDmg = (l: number) => 6 + 3 * l;
export const strikeCd = (l: number) => 5.2 - l * 0.35;
export const spitDmg = (l: number) => 2 + 1.5 * l;
export const spitPoison = (l: number) => 1 + 0.6 * l; // dps for 4s
export const spitCd = (l: number) => 4.0 - l * 0.3;
export const spitRange = 330;

/** NPC melee damage by species level and bite stat. */
export const npcDmg = (level: number, bite: number) => 1.2 + level * 1.3 + bite * 0.8;

// ------------------------------------------------------------------ movement
export const playerSpeed = (speed: number) => 70 + speed * 14;
export const npcSpeed = (speed: number, level: number) => 52 + speed * 11 + level * 3;
export const SPRINT_MULT = 1.45;
export const sprintDur = (l: number) => 4 + l * 1.6;
export const sprintCd = (l: number) => 22 - l * 1.5;
export const GRAVITY = 900;
export const jumpVel = (l: number) => 230 + l * 45;
export const glideFlaps = (l: number) => l;

// ------------------------------------------------------------------ DNA rewards
export const memberReward = (level: number) => 8 + level * 4;
export const speciesBonus = (level: number) => 25 + level * 15;
export const LONER_REWARD = 60;
export const TITAN_REWARD = 150;
export const EGG_REWARD = 20;
export const BONE_REWARD = 8;
export const MIGRATION_REWARD = 40;
export const HUNTER_REWARD = 12;
export const LEVELUP_WALLET = 20;

/** Brain levels at which the two migrations are offered. */
export const MIGRATION_AT = [2, 4];

export const SOCIAL_STATS: AbilityId[] = ['sing', 'dance', 'charm', 'pose'];
export const COMBAT_STATS: AbilityId[] = ['bite', 'charge', 'strike', 'spit'];

/** Relation display data. */
export const REL_INFO = {
  curious: { face: '🙂', color: '#ffd166', label: 'Curious' },
  neutral: { face: '😐', color: '#c9c3b6', label: 'Neutral' },
  annoyed: { face: '😠', color: '#ff9f43', label: 'Territorial' },
  hostile: { face: '😡', color: '#ff4d4d', label: 'Hostile' },
  afraid: { face: '😨', color: '#b39bff', label: 'Afraid' },
  friendly: { face: '😊', color: '#4aa8ff', label: 'Friendly' },
  allied: { face: '💚', color: '#4cd97b', label: 'Allied' },
  extinct: { face: '💀', color: '#6b6b6b', label: 'Extinct' },
} as const;
