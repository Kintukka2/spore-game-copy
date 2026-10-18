// The Cell stage scene: a microbe in a glowing tide pool eats, grows through five sizes,
// collects meteor shards for new parts, evolves in the Cell Creator, and finally grows a brain.
import type { Game, Scene } from '../../game/game';
import type { PointerInfo } from '../../engine/input';
import { audio, type Mood, type SfxName } from '../../engine/audio';
import { Camera } from '../../engine/camera';
import { Joystick } from '../../engine/joystick';
import { button } from '../../engine/ui';
import { clamp, damp, easeInOutCubic, easeOutBack, lerp, TAU, turnToward } from '../../engine/math';
import { designDiet, getPart, partsFor } from '../../design/registry';
import { randomPalette } from '../../design/generate';
import type { Design } from '../../design/types';
import { defaultTabs, openEditor, type EditorResult } from '../../editor/editor';
import type { CardColor } from '../../game/cards';
import { computeAbilities, describeAbilities } from './abilities';
import { BASE_ZOOM, DNA_GOAL, DNA_PER_LEVEL, HURT_IFRAMES, LEVEL_NAMES, LEVEL_SCALE, LEVELS, makeTuning, MATE_UNLOCK_DNA, MAX_HP, sizeClass, type Tuning } from './config';
import { bodyR, bodyX, bodyY, makeCell, type Cell, type Food, type FoodKind, type Shard } from './entities';
import { Fx } from './fx';
import { Backdrop } from './backdrop';
import { World, type WorldHost } from './world';
import { CellHud } from './hud';
import { drawCfg, drawEdgeArrow, drawFoods, drawNpcs, drawPlayerCell, drawPuffs, drawShards } from './draw';
import { glowSprite } from './sprites';
import { makeCaption, showDietChoice, starterCell, type Caption, type DietChoice, type StartDiet } from './overlays';
import { injectCellStyles } from './styles';

type Phase = 'choose' | 'play' | 'mate' | 'editor' | 'hatch' | 'dead' | 'finale' | 'done';

/** Mid-stage save format (state.stageData.cell). */
export interface CellSave {
  v: 1;
  dna: number;
  earned: number;
  plant: number;
  meat: number;
  egg: number;
  level: number;
  hp: number;
  elapsed: number;
  kills: number;
  eaten: number;
  deaths: number;
  giantKills: number;
  shards: number;
  mission: number;
  missionCount: number;
  mateUnlocked: boolean;
  newParts: string[];
  x: number;
  y: number;
  angle: number;
}

const MISSION_EAT = 5;

export class CellStage implements Scene, WorldHost {
  name = 'cell';
  music: Mood = 'cell';
  game!: Game;
  tune!: Tuning;
  fx = new Fx();
  private cam = new Camera();
  private joy!: Joystick;
  private hud!: CellHud;
  private world!: World;
  private backdrop!: Backdrop;
  private player!: Cell;
  private phase: Phase = 'choose';
  private paused = false;
  private t = 0;
  // progress
  private dna = 0;
  private earned = 0;
  private plantDNA = 0;
  private meatDNA = 0;
  private eggDNA = 0;
  private level = 0;
  private elapsed = 0;
  private kills = 0;
  private eaten = 0;
  private deaths = 0;
  private giantKills = 0;
  private shardsFound = 0;
  private mission = 0;
  private missionCount = 0;
  private mateUnlocked = false;
  private newParts: string[] = [];
  // animation state
  private growFrom = 1;
  private growTo = 1;
  private growT = 1;
  private hatchT = 1;
  private hatchX = 0;
  private hatchY = 0;
  private deadT = 0;
  private finT = 0;
  private hudT = 0;
  private dangerT = 0;
  private mood: Mood = 'cell';
  private steerPtr: { id: number; x: number; y: number } | null = null;
  private choice: DietChoice | null = null;
  private caption: Caption | null = null;
  private completed = false;
  private hurtSfxT = 0;
  private seenGiant = false;
  private seenStar = false;
  private seenShard = false;
  private sparkleT = 0;
  private hintQ: { id: string; text: string; icon: string }[] = [];
  private hintT = 0;
  private hurtBlink = 0;
  /** Dev-only render toggles for profiling from the console (window.__game.scene.perfOff). */
  perfOff: Record<string, boolean> = {};
  private lowQuality = false;
  private perfT = 0;
  private slowT = 0;

  // ------------------------------------------------------------------ lifecycle

  enter(game: Game) {
    this.game = game;
    injectCellStyles();
    drawCfg.fullPx = 30;
    drawCfg.fullMax = 14;
    document.body.classList.add('cell-active');
    this.tune = makeTuning(game);
    this.fx.reduced = game.settings.reducedMotion;
    this.cam.setViewport(game.w, game.h);
    const s = game.state!;
    const saved = s.stageData.cell as CellSave | undefined;
    const resume = !!(saved && saved.v === 1 && s.cell && s.cell.kind === 'cell');
    if (resume) this.level = clamp(Math.floor(saved!.level), 0, LEVELS - 1);
    // A placeholder design is shown behind the diet overlay until the player chooses.
    const design: Design = resume ? s.cell! : starterCell('herbivore', s.speciesName, s.cell?.colors ?? randomPalette(game.rng('cell-palette'), { vivid: true }));
    this.player = makeCell(design, computeAbilities(design), designDiet(design), 0, 0, LEVEL_SCALE[this.level], false);
    this.player.maxHp = MAX_HP;
    this.player.hp = MAX_HP;
    this.player.angle = -Math.PI / 2;
    this.world = new World(this, game.rng('cell-world'), this.player, (s.seed ^ 0xce11) >>> 0);
    this.world.setLevel(this.level);
    if (resume) this.restore(saved!);
    this.cam.zoom = this.targetZoom();
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.world.viewR = this.viewRadius();
    this.world.populate();
    this.backdrop = new Backdrop(game.rng('cell-backdrop'), this.world.backgroundDesigns(), this.level);
    this.joy = new Joystick(game.input, { zoneX: 0.6, topInset: 120 });
    this.joy.setViewportWidth(game.w);
    this.hud = new CellHud(game, {
      onPause: () => { this.paused = true; },
      onResume: () => { this.paused = false; },
      onMate: () => this.callMate(),
      onBrain: () => this.startFinale(),
    });
    if (game.debug) this.debugPanel();
    if (resume) {
      this.world.graceT = 6;
      this.phase = 'play';
      this.applyDesign(s.cell!, false);
      this.updateObjective();
      this.beginHatch(this.player.x, this.player.y);
      this.hud.toast(`Welcome back to the pool, ${s.speciesName}.`, '🫧');
    } else {
      this.phase = 'choose';
      this.world.hidden = true;
      this.hud.setVisible(false);
      this.joy.enabled = false;
      const pal = design.colors;
      const designs: Record<StartDiet, Design> = {
        herbivore: starterCell('herbivore', s.speciesName, pal),
        carnivore: starterCell('carnivore', s.speciesName, pal),
      };
      this.choice = showDietChoice(game, designs, (d) => this.chooseDiet(d, designs[d]));
    }
    this.hud.update(this.hudState());
  }

