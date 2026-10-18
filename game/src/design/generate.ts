// Procedural generators for designs: wildlife, rival civilisations, alien empires.
import { RNG, uid } from '../engine/rng';
import { hsl } from './color';
import { getPart, partsFor } from './registry';
import type { Design, DesignKind, Diet, Palette, PartCategory, PartDef, PartInstance, PatternId, SpineNode } from './types';
import { speciesName } from '../game/names';

const PATTERNS: PatternId[] = ['none', 'spots', 'stripes', 'bands', 'belly', 'patches', 'dots', 'tiger', 'gradient', 'scales'];

export function randomPalette(r: RNG, opts: { vivid?: boolean } = {}): Palette {
  const h = r.range(0, 360);
  const scheme = r.int(0, 3);
  const coatH = scheme === 0 ? h + 180 : scheme === 1 ? h + 30 : scheme === 2 ? h - 40 : h + r.range(90, 150);
  const sat = opts.vivid ? r.range(0.6, 0.85) : r.range(0.35, 0.7);
  return {
    base: hsl(h, sat, r.range(0.45, 0.62)),
    coat: hsl(coatH % 360, Math.min(1, sat + 0.1), r.range(0.35, 0.55)),
    detail: hsl((h + r.range(-20, 20) + 360) % 360, 0.5, r.range(0.75, 0.9)),
    pattern: r.pick(PATTERNS),
  };
}

function pickPart(r: RNG, kind: DesignKind, cat: PartCategory, maxTier: number, filter?: (p: PartDef) => boolean): PartDef | null {
  let list = partsFor(kind, cat).filter((p) => p.tier <= maxTier && (!filter || filter(p)));
  if (list.length === 0) list = partsFor(kind, cat).filter((p) => !filter || filter(p));
  if (list.length === 0) return null;
  // Prefer higher tiers when available.
  return r.weighted(list, (p) => 1 + p.tier * 0.6);
}

function inst(p: PartDef, node: number, ox: number, oy: number, rot = 0, scale = 1, extra: Partial<PartInstance> = {}): PartInstance {
  return { uid: uid(), partId: p.id, node, ox, oy, rot, scale, ...extra };
}

export interface CreatureGenOpts {
  level?: number; // 1..4 roughly matches unlock tier
  diet?: Diet;
  name?: string;
  legs?: boolean;
  size?: number; // multiplier on radii
}

