import type { Scene } from '../../game/game';
import { StubStage } from '../stub';

/** Entry point for the space stage. Replace StubStage with the real implementation. */
export function createSpaceStage(): Scene {
  return new StubStage('space');
}
