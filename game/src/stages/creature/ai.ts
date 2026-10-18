// Creature AI: herds that wander, graze, flee, guard territory, get curious, raise babies;
// a following pack; Titans; and a cheap update path for creatures far from the player.
import { clamp } from '../../engine/math';
import { audio } from '../../engine/audio';
import type { CreatureStage } from './stage';
import type { Critter } from './types';
import { fireSpit, npcAttack, startDash, titanStomp, updateDash } from './combat';
import { isFighter } from './species';

const FAR = 1150;

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function steer(c: Critter, tx: number, ty: number, speed: number, dt: number, stop = 6): number {
  const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
  let vx = 0, vy = 0;
  if (d > stop) {
    const s = Math.min(speed, (d - stop) * 5 + 10);
    vx = (dx / d) * s;
    vy = (dy / d) * s;
  }
  const k = 1 - Math.exp(-9 * dt);
  c.vx += (vx - c.vx) * k;
  c.vy += (vy - c.vy) * k;
  return d;
}

export function brake(c: Critter, dt: number) {
  const k = 1 - Math.exp(-10 * dt);
  c.vx -= c.vx * k;
  c.vy -= c.vy * k;
}

function face(c: Critter, x: number) {
  if (Math.abs(x - c.x) > 4) c.facing = x > c.x ? 1 : -1;
}

export function setState(c: Critter, s: Critter['state']) {
  if (c.state !== s) { c.state = s; c.st = 0; }
}

function timers(S: CreatureStage, c: Critter, dt: number) {
  c.st += dt;
  if (c.flash > 0) c.flash -= dt;
  if (c.emoteT > 0) { c.emoteT -= dt; if (c.emoteT <= 0) c.emote = null; }
  if (c.hpShow > 0) c.hpShow -= dt;
  if (c.cd > 0) c.cd -= dt;
  if (c.cd2 > 0) c.cd2 -= dt;
  if (c.socialCd > 0) c.socialCd -= dt;
  if (c.lulled > 0) c.lulled -= dt;
  if (c.fear > 0) c.fear -= dt;
  if (c.aggro > 0) c.aggro -= dt;
  if (c.stun > 0) c.stun -= dt;
  if (c.action) { c.actT -= dt; if (c.actT <= 0) c.action = null; }
  if (c.role === 'baby') {
    c.grow -= dt;
    if (c.grow <= 0) {
      c.role = 'adult';
      c.size = c.sp.size;
      c.maxHp = Math.round(c.sp.hp);
      c.hp = Math.min(c.maxHp, c.hp * 2);
      c.r = Math.max(7, Math.min(95, c.sp.layout.width * c.size * 0.28));
      if (c.near) { S.say(c, '✨', 1.5); S.fx.burst('sparkle', c.x, c.y - 10, 8, { color: '#fff7c2', size: 5, speed: 40, life: 0.8, up: 40 }); }
    }
  }
  if (c.role === 'pack' && c.hp < c.maxHp && S.inCombat <= 0) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.02 * dt);
}

function integrate(S: CreatureStage, c: Critter, dt: number) {
  const w = S.world;
  let nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
  const h = w.hAt(nx, ny);
  const minH = c.role === 'pack' || c.role === 'titan' ? -0.04 : 0.012;
  if (h < minH) {
    nx = c.x; ny = c.y;
    c.vx *= -0.3; c.vy *= -0.3;
    if (c.state === 'wander') { c.wait = 0; c.state = 'idle'; }
  }
  c.x = nx; c.y = ny;
  if (c.role !== 'titan') w.pushOut(c, c.r * 0.45);
  const spd = Math.hypot(c.vx, c.vy);
  c.walk += (clamp(spd / 75, 0, 1) - c.walk) * Math.min(1, dt * 10);
  if (spd > 3) c.phase += dt * clamp(spd / (24 * c.size), 0.5, 4.5);
  if (Math.abs(c.vx) > 8) c.facing = c.vx > 0 ? 1 : -1;
}

