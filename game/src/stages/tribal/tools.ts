// The nine tribal tools: definitions, unlock order and procedural in-hand drawings.
import type { Diet } from '../../design/types';
import type { ToolId } from './types';

export interface ToolDef {
  id: ToolId;
  name: string;
  icon: string;
  group: 'social' | 'weapon' | 'food' | 'heal';
  desc: string;
  /** Damage to creatures and to huts per hit. */
  dmg: number;
  hutDmg: number;
  range: number;
  cd: number;
  ranged?: boolean;
  burn?: boolean;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  drum: { id: 'drum', name: 'Drum', icon: '🥁', group: 'social', desc: 'Keeps the beat at concerts.', dmg: 3, hutDmg: 2, range: 26, cd: 1.1 },
  horn: { id: 'horn', name: 'Horn', icon: '📯', group: 'social', desc: 'A booming call for concerts.', dmg: 3, hutDmg: 2, range: 26, cd: 1.1 },
  rattle: { id: 'rattle', name: 'Rattle', icon: '🪇', group: 'social', desc: 'A shaker that crowds love.', dmg: 3, hutDmg: 2, range: 26, cd: 1.1 },
  spear: { id: 'spear', name: 'Spear', icon: '🗡️', group: 'weapon', desc: 'Thrown from range. Barely scratches huts.', dmg: 9, hutDmg: 1, range: 150, cd: 1.5, ranged: true },
  axe: { id: 'axe', name: 'Stone Axe', icon: '🪓', group: 'weapon', desc: 'Heavy blows up close.', dmg: 12, hutDmg: 6, range: 28, cd: 1.1 },
  torch: { id: 'torch', name: 'Torch', icon: '🔥', group: 'weapon', desc: 'Sets foes and huts ablaze. Best for burning huts.', dmg: 7, hutDmg: 10, range: 28, cd: 1.1, burn: true },
  fishspear: { id: 'fishspear', name: 'Fishing Spear', icon: '🎣', group: 'food', desc: 'Triples every catch when fishing.', dmg: 4, hutDmg: 1, range: 28, cd: 1.2 },
  staff: { id: 'staff', name: 'Gathering Staff', icon: '🧺', group: 'food', desc: 'Knocks fruit down three times faster.', dmg: 3, hutDmg: 2, range: 28, cd: 1.2 },
  heal: { id: 'heal', name: 'Healing Staff', icon: '🌿', group: 'heal', desc: 'Slowly heals nearby members and pets.', dmg: 3, hutDmg: 1, range: 28, cd: 1.2 },
};

export const TOOL_ORDER: ToolId[] = ['drum', 'horn', 'rattle', 'spear', 'axe', 'torch', 'fishspear', 'staff', 'heal'];
export const INSTRUMENTS: ToolId[] = ['drum', 'horn', 'rattle'];
export const isInstrument = (t: ToolId | null): boolean => !!t && TOOLS[t].group === 'social';

/** Tools unlocked at the start and after each tribe is resolved, by diet. */
const UNLOCKS: Record<Diet, ToolId[][]> = {
  herbivore: [['rattle', 'torch', 'staff'], ['drum', 'fishspear'], ['spear', 'heal'], ['horn', 'axe']],
  omnivore: [['horn', 'spear', 'fishspear'], ['rattle', 'staff'], ['heal', 'drum'], ['torch', 'axe']],
  carnivore: [['drum', 'axe', 'fishspear'], ['horn', 'spear'], ['torch', 'heal'], ['rattle', 'staff']],
};

export function unlockedTools(diet: Diet, resolved: number): ToolId[] {
  const out: ToolId[] = [];
  const list = UNLOCKS[diet];
  for (let i = 0; i <= Math.min(resolved, list.length - 1); i++) out.push(...list[i]);
  return out;
}

/** The tribe count after which a tool unlocks (0 = at start). */
export function unlockLevel(diet: Diet, tool: ToolId): number {
  const list = UNLOCKS[diet];
  for (let i = 0; i < list.length; i++) if (list[i].includes(tool)) return i;
  return 9;
}

// ------------------------------------------------------------------ drawing

const WOOD = '#8a5a32';
const WOOD_DARK = '#4a2d16';
const STONE = '#9aa3ab';
const OL = '#2b1a0e';