export function generateCreature(r: RNG, o: CreatureGenOpts = {}): Design {
  const level = o.level ?? r.int(1, 3);
  const size = o.size ?? 1;
  const n = r.int(3, 6);
  const plan = r.pick(['long', 'upright', 'round', 'arched'] as const);
  const spine: SpineNode[] = [];
  const baseR = r.range(9, 15) * size;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let x = (i - (n - 1) / 2) * baseR * r.range(1.0, 1.35);
    let y = 0;
    let rad = baseR * (0.75 + Math.sin(t * Math.PI) * 0.45) * r.range(0.85, 1.15);
    if (plan === 'upright') { y = -t * t * baseR * 2.2; x *= 0.7; }
    if (plan === 'arched') y = -Math.sin(t * Math.PI) * baseR * 0.9;
    if (plan === 'round') rad *= 1.25;
    if (i === n - 1) rad *= r.range(0.7, 1.05); // head
    if (i === 0) rad *= 0.7;
    spine.push({ x: Math.round(x), y: Math.round(y), r: Math.round(Math.max(6, rad)) });
  }
  const parts: PartInstance[] = [];
  const head = n - 1, hn = spine[head];
  const diet = o.diet ?? r.pick(['herbivore', 'carnivore', 'omnivore'] as Diet[]);
  const mouth = pickPart(r, 'creature', 'mouth', level, (p) => p.diet === diet) ?? pickPart(r, 'creature', 'mouth', level);
  if (mouth) parts.push(inst(mouth, head, hn.r * 0.55, hn.r * 0.15, 0, r.range(0.8, 1.2) * Math.max(0.7, hn.r / 13)));
  const eyes = r.weighted([1, 2, 3], (k) => (k === 2 ? 3 : 1));
  const eye = pickPart(r, 'creature', 'eye', 4);
  if (eye) for (let i = 0; i < eyes; i++) parts.push(inst(eye, head, hn.r * (0.05 + i * 0.32) - (eyes - 1) * 0.1 * hn.r, -hn.r * (0.45 + (i % 2) * 0.15), 0, r.range(0.8, 1.25)));
  const wantLegs = o.legs ?? r.chance(0.94);
  if (wantLegs) {
    const leg = pickPart(r, 'creature', 'leg', level);
    if (leg) {
      const pairs = n >= 5 && r.chance(0.5) ? 2 : r.chance(0.12) ? 3 : 1;
      const idxs = pairs === 1 ? [Math.floor((n - 1) / 2)] : pairs === 2 ? [1, n - 2] : [0, Math.floor(n / 2), n - 1];
      const legScale = r.range(0.8, 1.3) * size;
      for (const ni of idxs) parts.push(inst(leg, Math.min(n - 1, ni), 0, spine[Math.min(n - 1, ni)].r * 0.55, 0, legScale));
    }
  }
  if (r.chance(0.5)) {
    const arm = pickPart(r, 'creature', 'arm', level);
    const ni = Math.max(0, n - 2);
    if (arm) parts.push(inst(arm, ni, spine[ni].r * 0.3, spine[ni].r * 0.2, 0, r.range(0.8, 1.2)));
  }
  if (r.chance(0.5)) {
    const w = pickPart(r, 'creature', 'weapon', level);
    if (w) parts.push(inst(w, head, -hn.r * 0.1, -hn.r * 0.75, 0, r.range(0.8, 1.2)));
  }
  if (r.chance(0.6)) {
    const d = pickPart(r, 'creature', 'detail', level);
    const ni = r.int(0, n - 1);
    if (d) parts.push(inst(d, ni, 0, -spine[ni].r * 0.85, 0, r.range(0.8, 1.3)));
  }
  if (r.chance(0.65)) {
    const t = pickPart(r, 'creature', 'tail', level);
    if (t) parts.push(inst(t, 0, -spine[0].r * 0.6, 0, 0, r.range(0.8, 1.3)));
  }
  if (r.chance(0.18)) {
    const wg = pickPart(r, 'creature', 'wing', level);
    const ni = Math.floor(n / 2);
    if (wg) parts.push(inst(wg, ni, 0, -spine[ni].r * 0.7, 0, r.range(0.8, 1.2)));
  }
  return { v: 1, kind: 'creature', name: o.name ?? speciesName(r), spine, parts, colors: randomPalette(r) };
}

export function generateCell(r: RNG, diet: Diet = 'herbivore', level = 1, name?: string): Design {
  const spine: SpineNode[] = [];
  const n = 6;
  const base = r.range(6, 9);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    spine.push({ x: (i - 2.5) * 6.5, y: 0, r: Math.round(base * (0.7 + Math.sin(t * Math.PI) * 0.5) * r.range(0.9, 1.1)) });
  }
  const parts: PartInstance[] = [];
  const head = spine[n - 1], tail = spine[0];
  const mouthId = diet === 'herbivore' ? 'c-filter' : diet === 'carnivore' ? 'c-jaw' : 'c-proboscis';
  const mouth = getPart(mouthId) ?? getPart('c-filter');
  if (mouth) parts.push(inst(mouth, n - 1, head.r * 0.8, 0));
  const move = level >= 2 && r.chance(0.5) ? getPart('c-jet') : getPart('c-flagellum');
  if (move) parts.push(inst(move, 0, -tail.r * 0.9, 0, Math.PI));
  if (r.chance(0.3 + level * 0.15)) {
    const sp = getPart('c-spike');
    const ni = r.int(2, 4);
    if (sp) parts.push(inst(sp, ni, 0, spine[ni].r * 0.9, Math.PI / 2, 1, { sym: true }));
  }
  if (level >= 2 && r.chance(0.3)) { const p = getPart('c-poison'); if (p) parts.push(inst(p, 0, -tail.r * 0.6, tail.r * 0.6, Math.PI * 0.8, 1, { sym: true })); }
  if (level >= 3 && r.chance(0.25)) { const p = getPart('c-electric'); if (p) parts.push(inst(p, 3, 0, -spine[3].r * 0.9, -Math.PI / 2, 1, { sym: true })); }
  const eye = getPart(r.chance(0.7) ? 'c-eye' : 'c-eyestalk');
  if (eye) parts.push(inst(eye, n - 2, 0, -spine[n - 2].r * 0.75, -Math.PI / 2, 1, { sym: true }));
  return { v: 1, kind: 'cell', name: name ?? speciesName(r), spine, parts, colors: randomPalette(r, { vivid: true }) };
}

