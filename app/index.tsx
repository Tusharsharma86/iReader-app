import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Story, StoryCard } from '../components/StoryCard';
import { FeedStackParamList } from '../types/navigation';
import { useSource } from '../contexts/SourceContext';
import { loadCachedFeed, saveFeedCache } from '../utils/feedCache';
import { rankStories } from '../utils/personalization';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CARD_GAP = 12;

function useLayout() {
  const [width, setWidth] = useState(() => Dimensions.get('window').width);

  // onLayout is the only reliable signal on Samsung foldables — Android
  // re-lays out the entire tree on fold/unfold, firing onLayout synchronously
  // with the new dimensions regardless of background/foreground timing.
  const onLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setWidth(w);
  }, []);

  const isTablet = width >= 768;
  const cardWidth = isTablet ? Math.round(width * 0.46) : width - 28;
  return {
    screenWidth: width,
    cardWidth,
    snapInterval: cardWidth + CARD_GAP,
    hPadding: Math.round((width - cardWidth) / 2),
    isTablet,
    onLayout,
  };
}

const API_BASE = 'https://ireader.onrender.com/api/news/feed';
const CLUSTER_LABELS_API = 'https://ireader.onrender.com/api/news/cluster-labels';

const CATEGORIES = [
  { topic: 'breaking',       label: 'Breaking', icon: '🔴', color: '#FF5555' },
  { topic: 'technology',     label: 'Tech',     icon: '💻', color: '#4A90D9' },
  { topic: 'india-politics', label: 'India',    icon: '🇮🇳', color: '#FF9500' },
  { topic: 'geopolitics',    label: 'World',    icon: '🌍', color: '#4ECDC4' },
  { topic: 'markets',        label: 'Markets',  icon: '📈', color: '#22C55E' },
  { topic: 'business',       label: 'Business', icon: '💼', color: '#A29BFE' },
] as const;

type CategoryTopic = typeof CATEGORIES[number]['topic'];

const PREFERRED_SOURCES = ['TechCrunch', 'The Verge', 'Ars Technica', 'Wired'];

const SOURCE_DOMAINS: Record<string, string> = {
  // Tech
  'TechCrunch': 'techcrunch.com',
  'The Verge': 'theverge.com',
  'Ars Technica': 'arstechnica.com',
  'Wired': 'wired.com',
  'Hacker News': 'news.ycombinator.com',
  '9to5Mac': '9to5mac.com',
  '9to5Google': '9to5google.com',
  'MIT Tech Review': 'technologyreview.com',
  'Engadget': 'engadget.com',
  'VentureBeat': 'venturebeat.com',
  'The Next Web': 'thenextweb.com',
  // World
  'BBC World': 'bbc.co.uk',
  'NYT World': 'nytimes.com',
  'The Guardian': 'theguardian.com',
  'NPR World': 'npr.org',
  'Al Jazeera': 'aljazeera.com',
  // Indian
  'Indian Express': 'indianexpress.com',
  'Indian Express World': 'indianexpress.com',
  'Indian Express Tech': 'indianexpress.com',
  'Economic Times': 'economictimes.indiatimes.com',
  'MoneyControl': 'moneycontrol.com',
  'Livemint': 'livemint.com',
  'Mint': 'livemint.com',
  'CNBC TV18': 'cnbctv18.com',
  'The Quint': 'thequint.com',
  'Inc42': 'inc42.com',
  'Scroll.in': 'scroll.in',
  'NDTV': 'ndtv.com',
  'India Today': 'indiatoday.in',
  'The Print': 'theprint.in',
};

