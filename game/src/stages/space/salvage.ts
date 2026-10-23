// Blueprints and components. The more advanced ship upgrades and tools need more than rank and credits: a
// blueprint for the part, and the components it lists. Both are found (derelict wrecks, ruins, relics), bought
// from wandering traders, pulled from mystery crates, or given as rare rewards for an empire's missions.
// Finished tools turn up the same ways now and then.
import { article } from '../../engine/math';
import { TOOL_MAP, TOOLS, type ToolDef } from './data';
import type { World } from './world';

export type CompId = 'alloy' | 'fusion' | 'coil' | 'lens' | 'plasma' | 'biogel' | 'core' | 'crystal';
export type Rarity = 'common' | 'uncommon' | 'rare';
/** Component rarity colours: silver, green, blue. */
export const RARITY_COLOR: Record<Rarity, string> = { common: '#dfe4ee', uncommon: '#62e07c', rare: '#5ab0ff' };

export const COMPONENTS: Record<CompId, { name: string; icon: string; rarity: Rarity; desc: string }> = {
  alloy: { name: 'Alloy Plating', icon: '🔩', rarity: 'common', desc: 'Dense hull plate, still warm from someone else\'s ship.' },
  fusion: { name: 'Fusion Cell', icon: '⚛️', rarity: 'common', desc: 'A palm-sized star in a bottle.' },
  coil: { name: 'Grav Coil', icon: '🧲', rarity: 'uncommon', desc: 'Bends space a little. Handle with care.' },
  lens: { name: 'Focus Lens', icon: '🔷', rarity: 'uncommon', desc: 'Flawless crystal for beams and sensors.' },
  plasma: { name: 'Plasma Injector', icon: '🔥', rarity: 'uncommon', desc: 'Feeds weapons and engines alike.' },
  biogel: { name: 'Bio-gel', icon: '🧪', rarity: 'uncommon', desc: 'Living goo that seals, grows and heals.' },
  core: { name: 'Quantum Core', icon: '💠', rarity: 'rare', desc: 'Thinks faster than you do. Rarely found intact.' },
  crystal: { name: 'Warp Crystal', icon: '🔮', rarity: 'rare', desc: 'Hums in the key of folded space.' },
};
export const COMP_IDS = Object.keys(COMPONENTS) as CompId[];
const RARITY_WT: Record<Rarity, number> = { common: 6, uncommon: 3, rare: 1 };

/** What each advanced part needs on top of its blueprint, rank and price. */
export const RECIPES: Record<string, Partial<Record<CompId, number>>> = {
  drive4: { coil: 2, crystal: 1, alloy: 2 },
  drive5: { coil: 3, crystal: 2, core: 1 },
  cargo3: { alloy: 3, coil: 1 },
  cargo4: { alloy: 4, coil: 2, core: 1 },
  cell3: { fusion: 3, plasma: 1 },
  cell4: { fusion: 4, plasma: 1, core: 1 },
  hull3: { alloy: 4, fusion: 1 },
  hull4: { alloy: 5, biogel: 1, core: 1 },
  wormkey: { crystal: 2, coil: 1 },
  laser3: { lens: 3, plasma: 2, core: 1 },
  missile2: { plasma: 2, alloy: 1 },
  missile3: { plasma: 3, lens: 1, core: 1 },
  pulse2: { coil: 2, plasma: 2 },
  shield: { fusion: 2, coil: 2, lens: 1 },
  thermlance: { plasma: 2, lens: 1 },
  bioshield: { biogel: 2 },
  embassy: { biogel: 1, lens: 1 },
};

export function needsBlueprint(t: ToolDef): boolean { return !!RECIPES[t.id]; }
export function hasBlueprint(w: World, id: string): boolean { return (w.s.blueprints ?? []).includes(id); }
export function compCount(w: World, c: CompId): number { return w.s.comps?.[c] ?? 0; }

/** What stands between you and building this part: the blueprint, and any missing components. */
export function craftState(w: World, t: ToolDef): { bp: boolean; missing: { c: CompId; have: number; need: number }[] } {
  const rec = RECIPES[t.id] ?? {};
  const missing: { c: CompId; have: number; need: number }[] = [];
  for (const [c, need] of Object.entries(rec) as [CompId, number][]) {
    const have = compCount(w, c);
    if (have < need) missing.push({ c, have, need });
  }
  return { bp: hasBlueprint(w, t.id), missing };
}

