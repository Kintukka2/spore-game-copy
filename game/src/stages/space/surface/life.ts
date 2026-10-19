// Life on a landed world: herds of animals and patches of flora placed on land,
// with a simple wander / flee behaviour so creatures have to be found and caught.
import { RNG } from '../../../engine/rng';
import type { Design } from '../../../design/types';
import { NCOLS, NROWS, type Terrain } from '../../civ/terrain';
import { H, wdist, wdx, wrapX } from '../../civ/types';
import type { Specimen } from '../types';

export interface LifeSite {
  kind: 'herd' | 'flora';
  sp: Specimen;
  x: number;
  y: number;
  /** Shown on the minimap once seen on screen or picked up by a life scan. */
  seen: boolean;
  /** Flora only: plant offsets and whether its seeds were gathered this landing. */
  plants: { dx: number; dy: number; s: number }[];
  harvested: boolean;
}

export interface Critter {
  sp: Specimen;
  d: Design;
  site: LifeSite;
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  face: number;
  wait: number;
  /** Seconds left running from the ship. */
  panic: number;
  /** World height of the sprite. */
  size: number;
  /** Rare sightings bolt early and run fast. */
  skittish: boolean;
  /** 0..1 while held in the tractor beam. */
  lift: number;
  gone: boolean;
  phase: number;
}

const WALK = 24;
const RUN = 74;
const BOLT = 128;
const ROAM = 72;

/** Place herds (animals) and patches (plants) on land away from `avoid` points (cities). */
export function spawnLife(T: Terrain, species: Specimen[], seed: number, avoid: { x: number; y: number }[], designOf: (sp: Specimen) => Design | null): { sites: LifeSite[]; critters: Critter[] } {
  const r = new RNG(seed ^ 0x11fe);
  const cand: number[] = [];
  for (let c = 0; c < NCOLS * NROWS; c++) {
    if (!T.land[c] || T.coastDist[c] < 2) continue;
    const y = T.cellY(c);
    if (Math.min(y, H - y) < 280) continue;
    const x = T.cellX(c);
    if (avoid.some((a) => wdist(a.x, a.y, x, y) < 200)) continue;
    cand.push(c);
  }
  const sites: LifeSite[] = [];
  const critters: Critter[] = [];
  if (!cand.length) return { sites, critters };
  const place = (sp: Specimen, kind: LifeSite['kind']): LifeSite => {
    let best = cand[r.int(0, cand.length - 1)], bestD = -1;
    // Keep sites apart: best of a few random picks.
    for (let k = 0; k < 14; k++) {
      const c = cand[r.int(0, cand.length - 1)];
      const x = T.cellX(c), y = T.cellY(c);
      let d = Infinity;
      for (const s of sites) d = Math.min(d, wdist(s.x, s.y, x, y));
      if (d > bestD) { bestD = d; best = c; }
      if (d > 320) break;
    }
    const site: LifeSite = { kind, sp, x: T.cellX(best) + r.range(-10, 10), y: T.cellY(best) + r.range(-10, 10), seen: false, plants: [], harvested: false };
    sites.push(site);
    return site;
  };
  for (const sp of species) {
    if (sp.diet === 'plant') {
      for (let k = 0; k < 3; k++) {
        const s = place(sp, 'flora');
        const n = r.int(5, 8);
        for (let i = 0; i < n; i++) {
          const a = r.range(0, Math.PI * 2), d = r.range(0, 34);
          if (T.isLand(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.7)) s.plants.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, s: r.range(0.8, 1.2) });
        }
        if (!s.plants.length) s.plants.push({ dx: 0, dy: 0, s: 1 });
      }
    } else {
      const d = designOf(sp);
      if (!d) continue;
      for (let k = 0; k < (sp.rare ? 1 : 2); k++) {
        const s = place(sp, 'herd');
        const n = sp.hybrid || sp.rare ? 1 : r.int(3, 5);
        for (let i = 0; i < n; i++) {
          const x = wrapX(s.x + r.range(-30, 30)), y = s.y + r.range(-22, 22);
          critters.push({
            sp, d, site: s, x, y, tx: x, ty: y, vx: 0, vy: 0, face: r.chance(0.5) ? 1 : -1, wait: r.range(0, 3), panic: 0,
            size: sp.diet === 'herbivore' ? 24 : 29, skittish: !!sp.rare, lift: 0, gone: false, phase: r.range(0, 10),
          });
        }
      }
    }
  }
  return { sites, critters };
}

/** A clear patch of land far from `from` (for event finds like relics). */
export function farSpot(T: Terrain, seed: number, from: { x: number; y: number }): { x: number; y: number } | null {
  const r = new RNG(seed ^ 0x2e11c);
  let best: { x: number; y: number } | null = null, bd = -1;
  for (let k = 0; k < 600 && bd < 1400; k++) {
    const c = r.int(0, NCOLS * NROWS - 1);
    if (!T.land[c] || T.coastDist[c] < 2) continue;
    const x = T.cellX(c), y = T.cellY(c);
    if (Math.min(y, H - y) < 280) continue;
    const d = wdist(x, y, from.x, from.y);
    if (d > bd) { bd = d; best = { x, y }; }
  }
  return best;
}

/** One step of a creature's life. `threat` is the ship's ground point and whether it is spooking animals. */
export function stepCritter(c: Critter, dt: number, T: Terrain, threat: { x: number; y: number; scary: boolean }) {
  if (c.gone || c.lift > 0) return;
  c.phase += dt;
  const dShip = wdist(c.x, c.y, threat.x, threat.y);
  if (threat.scary && dShip < 125 || c.skittish && dShip < 230) c.panic = c.skittish ? 2.2 : 1.4;
  let sp = 0, dx = 0, dy = 0;
  if (c.panic > 0) {
    c.panic -= dt;
    dx = -wdx(c.x, threat.x); dy = c.y - threat.y;
    sp = c.skittish ? BOLT : RUN;
  } else if (c.wait > 0) {
    c.wait -= dt;
  } else {
    dx = wdx(c.x, c.tx); dy = c.ty - c.y;
    if (Math.hypot(dx, dy) < 4) {
      c.wait = 1 + Math.random() * 3.5;
      // Next stroll: somewhere near the herd's grazing ground.
      for (let k = 0; k < 6; k++) {
        const tx = wrapX(c.site.x + (Math.random() - 0.5) * ROAM * 2), ty = c.site.y + (Math.random() - 0.5) * ROAM * 1.4;
        if (T.canStand('land', tx, ty)) { c.tx = tx; c.ty = ty; break; }
      }
      dx = dy = 0;
    } else sp = WALK;
  }
  const l = Math.hypot(dx, dy);
  if (sp > 0 && l > 0.001) {
    const vx = (dx / l) * sp, vy = (dy / l) * sp;
    const nx = wrapX(c.x + vx * dt), ny = c.y + vy * dt;
    if (T.canStand('land', nx, ny)) {
      c.x = nx; c.y = ny; c.vx = vx; c.vy = vy;
      if (Math.abs(vx) > 2) c.face = vx > 0 ? 1 : -1;
    } else {
      // Blocked by water: give up this direction.
      c.vx = c.vy = 0;
      c.tx = c.site.x; c.ty = c.site.y;
      if (c.panic > 0) c.panic = Math.min(c.panic, 0.2);
    }
  } else { c.vx = c.vy = 0; }
}
