// The Galactic Spice Exchange screen, on top of market.ts. A trading floor: a scrolling ticker tape, a spot board
// of the six spices with sparklines, a big chart (candles or a line, with the news flagged where it hit), an order
// ticket for spice contracts, your portfolio, a live news wire whose headlines move the prices, jobs the news
// opens up, and Zix, a broker in the back room who sells tips about the next story. The market keeps running
// while you watch (and holds still while you confirm an order); the rest of the galaxy waits.
import { button, h, ui } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { TAU, clamp } from '../../../engine/math';
import { SPICE, SPICE_COLORS, type SpiceColor } from '../data';
import {
  buyTip, change, CODE, CONTRACT, contractPrice, FEE, gsi, marketTick, maxBuy, nextIn, portfolio, quote, takeOpp, TICK, tipPrice, trade, volatility,
  type MarketNews, type MarketOpp,
} from '../market';
import type { SpaceStage } from '../stage';
import { fmtTime, money } from './common';

type Side = 'buy' | 'sell';
/** Chart ranges: how many price ticks each shows, how many ticks make one candle, and the time-axis spacing. */
const RANGES = [{ id: '5m', n: 60, g: 2, step: 12 }, { id: '15m', n: 180, g: 6, step: 36 }, { id: '30m', n: 360, g: 12, step: 72 }];
const UP = '#3ee68a', DOWN = '#ff5a6a', AMBER = '#ffc94d', VIOLET = '#b48cff';
const MONO = '"Share Tech Mono", ui-monospace, monospace';
const pct = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`;
const arrow = (x: number) => (x > 0.0005 ? '▲' : x < -0.0005 ? '▼' : '■');
const tone = (x: number) => (x > 0.0005 ? 'up' : x < -0.0005 ? 'down' : 'flat');
const signed = (n: number) => (n >= 0 ? '+' : '−') + money(Math.abs(n));
const ago = (s: number) => (s < 10 ? 'just now' : s < 60 ? `${Math.floor(s)}s ago` : `${Math.floor(s / 60)}m ago`);
const ZIX = [
  '“Psst. Captain. Want to read tomorrow\'s news today? Zix hears things.”',
  '“Every headline starts as a whisper. Zix collects whispers.”',
  '“Rumours are cheap. Mine are not. That is how you know they are good.”',
  '“The big banks pay me twice as much. But I like your ship.”',
];

export function openExchange(st: SpaceStage, focus?: SpiceColor) {
  const w = st.w;
  const m = w.s.market;
  if (!m) return;
  const unit = (c: SpiceColor) => SPICE[c].base * CONTRACT;
  const held = SPICE_COLORS.find((c) => m.hold[c].n > 0);
  let sel: SpiceColor = focus ?? held ?? [...SPICE_COLORS].sort((a, b) => Math.abs(change(w, b)) - Math.abs(change(w, a)))[0];
  let range = 0;
  let candles = true;
  let side: Side = 'buy';
  let qty = 10;
  let hover: { x: number; y: number } | null = null;
  let lastTick = m.tick;
  let alive = true;
  let time = 0;
  /** Headlines already on the wire when you came in; anything newer flashes as it lands. */
  const known = new Set(m.news.map((n) => n.id));
  const fresh = new Set<number>();
  /** The tip you hold, so Zix's call can be judged once its story breaks. */
  let watchTip = m.tip && m.next && m.tip.id === m.next.id ? { ...m.tip } : null;
  let verdict: { text: string; good: boolean } | null = null;
  const zixLine = ZIX[Math.floor(Math.random() * ZIX.length)];

  // ---------------------------------------------------------------- header and tape
  const gsiV = h('b'), gsiCh = h('span', { class: 'mkt-ch' });
  const moodEl = h('span', { class: 'mkt-mood' });
  const cashEl = h('b');
  const head = h('div', { class: 'sp-focus-head mkt-head' },
    h('h2', null, h('span', { class: 'mkt-logo' }, '📈'), h('span', { class: 'mkt-title' }, 'Galactic Spice Exchange')),
    h('div', { class: 'mkt-gsi', title: 'Galactic Spice Index: every spice, weighted by value. Change over the last 5 minutes.' }, h('span', null, 'GSI'), gsiV, gsiCh),
    moodEl,
    h('div', { class: 'mkt-cash', title: 'Your credits' }, h('span', null, 'Cash'), cashEl),
    button('✕', () => close(), { cls: 'icon', title: 'Leave the exchange' }));
  const tapeIn = h('div', { class: 'mkt-tape-in' });
  const tape = h('div', { class: 'mkt-tape', 'aria-hidden': 'true' }, tapeIn);
  let tapeW = 0;

  // ---------------------------------------------------------------- spot board
  interface Row { el: HTMLElement; spark: HTMLCanvasElement; px: HTMLElement; ch: HTMLElement; hold: HTMLElement; last: number }
  const rows = new Map<SpiceColor, Row>();
  for (const c of SPICE_COLORS) {
    const spark = h('canvas', { class: 'mkt-spark', 'aria-hidden': 'true' }) as HTMLCanvasElement;
    const px = h('b', { class: 'mkt-px' }), ch = h('span', { class: 'mkt-ch' }), hold = h('i', { class: 'mkt-hold' });
    const el = h('button', { class: 'mkt-row', style: `--c:${SPICE[c].hex}`, title: `${SPICE[c].name} (${CODE[c]}) · key ${SPICE_COLORS.indexOf(c) + 1}` },
      h('i', { class: 'mkt-dot' }), h('div', { class: 'mkt-nm' }, h('b', null, SPICE[c].name), h('span', null, CODE[c], hold)), spark, h('div', { class: 'mkt-q' }, px, ch));
    el.addEventListener('click', () => pick(c));
    rows.set(c, { el, spark, px, ch, hold, last: 0 });
  }

  // ---------------------------------------------------------------- chart
  const selDot = h('i', { class: 'mkt-dot' }), selName = h('b'), selCode = h('span'), selPx = h('b', { class: 'mkt-big' }), selCh = h('span', { class: 'mkt-ch' });
  const seg = (label: string, f: () => void, title?: string) => {
    const b = h('button', { class: 'mkt-seg', title }, label) as HTMLButtonElement;
    b.addEventListener('click', () => { audio.sfx('tap'); f(); });
    return b;
  };
  const rangeBtns = RANGES.map((r, i) => seg(r.id, () => { range = i; renderSel(); }, `Last ${r.id.replace('m', ' minutes')}`));
  const styleBtn = seg('', () => { candles = !candles; renderSel(); }, 'Candles or line');
  const cv = h('canvas', { class: 'mkt-chart', 'aria-label': 'Price chart' }) as HTMLCanvasElement;
  const tipEl = h('div', { class: 'mkt-ctip' });
  const stats = h('div', { class: 'mkt-stats' });
  const point = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); hover = { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointermove', point);
  cv.addEventListener('pointerdown', point);
  cv.addEventListener('pointerleave', () => { hover = null; });

  // ---------------------------------------------------------------- order ticket
  const sideB = h('button', { class: 'mkt-side buy', title: 'Buy (B)' }, 'Buy'), sideS = h('button', { class: 'mkt-side sell', title: 'Sell (S)' }, 'Sell');
  sideB.addEventListener('click', () => { audio.sfx('tap'); setSide('buy'); });
  sideS.addEventListener('click', () => { audio.sfx('tap'); setSide('sell'); });
  const qtyIn = h('input', { class: 'mkt-qty', type: 'number', min: '1', max: '9999', step: '1', inputmode: 'numeric', 'aria-label': 'Contracts' }) as HTMLInputElement;
  qtyIn.value = String(qty);
  qtyIn.addEventListener('input', () => { qty = clamp(Math.floor(Number(qtyIn.value) || 0), 0, 9999); renderTicket(); });
  const chip = (label: string, f: () => void) => { const b = h('button', { class: 'mkt-chip' }, label); b.addEventListener('click', () => { audio.sfx('tap'); f(); }); return b; };
  const chips = h('div', { class: 'mkt-chips' }, ...[1, 10, 100].map((n) => chip(String(n), () => setQty(n))), chip('Max', () => setQty(side === 'buy' ? maxBuy(w, sel) : m.hold[sel].n)));
  const lines = h('div', { class: 'mkt-lines' });
  const place = button('', () => void placeOrder(), { cls: 'primary mkt-place' });
  const warn = h('div', { class: 'mkt-warn' });
  const done = h('div', { class: 'mkt-done' });
  const pf = h('div', { class: 'mkt-pf' });
  let pfKey = '';
  const pfCells = new Map<SpiceColor, { val: HTMLElement; pl: HTMLElement }>();
  const pfTotal = h('div', { class: 'mkt-pft' });

  // ---------------------------------------------------------------- wire and desk
  const nextEl = h('span', { class: 'mkt-hr' });
  const wire = h('div', { class: 'mkt-wire-list' });
  const agoEls: { el: HTMLElement; at: number }[] = [];
  const jobs = h('div', { class: 'mkt-jobs' });
  const jobMsg = h('div', { class: 'mkt-warn' });
  const jobClocks: { el: HTMLElement; o: MarketOpp }[] = [];
  let jobsKey = '-';
  const broker = h('div', { class: 'mkt-broker' });
  const zixNext = h('b');
  const zixMsg = h('div', { class: 'mkt-warn' });
  let brokerKey = '';

  const ticket = h('section', { class: 'mkt-box mkt-ticket' },
    h('div', { class: 'mkt-h' }, 'Order ticket', h('span', { class: 'mkt-hr' }, 'paper spice · no hold space')),
    h('div', { class: 'mkt-sides' }, sideB, sideS),
    h('div', { class: 'mkt-qrow' }, h('label', null, 'Contracts', qtyIn), chips),
    lines, place, warn, done,
    h('div', { class: 'mkt-h' }, 'Your contracts'), pf, pfTotal,
    h('div', { class: 'mkt-h' }, 'The back room'), broker);
  const grid = h('div', { class: 'mkt-grid' },
    h('section', { class: 'mkt-box mkt-board' }, h('div', { class: 'mkt-h' }, 'Spot board', h('span', { class: 'mkt-hr' }, 'per contract · 5m')), ...[...rows.values()].map((r) => r.el)),
    h('section', { class: 'mkt-box mkt-main' },
      h('div', { class: 'mkt-chead' }, h('div', { class: 'mkt-selnm' }, selDot, selName, selCode), h('div', { class: 'mkt-selq' }, selPx, selCh), h('div', { class: 'mkt-segs' }, ...rangeBtns, styleBtn)),
      h('div', { class: 'mkt-chartw' }, cv, tipEl), stats),
    ticket,
    h('section', { class: 'mkt-box mkt-wire' }, h('div', { class: 'mkt-h' }, h('span', { class: 'mkt-live' }, 'LIVE'), 'News wire', nextEl), wire),
    h('section', { class: 'mkt-box mkt-desk' }, h('div', { class: 'mkt-h' }, 'Jobs from the news'), jobs));
  const root = h('div', { class: 'sp-focus mkt' }, head, tape, grid);

  // ---------------------------------------------------------------- actions
  const pick = (c: SpiceColor) => {
    if (c === sel) return;
    sel = c;
    audio.sfx('tap');
    if (side === 'sell' && qty > m.hold[c].n && m.hold[c].n) setQty(m.hold[c].n, false);
    renderBoard(); renderSel(); renderTicket();
  };
  const setSide = (s: Side) => {
    side = s;
    const n = m.hold[sel].n;
    if (s === 'sell' && n && (qty > n || qty < 1)) setQty(n, false);
    renderTicket();
  };
  const setQty = (n: number, render = true) => {
    qty = clamp(Math.floor(n), 0, 9999);
    qtyIn.value = String(qty);
    if (render) renderTicket();
  };
  const floatUp = (text: string, color: string) => {
    const f = h('div', { class: 'mkt-float', style: `color:${color};top:${place.offsetTop - 8}px` }, text);
    ticket.append(f);
    setTimeout(() => f.remove(), 1500);
  };
  let busy = false;
  const placeOrder = async () => {
    if (busy || place.disabled || !alive) return;
    const n = qty, c = sel, sd = side;
    const q = quote(w, c, n, sd);
    busy = true;
    const ok = await ui.confirm(
      `${sd === 'buy' ? 'Buy' : 'Sell'} ${n} ${SPICE[c].name} contract${n === 1 ? '' : 's'}?`,
      sd === 'buy'
        ? `About ${money(q.avg)} each: ${money(q.net)} in all, with the ${money(q.fee)} broker fee. You have ${money(w.s.money)}. The price is held while you decide.`
        : `About ${money(q.avg)} each: you receive ${money(q.net)} after the ${money(q.fee)} broker fee. The price is held while you decide.`,
      `${sd === 'buy' ? 'Buy' : 'Sell'} · ${money(q.net)}`, 'Cancel');
    busy = false;
    if (!ok || !alive) return;
    const hd = m.hold[c];
    const basis = sd === 'sell' && hd.n ? hd.cost * (n / hd.n) : 0;
    const err = trade(w, c, n, sd);
    if (err) { say(done, err, 'bad'); audio.sfx('error'); renderTicket(); return; }
    audio.sfx('coin');
    if (sd === 'sell') {
      const pl = q.net - basis;
      floatUp(signed(pl), pl >= 0 ? UP : DOWN);
      say(done, `✓ Sold ${n} ${CODE[c]} for ${money(q.net)}: ${pl >= 0 ? 'a profit of' : 'a loss of'} ${money(Math.abs(pl))}.`, pl >= 0 ? 'good' : 'bad');
      if (pl > 0) audio.sfx('success', { vol: 0.5 });
    } else {
      floatUp(`${n} × ${CODE[c]}`, AMBER);
      say(done, `✓ Bought ${n} ${CODE[c]} at about ${money(q.avg)} each.`, 'good');
    }
    if (sd === 'sell' && !m.hold[c].n) setSide('buy');
    renderAll();
    st.hud.refresh(true);
  };
  const say = (el: HTMLElement, text: string, kind: 'good' | 'bad' | '' = '') => { el.textContent = text; el.className = el.className.split(' ')[0] + (kind ? ' ' + kind : ''); };

  // ---------------------------------------------------------------- rendering
  const renderTape = () => {
    const bits = (): HTMLElement[] => [
      ...SPICE_COLORS.map((c) => { const ch = change(w, c); return h('span', { class: 'mkt-tk' }, h('b', null, CODE[c]), ` ${money(contractPrice(w, c))} `, h('i', { class: tone(ch) }, `${arrow(ch)}${pct(ch)}`)); }),
      h('span', { class: 'mkt-tk' }, h('b', null, 'GSI'), ` ${gsi(w).toFixed(1)}`),
      ...m.news.slice(0, 4).map((n) => h('span', { class: 'mkt-tk news' }, h('i', { class: 'tag ' + n.tag.toLowerCase() }, n.tag), ` ${n.icon} ${n.head}`)),
    ];
    tapeIn.replaceChildren(...bits(), ...bits());
    // Retime only when the tape's length changes a lot, so it doesn't lurch every tick.
    const half = tapeIn.scrollWidth / 2;
    if (Math.abs(half - tapeW) > tapeW * 0.15) { tapeW = half; tapeIn.style.animationDuration = `${Math.max(30, half / 60)}s`; }
  };

  const renderBoard = () => {
    const g = gsi(w), gc = g / gsi(w, 60) - 1;
    gsiV.textContent = g.toFixed(1);
    gsiCh.textContent = `${arrow(gc)} ${pct(gc, 2)}`;
    gsiCh.className = 'mkt-ch ' + tone(gc);
    const avg = SPICE_COLORS.reduce((a, c) => a + change(w, c), 0) / SPICE_COLORS.length;
    const [mc, mt] = avg > 0.015 ? ['bull', '🐂 Bull market'] : avg < -0.015 ? ['bear', '🐻 Bear market'] : ['calm', '😐 Steady'];
    moodEl.className = 'mkt-mood ' + mc;
    moodEl.textContent = mt;
    cashEl.textContent = money(w.s.money);
    for (const [c, r] of rows) {
      const p = contractPrice(w, c), ch = change(w, c);
      if (r.last && p !== r.last) { r.el.classList.remove('fu', 'fd'); void r.el.offsetWidth; r.el.classList.add(p > r.last ? 'fu' : 'fd'); }
      r.last = p;
      r.px.textContent = money(p);
      r.ch.textContent = `${arrow(ch)} ${pct(ch)}`;
      r.ch.className = 'mkt-ch ' + tone(ch);
      const n = m.hold[c].n;
      r.hold.textContent = n ? ` ×${n}` : '';
      r.el.classList.toggle('on', c === sel);
      drawSpark(r.spark, m.hist[c].slice(-60), ch >= 0 ? UP : DOWN);
    }
  };

  const stat = (k: string, v: string, cls = '') => h('div', { class: 'mkt-stat' }, h('span', null, k), h('b', { class: cls }, v));
  const renderSel = () => {
    const c = sel, R = RANGES[range];
    selDot.style.background = SPICE[c].hex;
    selDot.style.boxShadow = `0 0 10px ${SPICE[c].hex}`;
    selName.textContent = SPICE[c].name;
    selCode.textContent = CODE[c];
    const p = contractPrice(w, c), ch = change(w, c, R.n - 1);
    selPx.textContent = money(p);
    selCh.textContent = `${arrow(ch)} ${signed(p - p / (1 + ch))} (${pct(ch)}) · ${R.id}`;
    selCh.className = 'mkt-ch ' + tone(ch);
    rangeBtns.forEach((b, i) => b.classList.toggle('on', i === range));
    styleBtn.textContent = candles ? '🕯️ Candles' : '〰️ Line';
    const hs = m.hist[c].slice(-R.n);
    const vol = volatility(w, c);
    const [vt, vc] = vol < 0.014 ? ['Calm', ''] : vol < 0.02 ? ['Lively', ''] : vol < 0.03 ? ['Choppy', 'warn'] : ['🌪️ Wild', 'down'];
    // What the news is doing to it right now.
    const pull = m.trends.filter((t) => t.c === c).reduce((a, t) => a + t.shift * ((t.until - m.clock) / t.dur), 0);
    const [sv, sc] = m.flips.some((f) => f.c === c) ? ['❓ Rumours', 'warn'] : pull > 0.03 ? ['🐂 Bullish', 'up'] : pull < -0.03 ? ['🐻 Bearish', 'down'] : ['Quiet', ''];
    const hd = m.hold[c];
    const pl = hd.n * p - hd.cost;
    stats.replaceChildren(
      stat(`${R.id} high`, money(Math.max(...hs) * unit(c))), stat(`${R.id} low`, money(Math.min(...hs) * unit(c))),
      stat('Volatility', vt, vc), stat('News mood', sv, sc),
      stat('Your position', hd.n ? `${hd.n} · ${signed(pl)}` : 'None', hd.n ? tone(pl) : ''));
  };

  const renderTicket = () => {
    sideB.classList.toggle('on', side === 'buy');
    sideS.classList.toggle('on', side === 'sell');
    root.dataset.side = side;
    const n = Math.max(1, qty);
    const q = quote(w, sel, n, side);
    const hd = m.hold[sel];
    const L = (k: string, v: string, cls = '') => h('div', { class: 'mkt-line ' + cls }, h('span', null, k), h('b', null, v));
    const out = [
      L('Market price', `${money(q.price)} / contract`),
      L('Est. average', `${money(q.avg)} (${pct(q.avg / q.price - 1, 2)} slippage)`),
      L(`Broker fee (${(FEE * 100).toFixed(1)}%)`, money(q.fee)),
    ];
    if (side === 'buy') {
      out.push(L('Total cost', money(q.net), 'total'));
      out.push(L('Break-even', `sell above ${money(q.net / n / (1 - FEE))}`, 'dim'));
    } else {
      out.push(L('You receive', money(q.net), 'total'));
      if (hd.n) { const pl = q.net - hd.cost * (Math.min(n, hd.n) / hd.n); out.push(L('Profit on these', signed(pl), pl >= 0 ? 'up' : 'down')); }
    }
    lines.replaceChildren(...out);
    const err = qty < 1 ? 'Pick how many contracts.'
      : side === 'buy' ? (q.net > w.s.money ? `Not enough credits: you have ${money(w.s.money)}.` : '')
      : qty > hd.n ? (hd.n ? `You hold only ${hd.n} ${SPICE[sel].name} contracts.` : `You hold no ${SPICE[sel].name} contracts yet.`) : '';
    place.textContent = `${side === 'buy' ? 'Buy' : 'Sell'} ${n} × ${SPICE[sel].name} · ${money(q.net)}`;
    place.disabled = !!err;
    warn.textContent = err;
  };

  const renderPf = () => {
    const list = SPICE_COLORS.filter((c) => m.hold[c].n > 0);
    const key = list.map((c) => c + m.hold[c].n).join();
    // Rebuild only when holdings change, so a tick never swaps a row out from under a click.
    if (key !== pfKey) {
      pfKey = key;
      pfCells.clear();
      pf.replaceChildren(...list.map((c) => {
        const hd = m.hold[c];
        const val = h('span', { class: 'mkt-num' }), pl = h('span', { class: 'mkt-num' });
        pfCells.set(c, { val, pl });
        const r = h('button', { class: 'mkt-pfr', style: `--c:${SPICE[c].hex}`, title: `Sell your ${SPICE[c].name}` },
          h('i', { class: 'mkt-dot' }), h('span', null, h('b', null, CODE[c]), ` ×${hd.n}`), val, pl);
        r.addEventListener('click', () => { audio.sfx('tap'); sel = c; side = 'sell'; setQty(m.hold[c].n, false); renderAll(); });
        return r;
      }));
      if (!list.length) pf.append(h('div', { class: 'mkt-empty' }, 'No contracts yet. A contract is paper spice: buy it here, sell it here, and it never takes up hold space.'));
    }
    for (const [c, cell] of pfCells) {
      const hd = m.hold[c], val = contractPrice(w, c) * hd.n, pl = val - hd.cost;
      cell.val.textContent = money(val);
      cell.pl.textContent = `${signed(pl)} (${pct(pl / Math.max(1, hd.cost))})`;
      cell.pl.className = 'mkt-num ' + tone(pl);
    }
    const P = portfolio(w);
    const cell = (k: string, v: string, cls = '') => h('div', null, h('span', null, k), h('b', { class: 'mkt-num ' + cls }, v));
    pfTotal.replaceChildren(cell('Value', money(P.value)), cell('Open P/L', signed(P.pl), tone(P.pl)), cell('Banked P/L', signed(m.realized), tone(m.realized)));
  };

  const impact = (label: string, shock: number, rumour?: boolean, col?: string) => {
    const mag = Math.abs(shock);
    const a = !shock ? '↺' : (shock > 0 ? '▲' : '▼').repeat(mag >= 0.2 ? 3 : mag >= 0.1 ? 2 : 1);
    return h('span', { class: 'mkt-imp ' + (shock > 0 ? 'up' : shock < 0 ? 'down' : 'flat'), style: col ? `--c:${col}` : undefined, title: rumour ? 'Unconfirmed: this may snap back' : undefined }, `${label} ${a}${rumour ? '?' : ''}`);
  };
  const newsItem = (n: MarketNews) => {
    const agoEl = h('span', { class: 'mkt-ago' }, ago(m.clock - n.at));
    agoEls.push({ el: agoEl, at: n.at });
    const fx = n.fx.length > 1 ? [impact('ALL', n.fx.reduce((a, f) => a + f.shock, 0) / n.fx.length, n.rumour)] : n.fx.map((f) => impact(CODE[f.c], f.shock, n.rumour));
    const el = h('article', { class: `mkt-news ${n.tag.toLowerCase()}${fresh.has(n.id) ? ' fresh' : ''}` },
      h('div', { class: 'mkt-nicon' }, n.icon),
      h('div', { class: 'mkt-nbody' },
        h('div', { class: 'mkt-nmeta' }, h('i', { class: 'tag ' + n.tag.toLowerCase() }, n.tag), agoEl, ...fx),
        h('b', null, n.head), h('p', null, n.body),
        n.opp ? h('div', { class: 'mkt-nopp' }, n.opp.taken ? '✓ You took the job this story opened.' : m.opps.includes(n.opp) ? '💼 This story opened a job: see Jobs from the news.' : 'The job this story opened has gone.') : null));
    if (n.fx.length === 1) el.addEventListener('click', () => pick(n.fx[0].c));
    return el;
  };
  const renderWire = () => {
    agoEls.length = 0;
    wire.replaceChildren(...m.news.map(newsItem));
    if (!m.news.length) wire.append(h('div', { class: 'mkt-empty' }, 'The wire is quiet. The first stories are on their way: watch the countdown.'));
  };

  const renderJobs = () => {
    const list = m.opps;
    const key = list.map((o) => o.id + (o.taken ? 't' : '')).join();
    if (key === jobsKey) return;
    jobsKey = key;
    jobClocks.length = 0;
    const kids = list.map((o) => {
      const e = o.empire ? w.emap.get(o.empire) : undefined;
      const title = o.kind === 'relief' ? `Relief run: ${o.amount} ${SPICE[o.c].name} for ${e?.name ?? 'a starving empire'}` : `Break the ${SPICE[o.c].name} hoard at ${w.star(o.star!).name}`;
      const how = o.kind === 'relief' ? `Bring ${o.amount} ${SPICE[o.c].name} to any ${e?.species ?? ''} world.` : 'Destroy the pirates guarding the stolen cargo.';
      const clock = h('span', { class: 'mkt-jclock' });
      if (!o.taken) jobClocks.push({ el: clock, o });
      const act = o.taken ? h('span', { class: 'mkt-taken' }, '✓ In your missions')
        : button('Take the job', () => {
          const err = takeOpp(w, o);
          if (err) { say(jobMsg, err, 'bad'); audio.sfx('error'); return; }
          audio.sfx('card');
          say(jobMsg, '📜 Added to your missions. Finish it and the market will hear about it.', 'good');
          renderJobs(); renderWire(); st.hud.refresh(true);
        }, { cls: 'small gold' });
      return h('div', { class: 'mkt-job', style: `--c:${SPICE[o.c].hex}` },
        h('div', { class: 'mkt-jic' }, o.kind === 'relief' ? '🚚' : '🏴‍☠️'),
        h('div', { class: 'mkt-jtxt' }, h('b', null, title), h('span', null, `${how} Pays ${money(o.reward)}. When it's done: `, impact(CODE[o.c], o.shock)), clock),
        act);
    });
    if (!kids.length) kids.push(h('div', { class: 'mkt-empty' }, 'No jobs right now. Shortages and pirate raids in the news open them up, and finishing one moves the price.'));
    jobs.replaceChildren(...kids, jobMsg);
  };

  const renderBroker = () => {
    const tip = m.tip && m.next && m.tip.id === m.next.id ? m.tip : null;
    const price = tipPrice(w);
    const key = `${tip?.id}/${price}/${verdict?.text}/${w.s.money >= price}`;
    if (key === brokerKey) return;
    brokerKey = key;
    const said = tip
      ? tip.c ? `“Watch ${SPICE[tip.c].name}. It goes ${tip.up ? 'up' : 'down'} with the next story. You did not hear it from me.”`
        : `“The whole board goes ${tip.up ? 'up' : 'down'} with the next story. Every spice. Trust Zix.”`
      : zixLine;
    broker.replaceChildren(
      h('div', { class: 'mkt-zix' + (tip ? ' told' : '') }, h('div', { class: 'mkt-zface' }, '🕵️'), h('div', null, h('b', null, 'Zix the Whisper'), h('p', null, said))),
      verdict ? h('div', { class: 'mkt-verdict ' + (verdict.good ? 'up' : 'down') }, verdict.text) : '',
      tip ? h('div', { class: 'mkt-mini' }, 'Zix is right about three times in four. Move before the story breaks.')
        : button(`🤫 Buy a tip · ${money(price)}`, () => {
          const err = buyTip(w);
          if (err) { say(zixMsg, err, 'bad'); audio.sfx('error'); return; }
          audio.sfx('charm');
          say(zixMsg, '');
          watchTip = m.tip ? { ...m.tip } : null;
          verdict = null;
          renderBroker(); renderBoard(); renderTicket();
          st.hud.refresh(true);
        }, { cls: 'small', disabled: w.s.money < price, title: 'A whisper about the next headline' }),
      zixMsg,
      h('div', { class: 'mkt-mini' }, 'Next story breaks in ', zixNext));
  };

  const clocks = () => {
    const nx = fmtTime(nextIn(w));
    nextEl.textContent = `next story ${nx}`;
    zixNext.textContent = nx;
    for (const a of agoEls) a.el.textContent = ago(m.clock - a.at);
    for (const j of jobClocks) j.el.textContent = `⏱ offer ends in ${fmtTime(j.o.until - m.clock)}`;
  };

  const renderAll = () => { renderBoard(); renderSel(); renderTicket(); renderPf(); renderJobs(); renderBroker(); clocks(); };

  /** A price tick (every few seconds): reprice everything, and land any new headlines. */
  const onTick = () => {
    const landed = m.news.filter((n) => !known.has(n.id));
    for (const n of landed) { known.add(n.id); fresh.add(n.id); }
    if (watchTip) {
      const hit = m.news.find((n) => n.id === watchTip!.id);
      if (hit) {
        verdict = watchTip.right ? { text: `✓ Zix called it: “${hit.head}”`, good: true } : { text: `✗ Zix got that one wrong: “${hit.head}”`, good: false };
        watchTip = null;
      }
    }
    if (landed.length) {
      renderWire();
      wire.scrollTop = 0;
      audio.sfx(landed.some((n) => n.tag === 'BREAKING') ? 'alarm' : 'card', { vol: 0.5 });
    }
    renderTape();
    renderAll();
  };

  // ---------------------------------------------------------------- chart drawing
  const flags: { x: number; n: MarketNews }[] = [];
  let tipText = '';
  const showTip = (x: number, text: string) => {
    if (text !== tipText) { tipText = text; tipEl.textContent = text; }
    tipEl.style.left = `${clamp(x, 90, cv.clientWidth - 90)}px`;
    tipEl.classList.add('on');
  };
  const draw = () => {
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (!cw || !ch) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const R = RANGES[range], c = sel, u = unit(c);
    const src = m.hist[c].slice(-R.n).map((v) => v * u);
    const n = src.length;
    if (n < 2) return;
    const padL = 8, padR = 72, padT = 28, padB = 22;
    const pw = cw - padL - padR, ph = ch - padT - padB;
    // Candles are cut from the end, so the last one is the live one.
    const cs: { o: number; c: number; h: number; l: number; i1: number }[] = [];
    if (candles) {
      for (let e = n; e > 0; e -= R.g) {
        const s = Math.max(0, e - R.g), part = src.slice(s, e), o = s > 0 ? src[s - 1] : part[0];
        cs.unshift({ o, c: part[part.length - 1], h: Math.max(o, ...part), l: Math.min(o, ...part), i1: e - 1 });
      }
    }
    let lo = Math.min(...src), hi = Math.max(...src);
    const hd = m.hold[c];
    const avgCost = hd.n ? hd.cost / hd.n : 0;
    // Your average cost joins the scale when it is near enough not to squash the chart.
    if (avgCost && avgCost > lo - (hi - lo) * 0.6 && avgCost < hi + (hi - lo) * 0.6) { lo = Math.min(lo, avgCost); hi = Math.max(hi, avgCost); }
    const span = Math.max(hi - lo, hi * 0.01);
    lo -= span * 0.08; hi += span * 0.08;
    const X = (i: number) => padL + ((i + 0.5) / n) * pw;
    const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * ph;
    const slot = pw / Math.max(1, cs.length);

    // Watermark, grid, axes.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(Math.min(120, ph * 0.42))}px Fredoka, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.035)';
    g.fillText(CODE[c], padL + pw / 2, padT + ph / 2);
    const step = niceStep((hi - lo) / 4);
    g.font = `11px ${MONO}`;
    g.textAlign = 'left';
    g.lineWidth = 1;
    const liveY = Y(src[n - 1]);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      g.strokeStyle = 'rgba(120,160,220,0.10)';
      g.beginPath(); g.moveTo(padL, y); g.lineTo(padL + pw, y); g.stroke();
      // The live price tag covers this label anyway.
      if (Math.abs(y - liveY) < 14) continue;
      g.fillStyle = 'rgba(169,190,211,0.7)';
      g.fillText(money(v), padL + pw + 8, y);
    }
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    for (let back = 0; back < n; back += R.step) {
      const x = Math.round(X(n - 1 - back)) + 0.5;
      g.strokeStyle = 'rgba(120,160,220,0.07)';
      g.beginPath(); g.moveTo(x, padT); g.lineTo(x, padT + ph); g.stroke();
      g.fillStyle = 'rgba(169,190,211,0.6)';
      g.fillText(back ? `−${Math.round((back * TICK) / 60)}m` : 'now', x, ch - 6);
    }

    // The news, flagged where it hit.
    flags.length = 0;
    const first = m.tick - n + 1;
    for (const nw of m.news) {
      const f = nw.fx.find((x) => x.c === c) ?? (nw.fx.length > 1 ? nw.fx[0] : undefined);
      const i = nw.tick - first;
      if (!f || i < 0 || i >= n) continue;
      const x = X(i);
      const col = !f.shock ? '#9fb3c8' : f.shock > 0 ? UP : DOWN;
      g.strokeStyle = col;
      g.globalAlpha = 0.4;
      g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(x, padT - 2); g.lineTo(x, padT + ph); g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(6,10,20,0.95)';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, padT - 13, 11, 0, TAU); g.fill(); g.stroke();
      g.lineWidth = 1;
      g.font = '12px sans-serif';
      g.textBaseline = 'middle';
      g.fillStyle = '#fff';
      g.fillText(nw.icon, x, padT - 12);
      flags.push({ x, n: nw });
    }

    // The price.
    const col = src[n - 1] >= src[0] ? UP : DOWN;
    if (candles) {
      cs.forEach((k, j) => {
        const x = padL + (j + 0.5) * slot, up = k.c >= k.o, bw = Math.max(2, slot * 0.62);
        g.strokeStyle = g.fillStyle = up ? UP : DOWN;
        g.beginPath(); g.moveTo(Math.round(x) + 0.5, Y(k.h)); g.lineTo(Math.round(x) + 0.5, Y(k.l)); g.stroke();
        const y0 = Y(Math.max(k.o, k.c)), y1 = Y(Math.min(k.o, k.c));
        if (up) { g.fillStyle = 'rgba(62,230,138,0.25)'; g.fillRect(x - bw / 2, y0, bw, Math.max(1.5, y1 - y0)); g.strokeRect(x - bw / 2 + 0.5, y0 + 0.5, bw - 1, Math.max(1, y1 - y0 - 1)); }
        else g.fillRect(x - bw / 2, y0, bw, Math.max(1.5, y1 - y0));
      });
    } else {
      const grad = g.createLinearGradient(0, padT, 0, padT + ph);
      grad.addColorStop(0, col + '55');
      grad.addColorStop(1, col + '00');
      g.beginPath();
      src.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
      g.lineTo(X(n - 1), padT + ph); g.lineTo(X(0), padT + ph); g.closePath();
      g.fillStyle = grad;
      g.fill();
      g.beginPath();
      src.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.lineJoin = 'round';
      g.stroke();
      g.lineWidth = 1;
    }
    // Moving average.
    const ser = candles ? cs.map((k, j) => ({ x: padL + (j + 0.5) * slot, v: k.c })) : src.map((v, i) => ({ x: X(i), v }));
    const win = candles ? 5 : 12;
    g.beginPath();
    for (let j = win - 1; j < ser.length; j++) {
      let s = 0;
      for (let k = j - win + 1; k <= j; k++) s += ser[k].v;
      if (j === win - 1) g.moveTo(ser[j].x, Y(s / win)); else g.lineTo(ser[j].x, Y(s / win));
    }
    g.strokeStyle = AMBER;
    g.globalAlpha = 0.7;
    g.lineWidth = 1.3;
    g.stroke();
    g.globalAlpha = 1;
    g.lineWidth = 1;
    g.font = `11px ${MONO}`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.textBaseline = 'bottom';
    g.fillStyle = AMBER;
    g.fillText(`MA(${win})`, padL + 4, padT + ph - 4);

    const tag = (y: number, text: string, bg: string, fg: string) => {
      g.font = `700 11px ${MONO}`;
      const tw = g.measureText(text).width + 10, ty = clamp(y, padT + 9, padT + ph - 9);
      g.fillStyle = bg;
      g.beginPath(); g.roundRect(padL + pw + 3, ty - 9, Math.min(tw, padR - 4), 18, 4); g.fill();
      g.fillStyle = fg;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(text, padL + pw + 8, ty + 0.5);
    };
    // Your average cost.
    if (avgCost) {
      const inside = avgCost >= lo && avgCost <= hi;
      const y = inside ? Y(avgCost) : avgCost > hi ? padT + 1 : padT + ph - 1;
      g.strokeStyle = VIOLET;
      g.setLineDash([2, 3]);
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(padL, y); g.lineTo(padL + pw, y); g.stroke();
      g.setLineDash([]);
      g.lineWidth = 1;
      g.font = `11px ${MONO}`;
      g.fillStyle = VIOLET;
      g.textAlign = 'left';
      g.textBaseline = avgCost > hi || (inside && y < padT + 16) ? 'top' : 'bottom';
      g.fillText(`Your avg ${money(avgCost)}${inside ? '' : avgCost > hi ? ' ↑' : ' ↓'}`, padL + 4, y + (g.textBaseline === 'top' ? 3 : -3));
      // Keep its tag clear of the live price tag.
      tag(Math.abs(y - liveY) < 19 ? (y <= liveY ? liveY - 19 : liveY + 19) : y, money(avgCost), VIOLET, '#160b2c');
    }
    // The live price: a dashed line, a pulsing dot and a tag on the axis.
    const lp = src[n - 1], ly = liveY, lx = candles ? padL + (cs.length - 0.5) * slot : X(n - 1);
    g.strokeStyle = col;
    g.globalAlpha = 0.6;
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(padL, ly); g.lineTo(padL + pw, ly); g.stroke();
    g.setLineDash([]);
    const pulse = (time * 1.2) % 1;
    g.fillStyle = col;
    g.globalAlpha = 0.6 * (1 - pulse);
    g.beginPath(); g.arc(lx, ly, 3 + pulse * 11, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.beginPath(); g.arc(lx, ly, 3.2, 0, TAU); g.fill();
    tag(ly, money(lp), col, '#02100a');

    // Crosshair and tooltip.
    if (hover && hover.x >= padL && hover.x <= padL + pw && hover.y >= 0 && hover.y <= padT + ph) {
      const flag = hover.y < padT + 4 ? flags.find((f) => Math.abs(f.x - hover!.x) < 12) : undefined;
      if (flag) showTip(flag.x, `${flag.n.icon} ${flag.n.tag}: ${flag.n.head}`);
      else {
        let x: number, text: string, back: number;
        if (candles) {
          const j = clamp(Math.floor((hover.x - padL) / slot), 0, cs.length - 1), k = cs[j];
          x = padL + (j + 0.5) * slot;
          text = `O ${money(k.o)}  H ${money(k.h)}  L ${money(k.l)}  C ${money(k.c)}`;
          back = n - 1 - k.i1;
        } else {
          const i = clamp(Math.round(((hover.x - padL) / pw) * n - 0.5), 0, n - 1);
          x = X(i);
          text = money(src[i]);
          back = n - 1 - i;
        }
        g.strokeStyle = 'rgba(220,236,255,0.35)';
        g.setLineDash([2, 3]);
        g.beginPath(); g.moveTo(Math.round(x) + 0.5, padT); g.lineTo(Math.round(x) + 0.5, padT + ph); g.stroke();
        if (hover.y >= padT) { g.beginPath(); g.moveTo(padL, hover.y); g.lineTo(padL + pw, hover.y); g.stroke(); }
        g.setLineDash([]);
        if (hover.y >= padT) tag(hover.y, money(lo + (1 - (hover.y - padT) / ph) * (hi - lo)), '#dce8ff', '#08101e');
        showTip(x, `${text} · ${back ? `${fmtTime(back * TICK)} ago` : 'now'}`);
      }
    } else if (tipText) { tipText = ''; tipEl.classList.remove('on'); }
  };

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    if (!alive) return;
    if (!root.isConnected) { close(); return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    // The market holds still while you confirm an order, so the quote you agree to is the price you get.
    if (!document.querySelector('.modal-wrap')) marketTick(w, dt);
    if (m.tick !== lastTick) { lastTick = m.tick; onTick(); }
    if ((acc += dt) >= 0.25) { acc = 0; clocks(); }
    draw();
    requestAnimationFrame(frame);
  };

  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-wrap')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if ((e.target as HTMLElement)?.tagName === 'INPUT') {
      if (e.key === 'Enter') { e.preventDefault(); void placeOrder(); }
      return;
    }
    const k = e.key.toLowerCase(), i = ['1', '2', '3', '4', '5', '6'].indexOf(k);
    if (i >= 0) pick(SPICE_COLORS[i]);
    else if (k === 'b' || k === 's') { audio.sfx('tap'); setSide(k === 'b' ? 'buy' : 'sell'); }
    // Nothing else reaches the ship while you trade.
    e.stopPropagation();
  };
  const close = () => {
    if (!alive) return;
    alive = false;
    m.seen = m.clock;
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    st.hud.refresh(true);
  };

  document.body.append(root);
  window.addEventListener('keydown', onKey, true);
  m.seen = m.clock;
  renderTape();
  renderWire();
  renderAll();
  audio.sfx('card');
  requestAnimationFrame(frame);
  st.game.hint('exchange', 'Buy spice contracts low and sell them high: they are paper spice, so they never take hold space. Headlines move prices, Zix sells tips about the next one, and some stories open jobs that move the market when you finish them.', '📈');
}

/** A round step for price gridlines: 1, 2 or 5 times a power of ten. */
function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

/** A tiny line chart of recent prices for the spot board. */
function drawSpark(c: HTMLCanvasElement, data: number[], col: string) {
  const cw = c.clientWidth, ch = c.clientHeight;
  if (!cw || !ch || data.length < 2) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  const lo = Math.min(...data), hi = Math.max(...data), sp = hi - lo || 1;
  const X = (i: number) => (i / (data.length - 1)) * cw, Y = (v: number) => 2 + (1 - (v - lo) / sp) * (ch - 4);
  const grad = g.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, col + '44');
  grad.addColorStop(1, col + '00');
  g.beginPath();
  data.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  g.lineTo(cw, ch); g.lineTo(0, ch); g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.beginPath();
  data.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  g.strokeStyle = col;
  g.lineWidth = 1.4;
  g.lineJoin = 'round';
  g.stroke();
}
