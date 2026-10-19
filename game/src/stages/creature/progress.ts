// Progression: DNA and the brain bar, befriending and hunting outcomes, alliances, extinctions,
// migrations, part unlocks from bone piles, achievements and the consequence card.
import { audio } from '../../engine/audio';
import { ui } from '../../engine/ui';
import { getPart, partsFor } from '../../design/registry';
import type { PartDef } from '../../design/types';
import type { CardColor } from '../../game/cards';
import type { CreatureStage } from './stage';
import type { Critter, Relation, Species } from './types';
import {
  BEFRIENDS_NEEDED, BRAIN_AT, BRAIN_FULL, BRAIN_HP, EGG_REWARD, HUNTER_REWARD, LEVELUP_WALLET, LONER_REWARD, MAX_BRAIN,
  MIGRATION_AT, MIGRATION_REWARD, memberReward, REL_INFO, speciesBonus, TITAN_REWARD,
} from './config';
import { critterHeight } from './species';

export function addDNA(S: CreatureStage, n: number, x?: number, y?: number, quiet = false) {
  if (n <= 0) return;
  n = Math.round(n * S.game.diff(1.2, 1, 0.9));
  S.dna += n;
  S.earned += n;
  if (!quiet) {
    const px = x ?? S.player.x, py = y ?? S.player.y;
    S.fx.text(px, py, 60, `+${n} 🧬`, '#7dffd8', 18);
    audio.sfx('coin', { vol: 0.6 });
  }
  if (S.dna >= 75) S.hint('cr-spend', 'You have DNA to spend! Tap 📣 to call your mate, then evolve new parts at your nest.', '🧬');
  checkBrain(S);
}

export function checkBrain(S: CreatureStage) {
  while (S.brain < MAX_BRAIN && S.earned >= BRAIN_AT[S.brain + 1]) {
    S.brain++;
    brainUp(S);
  }
  if (!S.sapientReady && S.earned >= BRAIN_FULL) {
    S.sapientReady = true;
    audio.sfx('levelup');
    S.game.banner('Your brain is fully grown', 'Ready to evolve!');
    S.hint('cr-sapient', 'Your brain bar is now a “Become sapient” button. Tap it when you are ready; keep exploring as long as you like.', '🧠');
  }
}

function brainUp(S: CreatureStage) {
  const p = S.player;
  S.applyBrainSize();
  p.maxHp = S.playerMaxHp();
  p.hp = p.maxHp;
  S.hunger = 100;
  S.dna += LEVELUP_WALLET;
  audio.sfx('levelup');
  S.fx.burst('sparkle', p.x, p.y, 24, { z: critterHeight(p) * 0.6, color: '#ffe48a', speed: 160, size: 8, life: 1, up: 80 });
  S.fx.spawn('ring', p.x, p.y, { size: 20, grow: 260, life: 0.7, color: '#7dffd8' });
  S.game.banner('Brain growth', `Brain level ${S.brain}`);
  S.game.history(`Grew to brain level ${S.brain}`, '🧠');
  const slots = S.packSlots();
  ui.toast(`Max health ${p.maxHp} · Pack slots ${slots}${LEVELUP_WALLET ? ` · +${LEVELUP_WALLET} DNA` : ''}`, { icon: '🧠', kind: 'good' });
  if (slots > 0) S.hint('cr-pack', 'Your pack has room! Tap one of your family at the nest, or a member of a fully befriended species, then “Recruit”. Family at home also rush to defend you.', '🐾');
  const mi = MIGRATION_AT.indexOf(S.brain);
  if (mi >= 0 && S.migration === mi && !S.migrating) setTimeout(() => startMigration(S), 3600);
}

