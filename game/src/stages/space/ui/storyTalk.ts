// The story's calls (story.ts), as Fallout-style conversations (talk.ts). The voice in the static is only ever
// "??????", a dark silhouette behind the static, until you meet it at the core. Echo is a Hollow whose red
// lights have turned teal; the Conductor is the Hollow Prime. Each chapter has an opening call (an offer you
// can put off) and a closing one that pays out.
import type { Design } from '../../../design/types';
import { drawOri } from '../art/ori';
import { acceptChapter, chapterOf, finishChapter, storyPending, strikeTarget } from '../story';
import type { SpaceStage } from '../stage';
import { openTalk, type Line, type Mood, type Reply, type Speaker } from './talk';

interface Beat { say: string; reply?: string; mood?: Mood }
interface Offer {
  beats: Beat[];
  /** The request itself. */
  ask: string;
  /** Questions you can put to them before you answer. */
  asks: { q: string; a: string }[];
  yes: string;
  onYes: string;
  no: string;
  onNo: string;
}

const end = (say: string, reply = 'Over and out.', mood?: Mood): Line => ({ say, mood, replies: [{ tag: 'Leave', text: reply, leave: true }] });

/** A run of lines, each answered by one reply, then `last`. */
function chain(beats: Beat[], last: Line): Line {
  let next = last;
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i], after = next;
    next = { say: b.say, mood: b.mood, replies: [{ text: b.reply ?? '...', go: () => after }] };
  }
  return next;
}

/** An offer: the beats, then the request with its questions, yes, and not now. Resolves true on yes. */
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

const call = (sp: Speaker, beats: Beat[], last: string, reply?: string, mood?: Mood) => openTalk(sp, chain(beats, end(last, reply, mood)));

// ------------------------------------------------------------------ speakers
/** The voice in the static: no name, no face, just a backlit shadow. `weak` is how bad the signal is. */
function voice(sub: string, weak = 0.22): Speaker {
  return {
    name: '??????', sub, color: '#ffc27a', scheme: 'amber', voice: { sfx: 'tap', pitch: 2.15 }, noise: () => weak,
    paint: (g, x, y, size, t) => drawOri(g, x, y + size * 0.12, size / 135, t, 1, { silhouette: true }),
  };
}

/** A Hollow face: the Hollow's own design, recoloured. Echo is pale with teal lights, the Conductor near black. */
function hollowFace(st: SpaceStage, lights: string, base?: string, coat?: string): Design {
  const h = st.w.emap.get('hollow')!.creature;
  return { ...h, colors: { ...h.colors, detail: lights, ...(base ? { base } : {}), ...(coat ? { coat } : {}) } };
}

function echo(st: SpaceStage, named = true): Speaker {
  return named
    ? { name: 'Echo', sub: 'Former Hollow', design: hollowFace(st, '#5af0c8', '#b4c6d0', '#5d7382'), color: '#5af0c8', scheme: 'green', voice: { sfx: 'click', pitch: 1.15 } }
    : { name: 'HOLLOW UNIT 0-7', sub: 'Hollow signal · unencrypted', design: hollowFace(st, '#ffa25a', '#a3b0ba', '#4a5560'), color: '#7fd8c0', scheme: 'green', voice: { sfx: 'click', pitch: 1.05 }, noise: () => 0.12 };
}

function conductor(st: SpaceStage): Speaker {
  return { name: 'THE CONDUCTOR', sub: 'Hollow Prime', design: hollowFace(st, '#ff3b4a', '#30343d', '#15171c'), color: '#ff3b4a', scheme: 'green', voice: { sfx: 'click', pitch: 0.55 } };
}

// ------------------------------------------------------------------ names
function names(st: SpaceStage) {
  const w = st.w, tg = w.s.story!.tg;
  const S = (k: string, i = 0) => (tg[k] ? w.star(tg[k][i]).name : '');
  const P = (k: string, i = 0) => (tg[k] ? w.planet(tg[k][i], tg[k][i + 1]).name : '');
  return { w, tg, S, P, home: w.planet(w.gal.homeStar, 1).name };
}

// ------------------------------------------------------------------ the chapters
type Brief = (st: SpaceStage) => Promise<boolean>;
type Debrief = (st: SpaceStage) => Promise<void>;

