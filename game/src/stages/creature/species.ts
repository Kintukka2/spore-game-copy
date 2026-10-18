// Species and individual creatures: generation from the wild pool, sizing, starting attitudes.
import type { RNG } from '../../engine/rng';
import { clamp } from '../../engine/math';
import { computeStats, designDiet } from '../../design/registry';
import { layoutDesign } from '../../design/render';
import { generateCreature } from '../../design/generate';
import { codexAll, wildPool } from '../../game/codex';
import type { Design, Diet } from '../../design/types';
import type { Difficulty } from '../../game/state';
import { KILLS_NEEDED, LEVEL_HP, LEVEL_LEN, npcDmg, npcSpeed } from './config';
import type { Critter, Relation, Role, Species, SpeciesKind } from './types';

let nextCritterId = 1;

/** Body length normaliser: long or tall designs both read at the intended size. */
export function sizeFor(design: Design, len: number): number {
  const L = layoutDesign(design);
  return clamp(len / Math.max(20, L.width, L.height * 1.15), 0.3, 8);
}

export function makeSpecies(id: number, kind: SpeciesKind, design: Design, level: number, relation: Relation, len?: number): Species {
  const stats = computeStats(design);
  const diet: Diet = designDiet(design) ?? 'herbivore';
  const layout = layoutDesign(design);
  const L = len ?? (kind === 'titan' ? 250 : kind === 'loner' ? 90 : LEVEL_LEN[clamp(level, 1, 4)]);
  const health = stats.health ?? 0;
  let hp = LEVEL_HP[clamp(level, 1, 4)] * (1 + health * 0.12);
  if (kind === 'loner') hp = 150 + health * 12;
  return {
    id, kind, design, name: design.name, level, stats, diet, layout,
    size: sizeFor(design, L),
    relation, befriended: 0, kills: 0, killsNeeded: KILLS_NEEDED[clamp(level, 1, 4)],
    nest: null, maxPop: 0, hatchT: 30, met: false,
    hp, dmg: npcDmg(level, stats.bite ?? 1), speed: npcSpeed(stats.speed ?? 0, level), provoked: false,
  };
}

/** Recompute derived data after a design changed (player's own species after editing). */
export function refreshSpecies(sp: Species, len: number) {
  sp.stats = computeStats(sp.design);
  sp.diet = designDiet(sp.design) ?? 'omnivore';
  sp.layout = layoutDesign(sp.design);
  sp.size = sizeFor(sp.design, len);
  sp.name = sp.design.name;
}

export function startRelation(diet: Diet, level: number, diff: Difficulty, r: RNG): Relation {
  // Level 1 is never hostile; meat-eaters are merely territorial.
  if (level <= 1) return diet === 'carnivore' ? 'annoyed' : r.chance(0.7) ? 'curious' : 'neutral';
  if (diet === 'herbivore') return r.chance(0.55) ? 'curious' : 'neutral';
  if (diet === 'omnivore') {
    if (diff === 'hard' && level >= 3) return 'hostile';
    return level >= 3 || r.chance(0.5) ? 'annoyed' : 'neutral';
  }
  if (diff === 'easy') return 'annoyed';
  if (diff === 'normal' && level === 2) return 'annoyed';
  return 'hostile';
}

const DIET_W: Record<number, [number, number, number]> = { 1: [0.6, 0.3, 0.1], 2: [0.45, 0.3, 0.25], 3: [0.3, 0.3, 0.4], 4: [0.2, 0.3, 0.5] };

/**
 * Designs for the nests, one per level entry. Mixes the player's own Codex creations (via wildPool)
 * with freshly generated species whose part tiers match the nest level.
 */