/** A fresh, minimal starting design for each editor kind. */
export function blankDesign(kind: DesignKind, name = 'Untitled'): Design {
  const colors: Palette = { base: '#5cc8ff', coat: '#2a6fb0', detail: '#e9f6ff', pattern: 'none' };
  switch (kind) {
    case 'cell':
      return { v: 1, kind, name, spine: [-16, -10, -4, 3, 9, 15].map((x, i) => ({ x, y: 0, r: [6, 8, 9, 9, 8, 7][i] })), parts: [], colors: { ...colors, base: '#7fe3c4', coat: '#2c9f86' } };
    case 'creature':
      return { v: 1, kind, name, spine: [{ x: -26, y: 0, r: 10 }, { x: -9, y: -2, r: 15 }, { x: 9, y: -2, r: 15 }, { x: 25, y: -10, r: 12 }], parts: [], colors: { base: '#ffb36b', coat: '#d9653b', detail: '#fff1d6', pattern: 'spots' } };
    case 'vehicle':
      return { v: 1, kind, name, spine: [{ x: -20, y: 0, r: 12 }, { x: 0, y: -2, r: 14 }, { x: 20, y: 0, r: 12 }], parts: [], colors: { base: '#c9d6e3', coat: '#e9483b', detail: '#ffd166', pattern: 'stripes' } };
    case 'building':
      return { v: 1, kind, name, spine: [{ x: 0, y: 0, r: 16 }, { x: 0, y: -30, r: 14 }, { x: 0, y: -56, r: 12 }], parts: [], colors: { base: '#e7dcc8', coat: '#9b5d3a', detail: '#ffd166', pattern: 'none' } };
    case 'ship':
      return { v: 1, kind, name, spine: [{ x: -22, y: 0, r: 10 }, { x: 0, y: 0, r: 14 }, { x: 22, y: 0, r: 10 }], parts: [], colors: { base: '#b8c7d9', coat: '#5a4fcf', detail: '#3ee6c4', pattern: 'bands' } };
  }
}

export function cloneDesign(d: Design): Design {
  return JSON.parse(JSON.stringify(d));
}

// ------------------------------------------------------------------ Mechanical generators

export type VehicleRole = 'military' | 'economic' | 'religious';
export type VehicleMedium = 'land' | 'sea' | 'air';

function addByCat(r: RNG, d: Design, kind: DesignKind, cat: PartCategory, node: number, ox: number, oy: number, extra: Partial<PartInstance> = {}, filter?: (p: PartDef) => boolean) {
  const list = partsFor(kind, cat).filter((p) => !filter || filter(p));
  if (!list.length) return;
  const p = r.pick(list);
  d.parts.push(inst(p, node, ox, oy, 0, extra.scale ?? 1, extra));
}

/** A vehicle for AI nations or as a starting template. Tool parts are filtered by role via meta tags in their id. */
export function generateVehicle(r: RNG, role: VehicleRole, medium: VehicleMedium = 'land', colors?: Palette): Design {
  const n = r.int(2, 4);
  const spine: SpineNode[] = [];
  for (let i = 0; i < n; i++) spine.push({ x: Math.round((i - (n - 1) / 2) * r.range(16, 22)), y: Math.round(i === n - 1 ? -r.range(0, 6) : 0), r: Math.round(r.range(9, 15)) });
  const d: Design = { v: 1, kind: 'vehicle', name: speciesName(r) + ' ' + r.pick(['Mk I', 'Rover', 'Runner', 'Hauler', 'Strider', 'Wing', 'Skiff']), spine, parts: [], colors: colors ?? randomPalette(r, { vivid: true }), meta: { role, medium } };
  const medTag = (p: PartDef) => (medium === 'land' ? !/sea|air|prop|hull|wing|jet/.test(p.id) : medium === 'sea' ? /sea|hull|prop|motor/.test(p.id) : /air|wing|jet|rotor|prop/.test(p.id));
  if (medium === 'land' || medium === 'sea') {
    for (const ni of medium === 'land' ? [0, n - 1] : [Math.floor(n / 2)]) addByCat(r, d, 'vehicle', 'locomotion', ni, 0, spine[ni].r * 0.85, {}, medTag);
  } else {
    addByCat(r, d, 'vehicle', 'locomotion', Math.floor(n / 2), 0, -spine[Math.floor(n / 2)].r * 0.6, {}, medTag);
  }
  const roleTag = (p: PartDef) => p.id.includes(role.slice(0, 3)) || p.id.includes(role);
  addByCat(r, d, 'vehicle', role === 'military' ? 'v-weapon' : 'v-tool', n - 1, 0, -spine[n - 1].r * 0.8, {}, (p) => role === 'military' || roleTag(p));
  if (r.chance(0.7)) addByCat(r, d, 'vehicle', 'cockpit', n - 1, spine[n - 1].r * 0.2, -spine[n - 1].r * 0.5);
  if (r.chance(0.6)) addByCat(r, d, 'vehicle', 'v-detail', 0, -spine[0].r * 0.6, -spine[0].r * 0.6);
  return d;
}

