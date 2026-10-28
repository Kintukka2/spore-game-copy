# Sporadium: game design document

**Pitch.** Guide one species from a microbe in a tide pool to a galaxy-spanning civilization. Every stage plays as a different genre. Everything you meet — creatures, vehicles, ships — is built from the same part-based Design system, in editors you can open at any time. Your playstyle in each stage earns a green, blue or red card. The cards grant abilities in later stages and decide your species' philosophy in space.

**Pillars**
1. **Creativity is the core.** The editors are joyful, fast and touch-friendly, and every creation lives on in the Codex and in other worlds.
2. **Choices echo.** How you play (peaceful, adaptable or aggressive) carries forward through cards, abilities and archetypes.
3. **Bite-sized on mobile.** Each early stage takes 6–15 minutes. Space is an endless sandbox with a clear long-term goal (reach the galactic core).
4. **Readable and alive.** Chunky outlines, bright palettes, procedural animation, generative music, and a sound for everything.

**Target session:** cell about 6 min, creature about 12, tribal about 10, civilization about 12, then space (open-ended; the core is about 45–90 min in).

---

## Cards and consequences (implemented in `game/cards.ts`)

| Stage | Green | Blue | Red |
|---|---|---|---|
| Cell | Herbivore | Omnivore | Carnivore |
| Creature | Social | Adaptable | Predator |
| Tribal | Friendly | Industrious | Aggressive |
| Civilization | Religious | Economic | Military |

- Each card grants one ability in every later stage (`CONSEQUENCES`).
- A stage must implement the effects of the abilities that apply to it, using `abilitiesFor(state.cards, stage)`. Show them as special ability buttons with cooldowns.
- After Civ, the 4 colours give 1 of 10 archetypes (Mystic, Merchant, Warlord, Envoy, Scholar, Prophet, Gardener, Minstrel, Paladin, Drifter), each with a space superpower.

---

## Stage 1: Cell (tide pool, top-down)

**Fantasy:** a tiny microbe that eats, grows and evolves in a glowing tide pool.

**View and controls**
- Top-down 2D. The camera follows the player's cell.
- Floating joystick (left 60% of the screen). The cell turns toward the stick and swims with inertia; water drag makes it a little floaty.
- One action button: **Call Mate**, which enters the Cell Creator. It unlocks after collecting the first part or about 15 DNA.
- Keyboard fallback via the Joystick.

**Start**
1. A diet choice overlay: **Herbivore** (filter mouth) or **Carnivore** (jaw). The choice sets the starting cell.
2. Build `state.cell` with `generateCell`-like logic, or `blankDesign('cell')` plus a mouth, a flagellum and an eye. Name it `state.speciesName`.

**World and growth**
- The pool is a large wrapped or bounded area with drifting **plant flakes** (green) and **meat chunks** (red).
- NPC cells drift around:
  - Built from `wildPool('cell', ...)` plus `generateCell`.
  - They come in size classes relative to the player: **prey** (smaller, flee), **peer** (same size; herbivores graze, carnivores hunt) and **predator** (larger, chase you).
  - **Giant** cells are very large, slow and lethal. They are absent on easy.
- Damage rules:
  - A jaw bites things in front of it.
  - A spike damages whatever it rams.
  - Poison leaves a toxic trail.
  - Electric zaps everything nearby periodically.
  - A proboscis drains peers alive.
- Killed cells burst into meat chunks.
- **Diet rule:** filter mouths eat plants, jaws eat meat, and a proboscis (or both mouths) eats both.
- **Progress bar:** 5 levels, about 25 DNA each (125 total). DNA comes from food: 1 per morsel, more for big chunks or eggs.
- **Growing up:** at each level the player grows and the camera zooms out (parallax). Previously large cells become smaller relative to you, and new bigger predators drift in from a blurred background layer.
- **Meteor shards** float around. Swimming into one unlocks a new cell part with a toast and `game.unlockPart('c-...')`. The 12 cell parts are in `design/parts/cell.ts`; 6 are unlocked at start.
- **Health:** 6 hearts or a percentage. Death respawns you as a newborn nearby with nothing lost (a short fade).
- Currents: gentle flow fields that push things around.

**Cell Creator**
- `openEditor(game, { design: state.cell, mode: 'stage', budget: dna, currency: 'DNA', unlocked: state.unlocked, bodyResizeOnly: true, tabs: defaultTabs('cell'), required: [{cat:['cell-mouth'], msg}], maxParts: 12, doneLabel: 'Hatch' })`.
- Spent DNA comes off the DNA wallet. Parts stack in the cell stage: 2 flagella = speed 2, and so on. Recompute speed and weapons with `computeStats`.

**Card**
- Track DNA earned from plants vs meat.
- If meat makes up 65% or more → red (carnivore). If plants make up 65% or more → green (herbivore). Otherwise → blue (omnivore).
- Show a diet meter in the HUD.

**End**
1. When the bar fills, show a "Grow a brain?" button.
2. A short cinematic: the cell grows and crawls toward the shore with a light flash.
3. Call `game.completeStage(card, summary)`.

**Achievements:** `first-bite`, `gentle-giant` (no kills), `completionist` (all 12 cell parts), `quickening` (under 6 minutes), `titan-cell` (kill a giant).

**Mood:** `cell`.

---

## Stage 2: Creature (island, 3/4 top-down)

**Fantasy:** your creature walks onto land, befriends or hunts the island's species, and grows a brain.

**Start (Early Creature Creator)**
1. If `state.creature` is null, build one with `creatureFromCell(state.cell, diet)`. The diet comes from the cell card: green → herbivore, red → carnivore, blue → omnivore.
2. Open the editor:
   - `mode: 'stage'` with a budget of about 100 DNA.
   - `allowedDiets` based on the card (omnivore allows all).
   - `required` mouth, `doneLabel: 'Walk ashore'`.
3. Save the result to `state.creature`.

**View and controls**
- A 3/4 top-down open world. One continent, about 2400×2400 world units, ringed by deep water. Entering deep water triggers a sea monster that sends you back to the nest.
- Creatures are drawn side view (`renderDesign`), facing left or right according to movement. Y-sort them for depth.
- The camera follows; pinch to zoom.
- Joystick to move. An ability bar on the right shows **4 buttons** for the current stance:
  - **Social** stance: Sing, Dance, Charm, Pose.
  - **Combat** stance: Bite, Charge, Strike, Spit.
  - A toggle switches stance.
- Plus: a **Sprint** button (if sprint > 0), **Call** (mating call: opens the editor at your nest), and the **special** consequence ability from the cell card (Lullaby, Flock Call or Terror Roar).
- Tap a creature to target it. Auto-target the nearest creature if there is no target.

**World**
- Terrain (perlin noise): grass, sand, rocks, trees and bushes. Fruit grows on bushes; corpses provide meat.
- **8–10 species nests:**
  - Species come from `wildPool('creature', ...)` and `generateCreature` (level 1–4, increasing with distance from your nest).
  - Each nest holds 3–6 members plus babies.
  - Species have a diet and stats from their parts (`computeStats`).
  - Herbivores are curious or neutral. Carnivores are territorial or hostile on normal and hard.
- **Titan (epic) creatures:**
  - 1 or 2 per island. Huge (size about 3–4×), slow, about 10× HP, and kill in a couple of hits.
  - Always hostile and cannot be socialized.
  - Territorial with everyone: any creature that strays near gets chased (a quick lunge for prey, a lumber after you) and stomped. A stomp hits everything in reach, and the survivors and their herd stampede away from the Titan.
  - Killing one gives `titan-slayer` and lots of DNA.
- **Loner (rogue) creatures:** strong, nestless wanderers. They join your pack after a single successful socialization.
- **Bone piles:** scattered across the map. Dig one up (stand on it and tap) to unlock a random locked creature part with `game.unlockPart`; prefer the next tier of parts you already use. 10 piles → `paleontologist`.
- **Events:** a meteor shower partway through, and a UFO abducting creatures now and then (pure spectacle).

