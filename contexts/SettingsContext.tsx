import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { registerForPush, updatePushPreferences } from '../utils/notifications';
import { INTEREST_TOPICS } from '../utils/interestTopics';

export type FontSize = 'Small' | 'Medium' | 'Large' | 'XLarge';

// Customize types — mirror web's SettingsContext.
export type CardDensity = 'compact' | 'comfortable' | 'spacious';
export type ArticleTab = 'Long Form' | 'Summary' | '5 Ws' | 'ELI5';
export type SummaryLength = 'short' | 'medium' | 'long';
export type SummaryFormat = 'paragraph' | 'bullets';
export type KeyPointsCount = 3 | 5 | 7;
export type Eli5Tone = 'kid' | 'casual' | 'plain';
export type DeepDiveDepth = 'quick' | 'standard' | 'deep';
export type BreakingSensitivity = 'all' | 'important' | 'critical' | 'super-critical';
export type TimeFormat = 'relative' | 'absolute';
export type FontFamily = 'inter' | 'serif' | 'system';
export type LineHeightMode = 'tight' | 'normal' | 'loose';
export type ColumnWidth = 'narrow' | 'medium' | 'wide';
export type LinkOpen = 'in-app' | 'external';

export const ALL_TOPICS = ['breaking', 'technology', 'india-politics', 'geopolitics', 'markets', 'business'] as const;
export type TopicKey = typeof ALL_TOPICS[number];

const DEFAULT_ACTIVE_TOPICS: Record<TopicKey, boolean> = {
  breaking: true,
  technology: true,
  'india-politics': true,
  geopolitics: true,
  markets: true,
  business: true,
};

interface SettingsContextType {
  fontSize: FontSize;
  setFontSize: (fs: FontSize) => void;
  notifBreaking: boolean;
  setNotifBreaking: (v: boolean) => void;
  breakingSensitivity: BreakingSensitivity;
  setBreakingSensitivity: (v: BreakingSensitivity) => void;
  notifTech: boolean;
  setNotifTech: (v: boolean) => void;
  notifDigest: boolean;
  setNotifDigest: (v: boolean) => void;
  notifAiFeed: boolean;
  setNotifAiFeed: (v: boolean) => void;
  notifSources: boolean;
  setNotifSources: (v: boolean) => void;
  favSources: string[];
  toggleFavSource: (name: string) => void;
  favTopics: string[];
  toggleFavTopic: (key: string) => void;
  showSports: boolean;
  setShowSports: (v: boolean) => void;
  showEntertainment: boolean;
  setShowEntertainment: (v: boolean) => void;
  activeTopics: Record<TopicKey, boolean>;
  toggleTopic: (topic: TopicKey) => void;
  activeSubTopics: Record<string, boolean>;
  toggleSubTopic: (key: string) => void;
  topicInterests: Record<string, number>;
  setTopicInterest: (id: string, stars: number) => void;
  resetSettings: () => void;

  // ── Customize: Feed ────────────────────────────────────────────────────
  showClusterSummary: boolean; setShowClusterSummary: (v: boolean) => void;
  showBiasDots: boolean; setShowBiasDots: (v: boolean) => void;
  showMetaPill: boolean; setShowMetaPill: (v: boolean) => void;
  showCardImages: boolean; setShowCardImages: (v: boolean) => void;
  cardDensity: CardDensity; setCardDensity: (v: CardDensity) => void;

  // ── Customize: Article ─────────────────────────────────────────────────
  defaultArticleTab: ArticleTab; setDefaultArticleTab: (v: ArticleTab) => void;
  showStatsCard: boolean; setShowStatsCard: (v: boolean) => void;
  showArticleRssSummary: boolean; setShowArticleRssSummary: (v: boolean) => void;
  showVerifyDedup: boolean; setShowVerifyDedup: (v: boolean) => void;
  showReferencedSources: boolean; setShowReferencedSources: (v: boolean) => void;
  showEntityHighlights: boolean; setShowEntityHighlights: (v: boolean) => void;
  showReadingDifficulty: boolean; setShowReadingDifficulty: (v: boolean) => void;

