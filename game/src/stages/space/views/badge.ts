// Exploration tags drawn next to stars and planets: a teal check once visited or scanned,
// a gold check once a whole system is surveyed, and a faint question mark for the unknown.
import { TAU } from '../../../engine/math';

export type ExploreMark = 'seen' | 'full' | 'unknown';

const RING: Record<ExploreMark, string> = { seen: '#3ee6c4', full: '#ffd166', unknown: 'rgba(170,185,205,0.55)' };

export function drawExploreBadge(g: CanvasRenderingContext2D, x: number, y: number, r: number, mark: ExploreMark) {
  g.fillStyle = 'rgba(4,12,24,0.88)';
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = RING[mark];
  g.lineWidth = r * 0.28;
  g.stroke();
  if (mark === 'unknown') {
    g.fillStyle = RING.unknown;
    g.font = `700 ${r * 1.45}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', x, y + r * 0.08);
    return;
  }
  g.lineWidth = r * 0.34;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x - r * 0.45, y + r * 0.02);
  g.lineTo(x - r * 0.1, y + r * 0.38);
  g.lineTo(x + r * 0.5, y - r * 0.36);
  g.stroke();
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
}
