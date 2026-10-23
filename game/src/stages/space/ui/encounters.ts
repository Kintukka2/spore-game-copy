// Conversations with the strangers of random events: wandering traders, refugee fleets and stranded crews
// (or pirates pretending to be one). See talk.ts.
import { audio } from '../../../engine/audio';
import { RNG } from '../../../engine/rng';
import { generateCreature } from '../../../design/generate';
import { speciesName } from '../../../game/names';
import { addMod, relation, stanceInfo } from '../empires';
import { dismiss, resolve, traderDeals, welcomeRefugees } from '../events';
import type { Empire, GEvent } from '../types';
import type { SpaceStage } from '../stage';
import { money } from './common';
import { openTalk, talkNote, type Line, type Reply, type Speaker } from './talk';
import { LINES, merchant, openTrader } from './traderView';

const pickOf = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** A stranger's face, the same every time for the same seed. */
function stranger(seed: number) {
  const r = new RNG(seed >>> 0);
  const species = speciesName(r);
  return { species, design: generateCreature(new RNG((seed * 7 + 3) >>> 0), { level: 3, name: species }) };
}

const wallet = (st: SpaceStage): Pick<Speaker, 'caps'> => ({ caps: () => st.w.s.money });

/** Count the credits a step pays, and say so. */
function paid(st: SpaceStage, f: () => void) {
  const before = st.w.s.money;
  f();
  const d = st.w.s.money - before;
  if (d > 0) talkNote(`Reward: +${money(d)}`, 'good');
}

// ------------------------------------------------------------------ trader
/** Greet a wandering trader. Bartering opens their stall. */
export async function greetTrader(st: SpaceStage, ev: GEvent, onClose?: () => void) {
  const m = merchant(ev.seed ?? ev.id);
  const first = m.name.split(' ')[0];
  let barter = false;
  const hub = (say: string): Line => {
    const r: Reply[] = [
      { tag: 'Barter', text: 'Show me what you\'ve got.', go: () => { barter = true; } },
      { text: 'Who are you?', go: () => hub(`${m.name}, at your service. I go where the credits go, and lately the credits go everywhere.`) },
      { text: 'Where do you find all this stuff?', go: () => hub(pickOf(['Here and there. Mostly there. Don\'t ask about there.', 'Derelicts, auctions, the occasional very confused customer. All legal! Ish.', 'I have cousins in every port. Cousins with sticky fingers.'])) },
    ];
    if (traderDeals(st.w, ev).some((d) => d?.kind === 'crate')) r.push({ text: 'What\'s in the mystery crate?', go: () => hub('Even I don\'t know! That\'s the beauty of it. Could be a fortune. Could be packing peanuts. Probably not a live animal. Probably.') });
    r.push({ tag: 'Leave', text: 'Not today.', leave: true });
    return { say, replies: r };
  };
  audio.sfx('coin', { vol: 0.5 });
  const sp: Speaker = { name: m.name, sub: 'Wandering trader', design: m.design, color: '#ffb347', voice: { sfx: 'tap', pitch: 1.9 }, ...wallet(st) };
  let line = pickOf(LINES.greet).replace('{name}', first);
  // Bartering returns to the conversation, as in Fallout.
  for (;;) {
    barter = false;
    await openTalk(sp, hub(line));
    if (!barter || !st.w.s.events.includes(ev)) break;
    await openTrader(st, ev);
    if (!st.w.s.events.includes(ev)) break;
    line = pickOf(['Anything else, friend?', 'Back so soon? Wonderful.', 'Pleasure doing business. More business?']);
  }
  onClose?.();
}

