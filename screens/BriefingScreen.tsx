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
const COUNT_OPTIONS = [5, 10, 15, 20, 25, 30] as const;
const COUNT_KEY = '@briefing_count';
const WINDOW_KEY = '@briefing_window';
const SUMMARIES_KEY = '@briefing_summaries';

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
function cacheKeyFor(h: WindowHours, area: string, count: number) {
  return `${CACHE_PREFIX}${todayKey()}_${h}h_${area}_${count}`;
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

async function fetchBriefing(
  h: WindowHours, force: boolean, signal: AbortSignal,
  summaries = true, area = 'all', count = TARGET_COUNT,
): Promise<Snapshot> {
  const res = await fetch(
    `${BRIEFING_API}?window=${h}&area=${area}&count=${count}${force ? '&refresh=1' : ''}${summaries ? '' : '&summaries=0'}`,
    { signal },
  );
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

function BriefingCard({ item, onOpen, showSummary }: { item: RankedItem; onOpen: (i: RankedItem) => void; showSummary: boolean }) {
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

      {/* With AI summaries off the card shows the source's own text and says
          so — labelling it "AI SUMMARY · not written yet" would describe work
          nobody asked to be done. */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>
          {showSummary ? 'AI SUMMARY' : 'FROM THE SOURCE'}
          {showSummary && !item.aiSummary ? '  ·  writing…' : ''}
        </Text>
        {showSummary && item.aiSummary ? (
          <Text style={styles.summaryText}>{item.aiSummary}</Text>
        ) : (
          <Text style={styles.summaryFallback}>
            {item.summary ? item.summary.slice(0, 280) : 'No summary available.'}
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
  // Deliberately separate from areaFilter. Driving the trend off the card
  // filter meant the only way to read the Tech trend was to filter the list to
  // Tech, which is both undiscoverable and limiting — you may well want the
  // Tech read while still looking at all thirty cards.
  // Off means the server skips generation (summaries=0), not that we hide
  // text it already paid to write — otherwise the toggle saves nothing.
  const [summariesOn, setSummariesOn] = useState(true);
  const [count, setCount] = useState<number>(TARGET_COUNT);
  const [infoOpen, setInfoOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const summariesOnRef = useRef(summariesOn);
  useEffect(() => { summariesOnRef.current = summariesOn; }, [summariesOn]);
  const countRef = useRef(count);
  useEffect(() => { countRef.current = count; }, [count]);

  const load = useCallback(async (hours: WindowHours, force: boolean, area = 'all') => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    const key = cacheKeyFor(hours, area, countRef.current);

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
      const snap = await fetchBriefing(hours, force, ctrl.signal, summariesOnRef.current, area, countRef.current);
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
      const savedCount = Number(await AsyncStorage.getItem(COUNT_KEY));
      if ((COUNT_OPTIONS as readonly number[]).includes(savedCount)) { setCount(savedCount); countRef.current = savedCount; }
      const savedSummaries = await AsyncStorage.getItem(SUMMARIES_KEY);
      if (savedSummaries === '0') { setSummariesOn(false); summariesOnRef.current = false; }
      const saved = Number(await AsyncStorage.getItem(WINDOW_KEY));
      const h = (WINDOW_OPTIONS as readonly number[]).includes(saved) ? (saved as WindowHours) : DEFAULT_WINDOW;
      setWindowHours(h);
      load(h, false, 'all');
    })();
    return () => abortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Summaries arrive after the ranking, so look again while the server says it
  // is still filling. Stops as soon as it is done; a warm read is ~0.2s.
  useEffect(() => {
    if (!snapshot || snapshot.complete !== false) return;
    const t = setTimeout(() => { load(windowHours, false, areaFilter); }, 15000);
    return () => clearTimeout(t);
  }, [snapshot, windowHours, load]);

  const pickWindow = useCallback((h: WindowHours) => {
    if (h === windowHours) return;
    setWindowHours(h);
    AsyncStorage.setItem(WINDOW_KEY, String(h)).catch(() => {});
    load(h, false, areaFilter);
  }, [windowHours, areaFilter, load]);

  const toggleSummaries = useCallback(() => {
    const next = !summariesOn;
    setSummariesOn(next);
    summariesOnRef.current = next;
    AsyncStorage.setItem(SUMMARIES_KEY, next ? '1' : '0').catch(() => {});
    // Turning them on has to re-ask, or the server never starts writing.
    if (next) load(windowHours, false, areaFilter);
  }, [summariesOn, windowHours, areaFilter, load]);

  const pickCount = useCallback((n: number) => {
    if (n === count) return;
    setCount(n);
    countRef.current = n;
    AsyncStorage.setItem(COUNT_KEY, String(n)).catch(() => {});
    load(windowHours, false, areaFilter);
  }, [count, windowHours, areaFilter, load]);

  const regenerate = useCallback(() => {
    AsyncStorage.removeItem(cacheKeyFor(windowHours, areaFilter, count)).catch(() => {});
    load(windowHours, true, areaFilter);
  }, [windowHours, areaFilter, load]);

  /** A category is its own briefing — thirty stories ranked within it — not a
   *  filter over the mixed thirty, so changing it refetches. */
  const pickArea = useCallback((area: string) => {
    if (area === areaFilter) return;
    setAreaFilter(area);
    load(windowHours, false, area);
  }, [areaFilter, windowHours, load]);

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
  // No client-side filtering: the server already returned this category's
  // briefing.
  const visibleItems = snapshot?.items ?? [];
  const busy = phase === 'loading' || phase === 'revalidating' || phase === 'rebuilding';
  const pendingCount = snapshot?.items.filter(i => !i.aiSummary).length ?? 0;
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
        {/* 0 — header. Everything above the cards used to be five stacked
            boxes (window block, trend, status, pending, meta), which is what
            made the screen feel scattered. Now: header, one control row, the
            sticky filter, one status line. Nothing was
            dropped — the ranking explanation moved behind "how ranking
            works", and the per-card factor bars already carried it. */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Briefing for the day</Text>
            <Text style={styles.subtitle}>
              {greeting()} — {areaFilter === 'all'
                ? `top ${total || count} across ${AREAS.length} areas`
                : `top ${total} in ${AREA_BY_KEY[areaFilter]?.label ?? areaFilter}, ranked`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={busy ? () => abortRef.current?.abort() : regenerate}
            style={[styles.iconBtn, busy && styles.iconBtnBusy]}
            activeOpacity={0.8}
          >
            {busy ? <ActivityIndicator size="small" color="#FF8F86" />
                  : <Ionicons name="refresh" size={15} color="#4A90D9" />}
          </TouchableOpacity>
        </View>

        {/* 1 — one control row: window, then the summaries switch */}
        <View style={styles.controlRow}>
          <View style={styles.segment}>
            {WINDOW_OPTIONS.map(h => {
              const active = h === windowHours;
              return (
                <TouchableOpacity
                  key={h}
                  onPress={() => pickWindow(h)}
                  style={[styles.segItem, active && styles.segItemOn]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segText, active && styles.segTextOn]}>{h}h</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.segment}>
            {COUNT_OPTIONS.map(n => {
              const active = n === count;
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => pickCount(n)}
                  style={[styles.segItem, active && styles.segItemCount]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segText, active && { color: '#30D158' }]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={toggleSummaries}
            style={[styles.sumToggle, summariesOn && styles.sumToggleOn]}
            activeOpacity={0.8}
          >
            <View style={[styles.switchTrack, summariesOn && styles.switchTrackOn]}>
              <View style={[styles.switchKnob, summariesOn && styles.switchKnobOn]} />
            </View>
            <Text style={[styles.sumToggleText, summariesOn && { color: '#30D158' }]}>AI summaries</Text>
          </TouchableOpacity>
        </View>

        {/* 2 — category filter (sticky) */}
        <View style={styles.categoryBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
            {/* Always every category: these switch between briefings now, so
                hiding one the CURRENT briefing lacks would make it
                unreachable. The count is this briefing's size. */}
            {[{ key: 'all', label: 'All', accent: '#4A90D9' }, ...AREAS]
              .map(a => {
                const active = areaFilter === a.key;
                const count = active ? total : null;
                return (
                  <TouchableOpacity
                    key={a.key}
                    onPress={() => pickArea(a.key)}
                    activeOpacity={0.8}
                    style={[
                      styles.catChip,
                      { borderColor: active ? a.accent : 'rgba(255,255,255,0.09)',
                        backgroundColor: active ? `${a.accent}26` : '#0E0E0E' },
                    ]}
                  >
                    <Text style={[styles.catChipText, { color: active ? a.accent : '#8A8A8E' }]}>{a.label}</Text>
                    {count !== null ? (
                      <View style={[styles.catCount, { backgroundColor: 'rgba(0,0,0,0.28)' }]}>
                        <Text style={[styles.catCountText, { color: a.accent }]}>{count}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </View>

        {/* 4 — one status line replaces the status, pending and meta boxes */}
        <View style={styles.statusLine}>
          {busy ? (
            <Text style={styles.statusBusy}>
              {phase === 'rebuilding' ? 'Rebuilding…' : phase === 'revalidating' ? 'Checking…' : 'Building…'}
            </Text>
          ) : null}
          {snapshot ? (
            <Text style={styles.statusText}>
              Built {new Date(snapshot.builtAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              {'  ·  '}{snapshot.poolSize} candidates
              {summariesOn && total > 0
                ? `  ·  ${total - pendingCount}/${total} summaries${snapshot.complete === false ? ' — still writing' : ''}`
                : !summariesOn ? '  ·  summaries off' : ''}
            </Text>
          ) : null}
          <TouchableOpacity onPress={() => setInfoOpen(v => !v)} hitSlop={6}>
            <Text style={styles.statusLink}>{infoOpen ? 'hide ranking' : 'how ranking works'}</Text>
          </TouchableOpacity>
        </View>

        {infoOpen ? (
          <Text style={styles.infoText}>
            Each story scores out of 100: corroboration {W_CORROBORATION} (how many outlets ran it),
            source weight {W_SOURCE}, freshness {W_FRESHNESS}, editorial signal {W_SIGNAL}.
            Tap any “why” row on a card for its breakdown.
          </Text>
        ) : null}

        {error ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        ) : null}

        {visibleItems.map(item => (
          <BriefingCard key={`${item.id}-${item.rank}`} item={item} onOpen={openArticle} showSummary={summariesOn} />
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
  iconBtn: {
    flexShrink: 0, width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(74,144,217,0.14)', borderWidth: 1, borderColor: 'rgba(74,144,217,0.35)',
  },
  iconBtnBusy: { backgroundColor: 'rgba(255,69,58,0.12)', borderColor: 'rgba(255,69,58,0.4)' },

  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 },
  segment: {
    flexDirection: 'row', backgroundColor: '#0E0E0E', borderRadius: 999, padding: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  segItem: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
  segItemOn: { backgroundColor: 'rgba(74,144,217,0.22)' },
  segItemCount: { backgroundColor: 'rgba(48,209,88,0.20)' },
  segText: { color: '#6E6E73', fontSize: 11, fontWeight: '700' },
  segTextOn: { color: '#4A90D9' },

  sumToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#0E0E0E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 999, paddingLeft: 7, paddingRight: 11, paddingVertical: 5,
  },
  sumToggleOn: { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: 'rgba(48,209,88,0.35)' },
  sumToggleText: { color: '#6E6E73', fontSize: 11, fontWeight: '700' },
  switchTrack: {
    width: 26, height: 15, borderRadius: 999, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  switchTrackOn: { backgroundColor: 'rgba(48,209,88,0.35)' },
  switchKnob: {
    width: 11, height: 11, borderRadius: 999, marginLeft: 2, backgroundColor: '#8A8A8E',
  },
  switchKnobOn: { marginLeft: 13, backgroundColor: '#30D158' },

  statusLine: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14,
  },
  statusBusy: { color: '#4A90D9', fontSize: 10, fontWeight: '700' },
  statusText: { color: '#5A5A5E', fontSize: 10, lineHeight: 15 },
  statusLink: { color: '#4A90D9', fontSize: 10 },
  infoText: { color: '#6E6E73', fontSize: 10.5, lineHeight: 16, marginBottom: 14 },



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


  errorBox: {
    backgroundColor: 'rgba(255,69,58,0.08)', borderWidth: 1, borderColor: 'rgba(255,69,58,0.25)',
    borderRadius: 14, padding: 13, marginBottom: 14,
  },
  errorText: { color: '#FF9F96', fontSize: 11.5, lineHeight: 17 },

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
