// The "Design" model: one data format for everything the player builds in an editor.
// A design is a spine of nodes (the body) plus parts attached to nodes. The same model
// renders as an organic creature, a mechanical vehicle, a building or a starship depending
// on `kind` (Spore's rigblock idea, in 2D side view). Cells use a top-down variant.

export type DesignKind = 'cell' | 'creature' | 'vehicle' | 'building' | 'ship';

export interface SpineNode {
  /** Design-space position. +x = forward (head), +y = down. Units ~ px at zoom 1. */
  x: number;
  y: number;
  /** Radius (half-thickness) of the body at this node. */
  r: number;
}

export interface PartInstance {
  uid: string;
  partId: string;
  /** Index of the spine node this part hangs off. */
  node: number;
  /** Offset from the node centre, design space. */
  ox: number;
  oy: number;
  /** Rotation in radians (0 = part's natural orientation). */
  rot: number;
  /** Uniform scale, typically 0.5..2. */
  scale: number;
  /** Mirror horizontally (faces backward). */
  flip?: boolean;
  /** Top-down designs (cells): also draw a copy mirrored across the body axis. */
  sym?: boolean;
}

export type PatternId = 'none' | 'spots' | 'stripes' | 'bands' | 'belly' | 'patches' | 'dots' | 'tiger' | 'gradient' | 'scales';

export interface Palette {
  base: string;
  coat: string;
  detail: string;
  pattern: PatternId;
}

export interface Design {
  v: 1;
  kind: DesignKind;
  name: string;
  spine: SpineNode[];
  parts: PartInstance[];
  colors: Palette;
  /** Optional metadata: author, created, tags, vehicle role etc. */
  meta?: Record<string, string | number | boolean>;
}

/** Abilities used by creature-type designs (values 0..5). */
export type AbilityId =
  | 'bite' | 'charge' | 'strike' | 'spit'
  | 'sing' | 'dance' | 'charm' | 'pose'
  | 'speed' | 'sprint' | 'sneak' | 'jump' | 'glide' | 'health'
  | 'sight' | 'grasp' | 'call'
  // tribal outfit bonuses
  | 'gather' | 'combat' | 'social'
  // vehicles / ships / buildings
  | 'power' | 'armor' | 'move' | 'cargo' | 'faith' | 'trade' | 'energy' | 'shield' | 'happy' | 'produce' | 'house';

export type Stats = Partial<Record<AbilityId, number>>;

export type Diet = 'herbivore' | 'carnivore' | 'omnivore';

export type PartCategory =
  // creature
  | 'mouth' | 'eye' | 'leg' | 'arm' | 'weapon' | 'detail' | 'wing' | 'tail'
  // cell
  | 'cell-mouth' | 'cell-move' | 'cell-weapon' | 'cell-eye'
  // tribal outfit
  | 'hat' | 'mask' | 'chest' | 'shoulder' | 'trinket'
  // vehicle
  | 'locomotion' | 'v-weapon' | 'v-tool' | 'v-detail' | 'cockpit'
  // building
  | 'roof' | 'wall' | 'b-detail' | 'door'
  // ship
  | 's-engine' | 's-wing' | 's-detail' | 's-weapon';

/** Where a part's anchor snaps when dropped on a body. */
export type Snap = 'any' | 'head-front' | 'head' | 'bottom' | 'top' | 'side' | 'back' | 'perimeter';

export interface PartDrawCtx {
  colors: Palette;
  /** Seconds, for idle animation. */
  t: number;
  /** 0..1 action intensity (mouth open, wing flap, attack thrust). */
  act: number;
  /** Which action is playing, if any. */
  action?: string;
  /** True when drawing the far-side copy of a paired limb. */
  far?: boolean;
  /** Body radius at the attach node (lets parts size themselves). */
  nodeR: number;
  /** For legs/arms: the IK solution in part-local space. */
  limb?: LimbPose;
  /** True when rendering an editor palette thumbnail. */
  thumb?: boolean;
  /** Distance-like clock that only advances while the design moves (wheels, treads, walker legs). */
  travel?: number;
}

export interface LimbPose {
  /** Hip/shoulder is at (0,0). Knee/elbow and foot/hand positions in local space. */
  knee: { x: number; y: number };
  foot: { x: number; y: number };
  /** Foot contact 0..1 (1 = planted). */
  plant: number;
}

export interface PartDef {
  id: string;
  name: string;
  kind: DesignKind | DesignKind[];
  category: PartCategory;
  /** Unlock tier (1 = available at start). */
  tier: number;
  cost: number;
  stats: Stats;
  /** Mouths only. */
  diet?: Diet;
  snap: Snap;
  /** Draw order relative to the body. 'back' parts render behind the body. */
  layer: 'back' | 'front' | 'top';
  /** Paired limbs (legs/arms/wings/ears) render a darker far-side copy. */
  paired?: boolean;
  /** For limbs: total reach (thigh + shin) in design units at scale 1. */
  limbLength?: number;
  /** Approximate bounding radius at scale 1 (for hit-testing and thumbnails). */
  radius: number;
  /** Short flavour/help text. */
  desc?: string;
  /** Draw in part-local space: anchor at (0,0), pointing +x forward, +y down. */
  draw(g: CanvasRenderingContext2D, c: PartDrawCtx): void;
}
