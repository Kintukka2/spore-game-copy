// Missions: the homeworld onboarding chain, the main line (Hollow, then the Core) and
// randomly generated empire missions (deliver, scan, pirates, terraform, explore).
import { audio } from '../../engine/audio';
import { fmt } from '../../engine/math';
import { HOLLOW_RANK, SPICE, SPICE_COLORS, type SpiceColor } from './data';
import type { Empire, Mission } from './types';
import { addMod, strength } from './empires';
import { giveSalvage, rollSalvage, salvageLine } from './salvage';
import type { World } from './world';
import { marketJobDone } from './market';

// ------------------------------------------------------------------ onboarding
export const TUTORIAL: { step: string; title: string; desc: string; reward: number }[] = [
  { step: 'helm', title: 'Take the helm', desc: 'Drag anywhere to fly. Pass through the 3 glowing beacons around your homeworld.', reward: 5000 },
  { step: 'scan', title: 'Survey the wreck', desc: 'A strange wreck lies on {p}. Tap the planet, then Scan it.', reward: 10000 },
  { step: 'abduct', title: 'Collect a specimen', desc: 'Land on {p} (🛬 Land), find one of its creatures and beam it up.', reward: 8000 },
  { step: 'jump', title: 'The first jump', desc: 'Open the galaxy map (🌌), tap a nearby star and travel there.', reward: 12000 },
  { step: 'colony', title: 'Plant a flag', desc: 'Use your free Colony Pack to settle a planet that has spice. {p} is a fine choice.', reward: 25000 },
];

export function startTutorial(w: World) {
  w.s.flags.tut = 0;
  pushTutorial(w, 0);
}

function pushTutorial(w: World, i: number) {
  const t = TUTORIAL[i];
  if (!t) return;
  const home = w.gal.homeStar;
  const p2 = w.planet(home, 2).name;
  w.s.missions = w.s.missions.filter((m) => m.kind !== 'tutorial');
  w.s.missions.unshift({ id: w.nid(), kind: 'tutorial', giver: 'home', step: t.step, title: t.title, desc: t.desc.replace('{p}', p2), reward: t.reward, deadline: 0, main: true, star: t.step === 'jump' ? undefined : home, planet: t.step === 'helm' || t.step === 'jump' ? undefined : 2, progress: 0 });
  if (t.step === 'colony') w.give('colonypack', 1);
}

/** Advance the onboarding chain if `step` is the current one. */
export function tutorialEvent(w: World, step: string) {
  const i = Number(w.s.flags.tut ?? 99);
  const t = TUTORIAL[i];
  if (!t || t.step !== step || w.s.flags.tutDone) return;
  const m = w.s.missions.find((x) => x.kind === 'tutorial');
  if (m) complete(w, m);
  w.s.flags.tut = i + 1;
  if (i + 1 >= TUTORIAL.length) {
    w.s.flags.tutDone = true;
    w.hooks?.toast('Onboarding complete. You are now a Captain!', '🎖️', 'gold');
    w.game.history('Earned the Captain\'s badge', '🎖️');
  } else pushTutorial(w, i + 1);
}

// ------------------------------------------------------------------ main line
export function checkMainMissions(w: World) {
  if (!w.s.flags.tutDone) return;
  const rank = w.rank();
  const has = (k: string) => w.s.missions.some((m) => m.kind === k) || w.s.flags['done-' + k];
  const add = (m: Omit<Mission, 'id' | 'giver' | 'deadline' | 'main'>) => {
    w.s.missions.unshift({ ...m, id: w.nid(), giver: 'home', deadline: 0, main: true });
    w.hooks?.toast(`New mission: ${m.title}`, '📜', 'gold');
    audio.sfx('bell');
  };
  if (!has('contact') && !w.empires.some((e) => e.met && e.arch !== 'hollow')) add({ kind: 'contact', title: 'Make first contact', desc: 'Somewhere nearby, another species has reached the stars. Find their territory.', reward: 25000 });
  if (rank >= 2 && !has('colonize')) add({ kind: 'colonize', title: 'Grow the empire', desc: 'Hold 4 star systems (colonise, buy or conquer).', reward: 75000, amount: 4 });
  if (rank >= 3 && !has('ally')) add({ kind: 'ally', title: 'Find a friend', desc: 'Form an alliance with another empire.', reward: 120000 });
  if (rank >= HOLLOW_RANK && !has('hollow')) add({ kind: 'hollow', title: 'Contact the Hollow', desc: 'Something cold rings the galactic core. Travel into the Hollow\'s grey worlds and hail them.', reward: 200000 });
  if (w.s.flags.hollowContact && !has('core')) add({ kind: 'core', title: 'Reach the Core', desc: 'Beyond the Hollow, the heart of the galaxy is calling. You need a Star Drive III or better to fight its gravity.', reward: 0, star: 0 });
}

