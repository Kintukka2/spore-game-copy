// Static data for the Space stage: galaxy constants, spice, tools, badges and ranks.
// All names are Sporadium's own; the structure follows the original's space stage.
import type { ArchetypeId } from '../../game/cards';

// ------------------------------------------------------------------ Galaxy geometry
export const GALAXY_R = 1000;
/** The Hollow ring around the core. */
export const RING_IN = 175;
export const RING_OUT = 340;
/** Arms start just outside the ring. */
export const ARM_IN = 360;
/** Interstellar drive range per level (index 1..5). */
export const DRIVE_RANGE = [0, 80, 115, 160, 220, 300];

/** Gravitational fluctuations shrink drive range near the core. */
export function coreFactor(r: number): number {
  const t = Math.max(0, Math.min(1, (r - 120) / 480));
  return 0.6 + 0.4 * (t * t * (3 - 2 * t));
}

// ------------------------------------------------------------------ Stars
export type StarType = 'red' | 'yellow' | 'white' | 'blue' | 'binary' | 'proto' | 'blackhole' | 'core';

export const STAR_INFO: Record<StarType, { name: string; color: string; glow: string; size: number; heat: number }> = {
  red: { name: 'Red dwarf', color: '#ff8a5c', glow: '#ff5a3a', size: 0.8, heat: 0.36 },
  yellow: { name: 'Yellow star', color: '#ffe08a', glow: '#ffc24d', size: 1, heat: 0.55 },
  white: { name: 'White star', color: '#f2f6ff', glow: '#bcd4ff', size: 0.9, heat: 0.62 },
  blue: { name: 'Blue giant', color: '#9fd0ff', glow: '#5ca8ff', size: 1.35, heat: 0.86 },
  binary: { name: 'Binary pair', color: '#ffe9c4', glow: '#ffb36b', size: 1, heat: 0.62 },
  proto: { name: 'Proto-planetary disk', color: '#ffcf9e', glow: '#ff9e5c', size: 0.8, heat: 0.5 },
  blackhole: { name: 'Black hole', color: '#c9b6ff', glow: '#7a4fff', size: 1, heat: 0 },
  core: { name: 'Galactic Core', color: '#fff6e0', glow: '#ffe2a8', size: 3, heat: 1 },
};

// ------------------------------------------------------------------ Spice
export type SpiceColor = 'red' | 'yellow' | 'blue' | 'green' | 'pink' | 'purple';
export const SPICE_COLORS: SpiceColor[] = ['red', 'yellow', 'blue', 'green', 'pink', 'purple'];
/** base = the minimum sale price (§/unit); rate = production multiplier (rarer spice grows slower). */
export const SPICE: Record<SpiceColor, { name: string; hex: string; base: number; rate: number }> = {
  red: { name: 'Ember', hex: '#ff5a4f', base: 230, rate: 1 },
  yellow: { name: 'Sunmote', hex: '#ffd166', base: 300, rate: 0.9 },
  blue: { name: 'Azure', hex: '#4aa8ff', base: 350, rate: 0.8 },
  green: { name: 'Verdance', hex: '#4cd97b', base: 680, rate: 0.6 },
  pink: { name: 'Blush', hex: '#ff7ab8', base: 750, rate: 0.5 },
  purple: { name: 'Umbral', hex: '#b48cff', base: 980, rate: 0.4 },
};

// ------------------------------------------------------------------ Terraforming
/** Radii on the atmosphere/temperature chart: inside 0.1 = T3, 0.2 = T2, 0.3 = T1. */
export const T_RING = [0.3, 0.2, 0.1];
/** Energy per world scanned (planet scans, quick scans, sweeps and surface life scans). */
export const SCAN_ENERGY = 1;
export function tScoreOf(atm: number, temp: number): number {
  const d = Math.hypot(atm - 0.5, temp - 0.5);
  return d < T_RING[2] ? 3 : d < T_RING[1] ? 2 : d < T_RING[0] ? 1 : 0;
}
/** Ecosystem: per T-level row, 2 plant slots + 1 herbivore + 1 predator. */
export const ECO_ROW = ['plant', 'plant', 'herb', 'pred'] as const;
export type EcoSlotKind = (typeof ECO_ROW)[number];

