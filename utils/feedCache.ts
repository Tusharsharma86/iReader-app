import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// v3: bumped to evict old cache entries that may contain filtered-out content
function cacheKey(topic: string): string {
  return `@feed_v3_${topic}`;
}

export interface CachedFeed<T = unknown> {
  feed: T[];
  isStale: boolean;
  cachedAt: number;
}

export async function loadCachedFeed<T = unknown>(topic: string): Promise<CachedFeed<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(topic));
    if (!raw) return null;
    const entry = JSON.parse(raw) as { feed: T[]; cachedAt: number };
    if (!Array.isArray(entry.feed)) return null;
    const isStale = Date.now() - entry.cachedAt > CACHE_TTL_MS;
    return { feed: entry.feed, isStale, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

export async function saveFeedCache<T = unknown>(topic: string, feed: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(topic), JSON.stringify({ feed, cachedAt: Date.now() }));
  } catch {
    // best-effort
  }
}

export async function clearFeedCache(topic: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(topic));
  } catch {}
}
