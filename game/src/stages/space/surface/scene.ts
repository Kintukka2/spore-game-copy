// Planet landing: fly your starship low over a world (the Civilization-stage map, coloured to match the
// planet), find its herds and flora, and beam specimens aboard. Cities sit where their owners founded them,
// ringed by turrets; at war, those turrets open fire and you can lay siege to the cities. Your homeworld is
// the very map you united in the Civilization stage, with the Xeno-Lab and its Menagerie on it.
import type { Game, Scene } from '../../../game/game';
import type { PointerInfo } from '../../../engine/input';
import { Camera } from '../../../engine/camera';
import { button, h, progressBar } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { RNG } from '../../../engine/rng';
import { clamp, TAU } from '../../../engine/math';
import { rgba } from '../../../design/color';
import { generateBuilding } from '../../../design/generate';
import type { Design, Palette } from '../../../design/types';
import { nationTypeFor } from '../../../game/cards';
import { EARTH_LOOK, Terrain } from '../../civ/terrain';
import { drawTerrainDecor, drawTerrainMap, nearX } from '../../civ/terrainDraw';
import { cloudSprite, designSprite, drawSprite, type Sprite } from '../../civ/sprites';
import { generateWorld, nationPalette, PLAYER_COLOR } from '../../civ/world';
import { H, slotPos, W, wdist, wdx, wrapX } from '../../civ/types';
import { tScoreOf } from '../data';
import { drawShip, shipLength } from '../art/shipArt';
import { drawPlant, money, paintSpecimen } from '../ui/common';
import { abduct, isHomeworld } from '../economy';
import { razeCity } from '../empires';
import { resolve as resolveEvent } from '../events';
import { lifeOn } from '../scan';
import { tutorialEvent } from '../missions';
import { catalogue, inXenopedia } from '../xenolab';
import type { SpaceStage } from '../stage';
import type { GEvent, Specimen } from '../types';
import { farSpot, spawnLife, stepCritter, type Critter, type LifeSite } from './life';
import { surfaceLook } from './look';

/** Ship hover height above its ground point (world units). */
const LIFT = 46;
/** Reach of the tractor beam from the ship's ground point. */
const REACH = 78;
const SEED_CAP = 60;
/** Life scan radius: about a quarter of the planet, so finding everything takes a few sweeps. */
const SCAN_R = 760;

interface Turret { dx: number; dy: number; hp: number; max: number; cd: number; ang: number; flash: number }
interface SurfCity {
  x: number; y: number; name: string; color: string; large: boolean; slots: number;
  blds: { d: Design; dx: number; dy: number; size: number }[];
  /** City hall strength, and the turrets on its rim. Turrets fire only when you are at war with the owner. */
  hp: number; max: number; turrets: Turret[]; dead: boolean; fire: number;
}
/** An enemy turret's shot: flies along the ground toward where the ship was, rising to its height. */
interface Bolt { x: number; y: number; tx: number; ty: number; t: number; dur: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }
/** The Xeno-Lab on your homeworld: glass domes, and a paddock where your Menagerie exhibits roam. */
interface Lab { x: number; y: number; pets: { d: Design; size: number; x: number; y: number; vx: number; vy: number; face: number; phase: number }[] }

/** How close the ship must be to fire on a city, and for its turrets to fire back. */
const SIEGE_R = 330;
const TURRET_R = 430;
interface Built { key: string; T: Terrain; sites: { x: number; y: number; name: string; large: boolean; slots: number }[] }
/** An ancient relic buried on the surface (Ancient signal event). */
interface Relic { relic: true; x: number; y: number; seen: boolean; taken: boolean }
type Target = Critter | LifeSite | Relic;
type Beam = { c?: Critter; site?: LifeSite; relic?: Relic; p: number };
/** One icon in the species tray: a species living here, or the relic. */
interface Tile { sp?: Specimen; el: HTMLElement; cv?: HTMLCanvasElement; badge: HTMLElement; state: string }

// The last landing's terrain, so hopping back down to the same world is instant.
let lastBuilt: Built | null = null;

const floraCache = new Map<number, HTMLCanvasElement>();
function floraSprite(seed: number): HTMLCanvasElement {
  let c = floraCache.get(seed);
  if (!c) { c = document.createElement('canvas'); drawPlant(c, seed); floraCache.set(seed, c); }
  return c;
}

export class SurfaceScene implements Scene {
  name = 'surface';
  music = 'space' as const;
  private game!: Game;
  private T: Terrain | null = null;
  private loadFrames = 2;
  private cam = new Camera();
  private t = 0;
  private ship = { x: 0, y: 0, vx: 0, vy: 0, ang: 0 };
  private joy = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  private moveTarget: { x: number; y: number } | null = null;
  private chase: Target | null = null;
  private beam: Beam | null = null;
  private sites: LifeSite[] = [];
  private critters: Critter[] = [];
  private relic: Relic | null = null;
  private tiles: Tile[] = [];
  private cities: SurfCity[] = [];
  private lab: Lab | null = null;
  private bolts: Bolt[] = [];
  private sparks: Spark[] = [];
  /** The city you are attacking. */
  private siege: SurfCity | null = null;
  private hitFlash = 0;
  private clouds: { x: number; y: number; s: number; k: number }[] = [];
  private scanCd = 0;
  private ping = -1;
  private reveal = 0;
  private caught = 0;
  private gathered = 0;
  private miniT = 0;
  private lastCtx = '';
  private lastHud = '';
  private left = false;
  // DOM
  private elCtx!: HTMLButtonElement;
  private elScan!: HTMLButtonElement;
  private elCargo!: HTMLElement;
  private elSub!: HTMLElement;
  private elLife!: HTMLElement;
  private elMini!: HTMLCanvasElement;
  private elLab!: HTMLButtonElement;
  private hpBar = progressBar('hp');

  constructor(private st: SpaceStage, readonly star: number, readonly idx: number) {}

  private get w() { return this.st.w; }
  private get planet() { return this.w.planet(this.star, this.idx); }
  /** The owner is at war with you (and not charmed): their turrets fire, and their cities can be attacked. */
  private get hostile(): boolean {
    const o = this.w.peekPS(this.star, this.idx).owner;
    const e = o && o !== 'player' && o !== 'hollow' ? this.w.emap.get(o) : null;
    return !!e && e.war && e.serenade <= 0;
  }
  private get home(): boolean { return isHomeworld(this.w, this.star, this.idx); }

  // ------------------------------------------------------------------ lifecycle
  enter(game: Game) {
    this.game = game;
    this.w.onSurface = `${this.star}:${this.idx}`;
    this.cam.minZoom = 0.32;
    this.cam.maxZoom = 1.8;
    this.buildHud();
  }
  exit() { this.left = true; this.w.onSurface = null; }

  /** A live event of this kind on this world. */
  private event(kind: GEvent['kind']): GEvent | undefined {
    return this.w.s.events.find((e) => e.kind === kind && e.star === this.star && e.planet === this.idx);
  }