// ------------------------------------------------------------------ relations
export function setRelation(S: CreatureStage, sp: Species, rel: Relation) {
  if (sp.relation === rel || sp.relation === 'extinct' || sp.relation === 'allied') return;
  sp.relation = rel;
  if (sp.nest?.discovered || sp.met) {
    const info = REL_INFO[rel];
    S.hud.flashTip(`${sp.name}: ${info.face} ${info.label}`, 2);
  }
  if (rel === 'hostile') audio.sfx('roar', { pitch: 1.4, vol: 0.4 });
}

export function onBefriended(S: CreatureStage, c: Critter) {
  const sp = c.sp;
  S.counts.befriended = (S.counts.befriended ?? 0) + 1;
  S.game.stat('creature.befriended');
  if (c.role === 'loner') {
    addDNA(S, LONER_REWARD, c.x, c.y);
    sp.relation = 'allied';
    S.lonersDone.add(sp.id);
    S.game.history(`Won over the loner ${sp.name}`, '🤝');
    ui.toast(`The loner ${sp.name} wants to join you!`, { icon: '💛', kind: 'good' });
    if (!S.recruit(c, true)) S.hud.flashTip('Your pack is full. Recruit it later.');
    return;
  }
  const lvl = sp.level;
  addDNA(S, memberReward(lvl) * (c.role === 'baby' ? 0.5 : c.role === 'alpha' ? 1.5 : 1), c.x, c.y);
  if (c.role === 'alpha') S.unlockFromAlpha(c);
  sp.befriended++;
  if (sp.befriended >= BEFRIENDS_NEEDED) makeAllied(S, sp, c);
  else if (sp.befriended === BEFRIENDS_NEEDED - 1) {
    sp.relation = sp.relation === 'hostile' ? 'annoyed' : 'friendly';
    S.hud.flashTip(`${sp.name} are now friendly! ${BEFRIENDS_NEEDED - sp.befriended} more to ally.`, 2.4);
  } else S.hud.flashTip(`Befriended a ${sp.name}! ${BEFRIENDS_NEEDED - sp.befriended} more to ally.`, 2.4);
  S.hint('cr-ally', `Befriend ${BEFRIENDS_NEEDED} members of a species to make it an Ally. Allied nests heal you.`, '🤝');
}

function makeAllied(S: CreatureStage, sp: Species, last: Critter) {
  sp.relation = 'allied';
  addDNA(S, speciesBonus(sp.level), last.x, last.y);
  audio.sfx('levelup');
  S.game.banner('New allies', sp.name);
  S.game.history(`Allied with the ${sp.name}`, '💚');
  let spoke = false;
  for (const o of S.critters) {
    if (o.gone || o.sp !== sp) continue;
    o.befriended = true;
    o.aggro = 0; o.target = null;
    o.state = 'cheer'; o.st = 0;
    S.say(o, '💚', 2.5);
    if (!spoke && o !== last && o.near) { S.speak(o, 'Friends!', 2.2); spoke = true; }
  }
  if (S.pack.length < S.packSlots()) S.recruit(last, true);
  else if (S.packSlots() > 0) S.hud.flashTip('Your pack is full — dismiss a member to recruit.', 2.4);
  checkSpeciesAchievements(S);
}

