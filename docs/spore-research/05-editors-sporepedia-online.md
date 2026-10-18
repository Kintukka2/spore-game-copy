# 5. Creation Editors, User-Generated Content, the Sporepedia and Online Features

User-generated content (UGC) was the core design idea of *Spore*. Maxis called the game a "massively single-player online game" built on "asynchronous sharing." Players never play together in real time. Instead, everything a player makes is uploaded automatically to a central database, catalogued and rated, then redistributed to fill other players' galaxies. In its May 2009 100-million press release, EA said Spore was "widely recognized as one of the first games to make user-generated content the central focus."

---

### 5.1 The editor ("creator") family: overview

Wikipedia counts **eighteen different editors**, some unique to one stage. All of them share one interface and one set of controls for positioning, scaling and colouring parts, whether the player is making a creature, a building or a vehicle. Late in development Maxis renamed most "editors" to "creators" (e.g. "Creature Creator", "Building Creator"). The community uses both terms.

Most editors share three modes, shown as buttons in the Creature Creator interface:

| Mode | Icon | Function |
|---|---|---|
| **Build** | Hammer | Sculpt the body or chassis and attach parts. Shows the creation in its base colour without paint. |
| **Paint** | Paint brush | Pick colours and textures, which are applied **procedurally** according to the creation's topology (Wikipedia). There are three layers: **Base, Coat and Detail**, each with its own pattern and colour. Prefab "complete styles" are also available. |
| **Test Drive** | Paw print | A small arena in which the creation comes to life and can be animated, photographed and filmed. |

A sidebar shows the **Complexity Meter**, the creation's ability stats, and warnings (a red "!" means a required part, such as a mouth, is missing). The bottom of the screen has the currency budget and Undo/Redo/Exit buttons. Every creation needs a **name**. Description and **tags** (comma-separated) are optional but are used by Sporepedia search and by "archetype" tags. Per the Prima-produced Creature Creator guide, "Tags are important once you publish a creature, because others can focus on your creature's best elements… but only if you've applied the proper Tags."

#### Table: editors and outfitters in Spore and its add-ons

| Editor | First available | Currency / budget | What it makes | Notes |
|---|---|---|---|---|
| **Cell Creator (Cell Editor)** | Cell Stage (entered after "mating", or by editing an owned cell in the Sporepedia) | DNA points | 2D top-down microbes | Body fixed at **6 vertebrae** and cannot be stretched, but each vertebra can be fattened or thinned. Parts attach only to the sides. Has no main-menu button. |
| **Early Creature Creator** | Transition from Cell to Creature | DNA | First land creature | Limited to cell parts plus legs. A creature with no legs moves like a slug. |
| **Creature Creator** | Creature Stage, and from the main menu | DNA (main-menu "Normal Creature" starts with **2,000 DNA**; Early Creature starts with 125) | 3D creatures | Seven part palettes. Described in 5.2. |
| **Tribal Outfitter** | Tribal Stage | Budget of 200 (100 at first in-game, +25 per tribe conquered) | Clothing and accessories | **46 accessories**: 10 hats, 6 masks, 8 chest, 6 shoulder, 6 symbols, 10 details. These grant Gathering, Combat, Social and Health bonuses. |
| **Civilization Outfitter** | Civilization Stage | 1,000 | Cosmetic clothing | Adds about 23 more accessories. Purely cosmetic. |
| **Space Outfitter** | Space Stage | 1,000 | Cosmetic clothing | Adds about 23 more accessories. Purely cosmetic. |
| **Building Creator** (4 sub-editors) | Civilization Stage | Sporebucks (§) | City Hall, House, Entertainment, Factory | A fifth type, **farms**, appears in early screenshots but was cut. |
| **Vehicle Creator** (land / sea / air × military / economic / religious) | Civilization Stage | Sporebucks | Vehicles | Air vehicles unlock after capturing a fourth city. |
| **Spaceship / UFO Creator** | Space Stage | Sporebucks | Player spaceship | Contains parts from all vehicle editors. Weapons and other parts are purely cosmetic. |
| **Anthem Composer (Anthem Editor)** | Civilization and Space | none | National or empire anthem | 10 beat choices and 10 instruments/melodies, up to **16 notes**, 20 ambience sounds in up to 4 layers, plus a "Randomize" button. |
| **Terraforming / planet tools** | Space Stage | Sporebucks (tool charges) | Planet terrain, colour, atmosphere, ecosystem | There is no formal planet editor (Wikipedia). See 5.3. |
| **Captain Outfitter** | *Galactic Adventures* (2009) | Captain points / rank | Space captain | 32 ability parts in 8 tool-sets. See 5.4. |
| **Adventure Creator** | *Galactic Adventures* (2009) | Adventure complexity | Missions, plus a Terraform mode for the adventure planet | See 5.4. |
| **Flora (Plant) Editor** | Unreleased (hidden) | n/a | Plants | Cut from the shipped game but still present in the code. See 5.6. |

---

### 5.2 The Creature Creator in depth

**Body ("clay with a spine").** Wikipedia describes the creature as "a lump of clay with a spine" that the player moulds. The torso is built on a **spine of vertebrae**:

- Click the body to show arrows, then drag the ends to add spinal pieces at either end.
- Roll the **mouse wheel** over a section to inflate or deflate the body at that vertebra.
- Drag vertebrae to bend the spine.

The smallest body is **2 spine segments**, each costing 1 complexity point. The Prima guide warns that creatures look "overly 'round'" until the body is shaped gradually at each adjacent spine section. The **mouth is the only required part**. A creature without legs slithers "like a slug or an inchworm", and a creature without arms cannot pick up objects (Wikipedia).

