// Opening a mystery crate: a full-screen moment. The crate drops in, rattles harder and harder while light
// leaks from its seams, then bursts open and the prize rises out in its rarity's colour.
import { button, h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { TAU, clamp } from '../../../engine/math';
import { blit, glow } from '../art/sprites';
import { drawThumb } from '../../../design/render';
import { openCrateLoot, RARITY } from '../crate';
import type { SpaceStage } from '../stage';

const DROP = 0.45;
const OPEN = 2.6;

interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }

export function openCrate(st: SpaceStage, onDone?: () => void) {
  const loot = openCrateLoot(st.w);
  if (!loot) { st.ui.toast('No mystery crates in your hold.', '📦'); audio.sfx('error'); return; }
  const col = RARITY[loot.rarity].color;
  const cv = h('canvas', { class: 'cr-cv' }) as HTMLCanvasElement;
  const hint = h('div', { class: 'cr-hint' }, 'Tap to open');
  const card = h('div', { class: 'cr-card', style: `--rc:${col}` },
    h('div', { class: 'cr-rar' }, RARITY[loot.rarity].label),
    h('b', null, loot.name),
    h('div', { class: 'cr-desc' }, loot.desc),
    button('Collect', () => done(), { cls: 'primary' }));
  const root = h('div', { class: 'sp-crate' }, cv, hint, card);
  // A creature prize is shown as itself.
  let pet: HTMLCanvasElement | null = null;
  if (loot.design) {
    pet = document.createElement('canvas');
    pet.width = 240; pet.height = 180;
    try { drawThumb(pet, loot.design, { pad: 6 }); } catch { pet = null; }
  }
  document.body.append(root);
  let alive = true, t = 0, last = performance.now(), opened = false, nextThunk = DROP + 0.2;
  let sparks: Spark[] = [];
  const lid = { y: 0, vy: 0, a: 0, va: 0 };
  const done = () => {
    if (!alive) return;
    alive = false;
    root.classList.add('out');
    setTimeout(() => root.remove(), 260);
    st.ui.toast(`Crate opened: ${loot.icon} ${loot.name}`, '📦', loot.rarity === 'junk' ? 'info' : 'gold');
    onDone?.();
  };
  // Tap skips ahead to the burst; after the reveal, tapping outside the card collects.
  root.addEventListener('pointerdown', (e) => {
    if (card.contains(e.target as Node)) return;
    if (t < OPEN) t = OPEN - 0.05;
    else if (t > OPEN + 0.9) done();
  });

  const spark = (x: number, y: number, n: number, speed: number, colors: string[]) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0.6 + Math.random() * 0.8, color: colors[i % colors.length], size: 2 + Math.random() * 3 });
    }
  };

  const frame = (now: number) => {
    if (!alive && !root.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    const W = cv.clientWidth || window.innerWidth, H = cv.clientHeight || window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.46;
    const S = Math.min(W, H) / 430;
    // Rattle: thunks come faster and harder as the moment nears.
    const k = clamp((t - DROP) / (OPEN - DROP), 0, 1);
    if (!opened && t > nextThunk && t < OPEN) {
      nextThunk = t + 0.42 - k * 0.3;
      audio.sfx('tap', { pitch: 0.6 + k * 0.9, vol: 0.4 + k * 0.4 });
      spark(cx + (Math.random() - 0.5) * 120 * S, cy - 40 * S, 3 + Math.floor(k * 6), 160 * S, [col, '#ffffff']);
    }
    if (!opened && t >= OPEN) {
      opened = true;
      hint.style.opacity = '0';
      lid.vy = -900 * S; lid.va = (Math.random() < 0.5 ? -1 : 1) * 6;
      spark(cx, cy - 40 * S, 70, 520 * S, [col, '#ffffff', col]);
      audio.sfx('explode', { vol: 0.6, pitch: 1.4 });
      audio.sfx(loot.rarity === 'junk' ? 'pop' : 'levelup');
      setTimeout(() => card.classList.add('on'), 550);
    }
    // Light rays: leaking through the seams before, a full rotating burst after.
    g.save();
    g.translate(cx, cy - 30 * S);
    g.globalCompositeOperation = 'lighter';
    const rays = opened ? 14 : 6;
    const power = opened ? clamp((t - OPEN) * 3, 0, 1) : k * 0.55;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + t * (opened ? 0.4 : 1.2);
      const len = (opened ? 520 : 140 + k * 160) * S;
      const wdt = opened ? 0.11 : 0.05;
      const gr = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      gr.addColorStop(0, hexA(col, 0.55 * power));
      gr.addColorStop(1, hexA(col, 0));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - wdt) * len, Math.sin(a - wdt) * len); g.lineTo(Math.cos(a + wdt) * len, Math.sin(a + wdt) * len); g.closePath(); g.fill();
    }
    blit(g, glow(col, 64), 0, 0, (opened ? 340 : 120 + k * 120) * S * (0.9 + 0.1 * Math.sin(t * 9)));
    g.restore();
    // The crate
    const drop = clamp(t / DROP, 0, 1);
    const bounce = drop < 1 ? -(1 - drop) * (1 - drop) * H * 0.7 : Math.abs(Math.sin((t - DROP) * 18)) * 8 * S * Math.max(0, 1 - (t - DROP) * 4);
    const amp = opened ? 0 : k * k * 9 * S;
    const jx = Math.sin(t * (30 + k * 30)) * amp, rotA = Math.sin(t * (22 + k * 26)) * k * 0.08;
    g.save();
    g.translate(cx + jx, cy + bounce);
    g.rotate(rotA);
    const bw = 190 * S, bh = 128 * S;
    // Shadow
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(0, bh / 2 + 10 * S, bw * 0.55, 14 * S, 0, 0, TAU); g.fill();
    // Body
    g.fillStyle = '#3a4256';
    roundRect(g, -bw / 2, -bh / 2, bw, bh, 12 * S); g.fill();
    g.fillStyle = '#4d5873';
    roundRect(g, -bw / 2 + 12 * S, -bh / 2 + 14 * S, bw - 24 * S, bh - 28 * S, 8 * S); g.fill();
    g.strokeStyle = '#2a3042'; g.lineWidth = 3 * S;
    g.beginPath(); g.moveTo(-bw / 2 + 12 * S, -bh / 2 + 14 * S); g.lineTo(bw / 2 - 12 * S, bh / 2 - 14 * S); g.moveTo(bw / 2 - 12 * S, -bh / 2 + 14 * S); g.lineTo(-bw / 2 + 12 * S, bh / 2 - 14 * S); g.stroke();
    g.fillStyle = '#ffd166';
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { roundRect(g, x * (bw / 2 - 14 * S) - 12 * S, y * (bh / 2 - 12 * S) - 10 * S, 24 * S, 20 * S, 4 * S); g.fill(); }
    g.font = `800 ${46 * S}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = opened ? '#2a3042' : hexA(col, 0.5 + k * 0.5);
    g.fillText('?', 0, 6 * S);
    // Glowing seam under the lid
    if (!opened) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = hexA(col, 0.35 + k * 0.65);
      g.fillRect(-bw / 2 + 6 * S, -bh / 2 - 3 * S, bw - 12 * S, 6 * S);
      g.globalCompositeOperation = 'source-over';
    }
    // Lid: rides the box, then flies off.
    if (opened) { lid.vy += 1800 * S * dt; lid.y += lid.vy * dt; lid.a += lid.va * dt; }
    g.save();
    g.translate(0, -bh / 2 - 14 * S + lid.y);
    g.rotate(lid.a);
    g.fillStyle = '#56627f';
    roundRect(g, -bw / 2 - 8 * S, -14 * S, bw + 16 * S, 28 * S, 8 * S); g.fill();
    g.fillStyle = '#ffd166';
    roundRect(g, -22 * S, -8 * S, 44 * S, 16 * S, 4 * S); g.fill();
    g.restore();
    g.restore();
    // The prize rises out.
    if (opened) {
      const q = clamp((t - OPEN) / 0.6, 0, 1);
      const sc = q < 1 ? q * 1.25 : 1.25 - Math.min(0.25, (t - OPEN - 0.6) * 0.8);
      const iy = cy - 40 * S - q * 120 * S + Math.sin(t * 2.5) * 4 * S;
      g.globalCompositeOperation = 'lighter';
      blit(g, glow(col, 64), cx, iy, 190 * S * sc);
      g.globalCompositeOperation = 'source-over';
      if (pet) {
        const pw = 210 * S * sc, ph = pw * (pet.height / pet.width);
        g.drawImage(pet, cx - pw / 2, iy - ph / 2, pw, ph);
      } else {
        g.font = `${Math.round(96 * S * sc)}px system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(loot.icon, cx, iy);
      }
      if (Math.random() < dt * 14) spark(cx + (Math.random() - 0.5) * 80 * S, iy, 1, 90 * S, [col, '#ffffff']);
    }
    // Sparks
    for (const p of sparks) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * S * dt; p.vx *= 0.985; }
    sparks = sparks.filter((p) => p.life > 0);
    g.globalCompositeOperation = 'lighter';
    for (const p of sparks) { g.globalAlpha = Math.min(1, p.life * 1.6); g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size * S, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // White flash at the burst
    if (opened && t - OPEN < 0.35) { g.fillStyle = `rgba(255,255,255,${0.75 * (1 - (t - OPEN) / 0.35)})`; g.fillRect(0, 0, W, H); }
    if (root.isConnected) requestAnimationFrame(frame);
  };
  audio.sfx('whoosh', { pitch: 0.6 });
  requestAnimationFrame(frame);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, hh, r);
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
}
