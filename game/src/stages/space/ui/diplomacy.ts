// Talking to empires: first contact, hails, tribute demands and system sales, all as conversations
// (see talk.ts). Each archetype has its own voice.
import { audio } from '../../../engine/audio';
import { article, clamp } from '../../../engine/math';
import { ARCHETYPES } from '../../../game/cards';
import { PERSONALITY, SPICE, type AiArch } from '../data';
import type { Empire } from '../types';
import {
  addMod, annexSystem, archName, breakAlliance, canAlly, canRoute, contactReply, declareWar, formAlliance, gift, makePeace,
  openRoute, payTribute, peacePrice, relation, stanceInfo, strength,
} from '../empires';
import { acceptOffer, declineOffer, offerFor } from '../missions';
import { EVENT_INFO } from '../events';
import type { SpaceStage } from '../stage';
import { fmtTime, money } from './common';
import { openTalk, talkNote, type Line, type Reply, type Speaker } from './talk';

interface Voice {
  /** Reactions to the first-contact replies. */
  peace: string; boast: string; threat: string;
  /** {species}, {n} worlds, {goods}. */
  about: string;
  hello: { ally: string; warm: string; cool: string; cold: string; war: string };
  bye: string;
  gift: string;
  work: string;
  war: string;
  ally: string;
  /** {amount}. */
  tribute: string;
}

