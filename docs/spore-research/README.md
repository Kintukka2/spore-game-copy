# Spore (Maxis / Electronic Arts, 2008): A Complete Research Dossier

This dossier documents *Spore* in depth: what it is, how it was made, how every stage and editor works, the technology behind it, the franchise around it, its lore and science, and where it stands today (October 2026).

It brings together eight research tracks. Together they cover more than 1,000 web sources: the official PC manual, Maxis' SIGGRAPH 2007/2008 papers and slides, Chris Hecker's design documents, Kent Jolly's paper on Pure Data in *Spore*, EA press releases and SEC filings, contemporary reviews and interviews, the Spore Wiki, StrategyWiki, player FAQs, speedrun notes, and the source code of the community's reverse-engineering tools. Two facts were checked against live systems for this dossier:

- The live **Spore REST API** reported 191,789,965 total Sporepedia uploads on 18 October 2026.
- A creature uploaded that same day was decoded from its PNG to confirm how the creation format works.

---

## Contents

| # | Section | What it covers |
|---|---|---|
| — | **This overview** | The game in one page, how the stages connect, key numbers, common myths, resolved source conflicts |
| 1 | [History, development, release & reception](01-history-development-reception.md) | SimEverything origins, the GDC 2005 reveal, cute vs. science, delays, staff, the SecuROM saga, reviews, sales, awards, postmortems, Maxis Emeryville's closure, the 2024 revival |
| 2 | [Cell & Creature stages](02-cell-and-creature-stages.md) | Every cell part, damage tables, epic cells, the diet card, brain levels, the ability system, socializing, extinction, Epics and Rogues, migrations, achievements |
| 3 | [Tribal & Civilization stages](03-tribal-and-civilization-stages.md) | Food economy, tools, outfitter bonuses, rival tribes, spice geysers, the city planner, vehicles, three ways to take a city, superweapons, the card-to-archetype mapping |
| 4 | [Space stage](04-space-stage.md) | The galaxy, ship tools, badges and ranks, terraforming and T-scores, colonies and spice, diplomacy, the 10 archetypes, the Grox, the galactic core, Steve and the Staff of Life |
| 5 | [Editors, Sporepedia & online features](05-editors-sporepedia-online.md) | All ~18 editors, the Creature Creator in depth, hidden editors, the Sporepedia, upload counts 2008–2026, the PNG creation format, the Spore API, moderation, server history |
| 6 | [Expansions, spin-offs & the franchise](06-expansions-spinoffs-franchise.md) | Creature Creator, Creepy & Cute, Galactic Adventures, Bot Parts, the DS/Wii/iOS/Facebook games, Darkspore, the cancelled film, platforms, modding, spiritual successors |
| 7 | [Technology, engine, audio & file formats](07-technology-engine-audio-formats.md) | Rigblocks, metaball skin, procedural texturing and animation, planet generation, behaviour-tree AI, EApd procedural music, the DBPF/`.prop`/`.rw4` formats, every console cheat, system requirements, patches, known issues |
| 8 | [Lore, science, achievements & legacy](08-lore-science-achievements-legacy.md) | Grox lore, Steve's speech, Spode, the *Science* "Flunking Spore" review, education research, the full achievement list, Easter eggs, cultural impact, player counts today |

---

## 1. Spore in one page

**What it is.** *Spore* is a single-player "god game" by Will Wright, the creator of *SimCity* and *The Sims*. Maxis (Emeryville, California) developed it and Electronic Arts published it for Windows and Mac OS X, releasing it on 4–7 September 2008. The player guides one species from a single-celled organism to a galaxy-spanning civilization across five stages:

1. **Cell** — an arcade game in a tide pool, often likened to *Pac-Man* or *flOw*.
2. **Creature** — a 3D action/adventure game on one continent.
3. **Tribal** — a small real-time strategy game.
4. **Civilization** — a planet-wide real-time strategy game.
5. **Space** — an open-ended 4X/sandbox space game.

**The two big ideas.**

1. **Powers of Ten + Drake's equation.** Wright merged the Eameses' 1977 film *Powers of Ten* with Frank Drake's equation for estimating alien civilizations. Each stage zooms the camera out by orders of magnitude, from microbe to galaxy. Each stage also corresponds to a term of the equation: the fraction of planets that develop life, then intelligence, then technology.
2. **Procedural, player-made content.** Almost everything the player meets is built by players in shared **editors** ("creators"):
   - creatures, buildings, vehicles and spaceships;
   - after the *Galactic Adventures* expansion, also adventures.

   Each creation is stored as a few kilobytes of "DNA" (rigblock parts plus parameters). The engine textures it, animates it and gives it a voice procedurally at runtime. Creations upload automatically to the **Sporepedia** and are "pollinated" into other players' galaxies. Maxis called this a *massively single-player online game*: you never meet other players, only their creations.