// ------------------------------------------------------------------ refugees
/** A refugee fleet asks to settle on one of your worlds. */
export async function refugeeTalk(st: SpaceStage, ev: GEvent, onClose?: () => void) {
  const w = st.w;
  const s = stranger((ev.seed ?? ev.id) ^ 0x5eed);
  const pl = w.planet(ev.star, ev.planet);
  const home = new RNG(((ev.seed ?? ev.id) ^ 0x404) >>> 0);
  const lost = `${speciesName(home)} ${home.pick(['Prime', 'Major', 'IV', 'Minor', 'II'])}`;
  const end = (say: string, mood?: Line['mood']): Line => ({ say, mood, replies: [{ tag: 'Leave', text: 'Safe travels.', leave: true }] });
  const plea = (say: string): Line => ({
    say,
    replies: [
      { tag: 'Take them in', text: 'You\'ll have a home here.', go: () => {
        if (!w.s.events.includes(ev)) return end('Our fleet has already moved on.');
        talkNote(welcomeRefugees(w, ev), 'good');
        return end(`Thank you. Thank you. Our children will learn your name, and grow up on ${pl.name}.`, 'happy');
      } },
      { text: 'What can you offer us?', go: () => plea('Hands, minds, and a city\'s worth of stubbornness. We build fast when we have somewhere to stand.') },
      { text: 'Where are you from?', go: () => plea(`${lost}, once. Its sun swelled and its seas boiled away. We left with what we could carry.`) },
      { tag: 'Refuse', text: 'Find another world.', go: () => {
        dismiss(w, ev);
        return end('Then we drift on. May your skies stay kinder than ours.');
      } },
    ],
  });
  await openTalk({ name: `${s.species} Elder`, sub: 'Refugee fleet', design: s.design, color: '#6ec8ff', voice: { sfx: 'tap', pitch: 1.1 } },
    plea(`Please, hear us. Our world is gone, and our ships are falling apart. Let us settle on ${pl.name}. We will build, and we will repay you.`));
  onClose?.();
}

// ------------------------------------------------------------------ distress calls
/** You reached a distress beacon. A stranded crew asks for help, or pirates spring a trap. */
export async function distressTalk(st: SpaceStage, ev: GEvent, ambush: () => void) {
  const w = st.w;
  const pl = w.planet(ev.star, ev.planet);
  const s = stranger((ev.seed ?? ev.id) ^ 0xd15);
  const end = (say: string, mood?: Line['mood']): Line => ({ say, mood, replies: [{ tag: 'Leave', text: 'Fly safe.', leave: true }] });
  if (ev.trap) {
    let fight = true;
    const toll = 8000;
    await openTalk({ name: `"Captain" ${s.species}`, sub: 'Pirate', design: s.design, color: '#ff4a3a', voice: { sfx: 'tap', pitch: 0.9 }, ...wallet(st) }, {
      say: 'Help... please... our ship is... come closer... closer... HAH! The only thing in distress here is your cargo hold. Crew, decloak!',
      mood: 'angry',
      replies: [
        { tag: 'Fight', text: 'You picked the wrong ship.', leave: true },
        { tag: money(toll), text: 'How about we pay you to go away?', fail: w.s.money < toll, go: () => {
          if (w.s.money < toll) return { say: 'With what, your good looks? Get them, crew!', mood: 'angry', replies: [{ tag: 'Fight', text: 'Fine. The hard way.', leave: true }] };
          w.addMoney(-toll);
          fight = false;
          dismiss(w, ev);
          talkNote(`Paid the pirates ${money(toll)}.`, 'bad');
          return end('Pleasure doing business! Fly safe. Or don\'t. Your choice.');
        } },
      ],
    });
    if (fight) ambush();
    return;
  }
  const o = w.ownerOf(ev.star);
  const e: Empire | null = o && o !== 'player' && o !== 'hollow' ? w.emap.get(o) ?? null : null;
  const crew = e && !e.dead ? { name: `${e.species} Captain`, design: e.creature, color: e.color } : { name: `${s.species} Freighter Captain`, design: s.design, color: '#ffd166' };
  await openTalk({ name: crew.name, sub: e ? e.name : 'Stranded freighter', design: crew.design, color: crew.color, voice: { sfx: 'tap', pitch: 1.4 }, ...wallet(st),
    meter: e ? () => ({ v: relation(e), label: stanceInfo(e).label }) : undefined }, {
    say: `Mayday, mayday! Our drive core is dead and life support is failing. We have been drifting off ${pl.name} for days. Can you tow us out?`,
    replies: [
      { text: 'Hold tight. We\'ll get you moving.', go: () => {
        paid(st, () => resolve(w, ev));
        return end('Thank the stars! Take this, it is all we can spare. We will not forget you.', 'happy');
      } },
      { tag: 'Barter', text: 'A rescue like this isn\'t free.', go: () => {
        paid(st, () => { resolve(w, ev); w.addMoney(5000); });
        if (e) addMod(e, 'haggled', 'You haggled over our rescue', -6, { min: -12, decay: 0.5 });
        return end('Robbed by our own rescuers! ...Fine. Take it. Take all of it.', 'angry');
      } },
      { tag: 'Leave', text: 'You\'re on your own.', go: () => {
        dismiss(w, ev);
        if (e) addMod(e, 'abandoned', 'You left our crew to die', -8, { min: -16, decay: 0.5 });
        return end('...We will remember the ship that left us here.', 'angry');
      } },
    ],
  });
}
