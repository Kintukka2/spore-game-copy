// Rival nation AI: builds vehicles, turrets and buildings, claims spice, trades, defends,
// and sends attack waves at hostile nations (the player included).
import { audio } from '../../engine/audio';
import { BUILD_COST, PLAYER, VEH_BASE_COST, wdist, wdist2, type City, type Medium, type Nation, type Vehicle, type BuildingKind } from './types';
import { TURRET_HP } from './world';
import type { CivStage } from './stage';

export class AI {
  constructor(private S: CivStage) {}

  update(dt: number) {
    const S = this.S;
    for (const n of S.nations) {
      if (n.id === PLAYER || !n.alive) continue;
      n.waveT += dt;
      n.aiT -= dt;
      if (n.aiT > 0) continue;
      n.aiT = 2.2 + Math.random() * 2;
      const cities = S.sim.owned(n.id);
      if (!cities.length) continue;
      this.think(n, cities);
    }
  }

  /** Can this vehicle get near a point (city centre or geyser)? */
  reach(v: Vehicle, x: number, y: number, city?: City): boolean {
    const t = this.S.terrain;
    if (v.medium === 'air') return true;
    const vc = t.cell(v.x, v.y);
    if (v.medium === 'land') {
      const comp = t.compLand[vc];
      return comp >= 0 && comp === t.compLand[t.cell(x, y)];
    }
    const wc = t.compWater[vc];
    if (city) return !!city.dock && t.compWater[t.cell(city.dock.x, city.dock.y)] === wc;
    const tc = t.cell(x, y);
    if (!t.land[tc]) return t.compWater[tc] === wc;
    const near = t.nearest('sea', tc, wc, 5);
    return near >= 0;
  }

  private think(n: Nation, cities: City[]) {
    const S = this.S;
    const mine = S.vehicles.filter((v) => v.nation === n.id && v.spawn <= 0);
    const all = S.vehicles.filter((v) => v.nation === n.id);
    this.build(n, cities, all.length);
    this.fortify(n, cities);
    let idle = mine.filter((v) => v.order.k === 'idle');
    // Defence: answer attacks on our cities.
    for (const c of cities) {
      if (c.lastHit > 6 || c.lastHitBy < 0 || c.lastHitBy === n.id) continue;
      for (const v of idle.slice()) {
        if (v.role === 'economic' || !this.reach(v, c.x, c.y, c) || wdist(v.x, v.y, c.x, c.y) > 1100) continue;
        S.sim.setOrder(v, { k: 'city', city: c.id });
        idle.splice(idle.indexOf(v), 1);
      }
    }
    // Spice: claim free geysers near home.
    const claimers = new Set(mine.filter((v) => v.order.k === 'geyser').map((v) => (v.order as { g: number }).g));
    let sent = 0;
    for (const g of S.geysers) {
      if (sent >= 2) break;
      if (g.owner >= 0 || claimers.has(g.id)) continue;
      const near = cities.some((c) => wdist(c.x, c.y, g.x, g.y) < 1000);
      if (!near) continue;
      let best: Vehicle | null = null, bd = Infinity;
      for (const v of idle) {
        if ((g.sea ? v.medium !== 'sea' : v.medium !== 'land') || !this.reach(v, g.x, g.y)) continue;
        const d = wdist2(v.x, v.y, g.x, g.y);
        if (d < bd) { bd = d; best = v; }
      }
      if (best) { S.sim.setOrder(best, { k: 'geyser', g: g.id }); idle = idle.filter((v) => v !== best); sent++; }
    }
    // Economic vehicles run trade routes with friendly AI cities.
    for (const v of idle.filter((q) => q.role === 'economic')) {
      const partner = S.cities.find((c) => c.founded && c.owner !== n.id && c.owner !== PLAYER && n.relAI[c.owner] > 0 && this.reach(v, c.x, c.y, c));
      if (partner) { S.sim.setOrder(v, { k: 'city', city: partner.id }); idle = idle.filter((q) => q !== v); }
    }
    // Offence.
    const fighters = idle.filter((v) => v.role !== 'economic');
    if (!fighters.length) return;
    const hostileToPlayer = S.sim.hostile(n.id, PLAYER);
    const want = Math.min(S.tune.waveMax, 2 + Math.floor(S.time / 150));
    if (hostileToPlayer && S.time >= S.tune.firstWave && n.waveT >= S.tune.waveEvery && fighters.length >= Math.min(want, 2)) {
      if (this.attack(n, fighters.slice(0, want), PLAYER)) { n.waveT = 0; return; }
    }
    // Harass player derricks when at war.
    if (hostileToPlayer && S.time >= S.tune.firstWave * 0.6 && Math.random() < 0.25) {
      const v = fighters[0];
      const g = S.geysers.filter((q) => q.owner === PLAYER && this.reach(v, q.x, q.y)).sort((a, b) => wdist2(v.x, v.y, a.x, a.y) - wdist2(v.x, v.y, b.x, b.y))[0];
      if (g && wdist(v.x, v.y, g.x, g.y) < 1200) { S.sim.setOrder(v, { k: 'geyser', g: g.id }); return; }
    }
    // Wars with other nations.
    if (n.waveT >= 45 && n.type !== 'economic' && fighters.length >= 2) {
      const foes = S.nations.filter((o) => o.id !== PLAYER && o.id !== n.id && o.alive && n.relAI[o.id] <= -50);
      if (foes.length) {
        const foe = foes[Math.floor(Math.random() * foes.length)];
        if (this.attack(n, fighters.slice(0, Math.min(fighters.length, 4)), foe.id)) n.waveT = 0;
      }
    }
  }

