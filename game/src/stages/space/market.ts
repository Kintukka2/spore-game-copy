// The Galactic Spice Exchange: a live price index for each spice that every empire's spice prices follow.
// Prices wander on their own (momentum, noise and a pull back to normal), jump on news, sag when you dump
// spice and climb when you buy it. On the exchange you trade spice contracts (paper, no hold space) for
// profit, buy tips from a shady broker about the next headline, and take jobs the news throws up: relief
// convoys for shortages, and pirate hoards to break up. Both move the market when you finish them.
import { article } from '../../engine/math';
import { SPICE, SPICE_COLORS, type SpiceColor } from './data';
import type { Mission } from './types';
import type { World } from './world';

/** Seconds of market time per price tick, and how many ticks of history are kept (30 minutes). */
export const TICK = 5;
export const HIST = 360;
/** Contract price is the spice's base price times this, times its index. */
export const CONTRACT = 8;
/** Broker fee on every order, and how far each contract traded moves the price. */
export const FEE = 0.015;
const IMPACT = 0.0008;
/** Noise per √second: rarer spices swing harder. */
const SIG: Record<SpiceColor, number> = { red: 0.0055, yellow: 0.006, blue: 0.0065, green: 0.0075, pink: 0.0085, purple: 0.0095 };
const LO = Math.log(0.35), HI = Math.log(3);
export const CODE: Record<SpiceColor, string> = { red: 'EMB', yellow: 'SUN', blue: 'AZR', green: 'VRD', pink: 'BLS', purple: 'UMB' };

export type NewsTag = 'BREAKING' | 'RUMOUR' | 'MARKET' | 'YOU';
export interface MarketNews {
  id: number;
  /** Market clock and price tick when it ran. */
  at: number;
  tick: number;
  icon: string;
  head: string;
  body: string;
  tag: NewsTag;
  fx: { c: SpiceColor; shock: number }[];
  rumour?: boolean;
  /** The job this headline opens up, if any. */
  opp?: MarketOpp;
}
export interface MarketOpp {
  id: number;
  kind: 'relief' | 'hoard';
  c: SpiceColor;
  empire?: string;
  star?: number;
  amount?: number;
  reward: number;
  /** Market clock time the offer lapses; how much it moves the price once done. */
  until: number;
  shock: number;
  taken?: boolean;
}
export interface MarketState {
  clock: number;
  acc: number;
  tick: number;
  L: Record<SpiceColor, number>;
  mom: Record<SpiceColor, number>;
  hist: Record<SpiceColor, number[]>;
  trends: { c: SpiceColor; shift: number; until: number; dur: number }[];
  flips: { c: SpiceColor; shock: number; at: number }[];
  news: MarketNews[];
  next: MarketNews | null;
  nextAt: number;
  /** A tip bought about the next headline: what Zix said, and whether he was right. */
  tip?: { id: number; c: SpiceColor | null; up: boolean; right: boolean };
  hold: Record<SpiceColor, { n: number; cost: number }>;
  realized: number;
  /** Recent spice you dumped at empires, per colour (feeds a "mystery trader" headline). */
  pressure: Record<SpiceColor, number>;
  opps: MarketOpp[];
  /** Market clock when you last looked at the exchange: headlines after it are unread. */
  seen: number;
}

const per = <T>(f: (c: SpiceColor) => T) => Object.fromEntries(SPICE_COLORS.map((c) => [c, f(c)])) as Record<SpiceColor, T>;
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
/** History is rounded so the save stays small. */
const r4 = (x: number) => Math.round(x * 10000) / 10000;

