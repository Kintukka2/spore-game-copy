// The shipyard terminal: the tool shop as a wall-mounted Fallout terminal. One page per category (Ship, Weapons,
// Colony, Terraform, Social), each tool with its price, rank, what you own and, for advanced parts, the
// blueprint and components it needs. Consumables are bought after a confirm; ship parts (and anything built
// from a blueprint) go to the hangar. Away from a shipyard you can browse, and set course to the nearest one.
import { audio } from '../../../engine/audio';
import { RANKS, TOOL_CATS, TOOLS, type ToolDef } from '../data';
import { COMPONENTS, consumeRecipe, craftState, needsBlueprint, RECIPES, type CompId } from '../salvage';
import type { SpaceStage } from '../stage';
import { money } from './common';
import { drawSchematic, openHangar } from './hangar';
import { openTerminal, picCanvas, type NbAct, type NbCtx, type NbDetail, type NbRow, type NbTab, type NbTerm } from './navboy';

/** Where you are docked: your own world, an ally's (10% off), or nowhere. */
function shopContext(st: SpaceStage): { kind: 'own' | 'ally' | null; label: string } {
  const w = st.w;
  const o = w.ownerOf(w.s.loc);
  if (o === 'player') return { kind: 'own', label: w.s.loc === w.gal.homeStar ? 'Home shipyard' : 'Colony shipyard' };
  const e = w.empireOf(w.s.loc);
  if (e?.allied) return { kind: 'ally', label: `${e.name} shipyard · 10% off` };
  return { kind: null, label: 'No shipyard here' };
}

/** The closest system with a shipyard: one of yours, or an ally's. */
export function nearestShop(st: SpaceStage): number | null {
  const w = st.w;
  let best: number | null = null, bd = Infinity;
  for (const s of w.gal.stars) {
    const o = w.ownerOf(s.id);
    if (o !== 'player' && !w.empireOf(s.id)?.allied) continue;
    const d = w.gal.dist(s.id, w.s.loc);
    if (d < bd) { bd = d; best = s.id; }
  }
  return best;
}

/** Ship parts, and anything built from a blueprint, are assembled in the hangar rather than bought outright. */
const inHangar = (t: ToolDef) => t.kind !== 'consumable' || needsBlueprint(t);

function ownedState(st: SpaceStage, t: ToolDef): { owned: boolean; note: string } {
  const w = st.w;
  if (t.kind === 'upgrade') {
    const lv = w.groupLevel(t.group!, t.group === 'pulse' ? 0 : 1);
    return { owned: lv >= (t.level ?? 0), note: `Lv ${lv}` };
  }
  if (t.kind === 'unique') return { owned: w.has(t.id), note: w.has(t.id) ? 'Fitted' : 'No' };
  const n = w.count(t.id);
  return { owned: n >= (t.max ?? 99), note: `${n}/${t.max ?? 99}` };
}

/** Pay for a tool and fit it (or stow it). */
function buyTool(st: SpaceStage, t: ToolDef, seller: 'own' | 'ally'): string | null {
  const w = st.w;
  const price = w.toolPrice(t, seller);
  if (w.s.money < price) return 'Not enough credits.';
  if (needsBlueprint(t)) {
    const cs = craftState(w, t);
    if (!cs.bp) return 'You need the blueprint.';
    if (cs.missing.length) return 'You are missing components.';
    consumeRecipe(w, t);
  }
  const oldHp = w.maxHp, oldEn = w.maxEnergy;
  w.addMoney(-price);
  if (t.kind === 'consumable') w.give(t.id, t.id === 'seeds' ? 3 : 1);
  else w.s.tools[t.id] = 1;
  w.refreshShipStats();
  w.s.hp = Math.min(w.maxHp, w.s.hp + Math.max(0, w.maxHp - oldHp));
  w.s.energy = Math.min(w.maxEnergy, w.s.energy + Math.max(0, w.maxEnergy - oldEn));
  w.counter('toolsBought');
  audio.sfx('coin');
  audio.sfx('success', { vol: 0.5 });
  st.hud.layoutAbilities();
  return null;
}

const mem = { page: 'standard' };

export function openShop(st: SpaceStage, cat?: string) {
  const term: NbTerm = {
    title: 'SHIPYARD',
    sub: () => `${shopContext(st).label} · ${st.w.star(st.w.s.loc).name}`,
    tab: (ctx) => shopTab(ctx),
    mem,
  };
  openTerminal(st, term, cat);
}

