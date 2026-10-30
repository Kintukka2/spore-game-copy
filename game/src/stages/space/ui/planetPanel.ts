// Planet panel: a rotating close-up of the planet sphere with its stats and contextual
// actions in tabs: Overview, Terraform, Life (ecosystem + abduction), Colony, Trade.
import { button, h, progressBar, ui } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { TAU } from '../../../engine/math';
import { SCAN_ENERGY, SPICE, SPICE_COLORS, tScoreOf, type SpiceColor } from '../data';
import { drawPlanet, SphereSprite, styleFor, type PlanetLook } from '../art/planetArt';
import { blit, glow } from '../art/sprites';
import {
  BUILDINGS, build, buy, buyPrice, canColonize, canTrade, collectPlanet, demolish, fillSlot, fits, foundColony, sellQuote,
  genesis, happiness, isHomeworld, maxCities, production, sell, sellPrice, slotKind, slots, storageCap, used, type BuildingId,
} from '../economy';
import { addMod, breakLaw, relation, stanceInfo, systemPrice } from '../empires';
import { deliver, deliverables, tutorialEvent } from '../missions';
import { marketFactor } from '../market';
import { scanPlanet } from '../scan';
import { eventInfo } from '../events';
import type { Empire, GEvent, Planet, Specimen } from '../types';
import type { SpaceStage } from '../stage';
import { BUYERS, buyerAt, buyerWants, inXenopedia, sellSpecimen, specimenPrice, zooAppetite, zooFull } from '../xenolab';
import { landingBlock } from '../surface/look';
import { dietIcon, fmtTime, money, sheet, specimenThumb, tabStrip } from './common';
import { showScan } from './scanCard';
import { openOutbreak } from './outbreak';
import { greetTrader, refugeeTalk } from './encounters';
import { drawClimate, openTerraform, TERRA_TOOLS, terraState, terraTag, terraTarget, type TerraDef } from './terraformView';
import { sealedHollow } from '../story';

type Tab = 'overview' | 'terra' | 'life' | 'colony' | 'trade';

export class PlanetPanel {
  el: HTMLElement;
  private globe: HTMLCanvasElement;
  private sprite = new SphereSprite(256);
  private tabsEl: HTMLElement;
  private body: HTMLElement;
  private badge: HTMLElement;
  private tab: Tab = 'overview';
  private rot = 0;
  private t = 0;
  private acc = 0;
  private chart: HTMLCanvasElement | null = null;
  private dynamic: (() => void)[] = [];
  private bursts: { t: number; color: string }[] = [];
  /** The terraform tool under the pointer, previewed on the chart. */
  private preview: TerraDef | null = null;
  readonly pl: Planet;

