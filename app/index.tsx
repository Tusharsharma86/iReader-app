import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Story, StoryCard } from '../components/StoryCard';
import { useSettings } from '../contexts/SettingsContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.82);
const CARD_GAP = 12;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;
const H_PADDING = Math.round((SCREEN_WIDTH - CARD_WIDTH) / 2);
const MAX_STORIES_PER_SECTION = 10;

// Priority order for section display
const PREFERRED_SOURCES = ['TechCrunch', 'The Verge', 'Ars Technica', 'Wired'];
const API_URL = 'https://ireader.onrender.com/api/news/feed?topic=technology';

// Google favicon service — works for any domain
const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch': 'techcrunch.com',
  'The Verge': 'theverge.com',
  'Ars Technica': 'arstechnica.com',
  'Wired': 'wired.com',
  'Hacker News': 'news.ycombinator.com',
  '9to5Mac': '9to5mac.com',
  'MIT Tech Review': 'technologyreview.com',
  'Engadget': 'engadget.com',
  'VentureBeat': 'venturebeat.com',
};

function faviconUrl(sourceName: string): string | null {
  const domain = SOURCE_DOMAINS[sourceName];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
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

  return ordered.map(src => ({
    title: src,
    stories: map.get(src)!.slice(0, MAX_STORIES_PER_SECTION),
  }));
}

export default function FeedScreen() {
  const { activeSources } = useSettings();
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadFeed() {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { stories: Story[] };
      setAllSections(groupBySource(data.stories ?? []));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadFeed().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  }, []);

  // Only hide a source if it's explicitly set to false — unknown sources show by default
  const sections = allSections.filter(s => activeSources[s.title] !== false);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4A90D9" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Image
              source={require('../assets/icon.png')}
              style={styles.appIcon}
              contentFit="cover"
            />
            <View>
              <Text style={styles.greeting}>{greeting()}</Text>
              <Text style={styles.date}>{formattedDate()}</Text>
            </View>
          </View>
        </View>

        {/* Sections */}
        {sections.map((section) => (
          <CarouselSection key={section.title} section={section} />
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Carousel Section ──────────────────────────────────────
function CarouselSection({ section }: { section: Section }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const favicon = faviconUrl(section.title);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SNAP_INTERVAL);
    setActiveIndex(Math.max(0, Math.min(idx, section.stories.length - 1)));
  }

  return (
    <View style={styles.section}>
      {/* Section header with source icon */}
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

      {/* Horizontal carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        contentContainerStyle={[
          styles.carouselContent,
          { paddingLeft: H_PADDING, paddingRight: 16 },
        ]}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {section.stories.map((story, i) => (
          <View
            key={story.id}
            style={{ marginRight: i < section.stories.length - 1 ? CARD_GAP : 0 }}
          >
            <StoryCard story={story} />
          </View>
        ))}
      </ScrollView>

      {/* Dot pagination */}
      {section.stories.length > 1 && (
        <View style={styles.dots}>
          {section.stories.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  greeting: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 },
  date: { color: '#555555', fontSize: 13, fontWeight: '500', marginTop: 2 },

  section: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sourceIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
  },
  sourceIconFallback: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
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