/** A fresh market with half an hour of made-up history, so the charts have a past. */
export function initMarket(): MarketState {
  const m: MarketState = {
    clock: 0, acc: 0, tick: 0,
    L: per(() => 1), mom: per(() => 0), hist: per(() => []),
    trends: [], flips: [], news: [], next: null, nextAt: 45,
    hold: per(() => ({ n: 0, cost: 0 })), realized: 0, pressure: per(() => 0), opps: [], seen: 0,
  };
  for (const c of SPICE_COLORS) {
    let x = rnd(-0.12, 0.12), mo = 0;
    const back: number[] = [];
    for (let i = 0; i < HIST; i++) {
      mo = mo * 0.96 + gauss() * 0.0006;
      x += mo - 0.012 * x + gauss() * SIG[c] * Math.sqrt(TICK);
      back.push(r4(Math.exp(Math.max(LO, Math.min(HI, x)))));
    }
    m.hist[c] = back;
    m.L[c] = back[back.length - 1];
    m.mom[c] = mo;
  }
  return m;
}

export const marketFactor = (w: World, c: SpiceColor) => w.s.market?.L[c] ?? 1;
/** One spice contract at today's index. */
export const contractPrice = (w: World, c: SpiceColor) => Math.round(SPICE[c].base * CONTRACT * marketFactor(w, c));
/** The Galactic Spice Index: every spice's index, weighted by value, as a number around 1,000. */
export function gsi(w: World, back = 0): number {
  const m = w.s.market!;
  let a = 0, b = 0;
  for (const c of SPICE_COLORS) { const h = m.hist[c]; a += SPICE[c].base * (h[Math.max(0, h.length - 1 - back)] ?? 1); b += SPICE[c].base; }
  return (a / b) * 1000;
}
/** Change over the last `n` ticks, as a fraction. */
export function change(w: World, c: SpiceColor, n = 60): number {
  const h = w.s.market!.hist[c];
  const a = h[Math.max(0, h.length - 1 - n)], b = h[h.length - 1];
  return a ? b / a - 1 : 0;
}
/** Recent volatility: the spread of the last 30 ticks' moves, per tick. */
export function volatility(w: World, c: SpiceColor): number {
  const h = w.s.market!.hist[c].slice(-31);
  const r: number[] = [];
  for (let i = 1; i < h.length; i++) r.push(Math.log(h[i] / h[i - 1]));
  const mean = r.reduce((s, x) => s + x, 0) / Math.max(1, r.length);
  return Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, r.length));
}

// ------------------------------------------------------------------ the clock
/** Advance the market by `dt` seconds (from the world, or from the exchange screen while the game is paused). */
export function marketTick(w: World, dt: number) {
  const m = w.s.market;
  if (!m) return;
  m.acc += dt;
  m.clock += dt;
  while (m.acc >= TICK) { m.acc -= TICK; step(w, m); }
}

function step(w: World, m: MarketState) {
  m.tick++;
  for (const c of SPICE_COLORS) {
    // Active news trends pull the price toward a new level that fades as the story gets old.
    let target = 0;
    for (const tr of m.trends) if (tr.c === c && m.clock < tr.until) target += tr.shift * ((tr.until - m.clock) / tr.dur);
    m.mom[c] = m.mom[c] * 0.96 + gauss() * 0.0006;
    let x = Math.log(m.L[c]);
    x += m.mom[c] - 0.012 * (x - target) + gauss() * SIG[c] * Math.sqrt(TICK);
    m.L[c] = Math.exp(Math.max(LO, Math.min(HI, x)));
    const h = m.hist[c];
    h.push(r4(m.L[c]));
    if (h.length > HIST) h.splice(0, h.length - HIST);
    m.pressure[c] *= 0.97;
  }
  m.trends = m.trends.filter((tr) => m.clock < tr.until);
  // Rumours fall apart.
  for (const f of m.flips.filter((x) => m.clock >= x.at)) {
    bump(m, f.c, -f.shock * 0.85);
    publish(w, m, { icon: '✅', tag: 'MARKET', head: `Rumour debunked: ${SPICE[f.c].name} ${f.shock > 0 ? 'supplies are fine after all' : 'stocks were never in surplus'}`, body: 'The story came from one anonymous source and a very excited parrot. Prices snap back.', fx: [{ c: f.c, shock: 0 }] }, false);
  }
  m.flips = m.flips.filter((x) => m.clock < x.at);
  // A big dump of one spice at the empires makes the news.
  for (const c of SPICE_COLORS) {
    if (m.pressure[c] < 25) continue;
    m.pressure[c] = 0;
    publish(w, m, { icon: '🛸', tag: 'YOU', head: `A mystery trader floods the market with ${SPICE[c].name}`, body: 'Crates and crates of it, sold at any price. Every broker in the sector is asking who.', fx: [{ c, shock: -rnd(0.07, 0.12) }] });
  }
  if (!m.next) m.next = rollNews(w, m);
  if (m.clock >= m.nextAt && m.next) {
    const n = m.next;
    m.next = null;
    publish(w, m, n);
    m.nextAt = m.clock + rnd(60, 120);
    m.tip = undefined;
  }
  m.opps = m.opps.filter((o) => m.clock < o.until);
}

