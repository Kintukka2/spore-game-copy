// Bottom sheets: ship & tool shop, badges, perks, missions and the empires list. The cargo hold is inventory.ts.
// Talking to empires lives in diplomacy.ts.
import { button, h, ui } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { ABILITIES } from '../../../game/cards';
import { BADGES, RANKS, TOOL_CATS, TOOLS, type ToolCat, type ToolDef } from '../data';
import { archName, relation } from '../empires';
import { abandon } from '../missions';
import { COMPONENTS, consumeRecipe, craftState, needsBlueprint, owned, previewSalvage, RECIPES, type CompId } from '../salvage';
import { EVENT_INFO } from '../events';
import { openInventory } from './inventory';
import type { SpaceStage } from '../stage';
import { fmtTime, money, sheet, stanceChip, tabStrip } from './common';

// ------------------------------------------------------------------ ship sheet
function shopContext(st: SpaceStage): { kind: 'own' | 'ally' | null; label: string } {
  const w = st.w;
  const o = w.ownerOf(w.s.loc);
  if (o === 'player') return { kind: 'own', label: w.s.loc === w.gal.homeStar ? 'Docked at your homeworld: every unlocked tool is for sale.' : 'Docked at your colony: every unlocked tool is for sale.' };
  const e = w.empireOf(w.s.loc);
  if (e?.allied) return { kind: 'ally', label: `Allied shop of ${e.name}: 10% off.` };
  return { kind: null, label: 'Shops are at your homeworld, your colonies and allied empires. Browse here, buy there.' };
}

