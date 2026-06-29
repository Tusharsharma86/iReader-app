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

// TTL constants
export const TTL = {
  FEED: 10 * 60 * 1000,          // 10 minutes
  AI_SUMMARY: 24 * 60 * 60 * 1000, // 24 hours
  CLUSTERING: 10 * 60 * 1000,    // 10 minutes
  RELATED: 10 * 60 * 1000,       // 10 minutes
  TOPIC_TAGS: 60 * 60 * 1000,    // 1 hour
} as const;
