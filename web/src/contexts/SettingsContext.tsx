import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { FontSize, TopicKey } from '../types';

const ALL_TOPICS: TopicKey[] = ['breaking','technology','india-politics','geopolitics','markets','business'];

const DEFAULT_ACTIVE_TOPICS = Object.fromEntries(ALL_TOPICS.map(t => [t, true])) as Record<TopicKey, boolean>;

interface SettingsCtx {
  fontSize: FontSize;
  setFontSize: (fs: FontSize) => void;
  notifBreaking: boolean; setNotifBreaking: (v: boolean) => void;
  notifAiFeed: boolean; setNotifAiFeed: (v: boolean) => void;
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
}

const STORAGE_KEY = '@ireader_settings';
const DEFAULTS = {
  fontSize: 'Medium' as FontSize,
  notifBreaking: true, notifAiFeed: true, notifTech: true, notifDigest: false, notifSources: false,
  showSports: false, showEntertainment: false,
  activeTopics: DEFAULT_ACTIVE_TOPICS,
};

const SettingsContext = createContext<SettingsCtx>({
  ...DEFAULTS, activeSubTopics: {}, favSources: [], favTopics: [],
  setFontSize: ()=>{}, setNotifBreaking: ()=>{}, setNotifAiFeed: ()=>{}, setNotifTech: ()=>{}, setNotifDigest: ()=>{}, setNotifSources: ()=>{},
  setShowSports: ()=>{}, setShowEntertainment: ()=>{},
  toggleFavSource: ()=>{}, toggleFavTopic: ()=>{},
  toggleTopic: ()=>{}, toggleSubTopic: ()=>{},
  topicInterests: {}, setTopicInterest: ()=>{},
  resetSettings: ()=>{},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeS] = useState<FontSize>(DEFAULTS.fontSize);
  const [notifBreaking, setNotifBreakingS] = useState(DEFAULTS.notifBreaking);
  const [notifAiFeed, setNotifAiFeedS] = useState(DEFAULTS.notifAiFeed);
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.fontSize) setFontSizeS(s.fontSize);
        if (typeof s.notifBreaking === 'boolean') setNotifBreakingS(s.notifBreaking);
        if (typeof s.notifAiFeed === 'boolean') setNotifAiFeedS(s.notifAiFeed);
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
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fontSize, notifBreaking, notifAiFeed, notifTech, notifDigest, notifSources,
        showSports, showEntertainment, activeTopics, activeSubTopics, favSources, favTopics,
        topicInterests,
      }));
    } catch {}
  }, [loaded, fontSize, notifBreaking, notifAiFeed, notifTech, notifDigest, notifSources, showSports, showEntertainment, activeTopics, activeSubTopics, favSources, favTopics, topicInterests]);

  const setFontSize = useCallback((fs: FontSize) => setFontSizeS(fs), []);
  const setNotifBreaking = useCallback((v: boolean) => setNotifBreakingS(v), []);
  const setNotifAiFeed = useCallback((v: boolean) => setNotifAiFeedS(v), []);
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

  const value = useMemo(() => ({
    fontSize, setFontSize, notifBreaking, setNotifBreaking, notifAiFeed, setNotifAiFeed, notifTech, setNotifTech,
    notifDigest, setNotifDigest, notifSources, setNotifSources,
    showSports, setShowSports, showEntertainment, setShowEntertainment,
    favSources, toggleFavSource, favTopics, toggleFavTopic,
    activeTopics, toggleTopic, activeSubTopics, toggleSubTopic,
    topicInterests, setTopicInterest,
    resetSettings,
  }), [fontSize, notifBreaking, notifAiFeed, notifTech, notifDigest, notifSources, showSports, showEntertainment, favSources, favTopics, activeTopics, activeSubTopics, topicInterests, setFontSize, setNotifBreaking, setNotifAiFeed, setNotifTech, setNotifDigest, setNotifSources, setShowSports, setShowEntertainment, toggleFavSource, toggleFavTopic, toggleTopic, toggleSubTopic, setTopicInterest, resetSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() { return useContext(SettingsContext); }