  /** Generate (or reuse) the terrain, cities and life. Runs after the first loading frames have painted. */
  private build() {
    const w = this.w, gs = this.game.state!, game = this.game;
    const pl = this.planet;
    const ps = w.ps(this.star, this.idx);
    ps.landed = true;
    const home = isHomeworld(w, this.star, this.idx);
    const t = tScoreOf(ps.atm, ps.temp);
    const seed = home ? (gs.seed ^ 0x51f15e) >>> 0 : (pl.seed ^ 0x7a11) >>> 0;
    const key = `${this.star}:${this.idx}:${home ? 'home' : t + ':' + Math.round(ps.temp * 4) + ':' + Math.round(ps.atm * 4)}`;
    let built = lastBuilt?.key === key ? lastBuilt : null;
    if (!built) {
      const T = new Terrain(seed, home ? EARTH_LOOK : surfaceLook(pl, ps));
      // City sites come from the Civilization-stage generator, so the homeworld matches the map you united.
      const wi = generateWorld(T, seed + 17, {
        playerType: nationTypeFor(gs.cards), playerName: gs.speciesName,
        homeName: home && typeof gs.carry.homeName === 'string' ? gs.carry.homeName : undefined,
        nNations: home ? game.diff(3, 4, 5) : 1,
        attitude: game.diff({ friendly: 0.5, neutral: 0.4, hostile: 0.1 }, { friendly: 0.3, neutral: 0.45, hostile: 0.25 }, { friendly: 0.15, neutral: 0.4, hostile: 0.45 }),
        aiTurrets: game.diff(-1, 0, 1), ensureHostile: home && game.difficulty !== 'easy',
      });
      built = { key, T, sites: wi.cities.map((c) => ({ x: c.x, y: c.y, name: c.name, large: c.large, slots: c.slots.length })) };
      lastBuilt = built;
    }
    const T = built.T;
    // Cities of the owner.
    const owner = ps.owner && ps.owner !== 'hollow' ? ps.owner : null;
    // On the homeworld, the last city site holds the Xeno-Lab instead.
    const labSite = home && built.sites.length > 1 ? built.sites[built.sites.length - 1] : null;
    const sites = labSite ? built.sites.slice(0, -1) : built.sites;
    const nCities = owner ? (home ? sites.length : Math.min(sites.length, ps.cities)) : 0;
    if (owner && nCities > 0) {
      const color = owner === 'player' ? PLAYER_COLOR : w.emap.get(owner)?.color ?? '#ffffff';
      const art = this.cityArt(owner, color);
      const r = new RNG(seed ^ 0xc17);
      const thp = game.diff(120, 160, 200), chp = game.diff(450, 600, 750);
      for (const s of sites.slice(0, nCities)) {
        const blds: SurfCity['blds'] = [{ d: art.hall, dx: 0, dy: 4, size: s.large ? 76 : 66 }];
        for (let i = 0; i < s.slots; i++) {
          if (r.chance(0.18)) continue;
          const p = slotPos(i, s.slots);
          const k = r.pick(['house', 'house', 'factory', 'fun'] as const);
          blds.push({ d: art[k], dx: p.x, dy: p.y, size: k === 'house' ? 24 : k === 'factory' ? 30 : 28 });
        }
        const nt = s.large ? 3 : 2;
        const turrets: Turret[] = Array.from({ length: nt }, (_, i) => {
          const a = -Math.PI / 2 + ((i + 0.5) * TAU) / nt + 0.35;
          return { dx: Math.cos(a) * 128, dy: Math.sin(a) * 86 + 6, hp: thp, max: thp, cd: 1 + r.range(0, 1.5), ang: r.range(0, TAU), flash: 0 };
        });
        const max = Math.round(chp * (s.large ? 1.3 : 1));
        this.cities.push({ x: s.x, y: s.y, name: s.name, color, large: s.large, slots: s.slots, blds, hp: max, max, turrets, dead: false, fire: 0 });
      }
    }
    if (labSite) {
      const r = new RNG(seed ^ 0x1ab);
      const pets: Lab['pets'] = [];
      for (const sp of (w.s.zoo ?? []).filter((z) => z.diet !== 'plant').slice(0, 6)) {
        const d = w.specimenDesign(sp);
        if (d) pets.push({ d, size: r.range(22, 27), x: r.range(-50, 50), y: r.range(-14, 14), vx: 0, vy: 0, face: r.chance(0.5) ? 1 : -1, phase: r.range(0, 9) });
      }
      this.lab = { x: labSite.x, y: labSite.y, pets };
    }
    // Life: whatever lives in the planet's ecosystem, plus its natives.
    const species: Specimen[] = lifeOn(w, this.star, this.idx);
    const add = (sp: Specimen | null) => { if (sp && !species.some((x) => x.seed === sp.seed)) species.push(sp); };
    const rare = this.event('rare')?.sp;
    add(rare ?? null);
    const life = spawnLife(T, species, pl.seed, this.cities, (sp) => w.specimenDesign(sp));
    this.sites = life.sites;
    this.critters = life.critters;
    // Start above the first city, or the clearing where one would stand.
    const c0 = this.cities[0] ?? built.sites[0];
    if (c0) { this.ship.x = c0.x; this.ship.y = c0.y + 70; }
    else { this.ship.x = T.homeX; this.ship.y = T.homeY; }
    const sig = this.event('relic');
    if (sig) {
      const p = farSpot(T, pl.seed ^ sig.id, this.ship);
      if (p) this.relic = { relic: true, x: p.x, y: p.y, seen: false, taken: false };
    }
    this.cam.x = this.ship.x; this.cam.y = this.ship.y;
    this.cam.setViewport(game.w, game.h);
    this.cam.zoom = clamp(Math.min(game.w, game.h) / 470, 0.6, 1.25);
    if (ps.atm > 0.35) {
      const r = new RNG(seed ^ 0xc10d);
      for (let i = 0; i < 9; i++) this.clouds.push({ x: (i / 9) * W + r.range(0, 200), y: r.range(260, H - 260), s: r.range(1.2, 2.4), k: i % 4 });
    }
    this.T = T;
    this.buildTray();
    this.refreshHud(true);
    // A free scan on arrival points the way to the nearest life.
    if (this.sites.length) setTimeout(() => this.scan(true), 700);
    else if (!this.relic) this.st.ui.toast(`No life signs on ${pl.name}. Fly around, or head back to orbit.`, '📡');
    if (rare) setTimeout(() => this.st.ui.toast(`The ${rare.name} is down here somewhere. It bolts at the sight of your ship: chase it down!`, '✨', 'gold'), 1600);
    if (this.relic) setTimeout(() => this.st.ui.toast('The ancient signal is faint. Sweep the surface with 📡 Life scan to pin it down.', '🗿', 'gold'), rare ? 4200 : 1600);
    game.hint('landing', 'Drag anywhere to fly. Fly over a creature and tap 🛸 Beam up, or just tap the creature.', '🛸');
    if (this.hostile && this.cities.length) {
      const e = w.emap.get(ps.owner!);
      setTimeout(() => this.st.ui.toast(`You are at war with ${e?.name ?? 'them'}: their city turrets will open fire! Tap a city to lay siege to it.`, '⚔️', 'bad'), 900);
    }
    if (this.lab) game.hint('lab-surface', 'Your Xeno-Lab stands here, with your Menagerie exhibits in its paddock. Fly over it, or tap 🧬, to go inside.', '🧬');
  }

  private cityArt(owner: string, color: string): Record<'hall' | 'house' | 'factory' | 'fun', Design> {
    const gs = this.game.state!;
    if (owner === 'player') {
      const r = new RNG(gs.seed ^ 0xb1d);
      const pal = (gs.designs.cityhall?.colors as Palette | undefined) ?? nationPalette(color, r);
      return {
        hall: gs.designs.cityhall ?? generateBuilding(r, 'cityhall', pal),
        house: gs.designs.house ?? generateBuilding(r, 'house', pal),
        factory: gs.designs.factory ?? generateBuilding(r, 'factory', pal),
        fun: gs.designs.entertainment ?? generateBuilding(r, 'entertainment', pal),
      };
    }
    const e = this.w.emap.get(owner);
    const r = new RNG((e?.seed ?? 7) ^ 0xb1d);
    const pal = nationPalette(color, r);
    return { hall: generateBuilding(r, 'cityhall', pal), house: generateBuilding(r, 'house', pal), factory: generateBuilding(r, 'factory', pal), fun: generateBuilding(r, 'entertainment', pal) };
  }

  // ------------------------------------------------------------------ HUD
  private buildHud() {
    const L = this.game.layer('sf-hud');
    const pl = this.planet;
    const back = button('⬆ Orbit', () => this.leave(), { cls: 'sf-back', title: 'Return to orbit' });
    this.elCargo = h('div', { class: 'chip sf-cargo' });
    this.elSub = h('span', { class: 'sf-sub' });
    const title = h('div', { class: 'sf-title' }, h('b', null, pl.name), this.elSub);
    const top = h('div', { class: 'sf-top' }, back, title, this.elCargo);
    this.hpBar.el.classList.add('sf-hp');
    this.hpBar.el.style.display = 'none';
    this.elLife = h('div', { class: 'sf-life' });
    this.elMini = h('canvas', { class: 'sf-mini', 'aria-label': 'Map' }) as HTMLCanvasElement;
    this.elMini.addEventListener('pointerdown', (e) => {
      const rc = this.elMini.getBoundingClientRect();
      const x = ((e.clientX - rc.left) / rc.width) * W, y = ((e.clientY - rc.top) / rc.height) * H;
      this.moveTarget = { x: wrapX(x), y: clamp(y, 80, H - 80) };
      this.chase = null;
      audio.sfx('tap');
    });
    this.elScan = button('📡', () => this.scan(false), { cls: 'icon sf-scan', title: 'Life scan (⚡1)' });
    this.elCtx = button('', () => this.act(), { cls: 'primary sf-ctx' });
    this.elCtx.style.display = 'none';
    this.elLab = button('🧬', () => this.st.openLab(), { cls: 'icon sf-lab', title: 'Xeno-Lab' });
    this.elLab.style.display = this.home ? '' : 'none';
    const acts = h('div', { class: 'sf-acts' }, this.elLab, this.elScan, this.elCtx);
    L.append(top, this.hpBar.el, this.elLife, this.elMini, acts);
  }

  private refreshHud(force = false) {
    const w = this.w;
    const ps = w.peekPS(this.star, this.idx);
    this.updateTray(force);
    // Hull, while there is fighting (or damage) to show.
    const showHp = this.hostile || w.s.hp < w.maxHp;
    this.hpBar.el.style.display = showHp ? '' : 'none';
    if (showHp) this.hpBar.set(w.s.hp / w.maxHp, `❤ ${Math.round(w.s.hp)} / ${w.maxHp}`);
    const key = `${w.cargoUsed}/${w.cargoCap}/${w.count('seeds')}`;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.elCargo.textContent = `📦 ${w.cargoUsed}/${w.cargoCap} · 🌱 ${w.count('seeds')}`;
    const t = tScoreOf(ps.atm, ps.temp);
    const owner = ps.owner === 'player' ? 'Your world' : ps.owner && ps.owner !== 'hollow' ? w.emap.get(ps.owner)?.name ?? '' : 'Unclaimed';
    this.elSub.textContent = `T${t} ${'★'.repeat(t)}${'☆'.repeat(3 - t)} · ${owner}`;
  }