**Socializing**
1. Approach a creature in social stance.
2. It performs a random social action (Sing, Dance, Charm or Pose, shown as an icon above it), with a target level equal to its stat.
3. Press the matching button. Your matching ability level vs theirs fills your side of a meter. A wrong action costs progress. If their meter fills before yours, you fail and can retry.
4. Success puts a heart over them. Befriending **3** members of a species makes it an **Ally** (its nest heals you, and its members can join your pack).
5. Pack members add their social stats.
6. **Family:** your own kin at the home nest can join the pack too (tap one, then Recruit; Send home returns them to the nest). The nest raises new family while fewer than two are home. Family near you rush any creature attacking you, your pack or them, and while they defend you their hits count as yours.
7. **Sight and Grasp:** eyes range from Sight 1 (Dozy Peeper, 5 DNA) to Sight 5 (Glowpeep, 130 DNA). Sight widens the camera and minimap and finds nests and bone piles from farther away. Grasp (arms) digs bone piles faster and picks more food from each bush.

**Combat**
- Abilities have damage and cooldowns scaled by level:
  - Bite: fast, melee.
  - Charge: dash, stun.
  - Strike: area melee.
  - Spit: ranged, homing.
- Killing **3–5** members of a species (by level) makes it **Extinct** (its nest becomes a healing spot).
- Killing a baby or eating an egg makes a species hostile.

**Brain and progression**
- DNA comes from befriending or killing individuals (small amounts), allying or wiping out a species (big bonus), bone piles and eggs.
- The brain bar has 5 levels. Each level raises max HP, grows the creature, and adds a pack slot (up to 3).
- Two **migrations**: the nest moves to a new spot, and new species appear nearby.

**Survival**
- A health bar, plus a hunger bar that drains while moving.
- Eat fruit (herbivore or omnivore mouth) or meat (carnivore or omnivore mouth). Eating the wrong food makes you vomit. Health regenerates at friendly nests.

**Mating call**
- Opens the Creature Creator: `mode:'stage'`, budget = current DNA wallet, `unlocked: state.unlocked`, `allowedDiets` from the card.
- Changes apply to the whole species, and your stats are recomputed.

**Card**
- Ratio of species allied vs made extinct. 65% or more allied → green (Social); 65% or more extinct → red (Predator); otherwise → blue (Adaptable).
- If neither count is above 0, base it on individual interactions.

**End**
1. When the brain bar is full, it turns into a **"Become sapient"** button in the top bar. It stays there, out of the way, for as long as you keep playing.
2. A final edit opens (the body becomes permanent after it).
3. Write `state.allies` (designs of up to 3 allied species in your pack; they become pets in Tribal).
4. Call `game.completeStage(card)`.

**Achievements:** `befriender` (5 allied species), `apex` (5 extinct), `titan-slayer`, `pack-leader`, `aviator` (glide 60 m; glide works if the glide stat is above 0 while jumping), `paleontologist`, `slug-life` (finish with no legs).

**Mood:** `creature`, switching to `danger` when attacked.

---

## Stage 3: Tribal (village RTS, top-down)

**Fantasy:** a small tribe around a fire. Gather food, make tools, and win over or wipe out the neighbouring tribes.

**Start**
1. A tribe of 4 members (the species design wearing `state.outfit`, if set) plus the Chieftain (larger, with a staff).
2. A village hut with a food pile and a fire.
3. Pets from `state.allies` (up to 3) live in a pen and lay eggs (food).
4. Offer the **Tribal Outfitter**:
   - `openEditor` with `tabs: defaultTabs('outfit')`.
   - `lockedUids` = all of the creature's part uids, so the body is fixed and only clothing parts are added.
   - Budget: 100 food at first. Clothing grants the `gather`, `combat`, `social` and `health` bonuses.
   - Save the result to `state.outfit`.

**View and controls**
- Top-down map, about 2000×2000, with a pannable and pinch-zoomable camera.
- **Tap a unit** to select it. **Drag** on empty ground pans the camera. **"Select all"** and **"Select idle"** buttons.
- **Tap a target** to issue a context command to the selected units: gather (fruit tree), fish (shore spot), hunt (wild animal), attack, or go to.
- Bottom bar: Buy member (food), Build tool hut (choose from 9), Gift, Outfitter, the special abilities from cards, and **Social/Attack stance** for the group command on rival tribes.

**Economy**
- Food is the currency, used for babies (members), tool huts, gifts and clothing.
- The population cap rises as tribes are won over or defeated: 6 → 8 → 10 → 12.

**Tool huts (6 slots, 9 types)**

| Group | Tools |
|---|---|
| Social instruments | Drum, Horn, Rattle |
| Weapons | Spear (ranged), Axe (melee), Torch (fire, strong vs huts) |
| Gathering | Fishing spear (fishing), Gathering staff (fruit) |
| Healing | Healing staff |

Members fetch a tool from its hut (they walk there).

**Rival tribes (4)**
- Generated species: `generateCreature` with distinct colours, villages spread around the map. Each has a relationship meter and a hut HP bar.
- **Social conquest:**
  1. Bring members with instruments near the rival village.
  2. Start a performance: a short rhythm mini-game. Icons scroll and you tap the matching instrument button on the beat; the number of instruments determines which buttons exist.
  3. Success fills their admiration meter. Gifts (food) also help.
  4. When it is full, they become **allied** and join the totem.
- **Aggressive conquest:**
  1. Attack their members and hut.
  2. Destroy the hut and they are **defeated**: burn the village and loot food.
- Rivals act on their own. They raid your food pile (aggressive tribes, more often on hard), gather, and sometimes send gifts.

**Totem:** one head per tribe dealt with. With all 4, advance.

**Card**
- Tribes won over vs destroyed. All social → green (Friendly); all aggressive → red (Aggressive); mixed → blue (Industrious).
- Food gathered can tip blue: if gathered food is far above the average, push toward blue.

**End:** all 4 rivals resolved → "Found a city" → `game.completeStage(card)`.
- Also set `state.carry.homeName` (village name) for Civ.

**Achievements:** `harmony`, `warpath`, `rancher` (3 pets), `no-losses`.

**Mood:** `tribal`.

---

## Stage 4: Civilization (planet RTS)

**Fantasy:** your city grows into a nation that must unite the whole planet: by faith, by money, or by force.

**Nation type:** `nationTypeFor(state.cards)` (Tribal card green → religious, blue → economic, red → military). It decides the vehicle role and the capture method you start with.

**Start**
1. Design the **City Hall** with the Building editor: `openEditor` with kind `'building'`, `blankDesign('building')` or `generateBuilding(r,'cityhall')` as a template.
2. Design the first **land vehicle** with the Vehicle editor; the role tag goes in `design.meta.role`.
3. Free mode, or a modest budget in Sporebucks (§).
4. Store them in `state.designs['cityhall']` and `state.designs['vehicle-land']`. Later, sea and air vehicles (after 2 and 4 cities) go in `state.designs['vehicle-sea' | 'vehicle-air']`.

**Map**
- A planet surface (one big map, about 3000×2000, wrapped horizontally) with continents and ocean from noise. Show a minimap.
- **10 cities in total**: yours plus 9 others belonging to 3–5 rival nations (each nation has a type, colour and attitude).
- Rival nations appear from the leftover tribes in the first minute.
- **Spice geysers:**
  - About 14 around the map.
  - Claim one with a vehicle (it builds a derrick) for income. Output starts at about §100/s and slowly falls, so factories matter later.
  - Rival derricks can be taken: military destroys them, religious converts them, economic bribes them.

**Cities**
- Each city has a **City Planner** (tap your city): slots around the city hall for **Houses** (population), **Factories** (income, unhappy next to houses) and **Entertainment** (happiness), with Spore-style adjacency bonuses shown as lines.
- Defensive **turrets**.
- Happiness below 0 halts production; above 0 gives a bonus.
- Cities produce vehicles (each costs §; there is a vehicle cap per city).

**Capture (3 methods)**
1. **Military:** vehicles attack the city's turrets and hall. When its defence reaches 0, you capture it.
2. **Religious:** vehicles project holograms near the city and fill a **conversion meter**. Entertainment and turrets resist.
3. **Economic:** vehicles establish a **trade route**; the delivery count fills a **buyout bar**. Then pay § to buy the city.

Captured cities keep their own type (cosmopolitan nations can mix vehicle roles).