function pickWander(S: CreatureStage, c: Critter) {
  for (let k = 0; k < 6; k++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * c.homeR;
    const x = c.homeX + Math.cos(a) * rr, y = c.homeY + Math.sin(a) * rr;
    if (S.world.hAt(x, y) > 0.03) { c.tx = x; c.ty = y; return; }
  }
  c.tx = c.homeX; c.ty = c.homeY;
}

function wander(S: CreatureStage, c: Critter, dt: number, spdK = 0.42) {
  if (c.state !== 'wander' && c.state !== 'idle' && c.state !== 'graze') {
    setState(c, 'wander');
    c.tx = c.homeX; c.ty = c.homeY;
  }
  if (c.state === 'idle' || c.state === 'graze') {
    brake(c, dt);
    c.wait -= dt;
    if (c.state === 'graze' && !c.action && Math.random() < dt * 1.5) { c.action = 'eat'; c.actT = c.actDur = 0.8; }
    if (c.wait <= 0) { pickWander(S, c); setState(c, 'wander'); }
    return;
  }
  const d = steer(c, c.tx, c.ty, c.sp.speed * spdK, dt, 8);
  if (d < 12 || c.st > 9) {
    setState(c, Math.random() < 0.45 && c.sp.diet !== 'carnivore' ? 'graze' : 'idle');
    c.wait = 1.5 + Math.random() * 3.5;
  }
}

function flee(S: CreatureStage, c: Critter, from: { x: number; y: number }, dt: number) {
  if (c.state !== 'flee') { setState(c, 'flee'); if (c.near && Math.random() < 0.6) S.say(c, '😱', 1.2); }
  let dx = c.x - from.x, dy = c.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  // Bend the escape route away from water.
  let tx = c.x + dx * 120, ty = c.y + dy * 120;
  for (let k = 0; k < 6 && S.world.hAt(tx, ty) < 0.03; k++) {
    const a = Math.atan2(dy, dx) + (k % 2 ? 1 : -1) * (0.6 + k * 0.4);
    tx = c.x + Math.cos(a) * 120; ty = c.y + Math.sin(a) * 120;
  }
  steer(c, tx, ty, c.sp.speed * 1.2, dt, 0);
}

