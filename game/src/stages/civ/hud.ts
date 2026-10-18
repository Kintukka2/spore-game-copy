// DOM HUD for the Civilization stage: top chips, bottom command bar, contextual panel,
// sheets (build, powers, nations), ability targeting banner and the debug panel.
import { audio } from '../../engine/audio';
import { button, h } from '../../engine/ui';
import { ABILITIES } from '../../game/cards';
import { createStageHud, type StageHud } from '../common';
import { injectCivStyles } from './styles';
import { openPlanner } from './planner';
import { editVehicle } from './flow';
import { geyserRate } from './sim';
import { GIFT } from './diplomacy';
import {
  fmtMoney, MEDIUM_ICON, MEDIUM_NAME, METHOD_COLOR, PLAYER, relLabel, ROLE_ICON, ROLE_NAME,
  type City, type Geyser, type Medium, type Method, type Vehicle,
} from './types';
import type { CivStage } from './stage';

type Ctx = { k: 'none' } | { k: 'city'; id: number } | { k: 'geyser'; id: number } | { k: 'vehicle'; id: number };
type SheetKind = 'build' | 'powers' | 'nations' | 'planner';

export class Hud {
  dirty = true;
  private base!: StageHud;
  private moneyVal!: HTMLElement;
  private incomeVal!: HTMLElement;
  private cityVal!: HTMLElement;
  private cmd!: HTMLElement;
  private cmdBtns: Record<string, HTMLButtonElement> = {};
  private powersBadge!: HTMLElement;
  private ctxEl!: HTMLElement;
  private sheetEl!: HTMLElement;
  private targetEl!: HTMLElement;
  private ctx: Ctx = { k: 'none' };
  private sheet: SheetKind | null = null;
  private sheetArg: City | null = null;
  private tick = 0;
  private live: (() => void)[] = [];
  private lastKey = '';
  private topCache = 64;
  private topAt = -1;
  buildCity: number | null = null;
  private progSegs: HTMLElement[] = [];
  private progLabel!: HTMLElement;
  private vig!: HTMLElement;

  constructor(private S: CivStage) {}

