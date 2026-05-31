// "Follow the Story" — lets a user follow a story and get flagged when new
// coverage of the same event appears later. Web-only, localStorage-backed.
// We match by a headline-token signature (Jaccard), so a *different* cluster
// about the same event counts as a "new development".

const KEY = '@ireader_following_v1';

export interface FollowedStory {
  id: string;
  headline: string;
  imageUrl?: string;
  sig: string[];            // significant headline tokens
  followedAt: number;
  lastSeenId: string;       // cluster id of the latest coverage we've shown
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

function load(): FollowedStory[] {
  try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function save(list: FollowedStory[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50))); } catch {}
}

export function getFollowed(): FollowedStory[] { return load(); }
export function isFollowing(id: string): boolean { return load().some(f => f.id === id); }

export function follow(story: { id: string; headline: string; imageUrl?: string }): void {
  const list = load();
  if (list.some(f => f.id === story.id)) return;
  list.unshift({
    id: story.id, headline: story.headline, imageUrl: story.imageUrl,
    sig: signature(story.headline), followedAt: Date.now(),
    lastSeenId: story.id, lastSeenHeadline: story.headline,
  });
  save(list);
}

export function unfollow(id: string): void { save(load().filter(f => f.id !== id)); }

export function toggleFollow(story: { id: string; headline: string; imageUrl?: string }): boolean {
  if (isFollowing(story.id)) { unfollow(story.id); return false; }
  follow(story); return true;
}

// Given the current feed clusters, return followed stories annotated with
// whether a NEW development (a different cluster strongly matching the sig,
// fresher than what we last showed) exists, plus that latest headline.
export interface FollowUpdate extends FollowedStory {
  hasUpdate: boolean;
  latestId?: string;
  latestHeadline?: string;
}

export function annotateUpdates(
  clusters: { id: string; headline: string }[],
): FollowUpdate[] {
  const list = load();
  return list.map(f => {
    let best: { id: string; headline: string; score: number } | null = null;
    for (const c of clusters) {
      const score = jaccard(f.sig, signature(c.headline));
      if (score >= 0.4 && (!best || score > best.score)) best = { id: c.id, headline: c.headline, score };
    }
    const hasUpdate = !!best && best.id !== f.lastSeenId && best.headline !== f.lastSeenHeadline;
    return { ...f, hasUpdate, latestId: best?.id, latestHeadline: best?.headline };
  });
}

// Call when the user views a followed story's latest coverage to clear its badge.
export function markSeen(id: string, latestId: string, latestHeadline: string): void {
  const list = load();
  const f = list.find(x => x.id === id);
  if (f) { f.lastSeenId = latestId; f.lastSeenHeadline = latestHeadline; save(list); }
}
