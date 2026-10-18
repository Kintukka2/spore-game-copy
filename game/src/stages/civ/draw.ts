// World renderer for the Civilization stage (canvas, world space + screen-space overlays).
import { clamp, easeOutBack, TAU } from '../../engine/math';
import { rgba, shade } from '../../design/color';
import type { Design } from '../../design/types';
import {
  cloudSprite, derrickSprite, designSprite, drawSprite, emblemSprite, flagSprite, hologramSprite, hutSprite,
  mountainSprite, puffTint, treeSprite, turretSprite, type Sprite,
} from './sprites';
import { AIR_LIFT, geyserRate } from './sim';
import { PK } from './fx';
import { TILE, TILE_X, TILE_Y } from './terrain';
import { RADIUS } from './abilities';
import { H, PLAYER, slotPos, turretPos, W, wdx, type City, type Vehicle } from './types';
import type { CivStage } from './stage';

interface Drawable { y: number; s: Sprite; x: number; scale: number; alpha: number; facing: number; tint?: string }

const BUILD_SIZE = { hall: 66, house: 24, factory: 30, fun: 28 } as const;

export class Renderer {
  miniRect: { x: number; y: number; w: number; h: number } | null = null;
  private list: Drawable[] = [];
  private clouds: { x: number; y: number; s: number; k: number }[] = [];
  private vignette: CanvasGradient | null = null;
  private vigKey = '';
  private t = 0;

  constructor(private S: CivStage) {
    for (let i = 0; i < 9; i++) this.clouds.push({ x: (i / 9) * W + Math.random() * 200, y: 200 + Math.random() * (H - 400), s: 1.2 + Math.random() * 1.4, k: i % 4 });
  }

