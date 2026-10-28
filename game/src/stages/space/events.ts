// Timed happenings on planets. Threats: pirate raids, eco-disasters, invasions by empires at war, Hollow
// incursions and meteor storms. Opportunities: distress calls, ancient signals, rare creature sightings,
// wandering traders and refugee fleets.
import { audio } from '../../engine/audio';
import { fmt } from '../../engine/math';
import { COMPONENTS, giveSalvage, grantTool, hasBlueprint, owned, pickBlueprint, pickFoundTool, RECIPES, rollComps, rollSalvage, salvageLine, type CompId } from './salvage';
import { RNG } from '../../engine/rng';
import { generateCreature } from '../../design/generate';
import { RANKS, SPICE, SPICE_COLORS, TOOL_MAP, TOOLS } from './data';
import type { EventKind, GEvent, Planet, PlanetState, Specimen } from './types';
import { BUILDINGS, isHomeworld, maxCities, slots, used } from './economy';
import { addMod } from './empires';
import { landingBlock } from './surface/look';
import type { World } from './world';
import { complete } from './missions';

export const EVENT_INFO: Record<EventKind, { icon: string; label: string; how: string; good?: boolean }> = {
  raid: { icon: '🏴‍☠️', label: 'Pirate raid', how: 'Destroy the raiders.' },
  invasion: { icon: '⚔️', label: 'Invasion', how: 'Destroy the invasion fleet.' },
  eco: { icon: '☣️', label: 'Eco-disaster', how: 'Tap the glowing outbreaks on the planet.' },
  hollow: { icon: '🤖', label: 'Hollow incursion', how: 'Destroy the Hollow ships.' },
  meteor: { icon: '☄️', label: 'Meteor storm', how: 'Man the planetary gun and shoot the meteors down.' },
  distress: { icon: '🆘', label: 'Distress call', how: 'Fly to the beacon near the planet.', good: true },
  relic: { icon: '🗿', label: 'Ancient signal', how: 'Land, find the relic and beam it up.', good: true },
  rare: { icon: '✨', label: 'Rare sighting', how: 'Land and catch it before it migrates.', good: true },
  trader: { icon: '🛍️', label: 'Wandering trader', how: 'Open the planet to see the deals.', good: true },
  refugees: { icon: '🚀', label: 'Refugee fleet', how: 'Open your colony to take them in.', good: true },
  wreck: { icon: '🛰️', label: 'Derelict wreck', how: 'Fly to the wreck near the planet and salvage it.', good: true },
};

/** An event's icon, label and how-to, with a story relic's own name. */
export function eventInfo(ev: GEvent): { icon: string; label: string; how: string; good?: boolean } {
  const info = EVENT_INFO[ev.kind];
  if (ev.label) return { ...info, label: ev.label, how: `Land, sweep with 📡 life scans and beam up the ${ev.label}.` };
  if (ev.unmaking) return { ...info, label: 'Hollow strike', how: 'Destroy the Hollow fleet, or lose the whole colony.' };
  return info;
}

/** Seconds each random happening lasts. */
const DURATION: Partial<Record<EventKind, number>> = { meteor: 160, distress: 210, relic: 420, rare: 330, trader: 300, refugees: 260, wreck: 300 };

