// Unit simulation: creation, steering and integration, the player-member brain, combat,
// gathering, healing and projectiles.
import { audio } from '../../engine/audio';
import { ui } from '../../engine/ui';
import { clamp, dist } from '../../engine/math';
import { computeStats } from '../../design/registry';
import { layoutDesign, type Layout } from '../../design/render';
import type { Design, Stats } from '../../design/types';
import { PLAYER, WILD, WORLD, type Order, type ResourceNode, type Unit } from './types';
import type { TribalStage } from './stage';
import { TOOLS } from './tools';
import { coastY, waterAt } from './world';
import { P } from './fx';
import { explodeBomb } from './abilities';

// ------------------------------------------------------------------ metrics

const layoutCache = new WeakMap<Design, Layout>();
export function layoutOf(d: Design): Layout {
  let L = layoutCache.get(d);
  if (!L) { L = layoutDesign(d); layoutCache.set(d, L); }
  return L;
}
const statCache = new WeakMap<Design, Stats>();
export function statsOf(d: Design): Stats {
  let s = statCache.get(d);
  if (!s) { s = computeStats(d); statCache.set(d, s); }
  return s;
}

/** Normalised render size so every species reads at roughly the same height on the map. */
export function bodyMetrics(d: Design, mul: number): { size: number; r: number; hgt: number } {
  const L = layoutOf(d);
  const ref = Math.max(L.width * 0.55, L.height, 20);
  const size = clamp(34 / ref, 0.2, 1.4) * mul;
  return { size, r: Math.max(8, L.width * size * 0.36), hgt: L.height };
}

export interface NewUnit {
  kind: Unit['kind'];
  team: number;
  design: Design;
  dIdx: number;
  x: number;
  y: number;
  hp: number;
  speed: number;
  chief: boolean;
  age: number;
  scaleMul: number;
}

export function newUnit(st: TribalStage, o: NewUnit): Unit {
  const m = bodyMetrics(o.design, o.scaleMul);
  return {
    id: st.uid(), kind: o.kind, team: o.team, design: o.design, dIdx: o.dIdx, size: m.size, r: m.r, hgt: m.hgt,
    x: o.x, y: o.y, gx: o.x, gy: o.y, gs: 0, facing: Math.random() < 0.5 ? -1 : 1, speed: o.speed,
    hp: o.hp, maxHp: o.hp, chief: o.chief, age: o.age, tool: null, carry: 0, carryKind: null,
    order: { type: 'idle' }, resume: null, slot: 0, t: Math.random() * 10, phase: Math.random(), walk: 0,
    action: null, actionT: 0, actionDur: 0, flash: 0, dying: 0, dead: false, cd: Math.random(), stun: 0, burn: 0,
    sel: false, think: Math.random() * 0.4, bubble: null, bubbleT: 0, aggro: -1, aggroT: 0,
  };
}

/** Body scale factor for growing babies. */
export const growth = (u: Unit) => 0.55 + 0.45 * u.age;

export function slotOffset(i: number, sp = 22): { x: number; y: number } {
  if (i <= 0) return { x: 0, y: 0 };
  let ring = 1, idx = i - 1;
  while (idx >= ring * 6) { idx -= ring * 6; ring++; }
  const a = (idx / (ring * 6)) * Math.PI * 2 + ring * 0.5;
  return { x: Math.cos(a) * ring * sp, y: Math.sin(a) * ring * sp * 0.7 };
}

