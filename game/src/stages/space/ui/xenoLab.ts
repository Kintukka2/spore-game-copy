// The Xeno-Lab: a building on your homeworld (opened from the HUD while you are home, or from the homeworld's
// planet panel). Specimens aboard, the Gene Splicer, the Menagerie and the Xenopedia.
import { button, h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import type { SpaceStage } from '../stage';
import { canExhibitHere, crowd, exhibit, GRANT, retire, SPLICE_COST, syncCatalog, ZOO_CAP, ZOO_RATE, zooRate } from '../xenolab';
import { dietIcon, money, sheet, specimenThumb } from './common';

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
  const splicable = (i: number) => !!w.s.specimens[i] && w.s.specimens[i].diet !== 'plant';
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
      h('div', { class: 'xl-btns' }, ex, splicable(i) ? sel : null)));
  });

  // Gene Splicer
  if (w.s.specimens.filter((_, i) => splicable(i)).length >= 2) {
    const [a, b] = pick.map((i) => w.s.specimens[i]);
    const box = h('div', { class: 'xl-splice' });
    if (a && b) {
      box.append(h('div', null, h('b', null, `${a.name} × ${b.name}`), ' → a brand-new hybrid you can name and tweak'),
        button(`🧬 Splice · ${money(SPLICE_COST)}`, () => { const [i, j] = pick; pick.length = 0; void st.spliceHybrid(i, j); }, { cls: 'primary', disabled: w.s.money < SPLICE_COST }));
    } else {
      box.append(h('div', { class: 'dim' }, a ? `Pick one more specimen to splice with ${a.name}.`
        : 'Gene Splicer: tap 🧬 Splice on two animals to fuse them (plants can\'t be spliced). Hybrids fit any animal ecosystem slot and draw triple crowds at the Menagerie.'));
    }
    B.append(box);
  }

  // Menagerie
  B.append(h('div', { class: 'sp-section' }, `🏛️ Menagerie · ${money(zooRate(w))}/min`));
  B.append(h('div', { class: 'sp-mini' }, here
    ? `Exhibit specimens from the list above: each pays ${money(ZOO_RATE)}/min, hybrids and rares ${money(ZOO_RATE * 3)}/min. Tap an exhibit to take it back aboard.`
    : `The Menagerie is on ${w.star(w.gal.homeStar).name}. Come home to exhibit specimens.`));
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

/** Open the Xeno-Lab. It is a building on your homeworld, so it only opens while you are in your home system. */
export function openLab(st: SpaceStage) {
  const w = st.w;
  if (w.s.loc !== w.gal.homeStar || w.inWarp) {
    st.ui.toast(`The Xeno-Lab is on your homeworld. Fly home to ${w.star(w.gal.homeStar).name} to use it.`, '🧬');
    audio.sfx('error');
    return;
  }
  const sh = sheet('🧬 Xeno-Lab');
  const pick: number[] = [];
  const render = () => { sh.body.innerHTML = ''; renderLab(st, sh.body, pick, render); };
  render();
}