const VOICES: Record<AiArch, Voice> = {
  mystic: {
    peace: 'Peace is the shape the stars prefer. Walk with us a while.',
    boast: 'Might is a candle. The dark outlasts it. Still, your flame is bright.',
    threat: 'The stars heard that. They are less fond of you now.',
    about: 'We are the {species}. We read the sky the way you read maps, across {n}. Every star is a sentence, and lately most of them are about you.',
    hello: { ally: 'The stars sing your name today, ally. Speak.', warm: 'Ah, the wanderer returns, as foretold. Mostly foretold.', cool: 'The omens were unclear about you. Speak, and clear them.', cold: 'Your shadow falls long across our charts. Be brief.', war: 'The stars have turned their faces from you. Why do you call?' },
    bye: 'Go where the light leans.',
    gift: 'A generous orbit. The stars will remember it. So will we.',
    work: 'The heavens have a task, and you are in the omen.',
    war: 'So be it. We saw this in the embers long ago.',
    ally: 'It was always written. Our light is your light.',
    tribute: 'The omens demand an offering, wanderer. {amount}, or the stars turn their backs on you.',
  },
  merchant: {
    peace: 'Peace! Peace is excellent for business. Let us be excellent together.',
    boast: 'Big guns! Big ships! Big spenders too, I hope?',
    threat: 'Threats are bad for business. I will write that down. In red ink.',
    about: 'We are the {species}: {n}, one ledger. We deal in {goods}, and we have never once paid full price for anything.',
    hello: { ally: 'Partner! My very favourite partner! What are we buying today?', warm: 'My favourite customer! Come in, come in.', cool: 'A customer. Possibly. Let us see your credits first.', cold: 'You again. Your credit rating with us is... poor.', war: 'We are at war, which is terrible for business. What do you want?' },
    bye: 'Come back soon. Bring money.',
    gift: 'Free money! The very best kind of money.',
    work: 'There is profit in this for both of us. Mostly for us.',
    war: 'War? Do you know what war does to margins? You will pay for this. Literally.',
    ally: 'Partners! I will have the contracts drawn up. The fine print is very fine.',
    tribute: 'Your ships use our lanes for free, friend. Nothing is free. {amount}, settled now, or we settle it another way.',
  },
  warlord: {
    peace: 'Peace? Soft words from a soft shell. We will see if they last.',
    boast: 'Ha! Teeth after all! We respect a creature that bites.',
    threat: 'Out of YOUR way? Bold. Foolish, but bold.',
    about: 'We are the {species}. {n}, taken by claw and held by claw. Every world we hold, we earned.',
    hello: { ally: 'Shield-kin! Who do we crush today?', warm: 'You have proven sturdy. Speak, and be quick about it.', cool: 'State your business, stranger, before I lose interest.', cold: 'You have nerve, hailing us. Speak, while you still have a tongue.', war: 'Come to beg? Or to die?' },
    bye: 'Go. Keep your shell hard.',
    gift: 'Tribute! Good. You learn fast.',
    work: 'Our claws are busy. Yours are idle. Fix that.',
    war: 'FINALLY. My fleets were getting bored.',
    ally: 'Then we hunt together. Betray us and we hunt you.',
    tribute: 'Your ships crawl through our stars like lice. Pay {amount} in tribute, or we pick you off one by one.',
  },
  envoy: {
    peace: 'Splendid. Our charters thank you, and so do we.',
    boast: 'Impressive. Our records will note your... enthusiasm.',
    threat: 'Noted, in triplicate. Please reconsider your tone.',
    about: 'We are the {species}, a union of {n} under one charter. We believe every quarrel has a treaty hiding inside it.',
    hello: { ally: 'Our honoured ally! The council sends its warmest regards.', warm: 'Welcome back, friend. The council is pleased to hear from you.', cool: 'Greetings. Please state the purpose of your call, for the record.', cold: 'The council has concerns about you. Speak carefully.', war: 'A formal channel remains open, even now. What do you propose?' },
    bye: 'Safe passage, traveller. The charter goes with you.',
    gift: 'How generous. It will be entered into the record.',
    work: 'The council has drafted a request. It is very official.',
    war: 'The council regrets this. The council will also win.',
    ally: 'Then let it be ratified! A great day for the charter.',
    tribute: 'Under article nine of our charter, travellers owe a transit levy. {amount}, payable now. Refusal will be... recorded.',
  },
  scholar: {
    peace: 'Peace! Excellent. Peaceful subjects are so much easier to study.',
    boast: 'Mighty, you say? I would like to measure that. With instruments.',
    threat: 'Hostility. How primitive. How fascinating. How rude.',
    about: 'We are the {species}, keepers of knowledge across {n}. Some of our libraries are bigger than your planets.',
    hello: { ally: 'My favourite specimen! I mean, ally. Ally.', warm: 'Ah, our friend the field researcher! What have you found?', cool: 'Yes, yes, hello. Is this about a grant?', cold: 'Your file is getting thick, and not in a good way.', war: 'Your war has ruined three of my experiments. Speak.' },
    bye: 'Go forth and observe. Take notes!',
    gift: 'Funding! Real funding! Oh, the papers we will write.',
    work: 'We need data. You have a ship. I see a perfect synergy.',
    war: 'Very well. We will study how you lose.',
    ally: 'A joint venture! Co-authors, at last.',
    tribute: 'You have been taking readings in our space without a licence. {amount} for the paperwork. Or we revoke you. Permanently.',
  },
  prophet: {
    peace: 'Peace is the gift of the Radiance. Accept it now. Kneel later.',
    boast: 'Your might is a candle before the Radiance. Still, it flickers nicely.',
    threat: 'Blasphemy! The Radiance will remember your words.',
    about: 'We are the {species}, chosen of the Radiance. {n} have seen the light. The rest will.',
    hello: { ally: 'Blessed ally! The Radiance smiles upon you.', warm: 'The Radiance has softened toward you. Speak, pilgrim.', cool: 'Unbeliever. Speak your piece.', cold: 'Heretic. Your words had better be worth the breath.', war: 'The Radiance burns for you, heretic. Repent, or speak your last.' },
    bye: 'Walk in the light, while it still allows you.',
    gift: 'An offering! The Radiance accepts. Grudgingly.',
    work: 'The Radiance requires a deed of faith.',
    war: 'A holy war! The faithful rejoice!',
    ally: 'Then you walk in the light beside us. Do not stray.',
    tribute: 'The Radiance demands a tithe from all who cross its light. {amount}, or be cast into shadow.',
  },
  gardener: {
    peace: 'Peace! Lovely. Things grow best in peace.',
    boast: 'Strong roots! Just remember, even the strongest tree needs rain.',
    threat: 'What a thorny thing to say.',
    about: 'We are the {species}. We tend {n} like orchards. No world is too barren for a little patience.',
    hello: { ally: 'Our dear ally! The orchards bloom for you.', warm: 'Hello, friend! Brought any seeds this time?', cool: 'Oh. Hello. Mind the flowerbeds.', cold: 'You trample everything you touch. What do you want?', war: 'You burn what we plant. Why should we listen?' },
    bye: 'Grow well, traveller.',
    gift: 'Oh, how kind! We will plant something in your honour.',
    work: 'The gardens need a helping hand. Yours will do.',
    war: 'Then we will prune you back. Hard.',
    ally: 'Our roots will grow together. How wonderful.',
    tribute: 'You have been tramping through our gardens. {amount} for the damage, please. Or we let the weeds have you.',
  },
  minstrel: {
    peace: 'Peace! That rhymes with... nothing good. We will write around it.',
    boast: 'Behold your might! Ooh, that is a chorus.',
    threat: 'Out of your way? That is a terrible lyric. Booo.',
    about: 'We are the {species}, and we sing across {n}. Every world has a verse. Yours is still being written.',
    hello: { ally: 'Our duet partner! Shall we take it from the top?', warm: 'Our favourite muse! What adventure do you bring?', cool: 'A new listener. Hmm. Let us hear your voice.', cold: 'You are off-key, stranger. Way off.', war: 'This war is a dirge. What do you want?' },
    bye: 'Until the next verse!',
    gift: 'A gift! We will write a ballad about it. A short one.',
    work: 'We need a hero for the next verse. Audition now!',
    war: 'A war song, then. We know many. You will not like any of them.',
    ally: 'A duet! The galaxy will sing of this.',
    tribute: 'You have been humming our tunes without paying, friend. {amount} in royalties, or the next song is about your downfall.',
  },
};