export function goTo(u: Unit, x: number, y: number, s = 1) { u.gx = x; u.gy = y; u.gs = s; }
export function stopUnit(u: Unit) { u.gs = 0; u.gx = u.x; u.gy = u.y; }
export const near = (u: Unit, x: number, y: number, r: number) => (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r;

export function act(u: Unit, action: string, dur = 0.45) {
  u.action = action;
  u.actionT = 0;
  u.actionDur = dur;
}

/** Timers shared by every unit kind. */
export function tickCommon(st: TribalStage, u: Unit, dt: number) {
  u.t += dt;
  if (u.cd > 0) u.cd -= dt;
  if (u.flash > 0) u.flash -= dt;
  if (u.stun > 0) u.stun -= dt;
  if (u.aggroT > 0) u.aggroT -= dt;
  if (u.bubbleT > 0) { u.bubbleT -= dt; if (u.bubbleT <= 0) u.bubble = null; }
  if (u.action) {
    u.actionT += dt;
    if (u.actionT >= u.actionDur) u.action = null;
  }
  if (u.burn > 0) {
    u.burn -= dt;
    u.hp -= 3 * dt;
    if (u.hp <= 0) killUnit(st, u, null);
  }
}

// ------------------------------------------------------------------ integration

export function integrate(st: TribalStage, dt: number) {
  const us = st.units;
  const n = us.length;
  for (let i = 0; i < n; i++) {
    const u = us[i];
    if (u.dead) { if (u.fear && u.fear > 0) { u.x += u.facing * 40 * dt; } continue; }
    let mx = 0, my = 0;
    if (u.gs > 0 && u.stun <= 0) {
      const dx = u.gx - u.x, dy = u.gy - u.y, d = Math.hypot(dx, dy);
      if (d > 1.5) {
        let sp = u.speed * u.gs * (u.age < 1 ? 0.75 : 1);
        if (u.kind !== 'porter' && waterAt(st.w, u.x, u.y) === 1) sp *= 0.55;
        const step = Math.min(d, sp * dt);
        mx = (dx / d) * step;
        my = (dy / d) * step;
      }
    }
    u.x += mx;
    u.y += my;
    const v = Math.hypot(mx, my) / Math.max(dt, 1e-4);
    const target = clamp(v / 60, 0, 1);
    u.walk += (target - u.walk) * Math.min(1, dt * 10);
    u.phase += dt * (0.7 + u.walk * 1.5);
    if (Math.abs(mx) > 0.05) u.facing = mx > 0 ? 1 : -1;
  }
  // Separation (porters ghost through everything).
  for (let i = 0; i < n; i++) {
    const a = us[i];
    if (a.dead || a.kind === 'porter') continue;
    const ra = a.r * growth(a);
    for (let j = i + 1; j < n; j++) {
      const b = us[j];
      if (b.dead || b.kind === 'porter') continue;
      const rb = b.r * growth(b);
      const min = (ra + rb) * 0.55;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (min - d) * 0.5;
      const nx = dx / d, ny = dy / d;
      // Heavier (titans) push harder; workers hold their spot.
      const wa = a.wild === 'titan' ? 0.1 : a.gs === 0 ? 0.35 : 0.5;
      const wb = b.wild === 'titan' ? 0.1 : b.gs === 0 ? 0.35 : 0.5;
      a.x -= nx * push * wa * 2;
      a.y -= ny * push * wa * 2;
      b.x += nx * push * wb * 2;
      b.y += ny * push * wb * 2;
    }
  }
  // Obstacles, sea and world bounds.
  for (let i = 0; i < n; i++) {
    const u = us[i];
    if (u.dead) continue;
    if (u.kind !== 'porter' && !u.pet) {
      for (const ob of st.obstacles) {
        const dx = u.x - ob.x, dy = (u.y - ob.y) * 1.25;
        const min = ob.r + u.r * 0.3;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1;
          u.x = ob.x + (dx / d) * min;
          u.y = ob.y + (dy / d) * min / 1.25;
        }
      }
    }
    u.x = clamp(u.x, 24, WORLD - 24);
    u.y = clamp(u.y, 24, WORLD - 24);
    const cy = coastY(st.w, u.x) - 4;
    if (u.y > cy) u.y = cy;
  }
}

// ------------------------------------------------------------------ hostility

/** Is `a` someone the player's tribe should fight? */
export function isPlayerFoe(st: TribalStage, a: Unit): boolean {
  if (a.dead || a.kind === 'porter' || a.team === PLAYER) return false;
  if (a.team === WILD) {
    if (a.wild === 'titan') return true;
    if (a.wild === 'hunter') return a.order.type === 'attack';
    return a.aggroT > 0 && a.order.type === 'attack';
  }
  const t = st.tribes[a.team - 1];
  if (t.state !== 'active') return false;
  if (a.raid) return true;
  if (a.order.type === 'attack') {
    const tg = st.byId.get(a.order.target);
    return !!tg && tg.team === PLAYER;
  }
  return false;
}

