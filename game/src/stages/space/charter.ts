// The Charter, "A Seat on the Floor": a short quest line that opens the Galactic Spice Exchange. The floor has
// been closed to independent captains since the Crash, when a flood of fake headlines sent every price mad.
// Zix the Whisper, a broker in the back room, offers to get you a seat: pass the Guild's assay, break the
// Cinder Syndicate's spice hoard, dig up the ledger of its Rumour Mill, and hand it to the Guild. Then the
// exchange is yours. The calls themselves are in ui/charterTalk.ts.
//
// Its missions are story missions (kind 'story', giver 'charter'), so the story's hooks finish them: arrivals,
// fights and relics. Only the spice delivery is checked here.
import { fmt } from '../../engine/math';
import { audio } from '../../engine/audio';
import { SPICE, SPICE_COLORS, type SpiceColor } from './data';
import { start as startEvent } from './events';
import { complete } from './missions';
import { contractPrice, marketStory } from './market';
import { veilBlock } from './story';
import type { Mission, StoryGoal } from './types';
import type { World } from './world';

export interface CharterState {
  /** The mission being offered or run (STEPS index); STEPS.length once the last one is done. */
  step: number;
  /** wait: for Zix's first call. signal: a call is waiting. active: its mission runs. debrief: the Guild's
   *  closing call waits. done: the floor is open to you. */
  phase: 'wait' | 'signal' | 'active' | 'debrief' | 'done';
  at: number;
  goal: number;
  /** The Guild Hall, the hoard, the Rumour Mill: [star, planet?]. */
  tg: Record<string, number[]>;
  /** The spice the assayers want, and the one the Syndicate hoards. */
  cA?: SpiceColor;
  cB?: SpiceColor;
}

/** The line's name, as the Nav-Boy lists it. */
export const CHARTER_TITLE = 'A Seat on the Floor';
const SAMPLE = 4;

interface Goal { goal: StoryGoal; title: string; desc: string; star: number; planet?: number; amount?: number; color?: SpiceColor; reward: number }
interface Step { id: string; pick?(w: World, s: CharterState): boolean; goal(w: World, s: CharterState): Goal }

const plain = (w: World, sid: number) => { const s = w.star(sid); return !s.hollow && s.type !== 'core' && s.type !== 'proto' && s.type !== 'blackhole' && !veilBlock(w, sid); };
function best<T>(xs: T[], score: (x: T) => number): T | undefined {
  let b: T | undefined, bs = Infinity;
  for (const x of xs) { const v = score(x); if (v < bs) { bs = v; b = x; } }
  return b;
}
const S = (c?: SpiceColor) => SPICE[c ?? 'red'].name;

/** The spice you can most easily lay hands on: what your colonies grow, else what a nearby empire sells. */
function handySpice(w: World): SpiceColor {
  const n: Partial<Record<SpiceColor, number>> = {};
  for (const [s, i] of w.colonies()) { const c = w.planet(s, i).spice; if (c) n[c] = (n[c] ?? 0) + 1; }
  const grown = SPICE_COLORS.filter((c) => n[c]).sort((a, b) => (n[b] ?? 0) - (n[a] ?? 0) || SPICE[a].base - SPICE[b].base);
  if (grown.length) return grown[0];
  const sold = w.empires.filter((e) => e.met && !e.dead && e.arch !== 'hollow').flatMap((e) => e.produces);
  return sold.length ? [...sold].sort((a, b) => SPICE[a].base - SPICE[b].base)[0] : 'red';
}