function stick(g: CanvasRenderingContext2D, y0: number, y1: number, w = 2.6, col = WOOD) {
  g.lineCap = 'round';
  g.strokeStyle = OL;
  g.lineWidth = w + 1.8;
  g.beginPath();
  g.moveTo(0, y0);
  g.lineTo(0, y1);
  g.stroke();
  g.strokeStyle = col;
  g.lineWidth = w;
  g.stroke();
}

function blob(g: CanvasRenderingContext2D, path: Path2D, fill: string) {
  g.lineJoin = 'round';
  g.strokeStyle = OL;
  g.lineWidth = 1.6;
  g.stroke(path);
  g.fillStyle = fill;
  g.fill(path);
}

export function drawFlame(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const f = 1 + Math.sin(t * 23) * 0.12 + Math.sin(t * 37) * 0.08;
  const outer = new Path2D();
  outer.moveTo(x - 5 * s, y);
  outer.quadraticCurveTo(x - 6 * s, y - 7 * s * f, x + Math.sin(t * 9) * 1.5 * s, y - 14 * s * f);
  outer.quadraticCurveTo(x + 6 * s, y - 7 * s * f, x + 5 * s, y);
  outer.closePath();
  g.fillStyle = '#ff7a2a';
  g.fill(outer);
  const inner = new Path2D();
  inner.moveTo(x - 2.6 * s, y);
  inner.quadraticCurveTo(x - 3 * s, y - 4 * s * f, x + Math.sin(t * 11) * s, y - 8.5 * s * f);
  inner.quadraticCurveTo(x + 3 * s, y - 4 * s * f, x + 2.6 * s, y);
  inner.closePath();
  g.fillStyle = '#ffe27a';
  g.fill(inner);
}

/**
 * Draw a tool held in a hand at (x, y) (world space). `s` scales the tool, `facing` is ±1,
 * `swing` 0..1 animates an attack/use swing.
 */