export function findPlayerFoe(st: TribalStage, u: Unit, r: number): Unit | null {
  let best: Unit | null = null, bd = r * r;
  for (const a of st.units) {
    if (a.team === PLAYER || a.dead) continue;
    const d2 = (a.x - u.x) ** 2 + (a.y - u.y) ** 2;
    if (d2 < bd && isPlayerFoe(st, a)) { bd = d2; best = a; }
  }
  return best;
}

function autoEngage(st: TribalStage, u: Unit) {
  const o = u.order;
  if (o.type === 'attack' || o.type === 'move' || o.type === 'tool') return;
  let foe: Unit | null = null;
  if (u.aggroT > 0) {
    const a = st.byId.get(u.aggro);
    if (a && !a.dead && a.team !== PLAYER && dist(a, u) < 220 && (a.team === WILD || st.tribes[a.team - 1].state === 'active')) foe = a;
  }
  if (!foe && !st.concert) {
    const r = o.type === 'idle' ? 170 : o.type === 'gather' ? 110 : 0;
    if (r > 0) foe = findPlayerFoe(st, u, r);
  }
  if (foe) {
    u.resume = o;
    u.order = { type: 'attack', target: foe.id };
  }
}

function endFight(st: TribalStage, u: Unit) {
  if (u.resume) { u.order = u.resume; u.resume = null; }
  else u.order = { type: 'idle' };
  u.think = 0;
  void st;
}

// ------------------------------------------------------------------ combat

export function unitDamage(st: TribalStage, u: Unit, vsHut: boolean): number {
  if (u.kind === 'animal') {
    if (u.wild === 'titan') return 26 * st.game.diff(0.75, 1, 1.2);
    const s = statsOf(u.design);
    const base = 5 + 2 * Math.max(s.bite ?? 0, s.strike ?? 0, s.charge ?? 0, s.spit ?? 0);
    const mul = u.team === PLAYER ? 1.2 : u.wild === 'hunter' ? 1.25 * st.game.diff(0.7, 1, 1.2) : 0.8;
    return vsHut ? 3 : base * mul;
  }
  const def = u.tool ? TOOLS[u.tool] : null;
  let d = vsHut ? 3 : u.team === PLAYER ? st.species.dmg : 6;
  if (def) {
    const td = vsHut ? def.hutDmg : def.dmg;
    d = def.group === 'weapon' ? (vsHut ? td : Math.max(d, td)) : Math.max(d * 0.85, td);
  }
  if (u.chief) d = Math.max(d, vsHut ? 7 : 12);
  if (u.team === PLAYER) d *= 1 + 0.1 * st.bonus.combat;
  else d *= st.game.diff(0.7, 1, 1.2);
  return d;
}

function attackAnim(u: Unit): string {
  if (u.kind === 'animal') {
    const s = statsOf(u.design);
    return (s.charge ?? 0) > (s.bite ?? 0) ? 'charge' : 'bite';
  }
  if (u.tool && TOOLS[u.tool].ranged) return 'strike';
  const s = statsOf(u.design);
  return u.tool || u.chief ? 'strike' : (s.bite ?? 0) >= (s.strike ?? 0) ? 'bite' : 'strike';
}

