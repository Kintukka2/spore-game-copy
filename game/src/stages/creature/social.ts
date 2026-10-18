// The socialize mini-game: the target performs an action (shown over its head), the player taps the
// matching social ability. Matching fills your meter (scaled by your level vs theirs); their meter
// fills on its own. First to fill wins.
import { audio } from '../../engine/audio';
import { clamp } from '../../engine/math';
import { ABILITY_INFO } from '../../editor/abilityInfo';
import type { CreatureStage } from './stage';
import type { Critter } from './types';
import { AB_ACTION, SOCIAL_ABS, type SocialAb } from './config';
import { critterHeight } from './species';
import { setAction } from './combat';
import { drawBubble, drawEmoji, roundRect } from './sprites';

export class Social {
  target: Critter | null = null;
  their = 0;
  mine = 0;
  need = 1;
  want: SocialAb = 'sing';
  wantLvl = 1;
  private wantT = 0;
  private matched = 0;
  private performT = 0;
  private pulse = 0;
  private result: { x: number; y: number; t: number; good: boolean } | null = null;

  constructor(private S: CreatureStage) {}

  /** Why this creature can't be socialized right now (or null if it can). */
  blocker(c: Critter): string | null {
    const sp = c.sp;
    if (c.role === 'titan') return 'Titans cannot be befriended';
    if (c.role === 'pack' || c.role === 'kin' || c.role === 'mate') return 'Already family';
    if (c.befriended) return `This ${sp.name} is already your friend`;
    if (sp.relation === 'allied') return `${sp.name} are already allies`;
    if (sp.relation === 'extinct') return 'Extinct';
    if (sp.relation === 'hostile' && c.lulled <= 0) return `${sp.name} are hostile and won't listen`;
    if (c.aggro > 0 && c.target && c.lulled <= 0) return `It's too angry to listen`;
    if (c.socialCd > 0 && c.lulled <= 0) return 'It needs a moment';
    if (c.stun > 0) return 'It is dazed';
    return null;
  }

  start(c: Critter) {
    const S = this.S;
    this.target = c;
    this.their = 0;
    this.mine = 0;
    this.need = c.role === 'alpha' ? 1.4 : c.role === 'loner' ? 1.25 : 1;
    this.matched = 0;
    this.result = null;
    this.pickWant();
    c.vx = c.vy = 0;
    c.facing = S.player.x > c.x ? 1 : -1;
    S.player.facing = c.x > S.player.x ? 1 : -1;
    S.intent = null;
    audio.sfx('pop', { pitch: 1.3 });
    S.hint('cr-social-rules', 'Copy the action shown over its head. Fill your side of the meter before theirs fills!', '🎵');
    S.hud.refreshSocialWant();
  }

  private pickWant() {
    const c = this.target!;
    const opts = SOCIAL_ABS.filter((a) => (c.sp.stats[a] ?? 0) >= 1);
    const list = opts.length ? opts : (['sing'] as SocialAb[]);
    let w = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && w === this.want) w = list[(list.indexOf(w) + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length];
    this.want = w;
    this.wantLvl = Math.max(1, c.sp.stats[w] ?? 1) + (c.role === 'alpha' ? 1 : 0);
    this.wantT = 2.8 + Math.random() * 1.1;
    this.matched = 0;
    this.performT = 0;
    this.S.say(c, ABILITY_INFO[w].icon, this.wantT + 0.2);
    this.S.hud.refreshSocialWant();
  }

  cancel(_reason: string) {
    if (!this.target) return;
    const c = this.target;
    if (c.emote && SOCIAL_ABS.some((a) => ABILITY_INFO[a].icon === c.emote)) { c.emote = null; c.emoteT = 0; }
    this.target = null;
    this.S.hud.refreshSocialWant();
  }

