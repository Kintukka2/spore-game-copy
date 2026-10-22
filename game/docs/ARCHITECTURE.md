# Spork: architecture and contributor guide

Spork is a mobile-first browser game (TypeScript + Canvas 2D + DOM overlay, built with Vite). It runs in any phone browser and installs as an app (PWA). There are no image or audio assets: everything is drawn and synthesized procedurally.

## Running

```bash
npm install
npx vite --host 127.0.0.1 --port 5173           # dev server (pick your own port if several run at once)
npx tsc --noEmit                                 # typecheck (must pass)
npm run build                                    # production build
node scripts/shot.mjs "stage=cell&seed=3" shots/cell.png --url=http://127.0.0.1:5173/ --wait=2000
node scripts/shot.mjs "stage=space" shots/a.png --actions=actions.json   # scripted taps/keys, see the script header
```

### URL parameters

| Parameter | Effect |
|---|---|
| `?stage=cell\|creature\|tribal\|civ\|space` | Jump straight into a stage. A plausible species is generated (`game/debug.ts`). |
| `&seed=N` | Deterministic save seed |
| `&cards=gbr` | Force the earlier stages' card colours (g/b/r) |
| `?editor=creature\|cell\|vehicle\|building\|ship` | Open a free-mode editor |
| `?screen=codex\|achievements\|newgame` | Open a screen |
| `&debug` | Sets `game.debug = true`. Stages should show a small debug panel, e.g. "win stage" or "+resources". |

`window.__game` exposes the Game instance for scripted tests, e.g. `__game.scene`, `__game.state`.

The reference viewport is **390×844 (portrait phone)**. Landscape and desktop must still work. Touch targets must be at least 44 px.

## Directory map

```
src/
  main.ts                 boot: registers screens and stages, parses URL params
  styles.css              all CSS (design tokens in :root)
  engine/                 game-agnostic engine
    math.ts               Vec2 helpers, clamp/lerp/damp/easing, wrapAngle, turnToward
    rng.ts                RNG (seeded mulberry32), hashString, makeNoise2D (perlin + fbm), uid
    input.ts              pointer/touch/keyboard; handler stack; tap/drag/pinch/longpress/wheel gestures
    joystick.ts           floating virtual joystick (also reads WASD/arrows)
    camera.ts             2D camera: worldToScreen, screenToWorld, apply(g), zoomAt, bounds, isVisible
    audio.ts              `audio.sfx(name)` synthesized SFX; `audio.music(mood)` generative score
    ui.ts                 h() hyperscript, button(), ui.toast(), ui.modal(), ui.confirm(), progressBar(), abilityButton()
    storage.ts            loadJSON/saveJSON (never throws)
  design/                 the Design model: everything the player builds
    types.ts              Design, SpineNode, PartInstance, PartDef, Palette, Stats, AbilityId
    registry.ts           registerParts, getPart, partsFor(kind, cat), computeStats, designDiet, designCost
    render.ts             renderDesign (side view + procedural animation), renderCell (top-down), drawThumb, layoutDesign
    partkit.ts            drawing helpers for part artists (fillShaded, drawEye, drawLimb, teeth, smoothPath...)
    color.ts              shade, mix, rgba, hsl, outlineOf, SWATCHES
    generate.ts           generateCreature/Cell/Vehicle/Building/Ship, randomPalette, blankDesign, cloneDesign, creatureFromCell
    parts/*.ts            part catalogs (each file calls registerParts)
  editor/
    editor.ts             openEditor(game, config): Promise<{design, spent} | null>. One editor for every kind.
    abilityInfo.ts        icons and names for every AbilityId
  game/
    game.ts               Game: loop, scene stack, saves, achievements, stage flow
    cards.ts              stages, consequence cards, abilities, archetypes
    state.ts              GameState (persisted save), Settings
    achievements.ts       achievement list
    codex.ts              player creation library + wildPool() for populating worlds
    names.ts              procedural names (species, planet, star, city, tribe, empire)
    debug.ts              debugState() for ?stage=
  screens/                title, newgame, intro, evolve (card reveal), codex, achievements, settings
  stages/
    common.ts             createStageHud(), pauseMenu(), chip(): the shared stage HUD
    stub.ts               placeholder stage
    cell/ creature/ tribal/ civ/ space/   one folder per stage; index.ts exports create<Stage>Stage()
```

