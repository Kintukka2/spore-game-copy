// AI: rival tribes (economy, raids, thieves, gifts, defence), rival members, wildlife,
// pets, beasts charmed by the Beastmaster ability, and roaming Titans.
import { audio } from '../../engine/audio';
import { ui } from '../../engine/ui';
import { dist, lerp } from '../../engine/math';
import { PLAYER, WILD, WORLD, type Order, type Tribe, type Unit } from './types';
import type { TribalStage } from './stage';
import { attackStep, findNode, findPlayerFoe, goTo, isPlayerFoe, near, newUnit, nodeStand, slotOffset, statsOf, stopUnit, tickCommon, act } from './units';
import { P } from './fx';

export interface HerdState {
  x: number;
  y: number;
  kind: 'grazer' | 'hunter';
  dIdx: number;
  size: number;
  respawn: number;
}

export function spawnTribeMember(st: TribalStage, t: Tribe, chief: boolean): Unit {
  const door = st.tribeDoor(t);
  const a = Math.random() * Math.PI * 2;
  const u = st.spawnMember(t.id, door.x + Math.cos(a) * 46, door.y + 10 + Math.sin(a) * 24, { chief });
  u.hx = t.x;
  u.hy = t.y;
  return u;
}

export function spawnHerdMember(st: TribalStage, hd: HerdState): Unit {
  const a = Math.random() * Math.PI * 2;
  return st.spawnAnimal(hd.dIdx, hd.x + Math.cos(a) * 60, hd.y + Math.sin(a) * 40, hd.kind, st.herds.indexOf(hd));
}

// ------------------------------------------------------------------ tribes

function raidingTribes(st: TribalStage): number {
  const s = new Set<number>();
  for (const u of st.units) if (u.raid && !u.dead && u.order.type !== 'steal') s.add(u.team);
  return s.size;
}

function launchRaid(st: TribalStage, t: Tribe, size: number, thief: boolean): boolean {
  const avail = st.tribeMembers(t).filter((u) => !u.chief && !u.raid && u.age >= 1).sort((a, b) => b.hp - a.hp);
  const keep = thief ? 0 : 1;
  const n = Math.min(size, Math.max(0, avail.length - keep));
  if (n <= 0) return false;
  for (let i = 0; i < n; i++) {
    const u = avail[i];
    u.raid = true;
    u.slot = i;
    u.order = thief ? { type: 'steal', phase: 'go', t: 0 } : { type: 'idle' };
    u.bubble = thief ? '🥷' : '😠';
    u.bubbleT = 3;
  }
  // On hard, big raids are sometimes led by the chief.
  if (!thief && st.game.difficulty === 'hard' && t.rank >= 2 && Math.random() < 0.5) {
    const c = st.tribeMembers(t).find((u) => u.chief);
    if (c) { c.raid = true; c.order = { type: 'idle' }; c.slot = n; }
  }
  return true;
}

function sendPorter(st: TribalStage, t: Tribe, amount: number) {
  const door = st.tribeDoor(t);
  const p = newUnit(st, { kind: 'porter', team: t.id, design: t.design, dIdx: t.id, x: door.x, y: door.y, hp: 999, speed: 110, chief: false, age: 1, scaleMul: 0.9 });
  p.order = { type: 'deliver', tribe: t.id, amount, toPlayer: true };
  p.carry = amount;
  p.carryKind = 'fruit';
  p.bubble = '🎁';
  p.bubbleT = 999;
  st.addUnit(p);
}

