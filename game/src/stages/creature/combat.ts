// Combat: Bite / Charge / Strike / Spit for the player and NPCs, homing spit projectiles,
// poison, Titan stomps, damage, deaths and corpses.
import { audio } from '../../engine/audio';
import { clamp } from '../../engine/math';
import type { CreatureStage } from './stage';
import type { Critter } from './types';
import {
  AB_ACTION, biteCd, biteDmg, chargeCd, chargeDmg, chargeRange, type CombatAb, spitCd, spitDmg, spitPoison, spitRange, strikeCd, strikeDmg,
} from './config';
import { critterHeight, isFighter } from './species';

export function setAction(c: Critter, action: string, dur = 0.5) {
  c.action = action;
  c.actT = c.actDur = dur;
}

function face(c: Critter, x: number) {
  if (Math.abs(x - c.x) > 3) c.facing = x > c.x ? 1 : -1;
}

const d2 = (a: Critter, b: Critter) => Math.hypot(a.x - b.x, a.y - b.y);

// ------------------------------------------------------------------ damage & death
export interface HitOpts { stun?: number; knock?: number; quiet?: boolean; color?: string }

export function damage(S: CreatureStage, t: Critter, amt: number, src: Critter | null, o: HitOpts = {}) {
  if (t.gone || t.dead || t.hp <= 0 || t.state === 'ascend' || t.state === 'abducted') return;
  if (t === S.player) {
    if (S.invuln > 0 || !S.playerAlive) return;
    amt *= S.game.diff(0.7, 1, 1.3);
  }
  amt = Math.max(0.5, amt);
  t.hp -= amt;
  t.flash = 0.22;
  t.hpShow = 3.5;
  if (o.stun) t.stun = Math.max(t.stun, o.stun);
  if (src && o.knock) {
    const dx = t.x - src.x, dy = t.y - src.y, d = Math.hypot(dx, dy) || 1;
    t.vx += (dx / d) * o.knock;
    t.vy += (dy / d) * o.knock;
  }
  const side = src ? S.isPlayerSide(src) : false;
  if (!o.quiet) {
    const col = t === S.player || t.role === 'pack' ? '#ff6b6b' : side ? '#fff3b0' : '#ffffff';
    S.fx.text(t.x, t.y, critterHeight(t) + t.z + 8, String(Math.round(amt)), o.color ?? col, t === S.player ? 18 : 16);
    S.fx.burst('spark', t.x, t.y, 6, { z: critterHeight(t) * 0.5 + t.z, speed: 160, up: 80, life: 0.35, size: 3, color: '#fffbe0', grav: 300 });
  }
  if (t === S.player) S.onPlayerHurt(amt, src);
  else if (t.role === 'pack') S.inCombat = Math.max(S.inCombat, 5);
  if (side && t !== S.player && t.role !== 'pack') {
    t.hitByPlayer = S.t;
    provoke(S, t, src!);
    S.inCombat = Math.max(S.inCombat, 6);
  }
  if (t.hp <= 0) kill(S, t, src);
}

/** First-hit reactions: the victim and its nest-mates fight back or flee; the species' mood sours. */
export function provoke(S: CreatureStage, victim: Critter, attacker: Critter) {
  if (S.social.target === victim) S.social.cancel('attacked');
  victim.socialCd = 6;
  const sp = victim.sp;
  if (victim.role === 'titan') { victim.target = attacker; victim.aggro = 6; return; }
  if (sp.kind === 'nest' && !sp.provoked) {
    sp.provoked = true;
    if (sp.relation === 'curious' || sp.relation === 'neutral' || sp.relation === 'friendly') {
      S.setRelation(sp, isFighter(sp) ? 'annoyed' : 'afraid');
    }
  }
  const react = (c: Critter) => {
    if (c.gone || c.befriended && c !== victim) return;
    if (isFighter(c.sp) && c.role !== 'baby') { c.target = attacker; c.aggro = 8; c.lulled = 0; }
    else c.fear = 5;
  };
  react(victim);
  S.alertAttacked(victim, attacker, react);
}

