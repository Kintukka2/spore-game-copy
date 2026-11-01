// The calls of "A Seat on the Floor" (charter.ts), as Fallout-style conversations (talk.ts). Zix the Whisper,
// the broker from the exchange's back room, offers each step; Cinder, who runs the Syndicate, calls once to
// threaten you; the Chair of the Guild of Weights hands over the charter at the end.
import { RNG } from '../../../engine/rng';
import { generateCreature } from '../../../design/generate';
import type { Design } from '../../../design/types';
import { SPICE } from '../data';
import { acceptCharter, charterPending, finishCharter, STEPS } from '../charter';
import type { SpaceStage } from '../stage';
import { openTalk, type Line, type Mood, type Reply, type Speaker } from './talk';

interface Beat { say: string; reply?: string; mood?: Mood }
interface Offer { beats: Beat[]; ask: string; asks: { q: string; a: string }[]; yes: string; onYes: string; no: string; onNo: string }

const end = (say: string, reply = 'Over and out.', mood?: Mood): Line => ({ say, mood, replies: [{ tag: 'Leave', text: reply, leave: true }] });

function chain(beats: Beat[], last: Line): Line {
  let next = last;
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i], after = next;
    next = { say: b.say, mood: b.mood, replies: [{ text: b.reply ?? '...', go: () => after }] };
  }
  return next;
}

async function offer(sp: Speaker, o: Offer): Promise<boolean> {
  let yes = false;
  const ask = (say: string): Line => ({
    say,
    replies: [
      { tag: 'Accept', text: o.yes, go: () => { yes = true; return end(o.onYes); } },
      ...o.asks.map((a): Reply => ({ text: a.q, go: () => ask(a.a) })),
      { text: o.no, leave: true, go: () => end(o.onNo, 'Later.') },
    ],
  });
  await openTalk(sp, chain(o.beats, ask(o.ask)));
  return yes;
}

// ------------------------------------------------------------------ speakers
const faces: Record<string, Design> = {};
/** A face made from a fixed seed, recoloured, so each character always looks the same. */
function face(key: string, seed: number, colors: Partial<Design['colors']>): Design {
  if (!faces[key]) {
    const d = generateCreature(new RNG(seed), { level: 3, name: key });
    faces[key] = { ...d, colors: { ...d.colors, ...colors } };
  }
  return faces[key];
}

const zix = (st: SpaceStage): Speaker => ({
  name: 'Zix the Whisper', sub: 'Broker · Galactic Spice Exchange', design: face('zix', 0x2f1c, { base: '#8a6ad8', coat: '#3a2a66', detail: '#ffd166' }),
  color: '#b48cff', voice: { sfx: 'tap', pitch: 1.75 }, caps: () => st.w.s.money,
});
const cinder = (): Speaker => ({
  name: 'Cinder', sub: 'Cinder Syndicate · encrypted', design: face('cinder', 0xc1d3, { base: '#4a2a22', coat: '#1c1210', detail: '#ff6a3a' }),
  color: '#ff6a3a', voice: { sfx: 'tap', pitch: 0.8 }, noise: () => 0.18,
});
const chair = (): Speaker => ({
  name: 'The Chair', sub: 'Guild of Weights · Galactic Spice Exchange', design: face('chair', 0x9e1d, { base: '#e8d6a8', coat: '#5a4424', detail: '#ffd166' }),
  color: '#ffd166', voice: { sfx: 'tap', pitch: 1.05 },
});

// ------------------------------------------------------------------ the calls
function names(st: SpaceStage) {
  const w = st.w, s = w.s.charter!;
  const star = (k: string) => (s.tg[k] ? w.star(s.tg[k][0]).name : '');
  const planet = (k: string) => (s.tg[k]?.[1] !== undefined ? w.planet(s.tg[k][0], s.tg[k][1]).name : '');
  return { s, star, planet, A: SPICE[s.cA ?? 'red'].name, B: SPICE[s.cB ?? 'blue'].name };
}

