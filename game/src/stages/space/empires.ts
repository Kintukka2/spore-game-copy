// AI empires and the Hollow: generation, relations, diplomacy actions and the expansion AI.
import { RNG } from '../../engine/rng';
import { clamp } from '../../engine/math';
import { audio } from '../../engine/audio';
import { generateCreature, generateShip } from '../../design/generate';
import { hsl, shade } from '../../design/color';
import { empireName } from '../../game/names';
import type { Palette } from '../../design/types';
import { AI_ARCHES, PERSONALITY, SPICE_COLORS, STANCES, type AiArch, type SpiceColor, type StanceId } from './data';
import type { Empire, Star } from './types';
import type { World } from './world';

const PATTERNS: Palette['pattern'][] = ['bands', 'stripes', 'none', 'gradient', 'dots'];

function blankDemand(): Record<SpiceColor, number> {
  return { red: 1, yellow: 1, blue: 1, green: 1, pink: 1, purple: 1 };
}

// ------------------------------------------------------------------ generation
export function createEmpires(w: World) {
  const r = w.game.rng('space-empires');
  const gal = w.gal;
  const home = gal.stars[gal.homeStar];
  const d = (a: Star, b: Star) => Math.hypot(a.x - b.x, a.y - b.y);
  const n = r.int(14, 18);
  const cands = gal.stars.filter((s) => !s.hollow && !['core', 'blackhole', 'proto'].includes(s.type) && s.r > 400 && s.id !== home.id && gal.within(s.id, 90).length >= 2);
  r.shuffle(cands);
  const homes: Star[] = [];
  const near = cands.find((s) => d(s, home) > 150 && d(s, home) < 240);
  if (near) homes.push(near);
  for (const s of cands) {
    if (homes.length >= n) break;
    if (d(s, home) < 240 || homes.some((h) => d(h, s) < 190)) continue;
    homes.push(s);
  }
  const hue0 = r.range(0, 360);
  const used = new Set<number>([home.id]);
  homes.forEach((hs, i) => {
    const seed = r.seedInt();
    const er = new RNG(seed);
    const hue = (hue0 + (i * 360) / homes.length + er.range(-8, 8)) % 360;
    const color = hsl(hue, 0.72, 0.58);
    const arch: AiArch = i === 0 ? r.pick(['merchant', 'envoy', 'mystic', 'minstrel', 'gardener'] as AiArch[]) : r.pick(AI_ARCHES);
    const creature = generateCreature(new RNG(seed + 1), { level: 3 });
    const pal: Palette = { base: color, coat: shade(color, -0.4), detail: hsl((hue + 160) % 360, 0.6, 0.82), pattern: er.pick(PATTERNS) };
    const ship = generateShip(new RNG(seed + 2), pal, creature.name + ' ' + er.pick(['Vanguard', 'Envoy', 'Lancer', 'Warden', 'Clipper', 'Herald']));
    const id = 'e' + i;
    const e: Empire = {
      id, seed, name: empireName(new RNG(seed + 3), creature.name), species: creature.name, color, arch, home: hs.id, creature, ship,
      produces: [], met: false, war: false, allied: false, mods: [], demand: blankDemand(), route: null, takeover: {},
      expandT: er.range(40, 160), moodT: er.range(30, 90), serenade: 0, mult: blankDemand(),
    };
    gal.markEmpireHome(hs.id, id);
    w.genOwner.set(hs.id, id);
    used.add(hs.id);
    // A few starting colonies around the home system.
    const k = er.int(1, 4);
    const nearStars = gal.within(hs.id, 150)
      .map((sid) => gal.stars[sid])
      .filter((s) => !s.hollow && !used.has(s.id) && !['core', 'blackhole', 'proto'].includes(s.type) && d(s, home) > 110)
      .sort((a, b) => d(a, hs) - d(b, hs));
    for (const s of nearStars.slice(0, k)) { w.genOwner.set(s.id, id); used.add(s.id); }
    w.empires.push(e);
    w.emap.set(id, e);
  });
  // The Hollow
  const hr = new RNG(r.seedInt());
  const hollowPal: Palette = { base: '#5d6472', coat: '#2b2f38', detail: '#ff3b4a', pattern: 'bands' };
  const hcre = generateCreature(new RNG(hr.seedInt()), { level: 4, name: 'Hollow' });
  hcre.colors = { base: '#8a93a6', coat: '#3a3f4a', detail: '#ff3b4a', pattern: 'scales' };
  const hollowHome = gal.stars.filter((s) => s.hollow).sort((a, b) => a.r - b.r)[0];
  const hollow: Empire = {
    id: 'hollow', seed: 777, name: 'The Hollow', species: 'Hollow', color: '#9aa3b5', arch: 'hollow', home: hollowHome?.id ?? 1,
    creature: hcre, ship: generateShip(new RNG(hr.seedInt()), hollowPal, 'Hollow Drone'), produces: [],
    met: false, war: true, allied: false, mods: [], demand: blankDemand(), route: null, takeover: {}, expandT: 1e9, moodT: 600, serenade: 0, mult: blankDemand(),
  };
  w.empires.push(hollow);
  w.emap.set('hollow', hollow);
  // Prices and starting moods (deterministic from the empire's own seed).
  for (const e of w.empires) {
    const pr = new RNG(e.seed + 9);
    const prod = new Set<SpiceColor>();
    for (const [sid, o] of w.genOwner) {
      if (o !== e.id) continue;
      const ci = gal.colonyIdx(sid);
      const sp = ci >= 0 ? gal.planets(sid)[ci]?.spice : null;
      if (sp) prod.add(sp);
    }
    e.produces = [...prod];
    for (const c of SPICE_COLORS) e.mult[c] = prod.has(c) ? 1 : pr.range(6, 36);
    for (let i = 0; i < 2; i++) e.mult[pr.pick(SPICE_COLORS)] = 1;
    initMods(w, e);
  }
}