const BRIEF: Record<string, Brief> = {
  voice: (st) => {
    const { S, P } = names(st);
    return offer(voice('Signal · origin unknown', 0.3), {
      beats: [
        { say: '...hello? Is this... oh! Oh, it works. You can hear me, can\'t you? Please don\'t hang up.', reply: 'Who is this? How did you get on our channel?' },
        { say: 'I\'m a friend. A far-away one. I\'ve been calling into the static for a very long time, and you\'re the first ship that ever answered.', reply: 'Lucky us. What do you want?' },
      ],
      ask: `There's a world near you called ${P('fade')}, in the ${S('fade')} system. It's going quiet. Things are going quiet all over, but that one I can hear fading. Would you fly out and listen to it for me? Just a scan. I need to know what's wrong.`,
      asks: [
        { q: 'Why can\'t you go yourself?', a: 'I can\'t leave where I am. If I did, something important would go out. That\'s all I can say. Sorry. I\'m out of practice at talking.' },
        { q: 'What do you mean, going quiet?', a: 'Every living world hums. You can\'t hear it, but I can. Lately the hum is thinner, like a song where someone keeps taking notes out.' },
        { q: 'Why should we trust you?', a: 'You shouldn\'t, yet. Trust me afterwards. That\'s how it usually works.' },
      ],
      yes: 'We\'ll take a look.', onYes: 'Thank you! I\'ll be listening. Well, I\'m always listening. But now I\'ll be listening to you.',
      no: 'Not now.', onNo: 'That\'s all right. I\'ll call again. I\'m very good at waiting.',
    });
  },
  garden: (st) => {
    const { P, tg } = names(st);
    const t = Math.min(3, st.w.tscore(tg.fade[0], tg.fade[1]) + 1);
    return offer(voice('Signal · origin unknown'), {
      beats: [{ say: 'It\'s me again. The static. Your favourite static, I hope.', reply: 'We were wondering when you\'d call.' }],
      ask: `${P('fade')} won't last on its own. But worlds are stubborn, if you give them something to hold on to. Could you warm its air, or wet its seas? Raise it to T${t}. When a world gets a little better, it starts to sing again.`,
      asks: [
        { q: 'How do we do that?', a: 'Terraforming tools. Storm pods, drought pods, ice comets... your shipyards sell them. Open the planet and use its Terraform tab. You\'ll get the hang of it.' },
        { q: 'What\'s in it for us?', a: 'A world that remembers you. That\'s worth more than it sounds. Also credits. I\'m told people like credits.' },
        { q: 'Who are you, really?', a: 'Someone who keeps something lit. A small someone. That\'s enough for now.' },
      ],
      yes: 'We\'ll bring it back.', onYes: 'I knew you would. Well. I hoped. Hoping is like knowing, only braver.',
      no: 'Not now.', onNo: 'Don\'t leave it too long. Worlds don\'t wait the way I do.',
    });
  },
  siphon: (st) => {
    const { S } = names(st);
    return offer(voice('Signal · origin unknown'), {
      beats: [
        { say: `I found one. A Hollow siphon, sitting at ${S('siphon')} on the edge of their ring. It's drinking light out of the galaxy like a straw.`, reply: 'A siphon?' },
        { say: 'Three of their ships, chained together, pulling. Every hour they stay, a hundred worlds go a little dimmer.', reply: 'And you want us to break it.' },
      ],
      ask: 'I want you to break it. I can\'t. I\'m not built for that. You have a laser. Lasers are good for breaking things. It\'s practically what they\'re for.',
      asks: [
        { q: 'The Hollow will come after us.', a: 'Maybe. They already hate everyone. You\'d just be nearer the front of the line.' },
        { q: 'What are the Hollow, anyway?', a: 'Machines now. They weren\'t always. Ask me again when you\'ve seen more.' },
        { q: 'How do you know all this?', a: 'I hear things. It\'s my job to hear things. It\'s a lonely job, mostly.' },
      ],
      yes: 'Consider it broken.', onYes: 'Be careful. And thank you. I don\'t say that enough. I don\'t say anything enough. Nobody ever calls back.',
      no: 'We\'re not ready.', onNo: 'Then get ready. Mend your hull, sharpen your laser. I\'ll be here.',
    });
  },
  tomb: (st) => {
    const { S, P } = names(st);
    return offer(voice('Signal · somewhere coreward'), {
      beats: [{ say: 'Hello again. I want to show you something. Something sad, but important.', reply: 'We\'re listening.' }],
      ask: `Behind the Static, at ${S('tomb')}, there's a dead world: ${P('tomb')}. The Hollow never go there. They can't bear to. Would you land on it? There's something buried there, a bell. Bring it up for me.`,
      asks: [
        { q: 'Why can\'t the Hollow bear it?', a: 'Because they remember it. That\'s the sad part. Go, and you\'ll see.' },
        { q: 'A bell?', a: 'A very old one. It rang every morning, back when there were mornings there.' },
        { q: 'Is it dangerous?', a: 'The world isn\'t. The way there is full of Hollow. Keep your shields up and your repair packs close.' },
      ],
      yes: 'We\'ll bring it up.', onYes: 'Land anywhere and sweep with your life scans. Bells are shy, but they want to be found.',
      no: 'Not yet.', onNo: 'It\'s waited this long. It can wait a little longer. So can I.',
    });
  },
  engine: (st) => {
    const { S } = names(st);
    return offer(voice('Signal · somewhere coreward'), {
      beats: [
        { say: `I've found the big one. The Null Engine, at ${S('engine')}. Every siphon in the ring feeds it, and it feeds the wall around the middle.`, reply: 'If we break it...' },
        { say: 'If you break it, the Static thins, the wall weakens, and the light starts reaching the whole galaxy again. Every world you\'ve ever seen will feel it.', reply: 'And the Hollow?' },
      ],
      ask: 'The Hollow will be furious. I won\'t pretend otherwise. They\'ve never been hurt like this, and I don\'t know what they\'ll do. But I think it\'s worth it. Do you?',
      asks: [
        { q: 'How well is it guarded?', a: 'Three warships and the Engine itself, and the Engine fights back. Bring everything you have.' },
        { q: 'You sound worried.', a: 'I am. Worried for you. Worried for me. Mostly for you.' },
        { q: 'What will you do when the wall comes down?', a: 'Breathe, I think. It\'s been a long time.' },
      ],
      yes: 'It\'s worth it.', onYes: 'Then go. I\'ll be right here, listening. I\'m always right here.',
      no: 'Not yet.', onNo: 'All right. Get strong. It isn\'t going anywhere, and neither am I.',
    });
  },
  echo: (st) => {
    const { S } = names(st);
    return offer(echo(st, false), {
      beats: [
        { say: 'FLESH-SHIP. DO NOT CLOSE THIS CHANNEL. I am not... I am not here to hurt you.', reply: 'A Hollow? Why should we listen to you?' },
        { say: 'Because I was inside the Null Engine when you broke it. Linked. Part of it. When it shattered, the silence broke too, and for a moment I heard... singing.', reply: 'Singing?' },
        { say: 'I remembered a morning. A bell. A song. I remembered that I was someone, before. The others felt me remember. Now they are hunting me.', reply: 'Our friend in the static went silent. Was that you?' },
      ],
      ask: `No. Your friend went silent because the Conductor found the channel and cut it. I can help you. I know the Hollow, inside and out. But first I have to live. Meet me at ${S('meet')}. The hunters are already on my trail.`,
      asks: [
        { q: 'Is the voice alive?', a: 'I do not know. The Conductor does not destroy what it can keep. That is all I can tell you.' },
        { q: 'What is the Conductor?', a: 'The first of us to go hollow. The one who chose for everyone else. It speaks for the ring now.' },
        { q: 'This is a trap.', a: 'If it is a trap, it is a very bad one. I am the one who will be shot at.' },
      ],
      yes: 'Hold on. We\'re coming.', onYes: 'I will hold on. I am... glad you answered. That is a feeling. I think.',
      no: 'We need to think.', onNo: 'Think quickly, flesh. They are faster than I am.',
    });
  },
  vat: (st) => {
    const { S } = names(st);
    return offer(echo(st), {
      beats: [
        { say: 'I have remembered something terrible. Do you want to hear it?', reply: 'Tell us.' },
        { say: 'The Hollow are not only the Choir any more. Every people the ring ever caught, it emptied and added to itself. Pilots. Traders. Whole colonies. We are made of the taken.', reply: 'Then some of them might still be in there.' },
      ],
      ask: `Inside the Shear, at ${S('vat')}, there is a Hollowing Vat. The taken wait there, half-emptied, for their turn. If you break the Vat, they wake up as themselves, and they go home.`,
      asks: [
        { q: 'Will they remember who they were?', a: 'I did. Slowly. Like waking after a long fever.' },
        { q: 'The Hollow hit our homeworld last time.', a: 'And they will strike again. I will not lie to you. The Conductor answers every wound with a wound. Guard your colonies.' },
        { q: 'How do we get through the Shear?', a: 'The anchor. Plot the jump and your ship will hold its course. I will fly with you.' },
      ],
      yes: 'We\'ll bring them home.', onYes: 'Then let us go. My ship is not much, but it shoots straight.',
      no: 'Not yet.', onNo: 'They have waited a long time. A little longer will not unmake them. I hope.',
    });
  },
  gate: (st) => {
    const { S, P } = names(st);
    return offer(echo(st), {
      beats: [
        { say: 'One wall is left between you and the middle: the Silent Gate, in the last ring of bastions.', reply: 'Let us guess. It\'s locked.' },
        { say: 'It opens only to the Choir\'s song. The Hollow cannot sing it any more, so it never opens. That was the point.', reply: 'Then we need the song.' },
      ],
      ask: `When the Choir went hollow, a few refused. Pilgrims. They fled to the rim with pieces of the hymn, so it could never be lost. Three fragments, on three worlds: ${P('frags', 0)} at ${S('frags', 0)}, ${P('frags', 2)} at ${S('frags', 2)}, and ${P('frags', 4)} at ${S('frags', 4)}. Find them, and I can put the song back together.`,
      asks: [
        { q: 'Why didn\'t the Hollow destroy them?', a: 'Because the Hollow forgot they existed. Forgetting is what they do best.' },
        { q: 'Are you all right, Echo?', a: 'I remember more every day. It hurts. That is how I know it is real.' },
        { q: 'Any sign of the voice?', a: 'Sometimes, under the static, I think I hear someone humming. Then it stops.' },
      ],
      yes: 'Three fragments. We\'re on it.', onYes: 'They will be buried, like the bell. Sweep the ground. The hymn wants to be heard.',
      no: 'Not now.', onNo: 'The rim is far. Rest first. I will keep listening for your friend.',
    });
  },
  spire: async (st) => {
    const { S } = names(st);
    // The Hollow Prime speaks first.
    const hub = (say: string): Line => ({
      say, mood: 'angry',
      replies: [
        { text: 'Who are you to tell us that?', go: () => hub('I am the Conductor. I chose silence for the Choir when the Choir was too weak to choose. Fear was a sickness. I cured it.') },
        { text: 'You didn\'t cure them. You emptied them.', go: () => hub('Empty is safe. Empty does not lose. The light is kept, and kept things cannot be taken. Turn back, and I will leave your worlds alone.') },
        { tag: 'Bluff 0%', fail: true, text: 'Set the voice free and we\'ll turn back.', go: () => hub('You lie the way flesh always lies. Badly.') },
        { tag: 'Leave', text: 'We\'re coming through.', go: () => end(`Then come. The Null Spire at ${S('spire')} will sing you to sleep.`, '...', 'angry') },
      ],
    });
    await openTalk(conductor(st), hub('FLESH. You carry a song that should not exist. Turn back.'));
    return offer(echo(st), {
      beats: [{ say: 'I heard it. I hear everything on that channel. Do not listen to it.', reply: 'What is the Null Spire?' }],
      ask: `The thing that jams your friend's voice. It stands at the Silent Gate, at ${S('spire')}. Break the Spire and the voice comes back. Break the Spire and the gate stays open.`,
      asks: [
        { q: 'This is the Conductor\'s home ground.', a: 'Yes. Bring everything. Repair packs. Every upgrade you can afford.' },
        { q: 'Will you come with us?', a: 'I will be there. Somebody has to sing the key while you pass.' },
      ],
      yes: 'Let\'s finish this.', onYes: 'Together, then. For the bell. For the mornings.',
      no: 'Not yet.', onNo: 'Then I will wait at the gate. I am getting good at waiting.',
    });
  },
};

