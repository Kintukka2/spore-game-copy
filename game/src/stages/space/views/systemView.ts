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
import { tutorialEvent } from '../missions';
import type { Planet } from '../types';
import type { Design } from '../../../design/types';
import type { SpaceStage } from '../stage';
import { drawExploreBadge } from './badge';

interface Beacon { a: number; taken: boolean }
interface FloatText { x: number; y: number; text: string; color: string; life: number }
interface Traffic { design: Design; x: number; y: number; vx: number; vy: number; angle: number; to: number; engine: string; size: number }

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
    // Hostile owners defend their space.
    if (e && e.war && e.serenade <= 0) {
      const n = e.arch === 'hollow' ? 2 + Math.floor(Math.random() * 2) + (w.star(star).r < 200 ? 1 : 0) : 2 + Math.floor(Math.random() * 2);
      const a = Math.random() * TAU;
      c.spawnEmpire(e.id, n, this.ship.x + Math.cos(a) * 700, this.ship.y + Math.sin(a) * 700);
      this.spawnTurretsFor(e.id);
    }
    // Events here
    for (const ev of w.s.events) {
      if (ev.star !== star || ev.kind === 'eco') continue;
      this.startEventFight(ev.id);
    }
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
      if (!this.st.cinematic) audio.music(near ? 'danger' : 'space');
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
      g.strokeStyle = `rgba(255,70,70,${0.4 + pul * 0.6})`;
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

  private drawCraft(g: CanvasRenderingContext2D, c: Craft, z: number) {
    const frozen = c.frozen > 0 || this.combat.stasis > 0 && c.team === 1;
    if (c.kind === 'turret') {
      const col = c.shotColor;
      g.save();
      g.translate(c.x, c.y);
      g.fillStyle = '#3a3f4a';
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill(); g.stroke();
      g.rotate(c.angle);
      g.fillStyle = col;
      g.fillRect(4, -3, 14, 6);
      if (c.flash > 0) { g.globalAlpha = c.flash; g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill(); }
      g.restore();
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
  onTap(x: number, y: number) {
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
