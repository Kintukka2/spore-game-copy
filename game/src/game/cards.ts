// Consequence cards, the abilities they grant in later stages, and Space-stage archetypes.
// Mechanics mirror the original's structure; all names and effects are Sporadium's own.

export type StageId = 'cell' | 'creature' | 'tribal' | 'civ' | 'space';
export type CardStage = Exclude<StageId, 'space'>;
export type CardColor = 'green' | 'blue' | 'red';

export const STAGE_ORDER: StageId[] = ['cell', 'creature', 'tribal', 'civ', 'space'];
export const STAGE_NAMES: Record<StageId, string> = { cell: 'Cell', creature: 'Creature', tribal: 'Tribal', civ: 'Civilization', space: 'Space' };
export const STAGE_ICONS: Record<StageId, string> = { cell: '🦠', creature: '🦎', tribal: '🔥', civ: '🏙️', space: '🚀' };

export interface CardDef {
  stage: CardStage;
  color: CardColor;
  name: string;
  icon: string;
  blurb: string;
}

export const CARDS: Record<CardStage, Record<CardColor, CardDef>> = {
  cell: {
    green: { stage: 'cell', color: 'green', name: 'Herbivore', icon: '🌿', blurb: 'You grazed peacefully on plant life.' },
    blue: { stage: 'cell', color: 'blue', name: 'Omnivore', icon: '🍄', blurb: 'You ate whatever the tide brought in.' },
    red: { stage: 'cell', color: 'red', name: 'Carnivore', icon: '🥩', blurb: 'You hunted other cells for meat.' },
  },
  creature: {
    green: { stage: 'creature', color: 'green', name: 'Social', icon: '🤝', blurb: 'You won the world over with song and dance.' },
    blue: { stage: 'creature', color: 'blue', name: 'Adaptable', icon: '🦎', blurb: 'Friend or foe, you did what each moment needed.' },
    red: { stage: 'creature', color: 'red', name: 'Predator', icon: '🐾', blurb: 'You ruled the food chain from the top.' },
  },
  tribal: {
    green: { stage: 'tribal', color: 'green', name: 'Friendly', icon: '🎶', blurb: 'Your music united the tribes.' },
    blue: { stage: 'tribal', color: 'blue', name: 'Industrious', icon: '🔨', blurb: 'Your tribe built, gathered and traded.' },
    red: { stage: 'tribal', color: 'red', name: 'Aggressive', icon: '🔥', blurb: 'Your war-bands burned rival villages.' },
  },
  civ: {
    green: { stage: 'civ', color: 'green', name: 'Religious', icon: '🕊️', blurb: 'Your faith converted the world.' },
    blue: { stage: 'civ', color: 'blue', name: 'Economic', icon: '💰', blurb: 'Your trade empire bought the world.' },
    red: { stage: 'civ', color: 'red', name: 'Military', icon: '⚔️', blurb: 'Your armies conquered the world.' },
  },
};

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  /** Stage in which this ability is used. */
  stage: StageId;
  desc: string;
  /** Active abilities have a cooldown in seconds; passives have none. */
  cooldown?: number;
  /** Sporebuck/food cost if any (civ abilities). */
  cost?: number;
}

