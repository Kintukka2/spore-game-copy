// Planet landing: fly your starship low over a world (the Civilization-stage map, coloured to match the
// planet), find its herds and flora, and beam specimens aboard. Cities sit where their owners founded them;
// your homeworld is the very map you united in the Civilization stage.
import type { Game, Scene } from '../../../game/game';
import type { PointerInfo } from '../../../engine/input';
import { Camera } from '../../../engine/camera';
import { button, h } from '../../../engine/ui';
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
import { drawPlant, money } from '../ui/common';
import { abduct, isHomeworld } from '../economy';
import { tutorialEvent } from '../missions';
import { catalogue, inXenopedia } from '../xenolab';
import type { SpaceStage } from '../stage';
import type { Specimen } from '../types';
import { spawnLife, stepCritter, type Critter, type LifeSite } from './life';
import { surfaceLook } from './look';

/** Ship hover height above its ground point (world units). */
const LIFT = 46;
/** Reach of the tractor beam from the ship's ground point. */
const REACH = 78;
const SEED_CAP = 60;

interface SurfCity { x: number; y: number; name: string; color: string; large: boolean; slots: number; blds: { d: Design; dx: number; dy: number; size: number }[] }
interface Built { key: string; T: Terrain; sites: { x: number; y: number; name: string; large: boolean; slots: number }[] }
type Beam = { c: Critter; site?: undefined; p: number } | { c?: undefined; site: LifeSite; p: number };

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
  private chase: Critter | LifeSite | null = null;
  private beam: Beam | null = null;
  private sites: LifeSite[] = [];
  private critters: Critter[] = [];
  private cities: SurfCity[] = [];
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

  constructor(private st: SpaceStage, readonly star: number, readonly idx: number) {}

  private get w() { return this.st.w; }
  private get planet() { return this.w.planet(this.star, this.idx); }

  // ------------------------------------------------------------------ lifecycle
  enter(game: Game) {
    this.game = game;
    this.cam.minZoom = 0.32;
    this.cam.maxZoom = 1.8;
    this.buildHud();
  }
  exit() { this.left = true; }

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
    const nCities = owner ? (home ? built.sites.length : Math.min(built.sites.length, ps.cities)) : 0;
    if (owner && nCities > 0) {
      const color = owner === 'player' ? PLAYER_COLOR : w.emap.get(owner)?.color ?? '#ffffff';
      const art = this.cityArt(owner, color);
      const r = new RNG(seed ^ 0xc17);
      for (const s of built.sites.slice(0, nCities)) {
        const blds: SurfCity['blds'] = [{ d: art.hall, dx: 0, dy: 4, size: s.large ? 76 : 66 }];
        for (let i = 0; i < s.slots; i++) {
          if (r.chance(0.18)) continue;
          const p = slotPos(i, s.slots);
          const k = r.pick(['house', 'house', 'factory', 'fun'] as const);
          blds.push({ d: art[k], dx: p.x, dy: p.y, size: k === 'house' ? 24 : k === 'factory' ? 30 : 28 });
        }
        this.cities.push({ x: s.x, y: s.y, name: s.name, color, large: s.large, slots: s.slots, blds });
      }
    }
    // Life: whatever lives in the planet's ecosystem, plus its natives.
    const species: Specimen[] = [];
    const add = (sp: Specimen | null) => { if (sp && !species.some((x) => x.seed === sp.seed)) species.push(sp); };
    for (const sp of ps.eco) add(sp);
    if (pl.life) for (const sp of w.natives(pl).slice(0, Math.max(1, t) * 4)) add(sp);
    const life = spawnLife(T, species, pl.seed, this.cities, (sp) => w.specimenDesign(sp));
    this.sites = life.sites;
    this.critters = life.critters;
    // Start above the first city, or the clearing where one would stand.
    const c0 = this.cities[0] ?? built.sites[0];
    if (c0) { this.ship.x = c0.x; this.ship.y = c0.y + 70; }
    else { this.ship.x = T.homeX; this.ship.y = T.homeY; }
    this.cam.x = this.ship.x; this.cam.y = this.ship.y;
    this.cam.setViewport(game.w, game.h);
    this.cam.zoom = clamp(Math.min(game.w, game.h) / 470, 0.6, 1.25);
    if (ps.atm > 0.35) {
      const r = new RNG(seed ^ 0xc10d);
      for (let i = 0; i < 9; i++) this.clouds.push({ x: (i / 9) * W + r.range(0, 200), y: r.range(260, H - 260), s: r.range(1.2, 2.4), k: i % 4 });
    }
    this.T = T;
    this.refreshHud(true);
    // A free scan on arrival points the way to the nearest life.
    if (this.sites.length) setTimeout(() => this.scan(true), 700);
    else this.st.ui.toast(`No life signs on ${pl.name}. Fly around, or head back to orbit.`, '📡');
    game.hint('landing', 'Drag anywhere to fly. Fly over a creature and tap 🛸 Beam up, or just tap the creature.', '🛸');
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
    this.elLife = h('div', { class: 'sf-life' });
    this.elMini = h('canvas', { class: 'sf-mini', 'aria-label': 'Map' }) as HTMLCanvasElement;
    this.elMini.addEventListener('pointerdown', (e) => {
      const rc = this.elMini.getBoundingClientRect();
      const x = ((e.clientX - rc.left) / rc.width) * W, y = ((e.clientY - rc.top) / rc.height) * H;
      this.moveTarget = { x: wrapX(x), y: clamp(y, 80, H - 80) };
      this.chase = null;
      audio.sfx('tap');
    });
    this.elScan = button('📡', () => this.scan(false), { cls: 'icon sf-scan', title: 'Life scan' });
    this.elCtx = button('', () => this.act(), { cls: 'primary sf-ctx' });
    this.elCtx.style.display = 'none';
    const acts = h('div', { class: 'sf-acts' }, this.elScan, this.elCtx);
    L.append(top, this.elLife, this.elMini, acts);
  }

  private refreshHud(force = false) {
    const w = this.w;
    const ps = w.peekPS(this.star, this.idx);
    const live = new Set<number>();
    for (const c of this.critters) if (!c.gone) live.add(c.sp.seed);
    for (const s of this.sites) if (s.kind === 'flora') live.add(s.sp.seed);
    const species = [...new Map(this.sites.map((s) => [s.sp.seed, s.sp])).values()].filter((sp) => live.has(sp.seed));
    const fresh = species.filter((sp) => !inXenopedia(w, sp)).length;
    const key = `${w.cargoUsed}/${w.cargoCap}/${w.count('seeds')}/${species.length}/${fresh}`;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.elCargo.textContent = `📦 ${w.cargoUsed}/${w.cargoCap} · 🌱 ${w.count('seeds')}`;
    const t = tScoreOf(ps.atm, ps.temp);
    const owner = ps.owner === 'player' ? 'Your world' : ps.owner && ps.owner !== 'hollow' ? w.emap.get(ps.owner)?.name ?? '' : 'Unclaimed';
    this.elSub.textContent = `T${t} ${'★'.repeat(t)}${'☆'.repeat(3 - t)} · ${owner}`;
    this.elLife.innerHTML = '';
    this.elLife.append(species.length
      ? h('span', null, `🧬 ${species.length} species here`, fresh ? h('span', { class: 'xl-new' }, `${fresh} NEW`) : ' · all catalogued')
      : h('span', null, '🧬 No life signs'));
  }

  // ------------------------------------------------------------------ actions
  private scan(free: boolean) {
    if (!this.T || this.left) return;
    if (this.scanCd > 0 && !free) { audio.sfx('error'); return; }
    this.scanCd = 6;
    this.ping = 0;
    this.reveal = 10;
    let n = 0;
    for (const s of this.sites) if (wdist(s.x, s.y, this.ship.x, this.ship.y) < 1500) { if (!s.seen) n++; s.seen = true; }
    audio.sfx('zap', { pitch: 0.7 });
    if (!free && n) this.st.ui.toast(`Life scan: ${n} new life sign${n === 1 ? '' : 's'} marked on your map.`, '📡');
  }

  /** The beam target under the ship, if any. */
  private ctxTarget(): Critter | LifeSite | null {
    const sh = this.ship;
    let best: Critter | null = null, bd = REACH;
    for (const c of this.critters) {
      if (c.gone || c.lift > 0) continue;
      const d = wdist(c.x, c.y, sh.x, sh.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) return best;
    for (const s of this.sites) if (s.kind === 'flora' && !s.harvested && wdist(s.x, s.y, sh.x, sh.y) < REACH - 8) return s;
    return null;
  }

  private act() {
    if (this.beam) return;
    const tg = this.ctxTarget();
    if (tg) this.startBeam(tg);
  }

  private startBeam(tg: Critter | LifeSite) {
    const w = this.w;
    this.chase = null;
    if ('d' in tg) {
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
      if (this.star === w.gal.homeStar) tutorialEvent(w, 'abduct');
      if (!w.s.flags.labHint) { w.s.flags.labHint = true; setTimeout(() => this.st.ui.toast('Specimens can be exhibited, spliced into hybrids or released into ecosystems. See Ship → 🧬 Xeno-Lab.', '🧬'), 1800); }
    } else {
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
        const gone = 'd' in ch ? ch.gone || ch.lift > 0 : ch.harvested;
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
    const b = cam.bounds(-20);
    for (const s of this.sites) if (!s.seen && s.y > b.y0 && s.y < b.y1 && Math.abs(wdx(cam.x, s.x)) < (b.x1 - b.x0) / 2) s.seen = true;
    // Timers
    if (this.scanCd > 0) this.scanCd -= dt;
    if (this.ping >= 0) { this.ping += dt; if (this.ping > 1.4) this.ping = -1; }
    if (this.reveal > 0) this.reveal -= dt;
    this.elScan.classList.toggle('cool', this.scanCd > 0);
    // Contextual action
    const tg = this.beam ? null : this.ctxTarget();
    const ctxKey = this.beam ? 'beam' : tg ? ('d' in tg ? 'c' + tg.sp.seed : 'f' + tg.sp.seed) : '';
    if (ctxKey !== this.lastCtx) {
      this.lastCtx = ctxKey;
      const el = this.elCtx;
      el.innerHTML = '';
      el.style.display = ctxKey ? '' : 'none';
      el.disabled = !!this.beam;
      if (this.beam) el.append('🛸 Hold steady…');
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
    this.drawThings(g);
    this.drawPing(g);
    this.drawShipAndBeam(g);
    this.drawClouds(g);
    g.restore();
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

  /** Buildings and creatures, painted back to front. */
  private drawThings(g: CanvasRenderingContext2D) {
    const cam = this.cam, b = cam.bounds(90);
    const list: { y: number; s: Sprite; x: number; dy: number; scale: number; face: number; c?: Critter }[] = [];
    for (const c of this.cities) {
      const x = nearX(cam, c.x);
      if (x < b.x0 - 100 || x > b.x1 + 100 || c.y < b.y0 - 100 || c.y > b.y1 + 60) continue;
      for (const bl of c.blds) list.push({ y: c.y + bl.dy, s: designSprite(bl.d, bl.size), x: x + bl.dx, dy: 0, scale: 1, face: 1 });
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
      if (it.c) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.beginPath(); g.ellipse(it.x, it.y, it.c.size * 0.42, it.c.size * 0.14, 0, 0, TAU); g.fill();
      }
      drawSprite(g, it.s, it.x, it.y - it.dy, it.scale, it.face);
    }
  }

  private drawPing(g: CanvasRenderingContext2D) {
    if (this.ping < 0) return;
    const p = this.ping / 1.4;
    const x = nearX(this.cam, this.ship.x);
    g.strokeStyle = `rgba(120,240,220,${(1 - p) * 0.7})`;
    g.lineWidth = 4 / this.cam.zoom;
    g.beginPath(); g.ellipse(x, this.ship.y, 60 + p * 1100, (60 + p * 1100) * 0.7, 0, 0, TAU); g.stroke();
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
      for (const c of this.cities) {
        const p = cam.worldToScreen(nearX(cam, c.x), c.y - 92);
        if (p.x < -80 || p.x > cam.w + 80 || p.y < -20 || p.y > cam.h + 20) continue;
        label(c.name, p.x, p.y, c.color);
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
      label(s.sp.name, p.x, p.y, '#ffffff', inXenopedia(this.w, s.sp) ? undefined : 'NEW');
    }
  }

  /** After a scan: arrows at the screen edge toward the nearest life (new species first). */
  private drawArrows(g: CanvasRenderingContext2D, w: number, hh: number) {
    if (this.reveal <= 0) return;
    const cam = this.cam, sh = this.ship;
    const alive = (s: LifeSite) => (s.kind === 'flora' ? !s.harvested : this.critters.some((c) => c.site === s && !c.gone));
    const cand = this.sites.filter((s) => s.seen && alive(s))
      .map((s) => ({ s, d: wdist(s.x, s.y, sh.x, sh.y), fresh: !inXenopedia(this.w, s.sp) }))
      .sort((a, b) => (a.fresh === b.fresh ? a.d - b.d : a.fresh ? -1 : 1)).slice(0, 3);
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
      g.fillText(s.kind === 'herd' ? '🐾' : '🌿', 0, 1);
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
    for (const ct of this.cities) { g.fillStyle = ct.color; g.fillRect(ct.x * sx - 2.5, ct.y * sy - 2.5, 5, 5); }
    for (const s of this.sites) {
      if (!s.seen) continue;
      const empty = s.kind === 'flora' ? s.harvested : !this.critters.some((q) => q.site === s && !q.gone);
      g.fillStyle = empty ? 'rgba(160,160,160,0.7)' : !inXenopedia(this.w, s.sp) ? '#ffd166' : s.kind === 'herd' ? '#ff9a7a' : '#7bd389';
      g.beginPath(); g.arc(s.x * sx, s.y * sy, 2.4, 0, TAU); g.fill();
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
    let best: Critter | LifeSite | null = null, bd = 30 / z;
    for (const c of this.critters) {
      if (c.gone || c.lift > 0) continue;
      const d = Math.hypot(wdx(p.x, c.x), c.y - c.size * 0.4 - p.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) for (const s of this.sites) if (s.kind === 'flora' && !s.harvested && Math.hypot(wdx(p.x, s.x), s.y - 8 - p.y) < 40) { best = s; break; }
    if (best) { this.chase = best; this.moveTarget = null; audio.sfx('tap'); return; }
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