export function eventsTick(w: World, dt: number) {
  const s = w.s;
  const f = s.flags;
  if (!f.tutDone) return;
  const cols = w.colonies().filter(([sid, idx]) => !isHomeworld(w, sid, idx));
  // Pirate raids
  if (f.nextRaid === undefined) f.nextRaid = s.t + 240;
  if (s.t >= Number(f.nextRaid)) {
    const base = 240 + Math.random() * 200;
    f.nextRaid = s.t + base * (w.perks.has('pirate-bane') ? 2.2 : 1) * w.game.diff(1.4, 1, 0.75);
    const targets = cols.filter(([sid]) => !s.events.some((e) => e.star === sid));
    if (targets.length) {
      const [sid, idx] = targets[Math.floor(Math.random() * targets.length)];
      const ps = w.ps(sid, idx);
      if (ps.orbTurret && Math.random() < 0.5) {
        w.hooks?.toast(`Your orbital turret drove pirates away from ${w.planet(sid, idx).name}.`, '🗼', 'good');
      } else start(w, { id: w.nid(), kind: 'raid', star: sid, planet: idx, until: s.t + 150 });
    }
  }
  // Eco-disasters on worlds with life you tend
  if (f.nextEco === undefined) f.nextEco = s.t + 420;
  if (s.t >= Number(f.nextEco)) {
    f.nextEco = s.t + (380 + Math.random() * 260) * (w.perks.has('green-thumb') ? 2.5 : 1) * w.game.diff(1.4, 1, 0.8);
    const living = cols.filter(([sid, idx]) => {
      const ps = w.ps(sid, idx);
      return ps.eco.some((x) => x && x.diet !== 'plant') && !s.events.some((e) => e.star === sid);
    });
    if (living.length) {
      const [sid, idx] = living[Math.floor(Math.random() * living.length)];
      const ps = w.ps(sid, idx);
      if (!(ps.bioshield && Math.random() < 0.6)) {
        const marks: number[] = [];
        for (let i = 0; i < 5; i++) marks.push(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 1.6);
        start(w, { id: w.nid(), kind: 'eco', star: sid, planet: idx, until: s.t + (ps.bioshield ? 360 : 180), marks });
      }
    }
  }
  // Hollow incursions after contact
  // (Once the Lamp is lit at the end of the story, the Hollow strike no more.)
  if (f.hollowContact && !f.lampLit) {
    const hollow = w.emap.get('hollow')!;
    if (f.nextHollow === undefined) f.nextHollow = s.t + 600;
    if (s.t >= Number(f.nextHollow)) {
      f.nextHollow = s.t + 600 + Math.random() * 400;
      if (hollow.war && w.rel(hollow) < -40 && cols.length) {
        const [sid, idx] = cols[Math.floor(Math.random() * cols.length)];
        if (!s.events.some((e) => e.star === sid)) start(w, { id: w.nid(), kind: 'hollow', star: sid, planet: idx, until: s.t + 180, empire: 'hollow' });
      }
    }
  }
  // Random happenings around you
  if (f.nextOdd === undefined) f.nextOdd = s.t + 150;
  if (s.t >= Number(f.nextOdd)) {
    f.nextOdd = s.t + 170 + Math.random() * 190;
    randomEvent(w);
  }
  // Expiry
  for (const ev of [...s.events]) {
    if (s.t < ev.until) continue;
    // If the player is fighting there, or is down on the surface after it, give them the time.
    if (ev.started && s.loc === ev.star && w.inCombat) continue;
    if ((ev.kind === 'relic' || ev.kind === 'rare') && w.onSurface === `${ev.star}:${ev.planet}`) continue;
    if (w.focusEvent === ev.id) continue;
    fail(w, ev);
  }
}

