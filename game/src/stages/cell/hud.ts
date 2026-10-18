// Cell-stage HUD: progress bar with level marks, DNA chip, health, diet meter, objective,
// the Call Mate button (pulses when you can afford something new) and the "Grow a brain" button.
// DOM writes only happen when a displayed value changes.
import type { Game } from '../../game/game';
import { abilityButton, button, h, ui } from '../../engine/ui';
import { createStageHud, type StageHud } from '../common';
import { DNA_GOAL, DNA_PER_LEVEL, LEVEL_NAMES, LEVELS } from './config';

export interface HudState {
  earned: number;
  dna: number;
  level: number;
  hp: number;
  maxHp: number;
  /** 0 = all plants, 1 = all meat, null = nothing eaten yet. */
  meatFrac: number | null;
  mateUnlocked: boolean;
  mateReady: boolean;
  newParts: number;
  canEvolve: boolean;
}

export class CellHud {
  readonly base: StageHud;
  private dnaChip: HTMLElement;
  private dnaVal: HTMLElement;
  private hpFill: HTMLElement;
  private hpMeter: HTMLElement;
  private hpNum: HTMLElement;
  private dietMk: HTMLElement;
  private dietLbl: HTMLElement;
  private obj: HTMLElement;
  private mate: ReturnType<typeof abilityButton>;
  private badge: HTMLElement;
  private brain: HTMLButtonElement;
  private vitals: HTMLElement;
  private last: Partial<Record<string, string | number | boolean>> = {};
  private objText = '';

  constructor(game: Game, cb: { onPause: () => void; onResume: () => void; onMate: () => void; onBrain: () => void }) {
    this.base = createStageHud(game, 'cell', { onPause: cb.onPause, onResume: cb.onResume });
    this.base.root.classList.add('cell-hud');
    this.base.progress.marks([1, 2, 3, 4].map((i) => i / LEVELS));
    this.dnaVal = h('span', { class: 'cell-dna' }, '0');
    this.dnaChip = h('div', { class: 'chip', title: 'DNA to spend in the Cell Creator' }, '🧬 ', this.dnaVal);
    this.base.right.append(this.dnaChip);

    this.hpFill = h('div', { class: 'fill' });
    this.hpMeter = h('div', { class: 'cell-meter' }, this.hpFill);
    this.hpNum = h('span', { class: 'cell-hpnum' }, '100');
    this.dietMk = h('div', { class: 'mk', style: 'left:50%' });
    this.dietLbl = h('span', { class: 'cell-diet-lbl' }, '');
    const diet = h('div', { class: 'cell-meter cell-diet', title: 'Diet: plants vs meat' }, this.dietMk);
    this.vitals = h('div', { class: 'cell-vitals' },
      h('div', { class: 'cell-vrow' }, h('span', { class: 'ic' }, '❤️'), this.hpMeter, this.hpNum),
      h('div', { class: 'cell-vrow' }, h('span', { class: 'ic' }, '🌿'), diet, h('span', { class: 'ic' }, '🥩')),
      h('div', { class: 'cell-vrow', style: 'justify-content:center' }, this.dietLbl),
    );
    this.obj = h('div', { class: 'cell-objective' });
    this.obj.style.display = 'none';
    this.base.root.append(this.vitals, this.obj);

    this.mate = abilityButton('💞', 'Call Mate', cb.onMate, 'mate');
    this.badge = h('div', { class: 'cell-badge' }, 'NEW');
    this.badge.style.display = 'none';
    this.mate.el.append(this.badge);
    this.base.actions.style.gridTemplateColumns = 'auto';
    this.base.actions.style.bottom = 'calc(30px + var(--safe-b))';
    this.base.actions.append(this.mate.el);

    this.brain = button('🧠 Grow a brain!', cb.onBrain, { cls: 'gold cell-brain' });
    this.brain.style.display = 'none';
    this.base.root.append(this.brain);
  }

  setVisible(v: boolean) {
    this.base.root.style.visibility = v ? '' : 'hidden';
  }

  setObjective(text: string, flash = false) {
    if (text === this.objText && !flash) return;
    this.objText = text;
    this.obj.textContent = text;
    this.obj.style.display = text ? '' : 'none';
    if (flash) {
      this.obj.classList.remove('flash');
      void this.obj.offsetWidth;
      this.obj.classList.add('flash');
    }
  }

  private changed(key: string, v: string | number | boolean): boolean {
    if (this.last[key] === v) return false;
    this.last[key] = v;
    return true;
  }

  update(s: HudState) {
    const lvl = Math.min(LEVELS, s.level + 1);
    const earned = Math.min(DNA_GOAL, Math.floor(s.earned));
    if (this.changed('prog', earned) || this.changed('lvl', lvl)) {
      const label = earned >= DNA_GOAL ? 'Ready to evolve!' : `Level ${lvl} · ${LEVEL_NAMES[lvl - 1]} · ${earned - (lvl - 1) * DNA_PER_LEVEL}/${DNA_PER_LEVEL}`;
      this.base.progress.set(earned / DNA_GOAL, label);
    }
    const dna = Math.floor(s.dna);
    if (this.changed('dna', dna)) {
      this.dnaVal.textContent = String(dna);
      this.dnaChip.classList.remove('bump');
      void this.dnaChip.offsetWidth;
      this.dnaChip.classList.add('bump');
    }
    const hp = Math.max(0, Math.round((s.hp / s.maxHp) * 100));
    if (this.changed('hp', hp)) {
      this.hpFill.style.width = hp + '%';
      this.hpNum.textContent = String(hp);
      this.hpMeter.classList.toggle('low', hp <= 30);
    }
    const mf = s.meatFrac === null ? -1 : Math.round(s.meatFrac * 100);
    if (this.changed('diet', mf)) {
      this.dietMk.style.left = (mf < 0 ? 50 : mf) + '%';
      this.dietLbl.textContent = mf < 0 ? 'Diet: undecided' : mf >= 65 ? 'Carnivore' : mf <= 35 ? 'Herbivore' : 'Omnivore';
      this.dietLbl.style.color = mf < 0 ? '' : mf >= 65 ? '#ff8a80' : mf <= 35 ? '#7dffa0' : '#8fc8ff';
    }
    if (this.changed('mateU', s.mateUnlocked)) this.mate.el.classList.toggle('locked', !s.mateUnlocked);
    if (this.changed('mateR', s.mateReady)) this.mate.el.classList.toggle('ready', s.mateReady);
    if (this.changed('newp', s.newParts)) this.badge.style.display = s.newParts > 0 ? '' : 'none';
    if (this.changed('evolve', s.canEvolve)) this.brain.style.display = s.canEvolve ? '' : 'none';
  }

  mateCooldown(frac: number) { this.mate.setCooldown(frac); }

  /** Debug panel: +DNA, grow a level, spawn a shard, win. */
  debugPanel(actions: { label: string; fn: () => void }[]) {
    const box = h('div', { class: 'cell-debug' }, ...actions.map((a) => button(a.label, a.fn, { cls: 'small' })));
    this.base.root.append(box);
  }

  toast(msg: string, icon: string, kind: 'info' | 'good' | 'bad' | 'gold' = 'info', ms?: number) {
    ui.toast(msg, { icon, kind, ms });
  }
}
