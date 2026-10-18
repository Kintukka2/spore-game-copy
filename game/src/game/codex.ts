// The Codex: a library of every creation (the player's and procedurally generated "wild" ones).
// Player creations persist in localStorage; generated entries are derived from a fixed seed.
import { loadJSON, saveJSON } from '../engine/storage';
import { RNG, uid } from '../engine/rng';
import type { Design, DesignKind } from '../design/types';
import { generateCell, generateCreature } from '../design/generate';

export interface CodexEntry {
  id: string;
  design: Design;
  author: string;
  created: number;
  origin: 'player' | 'wild';
}

const KEY = 'primordia.codex.v1';

let entries: CodexEntry[] | null = null;

function load(): CodexEntry[] {
  if (!entries) entries = loadJSON<CodexEntry[]>(KEY, []);
  return entries;
}

export function codexAll(kind?: DesignKind): CodexEntry[] {
  return load().filter((e) => !kind || e.design.kind === kind).sort((a, b) => b.created - a.created);
}

export function codexSave(design: Design, author = 'You'): CodexEntry {
  const list = load();
  const copy: Design = JSON.parse(JSON.stringify(design));
  // Replace an existing entry with the same name + kind by the same author.
  const existing = list.find((e) => e.design.name === copy.name && e.design.kind === copy.kind && e.origin === 'player');
  if (existing) {
    existing.design = copy;
    existing.created = Date.now();
    saveJSON(KEY, list);
    return existing;
  }
  const e: CodexEntry = { id: uid(), design: copy, author, created: Date.now(), origin: 'player' };
  list.push(e);
  saveJSON(KEY, list);
  return e;
}

export function codexDelete(id: string) {
  const list = load();
  const i = list.findIndex((e) => e.id === id);
  if (i >= 0) {
    list.splice(i, 1);
    saveJSON(KEY, list);
  }
}

export function codexCount(): number {
  return load().length;
}

/** Wildlife pool for populating worlds: player creations mixed with generated species. */
export function wildPool(kind: DesignKind, count: number, seed: number, level = 2): Design[] {
  const r = new RNG(seed);
  const own = codexAll(kind).map((e) => e.design);
  r.shuffle(own);
  const out: Design[] = [];
  const fromPlayer = Math.min(own.length, Math.floor(count * 0.4));
  for (let i = 0; i < fromPlayer; i++) out.push(JSON.parse(JSON.stringify(own[i])));
  while (out.length < count) {
    if (kind === 'cell') out.push(generateCell(r, r.pick(['herbivore', 'carnivore', 'omnivore']), level));
    else out.push(generateCreature(r, { level }));
  }
  return out;
}