/** Start a random happening on a world near the ship. `force` picks the kind (debug) and prefers this system. */
export function randomEvent(w: World, force?: EventKind): GEvent | null {
  const s = w.s;
  // Story relics wait as long as they need to, so they leave room for the usual happenings.
  const running = s.events.filter((e) => e.storyGoal === undefined);
  if (!force && running.length >= 4) return null;
  const busy = (sid: number) => s.events.some((e) => e.star === sid);
  const goodNow = running.filter((e) => EVENT_INFO[e.kind].good).length;
  const reach = w.rangeFrom(s.loc) * 2.2;
  const near = [s.loc, ...w.gal.within(s.loc, reach)].filter((id) => {
    const st = w.star(id);
    if ((busy(id) && !force) || st.hollow || st.type === 'blackhole' || st.type === 'core') return false;
    const o = w.ownerOf(id);
    const e = o && o !== 'player' ? w.emap.get(o) : null;
    return !(e && (e.war || e.arch === 'hollow'));
  });
  const worlds = (ok: (pl: Planet, ps: PlanetState) => boolean) => {
    const out: [number, number][] = [];
    for (const id of near) {
      for (const pl of w.gal.planets(id)) {
        const ps = w.peekPS(id, pl.idx);
        if (!ps.destroyed && ok(pl, ps)) out.push([id, pl.idx]);
      }
      if (force && id === s.loc && out.length) break;
    }
    return out;
  };
  const ground = (pl: Planet, ps: PlanetState) => !landingBlock(pl, ps, false) && ps.owner !== 'hollow';
  const cols = w.colonies().filter(([sid, idx]) => !isHomeworld(w, sid, idx) && (!busy(sid) || !!force));
  const opts: { kind: EventKind; wt: number; at: () => [number, number][] }[] = [
    { kind: 'meteor', wt: 3, at: () => cols },
    { kind: 'refugees', wt: 1.5, at: () => cols.filter(([sid, idx]) => w.peekPS(sid, idx).cities < maxCities(w, sid, idx)) },
  ];
  if (goodNow < 2 || force) {
    opts.push(
      { kind: 'distress', wt: 2.5, at: () => worlds(() => true) },
      { kind: 'relic', wt: 2, at: () => worlds((pl, ps) => ground(pl, ps) && ps.owner !== 'player') },
      { kind: 'rare', wt: 2, at: () => worlds((pl, ps) => ground(pl, ps) && (pl.life || ps.eco.some((x) => x && x.diet !== 'plant'))) },
      { kind: 'trader', wt: 1.5, at: () => worlds(() => true) },
      { kind: 'wreck', wt: 2, at: () => worlds(() => true) },
    );
  }
  const live = opts.filter((o) => !force || o.kind === force).map((o) => ({ ...o, list: o.at() })).filter((o) => o.list.length);
  if (!live.length) return null;
  let roll = Math.random() * live.reduce((a, o) => a + o.wt, 0);
  const pick = live.find((o) => (roll -= o.wt) <= 0) ?? live[live.length - 1];
  const here = pick.list.filter(([sid]) => sid === s.loc);
  const [sid, idx] = force && here.length ? here[Math.floor(Math.random() * here.length)] : pick.list[Math.floor(Math.random() * pick.list.length)];
  const ev: GEvent = { id: w.nid(), kind: pick.kind, star: sid, planet: idx, until: s.t + (DURATION[pick.kind] ?? 200) };
  const pl = w.planet(sid, idx);
  if (pick.kind === 'meteor' && !force && w.peekPS(sid, idx).orbTurret && Math.random() < 0.35) {
    w.hooks?.toast(`Your orbital turret blasted a meteor swarm heading for ${pl.name}.`, '🗼', 'good');
    return null;
  }
  if (pick.kind === 'distress') ev.trap = Math.random() < 0.3;
  if (pick.kind === 'rare') {
    const sp = rareSpecimen(w, pl, ev.id);
    if (!sp) return null;
    ev.sp = sp;
  }
  if (pick.kind === 'trader') { ev.seed = Math.floor(Math.random() * 1e9); ev.stock = stockTrader(w); ev.deals = [0, 1, 2, 3, 4, 5]; }
  start(w, ev);
  return ev;
}

const RARE_LOOKS = [
  { name: 'Golden', base: '#ffc93c', coat: '#fff0b3', detail: '#b87a10' },
  { name: 'Starlit', base: '#4b5cff', coat: '#cdd4ff', detail: '#ffffff' },
  { name: 'Prism', base: '#ff5fcf', coat: '#7af0ff', detail: '#ffe066' },
  { name: 'Ghost', base: '#e9f3ff', coat: '#aebfd8', detail: '#6d84a6' },
  { name: 'Ember', base: '#ff6a2a', coat: '#ffd08a', detail: '#5a1c0c' },
];

/** A one-off, oddly coloured cousin of one of a world's native animals. */
export function rareSpecimen(w: World, pl: Planet, salt: number): Specimen | null {
  const pool = w.natives(pl).filter((x) => x.diet !== 'plant');
  if (!pool.length) return null;
  const r = new RNG((pl.seed ^ Math.imul(salt + 1, 7919)) >>> 0);
  const base = r.pick(pool);
  const diet = base.diet === 'plant' ? 'herbivore' : base.diet;
  const look = r.pick(RARE_LOOKS);
  const seed = r.seedInt();
  const name = `${look.name} ${base.name}`;
  const design = generateCreature(new RNG(seed), { level: 3, diet, name });
  design.colors = { ...design.colors, base: look.base, coat: look.coat, detail: look.detail };
  return { seed, name, diet, rare: true, design };
}

