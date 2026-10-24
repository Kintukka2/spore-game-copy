// Economy: colonies and spice production, supply-and-demand prices, trade routes and
// economic takeovers, terraforming and ecosystems.
import { clamp } from '../../engine/math';
import { audio } from '../../engine/audio';
import { ECO_ROW, SPICE, SPICE_COLORS, T_RING, tScoreOf, type SpiceColor } from './data';
import type { Empire, PlanetState, Specimen } from './types';
import { addMod, relation, strength, systemPrice } from './empires';
import { onTerraformed } from './missions';
import type { World } from './world';
import { marketFactor, marketPress, marketStory } from './market';

// ------------------------------------------------------------------ colonies
export const BUILDINGS = {
  factory: { name: 'Spice Works', icon: '🏭', price: 15000, desc: '+1.5 spice/min, −1 happiness' },
  leisure: { name: 'Leisure Dome', icon: '🎡', price: 10000, desc: '+2 happiness' },
  turret: { name: 'Defence Tower', icon: '🗼', price: 12000, desc: 'Helps hold off raids' },
} as const;
export type BuildingId = keyof typeof BUILDINGS;

export function isHomeworld(w: World, star: number, idx: number) {
  return star === w.gal.homeStar && idx === 1;
}
export function slots(ps: PlanetState): number { return ps.cities * 3; }
export function used(ps: PlanetState): number { return ps.bld.factory + ps.bld.leisure + ps.bld.turret; }
export function happiness(w: World, ps: PlanetState): number {
  return 1 + ps.bld.leisure * 2 - ps.bld.factory + (w.perks.has('crowd-pleaser') ? 3 : 0);
}
export function storageCap(w: World, star: number, idx: number, ps: PlanetState): number {
  if (isHomeworld(w, star, idx)) return 25;
  return 10 * Math.max(1, ps.cities) * (ps.silo ? 2 : 1);
}
/** Spice per minute. */
export function production(w: World, star: number, idx: number, ps = w.peekPS(star, idx)): number {
  const pl = w.planet(star, idx);
  if (!pl.spice || ps.owner !== 'player' || ps.destroyed) return 0;
  const sense = w.perks.has('spice-sense') ? 1.5 : 1;
  if (isHomeworld(w, star, idx)) return 1.4 * sense;
  const t = tScoreOf(ps.atm, ps.temp);
  if (t === 0) return 0;
  let rate = (ps.cities * 1.0 + ps.bld.factory * 1.5) * pl.richness * SPICE[pl.spice].rate * sense;
  if (happiness(w, ps) < 0) rate *= 0.5;
  if ((ps.unrest ?? 0) > 90 && !w.perks.has('crowd-pleaser')) rate = 0;
  return rate;
}
export function maxCities(w: World, star: number, idx: number): number {
  return Math.max(1, w.tscore(star, idx));
}

export function colonyTick(w: World, dt: number) {
  for (const [sid, idx] of w.colonies()) {
    const ps = w.ps(sid, idx);
    const pl = w.planet(sid, idx);
    if (!pl.spice) continue;
    const cap = storageCap(w, sid, idx, ps);
    ps.stored = Math.min(cap, ps.stored + (production(w, sid, idx, ps) / 60) * dt);
    // Unhappy colonies grow restless.
    if (happiness(w, ps) < 0 && !w.perks.has('crowd-pleaser')) {
      const before = ps.unrest ?? 0;
      ps.unrest = before + dt;
      if (before <= 90 && ps.unrest > 90) w.hooks?.toast(`Workers on ${pl.name} have walked out! Add a Leisure Dome.`, '😠', 'bad');
    } else ps.unrest = 0;
  }
}

