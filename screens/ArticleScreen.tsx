import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { darken, lighten } from '../utils/colors';
import { RootStackParamList } from '../types/navigation';
import { useSettings } from '../contexts/SettingsContext';
import { getCached, setCached, TTL } from '../utils/cache';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = 280;

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

const SOURCE_FAVICONS: Record<string, string> = {
  'TechCrunch': 'https://techcrunch.com/wp-content/uploads/2015/02/cropped-cropped-favicon-gradient.png',
  'The Verge': 'https://cdn.vox-cdn.com/uploads/chorus_asset/file/7395367/favicon-64x64.0.png',
  'Ars Technica': 'https://cdn.arstechnica.net/favicon.ico',
  'Wired': 'https://www.wired.com/favicon.ico',
};

function SourceIcons({ sources, dominant }: { sources: SourceEntry[]; dominant: string }) {
  const accent = lighten(dominant, 0.55);
  const shown = sources.slice(0, 5);
  const extra = sources.length - shown.length;

  return (
    <View style={siStyles.row}>
      {shown.map((src, i) => {
        const faviconUri = src.imageUrl || SOURCE_FAVICONS[src.name];
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
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Article'>>();
  const params = route.params;

  const dominant = params.dominantColor;
  const accent = lighten(dominant, 0.45);
  const tabBg = darken(dominant, 0.3);
  const borderColor = lighten(dominant, 0.3);

  const { fontSize: fontSizeName } = useSettings();
  const fontSizePx = FONT_SIZE_MAP[fontSizeName] ?? 17;
  const [activeTab, setActiveTab] = useState<Tab>('Long Form');
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [paragraphsLoading, setParagraphsLoading] = useState(true);
  const [paragraphsError, setParagraphsError] = useState<string | null>(null);
  const [entities, setEntities] = useState<{ people: string[]; companies: string[] }>({ people: [], companies: [] });

  const aiCache = useRef<Partial<Record<Tab, AiResult>>>({});
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Lazy AI: only generate after user has been reading for 5 seconds
  const [hasBeenRead, setHasBeenRead] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHasBeenRead(true), 5000);
    return () => clearTimeout(timer);
  }, []);

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

    fetch(`${API}/ai-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: params.url,
        paragraphs: paragraphs.slice(0, 15),
        type: TAB_AI_TYPE[activeTab],
        maxWords: activeTab === 'ELI5' ? 50 : 150,
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
  }, [activeTab, paragraphsLoading, hasBeenRead]);

  function renderTabContent() {
    if (activeTab !== 'Long Form' && !hasBeenRead) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#555" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>Keep reading... AI summary generating</Text>
        </View>
      );
    }
    switch (activeTab) {
      case 'Long Form':
        return <LongFormTab loading={paragraphsLoading} paragraphs={paragraphs} error={paragraphsError} summary={params.summary} fontSize={fontSizePx} url={params.url} />;
      case 'Summary':
        return <SummaryTab loading={aiLoading} result={aiResult} error={aiError} accentColor={dominant} />;
      case '5 Ws':
        return <FiveWsTab loading={aiLoading} result={aiResult} error={aiError} accentColor={accent} />;
      case 'ELI5':
        return <ELI5Tab loading={aiLoading} result={aiResult} error={aiError} />;
    }
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

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero image scrolls with content */}
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
          <Text style={[styles.sourceMeta, { color: accent }]}>{params.source?.toUpperCase()}{'  ·  ⚡'}</Text>
          <Text style={styles.headline}>{params.headline}</Text>
          {allSources.length > 0 && <SourceIcons sources={allSources} dominant={dominant} />}
        </View>

        <View style={[styles.tabBar, { backgroundColor: tabBg }]}>
          {TABS.map(tab => (
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
                onPress={() => WebBrowser.openBrowserAsync(src.url)}
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

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function LongFormTab({ loading, paragraphs, error, summary, fontSize, url }: {
  loading: boolean; paragraphs: string[]; error: string | null; summary: string; fontSize: number; url?: string;
}) {
  if (loading) return <Spinner />;

  const isBlocked = !!error && /50[0-9]|blocked|unavailable/i.test(error);

  if (!paragraphs.length || isBlocked) {
    return (
      <View>
        <Text style={styles.errorHint}>Full text unavailable from this publisher</Text>
        {summary ? (
          <Text style={[styles.paragraph, { fontSize, lineHeight: fontSize * 1.65 }]}>{summary}</Text>
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
      {paragraphs.map((p, i) => <Text key={i} style={[styles.paragraph, { fontSize, lineHeight: fontSize * 1.65 }]}>{p}</Text>)}
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
  sourceMeta: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  headline: { color: '#FFF', fontSize: 24, fontWeight: '800', lineHeight: 32 },
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
});
