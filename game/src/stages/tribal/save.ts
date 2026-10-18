// Mid-stage saves: the static world regenerates from the seed; only dynamic state is stored
// in state.stageData.tribal.
import { abilitiesFor } from '../../game/cards';
import { PLAYER, WILD, type FoodKind, type NodeKind, type Stance, type ToolId, type WildKind } from './types';
import type { StageStats, TribalStage } from './stage';

interface SavedUnit {
  kind: 'member' | 'animal';
  team: number;
  dIdx: number;
  x: number;
  y: number;
  hp: number;
  chief: boolean;
  age: number;
  tool: ToolId | null;
  carry: number;
  carryKind: FoodKind | null;
  wild?: WildKind;
  herd?: number;
  pet?: boolean;
  hx?: number;
  hy?: number;
  slot: number;
}

export interface TribalSave {
  v: 1;
  time: number;
  day: number;
  food: number;
  stance: Stance;
  stats: StageStats;
  toolHuts: (ToolId | null)[];
  tribes: { relation: number; base: number; admiration: number; state: 'active' | 'allied' | 'defeated'; hutHp: number; food: number; raidT: number; giftT: number; thiefT: number; since: number }[];
  totem: { tribe: number; allied: boolean }[];
  units: SavedUnit[];
  trees: number[];
  eggs: number;
  drops: { kind: NodeKind; food: FoodKind; x: number; y: number; amount: number; max: number; ttl: number }[];
  abilities: { id: string; cd: number }[];
  snares: { x: number; y: number; ttl: number }[];
  chiefT: number;
  titanPlan: number[];
  outfitOffered: boolean;
  homeName: string;
  herdRespawn: number[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function serializeStage(st: TribalStage): TribalSave {
  const units: SavedUnit[] = [];
  for (const u of st.units) {
    if (u.dead || u.kind === 'porter') continue;
    // Charmed beasts return to the wild on load.
    const team = u.charmed ? WILD : u.team;
    units.push({
      kind: u.kind as 'member' | 'animal', team, dIdx: u.dIdx, x: r1(u.x), y: r1(u.y), hp: r1(u.hp), chief: u.chief, age: r1(u.age),
      tool: u.tool, carry: u.carry, carryKind: u.carryKind, wild: u.wild, herd: u.herd, pet: u.pet, hx: u.hx, hy: u.hy, slot: u.slot,
    });
  }
  return {
    v: 1,
    time: r1(st.time),
    day: st.day,
    food: r1(st.food),
    stance: st.stance,
    stats: { ...st.stats },
    toolHuts: st.toolHuts.map((t) => t?.tool ?? null),
    tribes: st.tribes.map((t) => ({ relation: r1(t.relation), base: t.base, admiration: r1(t.admiration), state: t.state, hutHp: r1(t.hutHp), food: r1(t.food), raidT: r1(t.raidT), giftT: r1(t.giftT), thiefT: r1(t.thiefT), since: r1(t.since) })),
    totem: st.totem.map((x) => ({ tribe: x.tribe, allied: x.allied })),
    units,
    trees: st.nodes.filter((n) => n.kind === 'tree').map((n) => r1(n.amount)),
    eggs: r1(st.eggNode.amount),
    drops: st.nodes.filter((n) => n.kind === 'carcass' || n.kind === 'cache').map((n) => ({ kind: n.kind, food: n.food, x: r1(n.x), y: r1(n.y), amount: n.amount, max: n.max, ttl: r1(n.ttl) })),
    abilities: st.abilities.map((a) => ({ id: a.def.id, cd: r1(a.cd) })),
    snares: st.snares.filter((s) => s.sprung <= 0).map((s) => ({ x: s.x, y: s.y, ttl: r1(s.ttl) })),
    chiefT: r1(st.chiefT),
    titanPlan: [...st.titanPlan],
    outfitOffered: st.outfitOffered,
    homeName: st.homeName,
    herdRespawn: st.herds.map((hd) => r1(hd.respawn)),
  };
}

export function restoreStage(st: TribalStage, s: TribalSave) {
  st.time = s.time;
  st.day = s.day;
  st.food = s.food;
  st.stance = s.stance;
  Object.assign(st.stats, s.stats);
  st.chiefT = s.chiefT;
  st.titanPlan = s.titanPlan;
  st.outfitOffered = s.outfitOffered;
  if (s.homeName) st.homeName = s.homeName;
  s.toolHuts.forEach((tool, i) => { st.toolHuts[i] = tool ? { slot: i, tool, grow: 1 } : null; });
  s.tribes.forEach((d, i) => {
    const t = st.tribes[i];
    if (!t) return;
    Object.assign(t, d);
    if (t.state === 'defeated') t.since = Math.max(t.since, 60);
  });
  st.totem = s.totem.map((x) => ({ ...x, t: 10 }));
  const trees = st.nodes.filter((n) => n.kind === 'tree');
  s.trees.forEach((a, i) => { if (trees[i]) trees[i].amount = a; });
  st.eggNode.amount = s.eggs;
  for (const d of s.drops) st.addNode(d.kind, d.food, d.x, d.y, d.x, d.y + 4, d.amount, d.max, 0, 0, -1, d.ttl);
  s.herdRespawn?.forEach((r, i) => { if (st.herds[i]) st.herds[i].respawn = r; });
  for (const su of s.units) {
    if (su.kind === 'member') {
      if (su.team !== PLAYER && !st.tribes[su.team - 1]) continue;
      const u = st.spawnMember(su.team, su.x, su.y, { chief: su.chief, baby: su.age < 1 });
      u.age = su.age;
      u.hp = Math.min(u.maxHp, su.hp);
      u.tool = su.tool;
      u.carry = su.carry;
      u.carryKind = su.carryKind;
      u.hx = su.hx;
      u.hy = su.hy;
      u.slot = su.slot;
      if (u.team >= 1 && st.tribes[u.team - 1].state === 'defeated') { u.dead = true; u.dying = 0.01; }
    } else if (su.pet) {
      const u = st.spawnPet(su.dIdx, { x: su.x, y: su.y });
      if (u) u.hp = Math.min(u.maxHp, su.hp);
    } else if (su.wild && st.designs[su.dIdx]) {
      const u = st.spawnAnimal(su.dIdx, su.x, su.y, su.wild, su.herd ?? -1);
      u.hp = Math.min(u.maxHp, su.hp);
      u.hx = su.hx;
      u.hy = su.hy;
      u.slot = su.slot;
    }
  }
  st.abilities = abilitiesFor(st.game.state!.cards, 'tribal').map((def) => ({ def, cd: s.abilities.find((a) => a.id === def.id)?.cd ?? 0 }));
  st.snares = s.snares.map((x) => ({ ...x, sprung: 0 }));
  st.rebuildObstacles();
  st.updatePets();
}