export function start(w: World, ev: GEvent) {
  w.s.events.push(ev);
  audio.sfx(EVENT_INFO[ev.kind].good ? 'coin' : 'alarm');
  w.hooks?.eventStarted(ev);
}

/** Knock down one building (works first, then domes, then towers). Returns its name. */
export function knockBuilding(ps: PlanetState): string {
  if (!used(ps)) return '';
  const b = ps.bld.factory ? 'factory' : ps.bld.leisure ? 'leisure' : 'turret';
  ps.bld[b]--;
  return BUILDINGS[b].name;
}

/** A meteor got through: the store cracks, and every second hit flattens a building (named in the result). */
export function meteorImpact(w: World, ev: GEvent): string {
  ev.hits = (ev.hits ?? 0) + 1;
  const ps = w.ps(ev.star, ev.planet);
  ps.stored = Math.max(0, ps.stored - 3);
  const lost = ev.hits % 2 === 0 ? knockBuilding(ps) : '';
  return lost;
}

export function resolve(w: World, ev: GEvent) {
  w.s.events = w.s.events.filter((x) => x !== ev);
  const pl = w.planet(ev.star, ev.planet);
  // A story relic finishes its mission instead of going to collectors.
  if (ev.storyGoal !== undefined) {
    const m = w.s.missions.find((x) => x.id === ev.storyGoal);
    w.hooks?.toast(`Recovered: ${ev.label ?? 'the relic'} from ${pl.name}.`, '🗿', 'gold');
    if (m) complete(w, m);
    audio.sfx('success');
    w.hooks?.eventEnded(ev, true);
    return;
  }
  if (ev.unmaking) {
    w.hooks?.toast(`You held ${pl.name}! The Hollow strike broke on its defences. Grateful colonists raise ${'§'}${fmt(40000)}.`, '🛡️', 'gold');
    w.addMoney(40000);
    w.counter('events');
    audio.sfx('success');
    w.hooks?.eventEnded(ev, true);
    return;
  }
  const pay = (n: number) => { w.addMoney(n); return `+§${fmt(n)}`; };
  switch (ev.kind) {
    case 'eco':
      w.counter('eco');
      w.hooks?.toast(`The outbreak on ${pl.name} is contained. ${pay(10000)}`, '🌿', 'good');
      break;
    case 'meteor': {
      const hits = ev.hits ?? 0;
      const loot = pay(Math.max(3000, 15000 - hits * 3000));
      w.hooks?.toast(hits ? `The meteor storm over ${pl.name} has passed (${hits} got through). Ore salvage: ${loot}` : `Not one meteor touched ${pl.name}! Ore salvage: ${loot}`, '☄️', 'good');
      break;
    }
    case 'distress': {
      if (ev.trap) { w.hooks?.toast(`You smashed the pirate ambush near ${pl.name}. Their loot is yours: ${pay(14000 + Math.floor(Math.random() * 8000))}`, '🏴‍☠️', 'good'); break; }
      const o = w.ownerOf(ev.star);
      const e = o && o !== 'player' && o !== 'hollow' ? w.emap.get(o) : null;
      const loot = pay(9000 + Math.floor(Math.random() * 6000));
      if (e && !e.dead && !e.war) {
        addMod(e, 'rescue', 'You rescued our stranded crew', 12, { max: 36, decay: 0.4 });
        w.hooks?.toast(`You rescued a stranded ${e.name} crew near ${pl.name}. A grateful reward: ${loot}, and better relations.`, '🆘', 'good');
      } else w.hooks?.toast(`You rescued a stranded freighter crew near ${pl.name}. Their reward: ${loot}`, '🆘', 'good');
      break;
    }
    case 'relic': {
      const gifts = ['stormpod', 'droughtpod', 'meteor', 'icecomet', 'repair', 'recharge'];
      const gift = gifts[Math.floor(Math.random() * gifts.length)];
      w.give(gift, 2);
      w.counter('relics');
      const fee = pay(22000 + Math.floor(Math.random() * 16000));
      const items = [{ icon: '💰', text: `${fee} from collectors` }, { icon: TOOL_MAP[gift].icon, text: `2 × ${TOOL_MAP[gift].name}` }, ...giveSalvage(w, rollSalvage(w, 'relic'))];
      if (w.hooks?.loot) w.hooks.loot(`Relic recovered from ${pl.name}`, items, '🗿');
      else w.hooks?.toast(`Ancient relic recovered from ${pl.name}! ${salvageLine(items)}.`, '🗿', 'gold');
      break;
    }
    case 'rare':
      w.hooks?.toast(`You caught the ${ev.sp?.name ?? 'rare creature'}! Holo-networks pay ${pay(8000)} for the footage.`, '✨', 'gold');
      break;
    case 'trader':
    case 'refugees':
    case 'wreck':
      // Their deals already spoke for themselves.
      break;
    default: {
      const loot = ev.kind === 'raid' ? 15000 + Math.floor(Math.random() * 15000) : 25000;
      w.hooks?.toast(`${pl.name} is safe! Salvage: ${pay(loot)}`, '🛡️', 'good');
    }
  }
  w.counter('events');
  audio.sfx('success');
  w.hooks?.eventEnded(ev, true);
}