/** Chase and hit a unit. */
export function attackStep(st: TribalStage, u: Unit, t: Unit, dt: number) {
  const ranged = !!u.tool && TOOLS[u.tool].ranged && u.kind === 'member';
  const reach = ranged ? 140 : u.r * growth(u) + t.r + 10;
  const d = dist(u, t);
  if (d > reach) { goTo(u, t.x, t.y, 1); return; }
  stopUnit(u);
  u.facing = t.x >= u.x ? 1 : -1;
  if (u.cd > 0 || u.stun > 0) return;
  const dmg = unitDamage(st, u, false);
  u.cd = ranged ? 1.5 : u.wild === 'titan' ? 1.6 : 1.1;
  act(u, attackAnim(u), 0.45);
  if (ranged) {
    throwSpear(st, u, t.x, t.y - t.hgt * t.size * 0.4, t.id, dmg);
    audio.sfx('whoosh', { pitch: 1.4, vol: 0.5 });
  } else {
    st.hitUnit(t, dmg, u, u.tool === 'torch');
    const k = u.wild === 'titan' ? 18 : 5;
    const nx = (t.x - u.x) / (d || 1), ny = (t.y - u.y) / (d || 1);
    if (t.wild !== 'titan') { t.x += nx * k; t.y += ny * k; }
    if (st.cam.isVisible(t.x, t.y, 60)) {
      audio.sfx(u.wild === 'titan' ? 'roar' : 'hit', { pitch: 0.8 + Math.random() * 0.4, vol: 0.7 });
      st.fx.burst(P.Spark, t.x, t.y - t.hgt * t.size * 0.5, 5, { color: u.tool === 'torch' ? '#ff9a3a' : '#fff1c4', speed: 70, up: 20, life: 0.3, size: 2 });
      if (u.wild === 'titan') st.fx.shake = Math.max(st.fx.shake, 5);
    }
  }
  void dt;
}

export function throwSpear(st: TribalStage, u: Unit, tx: number, ty: number, target: number, dmg: number) {
  const sx = u.x + u.facing * 8, sy = u.y - u.hgt * u.size * 0.6;
  const d = Math.hypot(tx - sx, ty - sy);
  st.shots.push({ kind: 'spear', x: sx, y: sy, sx, sy, tx, ty, t: 0, dur: clamp(d / 380, 0.15, 0.6), arc: clamp(d * 0.25, 8, 40), target, from: u.id, team: u.team, dmg });
}

/** Attack a rival tribe's hut. */
function hutStep(st: TribalStage, u: Unit, tribeId: number) {
  const t = st.tribes[tribeId - 1];
  if (t.state !== 'active') { u.order = { type: 'idle' }; return; }
  const cx = t.x, cy = t.y - 12;
  const ranged = !!u.tool && TOOLS[u.tool].ranged;
  const ang = Math.atan2(u.y - cy, u.x - cx) + (u.slot % 5 - 2) * 0.05;
  const R = 54 + u.r * 0.4;
  const px = cx + Math.cos(ang) * R, py = cy + Math.sin(ang) * R * 0.8;
  if (ranged ? dist(u, { x: cx, y: cy }) > 150 : dist(u, { x: px, y: py }) > 16) { goTo(u, ranged ? cx : px, ranged ? cy : py); return; }
  stopUnit(u);
  u.facing = cx >= u.x ? 1 : -1;
  if (u.cd > 0 || u.stun > 0) return;
  u.cd = ranged ? 1.5 : 1.1;
  act(u, 'strike', 0.45);
  const dmg = unitDamage(st, u, true);
  if (ranged) {
    throwSpear(st, u, cx + (Math.random() - 0.5) * 40, cy - 40, -t.id, dmg);
  } else {
    st.damageHut(t, dmg, u, u.tool === 'torch');
    if (st.cam.isVisible(cx, cy, 80)) audio.sfx('hit', { pitch: 0.6, vol: 0.6 });
    if (u.tool === 'torch') st.fx.burst(P.Ember, px, py - 30, 5, { color: '#ffb347', speed: 40, up: 60, size: 2 });
  }
}

export function killUnit(st: TribalStage, u: Unit, by: Unit | null) {
  if (u.dead) return;
  u.dead = true;
  u.hp = 0;
  u.sel = false;
  u.dying = u.wild === 'titan' ? 3 : u.kind === 'animal' ? 2.4 : 2;
  u.gs = 0;
  u.burn = 0;
  st.fx.burst(P.Dust, u.x, u.y, 8, { color: '#b49870', speed: 40, size: 6 });
  st.onUnitKilled(u, by);
}

// ------------------------------------------------------------------ gathering

export function capacity(st: TribalStage, u: Unit): number {
  return Math.min(10, 5 + st.bonus.gather);
}