  exit() {
    this.joy?.destroy();
    this.choice?.close();
    document.body.classList.remove('cell-active');
  }

  onResize(w: number, h: number) {
    this.cam.setViewport(w, h);
    this.joy?.setViewportWidth(w);
  }

  serialize(): CellSave | undefined {
    if (this.phase === 'choose' || this.phase === 'done' || this.completed) return undefined;
    const p = this.player;
    return {
      v: 1, dna: this.dna, earned: this.earned, plant: this.plantDNA, meat: this.meatDNA, egg: this.eggDNA,
      level: this.level, hp: Math.max(1, Math.round(p.hp)), elapsed: Math.round(this.elapsed), kills: this.kills, eaten: this.eaten,
      deaths: this.deaths, giantKills: this.giantKills, shards: this.shardsFound, mission: this.mission, missionCount: this.missionCount,
      mateUnlocked: this.mateUnlocked, newParts: this.newParts.slice(), x: Math.round(p.x), y: Math.round(p.y), angle: p.angle,
    };
  }

  private restore(sv: CellSave) {
    const n = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
    this.dna = n(sv.dna);
    this.earned = clamp(n(sv.earned), 0, DNA_GOAL);
    this.plantDNA = n(sv.plant);
    this.meatDNA = n(sv.meat);
    this.eggDNA = n(sv.egg);
    this.elapsed = n(sv.elapsed);
    this.kills = n(sv.kills);
    this.eaten = n(sv.eaten);
    this.deaths = n(sv.deaths);
    this.giantKills = n(sv.giantKills);
    this.shardsFound = n(sv.shards);
    this.mission = n(sv.mission);
    this.missionCount = n(sv.missionCount);
    this.mateUnlocked = !!sv.mateUnlocked;
    this.newParts = Array.isArray(sv.newParts) ? sv.newParts.filter((x) => typeof x === 'string') : [];
    this.player.hp = clamp(n(sv.hp, MAX_HP), 1, MAX_HP);
    this.player.x = n(sv.x);
    this.player.y = n(sv.y);
    this.player.angle = n(sv.angle, -Math.PI / 2);
  }

  private chooseDiet(diet: StartDiet, design: Design) {
    const g = this.game;
    this.choice = null;
    g.setDesign('cell', design);
    g.history(diet === 'herbivore' ? 'Began life as a plant-grazing cell' : 'Began life as a hunting cell', diet === 'herbivore' ? '🌿' : '🥩');
    this.applyDesign(design, false);
    this.phase = 'play';
    this.hud.setVisible(true);
    this.joy.enabled = true;
    this.beginHatch(this.player.x, this.player.y);
    this.updateObjective();
    setTimeout(() => g.banner('The tide pool', g.state?.speciesName ?? 'Life'), 500);
    setTimeout(() => {
      if (this.phase !== 'play' && this.phase !== 'hatch') return;
      this.hint('cell-move', 'Touch and drag on the left side to swim (or hold the right side to steer toward your finger).', '👆');
    }, 2600);
    setTimeout(() => {
      if (this.eaten > 0) return;
      this.hint('cell-eat', diet === 'herbivore' ? 'Swim your mouth into the glowing green plant flakes to eat them.' : 'Bite red meat chunks and swallow tiny cells. Your jaw can\'t eat plants.', diet === 'herbivore' ? '🌿' : '🥩');
    }, 9000);
  }

  /** Recompute everything that depends on the design (after the editor or on load). */
  private applyDesign(d: Design, announce: boolean) {
    const p = this.player;
    const before = p.ab;
    p.design = d;
    p.ab = computeAbilities(d);
    p.diet = designDiet(d);
    const g = this.game;
    if (!announce) return;
    const ab = p.ab;
    this.hud.toast(describeAbilities(ab), '🧬', 'good', 3500);
    if (ab.sight === 0) this.hint('cell-blind', 'Without eyes your vision shrinks to a small circle. Add an eye to see further.', '👁️');
    if (ab.poison > 0 && before.poison === 0) this.hint('cell-poison', 'Your poison sac leaves a toxic trail. Lead hunters through it!', '☠️');
    if (ab.electric > 0 && before.electric === 0) this.hint('cell-electric', 'Your electric node zaps everything around you every few seconds.', '⚡');
    if (ab.jet > 0 && before.jet === 0) this.hint('cell-jet', 'Jets push you forward in powerful bursts while you swim.', '💨');
    if (ab.cilia > 0 && before.cilia === 0) this.hint('cell-cilia', 'Cilia let you turn on a dime and swim sideways.', '〰️');
    if (ab.spikes > 0 && before.spikes === 0) this.hint('cell-spike', 'Spikes hurt whatever they ram. Point them at your enemies and charge!', '🔱');
    if (ab.drain > 0 && before.drain === 0) this.hint('cell-drain', 'Your proboscis latches onto live cells and drains them, and sips plants too.', '🦟');
    if (ab.eatsMeat && ab.eatsPlants) this.hint('cell-omni', 'Your cell can now eat both plants and meat.', '🍄');
  }

  // ------------------------------------------------------------------ helpers

  /** First-time hints, queued so they never pile up on screen. */
  private hint(id: string, text: string, icon = '💡') {
    const s = this.game.state;
    if (!s || s.carry['hint:' + id] || this.hintQ.some((q) => q.id === id)) return;
    this.hintQ.push({ id, text, icon });
  }

  /** The player already did what a hint would teach: never show it. */
  private consumeHint(id: string) {
    const s = this.game.state;
    if (s) s.carry['hint:' + id] = true;
    this.hintQ = this.hintQ.filter((q) => q.id !== id);
  }

  private pumpHints(dt: number) {
    this.hintT -= dt;
    if (this.hintT > 0 || !this.hintQ.length || (this.phase !== 'play' && this.phase !== 'hatch')) return;
    const q = this.hintQ.shift()!;
    this.game.hint(q.id, q.text, q.icon);
    this.hintT = 5.5;
  }

  private targetZoom(): number {
    const k = clamp(Math.min(this.game.w, this.game.h) / 390, 0.8, 2.2);
    return (BASE_ZOOM * k) / Math.pow(this.player.size, 0.92);
  }

  private viewRadius(): number {
    const z = Math.min(this.cam.zoom, this.targetZoom());
    return Math.hypot(this.game.w, this.game.h) / 2 / z;
  }

