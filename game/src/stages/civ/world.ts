// World generation: cities, rival nations, spice geysers and the art each nation uses.
import { RNG } from '../../engine/rng';
import { generateBuilding, generateCreature, generateVehicle, randomPalette } from '../../design/generate';
import type { Design, Palette, PatternId } from '../../design/types';
import { cityName, speciesName } from '../../game/names';
import { shade } from '../../design/color';
import { NCOLS, NROWS, Terrain } from './terrain';
import {
  H, PLAYER, W, wdist, wrapX,
  type City, type Geyser, type Nation, type NationArt, type NationType, type Slot, type Turret, type BuildingKind,
} from './types';

export const RIVAL_COLORS = ['#ff5a4f', '#ffb347', '#b39bff', '#ff7ab8', '#ffd166', '#6c8cff'];
export const PLAYER_COLOR = '#3ee6c4';

export interface WorldInit {
  cities: City[];
  nations: Nation[];
  geysers: Geyser[];
}

export function nationPalette(color: string, r: RNG): Palette {
  const pats: PatternId[] = ['none', 'stripes', 'bands', 'dots', 'none'];
  return { base: color, coat: shade(color, -0.35), detail: '#f2f2ee', pattern: r.pick(pats) };
}

export function makeSlots(n: number): Slot[] {
  return Array.from({ length: n }, () => ({ kind: null, off: 0 }));
}
export function makeTurrets(n: number): Turret[] {
  return Array.from({ length: n }, () => ({ alive: false, hp: 0, cool: 0, off: 0, frozen: 0 }));
}
export const TURRET_HP = 300;

/** Art (designs) for one AI nation. Deterministic from the seed. */
export function nationArt(seed: number, n: Nation): NationArt {
  const r = new RNG(seed ^ (n.id * 7919));
  const pal = n.palette;
  return {
    species: generateCreature(r, { level: 3 }),
    hall: generateBuilding(r, 'cityhall', pal),
    house: generateBuilding(r, 'house', pal),
    factory: generateBuilding(r, 'factory', pal),
    fun: generateBuilding(r, 'entertainment', pal),
    land: generateVehicle(r, n.type, 'land', pal),
    sea: generateVehicle(r, n.type, 'sea', pal),
    air: generateVehicle(r, n.type, 'air', pal),
  };
}