export function kill(S: CreatureStage, c: Critter, src: Critter | null) {
  if (c.dead) return;
  c.dead = true;
  c.hp = 0;
  const playerSide = (src && S.isPlayerSide(src)) || S.t - c.hitByPlayer < 1.5;
  if (c === S.player) { S.playerDied(); return; }
  c.gone = true;
  if (S.social.target === c) S.social.cancel('gone');
  audio.sfx('die', { pitch: c.role === 'titan' ? 0.5 : c.role === 'baby' ? 1.5 : 1 });
  S.fx.burst('dust', c.x, c.y, 10, { speed: 90, size: 8, grow: 18, life: 0.7, color: '#d9c7a0', spread: c.r });
  S.fx.burst('emoji', c.x, c.y, 3, { emoji: '⭐', size: 14, speed: 60, up: 90, life: 0.9, z: critterHeight(c) * 0.7 });
  S.addCorpse(c);
  S.onKilled(c, playerSide);
}

// ------------------------------------------------------------------ NPC attacks
export function npcAttack(S: CreatureStage, c: Critter, t: Critter) {
  const st = c.sp.stats;
  const useStrike = (st.strike ?? 0) > (st.bite ?? 0);
  setAction(c, useStrike ? 'strike' : 'bite', useStrike ? 0.45 : 0.38);
  let dmg = c.sp.dmg * (c.role === 'alpha' ? 1.2 : c.role === 'baby' ? 0.4 : 1);
  if (c.role === 'pack') dmg *= 1.1;
  damage(S, t, dmg, c);
  if (c.near) audio.sfx(useStrike ? 'hit' : 'chomp', { pitch: 0.9 + Math.random() * 0.3, vol: t === S.player ? 0.9 : 0.5 });
}

export function titanStomp(S: CreatureStage, c: Critter) {
  setAction(c, 'strike', 0.7);
  const dmg = S.game.diff(32, 45, 60);
  const reach = c.r * 0.9 + 70;
  const hits: Critter[] = [S.player, ...S.pack];
  for (const o of hits) {
    if (o.gone || o.z > 30) continue;
    if (d2(o, c) < reach + o.r) damage(S, o, dmg, c, { stun: 0.6, knock: 260 });
  }
  audio.sfx('hit', { pitch: 0.5, vol: 1 });
  audio.sfx('explode', { pitch: 1.8, vol: 0.4 });
  S.fx.shake(14);
  const fx = c.x + c.facing * c.r * 0.6;
  S.fx.spawn('ring', fx, c.y, { size: 20, grow: 220, life: 0.5, color: '#fff2c9' });
  S.fx.burst('dust', fx, c.y, 16, { speed: 220, size: 12, grow: 26, life: 0.9, color: '#cdb98f' });
  S.fx.burst('debris', fx, c.y, 10, { speed: 160, up: 220, grav: 700, size: 5, life: 1.1, color: '#8a7a5a' });
}

// ------------------------------------------------------------------ spit
export function fireSpit(S: CreatureStage, from: Critter, target: Critter, dmg: number, poison: number) {
  setAction(from, 'spit', 0.45);
  face(from, target.x);
  const h = critterHeight(from);
  const x = from.x + from.facing * from.r * 0.9, y = from.y + 1, z = from.z + h * 0.55;
  const dx = target.x - x, dy = target.y - y, d = Math.hypot(dx, dy) || 1;
  const sp = 430;
  S.projectiles.push({ x, y, z, vx: (dx / d) * sp, vy: (dy / d) * sp, target, fromPlayerSide: S.isPlayerSide(from), dmg, poison, t: 0, src: from });
  if (from.near) audio.sfx('spit', { vol: from === S.player ? 1 : 0.5 });
}

