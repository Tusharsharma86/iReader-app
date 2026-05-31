// "Follow the Story" — follow a story, get flagged when new coverage of the
// same event appears later. Matches by headline-token signature (Jaccard) so a
// *different* cluster about the same event counts as a "new development".
// AsyncStorage-backed; an in-memory cache keeps reads synchronous for the UI.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ireader_following_v1';

export interface FollowedStory {
  id: string;
  headline: string;
  imageUrl?: string;
  sig: string[];
  followedAt: number;
  lastSeenId: string;
  lastSeenHeadline: string;
}

const STOP = new Set(['the','a','an','to','for','of','and','or','in','on','at','is','are','was','were','be','as','by','from','with','that','this','its','it','after','before','over','new','says','said','will']);

export function signature(headline: string): string[] {
  return Array.from(new Set(
    (headline || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w)),
  )).slice(0, 12);
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a); let inter = 0;
  for (const x of b) if (A.has(x)) inter++;
  return inter / (a.length + b.length - inter || 1);
}

let cache: FollowedStory[] = [];

export async function loadFollowed(): Promise<FollowedStory[]> {
  try { const r = await AsyncStorage.getItem(KEY); cache = r ? JSON.parse(r) : []; } catch { cache = []; }
  return cache;
}
function persist(): void {
  cache = cache.slice(0, 50);
  AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
}

export function getFollowedSync(): FollowedStory[] { return cache; }
export function isFollowing(id: string): boolean { return cache.some(f => f.id === id); }

export function toggleFollow(story: { id: string; headline: string; imageUrl?: string }): boolean {
  if (isFollowing(story.id)) {
    cache = cache.filter(f => f.id !== story.id);
    persist();
    return false;
  }
  cache = [{
    id: story.id, headline: story.headline, imageUrl: story.imageUrl,
    sig: signature(story.headline), followedAt: Date.now(),
    lastSeenId: story.id, lastSeenHeadline: story.headline,
  }, ...cache];
  persist();
  return true;
}

export interface FollowUpdate extends FollowedStory {
  hasUpdate: boolean;
  latestId?: string;
  latestHeadline?: string;
}

export function annotateUpdates(clusters: { id: string; headline: string }[]): FollowUpdate[] {
  return cache.map(f => {
    let best: { id: string; headline: string; score: number } | null = null;
    for (const c of clusters) {
      const score = jaccard(f.sig, signature(c.headline));
      if (score >= 0.4 && (!best || score > best.score)) best = { id: c.id, headline: c.headline, score };
    }
    const hasUpdate = !!best && best.id !== f.lastSeenId && best.headline !== f.lastSeenHeadline;
    return { ...f, hasUpdate, latestId: best?.id, latestHeadline: best?.headline };
  });
}

export function markSeen(id: string, latestId: string, latestHeadline: string): void {
  const f = cache.find(x => x.id === id);
  if (f) { f.lastSeenId = latestId; f.lastSeenHeadline = latestHeadline; persist(); }
}
