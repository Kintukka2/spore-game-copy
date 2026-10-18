// Colour helpers shared by renderers and part drawings.

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
/** amt > 0 lightens toward white, < 0 darkens toward black. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  const k = 1 + amt;
  return rgbToHex(r * k, g * k, b * k);
}
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function hsl(h: number, s: number, l: number): string {
  // h 0..360, s/l 0..1 -> hex
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
/** Outline colour for a given fill: a deep, saturated version of it. */
export function outlineOf(hex: string): string {
  return shade(hex, -0.62);
}
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** The editor's paint swatches. */
export const SWATCHES = [
  '#f2f2ee', '#c9c3b6', '#8a8580', '#4a4744', '#23211f', '#f7d9c4',
  '#ffd166', '#f6a93b', '#ff7a59', '#e9483b', '#b32545', '#ff5d8f',
  '#f7a8d0', '#c77dff', '#9b7bff', '#5a4fcf', '#3a5ba0', '#5cc8ff',
  '#3ee6c4', '#1fa38a', '#7bd389', '#4c9a2a', '#a7c957', '#d4e157',
  '#8d6e63', '#6d4c41', '#c08552', '#e0a96d', '#2a9d8f', '#264653',
  '#ffb4a2', '#e76f51', '#9d0208', '#14213d', '#fcbf49', '#00b4d8',
];