export function updateProjectiles(S: CreatureStage, dt: number) {
  const ps = S.projectiles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.t += dt;
    const t = p.target;
    let dead = p.t > 1.7;
    if (!t.gone && !dead) {
      // Home in: rotate velocity toward the target.
      const tz = t.z + critterHeight(t) * 0.45;
      const dx = t.x - p.x, dy = t.y - p.y;
      const want = Math.atan2(dy, dx), cur = Math.atan2(p.vy, p.vx);
      let da = want - cur;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const turn = clamp(da, -7 * dt, 7 * dt);
      const sp = Math.hypot(p.vx, p.vy);
      p.vx = Math.cos(cur + turn) * sp;
      p.vy = Math.sin(cur + turn) * sp;
      p.z += (tz - p.z) * Math.min(1, dt * 5) + Math.sin(p.t * 12) * 0.4;
      if (Math.hypot(dx, dy) < t.r + 10) {
        damage(S, t, p.dmg, p.src.gone ? null : p.src, { color: '#9dff7a' });
        if (p.src && !p.src.gone) {
          // A spit hit also knocks gliders out of the air and keeps the target angry at the spitter.
          if (t.z > 20) t.vz = Math.min(t.vz, -200);
        }
        t.poison = 4;
        t.poisonDps = p.poison;
        t.poisonByPlayer = p.fromPlayerSide;
        S.fx.burst('drop', t.x, t.y, 10, { z: p.z, speed: 120, up: 120, grav: 600, size: 2.6, life: 0.6, color: '#7be35a' });
        if (t.near) audio.sfx('splash', { pitch: 2, vol: 0.4 });
        dead = true;
      }
    } else dead = true;
    if (!dead) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (Math.random() < dt * 30) S.fx.spawn('drop', p.x, p.y, { z: p.z, size: 2.2, life: 0.35, color: '#9df27a', grav: 300 });
    }
    if (dead) { ps[i] = ps[ps.length - 1]; ps.pop(); }
  }
}

export function updatePoison(S: CreatureStage, dt: number) {
  for (const c of S.critters) {
    if (c.poison <= 0 || c.gone) continue;
    c.poison -= dt;
    c.hp -= c.poisonDps * dt;
    if (Math.random() < dt * 6) S.fx.spawn('drop', c.x + (Math.random() - 0.5) * c.r, c.y, { z: critterHeight(c) * Math.random(), size: 2, life: 0.5, color: '#8be05f', vz: 30 });
    if (c.hp <= 0) {
      if (c === S.player) S.playerDied();
      else kill(S, c, c.poisonByPlayer ? S.player : null);
    }
  }
}

// ------------------------------------------------------------------ charge dash
export function startDash(S: CreatureStage, c: Critter, target: Critter, dmg?: number) {
  const dx = target.x - c.x, dy = target.y - c.y, d = Math.hypot(dx, dy) || 1;
  c.dash = Math.min(0.55, d / (c === S.player ? 600 : 460) + 0.08);
  c.dashX = dx / d;
  c.dashY = dy / d;
  c.dashHit = false;
  c.cd = Math.max(c.cd, 0.3);
  c.dashDmg = dmg ?? c.sp.dmg * 1.3;
  face(c, target.x);
  setAction(c, 'charge', c.dash + 0.15);
  if (c.near) audio.sfx('whoosh', { pitch: 0.8, vol: c === S.player ? 1 : 0.5 });
}

export function updateDash(S: CreatureStage, c: Critter, dt: number) {
  c.dash -= dt;
  const sp = c === S.player ? 600 : 460;
  c.vx = c.dashX * sp;
  c.vy = c.dashY * sp;
  const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
  const minH = c === S.player ? -1 : 0.012;
  if (S.world.hAt(nx, ny) >= minH) { c.x = nx; c.y = ny; }
  else c.dash = 0;
  S.world.pushOut(c, c.r * 0.45);
  c.walk = 1;
  c.phase += dt * 5;
  if (Math.random() < dt * 30) S.fx.spawn('dust', c.x - c.dashX * c.r, c.y, { size: 6, grow: 14, life: 0.5, color: '#e3d3a8', speed: 20 });
  if (!c.dashHit) {
    const playerSide = S.isPlayerSide(c);
    for (const o of S.critters) {
      if (o === c || o.gone || o.z > 25) continue;
      if (playerSide ? !S.isEnemy(o) : !S.isPlayerSide(o)) continue;
      if (d2(o, c) < o.r + c.r + 10) {
        c.dashHit = true;
        c.dash = Math.min(c.dash, 0.05);
        const dmg = c.dashDmg || 5;
        damage(S, o, dmg, c, { stun: 2.5, knock: 320 });
        audio.sfx('hit', { pitch: 0.8 });
        S.fx.shake(c === S.player ? 7 : 4);
        S.fx.burst('emoji', o.x, o.y, 1, { emoji: '💥', size: 22, life: 0.5, z: critterHeight(o) * 0.6 });
        break;
      }
    }
  }
  if (c.dash <= 0) { c.dash = 0; c.vx *= 0.2; c.vy *= 0.2; }
}

