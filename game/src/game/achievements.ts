// Achievement definitions. Stages unlock them via game.unlock(id).
export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  hidden?: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Cell
  { id: 'first-bite', name: 'First Bite', icon: '🍽️', desc: 'Eat your first morsel in the tide pool.' },
  { id: 'landfall', name: 'Landfall', icon: '🏝️', desc: 'Finish the Cell stage and crawl onto land.' },
  { id: 'gentle-giant', name: 'Gentle Giant', icon: '🕊️', desc: 'Finish the Cell stage without killing another cell.' },
  { id: 'completionist', name: 'Shard Hunter', icon: '☄️', desc: 'Unlock every cell part.' },
  { id: 'quickening', name: 'Quickening', icon: '⏱️', desc: 'Finish the Cell stage in under 6 minutes.' },
  { id: 'titan-cell', name: 'David and Goliath', icon: '🎯', desc: 'Defeat a giant cell.', hidden: true },
  // Creature
  { id: 'evolver', name: 'Evolver', icon: '🧠', desc: 'Finish the Creature stage.' },
  { id: 'befriender', name: 'Everyone\'s Friend', icon: '🤝', desc: 'Befriend 5 species in one Creature stage.' },
  { id: 'apex', name: 'Apex', icon: '☠️', desc: 'Drive 5 species to extinction in one Creature stage.' },
  { id: 'titan-slayer', name: 'Titan Slayer', icon: '🗡️', desc: 'Defeat a Titan creature.' },
  { id: 'pack-leader', name: 'Pack Leader', icon: '🐺', desc: 'Lead a full pack of three.' },
  { id: 'aviator', name: 'Aviator', icon: '🪽', desc: 'Glide 60 metres without touching the ground.' },
  { id: 'paleontologist', name: 'Paleontologist', icon: '🦴', desc: 'Dig up 10 bone piles.' },
  { id: 'slug-life', name: 'Slug Life', icon: '🐌', desc: 'Finish the Creature stage without legs.', hidden: true },
  // Tribal
  { id: 'chieftain', name: 'Chieftain', icon: '🪶', desc: 'Finish the Tribal stage.' },
  { id: 'harmony', name: 'Harmony', icon: '🎶', desc: 'Win over every rival tribe with music.' },
  { id: 'warpath', name: 'Warpath', icon: '🔥', desc: 'Defeat every rival tribe in battle.' },
  { id: 'rancher', name: 'Rancher', icon: '🥚', desc: 'Keep 3 domesticated animals.' },
  { id: 'no-losses', name: 'Watchful Elder', icon: '👁️', desc: 'Finish the Tribal stage without losing a tribe member.' },
  // Civ
  { id: 'unifier', name: 'Unifier', icon: '🌍', desc: 'Unite your homeworld and launch into space.' },
  { id: 'spice-baron', name: 'Spice Baron', icon: '🧂', desc: 'Control every spice geyser at once.' },
  { id: 'peacemaker', name: 'Peacemaker', icon: '☮️', desc: 'Win the Civilization stage by conversion or purchase alone.' },
  { id: 'iron-fist', name: 'Iron Fist', icon: '🪖', desc: 'Win the Civilization stage by military conquest alone.' },
  { id: 'architect', name: 'Architect', icon: '🏛️', desc: 'Design 5 buildings or vehicles.' },
  { id: 'superweapon', name: 'Last Resort', icon: '🚀', desc: 'Use a superweapon.', hidden: true },
  // Space
  { id: 'first-contact', name: 'First Contact', icon: '👽', desc: 'Meet another spacefaring species.' },
  { id: 'colonist', name: 'Colonist', icon: '🏠', desc: 'Found your first colony.' },
  { id: 'terraformer', name: 'Terraformer', icon: '🌎', desc: 'Raise a planet to the highest terraform level.' },
  { id: 'tycoon', name: 'Spice Tycoon', icon: '💰', desc: 'Earn §1,000,000 from trade.' },
  { id: 'alliance', name: 'Allied', icon: '🤝', desc: 'Form an alliance with another empire.' },
  { id: 'explorer', name: 'Explorer', icon: '🔭', desc: 'Visit 40 star systems.' },
  { id: 'empire', name: 'Empire Builder', icon: '👑', desc: 'Control 10 star systems.' },
  { id: 'hollow-contact', name: 'Into the Hollow', icon: '🤖', desc: 'Make contact with the Hollow.' },
  { id: 'core', name: 'The Heart of It All', icon: '🌌', desc: 'Reach the centre of the galaxy.' },
  { id: 'genesis', name: 'Gardener of Worlds', icon: '🌱', desc: 'Bring a dead world to life with the Genesis Seed.' },
  // General
  { id: 'designer', name: 'Designer', icon: '✏️', desc: 'Save 5 creations to the Codex.' },
  { id: 'archivist', name: 'Archivist', icon: '📚', desc: 'Save 20 creations to the Codex.' },
  { id: 'full-circle', name: 'Full Circle', icon: '♾️', desc: 'Play through every stage in one game.' },
  { id: 'cheater', name: 'Rule Bender', icon: '🃏', desc: 'Use a cheat.', hidden: true },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
