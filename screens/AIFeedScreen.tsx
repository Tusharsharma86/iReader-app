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
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Story } from '../components/StoryCard';
import { tabBarTranslateY, useTabBarAutoHide } from '../utils/tabBarAnim';
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
interface DeepDiveData {
  tldr: string[];
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
  const [openedItem, setOpenedItem] = useState<FeedItem | null>(null);
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
        if (topicIdx + 1 < TOPIC_QUEUE.length) {
          setTopicCursor(topicIdx + 1);
          loadTopic(topicIdx + 1, false);
          return;
        }
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

  useEffect(() => {
    // Pre-warm Render
    fetch('https://ireader.onrender.com/api/news/sources').catch(() => {});
    loadTopic(0, true);
  }, [loadTopic]);

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
    const next = topicCursor + 1;
    if (next < TOPIC_QUEUE.length) {
      setTopicCursor(next);
      loadTopic(next, false);
    } else {
      setExhausted(true);
    }
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
  ), [items.length, screenW, screenH, insets.top]);

  if (loading && items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header topInset={insets.top} />
        <View style={styles.centered}>
          <ActivityIndicator color={VIOLET} />
          <Text style={styles.loadingText}>Loading breaking news…</Text>
        </View>
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
      <Header topInset={insets.top} counter={items.length > 0 ? `${activeIdx + 1} / ${items.length}` : undefined} />
      <FlatList
        data={items}
        keyExtractor={it => it.primary.id}
        renderItem={renderCard}
        pagingEnabled
        snapToInterval={screenH}
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
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🎉</Text>
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
function Header({ topInset, counter }: { topInset: number; counter?: string }) {
  return (
    <View style={[styles.header, { paddingTop: topInset + 10 }]} pointerEvents="box-none">
      <View style={styles.pill}>
        <Ionicons name="sparkles" size={11} color={VIOLET} />
        <Text style={styles.pillText}>AI FEED · BREAKING</Text>
      </View>
      {counter && (
        <View style={[styles.pill, { paddingHorizontal: 10 }]}>
          <Text style={[styles.pillText, { letterSpacing: 0.6, color: '#aaa' }]}>{counter}</Text>
        </View>
      )}
    </View>
  );
}

// ── Full-bleed card ─────────────────────────────────────────────────────────
function FullPreviewCard({ item, index: _i, total: _t, width, height, topInset, onOpen }: {
  item: FeedItem; index: number; total: number; width: number; height: number; topInset: number; onOpen: () => void;
}) {
  const story = item.primary;
  const dominant = useMemo(() => getArticleColor(story.id || story.headline), [story.id, story.headline]);
  const accent = useMemo(() => lighten(dominant, 0.55), [dominant]);
  const sourceName = item.sources[0]?.name ?? story.sources?.[0]?.name ?? 'Unknown';
  const extraSources = Math.max(0, item.sources.length - 1);
  const [hasCached, setHasCached] = useState(false);
  useEffect(() => { readDeepDiveCache(story.id).then(d => setHasCached(!!d)); }, [story.id]);

  return (
    <Pressable onPress={onOpen} style={{ width, height, backgroundColor: dominant }}>
      {story.imageUrl ? (
        <Image
          source={{ uri: story.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <LinearGradient
          colors={[lighten(dominant, 0.2), dominant, darken(dominant, 0.4)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
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

      <View style={styles.cardTextBlock}>
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
      </View>

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
        const t = setTimeout(() => ctrl.abort(), 30000);
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
          <View style={{ height: 360, position: 'relative', backgroundColor: dominant }}>
            {story.imageUrl ? (
              <Image source={{ uri: story.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={[lighten(dominant, 0.2), dominant, darken(dominant, 0.4)]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
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
                  {/* TL;DR */}
                  {data.tldr.length > 0 && (
                    <View style={[overlayStyles.card, { borderTopColor: VIOLET, borderTopWidth: 2 }]}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Text style={overlayStyles.sectionLabel}>TL;DR BY CURIOUSCATS.AI</Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {data.tldr.map((b, i) => (
                        <View key={i} style={[overlayStyles.bulletRow, i > 0 && overlayStyles.bulletDivider]}>
                          <View style={overlayStyles.bulletDot} />
                          <Text style={overlayStyles.bulletText}>
                            {renderHighlighted(b, allTags(data))}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Key Insight (gold) */}
                  {data.insight && (
                    <View style={overlayStyles.insightCard}>
                      <View style={overlayStyles.insightBar} />
                      <Text style={overlayStyles.insightLabel}>KEY INSIGHT</Text>
                      <Text style={overlayStyles.insightText}>{data.insight}</Text>
                    </View>
                  )}

                  {/* Story */}
                  {data.narrative && (
                    <View style={{ marginTop: 4 }}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Text style={overlayStyles.sectionLabel}>CURIOUSCATS FULL STORY</Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {data.narrative.split(/\n\n+/).map((p, i) => (
                        <Text key={i} style={overlayStyles.narrativePara}>
                          {renderHighlighted(p, allTags(data))}
                        </Text>
                      ))}
                    </View>
                  )}

                  {/* Follow the Story */}
                  {(data.keyPeople?.length || data.keyCompanies?.length || data.topics?.length) ? (
                    <View style={{ marginTop: 4 }}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Ionicons name="sparkles" size={11} color={VIOLET} />
                        <Text style={[overlayStyles.sectionLabel, { marginLeft: 6 }]}>FOLLOW THE STORY</Text>
                        <View style={overlayStyles.labelDivider} />
                      </View>
                      {!!data.keyPeople?.length && <EntityBlock label="KEY PEOPLE" items={data.keyPeople} />}
                      {!!data.keyCompanies?.length && <EntityBlock label="KEY ORGANIZATIONS" items={data.keyCompanies} />}
                      {!!data.topics?.length && <EntityBlock label="TOPICS" items={data.topics} subtle />}
                    </View>
                  ) : null}

                  {/* Curious? Questions */}
                  {data.questions.length > 0 && (
                    <View style={{ marginTop: 4 }}>
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
                    </View>
                  )}

                  {/* Sources */}
                  {item.sources.length > 0 && (
                    <View style={{ marginTop: 4 }}>
                      <View style={overlayStyles.sectionLabelRow}>
                        <Text style={overlayStyles.sectionLabel}>
                          COVERED BY {item.sources.length} {item.sources.length === 1 ? 'SOURCE' : 'SOURCES'}
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
                    </View>
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
              <ActivityIndicator size="small" color={VIOLET} />
              <Text style={{ color: '#888', fontSize: 12 }}>Thinking…</Text>
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
    <View style={overlayStyles.loaderCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ActivityIndicator size="small" color={VIOLET} />
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
  if (!tags || tags.length === 0) return [text];
  const escaped = tags.sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  const parts = text.split(re);
  return parts.map((p, i) => i % 2 === 1
    ? <Text key={i} style={{ color: '#fff', fontWeight: '700' }}>{p}</Text>
    : p);
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