/** Planets that are terraformed beyond their ecosystem drift back toward a stable T-score. */
export function ecoDriftTick(w: World, dt: number) {
  for (const [k, ps] of Object.entries(w.s.planets)) {
    if (ps.destroyed) continue;
    const [sid, idx] = k.split(':').map(Number);
    if (w.planet(sid, idx).kind === 'gas') continue;
    const t = tScoreOf(ps.atm, ps.temp);
    const rows = w.ecoRows(ps);
    if (t <= rows) continue;
    // Drift outward to the ring that the ecosystem can hold.
    const target = T_RING[rows] + 0.005;
    const dx = ps.atm - 0.5, dy = ps.temp - 0.5;
    const d = Math.hypot(dx, dy) || 0.001;
    if (d >= target) continue;
    const step = Math.min(target - d, 0.0045 * dt);
    ps.atm = clamp(ps.atm + (dx / d) * step, 0, 1);
    ps.temp = clamp(ps.temp + (dy / d) * step, 0, 1);
    if (dx === 0 && dy === 0) ps.atm += step;
  }
}

/** Collect stored spice from every colony in a system into the cargo hold. */
export function collectSystem(w: World, star: number): number {
  let got = 0;
  for (const p of w.gal.planets(star)) {
    const ps = w.peekPS(star, p.idx);
    if (ps.owner !== 'player' || !p.spice) continue;
    got += collectPlanet(w, star, p.idx);
  }
  return got;
}
export function collectPlanet(w: World, star: number, idx: number): number {
  const ps = w.ps(star, idx);
  const pl = w.planet(star, idx);
  if (!pl.spice) return 0;
  const room = w.cargoCap - w.cargoUsed;
  const n = Math.min(Math.floor(ps.stored), room);
  if (n <= 0) return 0;
  ps.stored -= n;
  w.s.spice[pl.spice] += n;
  w.hooks?.changed();
  return n;
}

export function canColonize(w: World, star: number, idx: number): string | null {
  const pl = w.planet(star, idx);
  const ps = w.peekPS(star, idx);
  const owner = w.ownerOf(star);
  if (pl.kind === 'gas') return 'Gas giants cannot hold a colony.';
  if (ps.destroyed) return 'Nothing is left of this world.';
  if (w.star(star).hollow) return 'The Hollow will not allow it.';
  if (owner && owner !== 'player') return 'Another empire already claims this system.';
  if (ps.owner === 'player') {
    if (ps.cities >= maxCities(w, star, idx)) return `This world holds ${maxCities(w, star, idx)} ${maxCities(w, star, idx) === 1 ? 'city' : 'cities'} at T${w.tscore(star, idx)}. Terraform it to grow.`;
    return null;
  }
  if (!pl.spice) return 'There is no spice here.';
  return null;
}

export function foundColony(w: World, star: number, idx: number): boolean {
  if (canColonize(w, star, idx) || !w.use('colonypack')) return false;
  const ps = w.ps(star, idx);
  const first = ps.owner !== 'player';
  ps.owner = 'player';
  ps.cities += 1;
  if (first) {
    w.setOwner(star, 'player');
    w.counter('colonies');
    w.game.unlock('colonist');
    w.game.history(`Founded a colony on ${w.planet(star, idx).name}`, '🏠');
    const sp = w.planet(star, idx).spice;
    if (sp) marketStory(w, '🏗️', `New ${SPICE[sp].name} colony founded on ${w.planet(star, idx).name}`, 'Fresh supply is on the way, and traders are marking prices down.', [{ c: sp, shock: -0.05 }]);
  }
  audio.sfx('build');
  w.hooks?.changed();
  return true;
}

export function build(w: World, star: number, idx: number, b: BuildingId): boolean {
  const ps = w.ps(star, idx);
  const price = BUILDINGS[b].price;
  if (used(ps) >= slots(ps) || w.s.money < price) return false;
  w.addMoney(-price);
  ps.bld[b]++;
  audio.sfx('build');
  return true;
}

export function demolish(w: World, star: number, idx: number, b: BuildingId) {
  const ps = w.ps(star, idx);
  if (ps.bld[b] > 0) { ps.bld[b]--; audio.sfx('remove'); }
}

