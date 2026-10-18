// Cached procedural sprites: soft glows, star cores, sparkles. Drawn once, blitted many times.
import { hexToRgb } from '../../../design/color';

const cache = new Map<string, HTMLCanvasElement>();

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** A soft radial glow in `color`, 2*r pixels wide. Draw with 'lighter' for additive light. */
export function glow(color: string, r = 32, falloff = 2.2): HTMLCanvasElement {
  const key = `g:${color}:${r}:${falloff}`;
  let c = cache.get(key);
  if (c) return c;
  c = canvas(r * 2, r * 2);
  const g = c.getContext('2d')!;
  const [R, G, B] = color.startsWith('#') ? hexToRgb(color) : [255, 255, 255];
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = Math.pow(1 - t, falloff);
    grad.addColorStop(t, `rgba(${R},${G},${B},${a.toFixed(3)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  cache.set(key, c);
  return c;
}

/** A bright star point: white core + coloured halo + faint cross flare. */
export function starSprite(color: string, r = 24): HTMLCanvasElement {
  const key = `s:${color}:${r}`;
  let c = cache.get(key);
  if (c) return c;
  c = canvas(r * 2, r * 2);
  const g = c.getContext('2d')!;
  const [R, G, B] = hexToRgb(color);
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, `rgba(${Math.min(255, R + 60)},${Math.min(255, G + 60)},${Math.min(255, B + 60)},0.95)`);
  grad.addColorStop(0.3, `rgba(${R},${G},${B},0.45)`);
  grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  g.globalCompositeOperation = 'lighter';
  const fl = g.createLinearGradient(0, r, r * 2, r);
  fl.addColorStop(0, `rgba(${R},${G},${B},0)`);
  fl.addColorStop(0.5, `rgba(255,255,255,0.35)`);
  fl.addColorStop(1, `rgba(${R},${G},${B},0)`);
  g.fillStyle = fl;
  g.fillRect(0, r - 0.7, r * 2, 1.4);
  const fl2 = g.createLinearGradient(r, 0, r, r * 2);
  fl2.addColorStop(0, `rgba(${R},${G},${B},0)`);
  fl2.addColorStop(0.5, `rgba(255,255,255,0.3)`);
  fl2.addColorStop(1, `rgba(${R},${G},${B},0)`);
  g.fillStyle = fl2;
  g.fillRect(r - 0.7, 0, 1.4, r * 2);
  cache.set(key, c);
  return c;
}

/** Draw a glow sprite centred at (x, y) with radius r. */
export function blit(g: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, r: number) {
  g.drawImage(img, x - r, y - r, r * 2, r * 2);
}