## Core concepts

### Scenes

Everything on screen is a `Scene` (`game/game.ts`):

```ts
interface Scene extends InputHandler {
  name: string; music?: Mood; transparent?: boolean;
  enter(game: Game): void; exit(): void;
  update(dt: number): void; render(g: CanvasRenderingContext2D, w: number, h: number): void;
  pause?(): void; resume?(): void; onResize?(w, h): void; serialize?(): unknown;
}
```

Scene management:

- `game.setScene(s)` replaces the whole scene stack.
- `game.push(s)` / `game.pop()` overlay a scene. The editor is pushed over a stage.
  - While covered, the stage below does not update, and its HUD is hidden.
  - Its input handlers are suspended and restored automatically.
- `render` receives a context already scaled for devicePixelRatio, so you draw in CSS pixels. Use a `Camera` for world space.
- Scene input methods come from `InputHandler`:
  - `onPointerDown` returns `true` to claim the pointer.
  - The gesture methods are `onTap`, `onDrag*`, `onPinch`, `onLongPress`, `onWheel` and `onKey`.
  - Extra handlers can be pushed with `game.input.push(handler)`, for example a `Joystick`.
- `game.layer(cls)` creates a DOM layer in the current scene's UI root. It is removed automatically when the scene exits. Layers are `pointer-events:none`, but their direct children receive events.

### Stage flow

| Step | What happens |
|---|---|
| Title | → New Game → Intro → `game.startStage('cell')` |
| Stage finishes | It calls `game.completeStage(cardColor, summaryLines)`. This records the card, computes the archetype after Civ, saves, and shows the Evolve screen. |
| Evolve screen | Its button calls `game.advance()`, which starts the next stage. |
| Leaving a stage | "Save & quit" from the pause menu calls `game.goTitle()`. Continue restarts the saved stage, and the stage restores itself from `state.stageData[stage]` via its own `serialize()` format. |

### Game services (used by stages)

| Call | Use |
|---|---|
| `game.state` | The `GameState` (see state.ts). Species designs live in `state.cell`, `state.creature`, `state.outfit` and `state.designs[...]`. |
| `game.rng('purpose')` | Deterministic RNG for this save. Use distinct purpose strings. |
| `game.diff(easy, normal, hard)` | Difficulty-scaled value |
| `game.unlock('achievement-id')`, `game.stat('key', +1)`, `game.history(text, icon)` | Achievements, counters and the history timeline |
| `game.hint(id, text)` | One-time hint toast (per save) |
| `game.unlockPart(partId)` | Unlock a creature part (bone piles and similar) |
| `game.banner(small, big)` | Big animated title |
| `game.fade(fn)` | Fade to black and back |
| `audio.sfx('eat')`, `audio.music('danger')` | Sound and music |
| `openEditor(game, cfg)` | Push the universal editor. `await` returns `{design, spent}` or `null`. See `EditorConfig` in editor.ts: `mode: 'stage'` with `budget` and `currency`, `unlocked`, `allowedDiets`, `tabs` (use `defaultTabs('outfit')` for clothing), `lockedUids`, `required`, `maxParts`, `allowBody`, `bodyResizeOnly`, `doneLabel`. |
| `abilitiesFor(state.cards, 'tribal')` | The consequence abilities available in a stage (cards.ts). Each stage must implement the effects of the abilities that apply to it. |
| `nationTypeFor(cards)` | Civ nation type from the Tribal card |
| `ARCHETYPES[state.archetype]` | Space superpower |

### Designs and rendering

