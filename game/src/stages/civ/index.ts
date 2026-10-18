import type { Scene } from '../../game/game';
import { CivStage } from './stage';

/** Entry point for the Civilization stage. */
export function createCivStage(): Scene {
  return new CivStage();
}
