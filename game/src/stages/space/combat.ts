// Real-time ship combat inside a star system: crafts, turrets, projectiles, weapons and AI.
import { RNG } from '../../engine/rng';
import { TAU, clamp, wrapAngle } from '../../engine/math';
import { audio } from '../../engine/audio';
import { generateShip } from '../../design/generate';
import type { Design } from '../../design/types';
import { aggression, addMod, razeCity, strength } from './empires';
import { onPiratesCleared } from './missions';
import { resolve as resolveEvent } from './events';
import type { SpaceStage } from './stage';

export type CraftKind = 'player' | 'ally' | 'squire' | 'pirate' | 'empire' | 'hollow' | 'turret';

export interface Craft {
  id: number;
  kind: CraftKind;
  team: 0 | 1;
  empire?: string;
  design: Design | null;
  x: number; y: number; vx: number; vy: number; angle: number;
  hp: number; maxHp: number;
  speed: number; size: number; radius: number;
  fireT: number; fireRate: number; dmg: number; range: number;
  target: Craft | null;
  alive: boolean; flash: number; frozen: number; thrust: number;
  ttl: number;
  orbitA: number; orbitDir: number;
  planet?: number;
  turretA?: number;
  ev?: number;
  mission?: number;
  boss?: boolean;
  raider?: boolean;
  shotColor: string;
  engine: string;
  slot?: number;
}

export interface Shot {
  x: number; y: number; vx: number; vy: number;
  dmg: number; team: 0 | 1; kind: 'bolt' | 'missile' | 'bomb';
  target: Craft | null; planet?: number;
  life: number; color: string; size: number; trail: number;
  noBlame?: boolean;
}

let pirateDesign: Design | null = null;
export function pirateShip(): Design {
  if (!pirateDesign) pirateDesign = generateShip(new RNG(4242), { base: '#3b3a46', coat: '#c43c3c', detail: '#ffd166', pattern: 'stripes' }, 'Raider');
  return pirateDesign;
}

export class Combat {
  crafts: Craft[] = [];
  shots: Shot[] = [];
  player!: Craft;
  private nextId = 1;
  laserFiring = false;
  private laserSfx = 0;
  private missileT = 0;
  pulseCd = 0;
  bombCd = 0;
  shieldT = 0;
  shieldCd = 0;
  stasis = 0;
  /** Planet index targeted for bombing. */
  planetTarget: number | null = null;
  playerTarget: Craft | null = null;

  constructor(private st: SpaceStage) {}

  reset() {
    this.crafts = [];
    this.shots = [];
    this.playerTarget = null;
    this.planetTarget = null;
    this.stasis = 0;
    const d = this.st.shipDesign;
    this.player = this.make('player', 0, d, 0, 0, { hp: 1, speed: 0, dmg: 0, range: 0, rate: 1, size: 0.85 });
    this.player.radius = 28;
  }

  private make(kind: CraftKind, team: 0 | 1, design: Design | null, x: number, y: number, o: { hp: number; speed: number; dmg: number; range: number; rate: number; size: number; empire?: string; color?: string; engine?: string }): Craft {
    const c: Craft = {
      id: this.nextId++, kind, team, empire: o.empire, design, x, y, vx: 0, vy: 0, angle: Math.random() * TAU,
      hp: o.hp, maxHp: o.hp, speed: o.speed, size: o.size, radius: 22 * o.size / 0.5,
      fireT: 1 + Math.random() * 1.5, fireRate: o.rate, dmg: o.dmg, range: o.range, target: null,
      alive: true, flash: 0, frozen: 0, thrust: 0, ttl: Infinity, orbitA: Math.random() * TAU, orbitDir: Math.random() < 0.5 ? 1 : -1,
      shotColor: o.color ?? '#ff6a6a', engine: o.engine ?? '#ff9a6a',
    };
    this.crafts.push(c);
    return c;
  }

  hostiles(): Craft[] {
    return this.crafts.filter((c) => c.team === 1 && c.alive);
  }
  hasHostiles(): boolean {
    for (const c of this.crafts) if (c.team === 1 && c.alive) return true;
    return false;
  }

