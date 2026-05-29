import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { tabBarTranslateY, useTabBarAutoHide } from '../utils/tabBarAnim';
import { trackAiUsage, trackArticleRead } from '../utils/usageTracker';
import { darken, lighten, getArticleColor } from '../utils/colors';

const FEED_API_BASE = 'https://ireader.onrender.com/api/news/feed';
const DEEPDIVE_API = 'https://ireader.onrender.com/api/news/deepdive';
const ASK_API = 'https://ireader.onrender.com/api/news/ask';
const CACHE_PREFIX = '@deepdive_v1_';
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
interface DeepDiveData {
  tldr: string[];
  tldrSections?: TldrSection[];
  narrative: string;
  insight: string;
  questions: string[];
  tags: string[];
  keyPeople?: string[];
  keyCompanies?: string[];
  topics?: string[];
}

const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','to','for','of','and','or',
  'in','on','at','by','from','with','that','this','its','it','as','has','have','had',
  'will','says','said','after','before','over','new',
]);

function headlineSig(h: string): Set<string> {
  return new Set(
    (h ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !STOPWORDS.has(w)),
  );
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
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

// Drop Hindi/Devanagari headlines and mobile-phone discount/deal stories.
const PHONE_RE = /\b(phone|smartphone|mobile|iphone|android|samsung|xiaomi|redmi|oneplus|oppo|vivo|realme|motorola|moto|nokia|pixel|infinix|tecno|poco|nothing phone)\b/i;
const DEAL_RE = /\b(discount|deal|deals|offer|offers|sale|price drop|price cut|cashback|emi|exchange offer|bank offer|coupon|lowest price|best price|under ₹|under rs\.?|under inr|% off|percent off|flat \d+|flipkart|amazon (sale|prime day|great)|big billion)\b/i;
function isExcluded(s?: { headline?: string; summary?: string }): boolean {
  if (!s) return false;
  const text = `${s.headline || ''} ${s.summary || ''}`;
  if (/[ऀ-ॿ]/.test(text)) return true; // Devanagari (Hindi)
  if (PHONE_RE.test(text) && DEAL_RE.test(text)) return true;
  return false;
}

function dedupeFeed(items: ApiItem[]): FeedItem[] {
  const initial = items.map(it => {
    if (it.type === 'cluster' && Array.isArray(it.articles) && it.articles.length > 0) {
      const primary = it.articles[0];
      const sources = dedupeSources(it.articles.flatMap(a => a.sources ?? []));
      return { primary, allStories: it.articles, sources };
    }
    const s = it as unknown as Story;
    if (!s?.headline) return null;
    return { primary: s, allStories: [s], sources: dedupeSources(s.sources ?? []) };
  }).filter((x): x is FeedItem => !!x);

  const out: FeedItem[] = [];
  for (const it of initial) {
    const sig = headlineSig(it.primary.headline);
    const merged = out.find(existing => jaccard(sig, headlineSig(existing.primary.headline)) >= 0.6);
    if (merged) {
      merged.allStories.push(...it.allStories.filter(s => !merged.allStories.some(e => e.id === s.id)));
      merged.sources = dedupeSources([...merged.sources, ...it.sources]);
    } else {
      out.push(it);
    }
  }
  return out;
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
async function readDeepDiveCache(id: string): Promise<DeepDiveData | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}
async function writeDeepDiveCache(id: string, data: DeepDiveData) {
  try { await AsyncStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ ...data, at: Date.now() })); } catch {}
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function AIFeedScreen() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedItem, setOpenedItemState] = useState<FeedItem | null>(null);
  const flatListRef = useRef<FlatList<FeedItem> | null>(null);
  const navigation = useNavigation();
  // Tab-tap → scroll to first card (and close any open Deep Dive).
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsub = (navigation as any).getParent?.()?.addListener?.('tabPress', () => {
      setOpenedItemState(null);
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsub;
  }, [navigation]);
  // Persist Deep Dive open state so Activity recreation (fold/unfold) restores it.
  // Write a "closed" marker (not removeItem) so close-then-fold race cannot
  // resurrect a dead overlay — restore only if last write had closed:false.
  const setOpenedItem = useCallback((item: FeedItem | null) => {
    setOpenedItemState(item);
    if (item) {
      const a = item.primary;
      // Track usage: count Deep Dive opens as AI usage + article read.
      trackAiUsage('deepDive').catch(() => {});
      trackArticleRead(a.sources?.[0]?.name ?? '', (a as { category?: string }).category).catch(() => {});
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
      const incoming = dedupeFeed(rawItems)
        .filter(it => it.primary.headline && it.primary.publishedAt)
        .filter(it => !isExcluded(it.primary) && !it.allStories.every(isExcluded));
      const existingIds = new Set(itemsRef.current.map(it => it.primary.id));
      const existingSigs = itemsRef.current.map(it => headlineSig(it.primary.headline));
      const newOnes = incoming.filter(it => {
        if (existingIds.has(it.primary.id)) return false;
        const sig = headlineSig(it.primary.headline);
        return !existingSigs.some(es => jaccard(sig, es) >= 0.6);
      });
      if (newOnes.length === 0 && !isInitial) {
        setExhausted(true);
        return;
      }
      setItems(prev => isInitial ? newOnes : [...prev, ...newOnes]);
      if (isInitial) setError(null);
    } catch (e) {
      if (isInitial) setError(String(e instanceof Error ? e.message : e));
    } finally {
      if (isInitial) setLoading(false); else setLoadingMore(false);
    }
  }, []);

  // MOUNT-ONLY init: pre-warm + restore cached feed. Critical: NO screenH dep
  // — fold/unfold must not re-fetch or re-setItems. Width-only restore happens
  // in the dimension effect below.
  const initialScreenHRef = useRef(screenH);
  useEffect(() => {
    fetch('https://ireader.onrender.com/api/news/sources').catch(() => {});
    AsyncStorage.getItem('@aifeed_cache_v1').then(raw => {
      if (!raw) { loadTopic(0, true); return; }
      try {
        const c = JSON.parse(raw) as { items: FeedItem[]; topicCursor: number; activeIdx: number; at: number };
        if (Date.now() - c.at < 30 * 60_000 && Array.isArray(c.items) && c.items.length > 0) {
          setItems(c.items);
          setTopicCursor(c.topicCursor ?? 0);
          setActiveIdx(c.activeIdx ?? 0);
          setLoading(false);
          setTimeout(() => flatListRef.current?.scrollToOffset({ offset: (c.activeIdx ?? 0) * initialScreenHRef.current, animated: false }), 0);
          return;
        }
      } catch {}
      loadTopic(0, true);
    }).catch(() => loadTopic(0, true));
  }, [loadTopic]);

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

  // Persist feed cache whenever items or activeIdx change.
  useEffect(() => {
    if (items.length === 0) return;
    AsyncStorage.setItem('@aifeed_cache_v1', JSON.stringify({
      items, topicCursor, activeIdx, at: Date.now(),
    })).catch(() => {});
  }, [items, topicCursor, activeIdx]);

  // PUSH-TAP DEEPLINK — re-check on every focus so taps work even when the
  // AIFeedScreen is already mounted (tab switch doesn't remount).
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('@aifeed_pending_open').then(raw => {
      if (!raw) return;
      try {
        const a = JSON.parse(raw) as { id: string; headline: string; summary: string; imageUrl: string; url: string; source: string; publishedAt: string; at: number };
        // Honor pending opens up to 5 min old (covers slow nav + cold start).
        if (Date.now() - a.at <= 5 * 60_000) {
          const story = { id: a.id, headline: a.headline, summary: a.summary, imageUrl: a.imageUrl, publishedAt: a.publishedAt, sources: a.url ? [{ name: a.source, url: a.url }] : [] } as Story;
          setOpenedItem({ primary: story, allStories: [story], sources: a.url ? [{ name: a.source, url: a.url }] : [] });
        }
        AsyncStorage.removeItem('@aifeed_pending_open').catch(() => {});
      } catch {}
    }).catch(() => {});
  }, [setOpenedItem]));

  // FOLD / UNFOLD DEEP-DIVE RESTORATION — mount only. Skip if last write was a
  // close marker, or older than 5 min (only fold/unfold flips count, not
  // resuming the app hours later).
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@aifeed_open_item');
        if (!raw) return;
        const a = JSON.parse(raw) as { id?: string; headline?: string; summary?: string; imageUrl?: string; url?: string; source?: string; publishedAt?: string; at: number; closed?: boolean };
        if (a.closed) return;
        if (!a.id || !a.headline) return;
        if (Date.now() - a.at > 5 * 60_000) return;
        const story = { id: a.id, headline: a.headline, summary: a.summary ?? '', imageUrl: a.imageUrl ?? '', publishedAt: a.publishedAt ?? '', sources: a.url ? [{ name: a.source ?? '', url: a.url }] : [] } as Story;
        setOpenedItemState({ primary: story, allStories: [story], sources: a.url ? [{ name: a.source ?? '', url: a.url }] : [] });
      } catch {}
    })();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setTopicCursor(0);
    setExhausted(false);
    setItems([]);
    await loadTopic(0, true);
    setRefreshing(false);
  }, [loadTopic]);

  const onEndReached = useCallback(() => {
    if (loadingMore || exhausted) return;
    // Stay within the currently-selected topic — no auto-cycle into others.
    loadTopic(topicCursor, false);
  }, [loadingMore, exhausted, topicCursor, loadTopic]);

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
      height={screenH}
      topInset={insets.top}
      onOpen={() => setOpenedItem(item)}
    />
  ), [items.length, screenW, screenH, insets.top, setOpenedItem]);

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
          <Pressable onPress={() => { setLoading(true); loadTopic(0, true); }} style={styles.retryBtn}>
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
          if (idx < 0) return;
          setItems([]);
          setTopicCursor(idx);
          setExhausted(false);
          loadTopic(idx, true);
        }}
      />
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={it => it.primary.id}
        renderItem={renderCard}
        extraData={`${screenW}x${screenH}`}
        pagingEnabled
        snapToInterval={screenH}
        getItemLayout={(_d, i) => ({ length: screenH, offset: screenH * i, index: i })}
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
        <DeepDiveOverlay item={openedItem} onClose={() => setOpenedItem(null)} />
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
function FullPreviewCard({ item, index: _i, total: _t, width: _w, height: _h, topInset, onOpen }: {
  item: FeedItem; index: number; total: number; width: number; height: number; topInset: number; onOpen: () => void;
}) {
  // Always read live window dimensions inside the card — props can lag on
  // foldable resize (fold close especially).
  const { width, height } = useWindowDimensions();
  const story = item.primary;
  const dominant = useMemo(() => getArticleColor(story.id || story.headline), [story.id, story.headline]);
  const accent = useMemo(() => lighten(dominant, 0.55), [dominant]);
  const sourceName = item.sources[0]?.name ?? story.sources?.[0]?.name ?? 'Unknown';
  const extraSources = Math.max(0, item.sources.length - 1);
  const [hasCached, setHasCached] = useState(false);
  useEffect(() => { readDeepDiveCache(story.id).then(d => setHasCached(!!d)); }, [story.id]);

  // Hero zoom-in when card mounts/lands on screen
  const heroScale = useRef(new Animated.Value(1.08)).current;
  useEffect(() => {
    Animated.timing(heroScale, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [heroScale]);

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => ({ width, height, backgroundColor: dominant, overflow: 'hidden', transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      {story.imageUrl ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: heroScale }] }]}>
          <Image
            source={{ uri: story.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        </Animated.View>
      ) : (
        <NoImageFallback dominant={dominant} accent={accent} source={sourceName} url={story.sources?.[0]?.url} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.15)', 'rgba(5,5,7,0.75)', 'rgba(5,5,7,0.95)']}
        locations={[0, 0.25, 0.5, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />

      {hasCached && (
        <View style={[styles.readyBadge, { top: topInset + 56 }]}>
          <Ionicons name="sparkles" size={9} color="#86efac" />
          <Text style={styles.readyText}>READY</Text>
        </View>
      )}

      <CardTextBounce>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: accent }]}>{sourceName.toUpperCase()}</Text>
          {extraSources > 0 && (
            <View style={styles.sourceCountPill}>
              <Text style={styles.sourceCountText}>+{extraSources} {extraSources === 1 ? 'SOURCE' : 'SOURCES'}</Text>
            </View>
          )}
          <Text style={[styles.metaText, { color: 'rgba(255,255,255,0.4)' }]}>·</Text>
          <Text style={[styles.metaText, { color: 'rgba(255,255,255,0.65)' }]}>{timeAgo(story.publishedAt)}</Text>
        </View>
        <Text style={styles.cardHeadline}>{story.headline}</Text>
        {story.summary ? (
          <Text style={styles.cardSummary} numberOfLines={4}>{story.summary}</Text>
        ) : null}
      </CardTextBounce>

      <Text style={styles.swipeHint}>↑ SWIPE FOR NEXT</Text>
    </Pressable>
  );
}

