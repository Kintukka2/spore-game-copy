// The main story, "The Lamplight": ten chapters told over signals. A voice in the static, with no name and no
// face (only ??????), asks for help with a galaxy that is going dark, and every chapter you finish brings you
// a veil closer to the core. The Hollow strike back. Halfway through, the voice is cut off and a Hollow
// defector, Echo, takes over; the Hollow Prime, the Conductor, warns you off; at the core the voice turns out
// to be Ori. The calls themselves are in ui/storyTalk.ts.
//
// A chapter waits for its signal (a pause and a rank), then a call offers it. Accepting turns its goals into
// main missions (kind 'story'). When the last goal of its last step is done, a closing call pays out, and the
// next chapter's signal starts waiting.
import { fmt } from '../../engine/math';
import { audio } from '../../engine/audio';
import { TOOL_MAP } from './data';
import { addMod } from './empires';
import { isHomeworld, slots, used } from './economy';
import { knockBuilding, start as startEvent } from './events';
import { complete } from './missions';
import { grantTool } from './salvage';
import type { Mission, Planet, Star, StoryGoal, StoryState } from './types';
import type { World } from './world';
import type { Design } from '../../design/types';

// ------------------------------------------------------------------ the veils around the core
export interface Veil { r: number; gear: string; name: string; desc: string }

/** Outermost first. A star closer to the centre than `r` can only be reached with the gear. */
export const VEILS: Veil[] = [
  { r: 262, gear: 'lens', name: 'The Static', desc: 'A storm of Hollow jamming hides the inner ring. Your ship needs a Static Lens to see a way through.' },
  { r: 150, gear: 'anchor', name: 'The Shear', desc: 'Gravity tears at every ship near the inner bastions. Your ship needs a Null Anchor to hold its course.' },
  { r: 105, gear: 'choirkey', name: 'The Silent Gate', desc: 'The last bastions sit behind a gate that opens only to the Choir\'s song. Your ship needs the Choir Key.' },
  { r: 30, gear: 'lampwick', name: 'The Lamp', desc: 'The light at the middle of everything burns too bright to fly into. Your ship needs a Lampwick Sail.' },
];

/** The veil that keeps you out of a system, if any. */
export function veilBlock(w: World, star: number): Veil | null {
  const r = w.star(star).r;
  for (const v of VEILS) if (r < v.r && !w.has(v.gear)) return v;
  return null;
}

/** Hollow worlds are sealed, except one where a story relic waits: the Hollow cannot bear to go near it. */
export function sealedHollow(w: World, star: number, idx: number): boolean {
  return !!w.star(star).hollow && !w.s.events.some((e) => e.storyGoal !== undefined && e.star === star && e.planet === idx);
}

// ------------------------------------------------------------------ chapters
export type Who = 'ori' | 'echo' | 'conductor';
type Targets = StoryState['tg'];

interface Goal { goal: StoryGoal; title: string; desc: string; star: number; planet?: number; tscore?: number }

export interface ChapterDef {
  id: string;
  title: string;
  /** Rank needed, and seconds after the previous chapter (or the onboarding) before its signal comes. */
  rank: number;
  delay: number;
  /** No opening call: its goals start when the signal comes (the last call already set it up). */
  auto?: boolean;
  /** Choose the chapter's targets. False means nothing suits yet: try again in a minute. */
  pick?(w: World, tg: Targets): boolean;
  /** The goals of each step, in order. */
  steps: ((w: World, tg: Targets) => Goal[])[];
}

