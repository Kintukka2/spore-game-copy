// Stage 3: Tribal. A touch-first village RTS: gather food, build tool huts, and win over
// (music) or defeat (fire) the four neighbouring tribes. See docs/DESIGN.md, "Stage 3: Tribal".
import type { Scene } from '../../game/game';
import { TribalStage } from './stage';

export function createTribalStage(): Scene {
  return new TribalStage();
}
