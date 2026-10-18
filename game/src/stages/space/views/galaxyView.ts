// Galaxy map: glowing spiral arms (pre-rendered), empire territory tints, stars with culling,
// range ring, routes, mission and alert markers. Pan, pinch and tap a star.
import { Camera } from '../../../engine/camera';
import { TAU, clamp } from '../../../engine/math';
import type { PointerInfo } from '../../../engine/input';
import { hexToRgb } from '../../../design/color';
import { GALAXY_R, RING_IN, RING_OUT } from '../data';
import { blit, canvas, glow, starSprite } from '../art/sprites';
import type { SpaceStage } from '../stage';
import type { Star } from '../types';

const E = GALAXY_R * 1.15;
const PLAYER_COLOR = '#3ee6c4';

export class GalaxyView {
  cam = new Camera();
  selected: number | null = null;
  route: number[] | null = null;
  private glowLayer: HTMLCanvasElement | null = null;
  private terrLayer: HTMLCanvasElement | null = null;
  private terrT = 0;
  private t = 0;
  private vel = { x: 0, y: 0 };
  private dragging = false;

  constructor(private st: SpaceStage) {
    this.cam.minZoom = 0.16;
    this.cam.maxZoom = 4;
  }

  enter(focus?: number) {
    const s = this.st.w.star(focus ?? this.st.w.s.loc);
    this.cam.x = s.x;
    this.cam.y = s.y;
    if (this.cam.zoom < 0.5 || this.cam.zoom > 2.5) this.cam.zoom = 1.3;
    if (!this.glowLayer) this.buildGlow();
    this.vel.x = this.vel.y = 0;
  }

  focus(id: number, zoom?: number) {
    const s = this.st.w.star(id);
    this.cam.x = s.x;
    this.cam.y = s.y;
    if (zoom) this.cam.zoom = zoom;
  }