const BRIEF: Record<string, (st: SpaceStage) => Promise<boolean>> = {
  assay: (st) => {
    const { star, A } = names(st);
    return offer(zix(st), {
      beats: [
        { say: 'Psst. Captain. Yes, you, with the nice ship. Zix has been watching your trades. Small trades. Honest trades. Very boring trades.', reply: 'Who is this?' },
        { say: 'Zix the Whisper. A broker. Zix sits in the back room of the Galactic Spice Exchange, where every spice price in the galaxy is made.', reply: 'We\'ve heard of it. They never let us in.' },
        { say: 'Nobody gets in. Not since the Crash. Someone flooded the wire with fake headlines, prices went mad, and the Guild of Weights locked the floor to every independent captain.', reply: 'So why call us?' },
      ],
      ask: `Because the Guild needs new blood, and Zix needs new clients. Earn a charter and you get a seat on the floor. First, the assay: bring ${4} ${A} to the Assay House at ${star('hall')}, and show the Guild you know real spice when you hold it.`,
      asks: [
        { q: 'What does a charter get us?', a: 'Contracts: paper spice that takes no hold space. Live charts. Jobs from the news. And Zix, in the back room, with tips. Fortunes are made on that floor. Also lost. Mostly made, if you listen to Zix.' },
        { q: `Where do we get ${A}?`, a: `Your colonies grow it, or any empire's 💱 Trade tab sells it. The Guild does not care where it came from. Only that it is real.` },
        { q: 'Who caused the Crash?', a: 'Zix has suspicions. Zix always has suspicions. Bring the sample first. Suspicions later.' },
      ],
      yes: 'We\'ll bring the sample.', onYes: 'Wonderful. Zix will tell the assayers to put the kettle on.',
      no: 'Not now.', onNo: 'Zix is patient. Press the 📈 button when you are ready, and Zix will pick up.',
    });
  },
  hoard: (st) => {
    const { star, B } = names(st);
    return offer(zix(st), {
      beats: [
        { say: 'The assayers are impressed! Well. They did not spit it out, which for assayers is the same thing.', mood: 'happy', reply: 'So we\'re in?' },
        { say: `Almost. The Guild has a problem, and Zix promised them you would solve it. Somebody is cornering ${B}: buying every crate, hiding it, and waiting for the price to climb.`, reply: 'Who?' },
      ],
      ask: `The Cinder Syndicate. Pirates with ledgers. Their hoard sits at ${star('hoard')}, in a fat barge with escorts. Break it, and the stolen ${B} floods back onto the market. The Guild will notice that.`,
      asks: [
        { q: 'The Cinder Syndicate?', a: 'Smugglers who learned arithmetic. The most dangerous kind of smuggler.' },
        { q: `What happens to ${B} prices?`, a: 'Down they go, the moment the cargo is loose. Every captain with a hold full of it will hate you a little. Every cook in the galaxy will love you.' },
      ],
      yes: 'We\'ll break the hoard.', onYes: `Zix knew it. Zix will buy a little ${B} now... no. Wait. Other way round. Sell. Zix will sell.`,
      no: 'Not yet.', onNo: 'Mend your hull. Pirates shoot back. Zix will call again.',
    });
  },
  ledger: (st) => {
    const { star, planet, B } = names(st);
    return offer(zix(st), {
      beats: [
        { say: `The hoard is broken! ${B} crashed on the wire ten minutes ago. Zix made a small fortune. A medium fortune. Thank you.`, mood: 'happy', reply: 'You traded on our mission?' },
        { say: 'Zix is a broker. It would be rude not to. But listen: in the wreck of that barge, the Guild\'s salvagers found a transmitter. The Syndicate was not only hoarding. It was broadcasting.', reply: 'Broadcasting what?' },
        { say: 'Headlines. Fake ones. Blights that never happened, ships that never sank. The Crash was them, Captain. The Rumour Mill.', reply: 'Then we shut it down.' },
      ],
      ask: `The transmitter points to ${planet('mill')}, in the ${star('mill')} system. The Syndicate's ledger is buried there: every rigged trade, every fake story, every buyer. Land, sweep with 📡 life scans and beam it up. With that ledger, the Guild can open its doors again.`,
      asks: [
        { q: 'Why does the Guild care so much?', a: 'A market only works while people believe the news. Since the Crash, nobody does. The Guild would rather lock the doors than run a casino.' },
        { q: 'Will the Syndicate come after us?', a: 'Probably. But they are bookkeepers first. Bookkeepers hate losing their books more than they hate captains.' },
      ],
      yes: 'We\'ll find the ledger.', onYes: 'Zix will keep the wire quiet. Well. Quieter.',
      no: 'Later.', onNo: 'Do not wait too long. Ledgers have a way of catching fire.',
    });
  },
  bell: async (st) => {
    const { star } = names(st);
    // Cinder finds out first.
    await openTalk(cinder(), chain([
      { say: 'Captain. You have something of mine. A little book, with a lot of numbers in it.', mood: 'angry', reply: 'The Guild is getting it.' },
      { say: 'Every number in that book is mine. Hand it over and I will forget your name. Keep it, and I will make sure the wire remembers it forever.', mood: 'angry', reply: 'The wire can say what it likes.' },
    ], end('Then enjoy your seat on the floor, while it lasts. Markets go up. Markets go down. So do captains.', '...', 'angry')));
    return offer(zix(st), {
      beats: [{ say: 'Was that Cinder? Zix heard Cinder. Zix\'s ears are still ringing.', reply: 'We still have the ledger.' }],
      ask: `Good. Then take it to the Guild Hall at ${star('hall')}. The Chair is waiting. Zix has already polished a seat for you. Well. Zix has looked at a seat, meaningfully.`,
      asks: [{ q: 'Who is the Chair?', a: 'The head of the Guild of Weights. Nobody has ever seen the Chair smile. Zix once saw the Chair nod. It was a very good day.' }],
      yes: 'On our way.', onYes: 'Zix will be there. In the back. Where Zix always is.',
      no: 'Not yet.', onNo: 'The Chair is patient. Zix is less patient. The seat is the least patient of all.',
    });
  },
};

