// Galaxy-map info card for a tapped star: owner, planets, spice, distance, energy cost, Travel.
import { button, h } from '../../../engine/ui';
import { SPICE, STAR_INFO } from '../data';
import { stanceInfo } from '../empires';
import { eventInfo } from '../events';
import { CHAPTERS, chapterIndex, veilBlock, veilsAround } from '../story';
import { TOOL_MAP } from '../data';
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
    // The veils around the core (story.ts) keep you out until you carry the right gear.
    const veil = veilBlock(w, this.id);
    if (veil) { this.locked(); return; }
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
    if (s.type === 'proto') {
      kv.append(h('span', null, 'Planets'), h('span', null, 'None yet: they are still forming'));
      kv.append(h('span', null, 'Belt'), h('b', { style: 'color:#ffcf9e' }, '⛏️ Asteroids: ore, ice, magma, crystals'));
    } else if (s.type === 'blackhole') {
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
      if (pls.length) {
        const sv = w.surveyed(this.id);
        kv.append(h('span', null, 'Explored'), !visited ? h('span', { class: 'dim' }, '? Never visited')
          : sv.done >= sv.total ? h('b', { style: 'color:#ffd166' }, `✓ Fully surveyed (${sv.total}/${sv.total})`)
          : h('b', { style: 'color:#3ee6c4' }, `✓ Visited · ${sv.done}/${sv.total} planets scanned`));
      }
    }
    // Events / missions here
    const ev = w.s.events.find((x) => x.star === this.id);
    if (ev) { const info = eventInfo(ev); kv.append(h('span', null, info.good ? 'Opportunity' : 'Alert'), h('b', { style: `color:${info.good ? '#ffd166' : '#ff8a8a'}` }, `${info.icon} ${info.label}`)); }
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
        actions.append(button(route.length > 2 ? `🚀 Travel (${route.length - 1} jumps)` : '🚀 Travel', () => st.travelTo(this.id), { cls: 'primary' }));
      } else {
        kv.append(h('span', null, 'Trip'), h('b', { style: 'color:#ff8a7a' }, isCore ? 'Gravity too strong for your drive' : 'Out of reach for your drive'));
      }
    }
    if (e && e.met && e.arch !== 'hollow') actions.append(button('📡 Hail', () => st.openComm(e), {}));
    if (e && e.arch === 'hollow' && e.met) actions.append(button('📡 Hail', () => st.openComm(e), {}));
    actions.append(button('Close', () => { st.selectStar(null); }, { cls: 'ghost' }));
    el.append(kv, actions);
  }

  /** A star behind a veil you cannot pass yet: only its name, what it is and how far, then what it takes to get in. */
  private locked() {
    const st = this.st, w = st.w, s = w.star(this.id), el = this.el;
    const isCore = this.id === w.gal.coreId;
    el.append(h('h3', null, TYPE_ICON[s.type] ?? '⭐', s.name, h('span', { class: 'chip sc-lock' }, '🔒 Sealed')));
    el.append(h('div', { class: 'sp-sub' }, isCore ? 'The heart of the galaxy.' : STAR_INFO[s.type].name));
    const kv = h('div', { class: 'sp-kv' }, h('span', null, 'Distance'), h('b', null, `${Math.round(w.gal.dist(w.s.loc, this.id))} ly`));
    el.append(kv);
    // Every veil on the way in, with the gear it takes and where that comes from.
    const sto = w.s.story;
    const list = h('div', { class: 'sc-veils' });
    for (const v of veilsAround(w, this.id)) {
      const g = TOOL_MAP[v.gear], has = w.has(v.gear);
      const ci = chapterIndex(v.from), reached = !!sto && sto.ch >= ci;
      const where = has ? 'Fitted' : `From ⭐ The Lamplight, chapter ${ci + 1}${reached ? `: ${CHAPTERS[ci].title}` : ''}`;
      list.append(h('div', { class: 'sc-veil' + (has ? ' ok' : '') },
        h('span', { class: 'sc-ic' }, has ? '✓' : g.icon),
        h('div', null, h('b', null, `${v.name}: ${g.name}`), h('span', null, has ? 'You can pass it.' : v.desc.split('. ')[0] + '.'), h('i', null, where))));
    }
    el.append(h('div', { class: 'sc-need' }, h('b', null, '🔒 To get in, your ship needs:'), list,
      h('div', { class: 'sp-mini' }, sto && sto.phase !== 'done' ? 'Follow the ⭐ story missions: each piece of gear is a chapter\'s reward.' : 'Each piece of gear is a reward from the ⭐ story.')));
    el.append(h('div', { class: 'sp-actions' }, button('Close', () => { st.selectStar(null); }, { cls: 'ghost' })));
  }
}
