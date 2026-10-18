# 7. Technology, Engine, Procedural Systems, Audio and File Formats

## 7.1 Overview: a game built on procedural generation

*Spore* (Maxis / Electronic Arts, 2008) is technically remarkable less for raw rendering power than for its heavy use of **procedural generation**. Maxis had to ship systems that could texture, animate, voice and score content that did not exist when the game was finished. Maxis' own SIGGRAPH 2007 slides state the goal plainly: let players create key parts of their game, then "pollinate player-created things via servers, so your game is made of both your own creations and others'", for a "richer experience, less art work(!)".

Key facts:

| Item | Detail | Source |
|---|---|---|
| Engine | Proprietary Maxis/EA engine. Uses EA's RenderWare rendering layer on Direct3D 9 (Hecker's liner notes say the paint code was ported "to RenderWare/Direct3D"). Models ship as `.rw4` (RenderWare 4) resources. | Hecker liner notes; SporeMaster docs; FileInfo |
| Language / libraries | C/C++. The behavior-tree AI is written in C/C++ with `BT_` macros and EA's `EA_VERIFY()`. The ModAPI SDK for the reverse-engineered executable is built on **EASTL** (EA's STL), version 3.02.01 bundled. | Hecker BT docs; Spore ModAPI repo |
| DirectX | DirectX 9.0c, Pixel Shader 2.0 minimum | Steam store page |
| Architecture | 32-bit Windows executable (`SporeApp.exe`; Galactic Adventures installs its own in `SporebinEP1`) | ModAPI `Paths.h`; EA forum crash reports |
| Mac version | The PC game running on TransGaming's **Cider** wrapper. No PowerPC support. | Spore Wiki "System requirements" |
| Dev scale | More than 5 years. Over 80 people near the end (Hecker). IEEE Spectrum says "about 20 artists and seven programmers" built the creature and object tools. The *New York Times* (Oct 2006) reported a projected $20 million cost. | Hecker; IEEE Spectrum; Wikipedia "Development of Spore" |
| Internal effects engine | **Swarm**, an effects/particle system that also drives creature skin painting and planet terrain sculpting. Hecker credits it to Andrew Willmott. | SIGGRAPH 2007 sketches; Hecker |

Will Wright's often-quoted claim (E3 2006): the information needed to generate a creature is only "a couple of kilobytes", while the phenotype (texturing, animation) it builds into is "a few megabytes". He compared it to "sharing the DNA template of a creature while the game, like a womb, builds the 'phenotypes'". *MIT Technology Review* (June 2008) put Creature Creator files at "about 8K". Wikipedia notes that one early promise, that a four-legged creature would gallop like a horse, "is untrue in the final game".

Public history of the tech: Will Wright first showed Spore during a procedural-generation talk at **GDC 2005**. At the same GDC, Chris Hecker presented "Why you should have paid attention in multivariable calculus" on implicit surfaces and texture projection. Sean O'Neil consulted on fractal world generation and rendering. Jason Shankel built "ParticleMan", an internal GLUT/GLUI prototype for gravitational particle dynamics (orbits, nebulae, star formation). Wikipedia cites the demoscene as a major influence.

---

## 7.2 Player-created models: Rigblocks, metaball skin and "baking"

### Rigblocks (SIGGRAPH 2007 sketch, Choy, Ingram, Quigley, Sharp, Willmott)

- A **Rigblock** is a geometric building block: a hand or mouth on a creature, a wheel or jet engine on a vehicle. The authors compare them to Lego and Meccano parts.
- Rigblocks are **not static**. Each holds a set of deform animations that are **parameterized over a unit interval rather than time**. Player-controlled **handles** (sliders shown next to the feature) scrub through each animation. A handle's subranges can produce completely different styles of block.
- **Pipeline:** artists used **Maya's non-linear animation (Trax) editor**, which Maxis partly reverse-engineered, so they could see several deforms at once. MEL scripts create a handle and its linked animation. On export, handle positions, ranges and animations go through to the game format.
- **Composition:** deforms cannot be cross-blended with weights, because "50% Def_A + 50% Def_B ≠ Average(A,B)". They are composed **additively from the rest pose**, like delta morph targets. To match Maya's preview, the engine accumulates translation, scale and rotation deltas separately and builds the matrix at the end. Maya sums Euler angles while Spore concatenates quaternions; the paper says the difference was not large enough to matter. Morph targets are supported but avoided because of memory and runtime cost.
- **Baking:** a finished model is "baked". Deform animations are removed to produce a new base mesh with a single texture page and material, and LODs are generated so it renders "at game rates".
- **Art pipeline detail (artist Jan Eng):** each part started as a pencil sketch, was modeled and UV-mapped (mostly unique UVs, laid out with a shareware "pelting" tool), then rigged with joints and/or blendshapes. Standard clips were added, such as `OpenClose` for mouths and `Pointing` for graspers. A **strict clip-naming convention** lets the procedural animation system drive all parts that share a clip name. Textures were kept as PSDs with 8–9 extra channels. Diffuse, spec and bump alpha masks control how much procedural skin paint blends into the hand-painted texture. The player's three chosen colors each have three "tint layers".

### Creature skin (Chris Hecker, "My Liner Notes for Spore")

- The creature torso and limbs form an **implicit surface (metaballs)** that is re-meshed in real time as the player edits. Hecker started on the skin in **October 2003**.
- Each metaball's falloff is a **4th-order polynomial in squared distance**, zero outside radius Rᵢ, with a per-ball "goopiness" scale. He chose it over a 2nd-order kernel to get more continuous derivatives and avoid lighting discontinuities. Only spherical metaballs are used, placed along the spine and limbs.
- He tessellated with an ear-clipping-based approach rather than Marching Cubes, to avoid the then-active Marching Cubes patent. The approach follows Moore and Warren's mesh-displacement contouring to avoid sliver triangles.
- There are **no metaball groups**, so separate limbs can merge into **webbing**. Players used this for bat wings, which Hecker sums up as "Bugs + Player Creativity = Features". Bone weights come from which body part generated each metaball. A known shearing artifact on spines and fat torsos was not fixed before ship.
- The SIGGRAPH 2008 paper says finished characters typically contain **20–80 "bodies"** (bones). Early prototypes allowed general graphs, including loops, but testing showed this complexity "was actually a hindrance to player creativity", and looped spines also broke the animation rules (IEEE Spectrum). *Computer Graphics World* reports artists built "nearly 230" drag-and-drop body parts.

---

## 7.3 Procedural texturing ("Skinpaint" and paint regions)

Source: SIGGRAPH 2007 sketch *Player-Driven Procedural Texturing* (DeBry, Goffin, Hecker, Quigley, Shodhan, Willmott), plus Hecker's liner notes and CGW (Oct 2008).

