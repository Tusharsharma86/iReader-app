import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ireader_entity_follows_v1';
let cache = new Set<string>();

AsyncStorage.getItem(KEY).then(r => { if (r) cache = new Set(JSON.parse(r)); }).catch(() => {});

function persist(): void {
  AsyncStorage.setItem(KEY, JSON.stringify([...cache])).catch(() => {});
}

export function isFollowingEntity(name: string): boolean { return cache.has(name.toLowerCase()); }

export function toggleFollowEntity(name: string): boolean {
  const key = name.toLowerCase();
  if (cache.has(key)) { cache.delete(key); persist(); return false; }
  cache.add(key); persist(); return true;
}

export function getFollowedEntities(): string[] { return [...cache]; }

export function clearFollowedEntities(): void { cache.clear(); persist(); }

// Returns a score boost based on how many followed entities appear in the text.
// Each match adds 12 points; capped at 3 matches (36) to avoid dominating ranking.
export function entityBoostScore(headline: string, summary?: string): number {
  if (cache.size === 0) return 0;
  const text = `${headline} ${summary ?? ''}`.toLowerCase();
  let matches = 0;
  for (const entity of cache) {
    if (text.includes(entity)) { matches++; if (matches >= 3) break; }
  }
  return matches * 12;
}
