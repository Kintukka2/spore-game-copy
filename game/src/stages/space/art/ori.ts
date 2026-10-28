// Ori: a tiny glowing being with big eyes, two antennae and fluttering fins, riding a halo. Seen in full at the
// core; over the story's signals only as a dark, backlit silhouette (with the faintest glow at the antenna
// tips, for anyone paying attention).
import { TAU } from '../../../engine/math';
import { blit, glow } from './sprites';

export interface OriLook {
  /** Draw it as a backlit shadow: no colours, no face. */
  silhouette?: boolean;
}

export function drawOri(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, appear: number, o: OriLook = {}) {
  if (appear <= 0) appear = 1;
  const sil = !!o.silhouette;
  const R = 34 * s * (0.6 + 0.4 * appear);
  const ink = '#06040a';
  g.save();
  g.globalCompositeOperation = 'lighter';
  blit(g, glow(sil ? '#b98a4a' : '#ffe2a8', 64), x, y, R * (sil ? 4.4 : 3.6));
  g.globalCompositeOperation = 'source-over';
  // In silhouette every shape gets a warm rim of light from behind.
  if (sil) { g.shadowColor = 'rgba(255,205,140,0.85)'; g.shadowBlur = 16 * s; }
  // Halo ring it rides on
  g.strokeStyle = sil ? ink : 'rgba(255,240,200,0.9)';
  g.lineWidth = 4 * s;
  g.beginPath(); g.ellipse(x, y + R * 1.05, R * 1.4, R * 0.3, 0, 0, TAU); g.stroke();
  if (!sil) {
    g.strokeStyle = 'rgba(255,200,120,0.6)';
    g.lineWidth = 9 * s;
    g.beginPath(); g.ellipse(x, y + R * 1.05, R * 1.4, R * 0.3, 0, 0.1, Math.PI - 0.1); g.stroke();
  }
  // Fins
  const flap = Math.sin(t * 9) * 0.5;
  for (const side of [-1, 1]) {
    g.save();
    g.translate(x + side * R * 0.85, y + R * 0.1);
    g.rotate(side * (0.6 + flap));
    g.fillStyle = sil ? ink : 'rgba(255,190,220,0.85)';
    g.strokeStyle = sil ? ink : '#b8507a';
    g.lineWidth = 2 * s;
    g.beginPath(); g.ellipse(side * R * 0.35, 0, R * 0.45, R * 0.2, 0, 0, TAU); g.fill(); g.stroke();
    g.restore();
  }
  // Antennae
  for (const side of [-1, 1]) {
    const tipX = x + side * R * 0.75 + Math.sin(t * 2 + side) * 5 * s, tipY = y - R * 1.55 + Math.cos(t * 2.4 + side) * 4 * s;
    g.strokeStyle = sil ? ink : '#a0603a';
    g.lineWidth = 3 * s;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + side * R * 0.3, y - R * 0.8); g.quadraticCurveTo(x + side * R * 0.2, y - R * 1.4, tipX, tipY); g.stroke();
    g.save();
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = sil ? 0.22 + 0.12 * Math.sin(t * 3 + side) : 1;
    blit(g, glow('#9fe3ff', 24), tipX, tipY, 12 * s);
    g.restore();
    g.fillStyle = sil ? ink : '#e9fbff';
    g.beginPath(); g.arc(tipX, tipY, 4.5 * s, 0, TAU); g.fill();
  }
  // Body
  if (sil) g.fillStyle = ink;
  else {
    const bg = g.createRadialGradient(x - R * 0.3, y - R * 0.4, R * 0.1, x, y, R);
    bg.addColorStop(0, '#fffdf2');
    bg.addColorStop(0.5, '#ffd98a');
    bg.addColorStop(1, '#ff9e5c');
    g.fillStyle = bg;
  }
  g.strokeStyle = sil ? ink : '#8a4a20';
  g.lineWidth = 3 * s;
  g.beginPath(); g.ellipse(x, y, R, R * 0.95, 0, 0, TAU); g.fill(); g.stroke();
  g.shadowBlur = 0;
  if (sil) { g.restore(); return; }
  // Cheeks
  g.fillStyle = 'rgba(255,120,140,0.35)';
  for (const side of [-1, 1]) { g.beginPath(); g.ellipse(x + side * R * 0.55, y + R * 0.25, R * 0.16, R * 0.1, 0, 0, TAU); g.fill(); }
  // Eyes (with blinks)
  const blink = (t % 3.4) > 3.25 ? 0.12 : 1;
  for (const side of [-1, 1]) {
    const ex = x + side * R * 0.32, ey = y - R * 0.12;
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#5a3018';
    g.lineWidth = 2 * s;
    g.beginPath(); g.ellipse(ex, ey, R * 0.22, R * 0.27 * blink, 0, 0, TAU); g.fill(); g.stroke();
    if (blink > 0.5) {
      g.fillStyle = '#2a1a3a';
      g.beginPath(); g.ellipse(ex + R * 0.03, ey + R * 0.04, R * 0.13, R * 0.16, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(ex - R * 0.03, ey - R * 0.05, R * 0.05, 0, TAU); g.fill();
    }
  }
  // Smile
  g.strokeStyle = '#5a3018';
  g.lineWidth = 2.5 * s;
  g.beginPath(); g.arc(x, y + R * 0.22, R * 0.2, 0.2, Math.PI - 0.2); g.stroke();
  g.restore();
}