// ── Deep Dive Overlay ──────────────────────────────────────────────────────
function DeepDiveOverlay({ item, onClose }: { item: FeedItem; onClose: () => void }) {
  const story = item.primary;
  const dominant = useMemo(() => getArticleColor(story.id || story.headline), [story.id, story.headline]);
  const accent = useMemo(() => lighten(dominant, 0.55), [dominant]);
  const sourceName = item.sources[0]?.name ?? story.sources?.[0]?.name ?? 'Unknown';
  const extraSources = Math.max(0, item.sources.length - 1);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DeepDiveData | null>(null);
  const [stage, setStage] = useState<'generating' | 'done' | 'error'>('generating');
  const [error, setError] = useState<string | null>(null);
  const [showColdHint, setShowColdHint] = useState(false);

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
        // Check cache first
        const cached = await readDeepDiveCache(story.id);
        if (cached && !cancelled) { setData(cached); setStage('done'); return; }
        setStage('generating');
        const paragraphs = [
          story.headline + '. ' + (story.summary ?? story.headline),
          ...item.allStories.slice(1, 5).filter(s => s.summary && s.summary !== story.summary).map(s => `[${s.sources?.[0]?.name ?? 'Source'}]: ${s.summary}`),
        ];
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 75000);
        let dd: Response;
        try {
          dd = await fetch(DEEPDIVE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: story.sources?.[0]?.url ?? '',
              headline: story.headline,
              paragraphs,
            }),
            signal: ctrl.signal,
          });
        } finally { clearTimeout(t); }
        if (!dd.ok) throw new Error(`Deep Dive ${dd.status}`);
        const json: DeepDiveData = await dd.json();
        if (cancelled) return;
        setData(json);
        await writeDeepDiveCache(story.id, json);
        setStage('done');
      } catch (e) {
        if (cancelled) return;
        setError(String(e instanceof Error ? e.message : e));
        setStage('error');
      }
    })();
    return () => { cancelled = true; };
  }, [story.id, story.headline, story.summary, story.sources, item.allStories]);

  useEffect(() => {
    if (stage !== 'generating') { setShowColdHint(false); return; }
    const t = setTimeout(() => setShowColdHint(true), 5000);
    return () => clearTimeout(t);
  }, [stage]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#050507' }}>
        {/* No top SafeAreaView — image goes edge-to-edge under status bar. */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 60 }} showsVerticalScrollIndicator={false}>
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
                <InlineError text={error || 'Failed'} />
              ) : data ? (
                <>
                  {/* TL;DR — grouped sections if AI emitted them, else flat fallback */}
                  {((data.tldrSections && data.tldrSections.length > 0) || data.tldr.length > 0) && (
                    <Stagger delay={0}><View style={[overlayStyles.card, { borderTopColor: VIOLET, borderTopWidth: 2 }]}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Text style={overlayStyles.sectionLabel}>TL;DR BY CURIOUSCATS.AI</Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {data.tldrSections && data.tldrSections.length > 0 ? (
                        data.tldrSections.map((section, si) => (
                          <View key={si} style={{ marginTop: si > 0 ? 20 : 0, paddingTop: si > 0 ? 16 : 0, borderTopWidth: si > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8, textTransform: 'uppercase' }}>
                              {section.heading}
                            </Text>
                            {section.bullets.map((b, i) => (
                              <View key={i} style={[overlayStyles.bulletRow, i > 0 && overlayStyles.bulletDivider]}>
                                <View style={overlayStyles.bulletDot} />
                                <Text style={overlayStyles.bulletText}>
                                  {renderHighlighted(b, allTags(data))}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ))
                      ) : (
                        data.tldr.map((b, i) => (
                          <View key={i} style={[overlayStyles.bulletRow, i > 0 && overlayStyles.bulletDivider]}>
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
                      <Text style={overlayStyles.insightText}>{data.insight}</Text>
                    </View></Stagger>
                  )}

                  {/* Story */}
                  {data.narrative && (
                    <Stagger delay={160}><View style={{ marginTop: 4 }}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Text style={overlayStyles.sectionLabel}>CURIOUSCATS FULL STORY</Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {data.narrative.split(/\n\n+/).map((p, i) => (
                        <Text key={i} style={overlayStyles.narrativePara}>
                          {renderHighlighted(p, allTags(data))}
                        </Text>
                      ))}
                    </View></Stagger>
                  )}

                  {/* Follow the Story */}
                  {(data.keyPeople?.length || data.keyCompanies?.length || data.topics?.length) ? (
                    <Stagger delay={240}><View style={{ marginTop: 4 }}>
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

                  {/* Curious? Questions */}
                  {data.questions.length > 0 && (
                    <Stagger delay={320}><View style={{ marginTop: 4 }}>
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
                        />
                      ))}
                    </View></Stagger>
                  )}

                  {/* Sources */}
                  {item.sources.length > 0 && (
                    <Stagger delay={400}><View style={{ marginTop: 4 }}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Text style={overlayStyles.sectionLabel}>
                          COVERED BY <TickNumber to={item.sources.length} /> {item.sources.length === 1 ? 'SOURCE' : 'SOURCES'}
                        </Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {item.sources.slice(0, 8).map((s, i) => (
                        <Pressable
                          key={i}
                          onPress={() => s.url && WebBrowser.openBrowserAsync(s.url).catch(() => {})}
                          style={overlayStyles.sourceRow}
                        >
                          <Text style={overlayStyles.sourceName}>{s.name}</Text>
                          <Text style={[overlayStyles.sourceArrow, { color: VIOLET }]}>↗</Text>
                        </Pressable>
                      ))}
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
          <View style={overlayStyles.brandPill}>
            <Ionicons name="sparkles" size={11} color={VIOLET} />
            <Text style={[overlayStyles.brandText, { color: VIOLET }]}>AI DEEP DIVE</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Q&A item with inline expand ─────────────────────────────────────────────
function QuestionItem({ question, story, narrative }: {
  question: string; story: Story; narrative?: string;
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
        <Text style={overlayStyles.questionText}>{question}</Text>
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
            <Text style={overlayStyles.answerText}>{answer}</Text>
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
    Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: false })).start();
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

function NoImageFallback({ dominant, accent, source, url }: {
  dominant: string; accent: string; source: string; url?: string;
}) {
  const mapped = getSourceDomain(source);
  const fromUrl = domainFromUrl(url);
  const domain = mapped || fromUrl;
  const faviconUri = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : '';
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[lighten(dominant, 0.25), dominant, darken(dominant, 0.3)]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <LinearGradient
        colors={['transparent', accent + '22', 'transparent']}
        locations={[0.35, 0.55, 0.75]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={{
        position: 'absolute', left: 0, right: 0, top: '18%',
        alignItems: 'center', gap: 10, padding: 24,
      }}>
        <View style={{
          width: 72, height: 72, borderRadius: 36,
          borderWidth: 2, borderColor: accent + 'AA',
          backgroundColor: 'rgba(0,0,0,0.25)',
          overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
        }}>
          {faviconUri ? (
            <Image source={{ uri: faviconUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Text style={{ color: accent, fontSize: 28, fontWeight: '800' }}>
              {(source ?? '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ width: 28, height: 1, backgroundColor: accent + '55' }} />
        <Text style={{ color: accent + 'CC', fontSize: 9, fontWeight: '700', letterSpacing: 1.6 }}>
          NO PREVIEW
        </Text>
      </View>
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

function InlineError({ text }: { text: string }) {
  return (
    <View style={overlayStyles.errorCard}>
      <Text style={{ color: '#ff8888', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>Couldn't generate</Text>
      <Text style={{ color: '#aaa', fontSize: 11 }}>{text}</Text>
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
  bulletRow: { flexDirection: 'row', gap: 14, paddingVertical: 14, alignItems: 'flex-start' },
  bulletDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.05)' },
  bulletDot: { width: 6, height: 6, borderRadius: 4, marginTop: 10, backgroundColor: VIOLET },
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

  narrativePara: { color: '#c8c8d4', fontSize: 16, lineHeight: 27, marginBottom: 20 },

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
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 12, marginBottom: 8,
    backgroundColor: 'rgba(185,148,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(185,148,255,0.12)',
  },
  sourceName: { flex: 1, color: '#e8e8e8', fontSize: 13, fontWeight: '600' },
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