**Creatures, flora and cells: "Skinpaint"**
- The **Swarm** effects system runs **particle-driven brushes** over the mesh surface. Brushes paint directly into **diffuse, specular and bump** textures. Hecker lists diffuse, specular exponent, gloss, emissive and bump channels; bump is converted to a normal map after each stroke.
- Particles move over a dynamic mesh with 2D (tangent-space) and 3D control. Hecker's "Particle Paint" Swarm plugin simulated particles in barycentric coordinates on the surface. Henry Goffin extended the scripting so particles could "read" morphology, for example running paint up and down the spine and limbs or flaring at limb ends.
- The player picks **base, coat and detail paint scripts**, each tinted by a player-selected color. "Themes" give one-click preset combinations. Players cannot paint freehand in 3D.
- **Fast UV generation ("charting")**: a simple charter groups triangles by dominant cardinal axis (±x, ±y, ±z) using cube-map partitioning, projects each group flat, and packs the charts by bounding box. It takes about **10 ms on min-spec hardware**. Hecker estimates it is 10–100× worse than a human artist's atlas but about 36,000× faster, a net advantage he puts at roughly 400×. Painting uses raycasting, flood fill and dilation to hide seams.
- The paint system started as an OpenGL 3D-paint prototype and became procedural "because we can't ship artists with the game". Goffin later ported the low-level paint code to RenderWare/Direct3D and ran it in the background.

**Buildings and vehicles: "mineral" texturing**
- Built entirely from Rigblocks, using tiled "wallpaper-like" swatches. Because rigblocks deform drastically, UVs can't be static. Instead, rigblock **regions** are tagged with a **procedural UV type** (box-map, planar, cylindrical, spherical, disc), and the projection is applied **in the vertex shader**. Textures are parameterized by **two palette colors**.
- **Final model ("splatter")**: a second set of unique UVs is generated, and a "splatting" shader renders every part's texture into **one texture page of fixed size**. This keeps the draw-call (batch) count independent of the player's material choices. An **ambient-occlusion map** is computed by averaging visibility samples over the sphere.
- Lighting in the editors and in-game uses a **spherical-harmonics** model that interpolates between diffuse and fully glossy terms, so parts can look metallic.

Later tuning: Patch 1.04 gave buildings in-game the same high-quality textures as in the editor when settings were on High. Patch 1.05 added the `highresTextureLevel` cheat for vehicle and building texture quality.

---

## 7.4 Procedural animation (SIGGRAPH 2008 paper)

**Citation:** Hecker, C., Raabe, B., Enslow, R. W., DeWeese, J., Maynard, J., van Prooijen, K. "Real-time Motion Retargeting to Highly Varied User-Created Morphologies." *ACM Transactions on Graphics* 27(3), Article 27 (SIGGRAPH 2008), 11 pp., DOI 10.1145/1360612.1360626. The first four authors were at Maxis/EA, Maynard at Trion World Network and van Prooijen at Total Immersion Software. A less technical companion talk was Hecker's **GDC 2007** lecture "How To Animate a Character You've Never Seen Before".

**Core idea:** animators author motion in a **morphology-independent form** in a custom OpenGL tool called **Spasm**. At runtime the motion is "specialized" onto each creature to produce pose goals for an IK solver.