function initMods(w: World, e: Empire) {
  e.mods = [];
  if (e.arch === 'hollow') {
    e.mods.push({ id: 'distrust', label: 'We distrust all flesh', v: -70 });
    return;
  }
  const p = PERSONALITY[e.arch];
  if (p.start) e.mods.push({ id: 'nature', label: p.startLabel, v: p.start });
  if (w.perks.has('warm-welcome')) e.mods.push({ id: 'welcome', label: 'Warm welcome', v: 10 });
  if (w.game.state?.archetype === e.arch) e.mods.push({ id: 'alike', label: 'We think alike', v: 10 });
}

// ------------------------------------------------------------------ relations
export function relation(e: Empire): number {
  if (e.serenade > 0) return 0;
  let s = 0;
  for (const m of e.mods) s += m.v;
  return clamp(Math.round(s), -100, 100);
}

export function stance(e: Empire): StanceId {
  if (e.war && e.serenade <= 0) return 'war';
  if (e.allied) return 'allied';
  const r = relation(e);
  if (r >= 30) return 'friendly';
  if (r > -30) return 'neutral';
  if (r > -70) return 'wary';
  return 'hostile';
}
export function stanceInfo(e: Empire) {
  return STANCES.find((s) => s.id === stance(e))!;
}

/** Add to (or create) a modifier, clamped to its max/min. */
export function addMod(e: Empire, id: string, label: string, dv: number, o: { max?: number; min?: number; decay?: number } = {}) {
  let m = e.mods.find((x) => x.id === id);
  if (!m) { m = { id, label, v: 0, decay: o.decay, max: o.max, min: o.min }; e.mods.push(m); }
  m.v += dv;
  if (o.max !== undefined) m.v = Math.min(m.v, o.max);
  if (o.min !== undefined) m.v = Math.max(m.v, o.min);
  m.label = label;
  if (o.decay !== undefined) m.decay = o.decay;
}
export function setMod(e: Empire, id: string, label: string, v: number, decay?: number) {
  const m = e.mods.find((x) => x.id === id);
  if (m) { m.v = v; m.label = label; m.decay = decay; } else e.mods.push({ id, label, v, decay });
}
export function removeMod(e: Empire, id: string) {
  e.mods = e.mods.filter((m) => m.id !== id);
}

