// System view: the star, orbiting planets, your ship (drag-to-steer joystick or tap-to-move),
// hostiles and allies, beacons, and all combat rendering.
import { Camera } from '../../../engine/camera';
import { TAU, clamp, wrapAngle } from '../../../engine/math';
import type { PointerInfo } from '../../../engine/input';
import { audio } from '../../../engine/audio';
import { STAR_INFO, tScoreOf } from '../data';
import { blit, glow, starSprite } from '../art/sprites';
import { drawPlanet, sphereFor, styleFor, type PlanetLook } from '../art/planetArt';
import { drawShip } from '../art/shipArt';
import { Combat, type Craft } from '../combat';
import { strength } from '../empires';
import { EVENT_INFO } from '../events';
import { tutorialEvent } from '../missions';
import { echoShip, storyFightsAt } from '../story';
import type { GEvent, Planet } from '../types';
import type { Design } from '../../../design/types';
import { generateShip } from '../../../design/generate';
import { RNG } from '../../../engine/rng';
import type { SpaceStage } from '../stage';
import { drawExploreBadge } from './badge';
import { SPICE, SPICE_COLORS, TOOL_MAP } from '../data';
import { shade } from '../../../design/color';

/** Whether this browser applies `ctx.filter` (older Safari ignores it). */
const CANVAS_FILTER = typeof (document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D | null)?.filter === 'string';

interface Beacon { a: number; taken: boolean }
interface FloatText { x: number; y: number; text: string; color: string; life: number }
interface Traffic { design: Design; x: number; y: number; vx: number; vy: number; angle: number; to: number; engine: string; size: number }

/** A scan pulse: a beam from the ship, then rings and a sweep across the planet. */
interface ScanFx { idx: number; t: number; pay: number; paid: boolean }

type RockKind = 'ore' | 'ice' | 'magma' | 'crystal';
/** An asteroid in a protoplanetary disk's belt. */
interface Asteroid { kind: RockKind; orbit: number; a: number; speed: number; r: number; hp: number; maxHp: number; seed: number; flash: number }
const ROCK_LOOK: Record<RockKind, { fill: string; edge: string; glow?: string }> = {
  ore: { fill: '#6b5a4c', edge: '#c2a582' },
  ice: { fill: '#bfe3f5', edge: '#ffffff', glow: '#9fe3ff' },
  magma: { fill: '#3a2420', edge: '#ff7a3a', glow: '#ff6a2a' },
  crystal: { fill: '#7a4fd8', edge: '#e6dbff', glow: '#c39bff' },
};
/** Rocks in a full belt; mined ones re-form at one a minute. */
const BELT = 14;

let freighterDesign: Design | null = null;
/** The stranded ship of a distress call. */
function freighter(): Design {
  return (freighterDesign ??= generateShip(new RNG(9001), { base: '#5d6b7a', coat: '#d8dee6', detail: '#ffb347', pattern: 'stripes' }, 'Freighter'));
}