  sfxAt(name: SfxName, x: number, y: number, opts: { pitch?: number; vol?: number } = {}) {
    const d = Math.hypot(x - this.cam.x, y - this.cam.y);
    const vol = clamp(1.25 - d / (this.world.viewR * 1.05), 0, 1) * (opts.vol ?? 1);
    if (vol < 0.06) return;
    audio.sfx(name, { pitch: opts.pitch, vol });
  }

  lockedParts(): string[] {
    const un = this.game.state?.unlocked ?? [];
    return partsFor('cell').filter((p) => p.tier > 1 && !un.includes(p.id)).map((p) => p.id);
  }

  private nextLockedPart(): string | null {
    const locked = partsFor('cell').filter((p) => p.tier > 1 && !(this.game.state?.unlocked ?? []).includes(p.id));
    if (!locked.length) return null;
    const maxTier = this.level >= 2 ? 99 : 2;
    let pool = locked.filter((p) => p.tier <= maxTier);
    if (!pool.length) pool = locked;
    const minT = Math.min(...pool.map((p) => p.tier));
    const choices = pool.filter((p) => p.tier === minT);
    return choices[Math.floor(Math.random() * choices.length)].id;
  }

  private allPartsUnlocked(): boolean {
    const un = this.game.state?.unlocked ?? [];
    return partsFor('cell').every((p) => p.tier <= 1 || un.includes(p.id));
  }

  private card(): CardColor {
    const tot = this.plantDNA + this.meatDNA;
    if (tot <= 0) {
      const d = designDiet(this.player.design);
      return d === 'carnivore' ? 'red' : d === 'herbivore' ? 'green' : 'blue';
    }
    const m = this.meatDNA / tot;
    return m >= 0.65 ? 'red' : m <= 0.35 ? 'green' : 'blue';
  }

  private hudState() {
    const tot = this.plantDNA + this.meatDNA;
    const affordable = this.newParts.some((id) => (getPart(id)?.cost ?? 999) <= this.dna);
    return {
      earned: this.earned, dna: this.dna, level: this.level, hp: this.player.hp, maxHp: MAX_HP,
      meatFrac: tot > 0 ? this.meatDNA / tot : null,
      mateUnlocked: this.mateUnlocked,
      mateReady: this.mateUnlocked && this.phase === 'play' && (affordable || this.dna >= 40),
      newParts: this.newParts.length,
      canEvolve: this.earned >= DNA_GOAL && (this.phase === 'play' || this.phase === 'hatch'),
    };
  }

  // ------------------------------------------------------------------ WorldHost callbacks

  playerEats(kind: FoodKind, value: number, x: number, y: number, food: Food | null) {
    const p = this.player;
    this.addDNA(value, kind, x, y);
    p.hp = Math.min(MAX_HP, p.hp + Math.max(4, MAX_HP * this.tune.healPerFood));
    this.eaten++;
    this.game.stat('cell-food');
    if (this.eaten === 1) this.game.unlock('first-bite');
    const col = kind === 'plant' ? '#9dff7a' : kind === 'meat' ? '#ff8f7a' : '#ffe08a';
    this.fx.burst(x, y, 7, col, 45 * p.size, 1.3 * p.size, 'dot', 0.45);
    this.fx.burst(x, y, 2, col, 10 * p.size, 4 * p.size, 'glow', 0.4);
    if (kind === 'plant') audio.sfx('eat', { pitch: 0.9 + Math.random() * 0.35 });
    else if (kind === 'meat') audio.sfx(food ? 'chomp' : 'eat', { pitch: food ? 1.1 : 0.75 });
    else audio.sfx('pop', { pitch: 1.3 });
    if (this.mission === 0) {
      this.missionCount++;
      if (this.missionCount >= MISSION_EAT) this.completeMission('Mission complete: first meal!', 3);
      else this.updateObjective();
    }
  }

  private addDNA(amount: number, kind: FoodKind | 'bonus', x: number, y: number) {
    this.dna += amount;
    const before = this.earned;
    this.earned = Math.min(DNA_GOAL, this.earned + amount);
    if (kind === 'plant') this.plantDNA += amount;
    else if (kind === 'meat') this.meatDNA += amount;
    else if (kind === 'egg') this.eggDNA += amount;
    const col = kind === 'plant' ? '#9dff7a' : kind === 'meat' ? '#ff9c86' : kind === 'egg' ? '#ffe08a' : '#7ff3ff';
    this.fx.popup(x, y, `+${amount}`, col, amount >= 3);
    const lvl = Math.min(LEVELS - 1, Math.floor(this.earned / DNA_PER_LEVEL));
    if (lvl > this.level) this.levelUp(lvl);
    if (before < DNA_GOAL && this.earned >= DNA_GOAL) this.onFull();
    if (!this.mateUnlocked && this.dna >= MATE_UNLOCK_DNA) this.unlockMate();
    if (this.mission === 3) this.updateObjective();
  }

  playerHurt(amount: number, src: Cell | null, how: string) {
    const p = this.player;
    if (this.phase !== 'play' && this.phase !== 'mate') return;
    const continuous = how === 'poison' || how === 'drain';
    if (!continuous && p.invuln > 0) return;
    p.hp -= amount;
    this.game.stat('cell-damage', Math.round(amount));
    if (continuous) {
      p.flash = Math.max(p.flash, 0.5);
      p.flashColor = how === 'poison' ? '#9dff5a' : '#ff6b6b';
      this.fx.hurtA = Math.max(this.fx.hurtA, 0.25);
      if (this.hurtSfxT <= 0) { this.hurtSfxT = 0.5; audio.sfx('hurt', { vol: 0.5, pitch: 1.3 }); }
    } else {
      p.invuln = HURT_IFRAMES;
      this.hurtBlink = HURT_IFRAMES;
      p.flash = 1;
      p.flashColor = how === 'shock' ? '#bfeaff' : '#ff4d4d';
      this.fx.shake(4 + amount * 0.18);
      this.fx.hurtA = Math.min(0.9, 0.35 + amount / 120);
      audio.sfx('hurt');
      if (src) {
        const dx = p.x - src.x, dy = p.y - src.y, d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 120 * p.size;
        p.vy += (dy / d) * 120 * p.size;
      }
    }
    if (src && sizeClass(src.size / p.size, src.giant) !== 'prey') {
      this.hint('cell-danger', 'Cells with orange sparks are hunting you. Swim away, or fight back with spikes, poison or shocks!', '⚠️');
    }
    if (p.hp <= 0) this.die();
  }

  npcKilled(c: Cell, byPlayer: boolean, how: string) {
    if (!byPlayer) return;
    this.kills++;
    this.game.stat('cell-kills');
    if (c.giant) {
      this.giantKills++;
      this.game.unlock('titan-cell');
      this.game.history('Brought down a giant cell', '🎯');
      this.fx.flash('#ffffff', 0.4);
      this.fx.shake(10);
      this.hud.toast('You brought down a giant!', '🎯', 'gold');
    }
    if (how === 'swallow') this.game.stat('cell-swallowed');
  }

