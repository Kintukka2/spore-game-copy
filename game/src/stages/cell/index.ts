import type { Scene } from '../../game/game';
import { StubStage } from '../stub';

/** Entry point for the cell stage. Replace StubStage with the real implementation. */
export function createCellStage(): Scene {
  return new StubStage('cell');
}
