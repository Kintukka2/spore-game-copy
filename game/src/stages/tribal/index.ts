import type { Scene } from '../../game/game';
import { StubStage } from '../stub';

/** Entry point for the tribal stage. Replace StubStage with the real implementation. */
export function createTribalStage(): Scene {
  return new StubStage('tribal');
}
