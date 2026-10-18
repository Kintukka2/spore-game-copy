// NPC cell brains. Behaviour depends on diet (filter grazers, jaw hunters, proboscis drainers),
// on size relative to the player and to each other (prey flee, peers graze or hunt, predators
// chase, giants hunt everything), and on difficulty (aggression, chase time, omnivore temper).
import { wrapAngle } from '../../engine/math';
import { sizeClass } from './config';
import { bodyR, type Cell, type Food } from './entities';
import type { World } from './world';

const THINK = 0.28;

/** True if `o` could hurt or eat `c`. */
function isThreatTo(w: World, o: Cell, c: Cell): boolean {
  const rel = o.size / c.size;
  const ab = o.ab;
  if (o === w.player) {
    if (w.playerHidden()) return false;
    const eats = (ab.bite > 0 || ab.drain > 0) && rel >= 1.35;
    const armed = (ab.spikes > 0 || ab.electric > 0) && rel >= 0.8;
    const toxic = ab.poison > 0 && rel >= 0.7 && c.ab.poison === 0;
    return eats || armed || toxic;
  }
  if (o.giant) return rel >= 1.25;
  if (o.diet === 'herbivore' && !(c.hurtBy === o && c.hurtT > 0)) return false;
  return (ab.bite > 0 || ab.drain > 0) && rel >= 1.3;
}

function canEatFood(c: Cell, f: Food): boolean {
  if (f.kind === 'egg') return c.ab.hasMouth;
  if (f.kind === 'plant') return c.ab.eatsPlants;
  return c.ab.eatsMeat;
}

/** Decide whether this NPC wants to hunt the player right now. */
function wantsPlayer(w: World, c: Cell): boolean {
  const p = w.player;
  if (w.playerHidden() || c.calmT > 0) return false;
  const tune = w.host.tune;
  const rel = c.size / p.size; // how big the NPC is relative to the player
  const cls = sizeClass(rel, c.giant);
  if (c.hurtBy === p && c.hurtT > 0 && (c.ab.bite > 0 || c.ab.drain > 0 || c.ab.spikes > 0)) return cls !== 'prey' || c.ab.spikes > 0;
  if (cls === 'prey' || w.graceT > 0) return false;
  if (!(c.ab.bite > 0 || c.ab.drain > 0 || c.giant)) return false;
  if (cls === 'giant') return true;
  if (c.diet === 'herbivore') return false;
  if (cls === 'predator') {
    const aggro = tune.omniTemper === 0 ? 0.45 : tune.omniTemper === 1 ? 0.85 : 1;
    if (c.diet === 'omnivore' && tune.omniTemper === 0) return false;
    return c.personality < aggro;
  }
  // Peers
  if (c.diet === 'omnivore') return tune.omniTemper >= 2 && c.personality < 0.7;
  return c.personality < tune.peerAggro;
}

export function npcThink(w: World, c: Cell) {
  const p = w.player;
  const per = Math.max(c.ab.radius * c.size * 7, w.viewR * 0.55);
  const per2 = per * per;
  // --- threats
  let threat: Cell | null = null, threatScore = 0;
  const herb = c.diet === 'herbivore' || c.brood;
  const fleeR2 = (herb ? per * 0.75 : per * 0.5) ** 2;
  const consider = (o: Cell) => {
    if (o === c || o.dead || o.emerge < 0.7) return;
    const dx = o.x - c.x, dy = o.y - c.y, d2 = dx * dx + dy * dy;
    if (d2 > fleeR2) return;
    const hurtMe = c.hurtBy === o && c.hurtT > 0;
    if (!hurtMe && !isThreatTo(w, o, c)) return;
    // Hunters are only scared of much bigger things (or things that hurt them).
    if (!herb && !hurtMe && o.size / c.size < 1.6 && !(o === p && p.ab.poison > 0 && c.ab.poison === 0)) return;
    // Retaliators stand their ground.
    if (hurtMe && c.ab.spikes > 0 && o.size / c.size < 1.6) return;
    const s = (o.size / c.size) / Math.sqrt(d2 + 1);
    if (s > threatScore) { threatScore = s; threat = o; }
  };
  for (const o of w.npcs) consider(o);
  consider(p);
  if (c.state === 'drain' && c.latched && !c.latched.dead) {
    if (threat && threat !== c.latched) { c.latched = null; } else return;
  }
  if (threat) {
    c.state = 'flee';
    c.target = threat;
    c.stateT = 1.2 + Math.random();
    return;
  }
  // --- retaliate / hunt the player
  const dP = Math.hypot(p.x - c.x, p.y - c.y);
  if (c.state === 'hunt' && c.target === p) {
    c.chaseT += THINK;
    if (c.chaseT > w.host.tune.chaseTime * (c.giant ? 1.4 : 1) || dP > per * 1.6 || w.playerHidden()) {
      c.state = 'wander';
      c.target = null;
      c.calmT = 4 + Math.random() * 4;
      c.chaseT = 0;
    } else return;
  }
  if (dP < (c.giant ? Math.max(bodyR(c) * 1.6, w.viewR * 0.5) : per * 0.85) && wantsPlayer(w, c)) {
    c.state = 'hunt';
    c.target = p;
    c.chaseT = 0;
    return;
  }
  // --- hunt other NPCs (carnivores and giants), drain (omnivores)
  if ((c.ab.bite > 0 || c.ab.drain > 0) && c.diet !== 'herbivore' && (c.state !== 'sated')) {
    let best: Cell | null = null, bd = per2 * 0.5;
    for (const o of w.npcs) {
      if (o === c || o.dead || o.emerge < 1 || o.design === c.design || o.giant) continue;
      const rel = o.size / c.size;
      if (rel > (c.ab.drain > 0 ? 1.1 : 0.72)) continue;
      const d2 = (o.x - c.x) ** 2 + (o.y - c.y) ** 2;
      if (d2 < bd) { bd = d2; best = o; }
    }
    if (best && (c.giant || c.personality < 0.75)) {
      c.state = 'hunt';
      c.target = best;
      c.chaseT = 0;
      return;
    }
  }
  if (c.state === 'hunt' && c.target && (c.target as Cell).dead === false && c.target !== p) {
    c.chaseT += THINK;
    if (c.chaseT < 6) return;
  }
  // --- graze
  let food: Food | null = null, fd = per2;
  for (const f of w.foods) {
    if (f.dead || f.pop < 1 || !canEatFood(c, f)) continue;
    const d2 = (f.x - c.x) ** 2 + (f.y - c.y) ** 2;
    if (d2 < fd) { fd = d2; food = f; }
  }
  if (food && c.state !== 'sated') {
    c.state = 'graze';
    c.target = food;
    return;
  }
  if (c.state === 'sated' && c.stateT > 0) return;
  c.state = 'wander';
  c.target = null;
}