**Parts ("rigblocks").** Parts are internally called *rigblocks*: animated, deformable modules that snap onto the body. The creature's model XML (see 5.9) lists them as `<blocks>` and `<blockref>` entries, each with a block ID, a transform (scale, position, orientation), its "snapped" state and a child list. Will Wright (pre-release): "We have seven part categories… Each category has four columns of parts, and each column has eight or nine choices. As your brain level increases, you unlock more columns. All in all we have about 400 creature parts. Each of these parts also has morphs."

The shipped game has seven palettes:

1. Mouths
2. Eyes & Senses
3. Arms & Legs
4. Graspers (hands)
5. Feet
6. Weapons
7. Details

Sources give different part totals. SporeWiki says **228 functional parts**. Maxis's Roarty told Shacknews "218 parts." The 2009 *Creature Creator 2-D* press release says "more than 250 body parts." Many parts have **morph handles** that stretch, bulge or reshape them. Parts can be rotated and scaled, and limbs have joints that can be moved, added or removed.

**Symmetry and asymmetry.**

- Parts mirror automatically by default.
- **Patch 1.05 (22 July 2009)** added true **asymmetry** for creatures and vehicles: hold **A** while placing or moving a part. Holding A while clicking a centred symmetric part converts it to asymmetric without moving it.
- **Ctrl+F** + click flips an asymmetric part (for example, a right hand becomes a left hand).

**Other keyboard tricks** (SporeWiki):

- **Alt**-drag duplicates a part.
- **Tab** shows extra rotation rings.
- **Ctrl**-drag detaches or attaches limb nodes.
- Hold **I** over a part to see its stats (added in Patch 1.01/1.02).
- **B** opens the Sporepedia.

**Abilities from parts.** Parts give level-based abilities that drive Creature-Stage gameplay. There are 4 combat abilities (Bite, Charge, Strike, Spit), 4 social abilities (Sing, Dance, Charm, Pose), and movement and other abilities (Sprint, Sneak/stealth, Jump, Glide, Sight), plus Health and Speed. Diet depends on the mouth (herbivore, carnivore or omnivore).

The live Spore REST API still reports these values for each creature. For example, the record for a creature uploaded on 18 October 2026 has these fields: `cost, health, height, meanness, cuteness, sense, bonecount, footcount, graspercount, basegear, carnivore, herbivore, glide, sprint, stealth, bite, charge, strike, spit, sing, dance, gesture, posture`.

Two stacking rules differ between versions:

- In the standalone Creature Creator, parts with the same ability did **not** stack. Maxis re-statted the parts for the full game.
- The Cell Stage is the only stage in which identical parts stack (for example, more flagella means more speed).

**Costs and unlocking.**

- Creature parts cost roughly **5 to 250 DNA** each. Parts further right in a palette are more expensive and give higher ability levels.
- Removing or selling a part gives a full refund.
- **Cell Stage:** parts come from meteor shards and from killing cells that carry them. Cells that carry an uncollected part are marked with a golden shield.
- **Creature Stage:** parts come from rummaging through **skeletons** and from killing or befriending **alpha creatures**. Brain-size upgrades unlock further columns.
- The cell's eating habits decide which mouths become available in the Creature Stage.

**Complexity Meter.** The meter is a bar that rises as parts are added. Its purpose is performance: creations are stored as parameter lists and rebuilt at load time, so the limit stops slow PCs from choking on them.

- **Creatures:** maximum **138 complexity points** above the 2-point minimum spine, or **148 for outfitted creatures**.
- **Example part costs:** each spine segment costs 1. Most details cost 1. Arm and leg segments cost 1.5. Mouths cost up to 10 or 11 (Gnathognasher costs 11). Clothing parts cost 1 each. Captain parts cost 1 to 3.
- **Buildings, vehicles and spaceships** need at least **3 parts** to be saved or uploaded.
- A part that would exceed the limit is shown in **red**, as are parts the player cannot afford.

**Test Drive.**

- **Backgrounds:** four in the base game (grassy plain, volcanic fortress, alien "eyeball-tree" crater, plain black). *Creepy & Cute* adds two (a "cute" dreamland and a "creepy" ruined city).
- **Babies:** click eggs to hatch up to **3 babies**, which copy the parent's actions with a delay.
- **Photos:** take a photo with the camera button or **C**, then email it as a postcard.
- **Video:** record with the cinema button or **V**. When recording ends, a **YouTube Upload** dialog appears. Otherwise the file is saved to `My Spore Creations\Movies`.
- **Animated avatar:** capture a GIF for use as an avatar.
- **Animations:** there are animation sets (simple moves, dances, conversation, emotions) plus 24 more from *Creepy & Cute* and 3 from Patch 1.03. The Prima guide counts "24 different movements" in the base Creature Creator.

---

### 5.3 Other base-game editors

**Building Creator.** Players pick from **Bodies, Roofs, Connectors, Doors, Windows, building-specific parts and Details**.

- Most structural parts cost **§500**.
- Type-specific decorations cost up to §7,000 (for example, the factory "Metal Twister").
- Each building type (City Hall, House, Entertainment, Factory) has its own part palette.
- Patch 1.04 added high-quality building textures in-game. Patch 1.05.0001 fixed a Building Creator crash when holding Ctrl or Shift while moving a part.

**Vehicle Creator.** There are three domains:

- **Land** vehicles come first and are the only ones that can claim land spice geysers.
- **Sea** vehicles are built from coastal cities and claim aquatic geysers.
- **Air** vehicles unlock after conquering four cities.

Each vehicle has a **military, economic or religious** purpose. In the editor, parts raise **Health, Power and Speed** percentages, which are converted to raw stats with fixed formulas and rounded down:

