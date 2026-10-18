// World events and spectacle: meteor shower, UFO abductions, the sea monster at the island's edge,
// and the cell-card special abilities (Lullaby, Flock Call, Terror Roar) with their birds and waves.
import { audio } from '../../engine/audio';
import { clamp, easeInOutCubic, easeOutCubic, lerp, TAU } from '../../engine/math';
import { ui } from '../../engine/ui';
import type { CreatureStage } from './stage';
import type { Critter } from './types';
import { damage } from './combat';
import { critterHeight } from './species';
import { drawShadow } from './sprites';

interface Meteor { x: number; y: number; t: number; dur: number; big: boolean; sx: number; sy: number }
interface Crater { x: number; y: number; r: number; age: number }
interface Ufo { x: number; y: number; z: number; state: 'in' | 'hover' | 'beam' | 'out'; t: number; target: Critter | null; fromX: number; fromY: number; dir: number }
interface Bird { x: number; y: number; z: number; ang: number; ph: number; cd: number; vx: number; vy: number; col: string; leaving: boolean }

export class Events {
  meteorDone = false;
  meteorT = 0;
  private meteorSpawn = 0;
  private meteorDelay = -1;
  meteors: Meteor[] = [];
  craters: Crater[] = [];
  skyStones = 0;
  ufo: Ufo | null = null;
  nextUfo = 150;
  birds: Bird[] = [];
  flockT = 0;
  monster: { x: number; y: number; t: number } | null = null;

  constructor(private S: CreatureStage) {}

  /** 0..1 darkening of the sky during the meteor shower (fades in and out). */
  get skyTint(): number {
    if (this.meteorT <= 0) return 0;
    return clamp(Math.min((22 - this.meteorT) / 2, this.meteorT / 2), 0, 1);
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    const S = this.S;
    if (S.phase === 'play') {
      // Meteor shower once the brain reaches level 3 (after a short delay).
      if (!this.meteorDone && S.brain >= 3 && this.meteorDelay < 0) this.meteorDelay = 10 + Math.random() * 15;
      if (this.meteorDelay > 0) { this.meteorDelay -= dt; if (this.meteorDelay <= 0) this.startMeteors(); }
      this.nextUfo -= dt;
      if (this.nextUfo <= 0 && !this.ufo) { this.nextUfo = 150 + Math.random() * 90; this.startUfo(); }
    }
    this.updateMeteors(dt);
    this.updateUfo(dt);
    this.updateBirds(dt);
    for (const c of this.craters) c.age += dt;
    if (this.monster) this.updateMonster(dt);
  }

  // ------------------------------------------------------------------ meteors
  startMeteors() {
    const S = this.S;
    if (this.meteorT > 0) return;
    this.meteorDone = true;
    this.meteorDelay = 0;
    this.meteorT = 22;
    this.meteorSpawn = 1.5;
    audio.sfx('alarm');
    S.game.banner('The sky is falling', 'Meteor shower!');
    S.hint('cr-meteor', 'Meteors are landing! Stay clear of the fiery impacts. Creatures will panic.', '☄️');
  }

