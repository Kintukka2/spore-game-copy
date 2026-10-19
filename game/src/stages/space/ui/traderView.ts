// The wandering trader's shop: a focused page with the alien merchant at their stall, talking to you,
// and their wares laid out as cards.
import { button, h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { RNG } from '../../../engine/rng';
import { generateCreature } from '../../../design/generate';
import type { Design } from '../../../design/types';
import { speciesName } from '../../../game/names';
import { takeDeal, traderDeals } from '../events';
import type { GEvent } from '../types';
import type { SpaceStage } from '../stage';
import { fmtTime, money, portrait } from './common';
import { openCrate } from './crateOpen';

const TITLES = ['the Haggler', 'of the Long Road', 'the Starlane Peddler', 'the Bargainer', 'Junk-Prince', 'the Generous (Allegedly)'];
const LINES = {
  greet: [
    'Ah, a customer! Fresh off the starlanes, are we? Look, look, everything must go.',
    'Welcome, welcome! {name} sells only the finest and mostly legal goods.',
    'You have the look of someone with spare credits. My favourite kind of look.',
    'Step closer, traveller. These prices will not last. Neither will I. I leave soon!',
  ],
  tool: ['A wise choice. My other customers chose poorly.', 'Half price! I am practically robbing myself.', 'Pleasure doing business. No refunds! Kidding. Mostly.'],
  spice: ['Mmm, {spice}! My cousins will pay a fortune. I mean, a fair price.', 'Lovely stuff. Smell that? That is the smell of profit.'],
  crate: ['Ooh, the crate! Even I don\'t know what\'s in it. That\'s the fun part.', 'The crate is yours. If something inside it moves, it was not me.'],
  poor: ['Your purse is lighter than your ambitions, friend.', 'Credits first, wares second. That is the way of the lanes.'],
  full: ['Your hold can\'t take any more of those, friend.'],
  sold: ['You cleaned me out! Until the next starlane, friend.', 'Sold out! Time for me to find another sucker. I mean customer.'],
  gone: ['The starlanes call! Farewell, friend.'],
};

const merchants = new Map<number, { design: Design; name: string }>();
function merchant(seed: number) {
  let m = merchants.get(seed);
  if (!m) {
    const r = new RNG((seed ^ 0x7ade) >>> 0);
    const name = `${speciesName(r)} ${r.pick(TITLES)}`;
    m = { name, design: generateCreature(new RNG((seed ^ 0x51) >>> 0), { level: 3, diet: 'omnivore', name }) };
    merchants.set(seed, m);
  }
  return m;
}

export function openTrader(st: SpaceStage, ev: GEvent, onClose?: () => void) {
  const w = st.w;
  const m = merchant(ev.seed ?? ev.id);
  const r = new RNG(((ev.seed ?? ev.id) ^ Math.floor(performance.now())) >>> 0);
  const say = h('div', { class: 'tr-say' });
  const timer = h('span', { class: 'tr-timer' });
  const wares = h('div', { class: 'tr-wares' });
  const foot = h('div', { class: 'tr-foot' });
  let alive = true;
  const close = () => { alive = false; clearInterval(typing); root.remove(); onClose?.(); };
  const root = h('div', { class: 'sp-focus tr' },
    h('div', { class: 'sp-focus-head' }, h('h2', null, `🛍️ ${m.name.split(' ')[0]}'s stall`), timer, button('✕', () => { audio.sfx('click'); close(); }, { cls: 'icon', title: 'Leave' })),
    h('div', { class: 'tr-top' },
      h('div', { class: 'tr-booth' }, h('div', { class: 'tr-awning' }), portrait(m.design, 'tr-portrait'), h('div', { class: 'tr-name' }, m.name)),
      say),
    wares, foot);
  document.body.append(root);

  // Speech, typed out a letter at a time.
  let typing = 0;
  const talk = (key: keyof typeof LINES, vars: Record<string, string> = {}) => {
    let line = r.pick(LINES[key]).replace('{name}', m.name.split(' ')[0]);
    for (const [k, v] of Object.entries(vars)) line = line.replace(`{${k}}`, v);
    clearInterval(typing);
    say.textContent = '';
    let i = 0;
    typing = window.setInterval(() => {
      say.textContent = line.slice(0, ++i);
      if (i % 3 === 0) audio.sfx('tap', { vol: 0.12, pitch: 1.6 + Math.random() * 0.5 });
      if (i >= line.length) clearInterval(typing);
    }, 22);
  };

  const render = () => {
    if (!alive) return;
    const open = w.s.events.includes(ev);
    wares.innerHTML = '';
    traderDeals(w, ev).forEach((d, i) => {
      if (!d) { wares.append(h('div', { class: 'tr-card sold' }, h('div', { class: 'tr-ic' }, '✓'), h('b', null, 'Sold'), h('div', { class: 'tr-desc' }, 'Already yours.'))); return; }
      const label = d.price < 0 ? `Sell +${money(-d.price)}` : `Buy ${money(d.price)}`;
      const btn = button(label, () => {
        if (!w.s.events.includes(ev)) return;
        if (d.block) { talk(d.block.startsWith('No room') ? 'full' : 'poor'); audio.sfx('error'); return; }
        const msg = takeDeal(w, ev, i);
        if (!msg) { audio.sfx('error'); return; }
        st.ui.toast(msg, d.icon, 'good');
        if (!w.s.events.includes(ev)) talk('sold');
        else talk(d.kind, { spice: d.name.replace(/^Your \d+ /, '') });
        render();
      }, { cls: 'small ' + (d.block ? '' : 'gold'), disabled: !open });
      wares.append(h('div', { class: 'tr-card' + (d.block ? ' dim' : '') }, h('div', { class: 'tr-ic' }, d.icon), h('b', null, d.name), h('div', { class: 'tr-desc' }, d.desc), d.block ? h('div', { class: 'tr-block' }, d.block) : null, btn));
    });
    foot.innerHTML = '';
    foot.append(h('span', null, `💰 ${money(w.s.money)}`), h('span', null, `📦 Hold ${w.cargoUsed}/${w.cargoCap}`));
    const crates = w.count('crate');
    if (crates) foot.append(button(`📦 Open a crate (${crates})`, () => openCrate(st, render), { cls: 'small gold' }));
    if (!open) foot.append(button('Leave', () => close(), { cls: 'small primary' }));
  };

  const tick = () => {
    if (!alive || !root.isConnected) return;
    const open = w.s.events.includes(ev);
    timer.textContent = open ? `Leaves in ${fmtTime(ev.until - w.s.t)}` : 'Packed up';
    if (!open && !root.classList.contains('closed')) {
      root.classList.add('closed');
      if (ev.deals?.length) talk('gone');
      render();
    }
    setTimeout(tick, 250);
  };
  talk('greet');
  render();
  tick();
  audio.sfx('coin', { vol: 0.5 });
  st.game.hint('trader', `Traders buy and sell once per deal, and they leave when their timer runs out. Mystery crates go to your hold: open them whenever you like.`, '🛍️');
}