  collectShard(s: Shard) {
    const g = this.game;
    const id = s.partId && !(g.state?.unlocked ?? []).includes(s.partId) ? s.partId : this.nextLockedPart();
    this.fx.flash('#fff3c4', 0.35);
    this.fx.burst(s.x, s.y, 22, '#ffd166', 160 * this.player.size, 2 * this.player.size, 'spark', 0.6);
    this.fx.burst(s.x, s.y, 6, '#ffe9a8', 30 * this.player.size, 6 * this.player.size, 'glow', 0.6);
    this.fx.ring(s.x, s.y, s.r, s.r * 8, '#ffd166', 0.6, 5);
    audio.sfx('unlock');
    this.shardsFound++;
    g.stat('cell-shards');
    if (!id) {
      this.addDNA(5, 'bonus', s.x, s.y);
      this.hud.toast('The shard held raw DNA (+5).', '☄️', 'good');
      return;
    }
    if (g.unlockPart(id)) {
      const p = getPart(id);
      const name = p?.name ?? id;
      this.newParts.push(id);
      this.hud.toast(`New part: ${name}! Call a mate to add it.`, '☄️', 'gold', 3800);
      g.history(`Found the ${name} in a meteor shard`, '☄️');
      if (!this.mateUnlocked) this.unlockMate();
      if (this.allPartsUnlocked()) g.unlock('completionist');
    }
    if (this.mission === 1) this.completeMission('Mission complete: a new part!', 3);
  }

  wrongFood(kind: FoodKind) {
    const p = this.player;
    audio.sfx('error', { vol: 0.35 });
    this.fx.popup(p.x, p.y - bodyR(p), '✕', '#ffb0a0');
    if (kind === 'plant') this.hint('cell-wrong-plant', 'Your jaw can\'t digest plants. Add a filter mouth or proboscis with Call Mate to eat them.', '🌿');
    else if (kind === 'meat') this.hint('cell-wrong-meat', 'Filter mouths can\'t eat meat. Add a jaw with Call Mate to eat it.', '🥩');
  }

  // ------------------------------------------------------------------ progression

  private unlockMate() {
    this.mateUnlocked = true;
    this.hint('cell-mate', 'Call Mate is ready: tap 💞 to evolve your cell in the Cell Creator.', '💞');
  }

  private completeMission(text: string, bonus: number) {
    this.mission++;
    this.missionCount = 0;
    if (this.mission === 1) {
      if (this.lockedParts().length === 0) this.mission = 3;
      // The first meteor shard lands just out of sight; the edge arrow points the way.
      else if (!this.world.shards.length) {
        const a = Math.random() * TAU, d = this.world.viewR * 0.95;
        this.world.spawnShard(false, null, this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d);
      }
    }
    audio.sfx('success');
    this.hud.toast(`${text} +${bonus} 🧬`, '✅', 'good');
    this.addDNA(bonus, 'bonus', this.player.x, this.player.y - bodyR(this.player) * 2);
    this.updateObjective(true);
  }

  private updateObjective(flash = false) {
    let text = '';
    if (this.earned >= DNA_GOAL) text = '🧠 Grow a brain to leave the pool';
    else if (this.mission === 0) text = `🍽️ Eat ${MISSION_EAT} morsels (${this.missionCount}/${MISSION_EAT})`;
    else if (this.mission === 1) text = '☄️ Find a glowing meteor shard';
    else if (this.mission === 2) text = '💞 Call a mate to add your new part';
    else {
      const next = Math.min(LEVELS, this.level + 1) * DNA_PER_LEVEL;
      text = this.level >= LEVELS - 1 ? `🫧 Eat to fill the bar (${Math.floor(this.earned)}/${DNA_GOAL})` : `🫧 Eat to grow: ${Math.floor(this.earned)}/${next} DNA`;
    }
    this.hud.setObjective(text, flash);
  }

  private levelUp(n: number) {
    const g = this.game;
    const p = this.player;
    this.level = n;
    this.world.setLevel(n);
    this.growFrom = p.size;
    this.growTo = LEVEL_SCALE[n];
    this.growT = 0;
    this.backdrop.surface(n);
    p.hp = MAX_HP;
    this.fx.ring(p.x, p.y, bodyR(p), bodyR(p) * 6, '#7ff3e0', 0.9, 6);
    this.fx.burst(p.x, p.y, 26, '#bffff2', 140 * p.size, 2 * p.size, 'spark', 0.8);
    this.fx.flash('#bffff2', 0.25);
    audio.sfx('levelup');
    g.banner(`Level ${n + 1} of ${LEVELS}`, LEVEL_NAMES[n]);
    g.history(`Grew to ${LEVEL_NAMES[n]} size`, '🫧');
    g.stat('cell-levels');
    // Bigger neighbours rise out of the blurry depths, right where you can see them.
    setTimeout(() => {
      if (this.phase === 'finale' || this.phase === 'done') return;
      const k = this.tune.predators >= 2 ? 2 : 1;
      for (let i = 0; i < k; i++) this.world.spawnNpc('predator', { near: true, emerge: true });
      if (this.lockedParts().length) this.world.spawnShard(false);
    }, 1400);
    this.hint('cell-grow', 'You grew! Cells that once hunted you are now your size, and bigger ones are rising from the deep.', '🫧');
    if (this.mission === 3) this.updateObjective(true);
  }

  private onFull() {
    audio.sfx('success');
    this.hud.toast('Your cell is ready to evolve!', '🧠', 'gold', 4000);
    this.hint('cell-brain', 'Tap “Grow a brain” when you are ready to leave the pool. You can keep swimming and editing first.', '🧠');
    this.updateObjective(true);
  }

  // ------------------------------------------------------------------ death, hatching, mating

  private die() {
    const p = this.player;
    if (this.phase === 'dead') return;
    this.phase = 'dead';
    this.deadT = 0;
    p.dead = true;
    p.latched = null;
    this.world.mate = null;
    this.deaths++;
    this.game.stat('cell-deaths');
    this.fx.burst(bodyX(p), bodyY(p), 30, p.design.colors.base, 130 * p.size, 2.4 * p.size, 'dot', 1);
    this.fx.burst(bodyX(p), bodyY(p), 10, '#ffffff', 160 * p.size, 1.4 * p.size, 'spark', 0.5);
    this.fx.ring(bodyX(p), bodyY(p), bodyR(p), bodyR(p) * 4, '#ff8f8f', 0.7, 5);
    this.fx.shake(14);
    this.fx.hurtA = 1;
    audio.sfx('die');
  }

