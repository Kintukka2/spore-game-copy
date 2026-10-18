// The simulation: vehicles, projectiles, turrets, cities (meters, production), derricks and captures.
import { computeStats } from '../../design/registry';
import { clamp } from '../../engine/math';
import { PK } from './fx';
import { TURRET_HP } from './world';
import {
  CITY_R, H, PLAYER, turretPos, wdist, wdist2, wdx, wrapX,
  type City, type Geyser, type Medium, type Method, type Nation, type NationType, type Order, type Projectile, type Target, type Vehicle,
  VEH_BASE_COST,
} from './types';
import type { CivStage } from './stage';

export const AIR_LIFT = 30;

/** Geyser output in §/s at stage time t: starts at 70 and halves every 200 seconds. */
export const geyserRate = (t: number) => Math.max(8, 70 * Math.pow(0.5, t / 200));

export interface VStats { hp: number; dmg: number; speed: number; range: number; pow: number; cost: number }

export function vehicleStats(design: import('../../design/types').Design | null, medium: Medium, role: NationType): VStats {
  const st = design ? computeStats(design) : {};
  const p = st.power ?? 0, a = st.armor ?? 0, m = st.move ?? 0;
  const base = {
    land: { hp: 170 + a * 22, speed: 58 + m * 6, dmg: 14 + p * 2.5, rng: { military: 130, religious: 150, economic: 0 } },
    sea: { hp: 230 + a * 28, speed: 54 + m * 5, dmg: 19 + p * 3.2, rng: { military: 215, religious: 175, economic: 0 } },
    air: { hp: 130 + a * 18, speed: 105 + m * 9, dmg: 6 + p * 0.9, rng: { military: 112, religious: 140, economic: 0 } },
  }[medium];
  return {
    hp: Math.round(base.hp), dmg: base.dmg, speed: base.speed, range: base.rng[role],
    pow: role === 'religious' ? 0.9 + p * 0.15 : p,
    cost: VEH_BASE_COST[medium] + 30 * (p + a + m),
  };
}

export class Sim {
  constructor(private S: CivStage) {}

  // ------------------------------------------------------------------ queries
  vehicle(id: number): Vehicle | undefined {
    return this.S.vehicleMap.get(id);
  }
  cityPopulation(c: City): number {
    return c.slots.filter((s) => s.kind === 'house').length;
  }
  vehicleCap(c: City): number {
    return 3 + this.cityPopulation(c) + (c.large ? 1 : 0);
  }
  vehiclesOf(c: City): number {
    let n = 0;
    for (const v of this.S.vehicles) if (v.home === c.id && v.nation === c.owner) n++;
    return n;
  }
  owned(nation: number): City[] {
    return this.S.cities.filter((c) => c.owner === nation && c.founded);
  }

  /** Are nations a and b fighting? */
  hostile(a: number, b: number): boolean {
    if (a === b || a < 0 || b < 0) return false;
    const S = this.S;
    if (a === PLAYER || b === PLAYER) {
      const n = S.nations[a === PLAYER ? b : a];
      if (!n.alive || n.allied || n.goodwill > 0 || n.truce > 0) return false;
      return n.rel <= -60 || n.hostileT < 20;
    }
    return S.nations[a].relAI[b] <= -50;
  }

