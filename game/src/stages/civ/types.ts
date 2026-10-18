// Civilization stage: shared data types, constants and small helpers.
import type { Design, Palette } from '../../design/types';
import type { NationType } from '../../game/cards';

export type { NationType };
export type Medium = 'land' | 'sea' | 'air';
export type Method = 'convert' | 'buy' | 'military';
export type BuildingKind = 'house' | 'factory' | 'fun';

/** World size in units. The map wraps horizontally. */
export const W = 3200;
export const H = 2048;
export const PLAYER = 0;

export const BUILD_COST: Record<BuildingKind | 'turret', number> = { house: 1600, factory: 1200, fun: 800, turret: 2000 };
export const BUILD_NAME: Record<BuildingKind | 'turret', string> = { house: 'House', factory: 'Factory', fun: 'Entertainment', turret: 'Turret' };
export const BUILD_ICON: Record<BuildingKind | 'turret', string> = { house: '🏠', factory: '🏭', fun: '🎡', turret: '🗼' };
export const VEH_BASE_COST: Record<Medium, number> = { land: 1200, sea: 1800, air: 2800 };
export const MEDIUM_ICON: Record<Medium, string> = { land: '🚙', sea: '🚢', air: '✈️' };
export const MEDIUM_NAME: Record<Medium, string> = { land: 'Land', sea: 'Sea', air: 'Air' };
export const ROLE_ICON: Record<NationType, string> = { religious: '🕊️', economic: '💰', military: '⚔️' };
export const ROLE_NAME: Record<NationType, string> = { religious: 'Religious', economic: 'Economic', military: 'Military' };
export const METHOD_OF: Record<NationType, Method> = { religious: 'convert', economic: 'buy', military: 'military' };
export const METHOD_COLOR: Record<Method, string> = { convert: '#4cd97b', buy: '#4aa8ff', military: '#ff5a4f' };

/** Inner slot ring and turret ring geometry around a city hall (world units, relative to city centre). */
export const SLOT_RX = 62;
export const SLOT_RY = 40;
export const TUR_RX = 98;
export const TUR_RY = 66;
export const CITY_R = 110;

export interface Slot {
  kind: BuildingKind | null;
  /** Seconds the building stays shut down (religious beams, Hush Cloud). */
  off: number;
}

export interface Turret {
  alive: boolean;
  hp: number;
  cool: number;
  off: number;
  /** Seconds frozen by Stasis Pulse. */
  frozen: number;
}

export interface City {
  id: number;
  name: string;
  x: number;
  y: number;
  owner: number;
  /** City specialty; kept when captured. */
  type: NationType;
  large: boolean;
  /** The player's starting city: can never fall. */
  home: boolean;
  coastal: boolean;
  dock: { x: number; y: number } | null;
  continent: number;
  slots: Slot[];
  turrets: Turret[];
  defense: number;
  defenseMax: number;
  /** Religious conversion meter 0..100 and who is converting. */
  convert: number;
  convertBy: number;
  /** Economic buyout meter 0..100 (player trade routes). */
  buyout: number;
  /** Player has an open trade route with this city. */
  trade: boolean;
  /** Seconds since founding (rival villages rise into cities in the first minute). */
  foundAt: number;
  founded: boolean;
  lastHit: number;
  lastHitBy: number;
  hush: number;
  /** Cached values from the planner maths. */
  happy: number;
  output: number;
  /** Sea/air unlock and capture flash. */
  flash: number;
}

export interface Geyser {
  id: number;
  x: number;
  y: number;
  sea: boolean;
  owner: number; // -1 = free
  hp: number;
  /** Claim / conversion progress 0..1 and who is working on it. */
  work: number;
  workBy: number;
  pop: number;
}

export type Order =
  | { k: 'idle' }
  | { k: 'move'; x: number; y: number }
  | { k: 'city'; city: number }
  | { k: 'hunt'; vid: number }
  | { k: 'geyser'; g: number; want?: number };

export interface Vehicle {
  id: number;
  nation: number;
  role: NationType;
  medium: Medium;
  home: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  range: number;
  cool: number;
  order: Order;
  path: { x: number; y: number }[] | null;
  pathI: number;
  /** Target of the current attack (vehicle id, or -1 - turret index, or -100 for a hall). */
  aim: number;
  /** Economic: 0 = going to the target city, 1 = heading home. */
  leg: number;
  frozen: number;
  invuln: number;
  bribed: number;
  flash: number;
  spawn: number;
  bob: number;
  repath: number;
  stuck: number;
  /** Current path goal. */
  gx: number;
  gy: number;
  /** Faith / trade power (role strength from the design). */
  pow: number;
}

export type Target =
  | { t: 'v'; id: number }
  | { t: 'tur'; city: number; i: number }
  | { t: 'hall'; city: number }
  | { t: 'der'; g: number };

export interface Projectile {
  k: 'shell' | 'missile' | 'tracer';
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  nation: number;
  dmg: number;
  tgt: Target;
  arc: number;
}

export interface Nation {
  id: number;
  name: string;
  type: NationType;
  color: string;
  palette: Palette;
  /** Baseline attitude toward the player (drifts toward this). */
  attitude: number;
  rel: number;
  allied: boolean;
  /** Relations with other nations by id (AI vs AI). */
  relAI: number[];
  money: number;
  alive: boolean;
  goodwill: number;
  gifts: number;
  aiT: number;
  waveT: number;
  /** Seconds since this nation last hurt the player (danger music, war). */
  hostileT: number;
  /** Seconds of peace treaty left. */
  truce: number;
}

export interface NationArt {
  species: Design;
  hall: Design;
  house: Design;
  factory: Design;
  fun: Design;
  land: Design;
  sea: Design;
  air: Design;
}

export const wrapX = (x: number): number => ((x % W) + W) % W;
/** Shortest signed horizontal delta from a to b on the wrapped map. */
export const wdx = (a: number, b: number): number => {
  let d = b - a;
  d -= W * Math.round(d / W);
  return d;
};
export const wdist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(wdx(ax, bx), by - ay);
export const wdist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = wdx(ax, bx), dy = by - ay;
  return dx * dx + dy * dy;
};

/** Inner slot position (relative to the hall) for slot i of n. Back row first so drawing order is natural. */
export function slotPos(i: number, n: number): { x: number; y: number } {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + (n === 6 ? Math.PI / 6 : Math.PI / 8);
  return { x: Math.cos(a) * SLOT_RX, y: Math.sin(a) * SLOT_RY + 6 };
}
export function turretPos(i: number, n: number): { x: number; y: number } {
  const a = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
  return { x: Math.cos(a) * TUR_RX, y: Math.sin(a) * TUR_RY + 8 };
}

export const fmtMoney = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e6) return '§' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e4) return '§' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '§' + Math.round(n).toLocaleString('en-US');
};

export function relLabel(rel: number, allied: boolean): { label: string; face: string; color: string } {
  if (allied) return { label: 'Allied', face: '🤝', color: '#4cd97b' };
  if (rel >= 30) return { label: 'Friendly', face: '😊', color: '#5cc8ff' };
  if (rel > -30) return { label: 'Neutral', face: '😐', color: '#ffd166' };
  if (rel > -70) return { label: 'Wary', face: '😠', color: '#ff9f43' };
  return { label: 'Hostile', face: '😡', color: '#ff5a4f' };
}
