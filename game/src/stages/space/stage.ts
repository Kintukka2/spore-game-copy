// The Space stage scene: owns the world, the three views (galaxy, system, planet panel),
// the HUD and the flow between them (travel, arrival, contact, superpowers, ending).
import type { Game, Scene } from '../../game/game';
import type { PointerInfo } from '../../engine/input';
import { audio, type Mood } from '../../engine/audio';
import { ui } from '../../engine/ui';
import { RNG } from '../../engine/rng';
import { article, TAU } from '../../engine/math';
import { openEditor } from '../../editor/editor';
import { cloneDesign, generateShip } from '../../design/generate';
import { shade } from '../../design/color';
import type { Design } from '../../design/types';
import { RANKS, STAR_INFO, TOOLS } from './data';
import type { Empire, GEvent, Mission, SpaceSave } from './types';
import { World, type WorldHooks } from './world';
import { Fx } from './art/fx';
import { Backdrop } from './art/backdrop';
import { GalaxyView } from './views/galaxyView';
import { SystemView } from './views/systemView';
import { WarpFx } from './views/warp';
import { SpaceHud } from './ui/hud';
import { injectStyle } from './ui/style';
import { StarCard } from './ui/starCard';
import { PlanetPanel } from './ui/planetPanel';
import { anySheetOpen, closeAllSheets } from './ui/common';
import { openEmpires, openMissions, openShip } from './ui/sheets';
import { openLab } from './ui/xenoLab';
import { COMP_IDS, RECIPES } from './salvage';
import { firstContactTalk, hailTalk, takeoverTalk, tributeTalk } from './ui/diplomacy';
import { distressTalk } from './ui/encounters';
import { openWreck } from './ui/lootBox';
import { annexSystem, breakLaw, meet } from './empires';
import { checkMainMissions, onArrive, tutorialEvent } from './missions';
import { collectSystem } from './economy';
import { catalogue, splice } from './xenolab';
import { SurfaceScene } from './surface/scene';
import { landingBlock } from './surface/look';
import { EVENT_INFO, randomEvent, start as startEvent } from './events';
import { scanPlanet } from './scan';
import { showScan } from './ui/scanCard';
import { openMeteorDefense } from './ui/meteorDefense';
import { playEnding } from './ending';

export type ViewMode = 'galaxy' | 'system' | 'warp';

export class SpaceStage implements Scene, WorldHooks {
  name = 'space';
  music: Mood = 'space';
  game!: Game;
  w!: World;
  fx = new Fx();
  backdrop = new Backdrop(7);
  mode: ViewMode = 'system';
  gv!: GalaxyView;
  sv!: SystemView;
  warp = new WarpFx();
  hud!: SpaceHud;
  card: StarCard | null = null;
  panel: PlanetPanel | null = null;
  shipDesign!: Design;
  ready = false;
  paused = false;
  /** Pause menu open: the whole simulation stops. */
  halted = false;
  cinematic = false;
  private dialogChain: Promise<unknown> = Promise.resolve();
  /** False once the stage has exited (guards delayed callbacks). */
  private alive = true;
  private later(ms: number, f: () => void) { setTimeout(() => { if (this.alive) f(); }, ms); }
  private dead = false;
  ui = {
    toast: (msg: string, icon?: string, kind?: 'info' | 'good' | 'bad' | 'gold') => ui.toast(msg, { icon, kind: kind ?? 'info', ms: kind === 'bad' || kind === 'gold' ? 3800 : 2800 }),
  };

  // ------------------------------------------------------------------ lifecycle
  enter(game: Game) {
    this.game = game;
    injectStyle();
    document.body.classList.add('sp-active');
    const saved = (game.state?.stageData.space as SpaceSave | undefined) ?? null;
    this.w = new World(game, saved);
    this.w.hooks = this;
    this.gv = new GalaxyView(this);
    this.sv = new SystemView(this);
    const existing = game.state?.designs.ship;
    this.shipDesign = existing ?? this.suggestedShip();
    this.hud = new SpaceHud(this);
    if (!existing) {
      this.hud.setVisible(false);
      this.sv.enter(this.w.s.loc, 'load');
      this.designShip(true);
    } else this.begin(!!saved);
  }

