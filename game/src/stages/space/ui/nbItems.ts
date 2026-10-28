// Nav-Boy ITEMS: the cargo hold. Spice, specimens, aid (consumables), parts (components), blueprints, and the
// spice contracts you hold on the exchange. Uses, crates, jettisons and sales ask first, on the screen itself.
import { h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { TAU } from '../../../engine/math';
import { SPICE, SPICE_COLORS, TOOL_MAP, TOOLS, type SpiceColor } from '../data';
import { COMP_IDS, COMPONENTS, craftState, hasBlueprint, needsTier, owned, RECIPES, type CompId } from '../salvage';
import { inXenopedia } from '../xenolab';
import { change, CODE, contractPrice, marketFactor, quote, trade } from '../market';
import { toolAura } from './aura';
import { dietIcon, money, paintSpecimen, rarityText } from './common';
import { openCrate } from './crateOpen';
import { picCanvas, type NbAct, type NbCtx, type NbDetail, type NbPage, type NbRow, type NbTab } from './navboy';
import { ph } from './phosphor';

const signed = (n: number) => (n >= 0 ? '+' : '−') + money(Math.abs(n));

/** A glowing orb in the spice's own colour, with its exchange code. */
export function spiceOrb(host: HTMLElement, c: SpiceColor) {
  const v = parseInt(SPICE[c].hex.slice(1), 16);
  const col = (a: number) => `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
  picCanvas(host, (g, w, hh, t) => {
    const x = w / 2, y = hh / 2, r = Math.min(w, hh) * 0.3 * (1 + Math.sin(t * 2) * 0.02);
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,.95)');
    grad.addColorStop(0.35, col(1));
    grad.addColorStop(1, col(0.35));
    g.shadowColor = col(0.8);
    g.shadowBlur = 24;
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = col(0.6);
    g.setLineDash([3, 5]);
    g.beginPath(); g.arc(x, y, r * 1.35, t * 0.4, t * 0.4 + TAU); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#000';
    g.font = `700 ${Math.round(r * 0.5)}px "Share Tech Mono", monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(CODE[c], x, y + 1);
  }, true);
}

