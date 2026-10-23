// The Xeno-Lab: what specimens are for, beyond refilling ecosystems.
// - Xenopedia: the first sample of every species is catalogued for a research grant.
// - Menagerie: specimens exhibited at home draw tourists and pay out every minute.
// - Gene Splicer: two specimens fuse into a hybrid that fits any animal slot.
// - Alien zoos: some empire colonies buy one kind of specimen (plants, herbivores, carnivores, ...).
import { RNG, uid } from '../../engine/rng';
import { article, clamp } from '../../engine/math';
import { getPart } from '../../design/registry';
import { cloneDesign } from '../../design/generate';
import type { Design, PartCategory, PartInstance } from '../../design/types';
import type { Specimen } from './types';
import { addMod } from './empires';
import type { World } from './world';

export const GRANT = { animal: 2500, plant: 1000, hybrid: 4000, rare: 10000 };
export const ZOO_CAP = 24;
/** Tourism per exhibit per minute; hybrids and rare sightings draw three times the crowd. */
export const ZOO_RATE = 150;
export function crowd(sp: Specimen): number { return sp.hybrid || sp.rare ? 3 : 1; }
export const SPLICE_COST = 6000;

export function inXenopedia(w: World, sp: Specimen): boolean {
  return (w.s.catalog ?? []).some((c) => c.seed === sp.seed);
}

/** Record a species the first time it is collected. Returns the grant paid (0 if already known). */
export function catalogue(w: World, sp: Specimen): number {
  if (inXenopedia(w, sp)) return 0;
  (w.s.catalog ??= []).push({ ...sp });
  const grant = sp.rare ? GRANT.rare : sp.hybrid ? GRANT.hybrid : sp.diet === 'plant' ? GRANT.plant : GRANT.animal;
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
/** The Menagerie is part of the Xeno-Lab on your homeworld: exhibits are handed over there. */
export function canExhibitHere(w: World): boolean {
  return w.s.loc === w.gal.homeStar && !w.inWarp;
}

export function zooRate(w: World): number {
  return (w.s.zoo ?? []).reduce((a, z) => a + ZOO_RATE * crowd(z), 0);
}

export function exhibit(w: World, i: number): string | null {
  if (!canExhibitHere(w)) return 'Fly to your homeworld to hand specimens to the Menagerie.';
  const sp = w.s.specimens[i];
  if (!sp) return 'That specimen is gone.';
  const zoo = (w.s.zoo ??= []);
  if (zoo.length >= ZOO_CAP) return `The Menagerie is full (${ZOO_CAP} exhibits). Retire one first.`;
  if (zoo.some((z) => z.seed === sp.seed)) return `${article(sp.name, true)} ${sp.name} is already on show. Visitors want something new!`;
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
  if (!canExhibitHere(w)) return 'Exhibits can only be collected at your homeworld.';
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

// ------------------------------------------------------------------ alien zoos
export type BuyerKind = 'plant' | 'herbivore' | 'carnivore' | 'omnivore' | 'exotic';

export const BUYERS: Record<BuyerKind, { icon: string; name: string; wants: string }> = {
  plant: { icon: '🌿', name: 'Botanical garden', wants: 'plants' },
  herbivore: { icon: '🐄', name: 'Grazing park', wants: 'herbivores' },
  carnivore: { icon: '🦖', name: 'Predator arena', wants: 'carnivores' },
  omnivore: { icon: '🐗', name: 'Petting zoo', wants: 'omnivores' },
  exotic: { icon: '🧬', name: 'Curio collector', wants: 'hybrids and rare creatures' },
};

/** Base price by kind; the colony's appetite and the empire's tastes scale it. */
const SPEC_PRICE = { plant: 3500, animal: 6000, hybrid: 12000, rare: 24000 };
/** Seconds for a zoo's appetite to fully recover after selling to it. */
const RESTOCK = 240;
/** Each sale takes this much of the appetite; below MIN_DEMAND they are full. */
const SALE_BITE = 0.3;
const MIN_DEMAND = 0.1;

/** What an empire colony's zoo buys, fixed per world. About half buy nothing at all. */
export function buyerAt(w: World, star: number, idx: number): BuyerKind | null {
  const o = w.peekPS(star, idx).owner;
  if (!o || o === 'player' || o === 'hollow') return null;
  const r = new RNG(`zoo:${star}:${idx}`);
  if (r.chance(0.45)) return null;
  return r.weighted(['plant', 'herbivore', 'carnivore', 'omnivore', 'exotic'] as BuyerKind[], (k) => (k === 'exotic' ? 0.5 : k === 'omnivore' ? 0.8 : 1));
}

export function buyerWants(kind: BuyerKind, sp: Specimen): boolean {
  return kind === 'exotic' ? !!(sp.hybrid || sp.rare) : sp.diet === kind;
}

/** How keen a zoo is right now (0..1): each sale fills it up, and it empties again over a few minutes. */
export function zooAppetite(w: World, star: number, idx: number): number {
  const m = w.s.specDemand?.[w.pkey(star, idx)];
  return m ? clamp(m.d + (w.s.t - m.t) / RESTOCK, 0, 1) : 1;
}

export function zooFull(w: World, star: number, idx: number): boolean {
  return zooAppetite(w, star, idx) < MIN_DEMAND;
}

export function specimenPrice(w: World, star: number, idx: number, sp: Specimen): number {
  const e = w.emap.get(w.peekPS(star, idx).owner ?? '');
  const base = sp.rare ? SPEC_PRICE.rare : sp.hybrid ? SPEC_PRICE.hybrid : sp.diet === 'plant' ? SPEC_PRICE.plant : SPEC_PRICE.animal;
  // Each archetype has its tastes.
  const a = e?.arch;
  const taste = a === 'scholar' ? 1.25 : a === 'merchant' ? 0.85
    : a === 'gardener' && (sp.diet === 'plant' || sp.diet === 'herbivore') ? 1.3
    : a === 'warlord' && sp.diet === 'carnivore' ? 1.3
    : a === 'minstrel' && (sp.hybrid || sp.rare) ? 1.3 : 1;
  return Math.round((base * taste * (0.4 + 0.6 * zooAppetite(w, star, idx))) / 50) * 50;
}

/** Sell a specimen from the hold to the zoo on this world. Returns the price, or why not. */
export function sellSpecimen(w: World, star: number, idx: number, i: number): number | string {
  const kind = buyerAt(w, star, idx);
  const sp = w.s.specimens[i];
  if (!kind || !sp) return 'Nobody here buys that.';
  if (!buyerWants(kind, sp)) return `The ${BUYERS[kind].name.toLowerCase()} only buys ${BUYERS[kind].wants}.`;
  if (zooFull(w, star, idx)) return 'Their enclosures are full. Come back in a few minutes.';
  const price = specimenPrice(w, star, idx, sp);
  w.s.specimens.splice(i, 1);
  w.addMoney(price);
  const key = w.pkey(star, idx);
  (w.s.specDemand ??= {})[key] = { d: zooAppetite(w, star, idx) - SALE_BITE, t: w.s.t };
  const e = w.emap.get(w.peekPS(star, idx).owner ?? '');
  if (e) addMod(e, 'zoo', 'You stocked our zoos', 3, { max: 15, decay: 0.5 });
  w.counter('specimens-sold');
  w.hooks?.changed();
  return price;
}