| Type | Health | Power | Speed |
|---|---|---|---|
| Land | 150 + 6x (max 750) | 10 + 0.4x (max 50) | 5 + 0.4x (max 45) |
| Sea | 200 + 8x (max 1,000) | 15 + 0.6x (max 75) | 5 + 0.4x (max 45) |
| Air | 150 + 6x (max 750) | 10 + 0.4x (max 50) | 10 + 0.8x (max 90) |

Vehicle bodies cost §100 to §200.

**Spaceship (UFO) Creator.** It contains bodies, cockpits, space, land, water and air parts, weaponry, effects and details. Ship parts are **cosmetic only**. The editor's hover text reads: "The only thing between you and the vacuum of space is 6 feet of solid style."

**Planet editing and terraforming.** The base game has **no formal planet editor**. In the Space Stage, players change planets with tools bought or found during play:

- **Terraforming tools** change atmosphere and temperature, which move the planet's **T-score** (T0 to T3). The T-score sets how many colonies the planet supports and how many flora and fauna slots it has: up to 3 plant species of each size, 6 herbivores and 3 predators at T3.
- **Planet Sculpting tools** (Basic and Terra series, plus Gear, Crystal, Cute, Tentacle and Chocolate series found as loot) raise, lower and level terrain or stamp landforms.
- **Planet Coloring** tools come in 8 colour "flavours" for atmosphere, water and land.
- **Ecosystem changes:** the Wildlife Sanctuary (up to 30 creatures on any planet) and the Species Eradicator.

The player's homeworld can be recoloured but not sculpted or terraformed. The `spaceCreate` cheat unlocks all creation tools. *Galactic Adventures* later added a dedicated planet editor inside the Adventure Creator (5.4).

---

### 5.4 *Galactic Adventures* editors (June 2009)

*Spore Galactic Adventures* launched in North America on **23 June 2009** and internationally on 25 June, at **$29.99** (rated E10+). It shipped with **16 Maxis missions**, plus **10 free downloadable "Robot Chicken" adventures** written by that show's team (rated Teen). It added two editors.

**Captain Outfitter.** The player equips a "Captain" (an outfitted creature) with **32 new parts** in **eight philosophy tool-sets** of four parts each:

| Tool-set | Parts |
|---|---|
| Warrior | Bladed Knuckles, Plasma Pulser, Lightning Striker, Missile Flinger |
| Shaman | Toxic Crystal, Swarm Magnet, Icy Band, Hypnomelder |
| Scientist | Compact/Power Generator, Compact/Power Battery |
| Ecologist | Invigorator, Stam-Booster, Super Invigorator, Mega Stam-Magnifier |
| Diplomat | Ducal Cape, Princely Pad, Regal Ring, Imperial Robe |
| Bard | Harpolizer, Hop Gogs, Synergizer, Fettipopper |
| Trader | Sprint Pack, Glider Pack, Stealth Helmet, Jump Jet |
| Zealot | Protecto-Shell, Danger Reductor, Power Shield, Regen-Deflector |

- Ranks are earned with **Captain Points** from completed adventures. Unlocking 10 parts takes **4,375 points**.
- Parts within a tool-set unlock left to right.
- Collecting all four parts in a tool-set awards that philosophy's Space-Stage consequence ability. Knight and Wanderer have no tool-set.
- Because of a developer oversight, Tribal armour parts still add captain health. Singuard gives +10.

**Adventure Creator.**

- **Build Mode** has 8 tabs: Creatures, Vehicles, Buildings, Fixed Objects, Gameplay Objects, Audio, Effects and Cast in Use. Each tab holds up to 60 loaded Sporepedia creations.
- **Per-object settings:** behaviours (Peaceful, Neutral, Mindless, Territorial, Aggressive, Advanced), stats (Awareness, Speed, Damage Bonus, Health), speech or caption bubbles, teams (None, Allied, Enemy 1 to 3), pick-up and give rules, and movement (Stationary, Wander, Patrol, Move To, Follow).
- **Acts and objectives:** up to **8 acts with 3 objectives each**. Objective types are Kill, Befriend, Ally, Talk To, Move To, Hold, Give, Collect, Bring, Block and Defend.
- **Terraform Mode:** stamp terrain (including lava pits and hills), set colours, add or remove flora, and use sliders for day/night, atmosphere, heat and water level. Hot planets turn water into lava and cold planets turn it into ice.
- **Interactive objects** include gates and keys, bombs, crates, mines, jump pads, teleporters and power-ups.
- **"adventureLook" filters** (watercolor, sepia, sixteenbit, eightbit, filmnoir…) are saved with the adventure and shown to anyone who plays it.

**Uptake:** more than **100,000 user-created adventures** within about the first month (WorthPlaying, 31 July 2009). Adventures are shared through the Sporepedia with leaderboards ("Adventure Leaders").

---

### 5.5 Parts packs, standalone and spin-off creators

