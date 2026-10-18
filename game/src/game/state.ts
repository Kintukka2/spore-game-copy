// Persistent game state for one playthrough ("planet save").
import type { Design } from '../design/types';
import type { ArchetypeId, Cards, StageId } from './cards';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface HistoryEntry {
  stage: StageId;
  text: string;
  icon?: string;
  /** Wall-clock ms */
  at: number;
}

export interface GameState {
  v: 1;
  id: string;
  seed: number;
  planetName: string;
  speciesName: string;
  difficulty: Difficulty;
  stage: StageId;
  createdAt: number;
  playSeconds: number;
  cards: Cards;
  archetype?: ArchetypeId;
  /** The species' designs as they evolve. */
  cell: Design | null;
  creature: Design | null;
  /** Tribal clothing worn over the creature design (parts with kind 'creature' and outfit categories). */
  outfit: Design | null;
  /** Designs created in later stages (city hall, vehicles, ship). */
  designs: Record<string, Design>;
  /** Unlocked creature/cell part ids (stage progression unlocks). */
  unlocked: string[];
  /** Allied species brought from the Creature stage (become tribal pets). */
  allies: Design[];
  /** Free-form per-stage save blobs (each stage owns its own format). */
  stageData: Partial<Record<StageId, unknown>>;
  /** Cross-stage carry-over facts (e.g. homeCity name, homeworld seed). */
  carry: Record<string, string | number | boolean>;
  /** Counters for achievements and summaries. */
  stats: Record<string, number>;
  history: HistoryEntry[];
  usedCheats?: boolean;
}

export interface Settings {
  music: number;
  sfx: number;
  muted: boolean;
  reducedMotion: boolean;
  hints: boolean;
}

export const DEFAULT_SETTINGS: Settings = { music: 0.5, sfx: 0.8, muted: false, reducedMotion: false, hints: true };
