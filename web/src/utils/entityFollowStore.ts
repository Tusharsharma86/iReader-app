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
