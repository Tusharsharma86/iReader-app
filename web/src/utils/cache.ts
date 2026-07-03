const memoryCache = new Map<string, { data: any; timestamp: number }>();

// Persist AI summaries to localStorage so pre-warmed content survives page
// refreshes (memory-only cache restarted warming from zero on every reload).
// localStorage is synchronous, so getCached stays sync — no hydrate step.
const LS_PREFIX = 'irc_';
const LS_MAX_AGE_MS = 24 * 60 * 60 * 1000; // longest TTL we use (AI_SUMMARY)

// Sweep expired persisted entries once per page load so the ~5MB quota never
// fills (article ids don't repeat day to day — old keys are never re-read).
try {
  const dead: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(LS_PREFIX)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(k) ?? '') as { timestamp?: number };
      if (!entry.timestamp || Date.now() - entry.timestamp > LS_MAX_AGE_MS) dead.push(k);
    } catch { dead.push(k); }
  }
  dead.forEach(k => localStorage.removeItem(k));
} catch { /* private mode / quota — cache degrades to memory-only */ }

export function getCached(key: string, ttlMs: number): any | null {
  const entry = memoryCache.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp > ttlMs) { memoryCache.delete(key); return null; }
    return entry.data;
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { data: any; timestamp: number };
    if (Date.now() - stored.timestamp > ttlMs) { localStorage.removeItem(LS_PREFIX + key); return null; }
    memoryCache.set(key, stored);
    return stored.data;
  } catch { return null; }
}

export function setCached(key: string, data: any): void {
  const entry = { data, timestamp: Date.now() };
  memoryCache.set(key, entry);
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry)); }
  catch { /* quota full / private mode — memory copy still works */ }
}

export const TTL = {
  FEED: 10 * 60 * 1000,
  AI_SUMMARY: 24 * 60 * 60 * 1000,
} as const;
