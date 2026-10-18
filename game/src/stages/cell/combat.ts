// Damage rules. Jaws bite what is in front of them, spikes hurt whatever they ram, a proboscis
// latches on and drains, poison sacs leave a toxic trail, electric nodes zap everything nearby.
// Damage depends on the size class of the victim relative to the attacker.
import { wrapAngle } from '../../engine/math';
import { audio } from '../../engine/audio';
import { FOOD_DNA, sizeClass, type SizeClass } from './config';
import { bodyR, bodyX, bodyY, mouthPos, type Cell } from './entities';
import type { World } from './world';

// Player attacks, per victim class (NPC hp is 6 x difficulty; giants 30).
const P_BITE: Record<SizeClass, number> = { prey: 99, peer: 3, predator: 1.5, giant: 0 };
const P_RAM: Record<SizeClass, number> = { prey: 6, peer: 3, predator: 3, giant: 2.6 };
const P_POISON: Record<SizeClass, number> = { prey: 6, peer: 3, predator: 1.5, giant: 1.1 };
const P_SHOCK: Record<SizeClass, number> = { prey: 6, peer: 3, predator: 2, giant: 2.2 };
// NPC attacks on the player (health is 100), per attacker class.
const N_BITE: Record<SizeClass, number> = { prey: 6, peer: 20, predator: 45, giant: 100 };
const N_RAM: Record<SizeClass, number> = { prey: 5, peer: 14, predator: 30, giant: 60 };

const DRAIN_TICK = 0.45;

function sameKind(a: Cell, b: Cell): boolean {
  return a.design === b.design;
}

/** Class of `vic` as seen by `att`. */
function classOf(att: Cell, vic: Cell): SizeClass {
  return sizeClass(vic.size / att.size, vic.giant);
}

export function damageNpc(w: World, vic: Cell, amount: number, src: Cell | null, how: string) {
  if (vic.dead || amount <= 0) return;
  vic.hp -= amount;
  vic.flash = 1;
  vic.flashColor = how === 'poison' ? '#9dff5a' : how === 'shock' ? '#bfeaff' : '#ffffff';
  vic.showHpT = 2.5;
  if (src) { vic.hurtBy = src; vic.hurtT = 5; }
  if (vic.hp <= 0) w.killNpc(vic, src === w.player, how);
}

function hurtPlayer(w: World, att: Cell | null, amount: number, how: 'bite' | 'ram' | 'poison' | 'shock' | 'drain') {
  if (w.graceT > 0) return;
  w.host.playerHurt(amount * w.host.tune.damageTaken, att, how);
}