  // ------------------------------------------------------------------ pre-rendered layers
  private buildGlow() {
    const S = 1024;
    const c = canvas(S, S);
    const g = c.getContext('2d')!;
    const k = S / (2 * E);
    g.translate(S / 2, S / 2);
    g.scale(k, k);
    // Deep halo
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, GALAXY_R * 1.1);
    halo.addColorStop(0, 'rgba(255,220,170,0.55)');
    halo.addColorStop(0.12, 'rgba(255,190,140,0.28)');
    halo.addColorStop(0.35, 'rgba(150,120,220,0.12)');
    halo.addColorStop(0.7, 'rgba(70,90,180,0.06)');
    halo.addColorStop(1, 'rgba(20,30,80,0)');
    g.fillStyle = halo;
    g.fillRect(-E, -E, 2 * E, 2 * E);
    // Nebulae
    for (const n of this.st.w.gal.nebulae) {
      const gr = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      gr.addColorStop(0, `hsla(${n.hue},75%,55%,${n.a})`);
      gr.addColorStop(1, `hsla(${n.hue},75%,40%,0)`);
      g.fillStyle = gr;
      g.beginPath(); g.arc(n.x, n.y, n.r, 0, TAU); g.fill();
    }
    // Arms emerge from the density of stars.
    g.globalCompositeOperation = 'lighter';
    for (const s of this.st.w.gal.stars) {
      if (s.type === 'core') continue;
      const col = s.hollow ? '#9a6a7a' : s.color;
      g.globalAlpha = s.hollow ? 0.1 : 0.09;
      blit(g, glow(col, 32), s.x, s.y, 110);
      g.globalAlpha = s.hollow ? 0.12 : 0.2;
      blit(g, glow(col, 32), s.x, s.y, 40);
    }
    g.globalAlpha = 1;
    // Hollow ring: a cold grey band
    const ring = g.createRadialGradient(0, 0, RING_IN * 0.8, 0, 0, RING_OUT * 1.08);
    ring.addColorStop(0, 'rgba(255,60,80,0)');
    ring.addColorStop(0.35, 'rgba(160,170,200,0.10)');
    ring.addColorStop(0.75, 'rgba(255,60,80,0.07)');
    ring.addColorStop(1, 'rgba(255,60,80,0)');
    g.fillStyle = ring;
    g.beginPath(); g.arc(0, 0, RING_OUT * 1.1, 0, TAU); g.fill();
    // Core
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 160);
    core.addColorStop(0, 'rgba(255,250,235,0.95)');
    core.addColorStop(0.2, 'rgba(255,230,180,0.55)');
    core.addColorStop(0.6, 'rgba(255,170,120,0.15)');
    core.addColorStop(1, 'rgba(255,150,100,0)');
    g.fillStyle = core;
    g.beginPath(); g.arc(0, 0, 160, 0, TAU); g.fill();
    this.glowLayer = c;
  }

  private buildTerritory() {
    const S = 512;
    const c = this.terrLayer ?? canvas(S, S);
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    const k = S / (2 * E);
    g.translate(S / 2, S / 2);
    g.scale(k, k);
    const w = this.st.w;
    for (const s of w.gal.stars) {
      const o = w.ownerOf(s.id);
      if (!o || o === 'hollow') continue;
      const col = o === 'player' ? PLAYER_COLOR : w.emap.get(o)?.color ?? '#ffffff';
      const [r, gg, b] = hexToRgb(col);
      const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, 58);
      gr.addColorStop(0, `rgba(${r},${gg},${b},0.42)`);
      gr.addColorStop(0.6, `rgba(${r},${gg},${b},0.22)`);
      gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = gr;
      g.beginPath(); g.arc(s.x, s.y, 58, 0, TAU); g.fill();
    }
    this.terrLayer = c;
    w.dirtyTerritory = false;
  }

  // ------------------------------------------------------------------ loop
  update(dt: number) {
    this.t += dt;
    this.terrT -= dt;
    if (this.st.w.dirtyTerritory && this.terrT <= 0) { this.buildTerritory(); this.terrT = 1; }
    if (!this.dragging) {
      this.cam.x += this.vel.x * dt;
      this.cam.y += this.vel.y * dt;
      const k = Math.exp(-5 * dt);
      this.vel.x *= k; this.vel.y *= k;
    }
    const lim = GALAXY_R * 1.1;
    this.cam.x = clamp(this.cam.x, -lim, lim);
    this.cam.y = clamp(this.cam.y, -lim, lim);
  }

  render(g: CanvasRenderingContext2D, W: number, H: number) {
    const cam = this.cam;
    cam.setViewport(W, H);
    const w = this.st.w;
    this.st.backdrop.draw(g, W, H, cam.x * cam.zoom * 0.5, cam.y * cam.zoom * 0.5, 262, 11, '#03050f', '#0a0618');
    if (!this.terrLayer || (w.dirtyTerritory && this.terrT <= 0)) { this.buildTerritory(); this.terrT = 1; }
    g.save();
    cam.apply(g);
    if (this.glowLayer) g.drawImage(this.glowLayer, -E, -E, 2 * E, 2 * E);
    if (this.terrLayer) g.drawImage(this.terrLayer, -E, -E, 2 * E, 2 * E);
    const z = cam.zoom;
    const px = 1 / z;
    // Wormhole links you know about
    g.setLineDash([6 * px, 6 * px]);
    g.strokeStyle = 'rgba(180,140,255,0.55)';
    g.lineWidth = 1.5 * px;
    for (const id of w.s.knownTwins) {
      const s = w.star(id);
      if (s.twin === undefined || s.twin < id) continue;
      const t = w.star(s.twin);
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(t.x, t.y); g.stroke();
    }
    g.setLineDash([]);
    // Range ring
    const here = w.star(w.s.loc);
    const range = w.rangeFrom(here.id);
    g.strokeStyle = 'rgba(62,230,196,0.75)';
    g.lineWidth = 2 * px;
    g.setLineDash([8 * px, 6 * px]);
    g.lineDashOffset = -this.t * 20 * px;
    g.beginPath(); g.arc(here.x, here.y, range, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(62,230,196,0.05)';
    g.beginPath(); g.arc(here.x, here.y, range, 0, TAU); g.fill();
    // Route
    if (this.route && this.route.length > 1) {
      g.strokeStyle = 'rgba(255,209,102,0.9)';
      g.lineWidth = 2.5 * px;
      g.setLineDash([10 * px, 6 * px]);
      g.lineDashOffset = -this.t * 30 * px;
      g.beginPath();
      this.route.forEach((id, i) => { const s = w.star(id); if (i === 0) g.moveTo(s.x, s.y); else g.lineTo(s.x, s.y); });
      g.stroke();
      g.setLineDash([]);
    }
    // Stars: a cached layer when zoomed out, batched sprites when zoomed in.
    if (z <= 0.42) {
      if (!this.starLayer) this.buildStars();
      g.drawImage(this.starLayer!, -E, -E, 2 * E, 2 * E);
      this.drawCore(g);
      if (z > 0.3) this.drawOverlays(g, this.visibleStars(), 2.2 * px, z);
    } else {
      const vis = this.visibleStars();
      const pr = clamp(1.4 + z * 2.4, 1.9, 7) * px;
      this.drawSprites(g, vis, pr, z);
      this.drawCore(g);
      this.drawOverlays(g, vis, pr, z);
    }
    // Markers: alerts, missions, home
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    for (const ev of w.s.events) {
      const s = w.star(ev.star);
      g.strokeStyle = `rgba(255,80,80,${0.5 + pulse * 0.5})`;
      g.lineWidth = 2.5 * px;
      g.beginPath(); g.arc(s.x, s.y, (16 + pulse * 6) * px, 0, TAU); g.stroke();
    }
    for (const m of w.s.missions) {
      if (m.star === undefined || m.star === w.gal.coreId && !w.s.flags.hollowContact) continue;
      const s = w.star(m.star);
      g.save();
      g.translate(s.x, s.y - 18 * px);
      g.rotate(Math.PI / 4);
      g.fillStyle = m.main ? '#ffd166' : '#ffb347';
      const q = (5 + pulse * 1.5) * px;
      g.fillRect(-q, -q, q * 2, q * 2);
      g.restore();
    }
    // You are here
    const shipR = 10 * px;
    g.strokeStyle = PLAYER_COLOR;
    g.lineWidth = 2 * px;
    g.beginPath(); g.arc(here.x, here.y, shipR + pulse * 4 * px, 0, TAU); g.stroke();
    // Selected
    if (this.selected !== null) {
      const s = w.star(this.selected);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2 * px;
      const rr = 14 * px;
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = this.t * 1.5 + (i * TAU) / 4;
        g.moveTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
        g.arc(s.x, s.y, rr, a, a + 0.9);
      }
      g.stroke();
    }
    g.restore();
    // Labels (screen space)
    this.drawLabels(g, W, H);
  }

  private sprites: HTMLCanvasElement[] = [];
  private starLayer: HTMLCanvasElement | null = null;
  private vis: Star[] = [];

  private spriteOf(s: Star): HTMLCanvasElement {
    let c = this.sprites[s.id];
    if (!c) c = this.sprites[s.id] = starSprite(s.hollow ? '#c7a0aa' : s.color, 24);
    return c;
  }

  private visibleStars(): Star[] {
    const b = this.cam.bounds(40);
    const out = this.vis;
    out.length = 0;
    for (const s of this.st.w.gal.stars) {
      if (s.x < b.x0 || s.x > b.x1 || s.y < b.y0 || s.y > b.y1 || s.type === 'core') continue;
      out.push(s);
    }
    return out;
  }

  /** Static layer of every star for the zoomed-out map. */
  private buildStars() {
    const S = 1536;
    const c = canvas(S, S);
    const g = c.getContext('2d')!;
    const k = S / (2 * E);
    g.translate(S / 2, S / 2);
    g.scale(k, k);
    g.globalCompositeOperation = 'lighter';
    for (const s of this.st.w.gal.stars) {
      if (s.type === 'core') continue;
      if (s.type === 'blackhole') { blit(g, glow('#7a4fff', 32), s.x, s.y, 16); continue; }
      const r = 5.2 * s.size * (s.hollow ? 0.8 : 1);
      blit(g, this.spriteOf(s), s.x, s.y, r * 2.4);
    }
    g.globalCompositeOperation = 'source-over';
    for (const s of this.st.w.gal.stars) {
      if (s.type !== 'blackhole') continue;
      g.fillStyle = '#05010c';
      g.beginPath(); g.arc(s.x, s.y, 4.5, 0, TAU); g.fill();
      g.strokeStyle = '#c9b6ff';
      g.lineWidth = 1.8;
      g.beginPath(); g.arc(s.x, s.y, 6.5, 0, TAU); g.stroke();
    }
    this.starLayer = c;
  }

  private drawCore(g: CanvasRenderingContext2D) {
    const p = 1 + Math.sin(this.t * 1.7) * 0.08;
    g.globalCompositeOperation = 'lighter';
    blit(g, glow('#ffe2a8', 48), 0, 0, 70 * p);
    blit(g, starSprite('#fff6e0', 32), 0, 0, 30 * p);
    g.globalCompositeOperation = 'source-over';
  }

  /** Additive pass: every visible star sprite in one composite mode. */
  private drawSprites(g: CanvasRenderingContext2D, vis: Star[], r: number, z: number) {
    const t = this.t;
    g.globalCompositeOperation = 'lighter';
    const bh = glow('#7a4fff', 32);
    for (const s of vis) {
      if (s.type === 'blackhole') { blit(g, bh, s.x, s.y, r * 3.2); continue; }
      const rr = r * s.size * (s.hollow ? 0.8 : 1);
      blit(g, this.spriteOf(s), s.x, s.y, rr * 2.4);
      if (s.type === 'binary' && s.color2 && z > 0.6) {
        const a = t * 0.8 + s.seed;
        blit(g, starSprite(s.color2, 24), s.x + Math.cos(a) * rr * 0.9, s.y + Math.sin(a) * rr * 0.9, rr * 1.6);
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (const s of vis) {
      if (s.type !== 'blackhole') continue;
      g.fillStyle = '#05010c';
      g.beginPath(); g.arc(s.x, s.y, r * 0.9, 0, TAU); g.fill();
      g.strokeStyle = '#c9b6ff';
      g.lineWidth = r * 0.35;
      g.beginPath(); g.arc(s.x, s.y, r * 1.3, t * 2, t * 2 + 4.5); g.stroke();
    }
  }

  /** Normal-blend pass: ownership rings, proto disks, Hollow markers. */
  private drawOverlays(g: CanvasRenderingContext2D, vis: Star[], r: number, z: number) {
    const w = this.st.w;
    for (const s of vis) {
      const rr = r * s.size * (s.hollow ? 0.8 : 1);
      if (s.type === 'proto' && z > 0.5) {
        g.strokeStyle = 'rgba(255,190,140,0.5)';
        g.lineWidth = rr * 0.4;
        g.beginPath(); g.ellipse(s.x, s.y, rr * 2.2, rr * 0.9, 0.5, 0, TAU); g.stroke();
      }
      const o = w.ownerOf(s.id);
      if (o && o !== 'hollow') {
        const col2 = o === 'player' ? PLAYER_COLOR : w.emap.get(o)?.color ?? '#fff';
        const e = o !== 'player' ? w.emap.get(o) : null;
        g.strokeStyle = col2;
        g.lineWidth = (e && e.home === s.id) || (o === 'player' && s.id === w.gal.homeStar) ? rr * 0.55 : rr * 0.3;
        g.beginPath(); g.arc(s.x, s.y, rr * 1.9, 0, TAU); g.stroke();
      }
      if (s.hollow && z > 0.9) {
        g.strokeStyle = 'rgba(255,60,80,0.6)';
        g.lineWidth = rr * 0.25;
        g.beginPath(); g.rect(s.x - rr * 1.5, s.y - rr * 1.5, rr * 3, rr * 3); g.stroke();
      }
    }
  }

  private drawLabels(g: CanvasRenderingContext2D, W: number, H: number) {
    const w = this.st.w;
    const z = this.cam.zoom;
    const ids = new Set<number>([w.s.loc, w.gal.homeStar, w.gal.coreId]);
    if (this.selected !== null) ids.add(this.selected);
    for (const m of w.s.missions) if (m.star !== undefined) ids.add(m.star);
    for (const e of w.s.events) ids.add(e.star);
    if (z > 1.1) {
      const b = this.cam.bounds(0);
      let n = 0;
      for (const s of w.gal.stars) {
        if (n > 50) break;
        if (s.x < b.x0 || s.x > b.x1 || s.y < b.y0 || s.y > b.y1) continue;
        ids.add(s.id); n++;
      }
    }
    g.font = '600 11px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const id of ids) {
      const s = w.star(id);
      const p = this.cam.worldToScreen(s.x, s.y);
      if (p.x < -60 || p.x > W + 60 || p.y < -20 || p.y > H + 20) continue;
      const name = id === w.gal.homeStar ? `🏠 ${s.name}` : id === w.gal.coreId ? '✦ The Core' : s.name;
      const y = p.y + 12 + (id === w.gal.coreId ? 20 : 0);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      const tw = g.measureText(name).width;
      g.fillRect(p.x - tw / 2 - 4, y - 1, tw + 8, 15);
      g.fillStyle = id === w.s.loc ? PLAYER_COLOR : id === this.selected ? '#ffffff' : 'rgba(225,235,250,0.85)';
      g.fillText(name, p.x, y);
    }
  }

  // ------------------------------------------------------------------ input
  onTap(x: number, y: number) {
    const p = this.cam.screenToWorld(x, y);
    const s = this.st.w.gal.nearest(p.x, p.y, 30 / this.cam.zoom);
    if (s) this.st.selectStar(s.id);
    else this.st.selectStar(null);
  }
  onDragStart() { this.dragging = true; this.vel.x = this.vel.y = 0; }
  onDrag(_p: PointerInfo, dx: number, dy: number) {
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.vel.x = (-dx / this.cam.zoom) * 50;
    this.vel.y = (-dy / this.cam.zoom) * 50;
  }
  onDragEnd() { this.dragging = false; }
  onPinch(f: number, cx: number, cy: number) { this.cam.zoomAt(f, cx, cy); }
  onWheel(dy: number, x: number, y: number) { this.cam.zoomAt(Math.exp(-dy * 0.0015), x, y); }
}
