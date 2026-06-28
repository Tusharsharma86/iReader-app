import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Story, StoryCard, BiasDot, BiasSpectrum, type BiasBreakdown } from '../components/StoryCard';
import { FeedStackParamList } from '../types/navigation';
import { useSource } from '../contexts/SourceContext';
import { useSettings } from '../contexts/SettingsContext';
import { loadCachedFeed, saveFeedCache } from '../utils/feedCache';
import { fireBreakingNotif, fireFavSourceNotif, scheduleStreakNudge } from '../utils/notifications';
import { tabBarTranslateY } from '../utils/tabBarAnim';
import { loadProfile, rankStories, rankStoriesStandard } from '../utils/personalization';
import { scoreClusterInterest } from '../utils/interestTopics';
import { TOPIC_SUBTOPICS, storyMatchesSubTopic } from '../utils/topics';
import { getUsageStats, trackVisit, checkStreakMilestone } from '../utils/usageTracker';
import { loadFollowed, annotateUpdates, markSeen, toggleFollow as toggleFollowStory } from '../utils/followStore';
import { loadBreakingThemeMutes, matchesMutedBreakingTheme } from '../utils/breakingThemes';
import { pushNotifHistory } from '../utils/notifHistory';
import { getArticleColor } from '../utils/colors';
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
// Cluster labels + summaries now come straight from the server feed
// (topicTitle / topicSummary, AI-generated server-side). No per-cluster client
// AI calls — matches web and protects the daily Groq token budget.

const CATEGORIES = [
  { topic: 'myspace',        label: 'MySpace',  icon: 'sparkles-outline' as const,    color: '#FF6B9D' },
  { topic: 'breaking',       label: 'Breaking', icon: 'flash-outline' as const,        color: '#FF5555' },
  { topic: 'technology',     label: 'Tech',     icon: 'laptop-outline' as const,       color: '#4A90D9' },
  { topic: 'india-politics', label: 'India',    icon: 'flag-outline' as const,         color: '#FF9500' },
  { topic: 'geopolitics',    label: 'World',    icon: 'globe-outline' as const,        color: '#4ECDC4' },
  { topic: 'markets',        label: 'Markets',  icon: 'trending-up-outline' as const,  color: '#22C55E' },
  { topic: 'business',       label: 'Business', icon: 'briefcase-outline' as const,    color: '#A29BFE' },
] as const;

const REAL_TOPICS = CATEGORIES.filter(c => c.topic !== 'myspace').map(c => c.topic);

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
// Always-blocked: deals, promo codes, phone prices
const BLOCKED_ALWAYS_RE = /\b(promo.?codes?|coupons?|discount.?codes?|cashback|voucher|sale.?offer|deal.?alert|exclusive.?deal|special.?offer|affiliate|referral.?codes?|invite.?codes?|offer.?codes?|redeem.?codes?|flat \d+%|flash sale|best deals?|top deals?|today.{0,8}deals?|today.{0,8}offers?|limited.{0,8}offer|get \d+% off|save \d+%|\d+%\s*off|phone price|smartphone price|price drops?|price cut|price hike|lowest price|best price|now cheaper|gets? cheaper|launched at|starts at rs|starts at \$|goes on sale|now available (for|in india|at)|available (for purchase|to buy)|specs leak|hands.?on review|camera test|(?:cpu|gpu|phone|device|gaming|graphics|processor)\s+benchmark|unboxing|vs comparison|budget phone|flagship phone|gadget deal|record low price|all.?time low|exchange offer)\b/i;
// Sports — blocked unless user enables in settings
const BLOCKED_SPORTS_RE = /\b(cricket|ipl|bcci|test match|odi|t20i?|football|fifa|tennis|wimbledon|formula[- ]1|f1 race|chess|olympics|hockey|badminton|icc|world cup|fantasy cricket|dream11|match report|scorecard|batting|bowling|wicket|wickets|run chase|penalty kick|goal scored|transfer window)\b/i;
// Entertainment/Bollywood — blocked unless user enables in settings
const BLOCKED_ENTERTAINMENT_RE = /\b(bollywood|tollywood|kollywood|movie|film|actor|actress|celebrity|box office|trailer|oscar|grammy|award show|web series|ott platform|music video|item song|album launch|concert tour|celebrity gossip|entertainment news|celebrity wedding|star spotted)\b/i;

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

// ── Feed types ─────────────────────────────────────────────────────────────────
// Shape returned by the server's /api/news/feed endpoint.
type ApiFeedItem =
  | { type: 'cluster'; topicTitle: string; topicSummary: string; articles: Story[]; _category?: string; collection?: boolean }
  | (Story & { type: 'article'; _category?: string });

function normalizeStory(a: Record<string, unknown>): Story {
  return { ...(a as unknown as Story), imageUrl: (a.imageUrl as string | null | undefined) ?? '' };
}

function normalizeFeedItems(raw: unknown[]): ApiFeedItem[] {
  return (raw as Array<Record<string, unknown>>).map(item => {
    if (item.type === 'cluster') {
      const articles = Array.isArray(item.articles)
        ? (item.articles as Array<Record<string, unknown>>).map(normalizeStory)
        : [];
      return { type: 'cluster', topicTitle: String(item.topicTitle ?? ''), topicSummary: String(item.topicSummary ?? ''), articles, collection: Boolean(item.collection) } as ApiFeedItem;
    }
    return { ...normalizeStory(item), type: 'article' } as ApiFeedItem;
  });
}

// ── Cluster types ─────────────────────────────────────────────────────────────
interface Cluster {
  id: string;
  headline: string;
  topicLabel: string;
  summary: string;
  imageUrl: string;
  publishedAt: string;
  stories: Story[];
  isBreaking?: boolean;
  collection?: boolean;
  _category?: string;
  biasBreakdown?: BiasBreakdown;
}

type MyspaceItem =
  | { type: 'zone-header'; id: string; category: string; label: string; color: string; icon: string; total: number; expanded: boolean }
  | { type: 'zone-cluster'; id: string; cluster: Cluster }
  | { type: 'zone-more'; id: string; category: string; remaining: number };

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
    // Named entity: capitalised word, not at sentence start, not a generic term
    if (i > 0 && /^[A-Z]/.test(w) && !ENTITY_STOP.has(lower)) entities.add(lower);
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