  // ── Customize: AI ──────────────────────────────────────────────────────
  summaryLength: SummaryLength; setSummaryLength: (v: SummaryLength) => void;
  summaryFormat: SummaryFormat; setSummaryFormat: (v: SummaryFormat) => void;
  keyPointsCount: KeyPointsCount; setKeyPointsCount: (v: KeyPointsCount) => void;
  showKeyPoints: boolean; setShowKeyPoints: (v: boolean) => void;
  eli5Tone: Eli5Tone; setEli5Tone: (v: Eli5Tone) => void;
  deepDiveDepth: DeepDiveDepth; setDeepDiveDepth: (v: DeepDiveDepth) => void;
  showDeepDiveEntities: boolean; setShowDeepDiveEntities: (v: boolean) => void;
  showDeepDiveCurious: boolean; setShowDeepDiveCurious: (v: boolean) => void;

  // ── Customize: Appearance / Behavior ──────────────────────────────────────
  timeFormat: TimeFormat; setTimeFormat: (v: TimeFormat) => void;
  autoMarkRead: boolean; setAutoMarkRead: (v: boolean) => void;
  showQuoteHighlights: boolean; setShowQuoteHighlights: (v: boolean) => void;

  // ── Customize: Article reader (typography) ────────────────────────────
  fontFamily: FontFamily; setFontFamily: (v: FontFamily) => void;
  lineHeightMode: LineHeightMode; setLineHeightMode: (v: LineHeightMode) => void;
  columnWidth: ColumnWidth; setColumnWidth: (v: ColumnWidth) => void;

  // ── Customize: Behavior ────────────────────────────────────────────────
  defaultTopic: TopicKey; setDefaultTopic: (v: TopicKey) => void;
  linkOpen: LinkOpen; setLinkOpen: (v: LinkOpen) => void;
  pullToRefresh: boolean; setPullToRefresh: (v: boolean) => void;

  // ── Customize: Navigation (hide/show tabs + topic pills) ──────────────
  hiddenTabs: string[]; toggleHiddenTab: (tab: string) => void;
  hiddenTopics: string[]; toggleHiddenTopic: (topic: string) => void;

  resetCustomize: () => void;
}

const STORAGE_KEY = '@ireader_settings';

const DEFAULTS = {
  fontSize: 'Medium' as FontSize,
  notifBreaking: true,
  breakingSensitivity: 'important' as BreakingSensitivity,
  notifTech: true,
  notifDigest: false,
  notifAiFeed: false,
  notifSources: false,
  showSports: false,
  showEntertainment: false,
  activeTopics: DEFAULT_ACTIVE_TOPICS,

  // Customize defaults — match current behaviour.
  showClusterSummary: true,
  showBiasDots: true,
  showMetaPill: true,
  showCardImages: true,
  cardDensity: 'comfortable' as CardDensity,
  defaultArticleTab: 'Long Form' as ArticleTab,
  showStatsCard: true,
  showArticleRssSummary: true,
  showVerifyDedup: true,
  showReferencedSources: true,
  showEntityHighlights: true,
  showReadingDifficulty: true,
  summaryLength: 'medium' as SummaryLength,
  summaryFormat: 'paragraph' as SummaryFormat,
  keyPointsCount: 3 as KeyPointsCount,
  showKeyPoints: true,
  eli5Tone: 'casual' as Eli5Tone,
  deepDiveDepth: 'standard' as DeepDiveDepth,
  showDeepDiveEntities: true,
  showDeepDiveCurious: true,
  timeFormat: 'relative' as TimeFormat,
  autoMarkRead: false,
  showQuoteHighlights: true,
  fontFamily: 'inter' as FontFamily,
  lineHeightMode: 'normal' as LineHeightMode,
  columnWidth: 'medium' as ColumnWidth,
  defaultTopic: 'breaking' as TopicKey,
  linkOpen: 'in-app' as LinkOpen,
  pullToRefresh: true,
  hiddenTabs: [] as string[],
  hiddenTopics: [] as string[],
};

