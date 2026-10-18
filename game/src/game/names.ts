// Procedural names for species, planets, stars, cities and empires.
import { RNG } from '../engine/rng';

const ON = ['b', 'br', 'k', 'kr', 'g', 'gl', 'z', 'zh', 'm', 'n', 'p', 'pl', 'qu', 'r', 's', 'sh', 'sk', 't', 'th', 'v', 'w', 'y', 'f', 'fl', 'dr', 'gr', 'l', 'h'];
const NU = ['a', 'e', 'i', 'o', 'u', 'oo', 'ee', 'ai', 'au', 'ia', 'y', 'ou', 'ae'];
const CO = ['', '', 'n', 'r', 'x', 'k', 'l', 'm', 'th', 'sh', 'z', 'ng', 's', 'p', 'b'];
const SUF_CREATURE = ['ling', 'opod', 'ox', 'saur', 'by', 'ix', 'wump', 'kin', 'oid', 'let', 'mander', 'aloo', 'ish'];
const SUF_PLANET = ['ia', 'on', 'ara', 'us', 'is', 'ora', 'eth', 'ax', 'um', 'ae', 'or'];

function syl(r: RNG): string {
  return r.pick(ON) + r.pick(NU) + r.pick(CO);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function speciesName(r: RNG): string {
  const n = r.int(1, 2);
  let s = '';
  for (let i = 0; i < n; i++) s += syl(r);
  if (r.chance(0.6)) s += r.pick(SUF_CREATURE);
  return cap(s.slice(0, 14));
}
export function planetName(r: RNG): string {
  let s = syl(r) + (r.chance(0.5) ? syl(r) : '') + r.pick(SUF_PLANET);
  s = cap(s.slice(0, 12));
  if (r.chance(0.15)) s += ' ' + r.pick(['Prime', 'II', 'III', 'IV', 'Major', 'Minor', 'VII']);
  return s;
}
export function starName(r: RNG): string {
  if (r.chance(0.25)) return cap(syl(r)) + '-' + r.int(10, 999);
  return cap((syl(r) + syl(r)).slice(0, 10));
}
export function cityName(r: RNG): string {
  const pre = cap((syl(r) + (r.chance(0.5) ? syl(r) : '')).slice(0, 10));
  return r.chance(0.35) ? pre + r.pick([' Falls', ' Hold', ' Reach', ' Bay', 'ton', 'ville', ' Spire', 'burg', ' Hollow']) : pre;
}
export function tribeName(r: RNG): string {
  return r.pick(['Clan', 'Tribe', 'Kin', 'Folk']) + ' of ' + cap(syl(r) + syl(r));
}
export function empireName(r: RNG, species: string): string {
  return r.pick(['The ', '', '']) + species + ' ' + r.pick(['Empire', 'Union', 'Collective', 'Dominion', 'Federation', 'Accord', 'Hegemony', 'League', 'Republic', 'Concord']);
}
export function partName(r: RNG): string {
  return cap(syl(r) + r.pick(['er', 'ix', 'o', 'ling', 'pod']));
}
