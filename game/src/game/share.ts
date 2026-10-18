// Optional community sharing ("pollination"): when the game runs as a claude.ai artifact with the
// `db` capability, each player's latest creations are published to a shared document and other
// players' creations wander into your worlds. Everywhere else the game stays local-only.
import type { Design, DesignKind, PartInstance, PatternId, SpineNode } from '../design/types';
import { getPart } from '../design/registry';

/* Minimal local typings for the platform capability surface we use. */
interface DocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
interface DocRef { get(): Promise<DocSnap>; set(d: Record<string, unknown>): Promise<void> }
interface QueryLike { orderBy(f: string, dir?: 'asc' | 'desc'): QueryLike; limit(n: number): QueryLike; get(): Promise<{ docs: DocSnap[] }> }
interface DBLike { doc(p: string): DocRef; collection(p: string): QueryLike }
interface UserLike { id(): Promise<string | null> }
interface ClaudeLike { use(name: string): Promise<unknown> }

const MAX_ITEMS = 16;
const KINDS: DesignKind[] = ['cell', 'creature', 'vehicle', 'building', 'ship'];
const PATTERNS: PatternId[] = ['none', 'spots', 'stripes', 'bands', 'belly', 'patches', 'dots', 'tiger', 'gradient', 'scales'];
const HEX = /^#[0-9a-fA-F]{6}$/;

let db: DBLike | null = null;
let uid: string | null = null;
let writable = true;
let writing: Promise<void> = Promise.resolve();
const community: { design: Design; author: string }[] = [];
let ready = false;
const listeners: (() => void)[] = [];

export function sharingAvailable(): boolean { return !!db; }
export function communityReady(): boolean { return ready; }
export function onCommunityChange(f: () => void) { listeners.push(f); }

export function communityDesigns(kind?: DesignKind): Design[] {
  return community.filter((c) => !kind || c.design.kind === kind).map((c) => c.design);
}
export function communityAuthors(): number {
  return new Set(community.map((c) => c.author)).size;
}

const num = (v: unknown, lo: number, hi: number, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** Validate untrusted data from other players into a safe Design (or null). */
export function sanitizeDesign(raw: unknown): Design | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind as DesignKind;
  if (!KINDS.includes(kind)) return null;
  if (!Array.isArray(r.spine) || r.spine.length < 1 || r.spine.length > 8) return null;
  const spine: SpineNode[] = r.spine.map((n) => {
    const o = (n ?? {}) as Record<string, unknown>;
    return { x: num(o.x, -300, 300), y: num(o.y, -300, 300), r: num(o.r, 3, 40, 10) };
  });
  const partsRaw = Array.isArray(r.parts) ? r.parts.slice(0, 40) : [];
  const parts: PartInstance[] = [];
  for (const p of partsRaw) {
    const o = (p ?? {}) as Record<string, unknown>;
    const partId = typeof o.partId === 'string' ? o.partId.slice(0, 40) : '';
    if (!getPart(partId)) continue; // unknown parts (e.g. from newer versions) are dropped
    parts.push({
      uid: typeof o.uid === 'string' ? o.uid.slice(0, 24) : Math.random().toString(36).slice(2),
      partId,
      node: Math.round(num(o.node, 0, spine.length - 1)),
      ox: num(o.ox, -80, 80), oy: num(o.oy, -80, 80), rot: num(o.rot, -7, 7), scale: num(o.scale, 0.3, 2.5, 1),
      flip: o.flip === true || undefined, sym: o.sym === true || undefined,
    });
  }
  const c = (r.colors ?? {}) as Record<string, unknown>;
  const col = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v : d);
  const name = typeof r.name === 'string' ? r.name.replace(/[\u0000-\u001f<>]/g, '').slice(0, 24) : 'Mystery';
  return {
    v: 1, kind, name: name || 'Mystery', spine, parts,
    colors: { base: col(c.base, '#88aacc'), coat: col(c.coat, '#335577'), detail: col(c.detail, '#eeeeee'), pattern: PATTERNS.includes(c.pattern as PatternId) ? (c.pattern as PatternId) : 'none' },
  };
}

export async function initSharing(): Promise<void> {
  const c = (window as unknown as { claude?: ClaudeLike }).claude;
  if (!c || typeof c.use !== 'function') return;
  try {
    db = (await c.use('db')) as DBLike | null;
    const user = (await c.use('user')) as UserLike | null;
    uid = user ? await user.id() : null;
  } catch {
    db = null;
  }
  if (!db) return;
  await refreshCommunity();
}

export async function refreshCommunity(): Promise<void> {
  if (!db) return;
  try {
    const snap = await db.collection('creations').orderBy('updated', 'desc').limit(80).get();
    community.length = 0;
    for (const d of snap.docs) {
      if (!d.exists || d.id === uid) continue;
      const body = d.data();
      const items = Array.isArray(body?.items) ? (body!.items as unknown[]).slice(0, MAX_ITEMS) : [];
      for (const it of items) {
        const design = sanitizeDesign((it as Record<string, unknown>)?.design);
        if (design) community.push({ design, author: d.id });
      }
    }
    ready = true;
    for (const f of listeners) f();
  } catch {
    /* offline or not permitted: stay local */
  }
}

/** Publish one of the player's creations to their shared showcase (fire-and-forget, serialized). */
export function shareCreation(design: Design) {
  if (!db || !uid || !writable) return;
  const ref = db.doc('creations/' + uid);
  writing = writing.then(async () => {
    try {
      const cur = await ref.get();
      const items = (cur.exists && Array.isArray(cur.data()?.items) ? (cur.data()!.items as Record<string, unknown>[]) : []).slice();
      const clean = sanitizeDesign(design);
      if (!clean) return;
      const filtered = items.filter((it) => !(it && (it.design as Design | undefined)?.name === clean.name && (it.design as Design | undefined)?.kind === clean.kind));
      filtered.unshift({ design: clean as unknown as Record<string, unknown>, created: Date.now() });
      await ref.set({ updated: Date.now(), items: filtered.slice(0, MAX_ITEMS) });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'invalid_argument' || code === 'not_granted' || code === 'revoked' || code === 'quota_exceeded') writable = false;
    }
  });
}