// ------------------------------------------------------------------ prices and trade
export function sellPrice(w: World, e: Empire, c: SpiceColor): number {
  const easy = w.game.diff(1.25, 1, 1);
  const relBonus = 1 + Math.max(0, relation(e)) / 400;
  // Every empire's prices follow the Spice Exchange index.
  const mk = marketFactor(w, c);
  return Math.max(Math.round(SPICE[c].base * mk), Math.round(SPICE[c].base * e.mult[c] * e.demand[c] * easy * relBonus * mk));
}
export function buyPrice(w: World, e: Empire, c: SpiceColor): number {
  return Math.round(SPICE[c].base * 9 / Math.max(0.3, e.demand[c]) * marketFactor(w, c));
}
export function canTrade(w: World, e: Empire): string | null {
  if (e.arch === 'hollow') return 'The Hollow do not trade.';
  if (e.war) return 'They will not trade during a war.';
  if (relation(e) < -29) return 'They are too wary of you to trade.';
  return null;
}

/** What selling `n` of a spice would pay right now, each sale nudging the price down as `sell` does. */
export function sellQuote(w: World, e: Empire, c: SpiceColor, n: number): number {
  const d0 = e.demand[c];
  let total = 0;
  for (let i = 0; i < Math.min(n, w.s.spice[c]); i++) {
    total += sellPrice(w, e, c);
    e.demand[c] = Math.max(0.25, e.demand[c] * 0.955);
  }
  e.demand[c] = d0;
  return total;
}

export function sell(w: World, e: Empire, c: SpiceColor, n: number, star: number): number {
  let earned = 0;
  for (let i = 0; i < n && w.s.spice[c] > 0; i++) {
    const p = sellPrice(w, e, c);
    earned += p;
    w.s.spice[c]--;
    e.demand[c] = Math.max(0.25, e.demand[c] * 0.955);
    w.counter('spiceSold');
    // Selling at a system fills its takeover bar.
    e.takeover[star] = Math.min(1, (e.takeover[star] ?? 0) + p / (systemPrice(w, star) * 1.2));
  }
  if (earned > 0) {
    w.addMoney(earned);
    w.s.tradeEarned += earned;
    addMod(e, 'trading', 'Your trading', Math.min(3, n), { max: e.arch === 'merchant' ? 20 : 15, decay: 0.3 });
    if (w.s.tradeEarned >= 1000000) w.game.unlock('tycoon');
    audio.sfx('coin');
    checkTakeover(w, e, star);
    marketPress(w, c, n);
  }
  return earned;
}

export function buy(w: World, e: Empire, c: SpiceColor, n: number): number {
  let bought = 0;
  for (let i = 0; i < n; i++) {
    const p = buyPrice(w, e, c);
    if (w.s.money < p || w.cargoUsed >= w.cargoCap) break;
    w.addMoney(-p);
    w.s.spice[c]++;
    e.demand[c] = Math.max(0.3, e.demand[c] * 0.97);
    bought++;
  }
  if (bought) { audio.sfx('coin'); marketPress(w, c, -bought); }
  return bought;
}

/** When a takeover bar fills, the empire offers the system once. After that, ask from the Trade tab. */
export function checkTakeover(w: World, e: Empire, star: number) {
  if ((e.takeover[star] ?? 0) >= 1 && w.ownerOf(star) === e.id && !e.war && !e.offered?.[star]) {
    (e.offered ??= {})[star] = true;
    w.hooks?.takeoverOffer(e, star, systemPrice(w, star));
  }
}