  private attack(n: Nation, group: Vehicle[], foe: number): boolean {
    const S = this.S;
    const targets = S.cities.filter((c) => c.founded && c.owner === foe);
    if (!targets.length) return false;
    const lead = group[0];
    const scored = targets
      .filter((c) => group.some((v) => this.reach(v, c.x, c.y, c)))
      .map((c) => ({ c, s: wdist(lead.x, lead.y, c.x, c.y) * (n.type === 'religious' && c.happy < 0 ? 0.6 : 1) * (c.home ? 1.4 : 1) }))
      .sort((a, b) => a.s - b.s);
    const tgt = scored[0]?.c;
    if (!tgt) return false;
    let count = 0;
    for (const v of group) {
      if (!this.reach(v, tgt.x, tgt.y, tgt)) continue;
      S.sim.setOrder(v, { k: 'city', city: tgt.id });
      count++;
    }
    if (count && foe === PLAYER) {
      S.toast(`The ${n.name} is sending ${count} ${n.type === 'religious' ? 'missionaries' : 'raiders'} at ${tgt.name}!`, n.type === 'religious' ? '🕊️' : '⚔️', 'bad', 4000);
      audio.sfx('horn');
      S.hint('defend', 'Raiders incoming! Build turrets in the City Planner and keep military vehicles near your cities.', '🛡️');
    }
    return count > 0;
  }

  private build(n: Nation, cities: City[], count: number) {
    const S = this.S;
    const cap = cities.reduce((a, c) => a + 2 + S.tune.aiCapExtra + (c.large ? 1 : 0), 0);
    if (count >= cap) return;
    const c = cities.slice().sort((a, b) => S.sim.vehiclesOf(a) - S.sim.vehiclesOf(b))[0];
    let medium: Medium = 'land';
    const landTargets = S.cities.some((o) => o.founded && o.owner !== n.id && o.continent === c.continent) || S.geysers.some((g) => g.owner < 0 && !g.sea && wdist(g.x, g.y, c.x, c.y) < 900);
    if (c.coastal && (!landTargets || Math.random() < 0.3)) medium = 'sea';
    if (S.time > 300 && cities.length >= 2 && Math.random() < 0.22) medium = 'air';
    const cost = VEH_BASE_COST[medium] * 0.8;
    if (n.money < cost) return;
    if (S.sim.spawn(n.id, c, medium)) n.money -= cost;
  }

  private fortify(n: Nation, cities: City[]) {
    const S = this.S;
    if (n.money < 3200) return;
    // Rebuild a turret.
    for (const c of cities) {
      if (c.lastHit < 25) continue;
      const alive = c.turrets.filter((t) => t.alive).length;
      const want = (c.large ? 3 : 2) + (n.type === 'military' ? 1 : 0) + S.tune.aiCapExtra - 1;
      if (alive >= Math.min(c.turrets.length, Math.max(1, want))) continue;
      const tu = c.turrets.find((t) => !t.alive);
      if (!tu) continue;
      tu.alive = true; tu.hp = TURRET_HP; tu.off = 0;
      n.money -= BUILD_COST.turret;
      return;
    }
    // Fill an empty building slot.
    for (const c of cities) {
      const i = c.slots.findIndex((s) => !s.kind);
      if (i < 0) continue;
      const houses = c.slots.filter((s) => s.kind === 'house').length;
      const factories = c.slots.filter((s) => s.kind === 'factory').length;
      let kind: BuildingKind = houses <= factories ? 'house' : 'factory';
      c.slots[i].kind = kind;
      if (S.sim.cityEconomy(c).happy < 0) { kind = 'fun'; c.slots[i].kind = kind; }
      n.money -= BUILD_COST[kind];
      return;
    }
  }
}