/** End an event without fuss (refugees turned away). */
export function dismiss(w: World, ev: GEvent) {
  w.s.events = w.s.events.filter((x) => x !== ev);
  w.hooks?.eventEnded(ev, false);
}

export function fail(w: World, ev: GEvent) {
  w.s.events = w.s.events.filter((x) => x !== ev);
  const ps = w.ps(ev.star, ev.planet);
  const pl = w.planet(ev.star, ev.planet);
  const info = EVENT_INFO[ev.kind];
  if (info.good) {
    const msg: Partial<Record<EventKind, string>> = {
      distress: `The distress beacon near ${pl.name} has gone silent.`,
      relic: `The ancient signal on ${pl.name} faded away.`,
      rare: `The ${ev.sp?.name ?? 'rare creature'} has migrated off ${pl.name}.`,
      trader: `The wandering trader packed up and left ${pl.name}.`,
      refugees: `The refugee fleet gave up waiting at ${pl.name} and moved on.`,
    };
    w.hooks?.toast(msg[ev.kind] ?? `${info.label} ended.`, info.icon);
    w.hooks?.eventEnded(ev, false);
    return;
  }
  if (ev.unmaking) {
    // The story's strike: the whole colony is unmade.
    ps.cities = 0;
    ps.owner = undefined;
    ps.bld = { factory: 0, leisure: 0, turret: 0 };
    ps.stored = 0;
    if (!w.gal.planets(ev.star).some((p) => w.peekPS(ev.star, p.idx).owner === 'player')) w.setOwner(ev.star, null);
    w.hooks?.toast(`The Hollow unmade ${pl.name}. Its cities are dust, and the world is nobody's now.`, '🏚️', 'bad');
    w.game.history(`The Hollow unmade ${pl.name}`, '🏚️');
  } else if (ev.kind === 'raid') {
    ps.stored = 0;
    knockBuilding(ps);
    w.hooks?.toast(`Pirates looted ${pl.name}: its spice and a building are gone.`, '🏴‍☠️', 'bad');
  } else if (ev.kind === 'eco') {
    // A species dies out: the top animal slot empties.
    for (let i = 11; i >= 0; i--) {
      const sp = ps.eco[i];
      if (sp && sp.diet !== 'plant') { ps.eco[i] = null; break; }
    }
    w.hooks?.toast(`A species on ${pl.name} went extinct. The planet is unstable.`, '☣️', 'bad');
  } else if (ev.kind === 'meteor') {
    ps.stored = 0;
    const lost = [knockBuilding(ps), knockBuilding(ps)].filter(Boolean).length;
    w.hooks?.toast(`The meteor storm pounded ${pl.name}: its spice store${lost ? ` and ${lost === 2 ? 'two buildings' : 'a building'}` : ''} gone.`, '☄️', 'bad');
  } else {
    ps.cities = Math.max(0, ps.cities - 1);
    while (used(ps) > slots(ps)) knockBuilding(ps);
    if (ps.cities === 0) {
      const takeover = ev.kind === 'invasion' && ev.empire ? ev.empire : null;
      ps.owner = takeover ?? undefined;
      if (takeover) { ps.cities = 1; ps.def = 300; ps.cityHp = 450; }
      const still = w.gal.planets(ev.star).some((p) => w.peekPS(ev.star, p.idx).owner === 'player');
      if (!still) w.setOwner(ev.star, takeover);
      w.hooks?.toast(`${pl.name} has fallen${takeover ? ' to ' + (w.emap.get(takeover)?.name ?? 'the enemy') : ''}.`, '🏚️', 'bad');
    } else w.hooks?.toast(`${pl.name} lost a city to the attackers.`, '🔥', 'bad');
  }
  audio.sfx('fail');
  w.hooks?.eventEnded(ev, false);
}