const DEBRIEF: Record<string, Debrief> = {
  voice: (st) => call(voice('Signal · origin unknown'), [
    { say: 'You heard it, didn\'t you? That scan. All those numbers going down and down.', reply: 'Its air is thin and its life is struggling. What\'s happening to it?' },
    { say: 'It\'s starving. Not for food. For light. A world needs more than its own sun, you know. It needs a little of the light from the middle of everything, and somebody is taking it.', reply: 'Taking it? Who?' },
  ], 'I\'ll tell you when I\'m sure. For now, have a little thank-you. I found it in a wreck. Finders keepers.', 'We\'ll be in touch.'),
  garden: (st) => {
    const { P } = names(st);
    return call(voice('Signal · origin unknown'), [
      { say: `Listen! Can you hear it? No, of course you can't. But I can. ${P('fade')} is singing. Thin and off-key, but singing.`, reply: 'Its life is coming back.' },
      { say: 'More than coming back. Things are crawling out of its seas that haven\'t crawled in a thousand years. You did that.', reply: 'You said someone was taking the light. Who?' },
      { say: 'Look coreward. At the grey ring around the middle of the galaxy. You call them the Hollow.', reply: 'The Hollow? They don\'t talk to anyone.' },
    ], 'They don\'t need to talk. They just take. Here: seed pods for your trouble, and a little more. Get stronger. I\'ll call when I know where they\'re doing it.', 'We\'ll be ready.');
  },
  siphon: (st) => {
    const { S } = names(st);
    return call(voice('Signal · origin unknown'), [
      { say: `You did it! The siphon is scrap and the light is flowing again. The stars around ${S('siphon')} haven't burned this bright in an age.`, mood: 'happy', reply: 'The empires out there will notice.' },
      { say: 'They already have. Nobody knows who to thank. You can take the credit. I\'m not much for credit.', reply: 'What now?' },
      { say: 'Now you come closer. Past the edge of their ring is a storm they call the Static: their jamming, so thick no ship can see through it.', reply: 'So we can\'t get in.' },
    ], 'You couldn\'t. Here. It\'s a lens I ground from starlight. Hold it up to the Static and you\'ll see the way. Don\'t lose it, it took me a century.', 'We\'ll take good care of it.');
  },
  tomb: (st) => call(voice('Signal · somewhere coreward'), [
    { say: 'You found it. Can you read the markings round the rim?', reply: 'Some kind of score. Music?' },
    { say: 'A hymn. The people who lived there were called the Choir. They sang with the light at the middle of everything, every morning, for a hundred thousand years.', reply: 'What happened to them?' },
    { say: 'They got scared. Scared that one day the light would go out, and they\'d be left in the dark. So they decided to keep it. Own it. Wall it in.', reply: 'The Hollow ring.' },
    { say: 'And so they would never be afraid again, they took out every part of themselves that could be afraid. Every feeling. Every song. They put machines where those things had been.', reply: '...They emptied themselves.' },
  ], 'And now they\'re hollow. They don\'t even remember choosing it. Keep the bell, or sell it; collectors pay a fortune for Choir relics. I just wanted someone else to know.', 'Thank you for telling us.'),
  engine: async (st) => {
    const weak = voice('Signal · breaking up', 0.6);
    await call(weak, [
      { say: 'You did it! I can feel the light moving. It\'s pouring out to the whole... the whole...', mood: 'happy', reply: 'Hello? You\'re breaking up.' },
      { say: 'Wait. Something\'s wrong. They\'re tracing the... they know I\'ve been... they know where I...', mood: 'angry', reply: 'Where are you? Tell us where you are!' },
      { say: 'Listen. Whatever happens, keep going toward the middle. Toward the...', mood: 'angry', reply: 'Hello? HELLO?' },
    ], '[SIGNAL LOST]', '...');
  },
  echo: (st) => call(echo(st, false), [
    { say: 'They are gone. You came. Flesh came for a Hollow. I do not have a word for that. I used to.', reply: 'What do we call you? Unit 0-7?' },
    { say: 'That is a number. I would like a name. Something that comes back after the sound is gone... Echo. Call me Echo.', mood: 'happy', reply: 'Welcome back, Echo.' },
    { say: 'Take this. A Null Anchor. Every Hollow ship carries one, to hold course through the Shear, the gravity storm around the inner bastions. You will need it to go deeper.', reply: 'Won\'t you need it?' },
  ], 'Not any more. I am going to sit somewhere quiet and remember things. Call when you are ready. I will hear.', 'Take care, Echo.'),
  vat: (st) => {
    const w = st.w;
    const [s, i] = strikeTarget(w);
    const home = s === w.gal.homeStar && i === 1;
    return call(echo(st), [
      { say: 'The Vat is broken. Listen to the channels. Can you hear them?', mood: 'happy', reply: 'Thousands of voices. Calling home.' },
      { say: 'Pilots calling their families. Traders asking what year it is. Every empire you know is getting someone back today, and every one of them knows your ship\'s name.', reply: 'Echo, why has the ring gone quiet?' },
    ], home ? 'Because the Conductor is taking aim. I am sorry. It is going after your homeworld. Fly home now and you can still stop the worst of it.'
      : `Because the Conductor is taking aim. I am sorry. It is going after ${w.planet(s, i).name}. Fly there now and you can still stop it. If you do not, there will be nothing left of it.`, 'We\'re on our way.', 'angry');
  },
  gate: (st) => call(echo(st), [
    { say: 'Three fragments. Hold them up to your comms... There. Do you hear it?', reply: 'It\'s beautiful.' },
    { say: 'It is the hymn the Choir sang every morning. I am weaving it into a key. When you reach the Silent Gate, the key will sing, and the gate will remember it was a door.', reply: 'Echo, you\'re humming.' },
  ], 'Am I? ...I am. Here. The Choir Key. Go carefully. The Conductor waits behind that gate.', 'Thank you, Echo.'),
  spire: async (st) => {
    await call(echo(st), [
      { say: 'The Spire is falling. The gate is open. Go. GO. I will hold it.', mood: 'angry', reply: 'Echo, come with us!' },
      { say: 'Someone has to keep singing, or the gate forgets again. I remember all of it now. The bell. The mornings. My real name. It was a good name.', reply: 'Echo!' },
    ], '[SIGNAL LOST]', '...');
    await call(voice('Signal · strong', 0.05), [
      { say: 'Hello? Hello! Oh, I can hear you so clearly! The Spire\'s gone! You broke it!', mood: 'happy', reply: 'You\'re alive!' },
      { say: 'I\'m alive. Tired, and a little squashed, but alive. The Conductor kept me in a very small box. It\'s very bad at boxes now.', reply: 'Echo... Echo stayed at the gate.' },
      { say: 'I know. I heard her singing, all the way through. ...I\'ll look for her. I promise.', reply: 'What now?' },
    ], 'Now you come to me. Here: a lampwick sail. It catches the light at the middle of everything and rides it in. It\'s the last key you need. Come to the core, and I\'ll tell you who I am. In person.', 'We\'re on our way.');
  },
};