  // ------------------------------------------------------------------ vehicles
  spawn(nation: number, city: City, medium: Medium, role: NationType = city.type): Vehicle | null {
    const S = this.S;
    let x = city.x, y = city.y;
    if (medium === 'sea') {
      if (!city.dock) return null;
      x = city.dock.x; y = city.dock.y;
    } else if (medium === 'land') {
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2;
        const px = city.x + Math.cos(a) * 82, py = city.y + Math.sin(a) * 60 + 10;
        if (S.terrain.canStand('land', px, py)) { x = px; y = py; break; }
      }
    } else {
      y = city.y - 10;
    }
    const d = S.vehicleDesign(nation, medium, role);
    const st = vehicleStats(d, medium, role);
    const hpMul = nation === PLAYER ? 1 : S.tune.aiHp;
    const v: Vehicle = {
      id: S.nextId++, nation, role, medium, home: city.id, x: wrapX(x), y, vx: 0, vy: 0, facing: Math.random() < 0.5 ? -1 : 1,
      hp: st.hp * hpMul, maxHp: st.hp * hpMul, dmg: st.dmg, speed: st.speed, range: st.range, cool: Math.random(),
      order: { k: 'idle' }, path: null, pathI: 0, aim: 0, leg: 0, frozen: 0, invuln: 0, bribed: 0, flash: 0, spawn: 0.8,
      bob: Math.random() * 10, repath: 0, stuck: 0, gx: x, gy: y, pow: st.pow,
    };
    S.vehicles.push(v);
    S.vehicleMap.set(v.id, v);
    S.fx.burst(PK.Smoke, v.x, v.y, 6, 30, { life: 0.8, size: 7, grow: 12, color: '#d9d4c8' });
    return v;
  }

  /** Recompute stats for every vehicle of a nation using a design (after a redesign). */
  restat(nation: number, medium: Medium) {
    for (const v of this.S.vehicles) {
      if (v.nation !== nation || v.medium !== medium) continue;
      const st = vehicleStats(this.S.vehicleDesign(nation, medium, v.role), medium, v.role);
      const frac = v.hp / v.maxHp;
      v.maxHp = st.hp; v.hp = st.hp * frac; v.dmg = st.dmg; v.speed = st.speed; v.range = st.range; v.pow = st.pow;
    }
  }

  setOrder(v: Vehicle, o: Order) {
    v.order = o;
    v.path = null;
    v.repath = 0;
    v.leg = 0;
    v.stuck = 0;
  }

  kill(v: Vehicle, by = -1) {
    const S = this.S;
    v.hp = 0;
    S.fx.explode(v.x, v.y, v.medium === 'sea' ? 1.1 : 0.9, v.medium === 'air' ? AIR_LIFT : 0);
    S.sfxAt('explode', v.x, v.y, 0.8);
    if (v.nation === PLAYER) S.stats.lost++;
    if (by === PLAYER && v.nation !== PLAYER) S.stats.kills++;
    S.selected.delete(v.id);
    S.vehicleMap.delete(v.id);
    const i = S.vehicles.indexOf(v);
    if (i >= 0) S.vehicles.splice(i, 1);
  }

  /** Move toward (tx, ty); returns true once within `stop` units. */
  private steer(v: Vehicle, tx: number, ty: number, stop: number, dt: number): boolean {
    const S = this.S;
    const d = wdist(v.x, v.y, tx, ty);
    if (d <= stop) { this.brake(v, dt); return true; }
    if (!v.path || v.repath <= 0 && wdist(v.gx, v.gy, tx, ty) > 40) {
      v.path = S.terrain.path(v.medium, v.x, v.y, tx, ty);
      v.pathI = 0;
      v.gx = tx; v.gy = ty;
      v.repath = 1.2;
      if (!v.path || !v.path.length) { v.path = []; this.brake(v, dt); return false; }
    }
    if (v.pathI >= v.path.length) {
      // Reached the end of a path that could not get closer.
      this.brake(v, dt);
      return wdist(v.x, v.y, tx, ty) <= stop + 60;
    }
    const wp = v.path[v.pathI];
    const dx = wdx(v.x, wp.x), dy = wp.y - v.y;
    const dl = Math.hypot(dx, dy);
    if (dl < 14) { v.pathI++; return false; }
    const sp = v.speed * (v.bribed > 0 ? 0.8 : 1);
    const ax = (dx / dl) * sp, ay = (dy / dl) * sp;
    const k = Math.min(1, dt * 5);
    v.vx += (ax - v.vx) * k;
    v.vy += (ay - v.vy) * k;
    this.integrate(v, dt);
    return false;
  }
  private brake(v: Vehicle, dt: number) {
    const k = Math.min(1, dt * 6);
    v.vx -= v.vx * k;
    v.vy -= v.vy * k;
    this.integrate(v, dt);
  }
  private integrate(v: Vehicle, dt: number) {
    const t = this.S.terrain;
    const nx = v.x + v.vx * dt, ny = clamp(v.y + v.vy * dt, 40, H - 40);
    // Somehow off valid terrain (pushed, or a stale save): move freely until back on it.
    if (!t.canStand(v.medium, v.x, v.y)) { v.x = wrapX(nx); v.y = ny; if (Math.abs(v.vx) > 6) v.facing = v.vx > 0 ? 1 : -1; return; }
    if (t.canStand(v.medium, nx, ny)) { v.x = wrapX(nx); v.y = ny; }
    else if (t.canStand(v.medium, nx, v.y)) { v.x = wrapX(nx); v.vy *= 0.5; }
    else if (t.canStand(v.medium, v.x, ny)) { v.y = ny; v.vx *= 0.5; }
    else { v.vx *= 0.3; v.vy *= 0.3; v.stuck += dt; }
    if (Math.abs(v.vx) > 6) v.facing = v.vx > 0 ? 1 : -1;
  }

  targetPos(tg: Target): { x: number; y: number } | null {
    const S = this.S;
    switch (tg.t) {
      case 'v': { const v = this.vehicle(tg.id); return v ? { x: v.x, y: v.y - (v.medium === 'air' ? AIR_LIFT : 8) } : null; }
      case 'tur': { const c = S.cities[tg.city]; const tu = c.turrets[tg.i]; if (!tu?.alive) return null; const p = turretPos(tg.i, c.turrets.length); return { x: c.x + p.x, y: c.y + p.y - 12 }; }
      case 'hall': { const c = S.cities[tg.city]; return { x: c.x, y: c.y - 24 }; }
      case 'der': { const g = S.geysers[tg.g]; return g.owner >= 0 ? { x: g.x, y: g.y - 16 } : null; }
    }
  }

  /** Fire a weapon from v at a target. */
  private fire(v: Vehicle, tg: Target) {
    const S = this.S;
    const p = this.targetPos(tg);
    if (!p) return;
    const sx = v.x, sy = v.y - (v.medium === 'air' ? AIR_LIFT : 10);
    if (v.role === 'religious') {
      // Arcing faith beam: light damage, shuts buildings down.
      S.fx.beam(sx, sy, p.x, p.y, '#ffe58a', 0.35, 3, 40);
      S.fx.burst(PK.Glow, p.x, p.y, 4, 30, { life: 0.5, size: 6, color: '#fff2a8' });
      this.damage(tg, 5 + v.pow * 2, v.nation, 'faith');
      // Awe: faith briefly stops enemy vehicles in their tracks.
      if (tg.t === 'v') { const o = this.vehicle(tg.id); if (o && o.frozen <= 0 && o.invuln <= 0 && Math.random() < 0.45) o.frozen = 0.7; }
      v.cool = 1.4;
      S.sfxAt('bell', v.x, v.y, 0.25, 1.4 + Math.random() * 0.3);
      return;
    }
    if (v.medium === 'air') {
      S.fx.beam(sx, sy, p.x, p.y, '#ff6b5a', 0.12, 2.5);
      S.fx.spawn(PK.Spark, p.x, p.y, { life: 0.25, size: 3, color: '#ffd0a0', vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60 });
      this.damage(tg, v.dmg, v.nation, 'laser');
      v.cool = 0.25;
      if (Math.random() < 0.3) S.sfxAt('laser', v.x, v.y, 0.35);
      return;
    }
    const dist = wdist(sx, sy, p.x, p.y);
    const missile = v.medium === 'sea';
    const pr: Projectile = {
      k: missile ? 'missile' : 'shell', x: sx, y: sy, sx, sy, tx: p.x, ty: p.y, t: 0, dur: Math.max(0.25, dist / (missile ? 260 : 300)),
      nation: v.nation, dmg: v.dmg, tgt: tg, arc: missile ? 0 : Math.min(60, dist * 0.3),
    };
    S.projectiles.push(pr);
    S.fx.spawn(PK.Smoke, sx + v.facing * 10, sy, { life: 0.5, size: 4, grow: 10, color: '#cfcac0' });
    v.cool = missile ? 1.5 : 1.15;
    S.sfxAt(missile ? 'whoosh' : 'hit', v.x, v.y, 0.3, missile ? 1.3 : 1.6);
  }

  /** Apply damage to any target. `kind` controls side effects (faith beams disable buildings). */
  damage(tg: Target, dmg: number, by: number, kind: 'shot' | 'laser' | 'faith' | 'bomb' = 'shot') {
    const S = this.S;
    switch (tg.t) {
      case 'v': {
        const v = this.vehicle(tg.id);
        if (!v || v.invuln > 0) return;
        v.hp -= dmg;
        v.flash = 0.15;
        this.recordHit(v.nation, by);
        if (v.hp <= 0) this.kill(v, by);
        break;
      }
      case 'tur': {
        const c = S.cities[tg.city];
        const tu = c.turrets[tg.i];
        if (!tu?.alive) return;
        if (kind === 'faith') { this.faithHit(c.owner, by); tu.off = Math.min(10, tu.off + 5); return; }
        this.recordHit(c.owner, by, true);
        c.lastHit = 0; c.lastHitBy = by;
        tu.hp -= dmg;
        if (tu.hp <= 0) {
          tu.alive = false;
          const p = turretPos(tg.i, c.turrets.length);
          S.fx.explode(c.x + p.x, c.y + p.y, 1.1);
          S.sfxAt('explode', c.x, c.y, 0.9);
        }
        break;
      }
      case 'hall': {
        const c = S.cities[tg.city];
        if (kind !== 'faith') this.recordHit(c.owner, by, true);
        else this.faithHit(c.owner, by);
        c.lastHit = 0; c.lastHitBy = by;
        if (kind === 'faith') {
          // Faith beams shut entertainment down instead of hurting the hall.
          const fun = c.slots.find((s) => s.kind === 'fun' && s.off <= 0);
          if (fun) fun.off = 6;
          return;
        }
        c.defense -= dmg;
        if (c.defense <= 0) this.fall(c, by);
        break;
      }
      case 'der': {
        const g = S.geysers[tg.g];
        if (g.owner < 0) return;
        if (kind === 'faith') { this.faithHit(g.owner, by); return; }
        this.recordHit(g.owner, by, true);
        g.hp -= dmg;
        if (g.hp <= 0) {
          S.fx.explode(g.x, g.y, 1.2);
          S.sfxAt('explode', g.x, g.y, 0.9);
          if (g.owner === PLAYER) S.toast('One of your derricks was destroyed!', '🛢️', 'bad');
          g.owner = -1; g.hp = 220; g.work = 0;
        }
        break;
      }
    }
  }

  /** City defence reached zero. */
  private fall(c: City, by: number) {
    const S = this.S;
    if (by < 0 || by === c.owner) { c.defense = 1; return; }
    const protectedCity = c.home || (c.owner === PLAYER && S.tune.playerCitiesSafe);
    if (protectedCity) {
      c.defense = c.defenseMax * 0.3;
      for (const s of c.slots) if (Math.random() < 0.35) s.kind = null;
      S.fx.explode(c.x, c.y - 20, 1.6);
      S.toast(`${c.name} was sacked but holds! Rebuild its defences.`, '🛡️', 'bad');
      // The raiders take their loot and go home.
      for (const v of S.vehicles) if (v.nation === by && v.order.k === 'city' && v.order.city === c.id) this.setOrder(v, { k: 'idle' });
      if (S.nations[by]) S.nations[by].waveT = 0;
      return;
    }
    this.capture(c, by, 'military');
  }

  /** Preaching at someone's buildings sours relations slowly instead of declaring war outright. */
  private faithHit(victim: number, by: number) {
    const S = this.S;
    if (victim < 0 || by < 0 || victim === by) return;
    if (by === PLAYER) {
      const n = S.nations[victim];
      n.rel = Math.max(-100, n.rel - 0.5);
      if (n.allied && n.rel < 40) { n.allied = false; S.toast(`Your preaching broke your alliance with the ${n.name}.`, '💔', 'bad'); }
    } else if (victim === PLAYER) {
      S.nations[by].hostileT = Math.min(S.nations[by].hostileT, 10);
      S.underAttack(true);
    }
  }

  /** Track who hurt whom: relations, war, danger music. */
  recordHit(victim: number, by: number, asset = false) {
    const S = this.S;
    if (victim < 0 || by < 0 || victim === by) return;
    if (by === PLAYER) {
      const n = S.nations[victim];
      if (n.allied) { n.allied = false; S.toast(`You attacked your ally, the ${n.name}! The alliance is broken.`, '💔', 'bad'); n.rel = Math.min(n.rel, -20); }
      if (n.hostileT > 20) {
        n.rel = Math.max(-100, n.rel - 25);
        S.diplo.event(n, 'attacked');
      } else n.rel = Math.max(-100, n.rel - 0.6);
      n.hostileT = 0;
      n.goodwill = 0;
      n.truce = 0;
    } else if (victim === PLAYER) {
      S.nations[by].hostileT = 0;
      S.underAttack(asset);
    } else {
      const a = S.nations[victim], b = S.nations[by];
      a.relAI[by] = Math.max(-100, a.relAI[by] - 0.4);
      b.relAI[victim] = a.relAI[by];
    }
  }

  // ------------------------------------------------------------------ capture
  capture(c: City, owner: number, method: Method) {
    const S = this.S;
    const old = c.owner;
    if (old === owner) return;
    c.owner = owner;
    c.convert = 0; c.convertBy = -1; c.buyout = 0; c.trade = false;
    c.defense = c.defenseMax * (method === 'military' ? 0.4 : 0.8);
    c.flash = 1.5;
    c.lastHit = 99;
    if (method === 'military') {
      for (const s of c.slots) if (Math.random() < 0.7) s.kind = null;
      for (const tu of c.turrets) tu.alive = false;
    }
    for (const tu of c.turrets) { tu.off = 0; tu.frozen = 0; }
    S.fx.burst(PK.Confetti, c.x, c.y - 30, 40, 120, { vz: 160, life: 2, size: 4, colors: [S.nations[owner].color, '#ffffff', '#ffd166'] });
    S.fx.wave(c.x, c.y, 160, S.nations[owner].color, 1.2);
    // Old owner's vehicles from this city find a new home.
    const oldCities = this.owned(old);
    for (const v of S.vehicles) {
      if (v.nation === old && v.home === c.id) {
        let best = -1, bd = Infinity;
        for (const oc of oldCities) { const d = wdist2(oc.x, oc.y, v.x, v.y); if (d < bd) { bd = d; best = oc.id; } }
        v.home = best;
      }
      if (v.order.k === 'city' && v.order.city === c.id) {
        if (v.nation === owner) this.setOrder(v, { k: 'move', x: c.x + (Math.random() - 0.5) * 120, y: c.y + 70 + Math.random() * 40 });
        else if (v.nation === PLAYER || !this.hostile(v.nation, owner)) this.setOrder(v, { k: 'idle' });
      }
    }
    S.onCapture(c, old, owner, method);
    if (old >= 0 && this.owned(old).length === 0) this.eliminate(S.nations[old]);
  }

  eliminate(n: Nation) {
    const S = this.S;
    if (n.id === PLAYER || !n.alive) return;
    n.alive = false;
    for (const g of S.geysers) if (g.owner === n.id) { g.owner = -1; g.hp = 220; }
    for (const v of S.vehicles.slice()) if (v.nation === n.id) {
      S.fx.burst(PK.Smoke, v.x, v.y, 5, 30, { life: 1, size: 8, grow: 12, color: '#bbb' });
      this.kill(v);
    }
    S.onEliminated(n);
  }

  // ------------------------------------------------------------------ city maths
  /** Happiness and §/s output from the planner layout. */
  cityEconomy(c: City): { happy: number; output: number; factoryOut: number[] } {
    const n = c.slots.length;
    const act = (i: number) => { const s = c.slots[(i + n) % n]; return s.off > 0 || c.hush > 0 ? null : s.kind; };
    let happy = 1;
    const factoryOut: number[] = new Array(n).fill(0);
    let out = 6; // the hall itself
    for (let i = 0; i < n; i++) {
      const k = act(i);
      if (k === 'factory') {
        happy -= 1;
        let links = 1; // hall
        if (act(i - 1) === 'house') links++;
        if (act(i + 1) === 'house') links++;
        factoryOut[i] = links * 8;
      } else if (k === 'fun') {
        happy += 1; // hall link
        for (const j of [i - 1, i + 1]) {
          const nk = act(j);
          if (nk === 'house') happy += 1;
          else if (nk === 'factory') happy -= 1;
        }
      }
    }
    const mul = happy < 0 ? 0 : happy > 0 ? 1.25 : 1;
    for (const f of factoryOut) out += f * mul;
    return { happy, output: out, factoryOut };
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    const S = this.S;
    for (const n of S.nations) {
      n.hostileT += dt;
      if (n.goodwill > 0) n.goodwill -= dt;
      if (n.truce > 0) n.truce -= dt;
    }
    this.updateCities(dt);
    this.updateVehicles(dt);
    this.updateProjectiles(dt);
    this.updateGeysers(dt);
    this.updateEconomy(dt);
  }

  private updateEconomy(dt: number) {
    const S = this.S;
    const rate = geyserRate(S.time);
    const income = new Array(S.nations.length).fill(0);
    for (const c of S.cities) if (c.founded && c.owner >= 0) income[c.owner] += c.output;
    for (const g of S.geysers) if (g.owner >= 0) income[g.owner] += rate;
    for (const n of S.nations) {
      const k = n.id === PLAYER ? 1 : S.tune.aiIncome;
      n.money += income[n.id] * k * dt;
    }
    S.income = income[PLAYER];
  }

  private updateGeysers(dt: number) {
    const S = this.S;
    const rate = geyserRate(S.time);
    for (const g of S.geysers) {
      if (g.owner === PLAYER) {
        g.pop -= dt;
        if (g.pop <= 0) {
          g.pop = 4;
          S.fx.float(g.x, g.y - 46, '+§' + Math.round(rate * 4), '#ffd166', 13);
          if (S.isOnScreen(g.x, g.y)) S.game.audio.sfx('coin', { vol: 0.25, pitch: 1.1 + Math.random() * 0.2 });
        }
      }
      // Claim work decays if nobody is working on it.
      if (g.workBy >= 0) {
        const worker = S.vehicles.some((v) => v.nation === g.workBy && v.order.k === 'geyser' && v.order.g === g.id && wdist(v.x, v.y, g.x, g.y) < 70);
        if (!worker) { g.work = Math.max(0, g.work - dt * 0.3); if (g.work <= 0) g.workBy = -1; }
      }
    }
  }

  private updateCities(dt: number) {
    const S = this.S;
    for (const c of S.cities) {
      if (!c.founded) {
        if (S.time >= c.foundAt) { c.founded = true; S.onFounded(c); }
        continue;
      }
      c.lastHit += dt;
      c.flash = Math.max(0, c.flash - dt);
      if (c.hush > 0) c.hush -= dt;
      for (const s of c.slots) if (s.off > 0) s.off -= dt;
      const eco = this.cityEconomy(c);
      c.happy = eco.happy;
      c.output = eco.output;
      if (c.lastHit > 8 && c.defense < c.defenseMax) c.defense = Math.min(c.defenseMax, c.defense + c.defenseMax * 0.025 * dt);
      // Turrets.
      const tn = c.turrets.length;
      for (let i = 0; i < tn; i++) {
        const tu = c.turrets[i];
        if (!tu.alive) continue;
        if (tu.off > 0) tu.off -= dt;
        if (tu.frozen > 0) { tu.frozen -= dt; continue; }
        if (tu.off > 0 || c.hush > 0) continue;
        if (c.lastHit > 6 && tu.hp < TURRET_HP) tu.hp = Math.min(TURRET_HP, tu.hp + 6 * dt);
        tu.cool -= dt;
        if (tu.cool > 0) continue;
        const p = turretPos(i, tn);
        const tx = c.x + p.x, ty = c.y + p.y;
        const tgt = this.cityThreat(c, tx, ty, 175);
        if (!tgt) { tu.cool = 0.4; continue; }
        tu.cool = 1.5;
        const tp = this.targetPos({ t: 'v', id: tgt.id })!;
        S.projectiles.push({ k: 'tracer', x: tx, y: ty - 18, sx: tx, sy: ty - 18, tx: tp.x, ty: tp.y, t: 0, dur: Math.max(0.15, wdist(tx, ty, tp.x, tp.y) / 480), nation: c.owner, dmg: c.owner === PLAYER ? 13 : 7 * S.tune.turretDmg, tgt: { t: 'v', id: tgt.id }, arc: 6 });
        S.sfxAt('zap', tx, ty, 0.25, 0.8);
      }
      // Military halls carry a missile launcher.
      if (c.type === 'military' && c.hush <= 0) {
        const key = c.id;
        S.hallCool[key] = (S.hallCool[key] ?? 0) - dt;
        if (S.hallCool[key] <= 0) {
          const tgt = this.cityThreat(c, c.x, c.y, 195);
          S.hallCool[key] = tgt ? 3 : 0.5;
          if (tgt) {
            const tp = this.targetPos({ t: 'v', id: tgt.id })!;
            S.projectiles.push({ k: 'missile', x: c.x, y: c.y - 50, sx: c.x, sy: c.y - 50, tx: tp.x, ty: tp.y, t: 0, dur: Math.max(0.3, wdist(c.x, c.y, tp.x, tp.y) / 240), nation: c.owner, dmg: c.owner === PLAYER ? 14 : 10 * S.tune.turretDmg, tgt: { t: 'v', id: tgt.id }, arc: 50 });
          }
        }
      }
      // Religious conversion.
      this.updateConversion(c, dt);
    }
  }

  /** Nearest hostile vehicle threatening a city. */
  cityThreat(c: City, x: number, y: number, range: number): Vehicle | null {
    let best: Vehicle | null = null, bd = range * range;
    for (const v of this.S.vehicles) {
      if (v.nation === c.owner || v.spawn > 0) continue;
      const threat = this.hostile(c.owner, v.nation) || (v.order.k === 'city' && v.order.city === c.id && v.role !== 'economic') || v.bribed > 0;
      if (!threat) continue;
      const d = wdist2(x, y, v.x, v.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  private updateConversion(c: City, dt: number) {
    const S = this.S;
    const power = new Map<number, number>();
    for (const v of S.vehicles) {
      if (v.role !== 'religious' || v.nation === c.owner || v.frozen > 0) continue;
      if (v.order.k !== 'city' || v.order.city !== c.id) continue;
      if (wdist(v.x, v.y, c.x, c.y) > v.range + 40) continue;
      power.set(v.nation, (power.get(v.nation) ?? 0) + v.pow);
      // Citizens pelt preachers with junk.
      v.hp -= dt * 1.5;
      if (v.hp <= 0) this.kill(v);
    }
    let by = -1, best = 0;
    for (const [n, p] of power) if (p > best) { best = p; by = n; }
    if (by < 0) { c.convert = Math.max(0, c.convert - dt * 2); if (c.convert <= 0) c.convertBy = -1; return; }
    if (c.convertBy !== by) { c.convertBy = by; c.convert = 0; }
    const funOn = c.slots.filter((s) => s.kind === 'fun' && s.off <= 0 && c.hush <= 0).length;
    const turOn = c.turrets.filter((t) => t.alive && t.off <= 0 && t.frozen <= 0 && c.hush <= 0).length;
    let mul = Math.max(0.15, 1 - funOn * 0.2 - turOn * 0.1);
    if (c.happy < 0) mul *= 1.6;
    const tune = by === PLAYER ? S.tune.convertRate : 0.8;
    c.convert += best * mul * tune * dt;
    if (by === PLAYER) {
      const n = S.nations[c.owner];
      if (c.owner >= 0 && n.rel > -60) n.rel -= dt * 0.5;
    } else if (c.owner === PLAYER) S.underAttack();
    if (c.convert >= 100) {
      if (c.home || (c.owner === PLAYER && S.tune.playerCitiesSafe)) { c.convert = 40; S.toast(`${c.name}'s people stay loyal to you!`, '🛡️'); return; }
      S.sfxAt('bell', c.x, c.y, 1, 0.9);
      this.capture(c, by, 'convert');
    }
  }

  private updateProjectiles(dt: number) {
    const S = this.S;
    for (let i = S.projectiles.length - 1; i >= 0; i--) {
      const p = S.projectiles[i];
      p.t += dt;
      if (p.k === 'missile') {
        const tp = this.targetPos(p.tgt);
        if (tp) { p.tx = tp.x; p.ty = tp.y; }
        if (Math.random() < 0.6) S.fx.spawn(PK.Smoke, p.x, p.y, { life: 0.6, size: 3, grow: 8, color: '#d8d8d8' });
      }
      const k = clamp(p.t / p.dur, 0, 1);
      p.x = wrapX(p.sx + wdx(p.sx, p.tx) * k);
      p.y = p.sy + (p.ty - p.sy) * k;
      if (k >= 1) {
        S.projectiles.splice(i, 1);
        if (p.k === 'tracer') S.fx.spawn(PK.Spark, p.tx, p.ty, { life: 0.2, size: 3, color: '#fff0b0' });
        else {
          S.fx.burst(PK.Fire, p.tx, p.ty, 3, 30, { life: 0.35, size: 6, grow: 8 });
          S.fx.burst(PK.Smoke, p.tx, p.ty, 2, 16, { life: 0.8, size: 6, grow: 10, color: '#6a6560' });
          S.fx.shake = Math.min(10, S.fx.shake + (S.isOnScreen(p.tx, p.ty) ? 0.6 : 0));
        }
        this.damage(p.tgt, p.dmg, p.nation);
      }
    }
  }

  // ------------------------------------------------------------------ vehicle brains
  private updateVehicles(dt: number) {
    const S = this.S;
    const vs = S.vehicles;
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i];
      if (!v || v.hp <= 0) continue;
      v.bob += dt;
      v.flash = Math.max(0, v.flash - dt);
      if (v.spawn > 0) { v.spawn -= dt; continue; }
      if (v.invuln > 0) v.invuln -= dt;
      if (v.bribed > 0) v.bribed -= dt;
      if (v.repath > 0) v.repath -= dt;
      if (v.cool > 0) v.cool -= dt;
      if (v.frozen > 0) { v.frozen -= dt; v.vx *= 0.8; v.vy *= 0.8; continue; }
      // Repair near own cities.
      if (v.hp < v.maxHp) {
        for (const c of S.cities) if (c.owner === v.nation && wdist2(c.x, c.y, v.x, v.y) < 160 * 160) { v.hp = Math.min(v.maxHp, v.hp + 6 * dt); break; }
      }
      if (v.bribed > 0) { this.bribedBrain(v, dt); continue; }
      switch (v.order.k) {
        case 'idle': this.idleBrain(v, dt); break;
        case 'move': {
          const o = v.order;
          this.opportunistic(v);
          if (this.steer(v, o.x, o.y, 18, dt) || v.stuck > 2.5 || this.pathDone(v)) { this.setOrder(v, { k: "idle" }); }
          break;
        }
        case 'hunt': {
          const tgt = this.vehicle(v.order.vid);
          if (!tgt || v.role === 'economic') { this.setOrder(v, { k: 'idle' }); break; }
          const d = wdist(v.x, v.y, tgt.x, tgt.y);
          if (d <= v.range * 0.9) {
            this.brake(v, dt);
            if (v.cool <= 0) this.fire(v, { t: 'v', id: tgt.id });
          } else {
            this.steer(v, tgt.x, tgt.y, v.range * 0.8, dt);
            if (this.pathDone(v) && wdist(v.x, v.y, tgt.x, tgt.y) > v.range) this.setOrder(v, { k: 'idle' });
          }
          break;
        }
        case 'city': this.cityBrain(v, S.cities[v.order.city], dt); break;
        case 'geyser': this.geyserBrain(v, S.geysers[v.order.g], dt); break;
      }
      if (v.stuck > 4) { v.stuck = 0; v.path = null; v.repath = 0; }
    }
    // Separation.
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i];
      for (let j = i + 1; j < vs.length; j++) {
        const b = vs[j];
        if (a.medium !== b.medium) continue;
        const dx = wdx(a.x, b.x), dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 26 * 26 || d2 < 0.01) continue;
        const d = Math.sqrt(d2), push = (26 - d) * 0.5 * Math.min(1, dt * 8);
        const ux = dx / d, uy = dy / d;
        if (S.terrain.canStand(a.medium, a.x - ux * push, a.y - uy * push)) { a.x = wrapX(a.x - ux * push); a.y -= uy * push; }
        if (S.terrain.canStand(b.medium, b.x + ux * push, b.y + uy * push)) { b.x = wrapX(b.x + ux * push); b.y += uy * push; }
      }
    }
  }

  /** Nearest enemy vehicle in range (for opportunistic fire). */
  private enemyNear(v: Vehicle, range: number): Vehicle | null {
    let best: Vehicle | null = null, bd = range * range;
    for (const o of this.S.vehicles) {
      if (o.nation === v.nation || o.spawn > 0) continue;
      if (!this.hostile(v.nation, o.nation) && o.bribed <= 0) continue;
      if (v.medium !== 'air' && o.medium === 'air' && v.role !== 'military') continue;
      const d = wdist2(v.x, v.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  private opportunistic(v: Vehicle) {
    if (v.role === 'economic' || v.cool > 0) return;
    const e = this.enemyNear(v, v.range);
    if (e) this.fire(v, { t: 'v', id: e.id });
  }

  private idleBrain(v: Vehicle, dt: number) {
    this.brake(v, dt);
    if (v.role === 'economic') return;
    const e = this.enemyNear(v, v.range * 1.25);
    if (!e) return;
    if (wdist(v.x, v.y, e.x, e.y) <= v.range) { if (v.cool <= 0) this.fire(v, { t: 'v', id: e.id }); }
    else if (v.nation !== PLAYER || v.role === 'military') this.steer(v, e.x, e.y, v.range * 0.8, dt);
  }

  private bribedBrain(v: Vehicle, dt: number) {
    // Bribed vehicles turn on other non-player vehicles.
    if (v.role === 'economic') { this.brake(v, dt); return; }
    let best: Vehicle | null = null, bd = 400 * 400;
    for (const o of this.S.vehicles) {
      if (o === v || o.nation === PLAYER) continue;
      const d = wdist2(v.x, v.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) { this.brake(v, dt); return; }
    if (Math.sqrt(bd) <= Math.max(90, v.range)) { this.brake(v, dt); if (v.cool <= 0) { if (v.role === 'religious') v.cool = 1; else this.fire(v, { t: 'v', id: best.id }); } }
    else this.steer(v, best.x, best.y, Math.max(80, v.range * 0.8), dt);
  }

  /** The city target for a military vehicle: nearest live turret, else the hall. */
  private cityAim(v: Vehicle, c: City): Target {
    let bi = -1, bd = Infinity;
    const n = c.turrets.length;
    for (let i = 0; i < n; i++) {
      if (!c.turrets[i].alive) continue;
      const p = turretPos(i, n);
      const d = wdist2(v.x, v.y, c.x + p.x, c.y + p.y);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi >= 0 ? { t: 'tur', city: c.id, i: bi } : { t: 'hall', city: c.id };
  }

  private cityBrain(v: Vehicle, c: City, dt: number) {
    const S = this.S;
    if (!c.founded) { this.setOrder(v, { k: 'idle' }); return; }
    if (c.owner === v.nation || (v.nation === PLAYER && S.nations[c.owner]?.allied && v.role === 'military')) {
      // Guard duty.
      if (this.steer(v, c.x, c.y + 70, 60, dt)) this.idleBrain(v, dt);
      return;
    }
    // AI only presses attacks on nations it is at war with.
    if (v.nation !== PLAYER && v.role !== 'economic' && !this.hostile(v.nation, c.owner)) { this.setOrder(v, { k: 'idle' }); return; }
    if (v.role === 'military') {
      // Defend yourself first.
      const e = this.enemyNear(v, v.range * 0.8);
      if (e && v.cool <= 0) { this.fire(v, { t: 'v', id: e.id }); }
      const aim = this.cityAim(v, c);
      const p = this.targetPos(aim)!;
      const d = wdist(v.x, v.y, p.x, p.y);
      if (d <= v.range * 0.92) {
        this.brake(v, dt);
        if (v.cool <= 0) this.fire(v, aim);
      } else {
        this.steer(v, p.x, p.y, v.range * 0.85, dt);
        // Path ended out of range: unreachable for this medium.
        if (this.pathDone(v) && wdist(v.x, v.y, p.x, p.y) > v.range) this.unreachable(v, c);
      }
      return;
    }
    if (v.role === 'religious') {
      const d = wdist(v.x, v.y, c.x, c.y);
      if (d <= v.range) {
        this.brake(v, dt);
        // Beam turrets and entertainment to shut them down.
        if (v.cool <= 0) {
          const live = c.turrets.findIndex((t) => t.alive && t.off <= 1);
          if (live >= 0) this.fire(v, { t: 'tur', city: c.id, i: live });
          else this.fire(v, { t: 'hall', city: c.id });
        }
      } else {
        this.steer(v, c.x, c.y, v.range * 0.8, dt);
        if (this.pathDone(v) && wdist(v.x, v.y, c.x, c.y) > v.range) this.unreachable(v, c);
      }
      return;
    }
    // Economic: trade route shuttle.
    const allowed = v.nation === PLAYER ? c.trade : S.nations[v.nation].relAI[c.owner] > 0;
    if (!allowed) { this.setOrder(v, { k: 'idle' }); return; }
    if (v.leg === 0) {
      const there = this.steer(v, c.x, c.y, CITY_R * 0.75, dt);
      if (there || this.pathDone(v)) {
        if (wdist(v.x, v.y, c.x, c.y) > CITY_R + 70) { this.unreachable(v, c); return; }
        this.deliver(v, c);
        v.leg = 1; v.path = null;
      }
    } else {
      const home = this.tradeHome(v, c);
      if (!home) { v.leg = 0; return; }
      if (this.steer(v, home.x, home.y, CITY_R * 0.75, dt) || this.pathDone(v)) { v.leg = 0; v.path = null; }
    }
  }

  /** True once a vehicle has walked its whole path (or has no path at all). */
  private pathDone(v: Vehicle): boolean {
    return !!v.path && v.pathI >= v.path.length && v.repath <= 0.9;
  }

  private tradeHome(v: Vehicle, target: City): City | null {
    let best: City | null = null, bd = Infinity;
    for (const c of this.S.cities) {
      if (c.owner !== v.nation || c === target) continue;
      if (v.medium === 'sea' && !c.coastal) continue;
      if (v.medium === 'land' && c.continent !== target.continent) continue;
      const d = wdist2(c.x, c.y, target.x, target.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  private deliver(v: Vehicle, c: City) {
    const S = this.S;
    if (v.nation === PLAYER) {
      const gain = 14 + v.pow * 1.5;
      c.buyout = Math.min(100, c.buyout + gain * S.tune.tradeRate);
      const cash = 160 + v.pow * 30;
      S.nations[PLAYER].money += cash;
      const n = S.nations[c.owner];
      if (n) n.rel = Math.min(100, n.rel + 2.5);
      S.fx.float(c.x, c.y - 70, `+§${Math.round(cash)}`, '#ffd166', 14);
      S.fx.burst(PK.Coin, c.x, c.y - 20, 6, 50, { vz: 120, life: 1.2, size: 3 });
      S.sfxAt('coin', c.x, c.y, 0.6);
      if (c.buyout >= 100) S.onBuyoutReady(c);
    } else {
      S.nations[v.nation].money += 200;
    }
  }

  private unreachable(v: Vehicle, c: City) {
    if (v.nation === PLAYER) this.S.warnUnreachable(v, c.name);
    this.setOrder(v, { k: 'idle' });
  }

  private geyserBrain(v: Vehicle, g: Geyser, dt: number) {
    const S = this.S;
    const o = v.order as { k: 'geyser'; g: number; want?: number };
    if (o.want !== undefined && g.owner !== o.want && g.owner >= 0 && g.owner !== v.nation && !this.hostile(v.nation, g.owner)) {
      // Someone else got there first; don't start a war over it.
      if (v.nation === PLAYER) S.toast(`The ${S.nations[g.owner].name} claimed that geyser first.`, '🛢️');
      this.setOrder(v, { k: 'idle' });
      return;
    }
    if (g.owner === v.nation) {
      if (this.steer(v, g.x, g.y + 30, 40, dt)) this.setOrder(v, { k: 'idle' });
      return;
    }
    const canClaim = (v.medium === 'land' && !g.sea) || (v.medium === 'sea' && g.sea);
    if (g.owner < 0) {
      if (!canClaim) {
        if (v.nation === PLAYER) S.toast(g.sea ? 'Only sea vehicles can build on ocean geysers.' : v.medium === 'air' ? 'Air vehicles can\'t build derricks.' : 'Only land vehicles can build on land geysers.', '⛔');
        this.setOrder(v, { k: 'idle' });
        return;
      }
      const arrived = this.steer(v, g.x, g.y + 14, 22, dt);
      if (!arrived) {
        if (v.path && v.pathI >= v.path.length) { if (v.nation === PLAYER) S.warnUnreachable(v, 'that geyser'); this.setOrder(v, { k: 'idle' }); }
        return;
      }
      if (g.workBy >= 0 && g.workBy !== v.nation && g.work > 0) return; // someone else is already building here
      if (g.workBy !== v.nation) { g.workBy = v.nation; g.work = 0; }
      g.work += dt / 3;
      if (Math.random() < dt * 8) S.fx.spawn(PK.Spark, g.x + (Math.random() - 0.5) * 20, g.y - Math.random() * 30, { life: 0.3, size: 2, color: '#ffe0a0' });
      if (g.work >= 1) {
        g.owner = v.nation; g.work = 0; g.workBy = -1; g.hp = 220;
        S.onDerrick(g, v.nation, 'built');
        this.setOrder(v, { k: 'move', x: wrapX(g.x + (v.x >= g.x ? 34 : -34)), y: g.y + 30 });
      }
      return;
    }
    // Enemy derrick.
    if (v.role === 'military') {
      const d = wdist(v.x, v.y, g.x, g.y);
      if (d <= v.range * 0.9) { this.brake(v, dt); if (v.cool <= 0) this.fire(v, { t: 'der', g: g.id }); }
      else this.steer(v, g.x, g.y, v.range * 0.8, dt);
      return;
    }
    if (!this.steer(v, g.x, g.y + 14, 50, dt)) return;
    if (v.role === 'economic') {
      if (v.nation === PLAYER) {
        const cost = 1500;
        if (S.nations[PLAYER].money < cost) { S.toast(`Bribing the workers costs ${'§' + cost.toLocaleString('en-US')}.`, '💸', 'bad'); this.setOrder(v, { k: 'idle' }); return; }
        S.nations[PLAYER].money -= cost;
        S.fx.float(g.x, g.y - 50, '-§1,500', '#ff9f8f', 14);
      }
      const old = g.owner;
      if (old >= 0 && v.nation === PLAYER) S.nations[old].rel -= 15;
      g.owner = v.nation; g.hp = 220;
      S.onDerrick(g, v.nation, 'bribed', old);
      this.setOrder(v, { k: 'idle' });
      return;
    }
    // Religious: convert the workers.
    if (g.workBy >= 0 && g.workBy !== v.nation && g.work > 0) return;
    if (g.workBy !== v.nation) { g.workBy = v.nation; g.work = 0; }
    g.work += dt / 5;
    if (Math.random() < dt * 6) S.fx.spawn(PK.Glow, g.x + (Math.random() - 0.5) * 24, g.y - Math.random() * 30, { life: 0.6, size: 5, color: '#fff2a8', vz: 20 });
    if (g.work >= 1) {
      const old = g.owner;
      if (old >= 0 && v.nation === PLAYER) S.nations[old].rel -= 15;
      g.owner = v.nation; g.work = 0; g.workBy = -1; g.hp = 220;
      S.onDerrick(g, v.nation, 'converted', old);
      this.setOrder(v, { k: 'idle' });
    }
  }

  // ------------------------------------------------------------------ commands
  /** Issue a context command to a group of player vehicles at a world point. */
  command(ids: number[], x: number, y: number, target: { city?: City; geyser?: Geyser; vehicle?: Vehicle }) {
    const S = this.S;
    const vs = ids.map((id) => this.vehicle(id)).filter((v): v is Vehicle => !!v);
    if (!vs.length) return;
    if (target.vehicle) {
      const tv = target.vehicle;
      for (const v of vs) this.setOrder(v, v.role === 'economic' ? { k: 'move', x: tv.x, y: tv.y } : { k: 'hunt', vid: tv.id });
      return;
    }
    if (target.city) {
      const c = target.city;
      for (const v of vs) {
        if (v.role === 'economic' && c.owner !== PLAYER && !c.trade) {
          if (!S.diplo.canTrade(c)) { S.diplo.tradeRefused(c); this.setOrder(v, { k: 'move', x: c.x + (Math.random() - 0.5) * 80, y: c.y + 120 }); continue; }
          c.trade = true;
          S.onTradeOpened(c);
        }
        this.setOrder(v, { k: 'city', city: c.id });
      }
      return;
    }
    if (target.geyser) {
      const g = target.geyser;
      for (const v of vs) this.setOrder(v, { k: 'geyser', g: g.id, want: g.owner });
      return;
    }
    // Plain move with a loose formation.
    const n = vs.length;
    vs.forEach((v, i) => {
      const a = (i / n) * Math.PI * 2, r = n > 1 ? 18 + Math.sqrt(n) * 10 : 0;
      this.setOrder(v, { k: 'move', x: wrapX(x + Math.cos(a) * r), y: y + Math.sin(a) * r * 0.7 });
    });
  }

  /** Player buys a vehicle at a city. Returns an error string or null. */
  buy(c: City, medium: Medium): string | null {
    const S = this.S;
    if (c.owner !== PLAYER) return 'Not your city';
    if (medium === 'sea' && !S.unlocked.sea) return 'Sea vehicles unlock at 2 cities';
    if (medium === 'air' && !S.unlocked.air) return 'Air vehicles unlock at 4 cities';
    if (medium === 'sea' && !c.coastal) return `${c.name} has no harbour`;
    if (this.vehiclesOf(c) >= this.vehicleCap(c)) return `${c.name} is at its vehicle limit. Build houses to raise it.`;
    const cost = this.cost(medium, c.type);
    if (S.nations[PLAYER].money < cost) return `Not enough § (${cost.toLocaleString('en-US')} needed)`;
    const v = this.spawn(PLAYER, c, medium);
    if (!v) return 'No room to build';
    S.nations[PLAYER].money -= cost;
    S.fx.float(c.x, c.y - 80, '-' + '§' + cost.toLocaleString('en-US'), '#ff9f8f', 13);
    S.stats.built++;
    return null;
  }

  /** Player scraps vehicles for half their price. */
  scrap(ids: number[]) {
    const S = this.S;
    let total = 0;
    for (const id of ids) {
      const v = this.vehicle(id);
      if (!v || v.nation !== PLAYER) continue;
      total += this.cost(v.medium, v.role) * 0.5;
      S.fx.burst(PK.Smoke, v.x, v.y, 6, 30, { life: 0.9, size: 8, grow: 10, color: '#d9d4c8' });
      S.fx.burst(PK.Coin, v.x, v.y - 10, 4, 40, { vz: 120, life: 1, size: 3 });
      S.selected.delete(v.id);
      S.vehicleMap.delete(v.id);
      const i = S.vehicles.indexOf(v);
      if (i >= 0) S.vehicles.splice(i, 1);
    }
    if (total > 0) {
      S.money += total;
      S.game.audio.sfx('coin');
      S.toast(`Scrapped for ${'§' + Math.round(total).toLocaleString('en-US')}.`, '♻️', 'good');
      S.hud.dirty = true;
    }
  }

  cost(medium: Medium, role: NationType): number {
    return Math.round(vehicleStats(this.S.vehicleDesign(PLAYER, medium, role), medium, role).cost / 50) * 50;
  }
}