const SettingsContext = createContext<SettingsContextType>({
  ...DEFAULTS,
  activeSubTopics: {},
  favSources: [],
  favTopics: [],
  topicInterests: {},
  setFontSize: () => {},
  setNotifBreaking: () => {},
  breakingSensitivity: 'important' as BreakingSensitivity,
  setBreakingSensitivity: () => {},
  notifAiFeed: false,
  setNotifAiFeed: () => {},
  setNotifTech: () => {},
  setNotifDigest: () => {},
  setNotifSources: () => {},
  setShowSports: () => {},
  setShowEntertainment: () => {},
  toggleFavSource: () => {},
  toggleFavTopic: () => {},
  toggleTopic: () => {},
  toggleSubTopic: () => {},
  setTopicInterest: () => {},
  resetSettings: () => {},

  // Customize noops
  setShowClusterSummary: () => {}, setShowBiasDots: () => {}, setShowMetaPill: () => {},
  setShowCardImages: () => {}, setCardDensity: () => {},
  setDefaultArticleTab: () => {}, setShowStatsCard: () => {}, setShowArticleRssSummary: () => {}, setShowVerifyDedup: () => {},
  setShowReferencedSources: () => {}, setShowEntityHighlights: () => {}, setShowReadingDifficulty: () => {},
  setSummaryLength: () => {}, setSummaryFormat: () => {}, setKeyPointsCount: () => {}, setShowKeyPoints: () => {},
  setEli5Tone: () => {}, setDeepDiveDepth: () => {},
  setShowDeepDiveEntities: () => {}, setShowDeepDiveCurious: () => {},
  timeFormat: 'relative' as TimeFormat, setTimeFormat: () => {},
  autoMarkRead: false, setAutoMarkRead: () => {},
  showQuoteHighlights: true, setShowQuoteHighlights: () => {},
  setFontFamily: () => {}, setLineHeightMode: () => {}, setColumnWidth: () => {},
  setDefaultTopic: () => {}, setLinkOpen: () => {}, setPullToRefresh: () => {},
  toggleHiddenTab: () => {}, toggleHiddenTopic: () => {},
  resetCustomize: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(DEFAULTS.fontSize);
  const [notifBreaking, setNotifBreakingState] = useState(DEFAULTS.notifBreaking);
  const [breakingSensitivity, setBreakingSensitivityState] = useState<BreakingSensitivity>(DEFAULTS.breakingSensitivity);
  const [notifTech, setNotifTechState] = useState(DEFAULTS.notifTech);
  const [notifDigest, setNotifDigestState] = useState(DEFAULTS.notifDigest);
  const [notifAiFeed, setNotifAiFeedState] = useState(DEFAULTS.notifAiFeed);
  const [notifSources, setNotifSourcesState] = useState(DEFAULTS.notifSources);
  const [activeTopics, setActiveTopics] = useState<Record<TopicKey, boolean>>(DEFAULTS.activeTopics);
  const [activeSubTopics, setActiveSubTopics] = useState<Record<string, boolean>>({});
  const [favSources, setFavSources] = useState<string[]>([]);
  const [favTopics, setFavTopics] = useState<string[]>([]);
  const [topicInterests, setTopicInterests] = useState<Record<string, number>>({});
  const [showSports, setShowSportsState] = useState(DEFAULTS.showSports);
  const [showEntertainment, setShowEntertainmentState] = useState(DEFAULTS.showEntertainment);

  // Customize state
  const [showClusterSummary, setShowClusterSummary] = useState(DEFAULTS.showClusterSummary);
  const [showBiasDots, setShowBiasDots] = useState(DEFAULTS.showBiasDots);
  const [showMetaPill, setShowMetaPill] = useState(DEFAULTS.showMetaPill);
  const [showCardImages, setShowCardImages] = useState(DEFAULTS.showCardImages);
  const [cardDensity, setCardDensity] = useState<CardDensity>(DEFAULTS.cardDensity);
  const [defaultArticleTab, setDefaultArticleTab] = useState<ArticleTab>(DEFAULTS.defaultArticleTab);
  const [showStatsCard, setShowStatsCard] = useState(DEFAULTS.showStatsCard);
  const [showArticleRssSummary, setShowArticleRssSummary] = useState(DEFAULTS.showArticleRssSummary);
  const [showVerifyDedup, setShowVerifyDedup] = useState(DEFAULTS.showVerifyDedup);
  const [showReferencedSources, setShowReferencedSources] = useState(DEFAULTS.showReferencedSources);
  const [showEntityHighlights, setShowEntityHighlights] = useState(DEFAULTS.showEntityHighlights);
  const [showReadingDifficulty, setShowReadingDifficulty] = useState(DEFAULTS.showReadingDifficulty);
  const [summaryLength, setSummaryLength] = useState<SummaryLength>(DEFAULTS.summaryLength);
  const [summaryFormat, setSummaryFormat] = useState<SummaryFormat>(DEFAULTS.summaryFormat);
  const [keyPointsCount, setKeyPointsCount] = useState<KeyPointsCount>(DEFAULTS.keyPointsCount);
  const [showKeyPoints, setShowKeyPoints] = useState(DEFAULTS.showKeyPoints);
  const [eli5Tone, setEli5Tone] = useState<Eli5Tone>(DEFAULTS.eli5Tone);
  const [deepDiveDepth, setDeepDiveDepth] = useState<DeepDiveDepth>(DEFAULTS.deepDiveDepth);
  const [showDeepDiveEntities, setShowDeepDiveEntities] = useState(DEFAULTS.showDeepDiveEntities);
  const [showDeepDiveCurious, setShowDeepDiveCurious] = useState(DEFAULTS.showDeepDiveCurious);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(DEFAULTS.timeFormat);
  const [autoMarkRead, setAutoMarkRead] = useState(DEFAULTS.autoMarkRead);
  const [showQuoteHighlights, setShowQuoteHighlights] = useState(DEFAULTS.showQuoteHighlights);
  const [fontFamily, setFontFamily] = useState<FontFamily>(DEFAULTS.fontFamily);
  const [lineHeightMode, setLineHeightMode] = useState<LineHeightMode>(DEFAULTS.lineHeightMode);
  const [columnWidth, setColumnWidth] = useState<ColumnWidth>(DEFAULTS.columnWidth);
  const [defaultTopic, setDefaultTopic] = useState<TopicKey>(DEFAULTS.defaultTopic);
  const [linkOpen, setLinkOpen] = useState<LinkOpen>(DEFAULTS.linkOpen);
  const [pullToRefresh, setPullToRefresh] = useState(DEFAULTS.pullToRefresh);
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(DEFAULTS.hiddenTabs);
  const [hiddenTopics, setHiddenTopics] = useState<string[]>(DEFAULTS.hiddenTopics);

  const [loaded, setLoaded] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (saved.fontSize) setFontSizeState(saved.fontSize);
          if (typeof saved.notifBreaking === 'boolean') setNotifBreakingState(saved.notifBreaking);
          if (['all','important','critical','super-critical'].includes(saved.breakingSensitivity)) setBreakingSensitivityState(saved.breakingSensitivity);
          if (typeof saved.notifTech === 'boolean') setNotifTechState(saved.notifTech);
          if (typeof saved.notifDigest === 'boolean') setNotifDigestState(saved.notifDigest);
          if (typeof saved.notifAiFeed === 'boolean') setNotifAiFeedState(saved.notifAiFeed);
          if (typeof saved.notifSources === 'boolean') setNotifSourcesState(saved.notifSources);
          if (saved.activeTopics && typeof saved.activeTopics === 'object') {
            setActiveTopics({ ...DEFAULTS.activeTopics, ...saved.activeTopics });
          }
          if (saved.activeSubTopics && typeof saved.activeSubTopics === 'object') {
            setActiveSubTopics(saved.activeSubTopics);
          }
          if (Array.isArray(saved.favSources)) setFavSources(saved.favSources);
          if (Array.isArray(saved.favTopics)) setFavTopics(saved.favTopics);
          if (saved.topicInterests && typeof saved.topicInterests === 'object') setTopicInterests(saved.topicInterests);
          if (typeof saved.showSports === 'boolean') setShowSportsState(saved.showSports);
          if (typeof saved.showEntertainment === 'boolean') setShowEntertainmentState(saved.showEntertainment);
          // Customize loads
          if (typeof saved.showClusterSummary === 'boolean') setShowClusterSummary(saved.showClusterSummary);
          if (typeof saved.showBiasDots === 'boolean') setShowBiasDots(saved.showBiasDots);
          if (typeof saved.showMetaPill === 'boolean') setShowMetaPill(saved.showMetaPill);
          if (typeof saved.showCardImages === 'boolean') setShowCardImages(saved.showCardImages);
          if (['compact','comfortable','spacious'].includes(saved.cardDensity)) setCardDensity(saved.cardDensity);
          if (['Long Form','Summary','5 Ws','ELI5'].includes(saved.defaultArticleTab)) setDefaultArticleTab(saved.defaultArticleTab);
          if (typeof saved.showStatsCard === 'boolean') setShowStatsCard(saved.showStatsCard);
          if (typeof saved.showArticleRssSummary === 'boolean') setShowArticleRssSummary(saved.showArticleRssSummary);
          if (typeof saved.showVerifyDedup === 'boolean') setShowVerifyDedup(saved.showVerifyDedup);
          if (typeof saved.showReferencedSources === 'boolean') setShowReferencedSources(saved.showReferencedSources);
          if (typeof saved.showEntityHighlights === 'boolean') setShowEntityHighlights(saved.showEntityHighlights);
          if (typeof saved.showReadingDifficulty === 'boolean') setShowReadingDifficulty(saved.showReadingDifficulty);
          if (['short','medium','long'].includes(saved.summaryLength)) setSummaryLength(saved.summaryLength);
          if (['paragraph','bullets'].includes(saved.summaryFormat)) setSummaryFormat(saved.summaryFormat);
          if ([3,5,7].includes(saved.keyPointsCount)) setKeyPointsCount(saved.keyPointsCount);
          if (typeof saved.showKeyPoints === 'boolean') setShowKeyPoints(saved.showKeyPoints);
          if (['kid','casual','plain'].includes(saved.eli5Tone)) setEli5Tone(saved.eli5Tone);
          if (['quick','standard','deep'].includes(saved.deepDiveDepth)) setDeepDiveDepth(saved.deepDiveDepth);
          if (typeof saved.showDeepDiveEntities === 'boolean') setShowDeepDiveEntities(saved.showDeepDiveEntities);
          if (typeof saved.showDeepDiveCurious === 'boolean') setShowDeepDiveCurious(saved.showDeepDiveCurious);
          if (['relative','absolute'].includes(saved.timeFormat)) setTimeFormat(saved.timeFormat);
          if (typeof saved.autoMarkRead === 'boolean') setAutoMarkRead(saved.autoMarkRead);
          if (typeof saved.showQuoteHighlights === 'boolean') setShowQuoteHighlights(saved.showQuoteHighlights);
          if (['inter','serif','system'].includes(saved.fontFamily)) setFontFamily(saved.fontFamily);
          if (['tight','normal','loose'].includes(saved.lineHeightMode)) setLineHeightMode(saved.lineHeightMode);
          if (['narrow','medium','wide'].includes(saved.columnWidth)) setColumnWidth(saved.columnWidth);
          if (typeof saved.defaultTopic === 'string') setDefaultTopic(saved.defaultTopic);
          if (['in-app','external'].includes(saved.linkOpen)) setLinkOpen(saved.linkOpen);
          if (typeof saved.pullToRefresh === 'boolean') setPullToRefresh(saved.pullToRefresh);
          if (Array.isArray(saved.hiddenTabs)) setHiddenTabs(saved.hiddenTabs);
          if (Array.isArray(saved.hiddenTopics)) setHiddenTopics(saved.hiddenTopics);
        } catch {}
      }
    }).finally(() => setLoaded(true));
  }, []);

  // Persist whenever any setting changes (after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      fontSize, notifBreaking, breakingSensitivity, notifTech, notifDigest, notifAiFeed, notifSources,
      activeTopics, activeSubTopics, favSources, favTopics, topicInterests,
      showSports, showEntertainment,
      // Customize
      showClusterSummary, showBiasDots, showMetaPill, showCardImages, cardDensity,
      defaultArticleTab, showStatsCard, showArticleRssSummary, showVerifyDedup, showReferencedSources,
      showEntityHighlights, showReadingDifficulty,
      summaryLength, summaryFormat, keyPointsCount, showKeyPoints,
      eli5Tone, deepDiveDepth, showDeepDiveEntities, showDeepDiveCurious,
      timeFormat, autoMarkRead, showQuoteHighlights,
      fontFamily, lineHeightMode, columnWidth,
      defaultTopic, linkOpen, pullToRefresh,
      hiddenTabs, hiddenTopics,
    })).catch(() => {});
  }, [loaded, fontSize, notifBreaking, breakingSensitivity, notifTech, notifDigest, notifAiFeed, notifSources, activeTopics, activeSubTopics, favSources, favTopics, topicInterests, showSports, showEntertainment, showClusterSummary, showBiasDots, showMetaPill, showCardImages, cardDensity, defaultArticleTab, showStatsCard, showArticleRssSummary, showVerifyDedup, showReferencedSources, showEntityHighlights, showReadingDifficulty, summaryLength, summaryFormat, keyPointsCount, showKeyPoints, eli5Tone, deepDiveDepth, showDeepDiveEntities, showDeepDiveCurious, timeFormat, autoMarkRead, showQuoteHighlights, fontFamily, lineHeightMode, columnWidth, defaultTopic, linkOpen, pullToRefresh, hiddenTabs, hiddenTopics]);

  // Reconcile backend notification prefs with the toggles shown locally —
  // ONCE per launch, after settings load. Fixes the fresh-install / new-token
  // case: the DB prefs row defaults every category to false, and the client
  // previously only synced a category when the user *toggled* it. So a toggle
  // that's "on" by default (e.g. Breaking) was never pushed → backend stayed
  // false → no breaking notifications even though the UI showed it enabled.
  const didReconcileRef = useRef(false);
  useEffect(() => {
    if (!loaded || didReconcileRef.current) return;
    didReconcileRef.current = true;
    (async () => {
      try {
        await registerForPush();
        // Build keyword|Label|stars pairs from starred interests (matches the
        // Settings screen's sync format).
        const pairs: string[] = [];
        const seen = new Set<string>();
        for (const t of INTEREST_TOPICS.filter(t => (topicInterests[t.id] ?? 0) > 0)) {
          const stars = Math.max(1, Math.min(5, topicInterests[t.id] ?? 0));
          for (const kw of t.keywords) {
            const key = kw.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push(`${kw}|${t.label}|${stars}`);
          }
        }
        await updatePushPreferences({
          breakingEnabled: notifBreaking,
          breakingSensitivity,
          aiFeedEnabled: notifAiFeed,
          topicsEnabled: notifTech,
          topicsKeywords: notifTech ? pairs.slice(0, 500) : [],
          digestEnabled: notifDigest,
          favSourcesEnabled: favSources.length > 0,
          favSources,
        });
      } catch { /* best-effort; toggles still sync on change */ }
    })();
    // Intentionally only depends on `loaded` — runs once after first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const setFontSize = useCallback((fs: FontSize) => setFontSizeState(fs), []);

  const setNotifBreaking = useCallback((v: boolean) => setNotifBreakingState(v), []);
  const setBreakingSensitivity = useCallback((v: BreakingSensitivity) => setBreakingSensitivityState(v), []);
  const setNotifAiFeed = useCallback((v: boolean) => setNotifAiFeedState(v), []);
  const setNotifTech = useCallback((v: boolean) => setNotifTechState(v), []);
  const setNotifDigest = useCallback((v: boolean) => setNotifDigestState(v), []);
  const setNotifSources = useCallback((v: boolean) => setNotifSourcesState(v), []);

  const toggleFavSource = useCallback((name: string) => {
    setFavSources(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name],
    );
  }, []);

  const toggleFavTopic = useCallback((key: string) => {
    setFavTopics(prev =>
      prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key],
    );
  }, []);
  const toggleHiddenTab = useCallback((tab: string) => {
    setHiddenTabs(prev => prev.includes(tab) ? prev.filter(t => t !== tab) : [...prev, tab]);
  }, []);
  const toggleHiddenTopic = useCallback((topic: string) => {
    setHiddenTopics(prev => prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]);
  }, []);

  const toggleTopic = useCallback((topic: TopicKey) => {
    setActiveTopics(prev => ({ ...prev, [topic]: !prev[topic] }));
  }, []);

  const toggleSubTopic = useCallback((key: string) => {
    setActiveSubTopics(prev => ({ ...prev, [key]: prev[key] === false ? true : false }));
  }, []);

  const setTopicInterest = useCallback((id: string, stars: number) => {
    setTopicInterests(prev => ({ ...prev, [id]: stars }));
  }, []);

  const resetSettings = useCallback(() => {
    setFontSizeState(DEFAULTS.fontSize);
    setNotifBreakingState(DEFAULTS.notifBreaking);
    setBreakingSensitivityState(DEFAULTS.breakingSensitivity);
    setNotifTechState(DEFAULTS.notifTech);
    setNotifDigestState(DEFAULTS.notifDigest);
    setNotifSourcesState(DEFAULTS.notifSources);
    setActiveTopics(DEFAULTS.activeTopics);
    setActiveSubTopics({});
    setFavSources([]);
    setFavTopics([]);
    setTopicInterests({});
    setShowSportsState(DEFAULTS.showSports);
    setShowEntertainmentState(DEFAULTS.showEntertainment);
  }, []);

  const setShowSports = useCallback((v: boolean) => setShowSportsState(v), []);
  const setShowEntertainment = useCallback((v: boolean) => setShowEntertainmentState(v), []);

  const resetCustomize = useCallback(() => {
    setShowClusterSummary(DEFAULTS.showClusterSummary);
    setShowBiasDots(DEFAULTS.showBiasDots);
    setShowMetaPill(DEFAULTS.showMetaPill);
    setShowCardImages(DEFAULTS.showCardImages);
    setCardDensity(DEFAULTS.cardDensity);
    setDefaultArticleTab(DEFAULTS.defaultArticleTab);
    setShowStatsCard(DEFAULTS.showStatsCard);
    setShowArticleRssSummary(DEFAULTS.showArticleRssSummary);
    setShowVerifyDedup(DEFAULTS.showVerifyDedup);
    setShowReferencedSources(DEFAULTS.showReferencedSources);
    setShowEntityHighlights(DEFAULTS.showEntityHighlights);
    setShowReadingDifficulty(DEFAULTS.showReadingDifficulty);
    setSummaryLength(DEFAULTS.summaryLength);
    setSummaryFormat(DEFAULTS.summaryFormat);
    setKeyPointsCount(DEFAULTS.keyPointsCount);
    setShowKeyPoints(DEFAULTS.showKeyPoints);
    setEli5Tone(DEFAULTS.eli5Tone);
    setDeepDiveDepth(DEFAULTS.deepDiveDepth);
    setShowDeepDiveEntities(DEFAULTS.showDeepDiveEntities);
    setShowDeepDiveCurious(DEFAULTS.showDeepDiveCurious);
    setTimeFormat(DEFAULTS.timeFormat);
    setAutoMarkRead(DEFAULTS.autoMarkRead);
    setShowQuoteHighlights(DEFAULTS.showQuoteHighlights);
    setFontFamily(DEFAULTS.fontFamily);
    setLineHeightMode(DEFAULTS.lineHeightMode);
    setColumnWidth(DEFAULTS.columnWidth);
    setDefaultTopic(DEFAULTS.defaultTopic);
    setLinkOpen(DEFAULTS.linkOpen);
    setPullToRefresh(DEFAULTS.pullToRefresh);
    setHiddenTabs(DEFAULTS.hiddenTabs);
    setHiddenTopics(DEFAULTS.hiddenTopics);
  }, []);

  const value = useMemo(() => ({
    fontSize, setFontSize,
    notifBreaking, setNotifBreaking,
    breakingSensitivity, setBreakingSensitivity,
    notifTech, setNotifTech,
    notifDigest, setNotifDigest,
    notifAiFeed, setNotifAiFeed,
    notifSources, setNotifSources,
    showSports, setShowSports,
    showEntertainment, setShowEntertainment,
    favSources, toggleFavSource,
    favTopics, toggleFavTopic,
    activeTopics, toggleTopic,
    activeSubTopics, toggleSubTopic,
    topicInterests, setTopicInterest,
    resetSettings,
    // Customize
    showClusterSummary, setShowClusterSummary,
    showBiasDots, setShowBiasDots,
    showMetaPill, setShowMetaPill,
    showCardImages, setShowCardImages,
    cardDensity, setCardDensity,
    defaultArticleTab, setDefaultArticleTab,
    showStatsCard, setShowStatsCard,
    showArticleRssSummary, setShowArticleRssSummary,
    showVerifyDedup, setShowVerifyDedup,
    showReferencedSources, setShowReferencedSources,
    showEntityHighlights, setShowEntityHighlights,
    showReadingDifficulty, setShowReadingDifficulty,
    summaryLength, setSummaryLength,
    summaryFormat, setSummaryFormat,
    keyPointsCount, setKeyPointsCount,
    showKeyPoints, setShowKeyPoints,
    eli5Tone, setEli5Tone,
    deepDiveDepth, setDeepDiveDepth,
    showDeepDiveEntities, setShowDeepDiveEntities,
    showDeepDiveCurious, setShowDeepDiveCurious,
    timeFormat, setTimeFormat,
    autoMarkRead, setAutoMarkRead,
    showQuoteHighlights, setShowQuoteHighlights,
    fontFamily, setFontFamily, lineHeightMode, setLineHeightMode, columnWidth, setColumnWidth,
    defaultTopic, setDefaultTopic, linkOpen, setLinkOpen, pullToRefresh, setPullToRefresh,
    hiddenTabs, toggleHiddenTab, hiddenTopics, toggleHiddenTopic,
    resetCustomize,
  }), [fontSize, notifBreaking, breakingSensitivity, notifTech, notifDigest, notifAiFeed, notifSources, showSports, showEntertainment, favSources, favTopics, topicInterests, activeTopics, activeSubTopics, setFontSize, setNotifBreaking, setBreakingSensitivity, setNotifTech, setNotifDigest, setNotifAiFeed, setNotifSources, setShowSports, setShowEntertainment, toggleFavSource, toggleFavTopic, toggleTopic, toggleSubTopic, setTopicInterest, resetSettings, showClusterSummary, showBiasDots, showMetaPill, showCardImages, cardDensity, defaultArticleTab, showStatsCard, showArticleRssSummary, showVerifyDedup, showReferencedSources, showEntityHighlights, showReadingDifficulty, summaryLength, summaryFormat, keyPointsCount, showKeyPoints, eli5Tone, deepDiveDepth, showDeepDiveEntities, showDeepDiveCurious, timeFormat, autoMarkRead, showQuoteHighlights, fontFamily, setFontFamily, lineHeightMode, setLineHeightMode, columnWidth, setColumnWidth, defaultTopic, setDefaultTopic, linkOpen, setLinkOpen, pullToRefresh, setPullToRefresh, hiddenTabs, toggleHiddenTab, hiddenTopics, toggleHiddenTopic, resetCustomize]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
