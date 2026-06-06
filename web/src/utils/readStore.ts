// Auto-mark-read store. Populated by Customize → autoMarkRead via
// IntersectionObserver in StoryCard. Items here get dimmed so the user can
// see what they've already passed.
const STORAGE_KEY = 'ireader_read_ids_v1';
const MAX_IDS = 2000;

let cache: Set<string> | null = null;
const subs = new Set<() => void>();

function load(): Set<string> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { cache = new Set(); }
  return cache;
}

function persist(): void {
  try {
    const arr = Array.from(load());
    // Cap size — drop oldest first (insertion order kept by Set).
    const trimmed = arr.slice(-MAX_IDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function isRead(id: string): boolean {
  return load().has(id);
}

export function markRead(id: string): void {
  const set = load();
  if (set.has(id)) return;
  set.add(id);
  persist();
  subs.forEach(fn => { try { fn(); } catch {} });
}

export function clearRead(): void {
  cache = new Set();
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  subs.forEach(fn => { try { fn(); } catch {} });
}

export function subscribeRead(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
