// The Space HUD: money, health and energy, rank badge, mission tracker, alerts,
// view toggle, contextual planet button, ability cluster and the debug panel.
import { abilityButton, button, h, progressBar } from '../../../engine/ui';
import { fmt } from '../../../engine/math';
import { pauseMenu } from '../../common';
import { RANKS } from '../data';
import { EVENT_INFO } from '../events';
import type { SpaceStage } from '../stage';
import { fmtTime } from './common';

type AB = ReturnType<typeof abilityButton> & { count?: HTMLElement };

export class SpaceHud {
  root: HTMLElement;
  private moneyEl: HTMLElement;
  private cargoEl: HTMLElement;
  private hpBar = progressBar('hp');
  private enBar = progressBar('energy');
  private rankBtn: HTMLButtonElement;
  private rankIcon: HTMLElement;
  private rankName: HTMLElement;
  private track: HTMLElement;
  private trackTitle: HTMLElement;
  private trackDesc: HTMLElement;
  private alerts: HTMLElement;
  private viewBtn: HTMLButtonElement;
  private viewLabel: HTMLElement;
  private ctx: HTMLElement;
  private ctxBtn: HTMLButtonElement;
  private abil: HTMLElement;
  private power: AB | null = null;
  private pulse: AB;
  private bomb: AB;
  private shield: AB;
  private repair: AB;
  private side: HTMLElement;
  private debugEl: HTMLElement | null = null;
  private acc = 0;
  private last: Record<string, string> = {};

  constructor(private st: SpaceStage) {
    const game = st.game;
    this.root = game.layer('space-hud');
    // Top row
    const pause = button('⏸', () => pauseMenu(game, { onPause: () => { st.halted = true; }, onResume: () => { st.halted = false; } }), { cls: 'icon', title: 'Pause' });
    this.rankIcon = h('span', null, '🔰');
    this.rankName = h('span', { class: 'sp-rk' }, 'Cadet');
    this.rankBtn = h('button', { class: 'sp-rank', title: 'Rank and badges', 'aria-label': 'Rank and badges' }, this.rankIcon, this.rankName) as HTMLButtonElement;
    this.rankBtn.addEventListener('click', () => st.openShip('badges'));
    this.moneyEl = h('span', null, '§0');
    this.cargoEl = h('span', { class: 'sp-cargo' }, '📦 0/20');
    const moneyBtn = button([this.moneyEl, this.cargoEl], () => st.openShip('cargo'), { cls: 'sp-money', title: 'Cargo' });
    const missions = button('📜', () => st.openMissions(), { cls: 'icon', title: 'Missions' });
    const ship = button('🧰', () => st.openShip('shop'), { cls: 'icon', title: 'Ship and tool shop' });
    const emp = button('👽', () => st.openEmpires(), { cls: 'icon', title: 'Empires' });
    const row1 = h('div', { class: 'sp-row' }, pause, this.rankBtn, moneyBtn, missions, ship, emp);
    const bars = h('div', { class: 'sp-bars' }, this.hpBar.el, this.enBar.el);
    this.trackTitle = h('b', null, '');
    this.trackDesc = h('span', { class: 'sp-tdesc' }, '');
    this.track = h('div', { class: 'sp-track', role: 'button', title: 'Missions' }, h('span', null, '📜'), this.trackTitle, this.trackDesc);
    this.track.addEventListener('click', () => st.openMissions());
    this.alerts = h('div', { class: 'sp-alerts' });
    const top = h('div', { class: 'sp-top' }, row1, bars, this.track, this.alerts);
    // Bottom-left view toggle
    this.viewLabel = h('span', { class: 'sp-vl' }, 'Galaxy');
    this.viewBtn = button([h('span', null, '🌌'), this.viewLabel], () => st.toggleView(), { cls: 'sp-viewbtn', title: 'Galaxy map' });
    const bl = h('div', { class: 'sp-bl' }, this.viewBtn);
    // Contextual planet button
    this.ctxBtn = button('🪐', () => st.ctxAction(), { cls: 'primary' });
    this.ctx = h('div', { class: 'sp-ctx' }, this.ctxBtn);
    this.ctx.style.display = 'none';
    // Ability cluster
    this.abil = h('div', { class: 'sp-abil' });
    const arch = st.w.arch;
    if (arch?.power) {
      this.power = abilityButton(arch.power.icon, arch.power.name, () => st.usePower(), 'special');
      this.power.el.style.width = '64px'; this.power.el.style.height = '64px';
    }
    this.pulse = this.mkAbility('💫', 'Pulse', () => { if (!st.sv.combat.firePulse()) st.game.audio.sfx('error'); });
    this.bomb = this.mkAbility('💣', 'Bomb', () => { const e = st.sv.combat.dropBomb(); if (e) st.ui.toast(e, '💣'); });
    this.shield = this.mkAbility('🔰', 'Shield', () => { if (!st.sv.combat.raiseShield()) st.game.audio.sfx('error'); });
    this.repair = this.mkAbility('🩹', 'Repair', () => st.useRepair());
    // Side buttons (galaxy view)
    this.side = h('div', { class: 'sp-side' },
      button('🎯', () => st.gv.focus(st.w.s.loc), { cls: 'icon', title: 'Find my ship' }),
      button('🏠', () => st.gv.focus(st.w.gal.homeStar), { cls: 'icon', title: 'Homeworld' }),
      button('✦', () => st.gv.focus(st.w.gal.coreId, 0.5), { cls: 'icon', title: 'Galactic core' }),
      button('➖', () => st.gv.cam.zoomAt(0.6, st.game.w / 2, st.game.h / 2), { cls: 'icon', title: 'Zoom out' }),
      button('➕', () => st.gv.cam.zoomAt(1.6, st.game.w / 2, st.game.h / 2), { cls: 'icon', title: 'Zoom in' }),
    );
    this.root.append(top, bl, this.ctx, this.abil, this.side);
    if (game.debug) this.buildDebug();
    this.layoutAbilities();
    this.refresh(true);
  }