export function nestDesigns(levels: number[], seed: number, r: RNG, avoidNames: string[]): Design[] {
  const out: (Design | null)[] = levels.map(() => null);
  // Player creations from the Codex (wildPool puts them first).
  const ownCount = Math.min(codexAll('creature').length, Math.floor(levels.length * 0.4), 3);
  if (ownCount > 0) {
    const pool = wildPool('creature', levels.length, seed, 2).slice(0, ownCount)
      .filter((d) => !avoidNames.includes(d.name) && d.spine.length > 0);
    for (const d of pool) {
      const st = computeStats(d);
      const power = (st.bite ?? 0) + (st.charge ?? 0) + (st.strike ?? 0) + (st.spit ?? 0) + (st.sing ?? 0) + (st.dance ?? 0) + (st.charm ?? 0) + (st.pose ?? 0);
      const lvl = power <= 4 ? 1 : power <= 7 ? 2 : power <= 11 ? 3 : 4;
      let idx = levels.findIndex((l, i) => l === lvl && !out[i]);
      if (idx < 0) idx = levels.findIndex((_, i) => !out[i]);
      if (idx >= 0) out[idx] = d;
    }
  }
  const names = new Set(avoidNames);
  return levels.map((lvl, i) => {
    let d = out[i];
    if (!d) {
      const w = DIET_W[lvl] ?? DIET_W[2];
      const diet = r.weighted(['herbivore', 'omnivore', 'carnivore'] as Diet[], (x) => w[x === 'herbivore' ? 0 : x === 'omnivore' ? 1 : 2]);
      d = generateCreature(r, { level: lvl, diet });
    }
    while (names.has(d.name)) d.name = d.name.slice(0, 11) + String.fromCharCode(97 + r.int(0, 25));
    names.add(d.name);
    return d;
  });
}

/** Pick the strongest of a few generated creatures (Titans, Loners). */
export function strongDesign(r: RNG, diet: Diet, tries: number, score: (d: Design) => number): Design {
  let best: Design | null = null, bestS = -Infinity;
  for (let i = 0; i < tries; i++) {
    const d = generateCreature(r, { level: 4, diet });
    const s = score(d);
    if (s > bestS) { bestS = s; best = d; }
  }
  return best!;
}

export function makeCritter(sp: Species, role: Role, x: number, y: number): Critter {
  const sizeK = role === 'baby' ? 0.55 : role === 'alpha' ? 1.2 : 1;
  const hpK = role === 'baby' ? 0.5 : role === 'alpha' ? 1.25 : role === 'pack' ? 1.2 : 1;
  const size = sp.size * sizeK;
  const maxHp = Math.round(sp.hp * hpK);
  return {
    id: nextCritterId++, sp, role, x, y, vx: 0, vy: 0, z: 0, vz: 0,
    facing: Math.random() < 0.5 ? -1 : 1, size, r: critterRadius(sp, size),
    hp: maxHp, maxHp, state: 'wander', st: Math.random() * 3, tx: x, ty: y, target: null,
    phase: Math.random(), walk: 0, action: null, actT: 0, actDur: 1,
    flash: 0, stun: 0, poison: 0, poisonDps: 0, poisonByPlayer: false, cd: 0, cd2: Math.random() * 3,
    emote: null, emoteT: 0, befriended: false, dead: false, gone: false, lulled: 0, fear: 0, aggro: 0,
    hpShow: 0, grow: role === 'baby' ? 100 + Math.random() * 60 : 0, homeX: x, homeY: y, homeR: 120,
    parent: null, dash: 0, dashX: 0, dashY: 0, dashHit: false, dashDmg: 0, tick: Math.random() * 0.25, near: true,
    rounds: role === 'alpha' ? 2 : 1, socialCd: 0, hitByPlayer: -99, anim: 0, wait: Math.random() * 2,
  };
}

export function critterRadius(sp: Species, size: number): number {
  return clamp(sp.layout.width * size * 0.28, 7, 95);
}

/** Visual height of a critter (world units). */
export function critterHeight(c: Critter): number {
  return c.sp.layout.height * c.size;
}

export function isFighter(sp: Species): boolean {
  return sp.kind !== 'nest' || sp.diet !== 'herbivore' || sp.level >= 2 || (sp.stats.charge ?? 0) >= 1 || (sp.stats.strike ?? 0) >= 2;
}

/** Social level a critter performs at for an ability (minimum 1 for its signature move). */
export function socialLevel(sp: Species, ab: 'sing' | 'dance' | 'charm' | 'pose'): number {
  return sp.stats[ab] ?? 0;
}
