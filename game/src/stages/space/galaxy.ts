// Seeded spiral galaxy: ~800 stars in four arms, a dense Hollow ring around the core,
// binaries, wormhole pairs, nebulae. Planets are generated lazily per star from its seed.
import { RNG, hashString } from '../../engine/rng';
import { TAU, clamp } from '../../engine/math';
import { planetName, starName } from '../../game/names';
import { ARM_IN, GALAXY_R, RING_IN, RING_OUT, ROMAN, STAR_INFO, coreFactor, tScoreOf, type SpiceColor, type StarType } from './data';
import type { Planet, Star } from './types';

export interface Nebula { x: number; y: number; r: number; hue: number; a: number }

const SPICE_TABLE: Record<string, [SpiceColor, number][]> = {
  'red-green': [['red', 96], ['green', 2], ['pink', 2]],
  'red-other': [['red', 50], ['yellow', 44], ['green', 2], ['pink', 2], ['purple', 2]],
  'yellow-green': [['yellow', 94], ['green', 2], ['pink', 2], ['purple', 2]],
  'yellow-other': [['yellow', 74], ['green', 22], ['pink', 2], ['purple', 2]],
  'blue-green': [['blue', 100]],
  'blue-other': [['blue', 20], ['green', 30], ['pink', 35], ['purple', 15]],
  'white-green': [['yellow', 50], ['blue', 44], ['green', 4], ['pink', 2]],
  'white-other': [['blue', 45], ['yellow', 25], ['green', 18], ['pink', 8], ['purple', 4]],
  'binary-green': [['yellow', 50], ['red', 30], ['green', 10], ['pink', 6], ['purple', 4]],
  'binary-other': [['red', 30], ['yellow', 30], ['green', 20], ['pink', 12], ['purple', 8]],
};

export class Galaxy {
  stars: Star[] = [];
  nebulae: Nebula[] = [];
  readonly coreId = 0;
  homeStar = -1;
  /** Empire home stars (set before any planets are generated). */
  empireHomes = new Map<number, string>();
  private grid = new Map<number, number[]>();
  private readonly cell = 80;
  private pcache = new Map<number, Planet[]>();
  private names = new Set<string>();

  constructor(seed: number) {
    this.generate(new RNG(seed ^ hashString('space-galaxy')));
  }

  // ------------------------------------------------------------------ generation
  private key(cx: number, cy: number) { return (cx + 512) * 4096 + (cy + 512); }

  private addStar(r: RNG, x: number, y: number, type: StarType, arm: number, hollow = false): Star {
    const id = this.stars.length;
    let name = starName(r);
    for (let i = 0; i < 4 && this.names.has(name); i++) name = starName(r);
    this.names.add(name);
    const info = STAR_INFO[type];
    const s: Star = { id, x, y, r: Math.hypot(x, y), type, name, seed: r.seedInt(), size: info.size * r.range(0.85, 1.15), color: info.color, arm, hollow };
    this.stars.push(s);
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let arr = this.grid.get(k);
    if (!arr) this.grid.set(k, (arr = []));
    arr.push(id);
    return s;
  }

  private free(x: number, y: number, minD: number): boolean {
    for (const id of this.near(x, y, minD)) {
      const s = this.stars[id];
      if ((s.x - x) ** 2 + (s.y - y) ** 2 < minD * minD) return false;
    }
    return true;
  }

