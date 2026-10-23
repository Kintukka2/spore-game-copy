// The scan report: a rich toast that says what a scan found (habitability, spice, life, signals and pay).
import { h, ui } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { article } from '../../../engine/math';
import { SPICE, tScoreOf } from '../data';
import { canColonize, isHomeworld } from '../economy';
import { EVENT_INFO } from '../events';
import { lifeOn, type ScanResult } from '../scan';
import { landingBlock } from '../surface/look';
import { BUYERS, buyerAt, inXenopedia } from '../xenolab';
import type { World } from '../world';
import { money } from './common';

function airWord(a: number) { return a < 0.2 ? 'Thin air' : a > 0.8 ? 'Dense air' : 'Fair air'; }
function heatWord(t: number) { return t < 0.2 ? 'Frozen' : t < 0.38 ? 'Cold' : t > 0.8 ? 'Scorching' : t > 0.62 ? 'Hot' : 'Mild'; }

/** Species counts on a world: plants and animals, and how many of each are not in the Xenopedia yet. */
function census(w: World, star: number, idx: number) {
  const c = { plants: 0, plantsNew: 0, animals: 0, animalsNew: 0 };
  for (const sp of lifeOn(w, star, idx)) {
    const fresh = !inXenopedia(w, sp);
    if (sp.diet === 'plant') { c.plants++; if (fresh) c.plantsNew++; } else { c.animals++; if (fresh) c.animalsNew++; }
  }
  return c;
}

function stars(t: number) { return '★'.repeat(t) + '☆'.repeat(3 - t); }

function ownerOf(w: World, star: number, idx: number): { text: string; color: string } {
  const o = w.peekPS(star, idx).owner;
  if (o === 'player') return { text: isHomeworld(w, star, idx) ? 'Your homeworld' : 'Your colony', color: '#3ee6c4' };
  if (o === 'hollow') return { text: 'Hollow', color: '#ff8a96' };
  const e = o ? w.emap.get(o) : null;
  return e ? { text: e.name, color: e.color } : { text: 'Unclaimed', color: 'var(--ink-dim)' };
}

function lifeLine(n: number, fresh: number, icon: string, one: string, many: string): HTMLElement | null {
  if (!n) return null;
  return h('span', { class: 'sc-life' }, `${icon} ${n} ${n === 1 ? one : many}`, fresh ? h('i', null, `${fresh} undiscovered`) : h('em', null, 'all known'));
}

/** One world in full. */
function single(w: World, r: ScanResult): HTMLElement {
  const pl = w.planet(r.star, r.idx), ps = w.peekPS(r.star, r.idx);
  const own = ownerOf(w, r.star, r.idx);
  const box = h('div', { class: 'sc' });
  box.append(h('div', { class: 'sc-h' }, h('b', null, `🔍 ${pl.name}`), r.pay ? h('span', { class: 'sc-pay' }, `+${money(r.pay)}`) : h('span', { class: 'sc-re' }, r.first ? 'Scanned' : 'Re-scan')));
  if (ps.destroyed) {
    box.append(h('div', { class: 'sc-sub' }, 'Shattered. Only rubble orbits here.'));
    return box;
  }
  const t = pl.kind === 'gas' ? -1 : tScoreOf(ps.atm, ps.temp);
  box.append(h('div', { class: 'sc-sub' },
    pl.kind === 'gas' ? 'Gas giant · no surface' : `T${t} ${stars(t)} · ${airWord(ps.atm)} · ${heatWord(ps.temp)}`,
    ' · ', h('span', { style: `color:${own.color}` }, own.text)));
  const chips = h('div', { class: 'sc-chips' });
  if (pl.spice) chips.append(h('span', { class: 'sc-chip' }, h('i', { class: 'sp-dot', style: `background:${SPICE[pl.spice].hex}` }), `${SPICE[pl.spice].name} ${'●'.repeat(Math.max(1, Math.round(pl.richness * 2)))}`));
  else chips.append(h('span', { class: 'sc-chip dim' }, 'No spice'));
  if (pl.kind !== 'gas') {
    if (canColonize(w, r.star, r.idx) === null) chips.append(h('span', { class: 'sc-chip ok' }, ps.owner === 'player' ? '🏗️ Room for a city' : '🏗️ Can colonise'));
    if (!landingBlock(pl, ps, !!w.star(r.star).hollow)) chips.append(h('span', { class: 'sc-chip ok' }, '🛬 Landable'));
  }
  const zoo = buyerAt(w, r.star, r.idx);
  if (zoo) chips.append(h('span', { class: 'sc-chip' }, `${BUYERS[zoo].icon} Zoo buys ${BUYERS[zoo].wants}`));
  box.append(chips);
  const c = census(w, r.star, r.idx);
  const life = [lifeLine(c.plants, c.plantsNew, '🌿', 'plant species', 'plant species'), lifeLine(c.animals, c.animalsNew, '🐾', 'animal species', 'animal species')].filter((x): x is HTMLElement => !!x);
  box.append(life.length ? h('div', { class: 'sc-lives' }, ...life) : h('div', { class: 'sc-sub' }, pl.kind === 'gas' ? 'No life can take root here.' : 'No life signs.'));
  for (const f of r.finds) box.append(h('div', { class: 'sc-find' }, f.icon, ' ', f.text));
  for (const ev of w.s.events) {
    if (ev.star !== r.star || ev.planet !== r.idx) continue;
    const info = EVENT_INFO[ev.kind];
    box.append(h('div', { class: 'sc-find' + (info.good ? '' : ' bad') }, `${info.icon} ${info.label}: ${ev.kind === 'rare' && ev.sp ? `${article(ev.sp.name, true)} ${ev.sp.name} roams here. ` : ''}${info.how}`));
  }
  return box;
}

