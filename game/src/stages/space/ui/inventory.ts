// The cargo hold as a Fallout-style inventory: category tabs across the top, the item list on the left, the
// highlighted item's picture and details on the right, and key-labelled actions at the bottom.
import { h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { SPICE, SPICE_COLORS, TOOL_MAP, TOOLS, type SpiceColor } from '../data';
import { COMP_IDS, COMPONENTS, craftState, owned, RECIPES, type CompId } from '../salvage';
import { inXenopedia } from '../xenolab';
import type { SpaceStage } from '../stage';
import { dietIcon, money, paintSpecimen } from './common';
import { openCrate } from './crateOpen';

type Tab = 'spice' | 'specimens' | 'aid' | 'parts' | 'plans';
const TABS: { id: Tab; label: string }[] = [
  { id: 'spice', label: 'Spice' }, { id: 'specimens', label: 'Specimens' }, { id: 'aid', label: 'Aid' },
  { id: 'parts', label: 'Parts' }, { id: 'plans', label: 'Blueprints' },
];

interface Action { key: string; label: string; run: () => void }
interface Item {
  icon: string;
  name: string;
  qty?: number;
  /** Detail lines: label, value, and whether that requirement is met (shown with a tick). */
  stats: [string, string, boolean?][];
  /** A tag on the list row, e.g. READY. */
  tag?: string;
  desc: string;
  /** Draw a picture instead of the big icon. */
  paint?: (c: HTMLCanvasElement) => void;
  actions: Action[];
}

export function openInventory(st: SpaceStage, start: Tab = 'spice') {
  const w = st.w;
  let tab: Tab = start, sel = 0, closing = false;
  const tabsEl = h('div', { class: 'inv-tabs' });
  const listEl = h('div', { class: 'inv-list' });
  const pic = h('div', { class: 'inv-pic' });
  const nameEl = h('div', { class: 'inv-name' });
  const statsEl = h('div', { class: 'inv-stats' });
  const descEl = h('div', { class: 'inv-desc' });
  const keys = h('div', { class: 'bt-keys' });
  const capsEl = h('span');
  const box = h('div', { class: 'ft-box inv-box' },
    h('div', { class: 'ft-tab' }, h('b', null, 'Cargo hold'), h('span', null, st.shipDesign.name)),
    h('div', { class: 'ft-info' }, capsEl),
    tabsEl,
    h('div', { class: 'inv-main' }, listEl, h('div', { class: 'inv-detail' }, pic, nameEl, statsEl, descEl)),
    keys);
  const root = h('div', { class: 'ft ft-amber inv' }, h('div', { class: 'ft-scan' }), box);
  document.body.append(root);

  const items = (): Item[] => {
    if (tab === 'spice') {
      return SPICE_COLORS.filter((c) => w.s.spice[c] > 0).map((c: SpiceColor) => ({
        icon: '●', name: SPICE[c].name, qty: w.s.spice[c],
        stats: [['Value', `from ${money(SPICE[c].base)} each`], ['Hold', `${w.s.spice[c]} slot${w.s.spice[c] === 1 ? '' : 's'}`]],
        desc: `${SPICE[c].name} spice. Sell it at empires that do not make it: prices rise where it is in demand, and every sale fills that system's takeover bar.`,
        paint: (cv) => { const g = ctx(cv); g.fillStyle = SPICE[c].hex; g.shadowColor = SPICE[c].hex; g.shadowBlur = 24; g.beginPath(); g.arc(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.28, 0, Math.PI * 2); g.fill(); },
        actions: [
          { key: 'X', label: 'Jettison 1', run: () => { w.s.spice[c]--; audio.sfx('remove'); } },
          { key: 'Z', label: 'Jettison all', run: () => { w.s.spice[c] = 0; audio.sfx('remove'); } },
        ],
      }));
    }
    if (tab === 'specimens') {
      return w.s.specimens.map((sp, i) => ({
        icon: sp.hybrid ? '🧬' : sp.rare ? '✨' : dietIcon(sp.diet), name: sp.name,
        stats: [['Kind', sp.rare ? 'Rare' : sp.hybrid ? 'Hybrid' : sp.diet], ['Xenopedia', inXenopedia(w, sp) ? 'Catalogued' : 'New'], ['Hold', '1 slot']] as [string, string][],
        desc: sp.hybrid ? `Spliced from ${sp.parents?.join(' × ') ?? 'two species'}. Fits any animal slot and draws triple crowds at the Menagerie.`
          : sp.rare ? 'One of a kind. Triple crowds at the Menagerie, and curio collectors pay a fortune.'
          : `A living ${sp.diet === 'plant' ? 'plant sample' : sp.diet}. Exhibit or splice it at your homeworld Xeno-Lab, sell it to an alien zoo that wants its kind, or release it on a terraformed world.`,
        paint: (cv) => paintSpecimen(cv, w, sp),
        actions: [
          ...(w.s.loc === w.gal.homeStar ? [{ key: 'L', label: 'Xeno-Lab', run: () => { close(); st.openLab(); } }] : []),
          { key: 'X', label: 'Set free', run: () => { w.s.specimens.splice(i, 1); audio.sfx('remove'); } },
        ],
      }));
    }
    if (tab === 'aid') {
      return TOOLS.filter((t) => t.kind === 'consumable' && w.count(t.id) > 0).map((t) => {
        const actions: Action[] = [];
        if (t.id === 'repair') actions.push({ key: 'E', label: 'Use', run: () => st.useRepair() });
        if (t.id === 'recharge') actions.push({ key: 'E', label: 'Use', run: () => st.useEnergyPack() });
        if (t.id === 'crate') actions.push({ key: 'E', label: 'Open', run: () => openCrate(st, () => render()) });
        return {
          icon: t.icon, name: t.name, qty: w.count(t.id),
          stats: [['Carried', `${w.count(t.id)} / ${t.max ?? 99}`], ['Shop price', t.special ? 'Not for sale' : money(t.price)]] as [string, string][],
          desc: t.desc + (actions.length ? '' : ' Use it from a planet\'s panel.'),
          actions,
        };
      });
    }
    if (tab === 'parts') {
      return COMP_IDS.filter((c) => (w.s.comps?.[c] ?? 0) > 0).map((c: CompId) => {
        const uses = Object.entries(RECIPES).filter(([, r]) => r[c]).map(([id]) => TOOL_MAP[id].name);
        return {
          icon: COMPONENTS[c].icon, name: COMPONENTS[c].name, qty: w.s.comps![c],
          stats: [['Rarity', COMPONENTS[c].rarity], ['Used in', `${uses.length} parts`]] as [string, string][],
          desc: `${COMPONENTS[c].desc} Needed for: ${uses.slice(0, 5).join(', ')}${uses.length > 5 ? '…' : ''}.`,
          actions: [],
        };
      });
    }
    return (w.s.blueprints ?? []).map((id) => TOOL_MAP[id]).filter((t) => !!t && (t.kind === 'consumable' || !owned(w, t))).map((t) => {
      const cs = craftState(w, t);
      const rec = Object.entries(RECIPES[t.id] ?? {}) as [CompId, number][];
      return {
        icon: '📐', name: t.name, tag: cs.missing.length ? undefined : 'READY',
        stats: rec.map(([c, n]) => { const have = w.s.comps?.[c] ?? 0; return [`${COMPONENTS[c].icon} ${COMPONENTS[c].name}`, `${Math.min(n, have)} / ${n}${have >= n ? ' ✓' : ''}`, have >= n] as [string, string, boolean]; }),
        desc: `${t.desc} ${cs.missing.length ? 'Collect the components, then build it at a shop.' : 'All components ready! Build it at your homeworld, a colony or an ally\'s shop.'}`,
        actions: [],
      };
    });
  };

  const ctx = (cv: HTMLCanvasElement) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = cv.clientWidth || 160, ch = cv.clientHeight || 110;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const g = cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    return g;
  };

  let rows: HTMLElement[] = [];
  let list: Item[] = [];
  const detail = () => {
    rows.forEach((r, i) => r.classList.toggle('on', i === sel));
    const it = list[sel];
    pic.innerHTML = '';
    if (!it) { nameEl.textContent = ''; statsEl.innerHTML = ''; descEl.textContent = ''; return; }
    if (it.paint) {
      const cv = h('canvas', { class: 'inv-cv' }) as HTMLCanvasElement;
      pic.append(cv);
      requestAnimationFrame(() => { try { it.paint!(cv); } catch { /* ignore */ } });
    } else pic.append(h('span', { class: 'inv-big' }, it.icon));
    nameEl.textContent = it.name + (it.qty !== undefined && it.qty > 1 ? ` (${it.qty})` : '');
    statsEl.innerHTML = '';
    for (const [k, v, ok] of it.stats) statsEl.append(h('span', { class: ok ? 'ok' : '' }, k), h('b', { class: ok ? 'ok' : '' }, v));
    descEl.textContent = it.desc;
    renderKeys();
  };
  const renderKeys = () => {
    keys.innerHTML = '';
    const key = (k: string, label: string, f: () => void, cls = '') => { const b = h('div', { class: 'ft-opt bt-key ' + cls, role: 'button' }, h('span', { class: 'ft-tag' }, `[${k}] `), label); b.addEventListener('click', f); keys.append(b); };
    for (const a of list[sel]?.actions ?? []) key(a.key, a.label, () => act(a));
    key('Tab', 'Close', close);
  };
  const act = (a: Action) => { a.run(); render(); };
  const render = () => {
    if (closing) return;
    capsEl.textContent = `${money(w.s.money)} · Hold ${w.cargoUsed}/${w.cargoCap}`;
    tabsEl.innerHTML = '';
    for (const t of TABS) {
      const n = t.id === 'spice' ? SPICE_COLORS.reduce((a, c) => a + w.s.spice[c], 0) : t.id === 'specimens' ? w.s.specimens.length
        : t.id === 'aid' ? TOOLS.filter((x) => x.kind === 'consumable' && w.count(x.id) > 0).length
        : t.id === 'parts' ? COMP_IDS.reduce((a, c) => a + (w.s.comps?.[c] ?? 0), 0)
        : (w.s.blueprints ?? []).filter((id) => TOOL_MAP[id] && (TOOL_MAP[id].kind === 'consumable' || !owned(w, TOOL_MAP[id]))).length;
      const el = h('div', { class: 'inv-tab' + (t.id === tab ? ' on' : ''), role: 'tab' }, t.label, n ? h('i', null, String(n)) : null);
      el.addEventListener('click', () => { tab = t.id; sel = 0; audio.sfx('click', { pitch: 1.2 }); render(); });
      tabsEl.append(el);
    }
    list = items();
    sel = Math.min(sel, Math.max(0, list.length - 1));
    listEl.innerHTML = '';
    rows = list.map((it, i) => {
      const r = h('div', { class: 'bt-row inv-row' }, h('span', { class: 'bt-mark' }), h('span', { class: 'bt-ic' }, it.icon), h('span', { class: 'bt-name' }, it.name), h('span', { class: 'bt-val' }, it.tag ? h('i', { class: 'inv-ready' }, it.tag) : it.qty !== undefined ? `×${it.qty}` : ''));
      r.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { sel = i; detail(); } });
      r.addEventListener('click', () => { sel = i; detail(); });
      listEl.append(r);
      return r;
    });
    if (!list.length) listEl.append(h('div', { class: 'bt-empty' }, tab === 'spice' ? 'No spice aboard. Collect it from your colonies.' : tab === 'specimens' ? 'No specimens. Beam creatures up from living worlds.' : tab === 'aid' ? 'No consumables.' : tab === 'parts' ? 'No components. Salvage wrecks, scan ruins, or buy them from traders.' : 'No blueprints. Find them in wrecks, ruins and relics, or buy one from a trader.'));
    // The spice dot needs its colour on the row too.
    if (tab === 'spice') rows.forEach((r, i) => { const c = SPICE_COLORS.filter((x) => w.s.spice[x] > 0)[i]; (r.children[1] as HTMLElement).style.color = SPICE[c].hex; });
    detail();
  };
  const close = () => {
    if (closing) return;
    closing = true;
    window.removeEventListener('keydown', onKey, true);
    root.classList.add('out');
    setTimeout(() => root.remove(), 200);
    st.hud.refresh(true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.sp-crate, .sp-sheet-wrap')) return;
    e.stopPropagation();
    const k = e.key.toLowerCase();
    const ti = TABS.findIndex((t) => t.id === tab);
    if (k === 'arrowdown' || k === 's') { sel = Math.min(list.length - 1, sel + 1); detail(); rows[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (k === 'arrowup' || k === 'w') { sel = Math.max(0, sel - 1); detail(); rows[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (k === 'arrowright' || k === 'd') { tab = TABS[(ti + 1) % TABS.length].id; sel = 0; render(); }
    else if (k === 'arrowleft' || k === 'a') { tab = TABS[(ti + TABS.length - 1) % TABS.length].id; sel = 0; render(); }
    else if (k === 'tab' || k === 'escape') close();
    else {
      const a = list[sel]?.actions.find((x) => x.key.toLowerCase() === k || (k === 'enter' && x === list[sel].actions[0]));
      if (a) act(a);
      else return;
    }
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey, true);
  // A click outside the frame closes the hold.
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  audio.sfx('click', { pitch: 0.7 });
  render();
}