const HOLLOW = {
  hello: 'WARM THING. STATE PURPOSE.',
  ally: 'Ally-unit. State purpose.',
  about: 'We were flesh once, like you. It ached. We stopped. The light at the Core will finish what we began.',
  gift: 'Resources logged. Sentiment: irrelevant. Relation adjusted.',
  work: 'Task available. Compliance will be noted.',
  ally2: 'Integration accepted. You are one of us now. In part.',
  war: 'Expected outcome.',
  bye: 'Disconnect.',
};

const AGAIN = ['Anything else?', 'What else?', 'Go on.', 'And?'];
const pickOf = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function fill(s: string, e: Empire, w: SpaceStage['w'], extra: Record<string, string> = {}): string {
  const n = w.countStars(e.id);
  const goods = e.produces.length ? e.produces.map((c) => SPICE[c].name).join(' and ') + ' spice' : 'whatever sells';
  let out = s.replace('{species}', e.species).replace('{n}', `${n} ${n === 1 ? 'world' : 'worlds'}`).replace('{goods}', goods);
  for (const [k, v] of Object.entries(extra)) out = out.replace(`{${k}}`, v);
  return out;
}

function speaker(st: SpaceStage, e: Empire): Speaker {
  const w = st.w;
  const hollow = e.arch === 'hollow';
  return {
    name: e.name,
    sub: e.arch === 'hollow' ? 'Machine' : `${ARCHETYPES[e.arch].icon} ${archName(e)} · ${'★'.repeat(strength(w, e))}`,
    design: e.creature,
    color: hollow ? '#ff3b4a' : e.color,
    scheme: hollow ? 'green' : 'amber',
    voice: hollow ? { sfx: 'click', pitch: 0.45 } : { sfx: 'tap', pitch: 1.2 + (e.seed % 9) / 10 },
    meter: () => ({ v: relation(e), label: stanceInfo(e).label }),
    caps: () => w.s.money,
  };
}

/** The opening line of a hail, by how they feel about you. */
function hello(e: Empire): string {
  if (e.arch === 'hollow') return e.allied ? HOLLOW.ally : HOLLOW.hello;
  const v = VOICES[e.arch].hello;
  const s = stanceInfo(e).id;
  return s === 'war' ? v.war : s === 'allied' ? v.ally : s === 'friendly' ? v.warm : s === 'neutral' ? v.cool : v.cold;
}