export const STEPS: Step[] = [
  {
    id: 'assay',
    // The Guild Hall orbits a quiet, unclaimed star a few jumps from home.
    pick(w, s) {
      const home = w.gal.homeStar;
      for (const reach of [320, 600, 3000]) {
        const hall = best(w.gal.stars.filter((x) => x.id !== home && plain(w, x.id) && !w.ownerOf(x.id) && w.gal.dist(x.id, home) > 70 && w.gal.dist(x.id, home) < reach), (x) => Math.abs(w.gal.dist(x.id, home) - 180));
        if (hall) { s.tg.hall = [hall.id]; s.cA = handySpice(w); return true; }
      }
      return false;
    },
    goal: (w, s) => ({
      goal: { type: 'cargo', ch: 0, line: 'charter' }, star: s.tg.hall[0], amount: SAMPLE, color: s.cA, reward: 15000,
      title: `The assay: ${SAMPLE} ${S(s.cA)}`,
      desc: `Bring ${SAMPLE} ${S(s.cA)} to the Guild's Assay House at ${w.star(s.tg.hall[0]).name}. Collect it from your colonies or buy it in any empire's 💱 Trade tab.`,
    }),
  },
  {
    id: 'hoard',
    // The Syndicate sits on its hoard in an empty system not far from the Hall.
    pick(w, s) {
      const hall = s.tg.hall[0];
      const c = w.gal.stars.filter((x) => x.id !== hall && x.id !== w.gal.homeStar && plain(w, x.id) && !w.ownerOf(x.id));
      const hoard = best(c, (x) => Math.abs(w.gal.dist(x.id, hall) - 150));
      if (!hoard) return false;
      s.tg.hoard = [hoard.id];
      const rare = SPICE_COLORS.filter((x) => x !== s.cA && SPICE[x].base >= 350 && SPICE[x].base <= 750);
      s.cB = rare[Math.floor(Math.random() * rare.length)] ?? 'blue';
      return true;
    },
    goal: (w, s) => ({
      goal: { type: 'fight', ch: 1, line: 'charter', foes: { n: 4, hp: 210, dmg: 13, pirates: true, boss: { name: 'Hoard Barge', hp: 1500, dmg: 19 } } },
      star: s.tg.hoard[0], reward: 40000,
      title: `Break the ${S(s.cB)} hoard`,
      desc: `The Cinder Syndicate is sitting on stolen ${S(s.cB)} at ${w.star(s.tg.hoard[0]).name}, waiting for the price to climb. Destroy the Hoard Barge and its escorts.`,
    }),
  },
  {
    id: 'ledger',
    // The Rumour Mill: a world you can land on, near the hoard.
    pick(w, s) {
      const from = s.tg.hoard[0];
      const c: [number, number][] = [];
      for (const st of w.gal.stars) {
        if (!plain(w, st.id) || w.ownerOf(st.id) || st.id === w.gal.homeStar) continue;
        for (const pl of w.gal.planets(st.id)) if (pl.kind === 'rocky' && !pl.feature && !w.peekPS(st.id, pl.idx).destroyed && !w.peekPS(st.id, pl.idx).owner) c.push([st.id, pl.idx]);
      }
      const b = best(c, (x) => Math.abs(w.gal.dist(x[0], from) - 90) + (x[0] === from ? 40 : 0));
      if (!b) return false;
      s.tg.mill = b;
      return true;
    },
    goal: (w, s) => {
      const [sid, idx] = s.tg.mill;
      return {
        goal: { type: 'relic', ch: 2, line: 'charter', label: 'Syndicate Ledger' }, star: sid, planet: idx, reward: 25000,
        title: `Recover the ledger on ${w.planet(sid, idx).name}`,
        desc: `The Syndicate ran its Rumour Mill from ${w.planet(sid, idx).name} (${w.star(sid).name}). Land, sweep with 📡 life scans and beam up the ledger buried there.`,
      };
    },
  },
  {
    id: 'bell',
    goal: (w, s) => ({
      goal: { type: 'visit', ch: 3, line: 'charter' }, star: s.tg.hall[0], reward: 0,
      title: 'Ring the opening bell',
      desc: `Take the Syndicate's ledger to the Guild Hall at ${w.star(s.tg.hall[0]).name}. The Chair is waiting.`,
    }),
  },
];

// ------------------------------------------------------------------ progress
/** The Galactic Spice Exchange lets you trade. */
export const exchangeOpen = (w: World) => !!w.s.flags.exchangeOpen;

const charterMissions = (w: World) => w.s.missions.filter((m) => m.kind === 'story' && m.story?.line === 'charter');

function init(w: World): CharterState {
  return (w.s.charter = { step: 0, phase: 'wait', at: w.s.t + 100, goal: 0, tg: {} });
}

/** Zix's call is waiting: an offer, or the Guild's closing call. */
export function charterPending(w: World): 'signal' | 'debrief' | null {
  const p = w.s.charter?.phase;
  return p === 'signal' || p === 'debrief' ? p : null;
}

/** Ready the next step's call, if its targets can be found (else try again in a minute). */
function ring(w: World, s: CharterState) {
  const step = STEPS[s.step];
  if (step.pick && !step.pick(w, s)) { s.phase = 'wait'; s.at = w.s.t + 60; return; }
  s.phase = 'signal';
  audio.sfx('coin', { pitch: 0.8 });
  w.hooks?.storyCall?.('charter');
}

/** Where the last delivery reminder was given, so it is said once per visit. */
let warnedAt = -1;