export function onKilled(S: CreatureStage, c: Critter, playerSide: boolean) {
  if (S.target === c) S.target = null;
  if (c.role === 'pack') {
    S.removeFromPack(c);
    ui.toast(`${c.sp.name} from your pack has fallen`, { icon: '💔', kind: 'bad' });
  }
  if (c.role === 'mate') S.mate = null;
  if (!playerSide) return;
  const sp = c.sp;
  S.counts.kills = (S.counts.kills ?? 0) + 1;
  S.game.stat('creature.kills');
  switch (sp.kind) {
    case 'titan':
      addDNA(S, TITAN_REWARD, c.x, c.y);
      S.titansDead.add(sp.id);
      S.game.unlock('titan-slayer');
      S.game.banner('Titan slain', sp.name);
      S.game.history(`Brought down the Titan ${sp.name}`, '🗡️');
      S.fx.shake(20);
      break;
    case 'loner':
      addDNA(S, LONER_REWARD, c.x, c.y);
      S.lonersDone.add(sp.id);
      sp.relation = 'extinct';
      S.game.history(`Defeated the loner ${sp.name}`, '⚔️');
      break;
    case 'hunter': {
      addDNA(S, HUNTER_REWARD, c.x, c.y);
      sp.kills++;
      if (sp.kills >= 3) { addDNA(S, 35, c.x, c.y); S.hud.flashTip('The hunting pack is gone!'); sp.relation = 'extinct'; }
      break;
    }
    case 'nest': {
      const lvl = sp.level;
      addDNA(S, memberReward(lvl) * (c.role === 'baby' ? 0.5 : c.role === 'alpha' ? 1.5 : 1), c.x, c.y);
      if (c.role === 'alpha') S.unlockFromAlpha(c);
      sp.kills++;
      if (c.role === 'baby' && sp.relation !== 'extinct') {
        setRelation(S, sp, 'hostile');
        S.hud.flashTip(`You killed a baby. The ${sp.name} are furious!`, 2.6);
      } else if (sp.relation === 'curious' || sp.relation === 'neutral' || sp.relation === 'friendly') {
        setRelation(S, sp, sp.diet === 'herbivore' && sp.level <= 2 ? 'afraid' : 'annoyed');
      }
      if (sp.kills >= sp.killsNeeded) makeExtinct(S, sp, c);
      else S.hud.flashTip(`${sp.name}: ${sp.killsNeeded - sp.kills} more to extinction`, 2);
      break;
    }
  }
}

export function makeExtinct(S: CreatureStage, sp: Species, last?: Critter) {
  if (sp.relation === 'extinct') return;
  sp.relation = 'extinct';
  if (last) addDNA(S, speciesBonus(sp.level), last.x, last.y);
  audio.sfx('die', { pitch: 0.6 });
  audio.sfx('bell', { pitch: 0.7 });
  S.game.banner('Extinct', sp.name);
  S.game.history(`Drove the ${sp.name} to extinction`, '☠️');
  for (const o of S.critters) {
    if (o.gone || o.sp !== sp || o.role === 'pack') continue;
    o.state = 'ascend'; o.st = 0; o.anim = 0;
    if (S.social.target === o) S.social.cancel('extinct');
    if (S.target === o) S.target = null;
  }
  if (sp.nest) sp.nest.eggs = 0;
  checkSpeciesAchievements(S);
}

export function checkSpeciesAchievements(S: CreatureStage) {
  const c = S.speciesCounts();
  if (c.allied >= 5) S.game.unlock('befriender');
  if (c.extinct >= 5) S.game.unlock('apex');
}

export function eatEgg(S: CreatureStage, sp: Species) {
  const n = sp.nest;
  if (!n || n.eggs <= 0) return;
  n.eggs--;
  S.hunger = Math.min(100, S.hunger + 18);
  S.counts.eggs = (S.counts.eggs ?? 0) + 1;
  audio.sfx('chomp');
  audio.sfx('eat');
  S.fx.burst('drop', n.x, n.y, 10, { up: 120, grav: 500, size: 3, color: '#fff3c4', speed: 80, life: 0.7 });
  addDNA(S, EGG_REWARD, n.x, n.y);
  if (sp.relation !== 'hostile') {
    setRelation(S, sp, 'hostile');
    S.hud.flashTip(`You ate a ${sp.name} egg. They are furious!`, 2.6);
  }
  for (const o of S.critters) {
    if (o.gone || o.sp !== sp || o.befriended || o.role === 'baby') continue;
    if (Math.hypot(o.x - n.x, o.y - n.y) < 500) { o.target = S.player; o.aggro = 8; }
  }
}

