// The Codex: browse, edit and delete creations; also shows a sample of procedurally generated wildlife.
import type { Game, Scene } from '../game/game';
import { button, h, ui } from '../engine/ui';
import { codexAll, codexDelete, codexSave, type CodexEntry } from '../game/codex';
import { drawThumb } from '../design/render';
import { cloneDesign, generateCell, generateCreature } from '../design/generate';
import { RNG } from '../engine/rng';
import type { Design, DesignKind } from '../design/types';
import { openEditor } from '../editor/editor';
import { ACHIEVEMENTS } from '../game/achievements';

const KINDS: { kind: DesignKind; label: string }[] = [
  { kind: 'creature', label: 'Creatures' }, { kind: 'cell', label: 'Cells' }, { kind: 'vehicle', label: 'Vehicles' },
  { kind: 'building', label: 'Buildings' }, { kind: 'ship', label: 'Ships' },
];

export class CodexScreen implements Scene {
  name = 'codex';
  music = 'menu' as const;
  private game!: Game;
  private kind: DesignKind = 'creature';
  private grid!: HTMLElement;
  private tabs!: HTMLElement;

  enter(game: Game) {
    this.game = game;
    const L = game.layer();
    this.tabs = h('div', { class: 'seg', style: 'width:100%;overflow-x:auto' });
    this.grid = h('div', { class: 'codex-grid scroll', style: 'flex:1' });
    L.append(h('div', { class: 'screen', style: 'justify-content:flex-start;gap:10px' },
      h('div', { class: 'row', style: 'width:100%' }, button('←', () => game.fade(() => game.setScene(game.screen('title'))), { cls: 'icon' }), h('h1', { style: 'font-size:26px' }, '📚 Codex')),
      this.tabs, this.grid));
    this.refresh();
  }

  private refresh() {
    this.tabs.innerHTML = '';
    for (const k of KINDS) {
      const b = h('button', { class: k.kind === this.kind ? 'on' : '' }, k.label);
      b.addEventListener('click', () => { this.kind = k.kind; this.refresh(); });
      this.tabs.append(b);
    }
    this.grid.innerHTML = '';
    const mine = codexAll(this.kind);
    const wild: CodexEntry[] = [];
    if (this.kind === 'creature' || this.kind === 'cell') {
      const r = new RNG(20260901);
      for (let i = 0; i < 12; i++) {
        const d = this.kind === 'cell' ? generateCell(r, r.pick(['herbivore', 'carnivore', 'omnivore']), r.int(1, 3)) : generateCreature(r, { level: r.int(1, 4) });
        wild.push({ id: 'wild' + i, design: d, author: 'Wild', created: 0, origin: 'wild' });
      }
    }
    if (mine.length === 0) this.grid.append(h('div', { class: 'dim', style: 'grid-column:1/-1;padding:8px;font-size:14px' }, 'Nothing saved here yet. Creations you save in any editor appear here, and wander into your future worlds.'));
    for (const e of [...mine, ...wild]) {
      const c = h('canvas', { style: 'width:92px;height:80px' }) as HTMLCanvasElement;
      const item = h('div', { class: 'codex-item' }, c, h('div', { class: 'cn' }, e.design.name), h('div', { class: 'ca' }, e.origin === 'wild' ? '🌿 Wild' : '★ ' + e.author));
      item.addEventListener('click', () => this.open(e));
      this.grid.append(item);
      requestAnimationFrame(() => drawThumb(c, e.design));
    }
  }

  private async open(e: CodexEntry) {
    const c = h('canvas', { style: 'width:100%;height:200px;border-radius:12px;background:rgba(0,0,0,.25)' }) as HTMLCanvasElement;
    const buttons = [{ id: 'edit', label: e.origin === 'wild' ? 'Edit a copy' : 'Edit' }];
    if (e.origin === 'player') buttons.unshift({ id: 'del', label: 'Delete' } as { id: string; label: string });
    buttons.push({ id: 'close', label: 'Close' });
    setTimeout(() => drawThumb(c, e.design), 30);
    const r = await ui.modal({ title: e.design.name, body: [c], buttons: buttons.map((b) => ({ ...b, primary: b.id === 'edit', danger: b.id === 'del' })), dismissable: true });
    if (r === 'del') {
      if (await ui.confirm('Delete?', `Remove “${e.design.name}” from the Codex?`, 'Delete')) { codexDelete(e.id); this.refresh(); }
    } else if (r === 'edit') {
      const d: Design = cloneDesign(e.design);
      const res = await openEditor(this.game, { design: d, mode: 'free' });
      if (res) { codexSave(res.design); this.refresh(); }
    }
  }

  exit() {}
  update() {}
  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    const gr = g.createLinearGradient(0, 0, 0, hh);
    gr.addColorStop(0, '#13324a');
    gr.addColorStop(1, '#060e18');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, hh);
  }
}

export class AchievementsScreen implements Scene {
  name = 'achievements';
  music = 'menu' as const;
  enter(game: Game) {
    const L = game.layer();
    const list = h('div', { class: 'list scroll', style: 'flex:1;overflow-y:auto' });
    const got = game.achievements;
    for (const a of ACHIEVEMENTS) {
      const has = got.has(a.id);
      if (a.hidden && !has) continue;
      list.append(h('div', { class: 'list-item', style: has ? '' : 'opacity:.45' }, h('div', { style: 'font-size:26px' }, has ? a.icon : '🔒'), h('div', null, h('b', null, a.name), h('div', { class: 'dim', style: 'font-size:13px' }, a.desc))));
    }
    L.append(h('div', { class: 'screen', style: 'justify-content:flex-start' },
      h('div', { class: 'row', style: 'width:100%' }, button('←', () => game.fade(() => game.setScene(game.screen('title'))), { cls: 'icon' }), h('h1', { style: 'font-size:26px' }, `🏆 Achievements ${got.size}/${ACHIEVEMENTS.length}`)),
      list));
  }
  exit() {}
  update() {}
  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    g.fillStyle = '#0a1422';
    g.fillRect(0, 0, w, hh);
  }
}