// ------------------------------------------------------------------ Tools
export type ToolCat = 'standard' | 'weapon' | 'colony' | 'terraform' | 'social';
export const TOOL_CATS: { id: ToolCat; label: string; icon: string }[] = [
  { id: 'standard', label: 'Ship', icon: '🛠️' },
  { id: 'weapon', label: 'Weapons', icon: '🎯' },
  { id: 'colony', label: 'Colony', icon: '🏠' },
  { id: 'terraform', label: 'Terraform', icon: '🌍' },
  { id: 'social', label: 'Social', icon: '🤝' },
];

export interface ToolDef {
  id: string;
  name: string;
  icon: string;
  cat: ToolCat;
  price: number;
  /** Rank index needed to buy it. */
  rank: number;
  desc: string;
  /** upgrade: owned once, replaces lower levels in `group`; consumable: stack of charges; unique: owned once. */
  kind: 'upgrade' | 'consumable' | 'unique';
  group?: string;
  level?: number;
  max?: number;
  /** Not for sale (rewards). */
  special?: boolean;
}

export const TOOLS: ToolDef[] = [
  // Ship upgrades
  { id: 'drive2', name: 'Star Drive II', icon: '🚀', cat: 'standard', price: 150000, rank: 1, kind: 'upgrade', group: 'drive', level: 2, desc: `Interstellar range ${DRIVE_RANGE[2]} ly.` },
  { id: 'drive3', name: 'Star Drive III', icon: '🚀', cat: 'standard', price: 300000, rank: 2, kind: 'upgrade', group: 'drive', level: 3, desc: `Interstellar range ${DRIVE_RANGE[3]} ly. Strong enough to fight the core's gravity.` },
  { id: 'drive4', name: 'Star Drive IV', icon: '🚀', cat: 'standard', price: 750000, rank: 4, kind: 'upgrade', group: 'drive', level: 4, desc: `Interstellar range ${DRIVE_RANGE[4]} ly.` },
  { id: 'drive5', name: 'Star Drive V', icon: '🚀', cat: 'standard', price: 2000000, rank: 6, kind: 'upgrade', group: 'drive', level: 5, desc: `Interstellar range ${DRIVE_RANGE[5]} ly.` },
  { id: 'cargo2', name: 'Cargo Bay II', icon: '📦', cat: 'standard', price: 100000, rank: 1, kind: 'upgrade', group: 'cargo', level: 2, desc: 'Hold 35 units of spice and specimens.' },
  { id: 'cargo3', name: 'Cargo Bay III', icon: '📦', cat: 'standard', price: 300000, rank: 3, kind: 'upgrade', group: 'cargo', level: 3, desc: 'Hold 60 units.' },
  { id: 'cargo4', name: 'Cargo Bay IV', icon: '📦', cat: 'standard', price: 700000, rank: 5, kind: 'upgrade', group: 'cargo', level: 4, desc: 'Hold 99 units.' },
  { id: 'cell2', name: 'Energy Cell II', icon: '🔋', cat: 'standard', price: 150000, rank: 1, kind: 'upgrade', group: 'cell', level: 2, desc: '+50% energy capacity.' },
  { id: 'cell3', name: 'Energy Cell III', icon: '🔋', cat: 'standard', price: 350000, rank: 3, kind: 'upgrade', group: 'cell', level: 3, desc: 'Double energy capacity.' },
  { id: 'cell4', name: 'Energy Cell IV', icon: '🔋', cat: 'standard', price: 700000, rank: 5, kind: 'upgrade', group: 'cell', level: 4, desc: 'Triple energy capacity.' },
  { id: 'hull2', name: 'Hull Plating II', icon: '🛡️', cat: 'standard', price: 150000, rank: 1, kind: 'upgrade', group: 'hull', level: 2, desc: '+50% ship health.' },
  { id: 'hull3', name: 'Hull Plating III', icon: '🛡️', cat: 'standard', price: 350000, rank: 3, kind: 'upgrade', group: 'hull', level: 3, desc: '+120% ship health.' },
  { id: 'hull4', name: 'Hull Plating IV', icon: '🛡️', cat: 'standard', price: 700000, rank: 5, kind: 'upgrade', group: 'hull', level: 4, desc: 'Triple ship health.' },
  { id: 'repair', name: 'Repair Pack', icon: '🩹', cat: 'standard', price: 12000, rank: 0, kind: 'consumable', max: 20, desc: 'Restores half your hull. Usable anywhere, even mid-battle.' },
  { id: 'recharge', name: 'Energy Pack', icon: '⚡', cat: 'standard', price: 12000, rank: 0, kind: 'consumable', max: 20, desc: 'Restores 60% of your energy.' },
  { id: 'wormkey', name: 'Rift Key', icon: '🗝️', cat: 'standard', price: 600000, rank: 3, kind: 'unique', desc: 'Lets your ship pass through black holes to their twin.' },
  // Weapons
  { id: 'laser2', name: 'Lance Laser', icon: '🔆', cat: 'weapon', price: 200000, rank: 2, kind: 'upgrade', group: 'laser', level: 2, desc: 'Laser damage doubled.' },
  { id: 'laser3', name: 'Sunspear Laser', icon: '🔆', cat: 'weapon', price: 800000, rank: 5, kind: 'upgrade', group: 'laser', level: 3, desc: 'Laser damage ×4.' },
  { id: 'missile2', name: 'Seeker Missiles', icon: '🚀', cat: 'weapon', price: 250000, rank: 3, kind: 'upgrade', group: 'missile', level: 2, desc: 'Missile damage doubled.' },
  { id: 'missile3', name: 'Starfall Missiles', icon: '🚀', cat: 'weapon', price: 900000, rank: 6, kind: 'upgrade', group: 'missile', level: 3, desc: 'Missile damage ×4.' },
  { id: 'pulse1', name: 'Pulse Ring', icon: '💫', cat: 'weapon', price: 120000, rank: 1, kind: 'upgrade', group: 'pulse', level: 1, desc: 'A shockwave that hits every enemy close to your ship.' },
  { id: 'pulse2', name: 'Nova Ring', icon: '💫', cat: 'weapon', price: 500000, rank: 4, kind: 'upgrade', group: 'pulse', level: 2, desc: 'A pulse with double the damage and reach.' },
  { id: 'bomb', name: 'Planet Bombs', icon: '💣', cat: 'weapon', price: 150000, rank: 2, kind: 'unique', desc: 'Breaks planetary turrets and cities. Needed to capture a world at war.' },
  { id: 'shield', name: 'Deflector', icon: '🔰', cat: 'weapon', price: 400000, rank: 4, kind: 'unique', desc: 'Six seconds of invulnerability.' },
  { id: 'cracker', name: 'World Cracker', icon: '☄️', cat: 'weapon', price: 3000000, rank: 7, kind: 'consumable', max: 5, desc: 'Shatters a planet. Breaks galactic law: every empire nearby will hate you.' },
  // Colony
  { id: 'colonypack', name: 'Colony Pack', icon: '🏗️', cat: 'colony', price: 60000, rank: 0, kind: 'consumable', max: 9, desc: 'Founds a colony city on a planet with spice. A planet holds one city per T-level.' },
  { id: 'silo', name: 'Spice Silo', icon: '🛢️', cat: 'colony', price: 120000, rank: 2, kind: 'consumable', max: 9, desc: 'Install on a colony: doubles its spice storage.' },
  { id: 'bioshield', name: 'Bio Shield', icon: '🧬', cat: 'colony', price: 150000, rank: 3, kind: 'consumable', max: 9, desc: 'Install on a colony: far fewer eco-disasters, and twice the time to fix one.' },
  { id: 'turret', name: 'Orbital Turret', icon: '🗼', cat: 'colony', price: 200000, rank: 3, kind: 'consumable', max: 9, desc: 'Install on a colony: a turret that fights raiders even while you are away.' },
  // Terraform
  { id: 'seeds', name: 'Seed Pods', icon: '🌱', cat: 'terraform', price: 6000, rank: 0, kind: 'consumable', max: 60, desc: 'Plant life for ecosystem slots (buys 3).' },
  { id: 'stormpod', name: 'Storm Pod', icon: '🌧️', cat: 'terraform', price: 20000, rank: 1, kind: 'consumable', max: 20, desc: 'Thickens a planet\'s atmosphere.' },
  { id: 'droughtpod', name: 'Drought Pod', icon: '🏜️', cat: 'terraform', price: 20000, rank: 1, kind: 'consumable', max: 20, desc: 'Thins a planet\'s atmosphere.' },
  { id: 'meteor', name: 'Meteor Call', icon: '☄️', cat: 'terraform', price: 20000, rank: 1, kind: 'consumable', max: 20, desc: 'Warms a planet with a rain of meteors.' },
  { id: 'icecomet', name: 'Ice Comet', icon: '🧊', cat: 'terraform', price: 20000, rank: 1, kind: 'consumable', max: 20, desc: 'Cools a planet with a frozen comet.' },
  { id: 'cloudengine', name: 'Cloud Engine', icon: '🌀', cat: 'terraform', price: 300000, rank: 2, kind: 'unique', desc: 'Raise or lower atmosphere using ship energy. Unlimited uses.' },
  { id: 'thermlance', name: 'Thermal Lance', icon: '🌡️', cat: 'terraform', price: 350000, rank: 3, kind: 'unique', desc: 'Heat or cool a planet using ship energy. Unlimited uses.' },
  // Social
  { id: 'beacon', name: 'Goodwill Beacon', icon: '🎆', cat: 'social', price: 200000, rank: 2, kind: 'unique', desc: 'A dazzling light show over an empire\'s world. Improves relations (once a minute).' },
  { id: 'embassy', name: 'Embassy', icon: '🏛️', cat: 'social', price: 400000, rank: 4, kind: 'consumable', max: 5, desc: 'Build an embassy on an empire\'s world: a large, permanent relations boost.' },
  // Special reward
  { id: 'genesis', name: 'Genesis Seed', icon: '🌱', cat: 'terraform', price: 0, rank: 99, kind: 'consumable', max: 12, special: true, desc: 'Ori\'s gift. Turns any planet into a thriving T3 world with a full ecosystem.' },
  { id: 'crate', name: 'Mystery Crate', icon: '📦', cat: 'standard', price: 0, rank: 99, kind: 'consumable', max: 9, special: true, desc: 'A sealed crate from a wandering trader. Open it from your Cargo.' },
];
export const TOOL_MAP: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