  exit() {
    this.alive = false;
    document.body.classList.remove('sp-active', 'sp-panel-open');
    closeAllSheets();
    this.panel?.close();
    this.card?.close();
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  serialize(): unknown {
    return this.ready ? this.w.serialize() : this.game.state?.stageData.space;
  }

  private suggestedShip(): Design {
    const st = this.game.state!;
    const base = st.creature?.colors.base ?? '#5cc8ff';
    const r = new RNG(st.seed ^ 0x51f);
    return generateShip(r, { base: '#c9d6e3', coat: base, detail: shade(base, 0.5), pattern: 'bands' }, `${st.speciesName} Dawn`);
  }

  private async designShip(first: boolean) {
    const res = await openEditor(this.game, {
      design: cloneDesign(this.shipDesign),
      mode: 'free',
      title: 'Starship',
      doneLabel: first ? '🚀 Launch' : 'Done',
      allowCancel: !first,
      hint: first ? 'Design your starship, or just tap Launch to fly the suggested one.' : undefined,
    });
    if (res) {
      this.shipDesign = res.design;
      this.game.state!.designs.ship = res.design;
      this.w.refreshShipStats();
      this.sv.combat.player.design = res.design;
    } else if (first) {
      this.game.state!.designs.ship = this.shipDesign;
    }
    if (first) this.begin(false);
  }

  /** Fly down to a planet's surface (a pushed scene; the galaxy waits in orbit). */
  land(star: number, idx: number) {
    const w = this.w;
    const err = landingBlock(w.planet(star, idx), w.peekPS(star, idx), !!w.star(star).hollow);
    if (err) { this.ui.toast(err, '🛬'); audio.sfx('error'); return; }
    closeAllSheets();
    // Hold position in orbit so the ship does not wander into another panel during the fade.
    this.sv.autoPlanet = null;
    this.sv.moveTarget = null;
    audio.sfx('warp', { pitch: 0.8, vol: 0.6 });
    void this.game.fade(() => this.game.push(new SurfaceScene(this, star, idx)), 450);
  }

  /** Gene Splicer: fuse two cargo specimens, let the player name and tweak the hybrid, then store it. */
  async spliceHybrid(a: number, b: number) {
    const w = this.w;
    const res = splice(w, a, b);
    if (typeof res === 'string') { this.ui.toast(res, '🧬'); audio.sfx('error'); return; }
    closeAllSheets();
    audio.sfx('success');
    const hy = res.hybrid;
    const [x, y] = res.parents;
    const ed = await openEditor(this.game, {
      design: hy.design!,
      mode: 'free',
      title: 'Gene Splicer',
      doneLabel: '🧬 Done',
      allowCancel: false,
      hint: `Your ${x.name} × ${y.name} hybrid. Rename it, tweak it, then tap Done.`,
    });
    if (ed) { hy.design = ed.design; hy.name = (ed.design.name.trim() || hy.name).slice(0, 16); }
    w.s.specimens.push(hy);
    const grant = catalogue(w, hy);
    this.ui.toast(`${hy.name} is born! Hybrids fit any animal slot and draw triple crowds at the Menagerie.` + (grant ? ` Xenopedia grant §${grant.toLocaleString('en-US')}.` : ''), '🧬', 'good');
    this.openLab();
  }

  /** Re-open the ship editor (from the ship sheet at your homeworld). */
  redesignShip() {
    closeAllSheets();
    this.designShip(false);
  }

  private begin(restored: boolean) {
    this.ready = true;
    this.hud.setVisible(true);
    this.sv.enter(this.w.s.loc, 'load');
    this.mode = 'system';
    this.hud.layoutAbilities();
    const s = this.game.state!;
    if (!restored) {
      this.game.banner('Stage 5', 'Space');
      this.game.history('Launched into space', '🚀');
      this.later(3500, () => this.game.hint('space-start', 'Drag anywhere to fly. Tap a planet to visit it, or tap empty space to move there.', '🚀'));
    } else {
      this.ui.toast(`Welcome back, Captain of the ${s.speciesName}.`, '🚀');
    }
    checkMainMissions(this.w);
  }

  // ------------------------------------------------------------------ loop
  update(dt: number) {
    if (!this.ready || this.cinematic) return;
    if (this.halted || anySheetOpen() || document.querySelector('.modal-wrap, .ft')) { this.hud.update(dt); return; }
    this.w.inWarp = this.mode === 'warp';
    this.w.update(dt);
    this.fx.update(dt);
    if (this.mode === 'warp') this.warp.update(dt);
    else if (this.mode === 'galaxy') this.gv.update(dt);
    else this.sv.update(dt);
    // While on the map, the system keeps simulating quietly (enemies won't wait).
    if (this.mode === 'galaxy') this.sv.update(dt);
    this.hud.update(dt);
    this.card?.update(dt);
    this.panel?.update(dt);
    if (this.w.s.hp <= 0 && !this.dead) this.playerDestroyed();
  }

  render(g: CanvasRenderingContext2D, W: number, H: number) {
    if (this.mode === 'warp') this.warp.render(g, W, H, this.shipDesign);
    else if (this.mode === 'galaxy') this.gv.render(g, W, H);
    else this.sv.render(g, W, H);
  }

  onResize() { this.hud?.refresh(true); this.hud?.layoutAbilities(); }

  // ------------------------------------------------------------------ input
  onTap(x: number, y: number, p?: PointerInfo) {
    if (!this.ready) return;
    if (this.mode === 'galaxy') this.gv.onTap(x, y);
    else if (this.mode === 'system') this.sv.onTap(x, y, p?.button === 2);
  }
  onLongPress(x: number, y: number) { if (this.ready && this.mode === 'system') this.sv.onAltTap(x, y); }
  onDragStart(p: PointerInfo) { if (this.mode === 'galaxy') this.gv.onDragStart(); else if (this.mode === 'system') this.sv.onDragStart(p); }
  onDrag(p: PointerInfo, dx: number, dy: number) { if (this.mode === 'galaxy') this.gv.onDrag(p, dx, dy); else if (this.mode === 'system') this.sv.onDrag(p); }
  onDragEnd() { if (this.mode === 'galaxy') this.gv.onDragEnd(); else this.sv.onDragEnd(); }
  onPinch(f: number, cx: number, cy: number) { if (this.mode === 'galaxy') this.gv.onPinch(f, cx, cy); else if (this.mode === 'system') this.sv.onPinch(f, cx, cy); }
  onWheel(dy: number, x: number, y: number) { if (this.mode === 'galaxy') this.gv.onWheel(dy, x, y); else if (this.mode === 'system') this.sv.onWheel(dy, x, y); }
  onKey(k: string, down: boolean) {
    if (!down || !this.ready) return;
    if (k === 'm' || k === 'tab') this.toggleView();
    if (k === ' ' && this.mode === 'system') this.sv.combat.firePulse();
    if (k === 'q' && this.mode === 'system' && !this.panel) this.sv.scanNearest();
  }

  // ------------------------------------------------------------------ views
  toggleView() {
    if (this.mode === 'warp') return;
    if (this.mode === 'system') this.showGalaxy();
    else this.showSystem();
  }

  showGalaxy(focus?: number) {
    this.panel?.close();
    this.mode = 'galaxy';
    this.gv.enter(focus);
    audio.sfx('whoosh', { pitch: 0.8 });
    this.hud.layoutAbilities();
    this.game.hint('galaxy', 'Tap a star to see what\'s there. The dashed ring is your drive range; farther stars are reached in several hops.', '🌌');
  }

  showSystem() {
    this.card?.close();
    this.gv.selected = null;
    this.gv.route = null;
    this.mode = 'system';
    audio.sfx('whoosh', { pitch: 1.2 });
    this.hud.layoutAbilities();
  }

  panelOpen(): boolean { return !!this.panel; }

  selectStar(id: number | null) {
    this.card?.close();
    this.gv.selected = id;
    this.gv.route = null;
    if (id === null) return;
    audio.sfx('tap');
    this.card = new StarCard(this, id);
  }

  // ------------------------------------------------------------------ travel
  hopCost(a: number, b: number): number {
    return Math.round(3 + this.w.gal.dist(a, b) * 0.06);
  }

  planRoute(target: number): number[] | null {
    return this.w.gal.route(this.w.s.loc, target, this.w.driveRange);
  }

  async travelTo(target: number) {
    const w = this.w;
    if (target === w.s.loc) { this.showSystem(); return; }
    if (target === w.gal.coreId && !w.s.flags.hollowContact) {
      this.ui.toast('A wall of gravity turns you back. Perhaps the Hollow know the way in.', '🌀', 'bad');
      audio.sfx('error');
      return;
    }
    const route = this.planRoute(target);
    if (!route) {
      this.ui.toast(target === w.gal.coreId ? 'The core\'s gravity is too strong for your drive. You need Star Drive III or better.' : 'Out of range. A better Star Drive would reach it.', '🚀', 'bad');
      audio.sfx('error');
      return;
    }
    let cost = 0;
    for (let i = 1; i < route.length; i++) cost += this.hopCost(route[i - 1], route[i]);
    if (w.s.energy < cost) {
      const ok = await ui.confirm('Low energy', `This trip needs ${cost} energy and you have ${Math.floor(w.s.energy)}. Every hop without energy strains your hull. Go anyway?`, 'Jump anyway', 'Stay');
      if (!ok) return;
    }
    this.card?.close();
    this.panel?.close();
    closeAllSheets();
    this.hop(route, 1);
  }

  private hop(route: number[], i: number) {
    const w = this.w;
    const from = route[i - 1], to = route[i];
    const cost = this.hopCost(from, to);
    if (w.s.energy >= cost) w.s.energy -= cost;
    else {
      w.s.energy = 0;
      w.s.hp = Math.max(1, w.s.hp - w.maxHp * 0.15);
      this.ui.toast('No energy: the jump strains your hull.', '⚠️', 'bad');
    }
    this.gv.route = null;
    const d = w.gal.dist(from, to);
    const dur = (0.9 + d / 260) * (w.perks.has('swift-drive') ? 2 / 3 : 1);
    const dest = w.star(to);
    this.mode = 'warp';
    this.hud.layoutAbilities();
    this.card?.close();
    audio.sfx('warp');
    w.counter('jumps');
    this.warp.start(dur, STAR_INFO[dest.type].glow, dest.name, route.length > 2 ? `Jump ${i} of ${route.length - 1}` : STAR_INFO[dest.type].name, () => {
      if (i < route.length - 1) { w.s.loc = to; this.hop(route, i + 1); }
      else this.arrive(to, 'warp');
    });
  }

  arrive(star: number, how: 'warp' | 'gate' | 'respawn', quiet = false) {
    const w = this.w;
    if (star === w.gal.coreId) { this.reachCore(); return; }
    const first = !w.visited(star);
    w.s.loc = star;
    onArrive(w, star);
    w.visit(star);
    const s = w.star(star);
    if (s.type === 'blackhole' && !w.s.knownTwins.includes(star)) w.s.knownTwins.push(star);
    this.sv.enter(star, how);
    this.mode = 'system';
    this.hud.layoutAbilities();
    this.fx.screenFlash('#ffffff', 0.5);
    // Spice pickup
    const got = collectSystem(w, star);
    if (got > 0) { this.ui.toast(`Collected ${got} spice from your colonies.`, '🧂', 'good'); audio.sfx('coin'); }
    // Contact
    const e = w.empireOf(star);
    if (s.hollow) this.hollowContact();
    else if (e && !e.met) meet(w, e);
    if (star !== w.gal.homeStar) tutorialEvent(w, 'jump');
    const owner = w.ownerOf(star);
    const oname = owner === 'player' ? 'Your territory' : owner === 'hollow' ? 'Hollow space' : e ? e.name : first ? 'Uncharted system' : 'Unclaimed system';
    if (!quiet) this.game.banner(oname, s.name);
    if (s.type === 'blackhole') this.game.hint('rift', 'A black hole! With a Rift Key it leads to a distant twin. Tap it to dive in.', '🌀');
  }

  private hollowContact() {
    const w = this.w;
    const hollow = w.emap.get('hollow')!;
    if (w.s.flags.hollowContact) return;
    w.s.flags.hollowContact = true;
    meet(w, hollow);
    this.game.unlock('hollow-contact');
    this.game.history('Made contact with the Hollow', '🤖');
    checkMainMissions(w);
  }

  tapStar() {
    const s = this.w.star(this.sv.star);
    if (s.type === 'blackhole') this.enterRift();
    else if (s.type === 'proto') this.ui.toast(`${s.name} is a protoplanetary disk: a newborn star still wrapped in the dust and gas its planets will form from, so there are no worlds here yet. Its asteroid belt is rich in ore, ice, magma and spice crystals. Tap a rock to mine it.`, '💫', 'gold');
    else this.ui.toast(`${s.name}: ${STAR_INFO[s.type].name}. Right-click or press and hold it to sweep-scan every world here.`, '☀️');
  }

  /** Scan one world of this system from wherever the ship is. */
  quickScan(idx: number) {
    if (this.panel || this.mode !== 'system') return;
    const r = scanPlanet(this.w, this.sv.star, idx);
    this.sv.scanFx(idx, r.pay);
    showScan(this.w, [r]);
    this.hud.refresh(true);
  }

  /** Scan every world of this system at once. */
  sweepSystem() {
    if (this.panel || this.mode !== 'system') return;
    const pls = this.sv.planets.filter((p) => !this.w.peekPS(this.sv.star, p.idx).destroyed);
    if (!pls.length) { this.tapStar(); return; }
    const rs = pls.map((p) => scanPlanet(this.w, this.sv.star, p.idx));
    rs.forEach((r, i) => this.sv.scanFx(r.idx, r.pay, i * 0.12));
    showScan(this.w, rs);
    this.hud.refresh(true);
  }

  enterRift() {
    const w = this.w;
    const s = w.star(this.sv.star);
    if (s.type !== 'blackhole' || s.twin === undefined) return;
    if (!w.has('wormkey')) { this.ui.toast('The rift won\'t let you through. You need a Rift Key (tool shop, rank Commodore).', '🗝️', 'bad'); audio.sfx('error'); return; }
    if (!w.s.knownTwins.includes(s.twin)) w.s.knownTwins.push(s.twin);
    const twin = w.star(s.twin);
    this.mode = 'warp';
    this.hud.layoutAbilities();
    audio.sfx('warp', { pitch: 0.6 });
    this.warp.start(2.6, '#7a4fff', twin.name, 'Through the rift', () => this.arrive(twin.id, 'gate'));
  }

  ctxAction() {
    const sv = this.sv;
    if (sv.nearPlanet !== null) sv.goToPlanet(sv.nearPlanet);
    else if (this.w.star(sv.star).type === 'blackhole') this.enterRift();
  }

  gotoEvent(ev: GEvent) {
    closeAllSheets();
    if (ev.kind === 'meteor') {
      // Defend now if we are there; otherwise set course and take the guns on arrival.
      if (ev.star === this.w.s.loc && this.mode !== 'warp') { this.defend(ev); return; }
      this.defendFor = ev.id;
      this.ui.toast(`Set course for ${this.w.star(ev.star).name}. The planetary guns are yours when you arrive.`, '☄️');
    }
    this.panel?.close();
    if (ev.star === this.w.s.loc) {
      this.showSystem();
      if (['eco', 'relic', 'rare', 'trader', 'refugees'].includes(ev.kind)) this.sv.goToPlanet(ev.planet);
      return;
    }
    this.showGalaxy(ev.star);
    this.selectStar(ev.star);
  }

  /** A meteor storm alert we chose to answer: defend on arrival. */
  private defendFor: number | null = null;

  /** The meteor defence minigame for a storm in this system. */
  defend(ev: GEvent) {
    if (!this.w.s.events.includes(ev) || document.querySelector('.sp-focus')) return;
    closeAllSheets();
    openMeteorDefense(this, ev, () => this.hud.refresh(true));
  }

  /** Arrived in a system under a meteor storm. */
  meteorArrived(ev: GEvent) {
    if (this.defendFor === ev.id) {
      this.defendFor = null;
      this.later(900, () => this.defend(ev));
    } else this.later(600, () => this.ui.toast(`A meteor storm is falling on ${this.w.planet(ev.star, ev.planet).name}! Tap the ☄️ alert to man the planetary gun.`, '☄️', 'bad'));
  }

  showMissionTarget(m: Mission) {
    if (m.star === undefined) return;
    closeAllSheets();
    if (m.star === this.w.s.loc && m.planet !== undefined) { this.showSystem(); this.sv.goToPlanet(m.planet); return; }
    this.showGalaxy(m.star);
    this.selectStar(m.star);
  }

  // ------------------------------------------------------------------ planets
  openPlanet(star: number, idx: number) {
    if (this.panel) return;
    const p = this.sv.combat.player;
    const near = this.sv.combat.crafts.some((c) => c.team === 1 && c.alive && Math.hypot(c.x - p.x, c.y - p.y) < 700);
    if (near) { this.ui.toast('Too dangerous! Deal with the hostiles first.', '⚠️', 'bad'); audio.sfx('error'); return; }
    audio.sfx('pop');
    this.panel = new PlanetPanel(this, star, idx);
    this.hud.setVisible(false);
    document.body.classList.add('sp-panel-open');
    this.game.hint('planet', 'This is the planet panel. Tabs along the top let you scan, colonise, terraform, fill the ecosystem and trade.', '🪐');
  }
  panelClosed() {
    this.panel = null;
    document.body.classList.remove('sp-panel-open');
    if (!this.cinematic) this.hud.setVisible(true);
    this.hud.refresh(true);
  }

  // ------------------------------------------------------------------ sheets
  openShip(tab = 'shop') { openShip(this, tab); }
  /** The Xeno-Lab on your homeworld (only while you are home). */
  openLab() { openLab(this); }
  openMissions() { openMissions(this); }
  openEmpires() { openEmpires(this); }
  /** Hail an empire: a face-to-face conversation. */
  openComm(e: Empire) { this.dialog(() => hailTalk(this, e)); }

  /** Run modal dialogs one after another. */
  dialog<T>(f: () => Promise<T>): Promise<T> {
    const p = this.dialogChain.then(f, f);
    this.dialogChain = p.catch(() => undefined);
    return p;
  }

  // ------------------------------------------------------------------ world hooks
  toast(msg: string, icon?: string, kind?: 'info' | 'good' | 'bad' | 'gold') { this.ui.toast(msg, icon, kind); }
  ownerChanged() { this.w.dirtyTerritory = true; }
  changed() { /* HUD polls at 10 Hz */ }
  firstContact(e: Empire) { this.dialog(() => firstContactTalk(this, e)); }
  tribute(e: Empire, amount: number) { this.dialog(() => tributeTalk(this, e, amount)); }
  takeoverOffer(e: Empire, star: number, price: number) { this.dialog(() => takeoverTalk(this, e, star, price)); }
  /** You reached a distress beacon: the stranded crew (or the pirates faking it) hail you. */
  distress(ev: GEvent, ambush: () => void) { this.dialog(() => distressTalk(this, ev, ambush)); }
  /** You reached a derelict wreck: open it up and take what is inside. */
  salvageWreck(ev: GEvent) { this.dialog(() => openWreck(this, ev)); }
  eventStarted(ev: GEvent) {
    const pl = this.w.planet(ev.star, ev.planet);
    const sys = this.w.star(ev.star).name;
    const msg: Record<GEvent['kind'], string> = {
      raid: `Pirates are raiding ${pl.name}!`,
      eco: `Eco-disaster on ${pl.name}! A plague is spreading.`,
      hollow: `The Hollow strike ${pl.name}!`,
      invasion: `${this.w.emap.get(ev.empire ?? '')?.name ?? 'Enemies'} invade ${pl.name}!`,
      meteor: `A meteor storm is bearing down on ${pl.name}! Man the planetary gun.`,
      distress: `Distress call from a stranded ship near ${pl.name} (${sys}).`,
      relic: `An ancient signal is rising from the surface of ${pl.name} (${sys}). Land to find its source.`,
      rare: `Rare sighting! ${article(ev.sp?.name ?? 'strange', true)} ${ev.sp?.name ?? 'strange creature'} roams ${pl.name} (${sys}). Land and catch it before it migrates.`,
      trader: `A wandering trader has set up shop at ${pl.name} (${sys}).`,
      refugees: `A refugee fleet asks to settle on your colony ${pl.name}.`,
      wreck: `A derelict ship drifts near ${pl.name} (${sys}). Salvage it for components, and maybe a blueprint.`,
    };
    const info = EVENT_INFO[ev.kind];
    this.ui.toast(msg[ev.kind] + ' Tap the alert to go there.', info.good ? info.icon : ev.kind === 'eco' ? '☣️' : '🚨', info.good ? 'gold' : 'bad');
    if (ev.star === this.w.s.loc) this.sv.setupEvent(ev, false);
    this.game.hint('alerts', 'Alerts appear under your mission. Tap one to set course. Get there before the timer runs out.', '🚨');
    if (info.good) this.game.hint('opportunity', 'Gold alerts are opportunities: rescues, wrecks, relics, rare creatures, traders and refugees. They pay well, but they do not wait.', '✨');
  }
  eventEnded() { this.hud.refresh(true); }
  rankUp(rank: number) {
    const r = RANKS[rank];
    if (rank >= 1) this.game.banner('Promoted', r.name);
    audio.sfx('levelup');
    const unlocked = TOOLS.filter((t) => t.rank === rank && !t.special).length;
    if (unlocked) this.ui.toast(`${unlocked} new tools unlocked in your shop.`, '🧰', 'gold');
    this.game.history(`Promoted to ${r.name}`, r.icon);
  }
  missionDone() { this.hud.refresh(true); }

  floatText(x: number, y: number, text: string, color: string) { this.sv.floatText(x, y, text, color); }

  // ------------------------------------------------------------------ actions
  useRepair() {
    const w = this.w;
    if (w.s.hp >= w.maxHp) { this.ui.toast('Your hull is already in one piece.', '🩹'); return; }
    if (!w.use('repair')) { audio.sfx('error'); return; }
    w.s.hp = Math.min(w.maxHp, w.s.hp + w.maxHp * 0.5);
    audio.sfx('heal');
    const p = this.sv.combat.player;
    this.fx.ring(p.x, p.y, 10, 80, 0.5, '#7bd389', 4);
  }

  useEnergyPack() {
    const w = this.w;
    if (!w.use('recharge')) { audio.sfx('error'); return; }
    w.s.energy = Math.min(w.maxEnergy, w.s.energy + w.maxEnergy * 0.6);
    audio.sfx('heal');
  }

  /** The planet the ship is parked at or next to, if any. */
  focusPlanet(): number | null {
    if (this.panel && this.panel.star === this.sv.star) return this.panel.idx;
    return this.sv.parked?.idx ?? this.sv.nearPlanet;
  }

  usePower() {
    if (this.mode === 'warp' || this.dead) return;
    const w = this.w;
    const arch = w.arch;
    const pw = arch?.power;
    if (!pw) return;
    if (w.s.powerCd > 0) { this.ui.toast(`${pw.name} recharges in ${Math.ceil(w.s.powerCd)} s.`, pw.icon); audio.sfx('error'); return; }
    const ok = this.firePower(pw.id);
    if (ok) {
      w.s.powerCd = pw.cooldown;
      audio.sfx('levelup');
      this.game.stat('space-powers');
    }
  }

  private firePower(id: string): boolean {
    const w = this.w;
    const sv = this.sv;
    const star = sv.star;
    const pIdx = this.focusPlanet();
    const inSystem = this.mode === 'system' || this.panel;
    const needPlanet = (f: (idx: number) => boolean): boolean => {
      if (!inSystem || pIdx === null) { this.ui.toast('Fly next to a planet first.', '🪐'); return false; }
      return f(pIdx);
    };
    switch (id) {
      case 'homeward': {
        if (w.s.loc === w.gal.homeStar && this.mode !== 'galaxy') { this.ui.toast('You are already home.', '🏠'); return false; }
        this.panel?.close();
        this.card?.close();
        this.mode = 'warp';
        this.hud.layoutAbilities();
        audio.sfx('warp', { pitch: 1.4 });
        this.warp.start(1.6, '#4cd97b', w.star(w.gal.homeStar).name, 'Homeward Gate', () => this.arrive(w.gal.homeStar, 'gate'));
        return true;
      }
      case 'handshake': {
        const e = w.empireOf(star);
        if (!e || e.route === null) { this.ui.toast('Use this in a system of an empire you have a trade route with.', '🤝'); return false; }
        e.takeover[star] = 1;
        this.takeoverOffer(e, star, 0);
        return true;
      }
      case 'raidercall': return needPlanet((idx) => {
        const ps = w.peekPS(star, idx);
        if (!ps.owner || ps.owner === 'player') { this.ui.toast('Raiders only attack other empires\' worlds.', '🏴‍☠️'); return false; }
        this.panel?.close();
        sv.combat.raiderAssault(idx);
        this.ui.toast('A pirate fleet answers your call!', '🏴‍☠️', 'gold');
        return true;
      });
      case 'stasisfield': {
        if (this.mode !== 'system') { this.ui.toast('Use this inside a star system.', '🧊'); return false; }
        sv.combat.stasis = 18;
        const p = sv.combat.player;
        this.fx.ring(p.x, p.y, 20, 1400, 1.2, '#9fe3ff', 8);
        audio.sfx('zap');
        return true;
      }
      case 'gravcollapse': return needPlanet((idx) => {
        const ps = w.ps(star, idx);
        if (!ps.owner || ps.owner === 'player' || ps.cities <= 0) { this.ui.toast('There are no foreign cities on this world.', '🌑'); return false; }
        const owner = ps.owner;
        ps.owner = undefined; ps.cities = 0; ps.def = undefined; ps.cityHp = undefined;
        if (!w.gal.planets(star).some((p) => w.peekPS(star, p.idx).owner === owner)) w.setOwner(star, null);
        const pp = sv.planetPos(idx);
        this.fx.explosion(pp.x, pp.y, 2.2, '#b39bff');
        this.fx.screenFlash('#b39bff', 0.5);
        breakLaw(w, star);
        sv.refreshHostility();
        return true;
      });
      case 'fervor': return needPlanet((idx) => {
        const ps = w.peekPS(star, idx);
        if (!ps.owner || ps.owner === 'player') { this.ui.toast('No foreign cities to convert here.', '🙏'); return false; }
        const owner = ps.owner;
        const m = w.ps(star, idx);
        m.owner = 'player'; m.def = undefined; m.cityHp = undefined;
        if (!w.gal.planets(star).some((p) => w.peekPS(star, p.idx).owner === owner)) annexSystem(w, star, 'converted');
        const pp = sv.planetPos(idx);
        this.fx.ring(pp.x, pp.y, 20, 300, 1, '#ffb347', 8);
        this.fx.screenFlash('#ffd8a0', 0.5);
        breakLaw(w, star);
        sv.refreshHostility();
        return true;
      });
      case 'arkbeam': return needPlanet((idx) => {
        const pl = w.planet(star, idx);
        if (!pl.life) { this.ui.toast('Nothing lives on this world.', '🛸'); return false; }
        const nat = w.natives(pl).slice(0, Math.max(1, w.tscore(star, idx)) * 4);
        let n = 0, grant = 0;
        for (const sp of nat) for (let k = 0; k < 2; k++) {
          if (w.cargoUsed >= w.cargoCap) break;
          if (sp.diet === 'plant') { w.give('seeds', 1); n++; } else { w.s.specimens.push({ ...sp }); n++; }
          grant += catalogue(w, sp);
        }
        this.ui.toast(`The Ark Beam lifts ${n} lifeforms aboard.` + (grant ? ` Xenopedia grants: §${grant.toLocaleString('en-US')}.` : ''), '🛸', 'good');
        audio.sfx('whoosh');
        return n > 0;
      });
      case 'serenade': {
        let e = w.empireOf(star);
        if (!e || e.arch === 'hollow') e = w.empires.filter((x) => x.met && x.arch !== 'hollow' && !x.dead).sort((a, b) => w.rel(a) - w.rel(b))[0] ?? null;
        if (!e) { this.ui.toast('There is no one to serenade yet.', '🎶'); return false; }
        e.serenade = 120;
        sv.refreshHostility();
        this.ui.toast(`${e.name} sway to your song. They are calm for two minutes.`, '🎶', 'good');
        return true;
      }
      case 'squire': {
        if (this.mode !== 'system') { this.ui.toast('Summon your squire inside a system.', '🛰️'); return false; }
        sv.combat.spawnSquire();
        const p = sv.combat.player;
        this.fx.ring(p.x, p.y, 10, 120, 0.6, '#3ee6c4', 4);
        return true;
      }
    }
    return false;
  }

  playerDestroyed() {
    if (this.dead) return;
    this.dead = true;
    const w = this.w;
    const p = this.sv.combat.player;
    this.fx.explosion(p.x, p.y, 2.4, '#ffb347');
    this.fx.screenFlash('#ffffff', 0.7);
    audio.sfx('explode');
    audio.sfx('die');
    this.later(1400, () => {
      this.game.fade(() => {
        for (const c of Object.keys(w.s.spice) as (keyof typeof w.s.spice)[]) w.s.spice[c] = 0;
        w.s.hp = w.maxHp;
        w.s.energy = w.maxEnergy;
        this.panel?.close();
        closeAllSheets();
        w.s.loc = w.gal.homeStar;
        this.sv.enter(w.gal.homeStar, 'respawn');
        this.mode = 'system';
        this.hud.layoutAbilities();
        this.dead = false;
        this.ui.toast('Your ship was destroyed. A new one launches from home. The spice in your hold is lost.', '💥', 'bad');
      }, 600);
    });
  }

  // ------------------------------------------------------------------ the core
  private reachCore() {
    const w = this.w;
    this.cinematic = true;
    this.hud.setVisible(false);
    this.panel?.close();
    this.card?.close();
    closeAllSheets();
    w.s.flags.coreReached = true;
    w.s.missions = w.s.missions.filter((m) => m.kind !== 'core');
    w.s.flags['done-core'] = true;
    playEnding(this, () => {
      this.cinematic = false;
      this.hud.setVisible(true);
      w.give('genesis', 12);
      this.game.unlock('core');
      const c = this.game.state!.cards;
      if (c.cell && c.creature && c.tribal && c.civ) this.game.unlock('full-circle');
      this.game.history('Reached the heart of the galaxy and received the Genesis Seed', '🌌');
      this.arrive(w.gal.homeStar, 'gate', true);
      this.game.banner('The journey continues', 'Genesis');
      audio.music('space');
      this.later(2000, () => this.ui.toast('The Genesis Seed is in your terraform tools. Open any planet to use it.', '🌱', 'gold'));
      this.game.save();
    });
  }

  // ------------------------------------------------------------------ debug
  debug(what: string) {
    const w = this.w;
    this.game.state!.usedCheats = true;
    switch (what) {
      case 'money': w.addMoney(1000000); audio.sfx('coin'); break;
      case 'energy': w.s.energy = w.maxEnergy; w.s.hp = w.maxHp; audio.sfx('heal'); break;
      case 'tools':
        for (const t of TOOLS) {
          if (t.special) continue;
          if (t.kind === 'consumable') w.give(t.id, t.max ?? 9); else w.s.tools[t.id] = 1;
        }
        w.refreshShipStats();
        w.s.hp = w.maxHp; w.s.energy = w.maxEnergy;
        this.hud.layoutAbilities();
        this.ui.toast('Every tool unlocked.', '🐞');
        break;
      case 'rank':
        if (!w.s.flags.tutDone) { w.s.flags.tutDone = true; w.s.missions = w.s.missions.filter((m) => m.kind !== 'tutorial'); }
        w.s.flags.bonusPts = Number(w.s.flags.bonusPts ?? 0) + 12;
        break;
      case 'tut':
        w.s.flags.tutDone = true;
        w.s.flags.tut = 99;
        w.s.missions = w.s.missions.filter((m) => m.kind !== 'tutorial');
        checkMainMissions(w);
        break;
      case 'raid': {
        let col = w.colonies().find(([s]) => s !== w.gal.homeStar);
        if (!col) col = [w.gal.homeStar, 2];
        w.s.flags.tutDone = true;
        startEvent(w, { id: w.nid(), kind: 'raid', star: col[0], planet: col[1], until: w.s.t + 150 });
        break;
      }
      case 'salvage':
        for (const c of COMP_IDS) (w.s.comps ??= {})[c] = (w.s.comps[c] ?? 0) + 5;
        w.s.blueprints = Object.keys(RECIPES);
        this.ui.toast('Every blueprint, and 5 of each component.', '🐞');
        break;
      case 'meteor': case 'distress': case 'relic': case 'rare': case 'trader': case 'refugees': case 'wreck':
        w.s.flags.tutDone = true;
        if (!randomEvent(w, what)) this.ui.toast(`No world nearby suits a ${EVENT_INFO[what].label.toLowerCase()}.`, '🐞');
        break;
      case 'eco': {
        let col = w.colonies().find(([s]) => s !== w.gal.homeStar) ?? [w.gal.homeStar, 2] as [number, number];
        const marks: number[] = [];
        for (let i = 0; i < 5; i++) marks.push(Math.random() * TAU, (Math.random() - 0.5) * 1.6);
        startEvent(w, { id: w.nid(), kind: 'eco', star: col[0], planet: col[1], until: w.s.t + 180, marks });
        break;
      }
      case 'core': {
        w.s.flags.tutDone = true;
        w.s.missions = w.s.missions.filter((m) => m.kind !== 'tutorial');
        if (!w.s.flags.hollowContact) {
          w.s.flags.hollowContact = true;
          const hol = w.emap.get('hollow')!;
          hol.met = true;
          this.game.unlock('hollow-contact');
        }
        w.s.tools.drive5 = 1;
        w.s.energy = w.maxEnergy;
        checkMainMissions(w);
        // The innermost bastion, a single hop from the core.
        const inner = w.gal.stars.filter((s) => s.hollow).sort((a, b) => a.r - b.r)[0];
        this.panel?.close();
        closeAllSheets();
        this.arrive(inner.id, 'gate');
        this.later(600, () => { this.showGalaxy(w.gal.coreId); this.selectStar(w.gal.coreId); });
        break;
      }
    }
    this.hud.refresh(true);
  }
}