function shopTab(ctx: NbCtx): NbTab {
  const st = ctx.st, w = st.w;
  const pages = TOOL_CATS.map((c) => {
    let cache: (NbRow & { t: ToolDef })[] = [];
    return {
      id: c.id, label: c.label,
      rows: () => (cache = TOOLS.filter((t) => t.cat === c.id && !t.special).map((t) => {
        const locked = w.rank() < t.rank, own = ownedState(st, t);
        const craft = needsBlueprint(t) && !own.owned ? craftState(w, t) : null;
        const sc = shopContext(st);
        return {
          t, icon: t.icon, name: t.name, mark: own.owned && t.kind !== 'consumable', dim: locked || (own.owned && t.kind !== 'consumable'),
          val: locked ? `[${RANKS[Math.min(t.rank, RANKS.length - 1)].name}]` : own.owned ? (t.kind === 'consumable' ? 'FULL' : 'OWNED') : craft && !craft.bp ? '📐 ?' : craft && craft.missing.length ? '🔩 …' : money(w.toolPrice(t, sc.kind ?? 'own')),
        };
      })),
      detail: (_r: NbRow, i: number) => detail(cache[i].t),
    };
  });

  const detail = (t: ToolDef): NbDetail => {
    const sc = shopContext(st);
    const price = w.toolPrice(t, sc.kind ?? 'own');
    const locked = w.rank() < t.rank, own = ownedState(st, t);
    const craft = needsBlueprint(t) && !own.owned ? craftState(w, t) : null;
    const lines: [string, string, boolean?][] = [];
    if (needsBlueprint(t)) {
      const cs = craftState(w, t);
      lines.push(['📐 Blueprint', cs.bp ? 'Held' : 'Missing', cs.bp]);
      if (!cs.bp) lines.push(['Components', 'Unknown: the blueprint lists them']);
      else for (const [cId, need] of Object.entries(RECIPES[t.id] ?? {}) as [CompId, number][]) {
        const have = w.s.comps?.[cId] ?? 0;
        lines.push([`${COMPONENTS[cId].icon} ${COMPONENTS[cId].name}`, `${Math.min(have, need)} / ${need}${have >= need ? ' ✓' : ''}`, have >= need]);
      }
    }
    const acts: NbAct[] = [];
    let note = '';
    if (locked) note = `Reach the rank of ${RANKS[t.rank].name} to unlock it.`;
    else if (own.owned) note = t.kind === 'consumable' ? 'You are carrying as many as you can.' : 'Already fitted to your ship.';
    else if (craft && (!craft.bp || craft.missing.length)) note = 'Blueprints and components turn up in derelict wrecks, crashed ships and ruins you scan, ancient signals, mystery crates and wandering traders. Empires sometimes add them to mission rewards.';
    else if (!sc.kind) {
      const shop = nearestShop(st);
      note = 'Tools are only sold at your homeworld, your colonies and allied empires.';
      if (shop !== null) acts.push({ key: 'C', label: `Course: ${w.star(shop).name}`, run: () => { ctx.close(); st.showGalaxy(shop); st.selectStar(shop); } });
    } else if (inHangar(t)) {
      note = 'Ship parts, and anything built from a blueprint, are fitted in the hangar.';
      acts.push({ key: 'E', label: 'Build in hangar', off: w.s.money < price ? `Not enough credits: it costs ${money(price)}.` : undefined, run: () => {
        ctx.close();
        const cat = t.cat;
        openHangar(st, t, price, () => buyTool(st, t, sc.kind!) === null, () => openShop(st, cat));
      } });
    } else {
      const n = t.id === 'seeds' ? 3 : 1;
      acts.push({
        key: 'E', label: 'Buy', off: w.s.money < price ? `Not enough credits: it costs ${money(price)}.` : undefined,
        ask: `Buy ${n > 1 ? `${n} × ` : ''}${t.icon} ${t.name} for ${money(price)}? You have ${money(w.s.money)}${w.count(t.id) ? `, and ${w.count(t.id)} already aboard` : ''}.`,
        run: () => { const err = buyTool(st, t, sc.kind!); if (err) { ctx.note(err, true); audio.sfx('error'); } else ctx.note(`Bought: ${t.name}`); },
      });
    }
    return {
      pic: t.group || ['shield', 'bomb', 'wormkey'].includes(t.id) ? (el) => schematicPic(el, t.group ?? t.id) : undefined,
      big: t.icon,
      boxes: [['PRICE', money(price)], ['RANK', RANKS[Math.min(t.rank, RANKS.length - 1)].name], [t.kind === 'consumable' ? 'CARRY' : 'OWN', own.note]],
      lines: lines.length ? lines : undefined,
      desc: `${t.desc}${note ? ` ${note}` : ''}`,
      acts,
    };
  };

  return {
    id: 'term', label: 'STOCK',
    head: () => {
      const sc = shopContext(st);
      return [['DOCK', sc.kind ? (sc.kind === 'own' ? 'Yours' : 'Allied') : 'Browse only'], ['RANK', RANKS[w.rank()].name], ['§', money(w.s.money).slice(1)]];
    },
    pages,
  };
}

function schematicPic(host: HTMLElement, kind: string) {
  const cv = picCanvas(host, () => { /* drawn below */ }, false, 'mono');
  let t = 0, last = performance.now();
  const loop = (now: number) => {
    if (!cv.isConnected && t > 0.2) return;
    t += (now - last) / 1000;
    last = now;
    drawSchematic(cv, kind, false, t, 1);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