/** Which card perk discounts which tool category. */
export const PERK_DISCOUNT: Record<string, ToolCat[]> = {
  'silver-tongue': ['social'],
  'jack-of-all': ['standard'],
  'colony-boom': ['colony', 'terraform'],
  'arms-deal': ['weapon'],
};

// ------------------------------------------------------------------ Badges and ranks
export interface BadgeDef { id: string; name: string; icon: string; counter: string; levels: number[]; desc: string }
export const BADGES: BadgeDef[] = [
  { id: 'explorer', name: 'Pathfinder', icon: '🔭', counter: 'visited', levels: [5, 15, 40, 100, 200], desc: 'Visit star systems' },
  { id: 'trader', name: 'Spice Broker', icon: '💱', counter: 'spiceSold', levels: [10, 50, 180, 500, 1200], desc: 'Sell spice' },
  { id: 'colonist', name: 'Settler', icon: '🏠', counter: 'colonies', levels: [1, 3, 6, 12, 20], desc: 'Found colonies' },
  { id: 'warrior', name: 'Gunner', icon: '🎯', counter: 'kills', levels: [5, 20, 50, 120, 250], desc: 'Destroy hostile ships' },
  { id: 'terra', name: 'World Shaper', icon: '🌍', counter: 'tRaises', levels: [1, 4, 10, 20, 40], desc: 'Raise T-scores' },
  { id: 'diplomat', name: 'Envoy', icon: '🤝', counter: 'diplomacy', levels: [1, 3, 6, 10, 16], desc: 'Contact empires and form alliances' },
  { id: 'missions', name: 'Errand Runner', icon: '📜', counter: 'missions', levels: [2, 6, 12, 25, 45], desc: 'Complete missions' },
  { id: 'eco', name: 'Eco Guardian', icon: '🌿', counter: 'eco', levels: [1, 3, 6, 12, 25], desc: 'Complete ecosystems and stop eco-disasters' },
  { id: 'xeno', name: 'Xenobiologist', icon: '🧬', counter: 'catalogued', levels: [3, 10, 25, 50, 90], desc: 'Catalogue species in the Xenopedia' },
];