const plain = (s: Star) => s.type !== 'core' && s.type !== 'proto' && s.type !== 'blackhole';
/** A rocky world you could land on, that is nobody's home. */
const ground = (w: World, sid: number, pl: Planet) => pl.kind === 'rocky' && !w.peekPS(sid, pl.idx).destroyed && !pl.feature;
function best<T>(xs: T[], score: (x: T) => number): T | undefined {
  let b: T | undefined, bs = Infinity;
  for (const x of xs) { const s = score(x); if (s < bs) { bs = s; b = x; } }
  return b;
}
const hollowStars = (w: World, r0: number, r1: number) => w.gal.stars.filter((s) => s.hollow && s.r >= r0 && s.r < r1);
const nameOf = (w: World, t: number[]) => ({ star: w.star(t[0]).name, planet: t[1] !== undefined ? w.planet(t[0], t[1]).name : '' });

export const CHAPTERS: ChapterDef[] = [
  {
    id: 'voice', title: 'A Voice in the Static', rank: 1, delay: 90,
    // A struggling world a few jumps from home, ideally one with life on it.
    pick(w, tg) {
      const home = w.gal.homeStar;
      for (const reach of [340, 700, 3000]) {
        const c: [number, number, number][] = [];
        for (const s of w.gal.stars) {
          if (s.hollow || !plain(s) || s.id === home || w.ownerOf(s.id)) continue;
          const d = w.gal.dist(s.id, home);
          if (d < 40 || d > reach) continue;
          for (const pl of w.gal.planets(s.id)) {
            const t = w.tscore(s.id, pl.idx);
            if (ground(w, s.id, pl) && t >= 1 && t <= 2) c.push([s.id, pl.idx, d - (pl.life ? 200 : 0)]);
          }
        }
        const b = best(c, (x) => x[2]);
        if (b) { tg.fade = [b[0], b[1]]; return true; }
      }
      return false;
    },
    steps: [(w, tg) => {
      const n = nameOf(w, tg.fade);
      return [{ goal: { type: 'scan', ch: 0 }, title: `Listen to ${n.planet}`, desc: `Fly to ${n.star} and scan ${n.planet}. The voice in the static says it is fading.`, star: tg.fade[0], planet: tg.fade[1] }];
    }],
  },
  {
    id: 'garden', title: 'Something to Hold On To', rank: 1, delay: 60,
    steps: [(w, tg) => {
      const n = nameOf(w, tg.fade);
      const t = Math.min(3, w.tscore(tg.fade[0], tg.fade[1]) + 1);
      tg.fadeT = [t];
      return [{ goal: { type: 'terraform', ch: 1 }, title: `Bring ${n.planet} back`, desc: `Raise ${n.planet} (${n.star}) to T${t}: warm its air or wet its seas with terraform tools from your shipyard.`, star: tg.fade[0], planet: tg.fade[1], tscore: t }];
    }],
  },
  {
    id: 'siphon', title: 'The Siphon', rank: 2, delay: 120,
    // A Hollow star on the outer edge of their ring, as close to home as there is.
    pick(w, tg) {
      const s = best(hollowStars(w, 262, 9999), (x) => w.gal.dist(x.id, w.gal.homeStar));
      if (!s) return false;
      tg.siphon = [s.id];
      return true;
    },
    steps: [(w, tg) => [{ goal: { type: 'fight', ch: 2, foes: { n: 3, hp: 240, dmg: 12 } }, title: 'Break the Hollow siphon', desc: `Destroy the three Hollow ships chained together at ${w.star(tg.siphon[0]).name}, drinking light out of the galaxy.`, star: tg.siphon[0] }]],
  },
  {
    id: 'tomb', title: 'The Choir\'s Tomb', rank: 2, delay: 150,
    // A dead, unsealed world behind the Static.
    pick(w, tg) {
      const from = tg.siphon?.[0] ?? w.gal.homeStar;
      const c: [number, number][] = [];
      for (const s of hollowStars(w, 175, 262)) for (const pl of w.gal.planets(s.id)) if (ground(w, s.id, pl)) c.push([s.id, pl.idx]);
      const b = best(c, (x) => w.gal.dist(x[0], from));
      if (!b) return false;
      tg.tomb = b;
      return true;
    },
    steps: [(w, tg) => {
      const n = nameOf(w, tg.tomb);
      return [{ goal: { type: 'relic', ch: 3, label: 'Choir Bell' }, title: `Recover the bell on ${n.planet}`, desc: `Pass the Static to ${n.star}, land on ${n.planet}, sweep with 📡 life scans and beam up the bell buried there.`, star: tg.tomb[0], planet: tg.tomb[1] }];
    }],
  },
  {
    id: 'engine', title: 'The Null Engine', rank: 3, delay: 120,
    // Deep in the Static, near the tomb.
    pick(w, tg) {
      const from = tg.tomb?.[0] ?? w.gal.homeStar;
      const s = best(hollowStars(w, 175, 262).filter((x) => x.id !== from), (x) => w.gal.dist(x.id, from) + (x.r - 175) * 0.8);
      if (!s) return false;
      tg.engine = [s.id];
      return true;
    },
    steps: [(w, tg) => [{ goal: { type: 'fight', ch: 4, foes: { n: 3, hp: 380, dmg: 16, boss: { name: 'Null Engine', hp: 1400, dmg: 22 } } }, title: 'Destroy the Null Engine', desc: `The Null Engine at ${w.star(tg.engine[0]).name} feeds the wall around the core. Break it and its guards.`, star: tg.engine[0] }]],
  },
  {
    id: 'echo', title: 'An Echo', rank: 3, delay: 150,
    // A quiet star just outside the Hollow ring.
    pick(w, tg) {
      const from = tg.engine?.[0] ?? w.gal.homeStar;
      const s = best(w.gal.stars.filter((x) => !x.hollow && plain(x) && x.r > 340 && x.r < 600 && !w.ownerOf(x.id)), (x) => w.gal.dist(x.id, from));
      if (!s) return false;
      tg.meet = [s.id];
      return true;
    },
    steps: [(w, tg) => [{ goal: { type: 'fight', ch: 5, ally: true, foes: { n: 4, hp: 380, dmg: 16 } }, title: 'Save the Hollow defector', desc: `A Hollow unit that remembered itself is fleeing to ${w.star(tg.meet[0]).name}. Destroy the hunters on its trail.`, star: tg.meet[0] }]],
  },
  {
    id: 'vat', title: 'What the Hollow Took', rank: 4, delay: 150,
    // An inner bastion, inside the Shear.
    pick(w, tg) {
      const from = tg.engine?.[0] ?? w.gal.homeStar;
      const s = best(hollowStars(w, 105, 150), (x) => w.gal.dist(x.id, from));
      if (!s) return false;
      tg.vat = [s.id];
      return true;
    },
    steps: [(w, tg) => [{ goal: { type: 'fight', ch: 6, ally: true, foes: { n: 3, hp: 500, dmg: 20, boss: { name: 'Hollowing Vat', hp: 2000, dmg: 26 } } }, title: 'Break the Hollowing Vat', desc: `Inside the Shear, at ${w.star(tg.vat[0]).name}, the Hollow keep the peoples they took. Break the Vat and they wake up as themselves.`, star: tg.vat[0] }]],
  },
  {
    id: 'gate', title: 'The Silent Gate', rank: 4, delay: 150,
    // Three worlds on the far rim, spread as far apart as they will go.
    pick(w, tg) {
      const c: [number, number][] = [];
      for (const s of w.gal.stars) {
        if (s.hollow || !plain(s) || s.r < 480 || w.ownerOf(s.id)) continue;
        for (const pl of w.gal.planets(s.id)) if (ground(w, s.id, pl) && !w.peekPS(s.id, pl.idx).owner) { c.push([s.id, pl.idx]); break; }
      }
      if (c.length < 3) return false;
      const a = best(c, (x) => w.gal.dist(x[0], w.gal.homeStar))!;
      const b = best(c, (x) => -w.gal.dist(x[0], a[0]))!;
      const d = best(c.filter((x) => x !== a && x !== b), (x) => -Math.min(w.gal.dist(x[0], a[0]), w.gal.dist(x[0], b[0])))!;
      tg.frags = [...a, ...b, ...d];
      return true;
    },
    steps: [(w, tg) => [0, 1, 2].map((i) => {
      const t = [tg.frags[i * 2], tg.frags[i * 2 + 1]], n = nameOf(w, t);
      return { goal: { type: 'relic', ch: 7, label: 'Hymn fragment' }, title: `Find the hymn on ${n.planet}`, desc: `A pilgrim of the Choir hid a fragment of its hymn on ${n.planet} (${n.star}). Land, sweep with 📡 life scans and beam it up.`, star: t[0], planet: t[1] } as Goal;
    })],
  },
  {
    id: 'spire', title: 'The Conductor', rank: 5, delay: 120,
    // The last bastion, at the Silent Gate.
    pick(w, tg) {
      const from = tg.vat?.[0] ?? w.gal.homeStar;
      const s = best(hollowStars(w, 0, 105), (x) => w.gal.dist(x.id, from));
      if (!s) return false;
      tg.spire = [s.id];
      return true;
    },
    steps: [(w, tg) => [{ goal: { type: 'fight', ch: 8, ally: true, foes: { n: 4, hp: 600, dmg: 24, boss: { name: 'Null Spire', hp: 2800, dmg: 30 } } }, title: 'Break the Null Spire', desc: `The Null Spire at ${w.star(tg.spire[0]).name} jams the voice and holds the Silent Gate shut. Break it.`, star: tg.spire[0] }]],
  },
  {
    id: 'lamp', title: 'The Middle of Everything', rank: 0, delay: 4, auto: true,
    steps: [(w) => [{ goal: { type: 'core', ch: 9 }, title: 'The middle of everything', desc: 'Fly to the core. The voice says it will tell you who it is, in person.', star: w.gal.coreId }]],
  },
];

