import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Story, StoryCard } from '../components/StoryCard';
import { useSource } from '../contexts/SourceContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.82);
const CARD_GAP = 12;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;
const H_PADDING = Math.round((SCREEN_WIDTH - CARD_WIDTH) / 2);

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
  'NDTV': 'ndtv.com',
  'Times of India': 'timesofindia.indiatimes.com',
  'The Hindu': 'thehindu.com',
  'Indian Express': 'indianexpress.com',
  'BBC World': 'bbc.co.uk',
  'NYT World': 'nytimes.com',
  'Foreign Policy': 'foreignpolicy.com',
  'Al Jazeera': 'aljazeera.com',
  'Bloomberg': 'bloomberg.com',
  'CNBC': 'cnbc.com',
  'Reuters': 'reuters.com',
  'Economic Times': 'economictimes.indiatimes.com',
  'Forbes': 'forbes.com',
  'Entrepreneur': 'entrepreneur.com',
  'HBR': 'hbr.org',
  'Republic World': 'republicworld.com',
  'ANI News': 'aninews.in',
  'Zee News': 'zeenews.india.com',
  'India Today': 'indiatoday.in',
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

const cardMargin = (i: number, total: number) =>
  i < total - 1 ? { marginRight: CARD_GAP } : undefined;

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

export default function FeedScreen() {
  const [activeTopic, setActiveTopic] = useState<CategoryTopic>('breaking');
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchPage(topic: CategoryTopic, pageNum: number): Promise<Story[]> {
    const res = await fetch(`${API_BASE}?topic=${topic}&page=${pageNum}&limit=20`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { stories: Story[] };
    return (data.stories ?? []).filter(
      s => !DEVANAGARI_RE.test(s.headline) && !BLOCKED_TOPICS_RE.test(s.headline),
    );
  }

  async function loadFeed(topic: CategoryTopic) {
    try {
      const stories = await fetchPage(topic, 1);
      setAllStories(stories);
      setPage(1);
      setHasMore(stories.length >= 20);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    setLoading(true);
    setAllStories([]);
    setHasMore(true);
    loadFeed(activeTopic).finally(() => setLoading(false));
  }, [activeTopic]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed(activeTopic);
    setRefreshing(false);
  }, [activeTopic]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const more = await fetchPage(activeTopic, nextPage);
      setAllStories(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newOnes = more.filter(s => !existingIds.has(s.id));
        if (newOnes.length === 0) setHasMore(false);
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
      if (more.length > 0) setPage(nextPage);
    } catch {
      // silently ignore loadMore errors
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, activeTopic]);

  const allSections = useMemo(() => groupBySource(allStories), [allStories]);
  const topicGroups = useMemo(() => groupByTopic(allStories), [allStories]);

  const isBreaking = activeTopic === 'breaking';
  const isTech = activeTopic === 'technology';

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
      ) : isTech ? (
        /* Technology — virtualized source-grouped carousel */
        <FlatList
          data={allSections}
          keyExtractor={s => s.title}
          renderItem={({ item }) => <CarouselSection section={item} />}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={3}
          windowSize={5}
          initialNumToRender={3}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4A90D9" />}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 24 }} />
              : <View style={{ height: 40 }} />
          }
        />
      ) : (
        /* Breaking + all other tabs — topic-grouped carousels */
        <FlatList
          data={topicGroups}
          keyExtractor={g => g.id}
          renderItem={({ item }) => (
            <TopicSection group={item} isBreaking={isBreaking} />
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

// ── Carousel Section (Technology only) ───────────────────────────────────────
const CarouselSection = React.memo(function CarouselSection({ section }: { section: Section }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const favicon = faviconUrl(section.title);
  const keywords = useMemo(() => extractKeywords(section.stories), [section.stories]);

  const onScrollSettle = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SNAP_INTERVAL);
    setActiveIndex(Math.max(0, Math.min(idx, section.stories.length - 1)));
  }, [section.stories.length]);

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

      {/* Topic hashtags */}
      {keywords.length > 0 && (
        <View style={styles.keywords}>
          {keywords.map((tag, i) => {
            const c = TAG_COLORS[i % TAG_COLORS.length];
            return (
              <Text key={tag} style={[styles.keywordTag, { color: c.text, backgroundColor: c.bg }]}>
                {tag}
              </Text>
            );
          })}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        contentContainerStyle={[styles.carouselContent, { paddingLeft: H_PADDING, paddingRight: 16 }]}
        onMomentumScrollEnd={onScrollSettle}
        onScrollEndDrag={onScrollSettle}
        scrollEventThrottle={200}
        removeClippedSubviews
      >
        {section.stories.map((story, i) => (
          <View key={story.id} style={cardMargin(i, section.stories.length)}>
            <StoryCard story={story} />
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
}: {
  group: TopicGroup;
  isBreaking: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sourceCount = group.sources.length;

  const onScrollSettle = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SNAP_INTERVAL);
    setActiveIndex(Math.max(0, Math.min(idx, sourceCount - 1)));
  }, [sourceCount]);

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
        <StoryCard story={stories[0]} />
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
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        contentContainerStyle={[styles.carouselContent, { paddingLeft: H_PADDING, paddingRight: 16 }]}
        onMomentumScrollEnd={onScrollSettle}
        onScrollEndDrag={onScrollSettle}
        scrollEventThrottle={200}
        removeClippedSubviews
      >
        {stories.map((story, i) => (
          <View key={story.id} style={cardMargin(i, stories.length)}>
            <StoryCard story={story} compact />
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
    width: CARD_WIDTH, marginBottom: 8,
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
});
