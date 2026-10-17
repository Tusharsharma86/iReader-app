import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FeedStackParamList } from '../types/navigation';
import { trackArticleOpen } from '../utils/personalization';
import { getArticleColor } from '../utils/colors';
import { useTabBarAutoHide } from '../utils/tabBarAnim';

const BRIEFING_API = 'https://ireader.onrender.com/api/news/briefing';
const TREND_API = 'https://ireader.onrender.com/api/news/briefing/trend';
const CACHE_PREFIX = '@briefing_v2_';

/** Display metadata only. Ranking, filtering, batching and summarising all
 *  happen server-side — this screen is a fetch and a render. The web client
 *  originally did all of it here: six feed fetches plus thirty AI calls PER
 *  DEVICE, 60-120s per open. One GET now returns a briefing built once and
 *  shared by every device and both platforms. */
const AREAS = [
  { key: 'breaking', label: 'Breaking', accent: '#FF453A' },
  { key: 'india', label: 'India', accent: '#FF9F0A' },
  { key: 'world', label: 'World', accent: '#64D2FF' },
  { key: 'markets', label: 'Markets', accent: '#30D158' },
  { key: 'tech', label: 'Tech', accent: '#BF5AF2' },
  { key: 'business', label: 'Business', accent: '#5E5CE6' },
] as const;
const AREA_BY_KEY = Object.fromEntries(AREAS.map(a => [a.key, a])) as Record<
  string,
  { key: string; label: string; accent: string }
>;

const WINDOW_OPTIONS = [6, 12, 24, 48, 72] as const;
type WindowHours = (typeof WINDOW_OPTIONS)[number];
const DEFAULT_WINDOW: WindowHours = 24;
const TARGET_COUNT = 30;
const WINDOW_KEY = '@briefing_window';

// Shown in the header so the ranking is legible. Mirrors the server's
// constants; this is display copy, not the scoring itself.
const W_CORROBORATION = 45, W_SOURCE = 22, W_FRESHNESS = 18, W_SIGNAL = 15;

interface Factor {
  key: 'corroboration' | 'source' | 'freshness' | 'signal';
  label: string;
  detail: string;
  points: number;
  max: number;
}

interface RankedItem {
  id: string;
  rank: number;
  area: string;
  score: number;
  factors: Factor[];
  why: string;
  outlets: number;
  hoursOld: number;
  headline: string;
  summary: string;
  imageUrl: string | null;
  publishedAt: string;
  sourceName: string;
  url: string;
  sources?: { name: string; url: string; imageUrl?: string; publishedAt: string }[];
  aiSummary: string;
  summaryFailed: boolean;
}

interface Snapshot {
  builtAt: number;
  windowHours: WindowHours;
  items: RankedItem[];
  poolSize: number;
  // The server answers with the ranked list straight away and writes the
  // summaries behind it, so a response can be usable but not yet finished.
  complete?: boolean;
  filled?: number;
  total?: number;
  filling?: boolean;
}

// Survives unmount. React Navigation keeps tab screens mounted, but a stack
// push to Article can still tear this down on low-memory devices; holding the
// snapshot here means coming back never re-fetches.
let memSnapshot: { key: string; snap: Snapshot } | null = null;
const MEM_FRESH_MS = 10 * 60 * 1000;

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function cacheKeyFor(h: WindowHours) {
  return `${CACHE_PREFIX}${todayKey()}_${h}h`;
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function agoLabel(hours: number): string {
  if (!Number.isFinite(hours)) return 'undated';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function fetchBriefing(h: WindowHours, force: boolean, signal: AbortSignal): Promise<Snapshot> {
  const res = await fetch(`${BRIEFING_API}?window=${h}${force ? '&refresh=1' : ''}`, { signal });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = ((await res.json()) as { error?: string }).error ?? detail; } catch { /* keep status */ }
    throw new Error(detail);
  }
  const data = (await res.json()) as Snapshot;
  if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('Briefing came back empty');
  return data;
}

