// Bottom sheets and dialogs: ship & tool shop, cargo, badges, perks, missions, empires,
// diplomacy (comm), first contact, tribute demands and takeover offers.
import { button, h, progressBar, ui } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { ABILITIES, ARCHETYPES } from '../../../game/cards';
import { BADGES, PERSONALITY, RANKS, SPICE, SPICE_COLORS, TOOL_CATS, TOOLS, type ToolCat, type ToolDef } from '../data';
import type { Empire } from '../types';
import {
  archName, breakAlliance, canAlly, canRoute, contactReply, declareWar, formAlliance, gift, giftValue, makePeace, openRoute,
  addMod, payTribute, peacePrice, relation, strength, annexSystem,
} from '../empires';
import { acceptOffer, abandon, declineOffer, offerFor } from '../missions';
import { EVENT_INFO } from '../events';
import type { SpaceStage } from '../stage';
import { dietIcon, fmtTime, modsList, money, portrait, relMeter, sheet, specimenThumb, stanceChip, tabStrip } from './common';
import { renderLab } from './xenoLab';

// ------------------------------------------------------------------ ship sheet
function shopContext(st: SpaceStage): { kind: 'own' | 'ally' | null; label: string } {
  const w = st.w;
  const o = w.ownerOf(w.s.loc);
  if (o === 'player') return { kind: 'own', label: w.s.loc === w.gal.homeStar ? 'Docked at your homeworld: every unlocked tool is for sale.' : 'Docked at your colony: every unlocked tool is for sale.' };
  const e = w.empireOf(w.s.loc);
  if (e?.allied) return { kind: 'ally', label: `Allied shop of ${e.name}: 10% off.` };
  return { kind: null, label: 'Shops are at your homeworld, your colonies and allied empires. Browse here, buy there.' };
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
  st.ui.toast(`Bought: ${t.name}`, t.icon, 'good');
  st.hud.layoutAbilities();
  return true;
}

