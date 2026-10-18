// The Tribal Outfitter: clothing worn over the (now permanent) creature body.
// The body's parts are locked; only outfit-category parts can be added. Works with an empty catalog.
import type { Game } from '../../game/game';
import { defaultTabs, openEditor } from '../../editor/editor';
import { OUTFIT_STATS } from '../../editor/abilityInfo';
import { computeStats, getPart, partsFor } from '../../design/registry';
import { cloneDesign, generateCreature } from '../../design/generate';
import { RNG } from '../../engine/rng';
import type { Design, PartCategory } from '../../design/types';

export const OUTFIT_CATS: PartCategory[] = ['hat', 'mask', 'chest', 'shoulder', 'trinket'];

export interface OutfitBonus {
  gather: number;
  combat: number;
  social: number;
  health: number;
}

/** The species body (falls back to a generated creature if a save has none). */
export function speciesDesign(game: Game): Design {
  const s = game.state!;
  if (!s.creature) s.creature = generateCreature(new RNG(s.seed), { level: 2, name: s.speciesName });
  return s.creature;
}

const isOutfitPart = (partId: string) => {
  const p = getPart(partId);
  return !!p && OUTFIT_CATS.includes(p.category);
};

/**
 * The design tribe members wear: the creature body plus clothing. If the saved outfit was made
 * over an older body, the clothing is carried over onto the current body.
 */
export function wornDesign(game: Game): Design {
  const s = game.state!;
  const body = speciesDesign(game);
  const o = s.outfit;
  if (!o) return body;
  const bodyUids = new Set(body.parts.map((p) => p.uid));
  const hasBody = body.parts.every((p) => o.parts.some((q) => q.uid === p.uid));
  if (hasBody && o.spine.length === body.spine.length) return o;
  const merged = cloneDesign(body);
  merged.colors = { ...o.colors };
  const head = merged.spine.length - 1;
  for (const pi of o.parts) {
    if (bodyUids.has(pi.uid) || !isOutfitPart(pi.partId)) continue;
    merged.parts.push({ ...pi, node: Math.min(pi.node, head) });
  }
  return merged;
}

export function outfitBonus(game: Game): OutfitBonus {
  const worn = wornDesign(game);
  const body = new Set(speciesDesign(game).parts.map((p) => p.uid));
  const clothes = worn.parts.filter((pi) => !body.has(pi.uid) && isOutfitPart(pi.partId));
  const st = computeStats({ ...worn, parts: clothes });
  return { gather: st.gather ?? 0, combat: st.combat ?? 0, social: st.social ?? 0, health: st.health ?? 0 };
}

export function outfitPartCount(): number {
  return OUTFIT_CATS.reduce((n, c) => n + partsFor('creature', c).length, 0);
}

/**
 * Open the outfitter. `budget` is the food available; returns the food spent (negative when
 * clothing was removed) or null if cancelled.
 */
export async function openOutfitter(game: Game, budget: number, resolved: number, firstTime: boolean): Promise<number | null> {
  const body = speciesDesign(game);
  const worn = wornDesign(game);
  const unlocked = OUTFIT_CATS.flatMap((c) => partsFor('creature', c)).filter((p) => p.tier <= 1 + resolved).map((p) => p.id);
  const empty = outfitPartCount() === 0;
  const res = await openEditor(game, {
    design: worn,
    title: 'Tribal Outfitter',
    mode: 'stage',
    budget,
    currency: 'Food',
    unlocked,
    tabs: defaultTabs('outfit'),
    lockedUids: body.parts.map((p) => p.uid),
    allowBody: false,
    stats: OUTFIT_STATS,
    background: 'village',
    maxParts: 12,
    doneLabel: 'Wear it',
    lockedHint: 'Win over or defeat more tribes to unlock this.',
    hint: empty
      ? 'No clothing has been crafted yet. You can still repaint your tribe.'
      : firstTime
        ? 'Dress your tribe! Clothing boosts Gather, Combat, Social and Health.'
        : 'Clothing boosts Gather, Combat, Social and Health. It costs food.',
  });
  if (!res) return null;
  game.setDesign('outfit', res.design);
  return res.spent;
}