  /** The species tray: one icon per species here (plants, then animals), dark until a group of it is spotted. */
  private buildTray() {
    const L = this.elLife;
    L.innerHTML = '';
    this.tiles = [];
    const order = (sp: Specimen) => (sp.rare ? 2 : sp.diet === 'plant' ? 0 : 1);
    const list = [...new Map(this.sites.map((s) => [s.sp.seed, s.sp])).values()].sort((a, b) => order(a) - order(b));
    if (!list.length && !this.relic) { L.append(h('span', { class: 'sf-none' }, '🧬 No life signs')); return; }
    L.classList.toggle('dense', list.length + (this.relic ? 1 : 0) > 8);
    const tile = (t: Tile, ...kids: HTMLElement[]) => {
      t.el.append(...kids, t.badge);
      t.el.addEventListener('click', () => this.tapTile(t));
      this.tiles.push(t);
      L.append(t.el);
    };
    for (const sp of list) {
      const cv = h('canvas') as HTMLCanvasElement;
      tile({ sp, el: h('div', { class: 'sf-sp hid', role: 'button' }), cv, badge: h('i'), state: '' }, cv);
    }
    if (this.relic) {
      tile({ el: h('div', { class: 'sf-sp hid relic', role: 'button' }), badge: h('i'), state: '' }, h('span', { class: 'sf-glyph' }, '🗿'));
    }
    // Paint once the canvases have their size.
    requestAnimationFrame(() => this.updateTray(true));
  }

  private tileState(t: Tile): string {
    if (!t.sp) { const r = this.relic!; return r.taken ? 'got gone' : r.seen ? 'new' : 'hid'; }
    const seed = t.sp.seed;
    let seen = false, left = false;
    for (const s of this.sites) {
      if (s.sp.seed !== seed) continue;
      seen ||= s.seen;
      left ||= s.kind === 'flora' ? !s.harvested : this.critters.some((c) => c.site === s && !c.gone);
    }
    if (!seen) return 'hid';
    return (inXenopedia(this.w, t.sp) ? 'got' : 'new') + (left ? '' : ' gone');
  }

  private updateTray(force = false) {
    for (const t of this.tiles) {
      const state = this.tileState(t);
      if (state === t.state && !force) continue;
      const hid = state === 'hid', was = t.state === '' || t.state === 'hid';
      t.el.className = `sf-sp ${state}` + (t.sp ? (t.sp.rare ? ' rare' : t.sp.diet === 'plant' ? ' pl' : ' an') : ' relic') + (was && !hid && t.state ? ' pop' : '');
      t.badge.textContent = hid ? '?' : state.startsWith('new') ? 'NEW' : '✓';
      const what = t.sp ? (t.sp.diet === 'plant' ? 'plant' : 'creature') : 'relic';
      t.el.title = hid ? `Unknown ${what}` : t.sp ? t.sp.name : 'Ancient relic';
      if (t.cv && t.sp && (force || hid !== was)) paintSpecimen(t.cv, this.w, t.sp, hid);
      t.state = state;
    }
  }

  /** Tap a tray icon: fly to the nearest group of that species. */
  private tapTile(t: Tile) {
    audio.sfx('tap');
    if (t.state === 'hid') {
      this.st.ui.toast(t.sp ? `An unknown ${t.sp.diet === 'plant' ? 'plant' : 'creature'} lives here. Explore, or use 📡 Life scan to find it.` : 'Something ancient is buried here. Use 📡 Life scan to pin it down.', '❔');
      return;
    }
    const sh = this.ship;
    let best: Target | null = null, bd = Infinity;
    const consider = (o: Target) => { const d = wdist(o.x, o.y, sh.x, sh.y); if (d < bd) { bd = d; best = o; } };
    if (t.sp) {
      for (const c of this.critters) if (c.sp.seed === t.sp.seed && !c.gone && c.lift === 0) consider(c);
      for (const s of this.sites) if (s.kind === 'flora' && s.sp.seed === t.sp.seed && !s.harvested) consider(s);
    } else if (this.relic && !this.relic.taken) consider(this.relic);
    if (!best) { this.st.ui.toast(t.sp ? `You have collected every ${t.sp.name} here.` : 'The relic is already aboard.', '✓'); return; }
    this.chase = best;
    this.moveTarget = null;
  }

  // ------------------------------------------------------------------ actions
  private scan(free: boolean) {
    if (!this.T || this.left) return;
    if (this.scanCd > 0 && !free) { audio.sfx('error'); return; }
    // The landing sweep is free; each scan you call for costs energy.
    if (!free && !this.w.spendScan()) return;
    this.scanCd = 6;
    this.ping = 0;
    this.reveal = 10;
    let n = 0;
    for (const s of this.sites) if (wdist(s.x, s.y, this.ship.x, this.ship.y) < SCAN_R) { if (!s.seen) n++; s.seen = true; }
    const r = this.relic;
    let relic = false;
    if (r && !r.seen && !r.taken && wdist(r.x, r.y, this.ship.x, this.ship.y) < SCAN_R) {
      r.seen = relic = true;
      setTimeout(() => this.st.ui.toast('Life scan locked onto the ancient signal! Follow the 🗿 arrow.', '🗿', 'gold'), 900);
    }
    audio.sfx('zap', { pitch: 0.7 });
    const hidden = this.tiles.some((t) => t.state === 'hid');
    if (free || relic) return;
    if (n) this.st.ui.toast(`Life scan: ${n} new life sign${n === 1 ? '' : 's'} marked on your map.`, '📡');
    else if (hidden) this.st.ui.toast('Nothing new within range. Fly further out and scan again.', '📡');
  }

  /** The beam target under the ship, if any. */
  private ctxTarget(): Target | null {
    const sh = this.ship;
    let best: Critter | null = null, bd = REACH;
    for (const c of this.critters) {
      if (c.gone || c.lift > 0) continue;
      const d = wdist(c.x, c.y, sh.x, sh.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) return best;
    for (const s of this.sites) if (s.kind === 'flora' && !s.harvested && wdist(s.x, s.y, sh.x, sh.y) < REACH - 8) return s;
    const r = this.relic;
    if (r && !r.taken && wdist(r.x, r.y, sh.x, sh.y) < REACH - 8) return r;
    return null;
  }

  private act() {
    if (this.beam) return;
    const tg = this.ctxTarget();
    if (tg) { this.startBeam(tg); return; }
    if (this.nearLab()) { this.st.openLab(); return; }
    const c = this.nearCity();
    if (c && this.hostile) { this.siege = this.siege === c ? null : c; audio.sfx(this.siege ? 'alarm' : 'click', { vol: 0.5 }); }
  }

  private nearLab(): boolean {
    const l = this.lab;
    return !!l && wdist(l.x, l.y, this.ship.x, this.ship.y) < 150;
  }

  /** The standing city closest to the ship, within siege range. */
  private nearCity(): SurfCity | null {
    let best: SurfCity | null = null, bd = SIEGE_R;
    for (const c of this.cities) {
      if (c.dead) continue;
      const d = wdist(c.x, c.y, this.ship.x, this.ship.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ------------------------------------------------------------------ war
  private spark(x: number, y: number, n: number, speed: number, colors: string[]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0.4 + Math.random() * 0.6, color: colors[i % colors.length], size: 1.5 + Math.random() * 2.5 });
    }
  }

  /** Turrets fire on the ship; the ship's laser cuts down the city under siege, turrets first. */
  private updateWar(dt: number) {
    const w = this.w, sh = this.ship;
    const hostile = this.hostile;
    const dmg = Math.max(6, w.maxHp * this.game.diff(0.025, 0.035, 0.05));
    for (const c of this.cities) {
      if (c.fire > 0) c.fire -= dt;
      for (const t of c.turrets) {
        if (t.hp <= 0) continue;
        t.flash = Math.max(0, t.flash - dt * 4);
        const tx = c.x + t.dx, ty = c.y + t.dy;
        const near = hostile && !c.dead && wdist(tx, ty, sh.x, sh.y) < TURRET_R;
        const want = near ? Math.atan2(sh.y - ty, wdx(tx, sh.x)) : t.ang + Math.sin(this.t * 0.7 + t.dx) * dt * 0.8;
        let da = want - t.ang;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        t.ang += da * Math.min(1, dt * (near ? 5 : 1));
        if (!near) continue;
        t.cd -= dt;
        if (t.cd > 0) continue;
        t.cd = this.game.diff(2.4, 1.8, 1.35) + Math.random() * 0.6;
        t.flash = 1;
        const d = wdist(tx, ty, sh.x, sh.y);
        this.bolts.push({ x: tx, y: ty, tx: wrapX(sh.x + sh.vx * 0.25), ty: sh.y + sh.vy * 0.25, t: 0, dur: Math.max(0.35, d / 380) });
        audio.sfx('laser', { pitch: 0.55, vol: 0.35 });
      }
    }
    for (const b of this.bolts) {
      b.t += dt;
      if (b.t < b.dur) continue;
      if (wdist(b.tx, b.ty, sh.x, sh.y) < 32) {
        w.s.hp = Math.max(0, w.s.hp - dmg);
        this.hitFlash = 1;
        this.spark(sh.x, sh.y - LIFT, 10, 140, ['#ff8a5a', '#ffd166']);
        audio.sfx('hit', { vol: 0.5 });
      } else this.spark(b.tx, b.ty, 5, 70, ['#ff9a6a', '#776655']);
    }
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.5);
    // Your laser: turrets first, then the city hall.
    const c = this.siege;
    if (c && (c.dead || !hostile)) this.siege = null;
    if (this.siege && wdist(this.siege.x, this.siege.y, sh.x, sh.y) < SIEGE_R) {
      const sc = this.siege;
      const dps = this.st.sv.combat.laserDps();
      const t = sc.turrets.filter((x) => x.hp > 0).sort((a, b) => wdist(sc.x + a.dx, sc.y + a.dy, sh.x, sh.y) - wdist(sc.x + b.dx, sc.y + b.dy, sh.x, sh.y))[0];
      const px = t ? sc.x + t.dx : sc.x, py = t ? sc.y + t.dy - 16 : sc.y - 30;
      if (Math.random() < dt * 20) this.spark(px, py, 1, 90, ['#9ff3ff', '#ffffff']);
      if (t) {
        t.hp -= dps * dt;
        if (t.hp <= 0) {
          this.spark(px, py, 30, 220, ['#ff7a3a', '#ffd166', '#555555']);
          audio.sfx('explode', { vol: 0.45, pitch: 1.3 });
          w.addMoney(3000);
          this.st.ui.toast(`Turret destroyed: +${money(3000)}`, '💥', 'good');
        }
      } else {
        sc.hp -= dps * dt;
        if (sc.hp <= 0) this.cityFalls(sc);
      }
    }
    // Shot down? Limp back to orbit.
    if (w.s.hp <= 0 && !this.left) {
      this.left = true;
      this.st.ui.toast('Hull breached! Emergency lift to orbit…', '💥', 'bad');
      this.leave();
    }
  }