export interface RankDef { name: string; icon: string; pts: number }
export const RANKS: RankDef[] = [
  { name: 'Cadet', icon: '🔰', pts: -1 },
  { name: 'Captain', icon: '🎖️', pts: 0 },
  { name: 'Commander', icon: '⭐', pts: 3 },
  { name: 'Commodore', icon: '🌟', pts: 8 },
  { name: 'Admiral', icon: '💫', pts: 15 },
  { name: 'Luminary', icon: '✴️', pts: 24 },
  { name: 'Paragon', icon: '🔆', pts: 35 },
  { name: 'Exalted', icon: '👑', pts: 50 },
  { name: 'Legend', icon: '🏆', pts: 70 },
  { name: 'Ascendant', icon: '🌌', pts: 95 },
];
/** Rank at which the Hollow contact mission begins. */
export const HOLLOW_RANK = 4;

// ------------------------------------------------------------------ AI personalities
export type AiArch = Exclude<ArchetypeId, 'paladin' | 'drifter'>;
export const AI_ARCHES: AiArch[] = ['mystic', 'merchant', 'warlord', 'envoy', 'scholar', 'prophet', 'gardener', 'minstrel'];
export const PERSONALITY: Record<AiArch, { start: number; startLabel: string; expand: number; aggressive: boolean; trade: number; greeting: string }> = {
  mystic: { start: 0, startLabel: '', expand: 0.8, aggressive: false, trade: 1, greeting: 'The stars sang of your coming. Be still, and be welcome.' },
  merchant: { start: 20, startLabel: 'We like new customers', expand: 1.4, aggressive: false, trade: 1.25, greeting: 'Customers! Wonderful. Everything is for sale, friend, including friendship.' },
  warlord: { start: -30, startLabel: 'We distrust strangers', expand: 1.1, aggressive: true, trade: 0.9, greeting: 'Another soft-shelled wanderer. Show strength, or show us your back.' },
  envoy: { start: 20, startLabel: 'We value new acquaintances', expand: 1.3, aggressive: false, trade: 1, greeting: 'Greetings, traveller. Our charters welcome every lawful species.' },
  scholar: { start: 0, startLabel: '', expand: 0.9, aggressive: false, trade: 1, greeting: 'Fascinating. Your hull geometry alone is worth three papers.' },
  prophet: { start: -20, startLabel: 'You do not share our faith', expand: 1, aggressive: true, trade: 0.9, greeting: 'Kneel before the Radiance, or be lost in its shadow.' },
  gardener: { start: 0, startLabel: '', expand: 0.8, aggressive: false, trade: 1, greeting: 'Do you bring seeds? Every world deserves a garden.' },
  minstrel: { start: 5, startLabel: 'You have a nice rhythm', expand: 0.9, aggressive: false, trade: 1.1, greeting: 'A new verse for our song! Come, tell us where you have been.' },
};

export const STANCES = [
  { id: 'war', label: 'War', color: '#ff4a4a', icon: '⚔️' },
  { id: 'hostile', label: 'Hostile', color: '#ff7a59', icon: '😠' },
  { id: 'wary', label: 'Wary', color: '#ffb347', icon: '😒' },
  { id: 'neutral', label: 'Neutral', color: '#ffd166', icon: '😐' },
  { id: 'friendly', label: 'Friendly', color: '#5cc8ff', icon: '🙂' },
  { id: 'allied', label: 'Allied', color: '#4cd97b', icon: '🤝' },
] as const;
export type StanceId = (typeof STANCES)[number]['id'];

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