export class SystemView {
  cam = new Camera();
  star = 0;
  planets: Planet[] = [];
  combat: Combat;
  t = 0;
  ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, thrust: 0 };
  moveTarget: { x: number; y: number } | null = null;
  autoPlanet: number | null = null;
  parked: { idx: number; ox: number; oy: number } | null = null;
  private joy = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  private beacons: Beacon[] = [];
  /** A distress beacon drifting near a planet. */
  private rescue: { ev: number; planet: number; a: number } | null = null;
  private scans: ScanFx[] = [];
  private field: Asteroid[] = [];
  private mineT: Asteroid | null = null;
  private mineSfx = 0;
  private mining = false;
  private trailT = 0;
  private danger = false;
  private floats: FloatText[] = [];
  private traffic: Traffic[] = [];
  private looks = new Map<number, PlanetLook>();
  private radius = 1500;
  private hue = 220;
  nearPlanet: number | null = null;

  constructor(private st: SpaceStage) {
    this.combat = new Combat(st);
    this.cam.minZoom = 0.22;
    this.cam.maxZoom = 1.6;
    this.cam.zoom = 0.62;
  }

  // ------------------------------------------------------------------ setup
  enter(star: number, how: 'load' | 'warp' | 'gate' | 'respawn') {
    const w = this.st.w;
    this.star = star;
    this.planets = w.gal.planets(star);
    this.looks.clear();
    this.combat.reset();
    this.st.fx.clear();
    this.floats = [];
    this.moveTarget = null;
    this.autoPlanet = null;
    this.parked = null;
    this.nearPlanet = null;
    this.rescue = null;
    this.scans = [];
    this.mineT = null;
    const s = w.star(star);
    this.hue = (s.seed % 360);
    this.radius = Math.max(900, ...this.planets.map((p) => p.orbit + 500));
    if (how === 'load') {
      this.ship.x = w.s.shipX; this.ship.y = w.s.shipY;
    } else if (how === 'respawn') {
      const hp = this.planets[1] ?? this.planets[0];
      const pp = hp ? this.planetPos(hp.idx) : { x: 300, y: 0 };
      this.ship.x = pp.x + (hp?.size ?? 40) + 80; this.ship.y = pp.y;
    } else {
      // Arrive from the edge of the system, facing inward.
      const a = Math.random() * TAU;
      const d = Math.min(this.radius - 250, (this.planets[this.planets.length - 1]?.orbit ?? 600) + 180);
      this.ship.x = Math.cos(a) * d; this.ship.y = Math.sin(a) * d;
      this.ship.angle = a + Math.PI;
      this.ship.vx = Math.cos(a + Math.PI) * 300; this.ship.vy = Math.sin(a + Math.PI) * 300;
      this.cam.zoom = Math.min(this.cam.zoom, 0.5);
    }
    this.cam.x = this.ship.x; this.cam.y = this.ship.y;
    const p = this.combat.player;
    p.x = this.ship.x; p.y = this.ship.y;
    this.combat.player.design = this.st.shipDesign;
    // Tutorial beacons around the homeworld
    this.beacons = [];
    if (star === w.gal.homeStar && w.s.missions.some((m) => m.kind === 'tutorial' && m.step === 'helm')) {
      for (let i = 0; i < 3; i++) this.beacons.push({ a: (i * TAU) / 3 + 0.4, taken: false });
    }
    this.spawnForSystem(how);
    this.spawnTraffic();
    this.spawnBelt();
    this.danger = false;
    this.updateMusic();
  }

  /** Spawn hostiles, turrets and allies appropriate to this system. */
  spawnForSystem(how: string) {
    const w = this.st.w;
    const c = this.combat;
    const star = this.star;
    const owner = w.ownerOf(star);
    const e = owner && owner !== 'player' ? w.emap.get(owner) : null;
    // Allies escort you.
    let slot = 0;
    for (const a of w.empires) {
      if (!a.allied || a.dead || slot >= 3) continue;
      c.spawnAlly(a.ship, a.id, 260 * strength(w, a), slot++);
    }
    // A story fight here takes the place of the usual defenders.
    const story = this.spawnStory(slot);
    slot += story.length;
    // Hostile owners defend their space.
    if (e && e.war && e.serenade <= 0 && !story.length) {
      const n = e.arch === 'hollow' ? 2 + Math.floor(Math.random() * 2) + (w.star(star).r < 200 ? 1 : 0) : 2 + Math.floor(Math.random() * 2);
      const a = Math.random() * TAU;
      c.spawnEmpire(e.id, n, this.ship.x + Math.cos(a) * 700, this.ship.y + Math.sin(a) * 700);
      this.spawnTurretsFor(e.id);
    }
    // Events here
    for (const ev of w.s.events) if (ev.star === star) this.setupEvent(ev);
    // Mission pirates
    for (const m of w.s.missions) {
      if (m.kind === 'pirates' && m.star === star) {
        const a = Math.random() * TAU;
        c.spawnPirates(3 + Math.floor(Math.random() * 2), this.ship.x + Math.cos(a) * 650, this.ship.y + Math.sin(a) * 650, { mission: m.id });
      }
    }
    // Random ambush in the wilds
    if ((how === 'warp' || how === 'gate') && !owner && !w.star(star).hollow && w.s.flags.tutDone) {
      const p = w.perks.has('pirate-bane') ? 0.03 : 0.07;
      if (Math.random() < p) {
        const a = Math.random() * TAU;
        c.spawnPirates(2 + Math.floor(Math.random() * 2), this.ship.x + Math.cos(a) * 700, this.ship.y + Math.sin(a) * 700);
        this.st.ui.toast('Pirates! It\'s an ambush!', '🏴‍☠️', 'bad');
      }
    }
  }

  /** Story fights in this system (story.ts) that have not started yet: their Hollow, and Echo flying with you. */
  spawnStory(slot = 0) {
    const w = this.st.w, c = this.combat;
    const story = storyFightsAt(w, this.star).filter((m) => !c.crafts.some((x) => x.alive && x.mission === m.id));
    for (const m of story) {
      const a = Math.random() * TAU;
      c.spawnStory(m, this.ship.x + Math.cos(a) * 650, this.ship.y + Math.sin(a) * 650);
      const ally = echoShip(w);
      if (m.story?.ally && ally) c.spawnAlly(ally, 'echo', 900, slot++);
    }
    if (story.length) { this.st.ui.toast(`${story[0].title}: the Hollow are here.`, '⭐', 'gold'); this.updateMusic(); }
    return story;
  }

  /** How many belt rocks are still missing here (mined ones re-form at one a minute). */
  private beltDebt(): number {
    const w = this.st.w;
    const [n, at] = String(w.s.flags[`belt:${this.star}`] ?? '0:0').split(':').map(Number);
    return Math.max(0, (n || 0) - (w.s.t - (at || 0)) / 60);
  }

  /** Protoplanetary disks: a belt of asteroids to mine. */
  private spawnBelt() {
    this.field = [];
    const w = this.st.w;
    if (w.star(this.star).type !== 'proto') return;
    const n = Math.max(3, BELT - Math.round(this.beltDebt()));
    for (let i = 0; i < n; i++) {
      const x = Math.random();
      const kind: RockKind = x < 0.58 ? 'ore' : x < 0.76 ? 'ice' : x < 0.91 ? 'magma' : 'crystal';
      const r = kind === 'crystal' ? 15 + Math.random() * 7 : kind === 'ore' ? 22 + Math.random() * 18 : 19 + Math.random() * 12;
      const hp = 60 + r * 3;
      this.field.push({ kind, orbit: 190 + Math.random() * 450, a: Math.random() * TAU, speed: 0.02 + Math.random() * 0.03, r, hp, maxHp: hp, seed: Math.random() * 1000, flash: 0 });
    }
    this.st.game.hint('proto', 'A protoplanetary disk: a newborn star whose planets have not formed yet. Tap an asteroid in its belt to mine it.', '💫');
  }

  private rockPos(a: Asteroid) {
    const ang = a.a + a.speed * this.t;
    return { x: Math.cos(ang) * a.orbit, y: Math.sin(ang) * a.orbit };
  }

  /** A mined rock breaks open. Ore sells; ice and magma hold terraform charges; crystals hold spice. */
  private crack(m: Asteroid) {
    const w = this.st.w;
    const p = this.rockPos(m);
    this.field = this.field.filter((x) => x !== m);
    this.mineT = null;
    const look = ROCK_LOOK[m.kind];
    this.st.fx.explosion(p.x, p.y, 0.5 + m.r / 40, look.edge);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, v = 60 + Math.random() * 140;
      this.st.fx.spawn(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, 0.9, 3 + Math.random() * 4, i % 3 ? look.fill : look.edge, 1, 1.5);
    }
    audio.sfx('explode', { vol: 0.5, pitch: 1.3 });
    w.counter('mined');
    w.s.flags[`belt:${this.star}`] = `${this.beltDebt() + 1}:${w.s.t}`;
    const charge = (id: string, label: string) => {
      if (w.count(id) < (TOOL_MAP[id].max ?? 99)) { w.give(id, 1); w.addMoney(500); this.floatText(p.x, p.y, `${TOOL_MAP[id].icon} +1 ${label}`, look.edge); }
      else { w.addMoney(2500); this.floatText(p.x, p.y, '+§2,500', '#ffd166'); }
    };
    if (m.kind === 'ore') {
      const n = Math.round(((900 + m.r * 60) * (0.8 + Math.random() * 0.4)) / 50) * 50;
      w.addMoney(n);
      this.floatText(p.x, p.y, `+§${n.toLocaleString('en-US')} ore`, '#ffd166');
      audio.sfx('coin', { vol: 0.5 });
    } else if (m.kind === 'ice') charge('icecomet', 'Ice Comet');
    else if (m.kind === 'magma') charge('meteor', 'Meteor Call');
    else {
      const c = SPICE_COLORS[Math.floor(Math.random() * SPICE_COLORS.length)];
      const n = Math.min(2, w.cargoCap - w.cargoUsed);
      if (n > 0) { w.s.spice[c] += n; this.floatText(p.x, p.y, `💎 +${n} ${SPICE[c].name}`, SPICE[c].hex); }
      else { w.addMoney(5000); this.floatText(p.x, p.y, '💎 +§5,000', '#ffd166'); this.st.ui.toast('Your hold is full, so you sold the spice crystal on the spot: +§5,000.', '💎'); }
      audio.sfx('levelup', { vol: 0.4 });
    }
    if (!this.field.length) this.st.ui.toast('The belt is mined out. Rocks re-form here over time, about one a minute.', '⛏️');
  }

  /** Play a scan on a planet; `delay` staggers a sweep. */
  scanFx(idx: number, pay: number, delay = 0) {
    this.scans.push({ idx, t: -delay, pay, paid: false });
  }

  /** Quick-scan the planet nearest the ship. */
  scanNearest() {
    let best = -1, bd = Infinity;
    for (const p of this.planets) {
      if (this.st.w.peekPS(this.star, p.idx).destroyed) continue;
      const pp = this.planetPos(p.idx), d = Math.hypot(pp.x - this.ship.x, pp.y - this.ship.y);
      if (d < bd) { bd = d; best = p.idx; }
    }
    if (best >= 0) this.st.quickScan(best);
  }

  /** Right-click or press-and-hold: scan the planet underneath, or sweep the whole system from the star. */
  onAltTap(x: number, y: number) {
    const p = this.cam.screenToWorld(x, y);
    const z = this.cam.zoom;
    for (const pl of this.planets) {
      const pp = this.planetPos(pl.idx);
      if (Math.hypot(pp.x - p.x, pp.y - p.y) < pl.size + 22 / z) {
        if (this.st.w.peekPS(this.star, pl.idx).destroyed) return;
        this.st.quickScan(pl.idx);
        return;
      }
    }
    if (Math.hypot(p.x, p.y) < this.starRadius() + 20 / z) this.st.sweepSystem();
  }

  /** Peaceful ships shuttling between the worlds of an owned system. */
  private spawnTraffic() {
    this.traffic = [];
    const w = this.st.w;
    const owner = w.ownerOf(this.star);
    if (!owner || owner === 'hollow' || this.planets.length < 2) return;
    const e = owner !== 'player' ? w.emap.get(owner) : null;
    if (e && e.war) return;
    const design = e ? e.ship : this.st.shipDesign;
    const n = Math.min(4, 1 + Math.floor(this.planets.length / 2));
    for (let i = 0; i < n; i++) {
      const from = this.planets[Math.floor(Math.random() * this.planets.length)];
      const pp = this.planetPos(from.idx);
      const a = Math.random() * TAU;
      this.traffic.push({ design, x: pp.x + Math.cos(a) * (from.size + 40), y: pp.y + Math.sin(a) * (from.size + 40), vx: 0, vy: 0, angle: a, to: Math.floor(Math.random() * this.planets.length), engine: e ? e.color : '#7fd8ff', size: 0.34 });
    }
  }

  private updateTraffic(dt: number) {
    for (const tr of this.traffic) {
      const pp = this.planetPos(tr.to);
      const dx = pp.x - tr.x, dy = pp.y - tr.y, d = Math.hypot(dx, dy);
      if (d < this.planetSize(tr.to) + 30) {
        tr.to = Math.floor(Math.random() * this.planets.length);
        continue;
      }
      const sp = 150;
      const k = 1 - Math.exp(-1.5 * dt);
      tr.vx += ((dx / d) * sp - tr.vx) * k;
      tr.vy += ((dy / d) * sp - tr.vy) * k;
      tr.x += tr.vx * dt;
      tr.y += tr.vy * dt;
      tr.angle += wrapAngle(Math.atan2(tr.vy, tr.vx) - tr.angle) * Math.min(1, dt * 3);
      if (Math.random() < dt * 14) {
        const back = tr.angle + Math.PI;
        this.st.fx.spawn(tr.x + Math.cos(back) * 12, tr.y + Math.sin(back) * 12, Math.cos(back) * 30, Math.sin(back) * 30, 0.4, 3, tr.engine, 0, 2);
      }
    }
  }

  spawnTurretsFor(empireId: string) {
    const w = this.st.w;
    for (const p of this.planets) {
      const ps = w.peekPS(this.star, p.idx);
      if (ps.owner !== empireId || ps.destroyed) continue;
      const n = Math.min(4, 1 + ps.cities);
      const def = ps.def ?? 300 * ps.cities;
      if (def <= 0) continue;
      this.combat.spawnTurrets(p.idx, n, def / n, empireId);
    }
  }

  /** Bring an event in this system to life: fights, meteor swarms, distress beacons. */
  setupEvent(ev: GEvent, arriving = true) {
    if (ev.kind === 'distress') {
      if (ev.started) this.startEventFight(ev.id);
      else if (!this.rescue) this.rescue = { ev: ev.id, planet: ev.planet, a: Math.random() * TAU };
    } else if (ev.kind === 'wreck') {
      if (!this.rescue) this.rescue = { ev: ev.id, planet: ev.planet, a: Math.random() * TAU };
    } else if (ev.kind === 'raid' || ev.kind === 'invasion' || ev.kind === 'hollow') this.startEventFight(ev.id);
    else if (ev.kind === 'meteor' && arriving) this.st.meteorArrived(ev);
  }

  private rescuePos() {
    const r = this.rescue!;
    const pp = this.planetPos(r.planet);
    const R = this.planetSize(r.planet) + 170, a = r.a + this.t * 0.06;
    return { x: pp.x + Math.cos(a) * R, y: pp.y + Math.sin(a) * R };
  }

  startEventFight(evId: number) {
    const w = this.st.w;
    const ev = w.s.events.find((e) => e.id === evId);
    if (!ev || ev.started && this.combat.crafts.some((c) => c.ev === ev.id && c.alive)) return;
    ev.started = true;
    const pp = this.planetPos(ev.planet);
    const a = Math.random() * TAU;
    const x = pp.x + Math.cos(a) * 260, y = pp.y + Math.sin(a) * 260;
    if (ev.kind === 'raid') this.combat.spawnPirates(3 + Math.floor(Math.random() * 2), x, y, { ev: ev.id, planet: ev.planet });
    else if (ev.kind === 'invasion' && ev.empire) this.combat.spawnEmpire(ev.empire, 3, x, y, { ev: ev.id, planet: ev.planet });
    else if (ev.kind === 'hollow') this.combat.spawnEmpire('hollow', 3, x, y, { ev: ev.id, planet: ev.planet });
    else if (ev.kind === 'distress') this.combat.spawnPirates(3, x, y, { ev: ev.id });
    this.updateMusic();
  }

  /** Called when relations change mid-visit (war declared, peace made). */
  refreshHostility() {
    const w = this.st.w;
    const owner = w.ownerOf(this.star);
    const e = owner && owner !== 'player' ? w.emap.get(owner) : null;
    if (e && (!e.war || e.serenade > 0)) this.combat.pacify(e.id);
    if (e && e.war) this.traffic = [];
    if (e && e.war && e.serenade <= 0 && !this.combat.crafts.some((c) => c.empire === e.id && c.alive)) {
      const a = Math.random() * TAU;
      this.combat.spawnEmpire(e.id, 2, this.ship.x + Math.cos(a) * 650, this.ship.y + Math.sin(a) * 650);
      this.spawnTurretsFor(e.id);
    }
    this.updateMusic();
  }

  planetPos(idx: number) {
    const p = this.planets[idx];
    return p ? this.st.w.planetPos(p) : { x: 0, y: 0 };
  }
  planetSize(idx: number) { return this.planets[idx]?.size ?? 30; }

  private look(p: Planet): PlanetLook {
    let l = this.looks.get(p.idx);
    const w = this.st.w;
    const ps = w.peekPS(this.star, p.idx);
    const t = p.kind === 'gas' ? 0 : tScoreOf(ps.atm, ps.temp);
    const hollow = ps.owner === 'hollow' || p.feature === 'hollow' && w.ownerOf(this.star) === 'hollow';
    const style = styleFor(p.kind, t, ps.atm, ps.temp, hollow, !!ps.destroyed);
    if (!l || l.t !== t || l.style !== style || Math.abs(l.atm - ps.atm) > 0.05 || Math.abs(l.temp - ps.temp) > 0.05) {
      l = { seed: p.seed, style, t, atm: ps.atm, temp: ps.temp, hue: p.hue };
      this.looks.set(p.idx, l);
    }
    return l;
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    this.t += dt;
    const w = this.st.w;
    const sh = this.ship;
    const maxSp = 330 * w.speedMult;
    // Steering input
    let dvx = 0, dvy = 0, steering = false;
    const k = this.st.game.input.keys;
    let kx = 0, ky = 0;
    if (k.has('a') || k.has('arrowleft')) kx -= 1;
    if (k.has('d') || k.has('arrowright')) kx += 1;
    if (k.has('w') || k.has('arrowup')) ky -= 1;
    if (k.has('s') || k.has('arrowdown')) ky += 1;
    if (this.joy.active) {
      const jx = (this.joy.x - this.joy.ox) / 56, jy = (this.joy.y - this.joy.oy) / 56;
      const l = Math.hypot(jx, jy);
      const m = Math.min(1, l);
      if (l > 0.08) { dvx = (jx / l) * m * maxSp; dvy = (jy / l) * m * maxSp; steering = true; }
    } else if (kx || ky) {
      const l = Math.hypot(kx, ky);
      dvx = (kx / l) * maxSp; dvy = (ky / l) * maxSp; steering = true;
    }
    if (steering) { this.moveTarget = null; this.autoPlanet = null; this.parked = null; }
    else if (this.autoPlanet !== null) {
      const pp = this.planetPos(this.autoPlanet);
      const R = this.planetSize(this.autoPlanet) + 70;
      const a = Math.atan2(sh.y - pp.y, sh.x - pp.x);
      const tx = pp.x + Math.cos(a) * R, ty = pp.y + Math.sin(a) * R;
      const dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy);
      if (d < 26) {
        this.parked = { idx: this.autoPlanet, ox: tx - pp.x, oy: ty - pp.y };
        const idx = this.autoPlanet;
        this.autoPlanet = null;
        this.st.openPlanet(this.star, idx);
      } else {
        const sp = Math.min(maxSp, d * 2.2 + 40);
        dvx = (dx / d) * sp; dvy = (dy / d) * sp;
      }
    } else if (this.moveTarget) {
      const dx = this.moveTarget.x - sh.x, dy = this.moveTarget.y - sh.y, d = Math.hypot(dx, dy);
      if (d < 14) this.moveTarget = null;
      else { const sp = Math.min(maxSp, d * 2.2 + 30); dvx = (dx / d) * sp; dvy = (dy / d) * sp; }
    }
    if (this.parked) {
      const pp = this.planetPos(this.parked.idx);
      const tx = pp.x + this.parked.ox, ty = pp.y + this.parked.oy;
      sh.vx = (tx - sh.x) / Math.max(dt, 0.001) * 0.2;
      sh.vy = (ty - sh.y) / Math.max(dt, 0.001) * 0.2;
      sh.x += (tx - sh.x) * Math.min(1, dt * 6);
      sh.y += (ty - sh.y) * Math.min(1, dt * 6);
    } else {
      const acc = 1 - Math.exp(-(steering || this.moveTarget || this.autoPlanet !== null ? 5 : 2.2) * dt);
      sh.vx += (dvx - sh.vx) * acc;
      sh.vy += (dvy - sh.vy) * acc;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
    }
    // Stay inside the system.
    const r = Math.hypot(sh.x, sh.y);
    if (r > this.radius) { sh.x *= this.radius / r; sh.y *= this.radius / r; sh.vx *= 0.5; sh.vy *= 0.5; }
    // Don't fly into the star.
    const sr = this.starRadius() + 30;
    if (r < sr) { const f = sr / (r || 1); sh.x *= f; sh.y *= f; }
    const sp = Math.hypot(sh.vx, sh.vy);
    sh.thrust = clamp(sp / maxSp, 0, 1);
    if (sp > 25 && !this.parked) sh.angle += wrapAngle(Math.atan2(sh.vy, sh.vx) - sh.angle) * Math.min(1, dt * 7);
    else if (this.parked) {
      const pp = this.planetPos(this.parked.idx);
      sh.angle += wrapAngle(Math.atan2(pp.y - sh.y, pp.x - sh.x) - sh.angle) * Math.min(1, dt * 3);
    }
    w.s.shipX = sh.x; w.s.shipY = sh.y;
    // Mirror into the combat player craft.
    const pc = this.combat.player;
    pc.x = sh.x; pc.y = sh.y; pc.vx = sh.vx; pc.vy = sh.vy; pc.angle = sh.angle; pc.thrust = sh.thrust;
    // Thruster trail
    this.trailT -= dt;
    if (sh.thrust > 0.15 && this.trailT <= 0) {
      this.trailT = 0.022;
      const back = sh.angle + Math.PI;
      const L = 26;
      this.st.fx.spawn(sh.x + Math.cos(back) * L, sh.y + Math.sin(back) * L, Math.cos(back) * 60 + (Math.random() - 0.5) * 30, Math.sin(back) * 60 + (Math.random() - 0.5) * 30, 0.5, 5 + sh.thrust * 5, '#7fd8ff', 0, 2, -6);
    }
    for (const c of this.combat.crafts) {
      if (!c.alive || c.kind === 'player' || c.kind === 'turret' || c.thrust < 0.3 || Math.random() > dt * 25) continue;
      const back = c.angle + Math.PI;
      this.st.fx.spawn(c.x + Math.cos(back) * 18, c.y + Math.sin(back) * 18, Math.cos(back) * 40, Math.sin(back) * 40, 0.35, 4, c.engine, 0, 2);
    }
    // Combat
    if (!this.st.paused) this.combat.update(dt);
    this.updateTraffic(dt);
    w.inCombat = this.combat.hasHostiles();
    this.updateMusic();
    // Beacons
    const home = this.planets[1];
    if (this.beacons.length && !this.st.w.s.missions.some((m) => m.kind === 'tutorial' && m.step === 'helm')) this.beacons = [];
    if (this.beacons.length && home) {
      const hp = this.planetPos(1);
      let left = 0;
      for (const b of this.beacons) {
        if (b.taken) continue;
        const bx = hp.x + Math.cos(b.a + this.t * 0.1) * 230, by = hp.y + Math.sin(b.a + this.t * 0.1) * 230;
        if (Math.hypot(bx - sh.x, by - sh.y) < 60) {
          b.taken = true;
          audio.sfx('pop');
          audio.sfx('levelup', { vol: 0.4 });
          this.st.fx.ring(bx, by, 10, 90, 0.6, '#ffd166', 4);
          for (let i = 0; i < 16; i++) { const a = Math.random() * TAU; this.st.fx.spawn(bx, by, Math.cos(a) * 160, Math.sin(a) * 160, 0.6, 3, '#ffd166', 1, 2); }
        } else left++;
      }
      if (left === 0) { this.beacons = []; tutorialEvent(w, 'helm'); }
    }
    // Distress beacon: fly to it to answer the call.
    if (this.rescue) {
      const ev = w.s.events.find((e) => e.id === this.rescue!.ev);
      const b = this.rescuePos();
      if (!ev) this.rescue = null;
      else if (Math.hypot(b.x - sh.x, b.y - sh.y) < 75) {
        this.rescue = null;
        audio.sfx('pop');
        this.st.fx.ring(b.x, b.y, 10, 110, 0.6, ev.kind === 'wreck' ? '#7fe3ff' : '#ffd166', 4);
        if (ev.kind === 'wreck') { this.st.salvageWreck(ev); return; }
        this.st.distress(ev, () => {
          if (!w.s.events.includes(ev)) return;
          ev.started = true;
          this.combat.spawnPirates(3, b.x, b.y, { ev: ev.id });
          this.st.ui.toast('It\'s a trap! Pirates de-cloak around the beacon!', '🏴‍☠️', 'bad');
          audio.sfx('alarm');
        });
      }
    }
    // Scan pulses
    for (const f of this.scans) {
      f.t += dt;
      if (f.pay && !f.paid && f.t > 0.4) {
        f.paid = true;
        const pp = this.planetPos(f.idx);
        this.floatText(pp.x, pp.y - this.planetSize(f.idx) - 18, `+§${f.pay.toLocaleString('en-US')}`, '#ffd166');
      }
    }
    this.scans = this.scans.filter((f) => f.t < 1.6);
    // Mining: the laser cuts the chosen rock while it is in reach and no fight is on.
    this.mining = false;
    const m = this.mineT;
    for (const a of this.field) a.flash = Math.max(0, a.flash - dt * 4);
    if (m && !this.field.includes(m)) this.mineT = null;
    else if (m && !this.combat.laserFiring) {
      const q = this.rockPos(m);
      if (Math.hypot(q.x - sh.x, q.y - sh.y) < 330 && w.s.energy > 0.5) {
        this.mining = true;
        m.hp -= this.combat.laserDps() * dt;
        m.flash = 1;
        w.s.energy = Math.max(0, w.s.energy - 0.8 * dt);
        if (Math.random() < dt * 30) this.st.fx.spawn(q.x + (Math.random() - 0.5) * m.r, q.y + (Math.random() - 0.5) * m.r, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, 0.35, 2.5, ROCK_LOOK[m.kind].edge, 1, 3);
        this.mineSfx -= dt;
        if (this.mineSfx <= 0) { audio.sfx('laser', { vol: 0.3, pitch: 0.7 + Math.random() * 0.2 }); this.mineSfx = 0.4; }
        if (m.hp <= 0) this.crack(m);
      }
    }
    // Nearest planet for the HUD button
    this.nearPlanet = null;
    let bd = Infinity;
    for (const p of this.planets) {
      const pp = this.planetPos(p.idx);
      const d = Math.hypot(pp.x - sh.x, pp.y - sh.y) - p.size;
      if (d < 180 && d < bd) { bd = d; this.nearPlanet = p.idx; }
    }
    // Floating texts
    for (const f of this.floats) { f.life -= dt; f.y -= 30 * dt; }
    this.floats = this.floats.filter((f) => f.life > 0);
    // Camera follows with a little look-ahead.
    const lx = sh.x + sh.vx * 0.25, ly = sh.y + sh.vy * 0.25;
    this.cam.x += (lx - this.cam.x) * Math.min(1, dt * 4);
    this.cam.y += (ly - this.cam.y) * Math.min(1, dt * 4);
  }

  private updateMusic() {
    const p = this.combat.player;
    const near = this.combat.crafts.some((c) => c.team === 1 && c.alive && Math.hypot(c.x - p.x, c.y - p.y) < 1300);
    if (near !== this.danger) {
      this.danger = near;
      if (!this.st.cinematic) audio.music(near ? 'danger' : this.st.music);
      if (near) this.st.game.hint('space-combat', 'Hostiles! Your weapons fire on their own. Tap an enemy to pick your target.', '🎯');
    }
  }

  floatText(x: number, y: number, text: string, color: string) {
    this.floats.push({ x, y, text, color, life: 1.4 });
  }

  starRadius(): number {
    const s = this.st.w.star(this.star);
    return s.type === 'blackhole' ? 60 : 70 * s.size;
  }

  // ------------------------------------------------------------------ render
  render(g: CanvasRenderingContext2D, W: number, H: number) {
    const cam = this.cam;
    cam.setViewport(W, H);
    const w = this.st.w;
    const s = w.star(this.star);
    const shake = this.st.fx.shake;
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    this.st.backdrop.draw(g, W, H, cam.x * cam.zoom, cam.y * cam.zoom, this.hue, s.seed % 97);
    g.save();
    g.translate(sx, sy);
    cam.apply(g);
    const z = cam.zoom, px = 1 / z;
    // Star light wash
    const info = STAR_INFO[s.type];
    if (s.type !== 'blackhole') {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5;
      blit(g, glow(info.glow, 64, 1.6), 0, 0, 900 * s.size);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    // Orbits
    g.lineWidth = 1.4 * px;
    for (const p of this.planets) {
      const ps = w.peekPS(this.star, p.idx);
      const temp = ps.temp;
      g.strokeStyle = p.kind === 'gas' ? 'rgba(180,190,220,0.14)' : temp > 0.68 ? 'rgba(255,110,90,0.22)' : temp < 0.3 ? 'rgba(110,170,255,0.22)' : 'rgba(110,230,150,0.25)';
      g.beginPath(); g.arc(0, 0, p.orbit, 0, TAU); g.stroke();
    }
    this.drawStar(g);
    // Planets
    const b = cam.bounds(120);
    for (const p of this.planets) {
      const pp = this.planetPos(p.idx);
      if (pp.x < b.x0 - p.size * 2 || pp.x > b.x1 + p.size * 2 || pp.y < b.y0 - p.size * 2 || pp.y > b.y1 + p.size * 2) continue;
      this.drawPlanetAt(g, p, pp.x, pp.y, z);
      this.drawDefences(g, p.idx, pp.x, pp.y);
    }
    // Beacons
    if (this.beacons.length) {
      const hp = this.planetPos(1);
      for (const bc of this.beacons) {
        if (bc.taken) continue;
        const bx = hp.x + Math.cos(bc.a + this.t * 0.1) * 230, by = hp.y + Math.sin(bc.a + this.t * 0.1) * 230;
        const pulse = 1 + Math.sin(this.t * 4 + bc.a) * 0.15;
        g.globalCompositeOperation = 'lighter';
        blit(g, glow('#ffd166', 32), bx, by, 46 * pulse);
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = '#ffe9a8';
        g.lineWidth = 3 * px;
        g.beginPath(); g.arc(bx, by, 28 * pulse, 0, TAU); g.stroke();
      }
    }
    if (this.rescue) this.drawRescue(g, z);
    this.drawBelt(g, z);
    this.drawScans(g, z);
    this.drawLabels(g, z);
    // Shots
    this.drawShots(g, z);
    // Peaceful traffic
    for (const tr of this.traffic) if (cam.isVisible(tr.x, tr.y, 40)) drawShip(g, tr.design, tr.x, tr.y, tr.angle, tr.size, this.t, { thrust: 0.6, engine: tr.engine });
    // Crafts
    const tgt = this.combat.playerTarget;
    for (const c of this.combat.crafts) {
      if (!c.alive || c.kind === 'player') continue;
      if (!cam.isVisible(c.x, c.y, 60)) continue;
      this.drawCraft(g, c, z);
      if (c.team === 1 && c.hp < c.maxHp) this.drawHpBar(g, c, z);
    }
    // Laser beam
    if (this.combat.laserFiring && tgt) {
      const p = this.combat.player;
      const flick = 0.7 + Math.random() * 0.3;
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      g.strokeStyle = `rgba(110,220,255,${0.35 * flick})`;
      g.lineWidth = 9 * px * Math.max(1, z);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(tgt.x, tgt.y); g.stroke();
      g.strokeStyle = `rgba(230,250,255,${0.95 * flick})`;
      g.lineWidth = 2.4 * px * Math.max(1, z);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(tgt.x, tgt.y); g.stroke();
      blit(g, glow('#9fe3ff', 24), tgt.x, tgt.y, 22);
      g.globalCompositeOperation = 'source-over';
    }
    // Player ship
    const sh = this.ship;
    if (w.s.hp > 0) {
      drawShip(g, this.st.shipDesign, sh.x, sh.y, sh.angle, 0.85, this.t, { thrust: sh.thrust, flash: this.combat.player.flash, shield: this.combat.shieldT > 0 ? 1 : 0, engine: '#7fd8ff' });
    }
    // Target reticle
    if (tgt && tgt.alive) this.drawReticle(g, tgt.x, tgt.y, tgt.radius + 12, '#ff6a6a', z);
    if (this.combat.planetTarget !== null) {
      const pp = this.planetPos(this.combat.planetTarget);
      this.drawReticle(g, pp.x, pp.y, this.planetSize(this.combat.planetTarget) + 22, '#ffd166', z);
    }
    if (this.moveTarget) {
      g.strokeStyle = 'rgba(62,230,196,0.7)';
      g.lineWidth = 2 * px;
      const rr = 14 + Math.sin(this.t * 6) * 3;
      g.beginPath(); g.arc(this.moveTarget.x, this.moveTarget.y, rr * px * 1.4, 0, TAU); g.stroke();
    }
    this.st.fx.draw(g, z);
    // Floating texts
    g.font = `700 ${Math.round(15 * px)}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center';
    for (const f of this.floats) {
      g.globalAlpha = Math.min(1, f.life);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
    g.restore();
    this.drawOffscreen(g, W, H);
    this.drawJoystick(g);
    this.st.fx.drawFlash(g, W, H);
  }

  private drawBelt(g: CanvasRenderingContext2D, z: number) {
    if (!this.field.length) return;
    const sh = this.ship;
    for (const a of this.field) {
      const p = this.rockPos(a);
      if (!this.cam.isVisible(p.x, p.y, a.r * 3)) continue;
      const look = ROCK_LOOK[a.kind];
      g.save();
      g.translate(p.x, p.y);
      if (look.glow) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a.kind === 'crystal' ? 0.6 + 0.4 * Math.sin(this.t * 3 + a.seed) : 0.55;
        blit(g, glow(look.glow, 32), 0, 0, a.r * 2.6);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      // Lit from a fixed side: spin the outline, not the shading.
      const rot = a.seed + this.t * 0.25 * (Math.floor(a.seed) % 2 ? 1 : -1);
      const r = a.r;
      const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.25);
      gr.addColorStop(0, shade(look.fill, 0.3));
      gr.addColorStop(1, shade(look.fill, -0.45));
      g.fillStyle = gr;
      g.strokeStyle = look.edge;
      g.lineWidth = 1.8 / z;
      g.beginPath();
      if (a.kind === 'crystal') {
        const pts = [[0, -1.6], [0.72, -0.6], [0.72, 0.9], [0, 1.4], [-0.72, 0.9], [-0.72, -0.6]];
        pts.forEach(([px, py], i) => {
          const x = (px * Math.cos(rot) - py * Math.sin(rot)) * r, y = (px * Math.sin(rot) + py * Math.cos(rot)) * r;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        });
      } else {
        const k = 12;
        for (let i = 0; i < k; i++) {
          const ang = (i / k) * TAU + rot;
          const rr = r * (0.82 + 0.12 * Math.sin(a.seed * 7.3 + i * 2.1) + 0.07 * Math.sin(a.seed * 3.1 + i * 4.7));
          if (i) g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else g.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
      }
      g.closePath(); g.fill(); g.stroke();
      g.rotate(rot);
      if (a.kind === 'magma') {
        g.strokeStyle = `rgba(255,150,60,${0.65 + 0.35 * Math.sin(this.t * 4 + a.seed)})`;
        g.lineWidth = 2 / z;
        g.beginPath(); g.moveTo(-r * 0.55, -r * 0.2); g.lineTo(-r * 0.05, r * 0.1); g.lineTo(r * 0.45, -r * 0.35); g.moveTo(-r * 0.05, r * 0.1); g.lineTo(r * 0.1, r * 0.6); g.stroke();
      } else if (a.kind === 'ore') {
        g.fillStyle = 'rgba(30,22,16,0.45)';
        g.beginPath(); g.arc(r * 0.3, r * 0.15, r * 0.2, 0, TAU); g.fill();
        g.beginPath(); g.arc(-r * 0.3, -r * 0.3, r * 0.13, 0, TAU); g.fill();
        g.fillStyle = '#ffd166';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(Math.cos(a.seed + i * 1.7) * r * 0.5, Math.sin(a.seed + i * 1.7) * r * 0.5, r * 0.08, 0, TAU); g.fill(); }
      } else if (a.kind === 'ice') {
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 1.6 / z;
        g.beginPath(); g.moveTo(-r * 0.45, -r * 0.25); g.lineTo(r * 0.15, -r * 0.5); g.moveTo(-r * 0.2, r * 0.25); g.lineTo(r * 0.35, r * 0.05); g.stroke();
      } else {
        g.strokeStyle = 'rgba(240,230,255,0.7)';
        g.lineWidth = 1.2 / z;
        g.beginPath(); g.moveTo(0, -r * 1.6); g.lineTo(0, r * 1.4); g.moveTo(-r * 0.72, -r * 0.6); g.lineTo(0, -r * 0.1); g.lineTo(r * 0.72, -r * 0.6); g.stroke();
        const tw = Math.max(0, Math.sin(this.t * 2.5 + a.seed));
        if (tw > 0.6) { g.fillStyle = `rgba(255,255,255,${(tw - 0.6) * 2.5})`; g.beginPath(); g.arc(r * 0.3, -r * 0.7, r * 0.18, 0, TAU); g.fill(); }
      }
      if (a.flash > 0) { g.globalAlpha = a.flash * 0.35; g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, a.r * 0.8, 0, TAU); g.fill(); g.globalAlpha = 1; }
      g.restore();
      if (a.hp < a.maxHp) {
        const wdt = 36 / z * Math.min(1, z * 1.4), hh = 4 / z;
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(p.x - wdt / 2, p.y - a.r - 12 / z, wdt, hh);
        g.fillStyle = look.edge;
        g.fillRect(p.x - wdt / 2, p.y - a.r - 12 / z, wdt * clamp(a.hp / a.maxHp, 0, 1), hh);
      }
    }
    const m = this.mineT;
    if (!m) return;
    const q = this.rockPos(m);
    this.drawReticle(g, q.x, q.y, m.r + 12, '#ffcf9e', z);
    if (this.mining) {
      const flick = 0.7 + Math.random() * 0.3;
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      g.strokeStyle = `rgba(255,190,110,${0.35 * flick})`;
      g.lineWidth = 9 / z;
      g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(q.x, q.y); g.stroke();
      g.strokeStyle = `rgba(255,245,220,${0.9 * flick})`;
      g.lineWidth = 2.4 / z;
      g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(q.x, q.y); g.stroke();
      blit(g, glow('#ffcf9e', 24), q.x, q.y, 24);
      g.globalCompositeOperation = 'source-over';
    }
  }

  private drawScans(g: CanvasRenderingContext2D, z: number) {
    const sh = this.ship;
    for (const f of this.scans) {
      if (f.t < 0) continue;
      const pp = this.planetPos(f.idx), R = this.planetSize(f.idx);
      g.globalCompositeOperation = 'lighter';
      // Beam from the ship
      if (f.t < 0.5) {
        const a = 1 - f.t / 0.5;
        g.strokeStyle = `rgba(120,240,255,${0.75 * a})`;
        g.lineWidth = 3 / z;
        g.setLineDash([10 / z, 8 / z]);
        g.lineDashOffset = -f.t * 300 / z;
        g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(pp.x, pp.y); g.stroke();
        g.setLineDash([]);
      }
      // Rings rolling outward
      for (let i = 0; i < 2; i++) {
        const k = (f.t - 0.25 - i * 0.25) / 1.1;
        if (k <= 0 || k >= 1) continue;
        g.strokeStyle = `rgba(120,240,255,${(1 - k) * 0.8})`;
        g.lineWidth = (3 - k * 2) / z;
        g.beginPath(); g.arc(pp.x, pp.y, R * (1.05 + k * 1.4), 0, TAU); g.stroke();
      }
      // A sweep line across the disc
      const q = (f.t - 0.15) / 0.9;
      if (q > 0 && q < 1) {
        g.save();
        g.beginPath(); g.arc(pp.x, pp.y, R, 0, TAU); g.clip();
        const y = pp.y - R + q * R * 2;
        g.fillStyle = 'rgba(120,240,255,0.16)';
        g.fillRect(pp.x - R, y - R * 0.5, R * 2, R * 0.5);
        g.strokeStyle = 'rgba(190,250,255,0.9)';
        g.lineWidth = 2 / z;
        g.beginPath(); g.moveTo(pp.x - R, y); g.lineTo(pp.x + R, y); g.stroke();
        g.restore();
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  private drawRescue(g: CanvasRenderingContext2D, z: number) {
    const b = this.rescuePos();
    const pulse = 1 + Math.sin(this.t * 4) * 0.15;
    const ev = this.st.w.s.events.find((e) => e.id === this.rescue!.ev);
    if (ev?.kind === 'wreck') {
      // A dead hulk, slowly tumbling, shedding debris.
      g.globalCompositeOperation = 'lighter';
      blit(g, glow('#7fe3ff', 32), b.x, b.y, 54 * pulse);
      g.globalCompositeOperation = 'source-over';
      drawShip(g, freighter(), b.x, b.y, this.t * 0.35 + 1.2, 0.5, 0, { thrust: 0, engine: '#333' });
      g.fillStyle = 'rgba(160,170,185,0.85)';
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + this.t * (0.2 + i * 0.05), rr = 30 + (i % 3) * 9;
        g.fillRect(b.x + Math.cos(a) * rr - 2, b.y + Math.sin(a) * rr - 2, 4 + (i % 2) * 2, 3);
      }
      g.strokeStyle = `rgba(127,227,255,${0.45 + 0.4 * Math.sin(this.t * 3)})`;
      g.lineWidth = 2 / z;
      g.setLineDash([6 / z, 5 / z]);
      g.beginPath(); g.arc(b.x, b.y, 44 * pulse, 0, TAU); g.stroke();
      g.setLineDash([]);
      g.font = `700 ${13 / z}px Fredoka, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#7fe3ff';
      g.fillText('🛰️ Salvage', b.x, b.y - 44 * pulse - 12 / z);
      return;
    }
    g.globalCompositeOperation = 'lighter';
    blit(g, glow('#ffd166', 32), b.x, b.y, 64 * pulse);
    g.globalCompositeOperation = 'source-over';
    drawShip(g, freighter(), b.x, b.y, this.t * 0.2, 0.45, this.t, { thrust: 0, engine: '#666' });
    g.strokeStyle = `rgba(255,225,150,${0.5 + 0.5 * Math.sin(this.t * 6)})`;
    g.lineWidth = 2.5 / z;
    g.beginPath(); g.arc(b.x, b.y, 42 * pulse, 0, TAU); g.stroke();
    g.font = `700 ${13 / z}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd166';
    g.fillText('🆘 SOS', b.x, b.y - 42 * pulse - 12 / z);
  }

  private drawStar(g: CanvasRenderingContext2D) {
    const s = this.st.w.star(this.star);
    const info = STAR_INFO[s.type];
    const R = this.starRadius();
    const t = this.t;
    g.globalCompositeOperation = 'lighter';
    if (s.type === 'blackhole') {
      // Accretion disk
      for (let i = 0; i < 3; i++) {
        g.save();
        g.rotate(t * (0.4 + i * 0.2));
        g.scale(1, 0.38);
        const gr = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * (2.6 + i * 0.6));
        gr.addColorStop(0, 'rgba(255,220,180,0)');
        gr.addColorStop(0.2, `rgba(${i === 0 ? '255,200,140' : '190,140,255'},0.55)`);
        gr.addColorStop(1, 'rgba(120,60,255,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(0, 0, R * (2.6 + i * 0.6), 0, TAU); g.fill();
        g.restore();
      }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#000';
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(220,200,255,0.9)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, R * 1.08, 0, TAU); g.stroke();
      return;
    }
    const p = 1 + Math.sin(t * 1.3) * 0.04;
    blit(g, glow(info.glow, 64, 1.4), 0, 0, R * 4.2 * p);
    blit(g, glow(info.color, 64, 2), 0, 0, R * 2.2);
    if (s.type === 'binary' && s.color2) {
      const a = t * 0.35;
      const ox = Math.cos(a) * R * 1.1, oy = Math.sin(a) * R * 1.1;
      blit(g, starSprite(info.color, 48), -ox, -oy, R * 1.6);
      blit(g, starSprite(s.color2, 48), ox, oy, R * 1.3);
    } else {
      blit(g, starSprite(info.color, 48), 0, 0, R * 1.5);
      // Corona flicker
      for (let i = 0; i < 6; i++) {
        const a = i + t * 0.2;
        g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 2 + i);
        blit(g, glow(info.glow, 32), Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.9);
      }
      g.globalAlpha = 1;
    }
    if (s.type === 'proto') {
      g.save();
      g.rotate(t * 0.05);
      g.scale(1, 0.45);
      const gr = g.createRadialGradient(0, 0, R * 1.5, 0, 0, R * 7);
      gr.addColorStop(0, 'rgba(255,190,140,0)');
      gr.addColorStop(0.3, 'rgba(255,190,140,0.35)');
      gr.addColorStop(0.6, 'rgba(200,140,110,0.15)');
      gr.addColorStop(1, 'rgba(160,110,90,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, R * 7, 0, TAU); g.fill();
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  }

  private drawPlanetAt(g: CanvasRenderingContext2D, p: Planet, x: number, y: number, z: number) {
    const w = this.st.w;
    const ps = w.peekPS(this.star, p.idx);
    const l = this.look(p);
    const px = p.size * 2 * z;
    const sprite = sphereFor(`${this.star}:${p.idx}`, px * (this.st.game.dpr || 1));
    sprite.update(l, (this.t * 0.012 + p.seed % 100 / 100) % 1);
    const light = Math.atan2(-y, -x);
    const owner = ps.owner;
    const col = owner === 'player' ? '#3ee6c4' : owner ? w.emap.get(owner)?.color : undefined;
    if (ps.destroyed) {
      // Debris ring where a world used to be.
      g.fillStyle = '#5a4a44';
      for (let i = 0; i < 26; i++) {
        const a = i * 2.4 + this.t * 0.05, d = p.size * (0.4 + (i % 5) * 0.2);
        g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, 3 + (i % 3) * 2, 0, TAU); g.fill();
      }
      return;
    }
    // A world you have not explored yet sits greyed out and out of focus until you scan it or land.
    const known = w.explored(this.star, p.idx);
    if (!known) {
      g.save();
      if (CANVAS_FILTER) g.filter = `grayscale(1) brightness(0.6) blur(${(Math.max(1.2, p.size * z * 0.05) * (this.st.game.dpr || 1)).toFixed(1)}px)`;
    }
    drawPlanet(g, sprite, l, x, y, p.size, {
      light, rings: p.rings, ringTilt: -0.3 + (p.seed % 10) / 25, lights: owner && owner !== 'hollow' ? ps.cities : 0,
      lightColor: owner === 'player' ? '#9ff5e2' : '#ffd88a', t: this.t, hollowPulse: owner === 'hollow',
    });
    // Moons
    for (let i = 0; i < p.moons; i++) {
      const a = this.t * (0.25 + i * 0.13) + i * 2.1;
      const d = p.size * (1.7 + i * 0.5);
      const mx = x + Math.cos(a) * d, my = y + Math.sin(a) * d * 0.9;
      const mr = Math.max(3, p.size * 0.14);
      g.fillStyle = '#b9b2a8';
      g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(0,0,10,0.55)';
      g.beginPath(); g.arc(mx - Math.cos(light) * mr * 0.4, my - Math.sin(light) * mr * 0.4, mr, 0, TAU); g.fill();
    }
    if (!known) {
      g.restore();
      // A veil of grey haze drifting over it (and all the greying, where canvas filters are missing).
      g.fillStyle = `rgba(112,120,134,${CANVAS_FILTER ? 0.22 : 0.62})`;
      g.beginPath(); g.arc(x, y, p.size * 1.02, 0, TAU); g.fill();
      g.save();
      g.beginPath(); g.arc(x, y, p.size * 1.02, 0, TAU); g.clip();
      g.fillStyle = 'rgba(190,198,212,0.16)';
      for (let i = 0; i < 3; i++) {
        const k = ((this.t * 0.05 + i / 3 + p.seed * 0.001) % 1) * 2 - 1;
        g.beginPath(); g.ellipse(x + k * p.size * 1.4, y + (i - 1) * p.size * 0.55, p.size * 0.9, p.size * 0.22, 0, 0, TAU); g.fill();
      }
      g.restore();
    }
    // Owner ring
    if (col) {
      g.strokeStyle = col;
      g.lineWidth = 2 / z;
      g.setLineDash([6 / z, 5 / z]);
      g.lineDashOffset = -this.t * 10 / z;
      g.beginPath(); g.arc(x, y, p.size * 1.35, 0, TAU); g.stroke();
      g.setLineDash([]);
    }
    // Alerts
    const ev = w.s.events.find((e) => e.star === this.star && e.planet === p.idx);
    if (ev) {
      const pul = 0.5 + 0.5 * Math.sin(this.t * 6);
      g.strokeStyle = EVENT_INFO[ev.kind].good ? `rgba(255,209,102,${0.4 + pul * 0.6})` : `rgba(255,70,70,${0.4 + pul * 0.6})`;
      g.lineWidth = 3 / z;
      g.beginPath(); g.arc(x, y, p.size * (1.5 + pul * 0.15), 0, TAU); g.stroke();
    }
    if (w.s.missions.some((m) => m.star === this.star && m.planet === p.idx)) {
      g.save();
      g.translate(x, y - p.size - 26 / z);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ffd166';
      const q = (6 + Math.sin(this.t * 5) * 1.5) / z;
      g.fillRect(-q, -q, q * 2, q * 2);
      g.restore();
    }
  }

  /** Every inhabited world keeps defence platforms in orbit, one per city plus one (up to 4). At war they are live
   * turrets (combat crafts drawn with the same art); otherwise they idle, sweeping the sky. */
  private drawDefences(g: CanvasRenderingContext2D, idx: number, px: number, py: number) {
    const w = this.st.w;
    const ps = w.peekPS(this.star, idx);
    if (!ps.owner || ps.destroyed || ps.cities <= 0) return;
    if (this.combat.crafts.some((c) => c.kind === 'turret' && c.planet === idx && c.alive)) return;
    const col = ps.owner === 'player' ? '#3ee6c4' : ps.owner === 'hollow' ? '#ff3b4a' : w.emap.get(ps.owner)?.color ?? '#ffb347';
    const n = Math.min(4, 1 + ps.cities);
    const R = this.planetSize(idx) + 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.t * 0.05;
      this.drawPlatform(g, px + Math.cos(a) * R, py + Math.sin(a) * R, a + Math.sin(this.t * 0.6 + i * 2) * 0.9, col, 0);
    }
  }

  /** An orbital defence platform: a hexagonal hull, two solar wings, and a gun that turns toward its target. */
  private drawPlatform(g: CanvasRenderingContext2D, x: number, y: number, aim: number, col: string, flash: number) {
    g.save();
    g.translate(x, y);
    // Solar wings, fixed across the orbit.
    g.fillStyle = '#2c4a7a';
    g.strokeStyle = '#7fb2ff';
    g.lineWidth = 1;
    g.fillRect(-21, -4, 8, 8); g.strokeRect(-21, -4, 8, 8);
    g.fillRect(13, -4, 8, 8); g.strokeRect(13, -4, 8, 8);
    g.strokeStyle = '#6b7385';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-13, 0); g.lineTo(-9, 0); g.moveTo(9, 0); g.lineTo(13, 0); g.stroke();
    // Hull
    g.fillStyle = '#3a3f4a';
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; const hx = Math.cos(a) * 10, hy = Math.sin(a) * 10; if (k) g.lineTo(hx, hy); else g.moveTo(hx, hy); }
    g.closePath(); g.fill(); g.stroke();
    // Gun
    g.rotate(aim);
    g.fillStyle = '#5b6170';
    g.fillRect(3, -3, 15, 6);
    g.fillStyle = col;
    g.fillRect(15, -2, 4, 4);
    g.fillStyle = '#8a93a6';
    g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
    if (flash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = flash;
      g.fillStyle = '#ffd8a0';
      g.beginPath(); g.arc(20, 0, 7, 0, TAU); g.fill();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }

  private drawCraft(g: CanvasRenderingContext2D, c: Craft, z: number) {
    const frozen = c.frozen > 0 || this.combat.stasis > 0 && c.team === 1;
    if (c.kind === 'turret') {
      this.drawPlatform(g, c.x, c.y, c.angle, c.shotColor, c.flash);
      return;
    }
    if (!c.design) return;
    drawShip(g, c.design, c.x, c.y, c.angle, c.size, this.t + c.id, { thrust: c.thrust, flash: c.flash, engine: c.engine, frozen, alpha: c.kind === 'squire' ? Math.min(1, c.ttl) : 1 });
    if (c.team === 0 && c.kind !== 'player') {
      g.strokeStyle = 'rgba(62,230,196,0.6)';
      g.lineWidth = 1.5 / z;
      g.beginPath(); g.arc(c.x, c.y, c.radius + 8, 0, TAU); g.stroke();
    }
  }

  private drawHpBar(g: CanvasRenderingContext2D, c: Craft, z: number) {
    const wdt = 40 / z * Math.min(1, z * 1.4), hh = 5 / z;
    const x = c.x - wdt / 2, y = c.y - c.radius - 16 / z;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x, y, wdt, hh);
    g.fillStyle = c.kind === 'hollow' ? '#ff3b4a' : '#ff8a5c';
    g.fillRect(x, y, wdt * clamp(c.hp / c.maxHp, 0, 1), hh);
  }

  private drawReticle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, z: number) {
    g.strokeStyle = color;
    g.lineWidth = 2.2 / z;
    const a0 = this.t * 2;
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i * TAU) / 4;
      g.beginPath(); g.arc(x, y, r, a, a + 0.8); g.stroke();
    }
  }

  private drawShots(g: CanvasRenderingContext2D, z: number) {
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const s of this.combat.shots) {
      if (s.kind === 'bolt') {
        const l = 0.03;
        g.strokeStyle = s.color;
        g.lineWidth = s.size * 2;
        g.globalAlpha = 0.5;
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * l, s.y - s.vy * l); g.stroke();
        g.globalAlpha = 1;
        g.strokeStyle = '#ffffff';
        g.lineWidth = s.size * 0.7;
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * l * 0.7, s.y - s.vy * l * 0.7); g.stroke();
      } else if (s.kind === 'missile') {
        blit(g, glow('#9fe3ff', 24), s.x, s.y, 14);
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(s.x, s.y, 2.5, 0, TAU); g.fill();
      } else {
        blit(g, glow('#ffd166', 24), s.x, s.y, 22 + Math.sin(this.t * 20) * 4);
        g.fillStyle = '#fff6d0';
        g.beginPath(); g.arc(s.x, s.y, 5, 0, TAU); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    void z;
  }

  private drawLabels(g: CanvasRenderingContext2D, z: number) {
    const w = this.st.w;
    const px = 1 / z;
    g.font = `600 ${12 * px}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const p of this.planets) {
      const pp = this.planetPos(p.idx);
      const x = pp.x, y = pp.y + p.size * (p.rings ? 1.15 : 1.3) + 6 * px;
      if (!this.cam.isVisible(x, y, 120 * px)) continue;
      const ps = w.peekPS(this.star, p.idx);
      const t = p.kind === 'gas' ? -1 : tScoreOf(ps.atm, ps.temp);
      const stars = t >= 0 ? ' ' + '★'.repeat(t) + '☆'.repeat(3 - t) : '';
      const label = p.name + stars;
      const tw = g.measureText(label).width;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x - tw / 2 - 6 * px, y, tw + 12 * px, 17 * px);
      const owner = ps.owner;
      g.fillStyle = owner === 'player' ? '#9ff5e2' : owner === 'hollow' ? '#ff8a96' : owner ? (w.emap.get(owner)?.color ?? '#fff') : '#e6eef8';
      g.fillText(label, x, y + 2 * px);
      if (p.spice && t >= 0) {
        g.fillStyle = spiceHex(p.spice);
        g.beginPath(); g.arc(x - tw / 2 - 12 * px, y + 8.5 * px, 4.5 * px, 0, TAU); g.fill();
      }
      drawExploreBadge(g, x + tw / 2 + 15 * px, y + 8.5 * px, 7 * px, w.explored(this.star, p.idx) ? 'seen' : 'unknown');
      g.font = `600 ${12 * px}px Fredoka, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
    }
  }

  private drawOffscreen(g: CanvasRenderingContext2D, W: number, H: number) {
    const marks: { x: number; y: number; color: string }[] = [{ x: 0, y: 0, color: 'rgba(255,236,170,0.75)' }];
    for (const c of this.combat.crafts) if (c.team === 1 && c.alive && c.kind !== 'turret') marks.push({ x: c.x, y: c.y, color: '#ff5a5a' });
    if (this.beacons.length) {
      const hp = this.planetPos(1);
      for (const b of this.beacons) if (!b.taken) marks.push({ x: hp.x + Math.cos(b.a + this.t * 0.1) * 230, y: hp.y + Math.sin(b.a + this.t * 0.1) * 230, color: '#ffd166' });
    }
    for (const m of this.st.w.s.missions) {
      if (m.star === this.star && m.planet !== undefined) { const pp = this.planetPos(m.planet); marks.push({ x: pp.x, y: pp.y, color: '#ffd166' }); }
    }
    if (this.rescue) marks.push({ ...this.rescuePos(), color: this.st.w.s.events.find((e) => e.id === this.rescue!.ev)?.kind === 'wreck' ? '#7fe3ff' : '#ffd166' });
    const pad = 26, top = 130, bottom = 150;
    for (const m of marks) {
      const p = this.cam.worldToScreen(m.x, m.y);
      if (p.x > pad && p.x < W - pad && p.y > top && p.y < H - bottom) continue;
      const cx = W / 2, cy = (top + H - bottom) / 2;
      const a = Math.atan2(p.y - cy, p.x - cx);
      const ex = clamp(cx + Math.cos(a) * 1000, pad, W - pad), ey = clamp(cy + Math.sin(a) * 1000, top, H - bottom);
      g.save();
      g.translate(ex, ey);
      g.rotate(a);
      g.fillStyle = m.color;
      g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -7); g.lineTo(-3, 0); g.lineTo(-6, 7); g.closePath(); g.fill();
      g.restore();
    }
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

  // ------------------------------------------------------------------ input
  onTap(x: number, y: number, alt = false) {
    if (alt) { this.onAltTap(x, y); return; }
    const p = this.cam.screenToWorld(x, y);
    const z = this.cam.zoom;
    const w = this.st.w;
    // Hostile craft?
    let best: Craft | null = null, bd = 44 / z;
    for (const c of this.combat.crafts) {
      if (!c.alive || c.team !== 1) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y) - c.radius;
      if (d < bd) { bd = d; best = c; }
    }
    if (best) {
      this.combat.playerTarget = best;
      audio.sfx('tap');
      return;
    }
    // Asteroid? Pick it to mine and move within laser reach.
    for (const a of this.field) {
      const q = this.rockPos(a);
      if (Math.hypot(q.x - p.x, q.y - p.y) > a.r + 18 / z) continue;
      this.mineT = a;
      const dx = this.ship.x - q.x, dy = this.ship.y - q.y, d = Math.hypot(dx, dy) || 1;
      if (d > 260) { this.moveTarget = { x: q.x + (dx / d) * 200, y: q.y + (dy / d) * 200 }; this.autoPlanet = null; this.parked = null; }
      audio.sfx('tap');
      this.st.game.hint('mining', 'Mining! Stay within reach and your laser cuts the rock. Ore sells, ice and magma hold terraform charges, crystals hold spice.', '⛏️');
      return;
    }
    // Planet?
    for (const pl of this.planets) {
      const pp = this.planetPos(pl.idx);
      if (Math.hypot(pp.x - p.x, pp.y - p.y) < pl.size + 22 / z) {
        const ps = w.peekPS(this.star, pl.idx);
        const e = ps.owner && ps.owner !== 'player' ? w.emap.get(ps.owner) : null;
        audio.sfx('tap');
        if (e && e.war && e.serenade <= 0 && !ps.destroyed) {
          this.combat.planetTarget = pl.idx;
          this.st.game.hint('bomb', w.has('bomb') ? 'Planet targeted. Fly close and tap 💣 to bomb its turrets and cities.' : 'To capture a world you need Planet Bombs from your tool shop.', '💣');
          this.moveTarget = { x: pp.x - Math.cos(Math.atan2(pp.y - this.ship.y, pp.x - this.ship.x)) * (pl.size + 260), y: pp.y - Math.sin(Math.atan2(pp.y - this.ship.y, pp.x - this.ship.x)) * (pl.size + 260) };
          return;
        }
        this.goToPlanet(pl.idx);
        return;
      }
    }
    // The star (black holes are rifts)
    if (Math.hypot(p.x, p.y) < this.starRadius() + 20 / z) {
      this.st.tapStar();
      return;
    }
    this.moveTarget = p;
    this.autoPlanet = null;
    this.parked = null;
  }

  goToPlanet(idx: number) {
    const pp = this.planetPos(idx);
    const d = Math.hypot(pp.x - this.ship.x, pp.y - this.ship.y) - this.planetSize(idx);
    if (d < 110) {
      this.parked = { idx, ox: this.ship.x - pp.x, oy: this.ship.y - pp.y };
      this.st.openPlanet(this.star, idx);
    } else {
      this.autoPlanet = idx;
      this.moveTarget = null;
      this.parked = null;
    }
  }

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

function spiceHex(c: string): string {
  return ({ red: '#ff5a4f', yellow: '#ffd166', blue: '#4aa8ff', green: '#4cd97b', pink: '#ff7ab8', purple: '#b48cff' } as Record<string, string>)[c] ?? '#fff';
}