// ------------------------------------------------------------------ player abilities
export function abRange(S: CreatureStage, ab: CombatAb, t: Critter): number {
  const p = S.player;
  switch (ab) {
    case 'bite': return p.r + t.r + 18;
    case 'strike': return p.r + t.r + 26;
    case 'charge': return chargeRange;
    case 'spit': return spitRange;
  }
}

export function playerCombat(S: CreatureStage, ab: CombatAb) {
  const lvl = S.abLevel(ab);
  if (lvl <= 0) { S.lackAbility(ab); return; }
  if ((S.cool[ab] ?? 0) > 0) { audio.sfx('error'); return; }
  const t = S.combatTarget();
  if (!t) {
    // Swing at the air so the button always feels responsive.
    setAction(S.player, AB_ACTION[ab].action, AB_ACTION[ab].dur);
    S.cool[ab] = 0.45;
    audio.sfx(ab === 'spit' ? 'spit' : ab === 'bite' ? 'chomp' : 'whoosh', { vol: 0.5 });
    S.hud.flashTip('No target nearby');
    return;
  }
  if (S.isFriendlyTarget(t)) {
    S.hud.flashTip(`${t.sp.name} are your friends`);
    audio.sfx('error');
    return;
  }
  S.target = t;
  if (d2(S.player, t) > abRange(S, ab, t)) { S.setIntent({ kind: 'combat', ab, target: t }); return; }
  execCombat(S, ab, t);
}

export function execCombat(S: CreatureStage, ab: CombatAb, t: Critter) {
  const p = S.player;
  const lvl = S.abLevel(ab);
  face(p, t.x);
  S.intent = null;
  S.inCombat = Math.max(S.inCombat, 6);
  switch (ab) {
    case 'bite':
      setAction(p, 'bite', 0.38);
      damage(S, t, biteDmg(lvl), p);
      S.cool.bite = biteCd(lvl);
      audio.sfx('chomp', { pitch: 0.9 + Math.random() * 0.2 });
      S.fx.shake(2.5);
      break;
    case 'strike': {
      setAction(p, 'strike', 0.45);
      const reach = abRange(S, 'strike', t) * 1.45;
      damage(S, t, strikeDmg(lvl), p, { knock: 140 });
      for (const o of S.critters) {
        if (o === t || o.gone || !S.isEnemy(o) || S.isFriendlyTarget(o)) continue;
        const dx = o.x - p.x;
        if (Math.sign(dx) !== p.facing && Math.abs(dx) > 10) continue;
        if (d2(o, p) < reach + o.r) damage(S, o, strikeDmg(lvl) * 0.5, p, { knock: 100 });
      }
      S.cool.strike = strikeCd(lvl);
      audio.sfx('hit', { pitch: 1.1 });
      audio.sfx('whoosh', { pitch: 1.6, vol: 0.5 });
      S.fx.shake(4);
      S.fx.spawn('ring', p.x + p.facing * p.r, p.y, { size: 10, grow: 160, life: 0.3, color: '#ffffff' });
      break;
    }
    case 'charge':
      startDash(S, p, t, chargeDmg(lvl));
      S.cool.charge = chargeCd(lvl);
      break;
    case 'spit':
      fireSpit(S, p, t, spitDmg(lvl), spitPoison(lvl));
      S.cool.spit = spitCd(lvl);
      break;
  }
}
