import type { Scene } from '../../game/game';
import { CellStage } from './stage';

/** Entry point for the Cell stage: a microbe in a glowing tide pool. */
export function createCellStage(): Scene {
  return new CellStage();
}
