// The wandering trader's barter screen, Fallout style: your goods and their wares side by side in an amber
// terminal frame. Mark what you want to swap, check the totals, and accept the whole deal at once.
import { h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { RNG } from '../../../engine/rng';
import { generateCreature } from '../../../design/generate';
import type { Design } from '../../../design/types';
import { speciesName } from '../../../game/names';
import { takeDeal, traderDeals, type Deal } from '../events';
import type { GEvent } from '../types';
import type { SpaceStage } from '../stage';
import { fmtTime, money, rarityText } from './common';
import { openCrate } from './crateOpen';
import { faceScene } from './talk';
import { showLoot } from './scanCard';

const TITLES = ['the Haggler', 'of the Long Road', 'the Starlane Peddler', 'the Bargainer', 'Junk-Prince', 'the Generous (Allegedly)'];
export const LINES = {
  browse: [
    'Take your time. Touch nothing you cannot afford.',
    'Everything on the table is for sale. The table is also for sale.',
    'Have a look, have a look. Prices go up when I get bored.',
  ],
  greet: [
    'Ah, a customer! Fresh off the starlanes, are we? Look, look, everything must go.',
    'Welcome, welcome! {name} sells only the finest and mostly legal goods.',
    'You have the look of someone with spare credits. My favourite kind of look.',
    'Step closer, traveller. These prices will not last. Neither will I. I leave soon!',
  ],
  tool: ['A wise choice. My other customers chose poorly.', 'Half price! I am practically robbing myself.', 'Pleasure doing business. No refunds! Kidding. Mostly.'],
  spice: ['Mmm, {spice}! My cousins will pay a fortune. I mean, a fair price.', 'Lovely stuff. Smell that? That is the smell of profit.'],
  crate: ['Ooh, the crate! Even I don\'t know what\'s in it. That\'s the fun part.', 'The crate is yours. If something inside it moves, it was not me.'],
  blueprint: ['Those plans cost a friend of mine an arm. He had spares.', 'Read them carefully. Build it carefully. Fly it very carefully.'],
  parts: ['Genuine parts! The serial numbers were like that when I found them.', 'Lovely components. Barely used. By anyone you know.'],
  gear: ['Installed already? You have a gift. So do I: a no-returns policy.', 'Fully assembled, fully tested, mostly. Enjoy!'],
  cant: ['Your purse doesn\'t cover that deal, friend. Put something back.', 'Close, but not close enough. Credits, friend, credits.'],
  poor: ['Your purse is lighter than your ambitions, friend.', 'Credits first, wares second. That is the way of the lanes.'],
  full: ['Your hold can\'t take any more of those, friend.'],
  sold: ['You cleaned me out! Until the next starlane, friend.', 'Sold out! Time for me to find another sucker. I mean customer.'],
  gone: ['The starlanes call! Farewell, friend.'],
};

const merchants = new Map<number, { design: Design; name: string }>();
export function merchant(seed: number) {
  let m = merchants.get(seed);
  if (!m) {
    const r = new RNG((seed ^ 0x7ade) >>> 0);
    const name = `${speciesName(r)} ${r.pick(TITLES)}`;
    m = { name, design: generateCreature(new RNG((seed ^ 0x51) >>> 0), { level: 3, diet: 'omnivore', name }) };
    merchants.set(seed, m);
  }
  return m;
}

export function openTrader(st: SpaceStage, ev: GEvent): Promise<void> {
  return new Promise((done) => {
    const w = st.w;
    const m = merchant(ev.seed ?? ev.id);
    const first = m.name.split(' ')[0];
    const r = new RNG(((ev.seed ?? ev.id) ^ Math.floor(performance.now())) >>> 0);
    const say = h('div', { class: 'ft-say bt-say' });
    const timer = h('span', null);
    const mineEl = h('div', { class: 'bt-list' }), theirsEl = h('div', { class: 'bt-list' });
    const mineHead = h('div', { class: 'bt-head' }), theirsHead = h('div', { class: 'bt-head' });
    const desc = h('div', { class: 'bt-desc' });
    const total = h('div', { class: 'bt-total' });
    const keys = h('div', { class: 'bt-keys' });
    const box = h('div', { class: 'ft-box bt-box' },
      h('div', { class: 'ft-tab' }, h('b', null, 'Barter'), h('span', null, m.name)),
      h('div', { class: 'ft-info' }, timer),
      h('div', { class: 'bt-cols' }, h('div', { class: 'bt-col' }, mineHead, mineEl), h('div', { class: 'bt-col' }, theirsHead, theirsEl)),
      desc, total, keys);
    const cv = h('canvas', { class: 'ft-cv' }) as HTMLCanvasElement;
    const top = h('div', { class: 'ft-top' }, say);
    const root = h('div', { class: 'ft ft-amber bt' }, cv, h('div', { class: 'ft-scan' }), top, box);
    document.body.append(root);
    // The merchant watches from behind the counter.
    let typingNow = false;
    faceScene(cv, {
      design: m.design, color: '#ffb347',
      region: () => { const a = top.getBoundingClientRect(), b = box.getBoundingClientRect(); return { top: a.bottom, height: b.top - a.bottom }; },
      speaking: () => typingNow,
      angry: () => false,
    });

    // Typed quips at the top, as in conversations.
    let typing = 0;
    const talk = (key: keyof typeof LINES, vars: Record<string, string> = {}) => {
      let line = r.pick(LINES[key]).replace('{name}', first);
      for (const [k, v] of Object.entries(vars)) line = line.replace(`{${k}}`, v);
      clearInterval(typing);
      say.textContent = '';
      let i = 0;
      typingNow = true;
      typing = window.setInterval(() => {
        say.textContent = line.slice(0, ++i);
        if (i % 3 === 0 && line[i - 1] !== ' ') audio.sfx('tap', { vol: 0.09, pitch: 1.9 + Math.random() * 0.3 });
        if (i >= line.length) { clearInterval(typing); typingNow = false; }
      }, 22);
    };

    // Deals are split by side: what they buy from you (negative price) and what they sell you.
    const picked = new Set<number>();
    let side: 0 | 1 = 1, row = 0, closing = false;
    const hard = (d: Deal) => !!d.block && d.block !== 'Not enough money';
    const lists = () => {
      const deals = traderDeals(w, ev);
      const ids = deals.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
      return { deals, mine: ids.filter((i) => deals[i]!.kind === 'spice'), theirs: ids.filter((i) => deals[i]!.kind !== 'spice') };
    };
    const sums = () => {
      const { deals } = lists();
      let pay = 0, get = 0;
      for (const i of picked) { const d = deals[i]; if (!d) continue; if (d.price >= 0) pay += d.price; else get -= d.price; }
      return { pay, get, net: get - pay, ok: w.s.money + get - pay >= 0 };
    };
    const toggle = (i: number) => {
      const d = traderDeals(w, ev)[i];
      if (!d || !w.s.events.includes(ev)) return;
      if (hard(d)) { audio.sfx('error'); talk(d.block!.startsWith('No room') ? 'full' : 'poor'); return; }
      if (picked.has(i)) picked.delete(i); else picked.add(i);
      audio.sfx('tap', { pitch: picked.has(i) ? 1.4 : 0.9, vol: 0.5 });
      render();
    };
    const accept = () => {
      if (!picked.size || !w.s.events.includes(ev)) { audio.sfx('error'); return; }
      const t = sums();
      if (!t.ok) { audio.sfx('error'); talk('cant'); return; }
      const deals = traderDeals(w, ev);
      // Sell first, so your sales pay for your buys.
      const order = [...picked].sort((a, b) => (deals[a]?.price ?? 0) - (deals[b]?.price ?? 0));
      const done: { icon: string; text: string }[] = [];
      let lastKind: Deal['kind'] | null = null;
      for (const i of order) {
        const d = traderDeals(w, ev)[i];
        const msg = takeDeal(w, ev, i);
        if (msg && d) { done.push({ icon: d.icon, text: d.price < 0 ? `Sold ${d.name.replace(/^Your /, '')} (+${money(-d.price)})` : `${d.name} (${money(d.price)})` }); lastKind = d.kind; }
      }
      picked.clear();
      if (done.length) {
        audio.sfx('coin');
        showLoot(w, 'Deal struck', done, '🛍️');
        st.hud.layoutAbilities();
      }
      if (!w.s.events.includes(ev)) talk('sold');
      else if (lastKind) talk(lastKind, { spice: 'spice' });
      render();
    };
    const close = () => {
      if (closing) return;
      closing = true;
      clearInterval(typing);
      window.removeEventListener('keydown', onKey, true);
      root.classList.add('out');
      setTimeout(() => { root.remove(); done(); }, 200);
    };

    let rowEls: HTMLElement[][] = [[], []];
    /** Move the highlight and show its description, without rebuilding the lists. */
    const highlight = () => {
      rowEls.forEach((els, c) => els.forEach((el, k) => el.classList.toggle('on', c === side && k === row)));
      const { deals, mine, theirs } = lists();
      const cur = deals[[mine, theirs][side][row]];
      desc.replaceChildren(...rarityText(cur ? `${cur.desc}${cur.block ? `  [${cur.block}]` : ''}` : ''));
    };
    const render = () => {
      const { deals, mine, theirs } = lists();
      const open = w.s.events.includes(ev);
      mineHead.innerHTML = '';
      mineHead.append(h('b', null, 'Your goods'), h('span', null, money(w.s.money)));
      theirsHead.innerHTML = '';
      theirsHead.append(h('b', null, first), h('span', null, `Hold ${w.cargoUsed}/${w.cargoCap}`));
      const cols: [HTMLElement, number[]][] = [[mineEl, mine], [theirsEl, theirs]];
      if (!cols[side][1].length) side = side ? 0 : 1;
      row = Math.min(row, Math.max(0, cols[side][1].length - 1));
      rowEls = [[], []];
      cols.forEach(([el, ids], c) => {
        el.innerHTML = '';
        ids.forEach((i, k) => {
          const d = deals[i]!;
          const rowEl = h('div', { class: 'bt-row' + (picked.has(i) ? ' in' : '') + (hard(d) ? ' off' : ''), role: 'option' },
            h('span', { class: 'bt-mark' }, picked.has(i) ? '▶' : ''),
            h('span', { class: 'bt-ic' }, d.icon), h('span', { class: 'bt-name' }, d.name),
            h('span', { class: 'bt-val' }, Math.abs(d.price) < 1 ? '—' : d.price < 0 ? `+${money(-d.price)}` : money(d.price)));
          // Hover only moves the highlight: rebuilding the rows under the pointer would swallow the click.
          rowEl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { side = c as 0 | 1; row = k; highlight(); } });
          rowEl.addEventListener('click', () => { side = c as 0 | 1; row = k; toggle(i); });
          rowEls[c].push(rowEl);
          el.append(rowEl);
        });
        if (!ids.length) el.append(h('div', { class: 'bt-empty' }, c === 0 ? 'Nothing they want. They buy spice.' : 'Sold out.'));
      });
      highlight();
      const t = sums();
      total.className = 'bt-total' + (t.ok ? '' : ' bad');
      total.textContent = picked.size ? `You pay ${money(t.pay)} · You get ${money(t.get)} · ${t.net >= 0 ? 'You gain' : 'Net cost'} ${money(Math.abs(t.net))}` : 'Tap items to add them to the deal.';
      keys.innerHTML = '';
      const key = (k: string, label: string, f: () => void, cls = '') => { const b = h('div', { class: 'ft-opt bt-key ' + cls, role: 'button' }, h('span', { class: 'ft-tag' }, `[${k}] `), label); b.addEventListener('click', f); keys.append(b); };
      if (open) key('A', 'Accept', accept, picked.size ? (t.ok ? 'on' : 'fail') : 'fail');
      if (picked.size) key('R', 'Reset', () => { picked.clear(); audio.sfx('remove'); render(); });
      const crates = w.count('crate');
      if (crates) key('C', `Open crate (${crates})`, () => openCrate(st, render));
      key('Tab', 'Leave', close);
      timer.textContent = open ? `Leaves in ${fmtTime(ev.until - w.s.t)}` : 'Packed up';
    };
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.sp-crate')) return;
      e.stopPropagation();
      const k = e.key.toLowerCase();
      const { mine, theirs } = lists();
      const cols = [mine, theirs];
      if (k === 'arrowdown' || k === 's') { row = Math.min(cols[side].length - 1, row + 1); highlight(); }
      else if (k === 'arrowup' || k === 'w') { row = Math.max(0, row - 1); highlight(); }
      else if ((k === 'arrowleft' || k === 'arrowright') && cols[side ? 0 : 1].length) { side = side ? 0 : 1; row = 0; highlight(); }
      else if (k === 'enter' || k === ' ') { const i = cols[side][row]; if (i !== undefined) toggle(i); }
      else if (k === 'a') accept();
      else if (k === 'r') { picked.clear(); render(); }
      else if (k === 'c' && w.count('crate')) openCrate(st, render);
      else if (k === 'tab' || k === 'escape') close();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    const tick = () => {
      if (!root.isConnected) return;
      timer.textContent = w.s.events.includes(ev) ? `Leaves in ${fmtTime(ev.until - w.s.t)}` : 'Packed up';
      setTimeout(tick, 500);
    };
    talk('browse');
    render();
    tick();
    audio.sfx('coin', { vol: 0.5 });
    st.game.hint('trader', 'Barter: tap goods on either side to add them to the deal, then Accept. Your sales pay for your buys. Traders leave when their timer runs out.', '🛍️');
  });
}