export function drawTool(g: CanvasRenderingContext2D, tool: ToolId | 'chief', x: number, y: number, s: number, facing: number, t: number, swing = 0) {
  g.save();
  g.translate(x, y);
  const lean = tool === 'drum' || tool === 'rattle' ? 0 : 0.32;
  const sw = Math.sin(Math.min(1, swing) * Math.PI);
  g.scale(facing * s, s);
  g.rotate(lean - sw * 1.5 + (tool === 'horn' ? -0.2 : 0));
  switch (tool) {
    case 'chief': {
      stick(g, 14, -40, 3, '#7a4a26');
      // carved knob with a glowing stone
      g.fillStyle = '#ffcf5a';
      g.globalAlpha = 0.35 + Math.sin(t * 3) * 0.15;
      g.beginPath();
      g.arc(0, -43, 8, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      blob(g, (() => { const p = new Path2D(); p.arc(0, -43, 4.2, 0, Math.PI * 2); return p; })(), '#ffb43a');
      // feathers
      for (let i = 0; i < 3; i++) {
        const a = -0.9 + i * 0.5 + Math.sin(t * 2 + i) * 0.08;
        g.save();
        g.translate(0, -37);
        g.rotate(a + Math.PI);
        const p = new Path2D();
        p.ellipse(0, -9, 2.4, 8, 0, 0, Math.PI * 2);
        blob(g, p, ['#e9483b', '#ffd166', '#3ee6c4'][i]);
        g.restore();
      }
      break;
    }
    case 'spear':
    case 'fishspear': {
      stick(g, 12, -36, 2.4);
      if (tool === 'spear') {
        const p = new Path2D();
        p.moveTo(-3.2, -35);
        p.lineTo(0, -46);
        p.lineTo(3.2, -35);
        p.closePath();
        blob(g, p, STONE);
      } else {
        g.strokeStyle = OL;
        g.lineWidth = 3.4;
        g.lineCap = 'round';
        const prong = () => {
          g.beginPath();
          g.moveTo(-5, -44); g.lineTo(-5, -36); g.lineTo(5, -36); g.lineTo(5, -44);
          g.moveTo(0, -36); g.lineTo(0, -46);
          g.stroke();
        };
        prong();
        g.strokeStyle = '#d7dde2';
        g.lineWidth = 1.6;
        prong();
      }
      g.fillStyle = '#d9b45a';
      g.fillRect(-1.8, -34, 3.6, 3);
      break;
    }
    case 'axe': {
      stick(g, 10, -26, 2.8);
      const p = new Path2D();
      p.moveTo(-1, -30);
      p.quadraticCurveTo(10, -34, 11, -22);
      p.quadraticCurveTo(6, -21, -1, -19);
      p.closePath();
      blob(g, p, STONE);
      g.fillStyle = '#d9b45a';
      g.fillRect(-2, -27, 4, 6);
      break;
    }
    case 'torch': {
      stick(g, 10, -24, 2.8);
      const p = new Path2D();
      p.ellipse(0, -26, 3.6, 4.4, 0, 0, Math.PI * 2);
      blob(g, p, '#6b4a2a');
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.25;
      g.fillStyle = '#ffae4a';
      g.beginPath();
      g.arc(0, -32, 12, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      drawFlame(g, 0, -27, 1, t);
      break;
    }
    case 'staff': {
      stick(g, 12, -32, 2.4, '#9b6a3a');
      g.strokeStyle = OL;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(4, -32, 4, Math.PI, Math.PI * 2.1);
      g.stroke();
      g.strokeStyle = '#9b6a3a';
      g.lineWidth = 2.4;
      g.stroke();
      for (let i = 0; i < 2; i++) {
        const p = new Path2D();
        p.ellipse(-3 + i * 6, -24 - i * 3, 2.2, 4, 0.6 - i * 1.2, 0, Math.PI * 2);
        blob(g, p, '#7bd389');
      }
      break;
    }
    case 'heal': {
      stick(g, 12, -32, 2.4, '#b08a5a');
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.3 + Math.sin(t * 4) * 0.12;
      g.fillStyle = '#7dffb0';
      g.beginPath();
      g.arc(0, -36, 9, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      const o = new Path2D();
      o.arc(0, -36, 4, 0, Math.PI * 2);
      blob(g, o, '#5ef0a0');
      for (let i = 0; i < 2; i++) {
        const p = new Path2D();
        p.ellipse(i ? 4 : -4, -31, 2, 4.4, i ? 0.8 : -0.8, 0, Math.PI * 2);
        blob(g, p, '#4c9a2a');
      }
      break;
    }
    case 'drum': {
      g.rotate(-lean);
      const body = new Path2D();
      body.moveTo(-8, -18); body.lineTo(8, -18); body.lineTo(6.5, -3); body.lineTo(-6.5, -3); body.closePath();
      blob(g, body, '#b0643a');
      g.strokeStyle = '#f3e3c3';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 4; i++) { g.moveTo(-7 + i * 4.6, -17); g.lineTo(-5 + i * 3.4, -4); }
      g.stroke();
      const top = new Path2D();
      top.ellipse(0, -18, 8, 2.8, 0, 0, Math.PI * 2);
      blob(g, top, '#f3e3c3');
      // stick hitting
      g.save();
      g.translate(9, -22);
      g.rotate(-0.6 + Math.sin(t * 10) * 0.25 * (swing > 0 ? 2 : 0.4));
      stick(g, 0, -10, 1.8, '#6b4a2a');
      g.restore();
      break;
    }
    case 'horn': {
      const p = new Path2D();
      p.moveTo(-2, -6);
      p.quadraticCurveTo(-4, -26, 12, -30);
      p.lineTo(13, -23);
      p.quadraticCurveTo(3, -22, 3, -6);
      p.closePath();
      blob(g, p, '#efe2c4');
      g.strokeStyle = '#b8a27a';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-2.5, -14); g.lineTo(3, -13);
      g.moveTo(0, -21); g.lineTo(5, -19);
      g.stroke();
      break;
    }
    case 'rattle': {
      stick(g, 6, -12, 2, WOOD_DARK);
      const shake = Math.sin(t * 18) * (swing > 0 ? 3 : 0.6);
      const p = new Path2D();
      p.ellipse(shake * 0.3, -18, 5.4, 6.6, shake * 0.05, 0, Math.PI * 2);
      blob(g, p, '#e0a96d');
      g.fillStyle = '#9d0208';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-2 + i * 2 + shake * 0.3, -19 + (i % 2) * 3, 0.9, 0, Math.PI * 2); g.fill(); }
      break;
    }
  }
  g.restore();
}
