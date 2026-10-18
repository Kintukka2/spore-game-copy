// Timed threats: pirate raids, eco-disasters, invasions by empires at war, Hollow incursions.
import { audio } from '../../engine/audio';
import { fmt } from '../../engine/math';
import type { GEvent } from './types';
import { isHomeworld, slots, used } from './economy';
import type { World } from './world';

export const EVENT_INFO: Record<GEvent['kind'], { icon: string; label: string }> = {
  raid: { icon: '🏴‍☠️', label: 'Pirate raid' },
  invasion: { icon: '⚔️', label: 'Invasion' },
  eco: { icon: '☣️', label: 'Eco-disaster' },
  hollow: { icon: '🤖', label: 'Hollow incursion' },
};

export function eventsTick(w: World, dt: number) {
  const s = w.s;
  const f = s.flags;
  if (!f.tutDone) return;
  const cols = w.colonies().filter(([sid, idx]) => !isHomeworld(w, sid, idx));
  // Pirate raids
  if (f.nextRaid === undefined) f.nextRaid = s.t + 240;
  if (s.t >= Number(f.nextRaid)) {
    const base = 240 + Math.random() * 200;
    f.nextRaid = s.t + base * (w.perks.has('pirate-bane') ? 2.2 : 1) * w.game.diff(1.4, 1, 0.75);
    const targets = cols.filter(([sid]) => !s.events.some((e) => e.star === sid));
    if (targets.length) {
      const [sid, idx] = targets[Math.floor(Math.random() * targets.length)];
      const ps = w.ps(sid, idx);
      if (ps.orbTurret && Math.random() < 0.5) {
        w.hooks?.toast(`Your orbital turret drove pirates away from ${w.planet(sid, idx).name}.`, '🗼', 'good');
      } else start(w, { id: w.nid(), kind: 'raid', star: sid, planet: idx, until: s.t + 150 });
    }
  }
  // Eco-disasters on worlds with life you tend
  if (f.nextEco === undefined) f.nextEco = s.t + 420;
  if (s.t >= Number(f.nextEco)) {
    f.nextEco = s.t + (380 + Math.random() * 260) * (w.perks.has('green-thumb') ? 2.5 : 1) * w.game.diff(1.4, 1, 0.8);
    const living = cols.filter(([sid, idx]) => {
      const ps = w.ps(sid, idx);
      return ps.eco.some((x) => x && x.diet !== 'plant') && !s.events.some((e) => e.star === sid);
    });
    if (living.length) {
      const [sid, idx] = living[Math.floor(Math.random() * living.length)];
      const ps = w.ps(sid, idx);
      if (!(ps.bioshield && Math.random() < 0.6)) {
        const marks: number[] = [];
        for (let i = 0; i < 5; i++) marks.push(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 1.6);
        start(w, { id: w.nid(), kind: 'eco', star: sid, planet: idx, until: s.t + (ps.bioshield ? 360 : 180), marks });
      }
    }
  }
  // Hollow incursions after contact
  if (f.hollowContact) {
    const hollow = w.emap.get('hollow')!;
    if (f.nextHollow === undefined) f.nextHollow = s.t + 600;
    if (s.t >= Number(f.nextHollow)) {
      f.nextHollow = s.t + 600 + Math.random() * 400;
      if (hollow.war && w.rel(hollow) < -40 && cols.length) {
        const [sid, idx] = cols[Math.floor(Math.random() * cols.length)];
        if (!s.events.some((e) => e.star === sid)) start(w, { id: w.nid(), kind: 'hollow', star: sid, planet: idx, until: s.t + 180, empire: 'hollow' });
      }
    }
  }
  // Expiry
  for (const ev of [...s.events]) {
    if (s.t < ev.until) continue;
    // If the player is fighting there right now, give them the time.
    if (ev.started && s.loc === ev.star && w.inCombat) continue;
    fail(w, ev);
  }
}

export function start(w: World, ev: GEvent) {
  w.s.events.push(ev);
  audio.sfx('alarm');
  w.hooks?.eventStarted(ev);
}

export function resolve(w: World, ev: GEvent) {
  w.s.events = w.s.events.filter((x) => x !== ev);
  const pl = w.planet(ev.star, ev.planet);
  if (ev.kind === 'eco') {
    w.counter('eco');
    w.addMoney(10000);
    w.hooks?.toast(`The outbreak on ${pl.name} is contained. +§10,000`, '🌿', 'good');
  } else {
    const loot = ev.kind === 'raid' ? 15000 + Math.floor(Math.random() * 15000) : 25000;
    w.addMoney(loot);
    w.hooks?.toast(`${pl.name} is safe! Salvage: +§${fmt(loot)}`, '🛡️', 'good');
  }
  audio.sfx('success');
  w.hooks?.eventEnded(ev, true);
}

export function fail(w: World, ev: GEvent) {
  w.s.events = w.s.events.filter((x) => x !== ev);
  const ps = w.ps(ev.star, ev.planet);
  const pl = w.planet(ev.star, ev.planet);
  if (ev.kind === 'raid') {
    ps.stored = 0;
    if (used(ps) > 0) {
      if (ps.bld.factory) ps.bld.factory--; else if (ps.bld.leisure) ps.bld.leisure--; else ps.bld.turret--;
    }
    w.hooks?.toast(`Pirates looted ${pl.name}: its spice and a building are gone.`, '🏴‍☠️', 'bad');
  } else if (ev.kind === 'eco') {
    // A species dies out: the top animal slot empties.
    for (let i = 11; i >= 0; i--) {
      const sp = ps.eco[i];
      if (sp && sp.diet !== 'plant') { ps.eco[i] = null; break; }
    }
    w.hooks?.toast(`A species on ${pl.name} went extinct. The planet is unstable.`, '☣️', 'bad');
  } else {
    ps.cities = Math.max(0, ps.cities - 1);
    while (used(ps) > slots(ps)) { if (ps.bld.factory) ps.bld.factory--; else if (ps.bld.leisure) ps.bld.leisure--; else ps.bld.turret--; }
    if (ps.cities === 0) {
      const takeover = ev.kind === 'invasion' && ev.empire ? ev.empire : null;
      ps.owner = takeover ?? undefined;
      if (takeover) { ps.cities = 1; ps.def = 300; ps.cityHp = 450; }
      const still = w.gal.planets(ev.star).some((p) => w.peekPS(ev.star, p.idx).owner === 'player');
      if (!still) w.setOwner(ev.star, takeover);
      w.hooks?.toast(`${pl.name} has fallen${takeover ? ' to ' + (w.emap.get(takeover)?.name ?? 'the enemy') : ''}.`, '🏚️', 'bad');
    } else w.hooks?.toast(`${pl.name} lost a city to the attackers.`, '🔥', 'bad');
  }
  audio.sfx('fail');
  w.hooks?.eventEnded(ev, false);
}

export function eventAt(w: World, star: number): GEvent | undefined {
  return w.s.events.find((e) => e.star === star);
}
