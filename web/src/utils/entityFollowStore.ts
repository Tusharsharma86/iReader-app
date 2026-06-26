const KEY = '@ireader_entity_follows_v1';

function load(): string[] { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function save(list: string[]): void { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} }

export function isFollowingEntity(name: string): boolean { return load().includes(name.toLowerCase()); }

export function toggleFollowEntity(name: string): boolean {
  const key = name.toLowerCase();
  const list = load();
  if (list.includes(key)) { save(list.filter(x => x !== key)); return false; }
  save([key, ...list]); return true;
}

export function getFollowedEntities(): string[] { return load(); }

export function clearFollowedEntities(): void { save([]); }

// Returns a score boost based on how many followed entities appear in the text.
// Each match adds 12 points; capped at 3 matches (36) to avoid dominating ranking.
export function entityBoostScore(headline: string, summary?: string): number {
  const entities = load();
  if (entities.length === 0) return 0;
  const text = `${headline} ${summary ?? ''}`.toLowerCase();
  let matches = 0;
  for (const entity of entities) {
    if (text.includes(entity)) { matches++; if (matches >= 3) break; }
  }
  return matches * 12;
}
