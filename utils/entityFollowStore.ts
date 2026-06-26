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
