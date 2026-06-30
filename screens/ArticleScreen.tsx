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
import { useSaved } from '../contexts/SavedContext';
import { getCached, setCached, hydrateCached, TTL } from '../utils/cache';
import { trackArticleRead, trackAiUsage } from '../utils/usageTracker';
import { FALLBACK_IMG } from '../utils/fallback';
import { toggleFollowEntity, getFollowedEntities } from '../utils/entityFollowStore';

function deriveCategory(source: string, url: string, headline: string): string {
  const s = (source || '').toLowerCase();
  const u = (url || '').toLowerCase();
  const h = (headline || '').toLowerCase();
  if (/techcrunch|verge|ars technica|wired|9to5|venturebeat|tech\b/.test(s + ' ' + u) ||
      /\b(ai|tech|startup|app|software|chip|robot)\b/.test(h)) return 'Tech';
  if (/economic times|moneycontrol|livemint|mint|cnbc|markets|bloomberg/.test(s) ||
      /\b(stock|sensex|nifty|market|ipo|fund|rupee|inflation)\b/.test(h)) return 'Markets';
  if (/bbc|reuters|guardian|al jazeera|world/.test(s) ||
      /\b(ukraine|russia|israel|gaza|china|nato|biden|trump|putin)\b/.test(h)) return 'World';
  if (/ndtv|india today|times of india|hindu|indian express|the print|quint/.test(s) ||
      /\b(modi|bjp|congress|delhi|mumbai|india)\b/.test(h)) return 'India';
  return 'News';
}