export function itemsTab(ctx: NbCtx): NbTab {
  const st = ctx.st, w = st.w;
  const page = (id: string, label: string, rows: () => (NbRow & { d: () => NbDetail })[], empty: string, badge?: () => number): NbPage => {
    let cache: (NbRow & { d: () => NbDetail })[] = [];
    return {
      id, label, empty, badge,
      rows: () => (cache = rows()),
      detail: (_r, i) => cache[i]?.d() ?? {},
    };
  };

  const spice = page('spice', 'Spice', () => SPICE_COLORS.filter((c) => w.s.spice[c] > 0).map((c) => ({
    icon: '●', tint: SPICE[c].hex, name: SPICE[c].name, val: `×${w.s.spice[c]}`,
    d: (): NbDetail => {
      const mk = marketFactor(w, c) - 1;
      return {
        pic: (el) => spiceOrb(el, c),
        boxes: [['VAL', `${money(SPICE[c].base)}+`], ['HOLD', String(w.s.spice[c])], ['EXCH', `${mk >= 0 ? '+' : '−'}${Math.abs(Math.round(mk * 100))}%`]],
        desc: `${SPICE[c].name} spice. Sell it at empires that do not make it: prices rise where it is in demand, every price follows the Spice Exchange, and every sale fills that system's takeover bar.`,
        acts: [
          { key: 'X', label: 'Jettison 1', run: () => { w.s.spice[c]--; audio.sfx('remove'); } },
          { key: 'Z', label: 'Jettison all', ask: `Jettison all ${w.s.spice[c]} ${SPICE[c].name}? It is lost for good.`, run: () => { w.s.spice[c] = 0; audio.sfx('remove'); } },
        ],
      };
    },
  })), 'No spice aboard. Collect it from your colonies.', () => SPICE_COLORS.reduce((a, c) => a + w.s.spice[c], 0));

  const specimens = page('specimens', 'Specimens', () => w.s.specimens.map((sp, i) => ({
    icon: sp.hybrid ? '🧬' : sp.rare ? '✨' : dietIcon(sp.diet), name: sp.name,
    d: (): NbDetail => ({
      pic: (el) => { const cv = h('canvas', { class: 'nb-cv alive' }) as HTMLCanvasElement; el.append(cv); requestAnimationFrame(() => paintSpecimen(cv, w, sp)); },
      boxes: [['KIND', sp.rare ? 'Rare' : sp.hybrid ? 'Hybrid' : sp.diet], ['XENO', inXenopedia(w, sp) ? 'Known' : 'New'], ['HOLD', '1']],
      desc: sp.hybrid ? `Spliced from ${sp.parents?.join(' × ') ?? 'two species'}. Fits any animal slot and draws triple crowds at the Menagerie.`
        : sp.rare ? 'One of a kind. Triple crowds at the Menagerie, and curio collectors pay a fortune.'
        : `A living ${sp.diet === 'plant' ? 'plant sample' : sp.diet}. Exhibit or splice it at your homeworld Xeno-Lab, sell it to an alien zoo that wants its kind, or release it on a terraformed world.`,
      acts: [
        ...(w.s.loc === w.gal.homeStar ? [{ key: 'L', label: 'Xeno-Lab', run: () => { ctx.close(); st.openLab(); } }] : []),
        { key: 'X', label: 'Set free', ask: `Set the ${sp.name} free? It is gone for good.`, run: () => { w.s.specimens.splice(i, 1); audio.sfx('remove'); } },
      ],
    }),
  })), 'No specimens. Beam creatures up from living worlds.', () => w.s.specimens.length);

  const aid = page('aid', 'Aid', () => TOOLS.filter((t) => t.kind === 'consumable' && w.count(t.id) > 0).map((t) => ({
    icon: t.icon, name: t.name, val: `×${w.count(t.id)}`,
    d: (): NbDetail => {
      const acts: NbAct[] = [];
      const use = `Use 1 × ${t.icon} ${t.name}? ${t.desc}`;
      if (t.id === 'repair') acts.push({ key: 'E', label: 'Use', ask: use, off: w.s.hp >= w.maxHp - 0.5 ? 'Your hull is already in one piece.' : undefined, run: () => st.useRepair() });
      if (t.id === 'recharge') acts.push({ key: 'E', label: 'Use', ask: use, off: w.s.energy >= w.maxEnergy - 0.5 ? 'Your energy cells are already full.' : undefined, run: () => st.useEnergyPack() });
      if (t.id === 'crate') acts.push({ key: 'E', label: 'Open', ask: `Open a ${t.icon} ${t.name}? Whatever is inside is yours.`, run: () => openCrate(st, () => ctx.refresh()) });
      return {
        boxes: [['QTY', `${w.count(t.id)}/${t.max ?? 99}`], ['PRICE', t.special ? '—' : money(t.price)], ['USE', acts.length ? 'Here' : 'Planet']],
        desc: t.desc + (acts.length ? '' : ' Use it from a planet\'s panel.'),
        acts,
      };
    },
  })), 'No consumables. Buy them at a shipyard.', () => TOOLS.filter((x) => x.kind === 'consumable' && w.count(x.id) > 0).length);

  const parts = page('parts', 'Parts', () => COMP_IDS.filter((c) => (w.s.comps?.[c] ?? 0) > 0).map((c: CompId) => ({
    icon: COMPONENTS[c].icon, name: COMPONENTS[c].name, val: `×${w.s.comps![c]}`,
    d: (): NbDetail => {
      // Only the blueprints you hold say what a component builds.
      const uses = Object.entries(RECIPES).filter(([id, r]) => r[c] && hasBlueprint(w, id) && !owned(w, TOOL_MAP[id])).map(([id]) => TOOL_MAP[id].name);
      return {
        boxes: [['RARITY', COMPONENTS[c].rarity], ['QTY', String(w.s.comps![c])], ['USES', String(uses.length)]],
        desc: rarityText(`${COMPONENTS[c].desc} ${uses.length ? `Needed for: ${uses.slice(0, 5).join(', ')}${uses.length > 5 ? '…' : ''}.` : 'None of your blueprints call for it. Find more blueprints to learn what it builds.'}`),
      };
    },
  })), 'No components. Salvage wrecks, scan ruins, or buy them from traders.', () => COMP_IDS.reduce((a, c) => a + (w.s.comps?.[c] ?? 0), 0));

  const plans = page('plans', 'Blueprints', () => (w.s.blueprints ?? []).map((id) => TOOL_MAP[id]).filter((t) => !!t && (t.kind === 'consumable' || !owned(w, t))).map((t) => {
    const cs = craftState(w, t);
    return {
      icon: '📐', name: t.name, tag: cs.missing.length || needsTier(w, t) ? undefined : 'READY',
      d: (): NbDetail => {
        const rec = Object.entries(RECIPES[t.id] ?? {}) as [CompId, number][];
        const got = rec.filter(([c, n]) => (w.s.comps?.[c] ?? 0) >= n).length;
        const prev = needsTier(w, t);
        return {
          big: t.icon,
          aura: toolAura(t),
          boxes: [['PARTS', `${got}/${rec.length}`], ['BUILD', money(t.price)], ['STATUS', prev ? 'Locked' : cs.missing.length ? 'Short' : 'Ready']],
          lines: rec.map(([c, n]) => { const have = w.s.comps?.[c] ?? 0; return [`${COMPONENTS[c].icon} ${COMPONENTS[c].name}`, `${Math.min(n, have)} / ${n}${have >= n ? ' ✓' : ''}`, have >= n]; }),
          desc: `${t.desc} ${prev ? `Upgrades go in order: fit ${prev.name} first, then build this at a shipyard.` : cs.missing.length ? 'Collect the components, then build it at a shipyard.' : 'All components ready! Build it at your homeworld, a colony or an ally\'s shipyard.'}`,
        };
      },
    };
  }), 'No blueprints. Find them in wrecks, ruins and relics, or buy one from a trader.', () => (w.s.blueprints ?? []).filter((id) => TOOL_MAP[id] && (TOOL_MAP[id].kind === 'consumable' || !owned(w, TOOL_MAP[id]))).length);

  const contracts = page('contracts', 'Contracts', () => {
    const m = w.s.market;
    if (!m) return [];
    return SPICE_COLORS.filter((c) => m.hold[c].n > 0).map((c) => ({
      icon: '📈', name: `${SPICE[c].name} contracts`, val: `×${m.hold[c].n}`,
      d: (): NbDetail => {
        const hd = m.hold[c], val = contractPrice(w, c) * hd.n, pl = val - hd.cost;
        const q = quote(w, c, hd.n, 'sell');
        const sale = q.net - hd.cost;
        return {
          pic: (el) => picCanvas(el, (g, cw, ch) => {
            const data = m.hist[c].slice(-90);
            const lo = Math.min(...data), hi = Math.max(...data), sp = hi - lo || 1;
            g.strokeStyle = ph(0.2);
            for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (ch * i) / 4); g.lineTo(cw, (ch * i) / 4); g.stroke(); }
            g.beginPath();
            data.forEach((v, i) => { const x = (i / (data.length - 1)) * cw, y = 6 + (1 - (v - lo) / sp) * (ch - 12); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
            g.strokeStyle = ph(1);
            g.lineWidth = 2;
            g.shadowColor = ph(0.8);
            g.shadowBlur = 8;
            g.stroke();
          }),
          boxes: [['VAL', money(val)], ['P/L', signed(pl)], ['AVG', money(hd.cost / hd.n)]],
          lines: [['Price now', `${money(contractPrice(w, c))} a contract`], ['Last 5 min', `${change(w, c) >= 0 ? '▲' : '▼'} ${Math.abs(change(w, c) * 100).toFixed(1)}%`], ['Sell all now', `${money(q.net)} after the ${money(q.fee)} fee`]],
          desc: 'Paper spice from the Galactic Spice Exchange: it takes no hold space. Sell it here or on the exchange floor.',
          acts: [
            { key: 'X', label: 'Sell all', ask: `Sell all ${hd.n} ${SPICE[c].name} contracts? About ${money(q.avg)} each: you receive ${money(q.net)} after the ${money(q.fee)} broker fee, ${sale >= 0 ? 'a profit of' : 'a loss of'} ${money(Math.abs(sale))}.`,
              run: () => {
                const err = trade(w, c, hd.n, 'sell');
                if (err) { ctx.note(err, true); audio.sfx('error'); return; }
                audio.sfx('coin');
                ctx.note(`Sold for ${money(q.net)}: ${sale >= 0 ? 'profit' : 'loss'} ${signed(sale)}.`, sale < 0);
              } },
            { key: 'O', label: 'Exchange', run: () => { ctx.close(); st.openExchange(c); } },
          ],
        };
      },
    }));
  }, 'No spice contracts. Buy them on the 📈 Spice Exchange: paper spice that never takes hold space.');

  return {
    id: 'items', label: 'ITEMS',
    head: () => [['HOLD', `${w.cargoUsed}/${w.cargoCap}`], ['HULL', `${Math.round(w.s.hp)}/${w.maxHp}`], ['ARM', String(w.shipStats.armor ?? 0)], ['§', money(w.s.money).slice(1)]],
    pages: [spice, specimens, aid, parts, plans, contracts],
  };
}
