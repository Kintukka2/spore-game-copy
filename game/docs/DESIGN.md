# Primordia: game design document

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
1. When the brain bar is full, offer **"Become sapient"**.
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
2. **System view:** the star with orbiting planets; your ship flies around (joystick, or tap to move). Tap a planet → planet panel.
3. **Planet panel:** a 2D close-up of the planet sphere with its stats (T-score 0–3, atmosphere and temperature sliders, spice colour and amount, cities and owners). The available actions depend on context:
   - Scan, Colonize (Colony Pack), Terraform (atmosphere and temperature tools), Plant (flora) and Abduct/Place animals (to fill the ecosystem)
   - Collect spice, Trade (if owned by an empire), Attack (if at war: destroy turrets, then the city), Abduct, Use superpower
4. **Landing** (`surface/`): 🛬 Land on any rocky world that is not destroyed or sealed by the Hollow. The surface is the Civilization-stage map, with colours, seas, ice, mountains and trees matched to the planet's style: terran, lava, ice, toxic or barren. Your homeworld is the very map you united, with all its cities.
   - The ship hovers over the map. Drag to steer, or tap to fly somewhere.
   - Owned worlds show their cities.
   - Herds of animals and patches of flora live on land. A 📡 life scan marks them on the minimap and points arrows toward them, new species first.
   - Herds bolt from a fast-moving ship. Hover over a creature (or tap it) and the tractor beam lifts it aboard in about 1.5 s; fly off too soon and it slips away. Flying over flora gathers seed pods.
   - Abduction happens only on the surface now. The Life tab lists the species and offers a Land button. Landing also counts as exploring the planet.
5. **Exploration marks:** visited systems carry a teal check on the galaxy map (gold once every planet is scanned or settled). Planet labels in the system view carry a check when explored or a "?" when not. The galaxy HUD counts systems explored and fully surveyed.

**Xeno-Lab (specimens)** (`xenolab.ts`, Ship → 🧬 Xeno-Lab)
- **Xenopedia:** the first sample of each species is catalogued for a research grant (§2,500 animal, §1,000 plant, §4,000 hybrid). It counts toward the *Xenobiologist* badge. The Life tab tags species not yet catalogued as NEW.
- **Menagerie:** while in a home or colony system, exhibit specimens at the homeworld zoo, up to 24, one per species. Each pays §150/min in tourism; hybrids pay triple.
- **Gene Splicer:** fuse two cargo animals for §6,000. The hybrid keeps parent A's skeleton with blended girth, and takes each organ group (mouths, eyes, limbs, weapons, frills) from one parent. It opens in the creature editor to be named and tweaked. Hybrids count as omnivores, so they fit any animal ecosystem slot.
- Specimens still fill ecosystem slots on terraformed worlds.

**Terraforming**
- Each planet has atmosphere and temperature from 0..1 (the T-zone).
- Tools nudge them: Atmosphere Generator/Drainer, Heat Ray/Freeze Ray, Ice and Meteor.
- **T-score:** the distance from the ideal centre maps to T0..T3. A planet's ecosystem needs plants and animals to match its T-score; let players place them through simple slots.
- A higher T-score allows more colony buildings and more spice.
- Raising a planet to T3 gives `terraformer`.

**Colonies and spice**
- A colony produces spice per minute (by planet richness, its colour rarity and the number of buildings). Spice is collected by visiting or automatically into storage.
- Sell spice at empires. Prices vary per empire, per spice colour, and by **supply and demand**.
- **Threats:**
  - Pirate raids: an event that is "your colony is under attack" with a timer. Fly there and fight, or lose spice.
  - Eco-disasters: a timer; fix it or lose species.

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

**Progression**
- A **badges and ranks** system: counters for exploring, trading, colonizing, fighting and terraforming. Ranks unlock tools to buy (better weapons, drives 1–5, more cargo, terraform tools, Colony Pack upgrades).
- The tool shop is at your homeworld and colonies (and allied empires).

**Endgame**
1. A mission chain: "Contact the Hollow" (at rank 4 or so) → "Reach the core".
2. The core cinematic:
   - The camera dives into the light. A tiny, friendly cosmic being, "Ori", greets you and gives the **Genesis Seed**: 12 charges, turning any planet into T3 with a random full ecosystem.
   - `core` achievement. Using the seed gives `genesis`.
3. Then credits (a short scrolling list), and play continues.

**Saves:** serialize the galaxy delta (owned systems, colonies, relations, money, tools, ship position, missions) into `state.stageData.space`.

**Achievements:** `first-contact`, `colonist`, `terraformer`, `tycoon`, `alliance`, `explorer` (40 systems), `empire` (10 systems), `hollow-contact`, `core`, `genesis`. When the core is reached after playing all stages, also `full-circle`.

**Mood:** `space`, switching to `danger` in combat.