/** The whole conversation tree for one empire. */
function tree(st: SpaceStage, e: Empire) {
  const w = st.w;
  const hollow = e.arch === 'hollow';
  const voice = e.arch === 'hollow' ? null : VOICES[e.arch];
  const inTheirSystem = () => w.ownerOf(w.s.loc) === e.id;
  const leave = (): Reply => ({ tag: 'Leave', text: hollow ? 'End transmission.' : 'Farewell.', leave: true });

  const hub = (say: string, mood?: Line['mood']): Line => {
    const r: Reply[] = [];
    if (e.war && !hollow) {
      const price = peacePrice(w, e);
      r.push({ tag: money(price), text: 'We offer peace, and payment for your trouble.', fail: w.s.money < price, go: () => {
        if (!makePeace(w, e)) return hub(`Words are cheap. Peace is not. Come back with ${money(price)}.`, 'angry');
        st.sv.refreshHostility();
        audio.sfx('success');
        talkNote(`Peace with ${e.name}.`, 'good');
        return hub('...Very well. The guns go quiet. For now.');
      } });
    }
    if (!e.war || hollow) r.push({ text: 'Do you have any work for us?', go: work });
    if (!e.war) r.push({ text: 'Let\'s talk diplomacy.', go: () => talks('We are listening.') });
    if (inTheirSystem() && w.has('beacon')) {
      const wait = e.lastBeacon ? Math.ceil(60 - (w.s.t - e.lastBeacon)) : 0;
      r.push({ tag: wait > 0 ? `Goodwill Beacon ${wait}s` : 'Goodwill Beacon', text: 'Look at the sky!', fail: wait > 0, go: beacon });
    }
    if (inTheirSystem() && w.count('embassy') > 0 && !e.mods.some((m) => m.id === 'embassy')) {
      r.push({ tag: `Embassy ×${w.count('embassy')}`, text: 'We would like to open an embassy here.', go: embassy });
    }
    r.push({ text: 'I have some questions.', go: () => questions('Ask.') });
    if (!e.war) r.push({ tag: 'War', text: hollow ? 'We will end you, machine.' : 'Your time is up.', go: warAsk });
    r.push(leave());
    return { say, mood, replies: r };
  };

  const again = () => hub(pickOf(AGAIN));

  // ---------------------------------------------------------------- missions
  const work = (): Line => {
    const m = offerFor(w, e);
    const intro = hollow ? HOLLOW.work : voice!.work;
    return {
      say: `${intro} ${m.title}. ${m.desc} We pay ${money(m.reward)}${m.deadline ? `, if it is done within ${fmtTime(m.deadline)}` : ''}.`,
      replies: [
        { tag: 'Accept', text: 'Consider it done.', go: () => {
          const err = acceptOffer(w, e);
          if (err) { talkNote(err, 'bad'); return hub('Your hands are full already. Come back when they are free.'); }
          talkNote(`Mission accepted: ${m.title}`, 'good');
          return hub(hollow ? 'Compliance noted.' : 'Good. Do not disappoint us.', 'happy');
        } },
        { text: 'Let me think about it.', leave: true, go: () => hub('The offer stands. For now.') },
        { tag: 'Refuse', text: 'Find someone else.', go: () => { declineOffer(w, e); return hub(hollow ? 'Refusal logged.' : 'Hmph. We will.'); } },
      ],
    };
  };

  // ---------------------------------------------------------------- diplomacy
  const talks = (say: string, mood?: Line['mood']): Line => {
    const r: Reply[] = [{ text: 'We bring a gift.', go: gifts }];
    if (!hollow && e.route === null) {
      const err = canRoute(w, e);
      r.push({ tag: 'Relation 30', text: 'Let\'s open a trade route.', fail: !!err, go: () => {
        const why = canRoute(w, e);
        if (why) return talks(relation(e) < 30 ? 'Trade with strangers? Earn our trust first.' : why.includes('3 trade') ? 'Your merchants are stretched thin already. Three routes is all you can run.' : why, 'angry');
        const target = inTheirSystem() ? w.s.loc : w.starsOf(e.id).sort((a, b) => w.gal.dist(a, w.s.loc) - w.gal.dist(b, w.s.loc))[0];
        if (target === undefined) return talks('We have no port left to trade from.');
        openRoute(w, e, target);
        audio.sfx('success');
        talkNote(`Trade route open with ${w.star(target).name}: it pays you and fills that system's takeover bar.`, 'good');
        return talks(`Done. Our freighters will run to ${w.star(target).name}. Everyone profits.`, 'happy');
      } });
    }
    if (e.allied) r.push({ tag: 'Betray', text: 'Our alliance ends today.', go: () => ({
      say: hollow ? 'Disconnection from the collective is... noted. Confirm.' : 'You would break your oath to us?',
      mood: 'angry',
      replies: [
        { tag: 'Betray', text: 'It\'s over.', go: () => {
          breakAlliance(w, e, true);
          st.sv.refreshHostility();
          return hub(hollow ? 'Severed.' : 'Then go, oath-breaker. We will not forget this.', 'angry');
        } },
        { text: 'No. Forget I said that.', leave: true, go: () => talks('...We will pretend we did not hear it.') },
      ],
    }) });
    else if (!e.war) {
      const err = canAlly(w, e);
      r.push({ tag: 'Relation 70', text: hollow ? 'Join with us.' : 'Stand with us as allies.', fail: !!err, go: () => {
        if (canAlly(w, e)) return talks(hollow ? 'Insufficient trust. Continue to comply.' : 'Allies? We barely know you. Prove yourself first.', 'angry');
        if (hollow) return {
          say: 'Integration is permanent in the eyes of the warm ones. Every other empire will turn on you. Confirm.',
          replies: [
            { tag: 'Ally', text: 'Do it.', go: ally },
            { text: 'No. Not yet.', leave: true, go: () => talks('Hesitation logged.') },
          ],
        };
        return ally();
      } });
    }
    r.push({ text: 'Never mind.', leave: true, go: again });
    return { say, mood, replies: r };
  };

  const ally = (): Line => {
    formAlliance(w, e);
    audio.sfx('levelup');
    if (st.mode === 'system') st.sv.combat.spawnAlly(e.ship, e.id, 260 * strength(w, e), st.sv.combat.crafts.filter((c) => c.kind === 'ally').length);
    st.sv.refreshHostility();
    talkNote(`${e.name} are now your allies! Their ships will escort you.`, 'good');
    return hub(hollow ? HOLLOW.ally2 : voice!.ally, 'happy');
  };

  const gifts = (): Line => ({
    say: hollow ? 'Specify offering.' : 'A gift? We are listening.',
    replies: [
      ...([[10000, 'A token of friendship.'], [50000, 'A generous gift.'], [250000, 'A fortune, for your friendship.']] as [number, string][]).map(([amt, text]): Reply => ({
        tag: money(amt), text, fail: w.s.money < amt, go: () => {
          if (w.s.money < amt) return { ...gifts(), say: 'Your purse cannot cover that, stranger.' };
          const d = gift(w, e, amt);
          return talks(d > 0 ? (hollow ? HOLLOW.gift : voice!.gift) : 'We thank you, but we have had enough gifts for now.', d > 0 ? 'happy' : undefined);
        },
      })),
      { text: 'Never mind.', leave: true, go: () => talks('...Then why bring it up?') },
    ],
  });

  const beacon = (): Line => {
    if (e.lastBeacon && w.s.t - e.lastBeacon < 60) return hub(`The sky is still full of your last show. Wait ${Math.ceil(60 - (w.s.t - e.lastBeacon))} seconds.`);
    e.lastBeacon = w.s.t;
    addMod(e, 'beacon', 'You dazzled us', hollow ? 6 : 12, { max: hollow ? 30 : 50, decay: 0.3 });
    audio.sfx('charm');
    const p = st.sv.combat.player;
    for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2; st.fx.spawn(p.x, p.y, Math.cos(a) * 260, Math.sin(a) * 260, 1, 4, ['#ffd166', '#ff7ab8', '#5cc8ff', '#4cd97b'][i % 4], 1, 1.5); }
    return hub(hollow ? 'Light pattern... pleasing. Logging.' : 'Oh! The lights! The colours! Do it again!', 'happy');
  };

  const embassy = (): Line => {
    if (!w.use('embassy')) return hub('You have nothing to build it with.');
    addMod(e, 'embassy', 'Your embassy', hollow ? 10 : 35);
    audio.sfx('build');
    talkNote(`Embassy built with ${e.name}.`, 'good');
    return hub(hollow ? 'Embassy installed. Monitoring enabled.' : 'An embassy! Our doors are open to you now.', 'happy');
  };

  // ---------------------------------------------------------------- questions
  const questions = (say: string): Line => {
    const r: Reply[] = [
      { text: hollow ? 'What are you?' : 'Tell me about your people.', go: () => questions(hollow ? HOLLOW.about : fill(voice!.about, e, w)) },
      { text: 'How do you feel about us?', go: () => questions(feelings()) },
    ];
    if (!hollow && !e.war) r.push({ text: 'Heard any rumours?', go: () => questions(rumour()) });
    r.push({ text: 'That\'s all.', leave: true, go: again });
    return { say, replies: r };
  };

  const feelings = (): string => {
    const mods = e.mods.filter((m) => Math.round(m.v) !== 0);
    for (const m of [...mods].sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4)) talkNote(`${m.v > 0 ? '+' : ''}${Math.round(m.v)} ${m.label}`, m.v > 0 ? 'good' : 'bad');
    const pos = mods.filter((m) => m.v > 0).sort((a, b) => b.v - a.v)[0];
    const neg = mods.filter((m) => m.v < 0).sort((a, b) => a.v - b.v)[0];
    if (hollow) return `Assessment: ${stanceInfo(e).label.toLowerCase()}. ${pos ? `Positive factor: ${lc(pos.label)}. ` : ''}${neg ? `Negative factor: ${lc(neg.label)}.` : ''}`;
    if (!pos && !neg) return 'We hardly know you yet.';
    return [pos ? `${pos.label}. That counts for something.` : '', neg ? `But ${lc(neg.label)}. We have not forgotten.` : ''].filter(Boolean).join(' ');
  };

  const rumour = (): string => {
    const evs = w.s.events.filter((ev) => !ev.empire || ev.empire !== e.id).sort((a, b) => w.gal.dist(a.star, e.home) - w.gal.dist(b.star, e.home));
    const ev = evs[0];
    if (ev) {
      const info = EVENT_INFO[ev.kind];
      return `Our pilots talk of ${article(info.label)} ${lc(info.label)} at ${w.planet(ev.star, ev.planet).name}, in the ${w.star(ev.star).name} system. ${info.good ? 'Could be worth a look.' : 'They could use a hand.'}`;
    }
    for (const sid of [e.home, ...w.gal.within(e.home, 300)]) {
      for (const pl of w.gal.planets(sid)) {
        if (pl.life && !w.peekPS(sid, pl.idx).scanned) return `They say there is life on ${pl.name}, in the ${w.star(sid).name} system, that nobody has catalogued. Scholars pay for that sort of thing.`;
      }
    }
    return 'Quiet lanes lately. Suspiciously quiet.';
  };

  // ---------------------------------------------------------------- war
  const warAsk = (): Line => ({
    say: hollow ? 'Clarify. Hostility?' : 'Is that a threat?',
    mood: 'angry',
    replies: [
      { tag: 'Declare war', text: hollow ? 'Yes.' : 'It\'s a promise.', go: () => {
        declareWar(w, e);
        w.counter('wars');
        audio.sfx('alarm');
        st.sv.refreshHostility();
        talkNote(`War with ${e.name}! They will attack your colonies and defend their space.`, 'bad');
        return { say: hollow ? HOLLOW.war : voice!.war, mood: 'angry', replies: [{ tag: 'Leave', text: 'We\'ll see.', leave: true }] };
      } },
      { text: 'No. Just a bad joke.', leave: true, go: () => hub(hollow ? 'Humour: not detected.' : 'Hmph. Watch your words.', 'angry') },
    ],
  });

  return { hub, voice };
}

