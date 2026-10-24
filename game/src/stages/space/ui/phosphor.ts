// The phosphor colour every Fallout-style screen in the space stage shares: green, amber, blue or white, picked
// with the knob on the Nav-Boy. Screens either colour their own text with the --ph variables, or are drawn in
// greys and run through the #ph-f SVG filter, which turns brightness into that colour (pictures and emoji too).
export type PhColor = 'green' | 'amber' | 'blue' | 'white';
export const PH_ORDER: PhColor[] = ['green', 'amber', 'blue', 'white'];
export const PH: Record<PhColor, { rgb: [number, number, number]; name: string }> = {
  green: { rgb: [26, 255, 128], name: 'Green' },
  amber: { rgb: [255, 182, 66], name: 'Amber' },
  blue: { rgb: [64, 200, 255], name: 'Blue' },
  white: { rgb: [226, 240, 255], name: 'White' },
};

let current: PhColor = 'green';
let matrix: SVGFEColorMatrixElement | null = null;

const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${a})`;

/** The SVG filter screens use to go monochrome: luminance times the phosphor colour. */
function ensureFilter() {
  if (matrix?.isConnected) return matrix;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  const f = document.createElementNS(NS, 'filter');
  f.setAttribute('id', 'ph-f');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  matrix = document.createElementNS(NS, 'feColorMatrix');
  matrix.setAttribute('type', 'matrix');
  f.append(matrix);
  svg.append(f);
  document.body.append(svg);
  return matrix;
}

/** Switch every phosphor screen to `c`. */
export function applyPhosphor(c: PhColor) {
  current = c;
  const rgb = PH[c].rgb;
  const s = document.body.style;
  s.setProperty('--ph', rgba(rgb, 1));
  s.setProperty('--ph-hi', `rgb(${rgb.map((v) => Math.round(v + (255 - v) * 0.55)).join(',')})`);
  s.setProperty('--ph-dim', rgba(rgb, 0.6));
  s.setProperty('--ph-faint', rgba(rgb, 0.28));
  s.setProperty('--ph-bg', rgba(rgb, 0.13));
  s.setProperty('--ph-glow', rgba(rgb, 0.55));
  s.setProperty('--ph-dark', `rgb(${rgb.map((v) => Math.round(v * 0.035)).join(',')})`);
  // A slight lift so mid-greys still read as lit phosphor rather than murk.
  const [r, g, b] = rgb.map((v) => (v / 255) * 1.08);
  const row = (k: number) => `${(k * 0.2126).toFixed(4)} ${(k * 0.7152).toFixed(4)} ${(k * 0.0722).toFixed(4)} 0 0`;
  ensureFilter().setAttribute('values', `${row(r)} ${row(g)} ${row(b)} 0 0 0 1 0`);
}

export const phColor = () => current;
/** The phosphor colour as CSS, at alpha `a`, for drawing on canvases. */
export const ph = (a = 1) => rgba(PH[current].rgb, a);
