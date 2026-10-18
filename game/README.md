# Primordia

*Evolve a species from a single cell to the stars.*

Primordia is a mobile-first evolution game inspired by the stage structure of Will Wright's *Spore* (Maxis/EA, 2008). It reimagines it for phones with its own names, art and rules. It runs in any modern mobile browser and can be installed to the home screen as an app (PWA). Every creature, vehicle, building, ship, planet, sound and piece of music is generated procedurally, so the game ships with no image or audio files.

## The five stages

| Stage | Genre | You... |
|---|---|---|
| 🦠 **Cell** | Arcade | Swim, eat and grow in a glowing tide pool. Collect meteor shards for new parts. |
| 🦎 **Creature** | Action adventure | Walk ashore, befriend or hunt the island's species, and grow a brain. |
| 🔥 **Tribal** | Mini RTS | Lead a tribe: gather food, build tool huts, and win over or raid rival tribes. |
| 🏙️ **Civilization** | Strategy | Unite your planet through faith, trade or force. Claim spice geysers and design cities and vehicles. |
| 🚀 **Space** | Sandbox | Explore a spiral galaxy: terraform, colonize, trade spice, practise diplomacy and fight, then journey to the core. |

How you play each stage earns a **green / blue / red card**. Each card grants an ability in every later stage. All four together decide your species' space **philosophy**, one of 10 archetypes, each with its own superpower.

## Creation

One universal touch editor builds cells, creatures, tribal outfits, buildings, vehicles and starships:

- Tap a part to add it, or drag it onto the body. Tap a placed part to resize, rotate, duplicate or delete it.
- Reshape the spine, paint with three colour channels and ten patterns, and test-drive your creation.
- Everything you save goes into the **Codex**, and your creations wander into your future worlds.

## Play / develop

```bash
cd game
npm install
npm run dev          # http://localhost:5173 (open on your phone via your LAN IP)
npm run build        # production build in dist/ (static, host anywhere)
npm run build:single # single self-contained HTML file in dist-single/
```

Handy URL parameters: `?stage=creature` (jump into a stage), `?editor=creature` (free editor), `?gallery=creature` (all parts), `&debug` (debug panels). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Docs

- [`docs/DESIGN.md`](docs/DESIGN.md): game design document
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): code structure and contributor guide
- [`../docs/spore-research/`](../docs/spore-research/README.md): the research dossier on the original game

## Tech

TypeScript, Canvas 2D and a DOM HUD, built with Vite. There is no game engine and there are no runtime dependencies. Sound is a WebAudio synthesizer with a generative score. Rendering is 2D and procedural: metaball-style bodies, IK legs with gait cycles, and patterned skins.
