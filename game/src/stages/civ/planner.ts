// City Planner: a schematic of the city's slots around its hall, with adjacency links,
// building/turret placement, happiness and output, and vehicle production for that city.
import { audio } from '../../engine/audio';
import { button, h } from '../../engine/ui';
import { TAU } from '../../engine/math';
import { designSprite, drawSprite, turretSprite } from './sprites';
import { PK } from './fx';
import { TURRET_HP } from './world';
import { editBuilding } from './flow';
import {
  BUILD_COST, BUILD_ICON, BUILD_NAME, fmtMoney, PLAYER, ROLE_ICON, slotPos, TUR_RX, TUR_RY, turretPos,
  type BuildingKind, type City,
} from './types';
import type { CivStage } from './stage';

type Sel = { k: 'slot'; i: number } | { k: 'tur'; i: number } | null;

const LINK = {
  good: '#7dffb0', bad: '#ff6b5a', money: '#ffd166', neutral: 'rgba(255,255,255,0.55)',
};

export function openPlanner(S: CivStage, city: City, el: HTMLElement, close: () => void) {
  S.hold('planner', true);
  let c = city;
  let sel: Sel = null;
  el.innerHTML = '';
  el.style.display = 'flex';
  el.classList.add('civ-planner');
  const head = h('div', { class: 'sh-head' });
  const body = h('div', { class: 'sh-body scroll' });
  el.append(head, body);
  const cv = h('canvas', { 'aria-label': 'City layout' }) as HTMLCanvasElement;
  const stats = h('div', { class: 'civ-pl-stats' });
  const actions = h('div', { class: 'col', style: 'gap:8px' });

  const econ = () => {
    const e = S.sim.cityEconomy(c);
    c.happy = e.happy;
    c.output = e.output;
    return e;
  };

  const header = () => {
    head.innerHTML = '';
    head.append(
      h('div', { class: 'grow col', style: 'gap:0;min-width:0' },
        h('b', { style: 'font-size:17px' }, `🏛️ ${c.name}`),
        h('span', { class: 'dim', style: 'font-size:12.5px' }, `${ROLE_ICON[c.type]} ${c.type} city · ${c.large ? 'large' : 'small'} · time paused`)),
      button('✕', close, { cls: 'icon ghost', title: 'Close' }));
  };

  const cities = () => {
    const mine = S.cities.filter((q) => q.owner === PLAYER);
    if (mine.length < 2) return null;
    const row = h('div', { class: 'civ-filters' });
    for (const q of mine) row.append(button(`${q.happy < 0 ? '😠' : q.happy > 0 ? '😊' : '😐'} ${q.name}`, () => { c = q; sel = null; S.hud.buildCity = q.id; S.focus(q.x, q.y + 30); refresh(); }, { cls: 'cbtn' + (q === c ? ' on' : '') }));
    return row;
  };

  // ---------------------------------------------------------------- canvas
  let geo = { cx: 0, cy: 0, s: 1, w: 0, h: 0 };
  const draw = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 340, hh = cv.clientHeight || 230;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const s = Math.min((w / 2 - 26) / TUR_RX, (hh / 2 - 26) / (TUR_RY + 12));
    const cx = w / 2, cy = hh / 2 + 4;
    geo = { cx, cy, s, w, h: hh };
    const e = econ();
    const art = S.art[PLAYER];
    // Plaza
    g.fillStyle = 'rgba(221,210,186,0.9)';
    g.beginPath(); g.ellipse(cx, cy, 108 * s, 73 * s, 0, 0, TAU); g.fill();
    const n = c.slots.length;
    const pos = (i: number) => { const p = slotPos(i, n); return { x: cx + p.x * s, y: cy + p.y * s }; };
    const kindAt = (i: number) => c.slots[(i + n) % n].kind;
    // Links: hall to each building, and ring neighbours.
    const link = (ax: number, ay: number, bx: number, by: number, col: string, tag: string) => {
      g.strokeStyle = col;
      g.lineWidth = col === LINK.neutral ? 2 : 4;
      g.setLineDash(col === LINK.neutral ? [5, 5] : []);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.setLineDash([]);
      if (tag) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        g.fillStyle = 'rgba(8,16,28,0.85)';
        g.beginPath(); g.arc(mx, my, 9, 0, TAU); g.fill();
        g.fillStyle = col;
        g.font = '700 10px Fredoka, system-ui, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(tag, mx, my + 0.5);
      }
    };
    for (let i = 0; i < n; i++) {
      const k = kindAt(i);
      if (!k) continue;
      const p = pos(i);
      if (k === 'factory') link(cx, cy - 6, p.x, p.y, LINK.money, '§');
      else if (k === 'fun') link(cx, cy - 6, p.x, p.y, LINK.good, '+');
      else link(cx, cy - 6, p.x, p.y, LINK.neutral, '');
    }
    for (let i = 0; i < n; i++) {
      const a = kindAt(i), b = kindAt(i + 1);
      if (!a || !b) continue;
      const p = pos(i), q = pos(i + 1);
      const pair = [a, b].sort().join('-');
      if (pair === 'factory-house') link(p.x, p.y, q.x, q.y, LINK.money, '§');
      else if (pair === 'fun-house') link(p.x, p.y, q.x, q.y, LINK.good, '+');
      else if (pair === 'factory-fun') link(p.x, p.y, q.x, q.y, LINK.bad, '−');
      else link(p.x, p.y, q.x, q.y, LINK.neutral, '');
    }
    // Buildings (back to front).
    type Item = { y: number; fn: () => void };
    const items: Item[] = [];
    items.push({ y: cy, fn: () => drawSprite(g, designSprite(art.hall, c.large ? 76 : 66), cx, cy + 4, s * 0.62) });
    for (let i = 0; i < n; i++) {
      const p = pos(i);
      const k = c.slots[i].kind;
      const on = sel?.k === 'slot' && sel.i === i;
      items.push({ y: p.y, fn: () => {
        if (on) { g.strokeStyle = '#3ee6c4'; g.lineWidth = 3; g.beginPath(); g.ellipse(p.x, p.y, 22, 13, 0, 0, TAU); g.stroke(); }
        if (!k) {
          g.strokeStyle = on ? '#3ee6c4' : 'rgba(255,255,255,0.75)';
          g.lineWidth = 2;
          g.setLineDash([4, 4]);
          g.beginPath(); g.ellipse(p.x, p.y, 17, 10, 0, 0, TAU); g.stroke();
          g.setLineDash([]);
          g.fillStyle = '#ffffff';
          g.font = '700 16px Fredoka, system-ui, sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('+', p.x, p.y);
          return;
        }
        const d = k === 'house' ? art.house : k === 'factory' ? art.factory : art.fun;
        drawSprite(g, designSprite(d, k === 'house' ? 24 : k === 'factory' ? 30 : 28), p.x, p.y + 4, s * 0.95);
        if (k === 'factory') {
          const out = e.factoryOut[i] * (e.happy < 0 ? 0 : e.happy > 0 ? 1.25 : 1);
          g.font = '700 11px Fredoka, system-ui, sans-serif';
          g.textAlign = 'center';
          g.lineWidth = 3; g.strokeStyle = 'rgba(8,16,28,0.8)';
          const txt = `+${Math.round(out)}/s`;
          g.strokeText(txt, p.x + 16, p.y - 30);
          g.fillStyle = out > 0 ? '#ffd166' : '#ff8a7a';
          g.fillText(txt, p.x + 16, p.y - 30);
        }
      } });
    }
    const nt = c.turrets.length;
    for (let i = 0; i < nt; i++) {
      const tp = turretPos(i, nt);
      const p = { x: cx + tp.x * s, y: cy + tp.y * s };
      const tu = c.turrets[i];
      const on = sel?.k === 'tur' && sel.i === i;
      items.push({ y: p.y, fn: () => {
        if (on) { g.strokeStyle = '#3ee6c4'; g.lineWidth = 3; g.beginPath(); g.ellipse(p.x, p.y, 18, 11, 0, 0, TAU); g.stroke(); }
        if (tu.alive) drawSprite(g, turretSprite(c.type, S.nations[PLAYER].color), p.x, p.y + 3, s * 0.85);
        else {
          g.fillStyle = "rgba(120,110,95,0.35)"; g.beginPath(); g.ellipse(p.x, p.y, 10, 6, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,209,102,0.85)';
          g.lineWidth = 1.6;
          g.setLineDash([3, 3]);
          g.beginPath(); g.arc(p.x, p.y - 4, 11, 0, TAU); g.stroke();
          g.setLineDash([]);
        }
      } });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.fn();
  };

  cv.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const r = cv.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best: Sel = null, bd = 30 * 30;
    const n = c.slots.length;
    for (let i = 0; i < n; i++) {
      const p = slotPos(i, n);
      const d = (geo.cx + p.x * geo.s - x) ** 2 + (geo.cy + p.y * geo.s - y) ** 2;
      if (d < bd) { bd = d; best = { k: 'slot', i }; }
    }
    const nt = c.turrets.length;
    for (let i = 0; i < nt; i++) {
      const p = turretPos(i, nt);
      const d = (geo.cx + p.x * geo.s - x) ** 2 + (geo.cy + p.y * geo.s - 6 - y) ** 2;
      if (d < bd) { bd = d; best = { k: 'tur', i }; }
    }
    sel = best;
    audio.sfx(best ? 'tap' : 'click');
    refresh();
  });

  // ---------------------------------------------------------------- stats & actions
  const renderStats = () => {
    const e = econ();
    const houses = c.slots.filter((q) => q.kind === 'house').length;
    const tAlive = c.turrets.filter((t) => t.alive).length;
    stats.innerHTML = '';
    stats.append(
      h('div', null, h('b', null, `${e.happy > 0 ? '😊' : e.happy < 0 ? '😠' : '😐'} ${e.happy > 0 ? '+' : ''}${e.happy}`), e.happy < 0 ? 'Unhappy!' : e.happy > 0 ? 'Bonus +25%' : 'Content'),
      h('div', null, h('b', null, `${fmtMoney(e.output)}`), 'per second'),
      h('div', null, h('b', null, `🚙 ${S.sim.vehiclesOf(c)}/${S.sim.vehicleCap(c)}`), `${houses} houses`),
      h('div', null, h('b', null, `🗼 ${tAlive}/${c.turrets.length}`), 'turrets'),
    );
  };

  const place = (i: number, k: BuildingKind) => {
    const cost = BUILD_COST[k];
    if (S.money < cost) { audio.sfx('error'); S.toast(`You need ${fmtMoney(cost)}.`, '💸', 'bad'); return; }
    const old = c.slots[i].kind;
    if (old) S.money += BUILD_COST[old] * 0.5;
    S.money -= cost;
    c.slots[i].kind = k;
    c.slots[i].off = 0;
    audio.sfx('build');
    const p = slotPos(i, c.slots.length);
    S.fx.burst(PK.Smoke, c.x + p.x, c.y + p.y, 8, 30, { life: 0.9, size: 7, grow: 10, color: '#e8e2d6' });
    S.game.stat('civ-buildings');
    const e = econ();
    if (e.happy < 0) S.toast(`${c.name} is unhappy: production stops. Add entertainment away from factories.`, '😠', 'bad');
    refresh();
  };

  const renderActions = () => {
    actions.innerHTML = '';
    if (!sel) {
      actions.append(h('div', { class: 'dim', style: 'font-size:13px' }, 'Tap a slot to build. Factories earn § for each linked house (and the hall). Entertainment adds happiness next to houses, but angers factory workers.'));
      S.hud.buildRows(c, actions);
      const designs = h('div', { class: 'civ-filters' },
        h('span', { class: 'dim', style: 'font-size:12.5px;align-self:center' }, 'Restyle:'),
        button('🏛️ Hall', () => editBuilding(S, 'cityhall'), { cls: 'cbtn' }),
        button('🏠', () => editBuilding(S, 'house'), { cls: 'cbtn', title: 'House design' }),
        button('🏭', () => editBuilding(S, 'factory'), { cls: 'cbtn', title: 'Factory design' }),
        button('🎡', () => editBuilding(S, 'entertainment'), { cls: 'cbtn', title: 'Entertainment design' }));
      actions.append(designs);
      return;
    }
    if (sel.k === 'slot') {
      const i = sel.i;
      const cur = c.slots[i].kind;
      actions.append(h('div', { class: 'row' },
        h('b', { class: 'grow' }, cur ? `${BUILD_ICON[cur]} ${BUILD_NAME[cur]}` : 'Empty slot'),
        cur ? button(`Sell +${fmtMoney(BUILD_COST[cur] * 0.5)}`, () => { S.money += BUILD_COST[cur] * 0.5; c.slots[i].kind = null; audio.sfx('remove'); refresh(); }, { cls: 'cbtn danger' }) : null));
      const pick = h('div', { class: 'civ-pl-pick' });
      for (const k of ['house', 'factory', 'fun'] as BuildingKind[]) {
        if (k === cur) continue;
        const b = button(`${BUILD_ICON[k]} ${BUILD_NAME[k]} ${fmtMoney(BUILD_COST[k])}`, () => place(i, k), { cls: S.money >= BUILD_COST[k] ? '' : 'cant' });
        if (S.money < BUILD_COST[k]) b.style.opacity = '0.55';
        pick.append(b);
      }
      actions.append(pick);
      actions.append(h('div', { class: 'dim', style: 'font-size:12px' }, '🏠 +1 vehicle and boosts linked factories · 🏭 −1 happiness, +§10/s per link · 🎡 +1 happiness per house or hall link, −1 per factory link'));
      return;
    }
    const tu = c.turrets[sel.i];
    if (tu.alive) {
      actions.append(h('div', { class: 'row' }, h('b', { class: 'grow' }, `🗼 Turret · ${Math.ceil(tu.hp)}/${TURRET_HP}`),
        button(`Sell +${fmtMoney(BUILD_COST.turret * 0.5)}`, () => { tu.alive = false; S.money += BUILD_COST.turret * 0.5; audio.sfx('remove'); refresh(); }, { cls: 'cbtn danger' })));
      actions.append(h('div', { class: 'dim', style: 'font-size:12.5px' }, 'Turrets shoot raiders and resist religious conversion.'));
    } else {
      actions.append(button(`🗼 Build turret ${fmtMoney(BUILD_COST.turret)}`, () => {
        if (S.money < BUILD_COST.turret) { audio.sfx('error'); S.toast(`You need ${fmtMoney(BUILD_COST.turret)}.`, '💸', 'bad'); return; }
        S.money -= BUILD_COST.turret;
        tu.alive = true; tu.hp = TURRET_HP; tu.off = 0; tu.frozen = 0;
        audio.sfx('build');
        const p = turretPos(sel!.i, c.turrets.length);
        S.fx.burst(PK.Smoke, c.x + p.x, c.y + p.y, 8, 30, { life: 0.9, size: 7, grow: 10, color: '#e8e2d6' });
        refresh();
      }, { cls: 'primary block' }));
      actions.append(h('div', { class: 'dim', style: 'font-size:12.5px' }, 'Turrets shoot raiders and resist religious conversion.'));
    }
  };

  const refresh = () => {
    if (c.owner !== PLAYER) { close(); return; }
    header();
    body.innerHTML = '';
    const ch = cities();
    if (ch) body.append(ch);
    body.append(cv, stats, actions);
    renderStats();
    renderActions();
    requestAnimationFrame(draw);
    S.hud.dirty = true;
  };
  refresh();
}
