// The Xeno-Lab: what specimens are for, beyond refilling ecosystems.
// - Xenopedia: the first sample of every species is catalogued for a research grant.
// - Menagerie: specimens exhibited at home draw tourists and pay out every minute.
// - Gene Splicer: two specimens fuse into a hybrid that fits any animal slot.
import { RNG, uid } from '../../engine/rng';
import { clamp } from '../../engine/math';
import { getPart } from '../../design/registry';
import { cloneDesign } from '../../design/generate';
import type { Design, PartCategory, PartInstance } from '../../design/types';
import type { Specimen } from './types';
import type { World } from './world';

export const GRANT = { animal: 2500, plant: 1000, hybrid: 4000 };
export const ZOO_CAP = 24;
/** Tourism per exhibit per minute; hybrids draw three times the crowd. */
export const ZOO_RATE = 150;
export const SPLICE_COST = 6000;

export function inXenopedia(w: World, sp: Specimen): boolean {
  return (w.s.catalog ?? []).some((c) => c.seed === sp.seed);
}

/** Record a species the first time it is collected. Returns the grant paid (0 if already known). */
export function catalogue(w: World, sp: Specimen): number {
  if (inXenopedia(w, sp)) return 0;
  (w.s.catalog ??= []).push({ ...sp });
  const grant = sp.hybrid ? GRANT.hybrid : sp.diet === 'plant' ? GRANT.plant : GRANT.animal;
  w.addMoney(grant);
  w.counter('catalogued');
  return grant;
}

/** Catalogue anything aboard that predates the Xenopedia. Returns the total grant. */
export function syncCatalog(w: World): number {
  let total = 0;
  for (const sp of w.s.specimens) total += catalogue(w, sp);
  return total;
}

// ------------------------------------------------------------------ menagerie
/** Exhibits can be donated while the ship is in one of your own systems. */
export function canExhibitHere(w: World): boolean {
  return w.ownerOf(w.s.loc) === 'player' && !w.inWarp;
}

export function zooRate(w: World): number {
  return (w.s.zoo ?? []).reduce((a, z) => a + ZOO_RATE * (z.hybrid ? 3 : 1), 0);
}

export function exhibit(w: World, i: number): string | null {
  if (!canExhibitHere(w)) return 'Fly to your homeworld or a colony system to hand specimens to the Menagerie.';
  const sp = w.s.specimens[i];
  if (!sp) return 'That specimen is gone.';
  const zoo = (w.s.zoo ??= []);
  if (zoo.length >= ZOO_CAP) return `The Menagerie is full (${ZOO_CAP} exhibits). Retire one first.`;
  if (zoo.some((z) => z.seed === sp.seed)) return `A ${sp.name} is already on show. Visitors want something new!`;
  w.s.specimens.splice(i, 1);
  zoo.push(sp);
  w.counter('exhibits');
  w.hooks?.changed();
  return null;
}

/** Move an exhibit back into the hold (needs a free cargo slot). */
export function retire(w: World, i: number): string | null {
  const zoo = w.s.zoo ?? [];
  if (!zoo[i]) return null;
  if (!canExhibitHere(w)) return 'Exhibits can only be collected from one of your own systems.';
  if (w.cargoUsed >= w.cargoCap) return 'Your cargo hold is full.';
  w.s.specimens.push(zoo.splice(i, 1)[0]);
  w.hooks?.changed();
  return null;
}

/** Tourism income, paid in whole credits as it accrues. */
export function zooTick(w: World, dt: number) {
  const rate = zooRate(w);
  if (!rate) return;
  const acc = (w.s.zooAcc ?? 0) + (rate / 60) * dt;
  const whole = Math.floor(acc);
  w.s.zooAcc = acc - whole;
  if (whole > 0) w.addMoney(whole);
}

// ------------------------------------------------------------------ gene splicer
const GROUPS: PartCategory[][] = [['mouth'], ['eye'], ['leg', 'arm'], ['weapon'], ['detail', 'tail', 'wing']];