const CLUSTER_THRESHOLD = 0.33;
const MAX_CLUSTER_SIZE = 8;

// Generic words that appear in nearly every headline — excluding these prevents
// "India" + "Government" from force-clustering unrelated stories together.
const ENTITY_STOP = new Set([
  'india','indian','world','government','minister','president','party','court',
  'budget','market','stock','bank','delhi','mumbai','police','army','election',
  'official','leader','people','state','national','report','news','today',
  'says','said','told','amid','after','before','over','during','monday',
  'tuesday','wednesday','thursday','friday','saturday','sunday','january',
  'february','march','april','june','july','august','september','october',
  'november','december',
  // common Indian political terms — too generic to cluster on
  'modi','bjp','congress','rahul','gandhi','pm','cm','mla','mp','lok','sabha',
  'rajya','union','centre','central','federal','department','ministry','scheme',
  'opposition','ruling','coalition','alliance','government','regime',
]);

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

// Picks words that appear across MULTIPLE stories so the label reflects the shared
// theme rather than just one story's headline.
function generateClusterLabel(stories: Story[]): string {
  if (stories.length === 1) return generateTopicLabel(stories[0].headline);
  const freq: Record<string, number> = {};
  for (const story of stories) {
    const seen = new Set<string>();
    for (const w of story.headline.split(/[\s,;:–—\-'"()[\]]+/)) {
      const clean = w.replace(/[^a-zA-Z0-9]/g, '');
      const lower = clean.toLowerCase();
      if (clean.length > 2 && !LABEL_SKIP.has(lower) && !seen.has(lower)) {
        seen.add(lower);
        freq[clean] = (freq[clean] ?? 0) + 1;
      }
    }
  }
  const shared = Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  return shared.length > 0 ? shared.join(' ') : generateTopicLabel(stories[0].headline);
}

const LIVE_BLOG_RE = /\b(live( blog| updates?)?|live:|\s[-–]\s*live\s*$|rolling coverage|as it happens)\b/i;
function topicMatchScore(headline: string, topicTitle: string): number {
  if (!topicTitle || !headline) return 0;
  const topicWords = new Set((topicTitle.toLowerCase().match(/[a-z]{4,}/g) ?? []));
  return (headline.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(w => topicWords.has(w)).length;
}
function pickClusterRep(articles: Story[], topicTitle: string): Story | undefined {
  const nonLive = articles.filter(s => !LIVE_BLOG_RE.test(s.headline ?? ''));
  const pool = nonLive.length > 0 ? nonLive : articles;
  return pool.slice().sort((a, b) => {
    const aScore = (a.sources?.length ?? 0) * 2 + topicMatchScore(a.headline ?? '', topicTitle);
    const bScore = (b.sources?.length ?? 0) * 2 + topicMatchScore(b.headline ?? '', topicTitle);
    return bScore - aScore;
  })[0];
}

function capToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= max ? text.trim() : words.slice(0, max).join(' ');
}

function feedToClusterGroups(feed: ApiFeedItem[]): Cluster[] {
  return feed.flatMap((item): Cluster[] => {
    if (item.type === 'cluster') {
      // Use topicTitle (AI/server-generated) when non-empty; fall back to
      // first article headline only when server sent nothing useful.
      const rawLabel = item.topicTitle?.trim()
        ? item.topicTitle.trim()
        : (item.articles[0]?.headline ?? '');
      const label = rawLabel || (item.articles[0]?.headline ?? '');
      const rep = pickClusterRep(item.articles, label) ?? item.articles[0];
      if (!rep) return [];
      return [{
        id: `cluster-${rep.id}`,
        headline: label,
        topicLabel: label,
        summary: item.topicSummary ? capToWords(item.topicSummary, 25) : (rep.summary ?? ''),
        imageUrl: rep.imageUrl ?? '',
        publishedAt: rep.publishedAt,
        stories: item.articles,
        isBreaking: !item.collection && (item._category === 'breaking' || item.articles.some(s => s.isBreaking)),
        collection: item.collection,
        _category: item._category,
        biasBreakdown: item.collection ? undefined : (rep as any).biasBreakdown,
      }];
    }
    return [{
      id: item.id,
      headline: item.headline,
      topicLabel: item.headline,   // full headline, not 3-word fragment
      summary: item.summary,
      imageUrl: item.imageUrl ?? '',
      publishedAt: item.publishedAt,
      stories: [item as Story],
      isBreaking: item._category === 'breaking' || ((item as Story).isBreaking ?? false),
      _category: item._category,
    }];
  });
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

// Shimmer skeleton — gradient sweep across pulsing card placeholders.
function FeedSkeleton() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: false })).start();
  }, [v]);
  const opacity = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.7, 0.35] });
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      {[0, 1, 2, 3].map(i => (
        <Animated.View key={i} style={{
          height: 180, borderRadius: 20, marginBottom: 16,
          backgroundColor: '#1A1A1A', opacity,
        }} />
      ))}
      <Animated.View style={{ height: 14, width: '40%', borderRadius: 4, marginBottom: 10, backgroundColor: '#1A1A1A', opacity }} />
      <Animated.View style={{ height: 12, width: '70%', borderRadius: 4, backgroundColor: '#161616', opacity }} />
    </View>
  );
}