export type BuildingType = 'cityhall' | 'house' | 'factory' | 'entertainment';

export function generateBuilding(r: RNG, type: BuildingType, colors?: Palette): Design {
  const floors = type === 'cityhall' ? r.int(3, 4) : type === 'house' ? r.int(1, 2) : r.int(2, 3);
  const w = type === 'house' ? r.range(11, 14) : type === 'factory' ? r.range(15, 19) : r.range(13, 17);
  const spine: SpineNode[] = [];
  let y = 0;
  for (let i = 0; i < floors; i++) {
    const rr = Math.round(w * (1 - i * 0.1));
    spine.push({ x: 0, y: Math.round(y), r: rr });
    y -= rr * 1.85;
  }
  const d: Design = { v: 1, kind: 'building', name: speciesName(r) + ' ' + ({ cityhall: 'Hall', house: 'House', factory: 'Works', entertainment: 'Arena' } as const)[type], spine, parts: [], colors: colors ?? randomPalette(r), meta: { btype: type } };
  addByCat(r, d, 'building', 'roof', floors - 1, 0, -spine[floors - 1].r * 0.95);
  addByCat(r, d, 'building', 'door', 0, 0, spine[0].r * 0.35);
  if (r.chance(0.7)) addByCat(r, d, 'building', 'wall', Math.floor(floors / 2), spine[0].r * 0.9, 0);
  if (r.chance(0.6)) addByCat(r, d, 'building', 'b-detail', floors - 1, -spine[floors - 1].r * 0.6, -spine[floors - 1].r * 0.8);
  return d;
}

export function generateShip(r: RNG, colors?: Palette, name?: string): Design {
  const n = r.int(2, 4);
  const spine: SpineNode[] = [];
  for (let i = 0; i < n; i++) spine.push({ x: Math.round((i - (n - 1) / 2) * r.range(18, 26)), y: 0, r: Math.round(r.range(8, 14) * (i === Math.floor(n / 2) ? 1.25 : 1)) });
  const d: Design = { v: 1, kind: 'ship', name: name ?? speciesName(r) + ' ' + r.pick(['Voyager', 'Seeker', 'Wanderer', 'Lance', 'Ark', 'Comet', 'Dawn']), spine, parts: [], colors: colors ?? randomPalette(r, { vivid: true }) };
  addByCat(r, d, 'ship', 's-engine', 0, -spine[0].r * 1.1, 0);
  const mid = Math.floor(n / 2);
  addByCat(r, d, 'ship', 's-wing', mid, -spine[mid].r * 0.2, spine[mid].r * 0.5);
  if (r.chance(0.8)) addByCat(r, d, 'ship', 'cockpit', n - 1, spine[n - 1].r * 0.2, -spine[n - 1].r * 0.6);
  if (r.chance(0.6)) addByCat(r, d, 'ship', 's-weapon', n - 1, spine[n - 1].r * 0.9, spine[n - 1].r * 0.2);
  if (r.chance(0.7)) addByCat(r, d, 'ship', 's-detail', mid, 0, -spine[mid].r * 0.9);
  return d;
}

/** Early land creature derived from the cell: keeps colours, mouth diet and eyes; no legs yet. */
export function creatureFromCell(cell: Design, diet: Diet, name?: string): Design {
  const d = blankDesign('creature', name ?? cell.name);
  d.colors = { ...cell.colors };
  const head = d.spine.length - 1, hn = d.spine[head];
  const mouth = partsFor('creature', 'mouth').find((p) => p.diet === diet && p.tier === 1) ?? partsFor('creature', 'mouth')[0];
  if (mouth) d.parts.push(inst(mouth, head, hn.r * 0.55, hn.r * 0.15, 0, 1));
  const eyeCount = Math.max(1, Math.min(3, cell.parts.filter((p) => p.partId.startsWith('c-eye')).length));
  const eye = partsFor('creature', 'eye')[0];
  if (eye) for (let i = 0; i < eyeCount; i++) d.parts.push(inst(eye, head, hn.r * [0.1, 0.55, -0.35][i], -hn.r * [0.45, 0.3, 0.55][i], 0, 1));
  return d;
}