  private generate(r: RNG) {
    // Core
    this.addStar(r, 0, 0, 'core', -1, false).name = 'The Core';
    // Inner bastions: bridges through the gravity well to the core.
    const a0 = r.range(0, TAU);
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * TAU) / 4 + r.range(-0.2, 0.2);
      for (const rad of [86, 132]) {
        const rr = rad + r.range(-4, 4), aa = a + r.range(-0.15, 0.15);
        this.addStar(r, Math.cos(aa) * rr, Math.sin(aa) * rr, r.chance(0.5) ? 'white' : 'red', -1, true);
      }
    }
    // The Hollow ring
    let tries = 0, count = 0;
    while (count < 150 && tries++ < 6000) {
      const a = r.range(0, TAU);
      const rr = Math.sqrt(r.range(RING_IN * RING_IN, RING_OUT * RING_OUT));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (!this.free(x, y, 29)) continue;
      const type = r.weighted<StarType>(['red', 'white', 'blue', 'yellow'], (t) => ({ red: 50, white: 25, blue: 10, yellow: 15 } as Record<string, number>)[t]);
      this.addStar(r, x, y, type, -1, true);
      count++;
    }
    // Spiral arms
    const rot = r.range(0, TAU);
    const ARMS = 4;
    tries = 0; count = 0;
    while (count < 570 && tries++ < 20000) {
      const arm = count % ARMS;
      const t = r.next();
      const rr = ARM_IN + (GALAXY_R - ARM_IN) * Math.pow(t, 0.92);
      const spread = 0.12 + 0.13 * (rr / GALAXY_R);
      const th = rot + (arm * TAU) / ARMS + Math.log(rr / ARM_IN) * 2.3 + r.gauss() * spread * 0.55;
      const x = Math.cos(th) * rr + r.gauss() * 12, y = Math.sin(th) * rr + r.gauss() * 12;
      if (Math.hypot(x, y) < ARM_IN - 10 || !this.free(x, y, 28)) continue;
      this.addStar(r, x, y, this.pickType(r), arm);
      count++;
    }
    // Scattered disc stars
    tries = 0; count = 0;
    while (count < 110 && tries++ < 6000) {
      const a = r.range(0, TAU);
      const rr = Math.sqrt(r.range(ARM_IN * ARM_IN, (GALAXY_R * 1.02) ** 2));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (!this.free(x, y, 40)) continue;
      this.addStar(r, x, y, this.pickType(r), -1);
      count++;
    }
    // Wormhole pairs (black holes)
    const cands = this.stars.filter((s) => !s.hollow && s.type !== 'core' && s.type !== 'proto');
    r.shuffle(cands);
    let pairs = 0;
    for (let i = 0; i < cands.length - 1 && pairs < 12; i++) {
      const a = cands[i];
      if (a.type === 'blackhole') continue;
      const b = cands.find((c) => c !== a && c.type !== 'blackhole' && Math.hypot(c.x - a.x, c.y - a.y) > 500);
      if (!b) continue;
      for (const s of [a, b]) { s.type = 'blackhole'; s.color = STAR_INFO.blackhole.color; s.size = 1; }
      a.twin = b.id; b.twin = a.id;
      pairs++;
    }
    // Binary companion colours
    for (const s of this.stars) {
      if (s.type === 'binary') {
        s.color2 = r.pick([STAR_INFO.red.color, STAR_INFO.yellow.color, STAR_INFO.blue.color, STAR_INFO.white.color]);
      }
    }
    // Decorative nebulae
    for (let i = 0; i < 22; i++) {
      const a = r.range(0, TAU), rr = r.range(250, GALAXY_R * 1.05);
      this.nebulae.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: r.range(90, 260), hue: r.pick([280, 200, 320, 180, 20, 250]) + r.range(-20, 20), a: r.range(0.08, 0.2) });
    }
  }

  private pickType(r: RNG): StarType {
    return r.weighted<StarType>(['red', 'yellow', 'white', 'blue', 'binary', 'proto'], (t) =>
      ({ red: 42, yellow: 26, white: 12, blue: 8, binary: 9, proto: 2 } as Record<string, number>)[t]);
  }

  // ------------------------------------------------------------------ queries
  /** Ids of stars in grid cells overlapping a radius (not exact; filter by distance). */
  near(x: number, y: number, rad: number): number[] {
    const out: number[] = [];
    const c0x = Math.floor((x - rad) / this.cell), c1x = Math.floor((x + rad) / this.cell);
    const c0y = Math.floor((y - rad) / this.cell), c1y = Math.floor((y + rad) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
      const arr = this.grid.get(this.key(cx, cy));
      if (arr) for (const id of arr) out.push(id);
    }
    return out;
  }

  within(id: number, rad: number): number[] {
    const s = this.stars[id];
    return this.near(s.x, s.y, rad).filter((o) => o !== id && Math.hypot(this.stars[o].x - s.x, this.stars[o].y - s.y) <= rad);
  }

  nearest(x: number, y: number, maxD: number): Star | null {
    let best: Star | null = null, bd = maxD;
    for (const id of this.near(x, y, maxD)) {
      const s = this.stars[id];
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  dist(a: number, b: number): number {
    const s = this.stars[a], t = this.stars[b];
    return Math.hypot(s.x - t.x, s.y - t.y);
  }

  /** Effective jump range from a star given a base drive range. */
  rangeFrom(id: number, base: number): number {
    return base * coreFactor(this.stars[id].r);
  }

  /** Fewest-hop route within drive range (Dijkstra on hops then distance). Null if unreachable. */
  route(from: number, to: number, base: number, avoid?: (id: number) => boolean): number[] | null {
    if (from === to) return [from];
    const n = this.stars.length;
    const cost = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    cost[from] = 0;
    // Simple O(V^2)-ish with a binary-heap-free scan over a frontier list (fine for <1000 nodes).
    const frontier: number[] = [from];
    while (frontier.length) {
      let bi = 0;
      for (let i = 1; i < frontier.length; i++) if (cost[frontier[i]] < cost[frontier[bi]]) bi = i;
      const u = frontier[bi];
      frontier.splice(bi, 1);
      if (done[u]) continue;
      done[u] = 1;
      if (u === to) break;
      const range = this.rangeFrom(u, base);
      for (const v of this.within(u, range)) {
        if (done[v]) continue;
        if (v !== to && (this.stars[v].type === 'core' || (avoid && avoid(v)))) continue;
        const c = cost[u] + 1000 + this.dist(u, v);
        if (c < cost[v]) { cost[v] = c; prev[v] = u; frontier.push(v); }
      }
    }
    if (!isFinite(cost[to])) return null;
    const path: number[] = [];
    for (let v = to; v !== -1; v = prev[v]) path.unshift(v);
    return path[0] === from ? path : null;
  }

  // ------------------------------------------------------------------ planets
  planets(id: number): Planet[] {
    const c = this.pcache.get(id);
    if (c) return c;
    const out = this.genPlanets(this.stars[id]);
    this.pcache.set(id, out);
    return out;
  }

  /** Index of the planet an owner would colonise in this system (best T-score with spice). */
  colonyIdx(id: number): number {
    const ps = this.planets(id);
    let best = -1, bs = -1;
    for (const p of ps) {
      if (p.kind === 'gas') continue;
      const sc = tScoreOf(p.atm, p.temp) * 10 + (p.spice ? 5 : 0) + p.richness + (p.feature === 'empire-home' || p.feature === 'home' ? 100 : 0);
      if (sc > bs) { bs = sc; best = p.idx; }
    }
    return best;
  }

  private genPlanets(s: Star): Planet[] {
    if (s.type === 'blackhole' || s.type === 'proto' || s.type === 'core') return [];
    const r = new RNG(s.seed);
    if (s.id === this.homeStar) return this.homePlanets(s, r);
    const n = s.type === 'yellow' ? r.int(2, 6) : s.type === 'binary' ? r.int(1, 4) : s.type === 'white' ? r.int(1, 4) : r.int(1, 5);
    const heat = STAR_INFO[s.type].heat;
    const out: Planet[] = [];
    for (let i = 0; i < n; i++) {
      const orbit = 300 + i * 215 + r.range(-30, 30) + (s.type === 'blue' ? 60 : 0);
      const gas = (i >= 2 && r.chance(0.35)) || (s.type === 'blue' && i >= 1 && r.chance(0.2));
      let temp = clamp(heat * 1.5 - i * 0.16 + r.range(-0.1, 0.1), 0.02, 0.98);
      let atm = gas ? 0.95 : Math.pow(r.next(), 0.9);
      if (!gas) {
        // Naturally perfect worlds are rare.
        const dx = atm - 0.5, dy = temp - 0.5, d = Math.hypot(dx, dy);
        if (d < 0.13 && !r.chance(0.12)) {
          const a = d > 0.001 ? Math.atan2(dy, dx) : r.range(0, TAU);
          const nd = r.range(0.13, 0.26);
          atm = 0.5 + Math.cos(a) * nd; temp = 0.5 + Math.sin(a) * nd;
        }
      }
      if (s.hollow) {
        // Hollow worlds are always dead.
        if (!gas) { atm = r.chance(0.5) ? r.range(0, 0.12) : r.range(0.88, 1); temp = r.chance(0.5) ? r.range(0, 0.15) : r.range(0.8, 1); }
      }
      const orbitClass = temp > 0.68 ? 'other' : temp < 0.3 ? 'other' : 'green';
      const tableKey = s.type + '-' + orbitClass;
      const spice = gas ? null : r.weighted(SPICE_TABLE[tableKey] ?? SPICE_TABLE['yellow-green'], (e) => e[1])[0];
      const ts = tScoreOf(atm, temp);
      out.push({
        idx: i, starId: s.id,
        name: r.chance(0.55) ? `${s.name} ${ROMAN[i]}` : planetName(r),
        seed: r.seedInt(), kind: gas ? 'gas' : 'rocky', orbit,
        phase: r.range(0, TAU), speed: (14 / orbit) * (r.chance(0.5) ? 1 : 0.8),
        size: gas ? r.range(64, 92) : r.range(24, 48),
        atm, temp, spice, richness: r.range(0.6, 1.6),
        rings: gas ? r.chance(0.5) : r.chance(0.06), moons: r.int(0, gas ? 3 : 1),
        life: !gas && !s.hollow && ts >= 1,
        hue: r.range(0, 360),
      });
    }
    // Empire homeworlds and Hollow strongholds
    const emp = this.empireHomes.get(s.id);
    if (emp) {
      let best = out.find((p) => p.kind === 'rocky');
      if (!best) {
        best = out[0];
        best.kind = 'rocky'; best.size = 44; best.rings = false;
      }
      best.atm = 0.5 + r.range(-0.06, 0.06); best.temp = 0.5 + r.range(-0.06, 0.06);
      best.life = true; best.feature = 'empire-home';
      if (!best.spice) best.spice = 'yellow';
    }
    if (s.hollow && out.length) {
      const ci = this.colonyIdxOf(out);
      if (ci >= 0) out[ci].feature = 'hollow';
    }
    // Story sites: wrecks and ruins on a few worlds
    if (!s.hollow && !emp && out.length && r.chance(0.06)) {
      const p = r.pick(out.filter((q) => q.kind === 'rocky'));
      if (p) p.feature = r.chance(0.5) ? 'wreck' : 'ruin';
    }
    return out;
  }

  private colonyIdxOf(ps: Planet[]): number {
    let best = -1, bs = -1;
    for (const p of ps) {
      if (p.kind === 'gas') continue;
      const sc = (p.spice ? 5 : 0) + p.richness;
      if (sc > bs) { bs = sc; best = p.idx; }
    }
    return best;
  }

  private homePlanets(s: Star, r: RNG): Planet[] {
    const mk = (i: number, o: Partial<Planet>): Planet => ({
      idx: i, starId: s.id, name: `${s.name} ${ROMAN[i]}`, seed: r.seedInt(), kind: 'rocky', orbit: 300 + i * 215,
      phase: r.range(0, TAU), speed: 14 / (300 + i * 215), size: 34, atm: 0.5, temp: 0.5, spice: null, richness: 1,
      rings: false, moons: 0, life: false, hue: r.range(0, 360), ...o,
    });
    return [
      mk(0, { atm: 0.04, temp: 0.86, size: 22, name: `${s.name} I` }),
      mk(1, { atm: 0.52, temp: 0.5, size: 46, spice: 'red', life: true, moons: 1, feature: 'home', richness: 0.8 }),
      mk(2, { atm: 0.3, temp: 0.34, size: 32, spice: 'yellow', life: true, feature: 'wreck', richness: 1.3, name: planetName(r) }),
      mk(3, { kind: 'gas', atm: 0.95, temp: 0.2, size: 82, rings: true, moons: 2 }),
      mk(4, { atm: 0.12, temp: 0.12, size: 26, spice: 'blue', richness: 1.1, name: planetName(r) }),
    ];
  }

  /** Call when an empire home is assigned (before planets of that star are generated). */
  markEmpireHome(star: number, empire: string) {
    this.empireHomes.set(star, empire);
    this.pcache.delete(star);
  }
  setHome(star: number) {
    this.homeStar = star;
    this.pcache.delete(star);
  }
}
