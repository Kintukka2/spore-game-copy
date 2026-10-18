// Debug helpers: jump straight into any stage with a plausible generated species.
import type { Game } from './game';
import { RNG } from '../engine/rng';
import { generateCell, generateCreature } from '../design/generate';
import { STAGE_ORDER, type CardColor, type CardStage, type StageId, archetypeFor } from './cards';
import { planetName, speciesName } from './names';
import { partsFor } from '../design/registry';

export function debugState(game: Game, stage: StageId, seed: number, cards?: string) {
  const r = new RNG(seed);
  const s = game.newState({ planetName: planetName(r), speciesName: speciesName(r), difficulty: 'normal', seed });
  s.stage = stage;
  const diet = r.pick(['herbivore', 'carnivore', 'omnivore'] as const);
  s.cell = generateCell(r, diet, 2, s.speciesName);
  if (STAGE_ORDER.indexOf(stage) >= 1) {
    s.creature = generateCreature(r, { level: 3, diet, name: s.speciesName });
    s.unlocked = partsFor('creature').filter((p) => p.tier <= 2).map((p) => p.id);
  }
  const cols: CardColor[] = ['green', 'blue', 'red'];
  const order: CardStage[] = ['cell', 'creature', 'tribal', 'civ'];
  order.forEach((cs, i) => {
    if (i < STAGE_ORDER.indexOf(stage)) {
      const forced = cards?.[i];
      s.cards[cs] = forced === 'g' ? 'green' : forced === 'b' ? 'blue' : forced === 'r' ? 'red' : r.pick(cols);
    }
  });
  if (stage === 'space') s.archetype = archetypeFor(s.cards);
  if (STAGE_ORDER.indexOf(stage) >= 2 && s.creature) s.allies = [generateCreature(r, { level: 2 })];
  return s;
}