// ------------------------------------------------------------------ empire missions
export function offerFor(w: World, e: Empire): Mission {
  const existing = w.s.offers[e.id];
  if (existing) return existing;
  const r = Math.random;
  const mult = e.arch === 'hollow' ? 2 : 1;
  const st = strength(w, e);
  const mine = w.starsOf(e.id);
  const kinds: Mission['kind'][] = ['deliver', 'scan', 'pirates', 'explore'];
  if (w.has('cloudengine') || w.has('thermlance') || w.count('stormpod') + w.count('meteor') + w.count('icecomet') + w.count('droughtpod') > 0) kinds.push('terraform');
  let m: Mission | null = null;
  for (let tries = 0; tries < 8 && !m; tries++) {
    const kind = kinds[Math.floor(r() * kinds.length)];
    if (kind === 'deliver') {
      const opts = SPICE_COLORS.filter((c) => !e.produces.includes(c));
      const c: SpiceColor = opts.length ? opts[Math.floor(r() * opts.length)] : 'red';
      const n = 2 + Math.floor(r() * 5);
      m = { id: 0, kind, giver: e.id, title: `Deliver ${n} ${SPICE[c].name}`, desc: `Bring ${n} units of ${SPICE[c].name} spice to any ${e.species} world.`, color: c, amount: n, reward: Math.round(n * SPICE[c].base * 22 * mult), deadline: 600 };
    } else if (kind === 'scan' || kind === 'terraform') {
      const pool: [number, number][] = [];
      const near = w.gal.within(e.home, 260).concat([e.home]);
      for (const sid of near) {
        const s = w.star(sid);
        if (s.hollow) continue;
        for (const p of w.gal.planets(sid)) {
          const t = w.tscore(sid, p.idx);
          if (kind === 'scan' && p.life && !w.peekPS(sid, p.idx).scanned) pool.push([sid, p.idx]);
          if (kind === 'terraform' && w.ownerOf(sid) === e.id && p.kind === 'rocky' && t < 3 && t >= 0 && p.feature !== 'empire-home') pool.push([sid, p.idx]);
        }
      }
      if (!pool.length) continue;
      const [sid, idx] = pool[Math.floor(r() * pool.length)];
      const pl = w.planet(sid, idx);
      if (kind === 'scan') m = { id: 0, kind, giver: e.id, title: `Scan life on ${pl.name}`, desc: `Our scientists want scans of the creatures of ${pl.name} (${w.star(sid).name}).`, star: sid, planet: idx, reward: Math.round((18000 + r() * 20000) * mult), deadline: 0 };
      else {
        const t = w.tscore(sid, idx);
        m = { id: 0, kind, giver: e.id, title: `Terraform ${pl.name}`, desc: `Raise ${pl.name} (${w.star(sid).name}) to T${t + 1}.`, star: sid, planet: idx, tscore: t + 1, reward: Math.round((60000 + r() * 40000) * mult), deadline: 0 };
      }
    } else if (kind === 'pirates') {
      const sys = mine.length ? mine[Math.floor(r() * mine.length)] : e.home;
      m = { id: 0, kind, giver: e.id, title: `Clear pirates at ${w.star(sys).name}`, desc: `Pirates prey on our ships near ${w.star(sys).name}. Destroy them.`, star: sys, reward: Math.round((35000 + st * 10000 + r() * 20000) * mult), deadline: 540 };
    } else if (kind === 'explore') {
      const far = w.gal.within(e.home, 420).filter((id) => !w.visited(id) && w.gal.dist(id, e.home) > 160 && !w.star(id).hollow && w.star(id).type !== 'core');
      if (!far.length) continue;
      const sid = far[Math.floor(r() * far.length)];
      m = { id: 0, kind, giver: e.id, title: `Explore ${w.star(sid).name}`, desc: `Chart the ${w.star(sid).name} system for us.`, star: sid, reward: Math.round((14000 + r() * 16000) * mult), deadline: 0 };
    }
  }
  if (!m) m = { id: 0, kind: 'explore', giver: e.id, title: 'Chart the frontier', desc: 'Visit any system you have never been to.', reward: 12000 * mult, deadline: 0 };
  // Now and then they throw in something rare: a blueprint, components or a finished part.
  if (r() < 0.15) {
    const bonus = rollSalvage(w, 'mission');
    if (bonus.bp || bonus.tool || bonus.comps) m.bonus = bonus;
  }
  w.s.offers[e.id] = m;
  return m;
}

