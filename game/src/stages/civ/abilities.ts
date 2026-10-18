// Consequence-card abilities (paid in §, with cooldowns) and the nation superweapon.
import { audio } from '../../engine/audio';
import { h, ui } from '../../engine/ui';
import { ABILITIES, abilitiesFor, type AbilityDef } from '../../game/cards';
import { PK } from './fx';
import { fmtMoney, METHOD_OF, PLAYER, turretPos, wdist, type City } from './types';
import type { CivStage } from './stage';

type Kind = 'area' | 'city' | 'instant';
const KIND: Record<string, Kind> = {
  mend: 'area', stasis: 'area', bulwark: 'area', bribebomb: 'area', shockwave: 'area',
  goodwill: 'city', hush: 'city', adblitz: 'city', sunfire: 'city',
};
export const RADIUS: Record<string, number> = { mend: 150, stasis: 170, bulwark: 150, bribebomb: 170, shockwave: 150 };
const COLOR: Record<string, string> = { mend: '#7dffb0', stasis: '#9fe8ff', bulwark: '#ffd166', bribebomb: '#ffd166', shockwave: '#ff8a5a' };

export class Abilities {
  cool: Record<string, number> = {};
  private queue: { t: number; fn: () => void }[] = [];
  constructor(private S: CivStage) {}

  list(): AbilityDef[] {
    const st = this.S.game.state;
    return st ? abilitiesFor(st.cards, 'civ').filter((a) => !a.id.startsWith('sw-')) : [];
  }
  superweapon(): AbilityDef {
    return ABILITIES['sw-' + this.S.playerType];
  }
  kind(id: string): Kind { return KIND[id] ?? 'instant'; }
  remaining(): City[] { return this.S.cities.filter((c) => c.owner !== PLAYER); }
  cost(id: string): number {
    if (id.startsWith('sw-')) return 12000 * this.remaining().length;
    return ABILITIES[id]?.cost ?? 0;
  }
  /** null when usable, otherwise the reason. */
  why(id: string): string | null {
    const S = this.S;
    if (id.startsWith('sw-') && S.ownedCount() < 6) return `Needs 6 cities (you have ${S.ownedCount()})`;
    if (id === 'sunfire' && S.ownedCount() < 4) return 'Needs 4 cities';
    if ((this.cool[id] ?? 0) > 0) return `Recharging (${Math.ceil(this.cool[id])}s)`;
    if (S.money < this.cost(id)) return `Needs ${fmtMoney(this.cost(id))}`;
    return null;
  }

  async use(id: string) {
    const S = this.S;
    const w = this.why(id);
    if (w) { audio.sfx('error'); S.toast(w, ABILITIES[id]?.icon ?? '⛔', 'bad'); return; }
    if (this.kind(id) === 'instant') {
      const def = ABILITIES[id];
      S.hold('confirm', true);
      const ok = await ui.confirm(`${def.icon} ${def.name}`, `${def.desc} Spend ${fmtMoney(this.cost(id))} to take the remaining ${this.remaining().length} cities?`, 'Launch', 'Cancel');
      S.hold('confirm', false);
      if (ok) this.fireSuperweapon(id);
      return;
    }
    S.targeting = id;
    S.selected.clear();
    S.hud.dirty = true;
    audio.sfx('tap');
  }

  cancel() {
    this.S.targeting = null;
    this.S.hud.dirty = true;
  }

  /** The player tapped the map while targeting. */
  target(id: string, x: number, y: number, city?: City) {
    const S = this.S;
    const def = ABILITIES[id];
    if (this.kind(id) === 'city') {
      if (!city || city.owner === PLAYER || !city.founded) { audio.sfx('error'); S.toast(`Tap a rival city to use ${def.name}.`, def.icon, 'bad'); return; }
      if (id === 'adblitz' && city.buyout >= 100) { S.toast(`${city.name} is already ready to buy.`, '💰'); return; }
    }
    const w = this.why(id);
    if (w) { audio.sfx('error'); S.toast(w, def.icon, 'bad'); this.cancel(); return; }
    S.money -= this.cost(id);
    this.cool[id] = def.cooldown ?? 60;
    S.targeting = null;
    S.hud.dirty = true;
    S.game.stat('civ-abilities');
    if (city && this.kind(id) === 'city') this.cityPower(id, city);
    else this.areaPower(id, x, y);
  }