/** A whole system, one line per world. */
function sweep(w: World, rs: ScanResult[]): HTMLElement {
  const pay = rs.reduce((a, r) => a + r.pay, 0);
  const box = h('div', { class: 'sc' });
  box.append(h('div', { class: 'sc-h' }, h('b', null, `🔍 ${w.star(rs[0].star).name} sweep · ${rs.length} worlds`), pay ? h('span', { class: 'sc-pay' }, `+${money(pay)}`) : h('span', { class: 'sc-re' }, 'Re-scan')));
  for (const r of rs) {
    const pl = w.planet(r.star, r.idx), ps = w.peekPS(r.star, r.idx);
    const c = census(w, r.star, r.idx);
    const fresh = c.plantsNew + c.animalsNew;
    const t = pl.kind === 'gas' ? -1 : tScoreOf(ps.atm, ps.temp);
    box.append(h('div', { class: 'sc-row' },
      h('b', null, pl.name),
      h('span', { class: 'sc-t' }, ps.destroyed ? 'rubble' : t < 0 ? 'gas' : stars(t)),
      pl.spice ? h('i', { class: 'sp-dot', style: `background:${SPICE[pl.spice].hex}` }) : h('i', { class: 'sp-dot', style: 'visibility:hidden' }),
      h('span', { class: 'sc-n' }, c.plants + c.animals ? `🌿${c.plants} 🐾${c.animals}` : '—'),
      fresh ? h('i', { class: 'sc-new' }, `${fresh} new`) : h('span'),
      r.finds.length || w.s.events.some((e) => e.star === r.star && e.planet === r.idx) ? h('span', null, r.finds[0]?.icon ?? EVENT_INFO[w.s.events.find((e) => e.star === r.star && e.planet === r.idx)!.kind].icon) : h('span')));
  }
  for (const r of rs) for (const f of r.finds) box.append(h('div', { class: 'sc-find' }, f.icon, ' ', `${w.planet(r.star, r.idx).name}: ${f.text}`));
  return box;
}

/** An itemised card for a haul of several things at once (relics, salvage, mission bonuses, deals). */
export function showLoot(w: World, title: string, items: { icon: string; text: string }[], icon = '🎁') {
  if (!items.length) return;
  const box = h('div', { class: 'sc lc' }, h('div', { class: 'sc-h' }, h('b', null, `${icon} ${title}`)));
  for (const it of items) box.append(h('div', { class: 'lc-row' }, h('span', { class: 'lc-ic' }, it.icon), h('span', null, it.text)));
  const t = ui.toast(box, { kind: 'scan', ms: 3600 + items.length * 500 });
  t.addEventListener('pointerdown', () => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, { once: true });
  audio.sfx('coin', { vol: 0.5 });
  void w;
}

/** Pop the report for one scan, or a sweep of several. */
export function showScan(w: World, rs: ScanResult[]) {
  if (!rs.length) return;
  const el = rs.length === 1 ? single(w, rs[0]) : sweep(w, rs);
  const t = ui.toast(el, { kind: 'scan', ms: rs.length === 1 ? 3600 : 5200 });
  t.addEventListener('pointerdown', () => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, { once: true });
  audio.sfx('zap', { pitch: 1.5 });
  const pay = rs.reduce((a, r) => a + r.pay, 0);
  if (pay) setTimeout(() => audio.sfx('coin', { vol: 0.6 }), 250);
  const fresh = rs.some((r) => lifeOn(w, r.star, r.idx).some((sp) => !inXenopedia(w, sp)));
  if (fresh && rs.some((r) => r.first)) setTimeout(() => audio.sfx('pop', { pitch: 1.4 }), 450);
}