export function eventAt(w: World, star: number): GEvent | undefined {
  return w.s.events.find((e) => e.star === star);
}

// ------------------------------------------------------------------ trader & refugees
export interface Deal { kind: 'tool' | 'spice' | 'crate' | 'blueprint' | 'parts' | 'gear'; icon: string; name: string; desc: string; price: number; block: string | null; take(): string }

/** Roll what a trader carries besides the usual three: a blueprint, a bundle of components and a finished part. */
function stockTrader(w: World): NonNullable<GEvent['stock']> {
  const st: NonNullable<GEvent['stock']> = {};
  if (Math.random() < 0.6) st.bp = pickBlueprint(w) ?? undefined;
  const comps = rollComps(1, 0.4);
  st.comp = Object.keys(comps)[0];
  st.compN = 2 + Math.floor(Math.random() * 2);
  if (Math.random() < 0.5) { const g = pickFoundTool(w); if (g && TOOL_MAP[g.id].kind !== 'consumable') st.gear = g.id; }
  return st;
}

const COMP_PRICE: Record<string, number> = { common: 8000, uncommon: 15000, rare: 40000 };

/** The trader's deals (null once taken or not stocked): a cut-price tool bundle, a spice buyer, a mystery crate,
 * and, if rolled, a blueprint, a bundle of components and a finished part (sold without needing its blueprint). */