export const ABILITIES: Record<string, AbilityDef> = {
  // Creature stage (granted by the Cell card)
  lullaby: { id: 'lullaby', name: 'Lullaby', icon: '🎵', stage: 'creature', cooldown: 60, desc: 'Enchants nearby creatures: they stop attacking and are far easier to befriend, even hostile ones. No effect on Titans.' },
  flock: { id: 'flock', name: 'Flock Call', icon: '🐦', stage: 'creature', cooldown: 60, desc: 'Summons a flock of small winged allies that fight and socialize beside you for a while.' },
  roar: { id: 'roar', name: 'Terror Roar', icon: '😱', stage: 'creature', cooldown: 60, desc: 'Nearby creatures flee in fear. No effect on Titans or loners.' },
  // Tribal stage
  bounty: { id: 'bounty', name: 'Bounty Rain', icon: '🌧️', stage: 'tribal', cooldown: 90, desc: 'A warm rain makes fruit regrow and fall around your village.' },
  fishfrenzy: { id: 'fishfrenzy', name: 'Fish Frenzy', icon: '🐟', stage: 'tribal', cooldown: 90, desc: 'Fish leap onto the shore near your village, ready to collect.' },
  snares: { id: 'snares', name: 'Snares', icon: '🪤', stage: 'tribal', cooldown: 90, desc: 'Hidden traps around your village stun raiders and wild animals.' },
  fireworks: { id: 'fireworks', name: 'Fireworks', icon: '🎆', stage: 'tribal', cooldown: 120, desc: 'A dazzling display that improves relations with every nearby tribe.' },
  beastmaster: { id: 'beastmaster', name: 'Beastmaster', icon: '🐗', stage: 'tribal', cooldown: 120, desc: 'Your chieftain enchants nearby wild animals to fight for you.' },
  firebombs: { id: 'firebombs', name: 'Fire Bombs', icon: '💣', stage: 'tribal', cooldown: 120, desc: 'Your tribe hurls flaming pots that damage rival huts and fighters.' },
  // Civilization stage
  mend: { id: 'mend', name: 'Mending Aura', icon: '💚', stage: 'civ', cooldown: 60, cost: 1500, desc: 'Repairs your vehicles and buildings in an area.' },
  stasis: { id: 'stasis', name: 'Stasis Pulse', icon: '🧊', stage: 'civ', cooldown: 60, cost: 2000, desc: 'Freezes enemy vehicles and turrets in an area.' },
  bulwark: { id: 'bulwark', name: 'Bulwark', icon: '🛡️', stage: 'civ', cooldown: 60, cost: 2000, desc: 'Your vehicles in an area become invulnerable for a short time.' },
  goodwill: { id: 'goodwill', name: 'Goodwill Gala', icon: '🎉', stage: 'civ', cooldown: 90, cost: 2500, desc: 'A rival nation becomes friendly toward you for 90 seconds.' },
  bribebomb: { id: 'bribebomb', name: 'Bribe Bomb', icon: '💸', stage: 'civ', cooldown: 90, cost: 3000, desc: 'Money rains on enemy vehicles; they turn on each other.' },
  shockwave: { id: 'shockwave', name: 'Shockwave', icon: '💥', stage: 'civ', cooldown: 90, cost: 4000, desc: 'A bomb that damages all buildings and vehicles in an area.' },
  hush: { id: 'hush', name: 'Hush Cloud', icon: '🌫️', stage: 'civ', cooldown: 120, cost: 6000, desc: 'Silences a city: its entertainment and turrets shut down, speeding conversion or capture.' },
  adblitz: { id: 'adblitz', name: 'Ad Blitz', icon: '📣', stage: 'civ', cooldown: 120, cost: 6000, desc: 'A blimp campaign instantly fills a city\'s buyout meter.' },
  sunfire: { id: 'sunfire', name: 'Sunfire Bomb', icon: '☢️', stage: 'civ', cooldown: 150, cost: 16000, desc: 'Obliterates one city\'s defences and captures it. Every nation will hate you.' },
  // Civ superweapons (by nation type), need 6 cities
  'sw-religious': { id: 'sw-religious', name: 'Great Awakening', icon: '✨', stage: 'civ', cost: 12000, desc: 'Every remaining city converts to your faith. Costs §12,000 per city not yet yours. Needs 6 cities.' },
  'sw-economic': { id: 'sw-economic', name: 'Grand Merger', icon: '🤝', stage: 'civ', cost: 12000, desc: 'Buy out every remaining city at once. Costs §12,000 per city not yet yours. Needs 6 cities.' },
  'sw-military': { id: 'sw-military', name: 'Skyfall', icon: '🚀', stage: 'civ', cost: 12000, desc: 'Missiles disable every remaining city and you take them all. Costs §12,000 per city not yet yours. Needs 6 cities.' },
  // Space stage passives (one per card)
  'silver-tongue': { id: 'silver-tongue', name: 'Silver Tongue', icon: '🗣️', stage: 'space', desc: '20% off socialization tools.' },
  'jack-of-all': { id: 'jack-of-all', name: 'Jack of All Trades', icon: '🧰', stage: 'space', desc: '20% off standard equipment.' },
  overcharge: { id: 'overcharge', name: 'Overcharge', icon: '🔋', stage: 'space', desc: '+50% ship energy capacity.' },
  'crowd-pleaser': { id: 'crowd-pleaser', name: 'Crowd Pleaser', icon: '😊', stage: 'space', desc: 'Your colonies are happier and never revolt.' },
  'swift-drive': { id: 'swift-drive', name: 'Swift Drive', icon: '💨', stage: 'space', desc: 'Interstellar travel is a third faster.' },
  'iron-hull': { id: 'iron-hull', name: 'Iron Hull', icon: '🛡️', stage: 'space', desc: 'Your ship has 50% more health.' },
  'warm-welcome': { id: 'warm-welcome', name: 'Warm Welcome', icon: '👋', stage: 'space', desc: 'Every empire starts 10 points friendlier.' },
  'colony-boom': { id: 'colony-boom', name: 'Colony Boom', icon: '🏗️', stage: 'space', desc: '20% off colonization tools.' },
  'arms-deal': { id: 'arms-deal', name: 'Arms Dealer', icon: '🔫', stage: 'space', desc: '20% off weapons.' },
  'green-thumb': { id: 'green-thumb', name: 'Green Thumb', icon: '🌱', stage: 'space', desc: 'Far fewer ecological disasters on your worlds.' },
  'spice-sense': { id: 'spice-sense', name: 'Spice Sense', icon: '🧂', stage: 'space', desc: 'All your colonies produce more spice.' },
  'pirate-bane': { id: 'pirate-bane', name: 'Pirate Bane', icon: '🏴‍☠️', stage: 'space', desc: 'Pirates raid your colonies far less often.' },
};

