import './styles.css';
import './design/parts';
import { Game } from './game/game';
import { TitleScreen } from './screens/title';
import { NewGameScreen } from './screens/newgame';
import { IntroScene } from './screens/intro';
import { EvolveScreen, type EvolveArgs } from './screens/evolve';
import { AchievementsScreen, CodexScreen } from './screens/codex';
import { createCellStage } from './stages/cell';
import { createCreatureStage } from './stages/creature';
import { createTribalStage } from './stages/tribal';
import { createCivStage } from './stages/civ';
import { createSpaceStage } from './stages/space';
import { debugState } from './game/debug';
import { openEditor } from './editor/editor';
import { blankDesign } from './design/generate';
import type { StageId } from './game/cards';
import type { DesignKind } from './design/types';

const game = new Game(document.getElementById('game') as HTMLCanvasElement, document.getElementById('ui') as HTMLElement);
game.registerScreen('title', () => new TitleScreen());
game.registerScreen('newgame', () => new NewGameScreen());
game.registerScreen('intro', () => new IntroScene());
game.registerScreen('evolve', (a) => new EvolveScreen(a as EvolveArgs));
game.registerScreen('codex', () => new CodexScreen());
game.registerScreen('achievements', () => new AchievementsScreen());
game.registerStage('cell', createCellStage);
game.registerStage('creature', createCreatureStage);
game.registerStage('tribal', createTribalStage);
game.registerStage('civ', createCivStage);
game.registerStage('space', createSpaceStage);

const q = new URLSearchParams(location.search);
game.debug = q.has('debug');
(window as unknown as { __game: Game }).__game = game;

const stage = q.get('stage') as StageId | null;
const editor = q.get('editor') as DesignKind | null;
const screen = q.get('screen');
if (stage) {
  debugState(game, stage, Number(q.get('seed') ?? 1), q.get('cards') ?? undefined);
  game.setScene(new TitleScreen());
  game.startStage(stage);
} else if (editor) {
  game.setScene(new TitleScreen());
  openEditor(game, { design: blankDesign(editor, 'Test ' + editor), mode: 'free' });
} else if (screen) {
  game.setScene(game.screen(screen));
} else {
  game.setScene(new TitleScreen());
}
game.start();
