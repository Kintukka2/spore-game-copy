// Xeno-Lab tab of the ship sheet: specimens aboard, the Gene Splicer, the Menagerie and the Xenopedia.
import { button, h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import type { SpaceStage } from '../stage';
import { canExhibitHere, crowd, exhibit, GRANT, retire, SPLICE_COST, syncCatalog, ZOO_CAP, ZOO_RATE, zooRate } from '../xenolab';
import { dietIcon, money, specimenThumb } from './common';

const XENO_SHOWN = 48;

function stat(icon: string, v: string, label: string): HTMLElement {
  return h('div', { class: 'xl-stat' }, h('span', { class: 'xl-si' }, icon), h('b', null, v), h('span', null, label));
}

/** Render the lab into B. `pick` holds the cargo indices chosen for splicing (kept by the caller across re-renders). */
export function renderLab(st: SpaceStage, B: HTMLElement, pick: number[], rerender: () => void) {
  const w = st.w;
  const back = syncCatalog(w);
  if (back) st.ui.toast(`Catalogued the specimens already aboard: ${money(back)} in research grants.`, '📖', 'good');
  const zoo = w.s.zoo ?? [];
  const cat = w.s.catalog ?? [];
  const here = canExhibitHere(w);
  B.append(h('div', { class: 'sp-mini' }, 'Specimens are living samples. Every new species earns a research grant, exhibits earn tourism every minute, and any two animals can be spliced into a hybrid.'));
  B.append(h('div', { class: 'xl-stats' },
    stat('📖', String(cat.length), 'species catalogued'),
    stat('🏛️', `${zoo.length}/${ZOO_CAP}`, `on show · ${money(zooRate(w))}/min`),
    stat('🧬', String(w.s.counters.hybrids ?? 0), 'hybrids spliced')));

  // Specimens aboard
  B.append(h('div', { class: 'sp-section' }, `Specimens aboard (${w.s.specimens.length})`));
  if (!w.s.specimens.length) B.append(h('div', { class: 'sp-mini' }, 'None yet. Fly to a living world, open it, and use Life → Beam up.'));
  w.s.specimens.forEach((sp, i) => {
    const picked = pick.includes(i);
    const ex = button('🏛️ Exhibit', () => {
      const err = exhibit(w, i);
      if (err) { st.ui.toast(err, '🏛️'); audio.sfx('error'); return; }
      audio.sfx('success');
      st.ui.toast(`${sp.name} joins the Menagerie: +${money(ZOO_RATE * crowd(sp))}/min in tourism.`, '🏛️', 'good');
      pick.length = 0;
      rerender();
    }, { cls: 'small' + (here ? ' gold' : '') });
    const sel = button(picked ? '✓ Picked' : '🧬 Splice', () => {
      if (picked) pick.splice(pick.indexOf(i), 1);
      else { pick.push(i); if (pick.length > 2) pick.shift(); }
      audio.sfx('tap');
      rerender();
    }, { cls: 'small' + (picked ? ' primary' : '') });
    B.append(h('div', { class: 'sp-item xl-row' + (picked ? ' picked' : '') }, specimenThumb(w, sp, 64, 44),
      h('div', { class: 'sp-txt' }, h('b', null, sp.name, sp.hybrid ? h('span', { class: 'xl-tag' }, 'Hybrid') : sp.rare ? h('span', { class: 'xl-tag' }, 'Rare') : null),
        sp.hybrid ? (sp.parents ? sp.parents.join(' × ') : 'Fits any animal slot') : `${dietIcon(sp.diet)} ${sp.diet}`),
      h('div', { class: 'xl-btns' }, ex, sel)));
  });

  // Gene Splicer
  if (w.s.specimens.length >= 2) {
    const [a, b] = pick.map((i) => w.s.specimens[i]);
    const box = h('div', { class: 'xl-splice' });
    if (a && b) {
      box.append(h('div', null, h('b', null, `${a.name} × ${b.name}`), ' → a brand-new hybrid you can name and tweak'),
        button(`🧬 Splice · ${money(SPLICE_COST)}`, () => { const [i, j] = pick; pick.length = 0; void st.spliceHybrid(i, j); }, { cls: 'primary', disabled: w.s.money < SPLICE_COST }));
    } else {
      box.append(h('div', { class: 'dim' }, a ? `Pick one more specimen to splice with ${a.name}.`
        : 'Gene Splicer: tap 🧬 Splice on two specimens to fuse them. Hybrids fit any animal ecosystem slot and draw triple crowds at the Menagerie.'));
    }
    B.append(box);
  }

  // Menagerie
  B.append(h('div', { class: 'sp-section' }, `🏛️ Menagerie · ${money(zooRate(w))}/min`));
  B.append(h('div', { class: 'sp-mini' }, here
    ? 'You are in your own space: exhibit specimens from the list above. Tap an exhibit to take it back aboard.'
    : `Exhibit specimens while in your home system (${w.star(w.gal.homeStar).name}) or any colony system. Each pays ${money(ZOO_RATE)}/min, hybrids ${money(ZOO_RATE * 3)}/min.`));
  if (zoo.length) {
    const grid = h('div', { class: 'xl-grid' });
    zoo.forEach((z, i) => {
      const cell = h('div', { class: 'xl-cell' + (z.hybrid || z.rare ? ' hy' : ''), title: here ? 'Tap to take it back aboard' : z.name }, specimenThumb(w, z, 70, 44), h('span', null, z.name));
      if (here) cell.addEventListener('click', () => {
        const err = retire(w, i);
        if (err) { st.ui.toast(err, '🏛️'); audio.sfx('error'); return; }
        audio.sfx('remove');
        rerender();
      });
      grid.append(cell);
    });
    B.append(grid);
  }

  // Xenopedia
  B.append(h('div', { class: 'sp-section' }, `📖 Xenopedia · ${cat.length} species`));
  if (!cat.length) {
    B.append(h('div', { class: 'sp-mini' }, `Collect a species for the first time to catalogue it: ${money(GRANT.animal)} per animal, ${money(GRANT.plant)} per plant, ${money(GRANT.hybrid)} per hybrid. Look for NEW on a world's Life tab.`));
  } else {
    const grid = h('div', { class: 'xl-grid small' });
    for (const c of cat.slice(-XENO_SHOWN).reverse()) grid.append(h('div', { class: 'xl-cell' + (c.hybrid || c.rare ? ' hy' : ''), title: c.name }, specimenThumb(w, c, 56, 36), h('span', null, c.name)));
    B.append(grid);
    if (cat.length > XENO_SHOWN) B.append(h('div', { class: 'sp-mini' }, `…and ${cat.length - XENO_SHOWN} more.`));
  }
  B.append(h('div', { class: 'sp-section' }, 'Also'));
  B.append(h('div', { class: 'sp-mini' }, '🌿 Release specimens into the ecosystem slots of terraformed worlds (open a planet → Life → tap an empty slot). A complete row locks in that T-score.'));
}
