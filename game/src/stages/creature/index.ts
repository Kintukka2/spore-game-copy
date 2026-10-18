// Creature stage entry point. See stage.ts for the scene and the sibling modules for its systems:
// world/terrain (island), species/ai (herds), combat, social (mini-game), events, progress, hud, render.
import type { Scene } from '../../game/game';
import { CreatureStage } from './stage';

export function createCreatureStage(): Scene {
  return new CreatureStage();
}
