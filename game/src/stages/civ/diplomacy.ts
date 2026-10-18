// Diplomacy: relationships with the player, gifts, alliances, truces, AI rivalries,
// and the diplomatic endings (surrender of the last city, merger of allies).
import { audio } from '../../engine/audio';
import { h, ui } from '../../engine/ui';
import { clamp } from '../../engine/math';
import { PK } from './fx';
import { fmtMoney, PLAYER, relLabel, type City, type Nation } from './types';
import type { CivStage } from './stage';

export const GIFT = 1000;

export class Diplomacy {
  private eventT = 25;
  private tensionT = 30;
  private offerT = 0;
  private offered = new Set<string>();

  constructor(private S: CivStage) {}

  /** Effective relation (Goodwill Gala overrides). */
  rel(n: Nation): number {
    return n.goodwill > 0 ? Math.max(n.rel, 55) : n.rel;
  }

  canTrade(c: City): boolean {
    const n = this.S.nations[c.owner];
    if (!n || n.id === PLAYER) return false;
    const rivals = this.S.nations.filter((o) => o.id !== PLAYER && o.alive).length;
    return n.allied || this.rel(n) >= 15 || rivals <= 1;
  }

  tradeRefused(c: City) {
    const n = this.S.nations[c.owner];
    this.S.toast(`The ${n.name} won't trade with you yet. Raise relations to Friendly — gifts help.`, '🚫', 'bad', 3800);
    audio.sfx('error');
  }

  event(n: Nation, kind: 'attacked') {
    if (kind === 'attacked') {
      this.S.toast(`You attacked the ${n.name}! They are now at war with you.`, '⚔️', 'bad', 3500);
      audio.sfx('horn');
      this.S.hud.dirty = true;
    }
  }

  gift(n: Nation) {
    const S = this.S;
    if (S.money < GIFT) { audio.sfx('error'); S.toast(`A gift costs ${fmtMoney(GIFT)}.`, '🎁', 'bad'); return; }
    S.money -= GIFT;
    const gain = 14 * Math.pow(0.82, n.gifts);
    n.rel = clamp(n.rel + gain, -100, 100);
    n.gifts++;
    S.stats.gifts++;
    audio.sfx('coin');
    const cap = S.cities.find((c) => c.owner === n.id);
    if (cap) { S.fx.burst(PK.Coin, cap.x, cap.y - 30, 18, 90, { vz: 160, life: 1.6, size: 3.5 }); S.fx.float(cap.x, cap.y - 80, `+${Math.round(gain)} ❤`, '#ff9fc4', 15); }
    S.toast(`The ${n.name} appreciates your gift. (${relLabel(this.rel(n), n.allied).label})`, '🎁', 'good');
    S.hud.dirty = true;
  }

  ally(n: Nation) {
    const S = this.S;
    if (n.allied) {
      n.allied = false;
      n.rel = Math.min(n.rel, 10);
      S.toast(`You ended your alliance with the ${n.name}.`, '💔');
      S.hud.dirty = true;
      return;
    }
    if (this.rel(n) < 50) { audio.sfx('error'); S.toast(`The ${n.name} needs relations of at least 50 to ally (now ${Math.round(this.rel(n))}).`, '🤝', 'bad'); return; }
    n.allied = true;
    n.rel = Math.max(n.rel, 60);
    audio.sfx('success');
    S.toast(`You are now allied with the ${n.name}!`, '🤝', 'gold');
    S.game.history(`Formed an alliance with the ${n.name}`, '🤝');
    S.hud.dirty = true;
  }

  peaceCost(n: Nation): number {
    return 1500 + 600 * this.S.cities.filter((c) => c.owner === n.id).length;
  }

  peace(n: Nation) {
    const S = this.S;
    const cost = this.peaceCost(n);
    if (S.money < cost) { audio.sfx('error'); S.toast(`A peace treaty costs ${fmtMoney(cost)}.`, '🕊️', 'bad'); return; }
    S.money -= cost;
    n.truce = 90;
    n.rel = Math.max(n.rel, -25);
    n.hostileT = 999;
    for (const v of S.vehicles) {
      if (v.nation === n.id && (v.order.k === 'city' || v.order.k === 'hunt')) S.sim.setOrder(v, { k: 'idle' });
    }
    audio.sfx('bell');
    S.toast(`The ${n.name} agrees to a truce.`, '🕊️', 'good');
    S.hud.dirty = true;
  }

  /** What relations drift toward. */
  target(n: Nation): number {
    const S = this.S;
    let t = n.attitude;
    const mine = S.ownedCount();
    if (n.type === 'military') t -= Math.max(0, mine - 1) * 4;
    else if (n.type === 'religious') t -= Math.max(0, mine - 1) * 2.5;
    else t -= Math.max(0, mine - 2) * 1.5;
    const routes = S.cities.filter((c) => c.owner === n.id && c.trade).length;
    t += Math.min(25, routes * 8);
    t += Math.min(30, n.gifts * 6);
    if (n.allied) t = Math.max(t, 65);
    return clamp(t, -100, 100);
  }