export function updateTribes(st: TribalStage, dt: number) {
  const g = st.game;
  const night = st.isNight > 0.5;
  for (const t of st.tribes) {
    t.concertCd -= dt;
    t.alarm -= dt;
    t.hitT -= dt;
    t.since += dt;
    if (t.burn > 0) {
      t.burn -= dt;
      if (t.state === 'active') {
        t.hutHp -= 5 * dt;
        if (t.hutHp <= 0) st.defeatTribe(t);
      }
    }
    if (t.state === 'allied') {
      t.giftT -= dt;
      if (t.giftT <= 0) { t.giftT = 45; sendPorter(st, t, 12); }
      continue;
    }
    if (t.state !== 'active') continue;
    // relationship drifts back toward the tribe's temperament (gifts wear off)
    const drift = g.diff(0.06, 0.1, 0.16) * dt;
    if (t.relation > t.base) t.relation = Math.max(t.base, t.relation - drift);
    else if (t.relation < t.base) t.relation = Math.min(t.base, t.relation + drift * 0.5);
    t.food += 0.35 * dt;
    if (t.alarm <= 0 && t.hutHp < t.hutMax && t.burn <= 0) t.hutHp = Math.min(t.hutMax, t.hutHp + 2 * dt);
    // population
    const members = st.tribeMembers(t);
    const regular = members.filter((u) => !u.chief).length;
    t.spawnT -= dt;
    if (regular < t.maxMembers - 1 && t.food >= 15 && t.spawnT <= 0) {
      t.food -= 15;
      t.spawnT = g.diff(32, 24, 15);
      spawnTribeMember(st, t, false);
    }
    if (!members.some((u) => u.chief)) {
      if (t.chiefT <= 0) t.chiefT = 60;
      t.chiefT -= dt;
      if (t.chiefT <= 0) spawnTribeMember(st, t, true);
    }
    if (st.concert?.tribe === t) continue;
    // raids, thieves, gifts
    t.raidT -= dt;
    t.thiefT -= dt;
    t.giftT -= dt;
    if (t.relation <= -50 && t.raidT <= 0 && !night && st.time > 30) {
      if (raidingTribes(st) < g.diff(1, 1, 2)) {
        const [lo, hi] = g.diff([2, 3], [3, 5], [4, 7]);
        const size = Math.round(lerp(lo, hi, t.rank / 3) + (t.rank === 3 && g.difficulty !== 'easy' ? 1 : 0));
        if (launchRaid(st, t, size, false)) t.raidT = g.diff(170, 115, 80) * (1 - t.rank * 0.07) * (0.85 + Math.random() * 0.3);
        else t.raidT = 20;
      } else t.raidT = 15;
    } else if (t.relation > -50 && t.relation <= -15 && t.thiefT <= 0 && !night) {
      launchRaid(st, t, g.difficulty === 'hard' ? 2 : 1, true);
      t.thiefT = g.diff(160, 110, 75);
    } else if (t.relation >= 25 && t.giftT <= 0) {
      sendPorter(st, t, 8);
      t.giftT = 75;
    }
  }
}

// ------------------------------------------------------------------ rival members

function rivalFoe(st: TribalStage, u: Unit, t: Tribe): Unit | null {
  let best: Unit | null = null, bd = Infinity;
  for (const a of st.units) {
    if (a.dead || a.kind === 'porter' || a.team === u.team || a.team >= 1) continue;
    const d = dist(a, u);
    if (d > 320) continue;
    let ok = false;
    if (a.team === PLAYER) {
      if (u.raid) ok = d < 150;
      else if (t.alarm > 0) ok = dist(a, t) < 380 && d < 300;
      else if (t.relation <= -50) ok = dist(a, t) < 230 && d < 220;
      if (!ok && u.aggroT > 0 && u.aggro === a.id) ok = d < 260;
    } else {
      ok = (a.wild !== 'grazer' && a.order.type === 'attack' && dist(a, t) < 300 && d < 200) || (u.aggroT > 0 && u.aggro === a.id && d < 260);
    }
    if (ok && d < bd) { bd = d; best = a; }
  }
  return best;
}

function backToDuty(u: Unit) {
  u.order = u.raid ? { type: 'idle' } : { type: 'home' };
}

export function watchPoint(t: Tribe, slot: number) {
  return { x: t.x + ((slot % 6) - 2.5) * 28, y: t.y + 72 + Math.floor(slot / 6) * 20 };
}