// ------------------------------------------------------------------ migrations
export function startMigration(S: CreatureStage) {
  if (!S.active || S.migrating || S.phase === 'done' || S.phase === 'final' || S.migration >= 2) return;
  if (S.phase !== 'play') { setTimeout(() => startMigration(S), 3000); return; }
  S.migrating = true;
  const k = S.migration;
  const dest = S.homeNests[k + 1];
  dest.active = true;
  dest.discovered = true;
  S.activateGroup(k + 1);
  if (k === 0) S.spawnHunters();
  audio.sfx('horn');
  for (const c of S.critters) if (c.role === 'kin' && c.near) { S.speak(c, 'This way!', 2.5); break; }
  S.game.banner(k === 0 ? 'Your kin are restless' : 'Time to move on', 'Migration!');
  S.game.history(k === 0 ? 'Began the first migration' : 'Began the second migration', '🧭');
  S.hint('cr-migrate', 'Your nest-mates are moving to a new home. Follow the arrow to the new nest. New species live nearby!', '🧭');
}

export function completeMigration(S: CreatureStage) {
  const k = S.migration;
  S.migrating = false;
  S.migration = k + 1;
  S.homeNest = S.homeNests[k + 1];
  S.homeNest.eggs = 2;
  addDNA(S, MIGRATION_REWARD, S.homeNest.x, S.homeNest.y);
  audio.sfx('success');
  S.game.banner('Migration complete', 'A new home');
  S.game.history('Settled a new nest', '🏡');
  for (const c of S.critters) if (c.role === 'kin' || c.role === 'mate') { c.homeX = S.homeNest.x; c.homeY = S.homeNest.y; }
  // If the brain outgrew the next milestone while travelling, the next migration follows soon.
  if (S.migration < MIGRATION_AT.length && S.brain >= MIGRATION_AT[S.migration]) setTimeout(() => startMigration(S), 9000);
}

// ------------------------------------------------------------------ part unlocks
/** Unlock a locked creature part, preferring the next tier of styles the creature already uses. */
export function unlockRandomPart(S: CreatureStage, size: number): PartDef | null {
  const st = S.game.state!;
  const all = partsFor('creature').filter((p) => p.tier > 1 && !st.unlocked.includes(p.id));
  if (!all.length) return null;
  const used = new Map<string, number>();
  for (const pi of S.own.design.parts) {
    const p = getPart(pi.partId);
    if (p) used.set(p.category, Math.max(used.get(p.category) ?? 0, p.tier));
  }
  const allowed = S.allowedDiets();
  const wantTier = size >= 3 ? 3.5 : size === 2 ? 2.6 : 2;
  const r = S.game.rng('creature-bones-' + st.unlocked.length + '-' + S.counts.bones);
  const p = r.weighted(all, (p) => {
    let w = 1;
    const ut = used.get(p.category);
    if (ut !== undefined) w *= 3;
    if (ut !== undefined && p.tier === ut + 1) w *= 2.5;
    w *= 1 / (1 + Math.abs(p.tier - wantTier));
    if (p.diet && allowed && !allowed.includes(p.diet)) w *= 0.1;
    return w;
  });
  if (!S.game.unlockPart(p.id)) return null;
  return p;
}

// ------------------------------------------------------------------ card & ending
export function computeCard(S: CreatureStage): CardColor {
  const c = S.speciesCounts();
  if (c.allied + c.extinct > 0) {
    const f = c.allied / (c.allied + c.extinct);
    return f >= 0.65 ? 'green' : f <= 0.35 ? 'red' : 'blue';
  }
  const b = S.counts.befriended ?? 0, k = S.counts.kills ?? 0;
  if (b + k === 0) return 'blue';
  const f = b / (b + k);
  return f >= 0.65 ? 'green' : f <= 0.35 ? 'red' : 'blue';
}

export function maxHpFor(brain: number, health: number): number {
  return Math.round(BRAIN_HP[brain] * (1 + health * 0.1));
}
