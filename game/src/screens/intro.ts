// Opening cinematic: a comet carrying life falls into the ocean of the player's new world.
import type { Game, Scene } from '../game/game';
import { button, h } from '../engine/ui';
import { audio } from '../engine/audio';
import { clamp, easeInOutCubic, lerp, TAU } from '../engine/math';
import { hsl } from '../design/color';
import { hashString } from '../engine/rng';

export class IntroScene implements Scene {
  name = 'intro';
  music = 'space' as const;
  private game!: Game;
  private t = 0;
  private done = false;
  private hue = 200;
  private boomed = false;
  private caption!: HTMLElement;

  enter(game: Game) {
    this.game = game;
    this.hue = (hashString(game.state?.planetName ?? 'x') % 360);
    const L = game.layer();
    this.caption = h('div', { style: 'position:absolute;left:0;right:0;bottom:calc(90px + var(--safe-b));text-align:center;font-size:18px;color:#cfe;opacity:0;transition:opacity .8s;padding:0 24px;text-shadow:0 2px 8px #000' });
    L.append(this.caption);
    L.append(button('Skip ⏭', () => this.finish(), { cls: 'small skip-btn' }));
    audio.sfx('whoosh', { pitch: 0.5 });
  }
  exit() {}

  private say(text: string) {
    this.caption.textContent = text;
    this.caption.style.opacity = '1';
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    this.game.startStage('cell');
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    if (t > 0.6 && t < 0.7) this.say('Somewhere in the void, a frozen comet carries something extraordinary...');
    if (t > 4.6 && t < 4.7) this.say(`...toward a young world called ${this.game.state?.planetName ?? 'home'}.`);
    if (t > 7.4 && !this.boomed) { this.boomed = true; audio.sfx('splash', { pitch: 0.6 }); audio.sfx('explode', { pitch: 1.6, vol: 0.4 }); }
    if (t > 8.2 && t < 8.3) this.say('In the warm shallows, life begins.');
    if (t > 11.5) this.finish();
  }

  render(g: CanvasRenderingContext2D, w: number, hh: number) {
    const t = this.t;
    g.fillStyle = '#02040a';
    g.fillRect(0, 0, w, hh);
    // Zoom: 0 → 1 over 3..7.4s, then dive.
    const z = easeInOutCubic(clamp((t - 2.5) / 5, 0, 1));
    const dive = clamp((t - 7.4) / 1.6, 0, 1);
    for (let i = 0; i < 200; i++) {
      const sx = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1, sy = ((Math.sin(i * 78.233) * 12345.678) % 1 + 1) % 1;
      const px = w / 2 + (sx - 0.5) * w * (1 + z * 1.5), py = hh / 2 + (sy - 0.5) * hh * (1 + z * 1.5);
      g.fillStyle = `rgba(255,255,255,${(0.25 + (i % 5) * 0.12) * (1 - dive)})`;
      g.fillRect(px, py, 1.5, 1.5);
    }
    const R = lerp(18, Math.max(w, hh) * 0.9, z) * (1 + dive * 3);
    const cx = w / 2, cy = lerp(hh * 0.62, hh * 1.25, z);
    const gr = g.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.05, cx, cy, R);
    gr.addColorStop(0, hsl(this.hue, 0.7, 0.65));
    gr.addColorStop(0.75, hsl(this.hue, 0.65, 0.38));
    gr.addColorStop(1, hsl(this.hue, 0.6, 0.12));
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
    g.fillStyle = hsl((this.hue + 90) % 360, 0.5, 0.4);
    for (let i = 0; i < 6; i++) {
      g.globalAlpha = 0.85;
      g.beginPath();
      g.ellipse(cx + Math.cos(i * 1.7 + t * 0.05) * R * 0.6, cy + Math.sin(i * 2.3) * R * 0.5, R * 0.18, R * 0.1, i, 0, TAU);
      g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
    g.strokeStyle = `rgba(150,220,255,${0.4 * (1 - dive)})`;
    g.lineWidth = Math.max(2, R * 0.03);
    g.beginPath(); g.arc(cx, cy, R + g.lineWidth / 2, 0, TAU); g.stroke();
    // Comet
    if (t < 7.6) {
      const k = clamp(t / 7.4, 0, 1);
      const ex = cx, ey = cy - R * 0.92;
      const sx2 = -60, sy2 = -40;
      const kx = easeInOutCubic(k);
      const x = lerp(sx2, ex, kx), y = lerp(sy2, ey, kx);
      const ang = Math.atan2(ey - sy2, ex - sx2);
      const len = 120 + z * 220;
      const tail = g.createLinearGradient(x, y, x - Math.cos(ang) * len, y - Math.sin(ang) * len);
      tail.addColorStop(0, 'rgba(200,255,255,0.9)');
      tail.addColorStop(1, 'rgba(120,200,255,0)');
      g.strokeStyle = tail;
      g.lineCap = 'round';
      g.lineWidth = 8 + z * 14;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); g.stroke();
      g.fillStyle = '#eaffff';
      g.beginPath(); g.arc(x, y, 5 + z * 8, 0, TAU); g.fill();
    }
    // Underwater fade
    if (dive > 0) {
      g.fillStyle = `rgba(6,60,80,${dive})`;
      g.fillRect(0, 0, w, hh);
      for (let i = 0; i < 40; i++) {
        const bx = (Math.sin(i * 3.1) * 0.5 + 0.5) * w;
        const by = hh - ((t - 7.4) * 160 * (0.5 + (i % 5) * 0.2) + i * 37) % (hh + 40);
        g.strokeStyle = `rgba(200,255,255,${0.5 * dive})`;
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(bx, by, 2 + (i % 4) * 2, 0, TAU); g.stroke();
      }
    }
  }
}