/** Nudge a spice's index by a log amount. */
function bump(m: MarketState, c: SpiceColor, by: number) {
  m.L[c] = Math.exp(Math.max(LO, Math.min(HI, Math.log(m.L[c]) + by)));
  const h = m.hist[c];
  if (h.length) h[h.length - 1] = m.L[c];
}

/** Run a headline: jump the prices, start the trends, open its job, and tell the player. */
function publish(w: World, m: MarketState, n: Omit<MarketNews, 'id' | 'at' | 'tick'> & Partial<MarketNews>, trend = true) {
  const full: MarketNews = { ...n, id: n.id ?? w.nid(), at: m.clock, tick: m.tick };
  for (const f of full.fx) {
    if (!f.shock) continue;
    bump(m, f.c, f.shock * 0.45);
    if (full.rumour) m.flips.push({ c: f.c, shock: f.shock * 0.45, at: m.clock + rnd(50, 90) });
    else if (trend) { const dur = rnd(150, 260); m.trends.push({ c: f.c, shift: f.shock * 0.45, until: m.clock + dur, dur }); }
  }
  if (full.opp) { full.opp.until = m.clock + 300; m.opps.push(full.opp); }
  m.news.unshift(full);
  if (m.news.length > 30) m.news.length = 30;
  w.hooks?.marketNews?.(full);
}

// ------------------------------------------------------------------ headlines
interface Ctx { c: SpiceColor; world: string; empire: string; species: string; system: string; e?: string; star?: number }

function context(w: World, c: SpiceColor): Ctx {
  const near = w.gal.within(w.s.loc, 520).filter((sid) => !w.star(sid).hollow);
  const worlds = near.flatMap((sid) => w.gal.planets(sid).filter((p) => p.spice === c).map((p) => p.name));
  const all = near.flatMap((sid) => w.gal.planets(sid).map((p) => p.name));
  const emps = w.empires.filter((e) => !e.dead && e.arch !== 'hollow');
  const met = emps.filter((e) => e.met);
  const e = pick(met.length ? met : emps.length ? emps : w.empires);
  const sys = near.filter((sid) => sid !== w.s.loc);
  const star = sys.length ? pick(sys) : near[0] ?? w.s.loc;
  return { c, world: pick(worlds.length ? worlds : all.length ? all : ['the rim worlds']), empire: e?.name ?? 'the core banks', species: e?.species ?? 'core', system: w.star(star).name, e: e?.id, star };
}

