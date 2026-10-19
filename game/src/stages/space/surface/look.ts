// Surface colours for a landing, matched to how the planet looks from orbit (planetArt styles).
import { hslRgb, styleFor } from '../art/planetArt';
import { EARTH_LOOK, type RGB, type TerrainLook } from '../../civ/terrain';
import { tScoreOf } from '../data';
import type { Planet, PlanetState } from '../types';

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Why a planet cannot be landed on, or null if it can. */
export function landingBlock(pl: Planet, ps: PlanetState, hollow: boolean): string | null {
  if (pl.kind === 'gas') return 'Gas giants have no surface to land on.';
  if (ps.destroyed) return 'Nothing is left down there but rubble and fire.';
  if (hollow || pl.feature === 'hollow') return 'The Hollow has sealed this world. Your ship cannot get through.';
  return null;
}

export function surfaceLook(pl: Planet, ps: PlanetState): TerrainLook {
  const t = tScoreOf(ps.atm, ps.temp);
  const style = styleFor('rocky', t, ps.atm, ps.temp, false, false);
  const hue = pl.hue;
  switch (style) {
    case 'terran': {
      const vegH = 70 + (hue % 110);
      const sand = hslRgb(38 + (hue % 14), 0.45, 0.62), rock = hslRgb(25 + (hue % 20), 0.22, 0.38);
      const vegAmt = [0, 0.3, 0.7, 1][t] ?? 1;
      const bare = mix(sand, rock, 0.35);
      const veg = (h: number, s: number, l: number) => mix(bare, hslRgb(h, s, l), vegAmt);
      return {
        sand, rock: mix(rock, [156, 144, 128], 0.4), hill: mix(sand, rock, 0.6), snow: [246, 246, 242], ice: [234, 244, 250],
        grassDry: veg(vegH + 12, 0.42, 0.52), grassWet: veg(vegH, 0.5, 0.42), forest: veg(vegH - 6, 0.5, 0.32), savanna: hslRgb(44 + (hue % 18), 0.45, 0.62),
        shallow: hslRgb(195 + (hue % 30), 0.6, 0.5), deep: hslRgb(205 + (hue % 30), 0.65, 0.26), foam: hslRgb(190 + (hue % 30), 0.55, 0.82),
        land: [0.5, 0.5, 0.42, 0.36][t] ?? 0.36, iceCaps: 0.5 + (1 - ps.temp) * 1.4, trees: [0, 0.35, 0.75, 1][t] ?? 1, mountains: 0.85, snowCaps: true,
        leaf: hex(hslRgb(vegH, 0.5, 0.42)),
        coast: EARTH_LOOK.coast, wave: EARTH_LOOK.wave, bg: hex(hslRgb(205 + (hue % 30), 0.6, 0.22)),
      };
    }
    case 'lava':
      return {
        sand: [96, 62, 48], grassDry: [74, 50, 44], grassWet: [60, 40, 36], forest: [50, 34, 31], savanna: [88, 58, 46],
        hill: [78, 56, 50], rock: [62, 46, 42], snow: [214, 92, 40],
        shallow: [255, 168, 64], deep: [236, 84, 28], foam: [255, 226, 150], ice: [120, 96, 88],
        land: 0.56, iceCaps: 0, trees: 0, mountains: 0.4, snowCaps: false, rockTint: '#5a4038',
        coast: ['rgba(255,140,60,0.25)', 'rgba(255,200,110,0.6)', 'rgba(30,10,8,0.85)'], wave: 'rgba(255,236,160,0.55)', bg: '#3a0e06',
      };
    case 'ice':
      return {
        sand: [230, 238, 248], grassDry: [222, 234, 246], grassWet: [200, 220, 240], forest: [178, 202, 228], savanna: [236, 242, 250],
        hill: [190, 206, 226], rock: [150, 170, 196], snow: [252, 253, 255],
        shallow: [120, 168, 214], deep: [40, 82, 140], foam: [214, 236, 250], ice: [244, 249, 255],
        land: 0.55, iceCaps: 2.6, trees: 0, mountains: 0.45, snowCaps: true, rockTint: '#a9b9cc',
        coast: ['rgba(255,255,255,0.15)', 'rgba(240,250,255,0.7)', 'rgba(70,100,140,0.6)'], wave: null, bg: '#1b3a63',
      };
    case 'toxic': {
      const lo = hslRgb(58 + (hue % 30), 0.5, 0.35), hi = hslRgb(75 + (hue % 30), 0.55, 0.55);
      return {
        sand: mix(hi, [230, 220, 160], 0.3), grassDry: hi, grassWet: mix(lo, hi, 0.5), forest: lo, savanna: mix(hi, [220, 200, 120], 0.3),
        hill: mix(lo, [120, 110, 80], 0.5), rock: [104, 96, 70], snow: [222, 218, 170],
        shallow: hslRgb(85 + (hue % 30), 0.55, 0.34), deep: hslRgb(100 + (hue % 30), 0.5, 0.17), foam: hslRgb(70 + (hue % 30), 0.6, 0.62), ice: [214, 220, 170],
        land: 0.52, iceCaps: 0, trees: 0.15, mountains: 0.5, snowCaps: false, leaf: hex(hslRgb(110 + (hue % 30), 0.55, 0.36)), rockTint: '#7a7050',
        coast: ['rgba(230,240,120,0.12)', 'rgba(220,235,120,0.45)', 'rgba(40,50,20,0.7)'], wave: 'rgba(230,240,150,0.35)', bg: hex(hslRgb(100 + (hue % 30), 0.5, 0.14)),
      };
    }
    default: {
      // Barren: dry rock with dark dust basins where seas would be.
      const h = 30 + (hue % 30);
      return {
        sand: hslRgb(h + 5, 0.18, 0.62), grassDry: hslRgb(h, 0.15, 0.55), grassWet: hslRgb(h, 0.13, 0.46), forest: hslRgb(h, 0.12, 0.38), savanna: hslRgb(h + 2, 0.16, 0.6),
        hill: hslRgb(h - 2, 0.12, 0.42), rock: hslRgb(h - 5, 0.1, 0.33), snow: hslRgb(h, 0.14, 0.68),
        shallow: hslRgb(h, 0.1, 0.3), deep: hslRgb(h, 0.12, 0.2), foam: hslRgb(h, 0.12, 0.4), ice: [232, 228, 220],
        land: 0.72, iceCaps: 0.35, trees: 0, mountains: 0.45, snowCaps: false, rockTint: hex(hslRgb(h - 5, 0.1, 0.45)),
        coast: ['rgba(0,0,0,0)', 'rgba(255,240,220,0.14)', 'rgba(30,24,20,0.5)'], wave: null, bg: hex(hslRgb(h, 0.12, 0.16)),
      };
    }
  }
}