// ------------------------------------------------------------------ entry points
/** Hail an empire. */
export function hailTalk(st: SpaceStage, e: Empire): Promise<void> {
  audio.sfx('zap', { pitch: 0.7, vol: 0.6 });
  return openTalk(speaker(st, e), tree(st, e).hub(hello(e), e.war ? 'angry' : undefined));
}

/** The first time you meet an empire. */
export async function firstContactTalk(st: SpaceStage, e: Empire): Promise<void> {
  const w = st.w;
  audio.sfx('bell');
  if (e.arch === 'hollow') {
    const end = (say: string): Line => ({ say, replies: [{ tag: 'Leave', text: 'End transmission.', leave: true }] });
    await openTalk(speaker(st, e), {
      say: 'We are the Hollow. Flesh is a fever that passes. Turn back, warm thing. The light at the centre is not for you.',
      mood: 'angry',
      replies: [
        { text: 'We seek the Core.', go: () => end('Then you seek an ending. Go on, if you must. We will be waiting.') },
        { text: 'We come in peace.', go: () => { addMod(e, 'greet', 'You were polite', 5, { max: 5 }); return end('Peace is a word for the unfinished. Noted.'); } },
      ],
    });
    st.ui.toast('Contact with the Hollow made. The road to the Core is open.', '🤖', 'gold');
    return;
  }
  const { hub, voice } = tree(st, e);
  const answer = (choice: 'peace' | 'boast' | 'threat') => () => {
    contactReply(w, e, choice);
    const mood = choice === 'threat' || (choice === 'boast' && e.arch !== 'warlord' && e.arch !== 'merchant' && e.arch !== 'minstrel') ? undefined : 'happy';
    return hub(voice![choice], choice === 'threat' ? 'angry' : mood);
  };
  await openTalk(speaker(st, e), {
    say: PERSONALITY[e.arch].greeting,
    replies: [
      { text: 'We come in peace.', go: answer('peace') },
      { tag: 'Intimidate', text: 'Behold our might!', go: answer('boast') },
      { text: 'Stay out of our way.', go: answer('threat') },
    ],
  });
  st.game.hint('diplomacy', 'Hail empires from the 👽 button to gift, trade, ask for missions or form alliances.', '👽');
}