  // ------------------------------------------------------------------ spawning
  spawnPirates(n: number, x: number, y: number, extra: Partial<Craft> = {}) {
    const k = this.st.game.diff(0.7, 1, 1.35);
    for (let i = 0; i < n; i++) {
      const boss = i === 0 && n >= 4;
      const a = Math.random() * TAU, d = 60 + Math.random() * 140;
      const c = this.make('pirate', 1, pirateShip(), x + Math.cos(a) * d, y + Math.sin(a) * d, {
        hp: (boss ? 420 : 110) * k, speed: boss ? 170 : 240, dmg: (boss ? 18 : 11) * k, range: 380, rate: boss ? 1.4 : 1.1, size: boss ? 0.85 : 0.5, color: '#ff7a4a', engine: '#ff8a3a',
      });
      c.boss = boss;
      Object.assign(c, extra);
    }
  }

  spawnEmpire(empireId: string, n: number, x: number, y: number, extra: Partial<Craft> = {}) {
    const w = this.st.w;
    const e = w.emap.get(empireId);
    if (!e) return;
    const k = this.st.game.diff(0.7, 1, 1.35);
    if (e.arch === 'hollow') {
      const depth = clamp(1 - (w.star(w.s.loc).r - 80) / 300, 0, 1);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, d = 60 + Math.random() * 160;
        const c = this.make('hollow', 1, e.ship, x + Math.cos(a) * d, y + Math.sin(a) * d, {
          hp: (420 + depth * 380) * k, speed: 205, dmg: (24 + depth * 14) * k, range: 450, rate: 1.35, size: 0.62, empire: 'hollow', color: '#ff3b4a', engine: '#ff3b4a',
        });
        Object.assign(c, extra);
      }
      return;
    }
    const s = strength(w, e);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = 60 + Math.random() * 140;
      const c = this.make('empire', 1, e.ship, x + Math.cos(a) * d, y + Math.sin(a) * d, {
        hp: [160, 220, 320, 450, 600][s - 1] * k, speed: 240, dmg: (9 + s * 3) * k, range: 400, rate: 1.2, size: 0.55, empire: empireId, color: e.color, engine: e.color,
      });
      Object.assign(c, extra);
    }
  }

  spawnTurrets(planet: number, n: number, hpEach: number, empire: string) {
    const w = this.st.w;
    const e = w.emap.get(empire);
    for (let i = 0; i < n; i++) {
      const c = this.make('turret', 1, null, 0, 0, { hp: hpEach, speed: 0, dmg: (e?.arch === 'hollow' ? 26 : 16) * this.st.game.diff(0.7, 1, 1.3), range: 470, rate: 1.5, size: 0.5, empire, color: e?.arch === 'hollow' ? '#ff3b4a' : '#ffb347' });
      c.planet = planet;
      c.turretA = (i / n) * TAU;
      c.radius = 16;
    }
  }

  spawnAlly(design: Design, empire: string, hp: number, slot: number) {
    const p = this.player;
    const c = this.make('ally', 0, design, p.x - 80, p.y + 60 * (slot - 1), { hp, speed: 330, dmg: 14, range: 400, rate: 0.9, size: 0.48, empire, color: '#7fe3ff', engine: '#7fe3ff' });
    c.slot = slot;
    return c;
  }

  /** Warlord power: a friendly pirate fleet that pounds a planet's defences. */
  raiderAssault(planet: number) {
    const pp = this.st.sv.planetPos(planet);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const c = this.make('pirate', 0, pirateShip(), pp.x + Math.cos(a) * 420, pp.y + Math.sin(a) * 420, { hp: 260, speed: 260, dmg: 70, range: 300, rate: 1.6, size: 0.5, color: '#ffb347', engine: '#ff8a3a' });
      c.planet = planet;
      c.ttl = 40;
      c.raider = true;
    }
  }

  spawnSquire() {
    const p = this.player;
    const c = this.make('squire', 0, this.st.shipDesign, p.x - 60, p.y - 60, { hp: 450, speed: 360, dmg: 22, range: 400, rate: 0.7, size: 0.36, color: '#3ee6c4', engine: '#3ee6c4' });
    c.ttl = 60;
    c.slot = 3;
    return c;
  }

  // ------------------------------------------------------------------ player weapons
  laserDps(): number { return 40 * Math.pow(2, this.st.w.laserLevel - 1) * this.st.w.damageMult; }
  missileDmg(): number { return 45 * Math.pow(2, this.st.w.missileLevel - 1) * this.st.w.damageMult; }

  firePulse(): boolean {
    const w = this.st.w;
    const lv = w.pulseLevel;
    if (!lv || this.pulseCd > 0 || w.s.energy < 10) return false;
    w.s.energy -= 10;
    this.pulseCd = 5;
    const R = 230 * lv, dmg = 130 * lv * w.damageMult;
    const p = this.player;
    this.st.fx.ring(p.x, p.y, 20, R, 0.5, '#9fe3ff', 6);
    this.st.fx.ring(p.x, p.y, 10, R * 0.7, 0.4, '#ffffff', 3);
    for (const c of this.crafts) if (c.team === 1 && c.alive && Math.hypot(c.x - p.x, c.y - p.y) < R + c.radius) this.damage(c, dmg);
    for (const s of this.shots) if (s.team === 1 && Math.hypot(s.x - p.x, s.y - p.y) < R) s.life = 0;
    audio.sfx('zap');
    return true;
  }

  dropBomb(): string | null {
    const w = this.st.w;
    if (!w.has('bomb')) return 'You need Planet Bombs (tool shop).';
    if (this.planetTarget === null) return 'Tap an enemy planet to target it.';
    if (this.bombCd > 0) return null;
    if (w.s.energy < 6) return 'Not enough energy.';
    const sv = this.st.sv;
    const pp = sv.planetPos(this.planetTarget);
    const p = this.player;
    if (Math.hypot(pp.x - p.x, pp.y - p.y) > 520) return 'Fly closer to the planet.';
    w.s.energy -= 6;
    this.bombCd = 0.9;
    const a = Math.atan2(pp.y - p.y, pp.x - p.x);
    this.shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, dmg: 260 * w.damageMult, team: 0, kind: 'bomb', target: null, planet: this.planetTarget, life: 3, color: '#ffd166', size: 7, trail: 0 });
    audio.sfx('whoosh', { pitch: 0.7 });
    return null;
  }

  raiseShield(): boolean {
    const w = this.st.w;
    if (!w.has('shield') || this.shieldCd > 0 || w.s.energy < 25) return false;
    w.s.energy -= 25;
    this.shieldT = 6;
    this.shieldCd = 30;
    audio.sfx('heal');
    return true;
  }

  // ------------------------------------------------------------------ damage
  damage(c: Craft, dmg: number, byPlayer = true) {
    if (!c.alive) return;
    if (c.kind === 'player') {
      if (this.shieldT > 0) { this.st.fx.ring(c.x, c.y, 30, 60, 0.25, '#5cc8ff', 3); return; }
      const w = this.st.w;
      w.s.hp -= dmg;
      c.flash = 1;
      this.st.fx.shake = Math.max(this.st.fx.shake, 3);
      audio.sfx('hit', { vol: 0.6 });
      if (w.s.hp <= 0) { w.s.hp = 0; this.st.playerDestroyed(); }
      return;
    }
    c.hp -= dmg;
    c.flash = 1;
    if (c.hp <= 0) this.kill(c, byPlayer);
  }

  private kill(c: Craft, byPlayer: boolean) {
    c.alive = false;
    const big = c.boss || c.kind === 'hollow';
    this.st.fx.explosion(c.x, c.y, big ? 1.5 : c.kind === 'turret' ? 0.8 : 1, c.kind === 'hollow' ? '#ff4a5a' : '#ffb347');
    audio.sfx('explode', { vol: big ? 1 : 0.7 });
    const w = this.st.w;
    if (this.playerTarget === c) this.playerTarget = null;
    if (c.team === 1 && byPlayer) {
      w.counter('kills');
      if (c.kind === 'pirate') {
        const loot = c.boss ? 9000 : 2500 + Math.floor(Math.random() * 2000);
        w.addMoney(loot);
        this.st.floatText(c.x, c.y, `+§${loot.toLocaleString('en-US')}`, '#ffd166');
        audio.sfx('coin', { vol: 0.5 });
      }
    }
    if (c.kind === 'turret' && c.planet !== undefined) {
      const ps = w.ps(w.s.loc, c.planet);
      ps.def = Math.max(0, (ps.def ?? 0) - c.maxHp);
    }
    // Allied ship losses hurt relations.
    if (c.kind === 'ally' && c.empire) {
      const e = w.emap.get(c.empire);
      if (e) addMod(e, 'lostships', 'You lost our ships', -8, { min: -40, decay: 0.5 });
    }
    this.checkCleared(c);
  }

  /** Event and mission groups resolve when their ships are gone. */
  private checkCleared(dead: Craft) {
    const w = this.st.w;
    if (dead.ev !== undefined && !this.crafts.some((c) => c.alive && c.ev === dead.ev)) {
      const ev = w.s.events.find((e) => e.id === dead.ev);
      if (ev) resolveEvent(w, ev);
    }
    if (dead.mission !== undefined && !this.crafts.some((c) => c.alive && c.mission === dead.mission)) {
      onPiratesCleared(w, w.s.loc);
    }
  }

  /** A bomb hits a planet: break turrets first, then cities. */
  private bombPlanet(idx: number, dmg: number, blame = true) {
    const w = this.st.w;
    const star = w.s.loc;
    const ps = w.ps(star, idx);
    const pp = this.st.sv.planetPos(idx);
    const pl = w.planet(star, idx);
    this.st.fx.explosion(pp.x + (Math.random() - 0.5) * pl.size, pp.y + (Math.random() - 0.5) * pl.size, 0.9, '#ffd166');
    audio.sfx('explode', { vol: 0.6 });
    if (!ps.owner || ps.owner === 'player') return;
    const e = w.emap.get(ps.owner);
    if (e && !e.war && blame) aggression(w, e, 40);
    const turrets = this.crafts.filter((c) => c.kind === 'turret' && c.planet === idx && c.alive);
    if (turrets.length) { this.damage(turrets[0], dmg * 0.9); return; }
    ps.cityHp = (ps.cityHp ?? 450) - dmg;
    if (ps.cityHp > 0) return;
    this.st.fx.explosion(pp.x, pp.y, 1.6, '#ff7a3a');
    this.st.fx.screenFlash('#ffb070', 0.35);
    if (razeCity(w, star, idx) === 'fell') { this.st.ui.toast(`A city on ${pl.name} falls. ${ps.cities} left.`, '🔥'); return; }
    // Captured!
    this.planetTarget = null;
    this.st.ui.toast(`${pl.name} is yours!`, '🏳️', 'gold');
    audio.sfx('levelup');
    this.st.sv.refreshHostility();
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    const w = this.st.w;
    const p = this.player;
    const frozen = this.stasis > 0;
    this.stasis = Math.max(0, this.stasis - dt);
    this.pulseCd = Math.max(0, this.pulseCd - dt);
    this.bombCd = Math.max(0, this.bombCd - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.shieldCd = Math.max(0, this.shieldCd - dt);
    // Auto-acquire a target.
    if (this.playerTarget && !this.playerTarget.alive) this.playerTarget = null;
    if (!this.playerTarget) {
      let best: Craft | null = null, bd = 520;
      for (const c of this.crafts) {
        if (c.team !== 1 || !c.alive) continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd) { bd = d; best = c; }
      }
      this.playerTarget = best;
    }
    // Player weapons
    const tgt = this.playerTarget;
    this.laserFiring = false;
    if (tgt && tgt.alive && !this.st.paused) {
      const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
      if (d < 330 && w.s.energy > 0.5) {
        this.laserFiring = true;
        w.s.energy = Math.max(0, w.s.energy - 1.1 * dt);
        this.damage(tgt, this.laserDps() * dt);
        this.laserSfx -= dt;
        if (this.laserSfx <= 0) { audio.sfx('laser', { vol: 0.35, pitch: 0.9 + Math.random() * 0.2 }); this.laserSfx = 0.45; }
        if (Math.random() < dt * 30) this.st.fx.spawn(tgt.x + (Math.random() - 0.5) * 10, tgt.y + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.3, 2, '#9fe3ff', 1, 3);
      }
      this.missileT -= dt;
      if (d < 580 && this.missileT <= 0 && w.s.energy >= 2.5) {
        this.missileT = 1.5;
        w.s.energy -= 2.5;
        const a = Math.atan2(tgt.y - p.y, tgt.x - p.x) + (Math.random() - 0.5) * 1.6;
        this.shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * 160 + p.vx, vy: Math.sin(a) * 160 + p.vy, dmg: this.missileDmg(), team: 0, kind: 'missile', target: tgt, life: 3.2, color: '#9fe3ff', size: 4, trail: 0 });
        audio.sfx('whoosh', { vol: 0.35, pitch: 1.6 });
      }
    }
    // Crafts
    for (const c of this.crafts) {
      if (!c.alive || c.kind === 'player') continue;
      c.flash = Math.max(0, c.flash - dt * 5);
      if (c.ttl !== Infinity) {
        c.ttl -= dt;
        if (c.ttl <= 0) { c.alive = false; this.st.fx.ring(c.x, c.y, 5, 40, 0.4, '#3ee6c4'); continue; }
      }
      if (c.kind === 'turret') this.updateTurret(c, dt, frozen);
      else if (c.team === 1) this.updateHostile(c, dt, frozen);
      else this.updateFriend(c, dt);
    }
    p.flash = Math.max(0, p.flash - dt * 5);
    // Shots
    for (const s of this.shots) this.updateShot(s, dt);
    this.shots = this.shots.filter((s) => s.life > 0);
    this.crafts = this.crafts.filter((c) => c.alive || c.kind === 'player');
  }

  private nearestEnemy(c: Craft, maxD: number): Craft | null {
    let best: Craft | null = null, bd = maxD;
    for (const o of this.crafts) {
      if (!o.alive || o.team === c.team) continue;
      if (o.kind === 'player' && this.st.w.s.hp <= 0) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  private steer(c: Craft, tx: number, ty: number, want: number, dt: number) {
    const dx = tx - c.x, dy = ty - c.y;
    const d = Math.hypot(dx, dy) || 1;
    // Orbit the target at the desired distance.
    const radial = (d - want) / Math.max(60, want);
    const nx = dx / d, ny = dy / d;
    const tx2 = -ny * c.orbitDir, ty2 = nx * c.orbitDir;
    let vx = nx * clamp(radial, -1, 1) + tx2 * 0.7, vy = ny * clamp(radial, -1, 1) + ty2 * 0.7;
    const l = Math.hypot(vx, vy) || 1;
    vx = (vx / l) * c.speed; vy = (vy / l) * c.speed;
    const k = 1 - Math.exp(-2.5 * dt);
    c.vx += (vx - c.vx) * k;
    c.vy += (vy - c.vy) * k;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    const sp = Math.hypot(c.vx, c.vy);
    c.thrust = sp / Math.max(1, c.speed);
    if (sp > 20) c.angle += wrapAngle(Math.atan2(c.vy, c.vx) - c.angle) * Math.min(1, dt * 6);
  }

  private shoot(c: Craft, t: { x: number; y: number; vx: number; vy: number }) {
    const d = Math.hypot(t.x - c.x, t.y - c.y);
    const tt = d / 560;
    const ax = t.x + t.vx * tt - c.x, ay = t.y + t.vy * tt - c.y;
    const a = Math.atan2(ay, ax) + (Math.random() - 0.5) * 0.12;
    this.shots.push({ x: c.x, y: c.y, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, dmg: c.dmg, team: c.team, kind: 'bolt', target: null, life: 1.4, color: c.shotColor, size: c.boss || c.kind === 'hollow' ? 4.5 : 3, trail: 0 });
    if (Math.random() < 0.5) audio.sfx('laser', { vol: 0.18, pitch: c.team === 1 ? 0.7 : 1.2 });
  }

  private updateHostile(c: Craft, dt: number, frozen: boolean) {
    if (frozen || c.frozen > 0) { c.frozen = Math.max(0, c.frozen - dt); c.vx *= 0.9; c.vy *= 0.9; return; }
    const p = this.player;
    const sv = this.st.sv;
    // Raiders keep hitting their planet until you come close.
    let tx = p.x, ty = p.y, tvx = p.vx, tvy = p.vy;
    let tgt: Craft | null = this.nearestEnemy(c, 1100);
    let atPlanet = false;
    if (c.planet !== undefined && c.kind !== 'turret' && (!tgt || Math.hypot(p.x - c.x, p.y - c.y) > 650)) {
      const pp = sv.planetPos(c.planet);
      tx = pp.x; ty = pp.y; tvx = 0; tvy = 0;
      atPlanet = true;
      tgt = null;
    } else if (tgt) { tx = tgt.x; ty = tgt.y; tvx = tgt.vx; tvy = tgt.vy; }
    else {
      // Idle patrol
      c.orbitA += dt * 0.3;
      this.steer(c, Math.cos(c.orbitA) * 300, Math.sin(c.orbitA) * 300, 0, dt);
      return;
    }
    const want = atPlanet ? sv.planetSize(c.planet!) + 90 : c.range * 0.62;
    this.steer(c, tx, ty, want, dt);
    c.fireT -= dt;
    const d = Math.hypot(tx - c.x, ty - c.y);
    if (c.fireT <= 0 && d < c.range + (atPlanet ? 80 : 0)) {
      c.fireT = c.fireRate * (0.75 + Math.random() * 0.5);
      if (atPlanet) {
        const a = Math.atan2(ty - c.y, tx - c.x);
        this.shots.push({ x: c.x, y: c.y, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, dmg: 0, team: 1, kind: 'bolt', target: null, life: d / 500, color: c.shotColor, size: 3, trail: 0 });
      } else this.shoot(c, { x: tx, y: ty, vx: tvx, vy: tvy });
    }
  }

  private updateTurret(c: Craft, dt: number, frozen: boolean) {
    const sv = this.st.sv;
    const pp = sv.planetPos(c.planet!);
    const R = sv.planetSize(c.planet!) + 10;
    const a = (c.turretA ?? 0) + this.st.sv.t * 0.05;
    c.x = pp.x + Math.cos(a) * R;
    c.y = pp.y + Math.sin(a) * R;
    if (frozen || c.frozen > 0) { c.frozen = Math.max(0, c.frozen - dt); return; }
    const t = this.nearestEnemy(c, c.range);
    if (!t) return;
    c.angle = Math.atan2(t.y - c.y, t.x - c.x);
    c.fireT -= dt;
    if (c.fireT <= 0) { c.fireT = c.fireRate * (0.8 + Math.random() * 0.4); this.shoot(c, t); }
  }

  private updateFriend(c: Craft, dt: number) {
    const p = this.player;
    if (c.raider && c.planet !== undefined) {
      const pp = this.st.sv.planetPos(c.planet);
      this.steer(c, pp.x, pp.y, this.st.sv.planetSize(c.planet) + 110, dt);
      c.fireT -= dt;
      if (c.fireT <= 0) {
        c.fireT = c.fireRate * (0.8 + Math.random() * 0.4);
        const a = Math.atan2(pp.y - c.y, pp.x - c.x);
        this.shots.push({ x: c.x, y: c.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, dmg: c.dmg, team: 0, kind: 'bomb', target: null, planet: c.planet, life: 3, color: '#ffb347', size: 5, trail: 0, noBlame: true });
      }
      return;
    }
    let tgt = this.playerTarget && this.playerTarget.alive ? this.playerTarget : null;
    if (!tgt) { const n = this.nearestEnemy(p, 650); tgt = n; }
    if (tgt) {
      this.steer(c, tgt.x, tgt.y, c.range * 0.6, dt);
      c.fireT -= dt;
      if (c.fireT <= 0 && Math.hypot(tgt.x - c.x, tgt.y - c.y) < c.range) { c.fireT = c.fireRate * (0.8 + Math.random() * 0.4); this.shoot(c, tgt); }
    } else {
      // Formation behind the player.
      const back = p.angle + Math.PI + ((c.slot ?? 1) - 1.5) * 0.7;
      const fx = p.x + Math.cos(back) * 90, fy = p.y + Math.sin(back) * 90;
      const dx = fx - c.x, dy = fy - c.y, d = Math.hypot(dx, dy);
      const sp = Math.min(c.speed * 1.3, d * 3);
      const k = 1 - Math.exp(-4 * dt);
      c.vx += ((dx / (d || 1)) * sp - c.vx) * k;
      c.vy += ((dy / (d || 1)) * sp - c.vy) * k;
      c.x += c.vx * dt; c.y += c.vy * dt;
      const s = Math.hypot(c.vx, c.vy);
      c.thrust = s / c.speed;
      c.angle += wrapAngle((s > 30 ? Math.atan2(c.vy, c.vx) : p.angle) - c.angle) * Math.min(1, dt * 5);
    }
  }

  private updateShot(s: Shot, dt: number) {
    s.life -= dt;
    if (s.kind === 'missile') {
      const t = s.target && s.target.alive ? s.target : null;
      const sp = Math.hypot(s.vx, s.vy);
      const nsp = Math.min(620, sp + 700 * dt);
      let a = Math.atan2(s.vy, s.vx);
      if (t) a += clamp(wrapAngle(Math.atan2(t.y - s.y, t.x - s.x) - a), -4.5 * dt, 4.5 * dt);
      s.vx = Math.cos(a) * nsp; s.vy = Math.sin(a) * nsp;
      s.trail -= dt;
      if (s.trail <= 0) { s.trail = 0.025; this.st.fx.spawn(s.x, s.y, -s.vx * 0.05, -s.vy * 0.05, 0.45, 3, 'rgba(180,200,230,0.35)', 2, 1, 14); }
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.kind === 'bomb' && s.planet !== undefined) {
      const pp = this.st.sv.planetPos(s.planet);
      const r = this.st.sv.planetSize(s.planet);
      const a = Math.atan2(pp.y - s.y, pp.x - s.x);
      s.vx = Math.cos(a) * 420; s.vy = Math.sin(a) * 420;
      if (Math.hypot(pp.x - s.x, pp.y - s.y) < r) { s.life = 0; this.bombPlanet(s.planet, s.dmg, !s.noBlame); }
      return;
    }
    if (s.dmg <= 0) return;
    for (const c of this.crafts) {
      if (!c.alive || c.team === s.team) continue;
      if (Math.hypot(c.x - s.x, c.y - s.y) < c.radius + s.size) {
        s.life = 0;
        this.damage(c, s.dmg, s.team === 0);
        this.st.fx.spawn(s.x, s.y, 0, 0, 0.25, s.kind === 'missile' ? 18 : 8, s.color, 0);
        if (s.kind === 'missile') this.st.fx.ring(s.x, s.y, 4, 34, 0.25, '#9fe3ff', 2);
        break;
      }
    }
  }

  /** Empire ships of an empire we are now at peace with leave. */
  pacify(empireId: string) {
    for (const c of this.crafts) if (c.empire === empireId && c.team === 1) { c.alive = false; this.st.fx.ring(c.x, c.y, 5, 50, 0.4, '#ffffff'); }
  }
}