/** Strength 1..5 from the number of systems held. */
export function strength(w: World, e: Empire): number {
  if (e.arch === 'hollow') return 5;
  const n = w.countStars(e.id);
  return n >= 13 ? 5 : n >= 9 ? 4 : n >= 6 ? 3 : n >= 4 ? 2 : 1;
}

export function archName(e: Empire): string {
  return e.arch === 'hollow' ? 'Machine' : (e.arch[0].toUpperCase() + e.arch.slice(1));
}

// ------------------------------------------------------------------ diplomacy actions
export function meet(w: World, e: Empire) {
  if (e.met) return;
  e.met = true;
  if (e.arch !== 'hollow') {
    w.game.unlock('first-contact');
    w.counter('diplomacy');
  }
  w.hooks?.firstContact(e);
}

export function contactReply(w: World, e: Empire, choice: 'peace' | 'boast' | 'threat') {
  if (choice === 'peace') addMod(e, 'greet', 'You came in peace', 10, { max: 10 });
  if (choice === 'boast') addMod(e, 'greet', 'Impressed by your boasts', 10, { max: 10, decay: 1 });
  if (choice === 'threat') addMod(e, 'greet', 'You threatened us', -10, { min: -10, decay: 1 });
  w.game.history(`Made contact with ${e.name}`, '👽');
}

export function giftValue(w: World, e: Empire, amount: number): number {
  const st = strength(w, e);
  return Math.round((amount / (8000 * st)) * (e.arch === 'hollow' ? 0.3 : 1));
}

export function gift(w: World, e: Empire, amount: number): number {
  if (w.s.money < amount) return 0;
  w.addMoney(-amount);
  const before = relation(e);
  addMod(e, 'gifts', 'Your gifts', giftValue(w, e, amount), { max: e.arch === 'hollow' ? 10 : 50, decay: 0.6 });
  audio.sfx('coin');
  return relation(e) - before;
}

export function canAlly(w: World, e: Empire): string | null {
  if (e.allied) return 'Already allied.';
  if (e.war) return 'You are at war.';
  if (relation(e) < 70) return 'They need to be closer friends first (relation 70+).';
  return null;
}

export function formAlliance(w: World, e: Empire) {
  e.allied = true;
  e.war = false;
  setMod(e, 'alliance', 'We are allies', 30);
  w.counter('diplomacy', 2);
  w.game.unlock('alliance');
  w.game.history(`Formed an alliance with ${e.name}`, '🤝');
  if (e.arch === 'hollow') {
    for (const o of w.empires) if (o !== e) addMod(o, 'hollowpact', 'Allied with the Hollow', -200, { min: -200 });
  }
}

export function breakAlliance(w: World, e: Empire, byPlayer: boolean) {
  if (!e.allied) return;
  e.allied = false;
  removeMod(e, 'alliance');
  if (byPlayer) addMod(e, 'betrayal', 'You broke our alliance', -60, { min: -100, decay: 1 });
  w.hooks?.toast(`Your alliance with ${e.name} has ended.`, '💔', 'bad');
}

export function canRoute(w: World, e: Empire): string | null {
  if (e.arch === 'hollow') return 'The Hollow do not trade.';
  if (e.route !== null) return 'You already trade with them.';
  if (e.war) return 'You are at war.';
  if (relation(e) < 30) return 'They need to be friendly first (relation 30+).';
  if (w.empires.filter((x) => x.route !== null).length >= 3) return 'You can run at most 3 trade routes.';
  return null;
}

export function openRoute(w: World, e: Empire, star: number) {
  e.route = star;
  setMod(e, 'route', 'Our trade route', e.arch === 'merchant' ? 40 : 30);
  w.game.history(`Opened a trade route with ${e.name}`, '💱');
}

export function declareWar(w: World, e: Empire, reason = 'You declared war on us') {
  if (e.war) return;
  e.war = true;
  if (e.allied) breakAlliance(w, e, true);
  if (e.route !== null) { e.route = null; removeMod(e, 'route'); }
  setMod(e, 'war', reason, -50);
  if (e.arch !== 'hollow') w.game.history(`War with ${e.name}`, '⚔️');
}

