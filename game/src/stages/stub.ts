// Placeholder stage used until a real stage implementation is registered.
import type { Game, Scene } from '../game/game';
import { button, h } from '../engine/ui';
import { STAGE_NAMES, type StageId } from '../game/cards';
import { renderCell, renderDesign } from '../design/render';
import { createStageHud } from './common';

export class StubStage implements Scene {
  name: string;
  private game!: Game;
  private t = 0;
  constructor(private id: StageId) { this.name = id; }
  enter(game: Game) {
    this.game = game;
    const hud = createStageHud(game, this.id);
    hud.progress.set(0.5, STAGE_NAMES[this.id] + ' stage (placeholder)');
    const box = h('div', { class: 'screen', style: 'justify-content:flex-end;padding-bottom:120px' },
      h('div', { class: 'panel col', style: 'align-items:center' },
        h('div', null, 'This stage is under construction. Finish it as:'),
        h('div', { class: 'row' },
          button('🟢 Green', () => game.completeStage('green'), { cls: 'small' }),
          button('🔵 Blue', () => game.completeStage('blue'), { cls: 'small' }),
          button('🔴 Red', () => game.completeStage('red'), { cls: 'small' }))));
    hud.root.append(box);
  }
  exit() {}
  update(dt: number) { this.t += dt; }
  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    g.fillStyle = '#123';
    g.fillRect(0, 0, w, hh);
    const s = this.game.state;
    if (this.id === 'cell' && s?.cell) renderCell(g, s.cell, w / 2, hh / 2, -Math.PI / 2, 3, { t: this.t });
    else if (s?.creature) renderDesign(g, s.creature, w / 2, hh / 2, 2, { t: this.t, walk: 0.6, phase: this.t * 1.6 });
  }
}
