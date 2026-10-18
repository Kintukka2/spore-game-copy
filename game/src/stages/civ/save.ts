// Mid-stage saves. The static world (terrain, city sites, nations, geysers) is regenerated from the
// save seed; only the dynamic state is stored in state.stageData.civ.
import { vehicleStats } from './sim';
import { TURRET_HP } from './world';
import type { BuildingKind, Medium, Method, NationType, Order, Vehicle } from './types';
import type { CivStage, Phase } from './stage';

export interface CivSave {
  v: 1;
  phase: Phase;
  time: number;
  nextId: number;
  nations: { rel: number; allied: boolean; relAI: number[]; money: number; alive: boolean; goodwill: number; gifts: number; waveT: number; hostileT: number; truce: number }[];
  cities: { owner: number; slots: (BuildingKind | null)[]; tur: [boolean, number][]; def: number; conv: number; convBy: number; buy: number; trade: boolean; founded: boolean; hush: number }[];
  geysers: { owner: number; hp: number }[];
  vehicles: { id: number; nation: number; role: NationType; medium: Medium; home: number; x: number; y: number; hp: number; order: Order; facing: number }[];
  captures: Record<Method, number>;
  stats: CivStage['stats'];
  unlocked: CivStage['unlocked'];
  designed: string[];
  cool: Record<string, number>;
  cam: { x: number; y: number; zoom: number };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function serializeState(S: CivStage): CivSave {
  return {
    v: 1,
    phase: S.phase === 'done' ? 'launch' : S.phase,
    time: r1(S.time),
    nextId: S.nextId,
    nations: S.nations.map((n) => ({ rel: r1(n.rel), allied: n.allied, relAI: n.relAI.map(r1), money: Math.round(n.money), alive: n.alive, goodwill: r1(n.goodwill), gifts: r1(n.gifts), waveT: r1(n.waveT), hostileT: r1(Math.min(999, n.hostileT)), truce: r1(n.truce) })),
    cities: S.cities.map((c) => ({ owner: c.owner, slots: c.slots.map((s) => s.kind), tur: c.turrets.map((t) => [t.alive, Math.round(t.hp)] as [boolean, number]), def: Math.round(c.defense), conv: r1(c.convert), convBy: c.convertBy, buy: r1(c.buyout), trade: c.trade, founded: c.founded, hush: r1(c.hush) })),
    geysers: S.geysers.map((g) => ({ owner: g.owner, hp: Math.round(g.hp) })),
    vehicles: S.vehicles.map((v) => ({ id: v.id, nation: v.nation, role: v.role, medium: v.medium, home: v.home, x: r1(v.x), y: r1(v.y), hp: Math.round(v.hp), order: v.order, facing: v.facing })),
    captures: { ...S.captures },
    stats: { ...S.stats },
    unlocked: { ...S.unlocked },
    designed: S.designed.slice(),
    cool: { ...S.abilities.cool },
    cam: { x: r1(S.cam.x), y: r1(S.cam.y), zoom: Math.round(S.cam.zoom * 100) / 100 },
  };
}

export function restoreState(S: CivStage, s: CivSave) {
  S.phase = s.phase;
  S.time = s.time ?? 0;
  S.nextId = s.nextId ?? 1;
  s.nations?.forEach((d, i) => {
    const n = S.nations[i];
    if (!n) return;
    Object.assign(n, { rel: d.rel, allied: d.allied, money: d.money, alive: d.alive, goodwill: d.goodwill, gifts: d.gifts, waveT: d.waveT, hostileT: d.hostileT, truce: d.truce });
    if (Array.isArray(d.relAI) && d.relAI.length === n.relAI.length) n.relAI = d.relAI.slice();
  });
  s.cities?.forEach((d, i) => {
    const c = S.cities[i];
    if (!c) return;
    c.owner = d.owner;
    d.slots.forEach((k, j) => { if (c.slots[j]) c.slots[j].kind = k; });
    d.tur.forEach(([alive, hp], j) => { const t = c.turrets[j]; if (t) { t.alive = alive; t.hp = hp || TURRET_HP; } });
    c.defense = d.def; c.convert = d.conv; c.convertBy = d.convBy; c.buyout = d.buy; c.trade = d.trade; c.founded = d.founded; c.hush = d.hush;
    if (c.founded) c.foundAt = 0;
  });
  s.geysers?.forEach((d, i) => { const g = S.geysers[i]; if (g) { g.owner = d.owner; g.hp = d.hp; } });
  S.vehicles.length = 0;
  S.vehicleMap.clear();
  for (const d of s.vehicles ?? []) {
    const st = vehicleStats(S.vehicleDesign(d.nation, d.medium, d.role), d.medium, d.role);
    const hpMul = d.nation === 0 ? 1 : S.tune.aiHp;
    const v: Vehicle = {
      id: d.id, nation: d.nation, role: d.role, medium: d.medium, home: d.home, x: d.x, y: d.y, vx: 0, vy: 0, facing: d.facing || 1,
      hp: d.hp, maxHp: st.hp * hpMul, dmg: st.dmg, speed: st.speed, range: st.range, cool: Math.random(), order: d.order ?? { k: 'idle' },
      path: null, pathI: 0, aim: 0, leg: 0, frozen: 0, invuln: 0, bribed: 0, flash: 0, spawn: 0, bob: Math.random() * 10, repath: 0, stuck: 0,
      gx: d.x, gy: d.y, pow: st.pow,
    };
    S.vehicles.push(v);
    S.vehicleMap.set(v.id, v);
    S.nextId = Math.max(S.nextId, v.id + 1);
  }
  Object.assign(S.captures, s.captures ?? {});
  Object.assign(S.stats, s.stats ?? {});
  Object.assign(S.unlocked, s.unlocked ?? {});
  S.designed = (s.designed ?? []).slice();
  Object.assign(S.abilities.cool, s.cool ?? {});
  if (s.cam) { S.cam.x = s.cam.x; S.cam.y = s.cam.y; S.cam.zoom = s.cam.zoom; }
}
