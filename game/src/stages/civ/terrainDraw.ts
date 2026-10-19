// Terrain drawing shared by the Civilization stage and space-stage landings:
// the baked colour map (wrapped in x), coastlines, wave glints, mountains and trees.
import type { Camera } from '../../engine/camera';
import { mountainSprite, treeSprite, drawSprite } from './sprites';
import { TILE, TILE_X, TILE_Y, type Terrain } from './terrain';
import { H, W, wdx } from './types';

/** Screen-nearest copy of a wrapped world x. */
export const nearX = (cam: Camera, x: number): number => cam.x + wdx(cam.x, x);

export function drawTerrainMap(g: CanvasRenderingContext2D, cam: Camera, T: Terrain, t: number) {
  const b = cam.bounds(4);
  const tw = T.tex.width / W;
  g.imageSmoothingEnabled = true;
  for (let k = -1; k <= 1; k++) {
    const x0 = Math.max(b.x0, k * W), x1 = Math.min(b.x1, (k + 1) * W);
    if (x1 <= x0) continue;
    const y0 = Math.max(0, b.y0), y1 = Math.min(H, b.y1);
    if (y1 <= y0) continue;
    const sx = (x0 - k * W) * tw, sy = y0 * tw, sw = (x1 - x0) * tw, sh = (y1 - y0) * tw;
    g.drawImage(T.tex, sx, sy, Math.max(1, sw), Math.max(1, sh), x0, y0, x1 - x0, y1 - y0);
  }
  // Coastlines and the continental shelf (only tiles in view; the texture carries a baked outline when far out).
  const z = cam.zoom;
  if (z >= 0.42) {
    g.lineCap = 'round';
    const ty0 = Math.max(0, Math.floor(b.y0 / TILE)), ty1 = Math.min(TILE_Y - 1, Math.floor(b.y1 / TILE));
    const tx0 = Math.floor(b.x0 / TILE), tx1 = Math.floor(b.x1 / TILE);
    const [shelf, surf, edge] = T.look.coast;
    for (let pass = 0; pass < 3; pass++) {
      if (pass === 0) { g.strokeStyle = shelf; g.lineWidth = 1.2 / z; }
      else if (pass === 1) { g.strokeStyle = surf; g.lineWidth = 5 / z; }
      else { g.strokeStyle = edge; g.lineWidth = 1.4 / z; }
      for (let tx = tx0; tx <= tx1; tx++) {
        const k = Math.floor((tx * TILE) / W);
        const ix = ((tx % TILE_X) + TILE_X) % TILE_X;
        for (let ty = ty0; ty <= ty1; ty++) {
          const path = pass === 0 ? T.shelfTiles[ty * TILE_X + ix] : T.coastTiles[ty * TILE_X + ix];
          if (k !== 0) { g.save(); g.translate(k * W, 0); g.stroke(path); g.restore(); }
          else g.stroke(path);
        }
      }
    }
  }
  // Animated wave glints.
  if (z > 0.35 && T.look.wave) {
    g.strokeStyle = T.look.wave;
    g.lineWidth = 1.5;
    g.beginPath();
    for (const wv of T.waves) {
      const x = nearX(cam, wv.x);
      if (x < b.x0 || x > b.x1 || wv.y < b.y0 || wv.y > b.y1) continue;
      const p = (t * 0.25 + wv.v) % 1;
      const r = 6 * wv.s;
      const xx = x + p * 14;
      g.moveTo(xx - r, wv.y);
      g.quadraticCurveTo(xx, wv.y - r * 0.6 * Math.sin(p * Math.PI), xx + r, wv.y);
    }
    g.stroke();
  }
}

export function drawTerrainDecor(g: CanvasRenderingContext2D, cam: Camera, T: Terrain) {
  if (cam.zoom < 0.3) return;
  const b = cam.bounds(60);
  const { leaf, rockTint } = T.look;
  for (const m of T.mountains) {
    if (m.y < b.y0 || m.y > b.y1 + 40) continue;
    const x = nearX(cam, m.x);
    if (x < b.x0 || x > b.x1) continue;
    drawSprite(g, mountainSprite(m.v, !!m.snow, rockTint), x, m.y, m.s * 0.75);
  }
  for (const tr of T.trees) {
    if (tr.y < b.y0 || tr.y > b.y1 + 30) continue;
    const x = nearX(cam, tr.x);
    if (x < b.x0 || x > b.x1) continue;
    drawSprite(g, treeSprite(tr.v, leaf), x, tr.y, tr.s * 0.85);
  }
}