  private cityFalls(c: SurfCity) {
    const w = this.w;
    c.dead = true;
    c.hp = 0;
    c.fire = 30;
    for (const t of c.turrets) t.hp = 0;
    this.siege = null;
    for (let i = 0; i < 4; i++) setTimeout(() => this.spark(c.x + (Math.random() - 0.5) * 160, c.y - 20 + (Math.random() - 0.5) * 80, 40, 260, ['#ff7a3a', '#ffd166', '#ffffff', '#444444']), i * 160);
    audio.sfx('explode');
    w.addMoney(12000);
    const res = razeCity(w, this.star, this.idx);
    if (res === 'captured') {
      this.st.ui.toast(`${c.name} falls, and ${this.planet.name} is yours! Plunder: +${money(12000)}`, '🏳️', 'gold');
      audio.sfx('levelup');
    } else this.st.ui.toast(`${c.name} has fallen! Plunder: +${money(12000)}. ${w.peekPS(this.star, this.idx).cities} ${w.peekPS(this.star, this.idx).cities === 1 ? 'city' : 'cities'} left.`, '🔥', 'gold');
    this.refreshHud(true);
  }

  private startBeam(tg: Target) {
    const w = this.w;
    this.chase = null;
    if ('relic' in tg) {
      tg.seen = true;
      this.beam = { relic: tg, p: 0 };
    } else if ('d' in tg) {
      if (w.cargoUsed >= w.cargoCap) { this.st.ui.toast('Your cargo hold is full. Exhibit, splice or release specimens first.', '📦', 'bad'); audio.sfx('error'); return; }
      this.beam = { c: tg, p: 0 };
      tg.lift = 0.01;
      for (const o of this.critters) if (o !== tg && o.site === tg.site) o.panic = 1.6;
    } else {
      if (w.count('seeds') >= SEED_CAP) { this.st.ui.toast('Your seed vault is full.', '🌱'); audio.sfx('error'); return; }
      this.beam = { site: tg, p: 0 };
    }
    audio.sfx('warp', { pitch: 1.6, vol: 0.5 });
  }

  private updateBeam(dt: number) {
    const b = this.beam;
    if (!b) return;
    const sh = this.ship, w = this.w;
    if (b.c) {
      const c = b.c;
      const d = wdist(c.x, c.y, sh.x, sh.y);
      if (c.lift < 0.3 && d > REACH + 20) {
        this.beam = null;
        c.lift = 0;
        c.panic = 1.8;
        this.st.ui.toast(`${c.sp.name} slipped out of the beam! Hover still over it.`, '💨');
        audio.sfx('fail');
        return;
      }
      const k = Math.min(1, dt * 3);
      c.x = wrapX(c.x + wdx(c.x, sh.x) * k);
      c.y += (sh.y - c.y) * k;
      c.lift = Math.min(1, c.lift + dt / 1.5);
      if (c.lift < 1) return;
      this.beam = null;
      const err = abduct(w, this.star, this.idx, c.sp);
      if (err) { c.lift = 0; c.panic = 1.5; this.st.ui.toast(err, '📦', 'bad'); audio.sfx('error'); return; }
      c.gone = true;
      this.caught++;
      const grant = catalogue(w, c.sp);
      this.st.ui.toast(`${c.sp.name} beamed aboard.` + (grant ? ` New to the Xenopedia: ${money(grant)} research grant.` : ''), grant ? '📖' : '🛸', 'good');
      audio.sfx('success');
      const sight = c.sp.rare ? this.event('rare') : undefined;
      if (sight) resolveEvent(w, sight);
      if (this.star === w.gal.homeStar) tutorialEvent(w, 'abduct');
      if (!w.s.flags.labHint) { w.s.flags.labHint = true; setTimeout(() => this.st.ui.toast('Specimens can be exhibited, spliced into hybrids or released into ecosystems. Visit the 🧬 Xeno-Lab on your homeworld.', '🧬'), 1800); }
    } else if (b.relic) {
      const r = b.relic;
      if (wdist(r.x, r.y, sh.x, sh.y) > REACH + 20) { this.beam = null; audio.sfx('fail'); return; }
      b.p += dt / 2.2;
      if (b.p < 1) return;
      this.beam = null;
      r.taken = true;
      const ev = this.event('relic');
      if (ev) resolveEvent(w, ev);
    } else if (b.site) {
      const s = b.site;
      if (wdist(s.x, s.y, sh.x, sh.y) > REACH + 20) { this.beam = null; audio.sfx('fail'); return; }
      b.p += dt / 0.9;
      if (b.p < 1) return;
      this.beam = null;
      s.harvested = true;
      w.give('seeds', 2);
      this.gathered++;
      const grant = catalogue(w, s.sp);
      this.st.ui.toast(`Gathered seeds of ${s.sp.name}. +2 seed pods.` + (grant ? ` New to the Xenopedia: ${money(grant)} grant.` : ''), '🌱', 'good');
      audio.sfx('pop');
    }
    this.refreshHud();
  }