/** Use up the components a recipe lists. Consumable recipes (embassy, bio shield) cost them per item. */
export function consumeRecipe(w: World, t: ToolDef) {
  const comps = (w.s.comps ??= {});
  for (const [c, need] of Object.entries(RECIPES[t.id] ?? {}) as [CompId, number][]) comps[c] = Math.max(0, (comps[c] ?? 0) - need);
}

// ------------------------------------------------------------------ loot
export interface Salvage {
  comps?: Partial<Record<CompId, number>>;
  /** Tool id of a blueprint. */
  bp?: string;
  /** A finished tool (upgrade, unique or a stack of consumables). */
  tool?: string;
  toolN?: number;
}

function pickWeighted<T>(items: T[], wt: (t: T) => number, rnd = Math.random): T {
  const total = items.reduce((a, t) => a + wt(t), 0);
  let r = rnd() * total;
  for (const t of items) if ((r -= wt(t)) <= 0) return t;
  return items[items.length - 1];
}

/** A handful of components, rarer ones more likely when `rare` is higher (0..1). */
export function rollComps(n: number, rare = 0): Partial<Record<CompId, number>> {
  const out: Partial<Record<CompId, number>> = {};
  for (let i = 0; i < n; i++) {
    const c = pickWeighted(COMP_IDS, (id) => RARITY_WT[COMPONENTS[id].rarity] * (COMPONENTS[id].rarity === 'common' ? 1 : 1 + rare * 2));
    out[c] = (out[c] ?? 0) + 1;
  }
  return out;
}

/** A blueprint you do not have yet, for a part you do not own, close to your rank. */
export function pickBlueprint(w: World): string | null {
  const rank = w.rank();
  const opts = TOOLS.filter((t) => RECIPES[t.id] && !hasBlueprint(w, t.id) && !owned(w, t) && t.rank <= rank + 2);
  if (!opts.length) return null;
  return pickWeighted(opts, (t) => 1 / (1 + Math.abs(t.rank - rank))).id;
}

/** A finished part or tool worth finding: the next level of an upgrade, a unique you lack, or a stack of consumables. */
export function pickFoundTool(w: World): { id: string; n: number } | null {
  const rank = w.rank();
  const opts = TOOLS.filter((t) => !t.special && t.rank <= rank + 1 && t.id !== 'cracker' && !owned(w, t)
    && (t.kind !== 'upgrade' || (t.level ?? 0) === w.groupLevel(t.group!, t.group === 'pulse' ? 0 : 1) + 1));
  if (!opts.length) return null;
  const t = pickWeighted(opts, (x) => (x.kind === 'consumable' ? 3 : 1));
  return { id: t.id, n: t.kind === 'consumable' ? (t.id === 'seeds' ? 6 : 2) : 1 };
}

export function owned(w: World, t: ToolDef): boolean {
  if (t.kind === 'upgrade') return w.groupLevel(t.group!, t.group === 'pulse' ? 0 : 1) >= (t.level ?? 0);
  if (t.kind === 'unique') return w.has(t.id);
  return w.count(t.id) >= (t.max ?? 99);
}

/** Roll salvage for a source. Wrecks are mostly components; relics and missions lean to blueprints. */
export function rollSalvage(w: World, from: 'wreck' | 'relic' | 'ruin' | 'mission' | 'crate'): Salvage {
  const s: Salvage = {};
  const r = Math.random();
  if (from === 'wreck') {
    s.comps = rollComps(2 + Math.floor(Math.random() * 3), 0.3);
    if (r < 0.3) s.bp = pickBlueprint(w) ?? undefined;
    else if (r < 0.45) { const t = pickFoundTool(w); if (t) { s.tool = t.id; s.toolN = t.n; } }
  } else if (from === 'relic') {
    if (r < 0.55) s.bp = pickBlueprint(w) ?? undefined;
    s.comps = rollComps(1 + Math.floor(Math.random() * 2), 0.8);
  } else if (from === 'ruin') {
    if (r < 0.25) s.bp = pickBlueprint(w) ?? undefined;
    else s.comps = rollComps(1, 0.5);
  } else if (from === 'mission') {
    if (r < 0.45) s.bp = pickBlueprint(w) ?? undefined;
    else if (r < 0.75) { const t = pickFoundTool(w); if (t) { s.tool = t.id; s.toolN = t.n; } }
    if (!s.bp && !s.tool) s.comps = rollComps(2, 0.6);
  } else {
    if (r < 0.4) s.bp = pickBlueprint(w) ?? undefined;
    if (!s.bp) s.comps = rollComps(2 + Math.floor(Math.random() * 2), 0.5);
  }
  return s;
}