function harvest(st: TribalStage, u: Unit, n: ResourceNode): { every: number; amount: number } {
  const diet = st.diet;
  switch (n.food) {
    case 'fruit': {
      let every = 0.8;
      if (u.tool === 'staff') every /= 3;
      else if (u.chief) every /= 2;
      if (diet === 'herbivore') every /= 1.25;
      if (n.boost > 0) every /= 1.5;
      return { every, amount: 1 };
    }
    case 'fish': {
      const amount = u.tool === 'fishspear' ? 3 : u.chief ? 2 : 1;
      return { every: (diet === 'omnivore' ? 1.35 : 1.6) / (n.boost > 0 ? 2 : 1), amount };
    }
    case 'meat': return { every: diet === 'carnivore' ? 0.35 : 0.45, amount: 1 };
    default: return { every: 0.32, amount: 1 };
  }
}

export function nodeStand(n: ResourceNode, slot: number): { x: number; y: number } {
  if (n.kind === 'tree') {
    const a = (slot * 2.4) % (Math.PI * 2);
    return { x: n.x + Math.cos(a) * 30, y: n.y + 10 + Math.sin(a) * 14 };
  }
  const o = slotOffset(slot, 18);
  return { x: n.sx + o.x, y: n.sy + o.y * (n.kind === 'fish' ? 0.3 : 1) - (n.kind === 'fish' ? Math.abs(o.y) * 0.5 : 0) };
}

export function findNode(st: TribalStage, food: string, x: number, y: number, maxD: number, exclude?: number, owner?: number): ResourceNode | null {
  let best: ResourceNode | null = null, bd = maxD * maxD;
  for (const n of st.nodes) {
    if (n.food !== food || n.amount < 1 || n.id === exclude) continue;
    if (owner !== undefined && n.owner !== owner && n.owner !== -1) continue;
    const d2 = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d2 < bd) { bd = d2; best = n; }
  }
  return best;
}

function gatherStep(st: TribalStage, u: Unit, o: Extract<Order, { type: 'gather' }>, dt: number) {
  const n = st.nodeById.get(o.node);
  const pile = st.home.pile;
  if (o.phase === 'return') {
    const p = { x: pile.x + slotOffset(u.slot, 14).x, y: pile.y + 22 };
    goTo(u, p.x, p.y);
    if (near(u, p.x, p.y, 16) || near(u, pile.x, pile.y, 40)) {
      if (u.carry > 0) st.addFood(u.carry, pile.x, pile.y, u.carryKind ?? 'fruit');
      u.carry = 0;
      if (n && n.amount >= 1) { o.phase = 'go'; return; }
      const next = n ? findNode(st, n.food, n.x, n.y, 450, n.id, 0) : null;
      if (next) { o.node = next.id; o.phase = 'go'; }
      else u.order = { type: 'idle' };
    }
    return;
  }
  if (!n || n.amount < 1) {
    if (u.carry > 0) { o.phase = 'return'; return; }
    const next = n ? findNode(st, n.food, n.x, n.y, 450, n.id, 0) : null;
    if (next) { o.node = next.id; o.phase = 'go'; }
    else { u.order = { type: 'idle' }; if (n?.kind === 'eggs') ui.toast('The egg basket is empty. Pets lay more over time.', { icon: '🥚' }); }
    return;
  }
  const sp = nodeStand(n, u.slot);
  if (o.phase === 'go') {
    goTo(u, sp.x, sp.y);
    if (near(u, sp.x, sp.y, 10)) { o.phase = 'work'; o.t = 0; }
    return;
  }
  // work
  stopUnit(u);
  u.facing = n.x >= u.x ? 1 : -1;
  const hv = harvest(st, u, n);
  o.t += dt;
  if (!u.action) act(u, n.kind === 'fish' ? 'strike' : n.kind === 'tree' ? (u.tool === 'staff' || u.chief ? 'strike' : 'eat') : 'eat', Math.min(0.6, hv.every));
  if (o.t >= hv.every) {
    o.t -= hv.every;
    const cap = capacity(st, u);
    const amt = Math.min(hv.amount, Math.floor(n.amount), cap - u.carry);
    n.amount -= amt;
    u.carry += amt;
    u.carryKind = n.food;
    n.shake = 0.3;
    if (st.cam.isVisible(n.x, n.y, 60)) {
      if (n.kind === 'tree') st.fx.add(P.Fruit, n.x + (Math.random() - 0.5) * 30, n.y + 4, { z: 40, vz: -20, vx: (u.x - n.x) * 0.8, life: 0.5, size: 3, color: ['#ff4d4d', '#ffa62b', '#b366ff'][n.variant] });
      if (n.kind === 'fish') st.fx.burst(P.Splash, n.x, n.y, 5, { color: '#e8fbff', speed: 40, up: 50, life: 0.5, size: 2 });
      if (amt > 0 && Math.random() < 0.5) audio.sfx(n.kind === 'fish' ? 'splash' : 'pop', { pitch: 1 + Math.random() * 0.4, vol: 0.35 });
    }
    if (u.carry >= cap || n.amount < 1) o.phase = 'return';
  }
}

