// Derives a cell's gameplay abilities from its Design. Behaviour is keyed off part categories,
// diets and stats (not part ids), so parts added to the catalog later work automatically:
//   cell-mouth: herbivore diet = filter (plants), carnivore = jaw (meat + bite), omnivore = proboscis (drain + both foods)
//   cell-move:  speed stat = swim speed, jump stat = cilia (fast turns, strafing), sprint stat = jet (bursts)
//   cell-weapon: charge = spike (ram), spit = poison trail, strike = electric pulse
//   cell-eye / sight: vision
import { computeStats, getPart } from '../../design/registry';
import type { Design } from '../../design/types';

export interface CellAbilities {
  eatsPlants: boolean;
  eatsMeat: boolean;
  hasMouth: boolean;
  /** Jaw-style biting power (0 = cannot bite). */
  bite: number;
  /** Proboscis count (drains live cells). */
  drain: number;
  filter: number;
  speed: number;
  /** Max turn rate, radians per second. */
  turn: number;
  cilia: number;
  jet: number;
  flagella: number;
  spikes: number;
  /** Directions spikes point, design space (0 = forward), mirrored copies included. */
  spikeDirs: number[];
  poison: number;
  electric: number;
  sight: number;
  /** Body metrics in design units. */
  radius: number;
  centerX: number;
  length: number;
  /** Distance from the design origin to the mouth tip along +x. */
  mouthX: number;
  /** Distance from the origin to the tail along -x (positive number). */
  tailX: number;
}

export function computeAbilities(d: Design): CellAbilities {
  const st = computeStats(d);
  const a: CellAbilities = {
    eatsPlants: false, eatsMeat: false, hasMouth: false, bite: 0, drain: 0, filter: 0,
    speed: 0, turn: 3, cilia: 0, jet: 0, flagella: 0,
    spikes: 0, spikeDirs: [], poison: 0, electric: 0, sight: 0,
    radius: 14, centerX: 0, length: 40, mouthX: 20, tailX: 20,
  };
  // Body metrics from the spine.
  let front = -Infinity, back = Infinity, halfW = 0;
  for (const n of d.spine) {
    front = Math.max(front, n.x + n.r);
    back = Math.min(back, n.x - n.r);
    halfW = Math.max(halfW, Math.abs(n.y) + n.r);
  }
  if (!isFinite(front)) { front = 20; back = -20; halfW = 10; }
  a.length = front - back;
  a.centerX = (front + back) / 2;
  a.radius = Math.max(8, 0.5 * (a.length / 2 + halfW) * 1.05);
  a.mouthX = front + 2;
  a.tailX = -back;

  for (const pi of d.parts) {
    const p = getPart(pi.partId);
    if (!p) continue;
    const copies = pi.sym && Math.abs(pi.oy) > 2 ? 2 : 1;
    switch (p.category) {
      case 'cell-mouth': {
        a.hasMouth = true;
        const node = d.spine[pi.node];
        if (node) a.mouthX = Math.max(a.mouthX, node.x + pi.ox + p.radius * 0.5 * pi.scale);
        if (p.diet === 'herbivore') { a.eatsPlants = true; a.filter++; }
        else if (p.diet === 'carnivore') { a.eatsMeat = true; a.bite += Math.max(1, p.stats.bite ?? 1); }
        else if (p.diet === 'omnivore') { a.eatsPlants = true; a.eatsMeat = true; a.drain++; }
        break;
      }
      case 'cell-move': {
        if ((p.stats.jump ?? 0) > 0) a.cilia++;
        else if ((p.stats.sprint ?? 0) > 0) a.jet++;
        else a.flagella++;
        break;
      }
      case 'cell-weapon': {
        if ((p.stats.charge ?? 0) > 0) {
          a.spikes++;
          a.spikeDirs.push(pi.rot);
          if (copies === 2) a.spikeDirs.push(-pi.rot);
        }
        if ((p.stats.spit ?? 0) > 0) a.poison++;
        if ((p.stats.strike ?? 0) > 0) a.electric++;
        break;
      }
      case 'cell-eye':
        a.sight += copies;
        break;
      default:
        if ((p.stats.sight ?? 0) > 0) a.sight += copies;
    }
  }
  a.speed = Math.min(6, st.speed ?? 0);
  a.turn = 4 + (a.cilia > 0 ? 4.4 + 0.5 * (a.cilia - 1) : 0) + a.speed * 0.12;
  return a;
}

/** Top swim speed in world units per second at size 1. */
export function swimSpeed(ab: CellAbilities): number {
  return 34 + 24 * Math.pow(ab.speed, 0.78);
}

/** A short "Speed 2 · Spikes 1 · Poison" summary for toasts. */
export function describeAbilities(ab: CellAbilities): string {
  const bits: string[] = [];
  bits.push(`Speed ${ab.speed}`);
  if (ab.bite) bits.push(`Bite ${ab.bite}`);
  if (ab.drain) bits.push('Drain');
  if (ab.spikes) bits.push(`Spikes ${ab.spikes}`);
  if (ab.poison) bits.push(`Poison ${ab.poison}`);
  if (ab.electric) bits.push(`Shock ${ab.electric}`);
  if (ab.jet) bits.push('Jet');
  if (ab.cilia) bits.push('Cilia');
  bits.push(ab.sight ? `Eyes ${ab.sight}` : 'Blind');
  return bits.join(' · ');
}