| Product | Date | Price | Content |
|---|---|---|---|
| **Spore Creature Creator** (standalone, PC/Mac) | **17 June 2008** (NA; SporeWiki says 18 June; EU 27 June per Wikipedia) | Full version **$9.99** MSRP (Wikipedia and SporeWiki say $9.95). The free trial has **25% of the parts**. | Creature editor, Test Drive, photos and video, Sporepedia upload, YouTube upload, animated avatars, RSS and embeddable HTML. The trial was also bundled with *The SimCity Box*. An AT&T edition had 37 extra parts and paints. In Australia (30 August 2008), News Limited newspapers offered it free or for $2. |
| **Spore Creepy & Cute Parts Pack** | **18 November 2008** | $19.95 (announcement coverage) | SporeWiki lists **60 creature parts, 48 paint scripts** (12 base, 12 coat, 12 detail, 12 complete styles), **24 Test Drive animations** and 2 backgrounds. Other listings say 72 parts, and the official PR said "more than 100 new creature-building components." Mascots are Skratcher and Skoog. It needs Patch 1.02. |
| **Patch 1.03 "exoskeleton" freebie** | 18 November 2008 | free | **24 exoskeleton limbs** (12 arms, 12 legs, 50 to 80 DNA each) |
| **Spore Bot Parts Pack** (Patch 1.06) | 4 January 2010 to 31 December 2010 | Dr Pepper promotional code (US only, excluding Maine) | **14 robot parts**. Bot mouths lack Sing. After a March 2017 client update, users who had redeemed codes got the parts in the client. |
| **Spore Creature Creator 2-D** (Flash, spore2d.com) | 16 September 2009 | free | Browser creature maker with "more than 250 body parts". It could import from the Sporepedia (then "120+ million pieces" of UGC) and included a "Creature Trainer" mini-game, embeds and e-cards. |

---

### 5.6 Hidden editors, cheats and limit tricks

**Cheat console.** Open it with **Ctrl+Shift+C**. Commands are not case-sensitive. Cheats that give an advantage stamp the save with the **"Joker" badge**, which blocks achievements for that save. Using a cheat 50 times awards "Pathological Cheater."

| Cheat | Effect |
|---|---|
| `addDNA` | +150 DNA (also +150 Outfitter budget). Works in editors. |
| `moreMoney` | +2,000 Sporebucks in Civilization, +1,000,000 in Space |
| `freedom` | **Disables the creator complexity limits.** Works only in the non-game editors and not in every version. Over-complex creations **are not pollinated**, cannot appear in games, and get a red complexity icon on their Sporepedia card. |
| `spaceCreate` | Unlocks and recharges all Space creation tools, including all sculpting and colouring tools |
| `evoadvantage` | Start a Creature game with any (more evolved) creature from the Sporepedia (Patch 1.01) |
| `blocksmode` | Shows creatures as blocky representations (Patch 1.01) |
| `colladaExport` | Exports the current creature as a **COLLADA (.dae)** mesh for Maya. Needs Patch 1.05 and acceptance of a Tools EULA. |
| `highresTextureLevel` | Raises vehicle and building texture quality (1.05) |
| `capturePlanetGIF` | Saves a spinning planet GIF |
| `styleFilter` / `adventureLook` | Visual filters (oilPaint, filmNoir, microscope, norainbows, nextgen…) |
| `freeCam`, `levels -unlock`, `SetConsequenceTrait`, pirate-raid frequency tweaks | Assorted utility and gameplay changes |

**Hidden editors.** These are opened with a launch parameter on `SporeApp.exe`, for example `-state:CellEditor` or `-state:FloraEditor`:

- **Advanced Cell Editor.** About **5× the parts** of the normal cell editor: cut "upgrade" variants of cell parts that appear in *The Art of Spore*. Creations can be saved but **cannot be shared** to the global Sporepedia and do not appear as NPCs.
- **Flora (Plant) Editor.** Has four categories (trunks, leaves, details, fruits) but is full of bugs: invisible parts, crashes, and saving that fails unless a fruit part is present. The Share button always returns an upload error because the **server refuses flora**. Saved plants can cause severe crashes, such as the Staff of Life covering a planet with plants. Lucy Bradshaw hinted at a Flora Editor expansion that never shipped.

**Mods.** Mods (`.package` files edited with SporeMaster, later SporeModder FX and the Spore ModAPI) can add parts or raise limits. Modded creations still upload, but they show a **lock icon** on their card and **do not pollinate**. Players without the mod cannot view or edit them.

---

### 5.7 The Sporepedia

**What it is.** The Sporepedia is both the in-game catalogue and the website database of creations. Content is shown as **cards**: name at the top, image and stats in the middle, creator at the bottom. Producer Caryl Shaw's GDC 2008 talk describes the cards as roughly **30 KB PNG files** that contain the image, basic info and the object's game data. Cards can be shared through the server, by email or on websites.

**In-game tabs:**

- **Creations:** Everything, Maxis, Recent Downloads, Search Online/Browse.
- **My Stuff:** My Creations (works offline), the **MySpore Page** (profile, subscribers, Sporecasts, featured creations, Spore news, events, comments), **Achievements**, and the Spore Catalog store.
- **Buddies:** each buddy gets their own tab, plus a Find Buddy search.
- **Sporecasts.**

During a game, the Sporepedia also records every star, planet, creature, building, vehicle and plant the player has discovered, and the species' evolutionary timeline. Space-Stage content is added by **scanning**.

**Card types:** creature (stats shown depend on whether it is a plain creature, tribal, civilized or captain), flora, vehicle (health, power and speed bars), building, planet (3D view and tracking compass), song (anthem) and adventure (up to 4 pictures, tags, leaderboard).

**Banning.** Any card can be **banned** with one click, and it never appears in that player's game again. Patch 1.02 (19 October 2008) added Ctrl-click and Shift-click to select several items for deletion or banning.

