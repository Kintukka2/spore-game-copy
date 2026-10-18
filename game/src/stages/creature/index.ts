import type { Scene } from '../../game/game';
import { StubStage } from '../stub';

/** Entry point for the creature stage. Replace StubStage with the real implementation. */
export function createCreatureStage(): Scene {
  return new StubStage('creature');
}