  press(ab: SocialAb) {
    const S = this.S, c = this.target;
    if (!c) return;
    const lvl = S.abLevel(ab);
    if (lvl <= 0) { S.lackAbility(ab); return; }
    if ((S.cool.social ?? 0) > 0) return;
    S.cool.social = 0.45;
    S.performSocial(ab);
    if (ab === this.want) {
      const eff = lvl + S.packSocialBonus(ab) + S.flockSocialBonus();
      let gain = clamp(0.2 + 0.07 * (eff - this.wantLvl), 0.075, 0.38);
      if (c.lulled > 0) gain *= 1.6;
      this.mine += gain;
      this.matched++;
      this.pulse = 1;
      S.fx.burst('sparkle', c.x, c.y, 5, { z: critterHeight(c) * 0.8, color: '#ffe48a', speed: 70, size: 6, life: 0.6, up: 40 });
      S.fx.text(S.player.x, S.player.y, critterHeight(S.player) + 14, gain > 0.25 ? 'Great!' : 'Nice', '#7dffd8', 15);
      if (this.matched >= 2) this.wantT = Math.min(this.wantT, 0.6);
    } else {
      this.mine = Math.max(0, this.mine - 0.06);
      S.fx.text(c.x, c.y, critterHeight(c) + 16, '😒', '#ffffff', 18);
      audio.sfx('error', { vol: 0.4 });
    }
  }

