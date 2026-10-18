// Start-of-stage diet choice, the starter cell designs it offers, and the finale caption.
import type { Game } from '../../game/game';
import { audio } from '../../engine/audio';
import { h } from '../../engine/ui';
import { uid } from '../../engine/rng';
import { blankDesign } from '../../design/generate';
import { partsFor } from '../../design/registry';
import { drawThumb } from '../../design/render';
import type { Design, Palette, PartDef, PartInstance } from '../../design/types';

export type StartDiet = 'herbivore' | 'carnivore';

function place(d: Design, p: PartDef, node: number, a: number): PartInstance {
  const n = d.spine[node];
  return { uid: uid(), partId: p.id, node, ox: Math.cos(a) * n.r * 0.92, oy: Math.sin(a) * n.r * 0.92, rot: a, scale: 1, sym: Math.abs(Math.sin(a)) > 0.15 };
}

/** A newborn cell: one mouth for the chosen diet, a basic mover and a pair of eyes (tier-1 parts only). */
export function starterCell(diet: StartDiet, name: string, colors: Palette): Design {
  const d = blankDesign('cell', name);
  d.colors = { ...colors };
  const radii = diet === 'herbivore' ? [6, 9, 10, 10, 9, 7] : [5, 7, 8, 9, 9, 8];
  d.spine.forEach((n, i) => { n.r = radii[i] ?? n.r; });
  const head = d.spine.length - 1;
  const mouth = partsFor('cell', 'cell-mouth').find((p) => p.diet === diet && p.tier <= 1) ?? partsFor('cell', 'cell-mouth').find((p) => p.diet === diet);
  if (mouth) d.parts.push(place(d, mouth, head, 0));
  const move = partsFor('cell', 'cell-move').find((p) => p.tier <= 1 && !(p.stats.jump ?? 0) && !(p.stats.sprint ?? 0)) ?? partsFor('cell', 'cell-move')[0];
  if (move) d.parts.push(place(d, move, 0, Math.PI));
  const eye = partsFor('cell', 'cell-eye').find((p) => p.tier <= 1);
  if (eye) d.parts.push(place(d, eye, head - 1, -1.15));
  return d;
}

export interface DietChoice {
  tick(dt: number): void;
  close(): void;
}

export function showDietChoice(game: Game, designs: Record<StartDiet, Design>, onPick: (d: StartDiet) => void): DietChoice {
  const s = game.state!;
  const layer = game.layer('cell-choice-layer');
  const canvases: { c: HTMLCanvasElement; d: Design }[] = [];
  let picked = false;
  const card = (diet: StartDiet, cls: string, name: string, icon: string, mouth: string, desc: string) => {
    const c = h('canvas', { width: '160', height: '110' }) as HTMLCanvasElement;
    canvases.push({ c, d: designs[diet] });
    const b = h('button', { class: 'cell-card ' + cls, 'aria-label': name },
      c,
      h('div', { class: 'nm' }, `${icon} ${name}`),
      h('div', { class: 'mouth' }, mouth),
      h('div', { class: 'ds' }, desc),
      h('div', { class: 'go' }, 'Choose'));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (picked) return;
      picked = true;
      audio.unlock();
      audio.sfx('success');
      wrap.classList.add('out');
      setTimeout(() => layer.remove(), 500);
      onPick(diet);
    });
    return b;
  };
  const wrap = h('div', { class: 'cell-choice' },
    h('div', { class: 'title-tag' }, `The tide pools of ${s.planetName}`),
    h('h1', null, `How will the ${s.speciesName} survive?`),
    h('div', { class: 'sub' }, 'Pick a mouth for your newborn cell. What you eat in the pool shapes who you become.'),
    h('div', { class: 'cell-cards' },
      card('herbivore', 'herb', 'Herbivore', '🌿', 'Filter mouth', 'Graze on glowing plant flakes. Peaceful, steady, and best at hiding.'),
      card('carnivore', 'carn', 'Carnivore', '🥩', 'Jaw', 'Bite meat and swallow tiny cells. Fast-paced and dangerous.'),
    ),
    h('div', { class: 'faint', style: 'font-size:13px;max-width:340px' }, 'You can add other mouths later with Call Mate.'),
  );
  layer.append(wrap);
  let t = 0, acc = 0;
  const draw = () => { for (const { c, d } of canvases) drawThumb(c, d, { t, pad: 10 }); };
  requestAnimationFrame(draw);
  return {
    tick(dt: number) {
      t += dt;
      acc += dt;
      if (acc > 1 / 20 && !picked) { acc = 0; draw(); }
    },
    close() { layer.remove(); },
  };
}

export interface Caption {
  say(text: string): void;
  hide(): void;
}

export function makeCaption(game: Game): Caption {
  const el = h('div', { class: 'cell-caption' });
  game.layer().append(el);
  return {
    say(text: string) {
      el.classList.remove('on');
      setTimeout(() => { el.textContent = text; el.classList.add('on'); }, 250);
    },
    hide() { el.classList.remove('on'); },
  };
}