// ------------------------------------------------------------------ the player member brain

export function updatePlayerUnit(st: TribalStage, u: Unit, dt: number) {
  tickCommon(st, u, dt);
  if (u.dead) return;
  if (u.age < 1) { babyBrain(st, u, dt); return; }
  if (u.stun > 0) { stopUnit(u); return; }
  u.think -= dt;
  if (u.think <= 0) {
    u.think = 0.3 + Math.random() * 0.2;
    autoEngage(st, u);
  }
  const o = u.order;
  switch (o.type) {
    case 'idle': idleStep(st, u); break;
    case 'move':
      goTo(u, o.x, o.y);
      if (near(u, o.x, o.y, 8)) { stopUnit(u); u.order = { type: 'idle' }; }
      break;
    case 'attack': {
      const t = st.byId.get(o.target);
      if (!t || t.dead || t.team === PLAYER || (t.team >= 1 && st.tribes[t.team - 1].state !== 'active')) { endFight(st, u); break; }
      if (u.resume && dist(u, t) > 340) { endFight(st, u); break; }
      attackStep(st, u, t, dt);
      break;
    }
    case 'hut': hutStep(st, u, o.tribe); break;
    case 'gather': gatherStep(st, u, o, dt); break;
    case 'tool': {
      const th = st.toolHuts[o.slot];
      if (!th) { u.order = { type: 'idle' }; break; }
      const door = st.slotDoor(o.slot);
      const p = { x: door.x + slotOffset(u.slot, 14).x, y: door.y + Math.abs(slotOffset(u.slot, 14).y) };
      goTo(u, p.x, p.y);
      if (near(u, p.x, p.y, 12) || near(u, door.x, door.y, 26)) {
        stopUnit(u);
        if (!u.chief && u.tool !== th.tool) {
          u.tool = th.tool;
          act(u, 'pose', 0.8);
          st.fx.burst(P.Star, u.x, u.y - u.hgt * u.size, 8, { color: ['#ffd166', '#fff'], speed: 40, up: 40, size: 2.5 });
          audio.sfx('place', { pitch: 1.2 });
          st.fx.text(u.x, u.y - u.hgt * u.size - 16, `${TOOLS[th.tool].icon} ${TOOLS[th.tool].name}`, '#ffffff');
        }
        u.order = { type: 'idle' };
      }
      break;
    }
    case 'perform': {
      const t = st.tribes[o.tribe - 1];
      if (t.state !== 'active') { u.order = { type: 'idle' }; break; }
      const p = st.stagePoint(t, u.slot);
      goTo(u, p.x, p.y);
      if (near(u, p.x, p.y, 10)) {
        stopUnit(u);
        u.facing = t.x >= u.x ? 1 : -1;
        if (!st.concert && !u.action && Math.random() < dt * 0.4) act(u, 'dance', 1.2);
      }
      break;
    }
    case 'tame': {
      const a = st.byId.get(o.target);
      if (!a || a.dead || a.team !== WILD) { u.order = { type: 'idle' }; break; }
      goTo(u, a.x, a.y);
      if (dist(u, a) < u.r + a.r + 16) { stopUnit(u); act(u, 'charm', 0.8); st.tame(u, a); }
      break;
    }
    default:
      u.order = { type: 'idle' };
  }
}

