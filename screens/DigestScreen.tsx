import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import type { Story } from '../components/StoryCard';
import { FeedStackParamList } from '../types/navigation';
import { trackArticleOpen } from '../utils/personalization';
import { darken, lighten, getArticleColor } from '../utils/colors';
import { useTabBarAutoHide } from '../utils/tabBarAnim';

const FEED_API = 'https://ireader.onrender.com/api/news/feed';
const AI_SUMMARY_API = 'https://ireader.onrender.com/api/news/ai-summary';
const SNAPSHOT_KEY_PREFIX = '@digest_snapshot_';
const YESTERDAY_KEY = '@digest_yesterday_v1';

type Nav = NativeStackNavigationProp<FeedStackParamList>;

interface ApiItem {
  type?: string;
  topicTitle?: string;
  topicSummary?: string;
  articles?: Story[];
  _category?: string;
  category?: string;
}

interface CategorySection {
  key: string;
  label: string;
  emoji: string;
  oneLiner: string;
  stories: Story[];
}

interface NumberCallout {
  value: string;
  label: string;
}

interface Snapshot {
  date: string; // YYYY-MM-DD
  generatedAt: number;
  hero: { story: Story; bullets: string[] } | null;
  sections: CategorySection[];
  numbers: NumberCallout[];
  totalStories: number;
  totalSources: number;
  estimatedReadMin: number;
}