export function acceptOffer(w: World, e: Empire): string | null {
  const m = w.s.offers[e.id];
  if (!m) return 'No offer.';
  if (w.s.missions.filter((x) => !x.main).length >= 4) return 'You already have 4 missions. Finish or abandon one first.';
  delete w.s.offers[e.id];
  const mm: Mission = { ...m, id: w.nid(), deadline: m.deadline ? w.s.t + m.deadline : 0, progress: 0 };
  w.s.missions.push(mm);
  addMod(e, 'mission-accept', 'You accepted our request', 3, { max: 6, decay: 0.5 });
  audio.sfx('card');
  return null;
}

export function declineOffer(w: World, e: Empire) {
  delete w.s.offers[e.id];
  addMod(e, 'declined', 'You turned down our request', -5, { min: -15, decay: 1 });
}

export function abandon(w: World, m: Mission) {
  if (m.main) return;
  w.s.missions = w.s.missions.filter((x) => x !== m);
  const e = w.emap.get(m.giver);
  if (e) addMod(e, 'failed', 'You failed our mission', -10, { min: -30, decay: 0.5 });
}

export function complete(w: World, m: Mission) {
  w.s.missions = w.s.missions.filter((x) => x !== m);
  if (m.reward) w.addMoney(m.reward);
  if (m.kind !== 'tutorial') w.counter('missions');
  if (m.main) w.s.flags['done-' + m.kind] = true;
  const e = w.emap.get(m.giver);
  if (e) addMod(e, 'missions', 'You completed our missions', 18, { max: e.arch === 'hollow' ? 50 : 100, decay: 0.4 });
  audio.sfx('success');
  const extra = m.bonus ? giveSalvage(w, m.bonus) : [];
  if (extra.length && w.hooks?.loot) w.hooks.loot(`Mission complete: ${m.title}`, [...(m.reward ? [{ icon: '💰', text: `+§${fmt(m.reward)}` }] : []), ...extra], '✅');
  else w.hooks?.toast(`Mission complete: ${m.title}${m.reward ? ' · +§' + fmt(m.reward) : ''}${extra.length ? ` · ${salvageLine(extra)}` : ''}`, '✅', 'good');
  if (m.market) marketJobDone(w, m);
  w.hooks?.missionDone(m);
}

// ------------------------------------------------------------------ progress hooks
export function onArrive(w: World, star: number) {
  for (const m of [...w.s.missions]) {
    if (m.kind === 'explore' && m.star === star) complete(w, m);
    if (m.kind === 'explore' && m.star === undefined && !w.visited(star)) complete(w, m);
  }
}

export function onScan(w: World, star: number, idx: number) {
  for (const m of [...w.s.missions]) if (m.kind === 'scan' && m.star === star && m.planet === idx) complete(w, m);
}

export function onTerraformed(w: World, star: number, idx: number, t: number) {
  for (const m of [...w.s.missions]) if (m.kind === 'terraform' && m.star === star && m.planet === idx && t >= (m.tscore ?? 3)) complete(w, m);
}

export function onPiratesCleared(w: World, star: number) {
  for (const m of [...w.s.missions]) if (m.kind === 'pirates' && m.star === star) complete(w, m);
}

/** Deliverable missions for an empire with what's in the hold. */
export function deliverables(w: World, e: Empire): Mission[] {
  return w.s.missions.filter((m) => m.kind === 'deliver' && m.giver === e.id && m.color && w.s.spice[m.color] >= (m.amount ?? 1));
}
export function deliver(w: World, m: Mission) {
  if (!m.color) return;
  w.s.spice[m.color] -= m.amount ?? 1;
  complete(w, m);
}

export function missionsTick(w: World, dt: number) {
  for (const m of [...w.s.missions]) {
    if (m.deadline && w.s.t > m.deadline) {
      w.s.missions = w.s.missions.filter((x) => x !== m);
      const e = w.emap.get(m.giver);
      if (e) addMod(e, 'failed', 'You failed our mission', -10, { min: -30, decay: 0.5 });
      w.hooks?.toast(`Mission failed: ${m.title}`, '⌛', 'bad');
      continue;
    }
    if (m.kind === 'contact' && w.empires.some((e) => e.met && e.arch !== 'hollow')) complete(w, m);
    else if (m.kind === 'colonize' && w.countStars('player') >= (m.amount ?? 4)) complete(w, m);
    else if (m.kind === 'ally' && w.empires.some((e) => e.allied)) complete(w, m);
    else if (m.kind === 'hollow' && w.s.flags.hollowContact) { complete(w, m); checkMainMissions(w); }
  }
}

export function missionTarget(m: Mission): number | undefined {
  return m.star;
}