export function updateRival(st: TribalStage, u: Unit, dt: number) {
  tickCommon(st, u, dt);
  if (u.dead) return;
  const t = st.tribes[u.team - 1];
  if (t.state === 'defeated') {
    // Survivors flee the burning village and vanish.
    u.fear = (u.fear ?? 4) - dt;
    const dx = u.x - t.x, dy = u.y - t.y, d = Math.hypot(dx, dy) || 1;
    goTo(u, u.x + (dx / d) * 120, u.y + (dy / d) * 120, 1.4);
    if ((u.fear ?? 0) <= 0) { u.dead = true; u.dying = 1.2; u.fear = 1.2; }
    return;
  }
  if (u.stun > 0) { stopUnit(u); return; }
  if (t.state === 'allied') { alliedIdle(st, u, t, dt); return; }
  u.think -= dt;
  if (u.think <= 0) {
    u.think = 0.35 + Math.random() * 0.2;
    if (u.order.type !== 'attack') {
      const foe = rivalFoe(st, u, t);
      if (foe && !(u.order.type === 'steal' && u.order.phase === 'home' && !u.aggroT)) {
        u.resume = u.order.type === 'steal' ? u.order : null;
        u.order = { type: 'attack', target: foe.id };
        if (Math.random() < 0.3) { u.bubble = '😠'; u.bubbleT = 1.5; }
      }
    }
  }
  if (u.raid && u.hp < u.maxHp * 0.3 && u.order.type !== 'steal') {
    u.raid = false;
    u.order = { type: 'home' };
    u.bubble = '😱';
    u.bubbleT = 2;
  }
  const o = u.order;
  switch (o.type) {
    case 'attack': {
      const tg = st.byId.get(o.target);
      if (!tg || tg.dead || tg.team === u.team || (!u.raid && dist(tg, t) > 460) || (u.raid && dist(tg, u) > 300)) {
        if (u.resume) { u.order = u.resume; u.resume = null; } else backToDuty(u);
        break;
      }
      attackStep(st, u, tg, dt);
      break;
    }
    case 'steal': stealStep(st, u, t, o, dt); break;
    case 'gather': rivalGather(st, u, t, o, dt); break;
    case 'home': {
      const door = st.tribeDoor(t);
      const off = slotOffset(u.slot + 1, 26);
      goTo(u, door.x + off.x, door.y + 20 + off.y);
      if (near(u, door.x + off.x, door.y + 20 + off.y, 14)) { u.raid = false; u.order = { type: 'idle' }; stopUnit(u); }
      break;
    }
    case 'idle': rivalIdle(st, u, t, dt); break;
    default: u.order = { type: 'idle' };
  }
}

function stealStep(st: TribalStage, u: Unit, t: Tribe, o: Extract<Order, { type: 'steal' }>, dt: number) {
  const pile = st.home.pile;
  if (o.phase === 'go') {
    const off = slotOffset(u.slot, 16);
    goTo(u, pile.x + off.x, pile.y + 22 + off.y * 0.5);
    if (near(u, pile.x, pile.y, 44)) { o.phase = 'take'; o.t = 0; }
  } else if (o.phase === 'take') {
    stopUnit(u);
    if (!u.action) act(u, 'eat', 0.5);
    o.t += dt;
    if (o.t > 1.6) {
      const amt = Math.min(Math.floor(st.food), st.game.diff(6, 8, 10));
      if (amt > 0) {
        st.food -= amt;
        u.carry = amt;
        u.carryKind = 'fruit';
        st.fx.text(pile.x, pile.y - 30, `-${amt} 🍎`, '#ff8a80', true);
        audio.sfx('chomp');
        st.game.hint('thieves', 'Thieves steal from your food pile. Keep some members home, or use Snares and Fire Bombs.', '🥷');
      }
      o.phase = 'home';
    }
  } else {
    const door = st.tribeDoor(t);
    goTo(u, door.x, door.y + 16, 1.05);
    if (near(u, door.x, door.y + 16, 20)) {
      t.food += u.carry;
      u.carry = 0;
      u.raid = false;
      u.order = { type: 'idle' };
    }
  }
}

function rivalGather(st: TribalStage, u: Unit, t: Tribe, o: Extract<Order, { type: 'gather' }>, dt: number) {
  const n = st.nodeById.get(o.node);
  const door = st.tribeDoor(t);
  if (o.phase === 'return' || !n || n.amount < 1) {
    if (u.carry <= 0 && (!n || n.amount < 1)) { u.order = { type: 'idle' }; return; }
    o.phase = 'return';
    goTo(u, door.x, door.y + 14, 0.8);
    if (near(u, door.x, door.y + 14, 20)) { t.food += u.carry; u.carry = 0; u.order = { type: 'idle' }; }
    return;
  }
  const sp = nodeStand(n, u.slot + 3);
  if (o.phase === 'go') {
    goTo(u, sp.x, sp.y, 0.8);
    if (near(u, sp.x, sp.y, 10)) { o.phase = 'work'; o.t = 0; }
    return;
  }
  stopUnit(u);
  u.facing = n.x >= u.x ? 1 : -1;
  if (!u.action) act(u, 'eat', 0.6);
  o.t += dt;
  if (o.t > 1.1) {
    o.t = 0;
    n.amount -= 1;
    n.shake = 0.3;
    u.carry += 1;
    if (u.carry >= 4) o.phase = 'return';
  }
}