/** The closest system with a shop: one of yours, or an ally's. */
function nearestShop(st: SpaceStage): number | null {
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

/** Tell the player plainly where they can buy, and offer to take them there. */
async function whereToBuy(st: SpaceStage, sh: { close(): void }, t?: ToolDef) {
  const w = st.w;
  const shop = nearestShop(st);
  const r = await ui.modal({
    title: '🔒 No shop in this system',
    body: [h('p', null, `${t ? `${t.icon} ${t.name} can only be bought` : 'Tools can only be bought'} at your homeworld, one of your colonies, or an allied empire's world.`),
      shop !== null ? h('p', { class: 'dim' }, `Nearest shop: ${w.star(shop).name}${shop === w.gal.homeStar ? ' (home)' : ''}.`) : null],
    buttons: shop !== null ? [{ id: 'ok', label: 'OK' }, { id: 'go', label: `🧭 Set course to ${w.star(shop).name}`, primary: true }] : [{ id: 'ok', label: 'OK', primary: true }],
  });
  if (r === 'go' && shop !== null) { sh.close(); st.showGalaxy(shop); st.selectStar(shop); }
}

/** Chips for a recipe: the blueprint, then each component with how many you have. */
function recipeChips(st: SpaceStage, t: ToolDef): HTMLElement {
  const w = st.w;
  const cs = craftState(w, t);
  const row = h('div', { class: 'sp-recipe' }, h('span', { class: 'sp-rc' + (cs.bp ? ' ok' : '') }, `📐 ${cs.bp ? 'Blueprint' : 'No blueprint'}`));
  for (const [c, need] of Object.entries(RECIPES[t.id] ?? {}) as [CompId, number][]) {
    const have = w.s.comps?.[c] ?? 0;
    row.append(h('span', { class: 'sp-rc' + (have >= need ? ' ok' : ''), title: COMPONENTS[c].name }, `${COMPONENTS[c].icon} ${Math.min(have, need)}/${need}${have >= need ? ' ✓' : ''}`));
  }
  return row;
}

/** Explain what an advanced part still needs, and where those things come from. */
async function needParts(st: SpaceStage, t: ToolDef) {
  const w = st.w;
  const cs = craftState(w, t);
  audio.sfx('error');
  await ui.modal({
    title: cs.bp ? `🔩 ${t.name} needs components` : `📐 ${t.name} needs a blueprint`,
    body: [
      h('p', null, `${t.icon} ${t.name} is advanced tech. On top of rank and credits, you need its blueprint and these components:`),
      recipeChips(st, t),
      cs.missing.length ? h('p', { class: 'dim' }, `Still missing: ${cs.missing.map((m) => `${m.need - m.have} × ${COMPONENTS[m.c].icon} ${COMPONENTS[m.c].name}`).join(', ')}.`) : null,
      h('p', { class: 'dim' }, 'Blueprints and components turn up in 🛰️ derelict wrecks, crashed ships and ruins you scan, ancient signals, mystery crates and wandering traders. Empires sometimes add them to mission rewards.'),
    ],
    buttons: [{ id: 'ok', label: 'Got it', primary: true }],
  });
}

function ownedState(st: SpaceStage, t: ToolDef): { owned: boolean; note: string } {
  const w = st.w;
  if (t.kind === 'upgrade') {
    const lv = w.groupLevel(t.group!, t.group === 'pulse' ? 0 : 1);
    return { owned: lv >= (t.level ?? 0), note: '' };
  }
  if (t.kind === 'unique') return { owned: w.has(t.id), note: '' };
  const n = w.count(t.id);
  return { owned: n >= (t.max ?? 99), note: `You have ${n}${t.id === 'seeds' ? ' pods' : ''}` };
}

function buyTool(st: SpaceStage, t: ToolDef, seller: 'own' | 'ally') {
  const w = st.w;
  const price = w.toolPrice(t, seller);
  if (w.s.money < price) { st.ui.toast('Not enough money.', '💸'); audio.sfx('error'); return false; }
  if (needsBlueprint(t)) {
    const cs = craftState(w, t);
    if (!cs.bp || cs.missing.length) { void needParts(st, t); return false; }
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
  st.ui.toast(`${needsBlueprint(t) ? 'Built' : 'Bought'}: ${t.name}`, t.icon, 'good');
  st.hud.layoutAbilities();
  return true;
}

export function openShip(st: SpaceStage, tab = 'shop') {
  if (tab === 'cargo') { openInventory(st); return; }
  const w = st.w;
  const sh = sheet('Ship & Tools');
  let cur = tab;
  let cat: ToolCat = 'standard';
  const render = () => {
    tabStrip(sh.tabs, [{ id: 'shop', label: '🧰 Shop' }, { id: 'cargo', label: '📦 Cargo' }, { id: 'badges', label: '🎖️ Badges' }, { id: 'perks', label: '✨ Ship & perks' }], cur, (id) => {
      // The cargo hold has its own inventory screen.
      if (id === 'cargo') { sh.close(); openInventory(st); return; }
      cur = id; render();
    });
    const B = sh.body;
    B.innerHTML = '';
    if (cur === 'shop') {
      const ctx = shopContext(st);
      if (ctx.kind) B.append(h('div', { class: 'sp-mini' }, ctx.label));
      else {
        const shop = nearestShop(st);
        B.append(h('div', { class: 'sp-lock' }, h('b', null, '🔒 No shop in this system'),
          h('span', null, 'You can browse, but tools are only sold at your homeworld, your colonies and allied empires.'),
          shop !== null ? button(`🧭 Set course to ${w.star(shop).name}`, () => { sh.close(); st.showGalaxy(shop); st.selectStar(shop); }, { cls: 'small gold' }) : null));
      }
      const cats = h('div', { class: 'sp-tabs', style: 'padding:0' });
      tabStrip(cats, TOOL_CATS.map((c) => ({ id: c.id, label: `${c.icon} ${c.label}` })), cat, (id) => { cat = id as ToolCat; render(); });
      B.append(cats);
      const rank = w.rank();
      for (const t of TOOLS.filter((x) => x.cat === cat && !x.special)) {
        const locked = rank < t.rank;
        const own = ownedState(st, t);
        const price = w.toolPrice(t, ctx.kind ?? 'own');
        const craft = needsBlueprint(t) && !own.owned ? craftState(w, t) : null;
        const btn = locked ? button(`🔒 ${RANKS[Math.min(t.rank, RANKS.length - 1)].name}`, () => { st.ui.toast(`Reach the rank of ${RANKS[t.rank].name} to unlock this.`, '🔒'); }, { cls: 'small' })
          : own.owned ? button('Owned', () => {}, { cls: 'small', disabled: true })
          : craft && !craft.bp ? button('📐 Blueprint', () => { void needParts(st, t); }, { cls: 'small ghost', title: 'Needs a blueprint' })
          : craft && craft.missing.length ? button('🔩 Parts', () => { void needParts(st, t); }, { cls: 'small ghost', title: 'Needs components' })
          : !ctx.kind ? button(`🔒 ${money(price)}`, () => { audio.sfx('error'); void whereToBuy(st, sh, t); }, { cls: 'small ghost', title: 'Buy at your homeworld, a colony or an ally' })
          : button(craft ? `🔧 ${money(price)}` : money(price), () => { if (buyTool(st, t, ctx.kind!)) render(); }, { cls: 'small ' + (w.s.money >= price ? 'gold' : ''), title: craft ? 'Build it' : undefined });
        B.append(h('div', { class: 'sp-item' + (locked ? ' locked' : '') }, h('div', { class: 'sp-ic' }, t.icon), h('div', { class: 'sp-txt' }, h('b', null, t.name), t.desc, own.note ? h('div', { class: 'sp-mini' }, own.note) : null, needsBlueprint(t) && !own.owned ? recipeChips(st, t) : null), btn));
      }
      if (cat === 'terraform' && w.count('genesis') > 0) B.append(h('div', { class: 'sp-item' }, h('div', { class: 'sp-ic' }, '🌱'), h('div', { class: 'sp-txt' }, h('b', null, `Genesis Seed ×${w.count('genesis')}`), 'Ori\'s gift. Use it from any planet\'s Overview.')));
    } else if (cur === 'badges') {
      const rk = w.rank();
      const pts = w.badgePoints();
      const next = w.nextRankPts();
      B.append(h('div', { class: 'sp-item' }, h('div', { class: 'sp-ic', style: 'font-size:34px' }, RANKS[rk].icon), h('div', { class: 'sp-txt' }, h('b', null, `${RANKS[rk].name} of the ${w.game.state?.speciesName}`),
        !w.s.flags.tutDone ? 'Finish your homeworld missions to earn the Captain\'s badge.' : next !== null ? `${pts} badge points · next rank (${RANKS[rk + 1].name}) at ${next}` : `${pts} badge points · the highest rank`)));
      for (const b of BADGES) {
        const lv = w.badgeLevel(b.id);
        const v = w.s.counters[b.counter] ?? 0;
        const nextT = b.levels[lv];
        const pips = h('span', { class: 'sp-pips' }, ...b.levels.map((_, i) => h('i', { class: i < lv ? 'on' : '' })));
        B.append(h('div', { class: 'sp-item' }, h('div', { class: 'sp-ic' }, b.icon), h('div', { class: 'sp-txt' }, h('b', null, b.name), `${b.desc}: ${v}${nextT !== undefined ? ' / ' + nextT : ' (max)'}`, h('div', null, pips))));
      }
    } else {
      const a = w.arch;
      if (a) B.append(h('div', { class: 'sp-item' }, h('div', { class: 'sp-ic', style: `font-size:32px` }, a.icon), h('div', { class: 'sp-txt' }, h('b', { style: `color:${a.color}` }, `${a.name} · ${a.philosophy}`), a.blurb, a.power ? h('div', null, h('b', { style: 'font-size:13px;display:inline' }, `${a.power.icon} ${a.power.name}: `), a.power.desc, ` (recharges in ${a.power.cooldown}s)`) : h('div', null, 'No superpower: a blank slate.'))));
      B.append(h('div', { class: 'sp-section' }, 'Card perks'));
      for (const id of w.perks) {
        const ab = ABILITIES[id];
        if (ab) B.append(h('div', { class: 'sp-item', style: 'padding:8px' }, h('div', { class: 'sp-ic' }, ab.icon), h('div', { class: 'sp-txt' }, h('b', null, ab.name), ab.desc)));
      }
      if (!w.perks.size) B.append(h('div', { class: 'sp-mini' }, 'No perks from earlier stages.'));
      B.append(h('div', { class: 'sp-section' }, 'Ship'));
      const kv = h('div', { class: 'sp-kv' });
      kv.append(
        h('span', null, 'Hull'), h('b', null, `${w.maxHp}`),
        h('span', null, 'Energy'), h('b', null, `${w.maxEnergy}`),
        h('span', null, 'Star Drive'), h('b', null, `Level ${w.driveLevel} · ${w.driveRange} ly`),
        h('span', null, 'Laser'), h('b', null, `Level ${w.laserLevel} · ${Math.round(st.sv.combat.laserDps())}/s`),
        h('span', null, 'Missiles'), h('b', null, `Level ${w.missileLevel} · ${Math.round(st.sv.combat.missileDmg())} each`),
        h('span', null, 'Design'), h('b', null, `${st.shipDesign.name} (power ${w.shipStats.power ?? 0}, armour ${w.shipStats.armor ?? 0}, speed ${w.shipStats.move ?? 0})`),
      );
      B.append(kv);
      if (w.s.loc === w.gal.homeStar) B.append(button('🛠️ Redesign your ship', () => st.redesignShip(), { cls: 'block' }));
      else B.append(h('div', { class: 'sp-mini' }, 'Return to your homeworld to redesign your ship.'));
    }
  };
  render();
}

// ------------------------------------------------------------------ missions
export function openMissions(st: SpaceStage) {
  const w = st.w;
  const sh = sheet('Missions');
  let cur = w.s.events.length ? 'alerts' : 'active';
  const render = () => {
    tabStrip(sh.tabs, [{ id: 'active', label: `📜 Active (${w.s.missions.length})` }, { id: 'alerts', label: '🚨 Alerts', badge: w.s.events.length }], cur, (id) => { cur = id; render(); });
    const B = sh.body;
    B.innerHTML = '';
    if (cur === 'active') {
      if (!w.s.missions.length) B.append(h('p', { class: 'dim' }, 'No missions. Hail an empire (👽) and ask for work, or simply explore.'));
      for (const m of w.s.missions) {
        const giver = m.giver === 'home' ? 'Homeworld' : w.emap.get(m.giver)?.name ?? '';
        const acts = h('div', { class: 'sp-actions' });
        if (m.star !== undefined) acts.append(button('🧭 Locate', () => { sh.close(); st.showMissionTarget(m); }, { cls: 'small' }));
        if (!m.main) acts.append(button('Abandon', async () => { if (await ui.confirm('Abandon mission?', 'The empire that asked will be disappointed.', 'Abandon', 'Keep')) { abandon(w, m); render(); } }, { cls: 'small ghost' }));
        B.append(h('div', { class: 'sp-offer', style: m.main ? '' : 'border-color:var(--line);background:rgba(255,255,255,.04)' },
          h('b', null, (m.main ? '⭐ ' : '') + m.title), h('div', null, m.desc),
          h('div', { class: 'sp-mini' }, `${giver}${m.reward ? ' · reward ' + money(m.reward) : ''}${m.bonus ? ' + ' + previewSalvage(m.bonus).map((b) => `${b.icon} ${b.text}`).join(', ') : ''}${m.deadline ? ' · ⏱ ' + fmtTime(m.deadline - w.s.t) : ''}`), acts));
      }
    } else {
      if (!w.s.events.length) B.append(h('p', { class: 'dim' }, 'All quiet across your worlds.'));
      for (const ev of w.s.events) {
        const pl = w.planet(ev.star, ev.planet);
        const info = EVENT_INFO[ev.kind];
        B.append(h('div', { class: 'sp-item' }, h('div', { class: 'sp-ic' }, info.icon), h('div', { class: 'sp-txt' }, h('b', { style: info.good ? 'color:#ffd166' : '' }, `${info.label}: ${pl.name}`), `${w.star(ev.star).name} · ${fmtTime(ev.until - w.s.t)} left · ${info.how}`), button('Go', () => { sh.close(); st.gotoEvent(ev); }, { cls: 'small ' + (info.good ? 'gold' : 'primary') })));
      }
    }
  };
  render();
}

// ------------------------------------------------------------------ empires
export function openEmpires(st: SpaceStage) {
  const w = st.w;
  const sh = sheet('Empires');
  const met = w.empires.filter((e) => e.met && !e.dead).sort((a, b) => relation(b) - relation(a));
  if (!met.length) sh.body.append(h('p', { class: 'dim' }, 'You have not met anyone yet. Fly into another empire\'s territory (coloured areas on the galaxy map) to make contact.'));
  for (const e of met) {
    const item = h('div', { class: 'sp-item', role: 'button', style: 'cursor:pointer' },
      h('div', { style: `width:10px;align-self:stretch;border-radius:6px;background:${e.color}` }),
      h('div', { class: 'sp-txt' }, h('b', null, e.name), h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, stanceChip(e), h('span', null, `${archName(e)} · ${w.countStars(e.id)} systems${e.route !== null ? ' · 💱 route' : ''}`))),
      button('📡', () => { sh.close(); st.openComm(e); }, { cls: 'icon', title: 'Hail' }));
    item.addEventListener('click', () => { sh.close(); st.openComm(e); });
    sh.body.append(item);
  }
  const total = w.empires.filter((e) => e.arch !== 'hollow' && !e.dead).length;
  const held = w.countStars('player');
  sh.body.append(h('div', { class: 'sp-mini' }, `${met.filter((e) => e.arch !== 'hollow').length} of ${total} spacefaring empires met. You hold ${held} ${held === 1 ? 'system' : 'systems'}.`));
}
