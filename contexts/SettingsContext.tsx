import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { registerForPush, updatePushPreferences } from '../utils/notifications';
import { INTEREST_TOPICS } from '../utils/interestTopics';

export type FontSize = 'Small' | 'Medium' | 'Large' | 'XLarge';

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
}

const STORAGE_KEY = '@ireader_settings';

const DEFAULTS = {
  fontSize: 'Medium' as FontSize,
  notifBreaking: true,
  notifTech: true,
  notifDigest: false,
  notifAiFeed: false,
  notifSources: false,
  showSports: false,
  showEntertainment: false,
  activeTopics: DEFAULT_ACTIVE_TOPICS,
};

const SettingsContext = createContext<SettingsContextType>({
  ...DEFAULTS,
  activeSubTopics: {},
  favSources: [],
  favTopics: [],
  topicInterests: {},
  setFontSize: () => {},
  setNotifBreaking: () => {},
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
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(DEFAULTS.fontSize);
  const [notifBreaking, setNotifBreakingState] = useState(DEFAULTS.notifBreaking);
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
  const [loaded, setLoaded] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (saved.fontSize) setFontSizeState(saved.fontSize);
          if (typeof saved.notifBreaking === 'boolean') setNotifBreakingState(saved.notifBreaking);
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
        } catch {}
      }
    }).finally(() => setLoaded(true));
  }, []);

  // Persist whenever any setting changes (after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      fontSize, notifBreaking, notifTech, notifDigest, notifAiFeed, notifSources,
      activeTopics, activeSubTopics, favSources, favTopics, topicInterests,
      showSports, showEntertainment,
    })).catch(() => {});
  }, [loaded, fontSize, notifBreaking, notifTech, notifDigest, notifAiFeed, notifSources, activeTopics, activeSubTopics, favSources, favTopics, topicInterests, showSports, showEntertainment]);

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

  const value = useMemo(() => ({
    fontSize, setFontSize,
    notifBreaking, setNotifBreaking,
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
  }), [fontSize, notifBreaking, notifTech, notifDigest, notifAiFeed, notifSources, showSports, showEntertainment, favSources, favTopics, topicInterests, activeTopics, activeSubTopics, setFontSize, setNotifBreaking, setNotifTech, setNotifDigest, setNotifAiFeed, setNotifSources, setShowSports, setShowEntertainment, toggleFavSource, toggleFavTopic, toggleTopic, toggleSubTopic, setTopicInterest, resetSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
