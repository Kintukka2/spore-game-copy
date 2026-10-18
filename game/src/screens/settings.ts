import type { Game } from '../game/game';
import { h, ui } from '../engine/ui';

export async function openSettings(game: Game) {
  const s = game.settings;
  const slider = (label: string, val: number, on: (v: number) => void) => {
    const inp = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(val), style: 'width:100%;accent-color:#3ee6c4' }) as HTMLInputElement;
    inp.addEventListener('input', () => { on(Number(inp.value)); game.saveSettings(); });
    return h('div', { class: 'field' }, h('label', null, label), inp);
  };
  const toggle = (label: string, val: boolean, on: (v: boolean) => void) => {
    const cb = h('input', { type: 'checkbox', style: 'width:22px;height:22px;accent-color:#3ee6c4' }) as HTMLInputElement;
    cb.checked = val;
    cb.addEventListener('change', () => { on(cb.checked); game.saveSettings(); });
    return h('label', { class: 'row', style: 'justify-content:space-between;padding:6px 0' }, h('span', null, label), cb);
  };
  const body = h('div', { class: 'col', style: 'gap:14px' },
    slider('Music', s.music, (v) => (s.music = v)),
    slider('Sound effects', s.sfx, (v) => (s.sfx = v)),
    toggle('Mute everything', s.muted, (v) => (s.muted = v)),
    toggle('Show hints', s.hints, (v) => (s.hints = v)),
  );
  const r = await ui.modal({ title: 'Settings', body, buttons: [{ id: 'reset', label: 'Delete save', danger: true }, { id: 'ok', label: 'Done', primary: true }], dismissable: true });
  if (r === 'reset') {
    const ok = await ui.confirm('Delete your save?', 'This erases your current planet. Codex creations and achievements are kept.', 'Delete', 'Cancel');
    if (ok) { game.deleteSave(); game.setScene(game.screen('title')); }
  }
}
