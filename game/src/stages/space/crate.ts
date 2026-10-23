// Mystery crates: bought from wandering traders, kept in the hold, opened later for a random prize.
import { article } from '../../engine/math';
import { TOOL_MAP } from './data';
import { rareSpecimen } from './events';
import { catalogue } from './xenolab';
import { giveSalvage, rollSalvage } from './salvage';
import type { Design } from '../../design/types';
import type { World } from './world';

export type Rarity = 'junk' | 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY: Record<Rarity, { label: string; color: string }> = {
  junk: { label: 'Junk', color: '#9aa4b2' },
  common: { label: 'Common', color: '#6ec8ff' },
  rare: { label: 'Rare', color: '#ffd166' },
  epic: { label: 'Epic', color: '#c39bff' },
  legendary: { label: 'Legendary', color: '#ff7ab8' },
};

export interface Loot { rarity: Rarity; icon: string; name: string; desc: string; /** A creature to show instead of the icon. */ design?: Design }

const PODS = ['stormpod', 'droughtpod', 'meteor', 'icecomet'];
const GADGETS = ['silo', 'bioshield', 'turret'];

function credits(w: World): Loot {
  const m = Math.round((30000 + Math.random() * 20000) / 500) * 500;
  w.addMoney(m);
  return { rarity: 'rare', icon: '💰', name: `§${m.toLocaleString('en-US')} in credit chits`, desc: 'Old, crumpled, and still perfectly spendable.' };
}

/** A creature in a stasis pod: a one-off rare cousin of some living world's natives. */
function stasisPod(w: World): Loot | null {
  if (w.cargoUsed >= w.cargoCap) return null;
  for (const id of [w.s.loc, ...w.gal.within(w.s.loc, 320)]) {
    for (const pl of w.gal.planets(id)) {
      if (!pl.life || pl.kind === 'gas') continue;
      const sp = rareSpecimen(w, pl, Math.floor(Math.random() * 1e9));
      if (!sp) continue;
      w.s.specimens.push(sp);
      const grant = catalogue(w, sp);
      return { rarity: 'legendary', icon: '🧬', design: sp.design, name: `${article(sp.name, true)} ${sp.name} in a stasis pod`, desc: `It wakes up in your hold, one of a kind${grant ? `. Xenopedia grant §${grant.toLocaleString('en-US')}` : ''}. Rare creatures draw triple crowds at the Menagerie.` };
    }
  }
  return null;
}

/** Use up one crate from the hold and award what was inside. Null if there is no crate. */
export function openCrateLoot(w: World): Loot | null {
  if (!w.use('crate')) return null;
  const x = Math.random();
  let loot: Loot | null = null;
  if (x < 0.06) loot = stasisPod(w);
  if (!loot && x < 0.38) loot = credits(w);
  if (!loot && x < 0.68) {
    const p = PODS[Math.floor(Math.random() * PODS.length)];
    w.give(p, 3);
    loot = { rarity: 'common', icon: TOOL_MAP[p].icon, name: `3 × ${TOOL_MAP[p].name}`, desc: TOOL_MAP[p].desc };
  }
  if (!loot && x < 0.8) {
    // Salvage: a blueprint (epic) or a bundle of components (common).
    const sv = rollSalvage(w, 'crate');
    const got = giveSalvage(w, sv);
    if (got.length) loot = { rarity: sv.bp ? 'epic' : 'common', icon: sv.bp ? '📐' : got[0].icon, name: got.map((g) => g.text).join(', '), desc: sv.bp ? 'Plans for advanced tech. Build it at a shop with the components it lists.' : 'Components for advanced parts. Blueprints tell you what each part needs.' };
  }
  if (!loot && x < 0.92) {
    const g = GADGETS[Math.floor(Math.random() * GADGETS.length)];
    w.give(g, 1);
    loot = { rarity: 'epic', icon: TOOL_MAP[g].icon, name: TOOL_MAP[g].name, desc: TOOL_MAP[g].desc };
  }
  w.counter('crates');
  w.hooks?.changed();
  return loot ?? { rarity: 'junk', icon: '🥜', name: 'Space packing peanuts', desc: 'Thousands of them. The trader is very sorry. (They are not.)' };
}