  private mkAbility(icon: string, label: string, f: () => void): AB {
    const a = abilityButton(icon, label, f, 'small') as AB;
    a.count = h('div', { class: 'ab-count' });
    a.count.style.display = 'none';
    a.el.append(a.count);
    return a;
  }

  /** Rebuild the ability grid for the current mode and kit. */
  layoutAbilities() {
    const st = this.st;
    const w = st.w;
    const sys = st.mode === 'system';
    this.abil.innerHTML = '';
    const items: HTMLElement[] = [];
    if (sys) {
      if (w.count('repair') > 0) items.push(this.repair.el);
      if (w.has('shield')) items.push(this.shield.el);
      if (w.has('bomb')) items.push(this.bomb.el);
      if (w.pulseLevel > 0) items.push(this.pulse.el);
    }
    if (this.power) items.push(this.power.el);
    for (const el of items) this.abil.append(el);
    this.abil.style.gridTemplateColumns = items.length > 1 ? 'repeat(2, 64px)' : '64px';
    this.side.style.display = st.mode === 'galaxy' ? '' : 'none';
    this.last.abil = '';
  }

  private buildDebug() {
    const st = this.st;
    const toggle = button('🐞', () => { list.style.display = list.style.display === 'none' ? 'flex' : 'none'; }, { cls: 'icon', title: 'Debug' });
    const list = h('div', { class: 'col', style: 'display:none;align-items:flex-start;gap:6px' },
      button('+§1M', () => st.debug('money'), { cls: 'small' }),
      button('+Energy/HP', () => st.debug('energy'), { cls: 'small' }),
      button('All tools', () => st.debug('tools'), { cls: 'small' }),
      button('+Rank', () => st.debug('rank'), { cls: 'small' }),
      button('Skip tutorial', () => st.debug('tut'), { cls: 'small' }),
      button('Raid now', () => st.debug('raid'), { cls: 'small' }),
      button('Eco now', () => st.debug('eco'), { cls: 'small' }),
      button('Jump near core', () => st.debug('core'), { cls: 'small' }),
    );
    this.debugEl = h('div', { class: 'sp-debug' }, toggle, list);
    this.root.append(this.debugEl);
  }

  setVisible(v: boolean) { this.root.style.display = v ? '' : 'none'; }

  update(dt: number) {
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.refresh(false);
  }