const CATEGORY_DEFS: Array<{ key: string; label: string; emoji: string; topic?: string }> = [
  { key: 'breaking',   label: 'Breaking',  emoji: '🔴', topic: 'breaking' },
  { key: 'india',      label: 'India',     emoji: '🇮🇳', topic: 'india-politics' },
  { key: 'world',      label: 'World',     emoji: '🌍', topic: 'geopolitics' },
  { key: 'markets',    label: 'Markets',   emoji: '📈', topic: 'markets' },
  { key: 'tech',       label: 'Tech',      emoji: '💻', topic: 'technology' },
  { key: 'business',   label: 'Business',  emoji: '💼', topic: 'business' },
];

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function dateLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function wordCount(s: string): number {
  return (s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

function flatten(items: ApiItem[]): Story[] {
  return items.flatMap(it =>
    it.type === 'cluster' ? (it.articles ?? []) : [it as unknown as Story],
  );
}

// Extract striking numbers from headlines for the "Numbers of the day" widget.
const NUMBER_RE = /(?:Rs\.?\s*|₹|\$)?[\d,]+(?:\.\d+)?\s*(?:%|million|billion|crore|lakh|trillion|°C|°F|km|kg|MW|GW|deaths|injured|killed|people|years|days|hours|points|stocks|jobs|votes|seats)/gi;

function extractNumber(text: string): string | null {
  const matches = text.match(NUMBER_RE);
  if (!matches) return null;
  return matches[0].trim().replace(/^Rs\.?\s*/i, '₹').slice(0, 24);
}

const LIVE_BLOG_RE = /\b(live( blog| updates?)?|live:|\s[-–]\s*live\s*$|rolling coverage|as it happens)\b/i;

// Count words (4+ chars) shared between headline and cluster topic label.
// Higher = article is actually about the cluster topic.
function topicMatchScore(headline: string, topicTitle: string): number {
  if (!topicTitle || !headline) return 0;
  const topicWords = new Set((topicTitle.toLowerCase().match(/[a-z]{4,}/g) ?? []));
  return (headline.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(w => topicWords.has(w)).length;
}

function clusterCoherence(articles: Story[], topicTitle: string): number {
  return articles.filter(a => topicMatchScore(a.headline ?? '', topicTitle) > 0).length;
}

async function fetchTopicFeed(topic: string): Promise<Story[]> {
  try {
    const url = `${FEED_API}?topic=${topic}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = await res.json();
    const items: ApiItem[] = Array.isArray(raw) ? raw : Array.isArray(raw?.feed) ? raw.feed : [];

    const results: Story[] = [];
    for (const it of items) {
      if (it.type === 'cluster') {
        const topicTitle = String((it as any).topicTitle ?? '');
        const articles = (it.articles ?? []) as Story[];
        const allSources = [...new Set(articles.flatMap(a => (a.sources ?? []).map(s => s.name)).filter(Boolean))];

        // Gate 1: 2+ unique sources
        if (allSources.length < 2) continue;
        // Gate 2: coherence — 2+ articles match topicTitle keywords
        if (topicTitle && clusterCoherence(articles, topicTitle) < 2) continue;

        const nonLive = articles.filter(s => !LIVE_BLOG_RE.test(s.headline ?? ''));
        const pool = nonLive.length > 0 ? nonLive : articles;
        const rep = pool.slice().sort((a, b) => {
          const aScore = (a.sources?.length ?? 0) * 2 + topicMatchScore(a.headline ?? '', topicTitle);
          const bScore = (b.sources?.length ?? 0) * 2 + topicMatchScore(b.headline ?? '', topicTitle);
          return bScore - aScore;
        })[0];

        // Gate 3: chosen rep must share at least one keyword with topicTitle
        if (rep && topicTitle && topicMatchScore(rep.headline ?? '', topicTitle) === 0) continue;
        if (rep) results.push(rep);
      } else {
        const story = it as unknown as Story;
        const srcCount = [...new Set((story.sources ?? []).map(s => s.name).filter(Boolean))].length;
        if (story.headline && !LIVE_BLOG_RE.test(story.headline) && srcCount >= 2) results.push(story);
      }
    }

    return results
      .sort((a, b) => (b.sources?.length ?? 0) - (a.sources?.length ?? 0))
      .slice(0, 10);
  } catch { return []; }
}

async function aiBullets(text: string, type: 'bullets' | 'summary' = 'bullets'): Promise<string[]> {
  try {
    const res = await fetch(AI_SUMMARY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paragraphs: [text.slice(0, 1500)],
        type,
        maxWords: 120,
      }),
    });
    if (!res.ok) return [];
    const data: { bullets?: string[]; summary?: string } = await res.json();
    if (Array.isArray(data.bullets)) return data.bullets.slice(0, 3);
    if (data.summary) return [data.summary];
  } catch {}
  return [];
}

async function buildSnapshot(): Promise<Snapshot> {
  // Pull each category in parallel
  const sectionsRaw = await Promise.all(
    CATEGORY_DEFS.map(async def => ({
      def,
      stories: def.topic ? await fetchTopicFeed(def.topic) : [],
    })),
  );

  const allStories: Story[] = [];
  const sources = new Set<string>();
  for (const s of sectionsRaw) {
    for (const story of s.stories) {
      allStories.push(story);
      story.sources?.forEach(src => sources.add(src.name));
    }
  }

  // Hero: pick the breaking story or the one with most sources
  const heroPool = sectionsRaw[0]?.stories.length ? sectionsRaw[0].stories : allStories;
  const heroStory = heroPool.slice().sort((a, b) =>
    (b.sources?.length ?? 0) - (a.sources?.length ?? 0),
  )[0];
  let heroBullets: string[] = [];
  if (heroStory) {
    heroBullets = await aiBullets(
      `${heroStory.headline}. ${heroStory.summary ?? ''}`,
      'bullets',
    );
    if (heroBullets.length === 0 && heroStory.summary) {
      heroBullets = [heroStory.summary];
    }
  }

  // Build category sections — top 5 per topic + one-liner from first story
  const sections: CategorySection[] = sectionsRaw
    .map(({ def, stories }) => {
      const top5 = stories.slice(0, 5);
      const oneLiner = top5[0]?.summary?.slice(0, 140) ?? '';
      return {
        key: def.key,
        label: def.label,
        emoji: def.emoji,
        oneLiner,
        stories: top5,
      };
    })
    .filter(s => s.stories.length > 0);

  // Numbers of the day — scan top headlines for striking figures
  const numbers: NumberCallout[] = [];
  const seenNumbers = new Set<string>();
  for (const s of allStories.slice(0, 30)) {
    const n = extractNumber(`${s.headline} ${s.summary ?? ''}`);
    if (n && !seenNumbers.has(n)) {
      seenNumbers.add(n);
      // Generate a label from the headline subject
      const labelWords = s.headline
        .split(/\s+/)
        .filter(w => /^[A-Z]/.test(w) && w.length > 2)
        .slice(0, 2)
        .join(' ');
      numbers.push({
        value: n,
        label: (labelWords || s.sources?.[0]?.name || '').toUpperCase().slice(0, 20),
      });
      if (numbers.length >= 3) break;
    }
  }

  // Estimate read time — sum word counts of bullets + summaries / 200wpm
  const totalWords =
    wordCount(heroBullets.join(' ')) +
    sections.reduce((sum, sec) =>
      sum + sec.stories.reduce((s, st) => s + wordCount(st.summary ?? '') / 3, 0), 0);

  return {
    date: todayKey(),
    generatedAt: Date.now(),
    hero: heroStory ? { story: heroStory, bullets: heroBullets } : null,
    sections,
    numbers,
    totalStories: allStories.length,
    totalSources: sources.size,
    estimatedReadMin: Math.max(3, Math.round(totalWords / 200)),
  };
}

export default function DigestScreen() {
  const navigation = useNavigation<Nav>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [yesterdaySnapshot, setYesterdaySnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async (force = false) => {
    setError(null);
    const dateKey = todayKey();
    const cacheKey = SNAPSHOT_KEY_PREFIX + dateKey;

    if (!force) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed: Snapshot = JSON.parse(cached);
          if (parsed.date === dateKey) {
            setSnapshot(parsed);
            setLoading(false);
            // also load yesterday in background
            loadYesterday();
            return;
          }
        }
      } catch {}
    }

    try {
      const snap = await buildSnapshot();
      if (snap.sections.length === 0 && !snap.hero) {
        throw new Error('Empty digest');
      }
      setSnapshot(snap);
      AsyncStorage.setItem(cacheKey, JSON.stringify(snap)).catch(() => {});

      // Roll today's snapshot to "yesterday" slot for tomorrow's recap
      AsyncStorage.setItem(YESTERDAY_KEY, JSON.stringify(snap)).catch(() => {});
    } catch (e) {
      setError(`Could not build digest: ${String(e)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadYesterday = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(YESTERDAY_KEY);
      if (raw) {
        const parsed: Snapshot = JSON.parse(raw);
        if (parsed.date && parsed.date !== todayKey()) {
          setYesterdaySnapshot(parsed);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
    loadYesterday();
  }, [load, loadYesterday]);

  // Stop TTS when leaving the screen
  useFocusEffect(useCallback(() => {
    return () => { Speech.stop().catch(() => {}); setSpeaking(false); };
  }, []));

  const openArticle = useCallback((s: Story) => {
    trackArticleOpen(s);
    navigation.navigate('Article', {
      id: s.id,
      url: s.sources?.[0]?.url ?? '',
      image: s.imageUrl,
      headline: s.headline,
      summary: s.summary,
      source: s.sources?.[0]?.name ?? '',
      publishedAt: s.publishedAt,
      dominantColor: getArticleColor(s.id || s.headline),
      sources: JSON.stringify(s.sources ?? []),
      sourceBias: s.sourceBias,
    });
  }, [navigation]);

  // Build full speech text from snapshot for TTS
  const speechText = useMemo(() => {
    if (!snapshot) return '';
    const parts: string[] = [];
    parts.push(`${greeting()}. Here is your daily digest for ${dateLabel()}.`);
    if (snapshot.hero) {
      parts.push(`Top story: ${snapshot.hero.story.headline}.`);
      if (snapshot.hero.bullets.length) {
        parts.push(snapshot.hero.bullets.join('. '));
      }
    }
    for (const sec of snapshot.sections) {
      parts.push(`${sec.label}.`);
      sec.stories.forEach((st, i) => {
        parts.push(`${i + 1}. ${st.headline}.`);
      });
    }
    if (snapshot.numbers.length) {
      parts.push('Numbers of the day:');
      snapshot.numbers.forEach(n => parts.push(`${n.label}: ${n.value}.`));
    }
    return parts.join(' ');
  }, [snapshot]);

  const toggleSpeak = useCallback(async () => {
    if (speaking) {
      await Speech.stop().catch(() => {});
      setSpeaking(false);
      return;
    }
    if (!speechText) return;
    setSpeaking(true);
    Speech.speak(speechText, {
      rate: 0.95,
      pitch: 1.0,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, [speaking, speechText]);

  const toggleSection = useCallback((key: string) => {
    setCollapsed(c => ({ ...c, [key]: !c[key] }));
  }, []);

  const { onScroll: onTabBarScroll, restore: restoreTabBar } = useTabBarAutoHide();
  useFocusEffect(useCallback(() => () => restoreTabBar(), [restoreTabBar]));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onTabBarScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            tintColor="#888"
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{dateLabel().toUpperCase()}</Text>
            <Text style={styles.title}>{greeting()}.</Text>
            <Text style={styles.subtitle}>Your daily digest, distilled.</Text>
          </View>
        </View>

        {/* Quick stats row */}
        {snapshot && (
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{snapshot.estimatedReadMin}</Text>
              <Text style={styles.statLabel}>MIN READ</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{snapshot.totalStories}</Text>
              <Text style={styles.statLabel}>STORIES</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{snapshot.totalSources}</Text>
              <Text style={styles.statLabel}>SOURCES</Text>
            </View>
            <View style={styles.statDivider} />
            <Pressable onPress={toggleSpeak} style={styles.audioBtn} hitSlop={6}>
              <Ionicons
                name={speaking ? 'pause-circle' : 'play-circle'}
                size={26}
                color="#FFFFFF"
              />
              <Text style={styles.audioLabel}>{speaking ? 'PAUSE' : 'LISTEN'}</Text>
            </Pressable>
          </View>
        )}

        {/* Loading state */}
        {loading && !snapshot && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#888" />
            <Text style={styles.loadingText}>Building today's digest…</Text>
          </View>
        )}

        {/* Error state */}
        {error && !snapshot && (
          <View style={styles.loadingWrap}>
            <Ionicons name="cloud-offline-outline" size={28} color="#444" />
            <Text style={styles.loadingText}>{error}</Text>
            <Pressable onPress={() => { setLoading(true); load(true); }} style={styles.retryBtn}>
              <Text style={styles.retryText}>RETRY</Text>
            </Pressable>
          </View>
        )}

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        {snapshot?.hero && (() => {
          const { story, bullets } = snapshot.hero;
          const dominant = getArticleColor(story.id || story.headline);
          const accent = lighten(dominant, 0.45);
          return (
            <Pressable
              onPress={() => openArticle(story)}
              style={[styles.heroCard, { backgroundColor: darken(dominant, 0.3) }]}
            >
              <View style={styles.heroImageWrap}>
                {story.imageUrl ? (
                  <Image source={{ uri: story.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <LinearGradient
                    colors={[lighten(dominant, 0.2), dominant, darken(dominant, 0.3)]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                )}
                <LinearGradient
                  colors={['transparent', darken(dominant, 0.3)]}
                  locations={[0.4, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroTopBadge}>
                  <Ionicons name="star" size={10} color="#FFD166" />
                  <Text style={styles.heroTopBadgeText}>TOP STORY</Text>
                </View>
              </View>
              <View style={styles.heroBody}>
                <Text style={[styles.heroSource, { color: accent }]}>
                  {(story.sources?.[0]?.name ?? '').toUpperCase()}
                </Text>
                <Text style={styles.heroHeadline}>{story.headline}</Text>
                {bullets.length > 0 && (
                  <View style={styles.bulletList}>
                    {bullets.slice(0, 3).map((b, i) => (
                      <View key={i} style={styles.bulletRow}>
                        <View style={[styles.bulletDot, { backgroundColor: accent }]} />
                        <Text style={styles.bulletText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </Pressable>
          );
        })()}

        {/* ── Numbers of the day ────────────────────────────────────────── */}
        {snapshot && snapshot.numbers.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>NUMBERS OF THE DAY</Text>
            <View style={styles.numbersRow}>
              {snapshot.numbers.map((n, i) => (
                <View key={i} style={styles.numberCell}>
                  <Text style={styles.numberValue}>{n.value}</Text>
                  <Text style={styles.numberLabel} numberOfLines={1}>{n.label || '—'}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Category sections ─────────────────────────────────────────── */}
        {snapshot?.sections.map(section => {
          const isCollapsed = collapsed[section.key];
          return (
            <View key={section.key} style={styles.section}>
              <TouchableOpacity
                onPress={() => toggleSection(section.key)}
                style={styles.sectionHeader}
              >
                <Text style={styles.sectionEmoji}>{section.emoji}</Text>
                <Text style={styles.sectionTitle}>{section.label}</Text>
                <Text style={styles.sectionCount}>{section.stories.length}</Text>
                <Ionicons
                  name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                  size={16}
                  color="#666"
                />
              </TouchableOpacity>
              {!isCollapsed && (
                <>
                  {section.oneLiner ? (
                    <Text style={styles.sectionOneLiner}>{section.oneLiner}</Text>
                  ) : null}
                  {section.stories.map((s, i) => (
                    <Pressable
                      key={s.id}
                      onPress={() => openArticle(s)}
                      style={[styles.storyRow, i < section.stories.length - 1 && styles.storyRowDivider]}
                    >
                      <Text style={styles.storyNumber}>{String(i + 1).padStart(2, '0')}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.storySource}>
                          {(s.sources?.[0]?.name ?? '').toUpperCase()}
                        </Text>
                        <Text style={styles.storyHeadline} numberOfLines={2}>{s.headline}</Text>
                        {s.summary ? (
                          <Text style={styles.storySummary} numberOfLines={2}>{s.summary}</Text>
                        ) : null}
                      </View>
                      {s.imageUrl ? (
                        <Image
                          source={{ uri: s.imageUrl }}
                          style={styles.storyThumb}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.storyThumb, { backgroundColor: getArticleColor(s.id) }]} />
                      )}
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          );
        })}

        {/* ── Yesterday recap ───────────────────────────────────────────── */}
        {yesterdaySnapshot && yesterdaySnapshot.hero && (
          <View style={styles.recapWrap}>
            <Text style={styles.sectionLabel}>WHAT YOU MISSED YESTERDAY</Text>
            <Pressable
              onPress={() => yesterdaySnapshot.hero && openArticle(yesterdaySnapshot.hero.story)}
              style={styles.recapCard}
            >
              <View style={styles.recapDateBlock}>
                <Text style={styles.recapDateLabel}>
                  {new Date(yesterdaySnapshot.generatedAt).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                </Text>
                <Text style={styles.recapStat}>{yesterdaySnapshot.totalStories} stories</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recapTopLabel}>TOP STORY</Text>
                <Text style={styles.recapHeadline} numberOfLines={2}>
                  {yesterdaySnapshot.hero.story.headline}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#444" />
            </Pressable>
          </View>
        )}

        {/* Footer */}
        {snapshot && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Generated {new Date(snapshot.generatedAt).toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit',
              })} · Next auto-refresh at 7 AM tomorrow
            </Text>
            <Pressable
              onPress={() => { setLoading(true); load(true); }}
              style={styles.regenBtn}
            >
              <Ionicons name="refresh" size={14} color="#FFF" />
              <Text style={styles.regenText}>REGENERATE NOW</Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  header: { paddingTop: 8, paddingBottom: 16 },
  kicker: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: '#FFF', fontSize: 30, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },
  subtitle: { color: '#888', fontSize: 14, marginTop: 4 },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statValue: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#666', fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: '#2A2A2A' },
  audioBtn: { flex: 1, alignItems: 'center', gap: 2 },
  audioLabel: { color: '#FFF', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },

  loadingWrap: { alignItems: 'center', paddingVertical: 56, gap: 12 },
  loadingText: { color: '#666', fontSize: 12, letterSpacing: 0.5 },
  retryBtn: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: '#2A2A2A',
    marginTop: 8,
  },
  retryText: { color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },

  // Hero
  heroCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  heroImageWrap: { height: 180, backgroundColor: '#1A1A1A', position: 'relative' },
  heroTopBadge: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  heroTopBadgeText: { color: '#FFD166', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  heroBody: { padding: 16, gap: 10 },
  heroSource: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  heroHeadline: { color: '#FFF', fontSize: 19, fontWeight: '800', lineHeight: 25, letterSpacing: -0.2 },
  bulletList: { gap: 8, marginTop: 6 },
  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  bulletText: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },

  // Numbers row
  sectionLabel: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10, marginLeft: 4 },
  numbersRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  numberCell: {
    flex: 1, padding: 12, borderRadius: 12,
    backgroundColor: '#141414',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#222',
    alignItems: 'flex-start',
  },
  numberValue: { color: '#FFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  numberLabel: { color: '#666', fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 4 },

  // Sections
  section: {
    marginBottom: 22,
    borderRadius: 14,
    backgroundColor: '#0E0E0E',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#1A1A1A',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  sectionEmoji: { fontSize: 16 },
  sectionTitle: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '800' },
  sectionCount: {
    color: '#666', fontSize: 11, fontWeight: '700',
    backgroundColor: '#141414', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    overflow: 'hidden',
  },
  sectionOneLiner: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    color: '#999',
    fontSize: 13, lineHeight: 19,
    fontStyle: 'italic',
  },
  storyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  storyRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A1A' },
  storyNumber: { color: '#444', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, width: 22, marginTop: 2 },
  storySource: { color: '#888', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  storyHeadline: { color: '#FFF', fontSize: 14, fontWeight: '700', lineHeight: 19, marginTop: 4 },
  storySummary: { color: '#777', fontSize: 12, lineHeight: 17, marginTop: 4 },
  storyThumb: {
    width: 60, height: 60, borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },

  // Recap
  recapWrap: { marginBottom: 22 },
  recapCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14,
    backgroundColor: '#0E0E0E',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#1A1A1A',
  },
  recapDateBlock: { alignItems: 'center', gap: 2 },
  recapDateLabel: { color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  recapStat: { color: '#555', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  recapTopLabel: { color: '#555', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  recapHeadline: { color: '#FFF', fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 4 },

  // Footer
  footer: { alignItems: 'center', gap: 12, paddingTop: 8 },
  footerText: { color: '#444', fontSize: 11, textAlign: 'center' },
  regenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#1A1A1A',
  },
  regenText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
});