export function peacePrice(w: World, e: Empire): number {
  return 150000 * strength(w, e) * (e.arch === 'warlord' || e.arch === 'prophet' ? 2 : 1);
}

export function makePeace(w: World, e: Empire, price = peacePrice(w, e)): boolean {
  if (e.arch === 'hollow') return false;
  if (w.s.money < price) return false;
  w.addMoney(-price);
  e.war = false;
  removeMod(e, 'war');
  addMod(e, 'peace', 'A generous peace offering', 25, { max: 40, decay: 0.5 });
  w.game.history(`Made peace with ${e.name}`, '🕊️');
  return true;
}

/** Galactic law: breaking it angers every empire within reach of the star. */
export function breakLaw(w: World, star: number) {
  const s = w.star(star);
  for (const e of w.empires) {
    if (e.arch === 'hollow') { addMod(e, 'lawbreak', 'You defy the soft ones\' law', 30, { max: 50, decay: 0.5 }); continue; }
    const hs = w.star(e.home);
    const close = Math.hypot(hs.x - s.x, hs.y - s.y) < 420 || w.starsOf(e.id).some((id) => w.gal.dist(id, star) < 300);
    if (close) addMod(e, 'lawbreak', 'You broke galactic law', -150, { min: -200, decay: 1.5 });
  }
  w.hooks?.toast('You broke galactic law. Nearby empires are outraged.', '⚖️', 'bad');
}

/** Hostile act against an empire (attacking ships, bombing). */
export function aggression(w: World, e: Empire, amount = 30) {
  addMod(e, 'attacked', 'You attacked us', -amount, { min: -100, decay: 0.5 });
  if (!e.war) declareWar(w, e, 'You attacked us');
}

/** Transfer every planet an empire owns in a system to the player. */
export function annexSystem(w: World, star: number, how: 'bought' | 'captured' | 'converted') {
  const prev = w.ownerOf(star);
  const pls = w.gal.planets(star);
  for (const p of pls) {
    const ps = w.peekPS(star, p.idx);
    if (ps.owner && ps.owner !== 'player') {
      const m = w.ps(star, p.idx);
      m.owner = 'player';
      m.cities = Math.max(1, m.cities);
      m.def = undefined; m.cityHp = undefined;
      w.counter('colonies');
    }
  }
  w.setOwner(star, 'player');
  const e = prev ? w.emap.get(prev) : null;
  if (e) {
    delete e.takeover[star];
    if (e.route === star) { e.route = null; removeMod(e, 'route'); }
    if (w.countStars(e.id) === 0 && e.arch !== 'hollow') {
      e.dead = true;
      w.hooks?.toast(`${e.name} has fallen.`, '💀', 'gold');
    }
  }
  w.game.unlock('colonist');
  w.game.history(`${how === 'bought' ? 'Bought' : how === 'captured' ? 'Captured' : 'Converted'} the ${w.star(star).name} system`, '🏳️');
  w.hooks?.changed();
}

/** Value of a system for an economic takeover. */
export function systemPrice(w: World, star: number): number {
  let best = 0;
  let home = false;
  for (const p of w.gal.planets(star)) {
    best = Math.max(best, w.tscore(star, p.idx));
    if (p.feature === 'empire-home') home = true;
  }
  return [500000, 1000000, 2500000, 5000000][best] * (home ? 3 : 1);
}

// ------------------------------------------------------------------ AI tick (once per second per empire)
export function empireTick(w: World, e: Empire, dt: number) {
  if (e.dead) return;
  // Relation decay
  for (const m of e.mods) {
    if (!m.decay || m.v === 0) continue;
    const step = (m.decay / 60) * dt;
    m.v = Math.abs(m.v) <= step ? 0 : m.v - Math.sign(m.v) * step;
  }
  e.mods = e.mods.filter((m) => m.v !== 0 || !m.decay);
  if (e.serenade > 0) e.serenade = Math.max(0, e.serenade - dt);
  // Demand recovers toward 1.
  for (const c of SPICE_COLORS) e.demand[c] += (1 - e.demand[c]) * 0.0016 * dt;
  if (e.arch === 'hollow') return;
  // Expansion
  e.expandT -= dt;
  if (e.expandT <= 0) {
    e.expandT = (200 + Math.random() * 200) / PERSONALITY[e.arch].expand;
    expand(w, e);
  }
  // Moods: tribute, war, gifts, alliance upkeep
  e.moodT -= dt;
  if (e.moodT <= 0 && e.met) {
    e.moodT = 50 + Math.random() * 40;
    mood(w, e);
  }
}

