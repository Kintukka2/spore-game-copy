// localStorage wrapper that never throws (private mode, blocked storage, sandboxed previews).

const mem = new Map<string, string>();

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return mem.has(key) ? (JSON.parse(mem.get(key)!) as T) : fallback;
    return JSON.parse(raw) as T;
  } catch {
    try { return mem.has(key) ? (JSON.parse(mem.get(key)!) as T) : fallback; } catch { return fallback; }
  }
}

export function saveJSON(key: string, value: unknown): boolean {
  const raw = JSON.stringify(value);
  mem.set(key, raw);
  try {
    localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string) {
  mem.delete(key);
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