/** An empire demands payment for your ships crossing their space. */
export async function tributeTalk(st: SpaceStage, e: Empire, amount: number): Promise<void> {
  const w = st.w;
  audio.sfx('alarm');
  const voice = e.arch === 'hollow' ? VOICES.warlord : VOICES[e.arch];
  const end = (say: string, mood?: Line['mood']): Line => ({ say, mood, replies: [{ tag: 'Leave', text: 'Understood.', leave: true }] });
  const refuse = (extra = ''): Line => {
    payTribute(w, e, amount, false);
    if (e.war) { talkNote(`${e.name} declared war on you!`, 'bad'); return end(`${extra}Then it is WAR!`, 'angry'); }
    return end(`${extra}We will remember this insult.`, 'angry');
  };
  // A bluff works better the bigger you are next to them.
  const odds = clamp(Math.round((0.5 + (w.countStars('player') - w.countStars(e.id)) * 0.06 - (e.arch === 'warlord' ? 0.15 : 0)) * 20) / 20, 0.1, 0.85);
  const demand = (): Line => ({
    say: fill(voice.tribute, e, w, { amount: money(amount) }),
    mood: 'angry',
    replies: [
      { tag: money(amount), text: 'Fine. Take it.', fail: w.s.money < amount, go: () => {
        if (w.s.money < amount) return { ...demand(), say: 'Your purse is lighter than your pride. Pay, or refuse.' };
        payTribute(w, e, amount, true);
        talkNote(`Paid ${money(amount)} in tribute.`);
        return end('Wise. Your ships may pass.');
      } },
      { tag: `Bluff ${Math.round(odds * 100)}%`, text: 'Our fleet is right behind us. Still want to collect?', go: () => {
        if (Math.random() < odds) { talkNote('Bluff succeeded.', 'good'); return end('...Hmph. Keep your coins. This time.'); }
        talkNote('Bluff failed.', 'bad');
        addMod(e, 'bluff', 'You tried to bluff us', -5, { min: -10, decay: 0.5 });
        return refuse('Behind you? There is nothing behind you but empty space. ');
      } },
      { tag: 'Refuse', text: 'We pay nothing.', go: () => refuse() },
    ],
  });
  await openTalk(speaker(st, e), demand());
  st.sv.refreshHostility();
}

