import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tabBarTranslateY } from '../utils/tabBarAnim';
import { darken, lighten, getArticleColor } from '../utils/colors';
import { BiasDot, BIAS_CONFIG, type BiasRating } from '../components/StoryCard';
import { RootStackParamList } from '../types/navigation';
import { useSettings } from '../contexts/SettingsContext';
import { getCached, setCached, TTL } from '../utils/cache';
import { trackArticleRead, trackAiUsage } from '../utils/usageTracker';

const HERO_HEIGHT = 280;

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: '#34C759',
  Medium: '#FF9500',
  Hard: '#FF3B30',
};

function DifficultyBadge({ level }: { level: string }) {
  const color = DIFFICULTY_COLORS[level] ?? '#FF9500';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontSize: 12, fontWeight: '500' }}>{level}</Text>
    </View>
  );
}

function formatPublished(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let hrs = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, '0');
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  hrs = hrs % 12 || 12;
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}  ·  ${hrs}:${mins} ${ampm}`;
}

const API = 'https://ireader.onrender.com/api/news';

const TABS = ['Long Form', 'Summary', '5 Ws', 'ELI5'] as const;
type Tab = (typeof TABS)[number];
type AiType = 'summary' | 'fiveWs' | 'eli5';

const TAB_AI_TYPE: Partial<Record<Tab, AiType>> = {
  Summary: 'summary',
  '5 Ws': 'fiveWs',
  ELI5: 'eli5',
};

const FONT_SIZE_MAP: Record<string, number> = {
  Small: 14, Medium: 17, Large: 19, XLarge: 21,
};

interface AiResult {
  bullets?: string[];
  summary?: string;
  fiveWs?: string[];
  eli5?: string;
}

interface SourceEntry {
  name: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
}

function faviconFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return '';
  }
}

function SourceIcons({ sources, dominant }: { sources: SourceEntry[]; dominant: string }) {
  const accent = lighten(dominant, 0.55);
  const shown = sources.slice(0, 5);
  const extra = sources.length - shown.length;

  return (
    <View style={siStyles.row}>
      {shown.map((src, i) => {
        const faviconUri = src.url ? faviconFromUrl(src.url) : '';
        return (
          <View
            key={i}
            style={[siStyles.circle, { marginLeft: i === 0 ? 0 : -12, zIndex: shown.length - i, borderColor: dominant }]}
          >
            {faviconUri ? (
              <Image source={{ uri: faviconUri }} style={siStyles.img} contentFit="cover" />
            ) : (
              <View style={[siStyles.letterBg, { backgroundColor: lighten(dominant, 0.2) }]}>
                <Text style={[siStyles.letter, { color: accent }]}>{src.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
        );
      })}
      {extra > 0 && (
        <View style={[siStyles.circle, siStyles.extraCircle, { marginLeft: -12, backgroundColor: lighten(dominant, 0.1), borderColor: dominant }]}>
          <Text style={[siStyles.extraText, { color: accent }]}>+{extra}</Text>
        </View>
      )}
      <Text style={[siStyles.sourceNames, { color: lighten(dominant, 0.4) }]}>
        {shown.map(s => s.name).join('  ·  ')}
      </Text>
    </View>
  );
}

function BiasInfoModal({ bias, visible, onClose }: { bias?: string; visible: boolean; onClose: () => void }) {
  const cfg = BIAS_CONFIG[(bias as BiasRating) ?? 'unknown'];
  const biasLabel = bias && bias !== 'unknown'
    ? bias.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={bmStyles.overlay} onPress={onClose}>
        <View style={bmStyles.card}>
          {biasLabel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cfg.color }} />
              <Text style={bmStyles.title}>Rated: {biasLabel}</Text>
            </View>
          )}
          <Text style={bmStyles.body}>This source is rated based on publicly available media bias data (AllSides, Ad Fontes Media). Ratings are reference points, not endorsements.</Text>
          <Text style={[bmStyles.body, { marginTop: 8 }]}>Consider reading multiple perspectives for a complete picture.</Text>
          <TouchableOpacity onPress={onClose} style={bmStyles.btn}>
            <Text style={bmStyles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const bmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, width: '100%' },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  body: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 20 },
  btn: { marginTop: 16, backgroundColor: '#222', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

const siStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  circle: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', borderWidth: 2 },
  img: { width: '100%', height: '100%' },
  letterBg: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 14, fontWeight: '800' },
  extraCircle: { alignItems: 'center', justifyContent: 'center' },
  extraText: { fontSize: 11, fontWeight: '700' },
  sourceNames: { marginLeft: 10, fontSize: 12, fontWeight: '600', flexShrink: 1 },
});

function extractEntities(text: string): { people: string[]; companies: string[] } {
  const people: string[] = [];
  const companies: string[] = [];
  const words = text.split(/\s+/);
  words.forEach((word, i) => {
    const clean = word.replace(/[^a-zA-Z]/g, '');
    if (!clean || clean.length < 2) return;
    if (/^[A-Z]{2,}$/.test(clean)) {
      if (!companies.includes(clean)) companies.push(clean);
    }
    if (
      i > 0 &&
      /^[A-Z][a-z]+$/.test(clean) &&
      /^[A-Z][a-z]+$/.test(words[i - 1]?.replace(/[^a-zA-Z]/g, ''))
    ) {
      const person = words[i - 1].replace(/[^a-zA-Z]/g, '') + ' ' + clean;
      if (!people.includes(person)) people.push(person);
    }
  });
  return { people: people.slice(0, 5), companies: companies.slice(0, 5) };
}

export default function ArticleScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Article'>>();
  const params = route.params;

  const dominant = params.dominantColor;
  const accent = lighten(dominant, 0.45);
  const tabBg = darken(dominant, 0.3);
  const borderColor = lighten(dominant, 0.3);

  // Guarantee tab bar is off-screen while this screen is focused,
  // regardless of navigation-state timing in ParticleTabBar.
  useFocusEffect(useCallback(() => {
    Animated.timing(tabBarTranslateY, { toValue: 160, duration: 0, useNativeDriver: true }).start();
    return () => {
      Animated.timing(tabBarTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    };
  }, []));

  const { fontSize: fontSizeName } = useSettings();
  const fontSizePx = FONT_SIZE_MAP[fontSizeName] ?? 17;
  const BLOCKED_LONGFORM_SOURCES = ['NYT World', 'NDTV'];
  const defaultTab: Tab = BLOCKED_LONGFORM_SOURCES.includes(params.source ?? '') ? 'Summary' : 'Long Form';
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [paragraphsLoading, setParagraphsLoading] = useState(true);
  const [paragraphsError, setParagraphsError] = useState<string | null>(null);
  const [readingTimeMinutes, setReadingTimeMinutes] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [biasModalVisible, setBiasModalVisible] = useState(false);
  const [entities, setEntities] = useState<{ people: string[]; companies: string[] }>({ people: [], companies: [] });

  const allStories = useMemo(() => {
    try {
      if (!params?.allStories) return []
      const parsed = JSON.parse(params.allStories as string)
      if (!Array.isArray(parsed)) return []
      return parsed
    } catch(e) {
      console.log('allStories parse error:', e)
      return []
    }
  }, [params?.allStories])

  function extractEntityTokens(text: string): string[] {
    if (!text) return []
    const results: string[] = []
    const words = text.split(/\s+/)
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i].replace(/[^a-zA-Z]/g,'')
      const w2 = words[i+1].replace(/[^a-zA-Z]/g,'')
      if (
        w1.length > 1 && w2.length > 1 &&
        /^[A-Z]/.test(w1) && /^[A-Z]/.test(w2)
      ) {
        results.push((w1 + ' ' + w2).toLowerCase())
      }
      if (/^[A-Z]{2,}$/.test(w1) && w1.length > 2) {
        results.push(w1.toLowerCase())
      }
    }
    return [...new Set(results)].slice(0, 6)
  }

  const related = useMemo(() => {
    try {
      if (!allStories || allStories.length === 0) return []

      const currentId = params.id
      const currentSource = params.source || ''

      // Find current article in allStories to get its category
      const currentStory = allStories.find((s: any) => s?.id === currentId)
      const currentCategory = (currentStory as any)?.category || null

      const currentEntities = extractEntityTokens(
        (params.headline || '') + ' ' + (params.summary || '')
      )

      // Hard gate: only consider articles from the same category
      const sameCategory = allStories
        .filter((s: any) => s?.id !== currentId)
        .filter((s: any) => s?.sources?.[0]?.name !== currentSource)
        .filter((s: any) => {
          if (!currentCategory) return true // no category data — no gate
          return (s as any)?.category === currentCategory
        })

      // Score within same-category pool — entity overlap required
      const result = sameCategory
        .map((s: any) => {
          try {
            const sEntities = extractEntityTokens(
              (s?.headline || '') + ' ' + (s?.summary || '')
            )
            const entityOverlap = sEntities.filter((e: string) => currentEntities.includes(e)).length
            const hoursOld = (Date.now() - new Date(s?.publishedAt || 0).getTime()) / 3600000
            const freshScore = Math.max(0, 1 - hoursOld / 48)
            const score = entityOverlap * 3 + freshScore
            return { story: s, score, entityOverlap }
          } catch {
            return { story: s, score: 0, entityOverlap: 0 }
          }
        })
        .filter((s: any) => s.entityOverlap > 0 && s.story?.imageUrl)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 6)
        .map((s: any) => s.story)

      // Show nothing rather than noise — need at least 2 genuine matches
      return result.length >= 2 ? result : []
    } catch(e) {
      console.log('related articles error:', e)
      return []
    }
  }, [allStories, params.id, params.headline, params.summary, params.source]);

  // Related stories fixed strip — auto-hide on scroll-down, show on scroll-up
  const relatedScrollRef = useRef<ScrollView>(null);
  const relatedIdxRef = useRef(0);
  const relatedPausedRef = useRef(false);
  const RELATED_CARD_W = 190; // card width (180) + gap (10)
  const STRIP_HEIGHT = 185;
  const stripTransY = useRef(new Animated.Value(0)).current;
  const stripVisibleRef = useRef(true);
  const lastArticleScrollY = useRef(0);
  const articleScrollRef = useRef<ScrollView>(null);
  const articleScrollOpacity = useRef(new Animated.Value(1)).current;

  // Fold/unfold: width changes → hide, jump to same position, fade in
  const { width } = useWindowDimensions();
  const prevArticleWidthRef = useRef(width);
  useEffect(() => {
    if (prevArticleWidthRef.current === width) return;
    prevArticleWidthRef.current = width;
    const y = lastArticleScrollY.current;
    if (y <= 0) return;
    articleScrollOpacity.setValue(0);
    requestAnimationFrame(() => {
      articleScrollRef.current?.scrollTo({ y, animated: false });
      setTimeout(() => {
        Animated.timing(articleScrollOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      }, 100);
    });
  }, [width, articleScrollOpacity]);

  function onArticleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastArticleScrollY.current;
    lastArticleScrollY.current = y;
    if (dy > 12 && stripVisibleRef.current && y > 200) {
      stripVisibleRef.current = false;
      Animated.timing(stripTransY, { toValue: STRIP_HEIGHT, duration: 230, useNativeDriver: true }).start();
    } else if (dy < -8 && !stripVisibleRef.current) {
      stripVisibleRef.current = true;
      Animated.timing(stripTransY, { toValue: 0, duration: 230, useNativeDriver: true }).start();
    }
  }

  const aiCache = useRef<Partial<Record<Tab, AiResult>>>({});
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Lazy AI: only generate after user has been reading for 5 seconds
  // Skip wait for sources where long form is unavailable — open straight to summary
  const [hasBeenRead, setHasBeenRead] = useState(BLOCKED_LONGFORM_SOURCES.includes(params.source ?? ''));
  useEffect(() => {
    if (hasBeenRead) return;
    const timer = setTimeout(() => setHasBeenRead(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll Related Stories strip every 3.5 s, pause on user touch
  useEffect(() => {
    if (related.length < 2) return;
    const id = setInterval(() => {
      if (relatedPausedRef.current) return;
      const next = (relatedIdxRef.current + 1) % related.length;
      relatedIdxRef.current = next;
      relatedScrollRef.current?.scrollTo({ x: next * RELATED_CARD_W, animated: true });
    }, 3500);
    return () => clearInterval(id);
  }, [related.length]);

  // Track article read once on mount
  useEffect(() => { trackArticleRead(params.source ?? '').catch(() => {}); }, []);

  // Parse sources from params
  const allSources: SourceEntry[] = (() => {
    try {
      return params.sources ? JSON.parse(params.sources) : [{ name: params.source, url: params.url, publishedAt: params.publishedAt }];
    } catch {
      return [{ name: params.source, url: params.url, publishedAt: params.publishedAt }];
    }
  })();
  const referencedSources = allSources.slice(1); // sources beyond the first

  useEffect(() => {
    if (!params.url) {
      setParagraphs(params.summary ? [params.summary] : []);
      setParagraphsLoading(false);
      return;
    }
    fetch(`${API}/article?url=${encodeURIComponent(params.url)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const paras: string[] =
          data.paragraphs ?? data.originalParagraphs ??
          (data.text ? data.text.split('\n\n').filter(Boolean) : null) ??
          (params.summary ? [params.summary] : []);
        const filtered = paras.filter(Boolean);
        setParagraphs(filtered);
        setEntities(extractEntities(filtered.join(' ')));
        const fullText = filtered.join(' ');
        if (data.readingTimeMinutes) {
          setReadingTimeMinutes(data.readingTimeMinutes);
        } else {
          const words = fullText.trim().split(/\s+/).filter(Boolean).length;
          setReadingTimeMinutes(Math.max(1, Math.round(words / 200)));
        }
        if (data.difficulty) {
          setDifficulty(data.difficulty);
        } else {
          const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 0);
          const words = fullText.trim().split(/\s+/).filter(Boolean);
          if (sentences.length && words.length) {
            let syl = 0;
            for (const w of words) {
              const c = w.toLowerCase().replace(/[^a-z]/g, '');
              if (c.length <= 3) { syl += 1; continue; }
              const m = c.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
              syl += m ? m.length : 1;
            }
            const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syl / words.length);
            setDifficulty(score >= 70 ? 'Easy' : score >= 50 ? 'Medium' : 'Hard');
          }
        }
      })
      .catch(e => {
        setParagraphsError(e.message);
        setParagraphs(params.summary ? [params.summary] : []);
      })
      .finally(() => setParagraphsLoading(false));
  }, [params.url]);

  useEffect(() => {
    const aiType = TAB_AI_TYPE[activeTab];
    if (!aiType) return;
    // Gate: don't start AI until user has read for 5 seconds
    if (!hasBeenRead) return;
    // Session-level tab cache hit
    if (aiCache.current[activeTab]) { setAiResult(aiCache.current[activeTab]!); return; }
    if (paragraphsLoading) return;
    if (paragraphs.length === 0) { setAiError('No article text available to summarize.'); return; }

    // Persistent memory cache (24-hour TTL — never recompute same article)
    const cacheKey = `summary_${params.id ?? params.url}_${aiType}`;
    const cached = getCached(cacheKey, TTL.AI_SUMMARY);
    if (cached) {
      aiCache.current[activeTab] = cached;
      setAiResult(cached);
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    trackAiUsage(aiType as 'summary' | 'fiveWs' | 'eli5').catch(() => {});

    fetch(`${API}/ai-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: params.url,
        paragraphs: paragraphs.slice(0, 15),
        type: TAB_AI_TYPE[activeTab],
        maxWords: activeTab === 'ELI5' ? 100 : 250,
      }),
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        aiCache.current[activeTab] = data;
        setCached(cacheKey, data);
        setAiResult(data);
      })
      .catch(e => setAiError(e.message))
      .finally(() => setAiLoading(false));
  }, [activeTab, paragraphsLoading, hasBeenRead, paragraphs]);

  function renderTabContent() {
    const longForm = (
      <LongFormTab
        loading={paragraphsLoading}
        paragraphs={paragraphs}
        error={paragraphsError}
        summary={params.summary}
        fontSize={fontSizePx}
        url={params.url}
        accentColor={accent}
      />
    );

    if (activeTab === 'Long Form') return longForm;

    // AI tabs: show summary at top, full article pushed below
    let aiContent: React.ReactNode;
    if (!hasBeenRead) {
      aiContent = (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#555" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>Keep reading… AI summary generating</Text>
        </View>
      );
    } else {
      switch (activeTab) {
        case 'Summary':
          aiContent = <SummaryTab loading={aiLoading} result={aiResult} error={aiError} accentColor={dominant} />;
          break;
        case '5 Ws':
          aiContent = <FiveWsTab loading={aiLoading} result={aiResult} error={aiError} accentColor={accent} />;
          break;
        case 'ELI5':
          aiContent = <ELI5Tab loading={aiLoading} result={aiResult} error={aiError} />;
          break;
      }
    }

    return (
      <View>
        {aiContent}
        <View style={styles.articleDivider}>
          <View style={[styles.articleDividerLine, { backgroundColor: borderColor + '40' }]} />
          <Text style={[styles.articleDividerLabel, { color: accent }]}>FULL ARTICLE</Text>
          <View style={[styles.articleDividerLine, { backgroundColor: borderColor + '40' }]} />
        </View>
        {longForm}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Full-screen gradient background */}
      <LinearGradient
        colors={[dominant, darken(dominant, 0.4), darken(dominant, 0.85)]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Fixed top buttons — always visible above scroll */}
      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <Pressable style={[styles.glassBtn, { backgroundColor: dominant + '59' }]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <Pressable
          style={[styles.glassBtn, { backgroundColor: dominant + '59' }]}
          onPress={() => params.url && WebBrowser.openBrowserAsync(params.url)}
        >
          <Ionicons name="share-outline" size={20} color="#FFF" />
        </Pressable>
      </SafeAreaView>

      <Animated.View style={{ flex: 1, opacity: articleScrollOpacity }}>
      <ScrollView
        ref={articleScrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onArticleScroll}
        scrollEventThrottle={16}
      >
        {/* Hero image */}
        <View style={styles.heroContainer}>
          <Image source={{ uri: params.image }} style={styles.heroImage} contentFit="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: dominant + '4D' }]} />
          <LinearGradient
            colors={['transparent', dominant + 'CC', dominant]}
            locations={[0.4, 0.75, 1]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        </View>

        <View style={styles.metaBlock}>
          <Text style={styles.headline}>{params.headline}</Text>
          {allSources.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <SourceIcons sources={allSources} dominant={dominant} />
              {params.sourceBias && params.sourceBias !== 'unknown' && (
                <TouchableOpacity onPress={() => setBiasModalVisible(true)} style={{ marginLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <BiasDot bias={params.sourceBias as BiasRating} size={8} />
                  <Ionicons name="information-circle-outline" size={13} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              )}
            </View>
          )}
          <Text style={[styles.publishedAt, { color: lighten(dominant, 0.35) }]}>{formatPublished(params.publishedAt)}</Text>
          {!!params.summary && (
            <Text style={styles.summaryText}>{params.summary}</Text>
          )}
        </View>

        {(readingTimeMinutes != null || difficulty != null) && (
          <View style={styles.readingMeta}>
            <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.5)" />
            <Text style={styles.readingMetaText}>
              {readingTimeMinutes != null ? `${readingTimeMinutes} min read` : ''}
            </Text>
            {readingTimeMinutes != null && difficulty != null && (
              <Text style={styles.metaDot}>·</Text>
            )}
            {difficulty != null && <DifficultyBadge level={difficulty} />}
          </View>
        )}

        <View style={[styles.tabBar, { backgroundColor: tabBg }]}>
          {(BLOCKED_LONGFORM_SOURCES.includes(params.source ?? '') ? TABS.filter(t => t !== 'Long Form') : TABS).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && { backgroundColor: '#FFFFFF' }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tabBody}>
          {renderTabContent()}
        </View>

        {/* Referenced Articles section — Particle-style article rows */}
        {referencedSources.length > 0 && (
          <View style={styles.refSection}>
            <Text style={[styles.refTitle, { color: accent }]}>
              {referencedSources.length + 1} Articles
            </Text>
            {referencedSources.map((src, i) => (
              <TouchableOpacity
                key={i}
                style={styles.refRow}
                onPress={() => src.url && WebBrowser.openBrowserAsync(src.url)}
              >
                <View style={[styles.refAvatar, { backgroundColor: lighten(dominant, 0.2) }]}>
                  <Text style={[styles.refAvatarText, { color: accent }]}>
                    {src.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.refContent}>
                  <Text style={[styles.refSource, { color: accent }]}>{src.name.toUpperCase()}</Text>
                  <Text style={styles.refHeadline} numberOfLines={2}>
                    {params.headline}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Key People & Companies */}
        {(entities.people.length > 0 || entities.companies.length > 0) && (
          <View style={styles.entitySection}>
            {entities.people.length > 0 && (
              <View style={styles.entityGroup}>
                <Text style={[styles.entityHeader, { color: accent }]}>KEY PEOPLE</Text>
                <View style={styles.entityChips}>
                  {entities.people.map(p => (
                    <View key={p} style={[styles.entityChip, { borderColor: accent + '55' }]}>
                      <Text style={styles.entityText}>👤 {p}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {entities.companies.length > 0 && (
              <View style={styles.entityGroup}>
                <Text style={[styles.entityHeader, { color: accent }]}>KEY COMPANIES</Text>
                <View style={styles.entityChips}>
                  {entities.companies.map(c => (
                    <View key={c} style={[styles.entityChip, { borderColor: accent + '55' }]}>
                      <Text style={styles.entityText}>🏢 {c}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ height: related.length >= 2 ? STRIP_HEIGHT + 16 : 60 }} />
      </ScrollView>
      </Animated.View>

      <BiasInfoModal bias={params.sourceBias} visible={biasModalVisible} onClose={() => setBiasModalVisible(false)} />

      {/* Related Stories — fixed strip, hides on scroll-down */}
      {related.length >= 2 && (
        <Animated.View
          style={[
            styles.relatedFixed,
            { transform: [{ translateY: stripTransY }], backgroundColor: darken(dominant, 0.7) + 'EE' },
          ]}
        >
          <Text style={styles.relatedFixedTitle}>RELATED STORIES</Text>
          <ScrollView
            ref={relatedScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
            onTouchStart={() => { relatedPausedRef.current = true; }}
            onTouchEnd={() => { setTimeout(() => { relatedPausedRef.current = false; }, 3000); }}
          >
            {(related as any[]).map((story: any, i: number) => (
              <TouchableOpacity
                key={story.id ?? i}
                style={styles.relatedCard}
                onPress={() => {
                  navigation.push('Article', {
                    id: story.id,
                    url: story.sources?.[0]?.url ?? '',
                    image: story.imageUrl,
                    headline: story.headline,
                    summary: story.summary,
                    source: story.sources?.[0]?.name ?? '',
                    publishedAt: story.publishedAt,
                    dominantColor: dominant,
                    sources: JSON.stringify(story.sources ?? []),
                    allStories: params.allStories,
                  });
                }}
              >
                {story.imageUrl ? (
                  <Image source={{ uri: story.imageUrl }} style={styles.relatedCardImg} contentFit="cover" />
                ) : (
                  <View style={[styles.relatedCardImg, { backgroundColor: lighten(dominant, 0.1) }]} />
                )}
                <View style={styles.relatedCardBody}>
                  <Text style={styles.relatedCardHeadline} numberOfLines={2}>{story.headline}</Text>
                  <Text style={styles.relatedCardSource}>{story.sources?.[0]?.name?.toUpperCase()}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

// ── Rich text tokeniser ──────────────────────────────────────────────────────
type Seg = { text: string; kind: 'plain' | 'quote' | 'stat' | 'kw' | 'proper' };

// Priority order: quotes → stats → ALL-CAPS → proper nouns
// Quote chars: straight double, curly double, curly single (≠ apostrophe U+0027)
const RICH_RE = new RegExp(
  [
    // Straight double quotes — no length cap, greedy-stopped at next “
    `”([^”]{1,500})”`,
    // Curly double quotes
    `“([^”]{1,500})”`,
    // Curly single quotes (U+2018 / U+2019) — safe, apostrophes are U+0027
    `‘([^’]{1,500})’`,
    // Currency + scale  e.g. $4.2B, ₹1,200 crore, €50 million
    `[\\$₹€£¥][\\d,.]+(?:\\s*(?:billion|million|trillion|crore|lakh|thousand|bn|mn|tn|B|M|T|K))?`,
    // Percentage / plain stat  e.g. 43%, 1.2 million, 300,000
    `[\\d][\\d,.]*\\s*%`,
    `\\b\\d[\\d,.]*\\s*(?:billion|million|trillion|crore|lakh|thousand)\\b`,
    // ALL-CAPS acronyms 2–8 letters
    `\\b[A-Z]{2,8}\\b`,
    // Multi-word proper nouns (2+ consecutive Title-Case words)
    `\\b[A-Z][a-z]{1,}(?:\\s+[A-Z][a-z]+)+\\b`,
  ].join('|'),
  'g',
);

function tokenize(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  RICH_RE.lastIndex = 0;
  while ((m = RICH_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), kind: 'plain' });
    const raw = m[0];
    const c0 = raw.codePointAt(0)!;
    if (c0 === 0x22 || c0 === 0x201c || c0 === 0x2018) {
      out.push({ text: raw, kind: 'quote' });
    } else if (/^[$₹€£¥]/.test(raw) || /^[\d]/.test(raw)) {
      out.push({ text: raw, kind: 'stat' });
    } else if (/^[A-Z]{2,8}$/.test(raw)) {
      out.push({ text: raw, kind: 'kw' });
    } else {
      out.push({ text: raw, kind: 'proper' });
    }
    last = m.index + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'plain' });
  return out;
}

function RichParagraph({ text, fontSize, accentColor }: { text: string; fontSize: number; accentColor: string }) {
  const segs = useMemo(() => tokenize(text), [text]);
  return (
    <Text style={[styles.paragraph, { fontSize, lineHeight: fontSize * 1.65 }]}>
      {segs.map((seg, i) => {
        if (seg.kind === 'quote')
          return <Text key={i} style={{ color: '#FFD166', fontStyle: 'italic' }}>{seg.text}</Text>;
        if (seg.kind === 'stat')
          return <Text key={i} style={{ color: '#4ECDC4', fontWeight: '700' }}>{seg.text}</Text>;
        if (seg.kind === 'kw')
          return <Text key={i} style={{ color: accentColor, fontWeight: '700' }}>{seg.text}</Text>;
        if (seg.kind === 'proper')
          return <Text key={i} style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>{seg.text}</Text>;
        return <Text key={i}>{seg.text}</Text>;
      })}
    </Text>
  );
}

function LongFormTab({ loading, paragraphs, error, summary, fontSize, url, accentColor }: {
  loading: boolean; paragraphs: string[]; error: string | null; summary: string; fontSize: number; url?: string; accentColor: string;
}) {
  if (loading) return <Spinner />;

  const isBlocked = !!error && /50[0-9]|blocked|unavailable/i.test(error);

  if (!paragraphs.length || isBlocked) {
    return (
      <View>
        <Text style={styles.errorHint}>Full text unavailable from this publisher</Text>
        {summary ? (
          <RichParagraph text={summary} fontSize={fontSize} accentColor={accentColor} />
        ) : (
          <ErrorMsg msg="No content available." />
        )}
        {url ? (
          <TouchableOpacity
            style={styles.readFullBtn}
            onPress={() => WebBrowser.openBrowserAsync(url)}
          >
            <Text style={styles.readFullText}>Read Full Article →</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      {paragraphs.map((p, i) => <RichParagraph key={i} text={p} fontSize={fontSize} accentColor={accentColor} />)}
      {url ? (
        <TouchableOpacity
          style={styles.readFullBtn}
          onPress={() => WebBrowser.openBrowserAsync(url)}
        >
          <Text style={styles.readFullText}>Read Full Article →</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SummaryTab({ loading, result, error, accentColor }: { loading: boolean; result: AiResult | null; error: string | null; accentColor: string }) {
  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;
  if (!result) return <ErrorMsg msg="No summary available." />;
  const bullets = result.bullets ?? (result.summary ? [result.summary] : []);
  if (!bullets.length) return <ErrorMsg msg="No summary available." />;
  return (
    <View>
      {bullets.map((line, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: accentColor }]} />
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

function FiveWsTab({ loading, result, error, accentColor }: { loading: boolean; result: AiResult | null; error: string | null; accentColor: string }) {
  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;
  const lines = result?.fiveWs ?? [];
  if (!lines.length) return <ErrorMsg msg="Not available for this article." />;
  return (
    <View>
      {lines.map((line, i) => {
        const match = line.match(/^(WHO|WHAT|WHEN|WHERE|WHY)\s*:\s*/i);
        const label = match ? match[1].toUpperCase() : line.slice(0, 5).toUpperCase();
        const body = match ? line.slice(match[0].length) : line;
        return (
          <View key={i} style={styles.wRow}>
            <Text style={[styles.wLabel, { color: accentColor }]}>{label}</Text>
            <Text style={styles.wText}>{body}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ELI5Tab({ loading, result, error }: { loading: boolean; result: AiResult | null; error: string | null }) {
  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;
  if (!result?.eli5) return <ErrorMsg msg="Not available for this article." />;
  return <Text style={styles.eli5Text}>{result.eli5}</Text>;
}

function Spinner() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#888" />
    </View>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return <Text style={styles.emptyText}>{msg}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 4,
  },
  glassBtn: {
    borderRadius: 22, padding: 9,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  scroll: { flex: 1 },
  heroContainer: { height: HERO_HEIGHT, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  metaBlock: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headline: { color: '#FFF', fontSize: 24, fontWeight: '800', lineHeight: 32 },
  publishedAt: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginTop: 10 },
  summaryText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 22, marginTop: 10 },
  readingMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4, paddingHorizontal: 16 },
  readingMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  metaDot: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16,
    borderRadius: 999, padding: 4, marginBottom: 20,
  },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center' },
  tabLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: '#000' },
  tabBody: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    paddingBottom: 24,
  },
  refSection: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  refTitle: {
    fontSize: 18, fontWeight: '800', letterSpacing: -0.3,
    color: '#FFF', marginBottom: 16,
  },
  refRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  refAvatar: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  refAvatarText: { fontSize: 18, fontWeight: '800' },
  refContent: { flex: 1 },
  refSource: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  refHeadline: { color: '#DDD', fontSize: 14, fontWeight: '500', lineHeight: 19 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  errorHint: { color: '#FF6B6B', fontSize: 12, marginBottom: 12 },
  paragraph: { color: '#DDD', marginBottom: 16 },
  bulletRow: { flexDirection: 'row', marginBottom: 18, gap: 14, alignItems: 'flex-start' },
  bulletDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7, flexShrink: 0 },
  bulletText: { flex: 1, color: '#DDD', fontSize: 15, lineHeight: 24 },
  wRow: { marginBottom: 20 },
  wLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
  wText: { color: '#DDD', fontSize: 15, lineHeight: 23 },
  eli5Text: { color: '#FFF', fontSize: 20, lineHeight: 32, fontWeight: '500' },
  emptyText: { color: '#444', fontSize: 14, textAlign: 'center', paddingVertical: 40 },
  readFullBtn: {
    marginTop: 20, paddingVertical: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  readFullText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  articleDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 28, marginBottom: 20,
  },
  articleDividerLine: { flex: 1, height: 1 },
  articleDividerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  entitySection: { marginHorizontal: 16, marginTop: 20, gap: 16 },
  entityGroup: {},
  entityHeader: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  entityChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  entityChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  entityText: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  // Fixed bottom Related Stories strip
  relatedFixed: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 10, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  relatedFixedTitle: {
    color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, paddingHorizontal: 16, marginBottom: 10,
  },
  relatedCard: {
    width: 180, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, overflow: 'hidden',
  },
  relatedCardImg: { width: 180, height: 90 },
  relatedCardBody: { padding: 8 },
  relatedCardSource: {
    color: 'rgba(255,255,255,0.4)', fontSize: 9,
    fontWeight: '700', letterSpacing: 0.5, marginTop: 4,
  },
  relatedCardHeadline: {
    color: '#FFFFFF', fontSize: 12, fontWeight: '600', lineHeight: 16,
  },
});