| Function | Notes |
|---|---|
| `renderDesign(g, design, x, y, size, pose, opts)` | `(x, y)` is the ground contact point. `size` multiplies design units, which are about 1 px at size 1; creatures are roughly 40–90 units long. |
| Pose fields | `t` (seconds), `walk` (0..1), `phase` (gait phase; advance by `dt*stepsPerSec`), `facing` (±1), `action` (`'bite'\|'charge'\|'strike'\|'spit'\|'sing'\|'dance'\|'charm'\|'pose'\|'eat'\|'jump'\|'glide'`), `actionT` (0..1), `lift` (jump height), `flash` + `flashAmt` (damage tint), `down` (0..1, dead or knocked over), `alpha` |
| `opts.lodPx` | Draws a cheap blob when the creature is smaller than this many pixels. Use it for crowds. |
| `renderCell(g, design, x, y, angle, size, pose)` | Top-down cells |
| `computeStats(design)` | Ability levels: creature abilities are 0..5 (no stacking); vehicle and ship stats are 0..10 (additive, capped) |
| `designDiet(design)` | Diet from the fitted mouths |
| `layoutDesign(design)` | Bounds: `width`, `height`, `groundY`, `cx` |

**Performance:** creature rendering costs roughly 10–30 path fills each. Keep about 40 or fewer full-detail creatures on screen, use LOD beyond that, and cull with `camera.isVisible`.

### Parts

A `PartDef` has these fields:

- `id`, `name`, `kind`, `category`, `tier` (1 is available at start), `cost`
- `stats`, `diet` (mouths only), `snap`, `layer`, `paired`, `limbLength` (limbs), `radius`, `desc`
- `draw(g, ctx)`

Drawing conventions for `draw(g, ctx)`:

- Local space, with the anchor at (0, 0). +x is forward (toward the head) and +y is down.
- Use the `partkit` helpers for the house look: a dark outline 2.2 wide, top-lit fill, a gloss dot.
- Colours come from `ctx.colors` (`base`, `coat`, `detail`).
- Animate with `ctx.t` (time) and `ctx.act` (action intensity 0..1).
- Limbs receive `ctx.limb` (`knee` and `foot`, already solved by IK); draw with `drawLimb()`.
- Mechanical kinds are drawn the same way. Wheels can spin with `ctx.t`.

Terrain looks: `new Terrain(seed, look)` takes a `TerrainLook` (colours, land fraction, ice caps, tree and mountain density). The Civilization stage uses `EARTH_LOOK`; space landings build one per planet in `stages/space/surface/look.ts`. `civ/terrainDraw.ts` draws the map and decor for both.

Draw order: each `PartInstance` may carry a player-set `layer` (`back` < `front` < `limb` < `top`). Without one, limbs use `limb` and other parts use their def's `layer`. `drawOrder(design)` in render.ts sorts by layer, then by array order. The renderer, the editor's hit-testing and its ⤓/⤒ buttons all use it.

Part ID prefixes: creature `m- e- l- a- w- d- t- wg-`; outfit `o-`; cell `c-`; vehicle `v-`; building `b-`; ship `s-`. Vehicle tool parts carry their role in the id (`v-mil-…`, `v-eco-…`, `v-rel-…`) and their medium (`…-sea-…`, `…-air-…`).

## Rules for contributors (and agents)

1. Stay in your folder (`src/stages/<stage>/`, or your parts file). If you need a core change, make it minimal and additive (a new optional field or a new helper), and list it in your final report. Never rename or remove existing exports.
2. Typecheck must pass (`npx tsc --noEmit`). No new npm dependencies.
3. Test at 390×844 with `scripts/shot.mjs` and look at the screenshots. Check that nothing overlaps badly, text is readable and the game is playable by touch alone.
4. Use `game.diff()` for difficulty, `game.rng()` for anything seeded, `audio.sfx()` for feedback (every meaningful action should make a sound), and `game.hint()` for first-time guidance.
5. Mobile performance: avoid per-frame DOM writes. Update HUD text only when values change, or at most about 10 times a second. Avoid big per-frame allocations.
6. Keep everything original: no Spore names, art or text. Mechanics may follow the original's structure (see `docs/spore-research`).
7. Commit to your own branch with clear messages. Do not push.