export function canSplice(w: World, a: number, b: number): string | null {
  const x = w.s.specimens[a], y = w.s.specimens[b];
  if (!x || !y || a === b) return 'Pick two specimens to splice.';
  if (x.diet === 'plant' || y.diet === 'plant') return 'Only animals can be spliced.';
  if (w.s.money < SPLICE_COST) return 'Not enough money for the splice.';
  return null;
}

/** Portmanteau of two species names: "Hun" × "Pusopod" → "Huopod". */
export function hybridName(a: string, b: string): string {
  const n = a.slice(0, Math.max(2, Math.ceil(a.length / 2))) + b.slice(Math.floor(b.length / 2));
  return (n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()).slice(0, 16);
}

/** A's skeleton with blended girth; each organ group (mouths, eyes, limbs, weapons, frills) from one parent. */
export function hybridDesign(a: Design, b: Design, r: RNG, name: string): Design {
  const d = cloneDesign(a);
  d.name = name;
  const la = a.spine.length, lb = b.spine.length;
  const mapNode = (n: number) => clamp(Math.round((n / Math.max(1, lb - 1)) * (la - 1)), 0, la - 1);
  d.spine = a.spine.map((n, i) => {
    const m = b.spine[clamp(Math.round((i / Math.max(1, la - 1)) * (lb - 1)), 0, lb - 1)];
    return { ...n, r: Math.round((n.r + m.r) / 2) };
  });
  const groupOf = (pi: PartInstance) => {
    const c = getPart(pi.partId)?.category;
    return c ? GROUPS.findIndex((g) => g.includes(c)) : -1;
  };
  const fromB = GROUPS.map(() => r.chance(0.5));
  // Always a real mix: at least one group from each parent.
  if (fromB.every(Boolean)) fromB[r.int(0, GROUPS.length - 1)] = false;
  if (!fromB.some(Boolean)) fromB[r.int(0, GROUPS.length - 1)] = true;
  const keepA = a.parts.filter((pi) => { const g = groupOf(pi); return g < 0 || !fromB[g]; }).map((pi) => ({ ...pi, uid: uid() }));
  const takeB = b.parts.filter((pi) => { const g = groupOf(pi); return g >= 0 && fromB[g]; }).map((pi) => {
    const node = mapNode(pi.node);
    const k = d.spine[node].r / Math.max(1, b.spine[pi.node]?.r ?? d.spine[node].r);
    return { ...pi, uid: uid(), node, ox: pi.ox * k, oy: pi.oy * k };
  });
  d.parts = [...keepA, ...takeB];
  d.colors = {
    base: a.colors.base,
    coat: b.colors.base,
    detail: r.chance(0.5) ? a.colors.detail : b.colors.detail,
    pattern: b.colors.pattern !== 'none' ? b.colors.pattern : a.colors.pattern,
  };
  return d;
}

/** Consume two specimens and return the (not yet stored) hybrid and its design, ready for the editor. */
export function splice(w: World, a: number, b: number): { hybrid: Specimen; parents: [Specimen, Specimen] } | string {
  const err = canSplice(w, a, b);
  if (err) return err;
  const x = w.s.specimens[a], y = w.s.specimens[b];
  const dx = w.specimenDesign(x), dy = w.specimenDesign(y);
  if (!dx || !dy) return 'The samples would not take.';
  w.addMoney(-SPLICE_COST);
  const seed = (x.seed ^ Math.imul(y.seed, 31) ^ (Date.now() & 0xffff)) >>> 0;
  const name = hybridName(x.name, y.name);
  const design = hybridDesign(dx, dy, new RNG(seed), name);
  for (const i of [a, b].sort((p, q) => q - p)) w.s.specimens.splice(i, 1);
  w.counter('hybrids');
  return { hybrid: { seed, name, diet: 'omnivore', hybrid: true, design, parents: [x.name, y.name] }, parents: [x, y] };
}
