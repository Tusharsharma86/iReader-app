import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { FontSize, TopicKey, CategoryTopic } from '../types';

const ALL_TOPICS: TopicKey[] = ['breaking','technology','india-politics','geopolitics','markets','business'];

const DEFAULT_ACTIVE_TOPICS = Object.fromEntries(ALL_TOPICS.map(t => [t, true])) as Record<TopicKey, boolean>;

// ── Customize options (waves 1 + 2) ──────────────────────────────────────────
export type CardDensity = 'compact' | 'comfortable' | 'spacious';
export type ArticleTab = 'Long Form' | 'Summary' | '5 Ws' | 'ELI5';
export type SummaryLength = 'short' | 'medium' | 'long';
export type SummaryFormat = 'paragraph' | 'bullets';
export type KeyPointsCount = 3 | 5 | 7;
export type LinkOpen = 'in-app' | 'external';
// Wave 2
export type ThemeMode = 'dark' | 'light' | 'auto';
export type FontFamily = 'inter' | 'serif' | 'system';
export type LineHeightMode = 'tight' | 'normal' | 'loose';
export type ColumnWidth = 'narrow' | 'medium' | 'wide';
export type Eli5Tone = 'kid' | 'casual' | 'plain';
export type DeepDiveDepth = 'quick' | 'standard' | 'deep';
export type TimeFormat = 'relative' | 'absolute';
export type BreakingSensitivity = 'all' | 'important' | 'critical';

interface SettingsCtx {
  fontSize: FontSize;
  setFontSize: (fs: FontSize) => void;
  notifBreaking: boolean; setNotifBreaking: (v: boolean) => void;
  notifAiFeed: boolean; setNotifAiFeed: (v: boolean) => void;
  breakingSensitivity: BreakingSensitivity; setBreakingSensitivity: (v: BreakingSensitivity) => void;
  notifTech: boolean; setNotifTech: (v: boolean) => void;
  notifDigest: boolean; setNotifDigest: (v: boolean) => void;
  notifSources: boolean; setNotifSources: (v: boolean) => void;
  showSports: boolean; setShowSports: (v: boolean) => void;
  showEntertainment: boolean; setShowEntertainment: (v: boolean) => void;
  favSources: string[]; toggleFavSource: (name: string) => void;
  favTopics: string[]; toggleFavTopic: (key: string) => void;
  activeTopics: Record<TopicKey, boolean>;
  toggleTopic: (t: TopicKey) => void;
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

  // ── Customize: AI ──────────────────────────────────────────────────────
  summaryLength: SummaryLength; setSummaryLength: (v: SummaryLength) => void;
  summaryFormat: SummaryFormat; setSummaryFormat: (v: SummaryFormat) => void;
  keyPointsCount: KeyPointsCount; setKeyPointsCount: (v: KeyPointsCount) => void;
  showKeyPoints: boolean; setShowKeyPoints: (v: boolean) => void;

  // ── Customize: Behavior ────────────────────────────────────────────────
  defaultTopic: CategoryTopic; setDefaultTopic: (v: CategoryTopic) => void;
  linkOpen: LinkOpen; setLinkOpen: (v: LinkOpen) => void;
  pullToRefresh: boolean; setPullToRefresh: (v: boolean) => void;

  // ── Wave 2: Appearance ─────────────────────────────────────────────────
  themeMode: ThemeMode; setThemeMode: (v: ThemeMode) => void;
  showEntityHighlights: boolean; setShowEntityHighlights: (v: boolean) => void;
  showQuoteHighlights: boolean; setShowQuoteHighlights: (v: boolean) => void;
  showReadingDifficulty: boolean; setShowReadingDifficulty: (v: boolean) => void;
  timeFormat: TimeFormat; setTimeFormat: (v: TimeFormat) => void;

