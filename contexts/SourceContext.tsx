import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const SOURCE_CATEGORIES = [
  {
    label: 'India',
    sources: ['NDTV', 'Times of India', 'Indian Express', 'The Quint', 'ANI News', 'Hindustan Times', 'News18', 'Firstpost'] as const,
  },
  {
    label: 'World',
    sources: ['BBC World', 'The Guardian', 'Al Jazeera', 'NYT World', 'Indian Express World', 'NPR World', 'News18', 'Firstpost'] as const,
  },
  {
    label: 'Markets',
    sources: ['Economic Times', 'MoneyControl', 'NDTV Profit', 'Livemint', 'Business Standard', 'CNBC TV18', 'News18', 'Firstpost'] as const,
  },
  {
    label: 'Business',
    sources: ['Mint', 'Business Standard', 'Economic Times', 'MoneyControl', 'Inc42', 'Hindustan Times', 'News18', 'Firstpost'] as const,
  },
  {
    label: 'Technology',
    sources: ['TechCrunch', 'The Verge', 'Ars Technica', 'Wired', '9to5Google', '9to5Mac', 'Engadget', 'VentureBeat', 'The Next Web', 'Hacker News', 'MIT Tech Review', 'The Quint Tech', 'Indian Express Tech', 'News18', 'Firstpost'] as const,
  },
];

const ALL_SOURCES = SOURCE_CATEGORIES.flatMap(c => c.sources);
const DEFAULT_SOURCES: Record<string, boolean> = Object.fromEntries(ALL_SOURCES.map(s => [s, true]));

const STORAGE_KEY = '@ireader_sources';

interface SourceContextType {
  activeSources: Record<string, boolean>;
  toggleSource: (name: string) => void;
  resetSources: () => void;
}

const SourceContext = createContext<SourceContextType>({
  activeSources: DEFAULT_SOURCES,
  toggleSource: () => {},
  resetSources: () => {},
});

export function SourceProvider({ children }: { children: React.ReactNode }) {
  const [activeSources, setActiveSources] = useState(DEFAULT_SOURCES);
  const [loaded, setLoaded] = useState(false);

  // Load persisted source prefs on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          // Merge saved prefs with defaults (new sources default to true)
          setActiveSources({ ...DEFAULT_SOURCES, ...saved });
        } catch {}
      }
    }).finally(() => setLoaded(true));
  }, []);

  // Persist whenever activeSources changes (after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activeSources)).catch(() => {});
  }, [loaded, activeSources]);

  const toggleSource = useCallback((name: string) => {
    setActiveSources(prev => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const resetSources = useCallback(() => {
    setActiveSources(DEFAULT_SOURCES);
  }, []);

  const value = useMemo(
    () => ({ activeSources, toggleSource, resetSources }),
    [activeSources, toggleSource, resetSources],
  );

  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>;
}

export function useSource() {
  return useContext(SourceContext);
}