**Other systems**
- **Diplomacy:** each nation has a relationship. Gifts (§) improve it; attacks and conversions sour it. Allies won't attack you; hostile nations send vehicles at you.
- **Abilities:** the card abilities from `abilitiesFor(cards,'civ')` are paid in § with cooldowns. Superweapons for your nation type need 6 cities and cost §12,000 per city you don't own:
  - Religious: Great Awakening (convert all).
  - Economic: Grand Merger (buy all).
  - Military: Skyfall (capture all).
- **Controls:** tap vehicles (or "select all") and tap a target. Drag pans; pinch zooms. The bottom bar holds buy vehicle (land/sea/air), abilities, and the city planner.

**Card**
- How the majority of cities were taken. Conversion → green; purchase → blue; military capture or bombs → red.

**End**
1. When all 10 cities are yours, design the **spaceship**: `openEditor` with kind `'ship'`, saved to `state.designs['ship']`.
2. Show a launch cutscene.
3. Call `game.completeStage(card)`.

**Achievements:** `spice-baron`, `peacemaker` (no military captures), `iron-fist` (military only), `architect` (5 designs), `superweapon`.

**Mood:** `civ`.

---

## Stage 5: Space (galaxy sandbox)

**Fantasy:** one starship, a whole spiral galaxy. Explore, terraform, trade spice, make friends and enemies, and journey to the mysterious core.

**Start**
1. If `state.designs.ship` is missing, open the ship editor.
2. Your homeworld is a T3 planet in a yellow star system near the galaxy's rim. You have **§100,000** and the archetype `ARCHETYPES[state.archetype]`, with its superpower button and cooldown.
3. Apply the passive card perks from `abilitiesFor(cards,'space')`.

**Galaxy**
- About 600–900 stars in a 4-arm spiral, generated from the save seed. Star types: yellow, red, blue, white, binary; plus rare black holes (paired wormholes) and proto-planetary disks.
- Each star has 1–6 planets, generated lazily from a seed.
- The **galactic core** is surrounded by a dense ring of **Hollow** systems (the cybernetic antagonist, an original stand-in for the Grox):
  - They live only on dead (T0) worlds, distrust everyone (−70), and attack intruders.
  - They are extremely hard to ally (allying them angers everyone else).
- **AI empires (12–20):**
  - Each has a procedural species (`generateCreature`), a ship (`generateShip`), a colour, an archetype personality, a home system, and colonies spreading over time.
  - Contact them by entering their space.

**Views (all touch)**
1. **Galaxy map:** pan, pinch, tap a star → info card (owner, planets, spice) → **Travel**. Travel range is limited by the drive level; longer jumps need multiple hops (show the range ring). Travelling costs energy.
   - Energy only recharges at a friendly dock: your homeworld and colony systems, or an ally's systems (`World.atDock`). The energy bar shows ▲ while it charges. Elsewhere, Energy Packs ⚡ top it up, and hops without energy strain the hull. A one-time hint explains this when energy drops below 30% away from a dock.
2. **System view:** the star with orbiting planets; your ship flies around (joystick, or tap to move). Tap a planet → planet panel.
   - A world you have not explored yet is drawn greyscale, dimmed and out of focus under a drifting grey haze, beside its "?" label, until you scan it or land. Where canvas filters are missing (older Safari), a thicker haze does the greying.
   - Every settled world (not destroyed, with at least one city) is ringed by orbital defence platforms: one more than its cities, up to 4. They are drawn as hexagonal hulls with solar wings and a swivelling gun, in the owner's colour (teal for yours, red for the Hollow). In combat the live turret craft use the same platform art.
3. **Planet panel:** a 2D close-up of the planet sphere with its stats (T-score 0–3, atmosphere and temperature sliders, spice colour and amount, cities and owners). The available actions depend on context:
   - Scan, Colonize (Colony Pack), Terraform (atmosphere and temperature tools), Plant (flora) and Abduct/Place animals (to fill the ecosystem)
   - Collect spice, Trade (if owned by an empire), Attack (if at war: destroy turrets, then the city), Abduct, Use superpower
4. **Landing** (`surface/`): 🛬 Land on any rocky world that is not destroyed or sealed by the Hollow. The surface is the Civilization-stage map, with colours, seas, ice, mountains and trees matched to the planet's style: terran, lava, ice, toxic or barren. Your homeworld is the very map you united, with all its cities.
   - The ship hovers over the map. Drag to steer, or tap to fly somewhere.
   - Owned worlds show their cities. Each city has 2 turrets on its rim (3 for large cities): squat towers in the city's colour with swivelling barrels.
   - **War on the surface:** landing on a world of an empire you are at war with (and have not charmed) is dangerous.
     - Its turrets fire on your ship within 430 units. Bolts fly toward where the ship is heading, so moving dodges them. Each hit costs 2.5% / 3.5% / 5% of your max hull (easy / normal / hard).
     - A hull bar shows while you fight. At 0 hull you limp to orbit, where the usual destruction rules apply.
     - Tap a city, or use **🎯 Attack {city}** near it, to lay siege: the ship holds off and its laser (your laser DPS) cuts down the turrets first, then the city hall.
     - Turret HP is 120 / 160 / 200. City HP is 450 / 600 / 750, ×1.3 for large cities.
     - A destroyed turret pays §3,000. A fallen city pays §12,000 in plunder and is left as burning, charred ruins.
     - A fallen city counts as razed (`razeCity`, shared with orbital bombing): -30 relations. The last city to fall hands you the world.
   - Herds of animals and patches of flora live on land. A 📡 life scan (radius about a quarter of the planet, 6 s cooldown) marks them on the minimap and points arrows toward them, new species first.
   - **Species tray** (top left): one icon per species living there, plants first, then animals. Each is a dark silhouette until a group of it is spotted on screen or by a scan; then it shows in colour with NEW (not yet catalogued) or ✓ (in the Xenopedia), dimmed once none are left. Tap a revealed icon to fly to its nearest group. It goes compact on rich worlds (more than 8 species).
   - Herds bolt from a fast-moving ship. Hover over a creature (or tap it) and the tractor beam lifts it aboard in about 1.5 s; fly off too soon and it slips away.
     - Beaming up flora takes a living plant sample into the hold, like an animal, plus 2 seed pods while the 60-pod seed vault has room. A full vault no longer blocks it: you get the sample alone, or only seeds if the hold is full. Both full says so.
   - Abduction happens only on the surface now. The Life tab lists the species and offers a Land button. Landing also counts as exploring the planet.
5. **Scanning** (`scan.ts`, `ui/scanCard.ts`): 🔍 Scan in the planet panel, or **quick scan** from anywhere in the system view: right-click a planet (or press and hold it on touch, or press Q for the nearest one). Right-click or hold the star to **sweep** every world at once. A beam, rings and a sweep line play over the planet.
   - The **scan report** card (3.6 s; a sweep 5.2 s; tap to dismiss) shows: T-score with air and heat words, owner, chips for spice (colour and richness), "Can colonise" and "Landable", plant and animal species counts with how many are undiscovered (not in the Xenopedia), wrecks, ruins and any event there. A sweep shows one line per world.
     - There is one card per world: a fresh scan of a world replaces its old card (so spamming Q shows one), and at most two scan cards show at once.
   - Every scan costs ⚡1 energy per world: a planet-panel scan, a quick scan, a sweep (⚡1 for each world it covers) and a 📡 surface life scan. The automatic sweep when you land is free. Without the energy, a toast says what it takes and where to recharge.
   - The first scan of a world you don't own pays for survey data: §400 for a gas giant, §500 for a lifeless rock, §600 + §250 per species for a living world, plus the old wreck (§15,000) and ruin (§8,000 + 2 tools) salvage. Re-scans just show the report.
6. **Protoplanetary disks** (proto stars): a newborn star still wrapped in the dust and gas its planets will form from, so it has no planets. Its belt holds up to 14 asteroids. Tap one and the ship moves within reach; the laser cuts it (about 3 to 5 s at laser level 1, using a little energy).
   - Ore (58%) sells for about §1,500 to §3,500. Ice (18%) gives a 🧊 Ice Comet charge, magma (15%) a ☄️ Meteor Call charge (+§500 each, or §2,500 if you are full). Crystals (9%) hold 2 spice of a random colour (§5,000 if the hold is full).
   - Mined rocks re-form at about one a minute. The star card lists the belt; tapping the star explains what a protoplanetary disk is.