/** Trade routes pay a little each second and fill the takeover bar of their system. */
export function routeTick(w: World, dt: number) {
  for (const e of w.empires) {
    if (e.route === null || e.dead) continue;
    if (w.ownerOf(e.route) !== e.id || e.war) { e.route = null; continue; }
    const before = e.takeover[e.route] ?? 0;
    e.takeover[e.route] = Math.min(1, before + dt / 300);
    w.s.money = Math.min(99999999, w.s.money + (strength(w, e) * 900 * dt) / 60);
    if (before < 1 && e.takeover[e.route] >= 1) checkTakeover(w, e, e.route);
  }
}

// ------------------------------------------------------------------ terraforming
export type TerraTool = 'stormpod' | 'droughtpod' | 'meteor' | 'icecomet' | 'atm+' | 'atm-' | 'temp+' | 'temp-';

export function terraform(w: World, star: number, idx: number, tool: TerraTool): string | null {
  const pl = w.planet(star, idx);
  if (pl.kind === 'gas') return 'Gas giants cannot be terraformed.';
  if (isHomeworld(w, star, idx)) return 'Your homeworld is already perfect.';
  const ps = w.ps(star, idx);
  if (ps.destroyed) return 'Nothing is left to terraform.';
  let da = 0, dtp = 0;
  const big = 0.11, small = 0.045;
  switch (tool) {
    case 'stormpod': if (!w.use('stormpod')) return 'No Storm Pods left.'; da = big; break;
    case 'droughtpod': if (!w.use('droughtpod')) return 'No Drought Pods left.'; da = -big; break;
    case 'meteor': if (!w.use('meteor')) return 'No Meteor Calls left.'; dtp = big; break;
    case 'icecomet': if (!w.use('icecomet')) return 'No Ice Comets left.'; dtp = -big; break;
    default: {
      if (w.s.energy < 8) return 'Not enough energy.';
      w.s.energy -= 8;
      if (tool === 'atm+') da = small; else if (tool === 'atm-') da = -small; else if (tool === 'temp+') dtp = small; else dtp = -small;
    }
  }
  const before = tScoreOf(ps.atm, ps.temp);
  ps.atm = clamp(ps.atm + da, 0, 1);
  ps.temp = clamp(ps.temp + dtp, 0, 1);
  const after = tScoreOf(ps.atm, ps.temp);
  afterTerraform(w, star, idx, before, after);
  return null;
}

export function afterTerraform(w: World, star: number, idx: number, before: number, after: number) {
  const ps = w.ps(star, idx);
  if (after > before) {
    w.counter('tRaises', after - before);
    if (after === 3) w.game.unlock('terraformer');
    audio.sfx('levelup');
  } else if (after < before) audio.sfx('fail');
  // Empires care what you do to their worlds.
  if (ps.owner && ps.owner !== 'player') {
    const e = w.emap.get(ps.owner);
    if (e) {
      if (e.arch === 'hollow' && after >= 1) {
        // Life poisons the Hollow: their colony dies and they take it as war.
        ps.owner = undefined; ps.cities = 0;
        w.setOwner(star, null);
        w.hooks?.toast('Life floods the Hollow world. Their nodes go dark.', '🤖', 'gold');
      } else if (after > before) addMod(e, 'helped', 'You helped our planet', 15 * (after - before), { max: e.arch === 'gardener' ? 90 : 45, decay: 0.3 });
      else if (after < before) addMod(e, 'hurt', 'You hurt our planet', -25, { min: -100, decay: 0.5 });
    }
  }
  // Fewer cities fit on a colder world.
  if (ps.owner === 'player' && !isHomeworld(w, star, idx)) {
    const maxC = Math.max(1, after);
    if (ps.cities > maxC) {
      ps.cities = maxC;
      while (used(ps) > slots(ps)) {
        if (ps.bld.factory) ps.bld.factory--; else if (ps.bld.turret) ps.bld.turret--; else ps.bld.leisure--;
      }
      w.hooks?.toast(`${w.planet(star, idx).name} can no longer support all its cities.`, '🏚️', 'bad');
    }
  }
  onTerraformed(w, star, idx, after);
  w.hooks?.changed();
}

