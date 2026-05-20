const memoryCache = new Map<string, { data: any; timestamp: number }>();

export function getCached(key: string, ttlMs: number): any | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) { memoryCache.delete(key); return null; }
  return entry.data;
}

export function setCached(key: string, data: any): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export const TTL = {
  FEED: 10 * 60 * 1000,
  AI_SUMMARY: 24 * 60 * 60 * 1000,
} as const;