  constructor(private st: SpaceStage, readonly star: number, readonly idx: number) {
    const w = st.w;
    this.pl = w.planet(star, idx);
    this.globe = h('canvas', { 'aria-label': 'Planet' }) as HTMLCanvasElement;
    // Drag the globe to spin it; a short tap purges infection marks.
    let down: { x: number; y: number; rot: number; id: number } | null = null;
    this.globe.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, rot: this.rot, id: e.pointerId };
      try { this.globe.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.dragging = false;
    });
    this.globe.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 8) this.dragging = true;
      if (this.dragging) this.rot = (((down.rot - dx / (this.globe.clientWidth || 200) * 0.45) % 1) + 1) % 1;
    });
    const up = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      if (!this.dragging) this.onGlobeTap(e);
      down = null;
      this.dragging = false;
    };
    this.globe.addEventListener('pointerup', up);
    this.globe.addEventListener('pointercancel', () => { down = null; this.dragging = false; });
    this.badge = h('div', { class: 'sp-tbadge' });
    const title = h('h2', null, this.pl.name);
    const close = button('✕', () => this.close(), { cls: 'icon', title: 'Close' });
    const head = h('div', { class: 'sp-panel-head' }, title, close);
    this.tabsEl = h('div', { class: 'sp-tabs', style: 'padding-top:6px' });
    this.body = h('div', { class: 'sp-panel-body' });
    this.el = h('div', { class: 'sp-panel' }, head, h('div', { class: 'sp-globe' }, this.globe, this.badge), this.tabsEl, this.body);
    document.body.append(this.el);
    // Pick a sensible first tab.
    const ev = w.s.events.find((e) => e.star === star && e.planet === idx && e.kind === 'eco');
    const tut = w.s.missions.find((m) => m.kind === 'tutorial');
    if (ev) this.tab = 'life';
    else if (tut?.step === 'abduct' && star === w.gal.homeStar && idx === 2) this.tab = 'life';
    else if (tut?.step === 'colony' && canColonize(w, star, idx) === null) this.tab = 'colony';
    this.render();
  }

  close() {
    this.el.remove();
    this.st.panelClosed();
  }

  private get w() { return this.st.w; }
  private get ps() { return this.w.peekPS(this.star, this.idx); }
  private owner(): Empire | null {
    const o = this.ps.owner;
    return o && o !== 'player' ? this.w.emap.get(o) ?? null : null;
  }

  private look(): PlanetLook {
    const ps = this.ps;
    const t = this.pl.kind === 'gas' ? 0 : tScoreOf(ps.atm, ps.temp);
    const hollow = ps.owner === 'hollow';
    return { seed: this.pl.seed, style: styleFor(this.pl.kind, t, ps.atm, ps.temp, hollow, !!ps.destroyed), t, atm: ps.atm, temp: ps.temp, hue: this.pl.hue };
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    this.t += dt;
    if (!this.dragging) this.rot = (this.rot + dt * 0.03) % 1;
    this.drawGlobe();
    this.acc += dt;
    if (this.acc > 0.25) {
      this.acc = 0;
      for (const f of this.dynamic) f();
      this.drawChart();
    }
  }

  private drawGlobe() {
    const c = this.globe;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = c.clientWidth || 200, ch = c.clientHeight || 200;
    if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const l = this.look();
    const r = Math.min(cw, ch) * (this.pl.rings ? 0.27 : 0.36);
    const cx = cw / 2, cy = ch / 2;
    if (this.ps.destroyed) {
      g.fillStyle = '#5a4a44';
      for (let i = 0; i < 40; i++) { const a = i * 2.4 + this.t * 0.1, d = r * (0.3 + (i % 7) * 0.12); g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 2 + (i % 4), 0, TAU); g.fill(); }
      return;
    }
    this.sprite.update(l, this.rot);
    const ps = this.ps;
    drawPlanet(g, this.sprite, l, cx, cy, r, { light: -2.4, rings: this.pl.rings, ringTilt: -0.3, lights: ps.owner && ps.owner !== 'hollow' ? ps.cities : 0, lightColor: ps.owner === 'player' ? '#9ff5e2' : '#ffd88a', t: this.t, hollowPulse: ps.owner === 'hollow' });
    // Terraform bursts
    for (const b of this.bursts) {
      b.t += 1 / 60;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.max(0, 1 - b.t);
      blit(g, glow(b.color, 48), cx, cy, r * (1 + b.t * 1.2));
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    this.bursts = this.bursts.filter((b) => b.t < 1);
    // Eco-disaster markers
    const ev = this.ecoEvent();
    if (ev?.marks) {
      for (let i = 0; i < ev.marks.length; i += 2) {
        const p = this.markPos(ev.marks[i], ev.marks[i + 1], cx, cy, r);
        if (!p.vis) continue;
        const pul = 0.6 + 0.4 * Math.sin(this.t * 6 + i);
        g.globalCompositeOperation = 'lighter';
        blit(g, glow('#7dff6a', 24), p.x, p.y, 16 * pul + 6);
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = '#d6ffc9';
        g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, 7 + pul * 3, 0, TAU); g.stroke();
      }
    }
    // Scan sweep
    if (this.scanT > 0) {
      this.scanT -= 1 / 60;
      const y = cy - r + (1 - this.scanT / 1.2) * r * 2;
      g.strokeStyle = 'rgba(120,240,255,0.9)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - r * 1.1, y); g.lineTo(cx + r * 1.1, y); g.stroke();
      g.fillStyle = 'rgba(120,240,255,0.12)';
      g.fillRect(cx - r * 1.1, y - 30, r * 2.2, 30);
    }
  }
  private scanT = 0;
  private dragging = false;

  private markPos(lon: number, lat: number, cx: number, cy: number, r: number) {
    const a = lon - this.rot * TAU;
    const x = Math.cos(lat) * Math.sin(a), z = Math.cos(lat) * Math.cos(a), y = Math.sin(lat);
    return { x: cx + x * r, y: cy + y * r, vis: z > 0.1 };
  }

  /** The focused outbreak minigame. */
  private contain(ev: GEvent) {
    audio.sfx('tap');
    openOutbreak(this.st, ev, () => { if (this.el.isConnected) this.render(); });
  }
  private visitTrader(ev: GEvent) {
    audio.sfx('tap');
    greetTrader(this.st, ev, () => { if (this.el.isConnected) this.render(); });
  }

  private ecoEvent() {
    return this.w.s.events.find((e) => e.star === this.star && e.planet === this.idx && e.kind === 'eco');
  }

  private onGlobeTap(_e: PointerEvent) {
    const ev = this.ecoEvent();
    if (ev?.marks) this.contain(ev);
  }

  // ------------------------------------------------------------------ layout
  private render() {
    const w = this.w;
    const e = this.owner();
    const tabs: { id: Tab; label: string; badge?: number }[] = [
      { id: 'overview', label: '🔭 Overview' },
      { id: 'terra', label: '🌍 Terraform' },
      { id: 'life', label: '🌿 Life', badge: this.ecoEvent() ? 1 : 0 },
      { id: 'colony', label: '🏠 Colony' },
    ];
    if (e && e.arch !== 'hollow') tabs.push({ id: 'trade', label: '💱 Trade' });
    if (this.pl.kind === 'gas') tabs.splice(1, 2);
    if (!tabs.some((t) => t.id === this.tab)) this.tab = 'overview';
    tabStrip(this.tabsEl, tabs, this.tab, (id) => { this.tab = id as Tab; this.render(); if (id === 'terra') this.terraView(); });
    this.dynamic = [];
    this.chart = null;
    this.body.innerHTML = '';
    this.renderBadge();
    if (this.tab === 'overview') this.eventBanner();
    switch (this.tab) {
      case 'overview': this.overview(); break;
      case 'terra': this.terra(); break;
      case 'life': this.life(); break;
      case 'colony': this.colony(); break;
      case 'trade': this.trade(); break;
    }
    void w;
  }

  /** What is happening at this world right now, and what you can do about it. */
  private eventBanner() {
    const w = this.w;
    for (const ev of w.s.events.filter((e) => e.star === this.star && e.planet === this.idx)) {
      const info = eventInfo(ev);
      const timer = h('span', { class: 'sp-ev-t' });
      const tick = () => {
        if (!w.s.events.includes(ev)) { this.render(); return; }
        // A story relic waits for you; it has no timer.
        timer.textContent = ev.storyGoal !== undefined ? '⭐ Story' : `⏱ ${fmtTime(ev.until - w.s.t)}`;
      };
      tick();
      this.dynamic.push(tick);
      const box = h('div', { class: 'sp-ev' + (info.good ? ' good' : '') }, h('div', { class: 'sp-ev-h' }, h('b', null, `${info.icon} ${info.label}`), timer), h('div', { class: 'sp-ev-d' }, this.eventText(ev)));
      if (ev.kind === 'rare' && ev.sp) box.append(h('div', { class: 'sp-item' }, specimenThumb(w, ev.sp, 70, 46), h('div', { class: 'sp-txt' }, h('b', { style: 'color:#ffd166' }, ev.sp.name), `${dietIcon(ev.sp.diet)} ${ev.sp.diet} · Xenopedia grant ${money(10000)} · triple crowds at the Menagerie`)));
      const acts = h('div', { class: 'sp-tools' });
      if (ev.kind === 'trader') acts.append(button(`🛍️ Visit the trader (${ev.deals?.length ?? 0} deals)`, () => this.visitTrader(ev), { cls: 'gold sp-wide' }));
      if (ev.kind === 'eco') acts.append(button(`☣️ Contain the outbreak (${(ev.marks?.length ?? 0) / 2})`, () => this.contain(ev), { cls: 'sp-wide sp-toxic' }));
      if (ev.kind === 'meteor') acts.append(button('☄️ Man the planetary gun', () => this.st.defend(ev), { cls: 'sp-wide danger' }));
      if (ev.kind === 'refugees') acts.append(button('📡 Hear their plea', () => refugeeTalk(this.st, ev, () => { if (this.el.isConnected) this.render(); }), { cls: 'gold sp-wide' }));
      if ((ev.kind === 'relic' || ev.kind === 'rare') && !landingBlock(this.pl, this.ps, sealedHollow(w, this.star, this.idx))) acts.append(button('🛬 Land and search', () => this.land(), { cls: 'gold' }));
      if (acts.childElementCount) box.append(acts);
      this.body.append(box);
    }
  }

  private eventText(ev: GEvent): string {
    const ps = this.ps;
    switch (ev.kind) {
      case 'meteor': return 'Rocks are falling toward this world. Take the planetary gun and shoot them down: each one that lands cracks the spice stores, and every second one flattens a building.';
      case 'distress': return 'A stranded ship drifts near this planet, its beacon blinking. Fly to the 🆘 marker to answer the call.';
      case 'relic': return ev.label ? `The ${ev.label} is buried down there. Land, sweep the surface with 📡 Life scan, and beam it up.` : 'Something ancient is buried down there. Land, sweep the surface with 📡 Life scan, and beam the relic up.';
      case 'rare': return 'A one-of-a-kind creature has been spotted on the surface. It bolts at the sight of your ship: land, chase it down and beam it aboard.';
      case 'trader': return 'A wandering trader has set up shop in orbit. Each deal can be taken once.';
      case 'refugees': return ps.cities < maxCities(this.w, this.star, this.idx) ? 'Refugees from a dying world ask to settle here. They would found a whole new city.' : 'Refugees from a dying world ask to settle here. There is no room for a new city, but they would pay their way.';
      case 'eco': return 'A plague is spreading. Tap the glowing outbreaks on the globe to purge them.';
      default: return 'Hostile ships are attacking this world. Destroy them!';
    }
  }

  private renderBadge() {
    const w = this.w;
    const ps = this.ps;
    const t = w.tscore(this.star, this.idx);
    const rows = w.ecoRows(ps);
    this.badge.innerHTML = '';
    if (this.pl.kind !== 'gas') {
      this.badge.append(h('div', { class: 'chip' }, `T${t} `, h('span', { style: 'color:#ffd166' }, '★'.repeat(t) + '☆'.repeat(3 - t))));
      if (t > rows && !ps.destroyed) this.badge.append(h('div', { class: 'chip', style: 'border-color:#ffb347;color:#ffcf80' }, '⚠ Unstable'));
    } else this.badge.append(h('div', { class: 'chip' }, 'Gas giant'));
    this.badge.append(w.explored(this.star, this.idx)
      ? h('div', { class: 'chip', style: 'border-color:#3ee6c4;color:#3ee6c4' }, '✓ Explored')
      : h('div', { class: 'chip', style: 'color:var(--ink-faint)' }, '? Unscanned'));
    const o = ps.owner;
    if (o) {
      const col = o === 'player' ? '#3ee6c4' : o === 'hollow' ? '#ff8a96' : w.emap.get(o)?.color ?? '#fff';
      const name = o === 'player' ? (isHomeworld(w, this.star, this.idx) ? 'Homeworld' : 'Your colony') : o === 'hollow' ? 'Hollow' : w.emap.get(o)?.species ?? '';
      this.badge.append(h('div', { class: 'chip', style: `border-color:${col};color:${col}` }, '🏳️ ', name));
    }
  }

  private statRow(label: string, v: number, text: string, cls = ''): HTMLElement {
    const b = progressBar(cls);
    b.set(v);
    return h('div', { class: 'sp-stat' }, h('span', null, label), b.el, h('b', null, text));
  }

  /** A card: a small heading (with something on its right, if given) over its contents. */
  private box(title: string, right: Node | string | null, ...kids: (Node | null)[]): HTMLElement {
    return h('div', { class: 'pp-box' }, h('div', { class: 'pp-box-h' }, h('span', null, title), right), ...kids);
  }

  // ------------------------------------------------------------------ overview
  private overview() {
    const w = this.w;
    const ps = this.ps;
    const pl = this.pl;
    const B = this.body;
    if (ps.destroyed) { B.append(h('p', { class: 'dim' }, 'Only rubble remains of this world.')); this.genesisButton(B); return; }
    const card = this.box('World', null);
    if (pl.kind !== 'gas') {
      card.append(this.statRow('💨 Atmosphere', ps.atm, ps.atm < 0.2 ? 'Thin' : ps.atm > 0.8 ? 'Dense' : 'Fair'));
      card.append(this.statRow('🌡️ Temperature', ps.temp, ps.temp < 0.2 ? 'Frozen' : ps.temp < 0.38 ? 'Cold' : ps.temp > 0.8 ? 'Scorching' : ps.temp > 0.62 ? 'Hot' : 'Mild', 'hunger'));
    }
    const info = h('div', { class: 'pp-kv' });
    if (pl.spice) info.append(h('span', null, 'Spice'), h('span', null, h('span', { class: 'sp-dot', style: `background:${SPICE[pl.spice].hex}` }), ' ', h('b', null, SPICE[pl.spice].name), ` · richness ${'●'.repeat(Math.round(pl.richness * 2))}`));
    else info.append(h('span', null, 'Spice'), h('span', null, 'none'));
    const o = ps.owner;
    const e = this.owner();
    info.append(h('span', null, 'Owner'), o === 'player' ? h('b', { style: 'color:#3ee6c4' }, `You · ${ps.cities} ${ps.cities === 1 ? 'city' : 'cities'}`) : e ? h('span', null, h('b', { style: `color:${e.color}` }, e.name), ` · ${ps.cities} ${ps.cities === 1 ? 'city' : 'cities'}`) : h('span', null, 'Unclaimed'));
    if (pl.kind !== 'gas') info.append(h('span', null, 'Life'), h('span', null, pl.life ? `${w.ecoRows(ps)} of 3 ecosystem rows full` : 'None'));
    if (pl.feature === 'wreck') info.append(h('span', null, 'Signal'), h('b', { style: 'color:#ffd166' }, ps.scanned ? 'A scanned wreck' : 'A crashed ship! Scan it.'));
    if (pl.feature === 'ruin') info.append(h('span', null, 'Signal'), h('b', { style: 'color:#ffd166' }, ps.scanned ? 'Ancient ruins (scanned)' : 'Ancient ruins. Scan them.'));
    card.append(info);
    B.append(card);
    const acts = h('div', { class: 'sp-tools' });
    const wanted = w.s.missions.some((m) => (m.kind === 'scan' || (m.kind === 'tutorial' && m.step === 'scan')) && m.star === this.star && m.planet === this.idx);
    acts.append(button(`${ps.scanned && !wanted ? '🔍 Re-scan' : '🔍 Scan'} ⚡${SCAN_ENERGY}`, () => this.scan(), { cls: ps.scanned && !wanted ? '' : 'primary', title: `Scanning costs ⚡${SCAN_ENERGY} energy` }));
    if (pl.kind !== 'gas') {
      const cc = canColonize(w, this.star, this.idx);
      if (cc === null) acts.append(button(ps.owner === 'player' ? '🏗️ Add a city' : '🏗️ Colonise', () => { this.tab = 'colony'; this.render(); }, { cls: 'primary' }));
      acts.append(button('🌍 Terraform', () => { this.tab = 'terra'; this.render(); this.terraView(); }));
      if (!landingBlock(pl, ps, sealedHollow(w, this.star, this.idx))) acts.append(button(pl.life ? '🛬 Land & find life' : '🛬 Land', () => this.land(), { cls: pl.life ? 'primary' : '' }));
    }
    if (e && e.arch !== 'hollow') acts.append(button('💱 Trade', () => { this.tab = 'trade'; this.render(); }));
    if (e) acts.append(button('📡 Hail', () => this.st.openComm(e)));
    if (e && e.war) acts.append(button('🎯 Attack', () => { this.close(); this.st.sv.combat.planetTarget = this.idx; this.st.ui.toast(w.has('bomb') ? 'Target locked. Tap 💣 to bomb.' : 'You need Planet Bombs to capture worlds.', '🎯'); }, { cls: 'danger' }));
    if (this.shopHere()) acts.append(button('🧰 Tool shop', () => this.st.openShip('shop')));
    if (isHomeworld(w, this.star, this.idx)) acts.append(button(`🧬 Xeno-Lab${w.s.specimens.length ? ` (${w.s.specimens.length})` : ''}`, () => this.st.openLab(), { cls: 'gold' }));
    // Every world of yours is a shipyard, so any of them can refit your ship.
    if (ps.owner === 'player') acts.append(button('🛠️ Redesign ship', () => { this.close(); this.st.redesignShip(); }));
    if (e && !e.war && e.arch !== 'hollow' && relation(e) >= 0) {
      // Alien docks patch your hull for a fee; only friendly docks recharge energy.
      const price = Math.round((w.maxHp - w.s.hp) * 4);
      if (price > 0) acts.append(button(`🔧 Hull repair ${money(price)}`, () => {
        if (w.s.money < price) { audio.sfx('error'); return; }
        w.addMoney(-price); w.s.hp = w.maxHp; audio.sfx('heal'); this.render();
      }));
    }
    const pw = w.arch?.power;
    if (pw && ['raidercall', 'gravcollapse', 'fervor', 'arkbeam', 'handshake', 'serenade'].includes(pw.id) && (e || pw.id === 'arkbeam' && pl.life)) {
      const cd = w.s.powerCd;
      acts.append(button(cd > 0 ? `${pw.icon} ${pw.name} (${Math.ceil(cd)}s)` : `${pw.icon} ${pw.name}`, () => { this.st.usePower(); this.render(); }, { cls: 'gold', disabled: cd > 0 }));
    }
    if (w.count('recharge') > 0 && w.s.energy < w.maxEnergy) acts.append(button(`⚡ Energy Pack (${w.count('recharge')})`, () => { this.st.useEnergyPack(); this.render(); }));
    B.append(acts);
    this.genesisButton(acts);
    if (w.count('cracker') > 0 && !isHomeworld(w, this.star, this.idx)) acts.append(button(`☄️ World Cracker (${w.count('cracker')})`, () => this.crack(), { cls: 'danger' }));
    if (pl.feature === 'home') B.append(h('div', { class: 'pp-note' }, 'Your homeworld: the shop sells every tool you have unlocked, and your ship repairs itself here for free.'));
    else if (ps.owner === 'player') B.append(h('div', { class: 'pp-note' }, 'Your colony: a shipyard like home. Buy tools, redesign your ship, and your hull repairs itself here. The Xeno-Lab is on your homeworld.'));
  }

  private genesisButton(parent: HTMLElement) {
    const w = this.w;
    if (w.count('genesis') <= 0 || this.pl.kind === 'gas' || isHomeworld(w, this.star, this.idx)) return;
    parent.append(button(`🌱 Genesis Seed (${w.count('genesis')})`, async () => {
      const ok = await ui.confirm('Plant the Genesis Seed?', `${this.pl.name} will become a thriving T3 world with a full ecosystem.`, 'Plant it', 'Not yet');
      if (!ok) return;
      const err = genesis(w, this.star, this.idx);
      if (err) { this.st.ui.toast(err, '🌱'); return; }
      this.bursts.push({ t: 0, color: '#7bd389' }, { t: 0.3, color: '#ffffff' });
      audio.sfx('levelup');
      this.st.ui.toast(`${this.pl.name} bursts into life!`, '🌱', 'gold');
      this.render();
    }, { cls: 'gold' }));
  }

  private async crack() {
    const w = this.w;
    const ok = await ui.confirm('Shatter this world?', `${this.pl.name} will be destroyed forever. This breaks galactic law.`, 'Crack it', 'Cancel');
    if (!ok || !w.use('cracker')) return;
    const ps = w.ps(this.star, this.idx);
    const owner = ps.owner;
    ps.destroyed = true;
    ps.owner = undefined;
    ps.cities = 0;
    ps.eco = new Array(12).fill(null);
    if (owner && !w.gal.planets(this.star).some((p) => w.peekPS(this.star, p.idx).owner === owner)) w.setOwner(this.star, null);
    breakLaw(w, this.star);
    const e = owner && owner !== 'player' ? w.emap.get(owner) : null;
    if (e) addMod(e, 'destroyed', 'You destroyed our world', -100, { min: -100 });
    const pp = this.st.sv.planetPos(this.idx);
    this.close();
    this.st.fx.explosion(pp.x, pp.y, 3.5, '#ff7a3a');
    this.st.fx.screenFlash('#ffffff', 0.9);
    audio.sfx('explode');
  }

  private scan() {
    if (!this.w.spendScan()) return;
    this.scanT = 1.2;
    showScan(this.w, [scanPlanet(this.w, this.star, this.idx)]);
    this.st.game.hint('quickscan', 'Shortcut: in the system view, right-click (or press and hold) a planet to scan it from anywhere. Do it on the star to sweep every world at once. Each world scanned costs ⚡1.', '🔍');
    this.render();
  }

  private shopHere(): boolean {
    const o = this.ps.owner;
    if (o === 'player') return true;
    const e = this.owner();
    return !!e && e.allied;
  }

  // ------------------------------------------------------------------ terraform
  private canTerraform(): boolean {
    return this.pl.kind !== 'gas' && !isHomeworld(this.w, this.star, this.idx) && !this.ps.destroyed;
  }

  /** The focused terraforming view; `fire` starts it with that tool. */
  private terraView(fire?: TerraDef['id']) {
    if (!this.canTerraform()) return;
    audio.sfx('tap');
    openTerraform(this.st, this.star, this.idx, () => { this.preview = null; if (this.el.isConnected) this.render(); }, fire);
  }

  private terra() {
    const w = this.w;
    const B = this.body;
    const ps = this.ps;
    if (isHomeworld(w, this.star, this.idx)) { B.append(h('p', { class: 'dim' }, 'Your homeworld is already perfect. Try another planet.')); return; }
    if (ps.destroyed) { B.append(h('p', { class: 'dim' }, 'Nothing left to shape.')); return; }
    B.append(button('🌍 Open the terraforming view', () => this.terraView(), { cls: 'primary sp-wide' }));
    this.chart = h('canvas', { class: 'sp-chart' }) as HTMLCanvasElement;
    B.append(this.chart);
    const status = h('div', { class: 'tc', style: 'font-size:14px;color:var(--ink-dim)' });
    const upd = () => {
      const t = tScoreOf(ps.atm, ps.temp), rows = w.ecoRows(ps);
      status.innerHTML = '';
      status.append(h('b', { style: 'color:var(--ink)' }, `T${t}`), ' · ', t > rows ? h('span', { style: 'color:#ffcf80' }, `Unstable: fill the T${rows + 1} ecosystem row (Life tab) or it drifts back.`) : t === 3 ? 'A paradise. It is stable.' : 'Stable. Push the dot toward the centre.');
    };
    upd();
    this.dynamic.push(upd);
    B.append(status);
    // Each tool shows the way it moves the dot; hovering one previews it on the chart.
    const tools = h('div', { class: 'sp-tools' });
    for (const d of TERRA_TOOLS) {
      if (d.id === 'genesis') continue;
      const s = terraState(w, d);
      if (!s.show) continue;
      const b = button([h('span', { class: 'tf-tag' }, `${d.icon} ${d.name}`), ' ', h('span', { class: 'tf-tag', style: `color:${d.color}` }, terraTag(d)), ` ${s.n}`], () => this.terraView(d.id), { disabled: !s.ok, title: d.blurb });
      b.addEventListener('pointerenter', () => { this.preview = d; this.drawChart(); });
      b.addEventListener('pointerleave', () => { if (this.preview === d) { this.preview = null; this.drawChart(); } });
      tools.append(b);
    }
    B.append(tools);
    const anyTool = ['stormpod', 'droughtpod', 'meteor', 'icecomet'].some((id) => w.count(id) > 0) || w.has('cloudengine') || w.has('thermlance');
    if (!anyTool) B.append(h('div', { class: 'sp-mini tc' }, 'You have no terraforming tools. Buy pods at your tool shop (rank Captain).'));
    this.genesisButton(B);
    requestAnimationFrame(() => this.drawChart());
  }

  private drawChart() {
    const c = this.chart;
    if (!c || !c.isConnected) return;
    const ps = this.ps, d = this.preview;
    drawClimate(c, ps.atm, ps.temp, this.t, { arrow: d ? { ...terraTarget(d, ps.atm, ps.temp), color: d.color } : null });
  }

  // ------------------------------------------------------------------ life
  private life() {
    const w = this.w;
    const B = this.body;
    const ps = this.ps;
    const pl = this.pl;
    const ev = this.ecoEvent();
    if (ev) {
      const box = h('div', { class: 'sp-offer', style: 'border-color:rgba(125,255,106,.6);background:rgba(60,140,40,.12)' });
      const tl = h('b', null, '');
      const upd = () => { tl.textContent = `☣️ Outbreak! ${(ev.marks?.length ?? 0) / 2} infected herds left · ${fmtTime(ev.until - w.s.t)}`; };
      upd();
      this.dynamic.push(upd);
      box.append(tl, h('div', null, 'Infected herds are dying. Purge every spot before the timer runs out, and before the infection spreads.'),
        button('☣️ Contain the outbreak', () => this.contain(ev), { cls: 'sp-wide sp-toxic' }));
      B.append(box);
    }
    const t = tScoreOf(ps.atm, ps.temp);
    const foreign = !!this.owner();
    const full = w.ecoRows(ps);
    const eco = h('div', { class: 'sp-eco' });
    for (let row = 0; row < 3; row++) {
      const done = ps.eco.slice(row * 4, row * 4 + 4).every((x) => !!x);
      const r = h('div', { class: 'sp-eco-row' }, h('span', { class: 'sp-rl' + (done ? ' ok' : '') }, `T${row + 1}`, done ? h('i', null, '✓') : null));
      for (let k = 0; k < 4; k++) {
        const i = row * 4 + k;
        const sp = ps.eco[i];
        const locked = row >= t;
        const slot = h('div', { class: 'sp-slot' + (sp ? ' full' : '') + (locked && !sp ? ' locked' : ''), role: 'button' });
        if (sp) slot.append(specimenThumb(w, sp, 70, 40), h('span', { class: 'sp-sn' }, sp.name));
        else slot.append(h('span', { style: 'font-size:20px' }, slotKind(i) === 'plant' ? '🌿' : slotKind(i) === 'herb' ? '🐄' : '🦖'), h('span', null, locked ? `T${row + 1}` : slotKind(i) === 'plant' ? 'Plant' : slotKind(i) === 'herb' ? 'Herbivore' : 'Predator'));
        slot.addEventListener('click', () => {
          if (sp) { audio.sfx('tap'); this.st.ui.toast(`${sp.name} (${sp.diet})`, dietIcon(sp.diet)); return; }
          if (foreign) { this.st.ui.toast('This world belongs to another empire.', '🏳️'); audio.sfx('error'); return; }
          if (locked) { this.st.ui.toast(`Terraform to T${row + 1} to open this row.`, '🌍'); audio.sfx('error'); return; }
          this.pickSpecimen(i);
        });
        r.append(slot);
      }
      eco.append(r);
    }
    B.append(this.box('Ecosystem', h('span', { class: 'pp-tag' + (full >= 3 ? ' ok' : '') }, `${full} / 3 rows full`), eco,
      h('div', { class: 'pp-note' }, 'Each row needs two plants, a herbivore and a predator. A full row keeps that T-level stable.')));
    if (pl.life) {
      // Life is collected on the surface: land, find the herds and flora, and beam them up.
      const grid = h('div', { class: 'sp-species' });
      const nat = w.natives(pl).slice(0, Math.max(1, tScoreOf(pl.atm, pl.temp)) * 4);
      for (const sp of nat) {
        const cell = h('div', { class: 'sp-spec', role: 'button' }, specimenThumb(w, sp, 90, 52), h('b', null, sp.name, ' ', this.xenoTag(sp)), h('span', null, `${dietIcon(sp.diet)} ${sp.diet === 'plant' ? 'Grows' : 'Roams'} on the surface`));
        cell.addEventListener('click', () => this.land());
        grid.append(cell);
      }
      B.append(this.box('Native life', button('🛬 Land and search', () => this.land(), { cls: 'primary small' }), grid,
        h('div', { class: 'pp-note' }, foreign ? 'This world is not yours: its owners will notice abductions.' : 'Fly low over the surface to find them. Tap a creature to beam it up; fly over flora to gather seeds.')));
    }
    B.append(h('div', { class: 'pp-chips' },
      h('span', { class: 'pp-tag' }, `📦 Hold ${w.cargoUsed} / ${w.cargoCap}`),
      h('span', { class: 'pp-tag' }, `🧬 ${w.s.specimens.length} specimen${w.s.specimens.length === 1 ? '' : 's'}`),
      h('span', { class: 'pp-tag' }, `🌱 ${w.count('seeds')} seed pods`)));
  }

  /** Marks species the Xenopedia has not seen yet (worth a research grant). */
  private xenoTag(sp: Specimen): HTMLElement {
    return inXenopedia(this.w, sp) ? h('span', { class: 'xl-known', title: 'Already in your Xenopedia' }, '✓') : h('span', { class: 'xl-new', title: 'New species: research grant on first collection' }, 'NEW');
  }

  private land() {
    this.close();
    this.st.land(this.star, this.idx);
  }

  private pickSpecimen(slot: number) {
    const w = this.w;
    const sh = sheet(`Fill a ${slotKind(slot) === 'plant' ? 'plant' : slotKind(slot) === 'herb' ? 'herbivore' : 'predator'} slot`);
    const fill = (which: number | 'seed') => {
      const err = fillSlot(w, this.star, this.idx, slot, which);
      if (err) { this.st.ui.toast(err, '🌿'); audio.sfx('error'); return; }
      sh.close();
      this.render();
    };
    if (slotKind(slot) === 'plant') {
      sh.body.append(h('div', { class: 'sp-item' }, h('div', { class: 'sp-ic' }, '🌱'), h('div', { class: 'sp-txt' }, h('b', null, `Seed pod (${w.count('seeds')})`), 'Grows a hardy local plant.'), button('Plant', () => fill('seed'), { cls: 'primary', disabled: w.count('seeds') <= 0 })));
    }
    let any = false;
    w.s.specimens.forEach((sp, i) => {
      if (!fits(sp, slot)) return;
      any = true;
      sh.body.append(h('div', { class: 'sp-item' }, specimenThumb(w, sp, 70, 46), h('div', { class: 'sp-txt' }, h('b', null, sp.name), sp.hybrid ? '🧬 Hybrid: fits any animal slot' : `${dietIcon(sp.diet)} ${sp.diet}`), button('Release', () => fill(i), { cls: 'primary' })));
    });
    if (!any && slotKind(slot) !== 'plant') sh.body.append(h('p', { class: 'dim' }, 'No fitting creatures in your hold. Beam some up from a living world first (Life tab on any world with life).'));
    if (slotKind(slot) === 'plant' && w.count('seeds') <= 0) sh.body.append(h('p', { class: 'dim' }, 'Gather seeds on living worlds, or buy Seed Pods at your tool shop.'));
  }

  // ------------------------------------------------------------------ colony
  private colony() {
    const w = this.w;
    const B = this.body;
    const ps = this.ps;
    const pl = this.pl;
    const e = this.owner();
    if (ps.owner === 'hollow') { B.append(h('p', { class: 'dim' }, 'Grey machines cover every inch of this world. The Hollow will not share it.')); return; }
    if (e) {
      B.append(h('p', { class: 'dim' }, `${e.name} rule this world (${ps.cities} ${ps.cities === 1 ? 'city' : 'cities'}). Win it through trade (fill the takeover bar in the Trade tab) or capture it in war with Planet Bombs.`));
      const prog = e.takeover[this.star] ?? 0;
      const b = progressBar('gold');
      b.set(prog, `Takeover ${Math.round(prog * 100)}%`);
      B.append(b.el);
      return;
    }
    if (ps.owner !== 'player') {
      const err = canColonize(w, this.star, this.idx);
      B.append(h('p', { class: 'dim' }, err ?? `Found a colony here. It will produce ${pl.spice ? SPICE[pl.spice].name : ''} spice${tScoreOf(ps.atm, ps.temp) === 0 ? ' once the world reaches T1 (T0 colonies are outposts only)' : ''}.`));
      B.append(button(`🏗️ Found colony · Colony Pack (${w.count('colonypack')})`, () => {
        if (w.count('colonypack') <= 0) { this.st.ui.toast('You need a Colony Pack. Buy one at your homeworld.', '🏗️'); audio.sfx('error'); return; }
        if (!foundColony(w, this.star, this.idx)) { audio.sfx('error'); return; }
        this.bursts.push({ t: 0, color: '#3ee6c4' });
        this.st.ui.toast(`Welcome to ${pl.name}, your newest colony!`, '🏠', 'gold');
        tutorialEvent(w, 'colony');
        this.render();
      }, { cls: 'primary big block', disabled: !!err }));
      return;
    }
    // Your colony
    const home = isHomeworld(w, this.star, this.idx);
    const maxC = home ? ps.cities : maxCities(w, this.star, this.idx);
    const prodEl = h('b', null, '');
    const happyEl = h('b', null, '');
    const tile = (k: string, v: Node) => h('div', { class: 'pp-tile' }, h('span', null, k), v);
    const tiles = h('div', { class: 'pp-tiles' }, tile('Cities', h('b', null, `${ps.cities} / ${maxC}`)), tile('Spice', prodEl), tile('Mood', happyEl));
    const store = progressBar('gold');
    const upd = () => {
      const p = production(w, this.star, this.idx);
      prodEl.replaceChildren(...(pl.spice ? [h('span', { class: 'sp-dot', style: `background:${SPICE[pl.spice].hex}` }), ` ${p.toFixed(1)}/min`] : ['none']));
      prodEl.title = pl.spice ? `${p.toFixed(1)} ${SPICE[pl.spice].name} a minute` : '';
      const hp = happiness(w, ps);
      happyEl.textContent = `${hp >= 3 ? '😄' : hp >= 0 ? '🙂' : '😠'} ${hp}${(ps.unrest ?? 0) > 90 ? ' · on strike!' : ''}`;
      const cap = storageCap(w, this.star, this.idx, ps);
      store.set(ps.stored / cap, `Storage ${Math.floor(ps.stored)} / ${cap}`);
    };
    upd();
    this.dynamic.push(upd);
    const row = h('div', { class: 'pp-store' }, store.el);
    row.append(button('🧂 Collect spice', () => {
      const n = collectPlanet(w, this.star, this.idx);
      if (n > 0) { audio.sfx('coin'); this.st.ui.toast(`+${n} spice in your hold.`, '🧂', 'good'); } else this.st.ui.toast(w.cargoUsed >= w.cargoCap ? 'Your hold is full.' : 'Nothing to collect yet.', '🧂');
      upd();
    }, { cls: 'primary' }));
    if (!home && ps.cities < maxC) row.append(button(`🏗️ Add city (${w.count('colonypack')})`, () => {
      if (!foundColony(w, this.star, this.idx)) { this.st.ui.toast('You need a Colony Pack.', '🏗️'); audio.sfx('error'); return; }
      this.render();
    }));
    const summary = this.box('Colony', null, tiles, row);
    B.append(summary);
    if (tScoreOf(ps.atm, ps.temp) === 0 && !home) summary.append(h('div', { class: 'pp-note' }, 'T0 colonies are outposts: terraform to T1 to start producing spice.'));
    if (home) { summary.append(h('div', { class: 'pp-note' }, 'Your homeworld produces a little Ember spice on its own.')); return; }
    // Buildings
    const grid = h('div', { class: 'sp-grid3' });
    const order: BuildingId[] = [];
    for (const b of ['factory', 'leisure', 'turret'] as BuildingId[]) for (let i = 0; i < ps.bld[b]; i++) order.push(b);
    for (let i = 0; i < slots(ps); i++) {
      const b = order[i];
      const cell = h('div', { class: 'sp-bld' + (b ? '' : ' empty'), role: 'button', title: b ? `${BUILDINGS[b].name}: tap to demolish` : 'A free slot: build below' }, h('span', { class: 'sp-bi' }, b ? BUILDINGS[b].icon : '＋'), b ? BUILDINGS[b].name : 'Free slot');
      if (b) cell.addEventListener('click', async () => {
        if (await ui.confirm('Demolish?', `Tear down this ${BUILDINGS[b].name}? You won't get the money back.`, 'Demolish', 'Keep')) { demolish(w, this.star, this.idx, b); this.render(); }
      });
      grid.append(cell);
    }
    const bb = h('div', { class: 'sp-tools' });
    for (const b of ['factory', 'leisure', 'turret'] as BuildingId[]) {
      const def = BUILDINGS[b];
      bb.append(button([`${def.icon} ${def.name}`, h('span', { class: 'pp-price' }, money(def.price))], () => {
        if (!build(w, this.star, this.idx, b)) { this.st.ui.toast(used(ps) >= slots(ps) ? 'No free slots. Add a city to get more.' : 'Not enough money.', '🏗️'); audio.sfx('error'); return; }
        this.render();
      }, { disabled: used(ps) >= slots(ps) || w.s.money < def.price }));
    }
    B.append(this.box('Buildings', h('span', { class: 'pp-tag' + (used(ps) >= slots(ps) ? ' ok' : '') }, `${used(ps)} / ${slots(ps)} slots`), grid, bb,
      h('div', { class: 'pp-note' }, 'Spice Works make spice but lower morale. Leisure Domes keep workers happy. Defence Towers help against raids. Tap a building to demolish it.')));
    // Upgrades
    const up = h('div', { class: 'sp-tools' });
    const inst = (id: 'silo' | 'bioshield' | 'turret', key: 'silo' | 'bioshield' | 'orbTurret', label: string) => {
      const has = !!ps[key];
      up.append(button(has ? [`${label}`, h('span', { class: 'pp-price' }, '✓ Installed')] : [`${label}`, h('span', { class: 'pp-price' }, `${w.count(id)} in hold`)], () => {
        if (has) return;
        if (!w.use(id)) { this.st.ui.toast(`Buy a ${label} at your tool shop first.`, '🧰'); audio.sfx('error'); return; }
        w.ps(this.star, this.idx)[key] = true;
        audio.sfx('build');
        this.render();
      }, { cls: has ? 'on' : '' }));
    };
    inst('silo', 'silo', '🛢️ Spice Silo');
    inst('bioshield', 'bioshield', '🧬 Bio Shield');
    inst('turret', 'orbTurret', '🗼 Orbital Turret');
    B.append(this.box('Upgrades', null, up));
  }

  // ------------------------------------------------------------------ trade
  private trade() {
    const w = this.w;
    const B = this.body;
    const e = this.owner();
    if (!e) return;
    const st = stanceInfo(e);
    B.append(h('div', { class: 'row' }, h('b', { style: `color:${e.color}` }, e.name), h('span', { class: 'sp-stance', style: `background:${st.color}` }, st.icon, ' ', st.label), h('span', { class: 'grow' }), button('📡 Hail', () => this.st.openComm(e), { cls: 'small' })));
    const err = canTrade(w, e);
    if (err) { B.append(h('p', { class: 'dim' }, err)); return; }
    // Missions to deliver
    for (const m of deliverables(w, e)) {
      B.append(h('div', { class: 'sp-offer' }, h('b', null, `📦 ${m.title}`), button(`Deliver for ${money(m.reward)}`, () => { deliver(w, m); this.render(); }, { cls: 'gold' })));
    }
    B.append(h('div', { class: 'sp-section' }, 'Spice market'),
      h('div', { class: 'sp-mini' }, 'Each sale or purchase moves that spice\'s price. It drifts back to normal over a few minutes. Every price also follows the Galactic Spice Exchange, where the news moves the market.'),
      h('div', { style: 'margin:2px 0 6px' }, button('📈 Open the Spice Exchange', () => this.st.openExchange(), { cls: 'small ghost' })));
    for (const c of SPICE_COLORS) {
      const have = w.s.spice[c];
      const prod = e.produces.includes(c);
      // Prices tick live, so their recovery shows as time passes rather than only when the tab is redrawn.
      const priceEl = h('span', { class: 'sp-price' }), restEl = h('span'), mktEl = h('span', { class: 'sp-mkt' });
      const upd = () => {
        const d = e.demand[c];
        priceEl.textContent = `sells ${money(sellPrice(w, e, c))}`;
        restEl.textContent = (prod ? ` · buy ${money(buyPrice(w, e, c))}` : demandLabel(d)) + (d < 0.97 ? ' · ↗ recovering' : '');
        // How far the exchange has pushed this spice from normal.
        const mk = marketFactor(w, c) - 1;
        mktEl.textContent = Math.abs(mk) > 0.05 ? ` · ${mk > 0 ? '📈' : '📉'} exchange ${mk > 0 ? '+' : ''}${Math.round(mk * 100)}%` : '';
        mktEl.className = 'sp-mkt ' + (mk > 0 ? 'up' : 'down');
      };
      upd();
      this.dynamic.push(upd);
      const row = h('div', { class: 'sp-item', style: 'padding:8px' },
        h('span', { class: 'sp-dot', style: `background:${SPICE[c].hex};width:16px;height:16px` }),
        h('div', { class: 'sp-txt' }, h('b', null, `${SPICE[c].name} ×${have}`), priceEl, restEl, mktEl));
      row.append(button('Sell', () => this.doSell(e, c, 1), { cls: 'small', disabled: have <= 0 }));
      row.append(button('All', () => this.doSell(e, c, have), { cls: 'small primary', disabled: have <= 0 }));
      if (prod) row.append(button('Buy', () => { const n = buy(w, e, c, 1); if (!n) { audio.sfx('error'); this.st.ui.toast(w.cargoUsed >= w.cargoCap ? 'Your hold is full.' : 'Not enough money.', '💱'); } this.render(); }, { cls: 'small' }));
      B.append(row);
    }
    this.specimenMarket(e);
    // Takeover
    const prog = e.takeover[this.star] ?? 0;
    const tb = progressBar('gold');
    tb.set(prog, `Economic takeover ${Math.round(prog * 100)}%`);
    B.append(h('div', { class: 'sp-section' }, 'Takeover'), tb.el, h('div', { class: 'sp-mini' }, `Trading here (and a trade route) fills the bar. When it's full, ${e.species} offer to sell you this system for about ${money(systemPrice(w, this.star))}. They ask once; after that, make the offer here.`));
    if (prog >= 1) B.append(button('🏳️ Ask to buy this system', () => this.st.takeoverOffer(e, this.star, systemPrice(w, this.star)), { cls: 'gold' }));
    if (e.allied) B.append(button('🧰 Allied tool shop (−10%)', () => this.st.openShip('shop')));
  }

  /** Some empire colonies run a zoo that buys one kind of specimen from your hold. */
  private specimenMarket(e: Empire) {
    const w = this.w;
    const B = this.body;
    B.append(h('div', { class: 'sp-section' }, 'Specimen market'));
    const kind = buyerAt(w, this.star, this.idx);
    if (!kind) {
      B.append(h('div', { class: 'sp-mini' }, `No zoo on ${this.pl.name} buys specimens. Other ${e.species} colonies might: each wants something different.`));
      return;
    }
    const b = BUYERS[kind];
    const ap = zooAppetite(w, this.star, this.idx);
    const mood = zooFull(w, this.star, this.idx) ? 'enclosures full, back in a few minutes' : ap < 0.7 ? 'nearly stocked' : 'eager to buy';
    B.append(h('div', { class: 'sp-item' }, h('div', { class: 'sp-ic' }, b.icon), h('div', { class: 'sp-txt' }, h('b', null, `${b.name}: buys ${b.wants}`), mood)));
    const mine = w.s.specimens.map((sp, i) => ({ sp, i })).filter((x) => buyerWants(kind, x.sp));
    for (const { sp, i } of mine) {
      const price = specimenPrice(w, this.star, this.idx, sp);
      const row = h('div', { class: 'sp-item' }, specimenThumb(w, sp, 64, 42),
        h('div', { class: 'sp-txt' }, h('b', null, sp.name), `${dietIcon(sp.diet)} ${sp.rare ? 'rare' : sp.hybrid ? 'hybrid' : sp.diet}`),
        button(`Sell ${money(price)}`, () => {
          const got = sellSpecimen(w, this.star, this.idx, i);
          if (typeof got === 'string') { this.st.ui.toast(got, b.icon); audio.sfx('error'); }
          else { audio.sfx('coin'); this.st.ui.toast(`Sold the ${sp.name} to the ${b.name.toLowerCase()} for ${money(got)}.`, b.icon, 'good'); }
          this.render();
        }, { cls: 'small gold', disabled: zooFull(w, this.star, this.idx) }));
      B.append(row);
    }
    const other = w.s.specimens.length - mine.length;
    if (!mine.length) B.append(h('div', { class: 'sp-mini' }, `You have no ${b.wants} aboard.${other ? ` (${other} ${other === 1 ? 'specimen' : 'specimens'} in your hold ${other === 1 ? 'is' : 'are'} not what they want.)` : ''}`));
    this.st.game.hint('zoo-market', 'Some alien colonies buy specimens, but each zoo wants one kind: plants, herbivores, carnivores, omnivores, or hybrids and rare creatures. Each sale fills them up for a few minutes.', b.icon);
  }

  private async doSell(e: Empire, c: SpiceColor, n: number) {
    const w = this.w;
    n = Math.min(n, w.s.spice[c]);
    if (n <= 0) return;
    const quote = sellQuote(w, e, c, n);
    const ok = await ui.confirm(`Sell ${n} × ${SPICE[c].name}?`,
      `${e.name} will pay ${n > 1 ? 'about ' : ''}${money(quote)}${n > 1 ? ` (${money(Math.round(quote / n))} each on average: every one sold lowers the price a little)` : ''}.`, `Sell for ${money(quote)}`, 'Keep it');
    if (!ok || !this.el.isConnected) return;
    const got = sell(w, e, c, n, this.star);
    if (got > 0) {
      this.st.ui.toast(`Sold for ${money(got)}`, '💰', 'good');
      this.st.game.hint('demand', 'Each sale lowers the price a little (supply and demand). Prices recover over time, and differ between empires.', '📉');
    }
    this.render();
  }
}

function demandLabel(d: number): string {
  return d > 0.85 ? ' · in demand' : d > 0.55 ? ' · cooling' : ' · glutted';
}