function rivalIdle(st: TribalStage, u: Unit, t: Tribe, dt: number) {
  if (u.raid) {
    const H = st.home;
    if (dist(u, H) > 240) {
      const off = slotOffset(u.slot, 26);
      goTo(u, H.x + off.x, H.y + 30 + off.y, 1);
    } else u.order = { type: 'steal', phase: 'go', t: 0 };
    return;
  }
  if (st.concert?.tribe === t) {
    const p = watchPoint(t, u.slot);
    goTo(u, p.x, p.y, 1);
    if (near(u, p.x, p.y, 8)) { stopUnit(u); u.facing = Math.sin(u.slot * 7) > 0 ? 1 : -1; }
    return;
  }
  if (st.isNight > 0.6) {
    const off = slotOffset(u.slot + 1, 24);
    goTo(u, t.x + off.x, t.y + 60 + off.y * 0.6, 0.5);
    if (near(u, u.gx, u.gy, 6)) {
      stopUnit(u);
      if (Math.random() < dt * 0.5 && st.cam.isVisible(u.x, u.y, 40)) st.fx.add(P.Zzz, u.x + 6, u.y - u.hgt * u.size, { vz: 16, vy: -4, life: 1.6, size: 14, icon: '💤' });
    }
    return;
  }
  if (u.gs === 0 && Math.random() < dt * 0.25) {
    if (Math.random() < 0.55) {
      const n = findNode(st, 'fruit', t.x, t.y, 340, undefined, t.id);
      if (n) { u.order = { type: 'gather', node: n.id, phase: 'go', t: 0 }; return; }
    }
    goTo(u, t.x + (Math.random() - 0.5) * 300, t.y + 50 + (Math.random() - 0.3) * 150, 0.45);
  } else if (u.gs > 0 && near(u, u.gx, u.gy, 4)) stopUnit(u);
}

function alliedIdle(st: TribalStage, u: Unit, t: Tribe, dt: number) {
  if (u.order.type === 'home') {
    const door = st.tribeDoor(t);
    goTo(u, door.x, door.y + 20);
    if (near(u, door.x, door.y + 20, 30)) u.order = { type: 'idle' };
    return;
  }
  u.order = { type: 'idle' };
  if (u.gs === 0 && Math.random() < dt * 0.2) goTo(u, t.x + (Math.random() - 0.5) * 260, t.y + 60 + (Math.random() - 0.3) * 130, 0.4);
  else if (u.gs > 0 && near(u, u.gx, u.gy, 4)) stopUnit(u);
  if (!u.action && Math.random() < dt * 0.08) act(u, 'dance', 1.4);
}

// ------------------------------------------------------------------ animals

export function updateAnimal(st: TribalStage, u: Unit, dt: number) {
  tickCommon(st, u, dt);
  if (u.dead) return;
  if (u.stun > 0) { stopUnit(u); return; }
  if (u.pet) { petBrain(st, u, dt); return; }
  if (u.charmed !== undefined) {
    u.charmed -= dt;
    if (u.charmed > 0) { charmBrain(st, u, dt); return; }
    u.charmed = undefined;
    u.team = WILD;
    u.order = { type: 'idle' };
    u.bubble = '❔';
    u.bubbleT = 1.5;
  }
  if (u.wild === 'titan') titanBrain(st, u, dt);
  else if (u.wild === 'hunter') hunterBrain(st, u, dt);
  else grazerBrain(st, u, dt);
}

function wanderAround(u: Unit, x: number, y: number, r: number, dt: number, speed = 0.4) {
  if (u.gs === 0 && Math.random() < dt * 0.3) goTo(u, x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 1.3, speed);
  else if (u.gs > 0 && near(u, u.gx, u.gy, 5)) stopUnit(u);
}

function strong(u: Unit): boolean {
  const s = statsOf(u.design);
  return Math.max(s.bite ?? 0, s.strike ?? 0, s.charge ?? 0) >= 3;
}

