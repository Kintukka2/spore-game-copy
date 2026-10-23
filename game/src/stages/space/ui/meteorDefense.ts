// Meteor storm defence: a focused full-screen view of the threatened colony. Meteors streak in from every side;
// tap them to fire the planetary gun. Big ones split in two. Every rock that lands hurts the colony.
import { button, h } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { TAU } from '../../../engine/math';
import { tScoreOf } from '../data';
import { drawPlanet, SphereSprite, styleFor, type PlanetLook } from '../art/planetArt';
import { blit, glow } from '../art/sprites';
import { meteorImpact, resolve as resolveEvent } from '../events';
import type { GEvent } from '../types';
import type { SpaceStage } from '../stage';

interface Rock { x: number; y: number; vx: number; vy: number; r: number; hp: number; big: boolean; rot: number; spin: number; seed: number; flash: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }
interface Float { x: number; y: number; text: string; color: string; life: number }

export function openMeteorDefense(st: SpaceStage, ev: GEvent, onClose?: () => void) {
  const w = st.w;
  const pl = w.planet(ev.star, ev.planet);
  const total = st.game.diff(12, 15, 18);
  const speedK = st.game.diff(0.85, 1, 1.2);
  const sprite = new SphereSprite(384);
  const cv = h('canvas', { class: 'ob-cv md-cv', 'aria-label': pl.name }) as HTMLCanvasElement;
  const leftEl = h('b'), downEl = h('b'), hitEl = h('b');
  const banner = h('div', { class: 'ob-banner' });
  const close = () => { alive = false; w.focusEvent = null; root.remove(); onClose?.(); };
  const root = h('div', { class: 'sp-focus md' },
    h('div', { class: 'sp-focus-head' }, h('h2', null, `☄️ Meteor storm over ${pl.name}`), button('✕', () => { audio.sfx('click'); close(); }, { cls: 'icon', title: 'Leave' })),
    h('div', { class: 'ob-stats' },
      h('div', { class: 'ob-stat t' }, leftEl, h('span', null, 'incoming')),
      h('div', { class: 'ob-stat ok' }, downEl, h('span', null, 'shot down')),
      h('div', { class: 'ob-stat bad' }, hitEl, h('span', null, 'impacts'))),
    h('div', { class: 'ob-stage' }, cv, banner),
    h('div', { class: 'ob-hint' }, 'Tap the meteors to fire the planetary gun. Big ones split in two. Red arrows warn where the next one comes from.'));
  document.body.append(root);
  // The storm waits for no clock while you hold the line.
  w.focusEvent = ev.id;
  audio.sfx('alarm', { vol: 0.6 });

  let alive = true, done = false, endT = 0, t = 0, last = performance.now();
  let spawned = 0, down = 0, hits = 0, combo = 0, lastKill = -9;
  let nextSpawn = 1.4, nextAngle = Math.random() * TAU;
  let rocks: Rock[] = [];
  let sparks: Spark[] = [];
  let floats: Float[] = [];
  let beam: { x: number; y: number; life: number } | null = null;
  let gunA = -Math.PI / 2, shake = 0, hurt = 0;
  const stars = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.6 + 0.3, tw: Math.random() * TAU }));

  const look = (): PlanetLook => {
    const ps = w.peekPS(ev.star, ev.planet);
    const tt = tScoreOf(ps.atm, ps.temp);
    return { seed: pl.seed, style: styleFor(pl.kind, tt, ps.atm, ps.temp, false, !!ps.destroyed), t: tt, atm: ps.atm, temp: ps.temp, hue: pl.hue };
  };
  const geom = () => {
    const cw = cv.clientWidth || 300, ch = cv.clientHeight || 300;
    const S = Math.min(cw, ch) / 400;
    return { cw, ch, S, cx: cw / 2, cy: ch / 2, R: Math.min(cw, ch) * 0.17 };
  };
  const spark = (x: number, y: number, n: number, speed: number, colors: string[]) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.6, color: colors[i % colors.length], size: 1.5 + Math.random() * 2.5 });
    }
  };
  const float = (x: number, y: number, text: string, color: string) => floats.push({ x, y, text, color, life: 1.3 });

  const spawn = (big: boolean) => {
    const { cw, ch, S, cx, cy, R } = geom();
    const d = Math.hypot(cw, ch) / 2 + 30;
    const x = cx + Math.cos(nextAngle) * d, y = cy + Math.sin(nextAngle) * d;
    // Aim somewhere on the planet's face, not always dead centre.
    const tx = cx + (Math.random() - 0.5) * R * 1.2, ty = cy + (Math.random() - 0.5) * R * 1.2;
    const k = spawned / total;
    const sp = (34 + Math.random() * 20) * S * speedK * (1 + k * 0.6) * (big ? 0.8 : 1);
    const l = Math.hypot(tx - x, ty - y);
    rocks.push({ x, y, vx: ((tx - x) / l) * sp, vy: ((ty - y) / l) * sp, r: (big ? 30 + Math.random() * 8 : 16 + Math.random() * 6) * S, hp: big ? 2 : 1, big, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 3, seed: Math.random() * 100, flash: 0 });
    spawned++;
    nextAngle = Math.random() * TAU;
  };

  const finish = () => {
    if (done) return;
    done = true;
    endT = t;
    banner.className = 'ob-banner on ' + (hits ? 'lose' : 'win');
    banner.textContent = hits ? `🛡️ Storm over · ${hits} hit` : '🛡️ Not a scratch!';
    if (w.s.events.includes(ev)) resolveEvent(w, ev);
    audio.sfx(hits ? 'success' : 'levelup');
  };

  const shoot = (px: number, py: number) => {
    const { cx, cy, R } = geom();
    let best: Rock | null = null, bd = Infinity;
    for (const m of rocks) {
      const d = Math.hypot(m.x - px, m.y - py);
      if (d < m.r + 24 && d < bd) { bd = d; best = m; }
    }
    gunA = Math.atan2(py - cy, px - cx);
    const mx = cx + Math.cos(gunA) * R * 1.12, my = cy + Math.sin(gunA) * R * 1.12;
    if (!best) {
      beam = { x: px, y: py, life: 0.08 };
      audio.sfx('laser', { vol: 0.25, pitch: 1.4 });
      return;
    }
    const m = best;
    gunA = Math.atan2(m.y - cy, m.x - cx);
    beam = { x: m.x, y: m.y, life: 0.14 };
    spark(mx, my, 5, 80, ['#9fe3ff', '#ffffff']);
    audio.sfx('laser', { vol: 0.5, pitch: 1 + Math.random() * 0.2 });
    m.hp--;
    m.flash = 1;
    if (m.hp > 0) return;
    rocks = rocks.filter((x) => x !== m);
    down++;
    combo = t - lastKill < 1.4 ? combo + 1 : 1;
    lastKill = t;
    spark(m.x, m.y, m.big ? 34 : 20, 220, ['#ffb347', '#ff7a3a', '#c8a27a', '#ffffff']);
    audio.sfx('explode', { vol: m.big ? 0.8 : 0.5, pitch: m.big ? 0.9 : 1.3 });
    if (m.big) {
      // Splits into two fast chunks that peel off either side.
      const a = Math.atan2(m.vy, m.vx), sp = Math.hypot(m.vx, m.vy) * 1.3;
      for (const da of [-0.45, 0.45]) rocks.push({ x: m.x, y: m.y, vx: Math.cos(a + da) * sp, vy: Math.sin(a + da) * sp, r: m.r * 0.55, hp: 1, big: false, rot: m.rot, spin: m.spin * 2, seed: m.seed + da, flash: 0.6 });
      float(m.x, m.y - m.r, 'Split!', '#ffcf80');
    } else if (combo >= 2) {
      const bonus = 150 * (combo - 1);
      w.addMoney(bonus);
      float(m.x, m.y - m.r - 6, `Combo ×${combo} · +§${bonus}`, '#ffd166');
    }
  };

  const impact = (m: Rock) => {
    const { cx, cy, R } = geom();
    rocks = rocks.filter((x) => x !== m);
    hits++;
    const a = Math.atan2(m.y - cy, m.x - cx);
    const ix = cx + Math.cos(a) * R, iy = cy + Math.sin(a) * R;
    spark(ix, iy, 40, 260, ['#ff7a3a', '#ffd166', '#ffffff', '#5a3a2a']);
    shake = 10;
    hurt = 1;
    audio.sfx('explode', { vol: 1, pitch: 0.6 });
    const lost = w.s.events.includes(ev) ? meteorImpact(w, ev) : '';
    float(ix, iy - 18, lost ? `${lost} flattened!` : 'Impact! Spice stores cracked', '#ff8a7a');
  };

  cv.addEventListener('pointerdown', (e) => {
    if (done) return;
    const rc = cv.getBoundingClientRect();
    shoot(e.clientX - rc.left, e.clientY - rc.top);
  });

  const frame = (now: number) => {
    if (!alive || !root.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    const { cw, ch, S, cx, cy, R } = geom();
    if (!done) {
      // Spawning: faster as the storm builds; now and then two at once.
      if (spawned < total) {
        nextSpawn -= dt;
        if (nextSpawn <= 0) {
          spawn(Math.random() < 0.3);
          if (spawned < total && Math.random() < 0.18 + (spawned / total) * 0.2) spawn(false);
          nextSpawn = 2.6 - (spawned / total) * 1.6 + Math.random() * 0.5;
        }
      }
      for (const m of [...rocks]) {
        m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.spin * dt;
        m.flash = Math.max(0, m.flash - dt * 4);
        if (Math.random() < dt * 30) sparks.push({ x: m.x - m.vx * 0.05, y: m.y - m.vy * 0.05, vx: -m.vx * 0.3 + (Math.random() - 0.5) * 20, vy: -m.vy * 0.3 + (Math.random() - 0.5) * 20, life: 0.35, color: Math.random() < 0.5 ? '#ff9a4a' : '#ffd166', size: m.r * 0.18 });
        if (Math.hypot(m.x - cx, m.y - cy) < R + m.r * 0.3) impact(m);
      }
      if (spawned >= total && !rocks.length) finish();
    } else if (t - endT > 2.2) { close(); return; }
    leftEl.textContent = String(total - spawned + rocks.length);
    downEl.textContent = String(down);
    hitEl.textContent = String(hits);
    // ---- draw
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    shake = Math.max(0, shake - dt * 30);
    hurt = Math.max(0, hurt - dt * 2);
    g.save();
    if (shake) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    for (const s of stars) {
      g.globalAlpha = 0.35 + 0.3 * Math.sin(t * 1.5 + s.tw);
      g.fillStyle = '#dfe9ff';
      g.fillRect(s.x * cw, s.y * ch, s.s, s.s);
    }
    g.globalAlpha = 1;
    // The world, with a red flush when hit
    const l = look();
    sprite.update(l, (t * 0.01) % 1);
    const ps = w.peekPS(ev.star, ev.planet);
    drawPlanet(g, sprite, l, cx, cy, R, { light: -2.4, rings: pl.rings, ringTilt: -0.3, lights: ps.cities, lightColor: '#9ff5e2', t });
    if (hurt) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = hurt * 0.7;
      blit(g, glow('#ff4a3a', 64), cx, cy, R * 3);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    // The gun on its ring
    g.save();
    g.translate(cx + Math.cos(gunA) * R * 1.05, cy + Math.sin(gunA) * R * 1.05);
    g.rotate(gunA);
    g.fillStyle = '#3a4256'; g.strokeStyle = '#9fe3ff'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, 9 * S, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#9fe3ff';
    g.fillRect(4 * S, -3 * S, 16 * S, 6 * S);
    g.restore();
    // Beam
    if (beam) {
      beam.life -= dt;
      const mx = cx + Math.cos(gunA) * R * 1.12, my = cy + Math.sin(gunA) * R * 1.12;
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(120,220,255,0.5)'; g.lineWidth = 8 * S;
      g.beginPath(); g.moveTo(mx, my); g.lineTo(beam.x, beam.y); g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 2.4 * S;
      g.beginPath(); g.moveTo(mx, my); g.lineTo(beam.x, beam.y); g.stroke();
      g.globalCompositeOperation = 'source-over';
      if (beam.life <= 0) beam = null;
    }
    // Warning chevron where the next one will come from
    if (!done && spawned < total && nextSpawn < 1) {
      const a = nextAngle, m = 22;
      const k = Math.min((cw / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (ch / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
      g.save();
      g.translate(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
      g.rotate(a + Math.PI);
      g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 16);
      g.fillStyle = '#ff5a4f';
      g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -10); g.lineTo(-3, 0); g.lineTo(-8, 10); g.closePath(); g.fill();
      g.restore();
      g.globalAlpha = 1;
    }
    // Meteors: a fiery tail, then the rock
    for (const m of rocks) {
      const sp = Math.hypot(m.vx, m.vy) || 1, ux = m.vx / sp, uy = m.vy / sp;
      const tail = m.r * 4.5;
      const gr = g.createLinearGradient(m.x, m.y, m.x - ux * tail, m.y - uy * tail);
      gr.addColorStop(0, 'rgba(255,170,80,0.85)');
      gr.addColorStop(1, 'rgba(255,90,40,0)');
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(m.x - uy * m.r * 0.8, m.y + ux * m.r * 0.8);
      g.lineTo(m.x - ux * tail, m.y - uy * tail);
      g.lineTo(m.x + uy * m.r * 0.8, m.y - ux * m.r * 0.8);
      g.closePath(); g.fill();
      blit(g, glow('#ff8a3a', 32), m.x, m.y, m.r * 3.2);
      g.globalCompositeOperation = 'source-over';
      g.save();
      g.translate(m.x, m.y);
      g.rotate(m.rot);
      const body = g.createRadialGradient(-m.r * 0.3, -m.r * 0.35, m.r * 0.1, 0, 0, m.r * 1.1);
      body.addColorStop(0, m.flash ? '#ffffff' : m.big ? '#b08a6a' : '#c29a78');
      body.addColorStop(1, m.flash ? '#ffd8a8' : m.big ? '#6a4a36' : '#76563f');
      g.fillStyle = body;
      g.strokeStyle = m.big ? '#ffb070' : '#d8b48a';
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU, rr = m.r * (0.78 + 0.22 * Math.sin(m.seed * 7.3 + i * 2.1));
        if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath(); g.fill(); g.stroke();
      if (m.big) {
        g.strokeStyle = `rgba(255,150,60,${0.6 + 0.4 * Math.sin(t * 8 + m.seed)})`;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(-m.r * 0.5, -m.r * 0.1); g.lineTo(0, m.r * 0.15); g.lineTo(m.r * 0.45, -m.r * 0.3); g.stroke();
      }
      g.restore();
    }
    // Sparks and words
    for (const p of sparks) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
    sparks = sparks.filter((p) => p.life > 0);
    g.globalCompositeOperation = 'lighter';
    for (const p of sparks) { g.globalAlpha = Math.min(1, p.life * 2); g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.textAlign = 'center';
    g.font = '700 15px Fredoka, system-ui, sans-serif';
    for (const f of floats) {
      f.life -= dt; f.y -= 32 * dt;
      g.globalAlpha = Math.min(1, f.life * 1.5);
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.color; g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
    floats = floats.filter((f) => f.life > 0);
    g.restore();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  st.game.hint('meteor-defense', 'Planetary defence! Tap each meteor to shoot it. Big ones take two shots and split. Every rock that lands costs the colony.', '☄️');
}