  private respawn() {
    const p = this.player;
    const w = this.world;
    let best = { x: p.x, y: p.y }, bestScore = -1;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU, d = w.viewR * (1.6 + Math.random() * 0.8);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      let score = Infinity;
      for (const c of w.npcs) {
        if (c.dead || sizeClass(c.size / p.size, c.giant) === 'prey' || c.diet === 'herbivore') continue;
        score = Math.min(score, Math.hypot(c.x - x, c.y - y));
      }
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    p.x = best.x; p.y = best.y; p.vx = 0; p.vy = 0;
    p.dead = false;
    p.hp = MAX_HP;
    p.flash = 0;
    for (const c of w.npcs) if (c.target === p) { c.state = 'wander'; c.target = null; c.calmT = 6; }
    this.cam.x = p.x; this.cam.y = p.y;
    this.fx.hurtA = 0;
    this.beginHatch(p.x, p.y);
    this.hud.toast('Reborn as a newborn. Nothing was lost.', '🥚');
  }

  private beginHatch(x: number, y: number) {
    this.phase = 'hatch';
    this.hatchT = 0;
    this.hatchX = x;
    this.hatchY = y;
    this.world.hidden = true;
    this.player.vx = 0; this.player.vy = 0;
  }

  private updateHatch(dt: number) {
    const prev = this.hatchT;
    this.hatchT += dt / 1.5;
    const p = this.player;
    p.x = this.hatchX; p.y = this.hatchY;
    if (prev < 0.62 && this.hatchT >= 0.62) {
      const r = bodyR(p);
      this.fx.burst(p.x, p.y, 14, '#fff6dc', 110 * p.size, 2 * p.size, 'dot', 0.6);
      this.fx.bubbles(p.x, p.y, 10, 3 * p.size);
      this.fx.ring(p.x, p.y, r, r * 3, '#fff6dc', 0.5, 3);
      audio.sfx('pop', { pitch: 0.8 });
      audio.sfx('splash', { vol: 0.5, pitch: 1.4 });
    }
    if (this.hatchT >= 1) {
      this.phase = 'play';
      this.world.hidden = false;
      p.invuln = Math.max(p.invuln, 2);
    }
  }