function expand(w: World, e: Empire) {
  const mine = w.starsOf(e.id);
  if (mine.length === 0 || mine.length >= 16) return;
  const homeS = w.star(e.home);
  let best: Star | null = null, bd = Infinity;
  for (const sid of mine) {
    for (const nid of w.gal.within(sid, 150)) {
      const s = w.star(nid);
      if (s.hollow || w.ownerOf(nid) || ['core', 'blackhole', 'proto'].includes(s.type)) continue;
      if (w.gal.colonyIdx(nid) < 0) continue;
      const dd = Math.hypot(s.x - homeS.x, s.y - homeS.y) + Math.random() * 60;
      if (dd < bd) { bd = dd; best = s; }
    }
  }
  if (!best) return;
  w.setOwner(best.id, e.id);
  const ci = w.gal.colonyIdx(best.id);
  const ps = w.ps(best.id, ci);
  ps.owner = e.id;
  ps.cities = 1;
  ps.def = 300;
  ps.cityHp = 450;
  const sp = w.planet(best.id, ci).spice;
  if (sp && !e.produces.includes(sp)) { e.produces.push(sp); e.mult[sp] = 1; }
  // Tell the player if it's close to them.
  const near = w.starsOf('player').some((id) => w.gal.dist(id, best!.id) < 220);
  if (near && e.met) w.hooks?.toast(`${e.name} settled ${best.name}.`, '🏳️');
}

function mood(w: World, e: Empire) {
  const rel = relation(e);
  const p = PERSONALITY[e.arch as AiArch];
  if (e.allied && rel < 30) breakAlliance(w, e, false);
  if (e.war) {
    // Invade a nearby player colony now and then.
    if (Math.random() < w.game.diff(0.12, 0.2, 0.3)) {
      const target = w.colonies().find(([sid]) => sid !== w.gal.homeStar && w.starsOf(e.id).some((id) => w.gal.dist(id, sid) < 380));
      if (target && !w.s.events.some((ev) => ev.star === target[0])) {
        const ev = { id: w.nid(), kind: 'invasion' as const, star: target[0], planet: target[1], until: w.s.t + 160, empire: e.id };
        w.s.events.push(ev);
        w.hooks?.eventStarted(ev);
      }
    }
    return;
  }
  if (p.aggressive && !e.allied) {
    if (rel <= -70 && Math.random() < 0.35) {
      declareWar(w, e, 'They chose war');
      w.hooks?.toast(`${e.name} declared war on you!`, '⚔️', 'bad');
      audio.sfx('alarm');
      return;
    }
    if (rel <= -25 && Math.random() < 0.3 && (!e.tributeAsked || w.s.t - e.tributeAsked > 300)) {
      e.tributeAsked = w.s.t;
      w.hooks?.tribute(e, 25000 * strength(w, e));
      return;
    }
  }
  if (rel >= 55 && Math.random() < 0.08) {
    const amt = 5000 * strength(w, e);
    w.addMoney(amt);
    w.hooks?.toast(`${e.name} sent you a gift of §${amt.toLocaleString('en-US')}.`, '🎁', 'good');
  }
}

export function payTribute(w: World, e: Empire, amount: number, pay: boolean) {
  if (pay && w.s.money >= amount) {
    w.addMoney(-amount);
    addMod(e, 'tribute', 'You paid tribute', 15, { max: 30, decay: 0.5 });
  } else {
    addMod(e, 'refused', 'You refused our demands', -25, { min: -60, decay: 0.5 });
    if (Math.random() < 0.4) {
      declareWar(w, e, 'You refused our demands');
      w.hooks?.toast(`${e.name} declared war on you!`, '⚔️', 'bad');
    }
  }
}