  private areaPower(id: string, x: number, y: number) {
    const S = this.S;
    const r = RADIUS[id] ?? 150;
    const inR = (px: number, py: number) => wdist(px, py, x, y) <= r;
    S.fx.wave(x, y, r * 1.1, COLOR[id] ?? '#ffffff', 1.1);
    S.fx.wave(x, y, r * 0.7, COLOR[id] ?? '#ffffff', 0.8, false);
    switch (id) {
      case 'mend': {
        audio.sfx('heal');
        for (const v of S.vehicles) if (v.nation === PLAYER && inR(v.x, v.y)) { v.hp = Math.min(v.maxHp, v.hp + v.maxHp * 0.7); S.fx.burst(PK.Heal, v.x, v.y - 10, 4, 30, { life: 0.9, size: 3, vz: 30 }); }
        for (const c of S.cities) if (c.owner === PLAYER && inR(c.x, c.y)) {
          c.defense = c.defenseMax;
          for (const t of c.turrets) if (t.alive) t.hp = 300;
          S.fx.burst(PK.Heal, c.x, c.y - 30, 14, 60, { life: 1.2, size: 4, vz: 40 });
        }
        break;
      }
      case 'stasis': {
        audio.sfx('zap');
        for (const v of S.vehicles) if (v.nation !== PLAYER && inR(v.x, v.y)) { v.frozen = 10; S.fx.burst(PK.Ice, v.x, v.y - 10, 5, 40, { life: 1, size: 3, color: '#bff4ff', vz: 60 }); S.nations[v.nation].rel -= 2; }
        for (const c of S.cities) if (c.owner !== PLAYER) c.turrets.forEach((t, i) => {
          const p = turretPos(i, c.turrets.length);
          if (t.alive && inR(c.x + p.x, c.y + p.y)) t.frozen = 10;
        });
        break;
      }
      case 'bulwark': {
        audio.sfx('levelup');
        for (const v of S.vehicles) if (v.nation === PLAYER && inR(v.x, v.y)) v.invuln = 12;
        break;
      }
      case 'bribebomb': {
        audio.sfx('coin');
        S.fx.burst(PK.Coin, x, y, 50, r, { vz: 220, life: 2, size: 4 });
        for (const v of S.vehicles) if (v.nation !== PLAYER && inR(v.x, v.y)) { v.bribed = 12; S.nations[v.nation].rel -= 2; }
        break;
      }
      case 'shockwave': {
        audio.sfx('explode');
        setTimeout(() => audio.sfx('explode', { pitch: 0.7 }), 160);
        S.fx.explode(x, y, 3);
        for (let k = 0; k < 6; k++) S.fx.explode(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r * 0.7, 1.2);
        for (const v of S.vehicles.slice()) if (inR(v.x, v.y)) S.sim.damage({ t: 'v', id: v.id }, 200, PLAYER, 'bomb');
        for (const c of S.cities) {
          c.turrets.forEach((t, i) => {
            const p = turretPos(i, c.turrets.length);
            if (t.alive && inR(c.x + p.x, c.y + p.y)) S.sim.damage({ t: 'tur', city: c.id, i }, 260, PLAYER, 'bomb');
          });
          if (inR(c.x, c.y)) {
            if (c.owner === PLAYER) { c.defense = Math.max(1, c.defense - c.defenseMax * 0.2); continue; }
            S.sim.damage({ t: 'hall', city: c.id }, c.defenseMax * 0.45, PLAYER, 'bomb');
          }
        }
        for (const g of S.geysers) if (g.owner >= 0 && g.owner !== PLAYER && inR(g.x, g.y)) S.sim.damage({ t: 'der', g: g.id }, 300, PLAYER, 'bomb');
        break;
      }
    }
  }