  private updateMeteors(dt: number) {
    const S = this.S;
    if (this.meteorT > 0) {
      this.meteorT -= dt;
      this.meteorSpawn -= dt;
      if (this.meteorSpawn <= 0 && this.meteorT > 2) {
        this.meteorSpawn = 0.35 + Math.random() * 0.55;
        const near = Math.random() < 0.45;
        const a = Math.random() * TAU, rr = near ? 60 + Math.random() * 260 : 250 + Math.random() * 550;
        const x = S.player.x + Math.cos(a) * rr, y = S.player.y + Math.sin(a) * rr;
        if (S.world.isLand(x, y)) {
          const big = Math.random() < 0.22;
          this.meteors.push({ x, y, t: 0, dur: 1.1 + Math.random() * 0.4, big, sx: 380 + Math.random() * 200, sy: -760 });
          if (near) audio.sfx('whoosh', { pitch: 0.5, vol: 0.5 });
        }
      }
      if (this.meteorT <= 0) { S.hud.flashTip('The sky calms down.'); }
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      const k = m.t / m.dur;
      const x = m.x + m.sx * (1 - k), y = m.y + m.sy * (1 - k);
      if (Math.random() < dt * 60) S.fx.spawn('fire', x, y, { size: m.big ? 16 : 10, life: 0.45, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', spread: 6 });
      if (Math.random() < dt * 25) S.fx.spawn('smoke', x, y, { size: 8, grow: 20, life: 0.9, color: '#6b5a52' });
      if (k >= 1) { this.impact(m); this.meteors.splice(i, 1); }
    }
  }

  private impact(m: Meteor) {
    const S = this.S;
    const r = m.big ? 46 : 30;
    this.craters.push({ x: m.x, y: m.y, r, age: 0 });
    if (this.craters.length > 40) this.craters.shift();
    const d = Math.hypot(S.player.x - m.x, S.player.y - m.y);
    const vol = clamp(1 - d / 900, 0.1, 1);
    audio.sfx('explode', { vol, pitch: m.big ? 0.8 : 1.1 });
    S.fx.shake(clamp((m.big ? 16 : 10) * (1 - d / 700), 0, 16));
    S.fx.burst('fire', m.x, m.y, m.big ? 26 : 16, { speed: 220, size: 14, life: 0.6, color: '#ffb347', up: 120 });
    S.fx.burst('smoke', m.x, m.y, 12, { speed: 120, size: 14, grow: 30, life: 1.6, color: '#5e5048' });
    S.fx.burst('debris', m.x, m.y, 12, { speed: 200, up: 260, grav: 800, size: 4, life: 1.2, color: '#4a3b35' });
    S.fx.spawn('ring', m.x, m.y, { size: 10, grow: 300, life: 0.45, color: '#ffe0a0' });
    for (const c of S.critters) {
      if (c.gone || c.state === 'abducted') continue;
      const dd = Math.hypot(c.x - m.x, c.y - m.y);
      if (dd < r + 30 + c.r && c.z < 30) damage(S, c, m.big ? 9 : 6, null, { stun: 1.2, knock: 220 });
      else if (dd < 280 && c !== S.player && c.role !== 'pack' && c.role !== 'titan') { c.fear = Math.max(c.fear, 6); c.aggro = 0; }
    }
    if (m.big && this.skyStones < 3) {
      this.skyStones++;
      S.addSkyStone(m.x, m.y);
    }
  }

  // ------------------------------------------------------------------ UFO
  startUfo() {
    const S = this.S;
    if (this.ufo) return;
    let best: Critter | null = null, bd = Infinity;
    for (const c of S.critters) {
      if (c.gone || c.role === 'player' || c.role === 'pack' || c.role === 'kin' || c.role === 'mate' || c.role === 'titan' || c.state === 'social') continue;
      if (c === S.target || c.befriended) continue;
      const d = Math.hypot(c.x - S.player.x, c.y - S.player.y);
      if (d < 120 || d > 650) continue;
      const score = d + (S.cam.isVisible(c.x, c.y, -40) ? 0 : 400);
      if (score < bd) { bd = score; best = c; }
    }
    if (!best) { this.nextUfo = 30; return; }
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.ufo = { x: best.x - dir * 900, y: best.y - 200, z: 260, state: 'in', t: 0, target: best, fromX: best.x - dir * 900, fromY: best.y - 200, dir };
    audio.sfx('warp', { pitch: 0.7, vol: 0.6 });
    S.hint('cr-ufo', 'A strange craft hovers over the island…', '🛸');
  }

  private updateUfo(dt: number) {
    const u = this.ufo;
    if (!u) return;
    const S = this.S;
    u.t += dt;
    const c = u.target;
    if (u.state === 'in') {
      if (!c || c.gone) { u.state = 'out'; u.t = 0; return; }
      const k = easeInOutCubic(clamp(u.t / 2.6, 0, 1));
      u.x = lerp(u.fromX, c.x, k);
      u.y = lerp(u.fromY, c.y, k);
      u.z = lerp(260, 135, k);
      if (u.t >= 2.6) { u.state = 'hover'; u.t = 0; }
    } else if (u.state === 'hover') {
      if (!c || c.gone) { u.state = 'out'; u.t = 0; return; }
      u.x += (c.x - u.x) * Math.min(1, dt * 4);
      u.y += (c.y - u.y) * Math.min(1, dt * 4);
      if (u.t > 0.7) {
        u.state = 'beam'; u.t = 0;
        c.state = 'abducted'; c.st = 0; c.anim = 0; c.vx = c.vy = 0;
        if (S.social.target === c) S.social.cancel('abducted');
        audio.sfx('laser', { pitch: 0.4, vol: 0.6 });
        audio.sfx('warp', { pitch: 1.2, vol: 0.5 });
        for (const o of S.critters) {
          if (o === c || o.gone || o.role === 'player' || o.role === 'pack' || o.role === 'titan') continue;
          if (Math.hypot(o.x - c.x, o.y - c.y) < 300) { o.fear = Math.max(o.fear, 5); o.aggro = 0; }
        }
      }
    } else if (u.state === 'beam') {
      if (c && !c.gone) {
        c.z = easeInOutCubic(clamp(u.t / 2.4, 0, 1)) * (u.z - 20);
        c.anim = clamp(u.t / 2.4, 0, 1);
        if (Math.random() < dt * 20) S.fx.spawn('sparkle', c.x + (Math.random() - 0.5) * 40, c.y - c.z - Math.random() * 30, { color: '#b8ffef', size: 5, life: 0.6 });
      }
      if (u.t > 2.5) {
        if (c && !c.gone) { c.gone = true; S.onAbducted(c); }
        u.state = 'out'; u.t = 0;
        audio.sfx('warp', { pitch: 1.5, vol: 0.6 });
      }
    } else {
      u.x += u.dir * 700 * dt * Math.min(1, u.t * 2);
      u.z += 260 * dt;
      if (u.t > 2.5) this.ufo = null;
    }
  }

  // ------------------------------------------------------------------ sea monster
  seaMonster() {
    const S = this.S;
    if (this.monster) return;
    this.monster = { x: S.player.x, y: S.player.y, t: 0 };
    S.beginCine('monster');
    audio.sfx('splash', { pitch: 0.5 });
    S.hint('cr-sea', 'The deep water belongs to something enormous. Stay in the shallows!', '🌊');
  }

  private updateMonster(dt: number) {
    const S = this.S, m = this.monster!;
    m.t += dt;
    const t = m.t;
    if (t < 0.9 && Math.random() < dt * 40) S.fx.spawn('drop', m.x + (Math.random() - 0.5) * 120, m.y + (Math.random() - 0.5) * 40, { up: 220, grav: 600, size: 3, life: 0.8, color: '#d8f4ff' });
    if (t > 0.9 && t - dt <= 0.9) { audio.sfx('roar', { pitch: 0.35, vol: 1 }); S.fx.shake(12); }
    if (t > 1.65 && t - dt <= 1.65) { audio.sfx('chomp', { pitch: 0.4, vol: 1 }); S.fx.shake(18); S.playerSwallowed = true; }
    if (t > 2.7 && t - dt <= 2.7) {
      this.S.game.fade(() => {
        this.monster = null;
        S.playerSwallowed = false;
        S.respawn('The sea monster spat you back out near your nest!');
      });
    }
  }

  // ------------------------------------------------------------------ special abilities
  lullaby() {
    const S = this.S, p = S.player;
    let n = 0;
    for (const c of S.critters) {
      if (c.gone || c.role === 'titan' || S.isPlayerSide(c) || c.role === 'kin' || c.role === 'mate') continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) > 340) continue;
      c.lulled = 18; c.aggro = 0; c.target = null; c.fear = 0; c.socialCd = 0;
      S.say(c, '💤', 2);
      n++;
    }
    audio.sfx('sing', { pitch: 0.8 });
    audio.sfx('charm', { pitch: 0.9 });
    for (let i = 0; i < 3; i++) S.fx.spawn('ring', p.x, p.y, { size: 20 + i * 30, grow: 380, life: 0.9 + i * 0.2, color: '#ff9ee8' });
    S.fx.burst('emoji', p.x, p.y, 10, { emoji: Math.random() < 0.5 ? '🎵' : '🎶', size: 18, speed: 160, up: 80, life: 1.4, z: 40 });
    S.hud.flashTip(n ? `Lullaby enchanted ${n} creature${n > 1 ? 's' : ''}` : 'A lovely song… but nobody heard it');
  }

