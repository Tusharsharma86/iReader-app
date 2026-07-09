// Auto-mark-read store. Populated by Customize → autoMarkRead via a
// visibility timer in StoryCard. Items here get dimmed so the user can see
// what they've already passed. Ported from web/src/utils/readStore.ts —
// AsyncStorage-backed with an in-memory cache so reads stay synchronous.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ireader_read_ids_v1';
const MAX_IDS = 2000;

let cache: Set<string> = new Set();
const subs = new Set<() => void>();

export async function loadReadIds(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { cache = new Set(); }
  subs.forEach(fn => { try { fn(); } catch {} });
}

function persist(): void {
  const arr = Array.from(cache).slice(-MAX_IDS);
  AsyncStorage.setItem(KEY, JSON.stringify(arr)).catch(() => {});
}

export function isRead(id: string): boolean {
  return cache.has(id);
}

export function markRead(id: string): void {
  if (!id || cache.has(id)) return;
  cache.add(id);
  persist();
  subs.forEach(fn => { try { fn(); } catch {} });
}

export function clearRead(): void {
  cache = new Set();
  AsyncStorage.removeItem(KEY).catch(() => {});
  subs.forEach(fn => { try { fn(); } catch {} });
}

export function subscribeRead(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

// Fire-and-forget hydrate on first import — whichever screen mounts
// StoryCard first triggers this, no explicit app-root wiring needed.
loadReadIds();
