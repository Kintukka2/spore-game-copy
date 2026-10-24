// The Nav-Boy 3000: your wrist computer, in the style of Fallout's Pip-Boy. A metal casing with a gauge, a
// scroll wheel and a display knob around a phosphor CRT, and three buttons under it: STATS (your ship and
// captain), ITEMS (the cargo hold) and DATA (maps, missions, contacts, notes, radio and the market). Each button
// has its own pages along the bottom of the screen. Most pages are a list on the left and the highlighted
// entry's picture, stats and actions on the right; maps and the radio draw their own. The galaxy waits while
// it is open.
import { h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { drawThumb } from '../../../design/render';
import type { Design } from '../../../design/types';
import type { SpaceStage } from '../stage';
import { terminalAsk } from './talk';
import { applyPhosphor, PH, PH_ORDER, phColor } from './phosphor';
import { statsTab } from './nbStats';
import { itemsTab } from './nbItems';
import { dataTab } from './nbData';

export type NbTabId = 'stats' | 'items' | 'data' | 'term';
/** An action on the highlighted entry. `ask` is the question put first; `off` greys it out and says why. */
export interface NbAct { key: string; label: string; run: () => void; ask?: string; off?: string }
export interface NbRow {
  icon?: string;
  name: string;
  val?: string;
  /** A tag shown instead of the value, e.g. READY. */
  tag?: string;
  dim?: boolean;
  /** The small square Fallout uses for equipped items: here the tracked mission, the station playing, … */
  mark?: boolean;
  /** A section heading, not an entry. */
  head?: boolean;
  /** Anything a page wants to carry along with the row. */
  ref?: unknown;
}
export interface NbDetail {
  pic?: (host: HTMLElement) => void;
  /** A big icon when there is no picture. */
  big?: string;
  title?: string;
  /** Stat boxes, Fallout's DAM / WG / VAL row. */
  boxes?: [string, string][];
  /** Full-width boxes, like EFFECTS. */
  wide?: [string, string][];
  bars?: [string, number, string][];
  /** Label, value, and whether it is met (ticked). */
  lines?: [string, string, boolean?][];
  desc?: string | (string | Node)[];
  acts?: NbAct[];
}
export interface NbCtx {
  st: SpaceStage;
  /** Redraw the current page (after an action changed things). */
  refresh(): void;
  close(): void;
  go(tab: NbTabId, page?: string): void;
  ask(text: string | Node, yes: string, key: string, run: () => void): void;
  /** A line of feedback on the screen. */
  note(text: string, bad?: boolean): void;
}
export interface NbCustom { tick?(dt: number): void; key?(k: string): boolean; destroy?(): void }
export interface NbPage {
  id: string;
  label: string;
  rows?(): NbRow[];
  detail?(row: NbRow, i: number): NbDetail;
  empty?: string;
  custom?(host: HTMLElement, ctx: NbCtx): NbCustom;
  badge?(): number;
}
export interface NbTab { id: NbTabId; label: string; head(): [string, string][]; pages: NbPage[] }

/** A wall terminal (the shipyard) reuses the screen with a single tab and its own casing. */
export interface NbTerm { title: string; sub: () => string; tab: (ctx: NbCtx) => NbTab; mem: { page: string } }

const last: { tab: NbTabId; page: Record<NbTabId, string> } = { tab: 'stats', page: { stats: 'status', items: 'spice', data: 'local', term: '' } };
let current: { close(): void; go(tab: NbTabId, page?: string): void; term: boolean } | null = null;

export const navBoyOpen = () => !!current && !current.term;
export function closeNavBoy() { current?.close(); }
export function toggleNavBoy(st: SpaceStage) { if (current && !current.term) current.close(); else openNavBoy(st); }

/** Open the Nav-Boy on `tab` (and `page`), or the last place you looked. */
export function openNavBoy(st: SpaceStage, tab?: NbTabId, page?: string) {
  if (current && !current.term) { current.go(tab ?? last.tab, page); return; }
  current?.close();
  device(st, tab, page);
}
/** Open a wall terminal on `page`. */
export function openTerminal(st: SpaceStage, term: NbTerm, page?: string) {
  current?.close();
  if (page) term.mem.page = page;
  device(st, 'term', page, term);
}

function device(st: SpaceStage, tab?: NbTabId, page?: string, term?: NbTerm) {
  const w = st.w;
  const TAB_IDS: NbTabId[] = term ? ['term'] : ['stats', 'items', 'data'];
  if (term) last.page.term = term.mem.page;
  let tabId: NbTabId = term ? 'term' : tab ?? last.tab;
  if (page) last.page[tabId] = page;
  const sel = new Map<string, number>();
  let alive = true;
  let custom: NbCustom | null = null;
  let asking: ReturnType<typeof terminalAsk> | null = null;

  // ---------------------------------------------------------------- casing
  const headEl = h('div', { class: 'nb-head' });
  const bodyEl = h('div', { class: 'nb-body' });
  const footEl = h('div', { class: 'nb-foot' });
  const noteEl = h('div', { class: 'nb-note' });
  const ui = h('div', { class: 'nb-ui' }, headEl, bodyEl, footEl, noteEl);
  const screen = h('div', { class: 'nb-screen' }, ui, h('div', { class: 'nb-crt' }), h('div', { class: 'nb-roll' }), h('div', { class: 'nb-on' }));
  const needle = h('i', { class: 'nb-needle' });
  const knob = h('button', { class: 'nb-knob', title: 'Display colour', 'aria-label': 'Display colour' }, h('i'));
  const knobLbl = h('span', { class: 'nb-knob-l' });
  // On phones the casing's knob is hidden: a small display button sits with the main buttons instead.
  const disp = h('button', { class: 'nb-disp', title: 'Display colour', 'aria-label': 'Display colour' }, '◐');
  const btns = (term ? [] : TAB_IDS).map((id, i) => {
    const b = h('button', { class: 'nb-btn', 'aria-label': id.toUpperCase() }, h('span', null, id.toUpperCase()), h('i'), h('small', null, `F${i + 1}`)) as HTMLButtonElement;
    b.addEventListener('click', () => go(id));
    return b;
  });
  const screw = () => h('i', { class: 'nb-screw' });
  /** The ◀ ▶ shoulder buttons step through STATS, ITEMS and DATA. */
  const shoulder = (d: number) => {
    const b = h('button', { class: 'nb-sh', 'aria-label': d < 0 ? 'Previous' : 'Next' }, d < 0 ? '◀' : '▶');
    b.addEventListener('click', () => go(TAB_IDS[(TAB_IDS.indexOf(tabId) + d + TAB_IDS.length) % TAB_IDS.length]));
    return b;
  };
  const termSub = h('span');
  const dev = term ? h('div', { class: 'nb-dev term' },
    h('div', { class: 'nb-tplate' }, screw(), h('b', null, term.title), termSub, h('i', { class: 'nb-led' }), screw()),
    h('div', { class: 'nb-bezel' }, screen),
    h('div', { class: 'nb-tfoot' }, h('span', null, 'STARCO INDUSTRIES (TM) TERMLINK'), h('div', { class: 'nb-knobw' }, knob, knobLbl)))
  : h('div', { class: 'nb-dev' },
    h('div', { class: 'nb-side l' },
      h('div', { class: 'nb-gauge', title: 'Energy' }, h('div', { class: 'nb-face' }, h('span', null, '⚡'), needle)),
      h('div', { class: 'nb-wheel' }),
      h('div', { class: 'nb-plate' }, h('b', null, 'Nav-Boy'), h('span', null, '• Model 3000 •')),
      h('div', { class: 'nb-knobw' }, knob, knobLbl),
      screw()),
    h('div', { class: 'nb-bezel' }, screen),
    h('div', { class: 'nb-side r' }, screw(), h('div', { class: 'nb-vents' }, ...Array.from({ length: 6 }, () => h('i'))), h('i', { class: 'nb-led' }), screw()),
    h('div', { class: 'nb-btns' }, shoulder(-1), ...btns, shoulder(1), disp));
  const root = h('div', { class: 'nb' }, dev);

  const ctx: NbCtx = {
    st,
    refresh: () => render(),
    close: () => close(),
    go: (t, p) => go(t, p),
    ask: (text, yes, key, run) => {
      asking?.close();
      asking = terminalAsk(screen, text, { key, label: yes }, () => { asking = null; run(); render(); }, () => { asking = null; });
    },
    note: (text, bad) => {
      noteEl.textContent = text;
      noteEl.className = 'nb-note on' + (bad ? ' bad' : '');
      clearTimeout(noteT);
      noteT = window.setTimeout(() => noteEl.classList.remove('on'), 3200);
    },
  };
  let noteT = 0;
  const tabs = (term ? { term: term.tab(ctx) } : { stats: statsTab(ctx), items: itemsTab(ctx), data: dataTab(ctx) }) as Partial<Record<NbTabId, NbTab>>;
  const tabDef = () => tabs[tabId]!;
  const pageDef = () => tabDef().pages.find((p) => p.id === last.page[tabId]) ?? tabDef().pages[0];
  const selKey = () => `${tabId}/${pageDef().id}`;

  // ---------------------------------------------------------------- header and footer
  const renderHead = () => {
    if (term) termSub.textContent = term.sub();
    headEl.replaceChildren(h('div', { class: 'nb-title' }, tabDef().label), ...tabDef().head().map(([k, v]) => h('div', { class: 'nb-seg' }, h('span', null, k), h('b', null, v))));
    const f = Math.max(0, Math.min(1, w.s.energy / w.maxEnergy));
    needle.style.transform = `rotate(${-120 + f * 240}deg)`;
  };
  const renderFoot = () => {
    const kids: HTMLElement[] = [h('i', { class: 'nb-fend l' })];
    tabDef().pages.forEach((p, i) => {
      if (i) kids.push(h('i', { class: 'nb-ln' }));
      const n = p.badge?.() ?? 0;
      const b = h('button', { class: 'nb-sub' + (p.id === pageDef().id ? ' on' : '') }, p.label, n ? h('sup', null, String(n)) : null);
      b.addEventListener('click', () => { if (p.id !== pageDef().id) { audio.sfx('click', { pitch: 1.3, vol: 0.6 }); setPage(p.id); render(true); } });
      kids.push(b);
    });
    kids.push(h('i', { class: 'nb-fend r' }));
    footEl.replaceChildren(...kids);
    footEl.querySelector('.nb-sub.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  // ---------------------------------------------------------------- list and detail
  let rows: NbRow[] = [];
  let rowEls: HTMLElement[] = [];
  const listEl = h('div', { class: 'nb-list' });
  const upEl = h('i', { class: 'nb-up' }, '^'), dnEl = h('i', { class: 'nb-dn' }, 'v');
  const detailEl = h('div', { class: 'nb-detail' });
  const scrollMarks = () => {
    upEl.classList.toggle('on', listEl.scrollTop > 4);
    dnEl.classList.toggle('on', listEl.scrollTop + listEl.clientHeight < listEl.scrollHeight - 4);
  };
  listEl.addEventListener('scroll', scrollMarks);
  const selectable = (i: number) => i >= 0 && i < rows.length && !rows[i].head;
  const cur = () => sel.get(selKey()) ?? -1;
  const setSel = (i: number) => {
    sel.set(selKey(), i);
    rowEls.forEach((r, j) => r.classList.toggle('on', j === i));
    rowEls[i]?.scrollIntoView({ block: 'nearest' });
    renderDetail();
  };
  const move = (d: number) => {
    let i = cur();
    for (let n = 0; n < rows.length; n++) {
      i = (i + d + rows.length) % rows.length;
      if (selectable(i)) break;
    }
    if (selectable(i) && i !== cur()) { audio.sfx('tap', { vol: 0.5 }); setSel(i); }
  };
  const acts = (): NbAct[] => {
    const i = cur();
    return selectable(i) ? pageDef().detail?.(rows[i], i).acts ?? [] : [];
  };
  const runAct = (a: NbAct) => {
    if (a.off) { audio.sfx('error'); ctx.note(a.off, true); return; }
    audio.sfx('click', { vol: 0.6 });
    if (a.ask) ctx.ask(a.ask, `Yes, ${a.label.toLowerCase()}`, a.key, a.run);
    else { a.run(); if (alive) render(); }
  };
  const renderDetail = () => {
    const i = cur();
    detailEl.replaceChildren();
    if (!selectable(i)) return;
    const d = pageDef().detail?.(rows[i], i);
    if (!d) return;
    const pic = h('div', { class: 'nb-pic' });
    if (d.pic) d.pic(pic);
    else if (d.big ?? rows[i].icon) pic.append(h('span', { class: 'nb-big' }, d.big ?? rows[i].icon!));
    const actEl = h('div', { class: 'nb-acts' }, ...(d.acts ?? []).map((a) => {
      const b = h('button', { class: 'nb-act' + (a.off ? ' off' : ''), title: a.off ?? '' }, a.label, h('kbd', null, a.key));
      b.addEventListener('click', (e) => { e.stopPropagation(); runAct(a); });
      return b;
    }));
    const box = (k: string, v: string, wide = false) => h('div', { class: 'nb-box' + (wide ? ' wide' : '') }, h('span', null, k), h('b', null, v));
    detailEl.append(h('div', { class: 'nb-dtop' }, pic, actEl));
    if (d.title) detailEl.append(h('div', { class: 'nb-dtitle' }, d.title));
    if (d.boxes?.length || d.wide?.length) detailEl.append(h('div', { class: 'nb-boxes' }, ...(d.boxes ?? []).map(([k, v]) => box(k, v)), ...(d.wide ?? []).map(([k, v]) => box(k, v, true))));
    for (const [k, f, t] of d.bars ?? []) detailEl.append(h('div', { class: 'nb-barrow' }, h('span', null, k), h('div', { class: 'nb-bar' }, h('i', { style: `width:${Math.round(Math.max(0, Math.min(1, f)) * 100)}%` })), h('b', null, t)));
    if (d.lines?.length) detailEl.append(h('div', { class: 'nb-lines' }, ...d.lines.flatMap(([k, v, ok]) => [h('span', { class: ok ? 'ok' : '' }, k), h('b', { class: ok ? 'ok' : '' }, v)])));
    if (d.desc) detailEl.append(h('div', { class: 'nb-desc' }, ...(typeof d.desc === 'string' ? [d.desc] : d.desc)));
  };
  const renderList = (fresh: boolean) => {
    const p = pageDef();
    rows = p.rows?.() ?? [];
    let i = sel.get(selKey()) ?? -1;
    if (!selectable(i)) i = Math.min(Math.max(i, 0), rows.length - 1);
    if (!selectable(i)) i = rows.findIndex((r) => !r.head);
    sel.set(selKey(), i);
    rowEls = rows.map((r, j) => {
      if (r.head) return h('div', { class: 'nb-hrow' }, r.name);
      const el = h('div', { class: 'nb-row' + (j === i ? ' on' : '') + (r.dim ? ' dim' : ''), role: 'option' },
        h('i', { class: 'nb-mk' + (r.mark ? ' on' : '') }),
        r.icon ? h('span', { class: 'nb-ic' }, r.icon) : null,
        h('span', { class: 'nb-nm' }, r.name),
        r.tag ? h('em', { class: 'nb-tag' }, r.tag) : r.val !== undefined ? h('span', { class: 'nb-v' }, r.val) : null);
      // Hover highlights; a tap on the highlighted entry runs its first action, as in the hold.
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && cur() !== j) setSel(j); });
      el.addEventListener('click', () => {
        if (cur() !== j) { audio.sfx('tap', { vol: 0.5 }); setSel(j); return; }
        const a = acts()[0];
        if (a && !a.off) runAct(a);
      });
      return el;
    });
    const top = fresh ? 0 : listEl.scrollTop;
    listEl.replaceChildren(...rowEls);
    if (!rows.some((r) => !r.head)) listEl.append(h('div', { class: 'nb-empty' }, p.empty ?? 'Nothing here.'));
    listEl.scrollTop = top;
    if (fresh) rowEls[i]?.scrollIntoView({ block: 'nearest' });
    requestAnimationFrame(scrollMarks);
    renderDetail();
  };

  // ---------------------------------------------------------------- the screen
  /** Draw the current page; `fresh` when you have just arrived on it. */
  const render = (fresh = false) => {
    if (!alive) return;
    btns.forEach((b, i) => b.classList.toggle('on', TAB_IDS[i] === tabId));
    renderHead();
    renderFoot();
    const p = pageDef();
    if (fresh || p.custom || !bodyEl.contains(listEl)) {
      custom?.destroy?.();
      custom = null;
      bodyEl.replaceChildren();
      bodyEl.className = 'nb-body';
      if (p.custom) {
        bodyEl.classList.add('custom');
        custom = p.custom(bodyEl, ctx);
        return;
      }
      bodyEl.append(h('div', { class: 'nb-listw' }, upEl, listEl, dnEl), detailEl);
      renderList(true);
      return;
    }
    renderList(false);
  };
  const setPage = (id: string) => { last.page[tabId] = id; if (term) term.mem.page = id; };
  const go = (t: NbTabId, page?: string) => {
    if (term) { if (page) { setPage(page); render(true); } return; }
    if (page) last.page[t] = page;
    if (t === tabId && !page) return;
    asking?.close();
    asking = null;
    tabId = t;
    if (!term) last.tab = t;
    audio.sfx('click', { pitch: 0.8 });
    screen.classList.remove('flick');
    void screen.offsetWidth;
    screen.classList.add('flick');
    render(true);
  };
  const setKnob = () => {
    const c = phColor();
    knob.style.transform = `rotate(${PH_ORDER.indexOf(c) * 70 - 105}deg)`;
    knobLbl.textContent = PH[c].name;
  };
  const cycle = () => {
    const c = PH_ORDER[(PH_ORDER.indexOf(phColor()) + 1) % PH_ORDER.length];
    w.s.phosphor = c;
    applyPhosphor(c);
    setKnob();
    audio.sfx('click', { pitch: 0.6 });
    ctx.note(`Display colour: ${PH[c].name}`);
    render();
  };
  knob.addEventListener('click', cycle);
  disp.addEventListener('click', cycle);

  // ---------------------------------------------------------------- input and life
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-wrap, .sp-crate, .sp-focus, .ft')) return;
    const k = e.key.toLowerCase();
    if (asking?.open) { asking.key(k); e.preventDefault(); e.stopPropagation(); return; }
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (custom?.key?.(k)) { /* handled */ }
    else if (k === 'tab' || k === 'escape') close();
    else if (!term && (k === '1' || k === 'f1')) go('stats');
    else if (!term && (k === '2' || k === 'f2')) go('items');
    else if (!term && (k === '3' || k === 'f3')) go('data');
    else if (k === 'arrowright' || k === 'd' || k === 'arrowleft' || k === 'a') {
      const ps = tabDef().pages, i = ps.indexOf(pageDef());
      setPage(ps[(i + (k === 'arrowright' || k === 'd' ? 1 : ps.length - 1)) % ps.length].id);
      audio.sfx('click', { pitch: 1.3, vol: 0.6 });
      render(true);
    }
    else if (k === 'arrowdown' || k === 's') move(1);
    else if (k === 'arrowup' || k === 'w') move(-1);
    else {
      const list = acts();
      const a = k === 'enter' || k === ' ' ? list[0] : list.find((x) => x.key.toLowerCase() === k);
      if (!a) { e.stopPropagation(); return; }
      runAct(a);
    }
    e.preventDefault();
    e.stopPropagation();
  };
  let lastT = performance.now(), acc = 0;
  const frame = (now: number) => {
    if (!alive) return;
    if (!root.isConnected) { close(); return; }
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    custom?.tick?.(dt);
    if ((acc += dt) > 0.5) { acc = 0; renderHead(); }
    requestAnimationFrame(frame);
  };
  const close = () => {
    if (!alive) return;
    alive = false;
    if (current === me) current = null;
    asking?.close();
    custom?.destroy?.();
    window.removeEventListener('keydown', onKey, true);
    root.classList.add('out');
    audio.sfx('click', { pitch: 0.5 });
    setTimeout(() => root.remove(), 220);
    st.hud.refresh(true);
  };
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  const me = { close, go, term: !!term };
  current = me;
  document.body.append(root);
  window.addEventListener('keydown', onKey, true);
  setKnob();
  audio.sfx('click', { pitch: 0.6 });
  audio.sfx('zap', { vol: 0.25, pitch: 0.5 });
  render(true);
  requestAnimationFrame(frame);
  if (!term) st.game.hint('navboy', 'This is your Nav-Boy 3000: your ship, your cargo, maps, missions, contacts and radio. F1 / F2 / F3 (or 1 / 2 / 3) switch STATS, ITEMS and DATA, ← → change page, ↑ ↓ pick an entry. Tab closes it. The knob on the left changes the display colour.', '📟');
}

