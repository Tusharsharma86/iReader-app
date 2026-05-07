import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Story } from '../components/StoryCard';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — stale threshold

interface CacheEntry {
  stories: Story[];
  cachedAt: number;
}

function cacheKey(topic: string): string {
  return `@feed_v1_${topic}`;
}

export interface CachedFeed {
  stories: Story[];
  isStale: boolean;
  cachedAt: number;
}

export async function loadCachedFeed(topic: string): Promise<CachedFeed | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(topic));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(entry.stories)) return null;
    const isStale = Date.now() - entry.cachedAt > CACHE_TTL_MS;
    return { stories: entry.stories, isStale, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

export async function saveFeedCache(topic: string, stories: Story[]): Promise<void> {
  try {
    const entry: CacheEntry = { stories, cachedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(topic), JSON.stringify(entry));
  } catch {
    // best-effort; ignore storage errors
  }
}

export async function clearFeedCache(topic: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(topic));
  } catch {}
}