/** Which ability each card grants in each later stage. */
export const CONSEQUENCES: Record<CardStage, Record<CardColor, Partial<Record<StageId, string>>>> = {
  cell: {
    green: { creature: 'lullaby', tribal: 'bounty', civ: 'mend', space: 'silver-tongue' },
    blue: { creature: 'flock', tribal: 'fishfrenzy', civ: 'stasis', space: 'jack-of-all' },
    red: { creature: 'roar', tribal: 'snares', civ: 'bulwark', space: 'overcharge' },
  },
  creature: {
    green: { tribal: 'fireworks', civ: 'goodwill', space: 'crowd-pleaser' },
    blue: { tribal: 'beastmaster', civ: 'bribebomb', space: 'swift-drive' },
    red: { tribal: 'firebombs', civ: 'shockwave', space: 'iron-hull' },
  },
  tribal: {
    green: { civ: 'hush', space: 'warm-welcome' },
    blue: { civ: 'adblitz', space: 'colony-boom' },
    red: { civ: 'sunfire', space: 'arms-deal' },
  },
  civ: {
    green: { space: 'green-thumb' },
    blue: { space: 'spice-sense' },
    red: { space: 'pirate-bane' },
  },
};

export type Cards = Partial<Record<CardStage, CardColor>>;

/** Abilities available in `stage` given the cards earned so far. */
export function abilitiesFor(cards: Cards, stage: StageId): AbilityDef[] {
  const out: AbilityDef[] = [];
  for (const cs of ['cell', 'creature', 'tribal', 'civ'] as CardStage[]) {
    const col = cards[cs];
    if (!col) continue;
    const id = CONSEQUENCES[cs][col][stage];
    if (id && ABILITIES[id]) out.push(ABILITIES[id]);
  }
  return out;
}

/** The civ-stage nation type is set by the Tribal card (green → religious, blue → economic, red → military). */
export type NationType = 'religious' | 'economic' | 'military';
export function nationTypeFor(cards: Cards): NationType {
  const c = cards.tribal ?? 'blue';
  return c === 'green' ? 'religious' : c === 'blue' ? 'economic' : 'military';
}

// ------------------------------------------------------------------ Archetypes

