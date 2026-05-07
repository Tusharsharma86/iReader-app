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
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Story, StoryCard } from '../components/StoryCard';
import { FeedStackParamList } from '../types/navigation';
import { useSource } from '../contexts/SourceContext';
import { loadCachedFeed, saveFeedCache } from '../utils/feedCache';
import { rankStories } from '../utils/personalization';

const CARD_GAP = 12;

// useWindowDimensions fires on fold-open but Samsung foldables sometimes skip
// the event on fold-close (app is briefly backgrounded). Dimensions.addEventListener
// catches it as a fallback so cardWidth always reflects the actual screen size.
function useLayout() {
  const { width: hookWidth } = useWindowDimensions();
  const [dimWidth, setDimWidth] = useState(() => Dimensions.get('window').width);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDimWidth(window.width);
    });
    return () => sub.remove();
  }, []);

  // Use whichever source gave the most recent value
  const width = Math.abs(hookWidth - dimWidth) < 1 ? hookWidth : dimWidth;
  const isTablet = width >= 768;
  const cardWidth = isTablet ? Math.round(width * 0.46) : width - 28;
  return {
    screenWidth: width,
    cardWidth,
    snapInterval: cardWidth + CARD_GAP,
    hPadding: Math.round((width - cardWidth) / 2),
    isTablet,
  };
}

const API_BASE = 'https://ireader.onrender.com/api/news/feed';