type Template = { w: number; dir: 1 | -1; lo: number; hi: number; icon: string; tag?: NewsTag; head: (x: Ctx) => string; body: (x: Ctx) => string; opp?: 'relief' | 'hoard'; all?: boolean; rumour?: boolean };
const S = (c: SpiceColor) => SPICE[c].name;
const TEMPLATES: Template[] = [
  { w: 3, dir: 1, lo: 0.18, hi: 0.32, icon: '🦠', head: (x) => `Blight sweeps the ${S(x.c)} fields of ${x.world}`, body: (x) => `Crop inspectors on ${x.world} report a fungal blight. Traders expect ${S(x.c)} shipments to dry up for weeks.` },
  { w: 2.5, dir: 1, lo: 0.12, hi: 0.22, icon: '🏴‍☠️', opp: 'hoard', head: (x) => `Pirates seize ${article(S(x.c))} ${S(x.c)} convoy near ${x.system}`, body: (x) => `Raiders are sitting on the cargo near ${x.system}, waiting for the price to climb. Someone with guns could change that.` },
  { w: 2.5, dir: 1, lo: 0.15, hi: 0.3, icon: '✨', head: (x) => `${S(x.c)} is all the rage among ${x.species} nobles`, body: () => 'Spiced pastries, spiced perfume, spiced everything. Demand is through the roof, and so are prices.' },
  { w: 2.5, dir: 1, lo: 0.12, hi: 0.22, icon: '🛒', opp: 'relief', head: (x) => `${x.empire} runs short of ${S(x.c)}`, body: (x) => `Shelves across ${x.empire} space are empty. Their buyers will pay well over the odds for a relief shipment.` },
  { w: 1.5, dir: 1, lo: 0.1, hi: 0.2, icon: '⚔️', head: (x) => `${x.empire} stockpiles ${S(x.c)} for leaner times`, body: (x) => `Quartermasters from ${x.empire} are buying every crate they can find. Smaller buyers are being squeezed out.` },
  { w: 1.5, dir: 1, lo: 0.14, hi: 0.24, icon: '🤖', head: (x) => `Hollow drones cut the ${S(x.c)} shipping lanes`, body: () => 'Grey ships drift across the trade routes, and freighters are refusing to fly. Supply is collapsing.' },
  { w: 3, dir: -1, lo: 0.15, hi: 0.3, icon: '⛏️', head: (x) => `Huge ${S(x.c)} seams struck on ${x.world}`, body: (x) => `Survey drills on ${x.world} hit the richest ${S(x.c)} deposit in living memory. A flood of supply is coming.` },
  { w: 2, dir: -1, lo: 0.12, hi: 0.25, icon: '🧪', head: (x) => `Lab-grown ${S(x.c)} unveiled on ${x.world}`, body: () => 'Scientists say it tastes "nearly identical". Gourmets disagree, but the market panics anyway.' },
  { w: 2, dir: -1, lo: 0.1, hi: 0.2, icon: '🚫', head: (x) => `${x.empire} bans ${S(x.c)} imports`, body: (x) => `After a smuggling scandal, ${x.empire} has closed its ports to ${S(x.c)}. Sellers are scrambling for other buyers.` },
  { w: 2, dir: -1, lo: 0.12, hi: 0.22, icon: '🌾', head: (x) => `Bumper ${S(x.c)} harvest across ${x.empire} space`, body: () => 'Perfect seasons, fat crops, overflowing silos. Great for cooks. Terrible for prices.' },
  { w: 1, dir: 1, lo: 0.06, hi: 0.1, icon: '🎆', all: true, tag: 'MARKET', head: () => 'The Festival of Lights lifts every spice', body: () => 'Half the galaxy is cooking feasts this week. Every spice is in demand.' },
  { w: 1, dir: -1, lo: 0.06, hi: 0.1, icon: '🏦', all: true, tag: 'MARKET', head: () => 'Credit crunch at the core banks', body: () => 'Lenders are calling in their loans, and traders are selling whatever they hold to cover them.' },
  { w: 1.5, dir: 1, lo: 0.15, hi: 0.25, icon: '❓', rumour: true, tag: 'RUMOUR', head: (x) => `Unconfirmed: ${S(x.c)} reserves near exhaustion?`, body: () => 'One anonymous source, zero evidence, enormous excitement. Trade carefully.' },
  { w: 1.2, dir: -1, lo: 0.15, hi: 0.25, icon: '❓', rumour: true, tag: 'RUMOUR', head: (x) => `Whispers of a secret ${S(x.c)} glut`, body: () => 'A shaky holo of "warehouses full to the ceiling" is doing the rounds. Nobody can say where it was taken.' },
];