export type ArchetypeId = 'mystic' | 'merchant' | 'warlord' | 'envoy' | 'scholar' | 'prophet' | 'gardener' | 'minstrel' | 'paladin' | 'drifter';

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  philosophy: string;
  icon: string;
  color: string;
  blurb: string;
  power: { id: string; name: string; icon: string; desc: string; cooldown: number } | null;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  mystic: { id: 'mystic', name: 'Mystic', philosophy: 'Harmony', icon: '🌀', color: '#4cd97b', blurb: 'Lives in balance with all life. Peaceful and patient.', power: { id: 'homeward', name: 'Homeward Gate', icon: '🌀', desc: 'Open a portal that returns you to your homeworld from anywhere.', cooldown: 45 } },
  merchant: { id: 'merchant', name: 'Merchant', philosophy: 'Prosperity', icon: '💎', color: '#4aa8ff', blurb: 'Everything has a price, and every price can be met.', power: { id: 'handshake', name: 'Golden Handshake', icon: '🤝', desc: 'Instantly complete an economic takeover of a system you trade with.', cooldown: 240 } },
  warlord: { id: 'warlord', name: 'Warlord', philosophy: 'Force', icon: '⚔️', color: '#ff5a4f', blurb: 'Strength is the only law the stars respect.', power: { id: 'raidercall', name: 'Raider Call', icon: '🏴‍☠️', desc: 'Summon a pirate fleet to attack the planet you are orbiting.', cooldown: 240 } },
  envoy: { id: 'envoy', name: 'Envoy', philosophy: 'Order', icon: '📜', color: '#9fd8ff', blurb: 'Treaties, laws and alliances hold the galaxy together.', power: { id: 'stasisfield', name: 'Stasis Field', icon: '🧊', desc: 'Freeze every ship and turret in the system for a short time.', cooldown: 240 } },
  scholar: { id: 'scholar', name: 'Scholar', philosophy: 'Science', icon: '🔬', color: '#b39bff', blurb: 'Knowledge first. Ethics, eventually.', power: { id: 'gravcollapse', name: 'Gravity Collapse', icon: '🌑', desc: 'Destroy every city on a planet, leaving its wildlife intact. Breaks galactic law.', cooldown: 240 } },
  prophet: { id: 'prophet', name: 'Prophet', philosophy: 'Faith', icon: '🔥', color: '#ffb347', blurb: 'The faithful shall inherit the stars.', power: { id: 'fervor', name: 'Fervor', icon: '🙏', desc: 'Convert every city on a planet to your empire, intact. Breaks galactic law.', cooldown: 300 } },
  gardener: { id: 'gardener', name: 'Gardener', philosophy: 'Life', icon: '🌱', color: '#7bd389', blurb: 'Every world deserves a garden.', power: { id: 'arkbeam', name: 'Ark Beam', icon: '🛸', desc: 'Abduct two of every species on a planet at once.', cooldown: 240 } },
  minstrel: { id: 'minstrel', name: 'Minstrel', philosophy: 'Chance', icon: '🎸', color: '#ff7ab8', blurb: 'Life is a song. Improvise.', power: { id: 'serenade', name: 'Serenade', icon: '🎶', desc: 'Charm an empire into neutrality for two minutes.', cooldown: 120 } },
  paladin: { id: 'paladin', name: 'Paladin', philosophy: 'Force', icon: '🛡️', color: '#ffd166', blurb: 'Honour in battle, protection for the weak.', power: { id: 'squire', name: 'Squire', icon: '🛰️', desc: 'Summon a loyal miniature copy of your ship to fight beside you.', cooldown: 60 } },
  drifter: { id: 'drifter', name: 'Drifter', philosophy: 'Order', icon: '🧭', color: '#c9c3b6', blurb: 'A species with no past, free to become anything.', power: null },
};

/** Archetype from the colours of the earned cards (in stage order). */
export function archetypeFor(cards: Cards): ArchetypeId {
  const order: CardStage[] = ['cell', 'creature', 'tribal', 'civ'];
  const cols = order.map((s) => cards[s]).filter(Boolean) as CardColor[];
  const g = cols.filter((c) => c === 'green').length;
  const b = cols.filter((c) => c === 'blue').length;
  const r = cols.filter((c) => c === 'red').length;
  const pure: Record<CardColor, ArchetypeId> = { green: 'mystic', blue: 'merchant', red: 'warlord' };
  const n = cols.length;
  if (n === 0) return 'drifter';
  if (n === 1) return pure[cols[0]];
  if (g >= Math.max(3, n - 1) && g > b && g > r && n >= 3) return 'mystic';
  if (b >= Math.max(3, n - 1) && b > g && b > r && n >= 3) return 'merchant';
  if (r >= Math.max(3, n - 1) && r > g && r > b && n >= 3) return 'warlord';
  if (n === 4) {
    if (g === 2 && b === 2) return 'envoy';
    if (b === 2 && r === 2) return 'scholar';
    if (g === 2 && r === 2) return 'prophet';
    if (g === 2) return 'gardener';
    if (b === 2) return 'minstrel';
    return 'paladin';
  }
  // 2 or 3 cards
  if (g === n) return 'mystic';
  if (b === n) return 'merchant';
  if (r === n) return 'warlord';
  if (n === 3 && g === 1 && b === 1 && r === 1) return pure[cols[cols.length - 1]];
  if (r === 0) return 'envoy';
  if (g === 0) return 'scholar';
  return 'prophet';
}
