import type { Scene } from '../../game/game';
import { StubStage } from '../stub';

/** Entry point for the civ stage. Replace StubStage with the real implementation. */
export function createCivStage(): Scene {
  return new StubStage('civ');
}
