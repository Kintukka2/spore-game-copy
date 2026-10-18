// Dev-only: ?gallery=creature|cell|outfit|vehicle|building|ship shows every part plus generated samples.
import type { Game, Scene } from '../game/game';
import { h } from '../engine/ui';
import { partsFor } from '../design/registry';
import { drawPartThumb, drawThumb } from '../design/render';
import { RNG } from '../engine/rng';
import { generateBuilding, generateCell, generateCreature, generateShip, generateVehicle } from '../design/generate';
import type { Design, DesignKind } from '../design/types';

export class GalleryScene implements Scene {
  name = 'gallery';
  constructor(private which: string) {}
  enter(game: Game) {
    const L = game.layer();
    const box = h('div', { class: 'scroll', style: 'position:absolute;inset:0;overflow-y:auto;padding:10px;pointer-events:auto' });
    L.append(box);
    const kind: DesignKind = this.which === 'outfit' ? 'creature' : (this.which as DesignKind);
    const parts = partsFor(kind).filter((p) => this.which !== 'outfit' ? !['hat', 'mask', 'chest', 'shoulder', 'trinket'].includes(p.category) : ['hat', 'mask', 'chest', 'shoulder', 'trinket'].includes(p.category));
    box.append(h('div', { style: 'font-weight:700;margin:4px 0 8px' }, `${this.which}: ${parts.length} parts`));
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px' });
    const colors = { base: '#ffb36b', coat: '#d9653b', detail: '#fff1d6', pattern: 'none' as const };
    for (const p of parts) {
      const c = h('canvas', { style: 'width:100%;height:64px;background:rgba(255,255,255,.06);border-radius:8px' }) as HTMLCanvasElement;
      grid.append(h('div', { style: 'font-size:9px;text-align:center' }, c, h('div', null, `${p.name} (${p.category} t${p.tier})`), h('div', { style: 'color:#ffd166' }, Object.entries(p.stats).map(([k, v]) => k + v).join(' '))));
      requestAnimationFrame(() => drawPartThumb(c, p, colors));
    }
    box.append(grid);
    const r = new RNG(42);
    const samples: Design[] = [];
    for (let i = 0; i < 8; i++) {
      if (kind === 'creature') samples.push(generateCreature(r, { level: 1 + (i % 4) }));
      if (kind === 'cell') samples.push(generateCell(r, r.pick(['herbivore', 'carnivore', 'omnivore']), 3));
      if (kind === 'vehicle') samples.push(generateVehicle(r, r.pick(['military', 'economic', 'religious']), r.pick(['land', 'land', 'sea', 'air'])));
      if (kind === 'building') samples.push(generateBuilding(r, r.pick(['cityhall', 'house', 'factory', 'entertainment'])));
      if (kind === 'ship') samples.push(generateShip(r));
    }
    const sg = h('div', { style: 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:12px' });
    for (const d of samples) {
      const c = h('canvas', { style: 'width:100%;height:130px;background:rgba(255,255,255,.06);border-radius:8px' }) as HTMLCanvasElement;
      sg.append(h('div', { style: 'font-size:10px;text-align:center' }, c, d.name));
      requestAnimationFrame(() => drawThumb(c, d));
    }
    box.append(h('div', { style: 'font-weight:700;margin-top:12px' }, 'Generated samples'), sg);
  }
  exit() {}
  update() {}
  render(g: CanvasRenderingContext2D, w: number, hh: number) { g.fillStyle = '#1b2a3a'; g.fillRect(0, 0, w, hh); }
}
