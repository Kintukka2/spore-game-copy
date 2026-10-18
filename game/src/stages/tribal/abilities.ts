// Consequence-card abilities for the Tribal stage (from the Cell and Creature cards):
// Bounty Rain, Fish Frenzy, Snares, Fireworks, Beastmaster and Fire Bombs.
import type { AbilityDef } from '../../game/cards';
import { audio } from '../../engine/audio';
import { ui } from '../../engine/ui';
import { dist } from '../../engine/math';
import { PLAYER, WILD, type Tribe } from './types';
import type { TribalStage } from './stage';
import { coastY } from './world';
import { P } from './fx';

export interface ActiveAbility {
  def: AbilityDef;
  cd: number;
}

export interface Effect {
  kind: 'rain' | 'frenzy' | 'fireworks' | 'charm';
  t: number;
  dur: number;
  x: number;
  y: number;
}

const FW_COLS = ['#ff5d8f', '#ffd166', '#5cc8ff', '#7bd389', '#c77dff', '#ff7a59'];

function startCooldown(st: TribalStage, id: string) {
  const a = st.abilities.find((x) => x.def.id === id);
  if (a) a.cd = a.def.cooldown ?? 90;
}

export function castAbility(st: TribalStage, a: ActiveAbility): boolean {
  if (st.concert || st.finished) return false;
  if (a.cd > 0) {
    audio.sfx('error');
    ui.toast(`${a.def.name} is recharging (${Math.ceil(a.cd)}s).`, { icon: a.def.icon });
    return false;
  }
  const H = st.home;
  switch (a.def.id) {
    case 'bounty': {
      let n = 0;
      for (const nd of st.nodes) {
        if (nd.kind !== 'tree' || dist(nd, H) > 700) continue;
        nd.amount = nd.max;
        nd.boost = 45;
        nd.shake = 0.6;
        n++;
      }
      st.effects.push({ kind: 'rain', t: 0, dur: 9, x: H.x, y: H.y });
      ui.toast(`Bounty Rain! ${n} fruit trees burst with fruit and ripen faster.`, { icon: '🌧️', kind: 'good' });
      audio.sfx('splash');
      setTimeout(() => audio.sfx('success'), 500);
      break;
    }
    case 'fishfrenzy': {
      for (let i = 0; i < 6; i++) {
        const x = H.x - 230 + i * 92 + (Math.random() - 0.5) * 30;
        const y = coastY(st.w, x) - 24 - Math.random() * 10;
        st.addNode('cache', 'fish', x, y, x, y + 4, 8, 8, 0, 0, 0, 90);
        st.fx.add(P.Fish, x, y + 30, { vx: (Math.random() - 0.5) * 30, vz: 120, life: 1, size: 20, icon: '🐟' });
      }
      for (const nd of st.nodes) if (nd.kind === 'fish' && dist(nd, H) < 900) nd.boost = 45;
      st.effects.push({ kind: 'frenzy', t: 0, dur: 4, x: H.x, y: coastY(st.w, H.x) });
      ui.toast('Fish Frenzy! Fish leap onto the beach. Send members to collect them.', { icon: '🐟', kind: 'good' });
      audio.sfx('splash');
      st.focus(H.x, coastY(st.w, H.x) - 80);
      break;
    }
    case 'snares': {
      st.snares = st.snares.filter((s) => s.sprung > 0);
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + 0.3;
        st.snares.push({ x: H.x + Math.cos(ang) * 270, y: H.y + 40 + Math.sin(ang) * 210, ttl: 150, sprung: 0 });
      }
      ui.toast('Snares hidden around the village. Raiders and beasts will get caught!', { icon: '🪤', kind: 'good' });
      audio.sfx('build');
      break;
    }
    case 'fireworks': {
      const tribes = st.tribes.filter((t) => t.state === 'active');
      if (!tribes.length) { ui.toast('There is nobody left to impress.', { icon: '🎆' }); return false; }
      for (const t of tribes) {
        t.relation = Math.min(100, Math.max(t.relation, -10) + 30);
        t.admiration = Math.min(95, t.admiration + 12);
        t.alarm = 0;
        st.effects.push({ kind: 'fireworks', t: 0, dur: 4, x: t.x, y: t.y - 140 });
        for (const u of st.tribeMembers(t)) if (u.raid) { u.raid = false; u.order = { type: 'home' }; u.bubble = '🤩'; u.bubbleT = 2; }
      }
      st.effects.push({ kind: 'fireworks', t: 0, dur: 5, x: H.x, y: H.y - 160 });
      ui.toast('Fireworks dazzle every tribe! Relations soar.', { icon: '🎆', kind: 'good' });
      audio.sfx('explode', { vol: 0.4, pitch: 1.6 });
      break;
    }
    case 'beastmaster': {
      const c = st.chief();
      if (!c) { audio.sfx('error'); ui.toast('Your Chieftain must be alive to call the beasts.', { icon: '🪶', kind: 'bad' }); return false; }
      let n = 0;
      for (const u of st.units) {
        if (u.dead || u.team !== WILD || u.wild === 'titan' || dist(u, c) > 520) continue;
        u.team = PLAYER;
        u.charmed = 60;
        u.order = { type: 'idle' };
        u.slot = n++;
        u.bubble = '💫';
        u.bubbleT = 2;
        st.fx.burst(P.Star, u.x, u.y - 20, 10, { color: ['#7bd389', '#c7f9cc'], speed: 50, up: 40 });
      }
      if (!n) { audio.sfx('error'); ui.toast('No wild animals near your Chieftain. Lead them closer to a herd.', { icon: '🐗', kind: 'bad' }); return false; }
      st.effects.push({ kind: 'charm', t: 0, dur: 1.5, x: c.x, y: c.y });
      ui.toast(`${n} wild animal${n === 1 ? '' : 's'} now follow your Chieftain for a minute!`, { icon: '🐗', kind: 'good' });
      audio.sfx('roar', { pitch: 1.3 });
      break;
    }
    case 'firebombs': {
      st.targetMode = 'firebombs';
      st.selectOnly(null);
      audio.sfx('tap');
      st.hud.refresh(true);
      return false;
    }
    default:
      return false;
  }
  a.cd = a.def.cooldown ?? 90;
  st.game.stat('tribal-abilities');
  st.hud.refresh(true);
  return true;
}

