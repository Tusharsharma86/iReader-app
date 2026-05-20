import type { Story } from '../types';

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry { stories: Story[]; cachedAt: number; }

export interface CachedFeed { stories: Story[]; isStale: boolean; cachedAt: number; }

function cacheKey(topic: string) { return `@feed_v1_${topic}`; }

export function loadCachedFeed(topic: string): CachedFeed | null {
  try {
    const raw = localStorage.getItem(cacheKey(topic));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(entry.stories)) return null;
    const isStale = Date.now() - entry.cachedAt > CACHE_TTL_MS;
    return { stories: entry.stories, isStale, cachedAt: entry.cachedAt };
  } catch { return null; }
}

export function saveFeedCache(topic: string, stories: Story[]): void {
  try {
    localStorage.setItem(cacheKey(topic), JSON.stringify({ stories, cachedAt: Date.now() }));
  } catch {}
}