**Pollination (how other players' content reaches your galaxy).**

- Every creation the player saves is **uploaded automatically** (when online), catalogued, rated "based on how many users have downloaded the object," then **redistributed** into other players' galaxies (Wikipedia).
- Each creation is a compact description. Wright: "think of it as sharing the DNA template of a creature while the game, like a womb, builds the 'phenotypes'." Pre-release statements put this at "a couple of kilobytes." In practice the payload must fit in **8 KB compressed** inside the PNG (5.9).
- Producer Caryl Shaw said at GDC 2008 that the original concept was 100% "under the hood." An "**aesthetic matching**" system would pull in content that looked similar to the player's own creations. The visible Sporepedia "organizer" was added mid-development. Maxis's Roarty told Shacknews the Sporepedia "was not in the original plan" but "Pollination was always part of the idea."
- **Sporecasts** are themed collections that a player curates and others subscribe to. Subscribed Sporecasts **download automatically at launch**, and later additions download while the game is online. A player can make one or more Sporecasts the **theme** of a new galaxy, so their content appears in later stages much more often. Bit-tech's hands-on reported that the game "will automatically download suitable Sporecasts if you've not selected ones." Shaw said content received from the servers is added without restarting.
- **Content filter:** a toggle restricts downloads to one of four levels: "no user generated content", "official Maxis-approved content", "downloadable friend content", or "all user-created content" (Wikipedia). EA presented the option in August 2008 as a response to offensive creations.
- **Maxis-made content:** the game ships with several thousand Maxis-made sample creations, so it works fully offline. On the live API, the "MAXIS_MADE" search view still returns creations by staff accounts such as *MaxisMichael*. Achievement progress and downloaded creations are stored locally in `pollination.package`. Deleting that file resets achievement progress.
- **MySpore and the metaverse:** the MySpore Page reports how your species is doing in other players' games, for example how many times others allied with it. Wright called this the "alternate realities of the Spore metaverse."
- **Restrictions:** over-complex (`freedom`) creations, modded creations and flora are not pollinated.

**Social features (website and in-game):**

- Buddies and subscribers
- Comments on creations (the API has a comments endpoint)
- Ratings (each asset has a `rating` value)
- "Featured" creations on spore.com
- Sporecasts
- Achievements synced to the server (Patch 1.03 improved the sync)
- Postcards and email photos
- Embeddable creature widgets and RSS/Atom feeds
- The official forum, the **Sporum**

**Achievements tied to UGC.** There are 100 base-game achievements and 50 more in *Galactic Adventures*. UGC-related ones include:

- Architect (create and share 50 buildings)
- Automotive Engineer (50 vehicles)
- Biologist (100 creatures)
- Creator (50 hours in the creators)
- Universe in a Box (use every creator)
- Déjà Vu (meet one of your own creations while exploring)
- Social Engineer (5 Sporecasts of 50+ items)
- Rising Star (5 Sporecasts with 10+ subscribers each)
- Front Page News (have a creation or Sporecast featured on spore.com)

The removed **"Bad Baby!"** achievement ("Have one of your assets banned") was deleted in Patch 1.02. SporeWiki says getting it also brought a 7-day account suspension, and that it was removed because it was unpopular and encouraged "Sporn."

---

### 5.8 Upload counts over time

All figures are company-reported unless marked otherwise. "Creations" includes all types (creatures, buildings, vehicles, spaceships, adventures and so on).

| Date | Figure | Source |
|---|---|---|
| 19 June 2008 (2 days after Creature Creator launch) | **250,000+** creatures shared; 2+ per second, peaks of 1,000+ per minute | AWN / Maxis |
| ~24–25 June 2008 (first week) | **1 million** creatures. The millionth was "Sapiusgeenus" by user *FlamingChidori*. | Maxis via WorthPlaying |
| 14 July 2008 (E3) | **1,589,000** species in about 18 days. Wright joked this was "38% efficiency" compared with God's six days. | Wikipedia (Wright at E3) |
| Early September 2008 (game launch) | **3 million+** creatures from the Creature Creator | Wikipedia |
| 24 September 2008 | **25 million+** creatures, vehicles and buildings, alongside 1 million copies sold | EA press release |
| 18 December 2008 | **40 million+** creatures, vehicles and buildings | EA / Z Corp release |
| 22 January 2009 | **65 million+** pieces of UGC (Destructoid cited about 200,000 a day) | EA press release |
| March 2009 (SXSW) | **86 million+** | Engadget |
| 29–30 April 2009 (crossing); announced 4 May 2009 | **100 million**, including **31,017,761 creatures** ("more than 19 times the number of known species on Earth"), an average of **307,000+ uploads a day** since June 2008. The counter read 100,762,856 on announcement day. | EA press release; Kotaku/Engadget for the crossing date |
| 23 June 2009 | **105 million+** | *Galactic Adventures* launch release |
| 16 September 2009 | **120+ million** | *Creature Creator 2-D* release |
| **18 October 2026** (live API query for this report) | **191,789,965 total uploads**; **5,748,530 registered users**. On that day: about 180–200 uploads and 68 new users. | `spore.com/rest/stats` |

Asset IDs are 12-digit numbers, mostly starting with 500 or 501 (Archive Team). The newest assets in October 2026 have IDs around 501,125,086,xxx.

---

### 5.9 The "Spore card" PNG format

Every creation is saved and shared as a **128×128 RGBA PNG thumbnail** that **contains the entire creation**. The files are stored in `My Spore Creations\Creatures`, `\Buildings`, `\Vehicles`, `\Plants` and so on. Dragging a PNG into the Sporepedia or onto an open editor imports it. Renaming the file does nothing, but editing the image destroys the data.

**Investigation history.**

- **Ned Batchelder (25 June 2008)** found no extra PNG chunks, so he concluded the data was hidden in the pixels by **steganography** in the **least-significant bits**.
- A live 2026 thumbnail checked for this report confirms this: it contains only `IHDR`, `IDAT` and `IEND` chunks, with no tEXt or other metadata chunks.
- Commenters noted that the data defeats PNG compression (about 29 KB per thumbnail) and looks encrypted.
- In **August 2008**, Something Awful forum members **ymgve and "rick"** reverse-engineered the Creature Creator and published a Python decoder. The Spore Community GitHub organisation still maintains it, along with a newer .NET decoder by *emd4600*. Blogger *rouli* wrote an illustrated explanation.

**How the encoding works** (based on the published decoder source):

1. The creation data is **zlib/deflate-compressed**.
2. It is framed as: magic bytes `16 0D 45 02`, a 4-byte length, the compressed data, the magic again, and a **CRC-64 checksum**. The whole frame is zero-padded to exactly **8,192 bytes**. If the compressed data does not fit, it cannot be stored, which is why some over-complex creations will not decode.
3. The image has 128 × 128 × 4 = 65,536 colour-channel bytes, so it holds exactly 8,192 bytes of LSB capacity.
4. Bits are not written in order. A **permutation** (a feedback walk starting at offset `0xB400`) decides which byte's LSB holds each bit.
5. Each bit is XOR-**encrypted** with a keystream from an FNV-style hash (`0x811C9DC5`, multiplier `0x1000193`). The hash is fed from the image's own **upper bits** (`d & 0xF8`), so the key depends on the picture itself.

According to rouli, using the image as the key means LSBs cannot simply be copied from one image to another to make a creation that looks innocent in the Sporepedia but is something else in-game.

**Decompressed contents.** The decompressed data has two parts:

- **"Pollen" metadata header** (not XML). It starts with the text `spore`, then a version number, type, group and instance IDs, machine ID, asset ID, timestamp, author name and user ID, creation name, description, tags, and a list of parent IDs.
- **Spore Model XML** (`<sporemodel>`, `formatversion` 18). It holds the model type, three `skincolor` values (base, coat and detail RGB), three `skineffect` paint IDs, a **`zcorpscore`** field (apparently related to the Z Corp 3D-printing service), and the full `<blocks>` list of rigblocks with transforms and parent/child links.

**Verification for this report.** A creature uploaded on 18 October 2026 ("Dumskiddly") was decoded with the 2008 algorithm, ported to Python 3:

- The magic bytes were present.
- The compressed payload was **5,927 bytes**, which inflated to **58,639 bytes**.
- The header held the asset ID 501125086647, the parent ID 501125042357 and the author ID 501071264862, matching the live API record.

Adventures use a different format, handled by a separate community "Adventure Decoder." Anthems use the same PNG format but, per Shaw, were **not uploaded** to Maxis servers because of "copyright concerns."

---

### 5.10 Spore.com, YouTube, the Spore API and merchandise

**YouTube integration.**

- EA and YouTube made an agreement (announced on Google's blog in March 2008) that lets players upload creature videos **from inside the editor in "two clicks."** Launch PR also promised a dedicated **Spore YouTube Channel** (youtube.com/spore) to showcase uploaded videos.
- YouTube's blog reported "literally thousands" of uploads within days of 17 June 2008.
- **Patch 1.02** made uploads **private by default**, after "Sporn" videos appeared. **Patch 1.05** (July 2009) made them **public** again.
- Uploading a photo or video from Test Drive earns the "Photographer" achievement.

**Spore API (2009).**

- Maxis opened a public web API around **27 February 2009**: "Using simple web services, you can access our huge database of creations and creators." It came with reference documentation, sample code, an app gallery (a creature aquarium, a friend-activity monitor, a Google gadget, a "Kittenwar-style" Creature Battle) and a developer forum. The original site, sporeapi.com, is now a dead link.
- **API contest:** announced 4 March 2009. Entries were due **6 April 2009**. Prizes were an NVIDIA graphics card for first place and copies of *Spore* / *Galactic Adventures* for runners-up. Results came out in April 2009, with winners making visualisations, games, mobile apps and content-navigation tools (Wikipedia).
- **SIGGRAPH 2009 talk:** "Spore API: accessing a unique database of player creativity" by Dan Moskowitz, Shalin Shodhan and Michael Twardos.

**API endpoints** (documented by Archive Team; most still answer in October 2026). They return XML, typically with a limit of 500 items per request:

| Endpoint | Returns |
|---|---|
| `/rest/stats` | Global upload and user counters |
| `/rest/creature/{id}` | Creature ability stats |
| `/rest/asset/{id}` | Asset metadata, comments and parent |
| `/rest/user/{name}` | Profile (avatar, tagline, join date) |
| `/rest/assets/user/{name}/{start}/{len}/{type}` | A user's creations |
| `/rest/sporecasts/{name}`, `/rest/assets/sporecast/{id}/…` | Sporecasts |
| `/rest/achievements/{name}/…` | Achievements |
| `/rest/comments/{id}/…` | Comments |
| `/rest/users/buddies/…`, `/rest/users/subscribers/…` | Social graph |
| `/rest/assets/search/{view}/{start}/{len}/{type}` | Views confirmed live: NEWEST, TOP_RATED, TOP_RATED_NEW, FEATURED, MAXIS_MADE, RANDOM, CUTE_AND_CREEPY. Types include CREATURE, BUILDING, VEHICLE/UFO, ADVENTURE. |
| `/rest/assets/find/{query}/…` | Search (undocumented) |
| `/atom/news`, `/atom/assets/user/{name}`, `/atom/sporecast/{id}` … | Atom feeds |
| `static.spore.com/static/model/…/{id}.xml`, `/static/thumb/…/{id}.png` (128×128), `/static/image/…/{id}_lrg.png` (256×256) | Raw model XML and images |

**Physical merchandise and spin-offs:**

- **Zazzle "Spore Store"** (from June 2008): mugs, T-shirts, magnets and stickers printed with a player's creature. Pre-orders of *Spore* came with a $10 Zazzle coupon. The game also had a built-in iTunes-style "Spore Store."
- **Spore Sculptures** (announced **18 December 2008**, Maxis with **Z Corporation**): full-colour 3D prints (ZPrints) of a player's creature, up to **4 inches tall**, **$49.50**, ordered by uploading to **sporesculptor.com**. Only creatures could be printed, and fragile parts such as eyestalks were not allowed. The service has since ended. Earlier, some E3 2006 attendees were mailed printed figurines of creatures they had designed at the show.
- **Spore Comic Creator:** revealed at San Diego Comic-Con on 24 July 2008 and built on MashON.com's e-card software. Smith Micro distributed it as the **MashON Spore Comic Book Creator** (Windows/Mac, **$29.99**, announced January 2009), with Spore creature and scenery libraries and sharing to MySpace and Facebook.
- **Spore Islands:** a Facebook game based on the Creature Stage, running 5 November 2009 to 7 July 2010.
- **Not found:** no source confirmed an official "Spore creature keychain" product.

---

### 5.11 Moderation and "Sporn"

- **"Sporn"** (Spore + porn) means obscene creations. Kieron Gillen of *Rock, Paper, Shotgun* coined the term on **18 June 2008**, the day after the Creature Creator launched.
- **Enforcement:** in **August 2008**, Lucy Bradshaw said "a small number of people can be counted on to use it for something vulgar." EA worked with YouTube to remove such videos. Offending accounts were **warned, then suspended, then removed** (bit-tech, 1 August 2008). EA emailed users flagged for Terms of Service violations; PC Gamer's Kristen Salvatore was flagged over a creature named "Boobalicious."
- **Will Wright** told the Associated Press he was not offended, and called sporn a side effect of how open the editors are.
- **Tools:** in-game one-click ban, Sporepedia reporting, Maxis monitoring and bans, and the four-level content filter. Sporn that is never uploaded breaks no rules.

---

### 5.12 Online status, 2008–2026

- **DRM and accounts:** online features need a Spore/EA account. Launch day brought login and validation problems, for example European players being told their validation code was invalid. EA began selling a SecuROM-free version on **Steam on 22 December 2008**, and a DRM-free GOG release followed in 2016.
- **Patches** (1.01 on 22 September 2008 through 1.05.0001 on 29 July 2009, plus 1.06) all came through the EA Download Manager.
- **Maxis Emeryville closure (2015) and datacenter migration:** around September 2015, players reported they could not connect. Community manager *MaxisBazajaytee* said bringing Spore "back online in the new datacenter" had been "long and painful". The team was "finalising network settings and applying SSL certificates," the website was up, and the game-client login flow still had to be reconnected before testing (quoted by SimsCommunity, 9 September 2015).
- **March 2017 client update:** an EA support guide says installs from Origin, Steam or GOG made after March 2017 are on the updated build, which **is required for Sporepedia and MySpore**, and that the old **disc version can no longer go online**. Steam owners have often had trouble linking accounts; SporeWiki says some had to contact EA support.
- **Sporum closure:** announced 10 July 2018. The forum went **read-only on 15 August 2018** (with 79,424 topics, 4,088,801 messages and 100,022 users) and closed completely in **April 2019**, redirecting to EA Answers HQ.
- **August 2023 outage:** from 31 July to 3 August 2023, Steam users reported they could not reach spore.com or the Sporepedia. One called it the longest outage they had seen. An EA forum thread was titled "Spore Maintenance – August 2023." SporeWiki noted the servers were still active as of July 2023, and service later resumed (uploads continued through 2024–2026).
- **New team (30 September 2024):** spore.com's news feed announced "Spore has a new team!", with community managers **RogueLyeshal (Rogue)** and **Reiliyn (Rei)** and an **official Discord** (10,000 members by 15 November 2024). The team said there would be no sequel and no major updates; the focus is community engagement (GamesRadar and GameRant, 1 October 2024).
- **Since then:** the news feed has carried a steady run of **Discord creation contests**:
  - Halloween and Harvest 2024. Harvest 2024 Grand Prize winners got EA app codes for *Spore Ultimate Edition*.
  - Holiday 2024, Valentines, Forest and Pride 2025, Halloween 2025.
  - Contests on 2 February, 12 April and 17 July 2026 ("Tidewalkers 2026").
  - A "72-Hour Creation Challenge" on 18 September 2026.

  Winning entries are added to **Featured Creations** and themed Sporecasts.
- **Status as of 18 October 2026:** spore.com, the Sporepedia and the REST API are **online**. New creatures, buildings, UFOs and adventures were being uploaded the same day, and the stats endpoint reported **191.8 million total uploads** and **5.75 million users**. Some players still report intermittent "servers not available" login errors (Steam threads, late 2025).
- **Preservation:** Archive Team lists Spore.com as "Online!" with archiving "in progress" for API data and "partially saved" for the website (page last edited August 2026). Community tools include the PNG Downloader, SporeTools and a brute-force ID gatherer. The Spore Community also has **SporeServer**, a work-in-progress replacement server, against a possible future shutdown.

---

### Sources

- https://en.wikipedia.org/wiki/Spore_(2008_video_game) (raw wikitext: https://en.wikipedia.org/w/index.php?title=Spore_(2008_video_game)&action=raw)
- https://en.wikipedia.org/wiki/Spore_Creature_Creator
- SporeWiki (via the spore.fandom.com API, wikitext) pages: Sporepedia, Editor, Creature Editor, Cell Editor, Tribal Outfitter, Building Editor, Vehicle Editor, Spaceship Editor, Anthem Editor, Captain Outfitter, Adventure Creator, Flora Editor, Complexity Meter, Cheats, Test Drive Mode, Sporecast, Spore Creature Creator, Spore Creepy & Cute Parts Pack, Spore Bot Parts Pack, Patch 1.01, 1.02, 1.03, 1.04, 1.05, 1.05.0001 and 1.06, Terraforming, Planet Sculpting, Planet Coloring, DNA Points, Cell Stage, Creature Stage, Modifications, Sporn, Sporum, Achievements, Template:Achievements/General, Bad Baby!, Figurines, Spore Islands, Spore, SporeWiki:Downloading content. Example URL: https://spore.fandom.com/wiki/Sporepedia
- https://nedbatchelder.com/blog/200806/spore_creature_creator_and_steganography
- https://github.com/Spore-Community/PNG-Decoder-Python (decoder source, plus the included copy of rouli's "Spore's .png format (illustrated)", 2008)
- https://github.com/Spore-Community/PNG-Decoder-NetCore
- https://www.github.com/topics/maxis
- https://wiki.archiveteam.org/index.php/Spore
- Live Spore API queries, 18 October 2026: https://www.spore.com/rest/stats, https://www.spore.com/rest/assets/search/NEWEST/0/3, https://www.spore.com/rest/creature/501125086647, https://www.spore.com/rest/asset/501125086647, https://www.spore.com/rest/user/MaxisCactus, https://static.spore.com/static/model/501/125/086/501125086647.xml, http://www.spore.com/static/thumb/501/125/086/501125086647.png, https://www.spore.com/atom/news
- EA press releases (Business Wire PDFs):
  - https://s204.q4cdn.com/701424631/files/doc_news/2008/06/1/316980.pdf (Creature Creator launch, 17 June 2008)
  - https://s204.q4cdn.com/701424631/files/doc_news/2008/08/1/328191.pdf (gone gold, 14 August 2008)
  - https://s204.q4cdn.com/701424631/files/doc_news/2008/09/1/336620.pdf (25 million, 24 September 2008)
  - https://s204.q4cdn.com/701424631/files/doc_news/2008/12/1/355008.pdf (Z Corp Spore Sculptures, 18 December 2008)
  - https://s204.q4cdn.com/701424631/files/doc_news/2009/01/1/360664.pdf (65 million, 22 January 2009)
  - https://s204.q4cdn.com/701424631/files/doc_news/2009/05/1/381318.pdf (100 million, 4 May 2009)
  - https://s204.q4cdn.com/701424631/files/doc_news/2009/06/1/391304.pdf (Galactic Adventures, 23 June 2009)
  - https://s204.q4cdn.com/701424631/files/doc_news/2009/09/1/409486.pdf (Creature Creator 2-D, 16 September 2009)
- https://gamingnexus.com/News/12411/100-millionth-Spore-creature-created2c-Will-Wright-still-richer-than-you-and-everyone-you-know
- https://gamingnexus.com/News/10981/Capture-Your-Favorite-Spore-Creatures-in-Sculpture
- https://www.digitalengineering247.com/article/electronic-arts-maxis-studio-and-zcorp-pen-agreement
- https://www.awn.com/news/more-250000-spore-creatures-createdand-counting
- https://www.worthplaying.com/article/2008/6/25/news/52393-spore-registers-one-millionth-creature-created/
- https://www.worthplaying.com/article/2009/7/31/news/63886-spore-galactic-adventures-gets-100k-user-created-adventures/
- https://worthplaying.com/article/2008/10/14/news/55732-spore-creepy-cute-parts-pack-new-screens/
- https://www.engadget.com/2009-03-15-sxsw-2009-that-doesnt-suck-inspiring-creativity-with-spore.html
- https://www.engadget.com/2009-05-04-over-100-million-creatures-made-in-spore.html
- https://kotaku.com/there-are-now-over-100-000-000-spore-creatures-5236583
- https://www.engadget.com/2009-09-17-spore-creature-creator-2-d-set-free-in-your-browser.html
- https://www.gamedeveloper.com/game-platforms/gdc-i-spore-i-producer-shaw-details-cross-pollination
- https://www.shacknews.com/article/54609/a-post-release-spore-interview
- https://www.bit-tech.net/reviews/gaming/pc/spore_hands-on_preview/2/
- https://bit-tech.net/news/gaming/ea-clamps-down-on-sporn/1
- https://gamesradar.com/busted-boobalicious-banned
- https://shacknews.com/article/55391/spore-patch-102-released-removes
- https://venuspatrol.com/2009/02/data-mashers-at-the-ready-maxi/
- https://www.gamedeveloper.com/pc/ea-maxis-announces-i-spore-i-api-contest
- https://history.siggraph.org/?p=148956
- https://forum.processing.org/beta/num_1235585586.html
- https://youtube.googleblog.com/2008/06/spore-is-spreading-all-over-youtube.html
- https://gocollect.com/blog/smith-micro-to-distribute-mashon-spore-comic-book-creator/
- https://images-ssl.bestbuy.com/BestBuy_US/en_US/images/abn/2008/tg/pcon/Creature_Creator.pdf (Prima Creature Creator guide)
- https://simscommunity.info/?p=38593
- https://steamcommunity.com/app/17390/discussions/0/3800526843214060559 (July–August 2023 outage thread)
- https://forums.ea.com/discussions/other-ea-games-en/re-spore-maintenance---august-2023/10520722 (thread title only; page blocked)
- https://answers.ea.com/t5/Spore/Getting-Started-with-Spore-Registering-installing-and-connecting/m-p/8014910 (via search summary; page blocked)
- https://gamerant.com/spore-website-first-new-update-5-years/
- https://www.gamesradar.com/games/simulation/16-years-later-spore-returns-with-new-developers-and-a-promise-to-honor-the-god-sims-history-but-no-sequel-or-major-updates/
