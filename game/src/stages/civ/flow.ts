// Stage flow: the opening (City Hall + first vehicle editors), redesigns, the ending
// (spaceship editor + launch) and the final consequence card.
import { audio } from '../../engine/audio';
import { h, ui } from '../../engine/ui';
import { RNG } from '../../engine/rng';
import { openEditor } from '../../editor/editor';
import { generateBuilding, generateShip } from '../../design/generate';
import type { Design } from '../../design/types';
import type { CardColor } from '../../game/cards';
import { drawPreview } from './sprites';
import { MEDIUM_ICON, MEDIUM_NAME, PLAYER, ROLE_ICON, type Medium, type Method, type NationType } from './types';
import type { CivStage } from './stage';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A modal with a design preview: returns 'design' or 'suggested' (or 'later'). */
async function designModal(o: { title: string; text: string; design: Design; designLabel: string; suggestedLabel?: string; laterLabel?: string; medium?: string }): Promise<string> {
  const cv = h('canvas', { class: 'civ-intro-art' }) as HTMLCanvasElement;
  const body = h('div', null, cv, h('p', null, o.text));
  requestAnimationFrame(() => { try { drawPreview(cv, o.design, o.medium); } catch (e) { console.error(e); } });
  const buttons = [
    ...(o.laterLabel ? [{ id: 'later', label: o.laterLabel }] : []),
    { id: 'suggested', label: o.suggestedLabel ?? 'Use suggested design' },
    { id: 'design', label: o.designLabel, primary: true },
  ];
  return ui.modal({ title: o.title, body, buttons });
}

export function markDesigned(S: CivStage, key: string) {
  if (!S.designed.includes(key)) S.designed.push(key);
  if (S.designed.length >= 5) S.game.unlock('architect');
}

const ROLE_BLURB: Record<NationType, string> = {
  military: 'Your nation is MILITARY. Your vehicles fire shells and missiles to break turrets and seize cities.',
  religious: 'Your nation is RELIGIOUS. Your vehicles project your faith over rival cities to convert them.',
  economic: 'Your nation is ECONOMIC. Your vehicles run trade routes that let you buy rival cities outright.',
};

export async function runOpening(S: CivStage) {
  S.phase = 'intro';
  const st = S.game.state!;
  const home = S.cities.find((c) => c.home) ?? S.cities[0];
  S.focus(home.x, home.y + 30, 1.1);
  await wait(500);
  S.game.banner('Civilization', S.nations[PLAYER].name);
  await wait(1600);
  const r = new RNG(S.game.state!.seed ^ 0x77);
  // City Hall.
  if (!st.designs.cityhall) {
    const pal = S.playerPalette();
    const sug = generateBuilding(r, 'cityhall', { ...pal, pattern: 'none' });
    sug.name = `${home.name} Hall`.slice(0, 24);
    const choice = await designModal({
      title: '🏛️ A city is born',
      text: `Your tribe has grown into the city of ${home.name}. Every city needs a City Hall — design yours. Captured cities will adopt it too.`,
      design: sug, designLabel: '✏️ Design City Hall',
    });
    let hall = sug;
    if (choice === 'design') {
      const res = await openEditor(S.game, { design: sug, mode: 'free', doneLabel: 'Found city', background: 'city', hint: 'Stack floors in the Floors tab, then add roofs, walls and details.' });
      if (res) { hall = res.design; markDesigned(S, 'cityhall'); }
    }
    hall.meta = { ...(hall.meta ?? {}), btype: 'cityhall' };
    st.designs.cityhall = hall;
    S.art[PLAYER] = S.playerArt();
  }
  // First land vehicle.
  if (!S.designed.includes('vehicle-land')) {
    const sug = S.vehicleDesign(PLAYER, 'land', S.playerType);
    const choice = await designModal({
      title: `${ROLE_ICON[S.playerType]} Your first vehicle`,
      text: `${ROLE_BLURB[S.playerType]} Design the land vehicle your cities will build.`,
      design: sug, designLabel: '✏️ Design vehicle', medium: 'land',
    });
    if (choice === 'design') {
      const res = await openEditor(S.game, { design: sug, mode: 'free', doneLabel: 'Roll out', background: 'workshop', hint: 'Add wheels in Motion, then weapons or tools. Power, armour and speed come from the parts.' });
      if (res) {
        res.design.meta = { ...(res.design.meta ?? {}), role: S.playerType, medium: 'land' };
        st.designs['vehicle-land'] = res.design;
        markDesigned(S, 'vehicle-land');
      }
    }
  }
  S.art[PLAYER] = S.playerArt();
  S.sim.restat(PLAYER, 'land');
  if (!S.vehicles.some((v) => v.nation === PLAYER)) {
    S.sim.spawn(PLAYER, home, 'land');
    S.sim.spawn(PLAYER, home, 'land');
  }
  S.phase = 'play';
  S.hud.refreshAll();
  audio.sfx('levelup');
  S.toast(`${home.name} is founded! Spice geysers ⛲ make money — claim them fast.`, '🏙️', 'good', 4500);
  setTimeout(() => S.hint('start', 'Tap a vehicle to select it, then tap a spice geyser to build a derrick. Drag to pan, pinch to zoom.', '👆'), 1800);
}

/** Offer to design a newly unlocked vehicle medium (offers are shown one after another). */
let offerChain: Promise<void> = Promise.resolve();
export function offerVehicleDesign(S: CivStage, medium: Medium) {
  offerChain = offerChain.then(() => offerOne(S, medium)).catch((e) => console.error(e));
}