  // ── Wave 2: Article reader ─────────────────────────────────────────────
  fontFamily: FontFamily; setFontFamily: (v: FontFamily) => void;
  lineHeightMode: LineHeightMode; setLineHeightMode: (v: LineHeightMode) => void;
  columnWidth: ColumnWidth; setColumnWidth: (v: ColumnWidth) => void;

  // ── Wave 2: AI ─────────────────────────────────────────────────────────
  eli5Tone: Eli5Tone; setEli5Tone: (v: Eli5Tone) => void;
  deepDiveDepth: DeepDiveDepth; setDeepDiveDepth: (v: DeepDiveDepth) => void;
  showDeepDiveQA: boolean; setShowDeepDiveQA: (v: boolean) => void;
  showDeepDiveEntities: boolean; setShowDeepDiveEntities: (v: boolean) => void;
  showDeepDiveCurious: boolean; setShowDeepDiveCurious: (v: boolean) => void;

  // ── Wave 2: Navigation (hide/show tabs + topic pills) ──────────────────
  hiddenTabs: string[]; toggleHiddenTab: (tab: string) => void;
  hiddenTopics: string[]; toggleHiddenTopic: (topic: string) => void;

  // ── Wave 2: Behavior ───────────────────────────────────────────────────
  autoMarkRead: boolean; setAutoMarkRead: (v: boolean) => void;
  keyboardShortcuts: boolean; setKeyboardShortcuts: (v: boolean) => void;

  // Reset just the customize block.
  resetCustomize: () => void;
}

const STORAGE_KEY = '@ireader_settings';
const DEFAULTS = {
  fontSize: 'Medium' as FontSize,
  notifBreaking: true, notifAiFeed: true, notifTech: true, notifDigest: false, notifSources: false,
  breakingSensitivity: 'important' as BreakingSensitivity,
  showSports: false, showEntertainment: false,
  activeTopics: DEFAULT_ACTIVE_TOPICS,

  // Customize defaults — match current behavior so existing users see no change.
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
  summaryLength: 'medium' as SummaryLength,
  summaryFormat: 'paragraph' as SummaryFormat,
  keyPointsCount: 3 as KeyPointsCount,
  showKeyPoints: true,
  defaultTopic: 'breaking' as CategoryTopic,
  linkOpen: 'in-app' as LinkOpen,
  pullToRefresh: true,

  // Wave 2 defaults — match current behaviour.
  themeMode: 'dark' as ThemeMode,
  showEntityHighlights: true,
  showQuoteHighlights: true,
  showReadingDifficulty: true,
  timeFormat: 'relative' as TimeFormat,
  fontFamily: 'inter' as FontFamily,
  lineHeightMode: 'normal' as LineHeightMode,
  columnWidth: 'medium' as ColumnWidth,
  eli5Tone: 'casual' as Eli5Tone,
  deepDiveDepth: 'standard' as DeepDiveDepth,
  showDeepDiveQA: true,
  showDeepDiveEntities: true,
  showDeepDiveCurious: true,
  hiddenTabs: [] as string[],
  hiddenTopics: [] as string[],
  autoMarkRead: false,
  keyboardShortcuts: true,
};