export function openShip(st: SpaceStage, tab = 'shop') {
  const w = st.w;
  const sh = sheet('Ship & Tools');
  let cur = tab;
  let cat: ToolCat = 'standard';
  const labPick: number[] = [];
  const render = () => {
    tabStrip(sh.tabs, [{ id: 'shop', label: '🧰 Shop' }, { id: 'cargo', label: '📦 Cargo' }, { id: 'lab', label: '🧬 Xeno-Lab', badge: w.s.specimens.length }, { id: 'badges', label: '🎖️ Badges' }, { id: 'perks', label: '✨ Ship & perks' }], cur, (id) => { cur = id; labPick.length = 0; render(); });
    const B = sh.body;
    B.innerHTML = '';
    if (cur === 'shop') {
      const ctx = shopContext(st);
      B.append(h('div', { class: 'sp-mini' }, ctx.label));
      const cats = h('div', { class: 'sp-tabs', style: 'padding:0' });
      tabStrip(cats, TOOL_CATS.map((c) => ({ id: c.id, label: `${c.icon} ${c.label}` })), cat, (id) => { cat = id as ToolCat; render(); });
      B.append(cats);
      const rank = w.rank();
      for (const t of TOOLS.filter((x) => x.cat === cat && !x.special)) {
        const locked = rank < t.rank;
        const own = ownedState(st, t);
        const price = w.toolPrice(t, ctx.kind ?? 'own');
        const btn = locked ? button(`🔒 ${RANKS[Math.min(t.rank, RANKS.length - 1)].name}`, () => { st.ui.toast(`Reach the rank of ${RANKS[t.rank].name} to unlock this.`, '🔒'); }, { cls: 'small' })
          : own.owned ? button('Owned', () => {}, { cls: 'small', disabled: true })
          : button(money(price), () => { if (!ctx.kind) { st.ui.toast(ctx.label, '🧰'); audio.sfx('error'); return; } if (buyTool(st, t, ctx.kind)) render(); }, { cls: 'small ' + (ctx.kind && w.s.money >= price ? 'gold' : ''), disabled: !ctx.kind && false });
        B.append(h('div', { class: 'sp-item' + (locked ? ' locked' : '') }, h('div', { class: 'sp-ic' }, t.icon), h('div', { class: 'sp-txt' }, h('b', null, t.name), t.desc, own.note ? h('div', { class: 'sp-mini' }, own.note) : null), btn));
      }
      if (cat === 'terraform' && w.count('genesis') > 0) B.append(h('div', { class: 'sp-item' }, h('div', { class: 'sp-ic' }, '🌱'), h('div', { class: 'sp-txt' }, h('b', null, `Genesis Seed ×${w.count('genesis')}`), 'Ori\'s gift. Use it from any planet\'s Overview.')));
    } else if (cur === 'cargo') {
      const cap = progressBar('gold');
      cap.set(w.cargoUsed / w.cargoCap, `Hold ${w.cargoUsed} / ${w.cargoCap}`);
      B.append(cap.el);
      B.append(h('div', { class: 'sp-section' }, 'Spice'));
      let anySpice = false;
      for (const c of SPICE_COLORS) {
        if (!w.s.spice[c]) continue;
        anySpice = true;
        B.append(h('div', { class: 'sp-item', style: 'padding:8px' }, h('span', { class: 'sp-dot', style: `background:${SPICE[c].hex};width:16px;height:16px` }), h('div', { class: 'sp-txt' }, h('b', null, `${SPICE[c].name} ×${w.s.spice[c]}`), `Worth from ${money(SPICE[c].base)} each`),
          button('Jettison 1', () => { w.s.spice[c]--; audio.sfx('remove'); render(); }, { cls: 'small ghost' })));
      }
      if (!anySpice) B.append(h('div', { class: 'sp-mini' }, 'No spice aboard. Colonies store spice; visit their systems to collect it. Sell it at other empires.'));
      B.append(h('div', { class: 'sp-section' }, `Specimens (${w.s.specimens.length})`));
      w.s.specimens.forEach((sp, i) => {
        B.append(h('div', { class: 'sp-item', style: 'padding:6px' }, specimenThumb(w, sp, 64, 44), h('div', { class: 'sp-txt' }, h('b', null, sp.name), sp.hybrid ? '🧬 Hybrid' : `${dietIcon(sp.diet)} ${sp.diet}`),
          button('Set free', () => { w.s.specimens.splice(i, 1); audio.sfx('remove'); render(); }, { cls: 'small ghost', title: 'Let it go (frees a cargo slot)' })));
      });
      B.append(h('div', { class: 'sp-mini' }, w.s.specimens.length
        ? 'Exhibit specimens for tourism income, splice two into a hybrid, or release them into ecosystem slots on terraformed worlds.'
        : 'Beam up creatures from living worlds (planet → Life). New species pay research grants; the Xeno-Lab shows what else they are good for.'));
      B.append(button('🧬 Open the Xeno-Lab', () => { cur = 'lab'; render(); }, { cls: 'small block' }));
      B.append(h('div', { class: 'sp-section' }, 'Consumables'));
      const cons = TOOLS.filter((t) => t.kind === 'consumable' && w.count(t.id) > 0);
      for (const t of cons) {
        const use = t.id === 'repair' ? button('Use', () => { st.useRepair(); render(); }, { cls: 'small primary' }) : t.id === 'recharge' ? button('Use', () => { st.useEnergyPack(); render(); }, { cls: 'small primary' }) : null;
        B.append(h('div', { class: 'sp-item', style: 'padding:8px' }, h('div', { class: 'sp-ic' }, t.icon), h('div', { class: 'sp-txt' }, h('b', null, `${t.name} ×${w.count(t.id)}`)), use));
      }
      if (!cons.length) B.append(h('div', { class: 'sp-mini' }, 'None.'));
    } else if (cur === 'lab') {
      renderLab(st, B, labPick, render);
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
          h('div', { class: 'sp-mini' }, `${giver}${m.reward ? ' · reward ' + money(m.reward) : ''}${m.deadline ? ' · ⏱ ' + fmtTime(m.deadline - w.s.t) : ''}`), acts));
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
      button('📡', () => { sh.close(); openComm(st, e); }, { cls: 'icon', title: 'Hail' }));
    item.addEventListener('click', () => { sh.close(); openComm(st, e); });
    sh.body.append(item);
  }
  const total = w.empires.filter((e) => e.arch !== 'hollow' && !e.dead).length;
  const held = w.countStars('player');
  sh.body.append(h('div', { class: 'sp-mini' }, `${met.filter((e) => e.arch !== 'hollow').length} of ${total} spacefaring empires met. You hold ${held} ${held === 1 ? 'system' : 'systems'}.`));
}