export default function FeedScreen() {
  const { activeSources } = useSource();
  const { notifBreaking, breakingSensitivity, notifSources, favSources, favTopics, showSports, showEntertainment, activeSubTopics, topicInterests } = useSettings();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const rootNav = useNavigation<NativeStackNavigationProp<FeedStackParamList>>();
  const [activeTopic, setActiveTopic] = useState<CategoryTopic>('breaking');
  const [topicRestored, setTopicRestored] = useState(false);
  const [allFeed, setAllFeed] = useState<ApiFeedItem[]>([]);
  const [pendingFeed, setPendingFeed] = useState<ApiFeedItem[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [techSourceFilter, setTechSourceFilter] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const [milestone, setMilestone] = useState<number | null>(null);
  // Load breaking-theme mute set on mount — used to suppress breaking notifs
  // for themes the user has turned off in BreakingThemesScreen.
  useEffect(() => { loadBreakingThemeMutes().catch(() => {}); }, []);
  useEffect(() => {
    trackVisit()
      .then(() => getUsageStats())
      .then(async s => {
        setStreak(s.streakDays);
        // Daily 8 PM nudge to keep the streak alive (local notification).
        scheduleStreakNudge(s.streakDays).catch(() => {});
        // One-time in-app celebration when a streak milestone is freshly reached.
        const m = await checkStreakMilestone(s.streakDays);
        if (m) setMilestone(m);
      })
      .catch(() => {});
  }, []);
  const [followV, setFollowV] = useState(0);
  useEffect(() => { loadFollowed().then(() => setFollowV(v => v + 1)).catch(() => {}); }, []);
  const [expandedTopics, setExpandedTopics] = useState<string[]>([]);
  const listRef = useRef<FlatList>(null);
  // useScrollToTop tries scrollToIndex first (crashes when item 0 is off-screen).
  // Wrapping in a ref that only exposes scrollToTop forces it down the safe path.
  const scrollTopRef = useRef({ scrollToTop: () => listRef.current?.scrollToOffset({ offset: 0, animated: true }) });
  useScrollToTop(scrollTopRef as never);
  const lastFetchRef = useRef<number>(0);
  const visibleIndexRef = useRef<number>(0);
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 100 });
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      visibleIndexRef.current = viewableItems[0].index;
      // Persist continuously so fold/unfold can restore even if app never backgrounded
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current);
      scrollSaveTimerRef.current = setTimeout(() => {
        AsyncStorage.setItem(
          `@ireader_scroll_${activeTopicRef.current}`,
          JSON.stringify({ idx: visibleIndexRef.current, at: Date.now() }),
        ).catch(() => {});
      }, 500);
    }
  });
  const activeTopicRef = useRef(activeTopic);
  const prevScrollYRef = useRef(0);
  const tabBarVisibleRef = useRef(true);
  const carouselRefs = useRef<Record<string, ScrollView | null>>({});
  const carouselOffsets = useRef<Record<string, number>>({});
  const feedOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => { activeTopicRef.current = activeTopic; }, [activeTopic]);

  // Fold/unfold: maintainVisibleContentPosition on the FlatList (set below)
  // automatically pins the visible row through dimension changes. The old
  // manual scrollToOffset(index * 436) used a hardcoded item-height estimate
  // that fought with the auto-anchor and caused the article-state jump after
  // fold — removed. Card width adapts via useLayout's onLayout handler.


  // Restore tab bar when navigating away from Feed (e.g. to Saved/Settings)
  useFocusEffect(useCallback(() => {
    return () => {
      if (!tabBarVisibleRef.current) {
        tabBarVisibleRef.current = true;
        Animated.timing(tabBarTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      }
    };
  }, []));

  const handleFeedScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - prevScrollYRef.current;
    prevScrollYRef.current = y;
    if (y < 80 && !tabBarVisibleRef.current) {
      tabBarVisibleRef.current = true;
      Animated.timing(tabBarTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else if (dy > 10 && tabBarVisibleRef.current) {
      tabBarVisibleRef.current = false;
      Animated.timing(tabBarTranslateY, { toValue: 160, duration: 200, useNativeDriver: true }).start();
    } else if (dy < -8 && !tabBarVisibleRef.current) {
      tabBarVisibleRef.current = true;
      Animated.timing(tabBarTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }
  }, []);

  // Restore the last active tab on mount — survives fold/unfold activity recreation
  useEffect(() => {
    loadProfile();
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
          JSON.stringify({ idx: visibleIndexRef.current, at: Date.now() }),
        ).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Reset tech source filter when leaving the tech tab
  useEffect(() => {
    if (activeTopic !== 'technology') setTechSourceFilter(null);
  }, [activeTopic]);

  function isBlocked(headline: string, source?: string): boolean {
    if (DEVANAGARI_RE.test(headline)) return true;
    if (BLOCKED_ALWAYS_RE.test(headline)) return true;
    if (!showSports && BLOCKED_SPORTS_RE.test(headline)) return true;
    if (!showEntertainment && BLOCKED_ENTERTAINMENT_RE.test(headline)) return true;
    if (source === 'India Today' && /\bdiscount\b/i.test(headline)) return true;
    // NYT recurring "Here's the Latest" live-briefing roundup — not a story.
    if (/nyt|new york times/i.test(source ?? '') && /here.?s the latest|here are the latest/i.test(headline)) return true;
    return false;
  }

  function filterFeedItems(feed: ApiFeedItem[]): ApiFeedItem[] {
    const topicSubs = (TOPIC_SUBTOPICS as Record<string, string[]>)[activeTopic] ?? [];
    const disabledSubs = topicSubs.filter(s => activeSubTopics[`${activeTopic}:${s}`] === false);

    function blockedBySubTopic(headline: string, summary: string): boolean {
      if (disabledSubs.length === 0) return false;
      return disabledSubs.some(sub => storyMatchesSubTopic(headline, summary, sub));
    }

    const out: ApiFeedItem[] = [];
    for (const item of feed) {
      if (item.type === 'cluster') {
        const filtered = item.articles.filter(a =>
          !isBlocked(a.headline, a.sources?.[0]?.name) &&
          activeSources[a.sources?.[0]?.name ?? ''] !== false &&
          !blockedBySubTopic(a.headline, a.summary ?? ''),
        );
        if (filtered.length > 0) out.push(filtered.length !== item.articles.length ? { ...item, articles: filtered } : item);
      } else {
        if (isBlocked(item.headline, item.sources?.[0]?.name)) continue;
        if (activeSources[item.sources?.[0]?.name ?? ''] === false) continue;
        if (blockedBySubTopic(item.headline, item.summary ?? '')) continue;
        out.push(item);
      }
    }
    return out;
  }

  async function fetchFeed(topic: CategoryTopic, force = false): Promise<ApiFeedItem[]> {
    if (topic === 'myspace') {
      const forceParam = force ? '&force=1' : '';
      const results = await Promise.all(
        REAL_TOPICS.map(t =>
          fetch(`${API_BASE}?topic=${t}${forceParam}`)
            .then(r => r.ok ? r.json() : { feed: [] })
            .then((d: { feed?: unknown[] }) =>
              normalizeFeedItems(d.feed ?? []).map(item => ({ ...item, _category: t }))
            )
            .catch(() => [] as ApiFeedItem[])
        )
      );
      return results.flat();
    }
    const forceParam = force ? '&force=1' : '';
    const res = await fetch(`${API_BASE}?topic=${topic}${forceParam}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { feed?: unknown[] };
    return normalizeFeedItems(data.feed ?? []).map(item => ({ ...item, _category: topic }));
  }

  function feedItemId(item: ApiFeedItem): string {
    return item.type === 'cluster' ? (item.articles[0]?.id ?? '') : item.id;
  }

  async function backgroundRefresh(topic: CategoryTopic, current: ApiFeedItem[]) {
    try {
      const fresh = await fetchFeed(topic);
      lastFetchRef.current = Date.now();
      await saveFeedCache(topic, fresh);
      const currentIds = new Set(current.map(feedItemId));
      const brandNew = fresh.filter(item => !currentIds.has(feedItemId(item)));

      // Fire local notifications for new breaking news and fav source articles.
      // Skip cluster items — only single articles get push notifs.
      const sensMin = breakingSensitivity === 'critical' ? 3 : breakingSensitivity === 'important' ? 2 : 1;
      for (const item of brandNew) {
        if (item.type === 'cluster') continue;
        const articles = [item as Story];
        const sourceCount = 1;
        const itemCategory = item._category ?? topic;
        for (const a of articles) {
          const sourceName = a.sources?.[0]?.name ?? '';
          const isBreakingArticle = itemCategory === 'breaking' || (a.isBreaking ?? false);
          const isFavSource = favSources.includes(sourceName);
          const isFavTopic = favTopics.includes(topic);
          const historyBase = {
            id: a.id,
            headline: a.headline,
            summary: a.summary ?? '',
            imageUrl: a.imageUrl ?? '',
            url: a.sources?.[0]?.url ?? '',
            source: sourceName,
            publishedAt: a.publishedAt,
            dominantColor: getArticleColor(a.id || a.headline),
            firedAt: Date.now(),
          };
          if (notifBreaking && isBreakingArticle && sourceCount >= sensMin && !matchesMutedBreakingTheme(a.headline, a.summary ?? '')) {
            fireBreakingNotif(a.id, a.headline, a.summary ?? '', a.imageUrl ?? '', {
              url: a.sources?.[0]?.url ?? '',
              source: sourceName,
              publishedAt: a.publishedAt,
            }).catch(() => {});
            pushNotifHistory({ ...historyBase, kind: 'breaking' }).catch(() => {});
          } else if (notifSources && (isFavSource || isFavTopic)) {
            fireFavSourceNotif(a.id, sourceName || 'iReader', a.headline, {
              url: a.sources?.[0]?.url ?? '',
              summary: a.summary ?? '',
              imageUrl: a.imageUrl ?? '',
              publishedAt: a.publishedAt,
            }).catch(() => {});
            pushNotifHistory({ ...historyBase, kind: isFavSource ? 'source' : 'topic' }).catch(() => {});
          }
        }
      }

      if (brandNew.length > 0) {
        setPendingFeed(fresh);
        setNewCount(brandNew.length);
      }
    } catch {
      // silent — user still sees last known good state
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAllFeed([]);
    setPendingFeed(null);
    setNewCount(0);

    loadCachedFeed<ApiFeedItem>(activeTopic).then(async cached => {
      if (cancelled) return;
      if (cached && cached.feed.length > 0) {
        setAllFeed(cached.feed);
        setLoading(false);
        backgroundRefresh(activeTopic, cached.feed);
      } else {
        try {
          const fresh = await fetchFeed(activeTopic);
          if (cancelled) return;
          setAllFeed(fresh);
          lastFetchRef.current = Date.now();
          saveFeedCache(activeTopic, fresh).catch(() => {});
        } catch (e: any) {
          if (!cancelled) setError(e.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    });
    return () => { cancelled = true; };
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
        backgroundRefresh(activeTopicRef.current, allFeed);
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFeed]);


  // Fire-and-forget prewarm for all other topics so every tab stays fresh
  function prewarmOtherTopics(exclude: CategoryTopic) {
    REAL_TOPICS.forEach(t => {
      if (t !== exclude) {
        fetch(`${API_BASE}?topic=${t}`).catch(() => {});
      }
    });
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPendingFeed(null);
    setNewCount(0);
    try {
      const fresh = await fetchFeed(activeTopic, true);
      setAllFeed(fresh);
      lastFetchRef.current = Date.now();
      saveFeedCache(activeTopic, fresh).catch(() => {});
      prewarmOtherTopics(activeTopic);
    } catch {
      // keep existing
    } finally {
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopic]);

  const applyPending = useCallback(() => {
    if (!pendingFeed) return;
    setAllFeed(pendingFeed);
    setPendingFeed(null);
    setNewCount(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [pendingFeed]);


  // Filter by blocked content, active sources, and disabled subtopics
  const filteredFeed = useMemo(
    () => filterFeedItems(allFeed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFeed, activeSources, activeTopic, activeSubTopics, showSports, showEntertainment],
  );

  // Extract unique tech sources for the filter bar
  const techSources = useMemo(() => {
    if (activeTopic !== 'technology') return [] as string[];
    const allArticles = filteredFeed.flatMap(item =>
      item.type === 'cluster' ? item.articles : [item],
    );
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const name of PREFERRED_SOURCES) {
      if (allArticles.some(s => s.sources?.[0]?.name === name)) {
        seen.add(name); ordered.push(name);
      }
    }
    for (const s of allArticles) {
      const name = s.sources?.[0]?.name;
      if (name && !seen.has(name)) { seen.add(name); ordered.push(name); }
    }
    return ordered.slice(0, 8);
  }, [activeTopic, filteredFeed]);

  // Apply tech source filter
  const displayFeed = useMemo(() => {
    if (activeTopic !== 'technology' || !techSourceFilter) return filteredFeed;
    const out: ApiFeedItem[] = [];
    for (const item of filteredFeed) {
      if (item.type === 'cluster') {
        const filtered = item.articles.filter(a => a.sources?.[0]?.name === techSourceFilter);
        if (filtered.length > 0) out.push({ ...item, articles: filtered });
      } else if (item.sources?.[0]?.name === techSourceFilter) {
        out.push(item);
      }
    }
    return out;
  }, [filteredFeed, activeTopic, techSourceFilter]);

  // Convert server-clustered feed to Cluster[] for rendering — dedupe by id to guard against
  // duplicate articles coming from the server (same URL fetched from multiple RSS sources).
  const clusterGroups = useMemo((): Cluster[] => {
    const seen = new Set<string>();
    return feedToClusterGroups(displayFeed).filter(c => {
      if (!c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [displayFeed]);

  // Re-rank clusters: MySpace uses personalized scoring + diversity floor;
  // all other tabs use standard importance × freshness × velocity (no user signal).
  const rankedClusterGroups = useMemo((): Cluster[] => {
    if (clusterGroups.length === 0) return clusterGroups;

    const proxies = clusterGroups.map((c, i) => ({
      id: c.id,
      headline: c.headline,
      summary: c.summary,
      sources: c.stories[0]?.sources ?? [],
      publishedAt: c.publishedAt,
      imageUrl: c.imageUrl,
      isBreaking: c.isBreaking ?? false,
      isTrending: c.stories.length >= 3,
      _i: i,
      _category: c._category,
      _categoryBonus: favTopics.includes(c._category ?? '') ? 5 : 0,
    }));

    if (activeTopic === 'myspace') {
      // Add interest score to each proxy
      const proxiesWithInterest = proxies.map(p => ({
        ...p,
        _interestBonus: scoreClusterInterest(
          clusterGroups[p._i].headline,
          clusterGroups[p._i].summary,
          topicInterests,
        ),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ranked = (rankStories(proxiesWithInterest as any) as any[]).map((p: any) => clusterGroups[p._i]);

      // Split: breaking (< 1hr or flagged) vs rest
      const breaking: Cluster[] = [];
      const rest: Cluster[] = [];
      for (const c of ranked) {
        const ageMs = Date.now() - new Date(c.publishedAt).getTime();
        if (c.isBreaking || ageMs < 60 * 60 * 1000) breaking.push(c);
        else rest.push(c);
      }

      // Top 5 breaking first, then diversity-capped mix up to 50 total
      // Caps removed by request — show every ranked cluster, no 50-item limit
      // and no per-category diversity cap. Breaking stays surfaced first.
      const top5Breaking = breaking.slice(0, 5);
      const remaining = [...breaking.slice(5), ...rest];
      return [...top5Breaking, ...remaining];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rankStoriesStandard(proxies as any) as any[]).map((p: any) => clusterGroups[p._i]);
  }, [clusterGroups, activeTopic, favTopics, topicInterests]);

  const myspaceFlatItems = useMemo((): MyspaceItem[] => {
    if (activeTopic !== 'myspace') return [];
    const PREVIEW = 3;
    const catMeta = Object.fromEntries(CATEGORIES.map(c => [c.topic, { label: c.label, color: c.color, icon: c.icon }]));
    const groups = new Map<string, Cluster[]>();
    const catOrder: string[] = [];
    for (const c of rankedClusterGroups) {
      const cat = c._category ?? 'other';
      if (!groups.has(cat)) { groups.set(cat, []); catOrder.push(cat); }
      groups.get(cat)!.push(c);
    }
    const items: MyspaceItem[] = [];
    for (const cat of catOrder) {
      const clusters = groups.get(cat)!;
      const meta = catMeta[cat] ?? { label: 'News', color: '#888888', icon: 'newspaper-outline' };
      const isExpanded = expandedTopics.includes(cat);
      items.push({ type: 'zone-header', id: `header-${cat}`, category: cat, label: meta.label, color: meta.color, icon: meta.icon, total: clusters.length, expanded: isExpanded });
      const visible = isExpanded ? clusters : clusters.slice(0, PREVIEW);
      for (const cluster of visible) items.push({ type: 'zone-cluster', id: `zc-${cluster.id}`, cluster });
      if (!isExpanded && clusters.length > PREVIEW) items.push({ type: 'zone-more', id: `more-${cat}`, category: cat, remaining: clusters.length - PREVIEW });
    }
    return items;
  }, [activeTopic, rankedClusterGroups, expandedTopics]);

  // Restore scroll position after Activity recreation (fold/unfold).
  // Tracks the last data-length we restored for, so it fires again if data reloads
  // from scratch (Activity recreated) but not on normal incremental renders.
  const lastRestoredLengthRef = useRef<Record<string, number>>({});
  const scrollFailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    if (rankedClusterGroups.length === 0) {
      // Data cleared — reset so next load triggers restore
      lastRestoredLengthRef.current[activeTopic] = 0;
      return;
    }
    // Only restore when data goes from 0 → N (fresh load), not on subsequent renders
    if ((lastRestoredLengthRef.current[activeTopic] ?? 0) > 0) return;
    lastRestoredLengthRef.current[activeTopic] = rankedClusterGroups.length;
    AsyncStorage.getItem(`@ireader_scroll_${activeTopic}`).then(saved => {
      if (!saved) return;
      // Only restore scroll position if it's recent (<30 min). Beyond that, news
      // has moved on and the user expects a fresh top-of-feed. Legacy plain-int
      // values (no timestamp) are treated as expired.
      const SCROLL_RESTORE_MAX_AGE_MS = 30 * 60 * 1000;
      let idx = -1;
      try {
        const p = JSON.parse(saved) as { idx?: number; at?: number };
        if (typeof p?.idx === 'number' && typeof p?.at === 'number' && Date.now() - p.at < SCROLL_RESTORE_MAX_AGE_MS) {
          idx = p.idx;
        }
      } catch { /* legacy plain-int — treat as expired */ }
      if (idx > 0 && idx < rankedClusterGroups.length) {
        // Hide feed immediately so user never sees scroll from position 0 → idx
        feedOpacity.setValue(0);
        t1 = setTimeout(() => {
          listRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0 });
          // Fade in after scroll lands (extra 350ms covers onScrollToIndexFailed retry)
          t2 = setTimeout(() => {
            Animated.timing(feedOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
          }, 350);
        }, 50);
      }
    }).catch(() => {});
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopic, rankedClusterGroups.length]);

  // Flat article list for passing to StoryCard (related-stories feature)
  const allArticles = useMemo((): Story[] =>
    displayFeed.flatMap(item => item.type === 'cluster' ? item.articles : [item]),
  [displayFeed]);

  const activeCat = CATEGORIES.find(c => c.topic === activeTopic) ?? CATEGORIES[0];
  const isBreaking = activeTopic === 'breaking';

  const { cardWidth, snapInterval, hPadding, isTablet } = layout;

  // Tap same pill → force-refresh that tab; tap different pill → switch + scroll to top
  const handleCategoryPress = useCallback((topic: CategoryTopic) => {
    if (topic === activeTopic) {
      onRefresh();
    } else {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setActiveTopic(topic);
    }
  }, [activeTopic, onRefresh]);

  const feedHeader = (
    <View>
      {/* Header — scrolls with feed; paddingTop accounts for transparent status bar */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Image source={require('../assets/header-logo.png')} style={styles.appIcon} contentFit="contain" />
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.date}>{formattedDate()}</Text>
          </View>
        </View>
      </View>

      {/* Category tabs + filter button */}
      <View style={{ height: 48, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingLeft: 16,
            paddingRight: 8,
            flexDirection: 'row',
            alignItems: 'center',
            height: 48,
            gap: 8,
          }}
          style={{ flex: 1 }}
        >
          {CATEGORIES.map(cat => {
            const active = cat.topic === activeTopic;
            return (
              <Pressable
                key={cat.topic}
                onPress={() => handleCategoryPress(cat.topic)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: active ? 'transparent' : 'rgba(255,255,255,0.12)',
                }}
              >
                <Ionicons name={cat.icon} size={13} color={active ? '#000000' : 'rgba(255,255,255,0.45)'} />
                <Text style={{ color: active ? '#000000' : 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 }}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {/* Filter button — only shown on technology tab */}
        {activeTopic === 'technology' && techSources.length > 1 && (
          <Pressable
            onPress={() => setFilterModalOpen(true)}
            style={{
              width: 36, height: 36, borderRadius: 18, marginRight: 12,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: techSourceFilter ? 'rgba(74,144,217,0.18)' : 'rgba(255,255,255,0.07)',
              borderWidth: 1,
              borderColor: techSourceFilter ? '#4A90D9' : 'rgba(255,255,255,0.12)',
            }}
          >
            <Ionicons name="options-outline" size={18} color={techSourceFilter ? '#4A90D9' : '#888'} />
            {techSourceFilter && (
              <View style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: '#4A90D9' }} />
            )}
          </Pressable>
        )}
      </View>

      {/* Source filter modal */}
      <Modal visible={filterModalOpen} transparent animationType="slide" onRequestClose={() => setFilterModalOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setFilterModalOpen(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={{
                backgroundColor: '#0e0e14', borderTopLeftRadius: 20, borderTopRightRadius: 20,
                padding: 20, paddingBottom: 36,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 }}>FILTER BY SOURCE</Text>
                  {techSourceFilter && (
                    <Pressable onPress={() => { setTechSourceFilter(null); setFilterModalOpen(false); }}>
                      <Text style={{ color: '#4A90D9', fontSize: 12, fontWeight: '700' }}>Clear</Text>
                    </Pressable>
                  )}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {/* All */}
                  <Pressable onPress={() => { setTechSourceFilter(null); setFilterModalOpen(false); }} style={styles.srcChip}>
                    <View style={[styles.srcCircle, !techSourceFilter && styles.srcCircleActive]}>
                      <Ionicons name="apps-outline" size={18} color={!techSourceFilter ? '#4A90D9' : '#666'} />
                    </View>
                    <Text style={[styles.srcChipLabel, !techSourceFilter && styles.srcChipLabelActive]}>All</Text>
                  </Pressable>
                  {techSources.map(srcName => {
                    const domain = SOURCE_DOMAINS[srcName];
                    const isActive = techSourceFilter === srcName;
                    const shortName = srcName.replace(/^The /, '').replace(/ Tech$/, '').replace(/^9to5/, '').split(' ')[0];
                    return (
                      <Pressable key={srcName} onPress={() => { setTechSourceFilter(srcName); setFilterModalOpen(false); }} style={styles.srcChip}>
                        <View style={[styles.srcCircle, isActive && styles.srcCircleActive]}>
                          {domain ? (
                            <Image
                              source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` }}
                              style={{ width: 24, height: 24, borderRadius: 6 }}
                              contentFit="cover"
                            />
                          ) : (
                            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700' }}>{shortName.slice(0, 2).toUpperCase()}</Text>
                          )}
                        </View>
                        <Text style={[styles.srcChipLabel, isActive && styles.srcChipLabelActive]} numberOfLines={1}>{shortName}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Following strip (For You only) */}
      {activeTopic === 'myspace' && (() => {
        void followV;
        const followed = annotateUpdates(rankedClusterGroups.map(c => ({ id: c.id, headline: c.headline })));
        if (followed.length === 0) return null;
        return (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.followHeader}>FOLLOWING</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {followed.map(f => {
                const target = rankedClusterGroups.find(c => c.id === (f.latestId ?? f.id));
                return (
                  <Pressable key={f.id} style={[styles.followCard, f.hasUpdate && styles.followCardNew]}
                    onPress={() => {
                      if (!target) return;
                      markSeen(f.id, target.id, target.headline);
                      setFollowV(v => v + 1);
                      rootNav.navigate('StoryTimeline', { clusterId: target.id, headline: target.headline, stories: JSON.stringify(target.stories) });
                    }}>
                    {f.hasUpdate && <View style={styles.followNewBadge}><Text style={styles.followNewText}>🆕 NEW</Text></View>}
                    <Text style={styles.followCardText} numberOfLines={3}>
                      {f.hasUpdate && f.latestHeadline ? f.latestHeadline : f.headline}
                    </Text>
                    <Pressable hitSlop={6} onPress={() => { toggleFollowStory({ id: f.id, headline: f.headline }); setFollowV(v => v + 1); }}>
                      <Text style={styles.followUnfollow}>Unfollow</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      })()}

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
    <View style={styles.container} onLayout={layout.onLayout}>
    <Animated.View style={{ flex: 1, opacity: feedOpacity }}>
      <FlatList
        ref={listRef}
        data={(activeTopic === 'myspace' ? myspaceFlatItems : rankedClusterGroups) as any[]}
        keyExtractor={(item: any) => item.id}
        extraData={[activeTopic, expandedTopics]}
        onScroll={handleFeedScroll}
        scrollEventThrottle={16}
        renderItem={({ item }: { item: any }) => {
          if (item.type === 'zone-header') {
            return (
              <Pressable onPress={() => setExpandedTopics(prev =>
                prev.includes(item.category) ? prev.filter((c: string) => c !== item.category) : [...prev, item.category]
              )} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: item.color }} />
                  <Ionicons name={item.icon} size={16} color={item.color} />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.8 }}>{item.label.toUpperCase()}</Text>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: '#666', fontSize: 11, fontWeight: '600' }}>{item.total}</Text>
                  </View>
                </View>
                <Ionicons name={item.expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#555" />
              </Pressable>
            );
          }
          if (item.type === 'zone-more') {
            return (
              <Pressable onPress={() => setExpandedTopics(prev => [...prev, item.category])}
                style={{ marginHorizontal: 20, marginBottom: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                <Text style={{ color: '#888', fontSize: 12, fontWeight: '600' }}>Show {item.remaining} more</Text>
              </Pressable>
            );
          }
          const cluster: Cluster = item.type === 'zone-cluster' ? item.cluster : item;
          return (
            <TopicSection
              cluster={cluster}
              isBreaking={cluster.isBreaking ?? false}
              catColor={activeCat.color}
              cardWidth={cardWidth}
              allStories={allArticles}
              onCarouselRef={ref => { carouselRefs.current[cluster.id] = ref; }}
              onCarouselScroll={x => { carouselOffsets.current[cluster.id] = x; }}
            />
          );
        }}
        onScrollToIndexFailed={(info) => {
          // Item not yet rendered — scroll close via offset, then retry once
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          if (scrollFailTimerRef.current) clearTimeout(scrollFailTimerRef.current);
          scrollFailTimerRef.current = setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 });
          }, 300);
        }}
        ListHeaderComponent={feedHeader}
        ListEmptyComponent={
          loading ? (
            <FeedSkeleton />
          ) : error ? (
            <View style={[styles.center, { height: 300 }]}>
              <Text style={styles.errorText}>Failed to load</Text>
              <Text style={styles.errorDetail}>{error}</Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        // Anchors visible row so async AI-summary height changes above don't
        // push it (root cause of fold-open bounce-loop on long feeds).
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        // STATIC props — must NOT depend on cardWidth. Earlier they flipped
        // at the 480 fold threshold, forcing FlatList to re-virtualize mid-
        // fold and jump the visible row. removeClippedSubviews=false also
        // eliminates the Android variable-height bounce universally.
        removeClippedSubviews={false}
        maxToRenderPerBatch={4}
        windowSize={9}
        initialNumToRender={3}
        updateCellsBatchingPeriod={50}
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
          <View style={{ height: insets.bottom + 100 }} />
        }
      />
    </Animated.View>
    <StreakMilestoneModal milestone={milestone} onClose={() => setMilestone(null)} />
    </View>
  );
}