/** What a haul holds, item by item, without handing it over. */
export function previewSalvage(s: Salvage): { icon: string; text: string; desc: string }[] {
  const out: { icon: string; text: string; desc: string }[] = [];
  if (s.bp) {
    const t = TOOL_MAP[s.bp];
    out.push({ icon: '📐', text: `${t.name} blueprint`, desc: `Plans for ${t.icon} ${t.name}: ${t.desc} Take it to learn which components it calls for.` });
  }
  for (const [c, n] of Object.entries(s.comps ?? {}) as [CompId, number][]) {
    if (n) out.push({ icon: COMPONENTS[c].icon, text: `${n} × ${COMPONENTS[c].name}`, desc: `${COMPONENTS[c].desc} (${COMPONENTS[c].rarity} component)` });
  }
  if (s.tool) {
    const t = TOOL_MAP[s.tool];
    out.push({ icon: t.icon, text: t.kind === 'consumable' ? `${s.toolN ?? 1} × ${t.name}` : `${t.name}`, desc: `${t.desc}${t.kind === 'consumable' ? '' : ' Installed as soon as you take it.'}` });
  }
  return out;
}

/** Blueprints for parts you do not have yet, with every component in stock. */
export function readyBlueprints(w: World): string[] {
  return (w.s.blueprints ?? []).filter((id) => {
    const t = TOOL_MAP[id];
    return t && (t.kind === 'consumable' || !owned(w, t)) && !craftState(w, t).missing.length;
  });
}

/** Hand over salvage. Returns one line per item, for reports. */
export function giveSalvage(w: World, s: Salvage): { icon: string; text: string }[] {
  const ready = new Set(readyBlueprints(w));
  const out = previewSalvage(s).map(({ icon, text }) => ({ icon, text }));
  if (s.bp && !hasBlueprint(w, s.bp)) (w.s.blueprints ??= []).push(s.bp);
  for (const [c, n] of Object.entries(s.comps ?? {}) as [CompId, number][]) {
    if (n) (w.s.comps ??= {})[c] = (w.s.comps[c] ?? 0) + n;
  }
  if (s.tool) grantTool(w, TOOL_MAP[s.tool], s.toolN ?? 1);
  if (out.length) w.hooks?.changed();
  // Engineering calls in once each blueprint has everything it needs.
  for (const id of readyBlueprints(w)) {
    if (ready.has(id) || w.s.flags['bpReady:' + id]) continue;
    w.s.flags['bpReady:' + id] = true;
    w.hooks?.blueprintReady?.(id);
  }
  return out;
}

/** Install a finished part or add consumables, topping up hull and energy if the part raised their maximums. */
export function grantTool(w: World, t: ToolDef, n = 1) {
  const oldHp = w.maxHp, oldEn = w.maxEnergy;
  if (t.kind === 'consumable') w.give(t.id, n);
  else w.s.tools[t.id] = 1;
  w.refreshShipStats();
  w.s.hp = Math.min(w.maxHp, w.s.hp + Math.max(0, w.maxHp - oldHp));
  w.s.energy = Math.min(w.maxEnergy, w.s.energy + Math.max(0, w.maxEnergy - oldEn));
}

/** One line for a salvage haul, e.g. "📐 Star Drive IV blueprint, 🔩 2 × Alloy Plating". */
export function salvageLine(items: { icon: string; text: string }[]): string {
  return items.map((i) => `${i.icon} ${i.text}`).join(', ');
}

/** "a Grav Coil" / "an Alloy Plating". */
export function compName(c: CompId): string { return `${article(COMPONENTS[c].name)} ${COMPONENTS[c].name}`; }
