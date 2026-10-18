// Part registry: every editor part, for every design kind, registers here.
import type { AbilityId, Design, DesignKind, Diet, PartCategory, PartDef, Stats } from './types';

const parts = new Map<string, PartDef>();

export function registerParts(defs: PartDef[]) {
  for (const d of defs) parts.set(d.id, d);
}
export function getPart(id: string): PartDef | undefined {
  return parts.get(id);
}
export function allParts(): PartDef[] {
  return [...parts.values()];
}
export function partKinds(p: PartDef): DesignKind[] {
  return Array.isArray(p.kind) ? p.kind : [p.kind];
}
export function partsFor(kind: DesignKind, category?: PartCategory): PartDef[] {
  const out: PartDef[] = [];
  for (const p of parts.values()) {
    if (!partKinds(p).includes(kind)) continue;
    if (category && p.category !== category) continue;
    out.push(p);
  }
  return out.sort((a, b) => a.tier - b.tier || a.cost - b.cost || a.name.localeCompare(b.name));
}

/** Spore-style stats: each ability takes the value of the best part granting it (no stacking). */
export function computeStats(d: Design): Stats {
  const s: Stats = {};
  for (const pi of d.parts) {
    const p = parts.get(pi.partId);
    if (!p) continue;
    for (const [k, v] of Object.entries(p.stats) as [AbilityId, number][]) {
      if (d.kind === 'cell') s[k] = (s[k] ?? 0) + v; // cells stack, as in the original
      else s[k] = Math.max(s[k] ?? 0, v);
    }
  }
  if (d.kind === 'creature') {
    // Every mouth grants a mating call; any eye grants sight.
    if (d.parts.some((pi) => parts.get(pi.partId)?.category === 'mouth')) s.call = 1;
    for (const k of ['bite', 'charge', 'strike', 'spit', 'sing', 'dance', 'charm', 'pose', 'speed', 'sprint', 'sneak', 'jump', 'glide', 'health'] as AbilityId[]) {
      s[k] = Math.min(5, s[k] ?? 0);
    }
    if (!s.speed) s.speed = d.parts.some((pi) => parts.get(pi.partId)?.category === 'leg') ? 1 : 0;
  }
  if (d.kind === 'vehicle' || d.kind === 'ship') {
    // Vehicles: stats add up across parts but are capped, so bigger builds are better but bounded.
    const sum: Stats = {};
    for (const pi of d.parts) {
      const p = parts.get(pi.partId);
      if (!p) continue;
      for (const [k, v] of Object.entries(p.stats) as [AbilityId, number][]) sum[k] = (sum[k] ?? 0) + v;
    }
    for (const k of Object.keys(sum) as AbilityId[]) s[k] = Math.min(10, sum[k]!);
    s.armor = Math.min(10, (s.armor ?? 0) + Math.round(d.spine.reduce((a, n) => a + n.r, 0) / 40));
  }
  return s;
}

export function designDiet(d: Design): Diet | null {
  let herb = false, carn = false;
  for (const pi of d.parts) {
    const p = parts.get(pi.partId);
    if (!p?.diet) continue;
    if (p.diet === 'omnivore') { herb = true; carn = true; }
    if (p.diet === 'herbivore') herb = true;
    if (p.diet === 'carnivore') carn = true;
  }
  if (herb && carn) return 'omnivore';
  if (herb) return 'herbivore';
  if (carn) return 'carnivore';
  return null;
}

export function designCost(d: Design): number {
  let c = 0;
  for (const pi of d.parts) c += parts.get(pi.partId)?.cost ?? 0;
  return c;
}

export function complexity(d: Design): number {
  return d.parts.length + Math.max(0, d.spine.length - 3) * 0.5;
}

export function hasCategory(d: Design, cat: PartCategory): boolean {
  return d.parts.some((pi) => parts.get(pi.partId)?.category === cat);
}
