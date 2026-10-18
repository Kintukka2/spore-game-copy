// Galaxy-map info card for a tapped star: owner, planets, spice, distance, energy cost, Travel.
import { button, h } from '../../../engine/ui';
import { SPICE, STAR_INFO } from '../data';
import { stanceInfo } from '../empires';
import { EVENT_INFO } from '../events';
import type { SpaceStage } from '../stage';

const TYPE_ICON: Record<string, string> = { red: '🔴', yellow: '🟡', white: '⚪', blue: '🔵', binary: '♊', proto: '💫', blackhole: '⚫', core: '✦' };

export class StarCard {
  el: HTMLElement;
  private t = 0;

  constructor(private st: SpaceStage, readonly id: number) {
    this.el = h('div', { class: 'sp-card' });
    st.hud.root.append(this.el);
    this.build();
  }

  close() {
    this.el.remove();
    if (this.st.card === this) this.st.card = null;
  }

  update(dt: number) {
    this.t += dt;
  }

  private build() {
    const st = this.st;
    const w = st.w;
    const s = w.star(this.id);
    const here = w.s.loc;
    const el = this.el;
    el.innerHTML = '';
    const owner = w.ownerOf(this.id);
    const e = w.empireOf(this.id);
    const visited = w.visited(this.id);
    const isCore = this.id === w.gal.coreId;
    el.append(h('h3', null, TYPE_ICON[s.type] ?? '⭐', s.name, this.id === w.gal.homeStar ? h('span', { class: 'chip', style: 'font-size:11px' }, '🏠 Home') : null));
    el.append(h('div', { class: 'sp-sub' }, isCore ? 'The heart of the galaxy. Something bright waits inside.' : STAR_INFO[s.type].name + (s.hollow ? ' · Hollow space' : '')));
    const kv = h('div', { class: 'sp-kv' });
    // Owner
    let ownerEl: HTMLElement | string = 'Unclaimed';
    if (owner === 'player') ownerEl = h('b', { style: 'color:#3ee6c4' }, 'Your empire');
    else if (owner === 'hollow') ownerEl = h('b', { style: 'color:#ff8a96' }, 'The Hollow');
    else if (e) ownerEl = e.met ? h('span', null, h('b', { style: `color:${e.color}` }, e.name), ' ', h('span', { class: 'sp-stance', style: `background:${stanceInfo(e).color}` }, stanceInfo(e).label)) : h('b', { style: `color:${e.color}` }, 'Unknown empire');
    if (!isCore) kv.append(h('span', null, 'Owner'), h('span', null, ownerEl));
    // Planets & spice
    const pls = w.gal.planets(this.id);
    if (s.type === 'blackhole') {
      kv.append(h('span', null, 'Rift'), h('span', null, w.s.knownTwins.includes(this.id) && s.twin !== undefined ? `Leads to ${w.star(s.twin).name}` : 'Leads somewhere far away'));
    } else if (!isCore) {
      if (visited || owner === 'player' || (e && e.met)) {
        const spices = h('span', null);
        const seen = new Set<string>();
        for (const p of pls) if (p.spice && !seen.has(p.spice)) { seen.add(p.spice); spices.append(h('span', { class: 'sp-dot', style: `background:${SPICE[p.spice].hex};margin-right:4px` }), SPICE[p.spice].name + ' '); }
        const best = Math.max(0, ...pls.map((p) => w.tscore(this.id, p.idx)));
        kv.append(h('span', null, 'Planets'), h('b', null, `${pls.length} · best T${best}`));
        kv.append(h('span', null, 'Spice'), seen.size ? spices : h('span', null, 'none'));
      } else kv.append(h('span', null, 'Planets'), h('span', null, pls.length ? `${pls.length} (unexplored)` : 'none'));
    }
    // Events / missions here
    const ev = w.s.events.find((x) => x.star === this.id);
    if (ev) kv.append(h('span', null, 'Alert'), h('b', { style: 'color:#ff8a8a' }, `${EVENT_INFO[ev.kind].icon} ${EVENT_INFO[ev.kind].label}`));
    const ms = w.s.missions.filter((m) => m.star === this.id);
    if (ms.length) kv.append(h('span', null, 'Mission'), h('b', { style: 'color:#ffd166' }, ms.map((m) => m.title).join(', ')));
    // Distance
    const actions = h('div', { class: 'sp-actions' });
    if (this.id === here) {
      kv.append(h('span', null, 'Status'), h('b', null, 'You are here'));
      actions.append(button('🪐 Enter system', () => st.showSystem(), { cls: 'primary' }));
    } else {
      const route = st.planRoute(this.id);
      const d = w.gal.dist(here, this.id);
      kv.append(h('span', null, 'Distance'), h('b', null, `${Math.round(d)} ly`));
      if (route) {
        let cost = 0;
        for (let i = 1; i < route.length; i++) cost += st.hopCost(route[i - 1], route[i]);
        st.gv.route = route;
        kv.append(h('span', null, 'Trip'), h('b', null, `${route.length - 1} jump${route.length > 2 ? 's' : ''} · ⚡ ${cost}${cost > w.s.energy ? ' (not enough!)' : ''}`));
        const locked = isCore && !w.s.flags.hollowContact;
        actions.append(button(locked ? '🔒 Sealed' : route.length > 2 ? `🚀 Travel (${route.length - 1} jumps)` : '🚀 Travel', () => st.travelTo(this.id), { cls: 'primary', disabled: locked }));
      } else {
        kv.append(h('span', null, 'Trip'), h('b', { style: 'color:#ff8a7a' }, isCore ? 'Gravity too strong for your drive' : 'Out of reach for your drive'));
      }
    }
    if (e && e.met && e.arch !== 'hollow') actions.append(button('📡 Hail', () => st.openComm(e), {}));
    if (e && e.arch === 'hollow' && e.met) actions.append(button('📡 Hail', () => st.openComm(e), {}));
    actions.append(button('Close', () => { st.selectStar(null); }, { cls: 'ghost' }));
    el.append(kv, actions);
    if (isCore && !w.s.flags.hollowContact) el.append(h('div', { class: 'sp-mini' }, 'A wall of gravity seals the core. Contact the Hollow first.'));
  }
}