function fmtDateInline(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date}  ·  ${time}`;
  } catch { return ''; }
}

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
  keyPeople?: string[];
  keyCompanies?: string[];
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

function DedupValidationModal({
  visible, onClose, originalParagraphs, paragraphs, dedupedFlag, apiUrl,
}: {
  visible: boolean;
  onClose: () => void;
  originalParagraphs: string[];
  paragraphs: string[];
  dedupedFlag: boolean;
  apiUrl: string;
}) {
  const wordCount = (s: string) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
  const preText = originalParagraphs.join(' ');
  const postText = paragraphs.join(' ');
  const preWords = wordCount(preText);
  const postWords = wordCount(postText);
  const wordsReduction = preWords > 0
    ? Math.max(0, Math.round(((preWords - postWords) / preWords) * 100))
    : 0;
  const paraReduction = originalParagraphs.length > 0
    ? Math.max(0, Math.round(((originalParagraphs.length - paragraphs.length) / originalParagraphs.length) * 100))
    : 0;

  // Diff helper: identify paragraphs in `original` that didn't make it to `final`
  const finalNorm = new Set(paragraphs.map(p => p.trim()));
  const removed = originalParagraphs.filter(p => !finalNorm.has(p.trim()));

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={dmStyles.overlay} onPress={onClose}>
        <Pressable style={dmStyles.card} onPress={(e) => e.stopPropagation()}>
          <View style={dmStyles.header}>
            <Text style={dmStyles.title}>DEDUP VALIDATION</Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={20} color="#FFF" />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
            {/* Stats grid */}
            <View style={dmStyles.grid}>
              <View style={dmStyles.cell}>
                <Text style={dmStyles.cellLabel}>SERVER FLAG</Text>
                <Text style={[dmStyles.cellValue, { color: dedupedFlag ? '#34C759' : '#FF9500' }]}>
                  {dedupedFlag ? 'deduped: true' : 'deduped: false'}
                </Text>
              </View>
              <View style={dmStyles.cell}>
                <Text style={dmStyles.cellLabel}>WORDS</Text>
                <Text style={dmStyles.cellValue}>{preWords} → {postWords}  ({wordsReduction}% less)</Text>
              </View>
              <View style={dmStyles.cell}>
                <Text style={dmStyles.cellLabel}>PARAGRAPHS</Text>
                <Text style={dmStyles.cellValue}>
                  {originalParagraphs.length} → {paragraphs.length}  ({paraReduction}% less)
                </Text>
              </View>
              <View style={dmStyles.cell}>
                <Text style={dmStyles.cellLabel}>REMOVED COUNT</Text>
                <Text style={dmStyles.cellValue}>{removed.length}</Text>
              </View>
            </View>

            {/* API URL — tap to open raw JSON in browser */}
            <Text style={dmStyles.sectionLabel}>API ENDPOINT</Text>
            <Pressable
              onPress={() => apiUrl && WebBrowser.openBrowserAsync(apiUrl).catch(() => {})}
              style={dmStyles.urlBox}
            >
              <Text style={dmStyles.urlText} numberOfLines={3} selectable>{apiUrl || '—'}</Text>
              <View style={dmStyles.urlAction}>
                <Ionicons name="open-outline" size={13} color="#3B9EFF" />
                <Text style={dmStyles.urlActionText}>OPEN RAW JSON</Text>
              </View>
            </Pressable>

            {/* Removed paragraphs (the "redundancy") */}
            {removed.length > 0 && (
              <>
                <Text style={dmStyles.sectionLabel}>
                  REMOVED / MERGED PARAGRAPHS ({removed.length})
                </Text>
                {removed.map((p, i) => (
                  <View key={i} style={dmStyles.diffRemoved}>
                    <Text style={dmStyles.diffMarker}>−</Text>
                    <Text style={dmStyles.diffText} selectable>{p}</Text>
                  </View>
                ))}
              </>
            )}

            {/* Kept paragraphs */}
            <Text style={dmStyles.sectionLabel}>
              KEPT PARAGRAPHS ({paragraphs.length})
            </Text>
            {paragraphs.map((p, i) => (
              <View key={i} style={dmStyles.diffKept}>
                <Text style={[dmStyles.diffMarker, { color: '#34C759' }]}>+</Text>
                <Text style={dmStyles.diffText} selectable>{p}</Text>
              </View>
            ))}

            <View style={{ height: 12 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const dmStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center', padding: 16,
  },
  card: {
    backgroundColor: '#0E0E0E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222',
    padding: 16,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { color: '#FFF', fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  grid: { gap: 10, marginBottom: 16 },
  cell: {
    backgroundColor: '#161616',
    borderRadius: 8, padding: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#222',
  },
  cellLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: 4,
  },
  cellValue: { color: '#FFF', fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  sectionLabel: {
    color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700',
    letterSpacing: 1.4, marginTop: 16, marginBottom: 8,
  },
  urlBox: {
    backgroundColor: '#161616',
    borderRadius: 8, padding: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#222',
  },
  urlText: { color: '#9AD0FF', fontSize: 11, fontFamily: 'monospace', lineHeight: 16 },
  urlAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  urlActionText: { color: '#3B9EFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  diffRemoved: {
    flexDirection: 'row', gap: 8,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderLeftWidth: 2, borderLeftColor: '#FF3B30',
    padding: 8, marginBottom: 6, borderRadius: 4,
  },
  diffKept: {
    flexDirection: 'row', gap: 8,
    backgroundColor: 'rgba(52,199,89,0.06)',
    borderLeftWidth: 2, borderLeftColor: '#34C759',
    padding: 8, marginBottom: 6, borderRadius: 4,
  },
  diffMarker: { color: '#FF3B30', fontFamily: 'monospace', fontWeight: '800', fontSize: 13 },
  diffText: {
    flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 18,
  },
});

const SKIP_NAME_WORDS = new Set([
  'January','February','March','April','May','June','July','August','September','October','November','December',
  'The','This','That','These','Those','Their','Its','His','Her','Our','Your',
  'Said','Also','After','Before','During','While','When','Where','Who','What','How','Why',
  'Spokesperson','Official','Representative','Director','Secretary','General','Deputy','Chairman',
  'New','Old','Former','Senior','Junior','Acting','Current','Late',
  'North','South','East','West','Central',
]);
const SKIP_ORG_CODES = new Set([
  'US','UK','EU','UAE','KSA','AU','NZ','IS','DE','FR','JP','CA','MX','BR','AR','ZA','EG',
  'SA','IR','IQ','SY','TR','PK','AF','BD','LK','MM','TH','VN','PH','ID','MY',
]);

function extractEntities(text: string): { people: string[]; companies: string[] } {
  const people: string[] = [];
  const companies: string[] = [];
  const words = text.split(/\s+/);
  words.forEach((word, i) => {
    const clean = word.replace(/[^a-zA-Z]/g, '');
    if (!clean || clean.length < 2) return;
    // Orgs: all-caps 3-10 chars, not a country code
    if (/^[A-Z]{3,10}$/.test(clean) && !SKIP_ORG_CODES.has(clean) && !companies.includes(clean)) {
      companies.push(clean);
    }
    // People: two consecutive TitleCase words (≥3 chars each), not skip words
    if (i > 0) {
      const prevClean = words[i - 1]?.replace(/[^a-zA-Z]/g, '') ?? '';
      if (
        /^[A-Z][a-z]{2,}$/.test(clean) && /^[A-Z][a-z]{2,}$/.test(prevClean) &&
        !SKIP_NAME_WORDS.has(clean) && !SKIP_NAME_WORDS.has(prevClean)
      ) {
        const person = prevClean + ' ' + clean;
        if (!people.includes(person)) people.push(person);
      }
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

  const {
    fontSize: fontSizeName,
    defaultArticleTab,
    showStatsCard, showVerifyDedup: showVerifyDedupSetting,
    showReferencedSources, showKeyPoints,
    summaryLength, keyPointsCount, eli5Tone,
    showEntityHighlights, showReadingDifficulty,
  } = useSettings();
  const { isSaved, toggleSave } = useSaved();
  const fontSizePx = FONT_SIZE_MAP[fontSizeName] ?? 17;
  const articleCategory = deriveCategory(params.source ?? '', params.url ?? '', params.headline ?? '');
  const savedNow = isSaved(params.id);
  // Sources that block full-text fetch (paywall / scrape protection) — hide the
  // Long Form tab and default to AI Summary. Matches all variants: "NYT",
  // "NYT World", "New York Times", "NDTV", "NDTV Profit", "Ars Technica", etc.
  const blockLongform = false;
  const userDefault = defaultArticleTab as Tab;
  const defaultTab: Tab = blockLongform
    ? (userDefault === 'Long Form' ? 'Summary' : userDefault)
    : userDefault;
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [originalParagraphs, setOriginalParagraphs] = useState<string[]>([]);
  const [dedupedFlag, setDedupedFlag] = useState(false);
  const [paragraphsLoading, setParagraphsLoading] = useState(true);
  const [paragraphsError, setParagraphsError] = useState<string | null>(null);
  const [readingTimeMinutes, setReadingTimeMinutes] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [biasModalVisible, setBiasModalVisible] = useState(false);
  const [dedupModalVisible, setDedupModalVisible] = useState(false);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const noHero = !params.image || heroImageFailed;
  const [entities, setEntities] = useState<{ people: string[]; companies: string[] }>({ people: [], companies: [] });
  const [followedEntities, setFollowedEntities] = useState<Set<string>>(() => new Set(getFollowedEntities()));

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
  const [hasBeenRead, setHasBeenRead] = useState(blockLongform);
  useEffect(() => {
    if (hasBeenRead) return;
    const timer = setTimeout(() => setHasBeenRead(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  // If Summary already pre-warmed in cache: skip 5s gate + seed AI entities immediately
  useEffect(() => {
    const lengthMap: Record<typeof summaryLength, number> = { short: 150, medium: 250, long: 400 };
    const maxWords = lengthMap[summaryLength] ?? 250;
    const cacheKey = `summary_v5_${params.id ?? params.url}_summary_${maxWords}_${keyPointsCount}_${eli5Tone}`;
    const applyHit = (hit: AiResult) => {
      if (!hasBeenRead) setHasBeenRead(true);
      const people = (hit.keyPeople ?? []).filter(Boolean);
      const companies = (hit.keyCompanies ?? []).filter(Boolean);
      if (people.length > 0 || companies.length > 0) setEntities({ people, companies });
    };
    const mem = getCached(cacheKey, TTL.AI_SUMMARY);
    if (mem) { applyHit(mem as AiResult); return; }
    hydrateCached(cacheKey, TTL.AI_SUMMARY).then(hit => { if (hit) applyHit(hit as AiResult); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  useEffect(() => {
    const cat = deriveCategory(params.source ?? '', params.url ?? '', params.headline ?? '');
    trackArticleRead(params.source ?? '', cat ?? undefined).catch(() => {});
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
        const origRaw: string[] = (data.originalParagraphs ?? paras) as string[];
        setOriginalParagraphs((origRaw || []).filter(Boolean));
        setDedupedFlag(Boolean(data.deduped));
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
    if (!hasBeenRead) return;
    if (aiCache.current[activeTab]) { setAiResult(aiCache.current[activeTab]!); return; }
    if (paragraphsLoading) return;
    if (paragraphs.length === 0) { setAiError('No article text available to summarize.'); return; }

    const lengthMap: Record<typeof summaryLength, number> = { short: 150, medium: 250, long: 400 };
    const maxWordsForType = activeTab === 'ELI5' ? 100 : lengthMap[summaryLength];
    const cacheKey = `summary_v5_${params.id ?? params.url}_${aiType}_${maxWordsForType}_${keyPointsCount}_${eli5Tone}`;
    const cached = getCached(cacheKey, TTL.AI_SUMMARY);
    if (cached) {
      aiCache.current[activeTab] = cached;
      setAiResult(cached);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setAiLoading(true);
      // Check AsyncStorage — survives app restarts and pre-warm from FeedScreen
      const persisted = await hydrateCached(cacheKey, TTL.AI_SUMMARY);
      if (persisted && !cancelled) {
        aiCache.current[activeTab] = persisted;
        setAiResult(persisted);
        setAiLoading(false);
        return;
      }
      if (cancelled) return;

      setAiError(null);
      setAiResult(null);
      trackAiUsage(aiType as 'summary' | 'fiveWs' | 'eli5').catch(() => {});

      const body = JSON.stringify({
        url: params.url,
        paragraphs: paragraphs.slice(0, 15),
        type: TAB_AI_TYPE[activeTab],
        maxWords: maxWordsForType,
        keyPoints: keyPointsCount,
        eli5Tone,
      });
      const doFetch = (): Promise<Response> => fetch(`${API}/ai-summary`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });
      const fetchWithRetry = async (): Promise<unknown> => {
        let r = await doFetch();
        if (!r.ok && r.status >= 500 && r.status < 600) {
          await new Promise(res => setTimeout(res, 2000));
          r = await doFetch();
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      };
      try {
        const data = await fetchWithRetry();
        if (!cancelled) {
          aiCache.current[activeTab] = data as AiResult;
          setCached(cacheKey, data as AiResult);
          setAiResult(data as AiResult);
        }
      } catch (e) {
        if (!cancelled) setAiError(String(e instanceof Error ? e.message : e));
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [activeTab, paragraphsLoading, hasBeenRead, paragraphs]);

  // When AI summary loads, upgrade entities with AI-extracted keyPeople/keyCompanies.
  useEffect(() => {
    if (!aiResult) return;
    const people = (aiResult.keyPeople ?? []).filter(Boolean);
    const companies = (aiResult.keyCompanies ?? []).filter(Boolean);
    if (people.length > 0 || companies.length > 0) setEntities({ people, companies });
  }, [aiResult]);

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
        highlights={showEntityHighlights}
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
          aiContent = <SummaryTab loading={aiLoading} result={aiResult} error={aiError} accentColor={dominant} fontSize={fontSizePx} showKeyPoints={showKeyPoints} highlights={showEntityHighlights} />;
          break;
        case '5 Ws':
          aiContent = <FiveWsTab loading={aiLoading} result={aiResult} error={aiError} accentColor={accent} />;
          break;
        case 'ELI5':
          aiContent = <ELI5Tab loading={aiLoading} result={aiResult} error={aiError} />;
          break;
      }
    }

    const inputWords = paragraphs.slice(0, 15).join(' ').slice(0, 2500).trim().split(/\s+/).filter(Boolean).length;
    const isLimitedSource = inputWords < 150;
    return (
      <View>
        <View style={{
          borderRadius: 14, marginBottom: 14,
          backgroundColor: isLimitedSource ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.04)',
          borderWidth: 1, borderColor: isLimitedSource ? 'rgba(245,158,11,0.30)' : 'rgba(255,255,255,0.07)',
          padding: 14,
        }}>
          {!paragraphsLoading && inputWords > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 }}>
              {isLimitedSource && <Text style={{ fontSize: 11 }}>⚠️</Text>}
              <Text style={{
                color: isLimitedSource ? '#f59e0b' : 'rgba(255,255,255,0.2)',
                fontSize: 9.5, fontWeight: '600', letterSpacing: 0.4,
              }}>
                {isLimitedSource
                  ? `LIMITED SOURCE · ${inputWords} words — full article blocked; summary may be inaccurate`
                  : `AI read ${inputWords} words`}
              </Text>
            </View>
          )}
          {aiContent}
        </View>
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
        <View style={styles.topBarRight}>
          <BookmarkButton
            saved={savedNow}
            bg={dominant + '59'}
            onPress={() => toggleSave({
              id: params.id,
              headline: params.headline,
              summary: params.summary,
              publishedAt: params.publishedAt,
              imageUrl: params.image,
              sources: (() => { try { return JSON.parse(params.sources ?? '[]'); } catch { return []; } })(),
              sourceBias: params.sourceBias as BiasRating | undefined,
            } as never)}
          />
          <Pressable
            style={[styles.glassBtn, { backgroundColor: dominant + '59' }]}
            onPress={() => params.url && WebBrowser.openBrowserAsync(params.url)}
          >
            <Ionicons name="share-outline" size={20} color="#FFF" />
          </Pressable>
        </View>
      </SafeAreaView>

      <Animated.View style={{ flex: 1, opacity: articleScrollOpacity }}>
      <ScrollView
        ref={articleScrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onArticleScroll}
        scrollEventThrottle={16}
      >
        {/* Hero — image variant OR typographic fallback for image-less articles */}
        {noHero ? (
          <View style={[styles.heroContainer, { overflow: 'hidden', backgroundColor: '#05060c' }]}>
            {/* Branded network-node banner for image-less articles */}
            <Image source={FALLBACK_IMG} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient
              colors={[dominant + '33', 'transparent', accent + '1f']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            {/* Bottom fade into screen bg */}
            <LinearGradient
              colors={['transparent', 'transparent', darken(dominant, 0.4)]}
              locations={[0, 0.6, 1]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
          </View>
        ) : (
          <View style={[styles.heroContainer, { overflow: 'hidden' }]}>
            <HeroImage uri={params.image} onError={() => setHeroImageFailed(true)} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: dominant + '33' }]} />
            <LinearGradient
              colors={['transparent', 'transparent', darken(dominant, 0.4)]}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
          </View>
        )}

        <View style={styles.metaBlock}>
          {/* Category chip */}
          <View style={[styles.categoryChip, { borderColor: accent + '88' }]}>
            <Text style={[styles.categoryChipText, { color: accent }]}>{articleCategory}</Text>
          </View>

          {/* Headline */}
          <Text style={styles.headline}>{params.headline}</Text>

          {/* Source row: avatar + name + verified */}
          {allSources.length > 0 && (() => {
            const primary = allSources[0];
            const faviconUri = primary.url ? faviconFromUrl(primary.url) : '';
            return (
              <View style={styles.sourceRow}>
                <View style={[styles.sourceAvatar, { borderColor: dominant }]}>
                  {faviconUri ? (
                    <Image source={{ uri: faviconUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={[styles.sourceAvatarFallback, { backgroundColor: lighten(dominant, 0.2) }]}>
                      <Text style={[styles.sourceAvatarLetter, { color: accent }]}>
                        {primary.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sourceName}>{primary.name}</Text>
                <Ionicons name="checkmark-circle" size={14} color="#3B9EFF" />
                {params.sourceBias && params.sourceBias !== 'unknown' && (
                  <TouchableOpacity
                    onPress={() => setBiasModalVisible(true)}
                    style={{ marginLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}
                  >
                    <BiasDotPop><BiasDot bias={params.sourceBias as BiasRating} size={8} /></BiasDotPop>
                  </TouchableOpacity>
                )}
                {allSources.length > 1 && (
                  <Text style={[styles.sourceCount, { color: lighten(dominant, 0.4) }]}>
                    +{allSources.length - 1}
                  </Text>
                )}
              </View>
            );
          })()}

          {/* Date · time · reading time · difficulty — all inline */}
          <View style={styles.metaInline}>
            <Text style={[styles.metaInlineText, { color: lighten(dominant, 0.35) }]}>
              {fmtDateInline(params.publishedAt)}
            </Text>
            {readingTimeMinutes != null && (
              <>
                <Text style={[styles.metaInlineDot, { color: lighten(dominant, 0.35) }]}>·</Text>
                <Text style={[styles.metaInlineText, { color: lighten(dominant, 0.35) }]}>
                  {readingTimeMinutes} min read
                </Text>
              </>
            )}
            {showReadingDifficulty && difficulty != null && (
              <>
                <Text style={[styles.metaInlineDot, { color: lighten(dominant, 0.35) }]}>·</Text>
                <Text
                  style={[styles.metaInlineText, { color: DIFFICULTY_COLORS[difficulty] ?? '#FF9500', fontWeight: '600' }]}
                >
                  {difficulty}
                </Text>
              </>
            )}
          </View>

          {!!params.summary && (
            <Text style={styles.summaryText}>{params.summary}</Text>
          )}
        </View>

        <View style={[styles.tabBar, { backgroundColor: tabBg, borderColor: borderColor + '55' }]}>
          {(blockLongform ? TABS.filter(t => t !== 'Long Form') : TABS).map(tab => {
            const active = activeTab === tab;
            const iconName: React.ComponentProps<typeof Ionicons>['name'] =
              tab === 'Long Form' ? 'reader-outline' :
              tab === 'Summary'   ? 'document-text-outline' :
              tab === '5 Ws'      ? 'list-outline' :
                                    'happy-outline';
            return (
              <ArticleTabBtn
                key={tab}
                active={active}
                bg={lighten(dominant, 0.05)}
                onPress={() => setActiveTab(tab)}
              >
                <Ionicons
                  name={iconName}
                  size={15}
                  color={active ? '#FFFFFF' : 'rgba(255,255,255,0.4)'}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab}</Text>
              </ArticleTabBtn>
            );
          })}
        </View>

        <View style={styles.tabBody}>
          {renderTabContent()}
        </View>

        {/* Stats card + Verify Dedup — gated by Customize → showStatsCard. */}
        {showStatsCard && (() => {
          const wordCount = (s: string) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
          const preText = originalParagraphs.length > 0 ? originalParagraphs.join(' ') : '';
          const postText = paragraphs.length > 0 ? paragraphs.join(' ') : '';
          const preWords = wordCount(preText);
          const postWords = wordCount(postText);

          if (activeTab === 'Long Form') {
            if (preWords === 0) return null;
            const reduction = preWords > postWords
              ? Math.round(((preWords - postWords) / preWords) * 100)
              : 0;
            const paraReduction = originalParagraphs.length > paragraphs.length
              ? originalParagraphs.length - paragraphs.length
              : 0;
            return (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <View style={[styles.statsCard, { borderColor: borderColor + '55', marginHorizontal: 0 }]}>
                  <View style={[styles.statsIconCircle, { borderColor: accent + '88', backgroundColor: dominant + '40' }]}>
                    <Ionicons name="reader" size={14} color={accent} />
                  </View>
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: accent }]}>{preWords}</Text>
                    <Text style={styles.statLabel}>BEFORE</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={accent} />
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: accent }]}>{postWords}</Text>
                    <Text style={styles.statLabel}>AFTER</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: borderColor + '55' }]} />
                  <View style={styles.statTrend}>
                    <Ionicons name="trending-down" size={16} color={reduction > 0 ? '#34C759' : 'rgba(255,255,255,0.4)'} />
                  </View>
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: accent }]}>{reduction}%</Text>
                    <Text style={styles.statLabel}>
                      {dedupedFlag
                        ? paraReduction > 0 ? `LESS  (-${paraReduction} ¶)` : 'LESS'
                        : 'NO DEDUP'}
                    </Text>
                  </View>
                </View>
                {showVerifyDedupSetting && (
                  <Pressable
                    onPress={() => setDedupModalVisible(true)}
                    style={[styles.verifyLink, { borderColor: borderColor + '55', marginHorizontal: 0, marginTop: 10 }]}
                  >
                    <Ionicons name="code-slash-outline" size={12} color={accent} />
                    <Text style={[styles.verifyLinkText, { color: accent }]}>
                      VERIFY DEDUP · VIEW RAW FETCH
                    </Text>
                    <Ionicons name="chevron-forward" size={12} color={accent} />
                  </Pressable>
                )}
              </View>
            );
          }

          // AI tabs: show full article → AI-distilled comparison
          const originalWords = postWords || preWords;
          if (originalWords === 0) return null;
          let aiText = '';
          if (activeTab === 'Summary') {
            aiText = aiResult?.summary?.trim()
              ? aiResult.summary
              : (aiResult?.bullets?.join(' ') ?? '');
          } else if (activeTab === '5 Ws') {
            aiText = (aiResult?.fiveWs ?? []).join(' ');
          } else if (activeTab === 'ELI5') {
            aiText = aiResult?.eli5 ?? '';
          }
          const aiWords = wordCount(aiText);
          if (aiWords === 0) return null;
          const reduction = Math.max(0, Math.round(((originalWords - aiWords) / originalWords) * 100));

          return (
            <View style={[styles.statsCard, { borderColor: borderColor + '55', marginBottom: 16 }]}>
              <View style={[styles.statsIconCircle, { borderColor: accent + '88', backgroundColor: dominant + '40' }]}>
                <Ionicons name="sparkles" size={13} color={accent} />
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: accent }]}>{originalWords}</Text>
                <Text style={styles.statLabel}>ORIGINAL</Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color={accent} />
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: accent }]}>{aiWords}</Text>
                <Text style={styles.statLabel}>DISTILLED</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: borderColor + '55' }]} />
              <View style={styles.statTrend}>
                <Ionicons name="trending-down" size={16} color="#34C759" />
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: accent }]}>{reduction}%</Text>
                <Text style={styles.statLabel}>LESS</Text>
              </View>
            </View>
          );
        })()}

        {/* Referenced Articles section — Particle-style article rows */}
        {showReferencedSources && referencedSources.length > 0 && (
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

        {/* Key People & Organizations — tappable follow pills */}
        {(entities.people.length > 0 || entities.companies.length > 0) && (
          <View style={styles.entitySection}>
            {entities.people.length > 0 && (
              <View style={[styles.entityGroup, { backgroundColor: 'rgba(15,15,22,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 }]}>
                <Text style={[styles.entityHeader, { color: '#666' }]}>KEY PEOPLE</Text>
                <View style={styles.entityChips}>
                  {entities.people.map(p => {
                    const isOn = followedEntities.has(p.toLowerCase());
                    return (
                      <Pressable key={p} onPress={() => {
                        const on = toggleFollowEntity(p);
                        setFollowedEntities(prev => { const s = new Set(prev); on ? s.add(p.toLowerCase()) : s.delete(p.toLowerCase()); return s; });
                      }} style={[styles.entityChip, {
                        backgroundColor: isOn ? 'rgba(52,199,89,0.18)' : 'rgba(255,255,255,0.05)',
                        borderColor: isOn ? '#34C759' : 'rgba(255,255,255,0.1)',
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                      }]}>
                        {isOn && <Text style={{ color: '#34C759', fontSize: 10 }}>✓</Text>}
                        <Text style={[styles.entityText, { color: isOn ? '#34C759' : '#e8e8e8', fontWeight: isOn ? '700' : '500' }]}>👤 {p}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {entities.companies.length > 0 && (
              <View style={[styles.entityGroup, { backgroundColor: 'rgba(15,15,22,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 }]}>
                <Text style={[styles.entityHeader, { color: '#666' }]}>KEY ORGANIZATIONS</Text>
                <View style={styles.entityChips}>
                  {entities.companies.map(c => {
                    const isOn = followedEntities.has(c.toLowerCase());
                    return (
                      <Pressable key={c} onPress={() => {
                        const on = toggleFollowEntity(c);
                        setFollowedEntities(prev => { const s = new Set(prev); on ? s.add(c.toLowerCase()) : s.delete(c.toLowerCase()); return s; });
                      }} style={[styles.entityChip, {
                        backgroundColor: isOn ? 'rgba(52,199,89,0.18)' : 'rgba(255,255,255,0.05)',
                        borderColor: isOn ? '#34C759' : 'rgba(255,255,255,0.1)',
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                      }]}>
                        {isOn && <Text style={{ color: '#34C759', fontSize: 10 }}>✓</Text>}
                        <Text style={[styles.entityText, { color: isOn ? '#34C759' : '#e8e8e8', fontWeight: isOn ? '700' : '500' }]}>🏢 {c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ height: related.length >= 2 ? STRIP_HEIGHT + 16 : 60 }} />
      </ScrollView>
      </Animated.View>

      <BiasInfoModal bias={params.sourceBias} visible={biasModalVisible} onClose={() => setBiasModalVisible(false)} />
      <DedupValidationModal
        visible={dedupModalVisible}
        onClose={() => setDedupModalVisible(false)}
        originalParagraphs={originalParagraphs}
        paragraphs={paragraphs}
        dedupedFlag={dedupedFlag}
        apiUrl={params.url ? `${API}/article?url=${encodeURIComponent(params.url)}` : ''}
      />

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
                <Image source={story.imageUrl ? { uri: story.imageUrl } : FALLBACK_IMG} style={styles.relatedCardImg} contentFit="cover" />
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

function BiasDotPop({ children }: { children: React.ReactNode }) {
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(300),
      Animated.timing(s, { toValue: 1.4, duration: 220, useNativeDriver: true }),
      Animated.spring(s, { toValue: 1, friction: 3.5, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [s]);
  return <Animated.View style={{ transform: [{ scale: s }] }}>{children}</Animated.View>;
}

function ArticleTabBtn({ active, bg, onPress, children }: { active: boolean; bg: string; onPress: () => void; children: React.ReactNode }) {
  const s = useRef(new Animated.Value(active ? 1 : 0.9)).current;
  useEffect(() => {
    Animated.spring(s, { toValue: active ? 1 : 0.9, friction: 6, tension: 110, useNativeDriver: true }).start();
  }, [active, s]);
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.tabBtn, active && [styles.tabBtnActive, { backgroundColor: bg }]]}>
      <Animated.View style={{ transform: [{ scale: s }], flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

function BookmarkButton({ saved, bg, onPress }: { saved: boolean; bg: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handle = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 130, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Pressable style={[styles.glassBtn, { backgroundColor: bg }]} onPress={handle}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color="#FFF" />
      </Animated.View>
    </Pressable>
  );
}

function HeroImage({ uri, onError }: { uri: string; onError: () => void }) {
  const scale = useRef(new Animated.Value(1.12)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }], opacity }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" onError={onError} />
    </Animated.View>
  );
}

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

function RichParagraph({ text, fontSize, accentColor, highlights = true }: { text: string; fontSize: number; accentColor: string; highlights?: boolean }) {
  const segs = useMemo(() => tokenize(text), [text]);
  return (
    <Text style={[styles.paragraph, { fontSize, lineHeight: fontSize * 1.65 }]}>
      {segs.map((seg, i) => {
        if (!highlights) return <Text key={i}>{seg.text}</Text>;
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

function LongFormTab({ loading, paragraphs, error, summary, fontSize, url, accentColor, borderColor, showVerifyDedup, onVerifyDedup, highlights = true }: {
  loading: boolean; paragraphs: string[]; error: string | null; summary: string; fontSize: number; url?: string; accentColor: string;
  borderColor?: string; showVerifyDedup?: boolean; onVerifyDedup?: () => void; highlights?: boolean;
}) {
  if (loading) return <Spinner />;

  const isBlocked = !!error && /50[0-9]|blocked|unavailable/i.test(error);

  const verifyBtn = showVerifyDedup && onVerifyDedup ? (
    <Pressable
      onPress={onVerifyDedup}
      style={[styles.verifyLink, { borderColor: (borderColor ?? accentColor) + '55', marginTop: 12, marginBottom: 0 }]}
    >
      <Ionicons name="code-slash-outline" size={12} color={accentColor} />
      <Text style={[styles.verifyLinkText, { color: accentColor }]}>
        VERIFY DEDUP · VIEW RAW FETCH
      </Text>
      <Ionicons name="chevron-forward" size={12} color={accentColor} />
    </Pressable>
  ) : null;

  if (!paragraphs.length || isBlocked) {
    return (
      <View>
        <Text style={styles.errorHint}>Full text unavailable from this publisher</Text>
        {summary ? (
          <RichParagraph text={summary} fontSize={fontSize} accentColor={accentColor} highlights={highlights} />
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
        {verifyBtn}
      </View>
    );
  }

  return (
    <View>
      {paragraphs.map((p, i) => <RichParagraph key={i} text={p} fontSize={fontSize} accentColor={accentColor} highlights={highlights} />)}
      {url ? (
        <TouchableOpacity
          style={styles.readFullBtn}
          onPress={() => WebBrowser.openBrowserAsync(url)}
        >
          <Text style={styles.readFullText}>Read Full Article →</Text>
        </TouchableOpacity>
      ) : null}
      {verifyBtn}
    </View>
  );
}

function SummaryTab({ loading, result, error, accentColor, fontSize, showKeyPoints = true, highlights = true }: { loading: boolean; result: AiResult | null; error: string | null; accentColor: string; fontSize: number; showKeyPoints?: boolean; highlights?: boolean }) {
  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;
  if (!result) return <ErrorMsg msg="No summary available." />;

  // Prefer narrative `summary` (paragraph prose) over `bullets`. If the model
  // returned only bullets (older cache), stitch them into prose so the user
  // still gets a readable flow instead of a bullet dump.
  const rawSummary = (result.summary ?? '').trim();
  const bullets = result.bullets ?? [];
  const narrative = rawSummary
    || bullets.join(' ').trim()
    || '';

  if (!narrative) return <ErrorMsg msg="No summary available." />;

  // Split on blank-line paragraph breaks; fall back to sentence-batched
  // paragraphs (~3 sentences each) if the model returned one wall of text.
  const paragraphs = narrative.includes('\n\n')
    ? narrative.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    : sentenceParagraphs(narrative, 3);

  return (
    <View>
      {paragraphs.map((p, i) => (
        <RichParagraph key={i} text={p} fontSize={fontSize} accentColor={accentColor} highlights={highlights} />
      ))}
      {showKeyPoints && bullets.length > 0 && rawSummary ? (
        <View style={{ marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10.5, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>KEY POINTS</Text>
          {bullets.map((line, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: accentColor }]} />
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Splits a single paragraph string into N-sentence chunks for readability
// when the model didn't honor the \n\n paragraph instruction.
function sentenceParagraphs(text: string, sentencesPer: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPer) {
    out.push(sentences.slice(i, i + sentencesPer).join(' '));
  }
  return out;
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
  topBarRight: { flexDirection: 'row', gap: 10 },
  glassBtn: {
    borderRadius: 22, padding: 9,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  scroll: { flex: 1 },
  heroContainer: { height: HERO_HEIGHT, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  // Image-less articles — typographic hero so it still feels intentional
  heroFallback: { overflow: 'hidden' },
  heroFallbackCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 24,
  },
  heroFallbackAvatar: {
    width: 64, height: 64, borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  heroFallbackLetter: { fontSize: 28, fontWeight: '800' },
  heroFallbackSource: {
    fontSize: 16, fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroFallbackDivider: { width: 40, height: 1, borderRadius: 1 },
  heroFallbackTag: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2,
  },
  // Pull metaBlock up so headline starts inside the faded bottom of the image —
  // image dissolves into screen bg with no visible edge.
  metaBlock: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, marginTop: -32 },
  categoryChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 14,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headline: { color: '#FFF', fontSize: 24, fontWeight: '800', lineHeight: 32 },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  sourceAvatar: {
    width: 30, height: 30, borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 2,
  },
  sourceAvatarFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  sourceAvatarLetter: { fontSize: 12, fontWeight: '800' },
  sourceName: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  sourceCount: { marginLeft: 4, fontSize: 11, fontWeight: '600' },
  metaInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  metaInlineText: { fontSize: 12, fontWeight: '500' },
  metaInlineDot: { fontSize: 12 },
  publishedAt: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginTop: 10 },
  summaryText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 22, marginTop: 14 },
  readingMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4, paddingHorizontal: 16 },
  readingMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  metaDot: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16,
    borderRadius: 999, padding: 4, marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 999,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  tabBtnActive: {},
  tabLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: '#FFFFFF' },
  tabBody: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    paddingBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: 8,
  },
  statsIconCircle: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  statTrend: { paddingHorizontal: 2 },
  verifyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  verifyLinkText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  statCell: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  statArrow: {
    paddingHorizontal: 4,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    marginHorizontal: 4,
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