**How it plays as one game.** Each stage has its own currency, editor, win condition and genre. They are linked by three threads:

1. **Your species design.** It carries forward until the end of the Creature stage. After that only clothing changes.
2. **Consequence cards.** Each stage awards a green, blue or red card depending on whether you played peacefully, in a balanced way, or aggressively. Every card grants one ability in each later stage. The combination of four cards decides your **Space-stage archetype** and its superpower.
3. **The planet itself.** The Creature-stage nest becomes the Tribal village. The village hut becomes the Civilization City Hall. Your Civilization cities become your Space-stage homeworld.

```
CELL ──► CREATURE ──► TRIBAL ──► CIVILIZATION ──► SPACE (endless)
 DNA        DNA         Food        Sporebucks §       Sporebucks § + spice
 Cell       Creature    Tribal      Building/Vehicle   Spaceship Creator,
 Creator    Creator     Outfitter   Creators, Anthem   outfitters, terraforming
 diet card  behaviour   tribe card  civ card           archetype = f(4 cards)
 (G/B/R)    card        (G/B/R)     (G/B/R)            + 4 passive card perks
```

### Stage-by-stage comparison

| | Cell | Creature | Tribal | Civilization | Space |
|---|---|---|---|---|---|
| **Genre homage** (per the developers) | *Pac-Man* | *Diablo* | *Populous* | *Civilization* | *Master of Orion* |
| **Currency** | DNA points | DNA points | Food | Sporebucks (from spice derricks, factories, trade) | Sporebucks; spice is a trade good |
| **Main editor** | Cell Creator | Creature Creator | Tribal Outfitter | Building and Vehicle Creators, Anthem | Spaceship Creator, terraforming tools |
| **Goal** | Fill the progress bar by eating, then grow a brain | Fill the brain bar (5 levels) by befriending or killing species | Ally with or destroy 5 rival tribes | Control every city on the planet (about 10) | Open-ended. The scripted goal is reaching the galactic core |
| **Peaceful path (green card)** | Herbivore | Social | Friendly | Religious | — |
| **Balanced (blue card)** | Omnivore | Adaptable | Industrious | Economic | — |
| **Aggressive (red card)** | Carnivore | Predator | Aggressive | Military | — |
| **Speed achievement** | *Speedfreak*: under 8 min | *Speed Demon*: under 1 h | *Ergonomically Terrific*: under 1 h | *Rolling Thunder*: under 1 h | none; the stage never ends |
| **Length** | 5–15 min; speedrun record 3:22 | speedrun about 11 min | The first four stages together take 1–2 h to about 15 h (Joystiq, 2008) | (included in the Tribal column's total) | 15–20+ h, open-ended |

### Consequence cards → Space archetype (full game)

| Cards earned (Green / Blue / Red) | Archetype | Superpower |
|---|---|---|
| 4·0·0, 3·1·0, 3·0·1 | **Shaman** (Harmony) | Return Ticket: teleport home |
| 0·4·0, 1·3·0, 0·3·1 | **Trader** (Prosperity) | Cash Infusion: instantly complete an economic takeover |
| 0·0·4, 1·0·3, 0·1·3 | **Warrior** (Force) | Raider Rally: summon pirates against a planet |
| 2·2·0 | **Diplomat** (Order) | Static Cling: freeze all ships and turrets in a system |
| 0·2·2 | **Scientist** (Science) | Gravitation Wave: destroy every city on a planet |
| 2·0·2 | **Zealot** (Faith) | Fanatical Frenzy: convert every city on a planet |
| 2·1·1 | **Ecologist** (Life) | Safari Vacuum: abduct two of every species on a planet |
| 1·2·1 | **Bard** (Chance) | Soothing Song: force an empire's relations to neutral |
| 1·1·2 | **Knight** (Force) | Summon Mini-U: spawn an allied copy of your ship |
| no cards (game started in Space) | **Wanderer** (Order) | none |

There are exactly **10 archetypes** in **8 philosophies**. Superpowers cost nothing and recharge on a cooldown. An archetype changes only through an ally's paid "Teach me your ways" mission; there is no gradual drift. Full detail is in sections [3.5](03-tribal-and-civilization-stages.md) and [4.9](04-space-stage.md).

---

## 2. Key facts and numbers

| Item | Value |
|---|---|
| Designer | Will Wright. Executive producer: Lucy Bradshaw. Team of 75–100+ at peak |
| Development | Research began about 2000 as "SimEverything". Art director Ocean Quigley suggested the name *Spore*. Revealed at GDC on 11 March 2005 |
| Release | 4 September 2008 (Australia and continental Europe), 5 September (UK and the rest of Europe), 7 September (North America) |
| Platforms | Windows and Mac OS X on one disc (the Mac version used TransGaming's Cider wrapper). Later on Steam (December 2008), GOG (2016, DRM-free) and the EA app |
| Metacritic | **84** (PC, 75 reviews). *Creature Creator* 83, *Galactic Adventures* 70 |
| Sales | >1M by 24 September 2008; "nearly 2M" by 30 September 2008; "over 2M" (EA, May 2009). EEDAR estimate: 2.8M (3.2M including the Creature Creator). EA never published a lifetime total |
| DRM | SecuROM online activation, limited to 3 then 5 machines. Amazon review-bombing: 2,016 of 2,216 ratings were one star. Most-pirated PC game of 2008 (~1.7M torrent downloads). Two class actions |
| Awards | 8 E3 Game Critics Awards (2005–2008), the BAFTA for Technical Achievement (2009), and the D.I.C.E. award for Outstanding Achievement in Gameplay Engineering |
| Creature Creator | Released 17–18 June 2008. 100,000 creatures in 22 hours, 1M in a week, 1.589M (equal to Earth's known species) by E3 in July 2008 |
| Sporepedia | 100M creations by May 2009. **191.8M uploads and 5.75M users** on 18 October 2026, with new uploads still arriving daily |
| Galaxy | ~42,010 visitable stars in a fixed five-armed spiral. The layout is identical in every save. Planets are generated from seeds when you first visit them |
| Grox | The only hand-made empire. About 2,400 systems ringing the core. Hostility −70. Lives only on T0 worlds |
| Endgame | Reaching the core: Steve (a nod to the UFO on the *SimCity 2000* box) gives you the Staff of Life, which has 42 charges and turns any planet into a T3 world. Earns the *42* achievement |
| Achievements | ~100 base plus ~50 in *Galactic Adventures* (the Spore Wiki's tables list 101 + 49) |
| Patches | 1.01 (September 2008) through 1.05.1 (July 2009), plus the 1.06 Bot Parts promotion (January 2010). Asymmetric creatures arrived in 1.05 |
| Status in 2026 | Servers, the Sporepedia and the REST API are online. EA set up a small community team in September 2024 (official Discord, monthly contests). No sequel or major updates are planned |

---

## 3. What makes Spore technically special

- **Rigblocks.** Every part is a deformable block driven by handle sliders. Deformations stack additively from the rest pose. A finished creation is "baked" into a single mesh with level-of-detail versions (SIGGRAPH 2007).
- **Metaball skin.** The torso and limbs are an implicit surface built from spherical metaballs and re-meshed in real time. Hecker deliberately avoided the then-patented Marching Cubes algorithm. Limbs placed close together merge into webbing, which players turned into bat wings.
- **Procedural painting.** Particle "brushes" from Maxis' Swarm effects engine crawl over the creature's body and paint diffuse, specular and bump maps. They run along the spine and limbs, guided by base, coat and detail paint scripts.
- **Procedural animation.** Animations were authored once, without a specific body shape in mind, in Maxis' in-house tool *Spasm*. At runtime they are retargeted to any body shape using semantic queries such as "front-most grasper", gait clustering and a particle-based IK solver. A 25-bone creature takes about 0.2 ms per frame (SIGGRAPH 2008).
- **Planets from seeds.** Each planet is a cube-mapped sphere sculpted by GPU-splatted brush scripts and stored only as a seed plus instructions. A stored planet would otherwise need about 10 MB. Plants and rocks are placed with an incremental Halton sequence.
- **Generative music.** The music runs on EApd, EA's fork of Pure Data, used for event logic only. Brian Eno's "composing in probabilities" approach drives it, with ambient music on planets and music in the editors that reacts to the parts you add. Cliff Martinez wrote the galaxy theme.
- **Data inside a PNG.** Every shared creation is a 128×128 PNG with up to 8 KB of zlib-compressed creation data hidden in the least-significant bits of the pixels. The bits are scrambled in a pseudo-random order and XOR-encrypted with a hash of the image itself, so the data cannot be lifted onto a different picture.

---

## 4. Common myths and misconceptions, corrected

| Claim you will see repeated | Reality |
|---|---|
| "There are 13 or 16 archetypes" | **10** archetypes in 8 philosophies. You only ever meet 8 NPC types plus the Grox |
| "Superpowers cost spice" | They are free tools with cooldowns of 1–30 minutes |
| "Your archetype drifts as you play" | It changes only through a paid "Teach me your ways" mission (§2.5M–§10M) with an ally of strength 4 or 5 |
| "Spore Points" in the base game | Not in the base game. *Galactic Adventures* added **Captain Points** |
| "The galaxy has 100,000+ stars" | About **42,010** visitable stars (the Spore Wiki and the reverse-engineered `stars.db`). Wright's 2005 pre-release figure of "well over a hundred thousand" was not borne out |
| "Each save has a different galaxy" | Star positions are fixed. Planets are generated from seeds when first visited |
| "All of Spore's audio uses Pure Data / libpd" | Spore used **EApd**, EA's fork of Pure Data, and only for event logic. Ordinary sounds used a separate player |
| "Creature stats stack" | In the Creature stage each ability takes the value of the *best* part granting it. Stacking happens **only in the Cell stage** |
| "Eyes matter" | Every eye works identically. Sight is simply on or off |
| "Diet card = what you can eat" | The card only unlocks mouths. The mouths you actually fit decide your diet, so you can keep an omnivore loophole by holding on to two cell mouths |
| Cheats `capturePlanetGraphic`, `refillMotive`, `spaceCheat`, `addCell` | The real commands are `capturePlanetGIF` and `refillMotives`. The other two do not exist. The full verified list is in [§7.11](07-technology-engine-audio-formats.md) |
| Achievements "Omnivore", "Gone Shopping", "Wonder Wanderer", "Supreme Pacifist" | Not real. The official list is in [§8.3](08-lore-science-achievements-legacy.md) |
| "The underwater stage was in the game" | It was shown at GDC 2005 and cut before release. Creatures that swim too far out are eaten by the unkillable Sea Monster |

---

## 5. Source conflicts and the figures this dossier adopts

| Topic | Conflict | Adopted |
|---|---|---|
| Cell-stage DNA cap | 125 vs 65 (both on the Spore Wiki) | **125**, which matches the Early Creature Creator's 125-DNA budget |
| Galaxy size | ~100,000 stars (Wikipedia) vs 42,010 | **42,010 visitable** |
| Steam release without SecuROM | 19 vs 22 December 2008 | Steam's store page lists **19 Dec**; press coverage says **22 Dec** |
| Patch that made YouTube uploads private | 1.02 vs 1.04 | **1.02** (from the patch notes); made public again in 1.05 |
| Creature Creator price | $9.95 vs $9.99 | **$9.99**, the MSRP in EA's own launch press release. Wikipedia and the Spore Wiki say $9.95 |
| Tribal main-hut HP | 400 vs 500 at start | **400** (Spore Wiki), then 750 and 1,000 |
| Static Cling (Diplomat) | Cooldown 20 vs 23 min; effect 2 vs 3 min | **~20 min cooldown, 2–3 min freeze** |
| Superweapon price (Civilization) | Various | **§12,000 per city you don't yet own; 6 cities required** (three sources agree) |
| Base-game creature parts | 218 / 228 / 250+ | **228 functional parts** in 7 palettes (Spore Wiki tier tables) |
| Achievements | 100 + 50 headline vs 101 + 49 in the tables | Both figures are reported in §8.3 |

Where a fact rests on a single fan source, the relevant section says so.

---

## 6. Method

Research ran as eight parallel tracks, one per section, totalling about 800 tool calls. Each track searched widely, fetched primary material where it existed, and wrote a referenced section. Every section ends with the URLs it actually used.

The sections were then cross-checked against each other:

- consequence-card abilities and archetype mappings across sections 2, 3, 4 and 8;
- patch notes across sections 1, 5 and 7;
- star counts across sections 4, 7 and 8;
- the DRM timeline across sections 1, 5 and 7.

Conflicts were resolved as shown in the table above.

**Sites that blocked automated access:** GameSpot, GameFAQs, IGN guides, PCGamingWiki and the EA forums. Where possible, their content was reached through mirrors, the MediaWiki APIs or search snippets, and is marked as such.