// ------------------------------------------------------------------ progress
const storyMissions = (w: World) => w.s.missions.filter((m) => m.kind === 'story' && m.story);

function init(w: World): StoryState {
  // The story replaces the old "Reach the Core" mission.
  w.s.missions = w.s.missions.filter((m) => m.kind !== 'core');
  return (w.s.story = { ch: 0, phase: 'wait', at: w.s.t + CHAPTERS[0].delay, step: 0, goals: [], tg: {} });
}

export function chapterOf(w: World): ChapterDef | undefined {
  const s = w.s.story;
  return s ? CHAPTERS[s.ch] : undefined;
}

/** A call is waiting: the chapter's opening one, or its closing one. */
export function storyPending(w: World): 'signal' | 'debrief' | null {
  const p = w.s.story?.phase;
  return p === 'signal' || p === 'debrief' ? p : null;
}

export function storyTick(w: World) {
  if (!w.s.flags.tutDone) return;
  const st = w.s.story ?? init(w);
  if (st.phase === 'done' || st.phase === 'signal' || st.phase === 'debrief') return;
  const ch = CHAPTERS[st.ch];
  if (!ch) { st.phase = 'done'; return; }
  if (st.phase === 'wait') {
    if (w.s.t < st.at || w.rank() < ch.rank || w.inCombat || w.inWarp) return;
    if (ch.pick && !ch.pick(w, st.tg)) { st.at = w.s.t + 60; return; }
    if (ch.auto) { begin(w, st); return; }
    st.phase = 'signal';
    audio.sfx('bell', { pitch: 0.6 });
    w.hooks?.storyCall?.();
    return;
  }
  // Goals already met finish on their own: a world terraformed beforehand, a system you are sitting in.
  for (const m of storyMissions(w)) if (met(w, m)) complete(w, m);
  if (st.goals.some((id) => w.s.missions.some((m) => m.id === id))) return;
  st.step++;
  if (st.step < ch.steps.length) { makeGoals(w, st); return; }
  st.phase = 'debrief';
  audio.sfx('bell', { pitch: 0.6 });
  w.hooks?.storyCall?.();
}