7. **Exploration marks:** visited systems carry a teal check on the galaxy map (gold once every planet is scanned or settled). Planet labels in the system view carry a check when explored or a "?" when not. The galaxy HUD counts systems explored and fully surveyed.

**Xeno-Lab (specimens)** (`xenolab.ts`, `ui/xenoLab.ts`): a building on your homeworld. A 🧬 Xeno-Lab button (with a count of the specimens aboard) appears beside the Galaxy button while you are in your home system, and the homeworld's planet panel has one too. Landed on the homeworld, the Xeno-Lab stands in place of one city site: a glass lab dome, two greenhouse domes, and a fenced paddock where up to 6 of your Menagerie animals roam. Fly over it for **🧬 Enter the Xeno-Lab**, or tap the 🧬 button on the surface HUD. It opens only at home, so specimens are exhibited and spliced there and not from anywhere in the galaxy.
- **Xenopedia:** the first sample of each species is catalogued for a research grant (§2,500 animal, §1,000 plant, §4,000 hybrid). It counts toward the *Xenobiologist* badge. The Life tab tags species not yet catalogued as NEW.
- **Menagerie:** at home, exhibit specimens in the homeworld zoo, up to 24, one per species. Each pays §150/min in tourism; hybrids pay triple.
- **Gene Splicer:** fuse two cargo animals for §6,000. Plants have no 🧬 Splice button, and the splicer only appears once two animals are aboard. The hybrid keeps parent A's skeleton with blended girth, and takes each organ group (mouths, eyes, limbs, weapons, frills) from one parent. It opens in the creature editor to be named and tweaked. Hybrids count as omnivores, so they fit any animal ecosystem slot.
- Specimens still fill ecosystem slots on terraformed worlds.
- **Alien zoos:** about half of the empire colonies run a zoo that buys one kind of specimen from your hold. The kind is fixed per world: 🌿 Botanical garden (plants), 🐄 Grazing park (herbivores), 🦖 Predator arena (carnivores), 🐗 Petting zoo (omnivores) or 🧬 Curio collector (hybrids and rare creatures). Hybrids and rares also sell to the zoo matching their diet.
  - You sell in the planet's Trade tab, under **Specimen market**. The zoo is shown on scan reports ("Zoo buys herbivores"), and empires name theirs if you ask "Do your zoos buy creatures?".
  - Base prices: §3,500 for a plant, §6,000 for an animal, §12,000 for a hybrid, §24,000 for a rare.
  - Tastes: scholars pay ×1.25 for everything and merchants ×0.85. Gardeners pay ×1.3 for plants and herbivores, warlords ×1.3 for carnivores, and minstrels ×1.3 for hybrids and rares.
  - Each sale takes 30% of the zoo's appetite and lowers the next price. Under 10% the zoo is full. Appetite recovers in about 4 minutes, so a zoo takes about three specimens at a time.
  - Each sale is +3 relations ("You stocked our zoos", up to +15).

**Terraforming**
- Each planet has atmosphere and temperature from 0..1 (the T-zone).
- Tools nudge them. Pods use one charge and move a value by 11%:
  - 🌧️ Storm Pod: air +11%.
  - 🏜️ Drought Pod: air −11%.
  - ☄️ Meteor Call: heat +11%.
  - 🧊 Ice Comet: heat −11%.
- The ship's unique tools cost ⚡8 and move a value by 5%:
  - 🌀 Cloud Engine (+) and Cloud Siphon (−) for air.
  - 🔥 Heat Lance and ❄️ Frost Lance for heat.
- **Terraforming view** (`ui/terraformView.ts`): clicking the Terraform tab (or 🌍 Terraform in the Overview) opens a full-screen view of the world. The space stage pauses while it is open.
  - Layout:
    - Along the top: the T-score with stars and Stable / ⚠ Unstable / Paradise, plus an Atmosphere bar and a Temperature bar. Each bar shows the T1–T3 bands as nested green zones and a marker for the world.
    - Top right: the climate chart, with atmosphere across and temperature up.
    - Middle: the planet, big and spinning. Drag to turn it.
    - Bottom: one card per tool.
  - **Arrows:**
    - Each card shows its push on the chart (→ Air +11%, ← Air −11%, ↑ Heat +11%, ↓ Heat −11%), its count or ⚡ cost, and its key (1–9).
    - Hovering or focusing a card draws a dashed arrow on the chart to where the dot would land, labelled with the T change (T1→T2), green for better and red for worse.
    - The chart keeps a dotted trail of where the world has been.
  - **Animations.** Each tool plays out on the globe, and the change lands at impact:
    - Storm Pod: a capsule streaks in and bursts into a wheeling cyclone, with rain across the face, lightning cracks with thunder, and fresh cloud banks.
    - Drought Pod: a capsule detonates in a shockwave that rings round the world. A dust storm billows, and the sky boils off the limb into space.
    - Meteor Call: five meteors with fiery tails strike in turn, with screen shake. Each leaves a crater whose molten core cools from white-hot to red, while heat haze rises.
    - Ice Comet: a comet arrives with its tail streaming away from the sun. Its impact flash sends a frost wave across the world, frost patches spread, polar caps creep down and snow falls.
    - Cloud Engine: your ship (your own design) flies in, holds station and vents vapour plumes onto the world. Cloud Siphon draws the haze off the limb up a pale funnel into the ship.
    - Heat Lance and Frost Lance: the ship burns, or freezes, a glowing line across the crust with a wobbling beam.
    - 🌱 Genesis Seed (asks first): a glowing seed drops in. A green wave spreads, and flowers bloom across the world.
  - The globe is drawn from the shown climate, which eases toward the real one over a second or two, so the planet visibly turns as the dot moves: barren rock greens over, ice caps grow and the halo thickens.
    - Crossing a T ring flashes a banner (🌍 T2 world! with stars and sparkles, or ⚠ Down to T1).
    - The line under the cards then sums up the change, for example "Atmosphere 22% → 33% · T0 → T1", and warns when the world is unstable.
  - A tool picked while another plays is queued: the card pulses and fires next. Esc or ✕ closes the view.
  - The view renders its planet from a finer 256-wide texture. Textures now blend coastlines, crater rims and ice cracks over a sliver of height, so they stay smooth up close.
  - The Terraform tab keeps the chart, an **Open the terraforming view** button and one button per tool, each with its arrow. Hovering a button previews it on the chart, and clicking it opens the view and fires that tool.
- **T-score:** the distance from the ideal centre maps to T0..T3. A planet's ecosystem needs plants and animals to match its T-score; let players place them through simple slots.
- A higher T-score allows more colony buildings and more spice.
- Raising a planet to T3 gives `terraformer`.

**Colonies and spice**
- A colony produces spice per minute (by planet richness, its colour rarity and the number of buildings). Spice is collected by visiting or automatically into storage.
- Every colony is a shipyard like home: its planet panel has the Tool shop and 🛠️ Redesign ship, your hull repairs itself in your systems, and energy recharges there. Only the Xeno-Lab is the homeworld's alone.
- Sell spice at empires. Prices vary per empire, per spice colour, and by **supply and demand**.
  - Selling asks first. "Sell 5 × Verdance?" quotes the total (about §X, with the average each, since every sale lowers the price); [Keep it] backs out.
  - Each sale lowers that spice's demand (×0.955) and each purchase lowers it too (×0.97), so selling pays less and buying costs more. Demand drifts back toward normal over a few minutes (about 10% of the gap a minute), never past it.
  - The Trade tab's prices tick live. A spice still recovering shows "↗ recovering", so the change is plainly the clock and not the tab being reopened.
  - Every empire's spice prices also follow the **Galactic Spice Exchange** index for that spice. A trade row shows "📈 exchange +12%" when the exchange has pushed it more than 5% from normal, and the tab has an **Open the Spice Exchange** button.