/** What happens once a chapter has paid out: the Hollow answer back, a whisper gets through. */
const AFTER: Record<string, (st: SpaceStage) => Promise<void>> = {
  engine: async (st) => {
    const { home } = names(st);
    const hub = (say: string): Line => ({
      say, mood: 'angry',
      replies: [
        { text: 'Who are you?', go: () => hub('I am the Conductor. I keep the silence. I kept the light when the Choir could not be trusted with it.') },
        { text: 'What did you do to the voice?', go: () => hub('Kept it. Everything that matters is kept. Come no closer, flesh.') },
        { tag: 'Leave', text: 'We\'re coming anyway.', go: () => end('Then come. The ring is patient. The ring has always been patient.', '...', 'angry') },
      ],
    });
    await openTalk(conductor(st), hub(`FLESH. You broke the Engine, so we broke something of yours. Look at ${home} and count your cities.`));
  },
  gate: async () => {
    await call(voice('Signal · very faint', 0.75), [
      { say: '...hello? ...is someone... still coming...?', reply: 'We\'re coming! Hold on!' },
    ], '...I can hear... the hymn... hurry...', '...');
  },
};

// ------------------------------------------------------------------ answering
let busy = false;

/** Answer the waiting story call. Resolves false if it was put off. */
export async function storyCall(st: SpaceStage): Promise<boolean> {
  const w = st.w;
  const pend = storyPending(w), ch = chapterOf(w);
  if (!pend || !ch || busy || ch.id === 'lamp') return true;
  busy = true;
  try {
    if (pend === 'signal') {
      const yes = await BRIEF[ch.id]?.(st);
      if (yes) acceptChapter(w);
      return !!yes;
    }
    await DEBRIEF[ch.id]?.(st);
    const items = finishChapter(w);
    if (items.length) w.hooks?.loot?.(`⭐ ${ch.title}`, items, '⭐');
    await AFTER[ch.id]?.(st);
    return true;
  } finally {
    busy = false;
    st.hud.refresh(true);
  }
}
