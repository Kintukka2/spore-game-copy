// Between-stage screen: reveals the consequence card, the abilities it grants, and (after Civ) the archetype.
import type { Game, Scene } from '../game/game';
import { button, h } from '../engine/ui';
import { audio } from '../engine/audio';
import { ABILITIES, ARCHETYPES, CARDS, CONSEQUENCES, type CardColor, type CardStage, STAGE_NAMES, STAGE_ORDER } from '../game/cards';
import { TAU } from '../engine/math';
import { drawThumb } from '../design/render';

export interface EvolveArgs { stage: CardStage; card: CardColor; summary: string[] }

export function miniCards(cards: Partial<Record<CardStage, CardColor>>): HTMLElement {
  const row = h('div', { class: 'mini-cards' });
  for (const s of ['cell', 'creature', 'tribal', 'civ'] as CardStage[]) {
    const c = cards[s];
    row.append(h('div', { class: 'mini-card ' + (c ?? 'empty'), title: c ? CARDS[s][c].name : STAGE_NAMES[s] }));
  }
  return row;
}

export class EvolveScreen implements Scene {
  name = 'evolve';
  music = 'victory' as const;
  private game!: Game;
  private t = 0;
  private color = '#4cd97b';
  constructor(private args: EvolveArgs) {}

  enter(game: Game) {
    this.game = game;
    const { stage, card, summary } = this.args;
    const def = CARDS[stage][card];
    this.color = card === 'green' ? '#4cd97b' : card === 'blue' ? '#4aa8ff' : '#ff5a4f';
    audio.sfx('card');
    setTimeout(() => audio.sfx('levelup'), 500);
    game.unlock(stage === 'cell' ? 'landfall' : stage === 'creature' ? 'evolver' : stage === 'tribal' ? 'chieftain' : 'unifier');
    const L = game.layer();
    const nextIdx = STAGE_ORDER.indexOf(stage) + 1;
    const next = STAGE_ORDER[nextIdx];
    const grants = Object.entries(CONSEQUENCES[stage][card])
      .map(([st, id]) => ({ st, a: ABILITIES[id as string] }))
      .filter((x) => x.a);
    const list = h('div', { class: 'ability-list' },
      ...grants.map(({ st, a }) => h('div', { class: 'ability-item' },
        h('div', { class: 'ai-icon' }, a.icon),
        h('div', null, h('div', { class: 'ai-stage' }, STAGE_NAMES[st as CardStage] + ' stage'), h('b', null, a.name), h('div', { style: 'font-size:13px' }, a.desc)))));
    const cardEl = h('div', { class: 'ccard ' + card, style: 'transform:rotateY(90deg) scale(.8);transition:transform .7s cubic-bezier(.2,1.4,.4,1)' },
      h('div', { class: 'cc-stage' }, STAGE_NAMES[stage] + ' stage'),
      h('div', { class: 'cc-icon' }, def.icon),
      h('div', { class: 'cc-name' }, def.name),
      h('div', { style: 'font-size:12px;opacity:.9' }, def.blurb));
    setTimeout(() => (cardEl.style.transform = 'none'), 80);
    const species = game.state?.creature ?? game.state?.cell;
    const thumb = h('canvas', { style: 'width:120px;height:90px' }) as HTMLCanvasElement;
    const content = h('div', { class: 'col', style: 'align-items:center;gap:12px;width:min(420px,94vw)' },
      h('div', { class: 'title-tag' }, 'Stage complete'),
      h('h1', { style: 'font-size:clamp(22px,7vw,30px);text-align:center;overflow-wrap:anywhere' }, `${game.state?.speciesName ?? ''} evolves!`),
      cardEl,
      species ? thumb : null,
      game.state ? miniCards(game.state.cards) : null,
      summary.length ? h('div', { class: 'dim tc', style: 'font-size:14px' }, ...summary.map((s) => h('div', null, s))) : null,
      grants.length ? h('div', { style: 'width:100%' }, h('div', { class: 'faint', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.1em;margin:4px 0 6px' }, 'Your choices echo forward'), list) : null,
    );
    if (stage === 'civ' && game.state?.archetype) {
      const a = ARCHETYPES[game.state.archetype];
      content.append(h('div', { class: 'panel col', style: `width:100%;border-color:${a.color};align-items:center;text-align:center` },
        h('div', { class: 'faint', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.1em' }, 'Your philosophy'),
        h('div', { style: 'font-size:40px' }, a.icon),
        h('h2', { style: `color:${a.color}` }, `${a.name} · ${a.philosophy}`),
        h('div', { class: 'dim', style: 'font-size:14px' }, a.blurb),
        a.power ? h('div', { style: 'font-size:13px;margin-top:6px' }, h('b', null, `${a.power.icon} ${a.power.name}: `), a.power.desc) : null));
    }
    content.append(button(next ? `Evolve to ${STAGE_NAMES[next]} ➜` : 'Continue', () => game.advance(), { cls: 'primary big block' }));
    L.append(h('div', { class: 'screen scroll', style: 'justify-content:flex-start;overflow-y:auto;pointer-events:auto' }, content));
    if (species) requestAnimationFrame(() => drawThumb(thumb, species));
  }
  exit() {}
  update(dt: number) { this.t += dt; }
  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    const gr = g.createRadialGradient(w / 2, hh * 0.3, 10, w / 2, hh * 0.3, Math.max(w, hh));
    gr.addColorStop(0, this.color + '55');
    gr.addColorStop(0.5, '#0a1626');
    gr.addColorStop(1, '#03070d');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, hh);
    g.save();
    g.translate(w / 2, hh * 0.3);
    g.rotate(this.t * 0.1);
    for (let i = 0; i < 16; i++) {
      g.rotate(TAU / 16);
      g.fillStyle = 'rgba(255,255,255,0.03)';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.max(w, hh), -40); g.lineTo(Math.max(w, hh), 40); g.fill();
    }
    g.restore();
  }
}