function rollNews(w: World, m: MarketState): MarketNews {
  let roll = Math.random() * TEMPLATES.reduce((a, t) => a + t.w, 0);
  const t = TEMPLATES.find((x) => (roll -= x.w) <= 0) ?? TEMPLATES[0];
  const c = pick(SPICE_COLORS);
  const x = context(w, c);
  const shock = t.dir * rnd(t.lo, t.hi);
  const n: MarketNews = {
    id: w.nid(), at: 0, tick: 0, icon: t.icon, tag: t.tag ?? 'BREAKING', head: t.head(x), body: t.body(x),
    fx: t.all ? SPICE_COLORS.map((cc) => ({ c: cc, shock: shock * rnd(0.7, 1.3) })) : [{ c, shock }], rumour: t.rumour,
  };
  if (t.opp === 'relief' && x.e) {
    const e = w.emap.get(x.e);
    const amount = 4 + Math.floor(Math.random() * 8);
    // Well over an ordinary delivery job (base × 22 a unit), and more while the shortage has the price up.
    if (e && !e.war) n.opp = { id: w.nid(), kind: 'relief', c, empire: e.id, amount, reward: Math.round((amount * SPICE[c].base * 30 * marketFactor(w, c)) / 1000) * 1000, until: 0, shock: -Math.abs(shock) * 0.9 };
  }
  if (t.opp === 'hoard' && x.star !== undefined && x.star !== w.s.loc) {
    n.opp = { id: w.nid(), kind: 'hoard', c, star: x.star, reward: Math.round((25000 + SPICE[c].base * 40) / 1000) * 1000, until: 0, shock: -Math.abs(shock) };
  }
  void m;
  return n;
}

/** A headline about something you did (a colony, a war): it runs now, outside the schedule. */
export function marketStory(w: World, icon: string, head: string, body: string, fx: { c: SpiceColor; shock: number }[]) {
  const m = w.s.market;
  if (m) publish(w, m, { icon, tag: 'YOU', head, body, fx });
}

// ------------------------------------------------------------------ your trades
/** Selling (n > 0) or buying (n < 0) physical spice at an empire leans on the index. */
export function marketPress(w: World, c: SpiceColor, sold: number) {
  const m = w.s.market;
  if (!m || !sold) return;
  bump(m, c, -Math.sign(sold) * Math.min(0.12, Math.abs(sold) * 0.0028));
  if (sold > 0) m.pressure[c] += sold;
}

/** What an order of `n` contracts would cost or pay, with slippage and the broker's fee. */
export function quote(w: World, c: SpiceColor, n: number, side: 'buy' | 'sell') {
  const p = contractPrice(w, c);
  const avg = p * Math.exp((side === 'buy' ? 1 : -1) * IMPACT * n / 2);
  const gross = Math.round(avg * n);
  const fee = Math.round(gross * FEE);
  return { price: p, avg, gross, fee, net: side === 'buy' ? gross + fee : gross - fee };
}
/** The most contracts you can afford right now. */
export function maxBuy(w: World, c: SpiceColor): number {
  let lo = 0, hi = 9999;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (quote(w, c, mid, 'buy').net <= w.s.money) lo = mid; else hi = mid - 1; }
  return lo;
}
/** Place an order. Returns why not, or null when it fills. */
export function trade(w: World, c: SpiceColor, n: number, side: 'buy' | 'sell'): string | null {
  const m = w.s.market;
  if (!m || n <= 0 || !Number.isFinite(n)) return 'Pick how many contracts.';
  const q = quote(w, c, n, side);
  const h = m.hold[c];
  if (side === 'buy') {
    if (q.net > w.s.money) return 'Not enough credits for that order.';
    w.addMoney(-q.net);
    h.n += n;
    h.cost += q.net;
    bump(m, c, IMPACT * n);
  } else {
    if (n > h.n) return `You only hold ${h.n} ${SPICE[c].name} contracts.`;
    const basis = h.cost * (n / h.n);
    w.addMoney(q.net);
    m.realized += q.net - basis;
    h.cost -= basis;
    h.n -= n;
    if (!h.n) h.cost = 0;
    bump(m, c, -IMPACT * n);
  }
  w.counter('marketTrades');
  return null;
}
/** Everything you hold on the exchange, valued at today's prices (before the fee to sell). */
export function portfolio(w: World) {
  const m = w.s.market!;
  let value = 0, cost = 0;
  for (const c of SPICE_COLORS) { const h = m.hold[c]; if (!h.n) continue; value += contractPrice(w, c) * h.n; cost += h.cost; }
  return { value, cost, pl: value - cost };
}

