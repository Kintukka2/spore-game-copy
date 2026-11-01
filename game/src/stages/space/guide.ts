// Mission guidance: which family a mission belongs to, what it wants done next, and where in the menus to do
// it. The HUD tracker shows the next step, the planet panel marks the tab and the button a mission needs, the
// terraforming view rings the goal, and the Life tab marks the slots that would steady an unstable world.
import { SPICE, TOOL_MAP, tScoreOf } from './data';
import { veilBlock } from './story';
import type { Mission } from './types';
import type { World } from './world';

// ------------------------------------------------------------------ families
export type Family = 'lamp' | 'charter' | 'home' | 'empire' | 'market';

/** The quest lines and kinds of work, in the order the Nav-Boy lists them. */
export const FAMILIES: Record<Family, { icon: string; name: string }> = {
  lamp: { icon: '⭐', name: 'The Lamplight' },
  charter: { icon: '📈', name: 'A Seat on the Floor' },
  home: { icon: '🏠', name: 'Homeworld orders' },
  empire: { icon: '🤝', name: 'Empire contracts' },
  market: { icon: '💹', name: 'Exchange jobs' },
};

export function missionFamily(m: Mission): Family {
  if (m.kind === 'story') return m.story?.line === 'charter' ? 'charter' : 'lamp';
  if (m.market || m.giver === 'exchange') return 'market';
  if (m.giver === 'home' || m.main) return 'home';
  return 'empire';
}
export const missionIcon = (m: Mission) => FAMILIES[missionFamily(m)].icon;

// ------------------------------------------------------------------ at a world
export type GuideTab = 'overview' | 'terra' | 'life' | 'colony' | 'trade';
export type GuideAct = 'scan' | 'terraform' | 'land' | 'colonise' | 'deliver' | 'stabilise';
export const TAB_LABEL: Record<GuideTab, string> = { overview: '🔭 Overview', terra: '🌍 Terraform', life: '🌿 Life', colony: '🏠 Colony', trade: '💱 Trade' };

export interface Guide {
  /** The mission asking (none for steadying an unstable world). */
  m?: Mission;
  tab: GuideTab;
  act: GuideAct;
  /** What to do, e.g. "Raise it to T2". */
  text: string;
  /** Terraforming: the T-score wanted. */
  goal?: number;
}

const terraTools = (w: World) => ['stormpod', 'droughtpod', 'meteor', 'icecomet'].some((id) => w.count(id) > 0) || w.has('cloudengine') || w.has('thermlance');

/** What a mission wants done at this very world, if anything. */
function guideFor(w: World, m: Mission, star: number, idx: number): Guide | null {
  // Deliveries go to any world of the empire that asked.
  if (m.kind === 'deliver' && m.color && w.peekPS(star, idx).owner === m.giver) {
    const have = w.s.spice[m.color], need = m.amount ?? 1;
    return { m, tab: 'trade', act: 'deliver', text: have >= need ? `Hand over ${need} ${SPICE[m.color].name} here` : `Bring ${need - have} more ${SPICE[m.color].name}` };
  }
  if (m.star !== star || m.planet !== idx) return null;
  const pl = w.planet(star, idx), g = m.story?.type;
  if (g === 'relic') return { m, tab: 'overview', act: 'land', text: `Land and dig up the ${w.s.events.find((e) => e.storyGoal === m.id)?.label ?? 'relic'}` };
  if (m.kind === 'scan' || g === 'scan' || (m.kind === 'tutorial' && m.step === 'scan')) return { m, tab: 'overview', act: 'scan', text: `Scan ${pl.name}` };
  if (m.kind === 'terraform' || g === 'terraform') {
    const want = m.tscore ?? 3;
    return { m, tab: 'terra', act: 'terraform', goal: want, text: terraTools(w) ? `Raise it to T${want}` : `Buy terraform pods at a 🧰 shipyard, then raise it to T${want}` };
  }
  if (m.kind === 'tutorial' && m.step === 'abduct') return { m, tab: 'life', act: 'land', text: 'Land and beam up a creature' };
  if (m.kind === 'tutorial' && m.step === 'colony') return { m, tab: 'colony', act: 'colonise', text: 'Found a colony here with your Colony Pack' };
  return null;
}

/** Everything wanted at this world: missions (the tracked one first), then steadying it if it is unstable. */
export function planetGuides(w: World, star: number, idx: number): Guide[] {
  const out: Guide[] = [];
  const ms = [...w.s.missions].sort((a, b) => Number(b.id === w.s.tracked) - Number(a.id === w.s.tracked));
  for (const m of ms) { const g = guideFor(w, m, star, idx); if (g) out.push(g); }
  const u = unstable(w, star, idx);
  if (u) out.push({ tab: 'life', act: 'stabilise', text: u.row === u.t ? `Fill the T${u.t} ecosystem row to keep it at T${u.t}` : `Fill ecosystem rows T${u.row} to T${u.t} to keep it at T${u.t}` });
  return out;
}

/** A world of yours (or nobody's) climbed past the life it holds: the row it needs filled, and its T-score. */
export function unstable(w: World, star: number, idx: number): { row: number; t: number } | null {
  const pl = w.planet(star, idx), ps = w.peekPS(star, idx);
  if (pl.kind === 'gas' || ps.destroyed || (ps.owner && ps.owner !== 'player')) return null;
  const t = tScoreOf(ps.atm, ps.temp), rows = w.ecoRows(ps);
  return t > rows ? { row: rows + 1, t } : null;
}

// ------------------------------------------------------------------ the next step
/** One short line: the next thing to do for a mission, from where you are (`here` is -1 mid-warp). */
export function nextStep(w: World, m: Mission, here: number): string | null {
  if (m.star === undefined) {
    if (m.kind === 'deliver' && m.color) {
      const e = w.emap.get(m.giver), need = m.amount ?? 1, have = w.s.spice[m.color];
      return have >= need ? `Open any ${e?.species ?? 'of their'} world › 💱 Trade` : `Get ${need - have} more ${SPICE[m.color].name}`;
    }
    return null;
  }
  const star = w.star(m.star), g = m.story?.type;
  if (here !== m.star) {
    const v = veilBlock(w, m.star);
    if (v) return `Fit the ${TOOL_MAP[v.gear].name} to pass ${v.name}`;
    return here < 0 ? `Warping to ${star.name}` : `Travel to ${star.name}`;
  }
  if (m.kind === 'pirates' || g === 'fight') return 'Destroy the ships here';
  if (g === 'cargo' && m.color) {
    const need = m.amount ?? 1, have = w.s.spice[m.color];
    return have >= need ? null : `Get ${need - have} more ${SPICE[m.color].name}`;
  }
  if (m.planet !== undefined) {
    const gd = guideFor(w, m, m.star, m.planet);
    if (gd) return `Open ${w.planet(m.star, m.planet).name} › ${TAB_LABEL[gd.tab]}: ${gd.text.charAt(0).toLowerCase()}${gd.text.slice(1)}`;
  }
  if (m.kind === 'deliver' && m.color) return `Open a ${w.emap.get(m.giver)?.species ?? ''} world › 💱 Trade`;
  return null;
}
