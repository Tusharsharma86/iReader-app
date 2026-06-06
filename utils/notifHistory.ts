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