  update(dt: number) {
    const S = this.S;
    for (const n of S.nations) {
      if (n.id === PLAYER || !n.alive) continue;
      n.gifts = Math.max(0, n.gifts - dt / 45);
      if (n.hostileT > 25) {
        const t = this.target(n);
        n.rel += clamp(t - n.rel, -1, 1) * dt * 0.35;
      }
      if (n.allied && n.rel < 30) { n.allied = false; S.toast(`The ${n.name} broke off your alliance.`, '💔', 'bad'); S.hud.dirty = true; }
    }
    // Trade routes close when relations sour.
    for (const c of S.cities) {
      if (!c.trade || c.owner === PLAYER) continue;
      const n = S.nations[c.owner];
      if (this.rel(n) < -30 && !n.allied) {
        c.trade = false;
        S.toast(`The ${n.name} closed the trade route to ${c.name}.`, '🚫', 'bad');
        for (const v of S.vehicles) if (v.nation === PLAYER && v.order.k === 'city' && v.order.city === c.id && v.role === 'economic') S.sim.setOrder(v, { k: 'idle' });
      }
    }
    // AI rivalries flare up and cool down.
    this.tensionT -= dt;
    if (this.tensionT <= 0) {
      this.tensionT = 25 + Math.random() * 25;
      const alive = S.nations.filter((n) => n.id !== PLAYER && n.alive);
      if (alive.length >= 2) {
        const a = alive[Math.floor(Math.random() * alive.length)];
        const b = alive.filter((x) => x !== a)[Math.floor(Math.random() * (alive.length - 1))];
        const delta = a.type === 'military' || b.type === 'military' ? -28 : Math.random() < 0.5 ? -18 : 14;
        const v = clamp(a.relAI[b.id] + delta, -100, 100);
        const wasWar = a.relAI[b.id] <= -50;
        a.relAI[b.id] = b.relAI[a.id] = v;
        if (!wasWar && v <= -50) S.toast(`War! The ${a.name} and the ${b.name} are fighting.`, '⚔️', 'info', 3000, 0);
      }
    }
    // Messages from AI nations.
    this.eventT -= dt;
    if (this.eventT <= 0) {
      this.eventT = 35 + Math.random() * 30;
      const alive = S.nations.filter((n) => n.id !== PLAYER && n.alive);
      const n = alive[Math.floor(Math.random() * alive.length)];
      if (n) {
        const r = this.rel(n);
        if (n.allied || r >= 40) {
          const amt = 400 + Math.round(Math.random() * 6) * 100;
          S.money += amt;
          S.toast(`The ${n.name} sends you a gift of ${fmtMoney(amt)}.`, '🎁', 'good');
          audio.sfx('coin');
        } else if (r <= -55) {
          S.toast(`The ${n.name}: "Your borders are an insult. Prepare yourselves!"`, '😡', 'bad', 3500);
        }
      }
    }
    this.checkOffers(dt);
  }

  /** Surrender of the last city, or a merger of allies. */
  private checkOffers(dt: number) {
    const S = this.S;
    this.offerT -= dt;
    if (this.offerT > 0) return;
    this.offerT = 4;
    const mine = S.ownedCount();
    const rest = S.cities.filter((c) => c.owner !== PLAYER && c.founded);
    if (!rest.length) return;
    const owners = new Set(rest.map((c) => c.owner));
    if (mine >= S.cities.length - 1 && rest.length === 1) {
      const c = rest[0];
      const key = 'surrender:' + c.id;
      if (this.offered.has(key)) return;
      this.offered.add(key);
      const n = S.nations[c.owner];
      this.offer(`The ${n.name} surrenders`, `"We cannot stand against you any longer. ${c.name} is yours." Accept their surrender?`, 'Accept surrender', () => {
        S.sim.capture(c, PLAYER, S.methodForPlayer());
      });
      return;
    }
    if (mine >= 5 && [...owners].every((id) => S.nations[id].allied)) {
      const key = 'merge:' + [...owners].sort().join(',');
      if (this.offered.has(key)) return;
      this.offered.add(key);
      const names = [...owners].map((id) => 'the ' + S.nations[id].name).join(' and ');
      this.offer('A union of nations', `Your allies, ${names}, propose to merge into one nation under your banner. Accept?`, 'Unite', () => {
        const method = S.playerType === 'religious' ? 'convert' : 'buy';
        for (const c of rest) S.sim.capture(c, PLAYER, method);
      });
    }
  }

  private async offer(title: string, text: string, yes: string, onYes: () => void) {
    const S = this.S;
    S.hold('offer', true);
    audio.sfx('horn');
    const r = await ui.modal({ title, body: h('p', null, text), buttons: [{ id: 'no', label: 'Not yet' }, { id: 'yes', label: yes, primary: true }] });
    S.hold('offer', false);
    if (r === 'yes') onYes();
  }
}