  private cityPower(id: string, c: City) {
    const S = this.S;
    const n = S.nations[c.owner];
    switch (id) {
      case 'goodwill': {
        n.goodwill = 90;
        n.hostileT = 999;
        n.truce = Math.max(n.truce, 5);
        for (const v of S.vehicles) if (v.nation === n.id && (v.order.k === 'city' && S.cities[v.order.city].owner === PLAYER || v.order.k === 'hunt')) S.sim.setOrder(v, { k: 'idle' });
        audio.sfx('bell');
        audio.sfx('success');
        for (const oc of S.cities) if (oc.owner === n.id) {
          for (let k = 0; k < 4; k++) S.fx.burst(PK.Confetti, oc.x + (Math.random() - 0.5) * 80, oc.y - 40 - Math.random() * 40, 16, 110, { vz: 140, life: 1.8, size: 3.5, colors: ['#ff7ab8', '#ffd166', '#5cc8ff', '#7dffb0'] });
        }
        S.toast(`The ${n.name} is celebrating with you for 90 seconds.`, '🎉', 'good');
        break;
      }
      case 'hush': {
        c.hush = 30;
        audio.sfx('whoosh');
        S.fx.burst(PK.Smoke, c.x, c.y - 90, 20, 70, { life: 2.5, size: 22, grow: 10, color: '#4b4f5a' });
        S.toast(`${c.name} falls silent: turrets and entertainment are down for 30 seconds.`, '🌫️', 'good');
        break;
      }
      case 'adblitz': {
        c.buyout = 100;
        c.trade = true;
        audio.sfx('horn');
        S.fx.burst(PK.Confetti, c.x, c.y - 70, 40, 140, { vz: 120, life: 2, size: 4, colors: ['#ffd166', '#ffffff', '#4aa8ff'] });
        S.fx.float(c.x, c.y - 110, 'SALE!', '#ffd166', 22);
        S.onBuyoutReady(c);
        break;
      }
      case 'sunfire': {
        audio.sfx('explode');
        setTimeout(() => audio.sfx('explode', { pitch: 0.6 }), 250);
        S.fx.explode(c.x, c.y - 10, 4);
        S.fx.burst(PK.Smoke, c.x, c.y - 60, 30, 60, { life: 3, size: 26, grow: 14, color: '#6b5a50', vz: 40 });
        S.fx.wave(c.x, c.y, 260, '#ffb347', 1.4);
        for (const o of S.nations) if (o.id !== PLAYER) { o.rel = Math.max(-100, o.rel - 90); o.allied = false; o.hostileT = 0; }
        S.sim.capture(c, PLAYER, 'military');
        S.toast('Every nation on the planet now fears and hates you.', '☢️', 'bad', 4000);
        break;
      }
    }
  }

  private fireSuperweapon(id: string) {
    const S = this.S;
    const cost = this.cost(id);
    const why = this.why(id);
    if (why) { S.toast(why, '⛔', 'bad'); return; }
    S.money -= cost;
    S.stats.superweapon++;
    S.game.unlock('superweapon');
    S.game.stat('civ-superweapon');
    const def = ABILITIES[id];
    S.game.banner(def.name, `${this.remaining().length} cities`);
    audio.sfx(id === 'sw-military' ? 'alarm' : id === 'sw-religious' ? 'bell' : 'horn');
    const home = S.cities.find((c) => c.home) ?? S.cities.find((c) => c.owner === PLAYER)!;
    const method = METHOD_OF[S.playerType];
    const targets = this.remaining();
    targets.forEach((c, i) => {
      const t = 0.8 + i * 0.45;
      this.queue.push({ t, fn: () => {
        if (id === 'sw-military') { S.fx.beam(home.x, home.y - 60, c.x, c.y - 30, '#ff8a5a', 0.6, 4, 260); S.fx.explode(c.x, c.y - 10, 2.2); audio.sfx('explode'); }
        else if (id === 'sw-religious') { S.fx.beam(home.x, home.y - 60, c.x, c.y - 40, '#ffe58a', 0.9, 5, 200); S.fx.burst(PK.Glow, c.x, c.y - 40, 20, 90, { life: 1.2, size: 10, color: '#fff2a8' }); audio.sfx('bell'); }
        else { S.fx.burst(PK.Coin, c.x, c.y - 40, 40, 140, { vz: 200, life: 1.8, size: 4 }); S.fx.float(c.x, c.y - 100, 'SOLD!', '#ffd166', 20); audio.sfx('coin'); }
        if (c.owner !== PLAYER) S.sim.capture(c, PLAYER, method);
      } });
    });
  }

  update(dt: number) {
    for (const k of Object.keys(this.cool)) if (this.cool[k] > 0) this.cool[k] -= dt;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.t -= dt;
      if (q.t <= 0) { this.queue.splice(i, 1); q.fn(); }
    }
  }
}

export { h };