  build() {
    const S = this.S, game = S.game;
    injectCivStyles();
    this.base = createStageHud(game, 'civ', { onPause: () => { S.paused = true; }, onResume: () => { S.paused = false; } });
    this.base.root.classList.add('civ-hud');
    this.vig = h('div', { class: 'civ-vig' });
    this.base.root.prepend(this.vig);
    // Card meter in the progress bar: one coloured segment per capture method.
    const pb = this.base.progress.el;
    pb.classList.add('civ-prog');
    const fill = pb.querySelector('.bar-fill') as HTMLElement | null;
    if (fill) fill.style.display = 'none';
    const segWrap = h('div', { class: 'civ-segs' });
    this.progSegs = (['convert', 'buy', 'military'] as Method[]).map((m) => h('i', { style: `background:${METHOD_COLOR[m]}` }));
    segWrap.append(...this.progSegs);
    pb.prepend(segWrap);
    this.progLabel = pb.querySelector('.bar-text') as HTMLElement;
    // Chips.
    this.moneyVal = h('span', { class: 'mv' }, '§0');
    this.incomeVal = h('span', { class: 'iv' }, '+0/s');
    const money = h('div', { class: 'chip civ-money', title: 'Sporebucks' }, h('div', { class: 'col', style: 'gap:0;align-items:flex-end' }, this.moneyVal, this.incomeVal));
    this.cityVal = h('span', null, '1/10');
    const cities = h('div', { class: 'chip civ-cities', title: 'Cities' }, '🏙️', this.cityVal);
    this.base.right.append(money, cities);
    // Command bar.
    const mk = (id: string, icon: string, label: string, fn: () => void) => {
      const b = h('button', { class: 'civ-cbtn', 'aria-label': label }, h('span', { class: 'ci' }, icon), h('span', null, label)) as HTMLButtonElement;
      b.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); audio.sfx('click'); fn(); });
      this.cmdBtns[id] = b;
      return b;
    };
    this.powersBadge = h('span', { class: 'badge', style: 'display:none' }, '0');
    this.cmd = h('div', { class: 'civ-cmd' },
      mk('build', '🚙', 'Build', () => this.toggleSheet('build')),
      mk('powers', '⚡', 'Powers', () => this.toggleSheet('powers')),
      mk('planner', '🏛️', 'City', () => this.toggleSheet('planner')),
      mk('nations', '🤝', 'Nations', () => this.toggleSheet('nations')),
      mk('all', '🎯', 'Select all', () => { this.closeSheet(); S.selectAll(); }),
    );
    this.cmdBtns.powers.append(this.powersBadge);
    this.ctxEl = h('div', { class: 'civ-ctx panel', style: 'display:none' });
    this.sheetEl = h('div', { class: 'civ-sheet panel', style: 'display:none' });
    this.targetEl = h('div', { class: 'civ-target', style: 'display:none' });
    this.base.root.append(this.ctxEl, this.sheetEl, this.cmd, this.targetEl);
    if (game.debug) this.buildDebug();
    this.refreshAll();
  }

  private buildDebug() {
    const S = this.S;
    const box = h('div', { class: 'civ-debug' });
    const open = h('div', { class: 'col', style: 'display:none;gap:6px' });
    box.append(button('🐞', () => { open.style.display = open.style.display === 'none' ? 'flex' : 'none'; }, { cls: 'icon', title: 'Debug' }), open);
    open.append(
      button('+§10K', () => { S.money += 10000; this.dirty = true; }, { cls: 'small dbg' }),
      button('Capture', () => {
        const c = S.cities.filter((q) => q.owner !== PLAYER && q.founded).sort((a, b) => S.distTo(a, S.cam) - S.distTo(b, S.cam))[0];
        if (c) S.sim.capture(c, PLAYER, S.methodForPlayer());
      }, { cls: 'small dbg' }),
      button('Win', () => {
        for (const c of S.cities) { c.founded = true; if (c.owner !== PLAYER) S.sim.capture(c, PLAYER, S.methodForPlayer()); }
      }, { cls: 'small dbg' }),
      button('Found all', () => { for (const c of S.cities) c.foundAt = Math.min(c.foundAt, S.time); }, { cls: 'small dbg' }),
    );
    this.base.root.append(box);
  }

  // ------------------------------------------------------------------ geometry for the canvas overlay
  topInset(): number {
    if (this.S.real - this.topAt > 1 && this.base) {
      this.topAt = this.S.real;
      const r = this.base.top.getBoundingClientRect();
      if (r.height > 0) this.topCache = Math.round(r.bottom + 6);
    }
    return this.topCache;
  }
  safeRight(): number { return 0; }

  // ------------------------------------------------------------------ updates
  refreshAll() {
    this.dirty = true;
    this.updateChips();
  }

  update(dt: number) {
    if (!this.base) return;
    this.tick -= dt;
    const S = this.S;
    // Targeting banner.
    const tgt = S.targeting;
    const tKey = tgt ?? '';
    if (tKey !== this.lastKey) {
      this.lastKey = tKey;
      if (tgt) {
        const def = ABILITIES[tgt];
        const area = S.abilities.kind(tgt) === 'area';
        this.targetEl.innerHTML = '';
        this.targetEl.append(
          h('span', { style: 'font-size:22px' }, def.icon),
          h('div', { class: 'col', style: 'gap:0' }, h('b', null, def.name), h('span', { class: 'dim', style: 'font-size:12px' }, area ? 'Tap where to use it' : 'Tap a rival city')),
          button('✕', () => S.abilities.cancel(), { cls: 'icon', title: 'Cancel' }),
        );
        this.targetEl.style.display = 'flex';
        this.closeSheet();
        this.clearContext();
      } else this.targetEl.style.display = 'none';
    }
    if (this.dirty) { this.dirty = false; this.renderContext(); if (this.sheet && this.sheet !== 'planner') this.renderSheet(); this.updateChips(); }
    if (this.tick <= 0) {
      this.tick = 0.15;
      this.updateChips();
      for (const f of this.live) f();
    }
  }

  private updateChips() {
    const S = this.S;
    if (!this.moneyVal) return;
    const m = fmtMoney(S.money);
    if (this.moneyVal.textContent !== m) this.moneyVal.textContent = m;
    const inc = `+${fmtMoney(S.income).slice(1)}/s`;
    if (this.incomeVal.textContent !== inc) this.incomeVal.textContent = inc;
    const owned = S.ownedCount();
    const cv = `${owned}/${S.cities.length}`;
    if (this.cityVal.textContent !== cv) this.cityVal.textContent = cv;
    // Card meter.
    const total = S.captures.convert + S.captures.buy + S.captures.military;
    (['convert', 'buy', 'military'] as Method[]).forEach((mm, i) => {
      const w = total ? (S.captures[mm] / Math.max(total, 9)) * 100 : 0;
      this.progSegs[i].style.width = w + '%';
    });
    const lead = total ? (['convert', 'buy', 'military'] as Method[]).reduce((a, b) => (S.captures[b] > S.captures[a] ? b : a)) : null;
    const label = lead ? { convert: '🕊️ Religious', buy: '💰 Economic', military: '⚔️ Military' }[lead] : 'Card: —';
    if (this.progLabel.textContent !== label) this.progLabel.textContent = label;
    // Powers badge.
    const ready = S.abilities.list().filter((a) => !S.abilities.why(a.id)).length + (S.abilities.why(S.abilities.superweapon().id) ? 0 : 1);
    this.powersBadge.style.display = ready ? '' : 'none';
    this.powersBadge.textContent = String(ready);
    this.base.setObjective(this.objective());
    this.base.root.classList.toggle('busy', this.ctxEl.style.display !== 'none' || !!this.sheet || !!S.targeting || S.phase !== 'play');
    this.base.root.classList.toggle('cine', S.phase === 'ending' || S.phase === 'launch' || S.phase === 'done');
    this.vig.classList.toggle('danger', S.dangerT > 0 && S.phase === 'play');
  }

  private objective(): string {
    const S = this.S;
    if (S.phase !== 'play') return '';
    const owned = S.ownedCount();
    const derricks = S.geysers.filter((g) => g.owner === PLAYER).length;
    if (derricks === 0) return '⛲ Send a vehicle to a spice geyser';
    if (owned < 2) return { religious: '🕊️ Convert a rival city with your vehicles', economic: '💰 Open a trade route, then buy a city', military: '⚔️ Capture a rival city: turrets, then hall' }[S.playerType];
    if (owned >= 6 && !S.abilities.why(S.abilities.superweapon().id)) return `✨ ${S.abilities.superweapon().name} is ready (Powers)`;
    return `🌍 Unite the planet: ${owned}/${S.cities.length} cities`;
  }

  // ------------------------------------------------------------------ context panel
  showCity(c: City) { this.closeSheet(); this.ctx = { k: 'city', id: c.id }; this.dirty = true; }
  showGeyser(g: Geyser) { this.closeSheet(); this.ctx = { k: 'geyser', id: g.id }; this.dirty = true; }
  showVehicle(v: Vehicle) { this.closeSheet(); this.ctx = { k: 'vehicle', id: v.id }; this.dirty = true; }
  clearContext() {
    this.ctx = { k: 'none' };
    if (this.S.selected.size) { this.S.selected.clear(); }
    this.closeSheet();
    this.dirty = true;
  }

  private renderContext() {
    const S = this.S;
    const el = this.ctxEl;
    this.live = [];
    el.innerHTML = '';
    if (S.phase !== 'play' || S.targeting) { el.style.display = 'none'; return; }
    if (this.sheet) { el.style.display = 'none'; return; }
    if (S.selected.size) { this.renderSelection(el); el.style.display = ''; return; }
    const close = button('✕', () => { this.ctx = { k: 'none' }; this.dirty = true; }, { cls: 'icon ghost', title: 'Close' });
    if (this.ctx.k === 'city') { this.renderCityCtx(el, S.cities[this.ctx.id], close); el.style.display = ''; return; }
    if (this.ctx.k === 'geyser') { this.renderGeyserCtx(el, S.geysers[this.ctx.id], close); el.style.display = ''; return; }
    if (this.ctx.k === 'vehicle') {
      const v = S.vehicleMap.get(this.ctx.id);
      if (!v) { this.ctx = { k: 'none' }; el.style.display = 'none'; return; }
      const n = S.nations[v.nation];
      const rl = relLabel(S.diplo.rel(n), n.allied);
      el.append(h('div', { class: 'row' },
        h('div', { class: 'civ-dot', style: `background:${n.color}` }),
        h('div', { class: 'grow col', style: 'gap:2px' }, h('b', null, `${ROLE_ICON[v.role]} ${MEDIUM_NAME[v.medium]} ${ROLE_NAME[v.role].toLowerCase()} vehicle`), h('span', { class: 'dim', style: 'font-size:13px' }, `${n.name} · ${rl.face} ${rl.label}`)),
        close));
      const bar = this.bar('#7dffb0');
      el.append(bar.el);
      this.live.push(() => { const vv = S.vehicleMap.get(v.id); bar.set(vv ? vv.hp / vv.maxHp : 0, vv ? `${Math.ceil(vv.hp)} HP` : 'destroyed'); });
      el.style.display = '';
      return;
    }
    el.style.display = 'none';
  }

  private bar(color: string): { el: HTMLElement; set: (f: number, label?: string) => void } {
    const fill = h('i', { style: `background:${color}` });
    const lab = h('span');
    const el = h('div', { class: 'civ-bar' }, fill, lab);
    return { el, set: (f, label) => { fill.style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; if (label !== undefined && lab.textContent !== label) lab.textContent = label; } };
  }

  private renderSelection(el: HTMLElement) {
    const S = this.S;
    const vs = [...S.selected].map((id) => S.vehicleMap.get(id)).filter((v): v is Vehicle => !!v);
    const count = (f: (v: Vehicle) => boolean) => vs.filter(f).length;
    const comp = (['land', 'sea', 'air'] as Medium[]).filter((m) => count((v) => v.medium === m)).map((m) => `${MEDIUM_ICON[m]}${count((v) => v.medium === m)}`).join('  ');
    const roles = [...new Set(vs.map((v) => v.role))];
    const head = h('div', { class: 'row' },
      h('div', { class: 'grow col', style: 'gap:2px' },
        h('b', null, `${vs.length} vehicle${vs.length === 1 ? '' : 's'} selected  `, h('span', { class: 'dim', style: 'font-weight:500' }, comp)),
        h('span', { class: 'dim', style: 'font-size:12.5px' }, this.selectionHint(roles))),
      button('✕', () => { S.selected.clear(); this.dirty = true; }, { cls: 'icon ghost', title: 'Deselect' }));
    const mine = S.vehicles.filter((v) => v.nation === PLAYER && v.spawn <= 0);
    const filt = h('div', { class: 'civ-filters' });
    const add = (label: string, f: (v: Vehicle) => boolean) => {
      const n = mine.filter(f).length;
      if (!n) return;
      filt.append(button(`${label} ${n}`, () => S.selectAll(f), { cls: 'cbtn' }));
    };
    add('All', () => true);
    add('🚙', (v) => v.medium === 'land');
    add('🚢', (v) => v.medium === 'sea');
    add('✈️', (v) => v.medium === 'air');
    if (new Set(mine.map((v) => v.role)).size > 1) for (const r of ['military', 'religious', 'economic'] as const) add(ROLE_ICON[r], (v) => v.role === r);
    add('💤 Idle', (v) => v.order.k === 'idle');
    el.append(head, filt);
  }

  private selectionHint(roles: string[]): string {
    if (roles.length === 1) {
      if (roles[0] === 'military') return 'Tap a rival city to attack it, ⛲ a geyser for a derrick, or the ground to move.';
      if (roles[0] === 'religious') return 'Tap a rival city to convert it, ⛲ a geyser for a derrick, or the ground to move.';
      return 'Tap a friendly rival city to trade, ⛲ a geyser for a derrick, or the ground to move.';
    }
    return 'Tap a target: each vehicle uses its own power.';
  }

  private renderCityCtx(el: HTMLElement, c: City, close: HTMLElement) {
    const S = this.S;
    const n = S.nations[c.owner];
    const rl = relLabel(S.diplo.rel(n), n.allied);
    el.append(h('div', { class: 'row' },
      h('div', { class: 'civ-dot', style: `background:${n.color}` }),
      h('div', { class: 'grow col', style: 'gap:2px' },
        h('b', null, `${c.name} `, h('span', { class: 'dim', style: 'font-weight:500' }, `${ROLE_ICON[c.type]} ${c.large ? 'large' : 'small'} ${c.type} city`)),
        h('span', { class: 'dim', style: 'font-size:13px' }, c.founded ? `${n.name} · ${rl.face} ${rl.label} (${Math.round(S.diplo.rel(n))})` : 'A tribe — it will soon found a city')),
      close));
    if (!c.founded) return;
    const def = this.bar('#ff6b5a');
    el.append(h('div', { class: 'civ-lab' }, '🛡️ Defence'), def.el);
    this.live.push(() => { const t = c.turrets.filter((q) => q.alive).length; def.set(c.defense / c.defenseMax, `${Math.ceil(c.defense)} · ${t} turret${t === 1 ? '' : 's'}`); });
    const conv = this.bar('#7dffb0');
    const convRow = h('div', null, h('div', { class: 'civ-lab' }, '🕊️ Conversion'), conv.el);
    el.append(convRow);
    this.live.push(() => { convRow.style.display = c.convert > 0 ? '' : 'none'; conv.set(c.convert / 100, `${Math.floor(c.convert)}%${c.convertBy >= 0 && c.convertBy !== PLAYER ? ' (rival)' : ''}`); });
    const buy = this.bar('#4aa8ff');
    const buyRow = h('div', null, h('div', { class: 'civ-lab' }, '💰 Buyout'), buy.el);
    el.append(buyRow);
    this.live.push(() => { buyRow.style.display = c.trade || c.buyout > 0 ? '' : 'none'; buy.set(c.buyout / 100, `${Math.floor(c.buyout)}%`); });
    const acts = h('div', { class: 'civ-filters' });
    if (c.buyout >= 100) acts.append(button(`💰 Buy ${fmtMoney(S.buyPrice(c))}`, () => { S.buyCity(c); this.dirty = true; }, { cls: 'gold cbtn' }));
    acts.append(button(`🎁 Gift ${fmtMoney(GIFT)}`, () => { S.diplo.gift(n); }, { cls: 'cbtn' }));
    acts.append(button('🎯 Send all', () => {
      const ids = S.vehicles.filter((v) => v.nation === PLAYER && v.spawn <= 0).map((v) => v.id);
      if (!ids.length) { S.toast('You have no vehicles yet.', '🚙'); return; }
      S.sim.command(ids, c.x, c.y, { city: c });
      S.fx.wave(c.x, c.y, 120, '#ffd166', 0.6, false);
      audio.sfx('place');
    }, { cls: 'cbtn' }));
    el.append(acts);
    el.append(h('div', { class: 'dim', style: 'font-size:12.5px' }, this.howToTake(c)));
  }

  private howToTake(c: City): string {
    const S = this.S;
    const t = S.cities.filter((x) => x.owner === PLAYER).map((x) => x.type);
    const roles = new Set([S.playerType, ...t]);
    const parts: string[] = [];
    if (roles.has('military')) parts.push(`⚔️ destroy its ${c.turrets.filter((q) => q.alive).length} turrets, then the hall`);
    if (roles.has('religious')) parts.push('🕊️ park religious vehicles nearby; entertainment and turrets resist');
    if (roles.has('economic')) parts.push(S.diplo.canTrade(c) || c.trade ? '💰 send economic vehicles to trade, then buy it' : '💰 needs relations of 0 or better (try gifts) to trade');
    return 'To take it: ' + parts.join(' · ');
  }

  private renderGeyserCtx(el: HTMLElement, g: Geyser, close: HTMLElement) {
    const S = this.S;
    const owner = g.owner >= 0 ? S.nations[g.owner] : null;
    el.append(h('div', { class: 'row' },
      h('div', { style: 'font-size:26px' }, '⛲'),
      h('div', { class: 'grow col', style: 'gap:2px' },
        h('b', null, `${g.sea ? 'Ocean' : 'Spice'} geyser`),
        h('span', { class: 'dim', style: 'font-size:13px' }, owner ? `Derrick of the ${owner.name}` : 'Unclaimed')),
      close));
    const info = h('div', { class: 'dim', style: 'font-size:13px' });
    el.append(info);
    this.live.push(() => {
      const r = geyserRate(S.time);
      info.textContent = `Output ${fmtMoney(r)}/s and falling. ` + (g.owner === PLAYER ? 'It is yours.' : g.owner >= 0 ? 'Military vehicles destroy it, religious convert it, economic bribe it (§1,500).' : `Select a ${g.sea ? 'sea' : 'land'} vehicle and tap the geyser to build a derrick.`);
    });
  }

  // ------------------------------------------------------------------ sheets
  toggleSheet(k: SheetKind) {
    if (this.sheet === k) { this.closeSheet(); return; }
    if (k === 'planner') {
      const S = this.S;
      const c = (this.buildCity !== null && S.cities[this.buildCity]?.owner === PLAYER ? S.cities[this.buildCity] : null) ?? S.cities.find((q) => q.home && q.owner === PLAYER) ?? S.cities.find((q) => q.owner === PLAYER);
      if (c) this.openPlanner(c);
      return;
    }
    this.openSheet(k);
  }

  openPlanner(c: City) {
    this.closeSheet();
    this.S.selected.clear();
    this.buildCity = c.id;
    this.sheet = 'planner';
    this.sheetArg = c;
    this.cmdBtns.planner?.classList.add('on');
    this.ctxEl.style.display = 'none';
    openPlanner(this.S, c, this.sheetEl, () => this.closeSheet());
    this.S.hint('planner', 'Factories earn § for each house beside them. Entertainment makes people happy, but not next to factories. Unhappy cities stop working!', '🏛️');
  }

  openSheet(k: SheetKind) {
    this.closeSheet();
    this.sheet = k;
    this.cmdBtns[k]?.classList.add('on');
    if (k === 'nations') this.S.hold('nations', true);
    this.renderSheet();
  }

  get sheetOpen(): boolean { return !!this.sheet; }

  closeSheet() {
    if (!this.sheet) return;
    for (const b of Object.values(this.cmdBtns)) b.classList.remove('on');
    if (this.sheet === 'planner') this.S.hold('planner', false);
    if (this.sheet === 'nations') this.S.hold('nations', false);
    this.sheet = null;
    this.sheetArg = null;
    this.sheetEl.style.display = 'none';
    this.sheetEl.innerHTML = '';
    this.sheetEl.classList.remove('civ-planner');
    this.dirty = true;
  }

  private sheetFrame(title: string, sub?: string): HTMLElement {
    const el = this.sheetEl;
    el.innerHTML = '';
    el.style.display = 'flex';
    const body = h('div', { class: 'sh-body scroll' });
    el.append(h('div', { class: 'sh-head' }, h('div', { class: 'grow col', style: 'gap:0' }, h('b', { style: 'font-size:17px' }, title), sub ? h('span', { class: 'dim', style: 'font-size:12.5px' }, sub) : null), button('✕', () => this.closeSheet(), { cls: 'icon ghost', title: 'Close' })), body);
    return body;
  }

  private renderSheet() {
    this.live = [];
    if (this.sheet === 'build') this.renderBuild();
    else if (this.sheet === 'powers') this.renderPowers();
    else if (this.sheet === 'nations') this.renderNations();
  }

  /** Vehicle production rows for a city (shared with the planner). */
  buildRows(c: City, into: HTMLElement) {
    const S = this.S;
    for (const m of ['land', 'sea', 'air'] as Medium[]) {
      const cost = S.sim.cost(m, c.type);
      const locked = m === 'sea' ? (!S.unlocked.sea ? 'Unlocks at 2 cities' : !c.coastal ? 'No harbour here' : '') : m === 'air' ? (!S.unlocked.air ? 'Unlocks at 4 cities' : '') : '';
      const d = S.vehicleDesign(PLAYER, m, c.type);
      const buy = button([h('span', null, `${MEDIUM_ICON[m]} ${MEDIUM_NAME[m]}`), h('span', { class: 'cost' }, fmtMoney(cost))], () => {
        const err = S.sim.buy(c, m);
        if (err) { audio.sfx('error'); S.toast(err, '⛔', 'bad'); }
        else { audio.sfx('build'); S.hint('first-vehicle', 'New vehicles appear at the city. Tap one to select it, or use Select all.', '🚙'); }
        this.dirty = true;
      }, { cls: 'cbtn grow' + (locked ? '' : ' primary'), sound: false });
      if (locked) buy.disabled = true;
      const edit = button('✏️', () => { editVehicle(S, m, c.type); }, { cls: 'icon', title: 'Redesign' });
      if (locked && m !== 'land') edit.disabled = !(m === 'sea' ? S.unlocked.sea : S.unlocked.air);
      into.append(h('div', { class: 'civ-row' },
        h('div', { class: 'col grow', style: 'gap:2px;min-width:0' },
          h('div', { class: 'row' }, buy, edit),
          h('span', { class: 'dim', style: 'font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, locked || `${ROLE_ICON[c.type]} ${d.name}`))));
    }
  }

  private renderBuild() {
    const S = this.S;
    const mine = S.cities.filter((c) => c.owner === PLAYER);
    let c = this.buildCity !== null ? S.cities[this.buildCity] : null;
    if (!c || c.owner !== PLAYER) c = mine.find((q) => q.home) ?? mine[0];
    if (!c) return;
    this.buildCity = c.id;
    const body = this.sheetFrame('Build vehicles', `Choose a city · ${ROLE_ICON[c.type]} ${c.name} builds ${c.type} vehicles`);
    if (mine.length > 1) {
      const chips = h('div', { class: 'civ-filters' });
      for (const q of mine) chips.append(button(`${ROLE_ICON[q.type]} ${q.name} ${S.sim.vehiclesOf(q)}/${S.sim.vehicleCap(q)}`, () => { this.buildCity = q.id; this.renderSheet(); S.focus(q.x, q.y + 30); }, { cls: 'cbtn' + (q === c ? ' on' : '') }));
      body.append(chips);
    }
    this.buildRows(c, body);
    const cap = h('div', { class: 'dim', style: 'font-size:12.5px' });
    body.append(cap);
    const cc = c;
    this.live.push(() => { cap.textContent = `${cc.name}: ${S.sim.vehiclesOf(cc)} of ${S.sim.vehicleCap(cc)} vehicles. Houses raise the limit.`; });
  }

  private renderPowers() {
    const S = this.S;
    const body = this.sheetFrame('Powers', 'Card abilities, paid in §');
    const list = [...S.abilities.list(), S.abilities.superweapon()];
    if (!S.abilities.list().length) body.append(h('div', { class: 'dim', style: 'font-size:13px' }, 'Your earlier choices granted no abilities.'));
    for (const a of list) {
      const sw = a.id.startsWith('sw-');
      const cd = h('div', { class: 'civ-cd' });
      const icon = h('div', { class: 'civ-ab' + (sw ? ' sw' : '') }, h('span', null, a.icon), cd);
      const costEl = h('span', { class: 'cost' });
      const why = h('span', { class: 'dim', style: 'font-size:12px' });
      const row = h('button', { class: 'civ-row civ-power' + (sw ? ' sw' : '') },
        icon,
        h('div', { class: 'col grow', style: 'gap:2px;text-align:left' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', null, a.name), costEl), h('span', { class: 'dim', style: 'font-size:12.5px' }, a.desc), why)) as HTMLButtonElement;
      row.addEventListener('click', () => { audio.unlock(); S.abilities.use(a.id); });
      body.append(row);
      this.live.push(() => {
        const w = S.abilities.why(a.id);
        costEl.textContent = fmtMoney(S.abilities.cost(a.id));
        why.textContent = w ?? 'Ready';
        why.style.color = w ? '' : '#7dffb0';
        row.classList.toggle('off', !!w);
        const c = S.abilities.cool[a.id] ?? 0;
        const frac = a.cooldown ? Math.max(0, c) / a.cooldown : 0;
        cd.style.background = frac > 0 ? `conic-gradient(rgba(0,0,0,0.6) ${frac * 360}deg, transparent ${frac * 360}deg)` : 'none';
      });
    }
    for (const f of this.live) f();
  }

  private renderNations() {
    const S = this.S;
    const me = S.nations[PLAYER];
    const derricks = S.geysers.filter((g) => g.owner === PLAYER).length;
    const body = this.sheetFrame('Nations', `${me.name} · ${ROLE_ICON[S.playerType]} ${S.playerType} · ${S.ownedCount()} ${S.ownedCount() === 1 ? "city" : "cities"} · ${derricks} derrick${derricks === 1 ? "" : "s"} · time paused`);
    for (const n of S.nations) {
      if (n.id === PLAYER || !n.alive || !S.cities.some((c) => c.owner === n.id && c.founded)) continue;
      const rl = relLabel(S.diplo.rel(n), n.allied);
      const nc = S.cities.filter((c) => c.owner === n.id).length;
      const relBar = this.bar(rl.color);
      relBar.set((S.diplo.rel(n) + 100) / 200, `${rl.face} ${rl.label} ${Math.round(S.diplo.rel(n))}`);
      const war = S.sim.hostile(PLAYER, n.id);
      const acts = h('div', { class: 'civ-filters' },
        button(`🎁 ${fmtMoney(GIFT)}`, () => { S.diplo.gift(n); this.renderSheet(); }, { cls: 'cbtn' }),
        button(n.allied ? '💔 Break' : '🤝 Ally', () => { S.diplo.ally(n); this.renderSheet(); }, { cls: 'cbtn' + (!n.allied && S.diplo.rel(n) >= 50 ? ' primary' : '') }),
        war ? button(`🕊️ Peace ${fmtMoney(S.diplo.peaceCost(n))}`, () => { S.diplo.peace(n); this.renderSheet(); }, { cls: 'cbtn' }) : null,
        button('👁️', () => { const c = S.cities.find((q) => q.owner === n.id); if (c) { this.closeSheet(); S.focus(c.x, c.y + 30); S.hud.showCity(c); } }, { cls: 'icon', title: 'Show' }));
      body.append(h('div', { class: 'civ-row col', style: 'align-items:stretch;gap:6px' },
        h('div', { class: 'row' }, h('div', { class: 'civ-dot', style: `background:${n.color}` }),
          h('div', { class: 'grow col', style: 'gap:0' }, h('b', null, n.name), h('span', { class: 'dim', style: 'font-size:12.5px' }, `${ROLE_ICON[n.type]} ${n.type} · ${nc} ${nc === 1 ? 'city' : 'cities'}${war ? ' · ⚔️ at war' : ''}${n.goodwill > 0 ? ' · 🎉 celebrating' : ''}${n.truce > 0 ? ' · 🕊️ truce' : ''}`))),
        relBar.el, acts));
    }
    body.append(h('div', { class: 'dim', style: 'font-size:12px' }, 'Relations drift back toward each nation\'s attitude. Military nations grow wary as you expand. Allies never attack you; nations at 0 or better accept trade routes.'));
  }
}
