// Looting, Fallout style: a terminal-framed list of what a container holds, with a highlighted item, its
// description, and Take all. Used for derelict wrecks.
import { h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { resolve as resolveEvent } from '../events';
import { giveSalvage, previewSalvage, rollSalvage } from '../salvage';
import { showLoot } from './scanCard';
import { rarityText } from './common';
import type { GEvent } from '../types';
import type { SpaceStage } from '../stage';

export interface LootItem { icon: string; text: string; desc: string }

/** Show a container's contents; resolves once you take everything. */
export function openLootBox(title: string, sub: string, items: LootItem[]): Promise<void> {
  return new Promise((done) => {
    const list = h('div', { class: 'lb-list' });
    const desc = h('div', { class: 'lb-desc' });
    const take = h('div', { class: 'ft-opt on lb-take', role: 'button' }, h('span', { class: 'ft-tag' }, '[E] '), 'Take all');
    const box = h('div', { class: 'ft-box lb-box' },
      h('div', { class: 'ft-tab' }, h('b', null, title), h('span', null, sub)),
      list, desc, take);
    const root = h('div', { class: 'ft ft-amber ft-loot' }, h('div', { class: 'ft-scan' }), box);
    document.body.append(root);
    let sel = 0, closing = false;
    const rows = items.map((it, i) => {
      const row = h('div', { class: 'lb-row' }, h('span', { class: 'lb-ic' }, it.icon), h('span', null, it.text));
      row.addEventListener('pointerenter', () => { sel = i; show(); });
      row.addEventListener('click', () => { sel = i; show(); });
      list.append(row);
      return row;
    });
    if (!items.length) list.append(h('div', { class: 'lb-row' }, 'Empty. Someone got here first.'));
    /** Move the highlight in place, so the rows under the pointer stay put. */
    const show = () => {
      rows.forEach((r, i) => r.classList.toggle('on', i === sel));
      desc.replaceChildren(...rarityText(items[sel]?.desc ?? ''));
    };
    const close = () => {
      if (closing) return;
      closing = true;
      window.removeEventListener('keydown', onKey, true);
      audio.sfx('pop', { pitch: 1.3 });
      root.classList.add('out');
      setTimeout(() => { root.remove(); done(); }, 200);
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      const k = e.key.toLowerCase();
      if (k === 'arrowdown' || k === 's') { sel = Math.min(items.length - 1, sel + 1); show(); e.preventDefault(); }
      else if (k === 'arrowup' || k === 'w') { sel = Math.max(0, sel - 1); show(); e.preventDefault(); }
      else if (k === 'e' || k === 'enter' || k === ' ' || k === 'escape') { e.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey, true);
    take.addEventListener('click', close);
    audio.sfx('whoosh', { pitch: 0.7 });
    show();
  });
}

const ADJ = ['Silent', 'Broken', 'Drifting', 'Last', 'Scorched', 'Forgotten', 'Lonely', 'Gutted'];
const NOUN = ['Kestrel', 'Lantern', 'Mule', 'Wanderer', 'Comet', 'Pilgrim', 'Harrow', 'Moth'];

/** Salvage a derelict wreck: roll what is aboard, show it, and hand it over on Take all. */
export async function openWreck(st: SpaceStage, ev: GEvent) {
  const w = st.w;
  if (!w.s.events.includes(ev)) return;
  const seed = ev.id * 7919;
  const name = `${ADJ[seed % ADJ.length]} ${NOUN[(seed >> 3) % NOUN.length]}`;
  const loot = rollSalvage(w, 'wreck');
  const scrap = 3000 + Math.floor(Math.random() * 6) * 1000;
  const items: LootItem[] = [{ icon: '💰', text: `§${scrap.toLocaleString('en-US')} in scrap`, desc: 'Hull metal and wiring, sold by the tonne.' }, ...previewSalvage(loot)];
  await openLootBox(`Derelict · ${name}`, w.planet(ev.star, ev.planet).name, items);
  w.addMoney(scrap);
  const got = giveSalvage(w, loot);
  resolveEvent(w, ev);
  w.counter('wrecks');
  showLoot(w, `Salvaged the ${name}`, [{ icon: '💰', text: `§${scrap.toLocaleString('en-US')} in scrap` }, ...got], '🛰️');
  st.game.hint('blueprints', 'Advanced parts need a 📐 blueprint and the components it lists, on top of rank. Find them in wrecks, ruins and relics, buy them from traders, or earn them from empire missions.', '📐');
  st.hud.layoutAbilities();
}