function met(w: World, m: Mission): boolean {
  const g = m.story!;
  if (g.type === 'terraform') return m.star !== undefined && m.planet !== undefined && w.tscore(m.star, m.planet) >= (m.tscore ?? 3);
  if (g.type === 'visit') return w.s.loc === m.star && !w.inWarp;
  return false;
}

/** The opening call was answered with yes. */
export function acceptChapter(w: World) {
  const st = w.s.story;
  if (st?.phase === 'signal') begin(w, st);
}

function begin(w: World, st: StoryState) {
  st.step = 0;
  st.phase = 'active';
  makeGoals(w, st);
}

function makeGoals(w: World, st: StoryState) {
  const ch = CHAPTERS[st.ch];
  st.goals = [];
  for (const g of ch.steps[st.step](w, st.tg)) {
    const m: Mission = { id: w.nid(), kind: 'story', giver: 'story', title: g.title, desc: g.desc, star: g.star, planet: g.planet, tscore: g.tscore, reward: 0, deadline: 0, main: true, progress: 0, story: g.goal };
    w.s.missions.unshift(m);
    st.goals.push(m.id);
    if (g.goal.type === 'relic' && g.planet !== undefined) startEvent(w, { id: w.nid(), kind: 'relic', star: g.star, planet: g.planet, until: w.s.t + 1e7, storyGoal: m.id, label: g.goal.label });
  }
  w.s.tracked = st.goals[0];
  w.hooks?.toast(`Story · ${ch.title}: ${w.s.missions.find((m) => m.id === st.goals[0])?.title ?? ''}`, '⭐', 'gold');
  w.hooks?.changed();
}