  update(dt: number) {
    const S = this.S, c = this.target;
    if (this.result) { this.result.t += dt; if (this.result.t > 1.2) this.result = null; }
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 3);
    if (!c) return;
    const d = Math.hypot(c.x - S.player.x, c.y - S.player.y);
    if (c.gone || !S.playerAlive || d > 320 || (c.aggro > 0 && c.lulled <= 0)) { this.cancel('lost'); return; }
    // The target keeps performing what it wants.
    this.performT -= dt;
    if (this.performT <= 0) {
      setAction(c, AB_ACTION[this.want].action, AB_ACTION[this.want].dur);
      this.performT = AB_ACTION[this.want].dur + 0.25;
      if (c.near && Math.random() < 0.5) audio.sfx(this.want, { vol: 0.3, pitch: 1.15 });
    }
    // Nest-mates gather to watch, which makes them harder to impress.
    let watchers = 0;
    if (c.sp.nest) for (const o of S.critters) {
      if (o !== c && !o.gone && o.sp === c.sp && Math.hypot(o.x - c.x, o.y - c.y) < 200) watchers++;
    }
    let rate = (0.068 + 0.011 * c.sp.level) * S.game.diff(0.8, 1, 1.15) * (1 + Math.min(3, watchers) * 0.05);
    if (c.lulled > 0) rate *= 0.55;
    if (c.role === 'baby') rate *= 0.7;
    this.their += rate * dt;
    this.wantT -= dt;
    if (this.wantT <= 0) this.pickWant();
    if (this.mine >= this.need) this.succeed();
    else if (this.their >= 1) this.fail();
  }

  private succeed() {
    const S = this.S, c = this.target!;
    this.target = null;
    if (S.target === c) S.target = null;
    c.befriended = true;
    c.socialCd = 9999;
    S.say(c, '❤️', 2.5);
    this.result = { x: c.x, y: c.y - critterHeight(c), t: 0, good: true };
    audio.sfx('success');
    S.fx.burst('emoji', c.x, c.y, 6, { emoji: '❤️', size: 18, speed: 70, up: 90, life: 1.2, z: critterHeight(c) * 0.8 });
    S.fx.burst('sparkle', c.x, c.y, 14, { z: critterHeight(c) * 0.6, color: '#ff9ec7', speed: 120, size: 7, life: 0.9, up: 60 });
    setAction(c, 'dance', 1.2);
    S.onBefriended(c);
    S.hud.refreshSocialWant();
  }

  private fail() {
    const S = this.S, c = this.target!;
    this.target = null;
    c.socialCd = 4;
    S.say(c, '👎', 1.8);
    this.result = { x: c.x, y: c.y - critterHeight(c), t: 0, good: false };
    audio.sfx('fail');
    S.hud.flashTip('Not impressed. Try again!');
    S.hint('cr-social-fail', 'Tip: better social parts, a pack, or a Lullaby make impressing much easier.', '🎵');
    S.hud.refreshSocialWant();
  }

  /** Screen-space meter above the target. */
  render(g: CanvasRenderingContext2D) {
    const S = this.S, cam = S.cam;
    if (this.result) {
      const s = cam.worldToScreen(this.result.x, this.result.y);
      const k = this.result.t / 1.2;
      g.globalAlpha = 1 - k;
      g.font = '700 22px Fredoka, system-ui, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 5;
      g.strokeStyle = '#0b1a28';
      const txt = this.result.good ? 'Befriended!' : 'Failed';
      g.strokeText(txt, s.x, s.y - 50 - k * 30);
      g.fillStyle = this.result.good ? '#ff9ec7' : '#c9c3b6';
      g.fillText(txt, s.x, s.y - 50 - k * 30);
      g.globalAlpha = 1;
    }
    const c = this.target;
    if (!c) return;
    // The wanted action floats over the target; the meter sits just below both creatures' feet.
    const top = cam.worldToScreen(c.x, c.y - critterHeight(c) - c.z);
    drawBubble(g, ABILITY_INFO[this.want].icon, top.x, top.y - 6, 1.15 + this.pulse * 0.2, '#fffbe8');
    const pf = cam.worldToScreen(S.player.x, S.player.y), tf = cam.worldToScreen(c.x, c.y);
    const portrait = cam.h >= cam.w;
    const x = clamp((pf.x + tf.x) / 2, 100, cam.w - (portrait ? 100 : 260));
    const y = clamp(Math.max(pf.y, tf.y) + 22, 200, cam.h - (portrait ? 330 : 80));
    const W = 170, H = 16;
    g.font = '700 11px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Meter.
    const my = y + 8;
    g.fillStyle = 'rgba(8,18,32,0.85)';
    roundRect(g, x - W / 2 - 6, my - 10, W + 12, H + 30, 12);
    g.fill();
    // Two tracks racing outward from the badge in the middle.
    const br = 15 + this.pulse * 3;
    const gap = 18;
    const half = W / 2 - gap;
    const mine = clamp(this.mine / this.need, 0, 1), theirs = clamp(this.their, 0, 1);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(g, x - W / 2, my, half, H, 7); g.fill();
    roundRect(g, x + gap, my, half, H, 7); g.fill();
    if (mine > 0) {
      const gm = g.createLinearGradient(x - gap - half, 0, x - gap, 0);
      gm.addColorStop(0, '#7dffd8'); gm.addColorStop(1, '#1fb894');
      g.fillStyle = gm;
      roundRect(g, x - gap - half * mine, my + 1, half * mine, H - 2, 6);
      g.fill();
    }
    if (theirs > 0) {
      const gt = g.createLinearGradient(x + gap, 0, x + gap + half, 0);
      gt.addColorStop(0, '#ff9f43'); gt.addColorStop(1, '#ff5d5d');
      g.fillStyle = gt;
      roundRect(g, x + gap, my + 1, half * theirs, H - 2, 6);
      g.fill();
    }
    // Wanted action badge in the middle of the tug-of-war.
    g.fillStyle = '#fffbe8';
    g.strokeStyle = 'rgba(30,40,60,0.9)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, my + H / 2, br, 0, Math.PI * 2); g.fill(); g.stroke();
    drawEmoji(g, ABILITY_INFO[this.want].icon, x, my + H / 2 + 1, 18);
    g.fillStyle = '#d9fff3';
    g.fillText('You', x - W / 4, my + H + 9);
    g.fillStyle = '#ffd9c2';
    g.fillText(`${ABILITY_INFO[this.want].name} ${this.wantLvl}`, x + W / 4, my + H + 9);
  }
}