// ── Streak milestone celebration ─────────────────────────────────────────────
function StreakMilestoneModal({ milestone, onClose }: { milestone: number | null; onClose: () => void }) {
  return (
    <Modal visible={milestone != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={msStyles.backdrop} onPress={onClose}>
        <Pressable style={msStyles.card} onPress={() => {}}>
          <Text style={msStyles.flame}>🔥</Text>
          <Text style={msStyles.big}>{milestone}-Day Streak!</Text>
          <Text style={msStyles.sub}>
            You&apos;ve read the news {milestone} day{milestone === 1 ? '' : 's'} in a row. Keep it going — come back tomorrow to extend it.
          </Text>
          <Pressable style={msStyles.btn} onPress={onClose} hitSlop={8}>
            <Text style={msStyles.btnText}>Keep reading</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const msStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { width: '100%', maxWidth: 340, backgroundColor: '#121218', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(185,148,255,0.35)', padding: 28, alignItems: 'center' },
  flame: { fontSize: 56, marginBottom: 6 },
  big: { color: '#FFF', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginBottom: 10, textAlign: 'center' },
  sub: { color: '#9a9aa5', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  btn: { backgroundColor: '#b994ff', borderRadius: 999, paddingVertical: 13, paddingHorizontal: 32 },
  btnText: { color: '#0a0a0f', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});

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
  isBreaking,
  cardWidth,
  allStories,
  onCarouselRef,
  onCarouselScroll,
}: {
  cluster: Cluster;
  catColor: string;
  isBreaking: boolean;
  cardWidth: number;
  allStories?: Story[];
  onCarouselRef?: (ref: ScrollView | null) => void;
  onCarouselScroll?: (x: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const count = cluster.stories.length;
  const navigation = useNavigation<NativeStackNavigationProp<FeedStackParamList>>();
  const { showMetaPill, showClusterSummary, cardDensity } = useSettings();

  // Cluster cards stay 82% width to hint there's more to swipe, but use the
  // FULL-WIDTH image height so they feel as tall as individual cards.
  const clusterCardWidth = count > 1 ? Math.round(cardWidth * 0.82) : cardWidth;
  const densityScale = cardDensity === 'compact' ? 0.55 : cardDensity === 'spacious' ? 0.85 : 0.72;
  const clusterImageHeight = Math.round(cardWidth * densityScale);
  const snapInterval = clusterCardWidth + CARD_GAP;

  const onScrollSettle = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / snapInterval);
    setActiveIndex(Math.max(0, Math.min(idx, count - 1)));
  }, [snapInterval, count]);

  if (count === 1) {
    return (
      <View style={styles.section}>
        {showMetaPill && isBreaking && (
          <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
            <Text style={styles.breakingText}>BREAKING</Text>
          </View>
        )}
        <View style={{ alignItems: 'center' }}>
          <StoryCard story={cluster.stories[0]} cardWidth={cardWidth} allStories={allStories} />
        </View>
      </View>
    );
  }

  // Use the server's AI-generated cluster label + summary directly (matches web).
  // No per-cluster client AI calls — single source of truth, and saves 2 Groq
  // requests per cluster per device (protects the daily token budget).
  const headline = cluster.topicLabel;
  const summary = cluster.summary;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          {/* Meta row — TREND/BREAKING pills only */}
          {showMetaPill && (cluster.collection || isBreaking) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {cluster.collection && (
                <Text style={{ color: '#b994ff', fontSize: 9, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(185,148,255,0.12)' }}>TREND</Text>
              )}
              {isBreaking && <Text style={styles.breakingText}>BREAKING</Text>}
            </View>
          )}
          {/* Headline row — clock prefix + headline + stories pill inline */}
          <TouchableOpacity
            activeOpacity={0.65}
            onPress={() => navigation.navigate('StoryTimeline', { clusterId: cluster.id, headline, stories: JSON.stringify(cluster.stories) })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              {count > 1 && (
                <Ionicons name="time-outline" size={14} color="#5A5A5A" style={{ marginTop: 4 }} />
              )}
              <Text style={[styles.clusterHeadline, { flex: 1 }]} numberOfLines={2}>{headline}</Text>
              {showMetaPill && count > 1 && (
                <View style={[styles.clusterCountPill, { marginTop: 2 }]}>
                  <Text style={styles.clusterCountPillText}>{count}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* AI summary of all clustered stories — ~20 words */}
          {showClusterSummary && !!summary && (
            <Text style={[styles.clusterSummary, { marginTop: 6 }]}>{summary}</Text>
          )}

          {/* Bias spectrum + diversity badge (count pill moved to headline row) */}
          {!!cluster.biasBreakdown && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {cluster.biasBreakdown && <BiasSpectrum breakdown={cluster.biasBreakdown} />}
              {cluster.biasBreakdown?.diversity && (
                <View style={styles.diversityBadge}>
                  <Text style={styles.diversityText}>Multi-perspective</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      <ScrollView
        ref={onCarouselRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        contentContainerStyle={[styles.carouselContent, { paddingLeft: 16, paddingRight: 16 }]}
        onMomentumScrollEnd={onScrollSettle}
        onScrollEndDrag={onScrollSettle}
        onScroll={e => onCarouselScroll?.(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={200}
        removeClippedSubviews
      >
        {cluster.stories.map((story, i) => (
          <View key={story.id} style={i < cluster.stories.length - 1 ? { marginRight: CARD_GAP } : undefined}>
            <StoryCard
              story={story}
              cardWidth={clusterCardWidth}
              imageHeight={clusterImageHeight}
              allStories={allStories}
            />
          </View>
        ))}
      </ScrollView>

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
  streakChip: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,149,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,149,0,0.3)' },
  streakChipText: { color: '#FF9F0A', fontSize: 13, fontWeight: '800' },
  followHeader: { color: '#666', fontSize: 11, fontWeight: '800', letterSpacing: 1.4, paddingHorizontal: 16, marginBottom: 10 },
  followCard: { width: 200, padding: 12, borderRadius: 14, backgroundColor: '#0E0E0E', borderWidth: 1, borderColor: '#1A1A1A' },
  followCardNew: { backgroundColor: 'rgba(185,148,255,0.12)', borderColor: 'rgba(185,148,255,0.4)' },
  followNewBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(185,148,255,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginBottom: 6 },
  followNewText: { color: '#b994ff', fontSize: 9, fontWeight: '800' },
  followCardText: { color: '#ddd', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  followUnfollow: { color: '#666', fontSize: 11, fontWeight: '600', marginTop: 8 },
  appIcon: {
    width: 87, height: 87,
    marginVertical: -12, marginHorizontal: -8,
    backgroundColor: 'transparent',
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
  breakingText: { color: '#FF3B30', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
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
  clusterMeta: { color: '#555', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  clusterCountPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  clusterCountPillText: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  diversityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: 'rgba(100,180,100,0.12)', borderWidth: 1, borderColor: 'rgba(100,200,100,0.2)' },
  diversityText: { color: 'rgba(100,200,100,0.8)', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  clusterHeadline: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 24, letterSpacing: -0.2 },
  clusterSummary: { color: '#666', fontSize: 13, fontWeight: '400', lineHeight: 18, marginTop: 3 },
  clusterCountBox: { alignItems: 'center', minWidth: 48 },
  clusterCountNum: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', lineHeight: 28 },
  clusterCountWord: { color: '#444444', fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  carouselContent: { alignItems: 'flex-start' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#2E2E2E' },
  dotActive: { backgroundColor: '#FFFFFF', width: 16 },

  errorText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  errorDetail: { color: '#555', fontSize: 13 },

  // Tech source filter icon chips
  srcChip: {
    alignItems: 'center',
    gap: 5,
    width: 52,
  },
  srcCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  srcCircleActive: {
    backgroundColor: 'rgba(74,144,217,0.15)',
    borderColor: '#4A90D9',
  },
  srcChipLabel: {
    color: '#666',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  srcChipLabelActive: {
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