// Mission hooks (missions.ts calls these).
export function storyArrive(w: World, star: number) {
  for (const m of storyMissions(w)) if (m.story!.type === 'visit' && m.star === star) complete(w, m);
}
export function storyScan(w: World, star: number, idx: number) {
  for (const m of storyMissions(w)) if (m.story!.type === 'scan' && m.star === star && m.planet === idx) complete(w, m);
}
export function storyTerraformed(w: World, star: number, idx: number, t: number) {
  for (const m of storyMissions(w)) if (m.story!.type === 'terraform' && m.star === star && m.planet === idx && t >= (m.tscore ?? 3)) complete(w, m);
}
export function storyCleared(w: World, star: number, id?: number) {
  for (const m of storyMissions(w)) if (m.story!.type === 'fight' && m.star === star && (id === undefined || m.id === id)) complete(w, m);
}
/** Story fights waiting in this system. */
export function storyFightsAt(w: World, star: number): Mission[] {
  return storyMissions(w).filter((m) => m.story!.type === 'fight' && m.star === star);
}

/** You reached the core with the last chapter running: its goal is done, and the reveal plays. */
export function storyAtCore(w: World): boolean {
  const ms = storyMissions(w).filter((m) => m.story!.type === 'core');
  if (!ms.length) return false;
  for (const m of ms) complete(w, m);
  const st = w.s.story!;
  st.goals = [];
  st.phase = 'debrief';
  return true;
}

// ------------------------------------------------------------------ outcomes
type Items = { icon: string; text: string }[];

const pay = (w: World, n: number, from = '') => { w.addMoney(n); return { icon: '💰', text: `+§${fmt(n)}${from}` }; };
const gear = (w: World, id: string) => { grantTool(w, TOOL_MAP[id]); w.hooks?.changed(); return { icon: TOOL_MAP[id].icon, text: `${TOOL_MAP[id].name} fitted` }; };
const others = (w: World) => w.empires.filter((e) => e.met && !e.dead && e.arch !== 'hollow');
const hollow = (w: World) => w.emap.get('hollow');