function grazerBrain(st: TribalStage, u: Unit, dt: number) {
  const hd = st.herds[u.herd ?? -1];
  const hx = hd?.x ?? u.hx ?? u.x, hy = hd?.y ?? u.hy ?? u.y;
  if (u.order.type === 'attack') {
    const tg = st.byId.get(u.order.target);
    if (!tg || tg.dead || dist(u, tg) > 220) { u.order = { type: 'idle' }; return; }
    attackStep(st, u, tg, dt);
    return;
  }
  if (u.aggroT > 0 && strong(u)) {
    const a = st.byId.get(u.aggro);
    if (a && !a.dead) { u.order = { type: 'attack', target: a.id }; return; }
  }
  if ((u.fear ?? 0) > 0) {
    u.fear! -= dt;
    const a = st.byId.get(u.aggro);
    if (a) {
      const dx = u.x - a.x, dy = u.y - a.y, d = Math.hypot(dx, dy) || 1;
      goTo(u, u.x + (dx / d) * 80, u.y + (dy / d) * 80, 1.35);
    }
    return;
  }
  wanderAround(u, hx, hy, 130, dt, 0.35);
}

function hunterBrain(st: TribalStage, u: Unit, dt: number) {
  const hd = st.herds[u.herd ?? -1];
  const hx = hd?.x ?? u.hx ?? u.x, hy = hd?.y ?? u.hy ?? u.y;
  u.think -= dt;
  if (u.think <= 0 && u.order.type !== 'attack') {
    u.think = 0.5;
    let prey: Unit | null = null, bd = 150;
    for (const a of st.units) {
      if (a.dead || a.team === WILD || a.kind === 'porter') continue;
      const d = dist(a, u);
      if (d < bd && dist(a, { x: hx, y: hy }) < 420) { bd = d; prey = a; }
    }
    if (!prey && u.aggroT > 0) prey = st.byId.get(u.aggro) ?? null;
    if (prey && !prey.dead) { u.order = { type: 'attack', target: prey.id }; u.bubble = '❗'; u.bubbleT = 1.2; }
  }
  if (u.order.type === 'attack') {
    const tg = st.byId.get(u.order.target);
    if (!tg || tg.dead || dist(u, { x: hx, y: hy }) > 470 || tg.kind === 'porter') { u.order = { type: 'home' }; return; }
    attackStep(st, u, tg, dt);
    return;
  }
  if (u.order.type === 'home') {
    goTo(u, hx, hy, 0.8);
    if (near(u, hx, hy, 40)) u.order = { type: 'idle' };
    return;
  }
  wanderAround(u, hx, hy, 100, dt, 0.4);
}

function titanBrain(st: TribalStage, u: Unit, dt: number) {
  u.think -= dt;
  if (u.think <= 0 && u.order.type !== 'attack') {
    u.think = 0.6;
    let prey: Unit | null = null, bd = 180;
    for (const a of st.units) {
      if (a.dead || a.team === WILD || a.kind === 'porter') continue;
      const d = dist(a, u);
      if (d < bd) { bd = d; prey = a; }
    }
    if (!prey && u.aggroT > 0) prey = st.byId.get(u.aggro) ?? null;
    if (prey && !prey.dead) {
      u.order = { type: 'attack', target: prey.id };
      if (Math.random() < 0.4 && st.cam.isVisible(u.x, u.y, 200)) audio.sfx('roar', { pitch: 0.55 });
    }
  }
  if (u.order.type === 'attack') {
    const tg = st.byId.get(u.order.target);
    if (!tg || tg.dead || dist(u, tg) > 300) { u.order = { type: 'idle' }; return; }
    attackStep(st, u, tg, dt);
    return;
  }
  // Roam from village to village, then leave the map to the north.
  const leaving = u.slot >= 3;
  const tx = u.hx ?? u.x, ty = u.hy ?? u.y;
  goTo(u, tx, ty, 0.8);
  if (Math.random() < dt * 2 && st.cam.isVisible(u.x, u.y, 100)) st.fx.add(P.Dust, u.x + (Math.random() - 0.5) * 40, u.y, { life: 0.8, size: 8, color: '#a88f6a' });
  if (near(u, tx, ty, 60)) {
    if (leaving) { u.dead = true; u.dying = 0.01; ui.toast('The Titan has wandered away.', { icon: '🦖' }); return; }
    u.slot++;
    if (u.slot >= 3) { u.hx = u.x < WORLD / 2 ? 60 : WORLD - 60; u.hy = 60; }
    else {
      const opts = [{ x: st.home.x, y: st.home.y + 40 }, ...st.tribes.filter((tr) => tr.state === 'active').map((tr) => ({ x: tr.x, y: tr.y + 60 }))];
      const pick = Math.random() < 0.4 ? opts[0] : opts[Math.floor(Math.random() * opts.length)];
      u.hx = pick.x + (Math.random() - 0.5) * 120;
      u.hy = pick.y + (Math.random() - 0.5) * 80;
    }
  }
}