const CATEGORIES = [
  { topic: 'breaking',      label: 'Breaking', icon: '🔴' },
  { topic: 'technology',    label: 'Tech',     icon: '💻' },
  { topic: 'india-politics',label: 'India',    icon: '🇮🇳' },
  { topic: 'geopolitics',   label: 'World',    icon: '🌍' },
  { topic: 'markets',       label: 'Markets',  icon: '📈' },
  { topic: 'business',      label: 'Business', icon: '💼' },
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

interface TopicGroup {
  id: string;
  headline: string;
  summary: string;
  imageUrl: string;
  publishedAt: string;
  sources: { name: string; url: string; imageUrl?: string; publishedAt: string }[];
}

function dedupeByHeadline(stories: Story[]): Story[] {
  const seen = new Set<string>();
  return stories.filter(s => {
    const source = s.sources?.[0]?.name ?? '';
    const headline = s.headline.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const key = `${source}::${headline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupByTopic(stories: Story[]): TopicGroup[] {
  const deduped = dedupeByHeadline(stories);
  const groups: TopicGroup[] = [];
  const used = new Set<string>();

  for (const story of deduped) {
    if (used.has(story.id)) continue;

    const storyWords = new Set(
      story.headline.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 4),
    );

    const seedSource = story.sources?.[0]?.name;

    const related = deduped.filter(other => {
      if (other.id === story.id || used.has(other.id)) return false;
      if (seedSource && other.sources?.[0]?.name === seedSource) return false;
      const otherWords = new Set(
        other.headline.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 4),
      );
      const shared = [...storyWords].filter(w => otherWords.has(w));
      return shared.length >= 2;
    });

    const group = [story, ...related];
    group.forEach(s => used.add(s.id));

    groups.push({
      id: story.id,
      headline: story.headline,
      summary: story.summary,
      imageUrl: story.imageUrl,
      publishedAt: story.publishedAt,
      sources: group.map(s => ({
        name: s.sources?.[0]?.name ?? 'Unknown',
        url: s.sources?.[0]?.url ?? '',
        imageUrl: s.imageUrl,
        publishedAt: s.publishedAt,
      })),
    });
  }
  return groups;
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
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [pendingStories, setPendingStories] = useState<Story[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const lastFetchRef = useRef<number>(0);
  const activeTopicRef = useRef(activeTopic);
  const pageRef = useRef(1); // always current — avoids stale closure in loadMore
  useEffect(() => { activeTopicRef.current = activeTopic; }, [activeTopic]);
  useEffect(() => { pageRef.current = page; }, [page]);

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
  ): Promise<{ stories: Story[]; serverHasMore: boolean }> {
    const res = await fetch(`${API_BASE}?topic=${topic}&page=${pageNum}&limit=20`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { stories: Story[]; total?: number; page?: number; limit?: number };
    const raw = data.stories ?? [];
    const total = data.total ?? 0;
    // Use server-provided total to know if there are more pages
    const fetched = (pageNum - 1) * 20 + raw.length;
    const serverHasMore = total > 0 ? fetched < total : raw.length >= 20;
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

  // Topic change: serve cache instantly, then revalidate in background
  useEffect(() => {
    setLoading(true);
    setAllStories([]);
    setPendingStories(null);
    setNewCount(0);
    setHasMore(true);
    setPage(1);
    pageRef.current = 1;

    loadCachedFeed(activeTopic).then(async cached => {
      if (cached && cached.stories.length > 0) {
        setAllStories(filterStories(cached.stories));
        setHasMore(true); // corrected on first loadMore call
        setLoading(false);
        if (cached.isStale) {
          backgroundRefresh(activeTopic, filterStories(cached.stories));
        }
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPendingStories(null);
    setNewCount(0);
    try {
      const { stories, serverHasMore } = await fetchPage(activeTopic, 1);
      setAllStories(stories);
      setPage(1);
      pageRef.current = 1;
      setHasMore(serverHasMore);
      lastFetchRef.current = Date.now();
      saveFeedCache(activeTopic, stories);
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
    if (loadingMore || !hasMore) return;
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
      setPage(nextPage);
    } catch {
      // silently ignore — hasMore stays true so next scroll retries
    } finally {
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, activeTopic]); // page removed — using pageRef instead

  const visibleStories = useMemo(
    () => rankStories(allStories.filter(s => activeSources[s.sources?.[0]?.name ?? ''] !== false)),
    [allStories, activeSources],
  );

  const allSections = useMemo(() => groupBySource(visibleStories), [visibleStories]);
  const topicGroups = useMemo(() => groupByTopic(visibleStories), [visibleStories]);

  const isBreaking = activeTopic === 'breaking';

  const { cardWidth, snapInterval, hPadding, isTablet } = layout;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Image source={require('../assets/icon.png')} style={styles.appIcon} contentFit="cover" />
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.date}>{formattedDate()}</Text>
          </View>
        </View>
      </View>

      {/* Category tabs */}
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
                onPress={() => setActiveTopic(cat.topic)}
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
                <Text
                  style={{
                    color: active ? '#000000' : '#AAAAAA',
                    fontSize: 11,
                    fontWeight: '700',
                    marginTop: 2,
                  }}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* New stories banner */}
      {newCount > 0 && (
        <Pressable onPress={applyPending} style={styles.newBanner}>
          <Text style={styles.newBannerText}>
            ↑ {newCount} new {newCount === 1 ? 'story' : 'stories'} — tap to refresh
          </Text>
        </Pressable>
      )}

      {/* Feed */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4A90D9" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Failed to load</Text>
          <Text style={styles.errorDetail}>{error}</Text>
        </View>
      ) : (
        /* All tabs — topic-grouped carousels */
        <FlatList
          key={isTablet ? 'feed-tablet' : 'feed-phone'}
          ref={listRef}
          data={topicGroups}
          keyExtractor={g => g.id}
          extraData={cardWidth}
          renderItem={({ item }) => (
            <TopicSection group={item} isBreaking={isBreaking} cardWidth={cardWidth} snapInterval={snapInterval} hPadding={hPadding} allStories={visibleStories} />
          )}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={3}
          windowSize={5}
          initialNumToRender={3}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={isBreaking ? '#FF3333' : '#AAAAAA'}
            />
          }
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 24 }} />
              : <View style={{ height: 40 }} />
          }
        />
      )}
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

// ── Topic Section (non-tech tabs — one carousel row per topic cluster) ────────
const TopicSection = React.memo(function TopicSection({
  group,
  isBreaking,
  cardWidth,
  snapInterval,
  hPadding,
  allStories,
}: {
  group: TopicGroup;
  isBreaking: boolean;
  allStories?: Story[];
} & LayoutProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sourceCount = group.sources.length;

  const onScrollSettle = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / snapInterval);
    setActiveIndex(Math.max(0, Math.min(idx, sourceCount - 1)));
  }, [snapInterval, sourceCount]);

  // Build one StoryCard-compatible story per source in the group
  const stories: Story[] = group.sources.map((src, i) => ({
    id: `${group.id}-${i}`,
    headline: group.headline,
    summary: group.summary,
    imageUrl: group.imageUrl,
    publishedAt: src.publishedAt || group.publishedAt,
    sources: [src],
  }));

  if (sourceCount === 1) {
    // Single article — no header, full card with its own headline/summary
    return (
      <View style={[styles.section, { alignItems: 'center' }]}>
        <StoryCard story={stories[0]} cardWidth={cardWidth} allStories={allStories} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {/* Header only for grouped (multi-source) clusters */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionTitleRow, { flex: 1, paddingRight: 8 }]}>
          {isBreaking && <View style={styles.breakingDot} />}
          <Text style={styles.sectionTitle} numberOfLines={2}>{group.headline}</Text>
        </View>
        <Text style={styles.sectionCount} numberOfLines={1}>{sourceCount} sources</Text>
      </View>

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
        {stories.map((story, i) => (
          <View key={story.id} style={i < stories.length - 1 ? { marginRight: CARD_GAP } : undefined}>
            <StoryCard story={story} compact cardWidth={cardWidth} allStories={allStories} />
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {stories.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  appIcon: { width: 44, height: 44, borderRadius: 11 },
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
  section: { marginBottom: 32 },
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
  sectionTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sectionCount: { color: '#444444', fontSize: 13, fontWeight: '500' },
  carouselContent: { alignItems: 'flex-start' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#333333' },
  dotActive: { backgroundColor: '#FFFFFF', width: 18 },

  errorText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  errorDetail: { color: '#555', fontSize: 13 },

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
