import type { Scene } from '../../game/game';
import { SpaceStage } from './stage';

/**
 * Stage 5: Space. A seeded spiral galaxy to explore, trade across, terraform and colonise,
 * with AI empires, the Hollow ring around the core, and Ori waiting at the centre.
 * Module map:
 *   stage.ts       scene orchestration (views, travel, contact, superpowers, debug)
 *   world.ts       simulation state and progression; galaxy.ts generation
 *   empires.ts     AI empires, relations, diplomacy;  economy.ts spice, colonies, terraforming
 *   missions.ts    onboarding, main line and empire missions;  events.ts raids and eco-disasters
 *   combat.ts      real-time ship combat;  views/* galaxy map, system view, warp
 *   ui/*           HUD, planet panel, sheets;  art/* planets, ships, backdrop, particles
 *   ending.ts      the core cinematic and credits
 */
export function createSpaceStage(): Scene {
  return new SpaceStage();
}
