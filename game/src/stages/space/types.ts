// Shared runtime types for the Space stage.
import type { Design } from '../../design/types';
import type { AiArch, SpiceColor, StarType } from './data';

export interface Star {
  id: number;
  x: number;
  y: number;
  /** Distance from the galactic centre. */
  r: number;
  type: StarType;
  name: string;
  seed: number;
  /** Visual size multiplier. */
  size: number;
  color: string;
  /** Binary companion colour. */
  color2?: string;
  /** Black holes: the twin this one leads to. */
  twin?: number;
  /** Part of the Hollow ring (or the inner bastions). */
  hollow?: boolean;
  /** Arm index (-1 for disc / ring stars). */
  arm: number;
}

export type PlanetKind = 'rocky' | 'gas';

export interface Planet {
  idx: number;
  starId: number;
  name: string;
  seed: number;
  kind: PlanetKind;
  /** Orbit radius in system units. */
  orbit: number;
  /** Orbit phase (radians) at t = 0 and angular speed (rad/s). */
  phase: number;
  speed: number;
  /** Visual radius in system units. */
  size: number;
  /** Starting atmosphere/temperature (0..1). */
  atm: number;
  temp: number;
  spice: SpiceColor | null;
  richness: number;
  rings: boolean;
  moons: number;
  /** Native life (animals to abduct, flora). */
  life: boolean;
  /** Story features. */
  feature?: 'home' | 'wreck' | 'ruin' | 'hollow' | 'empire-home';
  /** Gas giant band hue / surface tint seed. */
  hue: number;
}

export interface Specimen {
  /** Seed for regenerating the design. */
  seed: number;
  name: string;
  diet: 'herbivore' | 'carnivore' | 'omnivore' | 'plant';
  /** Spliced in the Xeno-Lab: carries its own design and fits any animal slot. */
  hybrid?: boolean;
  design?: Design;
  parents?: [string, string];
  /** A rare sighting (event): carries its own design, big grant, triple Menagerie crowds. */
  rare?: boolean;
}

export interface Buildings {
  factory: number;
  leisure: number;
  turret: number;
}

/** Mutable per-planet state, saved as a delta. */
export interface PlanetState {
  atm: number;
  temp: number;
  /** 12 ecosystem slots (3 rows × [plant, plant, herb, pred]); null = empty. */
  eco: (Specimen | null)[];
  /** Owner id ('player', an empire id, 'hollow') if colonised. */
  owner?: string;
  cities: number;
  bld: Buildings;
  /** Spice in storage (colonies). */
  stored: number;
  silo?: boolean;
  bioshield?: boolean;
  orbTurret?: boolean;
  /** Defence pool (turrets) and city HP for empire worlds at war. */
  def?: number;
  cityHp?: number;
  scanned?: boolean;
  /** The player has landed and flown over the surface. */
  landed?: boolean;
  /** Native species already abducted (by index) / scanned. */
  taken?: number;
  destroyed?: boolean;
  embassy?: boolean;
  /** Unrest timer (s) when unhappy. */
  unrest?: number;
}

export interface RelMod {
  id: string;
  label: string;
  v: number;
  /** Points per minute toward 0. */
  decay?: number;
  max?: number;
  min?: number;
}

/** Saved per-empire state. */
export interface EmpireSave {
  met: boolean;
  war: boolean;
  allied: boolean;
  mods: RelMod[];
  demand: Record<SpiceColor, number>;
  route: number | null;
  takeover: Record<string, number>;
  expandT: number;
  moodT: number;
  serenade: number;
  dead?: boolean;
  /** Price multipliers per colour (rolled once). */
  mult: Record<SpiceColor, number>;
  lastBeacon?: number;
  tributeAsked?: number;
  /** Systems they already offered to sell you unprompted (the Trade tab can still ask again). */
  offered?: Record<string, boolean>;
}

export interface Empire extends EmpireSave {
  id: string;
  name: string;
  species: string;
  color: string;
  arch: AiArch | 'hollow';
  home: number;
  creature: Design;
  ship: Design;
  /** Spice colours this empire produces (sells cheap, buys at minimum). */
  produces: SpiceColor[];
  seed: number;
}

export type MissionKind = 'deliver' | 'scan' | 'pirates' | 'terraform' | 'explore' | 'tutorial' | 'colonize' | 'ally' | 'contact' | 'hollow' | 'core';

export interface Mission {
  id: number;
  kind: MissionKind;
  giver: string;
  title: string;
  desc: string;
  star?: number;
  planet?: number;
  color?: SpiceColor;
  amount?: number;
  tscore?: number;
  reward: number;
  /** World time deadline (0 = none). */
  deadline: number;
  /** Tutorial step id. */
  step?: string;
  progress?: number;
  /** Is a main-line mission (cannot be abandoned). */
  main?: boolean;
  /** You already haggled over this offer's reward. */
  haggled?: boolean;
  /** A rare extra reward: a blueprint, components or a finished tool (see salvage.ts). */
  bonus?: import('./salvage').Salvage;
  /** A Spice Exchange job: finishing it moves this spice's price (see market.ts). */
  market?: { c: SpiceColor; shock: number };
}

export type EventKind = 'raid' | 'invasion' | 'eco' | 'hollow' | 'meteor' | 'distress' | 'relic' | 'rare' | 'trader' | 'refugees' | 'wreck';

export interface GEvent {
  id: number;
  kind: EventKind;
  star: number;
  planet: number;
  until: number;
  empire?: string;
  /** Eco-disaster: purge markers remaining (lat/lon pairs). */
  marks?: number[];
  started?: boolean;
  /** Meteor storm: rocks that got through. */
  hits?: number;
  /** Distress call: the beacon is pirate bait. */
  trap?: boolean;
  /** Rare creature: the specimen roaming the surface. */
  sp?: Specimen;
  /** Wandering trader: deals still on offer, and the roll for its wares. */
  deals?: number[];
  seed?: number;
  /** Wandering trader: the blueprint, components and finished part rolled for its stall. */
  stock?: { bp?: string; comp?: string; compN?: number; gear?: string };
}

export interface SpaceSave {
  v: 1;
  t: number;
  money: number;
  hp: number;
  energy: number;
  loc: number;
  shipX: number;
  shipY: number;
  tools: Record<string, number>;
  spice: Record<SpiceColor, number>;
  specimens: Specimen[];
  /** Blueprints found or bought (tool ids), and components in stock (see salvage.ts). */
  blueprints?: string[];
  comps?: Record<string, number>;
  owners: Record<string, string | null>;
  planets: Record<string, PlanetState>;
  visited: number[];
  empires: Record<string, EmpireSave>;
  counters: Record<string, number>;
  missions: Mission[];
  offers: Record<string, Mission>;
  nextId: number;
  events: GEvent[];
  flags: Record<string, number | boolean | string>;
  powerCd: number;
  tradeEarned: number;
  homeStar: number;
  knownTwins: number[];
  /** Xeno-Lab: every species ever collected, the homeworld Menagerie, and unpaid tourism takings. */
  catalog?: Specimen[];
  zoo?: Specimen[];
  zooAcc?: number;
  /** Alien zoos you sold specimens to: their appetite (0..1) at time t; it recovers over a few minutes. */
  specDemand?: Record<string, { d: number; t: number }>;
  /** The Galactic Spice Exchange: price indexes, history, news and your contracts (see market.ts). */
  market?: import('./market').MarketState;
  /** Nav-Boy display colour, radio station and the mission you chose to track on the HUD. */
  phosphor?: import('./ui/phosphor').PhColor;
  radio?: string;
  tracked?: number;
}