function faviconUrl(sourceName: string): string | null {
  const domain = SOURCE_DOMAINS[sourceName];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function breakingTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr${hrs !== 1 ? 's' : ''} ago`;
}

interface Section {
  title: string;
  stories: Story[];
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

const DEVANAGARI_RE = /[ऀ-ॿ]/;
const BLOCKED_TOPICS_RE = /\b(cricket|ipl|bcci|test match|odi|t20i?|football|fifa|tennis|wimbledon|formula[- ]1|f1 race|chess|olympics|hockey|badminton|icc|world cup|bollywood|movie|film|actor|actress|celebrity|box office|trailer|oscar|grammy|award show|web series|ott platform)\b/i;

const TAG_COLORS = [
  { bg: 'rgba(255,107,107,0.18)', text: '#FF6B6B' },
  { bg: 'rgba(78,205,196,0.18)', text: '#4ECDC4' },
  { bg: 'rgba(255,209,102,0.18)', text: '#FFD166' },
  { bg: 'rgba(150,206,180,0.18)', text: '#96CEB4' },
  { bg: 'rgba(162,155,254,0.18)', text: '#A29BFE' },
];

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','has','have','had',
  'will','would','could','should','this','that','these','those','with',
  'from','for','and','but','or','in','on','at','to','of','its','it','as',
  'by','up','out','about','into','than','more','new','says','said','after',
  'before','over','after','what','when','who','how','why','also','just',
  'first','being','their','they','his','her','one','two','three','all',
]);

function extractKeywords(stories: Story[]): string[] {
  const count: Record<string, number> = {};
  for (const story of stories) {
    const words = story.headline
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w.toLowerCase()));
    for (const word of words) {
      const key = word.toLowerCase();
      count[key] = (count[key] || 0) + 1;
    }
  }
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => '#' + w.charAt(0).toUpperCase() + w.slice(1));
}

// ── Cluster types ─────────────────────────────────────────────────────────────
interface Cluster {
  id: string;
  headline: string;
  summary: string;
  imageUrl: string;
  publishedAt: string;
  keyTerms: string[];   // shared topic hashtags for display
  stories: Story[];     // all articles in this cluster
}

interface TermData { terms: Set<string>; entities: Set<string> }

// ── Clustering helpers ────────────────────────────────────────────────────────

function dedupeByHeadline(stories: Story[]): Story[] {
  const seen = new Set<string>();
  return stories.filter(s => {
    const key = (s.sources?.[0]?.name ?? '') + '::' +
      s.headline.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractTermData(text: string): TermData {
  const words = text.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/);
  const terms = new Set<string>();
  const entities = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length < 3) continue;
    const lower = w.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    terms.add(lower);
    // Named entity: capitalised word not at the very start of input
    if (i > 0 && /^[A-Z]/.test(w)) entities.add(lower);
  }
  return { terms, entities };
}

function storySimilarity(a: TermData, b: TermData): number {
  // Strong signal: ≥2 shared named entities → definitely related
  let sharedEntities = 0;
  for (const e of a.entities) { if (b.entities.has(e)) sharedEntities++; }
  if (sharedEntities >= 2) return 1;

  // Weighted Jaccard: named entities count 3×
  let intersection = 0, unionW = 0;
  const all = new Set([...a.terms, ...b.terms]);
  for (const t of all) {
    const w = (a.entities.has(t) || b.entities.has(t)) ? 3 : 1;
    const inA = a.terms.has(t), inB = b.terms.has(t);
    if (inA && inB) intersection += w;
    unionW += w;
  }
  return unionW > 0 ? intersection / unionW : 0;
}

const CLUSTER_THRESHOLD = 0.15;
const MAX_CLUSTER_SIZE = 8;

function clusterStories(stories: Story[]): Cluster[] {
  const deduped = dedupeByHeadline(stories);
  const n = deduped.length;
  if (n === 0) return [];

  // Per-story term data (headline + first 100 chars of summary)
  const termData: TermData[] = deduped.map(s =>
    extractTermData(s.headline + ' ' + (s.summary || '').slice(0, 100))
  );

  // Union-Find with path compression + rank
  const parent = Array.from({ length: n }, (_, i) => i);
  const ufRank = new Array<number>(n).fill(0);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function unite(x: number, y: number) {
    const [px, py] = [find(x), find(y)];
    if (px === py) return;
    if (ufRank[px] < ufRank[py]) parent[px] = py;
    else if (ufRank[px] > ufRank[py]) parent[py] = px;
    else { parent[py] = px; ufRank[px]++; }
  }

  // O(n²) pairwise similarity — fast for n ≤ 60
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const srcI = deduped[i].sources?.[0]?.name;
      const srcJ = deduped[j].sources?.[0]?.name;
      if (srcI && srcJ && srcI === srcJ) continue; // never merge same-source
      if (storySimilarity(termData[i], termData[j]) >= CLUSTER_THRESHOLD) unite(i, j);
    }
  }

  // Group indices by cluster root
  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(i);
  }

  // Build Cluster objects
  const clusters: Cluster[] = [];
  for (const indices of clusterMap.values()) {
    const capped = indices.slice(0, MAX_CLUSTER_SIZE);
    const members = capped.map(i => deduped[i]);

    // Best representative: most named entities + has image + longer headline
    let repIdx = 0, repScore = -1;
    for (let k = 0; k < capped.length; k++) {
      const s = members[k];
      const score = termData[capped[k]].entities.size * 2
        + (s.imageUrl ? 3 : 0)
        + s.headline.split(' ').length;
      if (score > repScore) { repScore = score; repIdx = k; }
    }
    const rep = members[repIdx];

    // Shared key terms: cross-story entities first, then high-freq terms
    const termFreq = new Map<string, number>();
    const entitySet = new Set<string>();
    for (const i of capped) {
      for (const e of termData[i].entities) { entitySet.add(e); termFreq.set(e, (termFreq.get(e) ?? 0) + 1); }
      for (const t of termData[i].terms)    { termFreq.set(t, (termFreq.get(t) ?? 0) + 1); }
    }
    const keyTerms = [...termFreq.entries()]
      .filter(([t, c]) => c >= Math.min(2, members.length) || entitySet.has(t))
      .sort((a, b) => ((entitySet.has(b[0]) ? 3 : 0) + b[1]) - ((entitySet.has(a[0]) ? 3 : 0) + a[1]))
      .slice(0, 4)
      .map(([t]) => '#' + t.charAt(0).toUpperCase() + t.slice(1));

    clusters.push({
      id: rep.id,
      headline: rep.headline,
      summary: rep.summary,
      imageUrl: rep.imageUrl,
      publishedAt: rep.publishedAt,
      keyTerms,
      stories: members,
    });
  }

  // Multi-source clusters first, then most recent
  return clusters.sort((a, b) => {
    const diff = b.stories.length - a.stories.length;
    return diff !== 0 ? diff : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

async function fetchAILabels(topic: string, stories: Story[]): Promise<Map<string, string>> {
  try {
    const headlines = stories.slice(0, 40).map(s => ({ id: s.id, text: s.headline }));
    const res = await fetch(CLUSTER_LABELS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, headlines }),
    });
    if (!res.ok) return new Map();
    const data = await res.json() as { groups?: { label: string; ids: string[] }[] };
    const map = new Map<string, string>();
    for (const g of data.groups ?? []) {
      for (const id of g.ids) map.set(id, g.label);
    }
    return map;
  } catch {
    return new Map();
  }
}

const LABEL_SKIP = new Set([
  'a','an','the','in','on','at','to','for','of','and','or','but','as','is','are',
  'was','were','be','been','by','from','with','that','this','it','its','amid',
  'after','over','into','says','said','new','india','indian','world','major',
  'big','key','latest','how','why','what','when','who','where',
]);

function generateTopicLabel(headline: string): string {
  const words = headline.split(/[\s,;:–—\-]+/);
  const picked: string[] = [];
  for (const w of words) {
    const clean = w.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length > 1 && !LABEL_SKIP.has(clean.toLowerCase())) {
      picked.push(clean);
      if (picked.length >= 3) break;
    }
  }
  return picked.join(' ') || headline.slice(0, 28).trim();
}

function groupBySource(stories: Story[]): Section[] {
  const map = new Map<string, Story[]>();
  for (const story of stories) {
    const src = story.sources?.[0]?.name;
    if (!src) continue;
    if (!map.has(src)) map.set(src, []);
    map.get(src)!.push(story);
  }
  const ordered = [
    ...PREFERRED_SOURCES.filter(s => map.has(s)),
    ...[...map.keys()].filter(s => !PREFERRED_SOURCES.includes(s)).sort(),
  ];
  return ordered.map(src => ({ title: src, stories: map.get(src)! }));
}

const BG_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // 10 min inactive → silently refresh

export default function FeedScreen() {
  const { activeSources } = useSource();
  const layout = useLayout();
  const [activeTopic, setActiveTopic] = useState<CategoryTopic>('breaking');
  const [topicRestored, setTopicRestored] = useState(false);
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [pendingStories, setPendingStories] = useState<Story[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [techSourceFilter, setTechSourceFilter] = useState<string | null>(null);
  const [aiLabels, setAiLabels] = useState<Map<string, string>>(new Map());
  const aiLabelKeyRef = useRef<string>('');
  const listRef = useRef<FlatList>(null);
  useScrollToTop(listRef); // tapping the Feed tab icon scrolls back to top
  const lastFetchRef = useRef<number>(0);
  const visibleIndexRef = useRef<number>(0);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 10 });
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      visibleIndexRef.current = viewableItems[0].index;
    }
  });
  const activeTopicRef = useRef(activeTopic);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false); // ref guard — state update lags, ref is immediate
  useEffect(() => { activeTopicRef.current = activeTopic; }, [activeTopic]);
  useEffect(() => { pageRef.current = page; }, [page]);

  // Restore the last active tab on mount — survives fold/unfold activity recreation
  useEffect(() => {
    AsyncStorage.getItem('@ireader_active_topic').then(saved => {
      if (saved && CATEGORIES.find(c => c.topic === saved)) {
        setActiveTopic(saved as CategoryTopic);
      }
    }).finally(() => setTopicRestored(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist active tab on every change (but not the initial default before restore)
  useEffect(() => {
    if (!topicRestored) return;
    AsyncStorage.setItem('@ireader_active_topic', activeTopic).catch(() => {});
  }, [activeTopic, topicRestored]);

  // Save first-visible item index per topic when the app backgrounds (fold/home)
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        AsyncStorage.setItem(
          `@ireader_scroll_${activeTopicRef.current}`,
          String(visibleIndexRef.current),
        ).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Reset tech source filter when leaving the tech tab
  useEffect(() => {
    if (activeTopic !== 'technology') setTechSourceFilter(null);
  }, [activeTopic]);

  function filterStories(raw: Story[]): Story[] {
    return raw.filter(
      s =>
        !DEVANAGARI_RE.test(s.headline) &&
        !BLOCKED_TOPICS_RE.test(s.headline) &&
        activeSources[s.sources?.[0]?.name ?? ''] !== false,
    );
  }

  // Returns filtered stories AND whether the server has more pages.
  // hasMore is based on the RAW server count before frontend filtering so
  // a page where the Hindi/sports filter removes some items doesn't falsely
  // signal "end of feed".
  async function fetchPage(
    topic: CategoryTopic,
    pageNum: number,
    force = false,
  ): Promise<{ stories: Story[]; serverHasMore: boolean }> {
    const forceParam = force ? '&force=1' : '';
    const res = await fetch(`${API_BASE}?topic=${topic}&page=${pageNum}&limit=100${forceParam}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { stories: Story[]; total?: number; page?: number; limit?: number };
    const raw = data.stories ?? [];
    const total = data.total ?? 0;
    // Use server-provided total to know if there are more pages
    const fetched = (pageNum - 1) * 100 + raw.length;
    const serverHasMore = total > 0 ? fetched < total : raw.length >= 100;
    return { stories: filterStories(raw), serverHasMore };
  }

  // Silent background refresh — only shows new-stories banner, never resets
  // the currently visible list (which would break scroll position & pagination).
  async function backgroundRefresh(topic: CategoryTopic, current: Story[]) {
    try {
      const { stories: fresh } = await fetchPage(topic, 1);
      lastFetchRef.current = Date.now();
      await saveFeedCache(topic, fresh);
      const currentIds = new Set(current.map(s => s.id));
      const brandNew = fresh.filter(s => !currentIds.has(s.id));
      if (brandNew.length > 0) {
        setPendingStories(fresh);
        setNewCount(brandNew.length);
      }
      // No new stories → cache updated silently, visible list untouched
    } catch {
      // silent — user still sees last known good state
    }
  }

  // Topic change: serve cache instantly, always revalidate in background on tab switch
  useEffect(() => {
    setLoading(true);
    setAllStories([]);
    setPendingStories(null);
    setNewCount(0);
    setHasMore(true);
    setPage(1);
    pageRef.current = 1;
    setAiLabels(new Map());
    aiLabelKeyRef.current = '';

    loadCachedFeed(activeTopic).then(async cached => {
      if (cached && cached.stories.length > 0) {
        setAllStories(filterStories(cached.stories));
        setHasMore(true); // corrected on first loadMore call
        setLoading(false);
        // Restore scroll position saved before fold/unfold/background
        AsyncStorage.getItem(`@ireader_scroll_${activeTopic}`).then(saved => {
          const index = saved ? parseInt(saved, 10) : 0;
          if (index > 0) {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
            }, 150);
          }
        }).catch(() => {});
        // Always revalidate on tab switch so every tab shows fresh stories quickly.
        backgroundRefresh(activeTopic, filterStories(cached.stories));
      } else {
        // Cold start — must wait for network
        try {
          const { stories, serverHasMore } = await fetchPage(activeTopic, 1);
          setAllStories(stories);
          setHasMore(serverHasMore);
          lastFetchRef.current = Date.now();
          saveFeedCache(activeTopic, stories);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setLoading(false);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopic]);

  // AppState: refresh when returning from background after threshold
  useEffect(() => {
    let lastState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = lastState === 'background' || lastState === 'inactive';
      lastState = next;
      if (next !== 'active' || !wasBackground) return;
      const elapsed = Date.now() - lastFetchRef.current;
      if (elapsed > BG_REFRESH_THRESHOLD_MS) {
        backgroundRefresh(activeTopicRef.current, allStories);
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStories]);

  // Background AI cluster-label fetch. Fires when stories change (new topic load
  // or pull-to-refresh). Keyed by first story ID so loadMore doesn't re-trigger.
  // Deterministic labels are shown immediately; AI labels update cluster headers
  // once the server responds (cached on server for 30 min, ~1-2s on cold call).
  useEffect(() => {
    if (allStories.length < 3) return;
    const key = `${activeTopic}:${allStories[0]?.id ?? ''}`;
    if (aiLabelKeyRef.current === key) return;
    aiLabelKeyRef.current = key;
    fetchAILabels(activeTopic, allStories).then(labels => {
      if (labels.size > 0) setAiLabels(labels);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStories, activeTopic]);

  // Fire-and-forget prewarm for all other topics so every tab stays fresh
  function prewarmOtherTopics(exclude: CategoryTopic) {
    CATEGORIES.forEach(cat => {
      if (cat.topic !== exclude) {
        fetch(`${API_BASE}?topic=${cat.topic}&page=1&limit=20&force=1`).catch(() => {});
      }
    });
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPendingStories(null);
    setNewCount(0);
    try {
      // force=1 tells the server to do a synchronous rebuild — guaranteed fresh data
      const { stories, serverHasMore } = await fetchPage(activeTopic, 1, true);
      setAllStories(stories);
      setPage(1);
      pageRef.current = 1;
      setHasMore(serverHasMore);
      lastFetchRef.current = Date.now();
      saveFeedCache(activeTopic, stories);
      // Keep other tabs fresh in the background
      prewarmOtherTopics(activeTopic);
    } catch {
      // keep existing
    } finally {
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopic]);

  const applyPending = useCallback(() => {
    if (!pendingStories) return;
    setAllStories(pendingStories);
    setPendingStories(null);
    setNewCount(0);
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [pendingStories]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    try {
      const { stories: more, serverHasMore } = await fetchPage(activeTopic, nextPage);
      setAllStories(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newOnes = more.filter(s => !existingIds.has(s.id));
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
      setHasMore(serverHasMore);
      pageRef.current = nextPage;
      // Delay clearing the guard: FlatList re-measures after setAllStories commits
      // and re-fires onEndReached if scroll is still near the bottom. Keeping the
      // ref true for ~400 ms lets the layout settle before the next fetch is allowed.
      setTimeout(() => { loadingMoreRef.current = false; }, 400);
    } catch {
      // Reset immediately on error so the next scroll can retry
      loadingMoreRef.current = false;
    } finally {
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, activeTopic]);

  const visibleStories = useMemo(
    () => rankStories(allStories.filter(s => activeSources[s.sources?.[0]?.name ?? ''] !== false)),
    [allStories, activeSources],
  );

  // Extract unique tech sources for the source filter bar
  const techSources = useMemo(() => {
    if (activeTopic !== 'technology') return [] as string[];
    const seen = new Set<string>();
    const ordered: string[] = [];
    // Preferred sources first
    for (const name of PREFERRED_SOURCES) {
      if (visibleStories.some(s => s.sources?.[0]?.name === name)) {
        seen.add(name); ordered.push(name);
      }
    }
    // Then any other sources in the feed
    for (const s of visibleStories) {
      const name = s.sources?.[0]?.name;
      if (name && !seen.has(name)) { seen.add(name); ordered.push(name); }
    }
    return ordered.slice(0, 8);
  }, [activeTopic, visibleStories]);

  // Apply tech source filter before grouping
  const displayStories = useMemo(() => {
    if (activeTopic !== 'technology' || !techSourceFilter) return visibleStories;
    return visibleStories.filter(s => s.sources?.[0]?.name === techSourceFilter);
  }, [visibleStories, activeTopic, techSourceFilter]);

  const clusterGroups = useMemo((): Cluster[] => {
    const clusters = clusterStories(displayStories);
    if (aiLabels.size === 0) return clusters;
    return clusters.map(cluster => {
      // Majority vote: which AI label covers the most stories in this cluster?
      const votes = new Map<string, number>();
      for (const s of cluster.stories) {
        const lbl = aiLabels.get(s.id);
        if (lbl) votes.set(lbl, (votes.get(lbl) ?? 0) + 1);
      }
      if (votes.size === 0) return cluster;
      const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
      const best = sorted[0]?.[0];
      if (!best) return cluster;
      return { ...cluster, headline: best };
    });
  }, [displayStories, aiLabels]);

  const activeCat = CATEGORIES.find(c => c.topic === activeTopic) ?? CATEGORIES[0];
  const isBreaking = activeTopic === 'breaking';

  const { cardWidth, snapInterval, hPadding, isTablet } = layout;

  // Tap same pill → force-refresh that tab
  const handleCategoryPress = useCallback((topic: CategoryTopic) => {
    if (topic === activeTopic) {
      onRefresh();
    } else {
      setActiveTopic(topic);
    }
  }, [activeTopic, onRefresh]);

  const feedHeader = (
    <View>
      {/* Header — scrolls with feed */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Image source={require('../assets/icon.png')} style={styles.appIcon} contentFit="cover" />
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.date}>{formattedDate()}</Text>
          </View>
        </View>
      </View>

      {/* Category tabs — also scrolls with feed */}
      <View style={{ height: 72, marginBottom: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            height: 72,
          }}
          style={{ flex: 1 }}
        >
          {CATEGORIES.map((cat, idx) => {
            const active = cat.topic === activeTopic;
            return (
              <Pressable
                key={cat.topic}
                onPress={() => handleCategoryPress(cat.topic)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 16,
                  backgroundColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.1)',
                  marginRight: idx < CATEGORIES.length - 1 ? 8 : 0,
                  alignItems: 'center',
                  minWidth: 58,
                }}
              >
                <Text style={{ fontSize: 18, lineHeight: 22 }}>{cat.icon}</Text>
                <Text style={{ color: active ? '#000000' : '#AAAAAA', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Tech source filter — only on Technology tab */}
      {activeTopic === 'technology' && techSources.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }}
          style={{ marginBottom: 4 }}
        >
          {/* All sources pill */}
          <Pressable
            onPress={() => setTechSourceFilter(null)}
            style={[styles.sourceFilterPill, !techSourceFilter && styles.sourceFilterPillActive]}
          >
            <Text style={[styles.sourceFilterText, !techSourceFilter && styles.sourceFilterTextActive]}>All</Text>
          </Pressable>
          {techSources.map(srcName => {
            const domain = SOURCE_DOMAINS[srcName];
            const isActive = techSourceFilter === srcName;
            return (
              <Pressable
                key={srcName}
                onPress={() => setTechSourceFilter(srcName)}
                style={[styles.sourceFilterPill, isActive && styles.sourceFilterPillActive]}
              >
                {domain ? (
                  <Image
                    source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=32` }}
                    style={{ width: 14, height: 14, borderRadius: 3 }}
                    contentFit="cover"
                  />
                ) : null}
                <Text style={[styles.sourceFilterText, isActive && styles.sourceFilterTextActive]}>
                  {srcName.replace('The ', '').replace(' Tech', '')}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* New stories banner */}
      {newCount > 0 && (
        <Pressable onPress={applyPending} style={styles.newBanner}>
          <Text style={styles.newBannerText}>
            ↑ {newCount} new {newCount === 1 ? 'story' : 'stories'} — tap to refresh
          </Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']} onLayout={layout.onLayout}>
      <FlatList
        ref={listRef}
        data={clusterGroups}
        keyExtractor={c => c.id}
        extraData={cardWidth}
        renderItem={({ item }) => (
          <TopicSection
            cluster={item}
            isBreaking={isBreaking}
            catColor={activeCat.color}
            catLabel={activeCat.label}
            cardWidth={cardWidth}
            snapInterval={snapInterval}
            hPadding={hPadding}
            allStories={displayStories}
          />
        )}
        ListHeaderComponent={feedHeader}
        ListEmptyComponent={
          loading ? (
            <View style={[styles.center, { height: 300 }]}>
              <ActivityIndicator size="large" color="#4A90D9" />
            </View>
          ) : error ? (
            <View style={[styles.center, { height: 300 }]}>
              <Text style={styles.errorText}>Failed to load</Text>
              <Text style={styles.errorDetail}>{error}</Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={5}
        initialNumToRender={3}
        onEndReached={loadMore}
        onEndReachedThreshold={0.1}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={viewabilityConfig.current}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isBreaking ? '#FF3333' : '#AAAAAA'}
          />
        }
        ListFooterComponent={
          <View style={{ height: 80, alignItems: 'center', justifyContent: 'center' }}>
            {loadingMore && <ActivityIndicator color="#FFFFFF" />}
          </View>
        }
      />
    </SafeAreaView>
  );
}

interface LayoutProps {
  cardWidth: number;
  snapInterval: number;
  hPadding: number;
}

// ── Carousel Section (Technology only) ───────────────────────────────────────
const CarouselSection = React.memo(function CarouselSection({
  section,
  cardWidth,
  snapInterval,
  hPadding,
  allStories,
}: { section: Section; allStories?: Story[] } & LayoutProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const favicon = faviconUrl(section.title);
  const keywords = useMemo(() => extractKeywords(section.stories), [section.stories]);
  const navigation = useNavigation<NativeStackNavigationProp<FeedStackParamList>>();

  const onScrollSettle = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / snapInterval);
    setActiveIndex(Math.max(0, Math.min(idx, section.stories.length - 1)));
  }, [snapInterval, section.stories.length]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          {favicon ? (
            <Image source={{ uri: favicon }} style={styles.sourceIcon} contentFit="cover" />
          ) : (
            <View style={styles.sourceIconFallback}>
              <Text style={styles.sourceIconLetter}>{section.title.charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
        <Text style={styles.sectionCount}>{section.stories.length} stories</Text>
      </View>

      {/* Topic hashtags — tappable to navigate to TopicFeed */}
      {keywords.length > 0 && (
        <View style={styles.keywords}>
          {keywords.map((tag, i) => {
            const c = TAG_COLORS[i % TAG_COLORS.length];
            return (
              <Pressable
                key={tag}
                onPress={() => navigation.navigate('TopicFeed', { tag })}
                hitSlop={6}
              >
                <Text style={[styles.keywordTag, { color: c.text, backgroundColor: c.bg }]}>
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        contentContainerStyle={[styles.carouselContent, { paddingLeft: hPadding, paddingRight: 16 }]}
        onMomentumScrollEnd={onScrollSettle}
        onScrollEndDrag={onScrollSettle}
        scrollEventThrottle={200}
        removeClippedSubviews
      >
        {section.stories.map((story, i) => (
          <View key={story.id} style={i < section.stories.length - 1 ? { marginRight: CARD_GAP } : undefined}>
            <StoryCard story={story} cardWidth={cardWidth} allStories={allStories} />
          </View>
        ))}
      </ScrollView>

      {section.stories.length > 1 && (
        <View style={styles.dots}>
          {section.stories.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
});

// ── Topic Section — Particle-style cluster with AI-grouped stories ────────────
const TopicSection = React.memo(function TopicSection({
  cluster,
  catColor,
  catLabel,
  isBreaking,
  cardWidth,
  snapInterval,
  hPadding,
  allStories,
}: {
  cluster: Cluster;
  catColor: string;
  catLabel: string;
  isBreaking: boolean;
  allStories?: Story[];
} & LayoutProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const navigation = useNavigation<NativeStackNavigationProp<FeedStackParamList>>();
  const count = cluster.stories.length;

  const onScrollSettle = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / snapInterval);
    setActiveIndex(Math.max(0, Math.min(idx, count - 1)));
  }, [snapInterval, count]);

  // Single-story cluster — just the card, no header
  if (count === 1) {
    return (
      <View style={[styles.section, { alignItems: 'center' }]}>
        <StoryCard story={cluster.stories[0]} cardWidth={cardWidth} allStories={allStories} />
      </View>
    );
  }

  const sourceSubtitle = cluster.stories
    .slice(0, 3)
    .map(s => s.sources?.[0]?.name)
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.section}>
      {/* Particle-style cluster header */}
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <View style={styles.clusterCatRow}>
            {isBreaking && <View style={[styles.breakingDot, { marginRight: 6 }]} />}
            <Text style={[styles.clusterCatLabel, { color: catColor }]}>
              {catLabel.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.sectionTitle} numberOfLines={2}>{cluster.headline}</Text>
          {sourceSubtitle.length > 0 && (
            <Text style={styles.clusterSources} numberOfLines={1}>{sourceSubtitle}</Text>
          )}
        </View>
        <View style={styles.clusterCountBox}>
          <Text style={styles.clusterCountNum}>{count}</Text>
          <Text style={styles.clusterCountWord}>{count === 1 ? 'article' : 'articles'}</Text>
          <Ionicons name="chevron-forward" size={12} color="#444" />
        </View>
      </View>

      {/* Keyword chips — tappable */}
      {cluster.keyTerms.length > 0 && (
        <View style={styles.keywords}>
          {cluster.keyTerms.slice(0, 3).map((tag, i) => {
            const c = TAG_COLORS[i % TAG_COLORS.length];
            return (
              <Pressable
                key={tag}
                onPress={() => navigation.navigate('TopicFeed', { tag: tag.replace('#', '') })}
                hitSlop={6}
              >
                <Text style={[styles.keywordTag, { color: c.text, backgroundColor: c.bg }]}>{tag}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Horizontal card carousel — every story is its own card */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        contentContainerStyle={[styles.carouselContent, { paddingLeft: hPadding, paddingRight: 16 }]}
        onMomentumScrollEnd={onScrollSettle}
        onScrollEndDrag={onScrollSettle}
        scrollEventThrottle={200}
        removeClippedSubviews
      >
        {cluster.stories.map((story, i) => (
          <View key={story.id} style={i < cluster.stories.length - 1 ? { marginRight: CARD_GAP } : undefined}>
            <StoryCard story={story} cardWidth={cardWidth} allStories={allStories} />
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={styles.dots}>
        {cluster.stories.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  appIcon: {
    width: 48, height: 48,
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  greeting: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, lineHeight: 32 },
  date: { color: '#555555', fontSize: 13, fontWeight: '500', marginTop: 2 },

  // Keyword hashtags
  keywords: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, paddingBottom: 10 },
  keywordTag: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },

  // Vertical list (Breaking + non-tech tabs)
  verticalList: { paddingTop: 4, alignItems: 'center' },
  verticalItem: { marginBottom: 16 },
  breakingItem: { marginBottom: 20, alignItems: 'center', width: '100%' },
  breakingMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    width: '82%', marginBottom: 8,
  },
  breakingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3333' },
  breakingTime: { color: '#FF3333', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  breakingSource: { color: '#555', fontSize: 12, fontWeight: '500' },

  // Technology carousel
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 14,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  sourceIcon: { width: 26, height: 26, borderRadius: 6, backgroundColor: '#1A1A1A' },
  sourceIconFallback: {
    width: 26, height: 26, borderRadius: 6, backgroundColor: '#222',
    alignItems: 'center', justifyContent: 'center',
  },
  sourceIconLetter: { color: '#888', fontSize: 13, fontWeight: '700' },
  sectionTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  sectionSubtitle: { color: '#666666', fontSize: 13, lineHeight: 19, marginBottom: 4 },
  sectionCount: { color: '#3A3A3A', fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginTop: 2 },

  // Particle-style cluster header elements
  clusterCatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  clusterCatLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
  clusterSources: { color: '#505050', fontSize: 12, fontWeight: '500' },
  clusterCountBox: { alignItems: 'center', minWidth: 48 },
  clusterCountNum: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', lineHeight: 28 },
  clusterCountWord: { color: '#444444', fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  carouselContent: { alignItems: 'flex-start' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#2E2E2E' },
  dotActive: { backgroundColor: '#FFFFFF', width: 16 },

  errorText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  errorDetail: { color: '#555', fontSize: 13 },

  // Tech source filter pills
  sourceFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sourceFilterPillActive: {
    backgroundColor: 'rgba(74,144,217,0.18)',
    borderColor: '#4A90D9',
  },
  sourceFilterText: {
    color: '#777',
    fontSize: 12,
    fontWeight: '600',
  },
  sourceFilterTextActive: {
    color: '#4A90D9',
  },

  // New stories banner
  newBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#1A3A5C',
    alignItems: 'center',
  },
  newBannerText: { color: '#4A90D9', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
});