**Galactic Spice Exchange** (`market.ts`, screen in `ui/exchange.ts`)
- A live price index per spice (around 1.0, held between 0.35 and 3). Every 5 seconds of market time it moves by momentum, noise (rarer spices swing harder) and a pull back to normal. 30 minutes of history are kept (360 ticks), and a new game starts with 30 minutes of made-up history so the charts have a past.
- **What moves prices:**
  - **News**: a headline every 60–120 s, built from real names nearby (worlds that grow the spice, met empires, nearby systems). It jumps the price at once, then pulls it toward a new level that fades over about 2½–4 minutes.
    - Up: crop blight, pirates seizing a convoy, a craze among an empire's nobles, an empire running short, an empire stockpiling, Hollow drones cutting the lanes.
    - Down: huge new seams, lab-grown spice, an import ban, a bumper harvest.
    - Market-wide: the Festival of Lights (everything up), a credit crunch (everything down).
    - **Rumours** ("Unconfirmed: … reserves near exhaustion?") move the price, then fall apart 50–90 s later with a "Rumour debunked" headline that snaps it back.
  - **You**: selling physical spice at an empire drags its index down and buying lifts it. Dump enough of one spice in a short time and "A mystery trader floods the market with Ember" makes the news.
  - Founding a colony on a new world ("New Ember colony founded on …") and declaring war on an empire ("War with … rattles the Ember market", for the spice they make most of) make headlines that move prices too.
- **The screen** opens from the 📈 button at the end of the HUD's top row. The icon turns 📉 when the index is down over five minutes, and a badge counts unread headlines (gold when a job is waiting). The galaxy waits while it is open, but the market keeps running.
  - **Header**: the Galactic Spice Index (GSI, every spice weighted by value, around 1,000) with its 5-minute change, a 🐂 Bull / 🐻 Bear / 😐 Steady mood pill, and your cash.
  - **Ticker tape**: an amber LED marquee of every spice code, price and change, plus the latest headlines.
  - **Spot board**: the six spices (EMB, SUN, AZR, VRD, BLS, UMB) with a sparkline, the contract price, the 5-minute change and how many you hold. Prices flash green or red as they tick. Keys 1–6 pick one.
  - **Chart**: candles or a line over 5, 15 or 30 minutes, with a moving average, a dashed live price with a pulsing dot and an axis tag, and your average cost as a violet line. Each headline that touched the spice is flagged where it hit, with its icon; hover a flag to read it. A crosshair shows the price (or open, high, low and close for a candle) and how long ago.
  - **Stats**: the range high and low, volatility (Calm, Lively, Choppy, 🌪️ Wild), the news mood (🐂 Bullish, 🐻 Bearish, ❓ Rumours, Quiet), and your position with its profit or loss.
  - **Order ticket**: Buy or Sell (B and S keys), a quantity with 1 / 10 / 100 / Max chips, then the market price, the estimated average after slippage, the 1.5% broker fee, the total cost or what you receive, and the break-even price or the profit on what you sell. Placing an order asks first ("Buy 10 Umbral contracts? About §8,799 each: §89,311 in all…"; a sale also spells out the profit or loss on it), and the market holds still while you decide.
  - **Contracts** are paper spice: base price × 8 × the index, no hold space, bought and sold only here. Every order moves the price a little against you.
  - **Your contracts**: each holding with its value and profit or loss (tap one to sell it), then totals for value, open P/L and banked P/L.
  - **The back room**: 🕵️ Zix the Whisper sells a tip about the next headline (§15,000 and up, more as your portfolio grows). He names the spice and which way it goes, and he is right three times in four. Once the story breaks, the screen says whether he called it.
  - **News wire**: every headline with a BREAKING / RUMOUR / MARKET / YOU tag, how long ago, its impact (EMB ▲▲, ALL ▼, a ? for rumours, ↺ for a debunk) and the countdown to the next story. New ones flash in. Tap one to chart its spice.
  - **Jobs from the news**: shortages and pirate raids open a job for 5 minutes. Taking one adds a mission, and finishing it makes the news and pushes that spice's price back down.
    - Relief run: deliver N of the spice to any world of the empire that is short of it (7 minutes; pays about 30 × base a unit).
    - Break the hoard: destroy the pirates sitting on the stolen cargo in a nearby system (9 minutes). The mission sheet lists the giver as 📈 Spice Exchange.
- While the exchange is closed, big headlines reach you as toasts: anything that touches a spice you hold (as contracts or in the hold), a move of 20% or more, market-wide news, stories about you, and stories that open a job.
- **Threats:**
  - Pirate raids: an event that is "your colony is under attack" with a timer. Fly there and fight, or lose spice.
  - Eco-disasters: a timer; fix it or lose species.

**Random planet events** (`events.ts`): every 3 to 6 minutes something happens on a world within about two jumps of the ship (never in Hollow, black-hole or at-war space). At most 4 events run at once, and at most 2 of them are opportunities. Threats show as red alerts, opportunities as gold ones. The planet panel's Overview shows a banner with a timer and the actions.
- ☄️ **Meteor storm** (threat, a colony, 2:40): a full-screen minigame (`ui/meteorDefense.ts`). Tapping the ☄️ alert in that system, or **Man the planetary gun** on the planet's banner, opens it. From farther away, the alert sets course there and the gun opens a moment after you arrive. Arriving without a course set only toasts a reminder.
  - The view shows just the colony world in the middle, its city lights and a gun turret on the rim. 12 / 15 / 18 meteors (easy / normal / hard) fall in from every side, faster as the storm goes on. A red chevron at the screen edge warns where the next one comes from.
  - Tap a meteor to shoot it. Big ones (30%) split into two fragments. Kills within 1.4 s of each other chain a combo worth §150 per step.
  - Each impact drains 3 spice from the store, and every second one flattens a building (named on screen).
  - When the last rock is gone, ore salvage pays §15,000 minus §3,000 per impact (minimum §3,000). The event's timer waits while the gun is manned. If you never show up, the store empties and two buildings go. An orbital turret sometimes breaks the storm up alone.
- 🆘 **Distress call** (any nearby world, 3:30): a stranded freighter drifts near the planet with an SOS beacon. Fly to it and the captain hails you (a conversation, see below; in empire space it is one of theirs, unless you are at war with them, when a neutral freighter is stranded there instead). Towing costs ⚡25 energy, shown as a `[−25 energy]` tag. Without the energy the replies are greyed out, and the crew asks you to recharge and come back. **Tow them out** for §9,000 to §15,000 and, in empire space, +12 relations ("You rescued our stranded crew"). **[Barter]** for §5,000 more, at -6 relations. Or leave them (-8).
  - 30% of calls are pirate bait: the "captain" drops the act mid-sentence. **[Fight]** and three raiders de-cloak (beating them pays their loot), or pay them §8,000 to go away.