// ───────────────────────────────────────────────────────────── factor bars

function FactorBars({ factors }: { factors: Factor[] }) {
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      {factors.map(f => (
        <View key={f.key} style={styles.factorRow}>
          <Text style={styles.factorLabel}>{f.label}</Text>
          <View style={styles.factorTrack}>
            <View style={[styles.factorFill, { width: `${Math.round((f.points / f.max) * 100)}%` }]} />
          </View>
          <Text style={styles.factorDetail} numberOfLines={1}>{f.detail}</Text>
        </View>
      ))}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────── the card

function BriefingCard({ item, onOpen }: { item: RankedItem; onOpen: (i: RankedItem) => void }) {
  const [showFactors, setShowFactors] = useState(false);
  const accent = AREA_BY_KEY[item.area]?.accent ?? '#4A90D9';
  const label = AREA_BY_KEY[item.area]?.label ?? item.area;

  return (
    <View style={styles.card}>
      <Pressable onPress={() => onOpen(item)} android_ripple={{ color: 'rgba(255,255,255,0.06)' }}>
        <View style={styles.hero}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} />
          ) : null}
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.88)']}
            locations={[0, 0.32, 0.62, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.rankBadge, { borderColor: accent }]}>
            <Text style={styles.rankText}>{item.rank}</Text>
          </View>
          <View style={[styles.areaPill, { backgroundColor: `${accent}D9` }]}>
            <Text style={styles.areaPillText}>{label.toUpperCase()}</Text>
          </View>
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaText} numberOfLines={1}>
              {item.sourceName.toUpperCase()}
              {item.sourceName ? '  ·  ' : ''}{agoLabel(item.hoursOld)}
              {item.outlets > 1 ? `  ·  ${item.outlets} outlets` : ''}
            </Text>
          </View>
        </View>
        <Text style={styles.headline}>{item.headline}</Text>
      </Pressable>

      <TouchableOpacity activeOpacity={0.8} onPress={() => setShowFactors(v => !v)} style={styles.whyBox}>
        <View style={styles.whyTop}>
          <Text style={styles.whyLabel}>WHY #{item.rank} · {Math.round(item.score)}/100</Text>
          <Ionicons name={showFactors ? 'chevron-up' : 'chevron-down'} size={12} color="#4A90D9" />
        </View>
        <Text style={styles.whyText}>{item.why}</Text>
        {showFactors ? <FactorBars factors={item.factors} /> : null}
      </TouchableOpacity>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>
          AI SUMMARY{!item.aiSummary && !item.summaryFailed ? '  ·  writing…' : ''}
        </Text>
        {item.aiSummary ? (
          <Text style={styles.summaryText}>{item.aiSummary}</Text>
        ) : (
          <Text style={styles.summaryFallback}>
            {item.summary
              ? `${item.summary.slice(0, 260)} (source text — AI summary not written yet)`
              : 'Summary not available yet.'}
          </Text>
        )}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────── the screen