/** One attacker → victim interaction while touching. */
function tryAttack(w: World, att: Cell, vic: Cell, rv: number) {
  const p = w.player;
  if (sameKind(att, vic)) return;
  const isP = att === p, vicP = vic === p;
  if (vicP && (p.invuln > 0 || w.playerHidden())) return;
  if (!isP && !vicP) {
    // NPC vs NPC: only fight your target (or whoever hurt you).
    if (att.target !== vic && att.hurtBy !== vic && att.latched !== vic) return;
  }
  if (!isP && vicP && att.target !== p && !(att.hurtBy === p && att.hurtT > 0)) return;
  const vx = bodyX(vic), vy = bodyY(vic), vr = bodyR(vic);
  // ---- mouth
  if (att.biteCd <= 0 && (att.ab.bite > 0 || att.ab.drain > 0)) {
    const m = mouthPos(att);
    const reach = vr + att.ab.radius * att.size * 0.45;
    if ((m.x - vx) ** 2 + (m.y - vy) ** 2 < reach * reach) {
      const cls = classOf(att, vic);
      if (att.ab.bite > 0 || cls === 'prey') {
        att.biteCd = 0.5;
        att.biteAnim = 1;
        if (cls === 'prey' && !vicP && !vic.giant) {
          w.swallow(att, vic);
          return;
        }
        if (isP) {
          const dmg = P_BITE[cls] * (0.7 + 0.3 * att.ab.bite) * w.host.tune.playerDamage;
          if (dmg <= 0) {
            w.host.fx.popup(vx, vy - vr, 'Too big!', '#ffd0c0');
            audio.sfx('error', { vol: 0.5 });
            att.biteCd = 1.2;
          } else {
            damageNpc(w, vic, dmg, att, 'bite');
            w.host.sfxAt('chomp', vx, vy);
            w.host.fx.burst(m.x, m.y, 6, '#ffd7d0', 40 * att.size, 1.4 * att.size, 'dot', 0.4);
            vic.vx += (vx - att.x) * 0.8; vic.vy += (vy - att.y) * 0.8;
          }
        } else if (vicP) {
          const ncls = sizeClass(att.size / p.size, att.giant);
          hurtPlayer(w, att, N_BITE[ncls], 'bite');
          w.host.sfxAt('chomp', vx, vy, { pitch: 0.7 });
          // A hunter that landed a bite backs off for a moment.
          att.state = 'sated';
          att.stateT = att.giant ? 2.5 : 1.2;
          att.calmT = 1.5;
        } else {
          damageNpc(w, vic, 2.4 * (att.size / vic.size >= 1.4 ? 2 : 1), att, 'bite');
        }
        return;
      }
      // Proboscis latches onto peers and bigger.
      if (att.ab.drain > 0 && !att.latched && cls !== 'giant') {
        att.latched = vic;
        att.drainT = DRAIN_TICK;
        att.biteAnim = 1;
        if (!isP) { att.state = 'drain'; }
        w.host.sfxAt('spit', vx, vy, { pitch: 1.6 });
        return;
      }
    }
  }
  // ---- spikes (ram)
  if (att.ab.spikes > 0 && att.ramCd <= 0 && rv > 14 * att.size) {
    const ang = wrapAngle(Math.atan2(vy - bodyY(att), vx - bodyX(att)) - att.angle);
    let hit = false;
    for (const sd of att.ab.spikeDirs) if (Math.abs(wrapAngle(ang - sd)) < 0.85) { hit = true; break; }
    if (!hit) return;
    att.ramCd = 0.55;
    // Two spikes clashing cancel out.
    if (vic.ab.spikes > 0) {
      const back = wrapAngle(Math.atan2(att.y - vic.y, att.x - vic.x) - vic.angle);
      for (const sd of vic.ab.spikeDirs) if (Math.abs(wrapAngle(back - sd)) < 0.7) {
        w.host.sfxAt('hit', vx, vy, { pitch: 1.8, vol: 0.5 });
        w.host.fx.burst((vx + att.x) / 2, (vy + att.y) / 2, 5, '#fff7d6', 50 * att.size, 1.2 * att.size, 'spark', 0.3);
        return;
      }
    }
    const k = 1 + 0.35 * (att.ab.spikes - 1);
    if (isP) damageNpc(w, vic, P_RAM[classOf(att, vic)] * k * w.host.tune.playerDamage, att, 'ram');
    else if (vicP) hurtPlayer(w, att, N_RAM[sizeClass(att.size / p.size, att.giant)] * k, 'ram');
    else damageNpc(w, vic, 2 * k, att, 'ram');
    w.host.sfxAt('hit', vx, vy);
    w.host.fx.burst(vx, vy, 8, '#fff2c0', 70 * att.size, 1.3 * att.size, 'spark', 0.35);
    // Knock the victim back.
    const nx = vx - att.x, ny = vy - att.y, nl = Math.hypot(nx, ny) || 1;
    const push = 90 * att.size * Math.min(2, att.size / vic.size);
    vic.vx += (nx / nl) * push; vic.vy += (ny / nl) * push;
  }
}

/** Pairwise contacts: soft separation plus attacks. */
export function resolveContacts(w: World, dt: number) {
  const list = w.contactList();
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    const ax = bodyX(a), ay = bodyY(a), ar = bodyR(a);
    const aReach = ar + a.ab.mouthX * a.size;
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      const bx = bodyX(b), by = bodyY(b), br = bodyR(b);
      const dx = bx - ax, dy = by - ay;
      const lim = Math.max(aReach, br + b.ab.mouthX * b.size) + Math.min(ar, br);
      if (Math.abs(dx) > lim + br || Math.abs(dy) > lim + br) continue;
      const d = Math.hypot(dx, dy) || 0.001;
      const nx = dx / d, ny = dy / d;
      const overlap = ar + br - d;
      // Closing speed along the contact normal (positive = approaching).
      const rv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (overlap > 0) {
        const ma = a.size * a.size * (a.giant ? 6 : 1), mb = b.size * b.size * (b.giant ? 6 : 1);
        const k = Math.min(1, dt * 14) * overlap;
        const fa = mb / (ma + mb), fb = ma / (ma + mb);
        a.x -= nx * k * fa; a.y -= ny * k * fa;
        b.x += nx * k * fb; b.y += ny * k * fb;
        if (rv > 0) {
          a.vx -= nx * rv * fa * 0.6; a.vy -= ny * rv * fa * 0.6;
          b.vx += nx * rv * fb * 0.6; b.vy += ny * rv * fb * 0.6;
        }
      }
      if (d < ar + br + Math.max(a.ab.radius * a.size, b.ab.radius * b.size) * 0.9 + 2) {
        tryAttack(w, a, b, rv);
        if (!b.dead && !a.dead) tryAttack(w, b, a, -rv);
      }
    }
  }
  // Proboscis drains in progress.
  for (const c of list) if (c.latched) updateDrain(w, c, dt);
}

