const memoryCache = new Map<string, { data: any; timestamp: number }>();

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
  memoryCache.set(key, { data, timestamp: Date.now() });
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
