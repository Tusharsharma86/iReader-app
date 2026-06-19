import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Story, getSourceDomain, domainFromUrl } from '../components/StoryCard';
import { useSettings } from '../contexts/SettingsContext';
import { tabBarTranslateY, useTabBarAutoHide } from '../utils/tabBarAnim';
import { trackAiUsage, trackArticleRead } from '../utils/usageTracker';
import { trackDeepDive } from '../utils/personalization';
import { toggleFollow, isFollowing, loadFollowed } from '../utils/followStore';
import { FALLBACK_IMG } from '../utils/fallback';
import { darken, lighten, getArticleColor } from '../utils/colors';

const FEED_API_BASE = 'https://ireader.onrender.com/api/news/feed';
const DEEPDIVE_API = 'https://ireader.onrender.com/api/news/deepdive';
const ASK_API = 'https://ireader.onrender.com/api/news/ask';
const CACHE_PREFIX = '@deepdive_v8_'; // v8 — cache cleared
const ASK_CACHE_PREFIX = '@ask_v1_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VIOLET = '#b994ff';
const GOLD = '#FFC542';

const TOPIC_QUEUE = ['breaking', 'technology', 'india-politics', 'geopolitics', 'markets', 'business'];

interface ApiItem { type?: string; articles?: Story[]; }
interface FeedItem {
  primary: Story;
  allStories: Story[];
  sources: { name: string; url: string }[];
}
interface TldrSection { heading: string; bullets: string[]; }
interface StorySection { heading: string; body: string; }
interface DeepDiveData {
  tldr: string[];
  tldrSections?: TldrSection[];
  narrative: string;
  storySections?: StorySection[];
  degraded?: boolean;
  insight: string;
  keyMetrics?: string[];
  questions: string[];
  tags: string[];
  keyPeople?: string[];
  keyCompanies?: string[];
  topics?: string[];
  articlesRead?: number;
  articlesAttempted?: number;
  confidence?: number;
}

const METRIC_RE = /(?:\$[\d,.]+[BMKTbmkt]?\b|\d[\d,.]*\s*(?:billion|million|trillion|percent|%|bps|basis points)\b|\d{1,2}(?:\/\d{1,2})?(?:\/\d{2,4})|\b(?:Q[1-4]|FY)\s*\d{2,4})/gi;
function extractMetrics(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    if (!METRIC_RE.test(s)) continue;
    METRIC_RE.lastIndex = 0;
    const clean = s.replace(/\*\*/g, '').trim();
    if (clean.length > 120 || clean.length < 15) continue;
    const key = clean.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 5) break;
  }
  return out;
}

function dedupeSources(arr: { name: string; url: string }[]): { name: string; url: string }[] {
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  for (const s of arr) {
    const k = (s.name || '').toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: s.name, url: s.url });
  }
  return out;
}

const PHONE_RE = /\b(phone|smartphone|mobile|iphone|android|samsung|xiaomi|redmi|oneplus|oppo|vivo|realme|motorola|moto|nokia|pixel|infinix|tecno|poco|nothing phone)\b/i;
const DEAL_RE = /\b(discount|deal|deals|offer|offers|sale|price drop|price cut|cashback|emi|exchange offer|bank offer|coupon|lowest price|best price|under ₹|under rs\.?|under inr|% off|percent off|flat \d+|flipkart|amazon (sale|prime day|great)|big billion)\b/i;
function isExcluded(s?: { headline?: string; summary?: string; sources?: { name?: string }[] }): boolean {
  if (!s) return false;
  const text = `${s.headline || ''} ${s.summary || ''}`;
  if (/[ऀ-ॿ]/.test(text)) return true;
  if (PHONE_RE.test(text) && DEAL_RE.test(text)) return true;
  if (/nyt|new york times/i.test(s.sources?.[0]?.name ?? '') && /here.?s the latest|here are the latest/i.test(s.headline ?? '')) return true;
  return false;
}

// Trust the server's clusters as-is — no client-side merging or headline-similarity
// dedupe. Theme collections are filtered out at the load site.
const LIVE_BLOG_RE = /\b(live( blog| updates?)?|live:|\s[-–]\s*live\s*$|rolling coverage|as it happens)\b/i;

function topicMatchScore(headline: string, topicTitle: string): number {
  if (!topicTitle || !headline) return 0;
  const topicWords = new Set((topicTitle.toLowerCase().match(/[a-z]{4,}/g) ?? []));
  return (headline.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(w => topicWords.has(w)).length;
}

function pickPrimary(articles: Story[], topicTitle: string): Story {
  const nonLive = articles.filter(s => !LIVE_BLOG_RE.test(s.headline ?? ''));
  const pool = nonLive.length > 0 ? nonLive : articles;
  return pool.slice().sort((a, b) => {
    const aScore = (a.sources?.length ?? 0) * 2 + topicMatchScore(a.headline ?? '', topicTitle);
    const bScore = (b.sources?.length ?? 0) * 2 + topicMatchScore(b.headline ?? '', topicTitle);
    return bScore - aScore;
  })[0];
}


function parseServerFeed(items: ApiItem[]): FeedItem[] {
  const out: FeedItem[] = [];
  for (const it of items) {
    if (it.type === 'cluster' && Array.isArray(it.articles) && it.articles.length > 0) {
      const topicTitle = String((it as any).topicTitle ?? '');
      const sources = dedupeSources(it.articles.flatMap(a => a.sources ?? []));

      const primary = pickPrimary(it.articles, topicTitle);

      out.push({ primary, allStories: it.articles, sources });
    } else {
      const s = it as unknown as Story;
      // Single articles: skip live blogs only.
      if (s?.headline && !LIVE_BLOG_RE.test(s.headline)) {
        out.push({ primary: s, allStories: [s], sources: dedupeSources(s.sources ?? []) });
      }
    }
  }
  return out;
}

function splitToBullets(text: string, count = 4): string[] {
  const clean = text.replace(/\.{2,}$/, '').trim();
  const cap = (s: string) => { const w = s.trim().split(/\s+/); return w.length > 13 ? w.slice(0, 13).join(' ') + '…' : s.trim(); };
  let parts = clean.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 30);
  if (parts.length >= 2) return parts.slice(0, count).map(cap);
  parts = clean.split(/\s+[–—;]\s+/).filter(s => s.trim().length > 30);
  if (parts.length >= 2) return parts.slice(0, count).map(cap);
  return clean.length > 10 ? [cap(clean)] : [];
}