function petBrain(st: TribalStage, u: Unit, dt: number) {
  const pen = st.home.pen;
  u.think -= dt;
  if (u.think <= 0 && u.order.type !== 'attack') {
    u.think = 0.5;
    const foe = findPlayerFoe(st, u, 240);
    if (foe && dist(foe, st.home) < 330) u.order = { type: 'attack', target: foe.id };
  }
  const o = u.order;
  if (o.type === 'attack') {
    const tg = st.byId.get(o.target);
    if (!tg || tg.dead || dist(u, pen) > 360 || !isPlayerFoe(st, tg)) { u.order = { type: 'idle' }; return; }
    attackStep(st, u, tg, dt);
    return;
  }
  if (o.type === 'move') {
    goTo(u, o.x, o.y, 0.8);
    if (near(u, o.x, o.y, 20)) u.order = { type: 'idle' };
    return;
  }
  const dx = (u.x - pen.x) / 68, dy = (u.y - pen.y) / 30;
  if (dx * dx + dy * dy > 1) { goTo(u, pen.x + (Math.random() - 0.5) * 60, pen.y + (Math.random() - 0.5) * 24, 0.7); return; }
  wanderAround(u, pen.x, pen.y, 55, dt, 0.25);
  if (u.gs > 0) {
    const ex = (u.gx - pen.x) / 68, ey = (u.gy - pen.y) / 30;
    if (ex * ex + ey * ey > 1) stopUnit(u);
  }
}

function charmBrain(st: TribalStage, u: Unit, dt: number) {
  const chief = st.chief();
  const anchor = chief ?? { x: st.home.x, y: st.home.y, order: { type: 'idle' } as Order };
  u.think -= dt;
  if (u.think <= 0 && u.order.type !== 'attack') {
    u.think = 0.4;
    let foe: Unit | null = null;
    if (chief && chief.order.type === 'attack') foe = st.byId.get(chief.order.target) ?? null;
    if (!foe) foe = findPlayerFoe(st, u, 220);
    if (!foe && chief && chief.order.type === 'hut') {
      const tr = st.tribes[chief.order.tribe - 1];
      foe = st.tribeMembers(tr).sort((a, b) => dist(a, u) - dist(b, u))[0] ?? null;
    }
    if (foe && !foe.dead && foe.team !== PLAYER) u.order = { type: 'attack', target: foe.id };
  }
  if (u.order.type === 'attack') {
    const tg = st.byId.get(u.order.target);
    if (!tg || tg.dead || tg.team === PLAYER || dist(u, anchor) > 360) { u.order = { type: 'idle' }; return; }
    attackStep(st, u, tg, dt);
    return;
  }
  const off = slotOffset(u.slot + 2, 30);
  const tx = anchor.x + off.x, ty = anchor.y + off.y + 10;
  if (dist(u, { x: tx, y: ty }) > 30) goTo(u, tx, ty, 1);
  else stopUnit(u);
}

// ------------------------------------------------------------------ wildlife population & titans

export function updateWildlife(st: TribalStage, dt: number) {
  st.herds.forEach((hd, i) => {
    let n = 0;
    for (const u of st.units) if (!u.dead && u.herd === i && u.team === WILD && !u.pet && u.wild !== 'titan') n++;
    if (n >= hd.size) return;
    hd.respawn -= dt;
    if (hd.respawn <= 0 && !st.cam.isVisible(hd.x, hd.y, 120)) {
      hd.respawn = 40;
      const u = spawnHerdMember(st, hd);
      u.herd = i;
    }
  });
  if (st.titanPlan.length && st.time >= st.titanPlan[0]) {
    st.titanPlan.shift();
    const x = 300 + Math.random() * 1400;
    const u = st.spawnAnimal(st.titanIdx, x, 40, 'titan', -1);
    u.slot = 0;
    const tgt = st.tribes.filter((t) => t.state === 'active');
    const first = tgt.length ? tgt[Math.floor(Math.random() * tgt.length)] : null;
    u.hx = first ? first.x : st.home.x;
    u.hy = first ? first.y + 60 : st.home.y;
    st.game.banner('A Titan stirs', u.design.name);
    audio.sfx('roar', { pitch: 0.5 });
    st.fx.shake = 6;
    st.game.hint('titan', 'Titans are huge and deadly, but slaying one brings a mountain of meat. Spears and Snares help.', '🦖');
  }
}