export function traderDeals(w: World, ev: GEvent): (Deal | null)[] {
  const r = new RNG(ev.seed ?? ev.id);
  const rank = w.rank();
  const pool = TOOLS.filter((t) => t.kind === 'consumable' && !t.special && t.rank <= rank + 1 && t.id !== 'cracker' && t.id !== 'embassy');
  const t = r.pick(pool);
  const n = t.price <= 30000 ? 3 : 1;
  const toolPrice = Math.round((w.toolPrice(t, 'own') * n * 0.5) / 100) * 100;
  const tool: Deal = {
    kind: 'tool', icon: t.icon, name: `${n} × ${t.name}`, desc: `Half the shop price. ${t.desc}`, price: toolPrice,
    block: w.s.money < toolPrice ? 'Not enough money' : (w.s.tools[t.id] ?? 0) + n > (t.max ?? 99) ? 'No room for more' : null,
    take() { w.addMoney(-toolPrice); w.give(t.id, n); return `Bought ${n} × ${t.icon} ${t.name} for §${fmt(toolPrice)}.`; },
  };
  const c = [...SPICE_COLORS].sort((a, b) => w.s.spice[b] * SPICE[b].base - w.s.spice[a] * SPICE[a].base)[0];
  const have = w.s.spice[c];
  const unit = Math.round(SPICE[c].base * 2.4);
  const spice: Deal = {
    kind: 'spice', icon: '🧂', name: have ? `Your ${have} ${SPICE[c].name}` : 'Spice buyer', desc: have ? `Bought at §${fmt(unit)} each, 2.4× the going rate.` : 'Pays 2.4× the going rate for spice. Come back with some!', price: -have * unit,
    block: have ? null : 'You carry no spice',
    take() { w.s.spice[c] = 0; w.addMoney(have * unit); w.hooks?.changed(); return `Sold ${have} ${SPICE[c].name} for §${fmt(have * unit)}.`; },
  };
  const crateCost = 15000;
  const crate: Deal = {
    kind: 'crate', icon: '📦', name: 'Mystery crate', desc: 'Sealed tight and rattling. Credits? Gadgets? Something alive? It goes to your hold to open whenever you like.', price: crateCost,
    block: w.s.money < crateCost ? 'Not enough money' : w.count('crate') >= (TOOL_MAP.crate.max ?? 9) ? 'No room for more crates' : null,
    take() { w.addMoney(-crateCost); w.give('crate', 1); return 'A mystery crate is stowed in your hold. Open it from Ship → Cargo.'; },
  };
  const stock = ev.stock ?? {};
  let bp: Deal | null = null, parts: Deal | null = null, gear: Deal | null = null;
  if (stock.bp && TOOL_MAP[stock.bp]) {
    const bt = TOOL_MAP[stock.bp];
    const cost = Math.round((bt.price * 0.25) / 1000) * 1000;
    bp = {
      kind: 'blueprint', icon: '📐', name: `${bt.name} blueprint`, desc: `Plans for ${bt.icon} ${bt.name} (${RANKS[Math.min(bt.rank, RANKS.length - 1)].name} rank). Build it at a shop once you have the components it lists.`, price: cost,
      block: hasBlueprint(w, bt.id) ? 'You already have it' : w.s.money < cost ? 'Not enough money' : null,
      take() { w.addMoney(-cost); giveSalvage(w, { bp: bt.id }); return `Bought the ${bt.name} blueprint for §${fmt(cost)}.`; },
    };
  }
  if (stock.comp && COMPONENTS[stock.comp as CompId]) {
    const c = COMPONENTS[stock.comp as CompId], n = stock.compN ?? 2;
    const cost = COMP_PRICE[c.rarity] * n;
    parts = {
      kind: 'parts', icon: c.icon, name: `${n} × ${c.name}`, desc: `${c.desc} A ${c.rarity} component for advanced parts.`, price: cost,
      block: w.s.money < cost ? 'Not enough money' : null,
      take() { w.addMoney(-cost); giveSalvage(w, { comps: { [stock.comp as CompId]: n } }); return `Bought ${n} × ${c.icon} ${c.name} for §${fmt(cost)}.`; },
    };
  }
  if (stock.gear && TOOL_MAP[stock.gear]) {
    const gt = TOOL_MAP[stock.gear];
    const cost = Math.round((w.toolPrice(gt, 'own') * (RECIPES[gt.id] ? 1.1 : 0.75)) / 1000) * 1000;
    const have = owned(w, gt);
    gear = {
      kind: 'gear', icon: gt.icon, name: gt.name, desc: `${gt.desc} ${RECIPES[gt.id] ? 'Fully assembled: no blueprint or components needed.' : 'A quarter off the shop price.'}`, price: cost,
      block: have ? 'You already have it' : w.s.money < cost ? 'Not enough money' : null,
      take() { w.addMoney(-cost); grantTool(w, gt); w.hooks?.changed(); return `Bought and installed ${gt.icon} ${gt.name} for §${fmt(cost)}.`; },
    };
  }
  const all = [tool, spice, crate, bp, parts, gear];
  return all.map((d, i) => (d && (ev.deals ?? []).includes(i) ? d : null));
}

/** Take deal `i`. Returns the result line, or null if it was refused. The trader leaves once sold out. */
export function takeDeal(w: World, ev: GEvent, i: number): string | null {
  const d = traderDeals(w, ev)[i];
  if (!d || d.block) return null;
  const msg = d.take();
  ev.deals = (ev.deals ?? []).filter((x) => x !== i);
  audio.sfx('coin');
  if (!ev.deals.length) resolve(w, ev);
  return msg;
}

/** Take the refugees in: a new city if the colony has room, otherwise a tax windfall. */
export function welcomeRefugees(w: World, ev: GEvent): string {
  const ps = w.ps(ev.star, ev.planet);
  const pl = w.planet(ev.star, ev.planet);
  let msg: string;
  if (ps.owner === 'player' && ps.cities < maxCities(w, ev.star, ev.planet)) {
    ps.cities++;
    msg = `The refugees found a new city on ${pl.name}! It now has ${ps.cities} cities.`;
  } else {
    w.addMoney(12000);
    msg = `With no room for a new city, the refugees settle into ${pl.name}'s towns and pay their way: +§12,000.`;
  }
  resolve(w, ev);
  return msg;
}
