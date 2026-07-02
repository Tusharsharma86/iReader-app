import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryCache = new Map<string, { data: any; timestamp: number }>();

const AS_PREFIX = '@ireader_cache_';

export function getCached(key: string, ttlMs: number): any | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached(key: string, data: any): void {
  const entry = { data, timestamp: Date.now() };
  memoryCache.set(key, entry);
  AsyncStorage.setItem(AS_PREFIX + key, JSON.stringify(entry)).catch(() => {});
}

// Load a single key from AsyncStorage into memory cache (call on app start or on miss)
export async function hydrateCached(key: string, ttlMs: number): Promise<any | null> {
  if (memoryCache.has(key)) return getCached(key, ttlMs);
  try {
    const raw = await AsyncStorage.getItem(AS_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { data: any; timestamp: number };
    if (Date.now() - entry.timestamp > ttlMs) {
      AsyncStorage.removeItem(AS_PREFIX + key).catch(() => {});
      return null;
    }
    memoryCache.set(key, entry);
    return entry.data;
  } catch {
    return null;
  }
}

export function clearCache(): void {
  memoryCache.clear();
}

// Sweep expired persisted entries. Without this, keys accumulate forever
// (~40-100/day from pre-warm; article ids never repeat) until AsyncStorage's
// ~6MB cap is hit — at which point EVERY setItem in the app starts failing
// silently (settings, saved articles, follows). Call once on app start.
const SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000; // longest TTL we use (AI_SUMMARY)
export async function sweepExpiredCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter(k => k.startsWith(AS_PREFIX));
    if (ours.length === 0) return;
    const now = Date.now();
    const dead: string[] = [];
    const entries = await AsyncStorage.multiGet(ours);
    for (const [key, raw] of entries) {
      if (!raw) { dead.push(key); continue; }
      try {
        const entry = JSON.parse(raw) as { timestamp?: number };
        if (!entry.timestamp || now - entry.timestamp > SWEEP_MAX_AGE_MS) dead.push(key);
      } catch { dead.push(key); }
    }
    if (dead.length > 0) await AsyncStorage.multiRemove(dead);
  } catch { /* best-effort */ }
}

// TTL constants
export const TTL = {
  FEED: 10 * 60 * 1000,          // 10 minutes
  AI_SUMMARY: 24 * 60 * 60 * 1000, // 24 hours
  CLUSTERING: 10 * 60 * 1000,    // 10 minutes
  RELATED: 10 * 60 * 1000,       // 10 minutes
  TOPIC_TAGS: 60 * 60 * 1000,    // 1 hour
} as const;
