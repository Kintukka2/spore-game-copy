import type { AbilityId } from '../design/types';

export const ABILITY_INFO: Record<AbilityId, { icon: string; name: string }> = {
  bite: { icon: '🦷', name: 'Bite' },
  charge: { icon: '💥', name: 'Charge' },
  strike: { icon: '🗡️', name: 'Strike' },
  spit: { icon: '💧', name: 'Spit' },
  sing: { icon: '🎵', name: 'Sing' },
  dance: { icon: '💃', name: 'Dance' },
  charm: { icon: '✨', name: 'Charm' },
  pose: { icon: '🙌', name: 'Pose' },
  speed: { icon: '🏃', name: 'Speed' },
  sprint: { icon: '⚡', name: 'Sprint' },
  sneak: { icon: '🥷', name: 'Sneak' },
  jump: { icon: '🦘', name: 'Jump' },
  glide: { icon: '🪽', name: 'Glide' },
  health: { icon: '❤️', name: 'Health' },
  sight: { icon: '👁️', name: 'Sight' },
  grasp: { icon: '✋', name: 'Grasp' },
  call: { icon: '📣', name: 'Call' },
  gather: { icon: '🧺', name: 'Gather' },
  combat: { icon: '⚔️', name: 'Combat' },
  social: { icon: '🎶', name: 'Social' },
  power: { icon: '🔥', name: 'Power' },
  armor: { icon: '🛡️', name: 'Armor' },
  move: { icon: '🛞', name: 'Speed' },
  cargo: { icon: '📦', name: 'Cargo' },
  faith: { icon: '🕊️', name: 'Faith' },
  trade: { icon: '💰', name: 'Trade' },
  energy: { icon: '🔋', name: 'Energy' },
  shield: { icon: '🛡️', name: 'Shield' },
  happy: { icon: '😊', name: 'Joy' },
  produce: { icon: '🏭', name: 'Output' },
  house: { icon: '🏠', name: 'Housing' },
};

export const CREATURE_STATS: AbilityId[] = ['bite', 'charge', 'strike', 'spit', 'sing', 'dance', 'charm', 'pose', 'speed', 'sprint', 'sneak', 'jump', 'glide', 'health', 'sight', 'grasp'];

/** What the less obvious abilities do, shown on the editor's part card. */
export const ABILITY_HELP: Partial<Record<AbilityId, string>> = {
  sight: 'Sight widens your view and minimap and spots nests and bone piles from farther away.',
  grasp: 'Grasp digs up bone piles faster and picks more food from each bush.',
};
export const CELL_STATS: AbilityId[] = ['speed', 'bite', 'charge', 'spit', 'strike'];
export const OUTFIT_STATS: AbilityId[] = ['gather', 'combat', 'social', 'health'];
export const VEHICLE_STATS: AbilityId[] = ['power', 'armor', 'move'];
export const SHIP_STATS: AbilityId[] = ['power', 'armor', 'move', 'energy'];
export const BUILDING_STATS: AbilityId[] = ['house', 'produce', 'happy'];