// ------------------------------------------------------------------ diplomacy
export function openComm(st: SpaceStage, e: Empire) {
  const w = st.w;
  const sh = sheet(e.name);
  const inTheirSystem = w.ownerOf(w.s.loc) === e.id;
  const render = () => {
    const B = sh.body;
    B.innerHTML = '';
    const head = h('div', { class: 'row', style: 'align-items:stretch' });
    const pc = portrait(e.creature);
    pc.style.width = '120px'; pc.style.flex = '0 0 120px';
    const info = h('div', { class: 'col', style: 'gap:4px;flex:1;min-width:0' },
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, stanceChip(e), h('span', { class: 'chip', style: 'font-size:12px' }, e.arch === 'hollow' ? '🤖 Machine' : `${ARCHETYPES[e.arch].icon} ${archName(e)}`)),
      h('div', { class: 'dim', style: 'font-size:13px' }, `${e.species} · strength ${'★'.repeat(strength(w, e))} · ${w.countStars(e.id)} systems`),
      relMeter(e),
      h('div', { class: 'sp-mini' }, `Relation ${relation(e)}${e.serenade > 0 ? ' (charmed)' : ''}`));
    head.append(pc, info);
    B.append(head, modsList(e));
    const acts = h('div', { class: 'sp-tools' });
    const hollow = e.arch === 'hollow';
    // Gifts
    for (const amt of [10000, 50000, 250000]) {
      acts.append(button(`🎁 Gift ${money(amt)} (+${Math.min(50, giftValue(w, e, amt))})`, () => {
        if (w.s.money < amt) { st.ui.toast('Not enough money.', '💸'); audio.sfx('error'); return; }
        const d = gift(w, e, amt);
        st.ui.toast(d > 0 ? `${e.species} appreciate your gift (+${d}).` : `${e.species} accept, but they have had enough gifts for now.`, '🎁', 'good');
        render();
      }, { disabled: w.s.money < amt }));
    }
    // Missions
    if (!e.war || hollow) acts.append(button('📜 Ask for work', () => offer(), {}));
    // Trade route
    if (!hollow) {
      if (e.route !== null) acts.append(button(`💱 Route to ${w.star(e.route).name}`, () => {}, { disabled: true }));
      else acts.append(button('💱 Trade route', () => {
        const err = canRoute(w, e);
        if (err) { st.ui.toast(err, '💱'); audio.sfx('error'); return; }
        const target = inTheirSystem ? w.s.loc : w.starsOf(e.id).sort((a, b) => w.gal.dist(a, w.s.loc) - w.gal.dist(b, w.s.loc))[0];
        if (target === undefined) return;
        openRoute(w, e, target);
        audio.sfx('success');
        st.ui.toast(`Trade route open with ${w.star(target).name}. It pays you and fills that system's takeover bar.`, '💱', 'good');
        render();
      }));
    }
    // Alliance
    if (e.allied) acts.append(button('💔 End alliance', async () => { if (await ui.confirm('End the alliance?', 'They will take it badly.', 'End it', 'Keep')) { breakAlliance(w, e, true); render(); } }, { cls: 'ghost' }));
    else acts.append(button('🤝 Propose alliance', () => {
      const err = canAlly(w, e);
      if (err) { st.ui.toast(err, '🤝'); audio.sfx('error'); return; }
      formAlliance(w, e);
      audio.sfx('levelup');
      if (st.mode === 'system') st.sv.combat.spawnAlly(e.ship, e.id, 260 * strength(w, e), st.sv.combat.crafts.filter((c) => c.kind === 'ally').length);
      st.ui.toast(`${e.name} are now your allies! Their ships will escort you.`, '🤝', 'gold');
      st.sv.refreshHostility();
      render();
    }, { cls: relation(e) >= 70 && !e.war ? 'primary' : '' }));
    // War and peace
    if (e.war && !hollow) acts.append(button(`🕊️ Peace ${money(peacePrice(w, e))}`, () => {
      if (!makePeace(w, e)) { st.ui.toast('Not enough money for a peace offering.', '🕊️'); audio.sfx('error'); return; }
      st.sv.refreshHostility();
      st.ui.toast(`Peace with ${e.name}.`, '🕊️', 'good');
      render();
    }, { cls: 'gold' }));
    if (!e.war) acts.append(button('⚔️ Declare war', async () => {
      if (!(await ui.confirm('Declare war?', `${e.name} will attack your colonies and defend their space.`, 'War', 'Cancel'))) return;
      declareWar(w, e);
      w.counter('wars');
      audio.sfx('alarm');
      st.sv.refreshHostility();
      render();
    }, { cls: 'danger' }));
    // Planet-side tools
    if (inTheirSystem && w.has('beacon')) acts.append(button('🎆 Goodwill Beacon', () => {
      if (e.lastBeacon && w.s.t - e.lastBeacon < 60) { st.ui.toast(`The beacon recharges in ${Math.ceil(60 - (w.s.t - e.lastBeacon))}s.`, '🎆'); return; }
      e.lastBeacon = w.s.t;
      addMod(e, 'beacon', 'You dazzled us', hollow ? 6 : 12, { max: hollow ? 30 : 50, decay: 0.3 });
      audio.sfx('charm');
      const p = st.sv.combat.player;
      for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2; st.fx.spawn(p.x, p.y, Math.cos(a) * 260, Math.sin(a) * 260, 1, 4, ['#ffd166', '#ff7ab8', '#5cc8ff', '#4cd97b'][i % 4], 1, 1.5); }
      render();
    }));
    if (inTheirSystem && w.count('embassy') > 0 && !e.mods.some((m) => m.id === 'embassy')) acts.append(button(`🏛️ Build embassy (${w.count('embassy')})`, () => {
      if (!w.use('embassy')) return;
      addMod(e, 'embassy', 'Your embassy', hollow ? 10 : 35);
      audio.sfx('build');
      render();
    }));
    B.append(acts);
    if (!inTheirSystem) B.append(h('div', { class: 'sp-mini' }, 'You are hailing from afar. Fly to their worlds to trade spice.'));
    if (hollow) B.append(h('div', { class: 'sp-mini' }, 'The Hollow trust no one. Allying with them will turn every other empire against you.'));
  };
  const offer = () => {
    const m = offerFor(w, e);
    const box = h('div', { class: 'sp-offer' }, h('b', null, `📜 ${m.title}`), h('div', null, m.desc), h('div', { class: 'sp-mini' }, `Reward ${money(m.reward)}${m.deadline ? ' · ' + fmtTime(m.deadline) + ' to finish' : ''}`),
      h('div', { class: 'sp-actions' },
        button('Accept', () => { const err = acceptOffer(w, e); if (err) { st.ui.toast(err, '📜'); return; } st.ui.toast(`Mission accepted: ${m.title}`, '📜', 'good'); render(); }, { cls: 'primary' }),
        button('Decline', () => { declineOffer(w, e); render(); }, { cls: 'ghost' })));
    sh.body.prepend(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  render();
}

// ------------------------------------------------------------------ dialogs
export async function firstContactDialog(st: SpaceStage, e: Empire): Promise<void> {
  const w = st.w;
  audio.sfx('bell');
  const pc = portrait(e.creature);
  if (e.arch === 'hollow') {
    const r = await ui.modal({
      title: 'The Hollow',
      body: [pc, h('p', { style: 'margin-top:10px' }, '“We are the Hollow. Flesh is a fever that passes. Turn back, warm thing. The light at the centre is not for you.”')],
      buttons: [{ id: 'core', label: 'We seek the Core' }, { id: 'peace', label: 'We come in peace', primary: true }],
    });
    if (r === 'peace') addMod(e, 'greet', 'You were polite', 5, { max: 5 });
    st.ui.toast('Contact with the Hollow made. The road to the Core is open.', '🤖', 'gold');
    return;
  }
  const greeting = PERSONALITY[e.arch].greeting;
  const r = await ui.modal({
    title: `First contact: ${e.name}`,
    body: [pc, h('p', { style: 'margin-top:10px' }, `“${greeting}”`), h('div', { class: 'sp-mini' }, `${archName(e)} · ${w.countStars(e.id)} systems`)],
    buttons: [{ id: 'threat', label: 'Stay out of our way' }, { id: 'boast', label: 'Behold our might!' }, { id: 'peace', label: 'We come in peace', primary: true }],
  });
  contactReply(w, e, r === 'threat' ? 'threat' : r === 'boast' ? 'boast' : 'peace');
  st.game.hint('diplomacy', 'Hail empires from the 👽 button to gift, trade, ask for missions or form alliances.', '👽');
}

export async function tributeDialog(st: SpaceStage, e: Empire, amount: number): Promise<void> {
  const w = st.w;
  audio.sfx('alarm');
  const r = await ui.modal({
    title: `${e.name} demand tribute`,
    body: [portrait(e.creature), h('p', { style: 'margin-top:10px' }, `“Your ships wander our stars. Pay ${money(amount)}, or we will remember this insult.”`)],
    buttons: [{ id: 'no', label: 'Refuse', danger: true }, { id: 'pay', label: `Pay ${money(amount)}`, primary: true }],
  });
  payTribute(w, e, amount, r === 'pay' && w.s.money >= amount);
  if (r === 'pay' && w.s.money < amount) st.ui.toast('You could not afford it. They take it as a refusal.', '💸', 'bad');
  st.sv.refreshHostility();
}

export async function takeoverDialog(st: SpaceStage, e: Empire, star: number, price: number): Promise<void> {
  const w = st.w;
  if (w.ownerOf(star) !== e.id) return;
  const free = price <= 0;
  const r = await ui.modal({
    title: `Buy ${w.star(star).name}?`,
    body: h('p', null, free ? `A golden handshake! ${e.name} hand over the ${w.star(star).name} system for free.` : `${e.name} offer to sell you the ${w.star(star).name} system, cities and all, for ${money(price)}.`),
    buttons: [{ id: 'no', label: 'Not now' }, { id: 'yes', label: free ? 'Accept' : `Buy for ${money(price)}`, primary: true }],
  });
  if (r !== 'yes') return;
  if (!free && w.s.money < price) { st.ui.toast('Not enough money. The offer stands; come back richer.', '💸', 'bad'); return; }
  if (!free) w.addMoney(-price);
  annexSystem(w, star, 'bought');
  w.counter('diplomacy');
  audio.sfx('levelup');
  st.ui.toast(`The ${w.star(star).name} system is yours!`, '🏳️', 'gold');
  st.sv.refreshHostility();
}