function idleStep(st: TribalStage, u: Unit) {
  const H = st.home;
  if (u.gs > 0 && near(u, u.gx, u.gy, 4)) stopUnit(u);
  if (u.gs === 0 && Math.random() < 0.004) {
    if (dist(u, H) < 320) {
      const a = Math.random() * Math.PI * 2;
      goTo(u, u.x + Math.cos(a) * 26, u.y + Math.sin(a) * 18, 0.4);
    }
  }
  if (st.isNight > 0.5 && dist(u, H.fire) < 140 && !u.action && Math.random() < 0.006) act(u, 'dance', 1.6);
}

function babyBrain(st: TribalStage, u: Unit, dt: number) {
  const f = st.home.fire;
  u.age = Math.min(1, u.age + dt / 30);
  if (u.gs === 0 && Math.random() < 0.01) {
    const a = Math.random() * Math.PI * 2;
    goTo(u, f.x + Math.cos(a) * 70, f.y + 20 + Math.sin(a) * 40, 0.5);
  } else if (u.gs > 0 && near(u, u.gx, u.gy, 4)) stopUnit(u);
  if (u.age >= 1) {
    u.order = { type: 'idle' };
    st.fx.burst(P.Star, u.x, u.y - 20, 10, { color: ['#7bd389', '#fff'], speed: 40, up: 40 });
    st.fx.text(u.x, u.y - 40, 'Grown up!', '#9df2c9');
    audio.sfx('levelup', { vol: 0.5, pitch: 1.3 });
    st.hud.refresh(true);
  }
}

// ------------------------------------------------------------------ healing & projectiles

export function healPass(st: TribalStage, dt: number) {
  const fire = st.home.fire;
  const healers = st.units.filter((u) => !u.dead && u.tool === 'heal');
  for (const u of st.units) {
    if (u.dead || u.hp >= u.maxHp || u.kind === 'porter') continue;
    let rate = 0;
    if (u.team === PLAYER) {
      if (dist(u, fire) < 120 && u.order.type !== 'attack') rate += 3;
      for (const hl of healers) if (hl.team === PLAYER && hl !== u && dist(hl, u) < 120) rate += 4;
    } else if (u.team >= 1) {
      const t = st.tribes[u.team - 1];
      if (t.alarm <= 0 && dist(u, t) < 140) rate += 2;
      for (const hl of healers) if (hl.team === u.team && hl !== u && dist(hl, u) < 120) rate += 4;
    } else if (u.order.type !== 'attack' && u.aggroT <= 0) rate += 1;
    if (rate > 0) {
      u.hp = Math.min(u.maxHp, u.hp + rate * dt);
      if (u.team === PLAYER && rate > 3 && Math.random() < dt * 1.5 && st.cam.isVisible(u.x, u.y, 30)) {
        st.fx.add(P.Heart, u.x + (Math.random() - 0.5) * 12, u.y - u.hgt * u.size, { vz: 24, life: 0.9, size: 12, icon: '💚' });
      }
    }
  }
}

export function updateShots(st: TribalStage, dt: number) {
  for (let i = st.shots.length - 1; i >= 0; i--) {
    const s = st.shots[i];
    s.t += dt;
    if (s.kind === 'spear' && s.target > 0) {
      const t = st.byId.get(s.target);
      if (t && !t.dead) { s.tx = t.x; s.ty = t.y - t.hgt * t.size * 0.4; }
    }
    const k = Math.min(1, s.t / s.dur);
    s.x = s.sx + (s.tx - s.sx) * k;
    s.y = s.sy + (s.ty - s.sy) * k - Math.sin(k * Math.PI) * s.arc;
    if (s.kind === 'bomb' && Math.random() < 0.6) st.fx.add(P.Fire, s.x, s.y, { life: 0.35, size: 4, color: '#ff8a2a' });
    if (k < 1) continue;
    st.shots.splice(i, 1);
    if (s.kind === 'bomb') { explodeBomb(st, s.tx, s.ty); continue; }
    const from = st.byId.get(s.from) ?? null;
    if (s.target < 0) {
      const t = st.tribes[-s.target - 1];
      st.damageHut(t, s.dmg, from);
    } else {
      const t = st.byId.get(s.target);
      if (t && !t.dead) {
        st.hitUnit(t, s.dmg, from);
        if (st.cam.isVisible(t.x, t.y, 40)) audio.sfx('hit', { pitch: 1.3, vol: 0.5 });
      }
    }
  }
}