async function debrief(st: SpaceStage) {
  await openTalk(chair(), chain([
    { say: 'Captain. I am the Chair of the Guild of Weights. I have read the ledger. All of it. Twice.', reply: 'And?' },
    { say: 'Eleven fake blights. Four invented wars. And one rumour about a very excited parrot that I will never forgive. The Crash was a lie, and you proved it.', reply: 'So the floor reopens?' },
    { say: 'It reopens today. For everyone. And the first seat goes to the captain who made it possible.', mood: 'happy', reply: 'We\'re honoured.' },
  ], end('Your charter, Captain. Welcome to the Galactic Spice Exchange. Mind the brokers. Especially the one in the back room.', 'Thank you, Chair.', 'happy')));
}

// ------------------------------------------------------------------ answering
let busy = false;

/** Answer Zix's waiting call. Resolves false if it was put off. */
export async function charterCall(st: SpaceStage): Promise<boolean> {
  const w = st.w;
  const pend = charterPending(w), s = w.s.charter;
  if (!pend || !s || busy) return true;
  busy = true;
  try {
    if (pend === 'signal') {
      const yes = await BRIEF[STEPS[s.step].id]?.(st);
      if (yes) acceptCharter(w);
      return !!yes;
    }
    await debrief(st);
    const items = finishCharter(w);
    if (items.length) w.hooks?.loot?.('🔔 A Seat on the Floor', items, '📈');
    st.ui.toast('The Galactic Spice Exchange is open to you: tap 📈 in the top bar.', '📈', 'gold');
    return true;
  } finally {
    busy = false;
    st.hud.refresh(true);
  }
}