// ------------------------------------------------------------------ pictures
/** A canvas that fills its host and is redrawn by `draw` (every frame while `live`). */
export function picCanvas(host: HTMLElement, draw: (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void, live = false, cls = '') {
  const cv = h('canvas', { class: 'nb-cv ' + cls }) as HTMLCanvasElement;
  host.append(cv);
  let t = 0, last = performance.now();
  const paint = (now: number) => {
    if (!cv.isConnected && t > 0.2) return;
    t += (now - last) / 1000;
    last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (cw && ch) {
      if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cw, ch);
      draw(g, cw, ch, t);
    }
    if (live || !cw) requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
  return cv;
}

/** A design, gently alive. Ships are drawn in phosphor; living things (`alive`) keep their own colours and
 *  stand out against the screen, as aliens do in a conversation. */
export function picDesign(host: HTMLElement, d: Design, live = true, alive = false) {
  const cv = h('canvas', { class: alive ? 'nb-cv alive' : 'nb-cv mono' }) as HTMLCanvasElement;
  host.append(cv);
  let t = 0, last = performance.now();
  const paint = (now: number) => {
    if (!cv.isConnected && t > 0.2) return;
    t += (now - last) / 1000;
    last = now;
    try { drawThumb(cv, d, { pad: 8, t: live ? t : 0 }); } catch { return; }
    if (live) requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}