export function generateWorld(t: Terrain, seed: number, o: {
  playerType: NationType; playerName: string; homeName?: string; nNations: number;
  attitude: { friendly: number; neutral: number; hostile: number }; aiTurrets: number; ensureHostile?: boolean;
}): WorldInit {
  const r = new RNG(seed);
  // ---------------------------------------------------------------- city sites
  const cand: number[] = [];
  for (let c = 0; c < NCOLS * NROWS; c++) {
    if (!t.land[c]) continue;
    const y = t.cellY(c);
    if (Math.min(y, H - y) < 300) continue;
    if (t.coastDist[c] < 2) continue;
    cand.push(c);
  }
  let homeComp = t.compLand[t.cell(t.homeX, t.homeY)];
  if (homeComp < 0) {
    let best = -1, bs = 0;
    for (const [id, size] of t.compSize) if (id < 1000 && size > bs) { bs = size; best = id; }
    homeComp = best;
  }
  const homeCand = cand.filter((c) => t.compLand[c] === homeComp);
  // Capital: coastal and near the middle of the home continent.
  let cx = 0, cy = 0;
  for (const c of homeCand) { cx += t.cellX(c); cy += t.cellY(c); }
  cx /= Math.max(1, homeCand.length); cy /= Math.max(1, homeCand.length);
  const coastalHome = homeCand.filter((c) => t.coastDist[c] <= 3);
  const capPool = coastalHome.length ? coastalHome : homeCand.length ? homeCand : cand;
  capPool.sort((a, b) => wdist(t.cellX(a), t.cellY(a), cx, cy) - wdist(t.cellX(b), t.cellY(b), cx, cy));
  const sites: { x: number; y: number; comp: number }[] = [];
  const pick0 = capPool[Math.min(capPool.length - 1, r.int(0, Math.min(3, capPool.length - 1)))];
  sites.push({ x: t.cellX(pick0), y: t.cellY(pick0), comp: t.compLand[pick0] });
  const far = (x: number, y: number, s: number) => sites.every((q) => wdist(q.x, q.y, x, y) >= s);
  const tryPlace = (pool: number[], spacing: number, max: number, preferCoast: boolean) => {
    const list = r.shuffle(pool.slice());
    if (preferCoast) list.sort((a, b) => (t.coastDist[a] <= 3 ? 0 : 1) - (t.coastDist[b] <= 3 ? 0 : 1) + (r.next() - 0.5) * 0.9);
    let placed = 0;
    for (const c of list) {
      if (placed >= max || sites.length >= 10) break;
      const x = t.cellX(c) + r.range(-8, 8), y = t.cellY(c) + r.range(-8, 8);
      if (!far(x, y, spacing)) continue;
      sites.push({ x, y, comp: t.compLand[c] });
      placed++;
    }
    return placed;
  };
  tryPlace(homeCand, 340, 3, true);
  // Other continents, biggest first, round-robin.
  const comps = [...t.compSize.entries()].filter(([id, n]) => id < 1000 && id !== homeComp && n >= 18).sort((a, b) => b[1] - a[1]);
  for (let pass = 0; pass < 4 && sites.length < 10; pass++) {
    for (const [id] of comps) {
      if (sites.length >= 10) break;
      tryPlace(cand.filter((c) => t.compLand[c] === id), 360 - pass * 30, 1, true);
    }
  }
  for (let spacing = 320; sites.length < 10 && spacing >= 160; spacing -= 40) tryPlace(cand, spacing, 10 - sites.length, false);
  // Last resort (tiny planets): any land.
  for (let c = 0; sites.length < 10 && c < NCOLS * NROWS; c += 37) if (t.land[c] && far(t.cellX(c), t.cellY(c), 120)) sites.push({ x: t.cellX(c), y: t.cellY(c), comp: t.compLand[c] });

  // ---------------------------------------------------------------- nations
  const nations: Nation[] = [];
  const K = o.nNations;
  const nTypes: NationType[] = r.shuffle(['military', 'religious', 'economic'] as NationType[]);
  while (nTypes.length < K) nTypes.push(r.pick(['military', 'religious', 'economic'] as NationType[]));
  r.shuffle(nTypes);
  const colors = r.shuffle(RIVAL_COLORS.slice());
  const mkNation = (id: number, name: string, type: NationType, color: string, attitude: number): Nation => ({
    id, name, type, color, palette: nationPalette(color, r), attitude, rel: attitude, allied: false,
    relAI: [], money: 2500, alive: true, goodwill: 0, gifts: 0, aiT: r.range(3, 8), waveT: 0, hostileT: 999, truce: 0,
  });
  nations.push(mkNation(PLAYER, o.playerName, o.playerType, PLAYER_COLOR, 0));
  const suffix = ['Republic', 'Dominion', 'Accord', 'League', 'Union', 'Kingdom', 'Collective', 'Hegemony', 'Federation', 'Concord'];
  const { friendly, neutral } = o.attitude;
  for (let i = 0; i < K; i++) {
    const type = nTypes[i];
    const roll = r.next();
    let att = roll < friendly ? r.range(30, 45) : roll < friendly + neutral ? r.range(-12, 12) : r.range(-60, -46);
    if (type === o.playerType) att += 12;
    if (type === 'military') att -= 8;
    nations.push(mkNation(i + 1, `${speciesName(r)} ${r.pick(suffix)}`, type, colors[i % colors.length], Math.round(att)));
  }
  // Guarantee one warlike rival (it declares war as you grow) on normal and hard.
  if (o.ensureHostile && !nations.some((n) => n.id !== PLAYER && n.type !== 'economic' && n.attitude <= -46)) {
    const pool = nations.filter((n) => n.id !== PLAYER && n.type !== 'economic');
    const n = pool.find((q) => q.type === 'military') ?? pool[0];
    if (n) n.attitude = n.rel = -56;
  }
  // Guarantee one approachable nation.
  if (!nations.some((n) => n.id !== PLAYER && n.attitude >= 15)) {
    const n = nations[1 + r.int(0, K - 1)];
    n.attitude = n.rel = 34;
  }
  for (const a of nations) a.relAI = nations.map((b) => (a.id === b.id ? 100 : Math.round(r.range(-55, 35) - (a.type === 'military' || b.type === 'military' ? 12 : 0))));
  for (const a of nations) for (const b of nations) if (a.id < b.id) b.relAI[a.id] = a.relAI[b.id];

  // Assign rival sites to nations (farthest-point seeds, then nearest with a cap).
  const rival = sites.slice(1).map((s, i) => ({ ...s, i: i + 1, owner: -1 }));
  const seeds: typeof rival = [];
  const playerSite = sites[0];
  while (seeds.length < Math.min(K, rival.length)) {
    let best = rival[0], bd = -1;
    for (const s of rival) {
      if (seeds.includes(s)) continue;
      const d = Math.min(wdist(s.x, s.y, playerSite.x, playerSite.y) * 0.8, ...seeds.map((q) => wdist(s.x, s.y, q.x, q.y)));
      if (d > bd) { bd = d; best = s; }
    }
    best.owner = seeds.length + 1;
    seeds.push(best);
  }
  const cap = Math.ceil(rival.length / K) + 1;
  const count = new Map<number, number>();
  for (const s of seeds) count.set(s.owner, 1);
  for (const s of rival) {
    if (s.owner > 0) continue;
    const order = seeds.slice().sort((a, b) => wdist(s.x, s.y, a.x, a.y) - wdist(s.x, s.y, b.x, b.y));
    const pick = order.find((q) => (count.get(q.owner) ?? 0) < cap) ?? order[0];
    s.owner = pick.owner;
    count.set(pick.owner, (count.get(pick.owner) ?? 0) + 1);
  }

  // ---------------------------------------------------------------- cities
  const cities: City[] = [];
  const layout = (n: number, kinds: (BuildingKind | null)[]) => {
    const s = makeSlots(n);
    kinds.forEach((k, i) => { if (i < n) s[i].kind = k; });
    return s;
  };
  sites.forEach((s, i) => {
    const owner = i === 0 ? PLAYER : rival.find((q) => q.i === i)!.owner;
    const nat = nations[owner];
    const large = i === 0 || seeds.some((q) => q.i === i) || r.chance(nat.type === 'economic' ? 0.25 : 0.5);
    const nSlots = large ? 8 : 6;
    const nTur = large ? 5 : 3;
    // Dock: nearest ocean cell within ~4 nav cells.
    let dock: { x: number; y: number } | null = null;
    const c0 = t.cell(s.x, s.y);
    const wc = t.nearest('sea', c0, -999, 5);
    if (wc >= 0 && (t.compSize.get(t.compWater[wc]) ?? 0) > 120 && wdist(t.cellX(wc), t.cellY(wc), s.x, s.y) < 170) dock = { x: t.cellX(wc), y: t.cellY(wc) };
    let slots: Slot[];
    if (i === 0) slots = layout(nSlots, ['house', 'factory', 'house', 'fun']);
    else {
      const pat: (BuildingKind | null)[] = nSlots === 8
        ? ['house', 'factory', 'house', 'fun', 'house', 'factory', 'house', 'fun']
        : ['house', 'factory', 'house', 'fun', 'house', null];
      slots = layout(nSlots, pat.map((k) => (r.chance(0.15) ? null : k)));
    }
    const turrets = makeTurrets(nTur);
    const nt = i === 0 ? 2 : Math.max(0, Math.min(nTur, (large ? 2 : 1) + (nat.type === 'military' ? 1 : 0) + o.aiTurrets));
    const order = r.shuffle(Array.from({ length: nTur }, (_, k) => k));
    for (let k = 0; k < nt; k++) { const tu = turrets[order[k]]; tu.alive = true; tu.hp = TURRET_HP; }
    const defMax = large ? 900 : 600;
    cities.push({
      id: i, name: i === 0 ? (o.homeName || cityName(r)) : cityName(r), x: wrapX(s.x), y: s.y, owner, type: nat.type, large, home: i === 0,
      coastal: !!dock, dock, continent: s.comp, slots, turrets, defense: defMax, defenseMax: defMax,
      convert: 0, convertBy: -1, buyout: 0, trade: false,
      foundAt: i === 0 ? 0 : r.range(8, 50), founded: i === 0, lastHit: 99, lastHitBy: -1, hush: 0, happy: 0, output: 0, flash: 0,
    });
    t.clearDecor(s.x, s.y, 135);
  });

  // ---------------------------------------------------------------- geysers
  const geysers: Geyser[] = [];
  const gfar = (x: number, y: number, dc: number, dg: number) =>
    cities.every((c) => wdist(c.x, c.y, x, y) >= dc) && geysers.every((q) => wdist(q.x, q.y, x, y) >= dg);
  const addG = (x: number, y: number, sea: boolean) => {
    geysers.push({ id: geysers.length, x: wrapX(x), y, sea, owner: -1, hp: 220, work: 0, workBy: -1, pop: r.range(0, 4) });
    t.clearDecor(x, y, 46);
  };
  for (const c of cities) {
    for (let k = 0; k < 40; k++) {
      const a = r.range(0, Math.PI * 2), d = r.range(170, 290);
      const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d * 0.85;
      const cc = t.cell(x, y);
      if (!t.land[cc] || t.compLand[cc] !== t.compLand[t.cell(c.x, c.y)] || Math.min(y, H - y) < 220) continue;
      if (!gfar(x, y, 165, 160)) continue;
      addG(x, y, false);
      break;
    }
  }
  // Sea geysers: open water near coasts.
  for (let k = 0, made = 0; k < 600 && made < 2; k++) {
    const x = r.range(0, W), y = r.range(320, H - 320);
    const cc = t.cell(x, y);
    if (t.land[cc] || (t.compSize.get(t.compWater[cc]) ?? 0) < 200) continue;
    const near = t.nearest('land', cc, -999, 4);
    if (near < 0 || t.coastDist[near] > 2) continue;
    if (!gfar(x, y, 220, 260)) continue;
    addG(x, y, true);
    made++;
  }
  for (let k = 0; k < 900 && geysers.length < 14; k++) {
    const x = r.range(0, W), y = r.range(300, H - 300);
    const cc = t.cell(x, y);
    if (!t.land[cc] || t.coastDist[cc] < 1) continue;
    if (!gfar(x, y, 200, 220)) continue;
    addG(x, y, false);
  }
  return { cities, nations, geysers };
}
