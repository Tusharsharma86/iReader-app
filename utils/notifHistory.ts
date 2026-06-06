// Notification history — every notif we fire/receive gets a full snapshot of
// the article so the user can re-open it later from a history screen, even if
// the server feed has long rolled past it.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotifKind = 'breaking' | 'source' | 'topic' | 'aiFeed' | 'digest' | 'streak';

export interface NotifHistoryEntry {
  // Stable id — used to dedupe so the same article doesn't get logged twice
  // even if multiple notif paths fire for it (e.g. breaking + fav source).
  id: string;
  kind: NotifKind;
  firedAt: number;          // ms — when we wrote this entry
  // Full article snapshot — enough to render ArticleScreen with no server hit.
  headline: string;
  summary?: string;
  imageUrl?: string;
  url?: string;             // publisher link
  source?: string;          // publisher name
  publishedAt?: string;
  dominantColor?: string;
}

const STORAGE_KEY = '@notif_history_v1';
const MAX_ENTRIES = 1000;   // keep ~1000 most recent; older trim off.

let cache: NotifHistoryEntry[] | null = null;
const subs = new Set<() => void>();

async function readAll(): Promise<NotifHistoryEntry[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as NotifHistoryEntry[]) : [];
  } catch { cache = []; }
  return cache;
}

async function writeAll(list: NotifHistoryEntry[]): Promise<void> {
  cache = list;
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  subs.forEach(fn => { try { fn(); } catch {} });
}

export async function pushNotifHistory(entry: NotifHistoryEntry): Promise<void> {
  const list = await readAll();
  // Dedup by id — newer wins, older entry removed so it floats to top.
  const filtered = list.filter(e => e.id !== entry.id);
  filtered.unshift(entry);
  const trimmed = filtered.slice(0, MAX_ENTRIES);
  await writeAll(trimmed);
}

export async function loadNotifHistory(): Promise<NotifHistoryEntry[]> {
  return [...await readAll()];
}

export async function clearNotifHistory(): Promise<void> {
  await writeAll([]);
}

export function subscribeNotifHistory(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Backfill local history from backend per-token log. Catches notifs that
// landed while the app was killed (Expo's addNotificationReceivedListener
// only fires for foreground/background-running, not killed-state). Merges by
// id — existing local entries win to preserve any client-side enrichment.
const API_BASE = 'https://ireader.onrender.com/api/news';
let lastSync = 0;

export async function syncNotifHistoryFromBackend(token: string): Promise<number> {
  if (!token) return 0;
  // Throttle to once per 30s to avoid hammering the endpoint on every focus.
  if (Date.now() - lastSync < 30 * 1000) return 0;
  lastSync = Date.now();
  try {
    const url = `${API_BASE}/notif-history?token=${encodeURIComponent(token)}&limit=200`;
    const r = await fetch(url);
    if (!r.ok) return 0;
    const data = await r.json() as { entries?: Array<{
      id: string; kind: string; firedAt: number;
      headline?: string; summary?: string; imageUrl?: string;
      url?: string; source?: string; publishedAt?: string;
    }> };
    const remote = data.entries ?? [];
    if (remote.length === 0) return 0;
    const local = await readAll();
    const localById = new Map(local.map(e => [e.id, e]));
    let added = 0;
    for (const e of remote) {
      if (localById.has(e.id)) continue;
      added++;
      localById.set(e.id, {
        id: e.id,
        kind: ((['breaking','source','topic','aiFeed','digest','streak'].includes(e.kind)) ? e.kind : 'breaking') as NotifKind,
        firedAt: e.firedAt,
        headline: e.headline ?? '',
        summary: e.summary ?? '',
        imageUrl: e.imageUrl ?? '',
        url: e.url ?? '',
        source: e.source ?? '',
        publishedAt: e.publishedAt ?? new Date(e.firedAt).toISOString(),
      });
    }
    if (added === 0) return 0;
    // Re-sort by firedAt desc, cap, persist.
    const merged = Array.from(localById.values()).sort((a, b) => b.firedAt - a.firedAt).slice(0, MAX_ENTRIES);
    await writeAll(merged);
    return added;
  } catch { return 0; }
}

// Group entries by day bucket for the screen — Today, Yesterday, then dates.
export interface NotifHistorySection {
  label: string;
  entries: NotifHistoryEntry[];
}

export function groupByDay(entries: NotifHistoryEntry[]): NotifHistorySection[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  const buckets = new Map<string, NotifHistoryEntry[]>();
  const order: string[] = [];

  for (const e of entries) {
    let label: string;
    if (e.firedAt >= startOfToday) label = 'Today';
    else if (e.firedAt >= startOfYesterday) label = 'Yesterday';
    else {
      const d = new Date(e.firedAt);
      label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    if (!buckets.has(label)) { buckets.set(label, []); order.push(label); }
    buckets.get(label)!.push(e);
  }
  return order.map(label => ({ label, entries: buckets.get(label)! }));
}