// Freshness-aware ranking — clusters and singletons compete on equal footing.
function rankFeedItems(items: FeedItem[]): FeedItem[] {
  if (items.length === 0) return items;
  return items
    .map(it => {
      const sourceCount = it.sources.length || 1;
      const hoursOld = (Date.now() - new Date(it.primary.publishedAt ?? 0).getTime()) / 3_600_000;
      const importanceScore = sourceCount * 3;
      const breakingBonus = (it.primary as any).isBreaking ? 10 : 0;
      const clusterBonus = it.allStories.length >= 3 ? 4 : it.allStories.length >= 2 ? 2 : 0;
      const velocityScore = Math.min(sourceCount / Math.max(hoursOld, 0.5), 10) * 2;
      const freshnessMult = hoursOld <= 24
        ? Math.exp(-hoursOld * Math.LN2 / 12)
        : Math.exp(-24 * Math.LN2 / 12) * Math.exp(-(hoursOld - 24) * Math.LN2 / 6);
      const freshBonus = Math.max(0, (6 - hoursOld) / 6) * 6;
      const score = (importanceScore + breakingBonus + clusterBonus) * freshnessMult
        + velocityScore + freshBonus;
      return { item: it, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  return `${Math.round(hrs / 24)}D AGO`;
}

// ── Cache helpers ───────────────────────────────────────────────────────────
async function readDeepDiveCache(id: string, depth = 'standard'): Promise<DeepDiveData | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + depth + ':' + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}
async function writeDeepDiveCache(id: string, data: DeepDiveData, depth = 'standard') {
  try { await AsyncStorage.setItem(CACHE_PREFIX + depth + ':' + id, JSON.stringify({ ...data, at: Date.now() })); } catch {}
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function AIFeedScreen() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Header is position:'absolute' so the FlatList fills full screenH.
  // CARD_H < screenH by PEEK so the next card's top PEEK px are visible.
  const PEEK = 72;
  const CARD_H = screenH - PEEK;
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedItem, setOpenedItemState] = useState<FeedItem | null>(null);
  const [itemHistory, setItemHistory] = useState<FeedItem[]>([]);
  // Tracks whether openedItem came from mount restoration (fold/unfold) — used
  // to suppress the Modal slide-in animation in that case so it doesn't look
  // like a fresh open. Cleared as soon as user interacts.
  const [openedRestored, setOpenedRestored] = useState(false);
  const flatListRef = useRef<FlatList<FeedItem> | null>(null);
  const navigation = useNavigation();
  // Tap the AIFeed tab while on AIFeed → close any open Deep Dive + scroll
  // to first card. Bug fix: previously this fired for ANY tabPress on the
  // parent navigator, so tapping Feed/Saved/Settings would also reset AIFeed
  // in the background. useFocusEffect ensures the listener is only attached
  // while AIFeed is focused.
  useFocusEffect(useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parent = (navigation as any).getParent?.();
    if (!parent) return;
    const unsub = parent.addListener('tabPress', () => {
      setOpenedItemState(null);
      setItemHistory([]);
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsub;
  }, [navigation]));
  // Persist Deep Dive open state so Activity recreation (fold/unfold) restores it.
  // Write a "closed" marker (not removeItem) so close-then-fold race cannot
  // resurrect a dead overlay — restore only if last write had closed:false.
  const setOpenedItem = useCallback((item: FeedItem | null) => {
    setOpenedItemState(item);
    setOpenedRestored(false); // user-initiated open/close — animate normally
    if (!item) setItemHistory([]);
    if (item) {
      const a = item.primary;
      // Track usage: count Deep Dive opens as AI usage + article read.
      trackAiUsage('deepDive').catch(() => {});
      trackArticleRead(a.sources?.[0]?.name ?? '', (a as { category?: string }).category).catch(() => {});
      trackDeepDive(a); // strong-intent signal for For-You ranking
      AsyncStorage.setItem('@aifeed_open_item', JSON.stringify({
        id: a.id, headline: a.headline, summary: a.summary, imageUrl: a.imageUrl,
        url: a.sources?.[0]?.url ?? '', source: a.sources?.[0]?.name ?? '',
        publishedAt: a.publishedAt, at: Date.now(), closed: false,
      })).catch(() => {});
    } else {
      AsyncStorage.setItem('@aifeed_open_item', JSON.stringify({ closed: true, at: Date.now() })).catch(() => {});
    }
  }, []);
  const [topicCursor, setTopicCursor] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const itemsRef = useRef<FeedItem[]>([]);
  itemsRef.current = items;


  // Auto-hide tab bar on scroll; restore on blur.
  const { onScroll: onScrollHide, restore: restoreTabBar } = useTabBarAutoHide();
  useFocusEffect(useCallback(() => {
    restoreTabBar();
    return () => { restoreTabBar(); };
  }, [restoreTabBar]));

  const loadTopic = useCallback(async (topicIdx: number, isInitial: boolean) => {
    const topic = TOPIC_QUEUE[topicIdx % TOPIC_QUEUE.length];
    if (isInitial) setLoading(true); else setLoadingMore(true);
    try {
      const r = await fetch(`${FEED_API_BASE}?topic=${topic}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = await r.json();
      const rawItems: ApiItem[] = Array.isArray(raw) ? raw : Array.isArray(raw?.feed) ? raw.feed : [];
      const incoming = parseServerFeed(rawItems)
        .filter(it => it.primary.headline && it.primary.publishedAt)
        .filter(it => !isExcluded(it.primary) && !it.allStories.every(isExcluded));
      const existingIds = new Set(itemsRef.current.map(it => it.primary.id));
      const newOnes = incoming.filter(it => !existingIds.has(it.primary.id));
      if (newOnes.length === 0 && !isInitial) {
        // Current topic exhausted — advance cursor to next topic so onEndReached
        // can load the next one. Only mark fully exhausted after all topics done.
        setTopicCursor(prev => {
          const next = prev + 1;
          if (next >= TOPIC_QUEUE.length) { setExhausted(true); return prev; }
          return next;
        });
        return;
      }
      setItems(prev => isInitial ? rankFeedItems(newOnes) : [...prev, ...newOnes]);
      if (isInitial) setError(null);
    } catch (e) {
      if (isInitial) setError(String(e instanceof Error ? e.message : e));
    } finally {
      if (isInitial) setLoading(false); else setLoadingMore(false);
    }
  }, []);

  // Silent background refresh for stale-while-revalidate: fetch the current
  // topic and REPLACE items without any loading/skeleton flicker. Only swaps
  // in fresh data if the fetch actually returned something (never blanks the
  // feed on a failed/empty response). No content compromise — just newer data.
  const silentRefresh = useCallback(async (topicIdx: number) => {
    const topic = TOPIC_QUEUE[topicIdx % TOPIC_QUEUE.length];
    try {
      const r = await fetch(`${FEED_API_BASE}?topic=${topic}`);
      if (!r.ok) return;
      const raw = await r.json();
      const rawItems: ApiItem[] = Array.isArray(raw) ? raw : Array.isArray(raw?.feed) ? raw.feed : [];
      const fresh = rankFeedItems(
        parseServerFeed(rawItems)
          .filter(it => it.primary.headline && it.primary.publishedAt)
          .filter(it => !isExcluded(it.primary) && !it.allStories.every(isExcluded))
      );
      if (fresh.length > 0) {
        setItems(fresh);
        setActiveIdx(0);
        setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: false }), 0);
        setError(null);
      }
    } catch { /* keep showing cached items */ }
  }, []);

  // Default loader — trusts server clusters, ranks by freshness + importance.
  // Fetches the current topic (breaking by default) and applies rankFeedItems.
  // mode 'initial' → skeleton · 'refresh' → pull spinner · 'silent' → none
  const loadClusterForward = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (mode === 'initial') setLoading(true);
    else if (mode === 'refresh') setRefreshing(true);
    try {
      const r = await fetch(`${FEED_API_BASE}?topic=breaking`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = await r.json();
      const rawItems: ApiItem[] = Array.isArray(raw) ? raw : Array.isArray(raw?.feed) ? raw.feed : [];
      const next = rankFeedItems(
        parseServerFeed(rawItems)
          .filter(it => it.primary.headline && it.primary.publishedAt)
          .filter(it => !isExcluded(it.primary) && !it.allStories.every(isExcluded))
      );
      if (next.length > 0) {
        setItems(next);
        if (mode === 'refresh') {
          setActiveIdx(0);
          setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: false }), 0);
        }
        setError(null);
      } else if (mode === 'initial') {
        await loadTopic(0, true);
      }
    } catch (e) {
      if (mode === 'initial') setError(String(e instanceof Error ? e.message : e));
    } finally {
      if (mode === 'initial') setLoading(false);
      else if (mode === 'refresh') setRefreshing(false);
    }
  }, [loadTopic]);

  // MOUNT-ONLY init: pre-warm + restore cached feed. Critical: NO screenH dep
  // — fold/unfold must not re-fetch or re-setItems. Width-only restore happens
  // in the dimension effect below.
  const initialScreenHRef = useRef(screenH);
  useEffect(() => {
    fetch('https://ireader.onrender.com/api/news/sources').catch(() => {});
    loadFollowed().catch(() => {});
    AsyncStorage.getItem('@aifeed_cache_v3').then(raw => {
      if (!raw) { loadClusterForward('initial'); return; }
      try {
        const c = JSON.parse(raw) as { items: FeedItem[]; topicCursor: number; activeIdx: number; at: number };
        if (Array.isArray(c.items) && c.items.length > 0) {
          // Stale-while-revalidate: render cache INSTANTLY at any age (no
          // skeleton, no wait), then silently refresh in the background if it's
          // older than 10 min. Makes every open after the first feel instant.
          setItems(c.items);
          setTopicCursor(0); // always start at breaking on open
          setActiveIdx(0);
          setLoading(false);
          setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: false }), 0);
          if (Date.now() - c.at > 10 * 60_000) {
            setTimeout(() => loadClusterForward('silent'), 400);
          }
          return;
        }
      } catch {}
      loadClusterForward('initial');
    }).catch(() => loadClusterForward('initial'));
  }, [loadTopic, silentRefresh, loadClusterForward]);

  // Dimension change (fold open/close): re-snap to current activeIdx so the
  // visible card stays put. No state reset, no refetch. activeIdx read fresh
  // via ref to avoid re-creating effect on every scroll.
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const lastScreenHRef = useRef(screenH);
  useEffect(() => {
    if (lastScreenHRef.current === screenH) return;
    lastScreenHRef.current = screenH;
    if (itemsRef.current.length === 0) return;
    const t = setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: activeIdxRef.current * screenH, animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [screenH]);

  // Persist feed cache whenever items or activeIdx change — debounced 600ms
  // so rapid scrolling doesn't write to AsyncStorage on every snap. Bug fix G.
  const cacheWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicCursorRef = useRef(topicCursor);
  topicCursorRef.current = topicCursor;
  const writeCacheNow = useCallback(() => {
    if (itemsRef.current.length === 0) return;
    AsyncStorage.setItem('@aifeed_cache_v3', JSON.stringify({
      items: itemsRef.current, topicCursor: topicCursorRef.current, activeIdx: activeIdxRef.current, at: Date.now(),
    })).catch(() => {});
  }, []);

  // Read a pending push-tap (written by App.tsx handleNotificationTap) and open
  // its Deep Dive. Declared here so both the AppState listener and the focus
  // effect below can call it.
  const checkPendingOpen = useCallback(() => {
    AsyncStorage.getItem('@aifeed_pending_open').then(raw => {
      if (!raw) return;
      try {
        const a = JSON.parse(raw) as { id: string; headline: string; summary: string; imageUrl: string; url: string; source: string; publishedAt: string; at: number };
        if (Date.now() - a.at <= 5 * 60_000) {
          const story = { id: a.id, headline: a.headline, summary: a.summary, imageUrl: a.imageUrl, publishedAt: a.publishedAt, sources: a.url ? [{ name: a.source, url: a.url }] : [] } as Story;
          setOpenedItem({ primary: story, allStories: [story], sources: a.url ? [{ name: a.source, url: a.url }] : [] });
        }
      } catch {}
      AsyncStorage.removeItem('@aifeed_pending_open').catch(() => {});
    }).catch(() => {});
  }, [setOpenedItem]);
  useEffect(() => {
    if (items.length === 0) return;
    if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current);
    cacheWriteTimerRef.current = setTimeout(writeCacheNow, 600);
    return () => {
      if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current);
    };
  }, [items, topicCursor, activeIdx, writeCacheNow]);

  // Flush immediately when app backgrounds — covers the 600ms debounce window
  // so a quick app-kill right after scrolling never loses the last position.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') writeCacheNow();
      else if (s === 'active') checkPendingOpen(); // notif tapped while already on AI Feed
    });
    return () => sub.remove();
  }, [writeCacheNow, checkPendingOpen]);

  // PUSH-TAP DEEPLINK — re-check on every focus so taps work even when the
  // AIFeedScreen is already mounted. Bug fix D: always clear pending in
  // finally, even on JSON parse failure, so a malformed key can't poison
  // every future focus. Bug fix F: if pending is honored, also stamp
  // @aifeed_open_item as closed so the mount-restore effect can't fight
  // this with a stale openedItem from before the tap.
  // Read pending push-tap on focus (covers tab-switch / cold start); the
  // AppState 'active' listener above covers the already-on-AI-Feed case.
  useFocusEffect(useCallback(() => { checkPendingOpen(); }, [checkPendingOpen]));

  // FOLD / UNFOLD DEEP-DIVE RESTORATION — mount only. Skip if:
  //   - last write was a close marker
  //   - older than 5 min (only fold/unfold flips count, not app resume hours later)
  //   - a pending push-tap exists and is fresher (focus effect will handle it)
  // Bug fix F: read pending alongside open_item and let whichever is newer win,
  // so cold-start race between mount restore and focus restore can't show wrong card.
  // Also wrap removeItem in catch so a malformed JSON never poisons future mounts.
  useEffect(() => {
    (async () => {
      let openRaw: string | null = null;
      let pendingRaw: string | null = null;
      try {
        [openRaw, pendingRaw] = await Promise.all([
          AsyncStorage.getItem('@aifeed_open_item'),
          AsyncStorage.getItem('@aifeed_pending_open'),
        ]);
      } catch { return; }
      try {
        if (!openRaw) return;
        const a = JSON.parse(openRaw) as { id?: string; headline?: string; summary?: string; imageUrl?: string; url?: string; source?: string; publishedAt?: string; at: number; closed?: boolean };
        if (a.closed) return;
        if (!a.id || !a.headline) return;
        if (Date.now() - a.at > 5 * 60_000) return;
        // If pending is newer, let focus effect handle it instead.
        if (pendingRaw) {
          try {
            const p = JSON.parse(pendingRaw) as { at: number };
            if (p.at > a.at) return;
          } catch {}
        }
        const story = { id: a.id, headline: a.headline, summary: a.summary ?? '', imageUrl: a.imageUrl ?? '', publishedAt: a.publishedAt ?? '', sources: a.url ? [{ name: a.source ?? '', url: a.url }] : [] } as Story;
        setOpenedItemState({ primary: story, allStories: [story], sources: a.url ? [{ name: a.source ?? '', url: a.url }] : [] });
        setOpenedRestored(true);
      } catch {
        AsyncStorage.removeItem('@aifeed_open_item').catch(() => {});
      }
    })();
  }, []);

  const onRefresh = useCallback(async () => {
    setExhausted(false);
    setActiveIdx(0);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    if (topicCursorRef.current === 0) {
      await loadClusterForward('refresh'); // default view: re-gather cross-topic clusters
    } else {
      setRefreshing(true);
      setItems([]);
      await loadTopic(topicCursorRef.current, true);
      setRefreshing(false);
    }
  }, [loadTopic, loadClusterForward]);

  const onEndReached = useCallback(() => {
    if (loadingMore || exhausted) return;
    loadTopic(topicCursor, false);
  }, [loadingMore, exhausted, topicCursor, loadTopic]);

  // When topicCursor advances (current topic exhausted), auto-load the next topic.
  const prevTopicCursorRef = useRef(topicCursor);
  useEffect(() => {
    if (topicCursor === prevTopicCursorRef.current) return;
    prevTopicCursorRef.current = topicCursor;
    if (!exhausted) loadTopic(topicCursor, false);
  }, [topicCursor, exhausted, loadTopic]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const first = viewableItems[0];
    if (first && first.index != null) setActiveIdx(first.index);
  }).current;

  const renderCard = useCallback(({ item, index }: { item: FeedItem; index: number }) => (
    <FullPreviewCard
      item={item}
      index={index}
      total={items.length}
      width={screenW}
      height={CARD_H}
      topInset={insets.top}
      onOpen={() => setOpenedItem(item)}
    />
  ), [items.length, screenW, CARD_H, insets.top, setOpenedItem]);

  if (loading && items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header topInset={insets.top} />
        <AIFeedSkeleton />
      </View>
    );
  }
  if (error && items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header topInset={insets.top} />
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={28} color="#444" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => { setLoading(true); loadClusterForward('initial'); }} style={styles.retryBtn}>
            <Text style={styles.retryText}>RETRY</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        topInset={insets.top}
        counter={items.length > 0 ? `${activeIdx + 1} / ${items.length}` : undefined}
        currentTopic={TOPIC_QUEUE[topicCursor] ?? 'breaking'}
        onPickTopic={(t) => {
          const idx = TOPIC_QUEUE.indexOf(t);
          if (idx < 0 || idx === topicCursor) return;
          setItems([]);
          setActiveIdx(0);
          setTopicCursor(idx);
          setExhausted(false);
          flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
          if (idx === 0) loadClusterForward('initial'); // default view leads with clusters across all topics
          else loadTopic(idx, true);
        }}
      />
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={it => it.primary.id}
        renderItem={renderCard}
        extraData={`${screenW}x${CARD_H}`}
        snapToInterval={CARD_H}
        getItemLayout={(_d, i) => ({ length: CARD_H, offset: CARD_H * i, index: i })}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScroll={onScrollHide}
        scrollEventThrottle={16}
        onEndReached={onEndReached}
        onEndReachedThreshold={1.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={VIOLET}
            colors={[VIOLET]}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={[styles.footerCard, { height: screenH }]}>
              <ActivityIndicator color={VIOLET} />
              <Text style={styles.loadingText}>Loading more stories…</Text>
            </View>
          ) : exhausted ? (
            <View style={[styles.footerCard, { height: screenH }]}>
              <CelebratePop />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4 }}>You're all caught up</Text>
              <Text style={{ color: '#666', fontSize: 12 }}>Pull down to refresh.</Text>
            </View>
          ) : null
        }
      />

      {openedItem && (
        <DeepDiveOverlay
          key={openedItem.primary.id}
          item={openedItem}
          restored={openedRestored}
          onClose={() => {
            if (itemHistory.length > 0) {
              const prev = itemHistory[itemHistory.length - 1];
              setItemHistory(h => h.slice(0, -1));
              setOpenedItemState(prev);
              setOpenedRestored(false);
              const a = prev.primary;
              AsyncStorage.setItem('@aifeed_open_item', JSON.stringify({
                id: a.id, headline: a.headline, summary: a.summary, imageUrl: a.imageUrl,
                url: a.sources?.[0]?.url ?? '', source: a.sources?.[0]?.name ?? '',
                publishedAt: a.publishedAt, at: Date.now(), closed: false,
              })).catch(() => {});
            } else {
              setOpenedItem(null);
            }
          }}
          onOpenRelated={(s) => {
            if (openedItem) setItemHistory(h => [...h, openedItem]);
            setOpenedItem({ primary: s, allStories: [s], sources: dedupeSources(s.sources ?? []) });
          }}
        />
      )}

    </View>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────
const TOPIC_LABELS_MOBILE: Record<string, string> = {
  breaking: 'BREAKING',
  technology: 'TECHNOLOGY',
  'india-politics': 'INDIA',
  geopolitics: 'WORLD',
  markets: 'MARKETS',
  business: 'BUSINESS',
};

function Header({ topInset, counter, currentTopic, onPickTopic }: {
  topInset: number; counter?: string;
  currentTopic?: string; onPickTopic?: (t: string) => void;
}) {
  const counterScale = useRef(new Animated.Value(1)).current;
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (!counter) return;
    Animated.sequence([
      Animated.timing(counterScale, { toValue: 1.15, duration: 140, useNativeDriver: true }),
      Animated.spring(counterScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
    ]).start();
  }, [counter, counterScale]);
  const topic = currentTopic ?? 'breaking';
  return (
    <View style={[styles.header, { paddingTop: topInset + 10 }]} pointerEvents="box-none">
      <Pressable onPress={() => onPickTopic && setPickerOpen(true)} style={styles.pill}>
        <Ionicons name="sparkles" size={11} color={VIOLET} />
        <Text style={styles.pillText}>AI FEED · {TOPIC_LABELS_MOBILE[topic] ?? topic.toUpperCase()}</Text>
        {onPickTopic && <Ionicons name="chevron-down" size={11} color="rgba(255,255,255,0.7)" />}
      </Pressable>
      {counter && (
        <Animated.View style={[styles.pill, { paddingHorizontal: 10, transform: [{ scale: counterScale }] }]}>
          <Text style={[styles.pillText, { letterSpacing: 0.6, color: '#aaa' }]}>{counter}</Text>
        </Animated.View>
      )}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable onPress={() => setPickerOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ minWidth: 240, padding: 6, borderRadius: 14, backgroundColor: '#0e0e14', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            {Object.entries(TOPIC_LABELS_MOBILE).map(([key, label]) => {
              const active = key === topic;
              return (
                <Pressable
                  key={key}
                  onPress={() => { setPickerOpen(false); onPickTopic?.(key); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 8, backgroundColor: active ? 'rgba(185,148,255,0.15)' : 'transparent' }}
                >
                  <Text style={{ color: active ? VIOLET : '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>{label}</Text>
                  {active && <Ionicons name="checkmark" size={14} color={VIOLET} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Full-bleed card ─────────────────────────────────────────────────────────
function FullPreviewCard({ item, index: _i, total: _t, width: _w, height: cardH, topInset, onOpen }: {
  item: FeedItem; index: number; total: number; width: number; height: number; topInset: number; onOpen: () => void;
}) {
  // Use live width for foldable resize; height comes from prop so it matches
  // the FlatList layout (getItemLayout) and prevents drift on scroll.
  const { width } = useWindowDimensions();
  const story = item.primary;
  const dominant = useMemo(() => getArticleColor(story.id || story.headline), [story.id, story.headline]);
  const accent = useMemo(() => lighten(dominant, 0.55), [dominant]);
  const sourceName = item.sources[0]?.name ?? story.sources?.[0]?.name ?? 'Unknown';
  const extraSources = Math.max(0, item.sources.length - 1);
  const { deepDiveDepth } = useSettings();
  const [hasCached, setHasCached] = useState(false);
  const [aiBullets, setAiBullets] = useState<string[] | null>(null);

  useEffect(() => {
    readDeepDiveCache(story.id).then(d => setHasCached(!!d));
  }, [story.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      try {
        const res = await fetch(DEEPDIVE_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: story.sources?.[0]?.url ?? '',
            headline: story.headline,
            paragraphs: [story.headline + '. ' + (story.summary ?? story.headline)],
            sourceUrls: [story.sources?.[0]?.url].filter(Boolean) as string[],
            depth: deepDiveDepth,
            publishedAt: story.publishedAt,
          }),
        });
        if (!res.ok || cancelled) return;
        const json: DeepDiveData = await res.json();
        if (cancelled) return;
        if (json.tldr?.length) setAiBullets(json.tldr.slice(0, 4).map(b => b.replace(/\*\*/g, '')));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [story.id, deepDiveDepth]);

  const imageH = Math.round(cardH * 0.52);

  // Hero zoom-in when card mounts/lands on screen
  const heroScale = useRef(new Animated.Value(1.08)).current;
  const textOp = useRef(new Animated.Value(0)).current;
  const textTy = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.timing(heroScale, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    Animated.parallel([
      Animated.timing(textOp, { toValue: 1, duration: 350, delay: 120, useNativeDriver: true }),
      Animated.spring(textTy, { toValue: 0, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [heroScale, textOp, textTy]);

  const bullets = aiBullets ?? (story.summary ? splitToBullets(story.summary) : null);

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => ({
        width, height: cardH, backgroundColor: '#0A0A0F',
        overflow: 'hidden', borderRadius: 16,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      {/* ── Image section ── */}
      <View style={{ height: imageH, overflow: 'hidden' }}>
        {story.imageUrl ? (
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: heroScale }] }]}>
            <Image
              source={{ uri: story.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={0}
            />
          </Animated.View>
        ) : (
          <NoImageFallback dominant={dominant} accent={accent} source={sourceName} url={story.sources?.[0]?.url} />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.25)', 'transparent', 'rgba(10,10,15,0.6)', 'rgba(10,10,15,1)']}
          locations={[0, 0.35, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
        {hasCached && (
          <View style={[styles.readyBadge, { top: 12 }]}>
            <Ionicons name="sparkles" size={9} color="#86efac" />
            <Text style={styles.readyText}>READY</Text>
          </View>
        )}
      </View>

      {/* ── Text section ── */}
      <Animated.View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14, gap: 8, opacity: textOp, transform: [{ translateY: textTy }] }}>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: accent }]}>{sourceName.toUpperCase()}</Text>
          <Text style={[styles.metaText, { color: 'rgba(255,255,255,0.4)' }]}>·</Text>
          <Text style={[styles.metaText, { color: 'rgba(255,255,255,0.65)' }]}>{timeAgo(story.publishedAt)}</Text>
        </View>
        <Text style={[styles.cardHeadline, { fontSize: 20, lineHeight: 26, textShadowColor: 'transparent' }]} numberOfLines={3}>
          {story.headline}
        </Text>
        {bullets?.length ? (
          <View style={{ gap: 4 }}>
            {bullets.map((bullet, bi) => (
              <View key={bi} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
                <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: 5, backgroundColor: aiBullets ? VIOLET : 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                <Text style={{ color: '#d0d0d0', fontSize: 12.5, lineHeight: 18, flex: 1 }}>{bullet.trim()}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles" size={12} color={VIOLET} />
            <Text style={{ color: VIOLET, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>TAP FOR AI DEEP DIVE</Text>
          </View>
        )}
      </Animated.View>

      <Text style={styles.swipeHint}>↑ SWIPE FOR NEXT</Text>
    </Pressable>
  );
}

// ── Related story card (EARLIER IN STORY) — pre-fetches AI bullets ─────────
function RelatedStoryCard({ s, onPress }: { s: Story; onPress: () => void }) {
  const { deepDiveDepth } = useSettings();
  const [aiBullets, setAiBullets] = useState<string[] | null>(null);
  const srcName = s.sources?.[0]?.name ?? 'Source';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(DEEPDIVE_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: s.sources?.[0]?.url ?? '',
            headline: s.headline,
            paragraphs: [s.headline + '. ' + (s.summary ?? s.headline)],
            sourceUrls: [s.sources?.[0]?.url].filter(Boolean) as string[],
            depth: deepDiveDepth,
            publishedAt: s.publishedAt,
          }),
        });
        if (!res.ok || cancelled) return;
        const json: DeepDiveData = await res.json();
        if (cancelled) return;
        if (json.tldr?.length) setAiBullets(json.tldr.slice(0, 4).map(b => b.replace(/\*\*/g, '')));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [s.id, deepDiveDepth]);

  const bullets = aiBullets ?? (s.summary ? splitToBullets(s.summary) : null);

  return (
    <Pressable onPress={onPress} style={overlayStyles.relatedCard}>
      {s.imageUrl ? (
        <Image source={{ uri: s.imageUrl }} style={overlayStyles.relatedCardImage} contentFit="cover" />
      ) : (
        <View style={overlayStyles.relatedCardImageFallback} />
      )}
      <View style={overlayStyles.relatedCardBody}>
        <Text style={overlayStyles.sourceName}>{srcName.toUpperCase()}</Text>
        <Text numberOfLines={3} style={overlayStyles.relatedCardHeadline}>{s.headline}</Text>
        {bullets?.length ? bullets.map((bullet, bi) => (
          <View key={bi} style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'flex-start' }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 6, backgroundColor: aiBullets ? VIOLET : 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
            <Text style={overlayStyles.relatedSummary}>{bullet.trim()}</Text>
          </View>
        )) : !aiBullets ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <Ionicons name="sparkles" size={10} color={VIOLET} />
            <Text style={[overlayStyles.relatedSummary, { color: VIOLET, opacity: 0.7, fontSize: 10 }]}>Loading AI summary…</Text>
          </View>
        ) : null}
        <Text style={overlayStyles.relatedCardCta}>DEEP DIVE ›</Text>
      </View>
    </Pressable>
  );
}

// ── Deep Dive Overlay ──────────────────────────────────────────────────────
function DeepDiveOverlay({ item, restored, onClose, onOpenRelated }: { item: FeedItem; restored?: boolean; onClose: () => void; onOpenRelated?: (s: Story) => void }) {
  const story = item.primary;
  // Customize → Deep Dive section toggles + depth + global font size.
  const { showDeepDiveEntities, showDeepDiveCurious, deepDiveDepth, fontSize: globalFontSize } = useSettings();
  // Scale Deep Dive body text by the user's Article font size. Headers and
  // labels stay branded sizes; only reading content scales.
  const ddScale = globalFontSize === 'Small' ? 0.88
    : globalFontSize === 'Large' ? 1.12
    : globalFontSize === 'XLarge' ? 1.24
    : 1; // Medium
  const dominant = useMemo(() => getArticleColor(story.id || story.headline), [story.id, story.headline]);
  const accent = useMemo(() => lighten(dominant, 0.55), [dominant]);
  const sourceName = item.sources[0]?.name ?? story.sources?.[0]?.name ?? 'Unknown';
  const extraSources = Math.max(0, item.sources.length - 1);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DeepDiveData | null>(null);
  const [stage, setStage] = useState<'generating' | 'done' | 'error'>('generating');
  const [error, setError] = useState<string | null>(null);
  const [showColdHint, setShowColdHint] = useState(false);
  const [following, setFollowing] = useState(() => isFollowing(story.id));
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

const SOURCE_COVERAGE_RE = /no other sources? (were|was) provided|only one (source|article)|no sources? (were|was) provided|single (source|article)|The article from \S+ highlights/i;
function isSourcePara(p: string): boolean { return SOURCE_COVERAGE_RE.test(p); }

function dedupeMetrics(items: string[]): string[] {
  const sig = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  const out: string[] = [];
  for (const item of items) {
    const ws = new Set(sig(item));
    const isDupe = out.some(ex => {
      const exWs = new Set(sig(ex));
      const shared = [...ws].filter(w => exWs.has(w)).length;
      return shared / Math.min(ws.size, exWs.size) > 0.6;
    });
    if (!isDupe) out.push(item);
  }
  return out;
}

  const metrics = useMemo(() => {
    if (!data) return [];
    if (data.keyMetrics && data.keyMetrics.length > 0) return dedupeMetrics(data.keyMetrics).slice(0, 5);
    const pool = [
      ...(data.tldr ?? []),
      ...(data.tldrSections?.flatMap(s => s.bullets) ?? []),
      data.narrative ?? '',
    ].join(' ');
    return extractMetrics(pool);
  }, [data]);

  const reload = useCallback(() => {
    setError(null);
    setShowColdHint(false);
    setStage('generating');
    setReloadKey(k => k + 1);
  }, []);

  // Android back closes overlay
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        // Check cache first (skip on manual retry so we force a fresh call).
        if (reloadKey === 0) {
          const cached = await readDeepDiveCache(story.id, deepDiveDepth);
          if (cached && !cancelled) { setData(cached); setStage('done'); return; }
        }
        setStage('generating');
        const paragraphs = [
          story.headline + '. ' + (story.summary ?? story.headline),
        ];
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 95000);
        let dd: Response;
        try {
          dd = await fetch(DEEPDIVE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: story.sources?.[0]?.url ?? '',
              headline: story.headline,
              paragraphs,
              sourceUrls: (item.sources ?? []).map(s => s.url).filter(Boolean),
              depth: deepDiveDepth,
              publishedAt: story.publishedAt,
            }),
            signal: ctrl.signal,
          });
        } finally { clearTimeout(t); }
        if (!dd.ok) throw new Error(`Deep Dive ${dd.status}`);
        const json: DeepDiveData = await dd.json();
        if (cancelled) return;
        setData(json);
        if (!json.degraded) await writeDeepDiveCache(story.id, json, deepDiveDepth); // never cache the non-AI fallback
        setStage('done');
      } catch (e) {
        if (cancelled) return;
        setError(String(e instanceof Error ? e.message : e));
        setStage('error');
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => { cancelled = true; };
    // Bug fix H: gate on story.id only. story.id is stable per cluster and
    // every other field is derived from the same item — refiring on prop
    // reference change wastes a 25s API call. reloadKey added so manual
    // retry re-runs the fetch.
  }, [story.id, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stage !== 'generating') { setShowColdHint(false); return; }
    const t = setTimeout(() => setShowColdHint(true), 5000);
    return () => clearTimeout(t);
  }, [stage]);

  return (
    <Modal visible animationType={restored ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#050507' }}>
        {/* No top SafeAreaView — image goes edge-to-edge under status bar. */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 60 }} showsVerticalScrollIndicator={false}
          refreshControl={stage === 'error'
            ? <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); }} tintColor={accent} colors={[accent]} />
            : undefined}
        >
          {/* Hero — starts at y=0, behind status bar */}
          <View style={{ height: 360, position: 'relative', backgroundColor: dominant, overflow: 'hidden' }}>
            {story.imageUrl ? (
              <DDHero uri={story.imageUrl} />
            ) : (
              <NoImageFallback dominant={dominant} accent={accent} source={sourceName} url={story.sources?.[0]?.url} />
            )}
            <LinearGradient
              colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', 'rgba(5,5,7,0.7)', '#050507']}
              locations={[0, 0.25, 0.55, 0.88, 1]}
              style={StyleSheet.absoluteFill}
            />
              {data && data.tags.length > 0 && (
                <View style={overlayStyles.heroTags}>
                  {data.tags.slice(0, 4).map(t => (
                    <View key={t} style={overlayStyles.tagChip}>
                      <Text style={overlayStyles.tagChipText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={overlayStyles.body}>
              {/* Headline */}
              <Text style={overlayStyles.headline}>{story.headline}</Text>

              {/* Meta */}
              <View style={overlayStyles.metaRow}>
                <Text style={[overlayStyles.metaText, { color: accent }]}>{sourceName.toUpperCase()}</Text>
                {extraSources > 0 && (
                  <View style={overlayStyles.sourceCountPill}>
                    <Text style={overlayStyles.sourceCountText}>+{extraSources} {extraSources === 1 ? 'SOURCE' : 'SOURCES'}</Text>
                  </View>
                )}
                <Text style={[overlayStyles.metaText, { color: 'rgba(255,255,255,0.3)' }]}>·</Text>
                <Text style={[overlayStyles.metaText, { color: accent }]}>{timeAgo(story.publishedAt)}</Text>
              </View>

              {stage === 'generating' ? (
                <InlineLoader showColdHint={showColdHint} />
              ) : stage === 'error' ? (
                <InlineError text={error || 'Failed'} onRetry={reload} accent={accent} />
              ) : data ? (
                <>
                  {/* TL;DR — grouped sections if AI emitted them, else flat fallback */}
                  {((data.tldrSections && data.tldrSections.length > 0) || data.tldr.length > 0) && (
                    <Stagger delay={0}><View style={[overlayStyles.card, { borderTopColor: VIOLET, borderTopWidth: 2 }]}>
                      <View style={overlayStyles.labelDivider} />
                      {data.tldrSections && data.tldrSections.length > 0 ? (
                        data.tldrSections.map((section, si) => (
                          <View key={si} style={{ marginTop: si > 0 ? 20 : 0, paddingTop: si > 0 ? 16 : 0, borderTopWidth: si > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8, textTransform: 'uppercase' }}>
                              {section.heading}
                            </Text>
                            {section.bullets.map((b, i) => (
                              <View key={i} style={overlayStyles.bulletRow}>
                                <View style={overlayStyles.bulletDot} />
                                <Text style={[overlayStyles.bulletText, { fontSize: 15.5 * ddScale, lineHeight: 25 * ddScale }]}>
                                  {renderHighlighted(b, allTags(data))}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ))
                      ) : (
                        data.tldr.map((b, i) => (
                          <View key={i} style={overlayStyles.bulletRow}>
                            <View style={overlayStyles.bulletDot} />
                            <Text style={overlayStyles.bulletText}>
                              {renderHighlighted(b, allTags(data))}
                            </Text>
                          </View>
                        ))
                      )}
                    </View></Stagger>
                  )}

                  {/* Key Insight (gold) */}
                  {data.insight && (
                    <Stagger delay={80}><View style={overlayStyles.insightCard}>
                      <View style={overlayStyles.insightBar} />
                      <Text style={overlayStyles.insightLabel}>KEY INSIGHT</Text>
                      <Text style={[overlayStyles.insightText, { fontSize: 15.5 * ddScale, lineHeight: 24 * ddScale }]}>{data.insight.replace(/\*\*/g, '')}</Text>
                    </View></Stagger>
                  )}

                  {/* Key Metrics */}
                  {metrics.length > 0 && (
                    <Stagger delay={120}><View style={[overlayStyles.card, { borderTopColor: '#4A90D9', borderTopWidth: 2 }]}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Text style={[overlayStyles.sectionLabel, { color: '#4A90D9' }]}>KEY METRICS</Text>
                        <View style={[overlayStyles.labelDivider, { backgroundColor: 'rgba(74,144,217,0.2)' }]} />
                      </View>
                      {metrics.map((m, i) => (
                        <View key={i} style={[overlayStyles.bulletRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.05)' }]}>
                          <View style={[overlayStyles.bulletDot, { backgroundColor: '#4A90D9' }]} />
                          <Text style={[overlayStyles.bulletText, { fontSize: 14 * ddScale, lineHeight: 22 * ddScale }]}>
                            {renderHighlighted(m, allTags(data))}
                          </Text>
                        </View>
                      ))}
                    </View></Stagger>
                  )}

                  {/* Story */}
                  {(data.narrative || (data.storySections && data.storySections.length > 0)) && (
                    <Stagger delay={200}><View style={{ marginTop: 4 }}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Text style={overlayStyles.sectionLabel}>THE STORY</Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {(() => {
                        const narrativeText = data.narrative && data.narrative.trim().length > 200 ? data.narrative : null;
                        if (narrativeText) {
                          return narrativeText.split(/\n\n+/).filter(p => p && !isSourcePara(p)).map((p, i) => (
                            <Text key={i} style={[overlayStyles.narrativePara, { fontSize: 16 * ddScale, lineHeight: 27 * ddScale }]}>
                              {renderHighlighted(p, allTags(data))}
                            </Text>
                          ));
                        }
                        if (data.storySections && data.storySections.length > 0) {
                          return data.storySections.flatMap((sec, si) =>
                            sec.body.split(/\n\n+/).filter(p => p && !isSourcePara(p)).map((p, pi) => (
                              <Text key={`${si}-${pi}`} style={[overlayStyles.narrativePara, { fontSize: 16 * ddScale, lineHeight: 27 * ddScale }]}>
                                {renderHighlighted(p, allTags(data))}
                              </Text>
                            ))
                          );
                        }
                        return data.narrative.split(/\n\n+/).filter(p => p && !isSourcePara(p)).map((p, i) => (
                          <Text key={i} style={overlayStyles.narrativePara}>
                            {renderHighlighted(p, allTags(data))}
                          </Text>
                        ));
                      })()}
                    </View></Stagger>
                  )}

                  {/* Follow the Story — gated by Customize → showDeepDiveEntities. */}
                  {showDeepDiveEntities && (data.keyPeople?.length || data.keyCompanies?.length || data.topics?.length) ? (
                    <Stagger delay={280}><View style={{ marginTop: 4 }}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Ionicons name="sparkles" size={11} color={VIOLET} />
                        <Text style={[overlayStyles.sectionLabel, { marginLeft: 6 }]}>FOLLOW THE STORY</Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {!!data.keyPeople?.length && <EntityBlock label="KEY PEOPLE" items={data.keyPeople} />}
                      {!!data.keyCompanies?.length && <EntityBlock label="KEY ORGANIZATIONS" items={data.keyCompanies} />}
                      {!!data.topics?.length && <EntityBlock label="TOPICS" items={data.topics} subtle />}
                    </View></Stagger>
                  ) : null}

                  {/* Curious? Questions — gated by Customize → showDeepDiveCurious. */}
                  {showDeepDiveCurious && data.questions.length > 0 && (
                    <Stagger delay={360}><View style={{ marginTop: 4 }}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Ionicons name="sparkles" size={11} color={VIOLET} />
                        <Text style={[overlayStyles.sectionLabel, { marginLeft: 6 }]}>CURIOUS?</Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {data.questions.slice(0, 4).map((q, i) => (
                        <QuestionItem
                          key={i}
                          question={q}
                          story={story}
                          narrative={data.narrative}
                          scale={ddScale}
                        />
                      ))}
                    </View></Stagger>
                  )}

                  {/* Related Coverage */}
                  {item.allStories.length > 1 && (
                    <Stagger delay={440}><View style={{ marginTop: 4 }}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Text style={overlayStyles.sectionLabel}>
                          EARLIER IN STORY
                        </Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {item.allStories.slice(1, 6).map((s, i) => {
                        const srcUrl = s.sources?.[0]?.url ?? null;
                        return (
                          <RelatedStoryCard
                            key={s.id || i}
                            s={s}
                            onPress={() => onOpenRelated ? onOpenRelated(s) : srcUrl && WebBrowser.openBrowserAsync(srcUrl).catch(() => {})}
                          />
                        );
                      })}
                    </View></Stagger>
                  )}
                </>
              ) : null}
            </View>
          </ScrollView>

        {/* Floating top bar — absolute, sits over the hero image */}
        <View
          pointerEvents="box-none"
          style={[overlayStyles.topBarFloating, { paddingTop: insets.top + 10 }]}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.3)', 'transparent']}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Pressable onPress={onClose} hitSlop={12} style={overlayStyles.iconBtn}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => setFollowing(toggleFollow({ id: story.id, headline: story.headline, imageUrl: story.imageUrl }))}
              hitSlop={8}
              style={[overlayStyles.iconBtn, following && { backgroundColor: `${accent}33`, borderColor: accent }]}>
              <Ionicons name={following ? 'star' : 'star-outline'} size={17} color={following ? accent : '#fff'} />
            </Pressable>
            <View style={overlayStyles.brandPill}>
              <Ionicons name="sparkles" size={11} color={VIOLET} />
              <Text style={[overlayStyles.brandText, { color: VIOLET }]}>AI DEEP DIVE</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Q&A item with inline expand ─────────────────────────────────────────────
function QuestionItem({ question, story, narrative, scale = 1 }: {
  question: string; story: Story; narrative?: string; scale?: number;
}) {
  const cacheKey = useMemo(() => {
    let h = 5381;
    const s = story.headline + '::' + question;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }, [story.headline, question]);
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ASK_CACHE_PREFIX + cacheKey)
      .then(raw => {
        if (!raw) return;
        try {
          const p = JSON.parse(raw);
          if (Date.now() - p.at < CACHE_TTL_MS) setAnswer(p.answer);
        } catch {}
      });
  }, [cacheKey]);

  const fetchAnswer = useCallback(async () => {
    if (answer || loading) return;
    setLoading(true);
    setError(null);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      const r = await fetch(ASK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          headline: story.headline,
          summary: story.summary,
          narrative,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: { answer?: string } = await r.json();
      if (!data.answer) throw new Error('No answer');
      setAnswer(data.answer);
      AsyncStorage.setItem(ASK_CACHE_PREFIX + cacheKey, JSON.stringify({ answer: data.answer, at: Date.now() })).catch(() => {});
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [answer, loading, narrative, question, story.headline, story.summary, cacheKey]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !answer && !loading) fetchAnswer();
  };

  return (
    <View style={overlayStyles.questionItem}>
      <Pressable onPress={toggle} style={overlayStyles.questionRow}>
        <Ionicons name="sparkles" size={12} color={VIOLET} />
        <Text style={[overlayStyles.questionText, { fontSize: 13 * scale, lineHeight: 18 * scale }]}>{question.replace(/\*\*/g, '')}</Text>
        <Text style={[overlayStyles.questionChevron, { color: VIOLET, transform: [{ rotate: open ? '90deg' : '0deg' }] }]}>›</Text>
      </Pressable>
      {open && (
        <View style={overlayStyles.answerWrap}>
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TypingDots color={VIOLET} />
              <Text style={{ color: '#aaa', fontSize: 12 }}>Thinking…</Text>
            </View>
          ) : error ? (
            <View>
              <Text style={{ color: '#ff8888', fontSize: 12 }}>{error}</Text>
              <Pressable onPress={() => { setError(null); fetchAnswer(); }} style={overlayStyles.retryBtn}>
                <Text style={overlayStyles.retryBtnText}>RETRY</Text>
              </Pressable>
            </View>
          ) : answer ? (
            <Text style={[overlayStyles.answerText, { fontSize: 13.5 * scale, lineHeight: 21 * scale }]}>{answer}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function EntityBlock({ label, items, subtle }: { label: string; items: string[]; subtle?: boolean }) {
  return (
    <View style={overlayStyles.entityBlock}>
      <Text style={overlayStyles.entityLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {items.map((it, i) => (
          <View key={i} style={[
            overlayStyles.entityChip,
            subtle && { backgroundColor: `${VIOLET}1a`, borderColor: `${VIOLET}33` },
          ]}>
            <Text style={[
              overlayStyles.entityChipText,
              subtle && { color: VIOLET, fontWeight: '700' },
            ]}>{it}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InlineLoader({ showColdHint }: { showColdHint: boolean }) {
  return (
    <View style={[overlayStyles.loaderCard, { overflow: 'hidden' }]}>
      <SweepBar />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TypingDots color={VIOLET} />
        <Text style={{ color: '#ccc', fontSize: 12, fontWeight: '500' }}>Distilling story…</Text>
      </View>
      {showColdHint && (
        <Text style={overlayStyles.coldHint}>
          Backend warming up (Render free tier). First request after idle takes ~20s.
        </Text>
      )}
    </View>
  );
}

// Top-edge violet sweep bar — animated translateX of a gradient strip.
function SweepBar() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(x, { toValue: 1, duration: 1600, useNativeDriver: true })).start();
  }, [x]);
  const tx = x.interpolate({ inputRange: [0, 1], outputRange: [-200, 400] });
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', top: 0, height: 2, width: 200, transform: [{ translateX: tx }] }}>
        <LinearGradient
          colors={['transparent', VIOLET, 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

// ── Animation helpers ───────────────────────────────────────────────────────
function Stagger({ delay, children }: { delay: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 450, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 450, delay, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY, delay]);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function TypingDots({ color = VIOLET }: { color?: string }) {
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const seq = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 330, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 330, useNativeDriver: true }),
          Animated.delay(440 - delay),
        ])
      );
    const animations = [seq(d1, 0), seq(d2, 180), seq(d3, 360)];
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [d1, d2, d3]);
  const dot = (v: Animated.Value) => ({
    width: 6, height: 6, borderRadius: 3, backgroundColor: color,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  });
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      <Animated.View style={dot(d1)} />
      <Animated.View style={dot(d2)} />
      <Animated.View style={dot(d3)} />
    </View>
  );
}

// Bounce-in for card text overlay — spring slide-up when card mounts.
function CardTextBounce({ children }: { children: React.ReactNode }) {
  const ty = useRef(new Animated.Value(24)).current;
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(ty, { toValue: 0, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [ty, op]);
  return (
    <Animated.View style={[styles.cardTextBlock, { opacity: op, transform: [{ translateY: ty }] }]}>
      {children}
    </Animated.View>
  );
}

// Initial-load shimmer skeleton — full-screen with violet typing dots overlay.
function AIFeedSkeleton() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Native driver so the shimmer keeps animating even while the JS thread
    // is busy fetching/parsing the feed (was false → froze during load).
    Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true })).start();
  }, [v]);
  const opacity = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.7, 0.35] });
  return (
    <View style={{ flex: 1, paddingHorizontal: 22, justifyContent: 'flex-end', paddingBottom: 140 }}>
      <Animated.View style={{ height: 14, width: '40%', borderRadius: 4, backgroundColor: '#1a1a22', opacity, marginBottom: 14 }} />
      <Animated.View style={{ height: 28, width: '92%', borderRadius: 6, backgroundColor: '#22222c', opacity, marginBottom: 8 }} />
      <Animated.View style={{ height: 28, width: '72%', borderRadius: 6, backgroundColor: '#22222c', opacity, marginBottom: 18 }} />
      <Animated.View style={{ height: 12, width: '60%', borderRadius: 4, backgroundColor: '#16161c', opacity }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: '45%', alignItems: 'center', gap: 12 }}>
        <TypingDots color={VIOLET} />
        <Text style={{ color: '#888', fontSize: 13, fontWeight: '500' }}>Loading breaking news…</Text>
      </View>
    </View>
  );
}

// Spring-pop emoji for "all caught up".
function CelebratePop() {
  const s = useRef(new Animated.Value(0.4)).current;
  const r = useRef(new Animated.Value(-20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(s, { toValue: 1.25, duration: 420, useNativeDriver: true }),
        Animated.spring(s, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
      ]),
      Animated.timing(r, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [s, r]);
  return (
    <Animated.Text style={{ fontSize: 38, marginBottom: 8, transform: [{ scale: s }, { rotate: r.interpolate({ inputRange: [-20, 0], outputRange: ['-20deg', '0deg'] }) }] }}>
      🎉
    </Animated.Text>
  );
}

function NoImageFallback({ dominant, accent }: {
  dominant: string; accent: string; source?: string; url?: string;
}) {
  // Branded network-node banner whenever an article has no thumbnail.
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#05060c' }]}>
      <Image source={FALLBACK_IMG} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={[dominant + '33', 'transparent', accent + '1f']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </View>
  );
}

function DDHero({ uri }: { uri: string }) {
  const scale = useRef(new Animated.Value(1.1)).current;
  useEffect(() => {
    Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [scale]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

function TickNumber({ to, dur = 600 }: { to: number; dur?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, dur]);
  return <>{v}</>;
}

function InlineError({ text, onRetry, accent }: { text: string; onRetry?: () => void; accent?: string }) {
  const c = accent || VIOLET;
  return (
    <View style={overlayStyles.errorCard}>
      <Text style={{ color: '#ff8888', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>Couldn't generate</Text>
      <Text style={{ color: '#aaa', fontSize: 11, marginBottom: onRetry ? 14 : 0 }}>{text}</Text>
      {onRetry && (
        <>
          <Pressable onPress={onRetry} style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            paddingVertical: 11, borderRadius: 12,
            backgroundColor: `${c}22`, borderWidth: 1, borderColor: `${c}66`,
          }}>
            <Ionicons name="refresh" size={15} color={c} />
            <Text style={{ color: c, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>RETRY</Text>
          </Pressable>
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, textAlign: 'center', marginTop: 9 }}>
            or pull down to refresh
          </Text>
        </>
      )}
    </View>
  );
}

// ── Highlight entities inline ───────────────────────────────────────────────
function renderHighlighted(text: string, tags: string[]): React.ReactNode[] {
  // Strip + capture **bold** markdown emitted by the AI for entity emphasis.
  const boldRe = /\*\*([^*]+)\*\*/g;
  const segs: Array<{ text: string; bold: boolean }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index), bold: false });
    segs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ text: text.slice(last), bold: false });
  if (segs.length === 0) segs.push({ text, bold: false });

  const escaped = tags && tags.length > 0
    ? tags.sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : [];
  const re = escaped.length > 0 ? new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi') : null;

  const out: React.ReactNode[] = [];
  segs.forEach((seg, si) => {
    if (seg.bold) {
      out.push(<EntityPulse key={`b${si}`} text={seg.text} />);
      return;
    }
    if (!re) { out.push(seg.text); return; }
    const parts = seg.text.split(re);
    parts.forEach((p, i) => {
      if (i % 2 === 1) out.push(<EntityPulse key={`t${si}-${i}`} text={p} />);
      else out.push(p);
    });
  });
  return out;
}

// Inline animated text — flashes a violet background once, then settles to a
// subtle steady tint. Matches the web .dd-entity-pulse keyframe.
function EntityPulse({ text }: { text: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(500),
      Animated.timing(v, { toValue: 1, duration: 450, useNativeDriver: false }),
      Animated.timing(v, { toValue: 0.25, duration: 900, useNativeDriver: false }),
    ]).start();
  }, [v]);
  const bg = v.interpolate({ inputRange: [0, 1], outputRange: ['rgba(185,148,255,0)', 'rgba(185,148,255,0.32)'] });
  return (
    <Animated.Text style={{ color: '#fff', fontWeight: '700', backgroundColor: bg }}>
      {text}
    </Animated.Text>
  );
}

function allTags(d: DeepDiveData): string[] {
  return [...(d.tags ?? []), ...(d.keyPeople ?? []), ...(d.keyCompanies ?? [])];
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  briefBar: {
    position: 'absolute', left: 12, right: 12, zIndex: 50,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16,
    backgroundColor: 'rgba(18,16,28,0.96)', borderWidth: 1, borderColor: 'rgba(185,148,255,0.35)',
  },
  briefLabel: { color: VIOLET, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  briefTitle: { color: '#eee', fontSize: 13, fontWeight: '600', marginTop: 1 },
  briefBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  container: { flex: 1, backgroundColor: '#050507' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  loadingText: { color: '#888', fontSize: 13, fontWeight: '500' },
  errorText: { color: '#ff8888', fontSize: 13, fontWeight: '500', textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: '#2A2A2A',
    marginTop: 6,
  },
  retryText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(20,20,28,0.7)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },

  readyBadge: {
    position: 'absolute', left: 14, zIndex: 5,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(34,197,94,0.4)',
  },
  readyText: { color: '#86efac', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },

  cardTextBlock: { position: 'absolute', left: 0, right: 0, bottom: 100, paddingHorizontal: 22, gap: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  sourceCountPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)' },
  sourceCountText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  cardHeadline: {
    color: '#fff', fontSize: 26, fontWeight: '800',
    lineHeight: 32, letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 24,
  },
  cardSummary: { color: '#e5e5e5', fontSize: 15, lineHeight: 22 },
  swipeHint: {
    position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center',
    color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', letterSpacing: 1.4,
  },
  footerCard: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#050507', gap: 12,
  },
});

const overlayStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10,
  },
  topBarFloating: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(20,20,28,0.7)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  brandPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(20,20,28,0.7)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  brandText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },

  heroTags: {
    position: 'absolute', left: 16, right: 16, bottom: 18,
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  tagChip: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(20,20,28,0.75)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  tagChipText: { color: '#eee', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  body: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
  headline: { color: '#fff', fontSize: 24, fontWeight: '800', lineHeight: 30, letterSpacing: -0.4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  sourceCountPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' },
  sourceCountText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },

  card: {
    backgroundColor: 'rgba(15,15,22,0.5)',
    borderRadius: 16, padding: 22,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sectionLabel: { color: VIOLET, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  labelDivider: { flex: 1, height: 1, backgroundColor: `${VIOLET}33`, marginLeft: 8 },
  bulletRow: { flexDirection: 'row', gap: 12, paddingVertical: 7, alignItems: 'flex-start' },
  bulletDot: { width: 6, height: 6, borderRadius: 4, marginTop: 9, backgroundColor: VIOLET },
  bulletText: { flex: 1, color: '#cfcfd8', fontSize: 15.5, lineHeight: 25 },

  insightCard: {
    position: 'relative', padding: 22, paddingLeft: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,197,66,0.06)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,197,66,0.18)',
  },
  insightBar: {
    position: 'absolute', left: 0, top: 14, bottom: 14, width: 3,
    backgroundColor: GOLD, borderRadius: 999,
  },
  insightLabel: { color: GOLD, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 8 },
  insightText: { color: '#fff', fontSize: 15.5, lineHeight: 24, fontWeight: '500', fontStyle: 'italic' },

  narrativePara: { color: '#c8c8d4', fontSize: 16, lineHeight: 27, marginBottom: 16 },
  storyHeading: { color: VIOLET, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginBottom: 10, textTransform: 'uppercase' },

  entityBlock: {
    marginBottom: 12, padding: 16, borderRadius: 14,
    backgroundColor: 'rgba(15,15,22,0.5)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)',
  },
  entityLabel: { color: '#666', fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10 },
  entityChip: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  entityChipText: { color: '#e8e8e8', fontSize: 11.5, fontWeight: '500' },

  questionItem: {
    borderRadius: 12, overflow: 'hidden', marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  questionText: { flex: 1, color: '#e8e8e8', fontSize: 13, lineHeight: 18, fontWeight: '500' },
  questionChevron: { fontSize: 16, fontWeight: '700' },
  answerWrap: { padding: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.05)' },
  answerText: { color: '#cfcfd8', fontSize: 13.5, lineHeight: 21 },
  retryBtn: {
    alignSelf: 'flex-start', marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,136,136,0.4)',
  },
  retryBtnText: { color: '#ff8888', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },

  sourceRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, borderRadius: 12, marginBottom: 8,
    backgroundColor: 'rgba(185,148,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(185,148,255,0.12)',
  },
  relatedRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: 12, marginBottom: 8,
    backgroundColor: 'rgba(185,148,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(185,148,255,0.12)',
  },
  relatedCard: {
    borderRadius: 14, marginBottom: 10, overflow: 'hidden',
    backgroundColor: 'rgba(185,148,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(185,148,255,0.12)',
  },
  relatedCardImage: { width: '100%', height: 160 },
  relatedCardImageFallback: { width: '100%', height: 80, backgroundColor: 'rgba(185,148,255,0.08)' },
  relatedCardBody: { padding: 14 },
  relatedCardHeadline: { color: '#f0f0f0', fontSize: 15, fontWeight: '700', lineHeight: 21, marginTop: 4 },
  relatedCardCta: { color: VIOLET, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 10 },
  relatedThumb: { width: 64, height: 64, borderRadius: 8, flexShrink: 0 },
  relatedSummary: { color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 17, marginTop: 5 },
  sourceName: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  sourceArrow: { fontSize: 14, fontWeight: '700' },

  loaderCard: {
    padding: 18, borderRadius: 14, gap: 10,
    backgroundColor: 'rgba(15,15,22,0.7)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)',
  },
  coldHint: { color: '#888', fontSize: 11, lineHeight: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.05)' },
  errorCard: {
    padding: 16, borderRadius: 14,
    backgroundColor: 'rgba(40,20,20,0.4)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,80,80,0.15)',
  },
});