const noop = () => {};
const SettingsContext = createContext<SettingsCtx>({
  ...DEFAULTS, activeSubTopics: {}, favSources: [], favTopics: [],
  setFontSize: noop, setNotifBreaking: noop, setNotifAiFeed: noop, setBreakingSensitivity: noop, setNotifTech: noop, setNotifDigest: noop, setNotifSources: noop,
  setShowSports: noop, setShowEntertainment: noop,
  toggleFavSource: noop, toggleFavTopic: noop,
  toggleTopic: noop, toggleSubTopic: noop,
  topicInterests: {}, setTopicInterest: noop,
  resetSettings: noop,
  setShowClusterSummary: noop, setShowBiasDots: noop, setShowMetaPill: noop, setShowCardImages: noop, setCardDensity: noop,
  setDefaultArticleTab: noop, setShowStatsCard: noop, setShowArticleRssSummary: noop, setShowVerifyDedup: noop, setShowReferencedSources: noop,
  setSummaryLength: noop, setSummaryFormat: noop, setKeyPointsCount: noop, setShowKeyPoints: noop,
  setDefaultTopic: noop, setLinkOpen: noop, setPullToRefresh: noop,
  // Wave 2 noops
  setThemeMode: noop, setShowEntityHighlights: noop, setShowQuoteHighlights: noop, setShowReadingDifficulty: noop, setTimeFormat: noop,
  setFontFamily: noop, setLineHeightMode: noop, setColumnWidth: noop,
  setEli5Tone: noop, setDeepDiveDepth: noop, setShowDeepDiveQA: noop, setShowDeepDiveEntities: noop, setShowDeepDiveCurious: noop,
  toggleHiddenTab: noop, toggleHiddenTopic: noop,
  setAutoMarkRead: noop, setKeyboardShortcuts: noop,
  resetCustomize: noop,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeS] = useState<FontSize>(DEFAULTS.fontSize);
  const [notifBreaking, setNotifBreakingS] = useState(DEFAULTS.notifBreaking);
  const [notifAiFeed, setNotifAiFeedS] = useState(DEFAULTS.notifAiFeed);
  const [breakingSensitivity, setBreakingSensitivityS] = useState<BreakingSensitivity>(DEFAULTS.breakingSensitivity);
  const [notifTech, setNotifTechS] = useState(DEFAULTS.notifTech);
  const [notifDigest, setNotifDigestS] = useState(DEFAULTS.notifDigest);
  const [notifSources, setNotifSourcesS] = useState(DEFAULTS.notifSources);
  const [showSports, setShowSportsS] = useState(DEFAULTS.showSports);
  const [showEntertainment, setShowEntertainmentS] = useState(DEFAULTS.showEntertainment);
  const [favSources, setFavSources] = useState<string[]>([]);
  const [favTopics, setFavTopics] = useState<string[]>([]);
  const [activeTopics, setActiveTopics] = useState<Record<TopicKey, boolean>>(DEFAULTS.activeTopics);
  const [activeSubTopics, setActiveSubTopics] = useState<Record<string, boolean>>({});
  const [topicInterests, setTopicInterests] = useState<Record<string, number>>({});

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
  const [summaryLength, setSummaryLength] = useState<SummaryLength>(DEFAULTS.summaryLength);
  const [summaryFormat, setSummaryFormat] = useState<SummaryFormat>(DEFAULTS.summaryFormat);
  const [keyPointsCount, setKeyPointsCount] = useState<KeyPointsCount>(DEFAULTS.keyPointsCount);
  const [showKeyPoints, setShowKeyPoints] = useState(DEFAULTS.showKeyPoints);
  const [defaultTopic, setDefaultTopic] = useState<CategoryTopic>(DEFAULTS.defaultTopic);
  const [linkOpen, setLinkOpen] = useState<LinkOpen>(DEFAULTS.linkOpen);
  const [pullToRefresh, setPullToRefresh] = useState(DEFAULTS.pullToRefresh);

  // Wave 2 state
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULTS.themeMode);
  const [showEntityHighlights, setShowEntityHighlights] = useState(DEFAULTS.showEntityHighlights);
  const [showQuoteHighlights, setShowQuoteHighlights] = useState(DEFAULTS.showQuoteHighlights);
  const [showReadingDifficulty, setShowReadingDifficulty] = useState(DEFAULTS.showReadingDifficulty);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(DEFAULTS.timeFormat);
  const [fontFamily, setFontFamily] = useState<FontFamily>(DEFAULTS.fontFamily);
  const [lineHeightMode, setLineHeightMode] = useState<LineHeightMode>(DEFAULTS.lineHeightMode);
  const [columnWidth, setColumnWidth] = useState<ColumnWidth>(DEFAULTS.columnWidth);
  const [eli5Tone, setEli5Tone] = useState<Eli5Tone>(DEFAULTS.eli5Tone);
  const [deepDiveDepth, setDeepDiveDepth] = useState<DeepDiveDepth>(DEFAULTS.deepDiveDepth);
  const [showDeepDiveQA, setShowDeepDiveQA] = useState(DEFAULTS.showDeepDiveQA);
  const [showDeepDiveEntities, setShowDeepDiveEntities] = useState(DEFAULTS.showDeepDiveEntities);
  const [showDeepDiveCurious, setShowDeepDiveCurious] = useState(DEFAULTS.showDeepDiveCurious);
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(DEFAULTS.hiddenTabs);
  const [hiddenTopics, setHiddenTopics] = useState<string[]>(DEFAULTS.hiddenTopics);
  const [autoMarkRead, setAutoMarkRead] = useState(DEFAULTS.autoMarkRead);
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(DEFAULTS.keyboardShortcuts);

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.fontSize) setFontSizeS(s.fontSize);
        if (typeof s.notifBreaking === 'boolean') setNotifBreakingS(s.notifBreaking);
        if (typeof s.notifAiFeed === 'boolean') setNotifAiFeedS(s.notifAiFeed);
        if (['all','important','critical'].includes(s.breakingSensitivity)) setBreakingSensitivityS(s.breakingSensitivity);
        if (typeof s.notifTech === 'boolean') setNotifTechS(s.notifTech);
        if (typeof s.notifDigest === 'boolean') setNotifDigestS(s.notifDigest);
        if (typeof s.notifSources === 'boolean') setNotifSourcesS(s.notifSources);
        if (typeof s.showSports === 'boolean') setShowSportsS(s.showSports);
        if (typeof s.showEntertainment === 'boolean') setShowEntertainmentS(s.showEntertainment);
        if (s.activeTopics) setActiveTopics({ ...DEFAULTS.activeTopics, ...s.activeTopics });
        if (s.activeSubTopics) setActiveSubTopics(s.activeSubTopics);
        if (Array.isArray(s.favSources)) setFavSources(s.favSources);
        if (Array.isArray(s.favTopics)) setFavTopics(s.favTopics);
        if (s.topicInterests && typeof s.topicInterests === 'object') setTopicInterests(s.topicInterests);

        // Customize loads
        if (typeof s.showClusterSummary === 'boolean') setShowClusterSummary(s.showClusterSummary);
        if (typeof s.showBiasDots === 'boolean') setShowBiasDots(s.showBiasDots);
        if (typeof s.showMetaPill === 'boolean') setShowMetaPill(s.showMetaPill);
        if (typeof s.showCardImages === 'boolean') setShowCardImages(s.showCardImages);
        if (['compact','comfortable','spacious'].includes(s.cardDensity)) setCardDensity(s.cardDensity);
        if (['Long Form','Summary','5 Ws','ELI5'].includes(s.defaultArticleTab)) setDefaultArticleTab(s.defaultArticleTab);
        if (typeof s.showStatsCard === 'boolean') setShowStatsCard(s.showStatsCard);
          if (typeof s.showArticleRssSummary === 'boolean') setShowArticleRssSummary(s.showArticleRssSummary);
        if (typeof s.showVerifyDedup === 'boolean') setShowVerifyDedup(s.showVerifyDedup);
        if (typeof s.showReferencedSources === 'boolean') setShowReferencedSources(s.showReferencedSources);
        if (['short','medium','long'].includes(s.summaryLength)) setSummaryLength(s.summaryLength);
        if (['paragraph','bullets'].includes(s.summaryFormat)) setSummaryFormat(s.summaryFormat);
        if ([3,5,7].includes(s.keyPointsCount)) setKeyPointsCount(s.keyPointsCount);
        if (typeof s.showKeyPoints === 'boolean') setShowKeyPoints(s.showKeyPoints);
        if (typeof s.defaultTopic === 'string') setDefaultTopic(s.defaultTopic as CategoryTopic);
        if (s.linkOpen === 'in-app' || s.linkOpen === 'external') setLinkOpen(s.linkOpen);
        if (typeof s.pullToRefresh === 'boolean') setPullToRefresh(s.pullToRefresh);

        // Wave 2 loads
        if (['dark','light','auto'].includes(s.themeMode)) setThemeMode(s.themeMode);
        if (typeof s.showEntityHighlights === 'boolean') setShowEntityHighlights(s.showEntityHighlights);
        if (typeof s.showQuoteHighlights === 'boolean') setShowQuoteHighlights(s.showQuoteHighlights);
        if (typeof s.showReadingDifficulty === 'boolean') setShowReadingDifficulty(s.showReadingDifficulty);
        if (s.timeFormat === 'relative' || s.timeFormat === 'absolute') setTimeFormat(s.timeFormat);
        if (['inter','serif','system'].includes(s.fontFamily)) setFontFamily(s.fontFamily);
        if (['tight','normal','loose'].includes(s.lineHeightMode)) setLineHeightMode(s.lineHeightMode);
        if (['narrow','medium','wide'].includes(s.columnWidth)) setColumnWidth(s.columnWidth);
        if (['kid','casual','plain'].includes(s.eli5Tone)) setEli5Tone(s.eli5Tone);
        if (['quick','standard','deep'].includes(s.deepDiveDepth)) setDeepDiveDepth(s.deepDiveDepth);
        if (typeof s.showDeepDiveQA === 'boolean') setShowDeepDiveQA(s.showDeepDiveQA);
        if (typeof s.showDeepDiveEntities === 'boolean') setShowDeepDiveEntities(s.showDeepDiveEntities);
        if (typeof s.showDeepDiveCurious === 'boolean') setShowDeepDiveCurious(s.showDeepDiveCurious);
        if (Array.isArray(s.hiddenTabs)) setHiddenTabs(s.hiddenTabs);
        if (Array.isArray(s.hiddenTopics)) setHiddenTopics(s.hiddenTopics);
        if (typeof s.autoMarkRead === 'boolean') setAutoMarkRead(s.autoMarkRead);
        if (typeof s.keyboardShortcuts === 'boolean') setKeyboardShortcuts(s.keyboardShortcuts);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fontSize, notifBreaking, notifAiFeed, breakingSensitivity, notifTech, notifDigest, notifSources,
        showSports, showEntertainment, activeTopics, activeSubTopics, favSources, favTopics,
        topicInterests,
        showClusterSummary, showBiasDots, showMetaPill, showCardImages, cardDensity,
        defaultArticleTab, showStatsCard, showArticleRssSummary, showVerifyDedup, showReferencedSources,
        summaryLength, summaryFormat, keyPointsCount, showKeyPoints,
        defaultTopic, linkOpen, pullToRefresh,
        // Wave 2
        themeMode, showEntityHighlights, showQuoteHighlights, showReadingDifficulty, timeFormat,
        fontFamily, lineHeightMode, columnWidth,
        eli5Tone, deepDiveDepth, showDeepDiveQA, showDeepDiveEntities, showDeepDiveCurious,
        hiddenTabs, hiddenTopics, autoMarkRead, keyboardShortcuts,
      }));
    } catch {}
  }, [loaded, fontSize, notifBreaking, notifAiFeed, breakingSensitivity, notifTech, notifDigest, notifSources, showSports, showEntertainment, activeTopics, activeSubTopics, favSources, favTopics, topicInterests, showClusterSummary, showBiasDots, showMetaPill, showCardImages, cardDensity, defaultArticleTab, showStatsCard, showArticleRssSummary, showVerifyDedup, showReferencedSources, summaryLength, summaryFormat, keyPointsCount, showKeyPoints, defaultTopic, linkOpen, pullToRefresh, themeMode, showEntityHighlights, showQuoteHighlights, showReadingDifficulty, timeFormat, fontFamily, lineHeightMode, columnWidth, eli5Tone, deepDiveDepth, showDeepDiveQA, showDeepDiveEntities, showDeepDiveCurious, hiddenTabs, hiddenTopics, autoMarkRead, keyboardShortcuts]);

  const setFontSize = useCallback((fs: FontSize) => setFontSizeS(fs), []);
  const setNotifBreaking = useCallback((v: boolean) => setNotifBreakingS(v), []);
  const setNotifAiFeed = useCallback((v: boolean) => setNotifAiFeedS(v), []);
  const setBreakingSensitivity = useCallback((v: BreakingSensitivity) => setBreakingSensitivityS(v), []);
  const setNotifTech = useCallback((v: boolean) => setNotifTechS(v), []);
  const setNotifDigest = useCallback((v: boolean) => setNotifDigestS(v), []);
  const setNotifSources = useCallback((v: boolean) => setNotifSourcesS(v), []);
  const setShowSports = useCallback((v: boolean) => setShowSportsS(v), []);
  const setShowEntertainment = useCallback((v: boolean) => setShowEntertainmentS(v), []);
  const toggleFavSource = useCallback((name: string) => setFavSources(p => p.includes(name) ? p.filter(s => s !== name) : [...p, name]), []);
  const toggleFavTopic = useCallback((key: string) => setFavTopics(p => p.includes(key) ? p.filter(t => t !== key) : [...p, key]), []);
  const toggleTopic = useCallback((t: TopicKey) => setActiveTopics(p => ({ ...p, [t]: !p[t] })), []);
  const toggleSubTopic = useCallback((key: string) => setActiveSubTopics(p => ({ ...p, [key]: p[key] === false ? true : false })), []);
  const setTopicInterest = useCallback((id: string, stars: number) => {
    setTopicInterests(p => ({ ...p, [id]: Math.max(0, Math.min(5, stars)) }));
  }, []);
  const resetSettings = useCallback(() => {
    setFontSizeS(DEFAULTS.fontSize); setNotifBreakingS(true); setNotifAiFeedS(true); setNotifTechS(true);
    setNotifDigestS(false); setNotifSourcesS(false);
    setShowSportsS(false); setShowEntertainmentS(false);
    setActiveTopics(DEFAULTS.activeTopics); setActiveSubTopics({});
    setFavSources([]); setFavTopics([]);
    setTopicInterests({});
  }, []);
  const toggleHiddenTab = useCallback((tab: string) =>
    setHiddenTabs(p => p.includes(tab) ? p.filter(t => t !== tab) : [...p, tab]), []);
  const toggleHiddenTopic = useCallback((topic: string) =>
    setHiddenTopics(p => p.includes(topic) ? p.filter(t => t !== topic) : [...p, topic]), []);

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
    setSummaryLength(DEFAULTS.summaryLength);
    setSummaryFormat(DEFAULTS.summaryFormat);
    setKeyPointsCount(DEFAULTS.keyPointsCount);
    setShowKeyPoints(DEFAULTS.showKeyPoints);
    setDefaultTopic(DEFAULTS.defaultTopic);
    setLinkOpen(DEFAULTS.linkOpen);
    setPullToRefresh(DEFAULTS.pullToRefresh);
    // Wave 2
    setThemeMode(DEFAULTS.themeMode);
    setShowEntityHighlights(DEFAULTS.showEntityHighlights);
    setShowQuoteHighlights(DEFAULTS.showQuoteHighlights);
    setShowReadingDifficulty(DEFAULTS.showReadingDifficulty);
    setTimeFormat(DEFAULTS.timeFormat);
    setFontFamily(DEFAULTS.fontFamily);
    setLineHeightMode(DEFAULTS.lineHeightMode);
    setColumnWidth(DEFAULTS.columnWidth);
    setEli5Tone(DEFAULTS.eli5Tone);
    setDeepDiveDepth(DEFAULTS.deepDiveDepth);
    setShowDeepDiveQA(DEFAULTS.showDeepDiveQA);
    setShowDeepDiveEntities(DEFAULTS.showDeepDiveEntities);
    setShowDeepDiveCurious(DEFAULTS.showDeepDiveCurious);
    setHiddenTabs(DEFAULTS.hiddenTabs);
    setHiddenTopics(DEFAULTS.hiddenTopics);
    setAutoMarkRead(DEFAULTS.autoMarkRead);
    setKeyboardShortcuts(DEFAULTS.keyboardShortcuts);
  }, []);

  const value = useMemo(() => ({
    fontSize, setFontSize, notifBreaking, setNotifBreaking, notifAiFeed, setNotifAiFeed, breakingSensitivity, setBreakingSensitivity, notifTech, setNotifTech,
    notifDigest, setNotifDigest, notifSources, setNotifSources,
    showSports, setShowSports, showEntertainment, setShowEntertainment,
    favSources, toggleFavSource, favTopics, toggleFavTopic,
    activeTopics, toggleTopic, activeSubTopics, toggleSubTopic,
    topicInterests, setTopicInterest,
    resetSettings,
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
    summaryLength, setSummaryLength,
    summaryFormat, setSummaryFormat,
    keyPointsCount, setKeyPointsCount,
    showKeyPoints, setShowKeyPoints,
    defaultTopic, setDefaultTopic,
    linkOpen, setLinkOpen,
    pullToRefresh, setPullToRefresh,
    // Wave 2
    themeMode, setThemeMode,
    showEntityHighlights, setShowEntityHighlights,
    showQuoteHighlights, setShowQuoteHighlights,
    showReadingDifficulty, setShowReadingDifficulty,
    timeFormat, setTimeFormat,
    fontFamily, setFontFamily,
    lineHeightMode, setLineHeightMode,
    columnWidth, setColumnWidth,
    eli5Tone, setEli5Tone,
    deepDiveDepth, setDeepDiveDepth,
    showDeepDiveQA, setShowDeepDiveQA,
    showDeepDiveEntities, setShowDeepDiveEntities,
    showDeepDiveCurious, setShowDeepDiveCurious,
    hiddenTabs, toggleHiddenTab,
    hiddenTopics, toggleHiddenTopic,
    autoMarkRead, setAutoMarkRead,
    keyboardShortcuts, setKeyboardShortcuts,
    resetCustomize,
  }), [fontSize, notifBreaking, notifAiFeed, breakingSensitivity, notifTech, notifDigest, notifSources, showSports, showEntertainment, favSources, favTopics, activeTopics, activeSubTopics, topicInterests, setFontSize, setNotifBreaking, setNotifAiFeed, setBreakingSensitivity, setNotifTech, setNotifDigest, setNotifSources, setShowSports, setShowEntertainment, toggleFavSource, toggleFavTopic, toggleTopic, toggleSubTopic, setTopicInterest, resetSettings, showClusterSummary, showBiasDots, showMetaPill, showCardImages, cardDensity, defaultArticleTab, showStatsCard, showArticleRssSummary, showVerifyDedup, showReferencedSources, summaryLength, summaryFormat, keyPointsCount, showKeyPoints, defaultTopic, linkOpen, pullToRefresh, themeMode, showEntityHighlights, showQuoteHighlights, showReadingDifficulty, timeFormat, fontFamily, lineHeightMode, columnWidth, eli5Tone, deepDiveDepth, showDeepDiveQA, showDeepDiveEntities, showDeepDiveCurious, hiddenTabs, hiddenTopics, autoMarkRead, keyboardShortcuts, toggleHiddenTab, toggleHiddenTopic, resetCustomize]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() { return useContext(SettingsContext); }