export function charterTick(w: World) {
  if (!w.s.flags.tutDone) return;
  if (exchangeOpen(w) && !w.s.charter) return;
  const s = w.s.charter ?? init(w);
  if (s.phase === 'done' || s.phase === 'signal' || s.phase === 'debrief') return;
  if (s.phase === 'wait') {
    if (w.s.t < s.at || w.inCombat || w.inWarp) return;
    ring(w, s);
    return;
  }
  for (const m of charterMissions(w)) {
    const g = m.story!;
    if (m.star !== w.s.loc || w.inWarp) { if (m.star !== w.s.loc) warnedAt = -1; continue; }
    if (g.type === 'visit') complete(w, m);
    else if (g.type === 'cargo' && m.color) {
      const need = m.amount ?? SAMPLE, have = w.s.spice[m.color];
      if (have >= need) {
        w.s.spice[m.color] -= need;
        w.hooks?.toast(`The assayers take your ${need} ${S(m.color)}. They look impressed. Or hungry.`, '⚖️', 'gold');
        complete(w, m);
      } else if (warnedAt !== w.s.loc) {
        warnedAt = w.s.loc;
        w.hooks?.toast(`The Assay House wants ${need} ${S(m.color)}. You have ${have}.`, '⚖️');
      }
    }
  }
  if (w.s.missions.some((m) => m.id === s.goal)) return;
  // Its mission is done: the hoard makes the news, and the next call comes.
  if (STEPS[s.step].id === 'hoard' && s.cB) marketStory(w, '💥', `Cinder hoard broken: ${S(s.cB)} floods back onto the market`, 'A lone captain scattered the Syndicate\'s barge. Brokers who bet on the shortage are having a very bad day.', [{ c: s.cB, shock: -0.2 }]);
  s.step++;
  if (s.step < STEPS.length) ring(w, s);
  else { s.phase = 'debrief'; audio.sfx('bell', { pitch: 1.2 }); w.hooks?.storyCall?.('charter'); }
}

/** You knocked on the exchange's door (the 📈 button) before Zix called: the call comes now. */
export function charterKnock(w: World): boolean {
  if (!w.s.flags.tutDone || exchangeOpen(w)) return false;
  const s = w.s.charter ?? init(w);
  if (s.phase === 'wait') ring(w, s);
  return s.phase === 'signal' || s.phase === 'debrief';
}

/** The offer was answered with yes: its mission starts. */
export function acceptCharter(w: World) {
  const s = w.s.charter;
  if (s?.phase !== 'signal') return;
  const g = STEPS[s.step].goal(w, s);
  const m: Mission = { id: w.nid(), kind: 'story', giver: 'charter', title: g.title, desc: g.desc, star: g.star, planet: g.planet, amount: g.amount, color: g.color, reward: g.reward, deadline: 0, main: true, progress: 0, story: g.goal };
  w.s.missions.unshift(m);
  s.goal = m.id;
  s.phase = 'active';
  if (g.goal.type === 'relic' && g.planet !== undefined) startEvent(w, { id: w.nid(), kind: 'relic', star: g.star, planet: g.planet, until: w.s.t + 1e7, storyGoal: m.id, label: g.goal.label });
  w.s.tracked = m.id;
  w.hooks?.toast(`${CHARTER_TITLE}: ${m.title}`, '📈', 'gold');
  w.hooks?.changed();
}

/** The Guild's closing call is over: the floor opens to you. */
export function finishCharter(w: World): { icon: string; text: string }[] {
  const s = w.s.charter;
  if (!s || s.phase !== 'debrief') return [];
  s.phase = 'done';
  w.s.flags.exchangeOpen = true;
  const items = [{ icon: '📈', text: 'A seat on the Galactic Spice Exchange' }];
  w.addMoney(50000);
  items.push({ icon: '💰', text: `+§${fmt(50000)} from the Guild of Weights` });
  const c = s.cB ?? 'blue', m = w.s.market;
  if (m) {
    m.hold[c].n += 5;
    m.hold[c].cost += contractPrice(w, c) * 5;
    m.seen = m.clock;
    items.push({ icon: '📜', text: `5 × ${S(c)} contracts` });
  }
  marketStory(w, '🔔', 'The Exchange reopens its floor to independent captains', 'The Guild of Weights has published the Cinder Syndicate\'s ledger: eleven fake blights, four invented wars and one very busy parrot. Traders are pouring back in.',
    SPICE_COLORS.map((x) => ({ c: x, shock: 0.05 })));
  w.game.history(`Won a seat on the Galactic Spice Exchange`, '🔔');
  w.hooks?.changed();
  return items;
}

/** How far along the line is, for the Nav-Boy: "2/4". */
export function charterProgress(w: World): string {
  const s = w.s.charter;
  if (!s) return `0/${STEPS.length}`;
  return `${Math.min(STEPS.length, s.step + (s.phase === 'done' ? 0 : s.phase === 'active' ? 1 : 0))}/${STEPS.length}`;
}

// ------------------------------------------------------------------ debug
/** Bring Zix's next call now, finish the running mission, or open the floor outright. */
export function charterDebug(w: World, what: 'signal' | 'skip' | 'open') {
  w.s.flags.tutDone = true;
  const s = w.s.charter ?? init(w);
  if (what === 'open') { s.phase = 'done'; w.s.flags.exchangeOpen = true; return; }
  if (what === 'signal') { if (s.phase === 'wait') ring(w, s); return; }
  if (s.phase === 'wait') ring(w, s);
  if (s.phase === 'signal') acceptCharter(w);
  if (s.phase === 'active') {
    for (const m of charterMissions(w)) { w.s.events = w.s.events.filter((e) => e.storyGoal !== m.id); complete(w, m); }
    charterTick(w);
  }
}