/** What each chapter's closing call gives and changes. */
const OUTCOME: Record<string, (w: World, tg: Targets) => Items> = {
  voice: (w) => [pay(w, 15000)],
  garden: (w, tg) => {
    // Life floods back onto the world you saved.
    const [s, i] = tg.fade;
    const ps = w.ps(s, i);
    const natives = w.natives(w.planet(s, i));
    let n = 0;
    for (let k = 0; k < 12; k++) if (!ps.eco[k] && natives[k]) { ps.eco[k] = natives[k]; n++; }
    w.give('seeds', 6);
    return [pay(w, 30000), { icon: '🌱', text: '6 × Seed Pods' }, ...(n ? [{ icon: '🌿', text: `${n} species return to ${w.planet(s, i).name}` }] : [])];
  },
  siphon: (w, tg) => {
    const at = tg.siphon[0];
    let k = 0;
    for (const e of others(w).concat(w.empires.filter((e) => !e.met && !e.dead && e.arch !== 'hollow'))) {
      if (w.gal.dist(e.home, at) > 360) continue;
      addMod(e, 'lamplight', 'The light returned to our skies', 10, { max: 10, decay: 0.15 });
      k++;
    }
    const h = hollow(w);
    if (h) addMod(h, 'wounds', 'You broke what we kept', -10, { min: -60 });
    return [gear(w, 'lens'), pay(w, 40000), ...(k ? [{ icon: '✨', text: `${k} empire${k > 1 ? 's' : ''} near ${w.star(at).name} see brighter skies` }] : [])];
  },
  tomb: (w) => {
    (w.s.comps ??= {}).crystal = (w.s.comps.crystal ?? 0) + 1;
    w.s.comps.core = (w.s.comps.core ?? 0) + 1;
    return [pay(w, 60000, ' from collectors of Choir relics'), { icon: '🔮', text: '1 × Warp Crystal' }, { icon: '💠', text: '1 × Quantum Core' }];
  },
  engine: (w) => {
    for (const e of others(w)) addMod(e, 'lamplight', 'The light reached our worlds', 8, { max: 18, decay: 0.15 });
    w.s.story!.oriLost = true;
    const h = hollow(w);
    if (h) addMod(h, 'wounds', 'You broke what we kept', -20, { min: -60 });
    const lost = severance(w);
    return [pay(w, 80000, ' from grateful empires'), { icon: '✨', text: 'Light reaches every empire you know' }, ...(lost ? [{ icon: '🔥', text: `${lost} cities on ${w.planet(w.gal.homeStar, 1).name} destroyed` }] : [])];
  },
  echo: (w) => [gear(w, 'anchor')],
  vat: (w, tg) => {
    for (const e of others(w)) addMod(e, 'freed', 'You freed our lost', 15, { max: 15, decay: 0.1 });
    const at = unmaking(w, tg);
    return [pay(w, 120000, ' from families of the freed'), { icon: '🕊️', text: 'The taken return to every empire' }, { icon: '🤖', text: `The Hollow strike ${w.planet(at[0], at[1]).name}` }];
  },
  gate: (w) => [gear(w, 'choirkey')],
  spire: (w) => {
    const st = w.s.story!;
    st.echoLost = true;
    st.oriLost = false;
    return [gear(w, 'lampwick')];
  },
  lamp: (w) => {
    // The Lamp sings again: the Hollow stop fighting, and their strikes end.
    const h = hollow(w);
    if (h) { h.war = false; addMod(h, 'lamp', 'The Lamp sings again', 90, { max: 90 }); }
    w.s.flags.lampLit = true;
    return [{ icon: '🕯️', text: 'The Hollow lay down their arms' }];
  },
};