/** Nearest member of the player's side (player or pack) to c. */
function nearestPlayerSide(S: CreatureStage, c: Critter): Critter {
  let best = S.player, bd = dist(c, S.player);
  for (const m of S.pack) {
    const d = dist(c, m);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

function fight(S: CreatureStage, c: Critter, target: Critter, dt: number, leash = true) {
  const d = dist(c, target);
  const nest = c.sp.nest;
  if (leash) {
    const homeD = Math.hypot(c.x - c.homeX, c.y - c.homeY);
    const max = c.sp.relation === 'hostile' || c.role === 'hunter' ? 900 : nest ? Math.max(360, nest.r * 2.4) : 700;
    if (d > 700 || homeD > max || target.state === 'abducted') {
      c.aggro = 0; c.target = null;
      setState(c, 'return');
      c.tx = c.homeX; c.ty = c.homeY;
      return;
    }
  }
  setState(c, 'chase');
  const st = c.sp.stats;
  const reach = c.r + target.r + 14;
  if ((st.charge ?? 0) >= 1 && d > 90 && d < 240 && c.cd2 <= 0 && target.z < 20) {
    c.cd2 = 7 + Math.random() * 3;
    startDash(S, c, target);
    return;
  }
  if ((st.spit ?? 0) >= 1 && d > 120 && d < 320 && c.cd2 <= 0) {
    c.cd2 = 5 + Math.random() * 2;
    fireSpit(S, c, target, 1 + (st.spit ?? 1) * 1.2, 0.6 + (st.spit ?? 1) * 0.4);
  }
  if (d > reach) {
    steer(c, target.x, target.y, c.sp.speed * (c.role === 'pack' ? 1.25 : 1.02), dt, 0);
  } else {
    brake(c, dt);
    face(c, target.x);
    if (c.cd <= 0) {
      c.cd = Math.max(0.7, 1.35 - c.sp.level * 0.08);
      npcAttack(S, c, target);
    }
  }
}

function thinkNpc(S: CreatureStage, c: Critter, dt: number) {
  const sp = c.sp, rel = sp.relation, p = S.player;
  const pd = dist(c, p);
  if (S.social.target === c) {
    setState(c, 'social');
    brake(c, dt);
    face(c, p.x);
    return;
  }
  if (c.state === 'cheer') {
    brake(c, dt);
    if (!c.action) { c.action = 'dance'; c.actT = c.actDur = 1; }
    if (c.st > 2.6) setState(c, 'idle');
    return;
  }
  if (c.lulled > 0) {
    setState(c, 'lulled');
    c.aggro = 0; c.target = null;
    brake(c, dt);
    if (!c.emote && Math.random() < dt) S.say(c, '💤', 1.4);
    return;
  }
  if (c.fear > 0 || (rel === 'afraid' && pd < 230 && S.playerAlive && !c.befriended)) {
    flee(S, c, p, dt);
    return;
  }
  if (c.aggro > 0 && c.target && !c.target.gone && c.target.hp > 0 && !c.befriended && S.playerAlive) {
    fight(S, c, c.target, dt);
    return;
  }
  c.target = null;
  if (c.state === 'return') {
    const d = steer(c, c.homeX, c.homeY, sp.speed * 0.6, dt, 30);
    if (d < 40 || c.st > 15) setState(c, 'idle');
    return;
  }
  const fighter = isFighter(sp);
  if (S.playerAlive && !c.befriended && c.role !== 'baby') {
    if (rel === 'hostile' && fighter && pd < 230 + sp.level * 25) {
      c.target = nearestPlayerSide(S, c);
      c.aggro = 7;
      S.say(c, '💢', 1.2);
      if (c.near) audio.sfx('roar', { pitch: 1.6 + Math.random() * 0.3, vol: 0.25 });
      S.alertAttacked(c);
      fight(S, c, c.target, dt);
      return;
    }
    if (rel === 'annoyed' && fighter && sp.nest && Math.hypot(p.x - sp.nest.x, p.y - sp.nest.y) < sp.nest.r && pd < 210) {
      if (c.state !== 'warn') { setState(c, 'warn'); S.say(c, '😠', 1.6); }
      brake(c, dt);
      face(c, p.x);
      if (c.st > 1.5) { c.target = nearestPlayerSide(S, c); c.aggro = 5; }
      return;
    }
    if (c.state === 'warn') setState(c, 'idle');
    if (rel === 'curious' && pd < 250) {
      if (c.state !== 'curious' && c.socialCd <= 0 && Math.random() < dt * 0.35) { setState(c, 'curious'); S.say(c, '❓', 1.5); }
      if (c.state === 'curious') {
        const a = Math.atan2(c.y - p.y, c.x - p.x);
        steer(c, p.x + Math.cos(a) * (70 + p.r), p.y + Math.sin(a) * (50 + p.r * 0.5), sp.speed * 0.6, dt, 10);
        face(c, p.x);
        if (c.st > 6) { setState(c, 'idle'); c.wait = 2; c.socialCd = 10; }
        return;
      }
    }
    if ((rel === 'friendly' || rel === 'allied') && pd < 150 && Math.random() < dt * 0.1) S.say(c, rel === 'allied' ? '💚' : '👋', 1.2);
  } else if (c.befriended && pd < 140 && Math.random() < dt * 0.08) S.say(c, '❤️', 1.2);
  if (c.role === 'baby' && c.parent && !c.parent.gone) {
    const pr = c.parent;
    const d = dist(c, pr);
    if (d > 45) steer(c, pr.x - pr.facing * 30, pr.y + 8, sp.speed * 0.8, dt, 10);
    else brake(c, dt);
    if (d <= 45 && Math.abs(pr.vx) < 2) face(c, pr.x);
    return;
  }
  wander(S, c, dt, c.role === 'loner' || c.role === 'hunter' ? 0.5 : 0.42);
}

function thinkPack(S: CreatureStage, c: Critter, dt: number) {
  const p = S.player;
  if (!S.playerAlive) { brake(c, dt); return; }
  const pd = dist(c, p);
  if (pd > 700) {
    const a = Math.random() * Math.PI * 2;
    c.x = p.x + Math.cos(a) * 80; c.y = p.y + Math.sin(a) * 50;
    c.vx = c.vy = 0;
  }
  // Defend the player and join their fights.
  let enemy: Critter | null = null;
  if (S.target && !S.target.gone && S.isEnemy(S.target) && S.inCombat > 0 && dist(S.target, p) < 500) enemy = S.target;
  if (!enemy) {
    let bd = 420;
    for (const o of S.critters) {
      if (o.gone || o.aggro <= 0 || !o.target || !S.isPlayerSide(o.target)) continue;
      const d = dist(o, c);
      if (d < bd) { bd = d; enemy = o; }
    }
  }
  if (enemy) { fight(S, c, enemy, dt, false); return; }
  setState(c, 'follow');
  const slot = S.pack.indexOf(c);
  const back = -(p.facing || 1);
  const tx = p.x + back * (p.r + c.r + 30 + slot * 22), ty = p.y + (slot - 1) * 34 + 6;
  const d = Math.hypot(tx - c.x, ty - c.y);
  const speed = Math.max(c.sp.speed, S.playerSpeed()) * (d > 140 ? 1.35 : 1);
  steer(c, tx, ty, speed, dt, 10);
  if (d < 20 && Math.abs(p.vx) < 5) face(c, p.x);
}

function thinkTitan(S: CreatureStage, c: Critter, dt: number) {
  const p = S.player;
  const pd = dist(c, p);
  const homeD = Math.hypot(c.x - c.homeX, c.y - c.homeY);
  if (pd < 700) S.titanSeen(c);
  if (S.playerAlive && pd < 340 && homeD < 950 && c.aggro <= 0) {
    c.target = nearestPlayerSide(S, c);
    c.aggro = 5;
    audio.sfx('roar', { pitch: 0.5, vol: 0.8 });
    S.fx.shake(6);
    S.say(c, '💢', 1.5);
  }
  if (c.aggro > 0 && c.target && !c.target.gone && S.playerAlive) {
    const t = c.target;
    const d = dist(c, t);
    if (d > 800 || homeD > 1100) { c.aggro = 0; c.target = null; return; }
    c.aggro = Math.max(c.aggro, 1.5);
    setState(c, 'chase');
    const reach = c.r * 0.9 + t.r + 26;
    if (d > reach) steer(c, t.x, t.y, Math.min(66, c.sp.speed), dt, 0);
    else {
      brake(c, dt);
      face(c, t.x);
      if (c.cd <= 0) { c.cd = 2.6; titanStomp(S, c); }
    }
    return;
  }
  if (c.state === 'chase') { setState(c, 'wander'); c.tx = c.homeX; c.ty = c.homeY; }
  wander(S, c, dt, 0.3);
}

function thinkKin(S: CreatureStage, c: Critter, dt: number) {
  if (c.role === 'mate') {
    brake(c, dt);
    face(c, S.player.x);
    if (!c.emote || c.emoteT < 0.2) S.say(c, '💕', 1.5);
    if (Math.random() < dt * 2.5) S.fx.spawn('emoji', c.x + (Math.random() - 0.5) * 30, c.y - c.sp.layout.height * c.size, { emoji: '💗', size: 14, vz: 30, life: 1.4 });
    return;
  }
  const mt = S.migrating ? S.migTarget() : null;
  if (mt) {
    c.homeX = mt.x; c.homeY = mt.y; c.homeR = 90;
    if (Math.hypot(c.x - mt.x, c.y - mt.y) > 120) {
      setState(c, 'migrate');
      steer(c, mt.x, mt.y, c.sp.speed * 0.55, dt, 20);
      return;
    }
  }
  if (S.playerAlive && dist(c, S.player) < 120 && Math.random() < dt * 0.06) S.say(c, '😊', 1.2);
  wander(S, c, dt, 0.35);
}

function farThink(S: CreatureStage, c: Critter, dt: number) {
  if (c.state !== 'wander' && c.state !== 'idle' && c.state !== 'graze' && c.state !== 'migrate') {
    c.state = 'idle'; c.wait = 1;
    c.aggro = 0; c.target = null; c.fear = 0;
  }
  c.vx = c.vy = 0;
  if (c.role === 'kin' && S.migrating) {
    const mt = S.migTarget();
    if (mt) {
      c.homeX = mt.x; c.homeY = mt.y;
      const dx = mt.x - c.x, dy = mt.y - c.y, d = Math.hypot(dx, dy);
      if (d > 60) { const s = Math.min(d, c.sp.speed * 0.6 * dt); c.x += (dx / d) * s; c.y += (dy / d) * s; return; }
    }
  }
  if (c.state === 'idle' || c.state === 'graze') {
    c.wait -= dt;
    if (c.wait <= 0) { pickWander(S, c); c.state = 'wander'; c.st = 0; }
    return;
  }
  const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
  if (d < 10) { c.state = 'idle'; c.wait = 2 + Math.random() * 4; return; }
  const s = Math.min(d, c.sp.speed * 0.4 * dt);
  const nx = c.x + (dx / d) * s, ny = c.y + (dy / d) * s;
  if (S.world.hAt(nx, ny) > 0.012) { c.x = nx; c.y = ny; c.facing = dx > 0 ? 1 : -1; }
  else { c.state = 'idle'; c.wait = 1; }
}

function animStates(S: CreatureStage, c: Critter, dt: number) {
  c.anim += dt;
  if (c.state === 'ascend') {
    c.z += dt * 50;
    c.vx = c.vy = 0;
    if (Math.random() < dt * 20) S.fx.spawn('sparkle', c.x + (Math.random() - 0.5) * c.r * 2, c.y - c.z - Math.random() * 30, { color: '#fff3b0', size: 5, life: 0.7, up: 30 });
    if (c.anim > 1.6) c.gone = true;
  }
  // Abduction is driven by the UFO event.
}

export function updateAI(S: CreatureStage, dt: number) {
  const p = S.player;
  for (const c of S.critters) {
    if (c.gone || c === p) continue;
    timers(S, c, dt);
    if (c.state === 'ascend' || c.state === 'abducted') { animStates(S, c, dt); continue; }
    const dx = c.x - p.x, dy = c.y - p.y;
    const far = c.role !== 'pack' && c.role !== 'mate' && dx * dx + dy * dy > FAR * FAR;
    c.near = !far;
    if (far) {
      c.tick += dt;
      if (c.tick >= 0.3) { farThink(S, c, c.tick); c.tick = 0; }
      continue;
    }
    if (c.dash > 0) { updateDash(S, c, dt); continue; }
    if (c.stun > 0) {
      brake(c, dt);
      if (!c.emote && Math.random() < dt * 2) S.say(c, '💫', 0.8);
      integrate(S, c, dt);
      continue;
    }
    switch (c.role) {
      case 'pack': thinkPack(S, c, dt); break;
      case 'titan': thinkTitan(S, c, dt); break;
      case 'kin': case 'mate': thinkKin(S, c, dt); break;
      default: thinkNpc(S, c, dt);
    }
    integrate(S, c, dt);
  }
  separate(S);
}

/** Soft separation so herds don't stack on top of each other. */
function separate(S: CreatureStage) {
  const cs = S.critters;
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i];
    if (a.gone || !a.near || a.z > 10 || a.state === 'ascend' || a.state === 'abducted') continue;
    for (let j = i + 1; j < cs.length; j++) {
      const b = cs[j];
      if (b.gone || !b.near || b.z > 10 || b.state === 'ascend' || b.state === 'abducted') continue;
      const dx = b.x - a.x, dy = (b.y - a.y) * 1.6;
      const min = (a.r + b.r) * 0.55;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.5;
      const ux = dx / d, uy = dy / d / 1.6;
      const wa = a.role === 'titan' ? 0.05 : b.role === 'titan' ? 0.95 : a === S.player ? 0.25 : b === S.player ? 0.75 : 0.5;
      a.x -= ux * push * wa; a.y -= uy * push * wa;
      b.x += ux * push * (1 - wa); b.y += uy * push * (1 - wa);
    }
  }
}