| Component | How it works |
|---|---|
| **Capabilities ("caps")** | Each body carries semantic tags such as grasper, mouth, spine, root or foot. Scalar "deform" curves (open/close mouth, blink, droop) are standardized per part type. |
| **Contexts (selection)** | Channels select bodies with **semantic queries** instead of bone names: type (by cap), spatial filters (Front/Center/Back, Left/Right, Top/Bottom, relative to the whole creature or to the "setspace" of matching parts), extent (FrontMost, RightMost…), and a limb modifier (`SpineSegment`, which walks up to an approximate shoulder or hip). Game code uses the same queries for AI and inventory. |
| **Generalization / specialization** | Each channel gets an invertible function G (specialized → generalized pose) and S = G⁻¹. **Movement modes** define G: Identity/absolute, Rest-relative, Scale (`CreatureSize`, `LimbLength`), Ground-relative (z = 0 at rest height, 1 at ground), Secondary-relative (relative to another body set or an `ExternalTarget` such as fruit or another creature's hand; `SecondaryDirectionalOnly` for punches), and Lookat (with soft joint limits so multi-headed creatures use the appropriate head). |
| **Variants & mirroring** | Combinatorial playback options: for example, a character with five graspers yields five "grab fruit" variants. Sagittal mirrors are generated automatically, and a "variant product" covers multi-channel animations. "Branched" animations (e.g. picking up with the mouth when there are no graspers) are a last resort. |
| **Gaits** | Legs (paths from hip to foot) are clustered into groups of similar length, harmonized via small rational length ratios, and driven by duty factor and step-trigger parameters. Animators authored gait styles for 1–6 feet; 7+ feet are generated procedurally. Footless creatures either float or crawl with an inch-worm gait using spine "pseudo-feet". |
| **Particle IK Solver** | Treats the skeleton as 3-DOF particles with 1-DOF length constraints, solved iteratively with a nonlinear length correction (like Jakobsen 2001), drawing on molecular-dynamics/SHAKE ideas. It is **two-phase** (spine first, then limbs) with ad hoc preconditioners. Simplified limbs may compress to 10% / stretch to 120% of rest length. The authors found CCD, Jacobian and constrained-dynamics solvers slower and harder to tune. |
| **Jiggles** | Passive, highly damped pseudo-physics on sub-trees with no IK goals. It does not feed back into the keyed motion. An earlier system, "Wiggles", fed into the IK goals and degraded animator work. |

**Results quoted in the paper:**
- Animations are stochastically tested against an ever-changing database of player-uploaded creatures, using an "Animation Validation Grid" spreadsheet. Several hundred creatures and about **a thousand animations** were tested, with a **~90% pass rate**.
- **Performance:** a 25-body character costs about **0.2 ms per frame on a 1.7 GHz Pentium-M**, with about 35% of that in the IK solver.
- Animators could make a complete animation on one character "within a few hours", but needed "weeks" to develop intuition for what generalizes.
- The runtime offers a conventional API: asynchronous animation loading, caching, queuing and weighted layering, plus a one-time **bind** phase per animation/character pair.

Patch history shows continued work on this system: 1.01 fixed tool handling, hand-walking and odd shapes; 1.02 improved gaits for multi-legged and two-limbed footless creatures; 1.04 made combat animations respond to weapons anywhere on the body; and 1.05 added whips (strike part on tail), head-butts, and **asymmetry** for creatures.

---

## 7.5 Planet generation, object distribution and galaxy scale

### Spherical planets (SIGGRAPH 2007 sketch "Creating Spherical Worlds": Compton, Grieve, Goldman, Quigley, Stratton, Todd, Willmott)

- **Design constraints** (slides): planets had to be numerous ("millions? billions?"), playable, good-looking, **fast to generate** ("We can't store all these planets"; "Would like to transmit them"), and terraformable. The overall structure follows a "powers of 10" model (cell → planet → solar system → interstellar → galaxy) with seamless transitions, which forced spherical planets.
- **Parameterization:** a **cube map with perspective (gnomonic-style) projection**. The heightfield and other attribute maps are stored as **six face grids**. Face mappings are axis permutations, which makes wrapping between faces simple, and straight lines in a chart map to great circles. Rejected options: latitude/longitude (pole distortion), sparse voxels, dodecahedral and Voronoi-style charts.
- **Normal maps:** generated from the heightfield as in 2D, then warped with a **Jacobian** term for spherical distortion. Early on this was a large CPU cost.
- **Heightfields:** a **procedural brush system on the sphere**. Brushes are 2D textured rectangles that conditionally raise or lower terrain. Their footprints are clipped per cube face and splatted **on the GPU** by a pixel shader. **Swarm** particle systems run the brushes with random walks, terrain forces and hierarchical spawning, producing rivers, mesas, canyons, oceans and plateaus.
- **Texturing:** a **control map derived from the heightfield** (thresholded water level, gradient, curvature) is combined by a tech-artist formula to blend color and detail textures. Planet type, atmosphere and temperature drive color ramps and the atmosphere/fog model, and these values change with terraforming.
- **Authoring:** an early single "mega effects script" was hard to art-direct, so a "terrain script" layer was added in which each script produces one kind of planet. **Many instances per planet type come from varying the random seed.** The sketch's figure caption reads "Some of the **four billion planets** possible with our system".
- IEEE Spectrum (2008): planets are saved as **generation instructions plus seed values**. One planet would otherwise take about **10 MB** of disk (Ocean Quigley: "We don't have the disc space to deliver a million planets"; Colin Andrews: "Storing the seed lets us do that"). Buildings are likewise stored as instruction lists.
- Patch 1.01 added **70 new planet scripts** with low terraform scores. Patch 1.02 added the **"Cubes" planet style**.

### Fast Object Distribution (Willmott, SIGGRAPH 2007)

Objects such as plants and rocks are placed with an **incremental Halton sequence**, which gives quasi-random, Poisson-disc-like spacing. It is **memoryless and repeatable**, so positions can be regenerated rather than stored. The incremental form keeps base-3 and base-5 counters in binary-coded form, so each step costs only adds, multiplies and shifts. **Density maps** are applied by rejection sampling (discard sample i if D(Hᵢ) < i/N), with tiling for sparse maps. Attributes such as color and scale are indexed by i/N, which keeps similar objects maximally far apart.

### Galaxy scale

- The galaxy holds **42,010 stars**. This figure appears in the Spore Wiki and in TheOnlyZac's reverse-engineered *starmap* project. That project reports that star positions are generated with **no randomness**, so every player's galaxy has the same layout. Each star gets a `cStarRecord` (type, position, planet count, owning empire) serialized into the compressed package `stars.db`. **Planets are only generated when a star is visited.** The galaxy is very flat; the community viewer exaggerates the y-axis. *(No official Maxis figure was found.)*
- Spore Wiki: there are three star colors (red dwarf, yellow, blue giant), stars sit at least 1 parsec apart except binaries, and every star has at least one planet. All planets except **Sol's** are procedurally generated. Black holes and proto-planetary disks also appear on the map.
- The game's local data includes `Planets.package` (in `%APPDATA%\Spore`), according to ModAPI path definitions.

---

## 7.6 AI and simulation systems

- **Behavior Trees.** Early in production the existing creature AI caused problems, so the team adopted a **Halo-style behavior tree**. Hecker calls it "version 1.5" of the Bungie system Damian Isla described at GDC 2005. Tom Bui and Lauren McHugh helped research and build it; McHugh lectured on it at GDC 2008. CGW also notes the AI derives from Bungie's published Halo work.
- **Design (Hecker's internal doc, published 2009):** a C/C++ library for "declaring and ticking Hierarchical Finite State Machines operating on 'agents'". Agents can be characters, strategic entities, or nothing.
  - Trees are **static, compile-time C structs** and can form DAGs because deciders and behaviors may be shared.
  - **Group deciders** use policies such as prioritized list (`kGroupPrioritizedList`), random, sequential, or Sims-like scored competition. **Behavior deciders** are leaves with `Activate/Deactivate/Tick`.
  - Preconditions include timers, DecisionFlags (e.g. night/day) and StimuliFlags (tokens with timeouts). The system also supports hysteresis, "masked redecide" when a child fails, a "Subset Rule" guarding against infinite redecide loops, per-behavior fixed memory blocks, and "DBlocks" to pass data from Decide to behavior.
  - The whole tree is ticked every frame ("brute force") to avoid O(n²) coupling between behaviors. Debug output has levels 0–5.
- **Creature-driven behavior:** a creature's body plan determines what it can do. The same semantic context queries used for animation feed gameplay AI and inventory. MIT Technology Review notes that AI-controlled creatures act according to their parts (charm, dance, sing, pose, sneak, jump, glide, attack).
- **Simulation cost:** Technology Review reports the full game's procedural animation and AI "use substantial processing power", with the target spec matching computers from about three years before launch. The Spore Wiki likewise notes Spore needs a relatively fast CPU rather than a strong GPU.
- **Space-stage simulation tunables** are exposed as console variables (e.g. `universeSimulatorPirateRaidFrequency`; see §7.11). Several patches retuned the empire, disaster, raid and trade-route simulation (1.01, 1.04, 1.05).

---

## 7.7 Audio and procedural music

### People and roles

| Role | Person |
|---|---|
| Audio director (also wrote/designed much music) | **Kent Jolly** |
| Music (generative; editors) | **Aaron McLeran** |
| Generative/ambient music, sample source | **Brian Eno** (with **Peter Chilvers** on the Space-stage planet-editing music, per Wikipedia) |
| Galaxy/main-menu theme, interstellar & solar music | **Cliff Martinez** |
| Other composers | Jerry Martin, Saul Stokes (Sporepedia music), Marc Russo |
| Senior sound designer / sound designer | Mike Cormier / Chris Seifert (took over from Andrew Lackey) |
| Audio software engineer | Cyril Saint-Girons |
| Audio producer / audio QA | Peter Swearengen / Sasha Goldenson |
| Creature voices | Roger Jackson (pitched-up cell vocalizations; mammalian intelligent species); Dee (Bradley) Baker (insect and bird races) |

Wikipedia's breakdown of the generative score: Jolly (with Eno samples) did the Cell game, cell editor, Creature game, creature editor, Tribal game and Civilization building editor. McLeran did the tribe editor and all vehicle editors. The Civilization-stage user anthem system was designed by Jolly, McLeran and Saint-Girons.

### EApd (EA's fork of Pure Data)

- Spore used a customized **Pure Data (Pd)** called **EApd**. Source: Kent Jolly, "Usage of Pd in Spore and Darkspore", 4th International Pure Data Convention, Weimar/Berlin, 2011.
- **Why Pd:** around 2002 EA's internal equivalent tool stopped being developed. Both the Spore and Dead Space teams evaluated Pd/Max; Dead Space eventually used **Lua** instead, mainly for performance. Pd won over Max/MSP because it was **open source** and cleanly separated the GUI from the event/audio engine.
- **Pd was used only for event logic, not DSP.** Pd's audio engine was removed and replaced with objects that call the game's existing optimized audio engine.
- **Custom objects:**
  - `group`/`groupsize`: named sample groups.
  - `play`/`dplay`: dynamic play. Arguments are polyphony limit, pick method (`random`, `norepeat`, `inorder`), and steal/block on overflow, plus x/y/z for 3D.
  - `mixer`: bus/effect automation.
  - `fparam` / `gfparam`: per-instance and global float parameters that engineers hook to game state.
  - `function`: a Max-style response curve.
  - `coll`: Max-style list storage.
  - `thisinstance`: tells the game when a patch instance may be destroyed after a fade-out.
- **Export:** patches and sub-patches are flattened into a single **`.pdr`** file. SporeModder FX's type registry lists a `pdr` resource type and an `eapdPixie` type.
- **Limits:** EApd was a special-case tool, not a "plays everything" system. Ordinary sounds used a separate player driven by text property files, and overlapping settings between the two systems were "never fully resolved". Pd's performance was a concern: many 3D instances, load-time memory allocation from text-format patches, and deep call stacks on crashes. Jolly concludes it was "very powerful" and cheap in engineering time, but easy to overstep performance bounds with.
- *Note:* Wikipedia states "All of the audio in Spore was implemented using a modified version of Pure Data". Jolly's own paper contradicts this: EApd handled special cases only. **libpd**, the later embeddable Pd library, is not what Spore used; EApd was EA's own fork.

### How the music works (GDC 2008 talk by Jolly & McLeran, via GameSpy; Mix magazine)

- Music is **generated in real time** and is most prominent in the **editors**, where no simulation is running and CPU is free.
- **Example patch:** a metronome triggers a random conga sample each beat and loops every 8 beats, using only a few Pd boxes. Four such drums make a rhythm section, and changing the random seed changes the rhythm.
- **Eno's week with the team:** on day 1 the system strung samples together randomly. On day 2 it filtered notes into scales and modes. Later scripts changed keys and built counterpoint synced to basslines. McLeran called it "composing in probabilities".
- **Responsive design:** in the creature editor the instrumentation changes with menus, and adding parts plays short themes or the part's own sound (e.g. a beak screech). Combat parts (pincers, buzzsaws) push the music into a **minor key**; social parts brighten it (Technology Review). Over a long session the music starts energetic and gradually relaxes.
- **Per-editor palettes:** tribal drums for tribal; "synthy" spaceship editor; **London Symphony Chorus** samples in the religious-vehicle editor.
- **Eno's "Shuffler":** on planets, a sample plays every **10–30 seconds** with set volume and pan ranges, and groups of samples form tracks (Mix). Wikipedia describes "The Shuffler" as built by Eno, Jolly and McLeran in Pure Data.
- **City anthems (Civilization):** players choose backbeats, a melody instrument and Eno-made ambiences, and drag notes along a scale in a note editor (tempo and note length are adjustable, or melodies can be randomly generated). The anthem plays on building completion and conquest. Mix credits the note editor's concept to Jolly, Eno, Wright and Saint-Girons. Saved anthems live in `%APPDATA%\Spore\CityMusic` (ModAPI paths).

### Sound design facts (Mix magazine)

- **Creature voices** are chosen by **mouth type**. Tribal speech maps to mouth type, while civilization-stage speech converges on more conventional "Sporelish".
- **Footsteps** were recorded at Skywalker Sound, per surface and per left/right foot. A high-pass filter varies with foot size, and more feet bring the high-pass in so the creature's weight seems spread out.
- More than **2 GB of compressed audio** ("days of stuff"), mostly 44 kHz MP3, with some 22 kHz samples.
- The mix is mostly stereo. A dedicated 5.1 mix was rejected for CPU reasons, so 5.1 is made by "multing" the stereo mix. Heavy **audio LOD caps** limit concurrent sounds of a type (e.g. "at most, five").
- A custom tool linked the audio station to the animators' tool over the network during recording sessions.

---

## 7.8 Content sharing: "Pollination", the Spore server and creation PNGs

### Architecture

- Maxis' internal name for sharing is **Pollination**, and the server is the **Pollinator** (Spore Community docs; Maxis SIGGRAPH slides; IEEE Spectrum).
- Wikipedia describes the design as a "massively single-player online game" with **asynchronous sharing**. Creations upload automatically to a central database and are rated by download counts. They are then **redistributed to populate other players' galaxies**, with only a few KB transmitted per item.
- **Protocol (community reverse engineering):**
  - Game and server talk over **HTTP**, returning XML or Atom feeds. Logged-in data such as your own creations uses HTTPS.
  - Assets are served from **`static.spore.com`** (CDN) as PNG thumbnails and XML models, keyed by **12-digit asset IDs**. Player assets usually begin with 5; Maxis/staging assets begin with 3; a fan server uses 6.
  - The web Sporepedia and in-game MySpore pages come from `community.spore.com`.
  - Archive Team documents `/static/thumb/<3-digit partitions>/<id>.png` (**128×128**, importable), `/static/model/…/<id>.xml`, and `/static/image/…_lrg.png` (256×256).
- **Local caching:** downloaded creations are stored in `%APPDATA%\Spore\Pollination.package`, while the player's own creations go in `EditorSaves.package`. Other caches include `GraphicsCache.package`, `RigblockInfo.package` and `Planets.package`. The PNG importer scans the *My Spore Creations* folders and loads at most **500 PNGs** per scan, tracking already-imported paths (ModAPI headers). Players can restrict incoming content to none, Maxis-approved, friends, or all.
- **Sporecasts** are RSS-style subscriptions. A public **Spore API** (RESTful XML web services, with a contest concluded April 2009) exposes stats, creatures, users and assets. The game could upload creature videos straight to **YouTube**: private by default from Patch 1.02, public again in 1.05.
- **Scale:** about 2.7 million creatures were in the database roughly a month after the June 2008 Creature Creator launch (CGW). More than a million were made within eight days (IEEE Spectrum). The Sporepedia passed **100 million** creations by May 2009 (Wikipedia). Archive Team/ArchiveBot mirrored roughly **2 TB** of `static.spore.com` data (asset IDs up to 501120739942 by 29 Sept 2025). A fan reimplementation, Rosalie241's *SporeServer*, exists.

### The creation PNG ("Model-in-Picture")

Every shared creation is a **128×128 PNG thumbnail** that also carries the full creation data. **Dragging the PNG into the game imports the creature**.

- **Steganography, not metadata chunks.** In June 2008 Ned Batchelder showed that the payload sits in the **least-significant bits of the pixels**: renaming the file keeps it working, but any edit breaks it. Early guesses ("four bits per pixel", data concentrated in the transparent border) were refined by later reverse engineering.
- **Decoding algorithm** (emd4600's open-source decoder, Spore-Community *PNG-Decoder-NetCore*):
  - Pixels are read as B, G, R, A bytes, and **one bit is taken from the LSB of each channel byte**.
  - Byte positions are visited in a **pseudo-random order** produced by a linear-feedback step: `next = (n >> 1) ^ (0xB400 & -(n & 1))`, starting at 0xB400.
  - Each bit is whitened by XOR with a running **FNV-1-style hash** (seed 0x811C9DC5, prime 0x01000193) that mixes in the upper 5 bits of each pixel byte. This ties the hidden data to the visible image, which is consistent with forum reports that Spore hashes image and data together to detect tampering.
  - The first 8 decoded bytes are a magic value and a length. The payload is **zlib-compressed**.
  - Since 128×128×4 = 65,536 channel bytes carry one bit each, the in-pixel capacity is about **8 KB**. **Oversized creations** add a custom PNG chunk of type **`spOr`** after `IEND` instead.
- **Payload contents:**
  - A **Pollen Metadata** header beginning with the string `spore`. Version **5** is the Creature Creator; version **6** is the full game and adds parent-asset lineage.
  - Metadata fields: asset ID, parent ID, timestamp (seconds since AD 1), author name and ID, name, description, tags, consequence traits, machine ID.
  - Then the **Spore Model XML**: rigblocks, transforms, handle values and paints.
  - Description and tag lengths are capped because they are encoded too. Adventures need a separate decoder. ModAPI's `SavePNG` has a `disableSteganography` flag, confirming the encoding is a deliberate space-saving mode.
- Packages also store `.pollen_metadata` files. The game accepts versions 7–13; Maxis content uses 10 and player creations 13.
- Creations made with mods show a **lock icon** for other players and cannot be viewed or edited without the mod (Spore Wiki).

---

## 7.9 File formats and data organization

### Containers and naming

| Format | Notes |
|---|---|
| **`.package` (DBPF 2.0)** | Maxis' "Database Packed File" archive, also used (as v1.x) by SimCity 4 and The Sims 2. Spore uses **major version 2.0**: a 96-byte header with `DBPF` magic, an index offset field, and index minor version 3. Entries may be compressed with EA's **RefPack/QFS** (SporeModder FX implements `RefPackCompression`). Resources are addressed by a **ResourceKey = group ID + instance ID + type ID**. |
| **Name hashing** | Names are hashed with **32-bit FNV-1 on the lower-cased string** (offset basis 0x811C9DC5, multiply by 0x1000193, then XOR). Modding tools ship large registries (SporeModder FX's `reg_file.txt` has ~125,000 known names) to turn hashes back into names. |
| Mod loading | Mods are `.package` files that override game data, as in The Sims 2/3. They are installed via the ModAPI Launcher Kit. |

### Selected resource types (from SporeModder FX's `reg_type.txt` and converters)

| Ext. | Type ID | What it is |
|---|---|---|
| `.prop` | 0x00B1B104 | **Property list**, the most common file. Typed key/value configuration (bools, ints, floats, strings, keys, vectors, colors, transforms, bboxes, arrays). It configures parts, gameplay tuning and much more. SporeMaster converted props to/from XML; SporeModder FX uses a text format. Sound and audio property files reuse the type. |
| `.rw4` | 0x2F4E681B | **RenderWare 4** model/texture container: meshes, vertex/index buffers, skeletons, skins, blend shapes, morph handles, keyframe animations, rasters, compiled D3D material states, and a procedural triangle KD-tree. |
| `.raster` | 0x2F4E681C | Texture (RenderWare raster). |
| `.gmdl` / `.gmsh` | 0x00E6BCE5 / 0x01C135DA | "Game model" meshes: index/vertex buffers, materials, bone ranges, **baked deforms**. |
| `.tlsa` | 0x4AEB6BC6 | Animation lists/groups: maps named animation IDs to choices of animations. |
| `.pctp` | 0x7C19AA7A | **Part capability** mapping (capability names hashed with FNV). Matches the "caps" in the animation paper. |
| `.animation` / `.gait` | 0xEE17C6AD / 0x25DF0112 | Spasm-authored procedural animations (channels, rigblock components, events, predicates) and gait files (groups, step lengths). |
| `.effdir` / `.pfx` | 0xEA5118B0 / 0x497767B9 | **Swarm effects** directories. They include particle, ribbon, decal, **Skinpaint** (particle, flood, distribute, settings), **TerrainScript**, terrain distribute, brush, sound and camera components. |
| `.spui` | 0x250FE9A2 | Spore UI layouts (SporeModder FX has a UI editor). |
| `.locale` | 0x02FAC0B6 | Localized string tables (e.g. `Text.package`; `SaveDataFolders.locale`). |
| `.cnv` | 0x055ADA24 | Conversation/dialog data. |
| `.smt` | 0x0469A3F7 | Compiled shaders / material shaders. |
| `.pollen_metadata`, `.summary` | 0x030BDEE3 | Creation metadata (see §7.8). |
| `.pdr` | 0x022D2C83 | Flattened EApd (Pure Data) patches. |
| Cell-stage files | various | `.cell`, `.populate`, `.structure`, `.look_table`, `.loottable`, `.world`, etc. (Cell-stage data). |
| `.crt`, `.bld`, `.vcl`, `.ufo`, `.flr`, `.cll`, `.adventure` | various | Creation kinds: creature, building, vehicle, UFO, flora, cell, adventure. |

Other registry types include `.png`, `.dds`, `.xml`, `.css`, `.ttf`, `.lua`, `.hkx` and PhysX binaries. Many of these come from shared EA tech or Darkspore and are not necessarily used by Spore itself.

**User data locations** (ModAPI `Paths.h`):
- `%APPDATA%\Spore\` holds `EditorSaves.package`, `Pollination.package`, `Planets.package`, `GraphicsCache.package`, `RigblockInfo.package`, `Games\Game0…`, `Preferences`, `CityMusic` and `Temp`.
- *My Spore Creations* (Documents) holds Creatures, Buildings, Vehicles, UFOs, Plants, Cells, Adventures, Pictures, Movies and AnimatedAvatars.
- Save files use the `.spo` extension; naming a home planet a Windows-reserved name such as `CON` crashes the save (Spore Wiki).
- **Export:** Patch 1.05 added the `colladaexport` cheat, which writes the creature as a **COLLADA `.dae`** "for use in Maya" after accepting a Tools EULA.

---

## 7.10 Modding tools and reverse engineering

| Tool | Author | What it does |
|---|---|---|
| **SporeMaster** (v2) | "Void" at SporeMods, with collaborators | Early all-in-one tool. Unpacks and packs `.package` files and converts `.prop` ↔ XML (names instead of hashes, order-independent). It **packs `.rw4`** models and textures from OGRE3D XML and DDS, "making editor part creation possible for the first time", but unpacking `.rw4` was very limited and part animations were unsupported. It also offered full-text search of XML/locale files, WinMerge diffing, and hash-guessing tools. Now obsolete. |
| **SporeModder / SporeModder FX** | **emd4600** (Eric Mor), Java 1.8/JavaFX, GPL-3 | The current standard tool. Features an ArgScript-style text format for most file types, a syntax-highlighting editor with error diagnosis, a **Spore UI (`.spui`) editor**, texture viewers (raster/RW4/DDS), a model viewer, and effect and animation editors. It has the largest known hash-name registries, with contributions from 0KepOnline, A-xesey and Rosalie241. It pairs with SporeModder Blender add-ons for models and animations. |
| **Spore ModAPI SDK** | emd4600 / Spore-Community | A C++ SDK with reverse-engineered headers for Spore's classes (Simulator, Editors, Swarm, Terrain, Skinner, Pollinator, UTFWin, RenderWare, Audio, Cheats…). Mods compile to **`.dll`** files that are **injected** at launch. It includes **Ghidra** import scripts and symbol XML for two executables: the **disk** build and the **"March 2017"** digital (Steam/Origin) build. Example mods include ModCreatorKit, GmdlExport, EditorPlayModeNoBounds and SpaceToolCheat. **Requires Galactic Adventures.** |
| **ModAPI Launcher Kit** | Spore-Community | Installs `.package`/ModAPI mods and injects the DLLs. Now open source; its maintainers call the code old and poorly documented. |
| **SporeModLoader** | Rosalie241 | An alternative loader that injects DLLs via `dinput8.dll`. |
| **Dark Injection** | Originally "Davo", later **Rob55Rod** | A componentized mega-mod. It adds Darkspore parts, Grox/outfitter/captain parts, invisible limbs and a "Genetic Modifier" for editing creatures in later stages, and greatly raises (but cannot remove) the complexity limit. Later versions (after 2.1.6) are built on ModAPI. |
| **PNG-Decoder-NetCore / Adventure-Decoder** | emd4600, Spore-Community | Reference decoders for creation PNGs (§7.8). |
| **Starmap** | TheOnlyZac | Reads `stars.db` star records to plot the galaxy. |

---

## 7.11 Console commands / cheats

**Opening the console:** press **Ctrl+Shift+C** (Mac: **Command+Shift+C**) in a game, an editor, or the main menu. Type a command and press Enter; close it with Esc or the red X. Commands are **case-insensitive**. Pressing ↑ recalls the last command, so `addDNA` or `moreMoney` can be spammed quickly.

**Achievements:** using an advantage-granting cheat marks that save with the **Joker badge** and locks it out of further achievements. Using a cheat 50 times awards the **"Pathological Cheater"** achievement. Style filters do *not* trigger the Joker badge.

### Utility commands

| Command | Effect |
|---|---|
| `help` / `help -full` / `help <command>` | Lists the common commands / all commands / explains one command |
| `clear` | Clears the console |
| `capturePlanetGIF` | Records a spinning animated GIF of the current planet to *My Spore Creations\AnimatedAvatars* |
| `freeCam` | Toggles a free camera (Creature stage and Galactic Adventures), allowing extreme zoom-out |
| `killallhints` | Removes all hints |
| `SetTime h m [speed]` | Sets time of day at the avatar's position, with an optional speed multiplier |
| `rename planet <name>` / `rename star <name>` | Renames the current planet or selected star (also black holes, proto-planetary disks, even the Galactic Core). The home planet and saves cannot be renamed this way. |
| `blocksmode` | Shows creatures as blocky representations; enter again to undo (added in Patch 1.01) |
| `colladaexport` | Exports the viewed creature as a `.dae` (Patch 1.05+) |
| `highresTextureLevel off/low/medium/high` | Building/vehicle texture quality (Patch 1.05+) |

### Visual filters (no Joker badge)

- `styleFilter -none | -oilPaint | -filmNoir | -microscope | -norainbows | -nextgen`. Patch 1.01 added `-microscope`, `-norainbows` and `-nextgen`.
- Galactic Adventures adds `adventureLook -none | -norainbows | -watercolor | -sepia | -sixteenbit | -eightbit | -filmnoir`. These settings are saved and published with the adventure.

### Gameplay cheats (trigger the Joker badge)

| Command | Effect |
|---|---|
| `addDNA` | **+150 DNA**. Works in the editors/Creature Creator and adds 150 budget in the outfitter. |
| `moreMoney` | **+§2,000** in Civilization; **+§1,000,000** in Space |
| `refillMotives` | Refills health and other motives (hunger, energy…) |
| `freedom` (`freedom on/off`) | Removes editor complexity limits (non-game editors only; unreliable in some versions; resulting creatures don't appear in-game) |
| `unlockSuperWeapons` | Unlocks all superweapons for your Civilization type |
| `spaceCreate` | Unlocks and recharges all Space-stage creation tools |
| `evoadvantage` | When starting a new Creature game, choose any creature from the Sporepedia, including more evolved ones (Patch 1.01). Entered at the main menu, it may not trigger the Joker badge. |
| `levels -unlock` / `levels -unlockAdventures` | Unlocks starting at any of the five stages / unlocks all Maxis adventures |
| `setConsequenceTrait <id>` | Sets a consequence trait/archetype: `cell_carnivore/herbivore/omnivore`, `creature_aggressive/social/mixed`, `tribe_aggressive/social/mixed`, `civ_military/economic/religious`, `space_bard/ecologist/zealot/diplomat/scientist/trader/shaman/warrior/wanderer/knight`. Using it in the main menu crashed the game after Patch 1.05. |
| `universeSimulatorPirateRaidFrequency <n>`, `…PirateRaidPlunderFrequency <n>`, `…PirateRaidAllyFrequency <n>` | Tune how often pirates raid you, steal spice, or raid allies |

*Verification notes:* the correct command names are **`capturePlanetGIF`** (not "capturePlanetGraphic") and **`refillMotives`** (plural). No source was found for commands named "spaceCheat" or "addCell". Sources agree on the effects above, though some generic lists describe `moreMoney` only vaguely.

---

## 7.12 System requirements

### Windows (official minimum; no "recommended" spec is published on Steam)

| Component | Requirement |
|---|---|
| OS | Windows XP (SP1+) or Vista |
| CPU | 2.0 GHz Pentium 4 or equivalent |
| RAM | 512 MB (XP) / 768 MB (Vista) |
| GPU | 128 MB video card with **Pixel Shader 2.0** |
| DirectX | 9.0c |
| Disk | 4 GB plus 1 GB for creations (the Spore Wiki says "at least 6 GB") |
| Integrated graphics | Intel 945GM or above; 2.6 GHz Pentium D or 1.8 GHz Core 2 Duo; 768 MB RAM |

### Mac OS X

| Component | Requirement |
|---|---|
| OS | Mac OS X 10.5.3 Leopard or higher (Intel only) |
| CPU | Intel Core Duo |
| RAM | 1024 MB |
| GPU | ATI X1600 or NVIDIA 7300 GT (128 MB VRAM), or Intel GMA X3100 |
| Disk | 4.7 GB plus space for creations |
| Integrated graphics | GMA X3100 with dual 2.0 GHz CPUs or 1.7 GHz Core 2 Duo |

The Mac version does **not** run on PowerPC Macs, and it no longer runs on macOS 10.15+ because Apple dropped 32-bit app support.

**Officially supported GPUs at launch** (Spore Wiki, from spore.com):
- NVIDIA GeForce FX 5900/5950, 6200–6800, 7200–7950, 8400–8800, 9600/9800, GTX 260/280.
- ATI Radeon 9500–9800, X300–X850, X1300–X1950, HD 2400/2600/2900, 3450/3650/3850/3870, 4850.
- Intel GMA 950 and GMA 3x00 (Windows); GMA X3100 (Mac).

**Creature Creator:** the same as Spore, except about 270 MB of disk (190 MB for the Trial Edition) and a slightly lower CPU requirement with integrated graphics. Galactic Adventures listings require XP SP2 or Vista SP1 and 2 GB of disk.

An Internet connection was required at install and first launch for the SecuROM-protected retail version. The modern Steam listing still states online authentication and EULA acceptance are required.

---

## 7.13 DRM (SecuROM)

- Retail and EA Store Spore shipped with a **modified SecuROM** using **online activation**. EA first planned **re-authentication every 10 days**, but dropped it after community backlash (announced by Maxis' Caryl Shaw). The game instead re-authenticates silently whenever it goes online.
- **Install limit:** activations were limited to **3 machines**, and a hardware change could count as a new machine. After complaints, EA raised the limit to **5** and released a **De-Authorization Tool**, which was not available on Mac. EA said only 14% of users had activated on more than one PC and under 1% had tried more than three.
- **Backlash:** by 14 September 2008, 2,016 of 2,216 Amazon ratings were one star, mostly citing DRM. A cracked copy leaked two days before the Australian release, and Spore became the most-torrented game of 2008 (TorrentFreak called it "the most pirated game ever" at the time). Former Maxis developer Chris Harris called the DRM a "totally avoidable disaster". SecuROM was not disclosed on the box, the manual or the EULA.
- **Lawsuits:** a class action was filed on **22 September 2008** over undisclosed SecuROM and its rootkit-like persistence after uninstall. A second followed on **14 October 2008** over DRM in the free Creature Creator demo.
- **Removal:** EA began selling Spore **without SecuROM on Steam on 22 December 2008** (the Steam store lists a release date of 19 December 2008). A **DRM-free GOG.com** version followed in **2016** (a GOG user review dated 22 Sept 2016 marks the change). GOG's latest listed update, 3.1.0.22 on 28 Oct 2025, added a configuration tool and cloud saves.

---

## 7.14 Patch history

| Patch | Date | Highlights |
|---|---|---|
| **1.01** | 22 Sep 2008 (PC & Mac) | `evoadvantage` and `blocksmode` cheats. Three new style filters. Part-stat inspection (hold *i* in Build mode). **70 new planet scripts**. Better planet fog, bloom and lighting. Animation fixes for tool handling and hand-walking. Difficulty retuning (Normal/Hard) for Creature, Tribe and Civ. Space-empire demand and disaster tuning. Crash and freeze fixes (epic creature attacks, Creature Tweaker, planet capture). |
| **1.02** | 19 Oct 2008 (PC); Mac later (~Nov 2008) | Ctrl/Shift multi-select in the Sporepedia. **"Cubes" planet style**. Improved multi-leg and footless-biped gaits. **5.1 audio** fix. Fixes for audio lag and missing models on **single-CPU machines** caused by background-loading slowdown. Several crashes fixed (galaxy zoom-out, Tribe→Civ transition). YouTube uploads set to private. "Bad Baby" achievement discontinued. Auto-installed with Creepy & Cute. |
| **1.03** | 18 Nov 2008 | **24 free exoskeleton limbs** (12 arms, 12 legs). Achievement server-sync fix. Small UI fixes. |
| **1.04 ("Patch 4")** | 23 Jun 2009 | Bundled with Galactic Adventures. High-quality building textures in-game. More responsive weapon animations. All Grox worlds reachable. Terraform tutorial fix. General performance gains. Better Sporepedia search. Direct download from website to game. *Known problems:* errors with outdated drivers; a "Runtime… terminate it in an unusual way" error if GA was installed afterwards; the **BAD_DATA** name-generator bug. |
| **1.05 ("Patch 5")** | 22 Jul 2009 | **Creature asymmetry**. Space crash fixes. Lower disaster rates and Hard-mode tuning. More concurrent trade routes. Knight tool changes. Correct creator lineage. **Collada export cheat** and high-res vehicle texture cheat. Fixed creations vanishing if you quit mid-download. Achievement fixes. Tail whips and head-butts for strike parts. Galactic Adventures: objects placeable on vehicles, editor UI and camera improvements. *Known problems:* tilt lost on buildings over water in older adventures; crashes with certain aspect ratios; `setconsequencetrait` crash in the menu. |
| **1.05.1 ("Patch 5.1")** | 29 Jul 2009 (PC; ~145 MB); 4 Mar 2010 (Mac, per Spore Wiki) | Fixes object orientation near water or lava in Galactic Adventures play/test. Fixes a Building Creator crash when moving a part with Ctrl or Shift held. The Spore Wiki also lists a fix for an aspect-ratio crash when placing parts. Works with base, Creepy & Cute and GA. *(Softpedia dates it 30 Jul 2009.)* |
| **1.06** | 4 Jan 2010 | Promotional patch unlocked by a **Dr Pepper** bottle-cap code. Adds **14 robot/mech parts**. Install order matters (Spore → GA → parts). Bot mouths have no "sing" ability, which can crash socializing. |
| *"1.07"* | — | **Unofficial** fan "patch"/mod by Forgotten Spore. It removes complexity limits and adds 20-minute video capture and other features. Creations made with it are locked from official sharing. |

Patches were delivered through the **EA Download Manager (EADM)**. Later patches downloaded automatically when the game was launched.

---

## 7.15 Known technical issues

- **Memory / 32-bit:** Spore is a 32-bit executable. Players report it can use only about 2 GB of address space (an EA-forum user claim, not an official figure) and crashes more on long sessions and in the Space stage. The community fix is to set the **Large Address Aware** flag ("4GB patch", e.g. NTCore's tool or CFF Explorer). The Spore Wiki says patching the game to use more RAM "does not completely remove the crashes, but it reduces them significantly". There was never an official fix.
- **Common crash points** (Spore Wiki):
  - Dying in the Creature stage
  - Tribesmen fishing
  - Capturing cities
  - Flying between stars
  - Custom (UGC) flora pollinated onto planets ("only one custom plant" can corrupt the Sporepedia)
  - Opening Options with the language set to **Russian or Finnish**
  - Reserved Windows filenames used as planet names
  - Forced saves on a planet in Space
  - "Save Game Failed. Spore will now Exit", attributed to memory exhaustion or malware
  - The game has **no autosave**, so frequent manual saving is the standard advice.
- **BAD_DATA:** a known bug where the name generator returns "BAD_DATA" for every planet, star and creature. It is tied to installing Patch 1.04 before Galactic Adventures and can make Space missions almost impossible.
- **Hardware detection:** the game ships a fixed list of supported GPUs (§7.12). Under Wine, unrecognized hardware can trigger a "below our min spec" alert and the game closes. Reports from modern Windows 11 machines with Intel Iris Xe graphics describe startup crashes (`SporeApp.exe`, exception `0xc0000005`). *No authoritative source was found for a specific AMD-only or "modern GPU" defect or fix; community advice (driver updates, compatibility mode, DXVK) is anecdotal.*
- **Mod compatibility:** ModAPI requires Galactic Adventures and specific executable builds (disk vs. March-2017 digital). A 2024 Steam discussion reported ModAPI crashing after the executables changed.

---

## 7.16 Localization

- The **Steam** build lists **15 languages**: English, Czech, Danish, German, Spanish (Spain), Finnish, French, Italian, Hungarian, Dutch, Norwegian, Polish, Russian, Swedish and Portuguese (Portugal).
- A **Japanese edition** (スポア) was announced for early September 2008 (4Gamer via Game*Spark). the Japanese outlet Inside Games reported a 5 Sept 2008 PC release date, and EA Japan ran a Japanese Creature Creator page.
- Resellers advertise ENG/JP/CN/KO packages of the Complete Collection, and a community-posted list of EA language codes adds Greek (el-gr). These are unofficial and unverified.
- Text lives in `.locale` resources in `Data/Locale` and `Text.package`. Maxis creations store localization keys instead of literal names.
- IEEE Spectrum reported that localization work was part of why the game slipped more than a year.

---

## 7.17 Discrepancies and gaps

- **Galaxy size:** 42,010 stars is the only well-supported figure (Spore Wiki and starmap reverse engineering). No official Maxis number was found.
- **"Four billion planets"** comes from the SIGGRAPH 2007 figure caption and reflects seed-space capacity, not planets that exist in a save.
- **Engine name:** Maxis never publicly branded the engine. "RenderWare 4" is supported by the `.rw4` format, the ModAPI's `RenderWare` namespace and Hecker's mention of "RenderWare/Direct3D".
- **Pure Data:** Spore used EA's own **EApd** fork for event logic only. It was not libpd, and per Jolly it was not used for "all" audio.
- **Not found:** no reliable source for an "Ofc" system, a `.prop` binary layout specification, the GDC 2008 behavior-tree talk's content, an official recommended spec, or an authoritative AMD/modern-GPU issue write-up. The web-search budget ran out before PCGamingWiki could be consulted; its page was blocked to the fetcher.

---

## Sources

- https://chrishecker.com/Real-time_Motion_Retargeting_to_Highly_Varied_User-Created_Morphologies
- https://www.cse.chalmers.se/edu/year/2011/course/TDA361/Advanced%20Computer%20Graphics/027-hecker%20copy.pdf (full text of the SIGGRAPH 2008 paper)
- https://www.chrishecker.com/My_Liner_Notes_for_Spore
- https://www.chrishecker.com/My_Liner_Notes_for_Spore/Spore_Behavior_Tree_Docs
- https://chrishecker.com/How_To_Animate_a_Character_You%27ve_Never_Seen_Before
- https://www.cs.cmu.edu/~ajw/s2007/ (Maxis SIGGRAPH 2007 sketches: 0248-Rigblocks, 0251-SphericalWorlds, 0311-PaintingModels, 0312-ObjectDistribution abstracts and slides)
- https://www.andrewwillmott.com/maxis-sketches
- https://janeng.com/?p=143
- https://www.cgw.com/Publications/CGW/2008/Volume-31-Issue-10-Oct-2008-/Evolutionary-Chain.aspx
- https://spectrum.ieee.org/engineering-spore
- https://www.technologyreview.com/2008/06/17/127401/creating-creatures/
- https://www.uni-weimar.de/kunst-und-gestaltung/wiki/PDCON:Conference/Using_Pure_Data_in_Spore_and_Darkspore
- https://www.uni-weimar.de/kunst-und-gestaltung/wiki/images/Usage_of_Pd_in_Spore_and_Darkspore.pdf
- https://moredarkthanshark.org/eno_int_gspy-feb08.html (GameSpy, Feb 2008, GDC talk by Jolly & McLeran)
- https://www.mixonline.com/sfp/sfp-magical-world-spore-369211
- https://en.wikipedia.org/wiki/Spore_(2008_video_game)
- https://en.wikipedia.org/wiki/Development_of_Spore
- https://nedbatchelder.com/blog/200806/spore_creature_creator_and_steganography
- https://github.com/Spore-Community/PNG-Decoder-NetCore
- https://github.com/Spore-Community/spore-community.github.io (docs/pollination.md, docs/pollination/pollen_metadata.md, docs/sporepedia-archive/archivebot/jobs.md)
- https://spore-community.github.io/docs/pollination/pollen_metadata.html
- https://wiki.archiveteam.org/index.php/Spore
- https://github.com/emd4600/SporeModder-FX (README, reg_type.txt, reg_file.txt, src/sporemodder/file/*, HashManager.java)
- https://github.com/emd4600/Spore-ModAPI (README; Spore ModAPI/Spore/App/Thumbnail_cImportExport.h; Spore/Resource/Paths.h; SDKtoGhidra)
- https://github-wiki-see.page/m/Spore-Community/SporeModder-FX/wiki/Introduction-to-Spore-modding
- https://github.com/Rosalie241/SporeModLoader
- https://github.com/TheOnlyZac/starmap/blob/main/README.md
- https://db.modthesims.info/wiki.php?title=DBPF
- https://fileinfo.com/extension/rw4
- https://www.moddb.com/mods/sporedums-spore-mods/news/sporemaster-v2-released
- https://spore.fandom.com/wiki/Cheats
- https://spore.fandom.com/wiki/System_requirements
- https://spore.fandom.com/wiki/Copy_protection
- https://spore.fandom.com/wiki/Patch_1.01 (and Patch_1.02, Patch_1.03, Patch_1.04, Patch_1.05, Patch_1.05.0001, Patch_1.06, Patch_1.07)
- https://spore.fandom.com/wiki/Star
- https://spore.fandom.com/wiki/Planet
- https://spore.fandom.com/wiki/Crashes
- https://spore.fandom.com/wiki/List_of_general_glitches_in_Spore
- https://spore.fandom.com/wiki/Modifications
- https://spore.fandom.com/wiki/Dark_Injection
- https://www.tekrevue.com/spore-cheats
- https://www.gamerevolution.com/guides/41110-spore-pc-cheats
- https://strategywiki.org/wiki/Spore/Cheats (via search summary; Mac shortcut, Joker badge)
- https://store.steampowered.com/app/17390
- https://www.gog.com/de/game/spore_collection
- https://www.worthplaying.com/article/2009/7/29/news/63827-spore-v1051-patch-available-now/
- https://games.softpedia.com/progChangelog/Spore-Patch-Changelog-27945.html (via search summary)
- https://forums.ea.com/discussions/other-ea-games-en/please-update-spore-so-it-stops-crashing-on-modern-pcs/13796181 (via search summary)
- https://forum.winehq.org/viewtopic.php?p=12556 (via search summary)
- https://www.inside-games.jp/article/2008/09/05/31044.html and https://www.gamespark.jp/modules/news/index.php?p=6012 (Japanese release, via search summary)