async function offerOne(S: CivStage, medium: Medium) {
  if (S.designed.includes('vehicle-' + medium)) return;
  await wait(1200);
  if (S.phase !== 'play') return;
  S.hold('offer-' + medium, true);
  const sug = S.vehicleDesign(PLAYER, medium, S.playerType);
  const choice = await designModal({
    title: `${MEDIUM_ICON[medium]} ${MEDIUM_NAME[medium]} vehicles unlocked`,
    text: medium === 'sea' ? 'Ships are built at coastal cities, claim ocean geysers and out-range turrets. Design one?' : 'Aircraft cross any terrain to reach cities on other continents. Design one?',
    design: sug, designLabel: '✏️ Design', suggestedLabel: 'Use suggested', medium,
  });
  S.hold('offer-' + medium, false);
  if (choice === 'design') await editVehicle(S, medium, S.playerType);
}

export async function editVehicle(S: CivStage, medium: Medium, role: NationType) {
  const st = S.game.state!;
  const key = role === S.playerType ? 'vehicle-' + medium : `vehicle-${medium}-${role}`;
  const cur = S.vehicleDesign(PLAYER, medium, role);
  S.hold('editor', true);
  const res = await openEditor(S.game, { design: cur, mode: 'free', doneLabel: 'Save', background: 'workshop', hint: `${MEDIUM_NAME[medium]} ${role} vehicle: parts set power, armour and speed.` });
  S.hold('editor', false);
  if (!res) return;
  res.design.meta = { ...(res.design.meta ?? {}), role, medium };
  st.designs[key] = res.design;
  markDesigned(S, key);
  S.art[PLAYER] = S.playerArt();
  S.sim.restat(PLAYER, medium);
  S.toast(`Every ${MEDIUM_NAME[medium].toLowerCase()} ${role} vehicle now uses “${res.design.name}”.`, MEDIUM_ICON[medium], 'good');
  S.hud.dirty = true;
}

export async function editBuilding(S: CivStage, key: 'cityhall' | 'house' | 'factory' | 'entertainment') {
  const st = S.game.state!;
  const art = S.art[PLAYER];
  const cur = st.designs[key] ?? (key === 'cityhall' ? art.hall : key === 'house' ? art.house : key === 'factory' ? art.factory : art.fun);
  const res = await openEditor(S.game, { design: cur, mode: 'free', doneLabel: 'Save', background: 'city' });
  if (!res) return;
  res.design.meta = { ...(res.design.meta ?? {}), btype: key };
  st.designs[key] = res.design;
  markDesigned(S, key);
  S.art[PLAYER] = S.playerArt();
  S.toast('Your cities have been restyled.', '🏛️', 'good');
  const c = S.hud.buildCity !== null ? S.cities[S.hud.buildCity] : null;
  if (c && c.owner === PLAYER) S.hud.openPlanner(c);
}

// ------------------------------------------------------------------ ending
export async function runEnding(S: CivStage) {
  const st = S.game.state!;
  S.phase = 'ending';
  S.hud.closeSheet();
  S.hud.dirty = true;
  audio.music('victory');
  S.music = 'victory';
  const home = S.cities.find((c) => c.home) ?? S.cities[0];
  await wait(900);
  S.game.banner('The world is united', st.planetName);
  S.focus(home.x, home.y + 20, 0.9);
  await wait(2800);
  const r = new RNG(st.seed ^ 0x5417);
  let ship = st.designs.ship ?? generateShip(r, S.playerPalette(), `${st.speciesName} Ark`.slice(0, 24));
  const choice = await designModal({
    title: '🚀 Reach for the stars',
    text: `Every city on ${st.planetName} flies your flag. Build the spaceship that will carry the ${st.speciesName} into the galaxy.`,
    design: ship, designLabel: '✏️ Design spaceship', suggestedLabel: 'Use suggested',
  });
  if (choice === 'design') {
    const res = await openEditor(S.game, { design: ship, mode: 'free', doneLabel: 'Launch', background: 'space', allowCancel: true, hint: 'Engines, wings and weapons. This ship will be yours for the whole Space stage.' });
    if (res) { ship = res.design; markDesigned(S, 'ship'); }
  }
  st.designs.ship = ship;
  S.focus(home.x, home.y - 30, 1.2);
  S.phase = 'launch';
  S.launchT = 0;
  for (let i = 0; i < 3; i++) setTimeout(() => audio.sfx('tap', { pitch: 1.6 }), i * 1000);
  setTimeout(() => { audio.sfx('warp'); audio.sfx('explode', { pitch: 0.5, vol: 0.7 }); }, 3000);
}

export function cardFor(S: CivStage): { method: Method; color: CardColor } {
  const c = S.captures;
  const order: Method[] = ['convert', 'buy', 'military'];
  const pref = S.methodForPlayer();
  let best: Method = pref;
  for (const m of order) if (c[m] > c[best]) best = m;
  return { method: best, color: best === 'convert' ? 'green' : best === 'buy' ? 'blue' : 'red' };
}

export function finishStage(S: CivStage) {
  const game = S.game;
  const st = game.state!;
  const c = S.captures;
  const { color } = cardFor(S);
  const total = c.convert + c.buy + c.military;
  if (total > 0 && c.military === 0) game.unlock('peacemaker');
  if (c.military > 0 && c.convert === 0 && c.buy === 0) game.unlock('iron-fist');
  if (S.designed.length >= 5) game.unlock('architect');
  game.history(`Launched the first spaceship from ${st.planetName}`, '🚀');
  const mm = Math.floor(S.time / 60), ss = Math.floor(S.time % 60);
  const summary = [
    `United ${st.planetName} in ${mm}:${String(ss).padStart(2, '0')}`,
    `${c.convert} converted · ${c.buy} bought · ${c.military} conquered`,
    `${S.stats.derricks} derricks built · ${S.stats.built} vehicles built`,
  ];
  if (S.stats.superweapon) summary.push('Ended it with a superweapon');
  game.completeStage(color, summary);
}