function updateDrain(w: World, c: Cell, dt: number) {
  const v = c.latched!;
  const p = w.player;
  const m = mouthPos(c);
  const vx = bodyX(v), vy = bodyY(v), reach = bodyR(v) + c.ab.radius * c.size * 0.9;
  if (v.dead || (m.x - vx) ** 2 + (m.y - vy) ** 2 > reach * reach || (v === p && w.playerHidden())) {
    c.latched = null;
    if (c.npc) { c.state = 'sated'; c.stateT = 1.5; }
    return;
  }
  // Pinned victims are slowed.
  v.vx *= Math.exp(-2.5 * dt); v.vy *= Math.exp(-2.5 * dt);
  c.biteAnim = Math.max(c.biteAnim, 0.6);
  c.drainT -= dt;
  if (c.drainT > 0) return;
  c.drainT = DRAIN_TICK;
  const cls = classOf(c, v);
  if (c === p) {
    const dmg = (cls === 'predator' ? 0.6 : 1) * w.host.tune.playerDamage;
    v.drainCount++;
    if (v.drainCount <= 3) w.host.playerEats('meat', FOOD_DNA.drain, vx, vy, null);
    damageNpc(w, v, dmg, c, 'drain');
    w.host.fx.burst(m.x, m.y, 4, '#ff8f8f', 25 * c.size, 1.1 * c.size, 'dot', 0.4);
  } else if (v === p) {
    hurtPlayer(w, c, 7, 'drain');
  } else {
    damageNpc(w, v, 1, c, 'drain');
  }
}

/** Poison clouds hurt everything without a poison sac. */
export function updatePoison(w: World, dt: number) {
  const p = w.player;
  const list = w.contactList();
  for (const c of list) {
    if (c.ab.poison > 0) continue;
    const cx = bodyX(c), cy = bodyY(c), cr = bodyR(c);
    let mine = 0, theirs = 0;
    for (const f of w.puffs) {
      if (f.dead || f.owner === c || f.owner.design === c.design) continue;
      const rr = f.r + cr;
      const dx = f.x - cx, dy = f.y - cy;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (f.owner === p) mine = 1; else theirs = 1;
    }
    if (!mine && !theirs) continue;
    if (c === p) {
      if (theirs && p.invuln <= 0 && !w.playerHidden()) hurtPlayer(w, null, 13 * dt, 'poison');
    } else {
      if (mine) damageNpc(w, c, P_POISON[classOf(p, c)] * w.host.tune.playerDamage * dt, p, 'poison');
      if (theirs) damageNpc(w, c, 2 * dt, null, 'poison');
      if (mine && c.state !== 'hunt') { c.hurtBy = p; c.hurtT = 3; }
    }
  }
}

/** Electric node discharge from `src`. */
export function electricPulse(w: World, src: Cell) {
  const p = w.player;
  const sx = bodyX(src), sy = bodyY(src);
  const R = bodyR(src) * (2.5 + 0.3 * (src.ab.electric - 1));
  let hits = 0;
  for (const c of w.contactList()) {
    if (c === src || c.ab.electric > 0 || sameKind(c, src)) continue;
    if (c === p && (p.invuln > 0 || w.playerHidden())) continue;
    const cx = bodyX(c), cy = bodyY(c);
    const rr = R + bodyR(c) * 0.6;
    if ((cx - sx) ** 2 + (cy - sy) ** 2 > rr * rr) continue;
    hits++;
    w.host.fx.arc(sx, sy, cx, cy);
    if (src === p) damageNpc(w, c, P_SHOCK[classOf(p, c)] * w.host.tune.playerDamage, p, 'shock');
    else if (c === p) hurtPlayer(w, src, 15, 'shock');
    else damageNpc(w, c, 2, src, 'shock');
  }
  w.host.fx.ring(sx, sy, bodyR(src), R, '#8fdcff', 0.45, 4);
  w.host.fx.burst(sx, sy, 8, '#c8f0ff', 80 * src.size, 1.2 * src.size, 'spark', 0.3);
  w.host.sfxAt('zap', sx, sy, { vol: hits ? 1 : 0.5 });
  return R;
}