/** The closing call is over: pay out, change the galaxy, and start waiting for the next chapter. */
export function finishChapter(w: World): Items {
  const st = w.s.story;
  if (!st || st.phase !== 'debrief') return [];
  const ch = CHAPTERS[st.ch];
  const items = OUTCOME[ch.id]?.(w, st.tg) ?? [];
  w.game.history(`Story: ${ch.title}`, '⭐');
  st.ch++;
  st.step = 0;
  st.goals = [];
  const next = CHAPTERS[st.ch];
  if (!next) st.phase = 'done';
  else { st.phase = 'wait'; st.at = w.s.t + next.delay; }
  w.hooks?.changed();
  return items;
}

/** A lance of nothing from the core takes two cities off your homeworld (never the last one). */
function severance(w: World): number {
  const home = w.gal.homeStar;
  const ps = w.ps(home, 1);
  const lost = Math.max(0, Math.min(2, ps.cities - 1));
  ps.cities -= lost;
  while (used(ps) > slots(ps)) knockBuilding(ps);
  w.hooks?.storyStrike?.(home, 1);
  return lost;
}

/** The Hollow go after the colony nearest the core (or the homeworld, if it is all you have). Unless you beat
 *  them off in time, the whole colony is unmade. */
function unmaking(w: World, tg: Targets): [number, number] {
  const at = strikeTarget(w);
  const c = !isHomeworld(w, at[0], at[1]);
  tg.strike = at;
  w.s.events = w.s.events.filter((e) => e.star !== at[0] || e.storyGoal !== undefined);
  startEvent(w, { id: w.nid(), kind: 'hollow', star: at[0], planet: at[1], until: w.s.t + 240, empire: 'hollow', unmaking: c });
  return at;
}

/** Where the Conductor aims: your colony nearest the core, or your homeworld if it is all you have. */
export function strikeTarget(w: World): [number, number] {
  const cols = w.colonies().filter(([s, i]) => !isHomeworld(w, s, i));
  return best(cols, ([s]) => w.star(s).r) ?? [w.gal.homeStar, 1];
}

/** Who the story's missions come from, as far as you know. */
export function storyGiver(w: World): string {
  const id = chapterOf(w)?.id;
  return id === 'echo' ? 'Hollow Unit 0-7' : id === 'vat' || id === 'gate' || id === 'spire' ? 'Echo' : '??????';
}

/** Index of a chapter by id. */
export const chapterIndex = (id: string) => CHAPTERS.findIndex((c) => c.id === id);

// ------------------------------------------------------------------ looks
let echoDesign: Design | null = null;
/** Echo's ship: a Hollow drone whose red lights have turned teal. */
export function echoShip(w: World): Design | null {
  const h = hollow(w);
  if (!h) return null;
  if (!echoDesign) echoDesign = { ...h.ship, colors: { ...h.ship.colors, base: '#7d93a0', coat: '#24323a', detail: '#5af0c8' } };
  return echoDesign;
}

// ------------------------------------------------------------------ debug
/** Bring the next signal now, or finish whatever the current chapter is waiting on. */
export function storyDebug(w: World, what: 'signal' | 'skip') {
  w.s.flags.tutDone = true;
  const st = w.s.story ?? init(w);
  if (st.phase === 'done') return;
  const ch = CHAPTERS[st.ch];
  if (what === 'signal') { if (st.phase === 'wait') st.at = 0; return; }
  if (st.phase === 'wait') {
    if (ch.pick && !ch.pick(w, st.tg)) return;
    st.phase = 'signal';
  }
  if (st.phase === 'signal') begin(w, st);
  if (st.phase === 'active') {
    for (let guard = 0; guard < 6 && st.phase === 'active'; guard++) {
      for (const m of storyMissions(w)) {
        w.s.events = w.s.events.filter((e) => e.storyGoal !== m.id);
        complete(w, m);
      }
      st.goals = [];
      st.step++;
      if (st.step < ch.steps.length) makeGoals(w, st);
      else st.phase = 'debrief';
    }
    w.hooks?.storyCall?.();
  }
}