export default function BriefingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FeedStackParamList>>();
  const { onScroll } = useTabBarAutoHide();

  const [windowHours, setWindowHours] = useState<WindowHours>(DEFAULT_WINDOW);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'revalidating' | 'rebuilding' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string>('all');
  // Keyed by area, so switching filters shows that area's trend rather than
  // re-requesting one you already generated.
  const [trends, setTrends] = useState<Record<string, string>>({});
  const [trendBusy, setTrendBusy] = useState<string | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (hours: WindowHours, force: boolean) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    const key = cacheKeyFor(hours);

    // Returning to the tab with a recent, finished copy costs no request.
    if (!force && memSnapshot?.key === key && memSnapshot.snap.complete !== false
        && Date.now() - memSnapshot.snap.builtAt < MEM_FRESH_MS) {
      setSnapshot(memSnapshot.snap);
      setPhase('done');
      return;
    }

    // Paint what we already have, including during an explicit rebuild —
    // blanking the list for the ~20s a rebuild takes reads as a crash.
    let painted = false;
    const fromMem = memSnapshot?.key === key ? memSnapshot.snap : null;
    if (fromMem) { setSnapshot(fromMem); painted = true; }
    else {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed: Snapshot = JSON.parse(raw);
          if (parsed.items?.length) { setSnapshot(parsed); painted = true; }
        }
      } catch { /* ignore a bad cache entry */ }
    }

    setPhase(force ? 'rebuilding' : painted ? 'revalidating' : 'loading');
    if (!painted) setSnapshot(null);

    try {
      const snap = await fetchBriefing(hours, force, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setSnapshot(snap);
      memSnapshot = { key, snap };
      AsyncStorage.setItem(key, JSON.stringify(snap)).catch(() => {});
      setPhase('done');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (!painted) setError(e instanceof Error ? e.message : String(e));
      setPhase('done');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const saved = Number(await AsyncStorage.getItem(WINDOW_KEY));
      const h = (WINDOW_OPTIONS as readonly number[]).includes(saved) ? (saved as WindowHours) : DEFAULT_WINDOW;
      setWindowHours(h);
      load(h, false);
    })();
    return () => abortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Summaries arrive after the ranking, so look again while the server says it
  // is still filling. Stops as soon as it is done; a warm read is ~0.2s.
  useEffect(() => {
    if (!snapshot || snapshot.complete !== false) return;
    const t = setTimeout(() => { load(windowHours, false); }, 15000);
    return () => clearTimeout(t);
  }, [snapshot, windowHours, load]);

  const pickWindow = useCallback((h: WindowHours) => {
    if (h === windowHours) return;
    setWindowHours(h);
    AsyncStorage.setItem(WINDOW_KEY, String(h)).catch(() => {});
    load(h, false);
  }, [windowHours, load]);

  const regenerate = useCallback(() => {
    AsyncStorage.removeItem(cacheKeyFor(windowHours)).catch(() => {});
    load(windowHours, true);
  }, [windowHours, load]);

  /** On demand only: a trend is an AI call, and generating one per category
   *  up front would spend the budget the summaries need. */
  const generateTrend = useCallback(async (area: string, force = false) => {
    setTrendBusy(area);
    setTrendError(null);
    try {
      const res = await fetch(`${TREND_API}?window=${windowHours}&area=${area}${force ? '&refresh=1' : ''}`);
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTrends(prev => ({ ...prev, [area]: data.text! }));
    } catch (e) {
      setTrendError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrendBusy(null);
    }
  }, [windowHours]);

  // A trend describes a specific window; keeping them across a change would
  // caption the new briefing with the old one's reading.
  useEffect(() => { setTrends({}); setTrendError(null); }, [windowHours]);

  const openArticle = useCallback((item: RankedItem) => {
    const sources = item.sources?.length
      ? item.sources
      : item.url
        ? [{ name: item.sourceName, url: item.url, publishedAt: item.publishedAt }]
        : [];
    trackArticleOpen({
      id: item.id,
      headline: item.headline,
      summary: item.summary,
      publishedAt: item.publishedAt,
      imageUrl: item.imageUrl ?? '',
      sources,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    navigation.navigate('Article', {
      id: item.id,
      url: item.url,
      image: item.imageUrl ?? '',
      headline: item.headline,
      summary: item.summary,
      source: item.sourceName,
      publishedAt: item.publishedAt,
      dominantColor: getArticleColor(item.id || item.headline),
      sources: JSON.stringify(sources),
    });
  }, [navigation]);

  const areaCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of snapshot?.items ?? []) c[it.area] = (c[it.area] ?? 0) + 1;
    return c;
  }, [snapshot]);

  // Ranks stay global, so a filtered view can open at #7 — the number says
  // where a story sits in the whole briefing, not in the slice on screen.
  const visibleItems = useMemo(
    () => (snapshot?.items ?? []).filter(i => areaFilter === 'all' || i.area === areaFilter),
    [snapshot, areaFilter],
  );
  const busy = phase === 'loading' || phase === 'revalidating' || phase === 'rebuilding';
  const total = snapshot?.items.length ?? 0;
  const pending = snapshot?.items.filter(i => !i.aiSummary).length ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[2]}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => load(windowHours, false)} tintColor="#4A90D9" />
        }
      >
        {/* 0 — header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Briefing for the day</Text>
            <Text style={styles.subtitle}>
              {greeting()} — {total || TARGET_COUNT} stories, ranked, across {AREAS.length} areas.
            </Text>
          </View>
          <TouchableOpacity
            onPress={busy ? () => abortRef.current?.abort() : regenerate}
            style={[styles.regenBtn, busy && styles.regenBtnBusy]}
            activeOpacity={0.8}
          >
            {busy ? <ActivityIndicator size="small" color="#FF8F86" />
                  : <Ionicons name="refresh" size={13} color="#4A90D9" />}
            <Text style={[styles.regenText, busy && { color: '#FF8F86' }]}>
              {busy ? 'Stop' : 'Regenerate'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 1 — news window */}
        <View style={styles.windowBlock}>
          <Text style={styles.sectionLabel}>NEWS WINDOW</Text>
          <View style={styles.windowRow}>
            {WINDOW_OPTIONS.map(h => {
              const active = h === windowHours;
              return (
                <TouchableOpacity
                  key={h}
                  onPress={() => pickWindow(h)}
                  style={[styles.windowChip, active && styles.windowChipActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.windowChipText, active && styles.windowChipTextActive]}>{h}h</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.hint}>
            Only stories published inside this window are considered, and freshness is scored
            relative to it. Changing the window rebuilds the briefing.
          </Text>
        </View>

        {/* 2 — category tabs (sticky) */}
        <View style={styles.categoryBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
            {[{ key: 'all', label: 'All', accent: '#4A90D9' }, ...AREAS]
              .filter(a => a.key === 'all' || areaCounts[a.key])
              .map(a => {
                const active = areaFilter === a.key;
                const count = a.key === 'all' ? total : (areaCounts[a.key] ?? 0);
                return (
                  <TouchableOpacity
                    key={a.key}
                    onPress={() => setAreaFilter(a.key)}
                    activeOpacity={0.8}
                    style={[
                      styles.catChip,
                      { borderColor: active ? a.accent : 'rgba(255,255,255,0.09)',
                        backgroundColor: active ? `${a.accent}26` : '#0E0E0E' },
                    ]}
                  >
                    <Text style={[styles.catChipText, { color: active ? a.accent : '#8A8A8E' }]}>{a.label}</Text>
                    <View style={[styles.catCount, { backgroundColor: active ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.05)' }]}>
                      <Text style={[styles.catCountText, { color: active ? a.accent : '#5A5A5E' }]}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </View>

        {/* 3 — trend for whatever is selected */}
        {snapshot ? (
          <View style={styles.trendBox}>
            <View style={styles.trendHead}>
              <Ionicons name="pulse-outline" size={13} color="#BF5AF2" />
              <Text style={styles.trendLabel}>
                {areaFilter === 'all'
                  ? 'TREND ACROSS ALL AREAS'
                  : `TREND · ${(AREA_BY_KEY[areaFilter]?.label ?? areaFilter).toUpperCase()}`}
              </Text>
              {trends[areaFilter] && trendBusy !== areaFilter ? (
                <TouchableOpacity onPress={() => generateTrend(areaFilter, true)} hitSlop={8}>
                  <Ionicons name="refresh" size={13} color="#8A8A8E" />
                </TouchableOpacity>
              ) : null}
            </View>

            {trendBusy === areaFilter ? (
              <View style={styles.trendRow}>
                <ActivityIndicator size="small" color="#BF5AF2" />
                <Text style={styles.trendPending}>Reading the through-line…</Text>
              </View>
            ) : trends[areaFilter] ? (
              <Text style={styles.trendText}>{trends[areaFilter]}</Text>
            ) : (
              <>
                <Text style={styles.trendPending}>
                  {areaFilter === 'all'
                    ? 'What connects today’s stories, including threads that cross subject areas.'
                    : `What connects today’s ${(AREA_BY_KEY[areaFilter]?.label ?? areaFilter)} stories.`}
                </Text>
                <TouchableOpacity
                  onPress={() => generateTrend(areaFilter)}
                  style={styles.trendBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.trendBtnText}>Generate trend</Text>
                </TouchableOpacity>
              </>
            )}
            {trendError && trendBusy !== areaFilter && !trends[areaFilter] ? (
              <Text style={styles.trendErr}>{trendError}</Text>
            ) : null}
          </View>
        ) : null}

        {/* 4 — status */}
        {busy ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusTitle}>
              {phase === 'rebuilding' ? 'Rebuilding — this takes about 20s…'
                : phase === 'revalidating' ? 'Checking for a newer briefing…'
                : 'Building today’s briefing…'}
            </Text>
            <Text style={styles.hint}>
              {phase === 'rebuilding'
                ? 'The current briefing stays on screen until the new one is ready.'
                : `Ranking ${TARGET_COUNT} stories. Summaries are written on the server and appear as they land.`}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        ) : null}

        {snapshot && !busy && pending > 0 ? (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>
              {snapshot.complete === false
                ? `${pending} of ${total} summaries are still being written — they appear as they land.`
                : `${pending} of ${total} summaries didn’t come back — those cards show the source text.`}
            </Text>
          </View>
        ) : null}

        {snapshot && !busy ? (
          <View style={styles.metaBox}>
            <Text style={styles.metaText}>
              Built {new Date(snapshot.builtAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} from{' '}
              {snapshot.poolSize} candidate stories · ranked on corroboration {W_CORROBORATION}, source weight{' '}
              {W_SOURCE}, freshness {W_FRESHNESS}, editorial signal {W_SIGNAL}. Tap any “why” row for the breakdown.
            </Text>
          </View>
        ) : null}

        {visibleItems.map(item => (
          <BriefingCard key={`${item.id}-${item.rank}`} item={item} onOpen={openArticle} />
        ))}

        {snapshot && visibleItems.length === 0 ? (
          <Text style={styles.empty}>Nothing in this category for the {snapshot.windowHours}h window.</Text>
        ) : null}

        <View style={{ height: 96 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  scroll: { paddingHorizontal: 16, paddingTop: 6 },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 6, paddingBottom: 14 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: '#8A8A8E', fontSize: 12, marginTop: 3 },
  regenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(74,144,217,0.14)', borderWidth: 1, borderColor: 'rgba(74,144,217,0.35)',
    borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8,
  },
  regenBtnBusy: { backgroundColor: 'rgba(255,69,58,0.12)', borderColor: 'rgba(255,69,58,0.4)' },
  regenText: { color: '#4A90D9', fontSize: 11, fontWeight: '700' },

  windowBlock: { marginBottom: 12 },
  sectionLabel: { color: '#6E6E73', fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginBottom: 7 },
  windowRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  windowChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0E0E0E',
  },
  windowChipActive: { borderColor: 'rgba(74,144,217,0.5)', backgroundColor: 'rgba(74,144,217,0.16)' },
  windowChipText: { color: '#7A7A7E', fontSize: 11.5, fontWeight: '700' },
  windowChipTextActive: { color: '#4A90D9' },
  hint: { color: '#5A5A5E', fontSize: 9.5, lineHeight: 14, marginTop: 7 },

  categoryBar: {
    backgroundColor: '#080808', paddingVertical: 8, marginHorizontal: -16, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', marginBottom: 12,
  },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
  },
  catChipText: { fontSize: 11.5, fontWeight: '700' },
  catCount: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  catCountText: { fontSize: 9.5, fontWeight: '800' },

  trendBox: {
    backgroundColor: 'rgba(191,90,242,0.07)', borderWidth: 1, borderColor: 'rgba(191,90,242,0.22)',
    borderRadius: 14, padding: 13, marginBottom: 14,
  },
  trendHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  trendLabel: { flex: 1, color: '#BF5AF2', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trendText: { color: '#D8D8DD', fontSize: 13, lineHeight: 21 },
  trendPending: { color: '#8A8A8E', fontSize: 11.5, lineHeight: 17 },
  trendErr: { color: '#FF9F96', fontSize: 10.5, lineHeight: 15, marginTop: 7 },
  trendBtn: {
    alignSelf: 'flex-start', marginTop: 10, borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 7,
    backgroundColor: 'rgba(191,90,242,0.16)', borderWidth: 1, borderColor: 'rgba(191,90,242,0.4)',
  },
  trendBtnText: { color: '#BF5AF2', fontSize: 11, fontWeight: '700' },

  statusBox: {
    backgroundColor: '#101010', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 13, marginBottom: 14,
  },
  statusTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
  errorBox: {
    backgroundColor: 'rgba(255,69,58,0.08)', borderWidth: 1, borderColor: 'rgba(255,69,58,0.25)',
    borderRadius: 14, padding: 13, marginBottom: 14,
  },
  errorText: { color: '#FF9F96', fontSize: 11.5, lineHeight: 17 },
  pendingBox: {
    backgroundColor: 'rgba(255,159,10,0.07)', borderWidth: 1, borderColor: 'rgba(255,159,10,0.25)',
    borderRadius: 14, padding: 13, marginBottom: 14,
  },
  pendingText: { color: '#FFC56E', fontSize: 11.5, lineHeight: 17 },
  metaBox: {
    backgroundColor: '#0D0D0D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, padding: 12, marginBottom: 14,
  },
  metaText: { color: '#5A5A5E', fontSize: 9.5, lineHeight: 14 },

  card: {
    backgroundColor: '#101010', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20, overflow: 'hidden', marginBottom: 16,
  },
  hero: { height: 196, backgroundColor: '#1A1A1A' },
  rankBadge: {
    position: 'absolute', top: 12, left: 12, minWidth: 42, height: 42, paddingHorizontal: 8,
    borderRadius: 13, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  areaPill: { position: 'absolute', top: 14, right: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  areaPillText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  heroMeta: { position: 'absolute', left: 14, right: 14, bottom: 11 },
  heroMetaText: { color: 'rgba(255,255,255,0.88)', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3 },
  headline: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 23, letterSpacing: -0.35, paddingHorizontal: 16, paddingTop: 14 },

  whyBox: {
    marginHorizontal: 16, marginTop: 12, backgroundColor: 'rgba(74,144,217,0.07)',
    borderWidth: 1, borderColor: 'rgba(74,144,217,0.18)', borderRadius: 12, padding: 11,
  },
  whyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  whyLabel: { color: '#4A90D9', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  whyText: { color: '#9A9AA0', fontSize: 12, lineHeight: 17 },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factorLabel: { width: 92, color: '#8A8A8E', fontSize: 10, fontWeight: '700' },
  factorTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  factorFill: { height: '100%', borderRadius: 2, backgroundColor: '#4A90D9' },
  factorDetail: { width: 110, color: '#6E6E73', fontSize: 9, textAlign: 'right' },

  summaryBox: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  summaryLabel: { color: '#8A8A8E', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 7 },
  summaryText: { color: '#C7C7CC', fontSize: 13.5, lineHeight: 22 },
  summaryFallback: { color: '#6E6E73', fontSize: 13, lineHeight: 21, fontStyle: 'italic' },

  empty: { color: '#6E6E73', fontSize: 12, textAlign: 'center', paddingVertical: 32 },
});