  private leave() {
    this.beam = null;
    const caught = this.caught, gathered = this.gathered;
    audio.sfx('whoosh');
    this.game.fade(() => {
      this.game.pop();
      if (caught || gathered) this.st.ui.toast(`Back in orbit with ${[caught ? `${caught} specimen${caught === 1 ? '' : 's'}` : '', gathered ? `${gathered * 2} seed pods` : ''].filter(Boolean).join(' and ')}.`, '🛸', 'good');
    }, 420);
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    if (!this.T) { if (--this.loadFrames <= 0) this.build(); return; }
    const T = this.T;
    this.t += dt;
    const sh = this.ship;
    const maxSp = 240 * this.w.speedMult;
    let dvx = 0, dvy = 0, steering = false;
    const k = this.game.input.keys;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const ky = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (this.joy.active) {
      const jx = (this.joy.x - this.joy.ox) / 56, jy = (this.joy.y - this.joy.oy) / 56;
      const l = Math.hypot(jx, jy), m = Math.min(1, l);
      if (l > 0.08) { dvx = (jx / l) * m * maxSp; dvy = (jy / l) * m * maxSp; steering = true; }
    } else if (kx || ky) {
      const l = Math.hypot(kx, ky);
      dvx = (kx / l) * maxSp; dvy = (ky / l) * maxSp; steering = true;
    }
    if (steering) { this.moveTarget = null; this.chase = null; }
    else {
      let tgt: { x: number; y: number } | null = this.moveTarget;
      if (this.chase) {
        const ch = this.chase;
        const gone = 'relic' in ch ? ch.taken : 'd' in ch ? ch.gone || ch.lift > 0 : ch.harvested;
        if (gone) this.chase = null;
        else {
          tgt = { x: ch.x, y: ch.y };
          if (!this.beam && wdist(ch.x, ch.y, sh.x, sh.y) < 34) { this.startBeam(ch); tgt = null; }
        }
      }
      if (tgt && !this.beam) {
        const dx = wdx(sh.x, tgt.x), dy = tgt.y - sh.y, d = Math.hypot(dx, dy);
        if (d < 12 && tgt === this.moveTarget) this.moveTarget = null;
        else { const sp = Math.min(maxSp, d * 2.4 + 30); dvx = (dx / d) * sp; dvy = (dy / d) * sp; }
      }
    }
    const acc = 1 - Math.exp(-(steering || this.moveTarget || this.chase ? 5 : 3) * dt);
    sh.vx += (dvx - sh.vx) * acc;
    sh.vy += (dvy - sh.vy) * acc;
    sh.x = wrapX(sh.x + sh.vx * dt);
    sh.y = clamp(sh.y + sh.vy * dt, 90, H - 90);
    const speed = Math.hypot(sh.vx, sh.vy);
    if (speed > 25) {
      const a = Math.atan2(sh.vy, sh.vx);
      let da = a - sh.ang;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      sh.ang += da * Math.min(1, dt * 6);
    }
    // Camera follows the ship.
    const cam = this.cam;
    cam.x += wdx(cam.x, sh.x) * Math.min(1, dt * 4);
    cam.y += (sh.y - cam.y) * Math.min(1, dt * 4);
    cam.x = wrapX(cam.x);
    const halfH = cam.h / 2 / cam.zoom;
    cam.y = halfH * 2 >= H ? H / 2 : clamp(cam.y, halfH - 30, H - halfH + 30);
    // Life
    const scary = speed > 170 || !!this.beam;
    for (const c of this.critters) stepCritter(c, dt, T, { x: sh.x, y: sh.y, scary });
    this.updateBeam(dt);
    this.updateWar(dt);
    for (const p of this.sparks) { p.life -= dt; p.x = wrapX(p.x + p.vx * dt); p.y += p.vy * dt; p.vy += 260 * dt; }
    this.sparks = this.sparks.filter((p) => p.life > 0);
    if (this.lab) for (const p of this.lab.pets) {
      // Menagerie exhibits amble about their paddock.
      p.phase += dt;
      if (Math.random() < dt * 0.4) { p.vx = (Math.random() - 0.5) * 30; p.vy = (Math.random() - 0.5) * 12; }
      p.x = clamp(p.x + p.vx * dt, -62, 62); p.y = clamp(p.y + p.vy * dt, -16, 16);
      if (Math.abs(p.vx) > 2) p.face = p.vx > 0 ? 1 : -1;
    }
    const b = cam.bounds(-20);
    for (const s of this.sites) if (!s.seen && s.y > b.y0 && s.y < b.y1 && Math.abs(wdx(cam.x, s.x)) < (b.x1 - b.x0) / 2) s.seen = true;
    const rl = this.relic;
    if (rl && !rl.seen && rl.y > b.y0 && rl.y < b.y1 && Math.abs(wdx(cam.x, rl.x)) < (b.x1 - b.x0) / 2) rl.seen = true;
    // Timers
    if (this.scanCd > 0) this.scanCd -= dt;
    if (this.ping >= 0) { this.ping += dt; if (this.ping > 1.4) this.ping = -1; }
    if (this.reveal > 0) this.reveal -= dt;
    this.elScan.classList.toggle('cool', this.scanCd > 0);
    // Contextual action
    const tg = this.beam ? null : this.ctxTarget();
    const city = !tg && this.hostile ? (this.siege ?? this.nearCity()) : null;
    const ctxKey = this.beam ? 'beam' : tg ? ('relic' in tg ? 'relic' : 'd' in tg ? 'c' + tg.sp.seed : 'f' + tg.sp.seed)
      : this.nearLab() ? 'lab' : city ? (this.siege === city ? 'siege:' : 'city:') + city.name : '';
    if (ctxKey !== this.lastCtx) {
      this.lastCtx = ctxKey;
      const el = this.elCtx;
      el.innerHTML = '';
      el.style.display = ctxKey ? '' : 'none';
      el.disabled = !!this.beam;
      el.classList.toggle('danger', !!city && !tg && !this.beam);
      if (this.beam) el.append('🛸 Hold steady…');
      else if (ctxKey === 'lab') el.append('🧬 Enter the Xeno-Lab');
      else if (city) el.append(this.siege === city ? `⚔️ Attacking ${city.name} (tap to stop)` : `🎯 Attack ${city.name}`);
      else if (tg && 'relic' in tg) el.append('🗿 Beam up the relic');
      else if (tg) {
        el.append('d' in tg ? `🛸 Beam up ${tg.sp.name}` : `🌱 Gather ${tg.sp.name}`);
        if (!inXenopedia(this.w, tg.sp)) el.append(h('span', { class: 'xl-new' }, 'NEW'));
      }
    }
    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.2; this.drawMinimap(); this.refreshHud(); }
  }

  // ------------------------------------------------------------------ render
  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    const cam = this.cam;
    cam.setViewport(w, hh);
    if (!this.T) { this.drawLoading(g, w, hh); return; }
    const T = this.T;
    g.fillStyle = T.look.bg;
    g.fillRect(0, 0, w, hh);
    g.save();
    cam.apply(g);
    drawTerrainMap(g, cam, T, this.t);
    drawTerrainDecor(g, cam, T);
    this.drawCityGround(g);
    this.drawFlora(g);
    this.drawRelic(g);
    this.drawThings(g);
    this.drawPing(g);
    this.drawShipAndBeam(g);
    this.drawWar(g);
    this.drawClouds(g);
    g.restore();
    if (this.hitFlash > 0) {
      const gr = g.createRadialGradient(w / 2, hh / 2, Math.min(w, hh) * 0.3, w / 2, hh / 2, Math.max(w, hh) * 0.75);
      gr.addColorStop(0, 'rgba(255,40,30,0)');
      gr.addColorStop(1, `rgba(255,40,30,${0.45 * this.hitFlash})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, hh);
    }
    this.drawLabels(g);
    this.drawArrows(g, w, hh);
    this.drawJoystick(g);
  }

  private drawLoading(g: CanvasRenderingContext2D, w: number, hh: number) {
    g.fillStyle = '#04070f';
    g.fillRect(0, 0, w, hh);
    g.save();
    g.translate(w / 2, hh / 2);
    g.strokeStyle = 'rgba(160,230,255,0.7)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(0, -20, 26, performance.now() / 300, performance.now() / 300 + 4.2); g.stroke();
    g.fillStyle = '#dff4ff';
    g.font = '600 16px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(`Descending to ${this.planet.name}…`, 0, 34);
    g.restore();
  }

  private drawCityGround(g: CanvasRenderingContext2D) {
    const cam = this.cam, b = cam.bounds(170);
    const lab = this.lab;
    if (lab) {
      const x = nearX(cam, lab.x);
      if (x > b.x0 && x < b.x1 && lab.y > b.y0 && lab.y < b.y1) {
        g.fillStyle = 'rgba(125,255,106,0.12)';
        g.beginPath(); g.ellipse(x, lab.y + 4, 150, 104, 0, 0, TAU); g.fill();
        g.setLineDash([10, 8]);
        g.lineDashOffset = -this.t * 8;
        g.strokeStyle = 'rgba(125,255,106,0.75)';
        g.lineWidth = 2.2;
        g.beginPath(); g.ellipse(x, lab.y + 4, 150, 104, 0, 0, TAU); g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#d3e6db';
        g.beginPath(); g.ellipse(x, lab.y + 4, 116, 80, 0, 0, TAU); g.fill();
        // The paddock, fenced, below the domes.
        g.fillStyle = '#86c97a';
        g.beginPath(); g.ellipse(x, lab.y + 46, 80, 28, 0, 0, TAU); g.fill();
        g.strokeStyle = '#8a6a44';
        g.lineWidth = 2.5;
        g.beginPath(); g.ellipse(x, lab.y + 46, 80, 28, 0, 0, TAU); g.stroke();
        g.fillStyle = '#6e5234';
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; g.fillRect(x + Math.cos(a) * 80 - 1.5, lab.y + 46 + Math.sin(a) * 28 - 7, 3, 8); }
      }
    }
    for (const c of this.cities) {
      const x = nearX(cam, c.x);
      if (x < b.x0 || x > b.x1 || c.y < b.y0 || c.y > b.y1) continue;
      g.fillStyle = rgba(c.color, 0.13);
      g.beginPath(); g.ellipse(x, c.y + 4, 150, 104, 0, 0, TAU); g.fill();
      g.setLineDash([10, 8]);
      g.lineDashOffset = -this.t * 8;
      g.strokeStyle = rgba(c.color, 0.75);
      g.lineWidth = 2.2;
      g.beginPath(); g.ellipse(x, c.y + 4, 150, 104, 0, 0, TAU); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#cdbfa3';
      g.beginPath(); g.ellipse(x, c.y + 6, 116, 80, 0, 0, TAU); g.fill();
      g.fillStyle = '#ddd2ba';
      g.beginPath(); g.ellipse(x, c.y + 4, 108, 73, 0, 0, TAU); g.fill();
      g.strokeStyle = '#c4b597';
      g.lineWidth = 7;
      g.beginPath();
      for (let i = 0; i < c.slots; i++) { const p = slotPos(i, c.slots); g.moveTo(x, c.y + 4); g.lineTo(x + p.x, c.y + p.y); }
      g.stroke();
    }
  }

  private drawFlora(g: CanvasRenderingContext2D) {
    const cam = this.cam, b = cam.bounds(60);
    for (const s of this.sites) {
      if (s.kind !== 'flora' || s.y < b.y0 || s.y > b.y1) continue;
      const x = nearX(cam, s.x);
      if (x < b.x0 || x > b.x1) continue;
      const img = floraSprite(s.sp.seed);
      g.globalAlpha = s.harvested ? 0.45 : 1;
      for (const p of s.plants) {
        const wdt = 30 * p.s * (s.harvested ? 0.75 : 1), hgt = wdt * (52 / 80);
        g.drawImage(img, x + p.dx - wdt / 2, s.y + p.dy - hgt * 0.93, wdt, hgt);
      }
    }
    g.globalAlpha = 1;
  }

  /** The relic: a carved monolith humming with violet light. */
  private drawRelic(g: CanvasRenderingContext2D) {
    const r = this.relic;
    if (!r || r.taken) return;
    const x = nearX(this.cam, r.x), y = r.y, b = this.cam.bounds(80);
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return;
    const pul = 0.5 + 0.5 * Math.sin(this.t * 3);
    const up = this.beam?.relic === r ? this.beam.p : 0;
    g.fillStyle = `rgba(150,120,255,${0.2 + pul * 0.15})`;
    g.beginPath(); g.ellipse(x, y, 44 + pul * 6, 17 + pul * 2, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(x, y, 13, 5, 0, 0, TAU); g.fill();
    g.save();
    g.translate(x, y - up * (LIFT - 14));
    g.scale(1 - up * 0.4, 1 - up * 0.4);
    g.rotate(up * Math.sin(this.t * 6) * 0.3);
    g.fillStyle = '#2b2740';
    g.strokeStyle = '#9d8cff';
    g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-10, 0); g.lineTo(-8, -40); g.lineTo(0, -47); g.lineTo(8, -40); g.lineTo(10, 0); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = `rgba(200,185,255,${0.5 + pul * 0.5})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-4, -34); g.lineTo(0, -30); g.lineTo(4, -34);
    g.moveTo(0, -25); g.lineTo(0, -16);
    g.moveTo(-4, -10); g.lineTo(4, -10);
    g.stroke();
    g.restore();
  }

  /** Buildings and creatures, painted back to front. */
  private drawThings(g: CanvasRenderingContext2D) {
    const cam = this.cam, b = cam.bounds(90);
    const list: { y: number; s?: Sprite; x: number; dy: number; scale: number; face: number; c?: Critter; dark?: boolean; fn?: () => void }[] = [];
    for (const c of this.cities) {
      const x = nearX(cam, c.x);
      if (x < b.x0 - 100 || x > b.x1 + 100 || c.y < b.y0 - 100 || c.y > b.y1 + 60) continue;
      for (const bl of c.blds) list.push({ y: c.y + bl.dy, s: designSprite(bl.d, bl.size), x: x + bl.dx, dy: 0, scale: 1, face: 1, dark: c.dead });
      for (const t of c.turrets) list.push({ y: c.y + t.dy, x: x + t.dx, dy: 0, scale: 1, face: 1, fn: () => this.drawTurret(g, x + t.dx, c.y + t.dy, t, c.color) });
      if (c.dead && c.fire > 0) list.push({ y: c.y + 30, x, dy: 0, scale: 1, face: 1, fn: () => this.drawFires(g, x, c.y, c.fire) });
    }
    const lab = this.lab;
    if (lab) {
      const x = nearX(cam, lab.x);
      if (x > b.x0 - 120 && x < b.x1 + 120 && lab.y > b.y0 - 120 && lab.y < b.y1 + 80) {
        list.push({ y: lab.y - 4, x, dy: 0, scale: 1, face: 1, fn: () => this.drawDome(g, x, lab.y - 4, 46, false) });
        list.push({ y: lab.y + 8, x: x - 84, dy: 0, scale: 1, face: 1, fn: () => this.drawDome(g, x - 84, lab.y + 8, 27, true) });
        list.push({ y: lab.y + 10, x: x + 82, dy: 0, scale: 1, face: 1, fn: () => this.drawDome(g, x + 82, lab.y + 10, 25, true) });
        for (const p of lab.pets) {
          const bob = Math.abs(p.vx) > 2 ? Math.abs(Math.sin(p.phase * 9)) * 1.4 : 0;
          list.push({ y: lab.y + 46 + p.y, s: designSprite(p.d, p.size), x: x + p.x, dy: bob, scale: 1, face: p.face });
        }
      }
    }
    for (const c of this.critters) {
      if (c.gone || c.lift > 0) continue;
      const x = nearX(cam, c.x);
      if (x < b.x0 || x > b.x1 || c.y < b.y0 || c.y > b.y1) continue;
      const moving = Math.hypot(c.vx, c.vy) > 1;
      const bob = moving ? Math.abs(Math.sin(c.phase * 9)) * 1.6 : 0;
      list.push({ y: c.y, s: designSprite(c.d, c.size), x, dy: bob, scale: 1, face: c.face, c });
    }
    list.sort((a, b2) => a.y - b2.y);
    for (const it of list) {
      if (it.fn) { it.fn(); continue; }
      if (it.c) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.beginPath(); g.ellipse(it.x, it.y, it.c.size * 0.42, it.c.size * 0.14, 0, 0, TAU); g.fill();
      }
      if (it.dark) { g.save(); g.filter = 'brightness(0.32) saturate(0.3)'; }
      drawSprite(g, it.s!, it.x, it.y - it.dy, it.scale, it.face);
      if (it.dark) g.restore();
    }
  }

  /** A defence turret on a city's rim: a squat tower in the city's colour with a swivelling barrel. */
  private drawTurret(g: CanvasRenderingContext2D, x: number, y: number, t: Turret, col: string) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(x, y + 1, 15, 5, 0, 0, TAU); g.fill();
    if (t.hp <= 0) {
      g.fillStyle = '#3a3836';
      g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x - 6, y - 7); g.lineTo(x + 1, y - 4); g.lineTo(x + 7, y - 9); g.lineTo(x + 12, y); g.closePath(); g.fill();
      return;
    }
    g.fillStyle = '#5b6170';
    g.strokeStyle = '#2b2f38';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x - 11, y); g.lineTo(x - 8, y - 14); g.lineTo(x + 8, y - 14); g.lineTo(x + 11, y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = col;
    g.fillRect(x - 9, y - 10, 18, 3);
    const bx = x + Math.cos(t.ang) * 15, by = y - 18 + Math.sin(t.ang) * 8;
    g.strokeStyle = '#2b2f38';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y - 18); g.lineTo(bx, by); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#8a93a6';
    g.beginPath(); g.arc(x, y - 16, 7.5, Math.PI, 0); g.fill(); g.stroke();
    if (t.flash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,150,80,${t.flash})`;
      g.beginPath(); g.arc(bx, by, 6 * t.flash + 2, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    if (t.hp < t.max) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 12, y + 5, 24, 4);
      g.fillStyle = '#ff6a5a'; g.fillRect(x - 12, y + 5, 24 * (t.hp / t.max), 4);
    }
  }

  /** A fallen city burns for a while. */
  private drawFires(g: CanvasRenderingContext2D, x: number, y: number, left: number) {
    const k = Math.min(1, left / 10);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const fx = x + Math.cos(i * 1.7) * 60, fy = y + Math.sin(i * 2.3) * 30 - 10;
      const r = (10 + 5 * Math.sin(this.t * 9 + i * 2)) * k;
      g.fillStyle = `rgba(255,${120 + i * 15},40,${0.55 * k})`;
      g.beginPath(); g.arc(fx, fy, r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgba(40,40,40,${0.25 * k})`;
    for (let i = 0; i < 4; i++) {
      const rise = ((this.t * 14 + i * 25) % 100);
      g.beginPath(); g.arc(x + Math.cos(i * 2.1) * 50 + rise * 0.2, y - 20 - rise, 12 + rise * 0.15, 0, TAU); g.fill();
    }
  }

  /** A glass dome of the Xeno-Lab: the big one has the lab inside, the small ones are greenhouses. */
  private drawDome(g: CanvasRenderingContext2D, x: number, y: number, r: number, green: boolean) {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(x, y + 2, r * 1.05, r * 0.32, 0, 0, TAU); g.fill();
    g.fillStyle = '#9aa6b8';
    g.beginPath(); g.ellipse(x, y, r, r * 0.3, 0, 0, TAU); g.fill();
    // What is inside, seen through the glass.
    if (green) {
      g.fillStyle = '#4cbf5a';
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x - r * 0.5 + i * r * 0.33, y - r * 0.25 - (i % 2) * r * 0.15, r * 0.22, 0, TAU); g.fill(); }
    } else {
      g.fillStyle = '#e8eef5';
      g.fillRect(x - r * 0.45, y - r * 0.55, r * 0.9, r * 0.55);
      g.fillStyle = '#7dff6a';
      const pul = 0.6 + 0.4 * Math.sin(this.t * 3);
      g.globalAlpha = pul;
      g.beginPath(); g.arc(x, y - r * 0.75, r * 0.16, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.8, r * 0.1, x, y - r * 0.4, r);
    gr.addColorStop(0, green ? 'rgba(220,255,220,0.65)' : 'rgba(230,250,255,0.7)');
    gr.addColorStop(1, green ? 'rgba(90,190,120,0.3)' : 'rgba(110,190,230,0.3)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, r, r, 0, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(x, y, r, r, 0, Math.PI, 0); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(x, y, r * 0.5, r, 0, Math.PI, 0); g.moveTo(x, y - r); g.lineTo(x, y); g.stroke();
  }

  /** Turret bolts in flight, your laser on the city under siege, and sparks. */
  private drawWar(g: CanvasRenderingContext2D) {
    const cam = this.cam, sh = this.ship;
    g.globalCompositeOperation = 'lighter';
    for (const b of this.bolts) {
      const p = b.t / b.dur;
      const gx = nearX(cam, wrapX(b.x + wdx(b.x, b.tx) * p)), gy = b.y + (b.ty - b.y) * p;
      const yy = gy - (18 + (LIFT - 18) * p);
      g.fillStyle = 'rgba(255,120,60,0.35)';
      g.beginPath(); g.arc(gx, yy, 9, 0, TAU); g.fill();
      g.fillStyle = '#ffd0a0';
      g.beginPath(); g.arc(gx, yy, 3.5, 0, TAU); g.fill();
    }
    const sc = this.siege;
    if (sc && wdist(sc.x, sc.y, sh.x, sh.y) < SIEGE_R) {
      const t = sc.turrets.filter((x) => x.hp > 0).sort((a, b) => wdist(sc.x + a.dx, sc.y + a.dy, sh.x, sh.y) - wdist(sc.x + b.dx, sc.y + b.dy, sh.x, sh.y))[0];
      const tx = nearX(cam, t ? sc.x + t.dx : sc.x), ty = t ? sc.y + t.dy - 16 : sc.y - 30;
      const sx = nearX(cam, sh.x), sy = sh.y - LIFT + 8;
      const flick = 0.7 + 0.3 * Math.sin(this.t * 40);
      g.strokeStyle = `rgba(120,240,255,${0.35 * flick})`;
      g.lineWidth = 9;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty); g.stroke();
      g.strokeStyle = `rgba(230,255,255,${0.9 * flick})`;
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty); g.stroke();
    }
    for (const p of this.sparks) {
      g.globalAlpha = Math.min(1, p.life * 2);
      g.fillStyle = p.color;
      g.beginPath(); g.arc(nearX(cam, p.x), p.y, p.size, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawPing(g: CanvasRenderingContext2D) {
    if (this.ping < 0) return;
    const p = this.ping / 1.4;
    const x = nearX(this.cam, this.ship.x);
    g.strokeStyle = `rgba(120,240,220,${(1 - p) * 0.7})`;
    g.lineWidth = 4 / this.cam.zoom;
    g.beginPath(); g.ellipse(x, this.ship.y, 60 + p * SCAN_R, (60 + p * SCAN_R) * 0.7, 0, 0, TAU); g.stroke();
  }

  private drawShipAndBeam(g: CanvasRenderingContext2D) {
    const sh = this.ship;
    const x = nearX(this.cam, sh.x);
    const lift = LIFT + Math.sin(this.t * 2.2) * 2.5;
    // Shadow on the ground.
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(x, sh.y, 26, 9, 0, 0, TAU); g.fill();
    const tg = this.beam ? null : this.ctxTarget();
    if (tg) {
      g.setLineDash([6, 5]);
      g.strokeStyle = 'rgba(140,240,255,0.6)';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, sh.y, REACH, REACH * 0.38, 0, 0, TAU); g.stroke();
      g.setLineDash([]);
    }
    if (this.beam) {
      const flick = 0.75 + Math.sin(this.t * 30) * 0.12;
      const gy = sh.y + 4, ty = sh.y - lift + 8;
      const gr = g.createLinearGradient(0, ty, 0, gy);
      gr.addColorStop(0, `rgba(170,250,255,${0.65 * flick})`);
      gr.addColorStop(1, `rgba(120,230,255,${0.18 * flick})`);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - 7, ty); g.lineTo(x + 7, ty); g.lineTo(x + 32, gy); g.lineTo(x - 32, gy); g.closePath(); g.fill();
      g.strokeStyle = `rgba(190,250,255,${0.8 * flick})`;
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, gy, 32, 11, 0, 0, TAU); g.stroke();
      // Progress ring
      const p = this.beam.c ? this.beam.c.lift : this.beam.p;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(x, gy, 40, 15, 0, -Math.PI / 2, -Math.PI / 2 + TAU * p); g.stroke();
      // The catch rises up the beam, spinning slowly and shrinking into the hold.
      const c = this.beam.c;
      if (c) {
        const cx = nearX(this.cam, c.x);
        g.fillStyle = `rgba(0,0,0,${0.22 * (1 - c.lift)})`;
        g.beginPath(); g.ellipse(cx, c.y, c.size * 0.42, c.size * 0.14, 0, 0, TAU); g.fill();
        const face = Math.sin(this.t * 7) > 0 ? 1 : -1;
        drawSprite(g, designSprite(c.d, c.size), cx, c.y - c.lift * (lift - 10), 1 - c.lift * 0.35, c.lift > 0.15 ? face : c.face);
      }
    }
    const d = this.st.shipDesign;
    const speed = Math.hypot(sh.vx, sh.vy);
    drawShip(g, d, x, sh.y - lift, sh.ang, 56 / shipLength(d), this.t, { thrust: clamp(speed / 240, 0.15, 1) });
  }

  private drawClouds(g: CanvasRenderingContext2D) {
    if (!this.clouds.length || this.cam.zoom > 1.2) return;
    const b = this.cam.bounds(300);
    g.globalAlpha = 0.22;
    for (const c of this.clouds) {
      const x = nearX(this.cam, wrapX(c.x + this.t * 8));
      if (x < b.x0 || x > b.x1 || c.y < b.y0 || c.y > b.y1) continue;
      const wdt = 260 * c.s, hgt = 140 * c.s;
      g.drawImage(cloudSprite(c.k), x - wdt / 2, c.y - hgt / 2, wdt, hgt);
    }
    g.globalAlpha = 1;
  }

  /** City names and species names near the ship (screen space). */
  private drawLabels(g: CanvasRenderingContext2D) {
    const cam = this.cam;
    g.font = '600 12px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const label = (text: string, x: number, y: number, col: string, tag?: string) => {
      const tw = g.measureText(text).width + (tag ? 34 : 0);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath(); g.roundRect(x - tw / 2 - 6, y - 9, tw + 12, 18, 7); g.fill();
      g.fillStyle = col;
      g.fillText(text, x - (tag ? 17 : 0), y + 0.5);
      if (tag) {
        const tx = x + g.measureText(text).width / 2 - 13;
        g.fillStyle = '#ffd166';
        g.beginPath(); g.roundRect(tx, y - 6.5, 30, 13, 4); g.fill();
        g.fillStyle = '#04101e';
        g.font = '800 9px Fredoka, system-ui, sans-serif';
        g.fillText(tag, tx + 15, y + 0.5);
        g.font = '600 12px Fredoka, system-ui, sans-serif';
      }
    };
    if (cam.zoom > 0.45) {
      const hostile = this.hostile;
      for (const c of this.cities) {
        const p = cam.worldToScreen(nearX(cam, c.x), c.y - 92);
        if (p.x < -80 || p.x > cam.w + 80 || p.y < -20 || p.y > cam.h + 20) continue;
        label(c.dead ? `Ruins of ${c.name}` : c.name, p.x, p.y, c.dead ? '#9aa4b2' : c.color);
        if (hostile && !c.dead && (c.hp < c.max || this.siege === c)) {
          g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(p.x - 30, p.y + 12, 60, 5);
          g.fillStyle = '#ff6a5a'; g.fillRect(p.x - 30, p.y + 12, 60 * (c.hp / c.max), 5);
        }
      }
      if (this.lab) {
        const p = cam.worldToScreen(nearX(cam, this.lab.x), this.lab.y - 92);
        if (p.x > -80 && p.x < cam.w + 80 && p.y > -20 && p.y < cam.h + 20) label('🧬 Xeno-Lab', p.x, p.y, '#7dff6a');
      }
    }
    const sh = this.ship;
    for (const s of this.sites) {
      if (!s.seen || wdist(s.x, s.y, sh.x, sh.y) > 320) continue;
      let x = s.x, y = s.y, n = 0;
      if (s.kind === 'herd') {
        x = 0; y = 0;
        for (const c of this.critters) if (c.site === s && !c.gone && c.lift === 0) { x += wdx(s.x, c.x); y += c.y; n++; }
        if (!n) continue;
        x = s.x + x / n; y /= n;
      } else if (s.harvested) continue;
      const p = cam.worldToScreen(nearX(cam, x), y - (s.kind === 'herd' ? 40 : 34));
      label(s.sp.name, p.x, p.y, s.sp.rare ? '#ffd166' : '#ffffff', inXenopedia(this.w, s.sp) ? undefined : 'NEW');
    }
    const rl = this.relic;
    if (rl && rl.seen && !rl.taken && wdist(rl.x, rl.y, sh.x, sh.y) < 320) {
      const p = cam.worldToScreen(nearX(cam, rl.x), rl.y - 62);
      label('Ancient relic', p.x, p.y, '#c9bcff');
    }
  }

  /** After a scan: arrows at the screen edge toward the nearest life (new species first). */
  private drawArrows(g: CanvasRenderingContext2D, w: number, hh: number) {
    if (this.reveal <= 0) return;
    const cam = this.cam, sh = this.ship;
    const alive = (s: LifeSite) => (s.kind === 'flora' ? !s.harvested : this.critters.some((c) => c.site === s && !c.gone));
    const cand: { s: LifeSite | Relic; d: number; fresh: boolean }[] = this.sites.filter((s) => s.seen && alive(s))
      .map((s) => ({ s, d: wdist(s.x, s.y, sh.x, sh.y), fresh: !inXenopedia(this.w, s.sp) }))
      .sort((a, b) => (a.fresh === b.fresh ? a.d - b.d : a.fresh ? -1 : 1)).slice(0, 3);
    const rl = this.relic;
    if (rl && rl.seen && !rl.taken) cand.unshift({ s: rl, d: wdist(rl.x, rl.y, sh.x, sh.y), fresh: true });
    g.globalAlpha = Math.min(1, this.reveal);
    for (const { s, d, fresh } of cand) {
      const p = cam.worldToScreen(nearX(cam, s.x), s.y);
      const m = 34;
      if (p.x > m && p.x < w - m && p.y > m + 90 && p.y < hh - m - 90) continue;
      const cx = w / 2, cy = hh / 2;
      const a = Math.atan2(p.y - cy, p.x - cx);
      const k = Math.min((w / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (hh / 2 - m - 90) / Math.abs(Math.sin(a) || 1e-6));
      const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
      g.save();
      g.translate(x, y);
      g.fillStyle = 'rgba(4,12,24,0.8)';
      g.beginPath(); g.arc(0, 0, 17, 0, TAU); g.fill();
      g.strokeStyle = fresh ? '#ffd166' : '#3ee6c4';
      g.lineWidth = 2;
      g.stroke();
      g.rotate(a);
      g.fillStyle = fresh ? '#ffd166' : '#3ee6c4';
      g.beginPath(); g.moveTo(25, 0); g.lineTo(17, -6); g.lineTo(17, 6); g.closePath(); g.fill();
      g.rotate(-a);
      g.font = '15px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('relic' in s ? '🗿' : s.kind === 'herd' ? (s.sp.rare ? '✨' : '🐾') : '🌿', 0, 1);
      g.font = '600 10px Fredoka, system-ui, sans-serif';
      g.fillStyle = '#e6eef8';
      g.fillText(`${Math.round(d / 10) * 10}`, 0, 26);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  private drawJoystick(g: CanvasRenderingContext2D) {
    if (!this.joy.active) return;
    const j = this.joy;
    const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy);
    const k = d > 56 ? 56 / d : 1;
    g.save();
    g.globalAlpha = 0.5;
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.strokeStyle = 'rgba(160,230,255,0.6)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(j.ox, j.oy, 56, 0, TAU); g.fill(); g.stroke();
    g.globalAlpha = 0.85;
    g.fillStyle = 'rgba(220,245,255,0.9)';
    g.beginPath(); g.arc(j.ox + dx * k, j.oy + dy * k, 22, 0, TAU); g.fill();
    g.restore();
  }

  /** The DOM minimap: the planet, cities, life signs and the ship. */
  private drawMinimap() {
    const T = this.T, c = this.elMini;
    if (!T) return;
    const cw = c.clientWidth || 132, ch = c.clientHeight || 84;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(T.mini, 0, 0, cw, ch);
    const sx = cw / W, sy = ch / H;
    for (const ct of this.cities) { g.fillStyle = ct.dead ? '#6b7280' : ct.color; g.fillRect(ct.x * sx - 2.5, ct.y * sy - 2.5, 5, 5); }
    if (this.lab) { g.fillStyle = '#7dff6a'; g.beginPath(); g.arc(this.lab.x * sx, this.lab.y * sy, 3.2, 0, TAU); g.fill(); }
    for (const s of this.sites) {
      if (!s.seen) continue;
      const empty = s.kind === 'flora' ? s.harvested : !this.critters.some((q) => q.site === s && !q.gone);
      g.fillStyle = empty ? 'rgba(160,160,160,0.7)' : !inXenopedia(this.w, s.sp) ? '#ffd166' : s.kind === 'herd' ? '#ff9a7a' : '#7bd389';
      g.beginPath(); g.arc(s.x * sx, s.y * sy, s.sp.rare ? 3.4 : 2.4, 0, TAU); g.fill();
    }
    const rl = this.relic;
    if (rl && rl.seen && !rl.taken) {
      g.fillStyle = '#b8a6ff';
      g.strokeStyle = '#04101e';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(rl.x * sx, rl.y * sy - 4); g.lineTo(rl.x * sx + 3.4, rl.y * sy); g.lineTo(rl.x * sx, rl.y * sy + 4); g.lineTo(rl.x * sx - 3.4, rl.y * sy); g.closePath(); g.fill(); g.stroke();
    }
    const b = this.cam.bounds(0);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1;
    const rx = wrapX(b.x0) * sx;
    g.strokeRect(rx, clamp(b.y0, 0, H) * sy, (b.x1 - b.x0) * sx, (Math.min(H, b.y1) - Math.max(0, b.y0)) * sy);
    if (rx + (b.x1 - b.x0) * sx > cw) g.strokeRect(rx - cw, clamp(b.y0, 0, H) * sy, (b.x1 - b.x0) * sx, (Math.min(H, b.y1) - Math.max(0, b.y0)) * sy);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#04101e';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(this.ship.x * sx, this.ship.y * sy, 3.4, 0, TAU); g.fill(); g.stroke();
  }

  // ------------------------------------------------------------------ input
  onTap(x: number, y: number) {
    if (!this.T) return;
    const p = this.cam.screenToWorld(x, y);
    const z = this.cam.zoom;
    // A creature (aim at its body, not its feet) or a flora patch?
    let best: Target | null = null, bd = 30 / z;
    for (const c of this.critters) {
      if (c.gone || c.lift > 0) continue;
      const d = Math.hypot(wdx(p.x, c.x), c.y - c.size * 0.4 - p.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) for (const s of this.sites) if (s.kind === 'flora' && !s.harvested && Math.hypot(wdx(p.x, s.x), s.y - 8 - p.y) < 40) { best = s; break; }
    const rl = this.relic;
    if (!best && rl && !rl.taken && Math.hypot(wdx(p.x, rl.x), rl.y - 22 - p.y) < 36) best = rl;
    if (best) { this.chase = best; this.moveTarget = null; audio.sfx('tap'); return; }
    // An enemy city: lay siege, holding off within laser range. The Xeno-Lab: fly over it.
    if (this.hostile) {
      for (const c of this.cities) {
        if (c.dead || Math.hypot(wdx(p.x, c.x), c.y - p.y) > 120) continue;
        this.siege = c;
        const dx = wdx(c.x, this.ship.x), dy = this.ship.y - c.y, d = Math.hypot(dx, dy) || 1;
        this.moveTarget = d > 230 ? { x: wrapX(c.x + (dx / d) * 220), y: clamp(c.y + (dy / d) * 220, 90, H - 90) } : null;
        this.chase = null;
        audio.sfx('alarm', { vol: 0.5 });
        return;
      }
    }
    const lab = this.lab;
    if (lab && Math.hypot(wdx(p.x, lab.x), lab.y - p.y) < 120) { this.moveTarget = { x: lab.x, y: lab.y + 40 }; this.chase = null; audio.sfx('tap'); return; }
    this.moveTarget = { x: wrapX(p.x), y: clamp(p.y, 90, H - 90) };
    this.chase = null;
  }
  onKey(k: string, down: boolean) { if (down && (k === ' ' || k === 'e')) this.act(); }
  onDragStart(p: PointerInfo) {
    this.joy.active = true;
    this.joy.ox = p.sx; this.joy.oy = p.sy;
    this.joy.x = p.x; this.joy.y = p.y;
  }
  onDrag(p: PointerInfo) {
    this.joy.x = p.x; this.joy.y = p.y;
    const dx = p.x - this.joy.ox, dy = p.y - this.joy.oy, d = Math.hypot(dx, dy);
    if (d > 90) { const pull = (d - 90) / d; this.joy.ox += dx * pull; this.joy.oy += dy * pull; }
  }
  onDragEnd() { this.joy.active = false; }
  onPinch(f: number, cx: number, cy: number) { this.joy.active = false; this.cam.zoomAt(f, cx, cy); }
  onWheel(dy: number, x: number, y: number) { this.cam.zoomAt(Math.exp(-dy * 0.0015), x, y); }
}