  roar() {
    const S = this.S, p = S.player;
    let n = 0;
    for (const c of S.critters) {
      if (c.gone || c.role === 'titan' || c.role === 'loner' || S.isPlayerSide(c) || c.role === 'kin' || c.role === 'mate') continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) > 360) continue;
      c.fear = 10; c.aggro = 0; c.target = null;
      S.say(c, '😱', 1.6);
      n++;
    }
    audio.sfx('roar', { pitch: 0.8, vol: 1 });
    S.fx.shake(10);
    for (let i = 0; i < 3; i++) S.fx.spawn('ring', p.x, p.y, { size: 16 + i * 20, grow: 460, life: 0.6 + i * 0.12, color: '#ffd166' });
    S.fx.burst('dust', p.x, p.y, 18, { speed: 260, size: 10, grow: 24, life: 0.8, color: '#e6d3a5' });
    S.hud.flashTip(n ? `${n} creature${n > 1 ? 's' : ''} fled in terror!` : 'ROAAAR!');
  }

  flock() {
    const S = this.S, p = S.player;
    this.flockT = 28;
    const cols = ['#5cc8ff', '#ffd166', '#ff7a59', '#7bd389', '#c77dff', '#ffffff'];
    this.birds = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU;
      this.birds.push({ x: p.x + Math.cos(a) * 600, y: p.y + Math.sin(a) * 400, z: 160, ang: a, ph: Math.random() * TAU, cd: Math.random(), vx: 0, vy: 0, col: cols[i % cols.length], leaving: false });
    }
    audio.sfx('bell');
    audio.sfx('whoosh', { pitch: 1.4 });
    S.hud.flashTip('A flock answers your call!');
  }

  flockSocialBonus(): number { return this.flockT > 0 ? 1 : 0; }

  private updateBirds(dt: number) {
    if (!this.birds.length) return;
    const S = this.S, p = S.player;
    if (this.flockT > 0) {
      this.flockT -= dt;
      if (this.flockT <= 0) for (const b of this.birds) b.leaving = true;
    }
    const enemy = S.target && !S.target.gone && S.isEnemy(S.target) && !S.isFriendlyTarget(S.target) && S.inCombat > 0 && Math.hypot(S.target.x - p.x, S.target.y - p.y) < 450 ? S.target : null;
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.ph += dt * 14;
      b.cd -= dt;
      let tx: number, ty: number, tz: number;
      if (b.leaving) { tx = b.x + Math.cos(b.ang) * 400; ty = b.y - 200; tz = b.z + 200; }
      else if (enemy) {
        b.ang += dt * 3;
        const dive = b.cd < 0.25;
        tx = enemy.x + Math.cos(b.ang + i) * (dive ? 6 : 50);
        ty = enemy.y + Math.sin(b.ang + i) * (dive ? 4 : 30);
        tz = dive ? critterHeight(enemy) * 0.6 : critterHeight(enemy) + 50;
        if (dive && b.cd <= 0 && Math.hypot(b.x - enemy.x, b.y - enemy.y) < enemy.r + 20) {
          b.cd = 0.9 + Math.random() * 0.5;
          damage(S, enemy, 1.5, S.player, { quiet: true });
          S.fx.burst('leaf', b.x, b.y, 2, { z: b.z, color: b.col, size: 3, speed: 60, life: 0.6, vr: 6 });
          audio.sfx('tap', { pitch: 1.8, vol: 0.3 });
        }
      } else {
        b.ang += dt * (0.9 + (i % 3) * 0.2);
        tx = p.x + Math.cos(b.ang + i * 1.05) * 80;
        ty = p.y + Math.sin(b.ang + i * 1.05) * 45;
        tz = 70 + Math.sin(b.ph * 0.2 + i) * 15 + (S.social.target ? 30 : 0);
      }
      const k = 1 - Math.exp(-3.5 * dt);
      b.vx = (tx - b.x) * k / dt; b.vy = (ty - b.y) * k / dt;
      b.x += (tx - b.x) * k;
      b.y += (ty - b.y) * k;
      b.z += (tz - b.z) * k;
      if (b.leaving && b.z > 500) this.birds.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ drawing
  drawGround(g: CanvasRenderingContext2D) {
    const cam = this.S.cam;
    for (const c of this.craters) {
      if (!cam.isVisible(c.x, c.y, c.r + 20)) continue;
      g.fillStyle = 'rgba(70,50,35,0.55)';
      g.beginPath(); g.ellipse(c.x, c.y, c.r * 1.25, c.r * 0.7, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(35,25,20,0.65)';
      g.beginPath(); g.ellipse(c.x, c.y + 2, c.r * 0.85, c.r * 0.45, 0, 0, TAU); g.fill();
      if (c.age < 20) {
        const a = (1 - c.age / 20) * (0.6 + 0.4 * Math.sin(this.S.t * 6 + c.x));
        g.fillStyle = `rgba(255,120,40,${(a * 0.7).toFixed(3)})`;
        g.beginPath(); g.ellipse(c.x, c.y + 2, c.r * 0.5, c.r * 0.25, 0, 0, TAU); g.fill();
      }
    }
  }

  drawSky(g: CanvasRenderingContext2D) {
    const S = this.S;
    // Meteors.
    for (const m of this.meteors) {
      const k = m.t / m.dur;
      const x = m.x + m.sx * (1 - k), y = m.y + m.sy * (1 - k);
      // Target marker on the ground.
      g.strokeStyle = `rgba(255,90,40,${(0.25 + k * 0.6).toFixed(3)})`;
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(m.x, m.y, 30 * (1.4 - k * 0.6), 16 * (1.4 - k * 0.6), 0, 0, TAU); g.stroke();
      const gr = g.createLinearGradient(x, y, x + m.sx * 0.22, y + m.sy * 0.22);
      gr.addColorStop(0, 'rgba(255,240,200,0.95)');
      gr.addColorStop(1, 'rgba(255,120,40,0)');
      g.strokeStyle = gr;
      g.lineWidth = m.big ? 14 : 9;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + m.sx * 0.22, y + m.sy * 0.22); g.stroke();
      g.fillStyle = '#fff4d6';
      g.beginPath(); g.arc(x, y, m.big ? 9 : 6, 0, TAU); g.fill();
    }
    // UFO.
    const u = this.ufo;
    if (u) {
      drawShadow(g, u.x, u.y, 120, 34);
      if (u.state === 'beam') {
        const a = 0.25 + 0.1 * Math.sin(S.t * 18);
        const gr = g.createLinearGradient(0, u.y - u.z, 0, u.y);
        gr.addColorStop(0, `rgba(160,255,230,${(a + 0.25).toFixed(3)})`);
        gr.addColorStop(1, `rgba(160,255,230,${(a * 0.4).toFixed(3)})`);
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(u.x - 18, u.y - u.z + 6); g.lineTo(u.x + 18, u.y - u.z + 6);
        g.lineTo(u.x + 60, u.y); g.lineTo(u.x - 60, u.y); g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(220,255,245,0.5)';
        g.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const k = ((S.t * 0.8 + i / 4) % 1);
          g.beginPath(); g.ellipse(u.x, u.y - u.z + 6 + k * u.z, 18 + k * 42, (18 + k * 42) * 0.3, 0, 0, TAU); g.stroke();
        }
      }
      const ux = u.x, uy = u.y - u.z + Math.sin(S.t * 2) * 4;
      g.save();
      g.translate(ux, uy);
      g.rotate(Math.sin(S.t * 1.7) * 0.06);
      g.fillStyle = 'rgba(170,240,255,0.85)';
      g.strokeStyle = '#1d3346';
      g.lineWidth = 2.4;
      g.beginPath(); g.ellipse(0, -10, 20, 16, 0, Math.PI, TAU); g.fill(); g.stroke();
      const body = g.createLinearGradient(0, -14, 0, 12);
      body.addColorStop(0, '#e8eef5'); body.addColorStop(0.5, '#9aa9bb'); body.addColorStop(1, '#4d5b6d');
      g.fillStyle = body;
      g.beginPath(); g.ellipse(0, 0, 54, 13, 0, 0, TAU); g.fill(); g.stroke();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + S.t * 2;
        const lx = Math.cos(a) * 42;
        if (Math.sin(a) < -0.2) continue;
        g.fillStyle = (i + Math.floor(S.t * 4)) % 2 ? '#ffe066' : '#66ffd9';
        g.beginPath(); g.arc(lx, 3 + Math.sin(a) * 3, 3.2, 0, TAU); g.fill();
      }
      g.restore();
    }
    // Flock birds.
    for (const b of this.birds) {
      if (b.z < 160) drawShadow(g, b.x, b.y, 22, 7);
      const x = b.x, y = b.y - b.z;
      const flap = Math.sin(b.ph);
      const f = b.vx >= 0 ? 1 : -1;
      g.save();
      g.translate(x, y);
      g.scale(f * 1.35, 1.35);
      g.lineJoin = 'round';
      g.strokeStyle = '#1b2633';
      g.lineWidth = 1.5;
      // Far wing, body + tail, near wing, head and beak.
      const wing = (dy: number, shade: string) => {
        g.fillStyle = shade;
        g.beginPath();
        g.moveTo(-3, -1);
        g.quadraticCurveTo(-4, dy * 0.6, -9, dy);
        g.quadraticCurveTo(-1, dy * 0.4, 4, -1);
        g.closePath();
        g.fill(); g.stroke();
      };
      wing(-6 - flap * 7, 'rgba(0,0,0,0.25)');
      g.fillStyle = b.col;
      g.beginPath(); g.moveTo(-6, 0); g.lineTo(-12, -3); g.lineTo(-11, 3); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(0, 0, 7, 4.2, -0.1, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.arc(6, -2.5, 3.4, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#1b2633';
      g.beginPath(); g.arc(7.2, -3.2, 0.9, 0, TAU); g.fill();
      g.fillStyle = '#ffb347';
      g.beginPath(); g.moveTo(9, -3); g.lineTo(13, -2); g.lineTo(9, -1); g.closePath(); g.fill();
      wing(-5 - flap * 9, b.col);
      g.restore();
    }
    // Sea monster.
    const m = this.monster;
    if (m) this.drawMonster(g, m);
  }

  private drawMonster(g: CanvasRenderingContext2D, m: { x: number; y: number; t: number }) {
    const t = m.t;
    const rise = t < 0.9 ? 0 : t < 1.5 ? easeOutCubic((t - 0.9) / 0.6) : t < 2.1 ? 1 : 1 - easeInOutCubic(clamp((t - 2.1) / 0.6, 0, 1));
    // Dark shape under the water.
    g.fillStyle = `rgba(5,25,40,${(clamp(t / 0.8, 0, 1) * 0.55).toFixed(3)})`;
    g.beginPath(); g.ellipse(m.x, m.y + 10, 150, 60, 0, 0, TAU); g.fill();
    if (rise <= 0) return;
    const H = 165 * rise;
    const jaw = t < 1.65 ? clamp((t - 1.0) / 0.4, 0, 1) : clamp(1 - (t - 1.65) / 0.12, 0, 1);
    g.save();
    g.beginPath();
    g.rect(m.x - 400, m.y - 900, 800, 900 + 6);
    g.clip();
    // Neck.
    const neck = new Path2D();
    neck.moveTo(m.x - 70, m.y + 10);
    neck.quadraticCurveTo(m.x - 90, m.y - H * 0.5, m.x - 20, m.y - H);
    neck.lineTo(m.x + 40, m.y - H + 20);
    neck.quadraticCurveTo(m.x + 10, m.y - H * 0.45, m.x + 50, m.y + 10);
    neck.closePath();
    g.lineWidth = 5; g.strokeStyle = '#06222e'; g.stroke(neck);
    const gr = g.createLinearGradient(m.x - 80, 0, m.x + 50, 0);
    gr.addColorStop(0, '#1e6f7a'); gr.addColorStop(0.6, '#2c8f8a'); gr.addColorStop(1, '#155260');
    g.fillStyle = gr; g.fill(neck);
    g.fillStyle = 'rgba(190,240,200,0.35)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(m.x - 30 + i * 4, m.y - H * (0.15 + i * 0.13), 9, 0, TAU); g.fill(); }
    // Head with jaws.
    g.translate(m.x + 10, m.y - H);
    const open = jaw * 0.7;
    g.save(); g.rotate(-open);
    g.fillStyle = '#2c8f8a'; g.strokeStyle = '#06222e'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(-40, 0); g.quadraticCurveTo(0, -46, 90, -6); g.lineTo(90, 4); g.lineTo(-40, 10); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-10 + i * 15, 4); g.lineTo(-4 + i * 15, 16); g.lineTo(2 + i * 15, 4); g.fill(); }
    g.fillStyle = '#ffe14d';
    g.beginPath(); g.arc(14, -20, 9, 0, TAU); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(16, -20, 3, 7, 0, 0, TAU); g.fill();
    g.restore();
    g.save(); g.rotate(open * 0.6);
    g.fillStyle = '#1e6f7a'; g.strokeStyle = '#06222e'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(-40, 8); g.lineTo(80, 10); g.quadraticCurveTo(20, 40, -40, 26); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-4 + i * 16, 10); g.lineTo(2 + i * 16, 0); g.lineTo(8 + i * 16, 10); g.fill(); }
    g.restore();
    g.restore();
    // Splash ring at the waterline.
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 4;
    g.beginPath(); g.ellipse(m.x - 10, m.y + 8, 90, 26, 0, 0, TAU); g.stroke();
  }
}

export function announce(text: string) {
  ui.toast(text, { icon: '📣' });
}