/** Per-frame steering from the current state. Sets steerX/Y and throttle. */
export function npcSteer(w: World, c: Cell, dt: number) {
  c.thinkT -= dt;
  c.stateT -= dt;
  c.calmT -= dt;
  c.hurtT -= dt;
  if (c.thinkT <= 0) { c.thinkT = THINK + Math.random() * 0.1; npcThink(w, c); }
  const p = w.player;
  switch (c.state) {
    case 'flee': {
      const t = c.target as Cell | null;
      if (!t || t.dead || c.stateT <= 0) { c.state = 'wander'; break; }
      let dx = c.x - t.x, dy = c.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      // Zig-zag a little so fleeing looks panicked, and drift back toward the action area.
      const j = Math.sin(c.t * 3 + c.personality * 10) * 0.35;
      const hx = (p.x - c.x), hy = (p.y - c.y), hd = Math.hypot(hx, hy) || 1;
      const home = hd > w.viewR * 1.6 && t !== p ? 0.4 : 0;
      c.steerX = dx - dy * j + (hx / hd) * home;
      c.steerY = dy + dx * j + (hy / hd) * home;
      c.throttle = 1;
      return;
    }
    case 'hunt':
    case 'retaliate': {
      const t = c.target as Cell | null;
      if (!t || t.dead || (t === p && w.playerHidden())) { c.state = 'wander'; c.target = null; break; }
      const lead = 0.35;
      c.steerX = t.x + t.vx * lead - c.x;
      c.steerY = t.y + t.vy * lead - c.y;
      c.throttle = 1;
      return;
    }
    case 'drain': {
      const t = c.latched;
      if (!t || t.dead) { c.state = 'sated'; c.stateT = 2; c.latched = null; break; }
      c.steerX = t.x - c.x;
      c.steerY = t.y - c.y;
      c.throttle = 0.5;
      return;
    }
    case 'graze': {
      const f = c.target as Food | null;
      if (!f || f.dead) { c.state = 'wander'; c.thinkT = 0; break; }
      c.steerX = f.x - c.x;
      c.steerY = f.y - c.y;
      c.throttle = 0.55;
      return;
    }
    case 'court':
      return;
    default:
      break;
  }
  // Wander / sated: lazy random walk that stays loosely near the player.
  c.wander += (Math.random() - 0.5) * dt * 2.2;
  let sx = Math.cos(c.wander), sy = Math.sin(c.wander);
  const hx = p.x - c.x, hy = p.y - c.y, hd = Math.hypot(hx, hy);
  if (hd > w.viewR * 1.4) {
    const k = Math.min(1, (hd - w.viewR * 1.4) / w.viewR);
    sx = sx * (1 - k) + (hx / hd) * k;
    sy = sy * (1 - k) + (hy / hd) * k;
    c.wander = Math.atan2(sy, sx);
  }
  c.steerX = sx;
  c.steerY = sy;
  c.throttle = c.state === 'sated' ? 0.22 : c.giant ? 0.4 : 0.32;
}

/** Angle difference helper used by combat (is `b` in front of `a`?). */
export function inFront(a: Cell, bx: number, by: number, cone: number): boolean {
  const ang = Math.atan2(by - a.y, bx - a.x);
  return Math.abs(wrapAngle(ang - a.angle)) < cone;
}
