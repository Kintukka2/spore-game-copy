// Outbreak containment: a focused full-screen view of a world with an eco-disaster. Infection spots glow on
// the spinning globe; tap them to purge them before they spread, and clear them all before the clock runs out.
import { button, h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { TAU, clamp } from '../../../engine/math';
import { tScoreOf } from '../data';
import { drawPlanet, SphereSprite, styleFor, type PlanetLook } from '../art/planetArt';
import { blit, glow } from '../art/sprites';
import { resolve as resolveEvent } from '../events';
import type { GEvent } from '../types';
import type { SpaceStage } from '../stage';
import { fmtTime } from './common';

/** At most this many spots at once; past it the infection only festers. */
const MAX_SPOTS = 12;

interface Burst { x: number; y: number; vx: number; vy: number; life: number; color: string }
interface Float { x: number; y: number; text: string; color: string; life: number }

export function openOutbreak(st: SpaceStage, ev: GEvent, onClose?: () => void) {
  const w = st.w;
  const pl = w.planet(ev.star, ev.planet);
  const marks = (ev.marks ??= []);
  const spreadT = st.game.diff(12, 9, 7);
  // Per-spot age (s) toward spreading, and time since it appeared (for the sprout pop).
  const ages = Array.from({ length: marks.length / 2 }, () => Math.random() * spreadT * 0.4);
  const born = ages.map(() => 9);
  const sprite = new SphereSprite(384, 256);
  const cv = h('canvas', { class: 'ob-cv', 'aria-label': pl.name }) as HTMLCanvasElement;
  const timeEl = h('b'), leftEl = h('b'), doneEl = h('b');
  const banner = h('div', { class: 'ob-banner' });
  const close = () => { alive = false; root.remove(); onClose?.(); };
  const root = h('div', { class: 'sp-focus ob' },
    h('div', { class: 'sp-focus-head' }, h('h2', null, `☣️ Outbreak on ${pl.name}`), button('✕', () => { audio.sfx('click'); close(); }, { cls: 'icon', title: 'Leave' })),
    h('div', { class: 'ob-stats' },
      h('div', { class: 'ob-stat t' }, timeEl, h('span', null, 'until extinction')),
      h('div', { class: 'ob-stat' }, leftEl, h('span', null, 'outbreaks')),
      h('div', { class: 'ob-stat ok' }, doneEl, h('span', null, 'purged'))),
    h('div', { class: 'ob-stage' }, cv, banner),
    h('div', { class: 'ob-hint' }, 'Tap the glowing spots to purge them. Drag the world, or tap the ◀ ▶ arrows, to find spots on the far side. Spots left alone grow hot and spread!'));
  document.body.append(root);
  audio.sfx('alarm', { vol: 0.5 });

  let alive = true, won = false, lost = false, endT = 0;
  let rot = Math.random(), spin = 0, t = 0, last = performance.now();
  let purged = 0, combo = 0, lastPurge = -9;
  let bursts: Burst[] = [];
  let floats: Float[] = [];
  let shake = 0;
  // Spinning to the far side: a target turn set by the arrows, and when you last dragged (for the swipe hint).
  let target: number | null = null, lastDrag = -9;
  let hidden = { l: 0, r: 0 };

  const look = (): PlanetLook => {
    const ps = w.peekPS(ev.star, ev.planet);
    const tt = tScoreOf(ps.atm, ps.temp);
    return { seed: pl.seed, style: styleFor(pl.kind, tt, ps.atm, ps.temp, false, !!ps.destroyed), t: tt, atm: ps.atm, temp: ps.temp, hue: pl.hue };
  };
  const geom = () => {
    const cw = cv.clientWidth || 300, ch = cv.clientHeight || 300;
    return { cw, ch, cx: cw / 2, cy: ch / 2, r: Math.min(cw, ch) * 0.38 };
  };
  const project = (lon: number, lat: number) => {
    const { cx, cy, r } = geom();
    // Texture longitude slides left as `rot` grows (see SphereSprite), so the spots ride with the ground.
    const a = lon - rot * TAU;
    const x = Math.cos(lat) * Math.sin(a), z = Math.cos(lat) * Math.cos(a), y = Math.sin(lat);
    return { x: cx + x * r, y: cy + y * r, z, side: x };
  };
  const float = (x: number, y: number, text: string, color: string) => floats.push({ x, y, text, color, life: 1.3 });
  const burst = (x: number, y: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 60 + Math.random() * 220;
      bursts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, color });
    }
  };

  const finish = (win: boolean) => {
    if (won || lost) return;
    won = win; lost = !win;
    endT = t;
    banner.className = 'ob-banner on ' + (win ? 'win' : 'lose');
    banner.textContent = win ? '🌿 Contained!' : '☠️ Too late…';
    if (win) {
      resolveEvent(w, ev);
      const { cx, cy, r } = geom();
      for (let i = 0; i < 4; i++) setTimeout(() => burst(cx + (Math.random() - 0.5) * r * 1.6, cy + (Math.random() - 0.5) * r * 1.6, i % 2 ? '#7dff6a' : '#ffd166', 26), i * 140);
      audio.sfx('levelup');
    } else audio.sfx('fail');
  };

  const tryPurge = (px: number, py: number) => {
    let best = -1, bd = 34;
    for (let i = 0; i < marks.length; i += 2) {
      const p = project(marks[i], marks[i + 1]);
      if (p.z < 0.1) continue;
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) { audio.sfx('tap', { vol: 0.4 }); return; }
    const p = project(marks[best], marks[best + 1]);
    marks.splice(best, 2);
    ages.splice(best / 2, 1);
    born.splice(best / 2, 1);
    purged++;
    combo = t - lastPurge < 1.6 ? combo + 1 : 1;
    lastPurge = t;
    burst(p.x, p.y, '#7dff6a', 22);
    burst(p.x, p.y, '#ffffff', 8);
    audio.sfx('laser');
    audio.sfx('pop', { pitch: 1 + Math.min(combo, 6) * 0.08 });
    if (combo >= 2) {
      const bonus = 200 * (combo - 1);
      w.addMoney(bonus);
      float(p.x, p.y - 26, `Combo ×${combo} · +§${bonus}`, '#ffd166');
    } else float(p.x, p.y - 20, 'Purged!', '#c9ffbf');
    if (!marks.length) finish(true);
  };

  /** The side arrows: where they sit, if that side hides any spots. */
  const arrows = () => {
    const { cx, cy, r } = geom();
    // Beside the world when there is room, otherwise just under it.
    const room = cx - r - 44 >= 30;
    const dx = room ? r + 44 : r * 0.72, y = room ? cy : cy + r + 50;
    return [
      { side: -1, n: hidden.l, x: cx - dx, y },
      { side: 1, n: hidden.r, x: cx + dx, y },
    ].filter((a) => a.n > 0);
  };
  /** Turn the world until the nearest hidden spot on that side faces you. */
  const spinTo = (side: number) => {
    let best = -1, bz = -2;
    for (let i = 0; i < marks.length; i += 2) {
      const p = project(marks[i], marks[i + 1]);
      if (p.z >= 0.1 || Math.sign(p.side) !== side) continue;
      if (p.z > bz) { bz = p.z; best = i; }
    }
    if (best < 0) return;
    target = ((marks[best] / TAU) % 1 + 1) % 1;
    spin = 0;
    audio.sfx('whoosh', { pitch: 1.3, vol: 0.5 });
  };

  // Drag to spin (with a little inertia); a short tap purges.
  let down: { x: number; y: number; rot: number; id: number; moved: boolean; lx: number; lt: number } | null = null;
  cv.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, rot, id: e.pointerId, moved: false, lx: e.clientX, lt: performance.now() };
    spin = 0;
    try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 8) { down.moved = true; target = null; }
    if (!down.moved) return;
    lastDrag = t;
    const wdt = geom().r * 2 * 1.6;
    rot = (((down.rot - dx / wdt) % 1) + 1) % 1;
    const now = performance.now();
    spin = -(e.clientX - down.lx) / wdt / Math.max(0.008, (now - down.lt) / 1000);
    down.lx = e.clientX; down.lt = now;
  });
  const up = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    if (!down.moved && !won && !lost) {
      const rc = cv.getBoundingClientRect();
      const x = e.clientX - rc.left, y = e.clientY - rc.top;
      const arrow = arrows().find((a) => Math.hypot(a.x - x, a.y - y) < 36);
      if (arrow) spinTo(arrow.side);
      else tryPurge(x, y);
    }
    down = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', () => { down = null; });

  const frame = (now: number) => {
    if (!alive || !root.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (!down && target !== null) {
      // Ease the shortest way round to the arrow's target.
      let d = target - rot;
      d -= Math.round(d);
      const step = Math.sign(d) * Math.min(Math.abs(d), Math.max(0.05, Math.abs(d) * 5) * dt);
      rot = (((rot + step) % 1) + 1) % 1;
      if (Math.abs(d) < 0.003) target = null;
    } else if (!down) {
      rot = (((rot + (0.012 + spin) * dt) % 1) + 1) % 1;
      spin *= Math.exp(-2.5 * dt);
    }
    // The clock ran out elsewhere: the event is gone.
    if (!won && !lost && !w.s.events.includes(ev)) finish(false);
    // Infection: untended spots grow and seed new ones nearby.
    if (!won && !lost) {
      for (let i = 0; i < ages.length; i++) {
        ages[i] += dt;
        born[i] += dt;
        if (ages[i] < spreadT) continue;
        ages[i] = 0;
        if (marks.length / 2 >= MAX_SPOTS) continue;
        const lon = marks[i * 2] + (Math.random() - 0.5) * 0.9, lat = clamp(marks[i * 2 + 1] + (Math.random() - 0.5) * 0.7, -1.25, 1.25);
        marks.push(lon, lat);
        ages.push(0);
        born.push(0);
        const p = project(lon, lat);
        if (p.z > 0.1) { float(p.x, p.y - 20, 'It spread!', '#ff8a7a'); shake = 6; }
        audio.sfx('hit', { vol: 0.35, pitch: 0.7 });
      }
    }
    if ((won || lost) && t - endT > (won ? 1.9 : 2.2)) { close(); return; }
    timeEl.textContent = fmtTime(Math.max(0, ev.until - w.s.t));
    leftEl.textContent = String(marks.length / 2);
    doneEl.textContent = String(purged);
    render(dt);
    requestAnimationFrame(frame);
  };

  const render = (dt: number) => {
    const { cw, ch, cx, cy, r } = geom();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    shake = Math.max(0, shake - dt * 20);
    g.save();
    if (shake) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    // Sickly glow behind the world, stronger with more spots.
    const sick = marks.length / 2 / MAX_SPOTS;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.25 + sick * 0.5;
    blit(g, glow(won ? '#7cc4ff' : '#5fdc4a', 64), cx, cy, r * 3.1);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const l = look();
    sprite.update(l, rot);
    drawPlanet(g, sprite, l, cx, cy, r, { light: -2.4, rings: pl.rings, ringTilt: -0.3, t });
    // Spots: green when fresh, yellow, then red and frantic just before they spread.
    let hiddenL = 0, hiddenR = 0, shown = 0;
    for (let i = 0; i < marks.length; i += 2) {
      const p = project(marks[i], marks[i + 1]);
      const f = clamp(ages[i / 2] / spreadT, 0, 1);
      const col = f < 0.5 ? '#7dff6a' : f < 0.8 ? '#ffd166' : '#ff5a4f';
      if (p.z < 0.1) {
        if (p.side < 0) hiddenL++; else hiddenR++;
        // Far side: a blip on the rim at the spot's height, brighter as it comes round.
        const yy = cy + Math.sin(marks[i + 1]) * r;
        const xx = cx + (p.side < 0 ? -1 : 1) * Math.sqrt(Math.max(0, r * r - (yy - cy) ** 2));
        const near = clamp((p.z + 1) / 1.1, 0, 1);
        g.globalAlpha = 0.3 + 0.7 * near * near;
        g.globalCompositeOperation = 'lighter';
        blit(g, glow(col, 32), xx, yy, 22 + 10 * Math.sin(t * 6 + i));
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = col;
        g.lineWidth = 3;
        const ang = Math.atan2(yy - cy, xx - cx);
        g.beginPath(); g.arc(cx, cy, r + 5, ang - 0.09, ang + 0.09); g.stroke();
        g.globalAlpha = 1;
        continue;
      }
      shown++;
      const pop = clamp(born[i / 2] / 0.35, 0, 1);
      const pul = 0.6 + 0.4 * Math.sin(t * (5 + f * 14) + i);
      const sz = (11 + f * 8) * (r / 150) * (0.4 + pop * 0.6) * Math.max(0.55, p.z);
      g.globalCompositeOperation = 'lighter';
      blit(g, glow(col, 32), p.x, p.y, sz * 2.6 * pul + 8);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = col;
      g.globalAlpha = 0.85;
      g.beginPath(); g.arc(p.x, p.y, sz * 0.55, 0, TAU); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(240,255,235,0.9)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, sz * (0.9 + pul * 0.25), 0, TAU); g.stroke();
      if (f > 0.8) {
        g.strokeStyle = `rgba(255,90,79,${pul})`;
        g.beginPath(); g.arc(p.x, p.y, sz * 1.6, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.stroke();
      }
    }
    // Spots out of sight: big pulsing arrows at the sides (tap to turn the world to them).
    hidden = { l: hiddenL, r: hiddenR };
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    for (const a of won || lost ? [] : arrows()) {
      const pul = 1 + 0.08 * Math.sin(t * 6);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55;
      blit(g, glow('#5fdc4a', 32), a.x, a.y, 70 * pul);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(6,26,8,0.88)';
      g.strokeStyle = '#7dff6a';
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(a.x, a.y, 25 * pul, 0, TAU); g.fill(); g.stroke();
      // Chevron, nudging outward.
      const nx = a.x + a.side * (2 + 3 * Math.sin(t * 6));
      g.strokeStyle = '#c9ffbf';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(nx - a.side * 4, a.y - 9); g.lineTo(nx + a.side * 6, a.y); g.lineTo(nx - a.side * 4, a.y + 9); g.stroke();
      g.lineCap = 'butt';
      g.font = '700 13px Fredoka, system-ui, sans-serif';
      g.fillStyle = '#c9ffbf';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.7)';
      const lbl = `${a.n} hidden`;
      g.strokeText(lbl, a.x, a.y + 40); g.fillText(lbl, a.x, a.y + 40);
    }
    // Nothing in view but spots behind: a hand shows the swipe.
    if (!won && !lost && !shown && hiddenL + hiddenR > 0 && !down && target === null && t - lastDrag > 2) {
      const k = (t * 0.7) % 1;
      const hx = cx - r * 0.45 * (hiddenR >= hiddenL ? 1 : -1) * (1 - 2 * k), hy = cy + r * 0.35;
      g.globalAlpha = Math.sin(k * Math.PI);
      g.font = `${Math.round(r * 0.32)}px system-ui, sans-serif`;
      g.fillText('👆', hx, hy);
      g.font = '700 16px Fredoka, system-ui, sans-serif';
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.fillStyle = '#ffffff';
      const msg = `Swipe to spin · ${hiddenL + hiddenR} on the far side`;
      g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3);
      g.strokeText(msg, cx, cy - r - 18); g.fillText(msg, cx, cy - r - 18);
      g.globalAlpha = 1;
    }
    // Bursts and floating words
    for (const b of bursts) { b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.94; b.vy *= 0.94; }
    bursts = bursts.filter((b) => b.life > 0);
    g.globalCompositeOperation = 'lighter';
    for (const b of bursts) { g.globalAlpha = Math.min(1, b.life * 2); g.fillStyle = b.color; g.beginPath(); g.arc(b.x, b.y, 2.5, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.textAlign = 'center';
    g.font = '700 15px Fredoka, system-ui, sans-serif';
    for (const fl of floats) {
      fl.life -= dt; fl.y -= 34 * dt;
      g.globalAlpha = Math.min(1, fl.life * 1.5);
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(fl.text, fl.x, fl.y);
      g.fillStyle = fl.color; g.fillText(fl.text, fl.x, fl.y);
    }
    g.globalAlpha = 1;
    floats = floats.filter((fl) => fl.life > 0);
    g.restore();
  };
  requestAnimationFrame(frame);
  st.game.hint('outbreak', 'Outbreak! Every spot is an infected herd. Purge them fast: purges in quick succession earn combo bonuses, and spots left alone spread.', '☣️');
}
