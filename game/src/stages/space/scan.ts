// Planet scans: what lives on a world, and what a scan reveals and pays.
import { TOOL_MAP, tScoreOf } from './data';
import { onScan, tutorialEvent } from './missions';
import type { Specimen } from './types';
import type { World } from './world';

/** The species living on a world: its ecosystem plus, on living worlds, the natives its T-score supports. */
export function lifeOn(w: World, star: number, idx: number): Specimen[] {
  const pl = w.planet(star, idx), ps = w.peekPS(star, idx);
  if (pl.kind === 'gas' || ps.destroyed) return [];
  const out: Specimen[] = [];
  const add = (sp: Specimen | null) => { if (sp && !out.some((x) => x.seed === sp.seed)) out.push(sp); };
  for (const sp of ps.eco) add(sp);
  if (pl.life) for (const sp of w.natives(pl).slice(0, Math.max(1, tScoreOf(ps.atm, ps.temp)) * 4)) add(sp);
  return out;
}

export interface ScanResult {
  star: number;
  idx: number;
  /** First scan of this world (pays survey data). */
  first: boolean;
  pay: number;
  /** Special finds: wrecks, ruins. */
  finds: { icon: string; text: string }[];
}

const RUIN_GIFTS = ['stormpod', 'meteor', 'icecomet', 'droughtpod', 'repair', 'recharge'];

/** Scan a world. The first scan pays for survey data (more for living worlds) and salvages wrecks and ruins. */
export function scanPlanet(w: World, star: number, idx: number): ScanResult {
  const pl = w.planet(star, idx);
  const ps = w.ps(star, idx);
  const first = !ps.scanned;
  ps.scanned = true;
  onScan(w, star, idx);
  if (pl.feature === 'wreck' && star === w.gal.homeStar) tutorialEvent(w, 'scan');
  const finds: ScanResult['finds'] = [];
  let pay = 0;
  if (first) {
    w.counter('scans');
    const life = lifeOn(w, star, idx).length;
    // Your own worlds are already charted; anything else pays for survey data.
    pay = ps.destroyed || ps.owner === 'player' ? 0 : pl.kind === 'gas' ? 400 : life ? 600 + life * 250 : 500;
    if (pl.feature === 'wreck') {
      pay += 15000;
      finds.push({ icon: '🛰️', text: 'A crashed ship! Its data salvaged for §15,000.' });
    } else if (pl.feature === 'ruin') {
      const g = RUIN_GIFTS[Math.floor(Math.random() * RUIN_GIFTS.length)];
      w.give(g, 2);
      pay += 8000;
      finds.push({ icon: '🏛️', text: `Ancient ruins held relics worth §8,000 and 2 × ${TOOL_MAP[g].icon} ${TOOL_MAP[g].name}.` });
    }
    if (pay) w.addMoney(pay);
  }
  return { star, idx, first, pay, finds };
}