- 🗿 **Ancient signal** (a landable world you do not own, 7:00): land, sweep with life scans (the relic is buried far from where you touch down) and beam up the glowing monolith (2.2 s). Collectors pay §22,000 to §38,000, plus 2 terraform pods or packs, 1–2 components (leaning rare) and a 55% chance of a blueprint.
- ✨ **Rare sighting** (a landable world with animals, 5:30): a one-off, recoloured cousin of a native (Golden, Starlit, Prism, Ghost or Ember …). It roams alone, bolts from your ship within 230 units at 128 speed, and must be chased down. It earns a §10,000 Xenopedia grant, a §8,000 bonus, and triple Menagerie crowds.
- 🛍️ **Wandering trader** (any nearby world, 5:00): **Visit the trader** starts a conversation with the merchant (who they are, where the goods come from, what is in the crate). **[Barter]** opens the barter screen (`ui/traderView.ts`), Fallout style, and leaving it returns to the conversation.
  - The merchant's face fills the space behind an amber terminal frame, and their quips are typed across the top.
  - Two columns: **Your goods** (what they buy from you, with your credits) and **their wares** (with your hold). Tap or press Enter to mark items into the deal. Hovering only moves the highlight; it never rebuilds the rows, so mouse clicks always land. The highlighted item's description shows below, then the totals ("You pay · You get · Net"), shown in red if you cannot cover them. Then [A] Accept, [R] Reset, [C] Open crate, [Tab] Leave.
  - Accepting asks first in a terminal box: "Strike this deal? You buy: … (§X). You sell: … (+§Y). Net cost / You gain …". [A], Enter or Y strikes it; Esc cancels.
  - Accepting sells first, so your sales pay for your buys. Items you cannot take (no room, already owned) are greyed out.
  - The wares, each a one-off:
    - a consumable tool bundle at half price (up to one rank ahead of yours)
    - a buyer for your most valuable spice at 2.4× its base price
    - a §15,000 **mystery crate**
    - and, when stocked: a **blueprint** (60%, a quarter of the part's price), a bundle of 2–3 **components**, and a **finished part** (50%; 75% of its price, or 110% for advanced parts, which then need no blueprint or components).
- 🛰️ **Derelict wreck** (any nearby world, 5:00): a dead hulk tumbles near the planet, shedding debris, under a dashed cyan ring labelled "🛰️ Salvage".
  - Fly to it and a Fallout-style loot screen opens (`ui/lootBox.ts`): the wreck's name, a list of what is aboard with a description of the highlighted item, and [E] Take all.
  - Inside: §3,000–8,000 in scrap and 2–4 components. There is also a 30% chance of a blueprint, or a 15% chance of a finished part or a stack of consumables.
- 📦 **Mystery crates** (`crate.ts`, `ui/crateOpen.ts`) go to your hold (up to 9) and are opened from Ship → Cargo or at the barter screen. Opening takes over the screen: the crate drops in and rattles harder and harder while light leaks from its seam (tap to skip), then bursts in a white flash. The lid flies off, rays spin, and the prize rises out in its rarity's colour with a card to Collect.
  - Prizes: Legendary (6%) is a rare creature in a stasis pod, shown as the creature itself (needs a free hold slot). Rare (about 32%) is §30k–50k in credits. Common (30%) is 3 terraform pods. Salvage (12%) is a blueprint (epic) or a bundle of components (common). Epic (12%) is a colony gadget (silo, bio shield or orbital turret). Junk (8%) is packing peanuts.
- 🚀 **Refugee fleet** (a colony with room for another city, 4:20): **Hear their plea** to talk to their elder. Take them in for a free city (or §12,000 if the colony filled up meanwhile), ask what they offer and where they come from, or turn them away.
- ☣️ **Outbreak containment** (`ui/outbreak.ts`): an eco-disaster's planet panel (Overview banner, Life tab, or a tap on the globe) offers **Contain the outbreak**, a full-screen minigame. It shows just the world, big and spinning (drag to turn it, with inertia), its infection spots, the clock, spots left and spots purged.
  - Spots age from green through yellow to red, then **spread**: a new spot appears nearby, at most 12. They spread every 12 / 9 / 7 s on easy / normal / hard.
  - Spots on the far side show as blips on the rim at their height, brighter as they come round.
  - Spots ride with the ground as the world turns, in the same direction as the texture. The planet panel's markers do too.
  - Big pulsing ◀ ▶ arrows (beside the world, or under it on narrow screens) count the hidden spots on each side. Tapping one spins the world so the nearest hidden spot faces you.
  - When nothing is in view but spots remain behind, a hand swipes across the world with "Swipe to spin · N on the far side".
  - Purges within 1.6 s of each other chain a combo worth §200 per step.
  - Clearing them all contains the outbreak (§10,000) and returns to the panel; running out of time ends it as before.
- Opportunities that time out just end with a note. The timer waits while you are fighting in that system, or while you are down on the surface for a relic or rare sighting.

**Conversations** (`ui/talk.ts`), in the style of the Fallout games. Every talk with an alien uses them: first contact, hails, tribute demands, system sales, the trader, refugees and distress calls.
- The speaker fills the screen in close-up: the camera frames their head (the front spine node and the eyes and mouth on it), the body runs off the edge, and the mouth moves while they talk (the `talk` pose action). Behind them is their colour as a glow (red when angry), drifting motes, scanlines and a burst of signal noise as the channel opens.
- Their line is typed across the top, with a voice blip and a beat after each sentence. Tap the scene to finish it.
- Your replies sit in a framed terminal menu at the bottom: amber text in Share Tech Mono (green for the Hollow), the highlighted reply boxed, the speaker's name on the frame, and your credits and their stance and relation bar opposite.
  - Tags in brackets mark checks, prices and actions: `[Relation 70]`, `[§50,000]`, `[Bluff 45%]`, `[Barter]`, `[Leave]`. A check you fail shows its tag in red and the reply greyed out. You can still pick it, and they turn you down.
  - Replies you have already picked are dimmed.
  - Keys: ↑/↓ or W/S, Enter, 1–9, and Esc for the goodbye or back reply. The game is paused, and the talk owns the keyboard.
  - Relation changes are announced the way Fallout announces a companion's opinion ("Droo Republic liked that (+10)."), along with short notes such as "Mission accepted".
- Each archetype has its own voice (`ui/diplomacy.ts`): reactions to the first-contact replies, an "about us" line, greetings by stance (allied, warm, cool, cold, war), and lines for gifts, work, alliance, war and tribute. The Hollow speak as a machine.
- **First contact**: their greeting, then "We come in peace.", "[Intimidate] Behold our might!" or "Stay out of our way.". Their reaction leads straight into the hail menu.
- **Hail menu**: every topic is its own conversation path, not a button.
  - **Work**: "Do you have any work for us?" (or "Any more work for us?").
    - Never offered by an empire you are at war with, the Hollow included. Declaring war, by either side, cancels the jobs that empire gave you.
    - Their pitch, then [Accept], "Tell me more." (where, why, how long and the pay), "[Barter N%] Make it worth our while.", "Let me think about it." (the offer stands) or [Refuse].
    - Barter is one try per offer: +25% reward on success, -3 relations on failure. The odds are 35% + relation/200, +15% with merchants, kept between 10% and 85%.
    - With 4 missions running, [Accept] shows a failed `[Missions 4/4]` check and they ask you to finish or drop one first.
  - **The current job**: "About the job you gave us..." gives the job's status and time left. From there: a reminder of the details, or [Abandon] with a confirm.
  - **Trade**: below relation 30 they explain what would win them over. At 30+ you choose which of their three nearest ports the route serves. Once it runs, "How is our trade route doing?" explains what it earns.
  - **Gifts**: §10k / §50k / §250k, and their reaction depends on how much it moved them.
  - **Alliance**:
    - Below 70 they say where trust stands and how to earn it, and the [Relation 70] reply fails.
    - At 70+ they offer it. "What would an alliance mean?" explains the escorts, energy at their docks and the shop discount.
    - Allied: "About our alliance..." can confirm it or [Betray] it, with a confirm. An alliance with the Hollow needs a confirm too.
  - **Peace** (at war): "Can we end this war?" names their price. Then [§price] pay, "[Barter 40%] Peace is worth less than that." (-30% on success, once), "Why should we pay you?", or fight on.
  - **Embassy** (in their system, with one in the hold): they ask what you have in mind, then [Embassy] builds it. The **Goodwill Beacon** is also offered in their system.
  - **Questions**: about their people, how they feel (the strongest good and bad modifiers, also listed as notes), what they trade in (what they make and what they pay best for), which of their zoos buy which creatures, and rumours (the nearest live event, or uncatalogued life near their home).
  - [War] with a confirm, and [Leave].
    - The confirm is the "Is that a threat?" line with a red ⚠ WARNING box. The box spells out the cost: your alliance ends, your trade route closes, relations drop by 50, their warships and colony turrets open fire, and making peace later costs about the peace price.
    - "No. Just a bad joke." comes first and starts selected, so Enter or Esc backs out. Clicks are ignored for 0.7 s after the warning appears, so a double-click on [War] cannot declare it.
- **Tribute**: pay, refuse (they may declare war), or **[Bluff]**. The bluff's odds are 50%, ±6% per system you hold more or fewer than they do, -15% against warlords, kept between 10% and 85%. A failed bluff counts as a refusal and costs -5 more.
- **System sale**: [§price] Deal, or Not now. A free handover is [Accept]. The empire offers once, when the takeover bar fills (`EmpireSave.offered`). After that, ask from the planet's Trade tab ("🏳️ Ask to buy this system").

**Diplomacy**
- A relationship meter per empire: **Allied / Friendly / Neutral / Wary / Hostile / War**.
- Modifiers: gifts, missions completed, trade, shared archetype, the galactic law (destroying planets angers everyone nearby), alliances and wars.
- Missions from empires, randomly generated, with § rewards:
  - Deliver spice X
  - Scan a creature
  - Destroy pirates
  - Terraform a planet
  - Explore a system
- Alliance: an allied escort ship joins you.
- **Economic takeover:** trade enough with a system to buy it.
- War: empires send fleets to your colonies.

**Combat**
- Real-time in the system view. Your ship has health, energy and weapons: laser, missiles, pulse, and bombs to break planetary defences.
- Enemy ships are rendered with `renderDesign` from their ship design at small size.
- Tap an enemy to target it; weapons fire automatically, each at its own rate.

**Interface: the Nav-Boy 3000 and the phosphor screens**
- The Nav-Boy and the shipyard terminal are Fallout-style phosphor screens. Their colour is one choice for both: green (the default, as in Fallout 3), amber (as in New Vegas), blue or white, picked with the knob (or the ◐ button on phones) and saved with the game (`SpaceSave.phosphor`).
  - `ui/phosphor.ts` sets `--ph` CSS variables for the text, and an SVG colour-matrix filter (`#ph-f`) that turns the pictures and emoji on those screens into the phosphor colour. Living things (alien species, your species, specimens) are left in their own colours under the scanlines, as aliens are in a conversation, so the generated variety stands out. Icons on both screens are in colour too (a spice's dot and orb in its own colour), and entries you own, or can't use yet, fade back. The ship and the blueprint drawings stay in phosphor.
  - Every other screen (the HUD, planet panel, star card, sheets, dialogs, the exchange, conversations) keeps its own look; the HUD buttons simply open the Nav-Boy and the shipyard.
- **The Nav-Boy 3000** (`ui/navboy.ts`) is your wrist computer, after Fallout's Pip-Boy. Tab opens and closes it (M still toggles the map). The HUD's rank badge, money chip, 📜 and 👽 open it on the matching page. The galaxy waits while it is open.
  - **The casing**: worn olive metal with an energy gauge (its needle follows your energy), a ribbed scroll wheel, a "Nav-Boy • Model 3000 •" plate, the display knob, screws, vents and a status light. On phones the casing shrinks to a thin bezel around the screen.
  - **The screen**: a curved CRT with scanlines, a rolling scan bar, vignette and glow. It powers on with a flash of a horizontal line, and flickers when you switch tabs.
  - **Three buttons** under the screen, STATS, ITEMS and DATA (F1–F3 or 1–3; ◀ ▶ step through them). The lit one glows orange.
  - Each button has a header line (its name, then boxed readings) and pages along the bottom, joined by a line with the current one boxed (← → or A / D switch page).
  - Most pages are a list on the left (↑ ↓ or W / S; a small ■ marks the tracked mission, the station playing, fitted parts) and the highlighted entry on the right: a phosphor picture, its actions as "Label [K]" prompts, stat boxes in Fallout's DAM / WG / VAL style, bars, lines, and a description box. Hovering highlights, a tap on the highlighted entry runs its first action, and anything costly asks first in a terminal box.
- **STATS** (header: rank, hull, energy, badge points toward the next rank; `ui/nbStats.ts`):
  - **Status**: Hull (your ship drawn in phosphor, hull and energy bars, [R] Repair Pack), Energy (a bank of cells filling to your charge, [P] Energy Pack), your superpower ([U] Use) and Effects (docked, in combat, allies, trade routes, Menagerie income, systems held, card perks, wars).
  - **Systems**, the S.P.E.C.I.A.L. page: every ship system with its level (Star Drive, Laser, Missiles, Pulse Ring, Cargo Bay, Energy Cell, Hull Plating, Deflector, Planet Bombs, Rift Key), each with its blueprint drawing, what it does now and the next upgrade's price, rank and blueprint. Then your design's Power, Armour, Speed and Energy ([G] Redesign at your homeworld or any of your colonies).
  - **Badges**, the Skills page: your rank (with the whole rank ladder) and each badge's level, count and progress to the next.
  - **Perks**: your archetype, its superpower and the card perks from earlier stages.
  - **General**: your reputation (Galactic Hero to Notorious, from how every empire you have met feels about you), with your species standing beside it like Vault Boy (in its own colours), then your record: systems visited, worlds scanned, colonies, spice sold, exchange trades, kills, missions, species catalogued, wrecks salvaged, time in space and credits.
- **ITEMS** (header: hold, hull, armour, credits; `ui/nbItems.ts`): the cargo hold. Spice (a glowing orb with its exchange code; VAL / HOLD / EXCH), Specimens, Aid, Parts, Blueprints (READY when every component is aboard) and **Contracts**: your exchange holdings with a price line, value, P/L and average, [X] Sell all (it asks first, with the profit or loss) and [O] to open the exchange.
- **DATA** (header: where you are, and the stardate and time: one game second is a minute; `ui/nbData.ts`):
  - **Local Map**: this system in phosphor: the star, dotted orbits, worlds (squares for your colonies, rings for empire worlds), a solid ▼ quest marker over mission targets, a blinking ! for alerts, and your ship as a ▲. Pick a world for its T-score, owner, spice and missions; [E] flies there, [O] opens it.
  - **World Map**: the whole galaxy (drag to pan, wheel or + / − to zoom): visited stars bright, the rest dim, ⌂ home, ■ yours, rings for met empires, × for the Hollow, ✦ the core, ▼ missions and ! alerts. [E] sets course, [H] jumps to home, [C] back to you.
  - **Quests**: missions (main ones first) and alerts. [E] Track makes a mission the one the HUD follows (`SpaceSave.tracked`), [L] locates it, [X] abandons it (asked first); alerts have [E] Go there.
  - **Contacts**: every empire you have met, its species in full colour, relation, systems, trade route, the feeling bar and their strongest reasons. [E] Hail, [L] Locate their home.
  - **Notes**: your species' whole history, from the tide pool on, newest first.
  - **Radio**: stations that change the music, with a live waveform when one is on air: Deep Space Ambient, Exchange Wire (lounge music and the latest headlines), Primordial Soup FM, Wild Frontier Radio, Drum Circle 104, Civic Broadcast, Victory Hall, or off. The choice is saved (`SpaceSave.radio`); combat still brings in the danger music.
  - **Market**: the Galactic Spice Index and every spice's contract price and move, with a price line and the latest story about it. [E] opens the trading floor.

**Progression**
- A **badges and ranks** system: counters for exploring, trading, colonizing, fighting and terraforming. Ranks unlock tools to buy (better weapons, drives 1–5, more cargo, terraform tools, Colony Pack upgrades).
- The **shipyard** (`ui/shopTerm.ts`, from 🧰 in the HUD or a planet's Tool shop button) is a wall-mounted Fallout terminal: a SHIPYARD plate with the dock's name, the phosphor screen, and "STARCO INDUSTRIES (TM) TERMLINK" with the display knob along the bottom.
  - One page per category (Ship, Weapons, Colony, Terraform, Social). Each tool shows its icon in colour (faded once owned or while locked), its price, or [Rank] while locked, OWNED, FULL, 🔒 III (fit the tier before it first), 📐 ? (no blueprint) or 🔩 … (short of components).
  - Upgrades go in order (`needsTier` in `salvage.ts`): you can only buy or build the next tier of a line, so Hull Plating IV needs Hull Plating III, and Sunspear Laser needs Lance Laser. A skipped tier's entry lists the one to fit first and has no Buy or Build. A blueprint for a later tier can still be found and its components collected; ITEMS → Blueprints marks it Locked (not READY) until the tier before it is fitted.
  - The highlighted tool shows its icon large, always in the same spot (the actions float top right), PRICE / RANK / OWN boxes, the blueprint and component lines for advanced parts, and its description.
  - A part in a line of tiers (Star Drive II–V, Cargo Bay, Energy Cell and Hull Plating II–IV, the lasers, missiles and rings) has an aura behind its big icon that grows with the tier (`ui/aura.ts`): a green glow and halo, then a turning blue ring with orbiting motes, a violet double ring with twinkles, and for the top of every line a gold corona of rays, embers and three rings. Pips under the icon count the tier. Blueprints in ITEMS show the same aura.
  - [E] Buy asks first in a terminal box ("Buy 🩹 Repair Pack for §12,000? You have §400,000, and 1 already aboard."). [E] Build in hangar opens the hangar for ship parts, and the terminal comes back when you leave it.
  - Shipyards are at your homeworld, your colonies and allied empires. Anywhere else the terminal reads DOCK: Browse only, and [C] sets course to the nearest one.
- **Blueprints and components** (`salvage.ts`): advanced parts need more than rank and credits. You also need the part's 📐 blueprint and the components its recipe lists, which building it uses up.
  - Component rarities are colour-coded wherever the text names them ("uncommon component" in loot, the cargo hold's Rarity line, trader deals): silver for common, green for uncommon, blue for rare (`RARITY_COLOR`, `rarityText`).
- **Hangar** (`ui/hangar.ts`): every ship part, and anything built from a blueprint, is fitted in the hangar rather than bought outright.
  - The hangar opens from the shipyard terminal's [E] Build in hangar, once you have the money (and the blueprint and components). Plain consumables are bought after a confirm. The space stage pauses while it is open.
  - **The bay:**
    - Your own ship hovers on a docking pad between two yellow robot welding arms, floor-mounted with two-bone IK, under ceiling lamps.
    - A hazard-striped bay door looks out on space, with a "BAY 04 · REFIT IN PROGRESS" sign above it.
    - The floor has perspective lines.
  - **The blueprint** is pinned up beside the ship (above it on narrow screens), drawn as white lines on blueprint paper. It holds:
    - a schematic for the kind of part (drive nozzle, cargo crate, cell bank, hull plates, laser barrel, missile, emitter rings, a fabrication cage), with a dimension line and a sweeping scan line;
    - SPEC, which is the new part's effect;
    - WAS, the part it replaces (or the stock fitting);
    - COST;
    - a checklist of the components, ticking ☑ as each is welded in.
  - **Sockets** are glowing hex slots on the hull, one per component unit.
    - Where they sit depends on the part: drives at the stern, weapons at the nose, cargo and cells amidships, plating along the hull.
    - A plain upgrade has a single module crate to fit.
    - Consumables (Bio Shield, Embassy) are fabricated in an energy cradle in front of the faded ship instead.
  - **Fitting parts:**
    - Drag a component chip from the tray onto the ship, and it snaps into the nearest free socket for it. You can also tap a chip, or use ⚙️ Auto-install.
    - The part arcs into its socket with a clunk. The arm with less work queued swings over and welds it in, with sparks that bounce on the floor, and the socket turns green.
  - **Build · §price** unlocks once every socket is done, and asks first ("Build Cargo Bay II? Every part is seated. Pay §9,000…"; Not yet keeps you in the bay). Paying:
    - takes the money and uses up the components;
    - makes the whole bay go to work, with both arms welding everywhere, electric arcs crawling over the hull and the ship flashing;
    - gives the part a test run: a long blue test burn for drives, a beam for lasers, missiles launched off the nose, a shockwave ring, a deflector bubble, fireworks for the beacon, or rings for cargo, cells and plating;
    - ends with "🚀 Star Drive V installed!" and the part's effect, then ✓ Done returns to the shop.
  - Leaving before you pay costs nothing.
  - Advanced parts: Star Drive IV–V, Cargo Bay III–IV, Energy Cell III–IV, Hull Plating III–IV, Rift Key, Sunspear Laser, Seeker and Starfall Missiles, Nova Ring, Deflector, Thermal Lance, Bio Shield and Embassy. For Bio Shield and Embassy, the components are needed per item.
  - Components:
    - Common: 🔩 Alloy Plating, ⚛️ Fusion Cell.
    - Uncommon: 🧲 Grav Coil, 🔷 Focus Lens, 🔥 Plasma Injector, 🧪 Bio-gel.
    - Rare: 💠 Quantum Core, 🔮 Warp Crystal.
  - In the shop, an advanced part shows chips: 📐 blueprint, then each component as have/need, green when met. The button reads 📐 Blueprint, 🔩 Parts, or 🔧 §price once you can build it. 📐 and 🔩 open a popup listing what is missing and where it comes from.
  - **The recipe is on the blueprint.** Until you hold a part's blueprint, its components stay unknown: the shop shows "📐 No blueprint · ❔ Components unknown", the popup says the blueprint lists them, and a blueprint offered as loot only says to take it to learn what it calls for. A component in the hold names only the blueprints you hold that use it.
  - The cargo hold lists your components and blueprints, with recipe progress. Blueprints for parts you already built are hidden.
    - Each component line reads have/need, with a ✓ in green once met.
    - A blueprint with every component aboard gets a blinking green READY badge in the list, and its description says where to build it.
    - Shop recipe chips gain the same ✓.
  - **Engineering call** (`engineerTalk` in `ui/encounters.ts`): the moment salvage completes a blueprint's recipe, your Chief Engineer, one of your own species, calls in a Fallout-style conversation. It happens once per blueprint.
    - The engineer reports: "we have every component for the Cargo Bay III. That is 3 Alloy Plating, 1 Grav Coil."
    - **[Set course]** plots a course to the nearest shop (yours or an ally's). "What will it do for us?" describes the part, and [Leave] closes the call.
- **Cargo hold**: the Nav-Boy's ITEMS button (`ui/nbItems.ts`), opened from the money / 📦 chip in the HUD. See the Nav-Boy below.
  - The Nav-Boy, the shipyard and the barter screen share one terminal confirm box (`terminalAsk` in `ui/talk.ts`).
- **Quick use:** a small ＋ at the end of the HUD's hull and energy bars uses a Repair Pack or an Energy Pack straight from the hold.
  - A badge shows how many you carry.
  - The button greys out when you have none or are already full, and its tooltip says why.
  - Tabs: Spice, Specimens, Aid (consumables), Parts (components) and Blueprints, each with a count.
  - The item list sits on the left. On the right is the highlighted item's picture (the specimen itself, a glowing spice orb, or a big icon), its name, its stats (value, kind, rarity, recipe progress) and a description.
  - Actions are labelled with keys: [E] Use/Open (repair and energy packs, crates), [X] Jettison 1 or Set free, [Z] Jettison all, [L] Xeno-Lab (at home) and [Tab] Close. ←/→ switch tabs and ↑/↓ move through the list.
  - Clicking an item you can use (a repair or energy pack, or a crate) asks to use it.
    - Every use, opening a crate, Jettison all and Set free first asks in a terminal box inside the hold, for example "Use 1 × ⚡ Energy Pack? Restores 60% of your energy."
    - [E], Enter or Y confirms; Esc, N or a click outside the box cancels.
  - Sources:
    - 🛰️ derelict wrecks
    - crashed-ship planets you scan (2 components)
    - ruins you scan (25% blueprint, else a component)
    - ancient signals
    - mystery crates
    - wandering traders
    - empire missions: 15% of offers add a rare bonus (a blueprint, a finished part or components). The pitch names it, and it is paid on completion.
  - Wrecks and missions can also hand over finished tools: the next level of an upgrade, a unique, or a stack of consumables.
- **Loot card** (`showLoot` in `ui/scanCard.ts`): whenever several things arrive at once, a card shows a title and one row per item (icon and text) instead of one long toast.
  - This covers relics, mission bonuses, wreck salvage, a trader deal and the finds from a crashed-ship or ruin scan.
  - It stays up a little longer for each extra item, and a tap dismisses it.

**Endgame**
1. A mission chain: "Contact the Hollow" (at rank 4 or so) → "Reach the core".
2. The core cinematic:
   - The camera dives into the light. A tiny, friendly cosmic being, "Ori", greets you and gives the **Genesis Seed**: 12 charges, turning any planet into T3 with a random full ecosystem.
   - `core` achievement. Using the seed gives `genesis`.
3. Then credits (a short scrolling list), and play continues.

**Saves:** serialize the galaxy delta (owned systems, colonies, relations, money, tools, ship position, missions) into `state.stageData.space`.

**Achievements:** `first-contact`, `colonist`, `terraformer`, `tycoon`, `alliance`, `explorer` (40 systems), `empire` (10 systems), `hollow-contact`, `core`, `genesis`. When the core is reached after playing all stages, also `full-circle`.

**Mood:** `space`, switching to `danger` in combat.