  private set(key: string, val: string, f: () => void) {
    if (this.last[key] === val) return;
    this.last[key] = val;
    f();
  }

  refresh(force: boolean) {
    if (force) this.last = {};
    const st = this.st;
    const w = st.w;
    const s = w.s;
    this.set('money', String(Math.round(s.money)), () => { this.moneyEl.textContent = '§' + fmt(s.money); });
    this.set('cargo', `${w.cargoUsed}/${w.cargoCap}`, () => { this.cargoEl.textContent = `📦 ${w.cargoUsed}/${w.cargoCap}`; });
    const mh = w.maxHp, me = w.maxEnergy;
    this.set('hp', `${Math.round(s.hp)}/${mh}`, () => this.hpBar.set(s.hp / mh, `❤ ${Math.round(s.hp)} / ${mh}`));
    this.set('en', `${Math.round(s.energy)}/${me}`, () => this.enBar.set(s.energy / me, `⚡ ${Math.round(s.energy)} / ${me}`));
    const rk = w.rank();
    this.set('rank', String(rk), () => { this.rankIcon.textContent = RANKS[rk].icon; this.rankName.textContent = RANKS[rk].name; });
    // Mission tracker: the first main mission, else the first mission.
    const m = s.missions.find((x) => x.main) ?? s.missions[0];
    const tkey = m ? m.id + ':' + (m.deadline ? Math.ceil(m.deadline - s.t) : '') : 'none';
    this.set('track', tkey, () => {
      if (!m) { this.trackTitle.textContent = 'Free flight'; this.trackDesc.textContent = 'Explore, trade, or ask empires for work.'; return; }
      this.trackTitle.textContent = m.title;
      const tl = m.deadline ? ` · ⏱ ${fmtTime(m.deadline - s.t)}` : '';
      this.trackDesc.textContent = m.desc + tl;
    });
    // Alerts
    const akey = s.events.map((e) => e.id + ':' + Math.ceil(e.until - s.t)).join(',');
    this.set('alerts', akey, () => {
      this.alerts.innerHTML = '';
      for (const ev of s.events.slice(0, 3)) {
        const pl = w.planet(ev.star, ev.planet);
        const chip = h('div', { class: 'sp-alert' + (ev.kind === 'eco' ? ' eco' : ''), role: 'button' }, EVENT_INFO[ev.kind].icon, ` ${pl.name} ${fmtTime(ev.until - s.t)}`);
        chip.addEventListener('click', () => st.gotoEvent(ev));
        this.alerts.append(chip);
      }
    });
    // View toggle
    this.set('mode', st.mode, () => {
      const gal = st.mode === 'galaxy';
      (this.viewBtn.firstChild as HTMLElement).textContent = gal ? '🪐' : '🌌';
      this.viewLabel.textContent = gal ? 'System' : 'Galaxy';
      this.layoutAbilities();
    });
    // Contextual button
    const sv = st.sv;
    let ctx = '';
    if (st.mode === 'system' && !st.panelOpen()) {
      const np = sv.nearPlanet !== null ? sv.planets[sv.nearPlanet] : undefined;
      if (np) ctx = '🪐 ' + np.name;
      else if (w.star(sv.star).type === 'blackhole') ctx = '🌀 Enter the rift';
    }
    this.set('ctx', ctx, () => {
      this.ctx.style.display = ctx ? '' : 'none';
      this.ctxBtn.textContent = ctx;
    });
    // Abilities
    const c = sv.combat;
    const akey2 = [st.mode, w.count('repair'), w.has('shield'), w.has('bomb'), w.pulseLevel].join(',');
    this.set('abil', akey2, () => this.layoutAbilities());
    if (this.power && w.arch?.power) this.power.setCooldown(s.powerCd / w.arch.power.cooldown);
    this.pulse.setCooldown(c.pulseCd / 5);
    this.shield.setCooldown(c.shieldCd / 30);
    this.bomb.setCooldown(c.bombCd / 0.9);
    this.bomb.el.classList.toggle('on', c.planetTarget !== null);
    if (this.repair.count) { this.repair.count.style.display = ''; this.repair.count.textContent = String(w.count('repair')); }
  }
}