// ------------------------------------------------------------------ ecosystems
export function slotKind(i: number) { return ECO_ROW[i % 4]; }
export function fits(sp: Specimen, i: number): boolean {
  const k = slotKind(i);
  if (k === 'plant') return sp.diet === 'plant';
  if (k === 'herb') return sp.diet === 'herbivore' || sp.diet === 'omnivore';
  return sp.diet === 'carnivore' || sp.diet === 'omnivore';
}

/** Fill an ecosystem slot from a seed pod or a specimen in cargo. */
export function fillSlot(w: World, star: number, idx: number, slot: number, specimenIdx: number | 'seed'): string | null {
  const ps = w.ps(star, idx);
  const row = Math.floor(slot / 4);
  const t = tScoreOf(ps.atm, ps.temp);
  if (row >= t) return `This row opens at T${row + 1}. Terraform first.`;
  if (ps.eco[slot]) return 'That slot is already filled.';
  if (row > 0 && w.ecoRows(ps) < row) return `Complete the T${row} row first.`;
  let sp: Specimen;
  if (specimenIdx === 'seed') {
    if (slotKind(slot) !== 'plant') return 'Seed pods only fill plant slots.';
    if (!w.use('seeds')) return 'No seed pods. Buy some, or gather flora on a living world.';
    const r = Math.floor(Math.random() * 1e9);
    sp = { seed: r, name: ['Glowbloom', 'Spirereed', 'Puffcap', 'Fanpalm', 'Coilvine', 'Bellshrub'][r % 6], diet: 'plant' };
  } else {
    const cand = w.s.specimens[specimenIdx];
    if (!cand || !fits(cand, slot)) return 'That specimen does not fit this slot.';
    sp = cand;
    w.s.specimens.splice(specimenIdx, 1);
  }
  const before = w.ecoRows(ps);
  ps.eco[slot] = sp;
  audio.sfx('place');
  const after = w.ecoRows(ps);
  if (after > before) {
    w.counter('eco');
    audio.sfx('success');
    w.hooks?.toast(`The T${after} ecosystem of ${w.planet(star, idx).name} is complete. It is stable now.`, '🌿', 'good');
  }
  w.hooks?.changed();
  return null;
}

export function abduct(w: World, star: number, idx: number, sp: Specimen): string | null {
  if (w.cargoUsed >= w.cargoCap) return 'Your cargo hold is full.';
  w.s.specimens.push({ ...sp });
  const ps = w.ps(star, idx);
  ps.taken = (ps.taken ?? 0) + 1;
  if (ps.owner && ps.owner !== 'player') {
    const e = w.emap.get(ps.owner);
    if (e) addMod(e, 'abduct', 'You abducted our wildlife', -5, { min: -30, decay: 1 });
  }
  audio.sfx('whoosh');
  w.hooks?.changed();
  return null;
}

/** Genesis Seed: instant T3 with a full random ecosystem. */
export function genesis(w: World, star: number, idx: number): string | null {
  const pl = w.planet(star, idx);
  if (pl.kind === 'gas') return 'Even the Seed cannot root in a gas giant.';
  if (!w.use('genesis')) return 'The Seed has no charges left.';
  const ps = w.ps(star, idx);
  const before = tScoreOf(ps.atm, ps.temp);
  ps.destroyed = false;
  ps.atm = 0.5; ps.temp = 0.5;
  const natives = w.natives({ ...pl, seed: (pl.seed ^ Math.floor(Math.random() * 1e9)) >>> 0 });
  for (let i = 0; i < 12; i++) ps.eco[i] = natives[i];
  w.game.unlock('genesis');
  afterTerraform(w, star, idx, before, 3);
  return null;
}

export function spiceValueAt(w: World, e: Empire): number {
  let v = 0;
  for (const c of SPICE_COLORS) v += w.s.spice[c] * sellPrice(w, e, c);
  return v;
}