/** Targeted abilities (Fire Bombs). */
export function castAt(st: TribalStage, mode: 'firebombs', x: number, y: number) {
  if (mode !== 'firebombs') return;
  const src = st.chief() ?? st.members().filter((u) => u.age >= 1).sort((a, b) => dist(a, { x, y }) - dist(b, { x, y }))[0];
  const sx = src ? src.x : st.home.x, sy = src ? src.y - 30 : st.home.y - 60;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, rr = i === 0 ? 0 : 46;
    const tx = x + Math.cos(a) * rr, ty = y + Math.sin(a) * rr * 0.7;
    const d = Math.hypot(tx - sx, ty - sy);
    st.shots.push({ kind: 'bomb', x: sx, y: sy, sx, sy, tx, ty, t: -i * 0.12, dur: Math.min(1.3, 0.6 + d / 900), arc: 80 + d * 0.12, target: 0, from: src?.id ?? -1, team: PLAYER, dmg: 30 });
  }
  audio.sfx('whoosh');
  startCooldown(st, 'firebombs');
  st.fx.mark(x, y, '💣', 'Fire Bombs!', '#ff5a4f');
}

export function explodeBomb(st: TribalStage, x: number, y: number) {
  st.fx.burst(P.Fire, x, y - 10, 16, { color: ['#ff7a2a', '#ffcf4a', '#ff4d2d'], speed: 80, up: 50, life: 0.6, size: 8 });
  st.fx.burst(P.Smoke, x, y - 10, 6, { color: '#4a4440', speed: 30, up: 30, life: 1.6, size: 10 });
  st.fx.burst(P.Ember, x, y, 14, { color: '#ffb347', speed: 100, up: 120, life: 0.9, size: 2 });
  st.fx.shake = Math.max(st.fx.shake, 7);
  audio.sfx('explode', { vol: 0.6 });
  const hurt = new Set<Tribe>();
  for (const u of st.units) {
    if (u.dead || u.team === PLAYER || u.kind === 'porter') continue;
    if (dist(u, { x, y }) > 70 + u.r * 0.5) continue;
    st.hitUnit(u, 30, null, true);
    u.stun = Math.max(u.stun, 1.2);
    if (u.team >= 1) hurt.add(st.tribes[u.team - 1]);
  }
  for (const t of st.tribes) {
    if (t.state !== 'active') continue;
    if (dist(t, { x, y: y + 30 }) < 100) { st.damageHut(t, 45, null, true); hurt.add(t); }
  }
  for (const t of hurt) st.hostileToward(t, 25, 'fire bombs');
}

export function updateAbilities(st: TribalStage, dt: number) {
  for (const a of st.abilities) if (a.cd > 0) a.cd = Math.max(0, a.cd - dt);
  for (let i = st.effects.length - 1; i >= 0; i--) {
    const e = st.effects[i];
    e.t += dt;
    if (e.t >= e.dur) { st.effects.splice(i, 1); continue; }
    switch (e.kind) {
      case 'rain': {
        const b = st.cam.bounds(40);
        const n = Math.ceil(dt * 160);
        for (let k = 0; k < n; k++) {
          const x = b.x0 + Math.random() * (b.x1 - b.x0), y = b.y0 + Math.random() * (b.y1 - b.y0 + 200);
          st.fx.add(P.Rain, x, y, { z: 160 + Math.random() * 120, vz: -520, vx: -30, life: 0.9 });
        }
        if (Math.random() < dt * 6) {
          const nd = st.nodes.find((q) => q.kind === 'tree' && q.boost > 40 && Math.random() < 0.3);
          if (nd) st.fx.add(P.Fruit, nd.x + (Math.random() - 0.5) * 30, nd.y, { z: 50, vz: 0, life: 0.6, size: 3, color: ['#ff4d4d', '#ffa62b', '#b366ff'][nd.variant] });
        }
        break;
      }
      case 'frenzy':
        if (Math.random() < dt * 14) st.fx.add(P.Fish, e.x + (Math.random() - 0.5) * 460, e.y + 30 + Math.random() * 30, { vx: (Math.random() - 0.5) * 50, vz: 110 + Math.random() * 60, life: 0.9, size: 18, icon: '🐟' });
        break;
      case 'fireworks':
        if (Math.random() < dt * 5) {
          const x = e.x + (Math.random() - 0.5) * 240, y = e.y + (Math.random() - 0.5) * 80;
          const col = FW_COLS[Math.floor(Math.random() * FW_COLS.length)];
          st.fx.burst(P.Spark, x, y, 26, { color: [col, '#ffffff'], speed: 140, up: 0, life: 1.1, size: 2.2, z: 0 });
          if (st.cam.isVisible(x, y, 200)) audio.sfx('pop', { pitch: 0.5 + Math.random() * 0.6, vol: 0.5 });
        }
        break;
      case 'charm':
        if (Math.random() < dt * 30) st.fx.add(P.Star, e.x + (Math.random() - 0.5) * 120, e.y - Math.random() * 60, { vz: 30, life: 0.8, size: 2.5, color: '#b7ffcf' });
        break;
    }
  }
}