  private sx(x: number): number {
    const c = this.S.cam;
    return c.x + wdx(c.x, x);
  }

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    const S = this.S;
    const cam = S.cam;
    this.t = S.real;
    if (cam.w !== w || cam.h !== h) { cam.setViewport(w, h); S.clampCam(); }
    g.fillStyle = '#1d4f7e';
    g.fillRect(0, 0, w, h);
    g.save();
    if (S.fx.shake > 0.2 && !S.fx.reduced) g.translate((Math.random() - 0.5) * S.fx.shake, (Math.random() - 0.5) * S.fx.shake);
    cam.apply(g);
    this.drawTerrain(g);
    this.drawDecor(g);
    this.drawCityGround(g);
    this.drawTrade(g);
    S.fx.drawUnder(g, cam);
    this.drawGeysers(g);
    this.drawCities(g);
    this.drawSelection(g);
    this.drawVehicles(g, false);
    this.drawProjectiles(g);
    S.fx.drawOver(g, cam);
    this.drawVehicles(g, true);
    this.drawHolograms(g);
    this.drawLaunch(g);
    this.drawClouds(g);
    this.drawTargeting(g);
    g.restore();
    this.drawOverlay(g, w, h);
    S.fx.drawText(g, cam);
    this.drawVignette(g, w, h);
    this.drawMinimap(g, w, h);
    this.drawCutsceneText(g, w, h);
  }

  // ------------------------------------------------------------------ terrain
  private drawTerrain(g: CanvasRenderingContext2D) {
    const S = this.S, cam = S.cam, T = S.terrain;
    const b = cam.bounds(4);
    const tw = T.tex.width / W;
    g.imageSmoothingEnabled = true;
    for (let k = -1; k <= 1; k++) {
      const x0 = Math.max(b.x0, k * W), x1 = Math.min(b.x1, (k + 1) * W);
      if (x1 <= x0) continue;
      const y0 = Math.max(0, b.y0), y1 = Math.min(H, b.y1);
      if (y1 <= y0) continue;
      const sx = (x0 - k * W) * tw, sy = y0 * tw, sw = (x1 - x0) * tw, sh = (y1 - y0) * tw;
      g.drawImage(T.tex, sx, sy, Math.max(1, sw), Math.max(1, sh), x0, y0, x1 - x0, y1 - y0);
    }
    // Coastlines and the continental shelf (only tiles in view; the texture carries a baked outline when far out).
    const z = cam.zoom;
    if (z >= 0.42) {
      g.lineCap = 'round';
      const ty0 = Math.max(0, Math.floor(b.y0 / TILE)), ty1 = Math.min(TILE_Y - 1, Math.floor(b.y1 / TILE));
      const tx0 = Math.floor(b.x0 / TILE), tx1 = Math.floor(b.x1 / TILE);
      for (let pass = 0; pass < 3; pass++) {
        if (pass === 0) { g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1.2 / z; }
        else if (pass === 1) { g.strokeStyle = 'rgba(230,250,255,0.55)'; g.lineWidth = 5 / z; }
        else { g.strokeStyle = 'rgba(40,70,60,0.75)'; g.lineWidth = 1.4 / z; }
        for (let tx = tx0; tx <= tx1; tx++) {
          const k = Math.floor((tx * TILE) / W);
          const ix = ((tx % TILE_X) + TILE_X) % TILE_X;
          for (let ty = ty0; ty <= ty1; ty++) {
            const path = pass === 0 ? T.shelfTiles[ty * TILE_X + ix] : T.coastTiles[ty * TILE_X + ix];
            if (k !== 0) { g.save(); g.translate(k * W, 0); g.stroke(path); g.restore(); }
            else g.stroke(path);
          }
        }
      }
    }
    // Animated wave glints.
    if (z > 0.35) {
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (const wv of T.waves) {
        const x = this.sx(wv.x);
        if (x < b.x0 || x > b.x1 || wv.y < b.y0 || wv.y > b.y1) continue;
        const p = (this.t * 0.25 + wv.v) % 1;
        const r = 6 * wv.s;
        const xx = x + p * 14;
        g.moveTo(xx - r, wv.y);
        g.quadraticCurveTo(xx, wv.y - r * 0.6 * Math.sin(p * Math.PI), xx + r, wv.y);
      }
      g.stroke();
    }
  }

  private drawDecor(g: CanvasRenderingContext2D) {
    const S = this.S, cam = S.cam, T = S.terrain;
    if (cam.zoom < 0.3) return;
    const b = cam.bounds(60);
    for (const m of T.mountains) {
      if (m.y < b.y0 || m.y > b.y1 + 40) continue;
      const x = this.sx(m.x);
      if (x < b.x0 || x > b.x1) continue;
      drawSprite(g, mountainSprite(m.v, !!m.snow), x, m.y, m.s * 0.75);
    }
    for (const tr of T.trees) {
      if (tr.y < b.y0 || tr.y > b.y1 + 30) continue;
      const x = this.sx(tr.x);
      if (x < b.x0 || x > b.x1) continue;
      drawSprite(g, treeSprite(tr.v), x, tr.y, tr.s * 0.85);
    }
  }

  private drawClouds(g: CanvasRenderingContext2D) {
    const S = this.S, cam = S.cam;
    if (cam.zoom > 1.1) return;
    const a = clamp(0.42 - cam.zoom * 0.3, 0.06, 0.32);
    const b = cam.bounds(300);
    for (const c of this.clouds) {
      const cx = ((c.x + this.t * 7) % W + W) % W;
      const x = this.sx(cx);
      if (x < b.x0 || x > b.x1 || c.y < b.y0 || c.y > b.y1) continue;
      const img = cloudSprite(c.k);
      const wdt = 260 * c.s, hgt = 140 * c.s;
      g.globalAlpha = a * 0.35;
      g.drawImage(puffTint('#203040'), x - wdt * 0.35 + 50, c.y - hgt * 0.2 + 80, wdt * 0.7, hgt * 0.4);
      g.globalAlpha = a;
      g.drawImage(img, x - wdt / 2, c.y - hgt / 2, wdt, hgt);
    }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ cities
  private hallDesign(c: City): Design {
    return this.S.art[c.owner]?.hall ?? this.S.art[PLAYER].hall;
  }

  private drawCityGround(g: CanvasRenderingContext2D) {
    const S = this.S, cam = S.cam;
    const b = cam.bounds(160);
    for (const c of S.cities) {
      const x = this.sx(c.x);
      if (x < b.x0 || x > b.x1 || c.y < b.y0 || c.y > b.y1) continue;
      const n = S.nations[c.owner];
      if (!c.founded) {
        g.fillStyle = 'rgba(120,90,50,0.25)';
        g.beginPath(); g.ellipse(x, c.y + 6, 60, 38, 0, 0, TAU); g.fill();
        continue;
      }
      // Territory
      g.fillStyle = rgba(n.color, 0.13);
      g.beginPath(); g.ellipse(x, c.y + 4, 150, 104, 0, 0, TAU); g.fill();
      g.setLineDash([10, 8]);
      g.lineDashOffset = -this.t * 8;
      g.strokeStyle = rgba(n.color, 0.75);
      g.lineWidth = 2.2;
      g.beginPath(); g.ellipse(x, c.y + 4, 150, 104, 0, 0, TAU); g.stroke();
      g.setLineDash([]);
      // Plaza
      g.fillStyle = '#cdbfa3';
      g.beginPath(); g.ellipse(x, c.y + 6, 116, 80, 0, 0, TAU); g.fill();
      g.fillStyle = '#ddd2ba';
      g.beginPath(); g.ellipse(x, c.y + 4, 108, 73, 0, 0, TAU); g.fill();
      // Roads from the hall to each slot.
      g.strokeStyle = '#c4b597';
      g.lineWidth = 7;
      g.beginPath();
      const ns = c.slots.length;
      for (let i = 0; i < ns; i++) { const p = slotPos(i, ns); g.moveTo(x, c.y + 4); g.lineTo(x + p.x, c.y + p.y); }
      g.stroke();
      // Slot pads
      for (let i = 0; i < ns; i++) {
        const p = slotPos(i, ns);
        g.fillStyle = c.slots[i].kind ? '#b8a888' : 'rgba(150,135,105,0.6)';
        g.beginPath(); g.ellipse(x + p.x, c.y + p.y, 15, 9, 0, 0, TAU); g.fill();
      }
      const nt = c.turrets.length;
      for (let i = 0; i < nt; i++) {
        const p = turretPos(i, nt);
        g.fillStyle = 'rgba(120,110,95,0.55)';
        g.beginPath(); g.ellipse(x + p.x, c.y + p.y, 11, 6.5, 0, 0, TAU); g.fill();
      }
      if (c.coastal && c.dock) {
        // A little wooden pier at the harbour.
        const dx = x + wdx(c.x, c.dock.x), dy = c.dock.y;
        const ang = Math.atan2(c.y - dy, x - dx);
        g.save();
        g.translate(dx, dy);
        g.rotate(ang);
        g.fillStyle = '#9a7650';
        g.fillRect(-6, -5, 30, 10);
        g.strokeStyle = '#5e4630';
        g.lineWidth = 1.2;
        for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-6 + k * 6, -5); g.lineTo(-6 + k * 6, 5); g.stroke(); }
        g.fillStyle = '#5e4630';
        g.fillRect(-7, -7, 3, 3); g.fillRect(-7, 4, 3, 3);
        g.restore();
      }
    }
  }

  private drawCities(g: CanvasRenderingContext2D) {
    const S = this.S, cam = S.cam;
    const b = cam.bounds(160);
    for (const c of S.cities) {
      const x = this.sx(c.x);
      if (x < b.x0 || x > b.x1 || c.y < b.y0 - 80 || c.y > b.y1 + 40) continue;
      const n = S.nations[c.owner];
      if (!c.founded) {
        const hs = hutSprite(n.color);
        const huts = [[-26, -6], [18, -10], [-6, 14], [28, 12]];
        for (const [hx, hy] of huts) drawSprite(g, hs, x + hx, c.y + hy, 1);
        // Campfire
        const f = 0.7 + Math.sin(this.t * 13) * 0.15;
        g.fillStyle = 'rgba(255,170,60,0.85)';
        g.beginPath(); g.ellipse(x + 4, c.y + 2, 4 * f, 6 * f, 0, 0, TAU); g.fill();
        if (Math.random() < 0.05) S.fx.spawn(PK.Smoke, c.x + 4, c.y - 6, { vz: 26, vx: 4, life: 1.6, size: 4, grow: 6, color: '#bdb6aa' });
        continue;
      }
      const art = S.art[c.owner] ?? S.art[PLAYER];
      const list = this.list;
      list.length = 0;
      const hush = c.hush > 0;
      const hall = designSprite(this.hallDesign(c), c.large ? BUILD_SIZE.hall + 10 : BUILD_SIZE.hall);
      list.push({ y: c.y + 4, s: hall, x, scale: 1, alpha: 1, facing: 1 });
      const ns = c.slots.length;
      for (let i = 0; i < ns; i++) {
        const sl = c.slots[i];
        if (!sl.kind) continue;
        const p = slotPos(i, ns);
        const d = sl.kind === 'house' ? art.house : sl.kind === 'factory' ? art.factory : art.fun;
        const spr = designSprite(d, BUILD_SIZE[sl.kind]);
        list.push({ y: c.y + p.y, s: spr, x: x + p.x, scale: 1, alpha: sl.off > 0 || hush ? 0.55 : 1, facing: p.x < 0 ? -1 : 1 });
      }
      const nt = c.turrets.length;
      for (let i = 0; i < nt; i++) {
        const tu = c.turrets[i];
        const p = turretPos(i, nt);
        if (!tu.alive) continue;
        list.push({ y: c.y + p.y, s: turretSprite(c.type, n.color), x: x + p.x, scale: 0.9, alpha: tu.off > 0 || hush ? 0.6 : 1, facing: p.x < 0 ? -1 : 1, tint: tu.frozen > 0 ? '#9fe8ff' : undefined });
      }
      list.sort((a, b2) => a.y - b2.y);
      for (const d of list) {
        g.globalAlpha = d.alpha;
        drawSprite(g, d.s, d.x, d.y, d.scale, d.facing);
        if (d.tint) {
          g.globalAlpha = 0.45;
          g.fillStyle = d.tint;
          g.beginPath(); g.ellipse(d.x, d.y - 12, 12, 14, 0, 0, TAU); g.fill();
        }
      }
      g.globalAlpha = 1;
      // Factory smoke and entertainment lights.
      for (let i = 0; i < ns; i++) {
        const sl = c.slots[i];
        if (!sl.kind || sl.off > 0 || hush) continue;
        const p = slotPos(i, ns);
        if (sl.kind === 'factory' && c.happy >= 0) {
          for (let k = 0; k < 3; k++) {
            const ph = (this.t * 0.5 + k / 3 + i * 0.17) % 1;
            g.globalAlpha = (1 - ph) * 0.5;
            const r = 4 + ph * 9;
            g.drawImage(puffTint('#d8d4cc'), x + p.x + 6 + ph * 10 - r, c.y + p.y - 34 - ph * 30 - r, r * 2, r * 2);
          }
        } else if (sl.kind === 'fun') {
          for (let k = 0; k < 4; k++) {
            const on = Math.sin(this.t * 6 + k * 1.7 + i) > 0.2;
            if (!on) continue;
            g.globalAlpha = 0.9;
            g.fillStyle = ['#ffd166', '#ff7ab8', '#5cc8ff', '#7dffb0'][k];
            g.beginPath(); g.arc(x + p.x - 9 + k * 6, c.y + p.y - 30 - (k % 2) * 4, 1.8, 0, TAU); g.fill();
          }
        }
      }
      g.globalAlpha = 1;
      if (c.flash > 0) {
        g.globalAlpha = clamp(c.flash, 0, 1) * 0.6;
        g.drawImage(puffTint('#ffffff'), x - 120, c.y - 120, 240, 200);
        g.globalAlpha = 1;
      }
      if (hush) {
        for (let k = 0; k < 5; k++) {
          const ph = (this.t * 0.3 + k / 5) % 1;
          g.globalAlpha = 0.5;
          g.drawImage(puffTint('#3c3f4a'), x - 80 + k * 34 - 30, c.y - 120 - Math.sin(ph * TAU) * 6 - 20, 60, 40);
        }
        g.globalAlpha = 1;
      }
    }
  }

  private drawHolograms(g: CanvasRenderingContext2D) {
    const S = this.S;
    const b = S.cam.bounds(200);
    for (const c of S.cities) {
      if (c.convertBy < 0 || c.convert <= 0) continue;
      const x = this.sx(c.x);
      if (x < b.x0 || x > b.x1 || c.y < b.y0 || c.y > b.y1 + 200) continue;
      const species = S.art[c.convertBy]?.species;
      if (!species) continue;
      const spr = hologramSprite(species);
      const fl = Math.sin(this.t * 23) > 0.85 ? 0.4 : 1;
      const y = c.y - 100 + Math.sin(this.t * 1.6) * 4;
      // Projector cone
      const gr = g.createLinearGradient(0, y, 0, c.y);
      gr.addColorStop(0, 'rgba(120,240,255,0.18)');
      gr.addColorStop(1, 'rgba(120,240,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - 50, y - 10); g.lineTo(x + 50, y - 10); g.lineTo(x + 8, c.y); g.lineTo(x - 8, c.y); g.closePath(); g.fill();
      g.globalAlpha = (0.45 + 0.2 * Math.sin(this.t * 3)) * fl;
      const jitter = Math.sin(this.t * 41) > 0.95 ? 3 : 0;
      drawSprite(g, spr, x + jitter, y, 1.25, Math.sin(this.t * 0.5) > 0 ? 1 : -1);
      g.globalAlpha = 1;
      // Beams from preachers.
      g.strokeStyle = 'rgba(160,250,255,0.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (const v of S.vehicles) {
        if (v.role !== 'religious' || v.nation !== c.convertBy || v.order.k !== 'city' || v.order.city !== c.id) continue;
        const vx = this.sx(v.x);
        g.moveTo(vx, v.y - (v.medium === 'air' ? AIR_LIFT : 14));
        g.lineTo(x, y - 40);
      }
      g.stroke();
    }
  }

  private drawTrade(g: CanvasRenderingContext2D) {
    const S = this.S;
    g.setLineDash([14, 10]);
    g.lineDashOffset = -this.t * 30;
    for (const c of S.cities) {
      if (!c.trade || c.owner === PLAYER) continue;
      let best: City | null = null, bd = Infinity;
      for (const o of S.cities) if (o.owner === PLAYER) { const d = Math.abs(wdx(o.x, c.x)) + Math.abs(o.y - c.y); if (d < bd) { bd = d; best = o; } }
      if (!best) continue;
      const x1 = this.sx(best.x), x2 = x1 + wdx(best.x, c.x);
      const mx = (x1 + x2) / 2, my = (best.y + c.y) / 2 - 40;
      g.strokeStyle = 'rgba(40,30,0,0.35)';
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(x1, best.y); g.quadraticCurveTo(mx, my, x2, c.y); g.stroke();
      g.strokeStyle = '#ffd166';
      g.lineWidth = 3;
      g.stroke();
    }
    g.setLineDash([]);
  }

  // ------------------------------------------------------------------ geysers
  private drawGeysers(g: CanvasRenderingContext2D) {
    const S = this.S;
    const b = S.cam.bounds(80);
    const rate = geyserRate(S.time) / 100;
    for (const gy of S.geysers) {
      const x = this.sx(gy.x);
      if (x < b.x0 || x > b.x1 || gy.y < b.y0 - 40 || gy.y > b.y1 + 40) continue;
      // Crater
      g.fillStyle = gy.sea ? 'rgba(255,170,90,0.35)' : '#5a3f2e';
      g.beginPath(); g.ellipse(x, gy.y, 18, 8, 0, 0, TAU); g.fill();
      g.strokeStyle = '#ff9f43';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, gy.y, 18, 8, 0, 0, TAU); g.stroke();
      g.fillStyle = '#ffb46b';
      g.beginPath(); g.ellipse(x, gy.y - 1, 9, 3.5, 0, 0, TAU); g.fill();
      const owned = gy.owner >= 0;
      if (owned) drawSprite(g, derrickSprite(S.nations[gy.owner].color), x, gy.y + 3, 1);
      // Spice plume
      const top = owned ? gy.y - 44 : gy.y - 4;
      const k = 0.55 + rate * 0.6;
      for (let i = 0; i < 6; i++) {
        const ph = (this.t * 0.45 + i / 6 + gy.id * 0.13) % 1;
        const r = (5 + ph * 14) * k;
        g.globalAlpha = (1 - ph) * 0.7;
        g.drawImage(puffTint(i % 2 ? '#ff9a52' : '#ff7ab0'), x + Math.sin(ph * 5 + gy.id) * 6 * ph - r, top - ph * 60 * k - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      if (gy.work > 0 && gy.workBy >= 0) {
        g.strokeStyle = S.nations[gy.workBy].color;
        g.lineWidth = 4;
        g.beginPath(); g.arc(x, gy.y - 20, 22, -Math.PI / 2, -Math.PI / 2 + gy.work * TAU); g.stroke();
      }
    }
  }

  // ------------------------------------------------------------------ vehicles
  vehicleSprite(v: Vehicle): Sprite {
    const d = this.S.vehicleDesign(v.nation, v.medium, v.role);
    return designSprite(d, v.medium === 'land' ? 44 : v.medium === 'sea' ? 56 : 50, true, v.medium);
  }

  private drawSelection(g: CanvasRenderingContext2D) {
    const S = this.S;
    if (!S.selected.size) return;
    const z = S.cam.zoom;
    g.lineWidth = 2.5 / Math.max(0.5, z);
    const pulse = 1 + Math.sin(this.t * 6) * 0.08;
    for (const id of S.selected) {
      const v = S.vehicleMap.get(id);
      if (!v) continue;
      const x = this.sx(v.x);
      g.strokeStyle = 'rgba(62,230,196,0.95)';
      g.beginPath(); g.ellipse(x, v.y + 2, 26 * pulse, 11 * pulse, 0, 0, TAU); g.stroke();
      // Order line.
      const o = v.order;
      let tx: number | null = null, ty = 0;
      if (o.k === 'move') { tx = o.x; ty = o.y; }
      else if (o.k === 'city') { tx = S.cities[o.city].x; ty = S.cities[o.city].y; }
      else if (o.k === 'geyser') { tx = S.geysers[o.g].x; ty = S.geysers[o.g].y; }
      else if (o.k === 'hunt') { const t = S.vehicleMap.get(o.vid); if (t) { tx = t.x; ty = t.y; } }
      if (tx !== null) {
        g.setLineDash([6 / z, 6 / z]);
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 1.5 / z;
        g.beginPath(); g.moveTo(x, v.y); g.lineTo(x + wdx(v.x, tx), ty); g.stroke();
        g.setLineDash([]);
        g.lineWidth = 2.5 / Math.max(0.5, z);
      }
    }
  }

  private drawVehicles(g: CanvasRenderingContext2D, air: boolean) {
    const S = this.S, cam = S.cam;
    const b = cam.bounds(80);
    const lod = cam.zoom < 0.3;
    const vs = S.vehicles.filter((v) => (v.medium === 'air') === air);
    vs.sort((a, c) => a.y - c.y);
    for (const v of vs) {
      const x = this.sx(v.x);
      if (x < b.x0 || x > b.x1 || v.y < b.y0 || v.y > b.y1 + 60) continue;
      const nat = S.nations[v.nation];
      const lift = v.medium === 'air' ? AIR_LIFT + Math.sin(v.bob * 2) * 3 : 0;
      if (lod) {
        g.fillStyle = nat.color;
        g.strokeStyle = '#0b1622';
        g.lineWidth = 2 / cam.zoom;
        g.beginPath(); g.arc(x, v.y - lift, 9, 0, TAU); g.fill(); g.stroke();
        continue;
      }
      const spr = this.vehicleSprite(v);
      const sc = v.spawn > 0 ? easeOutBack(clamp(1 - v.spawn / 0.8, 0, 1)) * 0.9 + 0.1 : 1;
      g.fillStyle = air ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.22)';
      g.beginPath(); g.ellipse(x, v.y + 2, 18 * sc, 5 * sc, 0, 0, TAU); g.fill();
      let y = v.y - lift;
      const moving = Math.abs(v.vx) + Math.abs(v.vy) > 8;
      if (v.medium === 'sea') {
        y += Math.sin(v.bob * 2.2) * 1.4;
        if (moving) {
          g.strokeStyle = 'rgba(255,255,255,0.5)';
          g.lineWidth = 1.5;
          const bx = x - v.facing * 22;
          g.beginPath(); g.moveTo(x - v.facing * 8, v.y + 2); g.lineTo(bx - v.facing * 14, v.y - 6); g.moveTo(x - v.facing * 8, v.y + 4); g.lineTo(bx - v.facing * 14, v.y + 10); g.stroke();
        }
      } else if (v.medium === 'land' && moving) {
        y -= Math.abs(Math.sin(v.bob * 9)) * 1.2;
        if (Math.random() < 0.08) S.fx.spawn(PK.Dust, v.x - v.facing * 16, v.y, { vx: -v.vx * 0.2, vy: -2, life: 0.8, size: 5, grow: 8, color: '#c9b48a' });
      }
      if (v.frozen > 0) g.globalAlpha = 0.85;
      drawSprite(g, spr, x, y, sc, v.facing);
      g.globalAlpha = 1;
      if (v.flash > 0) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = v.flash * 4;
        drawSprite(g, spr, x, y, sc, v.facing);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      const top = y - (spr.ay / spr.q) * sc;
      // Nation flag + role emblem.
      drawSprite(g, flagSprite(nat.color), x - 4 * v.facing, top + 2, 1);
      drawSprite(g, emblemSprite(v.role), x + 9, top - 3, 1);
      if (v.frozen > 0) {
        g.fillStyle = 'rgba(160,235,255,0.45)';
        g.beginPath(); g.ellipse(x, y - 10, 24, 16, 0, 0, TAU); g.fill();
      }
      if (v.invuln > 0) {
        g.strokeStyle = `rgba(255,209,102,${0.5 + Math.sin(this.t * 8) * 0.3})`;
        g.lineWidth = 2;
        g.beginPath(); g.ellipse(x, y - 12, 28, 22, 0, 0, TAU); g.stroke();
      }
      if (v.bribed > 0) {
        g.fillStyle = '#ffd166';
        const w = Math.abs(Math.cos(this.t * 6)) * 5 + 1;
        g.beginPath(); g.ellipse(x, top - 14, w, 5, 0, 0, TAU); g.fill();
      }
    }
  }

  private drawProjectiles(g: CanvasRenderingContext2D) {
    const S = this.S;
    for (const p of S.projectiles) {
      const x = this.sx(p.x);
      const k = clamp(p.t / p.dur, 0, 1);
      const lift = Math.sin(k * Math.PI) * p.arc;
      if (p.k === 'tracer') {
        const dx = wdx(p.sx, p.tx), dy = p.ty - p.sy, l = Math.hypot(dx, dy) || 1;
        g.strokeStyle = '#fff0a8';
        g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(x, p.y - lift); g.lineTo(x - (dx / l) * 12, p.y - lift - (dy / l) * 12); g.stroke();
      } else if (p.k === 'shell') {
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.beginPath(); g.ellipse(x, p.y, 3, 1.5, 0, 0, TAU); g.fill();
        g.fillStyle = '#2b2b30';
        g.beginPath(); g.arc(x, p.y - lift, 3.2, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,200,120,0.8)';
        g.beginPath(); g.arc(x, p.y - lift, 1.4, 0, TAU); g.fill();
      } else {
        const dx = wdx(p.sx, p.tx), dy = p.ty - p.sy;
        const a = Math.atan2(dy - Math.cos(k * Math.PI) * p.arc * 2, dx);
        g.save();
        g.translate(x, p.y - lift);
        g.rotate(a);
        g.fillStyle = '#f2f2ee';
        g.fillRect(-6, -1.6, 10, 3.2);
        g.fillStyle = '#ff5a4f';
        g.fillRect(3, -1.6, 2.5, 3.2);
        g.fillStyle = 'rgba(255,190,90,0.9)';
        g.beginPath(); g.moveTo(-6, -2); g.lineTo(-12 - Math.random() * 4, 0); g.lineTo(-6, 2); g.fill();
        g.restore();
      }
    }
  }

  private drawLaunch(g: CanvasRenderingContext2D) {
    const S = this.S;
    if (S.phase !== 'launch' && S.phase !== 'done') return;
    const ship = S.game.state?.designs.ship;
    if (!ship) return;
    const home = S.cities.find((c) => c.home) ?? S.cities[0];
    const x = this.sx(home.x);
    const t = S.launchT;
    const lift = t > 3 ? Math.pow(t - 3, 2.2) * 60 : 0;
    const shakeX = t > 2.4 && t < 3.4 ? (Math.random() - 0.5) * 3 : 0;
    const y = home.y - 60 - lift;
    const spr = designSprite(ship, 70, true);
    g.save();
    g.translate(x + shakeX, y);
    g.rotate(-Math.PI / 2);
    // Engine glow
    if (t > 2.4) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.9;
      const r = 26 + Math.random() * 8;
      g.drawImage(puffTint('#ffcf70'), -spr.ax / spr.q - r - 10, -r, r * 2, r * 2);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    drawSprite(g, spr, 0, (spr.ay / spr.q) * 0.5, 1);
    g.restore();
  }

  private drawTargeting(g: CanvasRenderingContext2D) {
    const S = this.S;
    if (!S.targeting) return;
    const r = RADIUS[S.targeting];
    const cam = S.cam;
    const z = cam.zoom;
    g.setLineDash([10 / z, 8 / z]);
    g.lineDashOffset = -this.t * 20 / z;
    g.lineWidth = 2.5 / z;
    if (r) {
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.beginPath(); g.ellipse(cam.x, cam.y, r, r * 0.7, 0, 0, TAU); g.fill(); g.stroke();
    } else {
      // City-targeted: ring every rival city.
      g.strokeStyle = 'rgba(255,209,102,0.9)';
      for (const c of S.cities) {
        if (c.owner === PLAYER || !c.founded) continue;
        const x = this.sx(c.x);
        g.beginPath(); g.ellipse(x, c.y + 4, 130 + Math.sin(this.t * 4) * 6, 90, 0, 0, TAU); g.stroke();
      }
    }
    g.setLineDash([]);
  }

  // ------------------------------------------------------------------ overlays (screen space)
  private toScreen(x: number, y: number) {
    const c = this.S.cam;
    return { x: (this.sx(x) - c.x) * c.zoom + c.w / 2, y: (y - c.y) * c.zoom + c.h / 2 };
  }

  private bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, color: string) {
    g.fillStyle = 'rgba(6,14,24,0.75)';
    g.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    g.fillStyle = color;
    g.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 4);
  }

  private drawOverlay(g: CanvasRenderingContext2D, w: number, h: number) {
    const S = this.S, cam = S.cam;
    const z = cam.zoom;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // City labels and meters.
    for (const c of S.cities) {
      const p = this.toScreen(c.x, c.y);
      if (p.x < -100 || p.x > w + 100 || p.y < -60 || p.y > h + 140) continue;
      const n = S.nations[c.owner];
      const ly = p.y + Math.max(26, 88 * z);
      const fs = z < 0.35 ? 11 : 13;
      g.font = `700 ${fs}px Fredoka, system-ui, sans-serif`;
      const label = c.founded ? c.name : 'Tribe';
      const tw = g.measureText(label).width + 26;
      g.fillStyle = 'rgba(8,16,28,0.78)';
      g.beginPath(); g.roundRect(p.x - tw / 2, ly - 10, tw, 20, 10); g.fill();
      g.fillStyle = n.color;
      g.beginPath(); g.arc(p.x - tw / 2 + 10, ly, 5, 0, TAU); g.fill();
      g.fillStyle = '#eef6ff';
      g.fillText(label, p.x + 6, ly + 0.5);
      if (!c.founded || z < 0.3) continue;
      let by = ly + 15;
      if (c.owner === PLAYER) {
        g.font = '13px system-ui, sans-serif';
        g.fillText(c.happy > 0 ? '😊' : c.happy < 0 ? '😠' : '😐', p.x + tw / 2 + 10, ly + 1);
      }
      if (c.defense < c.defenseMax - 1 || c.lastHit < 6) { this.bar(g, p.x, by, 64, c.defense / c.defenseMax, '#ff6b5a'); by += 8; }
      if (c.convert > 0) { this.bar(g, p.x, by, 64, c.convert / 100, c.convertBy === PLAYER ? '#7dffb0' : '#ffe58a'); by += 8; }
      if (c.trade || c.buyout > 0) {
        this.bar(g, p.x, by, 64, c.buyout / 100, '#4aa8ff');
        if (c.buyout >= 100) {
          g.font = '700 11px Fredoka, system-ui, sans-serif';
          g.fillStyle = '#ffd166';
          g.fillText('BUY!', p.x + 44, by + 2);
        }
        by += 8;
      }
    }
    // Vehicle HP bars.
    if (z >= 0.3) {
      for (const v of S.vehicles) {
        const sel = S.selected.has(v.id);
        if (!sel && v.hp >= v.maxHp - 0.5) continue;
        const p = this.toScreen(v.x, v.y - (v.medium === 'air' ? AIR_LIFT : 0));
        if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;
        const col = v.nation === PLAYER ? '#7dffb0' : S.sim.hostile(PLAYER, v.nation) ? '#ff6b5a' : '#ffd166';
        this.bar(g, p.x, p.y + 8, 30, v.hp / v.maxHp, col);
      }
    }
  }

  private drawVignette(_g: CanvasRenderingContext2D, _w: number, _h: number) {
    // The vignette and the danger flash are a CSS overlay (see hud.ts), composited on the GPU.
  }

  private drawMinimap(g: CanvasRenderingContext2D, w: number, h: number) {
    const S = this.S;
    if (S.phase === 'launch' || S.phase === 'done') { this.miniRect = null; return; }
    const mw = Math.min(150, Math.round(w * 0.36)), mh = Math.round((mw * H) / W);
    const top = S.hud.topInset();
    const r = { x: w - mw - 10 - S.hud.safeRight(), y: top, w: mw, h: mh };
    this.miniRect = r;
    g.save();
    g.fillStyle = 'rgba(6,14,24,0.8)';
    g.beginPath(); g.roundRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 9); g.fill();
    g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 7); g.clip();
    g.drawImage(S.terrain.mini, r.x, r.y, r.w, r.h);
    const kx = r.w / W, ky = r.h / H;
    for (const gy of S.geysers) {
      g.fillStyle = gy.owner === PLAYER ? '#ffd166' : gy.owner >= 0 ? S.nations[gy.owner].color : '#ff9f43';
      g.fillRect(r.x + gy.x * kx - 1, r.y + gy.y * ky - 1, 2.5, 2.5);
    }
    for (const c of S.cities) {
      const cx = r.x + c.x * kx, cy = r.y + c.y * ky;
      g.fillStyle = c.founded ? S.nations[c.owner].color : '#a08c6a';
      g.strokeStyle = '#06101a';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx, cy, c.owner === PLAYER ? 4.5 : 3.6, 0, TAU); g.fill(); g.stroke();
      if (c.owner === PLAYER) { g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, 6.5, 0, TAU); g.stroke(); }
      if (c.lastHit < 3 && c.owner === PLAYER && Math.sin(this.t * 10) > 0) { g.strokeStyle = '#ff5a4f'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.stroke(); }
    }
    for (const v of S.vehicles) {
      if (v.nation !== PLAYER && !S.sim.hostile(PLAYER, v.nation)) continue;
      g.fillStyle = v.nation === PLAYER ? '#ffffff' : '#ff4a3f';
      g.fillRect(r.x + v.x * kx - 1, r.y + v.y * ky - 1, 2, 2);
    }
    // Viewport.
    const b = S.cam.bounds();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1.2;
    const vx = ((b.x0 % W) + W) % W, vw = b.x1 - b.x0;
    g.strokeRect(r.x + vx * kx, r.y + Math.max(0, b.y0) * ky, vw * kx, (Math.min(H, b.y1) - Math.max(0, b.y0)) * ky);
    if (vx + vw > W) g.strokeRect(r.x + (vx - W) * kx, r.y + Math.max(0, b.y0) * ky, vw * kx, (Math.min(H, b.y1) - Math.max(0, b.y0)) * ky);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    g.beginPath(); g.roundRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 9); g.stroke();
  }

  private drawCutsceneText(g: CanvasRenderingContext2D, w: number, h: number) {
    const S = this.S;
    if (S.phase !== 'launch' && S.phase !== 'done') return;
    const t = S.launchT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (t < 3) {
      const n = 3 - Math.floor(t);
      const f = t % 1;
      g.globalAlpha = 1 - f * 0.6;
      g.font = `700 ${Math.round(90 + f * 40)}px Fredoka, system-ui, sans-serif`;
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.strokeText(String(n), w / 2, h * 0.35);
      g.fillStyle = '#ffffff';
      g.fillText(String(n), w / 2, h * 0.35);
    } else if (t < 4.6) {
      g.globalAlpha = clamp(4.6 - t, 0, 1);
      g.font = '700 56px Fredoka, system-ui, sans-serif';
      g.fillStyle = '#ffd166';
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 6;
      g.strokeText('Liftoff!', w / 2, h * 0.35);
      g.fillText('Liftoff!', w / 2, h * 0.35);
    }
    if (t > 5.6) {
      g.globalAlpha = clamp((t - 5.6) / 1.4, 0, 1);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
    }
    g.globalAlpha = 1;
    void shade;
  }
}
