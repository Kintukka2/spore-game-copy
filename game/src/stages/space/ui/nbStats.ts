// Nav-Boy STATS: you and your ship. Status (hull, energy, superpower, effects), Systems (every ship system's
// level, like S.P.E.C.I.A.L.), Badges (like skills), Perks, and General (your record and reputation).
import { ABILITIES } from '../../../game/cards';
import { BADGES, RANKS, TOOLS } from '../data';
import { relation } from '../empires';
import { needsBlueprint } from '../salvage';
import { zooRate } from '../xenolab';
import { fmtTime, money } from './common';
import { drawSchematic } from './hangar';
import { picCanvas, picDesign, type NbCtx, type NbDetail, type NbRow, type NbTab } from './navboy';
import { ph } from './phosphor';

type Row = NbRow & { d: () => NbDetail };

/** A ship system's blueprint drawing, in phosphor. */
function schematic(host: HTMLElement, kind: string) {
  const cv = picCanvas(host, () => { /* drawn by the hangar's plan */ }, false, 'mono');
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

export function statsTab(ctx: NbCtx): NbTab {
  const st = ctx.st, w = st.w;
  const game = w.game;
  const page = (id: string, label: string, rows: () => Row[], empty?: string) => {
    let cache: Row[] = [];
    return { id, label, empty, rows: () => (cache = rows()), detail: (_r: NbRow, i: number) => cache[i]?.d() ?? {} };
  };
  const ship = (el: HTMLElement) => picDesign(el, st.shipDesign);
  const species = (el: HTMLElement) => { const d = game.state?.creature; if (d) picDesign(el, d); };

  // ---------------------------------------------------------------- Status
  const status = page('status', 'Status', () => {
    const rows: Row[] = [];
    const hp = Math.round(w.s.hp), en = Math.round(w.s.energy);
    rows.push({
      icon: '🛡️', name: 'Hull', val: `${hp}/${w.maxHp}`,
      d: () => ({
        pic: ship,
        bars: [['HULL', w.s.hp / w.maxHp, `${hp}/${w.maxHp}`], ['ENERGY', w.s.energy / w.maxEnergy, `${en}/${w.maxEnergy}`]],
        boxes: [['PLATING', `Lv ${w.groupLevel('hull', 1)}`], ['ARMOUR', String(w.shipStats.armor ?? 0)], ['PACKS', String(w.count('repair'))]],
        desc: `${st.shipDesign.name}. Hull repairs itself in your own systems; a Repair Pack restores half of it anywhere, even mid-battle.`,
        acts: [{ key: 'R', label: 'Repair Pack', ask: `Use 1 × 🩹 Repair Pack? It restores half your hull. You have ${w.count('repair')}.`,
          off: !w.count('repair') ? 'No Repair Packs aboard: buy them at a shipyard.' : w.s.hp >= w.maxHp - 0.5 ? 'Your hull is already in one piece.' : undefined,
          run: () => st.useRepair() }],
      }),
    });
    rows.push({
      icon: '⚡', name: 'Energy', val: `${en}/${w.maxEnergy}`,
      d: () => ({
        pic: (el) => picCanvas(el, (g, cw, ch, t) => {
          // A bank of cells, filling to your energy.
          const n = 8, f = w.s.energy / w.maxEnergy, cwid = Math.min(34, (cw - 40) / n - 8), x0 = (cw - n * (cwid + 8)) / 2, y0 = ch * 0.18, hh = ch * 0.62;
          for (let i = 0; i < n; i++) {
            const x = x0 + i * (cwid + 8);
            g.strokeStyle = ph(0.9);
            g.lineWidth = 2;
            g.strokeRect(x, y0, cwid, hh);
            g.fillStyle = ph(0.9);
            g.fillRect(x + cwid * 0.3, y0 - 6, cwid * 0.4, 6);
            const fill = Math.max(0, Math.min(1, f * n - i));
            if (fill > 0) {
              g.fillStyle = ph(0.55 + 0.25 * Math.sin(t * 3 + i));
              g.fillRect(x + 4, y0 + hh - 4 - (hh - 8) * fill, cwid - 8, (hh - 8) * fill);
            }
          }
        }, true),
        bars: [['ENERGY', w.s.energy / w.maxEnergy, `${en}/${w.maxEnergy}`]],
        boxes: [['CELLS', `Lv ${w.groupLevel('cell', 1)}`], ['DOCK', w.atDock() ? 'Charging' : 'No'], ['PACKS', String(w.count('recharge'))]],
        desc: 'Jumps, scans and weapons all draw energy. It only recharges at your homeworld, your colonies and allied systems; an Energy Pack tops it up anywhere.',
        acts: [{ key: 'P', label: 'Energy Pack', ask: `Use 1 × ⚡ Energy Pack? It restores 60% of your energy. You have ${w.count('recharge')}.`,
          off: !w.count('recharge') ? 'No Energy Packs aboard: buy them at a shipyard.' : w.s.energy >= w.maxEnergy - 0.5 ? 'Your energy cells are already full.' : undefined,
          run: () => st.useEnergyPack() }],
      }),
    });
    const pw = w.arch?.power;
    if (pw) {
      rows.push({
        icon: pw.icon, name: pw.name, val: w.s.powerCd > 0 ? fmtTime(w.s.powerCd) : 'Ready',
        d: () => ({
          big: pw.icon,
          boxes: [['STATUS', w.s.powerCd > 0 ? fmtTime(w.s.powerCd) : 'Ready'], ['RECHARGE', `${pw.cooldown}s`], ['FROM', w.arch!.name]],
          desc: pw.desc,
          acts: [{ key: 'U', label: 'Use power', off: w.s.powerCd > 0 ? `${pw.name} recharges in ${Math.ceil(w.s.powerCd)} s.` : undefined, run: () => { ctx.close(); st.usePower(); } }],
        }),
      });
    }
    const eff = effects();
    rows.push({ icon: '✳️', name: 'Effects', val: String(eff.length), d: () => ({ pic: ship, lines: eff.length ? eff.map(([k, v]) => [k, v, true] as [string, string, boolean]) : [['Nothing active', '—']], desc: 'Everything currently working for (or against) you.' }) });
    return rows;
  });
  const effects = (): [string, string][] => {
    const out: [string, string][] = [];
    if (w.inCombat) out.push(['⚔️ In combat', 'No repairs, no recharge']);
    if (w.atDock()) out.push(['⚓ Docked', 'Energy recharging']);
    for (const e of w.empires.filter((x) => x.allied && !x.dead)) out.push([`🤝 Allied with ${e.name}`, 'Escort, 10% off']);
    const routes = w.empires.filter((x) => x.route !== null && !x.dead);
    if (routes.length) out.push(['💱 Trade routes', `${routes.length} running`]);
    const zr = zooRate(w);
    if (zr > 0) out.push(['🏛️ Menagerie', `${money(zr)}/min`]);
    const held = w.countStars('player');
    if (held) out.push(['🏠 Systems held', String(held)]);
    if (w.perks.size) out.push(['✨ Card perks', String(w.perks.size)]);
    const wars = w.empires.filter((x) => x.war && !x.dead && x.arch !== 'hollow');
    if (wars.length) out.push(['🔥 At war', wars.map((x) => x.name).join(', ')]);
    return out;
  };

  // ---------------------------------------------------------------- Systems
  const systems = page('systems', 'Systems', () => {
    const rows: Row[] = [];
    const sys = (icon: string, name: string, group: string, base: number, kind: string, max: number, now: string, what: string) => {
      const lv = w.groupLevel(group, base);
      const next = TOOLS.find((t) => t.group === group && t.level === lv + 1);
      rows.push({
        icon, name, val: String(lv), dim: lv === 0,
        d: () => ({
          pic: (el) => schematic(el, kind),
          boxes: [['LVL', `${lv}/${max}`], ['NOW', now], ['NEXT', next ? money(w.toolPrice(next, 'own')) : 'MAX']],
          lines: next ? [['Next upgrade', next.name], ['Rank needed', RANKS[Math.min(next.rank, RANKS.length - 1)].name, w.rank() >= next.rank], ...(needsBlueprint(next) ? [['Blueprint', 'Needed', false] as [string, string, boolean]] : [])] : [['Fully upgraded', '✓', true]],
          desc: `${what} ${next ? `${next.name}: ${next.desc}` : ''}`,
        }),
      });
    };
    sys('🚀', 'Star Drive', 'drive', 1, 'drive', 5, `${w.driveRange} ly`, 'How far one jump takes you.');
    sys('🔺', 'Laser', 'laser', 1, 'laser', 3, `${Math.round(st.sv.combat.laserDps())}/s`, 'Your main gun fires on whatever you target.');
    sys('🎇', 'Missiles', 'missile', 1, 'missile', 3, `${Math.round(st.sv.combat.missileDmg())} dmg`, 'Missiles fire on their own at your target.');
    sys('💫', 'Pulse Ring', 'pulse', 0, 'pulse', 2, w.groupLevel('pulse', 0) ? 'Fitted' : 'None', 'A shockwave that hits everything around you.');
    sys('📦', 'Cargo Bay', 'cargo', 1, 'cargo', 4, `${w.cargoCap} slots`, 'Room for spice and specimens.');
    sys('🔋', 'Energy Cell', 'cell', 1, 'cell', 4, `${w.maxEnergy} max`, 'How much energy you can store.');
    sys('🛡️', 'Hull Plating', 'hull', 1, 'hull', 4, `${w.maxHp} max`, 'How much damage you can take.');
    for (const [id, kind] of [['shield', 'shield'], ['bomb', 'bomb'], ['wormkey', 'wormkey']] as const) {
      const t = TOOLS.find((x) => x.id === id);
      if (!t) continue;
      const has = w.has(id);
      rows.push({ icon: t.icon, name: t.name, val: has ? '1' : '0', dim: !has, d: () => ({ pic: (el) => schematic(el, kind), boxes: [['FITTED', has ? 'Yes' : 'No'], ['PRICE', money(w.toolPrice(t, 'own'))], ['RANK', RANKS[Math.min(t.rank, RANKS.length - 1)].name]], desc: t.desc }) });
    }
    rows.push({ name: 'DESIGN', head: true, d: () => ({}) });
    const design = (name: string, key: 'power' | 'armor' | 'move' | 'energy', what: string) => rows.push({
      icon: '✏️', name, val: String(w.shipStats[key] ?? 0),
      d: () => ({
        pic: ship,
        boxes: [['POWER', String(w.shipStats.power ?? 0)], ['ARMOUR', String(w.shipStats.armor ?? 0)], ['SPEED', String(w.shipStats.move ?? 0)]],
        desc: `${what} It comes from the parts on your ship's design: ${st.shipDesign.name}.`,
        acts: [{ key: 'G', label: 'Redesign', off: w.s.loc !== w.gal.homeStar ? 'Return to your homeworld to redesign your ship.' : undefined, run: () => { ctx.close(); st.redesignShip(); } }],
      }),
    });
    design('Power', 'power', 'Every point adds 4% to your weapon damage.');
    design('Armour', 'armor', 'Every point adds 3% to your hull.');
    design('Speed', 'move', 'Every point makes you 4% faster.');
    design('Energy', 'energy', 'Every point adds 3% to your energy cells.');
    return rows;
  });

  // ---------------------------------------------------------------- Badges
  const badges = page('badges', 'Badges', () => {
    const rk = w.rank(), pts = w.badgePoints(), next = w.nextRankPts();
    const rows: Row[] = [{
      icon: RANKS[rk].icon, name: `Rank: ${RANKS[rk].name}`, val: String(pts),
      d: () => ({
        big: RANKS[rk].icon,
        boxes: [['RANK', RANKS[rk].name], ['POINTS', String(pts)], ['NEXT', next !== null ? String(next) : 'MAX']],
        lines: RANKS.slice(1).map((r) => [`${r.icon} ${r.name}`, `${r.pts} pts`, pts >= r.pts && !!w.s.flags.tutDone] as [string, string, boolean]),
        desc: !w.s.flags.tutDone ? 'Finish your homeworld missions to earn the Captain\'s badge.' : 'Every badge level is a badge point. Ranks unlock new tools at the shipyard.',
      }),
    }];
    for (const b of BADGES) {
      const lv = w.badgeLevel(b.id), v = w.s.counters[b.counter] ?? 0, nextT = b.levels[lv];
      const prev = lv ? b.levels[lv - 1] : 0;
      rows.push({
        icon: b.icon, name: b.name, val: String(lv),
        d: () => ({
          big: b.icon,
          boxes: [['LVL', `${lv}/${b.levels.length}`], ['COUNT', String(v)], ['NEXT', nextT !== undefined ? String(nextT) : 'MAX']],
          bars: nextT !== undefined ? [['PROGRESS', (v - prev) / (nextT - prev), `${v}/${nextT}`]] : [['PROGRESS', 1, 'Complete']],
          desc: `${b.desc}. Levels at ${b.levels.join(', ')}.`,
        }),
      });
    }
    return rows;
  });

  // ---------------------------------------------------------------- Perks
  const perks = page('perks', 'Perks', () => {
    const rows: Row[] = [];
    const a = w.arch;
    if (a) rows.push({ icon: a.icon, name: a.name, val: a.philosophy, d: () => ({ big: a.icon, boxes: [['PATH', a.philosophy], ['POWER', a.power?.name ?? 'None']], desc: a.blurb }) });
    if (a?.power) rows.push({ icon: a.power.icon, name: a.power.name, d: () => ({ big: a.power!.icon, boxes: [['RECHARGE', `${a.power!.cooldown}s`]], desc: a.power!.desc }) });
    for (const id of w.perks) {
      const ab = ABILITIES[id];
      if (ab) rows.push({ icon: ab.icon, name: ab.name, d: () => ({ big: ab.icon, desc: ab.desc }) });
    }
    return rows;
  }, 'No perks yet. Cards earned in earlier stages grant them.');

  // ---------------------------------------------------------------- General
  const general = page('general', 'General', () => {
    const met = w.empires.filter((e) => e.met && !e.dead && e.arch !== 'hollow');
    const avg = met.length ? met.reduce((s, e) => s + relation(e), 0) / met.length : 0;
    const rep = !met.length ? 'Unknown' : avg >= 40 ? 'Galactic Hero' : avg >= 15 ? 'Respected' : avg > -15 ? 'Neutral' : avg > -40 ? 'Distrusted' : 'Notorious';
    const c = w.s.counters;
    const t = Math.floor(w.s.t);
    const stat = (icon: string, name: string, val: string, what: string): Row => ({ icon, name, val, d: () => ({ pic: species, boxes: [['VALUE', val]], desc: what }) });
    return [
      {
        icon: '🏅', name: 'Reputation', val: rep,
        d: () => ({
          pic: species,
          title: `${game.state?.speciesName ?? 'Your species'}: ${rep}`,
          boxes: [['MET', String(met.length)], ['ALLIES', String(met.filter((e) => e.allied).length)], ['WARS', String(met.filter((e) => e.war).length)]],
          desc: 'How the galaxy sees you, from the average feeling of every empire you have met. Gifts, missions and trade raise it; wars and breaking the galactic law sink it.',
        }),
      },
      stat('🔭', 'Systems visited', String(c.visited ?? 0), 'Every star system you have flown into.'),
      stat('🔎', 'Worlds scanned', String(c.scans ?? 0), 'Planets swept with your scanner.'),
      stat('🏠', 'Colonies founded', String(c.colonies ?? 0), `You hold ${w.countStars('player')} systems.`),
      stat('💱', 'Spice sold', String(c.spiceSold ?? 0), `Your trade has earned ${money(w.s.tradeEarned ?? 0)}.`),
      stat('📈', 'Exchange trades', String(c.marketTrades ?? 0), `Banked profit on the exchange: ${money(w.s.market?.realized ?? 0)}.`),
      stat('🎯', 'Ships destroyed', String(c.kills ?? 0), 'Hostile ships your guns have scrapped.'),
      stat('📜', 'Missions done', String(c.missions ?? 0), 'Jobs completed for empires and the exchange.'),
      stat('📖', 'Species catalogued', String(c.catalogued ?? 0), 'New species added to the Xenopedia.'),
      stat('🛰️', 'Wrecks salvaged', String(c.wrecks ?? 0), 'Derelicts you have stripped for parts.'),
      stat('⏱️', 'Time in space', `${Math.floor(t / 3600)}h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`, 'Game time since you launched.'),
      stat('💰', 'Credits', money(w.s.money), 'What you have to spend.'),
    ];
  });

  return {
    id: 'stats', label: 'STATS',
    head: () => {
      const rk = w.rank(), next = w.nextRankPts();
      return [['RANK', RANKS[rk].name], ['HULL', `${Math.round(w.s.hp)}/${w.maxHp}`], ['EN', `${Math.round(w.s.energy)}/${w.maxEnergy}`], ['BP', `${w.badgePoints()}/${next ?? 'MAX'}`]];
    },
    pages: [status, systems, badges, perks, general],
  };
}

