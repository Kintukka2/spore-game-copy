// Shared building blocks for stage HUDs so every stage looks and behaves consistently.
import type { Game } from '../game/game';
import { button, h, progressBar, ui } from '../engine/ui';
import { openSettings } from '../screens/settings';
import { STAGE_ICONS, STAGE_NAMES, type StageId } from '../game/cards';

export interface StageHud {
  root: HTMLElement;
  top: HTMLElement;
  /** Main stage progress bar (top centre). */
  progress: ReturnType<typeof progressBar>;
  /** A small line under the top bar describing the current goal. */
  setObjective(text: string): void;
  /** Right side of the top bar: put currency chips here. */
  right: HTMLElement;
  /** Bottom-right area for ability buttons. */
  actions: HTMLElement;
  /** Bottom-left area (above the joystick zone) for secondary buttons. */
  left: HTMLElement;
}

export function createStageHud(game: Game, stage: StageId, opts: { onPause?: () => void; onResume?: () => void } = {}): StageHud {
  const root = game.layer('stage-hud');
  const progress = progressBar();
  progress.el.style.flex = '1';
  const right = h('div', { class: 'row' });
  const pause = button('⏸', () => pauseMenu(game, opts), { cls: 'icon', title: 'Pause' });
  const top = h('div', { class: 'hud-top' },
    pause,
    h('div', { class: 'chip', title: STAGE_NAMES[stage] }, STAGE_ICONS[stage]),
    progress.el,
    right);
  const obj = h('div', { class: 'objective', style: 'position:absolute;left:calc(10px + var(--safe-l));top:calc(60px + var(--safe-t));pointer-events:none' });
  obj.style.display = 'none';
  const actions = h('div', { class: 'hud-right' });
  const left = h('div', { style: 'position:absolute;left:calc(10px + var(--safe-l));bottom:calc(14px + var(--safe-b));display:flex;gap:8px;flex-direction:column;align-items:flex-start' });
  root.append(top, obj, actions, left);
  return {
    root, top, progress, right, actions, left,
    setObjective(text: string) {
      obj.textContent = text;
      obj.style.display = text ? '' : 'none';
    },
  };
}

export async function pauseMenu(game: Game, opts: { onPause?: () => void; onResume?: () => void } = {}) {
  opts.onPause?.();
  const s = game.state;
  const body = h('div', { class: 'col' },
    s ? h('div', { class: 'dim' }, `${s.speciesName} of ${s.planetName} · ${STAGE_NAMES[s.stage]} stage`) : null,
    s ? h('div', { class: 'faint', style: 'font-size:13px' }, `Played ${Math.floor(s.playSeconds / 60)} min`) : null,
  );
  const r = await ui.modal({ title: 'Paused', body, buttons: [{ id: 'settings', label: '⚙️ Settings' }, { id: 'quit', label: 'Save & quit' }, { id: 'resume', label: 'Resume', primary: true }], dismissable: true });
  if (r === 'settings') { await openSettings(game); return pauseMenu(game, opts); }
  if (r === 'quit') { game.goTitle(); return; }
  opts.onResume?.();
}

/** Helper: a chip showing an icon + value, returns a setter. */
export function chip(icon: string, initial = ''): { el: HTMLElement; set: (v: string | number) => void } {
  const val = h('span', null, String(initial));
  const el = h('div', { class: 'chip' }, icon, ' ', val);
  return { el, set: (v) => { val.textContent = String(v); } };
}