  private callMate() {
    const g = this.game;
    if (this.phase !== 'play') { audio.sfx('error'); return; }
    if (!this.mateUnlocked) {
      audio.sfx('error');
      this.hud.toast(`Collect ${MATE_UNLOCK_DNA} DNA or a meteor shard to call a mate.`, '🔒');
      return;
    }
    if (this.world.mate) return;
    const p = this.player;
    // The mate swims in from the calmest direction.
    let ang = p.angle, best = -1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const x = p.x + Math.cos(a) * this.world.viewR * 0.6, y = p.y + Math.sin(a) * this.world.viewR * 0.6;
      let score = Infinity;
      for (const c of this.world.npcs) if (c.diet !== 'herbivore') score = Math.min(score, Math.hypot(c.x - x, c.y - y));
      if (score > best) { best = score; ang = a; }
    }
    const d = this.world.viewR * 0.55;
    const m = makeCell(p.design, p.ab, p.diet, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, p.size, true);
    m.state = 'court';
    m.angle = ang + Math.PI;
    this.world.mate = { cell: m, phase: 'approach', t: 0 };
    this.phase = 'mate';
    this.consumeHint('cell-mate');
    audio.sfx('charm');
    this.fx.hearts(m.x, m.y, 6, 7 * p.size);
    g.stat('cell-mates');
  }

  private updateMate(dt: number) {
    const mate = this.world.mate;
    const p = this.player;
    if (!mate) { if (this.phase === 'mate') this.phase = 'play'; return; }
    const m = mate.cell;
    mate.t += dt;
    this.sparkleT -= dt;
    if (mate.phase === 'approach') {
      // Mates home in fast and true.
      const dx = p.x - m.x, dy = p.y - m.y, dd = Math.hypot(dx, dy) || 1;
      const sp = 150 * p.size;
      m.x += (dx / dd) * sp * dt; m.y += (dy / dd) * sp * dt;
      m.angle = turnToward(m.angle, Math.atan2(dy, dx), 7 * dt);
      m.t += dt * 2;
      if (this.sparkleT <= 0) { this.sparkleT = 0.18; this.fx.hearts(m.x, m.y, 1, 6 * p.size); }
      const touch = bodyR(p) + bodyR(m);
      if (Math.hypot(m.x - p.x, m.y - p.y) < touch * 1.15 || mate.t > 5) {
        mate.phase = 'court';
        mate.t = 0;
        this.world.hidden = true;
        audio.sfx('charm', { pitch: 1.2 });
        this.fx.hearts((p.x + m.x) / 2, (p.y + m.y) / 2, 10, 8 * p.size);
      }
    } else if (mate.phase === 'court') {
      const cx = (p.x + m.x) / 2, cy = (p.y + m.y) / 2;
      const r = bodyR(p) * 1.1;
      const a = mate.t * 3.4;
      p.x = damp(p.x, cx + Math.cos(a) * r, 8, dt); p.y = damp(p.y, cy + Math.sin(a) * r, 8, dt);
      m.x = damp(m.x, cx - Math.cos(a) * r, 8, dt); m.y = damp(m.y, cy - Math.sin(a) * r, 8, dt);
      p.angle = a + Math.PI / 2; m.angle = a - Math.PI / 2;
      p.vx = p.vy = m.vx = m.vy = 0;
      p.t += dt * 2; m.t += dt * 2;
      if (this.sparkleT <= 0) { this.sparkleT = 0.12; this.fx.hearts(cx, cy, 2, 7 * p.size); }
      if (mate.t > 1.5 && mate.phase === 'court') {
        mate.phase = 'done';
        this.openCreator();
      }
    }
  }

  private openCreator() {
    const g = this.game;
    this.phase = 'editor';
    this.steerPtr = null;
    g.fade(() => {
      const s = g.state!;
      openEditor(g, {
        design: this.player.design,
        title: 'Cell Creator',
        mode: 'stage',
        budget: Math.floor(this.dna),
        currency: 'DNA',
        unlocked: s.unlocked,
        bodyResizeOnly: true,
        tabs: defaultTabs('cell'),
        required: [{ cat: ['cell-mouth'], msg: 'Your cell needs a mouth to eat!' }],
        maxParts: 12,
        doneLabel: 'Hatch',
        background: 'tide',
        hint: this.newParts.length ? `New: ${this.newParts.map((id) => getPart(id)?.name ?? id).join(', ')}. Parts stack: two flagella swim faster than one.` : 'Parts stack in the cell stage: two flagella swim faster than one.',
        lockedHint: 'Locked. Find meteor shards (or defeat gold-star cells) to unlock this part.',
      }).then((res) => this.afterEditor(res));
    });
  }

  private afterEditor(res: EditorResult | null) {
    const g = this.game;
    const p = this.player;
    this.world.mate = null;
    if (res) {
      this.dna = Math.max(0, this.dna - res.spent);
      g.setDesign('cell', res.design);
      this.applyDesign(res.design, true);
      this.newParts = [];
      g.stat('cell-edits');
      g.history('Evolved in the Cell Creator', '🧬');
      if (this.mission === 2) this.completeMission('Mission complete: evolved!', 3);
    }
    // Hatch a short distance away: predators lose track of you.
    const a = Math.random() * TAU, d = this.world.viewR * 0.5;
    p.x += Math.cos(a) * d; p.y += Math.sin(a) * d;
    this.cam.x = p.x; this.cam.y = p.y;
    for (const c of this.world.npcs) if (c.target === p) { c.state = 'wander'; c.target = null; c.calmT = 5; }
    this.beginHatch(p.x, p.y);
    this.hud.update(this.hudState());
  }

  // ------------------------------------------------------------------ finale

  private startFinale() {
    if (this.earned < DNA_GOAL || (this.phase !== 'play' && this.phase !== 'hatch')) return;
    const g = this.game;
    this.phase = 'finale';
    this.finT = 0;
    this.world.hidden = true;
    this.world.mate = null;
    this.hud.setVisible(false);
    this.joy.enabled = false;
    this.growFrom = this.player.size;
    this.growTo = this.player.size * 1.7;
    this.growT = 1;
    for (const c of this.world.npcs) { c.state = 'flee'; c.target = this.player; c.stateT = 12; }
    // The clock stops when you choose to evolve.
    if (!g.state?.usedCheats) {
      if (this.kills === 0) g.unlock('gentle-giant');
      if (this.elapsed < 360) g.unlock('quickening');
    }
    if (this.allPartsUnlocked()) g.unlock('completionist');
    audio.music('victory');
    this.caption = makeCaption(g);
    this.caption.say(`A spark of thought flickers inside the ${g.state?.speciesName ?? 'cell'}...`);
    const skip = button('Skip ⏭', () => this.complete(), { cls: 'small skip-btn' });
    g.layer().append(skip);
  }

  private updateFinale(dt: number) {
    const prev = this.finT;
    this.finT += dt;
    const t = this.finT;
    const p = this.player;
    const cross = (x: number) => prev < x && t >= x;
    if (cross(1.4)) {
      audio.sfx('levelup', { pitch: 0.8 });
      this.fx.ring(p.x, p.y, bodyR(p), bodyR(p) * 7, '#ffe6a3', 1, 6);
      this.fx.flash('#fff3d6', 0.4);
      this.growT = 0;
    }
    if (cross(3.6)) this.caption?.say('...and the shallows have grown too small.');
    if (cross(5.4)) audio.sfx('warp', { pitch: 0.7 });
    if (t > 1.4) {
      p.steerX = 0; p.steerY = -1;
      p.throttle = clamp((t - 1.6) / 1.5, 0, 0.9);
      this.backdrop.shore = clamp((t - 2) / 3.5, 0, 1);
    } else {
      p.throttle = 0;
    }
    if (t > 5.6) this.fx.flash('#fffaf0', clamp((t - 5.6) / 1.3, 0, 1));
    if (t > 7.1) this.complete();
  }

  private complete() {
    if (this.completed) return;
    this.completed = true;
    const g = this.game;
    const s = g.state!;
    const card = this.card();
    g.setDesign('cell', this.player.design);
    g.history('Grew a brain and crawled toward the shore', '🧠');
    const tot = this.plantDNA + this.meatDNA;
    const plantPct = tot > 0 ? Math.round((this.plantDNA / tot) * 100) : 0;
    const unlocked = partsFor('cell').filter((p) => p.tier <= 1 || s.unlocked.includes(p.id)).length;
    const mins = Math.floor(this.elapsed / 60), secs = Math.floor(this.elapsed % 60);
    const summary = [
      tot > 0 ? `Diet: ${plantPct}% plants · ${100 - plantPct}% meat` : 'Diet: a little of everything',
      this.kills === 0 ? 'A gentle soul: no cells harmed' : `Cells defeated: ${this.kills}${this.giantKills ? ` (giants: ${this.giantKills})` : ''}`,
      `Parts collected: ${unlocked}/${partsFor('cell').length}`,
      `Time in the pool: ${mins}:${String(secs).padStart(2, '0')}`,
    ];
    this.phase = 'done';
    g.completeStage(card, summary);
  }

  // ------------------------------------------------------------------ debug

  private debugPanel() {
    const g = this.game;
    const cheat = () => { if (g.state) g.state.usedCheats = true; };
    this.hud.debugPanel([
      { label: '+20 🧬', fn: () => { cheat(); this.addDNA(20, 'bonus', this.player.x, this.player.y); } },
      { label: 'Grow ⤴', fn: () => { cheat(); const next = Math.min(DNA_GOAL, (this.level + 1) * DNA_PER_LEVEL); this.addDNA(Math.max(1, next - this.earned), 'bonus', this.player.x, this.player.y); } },
      { label: '☄️ Shard', fn: () => { cheat(); this.world.spawnShard(true); } },
      { label: '🏁 Win', fn: () => { cheat(); if (this.earned < DNA_GOAL) this.addDNA(DNA_GOAL - this.earned, 'bonus', this.player.x, this.player.y); if (this.phase === 'play' || this.phase === 'hatch') this.startFinale(); } },
    ]);
  }

  // ------------------------------------------------------------------ input

  onPointerDown(p: PointerInfo): boolean {
    if (this.phase !== 'play' || this.paused) return false;
    if (p.y < 120) return false;
    this.steerPtr = { id: p.id, x: p.x, y: p.y };
    return true;
  }
  onPointerMove(p: PointerInfo) {
    if (this.steerPtr && this.steerPtr.id === p.id) { this.steerPtr.x = p.x; this.steerPtr.y = p.y; }
  }
  onPointerUp(p: PointerInfo) {
    if (this.steerPtr && this.steerPtr.id === p.id) this.steerPtr = null;
  }
  onKey(key: string, down: boolean) {
    if (!down || this.paused) return;
    if (key === 'm') this.callMate();
  }

  // ------------------------------------------------------------------ update

  update(dt: number) {
    this.t += dt;
    if (this.paused || this.phase === 'done') return;
    const p = this.player;
    const w = this.world;
    this.fx.reduced = this.game.settings.reducedMotion;
    if (this.phase === 'choose') {
      this.choice?.tick(dt);
      w.viewR = this.viewRadius();
      w.update(dt);
      this.cam.x += Math.sin(this.t * 0.2) * 6 * dt;
      this.cam.y -= 4 * dt;
      p.x = this.cam.x; p.y = this.cam.y;
      this.backdrop.update(dt, this.cam, this.game.w, this.game.h);
      this.fx.update(dt);
      return;
    }
    if (this.phase === 'play' || this.phase === 'mate' || this.phase === 'hatch' || this.phase === 'dead') this.elapsed += dt;
    this.hurtSfxT -= dt;
    this.hurtBlink -= dt;

    // Steering
    if (this.phase === 'play') {
      let vx: number, vy: number;
      if (this.steerPtr) {
        const s = this.cam.worldToScreen(p.x, p.y);
        const dx = this.steerPtr.x - s.x, dy = this.steerPtr.y - s.y, d = Math.hypot(dx, dy) || 1;
        const mag = clamp(d / 70, 0, 1);
        vx = (dx / d) * mag; vy = (dy / d) * mag;
      } else {
        const v = this.joy.value;
        vx = v.x; vy = v.y;
      }
      p.steerX = vx; p.steerY = vy;
      p.throttle = Math.min(1, Math.hypot(vx, vy));
    } else if (this.phase !== 'finale') {
      p.throttle = 0;
    }

    // Growth animation
    if (this.growT < 1) {
      this.growT = Math.min(1, this.growT + dt / (this.phase === 'finale' ? 1.8 : 1.6));
      p.size = lerp(this.growFrom, this.growTo, easeOutBack(this.growT));
    }

    w.viewR = this.viewRadius();
    if (this.phase === 'play' || this.phase === 'finale' || (this.phase === 'mate' && w.mate?.phase === 'approach')) w.swim(p, dt);
    w.update(dt);
    if (this.phase === 'play' || this.phase === 'mate') w.playerEat(dt);

    // Player timers
    p.invuln = Math.max(0, p.invuln - dt);
    p.flash = Math.max(0, p.flash - dt * 3.5);
    p.biteAnim = Math.max(0, p.biteAnim - dt * 3);
    p.biteCd -= dt;
    p.ramCd -= dt;
    if (this.phase === 'play' && p.hp < MAX_HP) p.hp = Math.min(MAX_HP, p.hp + this.tune.regen * dt);

    if (this.phase === 'mate') this.updateMate(dt);
    if (this.phase === 'hatch') this.updateHatch(dt);
    if (this.phase === 'finale') this.updateFinale(dt);
    if (this.phase === 'dead') {
      this.deadT += dt;
      if (this.deadT > 1.1 && this.deadT - dt <= 1.1) this.game.fade(() => this.respawn(), 380);
    }

    // Camera
    const look = this.phase === 'play' ? 0.3 : 0;
    // In the finale the camera lets go, so the cell visibly swims up toward the shore.
    const follow = this.phase === 'finale' ? (this.finT < 2 ? 4.2 : 0.25) : 4.2;
    this.cam.x = damp(this.cam.x, p.x + p.vx * look, follow, dt);
    this.cam.y = damp(this.cam.y, p.y + p.vy * look, follow, dt);
    let zt = this.targetZoom();
    if (this.phase === 'finale') zt *= this.finT < 1.4 ? lerp(1, 1.35, easeInOutCubic(this.finT / 1.4)) : lerp(1.35, 0.75, easeInOutCubic(clamp((this.finT - 1.4) / 4, 0, 1)));
    if (w.mate?.phase === 'court') zt *= 1.25;
    this.cam.zoom = damp(this.cam.zoom, zt, this.growT < 1 ? 1.8 : 2.6, dt);

    this.backdrop.levelF = damp(this.backdrop.levelF, this.level, 0.8, dt);
    const fl = w.flow(this.cam.x, this.cam.y);
    this.backdrop.setFlow(fl.x, fl.y);
    this.backdrop.update(dt, this.cam, this.game.w, this.game.h);
    this.fx.update(dt);
    this.ambientSparkles(dt);
    this.updateMood(dt);
    this.watchForHints();
    this.pumpHints(dt);
    this.world.graceT -= dt;
    this.watchPerformance(dt);

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.hud.update(this.hudState());
      this.hud.mateCooldown(this.phase === 'mate' || this.phase === 'editor' ? 1 : 0);
    }
  }

  /** If the device can't keep up, switch to cheaper rendering once (no oscillation). */
  private watchPerformance(dt: number) {
    if (this.lowQuality || this.phase !== 'play') return;
    this.perfT += dt;
    if (this.perfT < 6) return;
    this.slowT = this.game.fps < 42 ? this.slowT + dt : Math.max(0, this.slowT - dt * 0.5);
    if (this.slowT > 4) {
      this.lowQuality = true;
      this.backdrop.setLowQuality();
      drawCfg.fullPx = 46;
      drawCfg.fullMax = 8;
    }
  }

  private ambientSparkles(dt: number) {
    // Shards sparkle; drifting bubbles near the player.
    for (const s of this.world.shards) {
      if (Math.random() < dt * 4) this.fx.burst(s.x + (Math.random() - 0.5) * s.r * 3, s.y + (Math.random() - 0.5) * s.r * 3, 1, '#ffe9a8', 10 * this.player.size, 3 * this.player.size, 'glow', 0.8);
    }
  }

  private updateMood(dt: number) {
    const p = this.player;
    let danger = false;
    if (this.phase === 'play') {
      for (const c of this.world.npcs) {
        if (c.state === 'hunt' && c.target === p && sizeClass(c.size / p.size, c.giant) !== 'prey' && Math.hypot(c.x - p.x, c.y - p.y) < this.world.viewR) { danger = true; break; }
      }
    }
    this.dangerT = danger ? 3 : this.dangerT - dt;
    const want: Mood = this.phase === 'finale' ? 'victory' : this.dangerT > 0 ? 'danger' : 'cell';
    if (want !== this.mood) {
      this.mood = want;
      audio.music(want);
    }
  }

  private watchForHints() {
    if (this.phase !== 'play') return;
    const g = this.game;
    const b = this.cam.bounds(0);
    const on = (x: number, y: number) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
    if (!this.seenShard) {
      for (const s of this.world.shards) if (on(s.x, s.y)) { this.seenShard = true; this.hint('cell-shard', 'A meteor shard! Swim into it to unlock a new cell part.', '☄️'); break; }
    }
    for (const c of this.world.npcs) {
      if (!this.seenGiant && c.giant && c.emerge > 0.8 && on(c.x, c.y)) {
        this.seenGiant = true;
        this.hint('cell-giant', 'A giant! It can swallow you whole. Keep your distance, or bring spikes, poison and shocks.', '😱');
      }
      if (!this.seenStar && c.carries && on(c.x, c.y)) {
        this.seenStar = true;
        this.hint('cell-star', 'Cells with a gold star carry a part you don\'t have. Defeat one to claim it.', '⭐');
      }
    }
  }

  // ------------------------------------------------------------------ render

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    const cam = this.cam;
    cam.setViewport(w, h);
    const p = this.player;
    const sh = this.fx.shakeOffset(this.t);
    const ps = cam.worldToScreen(bodyX(p), bodyY(p));
    const sight = this.phase === 'choose' || this.phase === 'finale' || this.phase === 'dead' ? 2 : p.ab.sight;
    const vis = { px: ps.x + sh.x, py: ps.y + sh.y, sight, hurt: this.fx.hurtA };
    this.backdrop.renderBack(g, w, h, vis);
    g.save();
    g.translate(sh.x, sh.y);
    cam.apply(g);
    const off = this.perfOff;
    if (!off.puffs) drawPuffs(g, this.world, cam);
    if (!off.foods) drawFoods(g, this.world, cam, this.t);
    drawShards(g, this.world, cam);
    if (!off.npcs) drawNpcs(g, this.world, cam);
    const mate = this.world.mate;
    if (mate) drawPlayerCell(g, mate.cell, 1, '#ff9ccc');
    this.drawPlayer(g);
    this.fx.renderWorld(g, cam);
    g.restore();

    this.backdrop.renderFront(g, w, h, vis);
    if (this.phase === 'finale' && this.backdrop.shore > 0.01) this.drawShore(g, w, h);
    this.fx.renderScreen(g, cam);
    if (this.phase === 'play' || this.phase === 'mate') {
      let nearest: Shard | null = null, nd = Infinity;
      for (const s of this.world.shards) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < nd) { nd = d; nearest = s; } }
      if (nearest && nd < this.world.viewR * 3.4) drawEdgeArrow(g, cam, nearest.x, nearest.y, '#ffd166', '☄️', this.t, 120);
      if (mate && mate.phase === 'approach') drawEdgeArrow(g, cam, mate.cell.x, mate.cell.y, '#ff9ccc', '💞', this.t, 120);
    }
    this.fx.renderOverlay(g, w, h);
    if (this.phase === 'play') this.joy.render(g);
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.player;
    if (this.phase === 'choose' || this.phase === 'dead') return;
    if (this.phase === 'hatch') {
      this.drawHatch(g);
      return;
    }
    const blink = this.hurtBlink > 0 && Math.sin(this.t * 30) > 0.3 && p.flash < 0.2 ? 0.6 : 1;
    // Cells get more opaque as they grow.
    const alpha = (0.84 + 0.16 * (this.level / (LEVELS - 1))) * blink;
    drawPlayerCell(g, p, alpha, p.design.colors.detail);
    // Electric charge ring
    if (p.ab.electric > 0 && this.phase === 'play') {
      const period = Math.max(2.2, 5.2 / (1 + 0.38 * (p.ab.electric - 1)));
      const k = 1 - clamp(p.elecT / period, 0, 1);
      const r = bodyR(p) * 1.45;
      g.strokeStyle = `rgba(140,220,255,${0.25 + k * 0.45})`;
      g.lineWidth = 2.2 / this.cam.zoom;
      g.beginPath();
      g.arc(bodyX(p), bodyY(p), r, -Math.PI / 2, -Math.PI / 2 + k * TAU);
      g.stroke();
    }
    // Brain spark in the finale
    if (this.phase === 'finale') {
      const k = clamp(this.finT / 1.4, 0, 1);
      const r = bodyR(p) * (0.6 + k * 1.6 + Math.sin(this.t * 9) * 0.15);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5 + k * 0.4;
      g.drawImage(glowSprite('#ffe6a3'), bodyX(p) - r, bodyY(p) - r, r * 2, r * 2);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
  }

  /** The beach the cell crawls toward in the finale: sand with lapping foam. */
  private drawShore(g: CanvasRenderingContext2D, w: number, h: number) {
    const k = easeInOutCubic(this.backdrop.shore);
    const edge = -h * 0.1 + k * h * 0.5;
    const t = this.t;
    const wave = (x: number, off: number) => edge + off + Math.sin(x * 0.028 + t * 1.8) * 7 + Math.sin(x * 0.011 - t * 0.9) * 10;
    const path = (off: number) => {
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(w, -10);
      for (let x = w; x >= -12; x -= 12) g.lineTo(x, wave(x, off));
      g.closePath();
    };
    // Wet sand band, then dry sand
    g.fillStyle = 'rgba(176,140,84,0.75)';
    path(16 + Math.sin(t * 1.3) * 6);
    g.fill();
    const gr = g.createLinearGradient(0, edge - h * 0.25, 0, edge);
    gr.addColorStop(0, '#f6e6bd');
    gr.addColorStop(1, '#dcbf85');
    g.fillStyle = gr;
    path(0);
    g.fill();
    // Foam
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 6;
    g.beginPath();
    for (let x = -12; x <= w + 12; x += 12) { const y = wave(x, 4); if (x <= -12) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.35 + Math.sin(t * 1.3) * 0.15})`;
    g.lineWidth = 3;
    g.beginPath();
    for (let x = -12; x <= w + 12; x += 12) { const y = wave(x, 22 + Math.sin(t * 1.3) * 8); if (x <= -12) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }

  private drawHatch(g: CanvasRenderingContext2D) {
    const p = this.player;
    const t = this.hatchT;
    const r = bodyR(p) * 1.35;
    const x = this.hatchX, y = this.hatchY;
    if (t < 0.62) {
      const wob = Math.sin(t * 40) * 0.08 * (t / 0.62);
      g.save();
      g.translate(x, y);
      g.rotate(wob);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35;
      g.drawImage(glowSprite('#fff3c4'), -r * 2.2, -r * 2.2, r * 4.4, r * 4.4);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,245,0.95)');
      gr.addColorStop(0.7, 'rgba(240,230,190,0.85)');
      gr.addColorStop(1, 'rgba(190,170,120,0.9)');
      g.fillStyle = gr;
      g.strokeStyle = 'rgba(90,70,40,0.9)';
      g.lineWidth = 2.5 / this.cam.zoom;
      g.beginPath(); g.ellipse(0, 0, r, r * 1.15, 0, 0, TAU); g.fill(); g.stroke();
      // The embryo inside
      g.globalAlpha = 0.45;
      g.fillStyle = p.design.colors.base;
      g.beginPath(); g.ellipse(0, 0, r * 0.55, r * 0.4, Math.sin(this.t * 3) * 0.4, 0, TAU); g.fill();
      g.globalAlpha = 1;
      if (t > 0.35) {
        g.strokeStyle = 'rgba(90,70,40,0.9)';
        g.beginPath(); g.moveTo(-r * 0.5, -r * 0.2); g.lineTo(-r * 0.15, r * 0.05); g.lineTo(r * 0.1, -r * 0.25); g.lineTo(r * 0.45, 0.05 * r); g.stroke();
      }
      g.restore();
      return;
    }
    const k = clamp((t - 0.62) / 0.38, 0, 1);
    drawPlayerCell(g, p, 0.6 + 0.4 * k, p.design.colors.detail, 0.55 + 0.45 * easeOutBack(k));
  }

}