/** An empire offers to sell you one of their systems (free if your trade has won it over). */
export async function takeoverTalk(st: SpaceStage, e: Empire, star: number, price: number): Promise<void> {
  const w = st.w;
  if (w.ownerOf(star) !== e.id) return;
  const name = w.star(star).name;
  const free = price <= 0;
  const end = (say: string, mood?: Line['mood']): Line => ({ say, mood, replies: [{ tag: 'Leave', text: 'Thank you.', leave: true }] });
  const buy = (): Line => {
    if (w.ownerOf(star) !== e.id) return end('Too late. That system is no longer ours to sell.');
    if (!free && w.s.money < price) return { ...offer(), say: 'Come back when your purse matches your ambition. The offer stands.' };
    if (!free) w.addMoney(-price);
    annexSystem(w, star, 'bought');
    w.counter('diplomacy');
    audio.sfx('levelup');
    talkNote(`The ${name} system is yours!`, 'good');
    st.sv.refreshHostility();
    return end(`${name} is yours, cities and all. Treat its people well.`, 'happy');
  };
  const offer = (): Line => ({
    say: free
      ? `Your trade has won the hearts of ${name}. Its people want to fly your flag, and we will not stand in their way. Take it, with our blessing. No charge.`
      : `Our hold on ${name} grows thin, and your trade has done more for its people than we have. It can be yours, cities and all, for ${money(price)}.`,
    replies: [
      free ? { tag: 'Accept', text: 'We\'ll take good care of it.', go: buy } : { tag: money(price), text: 'Deal.', fail: w.s.money < price, go: buy },
      { text: 'Not now.', leave: true },
    ],
  });
  await openTalk(speaker(st, e), offer());
}