// ------------------------------------------------------------------ the broker
export function tipPrice(w: World): number {
  return Math.round(Math.min(120000, Math.max(15000, 15000 + portfolio(w).value * 0.02)) / 1000) * 1000;
}
/** Buy a whisper about the next headline. Zix is right about three times in four. */
export function buyTip(w: World): string | null {
  const m = w.s.market!;
  if (!m.next) m.next = rollNews(w, m);
  if (m.tip?.id === m.next.id) return 'Zix has nothing more to say until the next story breaks.';
  const cost = tipPrice(w);
  if (w.s.money < cost) return 'Zix does not work on credit.';
  w.addMoney(-cost);
  const f = m.next.fx;
  const up = f.reduce((a, x) => a + x.shock, 0) > 0;
  const right = Math.random() < 0.75;
  m.tip = { id: m.next.id, c: f.length > 1 ? null : f[0].c, up: right ? up : !up, right };
  return null;
}
/** Seconds until the next headline. */
export const nextIn = (w: World) => Math.max(0, (w.s.market?.nextAt ?? 0) - (w.s.market?.clock ?? 0));

// ------------------------------------------------------------------ jobs
/** Take a job from the news: it becomes a mission, and finishing it moves the price. */
export function takeOpp(w: World, o: MarketOpp): string | null {
  if (o.taken) return 'You already took that job.';
  if (w.s.missions.filter((x) => !x.main).length >= 4) return 'You already have 4 missions. Finish or abandon one first.';
  const c = o.c;
  let mm: Mission;
  if (o.kind === 'relief') {
    const e = o.empire ? w.emap.get(o.empire) : undefined;
    if (!e || e.war || e.dead) return 'That empire is no longer taking shipments.';
    mm = { id: w.nid(), kind: 'deliver', giver: e.id, title: `Relief: ${o.amount} ${SPICE[c].name} for ${e.name}`, desc: `Ship ${o.amount} ${SPICE[c].name} to any ${e.species} world before the shortage bites. It will ease ${SPICE[c].name} prices.`, color: c, amount: o.amount, reward: o.reward, deadline: w.s.t + 420, progress: 0, market: { c, shock: o.shock } };
  } else {
    const sid = o.star!;
    mm = { id: w.nid(), kind: 'pirates', giver: 'exchange', title: `Break the ${SPICE[c].name} hoard at ${w.star(sid).name}`, desc: `Pirates are sitting on stolen ${SPICE[c].name} near ${w.star(sid).name}. Destroy them and the cargo floods back onto the market.`, star: sid, reward: o.reward, deadline: w.s.t + 540, progress: 0, market: { c, shock: o.shock } };
  }
  o.taken = true;
  w.s.missions.push(mm);
  return null;
}
/** A market job is done: the price eases, and the exchange says who did it. */
export function marketJobDone(w: World, m: Mission) {
  if (!m.market) return;
  const c = m.market.c;
  marketStory(w, m.kind === 'deliver' ? '🚚' : '💥', m.kind === 'deliver' ? `Relief convoy lands: ${SPICE[c].name} shortage eases` : `${SPICE[c].name} hoard broken up: stolen cargo floods back`,
    m.kind === 'deliver' ? 'A lone captain filled the empty shelves. Panic buying stops overnight.' : 'The pirates are scrap, and their stolen crates are being auctioned off cheap.', [{ c, shock: m.market.shock }]);
}
