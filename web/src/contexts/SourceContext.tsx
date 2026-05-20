import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const SOURCE_CATEGORIES = [
  { label: 'India', sources: ['NDTV','India Today','The Print','The Quint','CNBC TV18','Scroll.in','Hindustan Times','Times of India'] },
  { label: 'World', sources: ['BBC World','The Guardian','Al Jazeera','NYT World','NPR World','The Print','Hindustan Times','Times of India'] },
  { label: 'Markets', sources: ['Economic Times','Livemint','CNBC TV18'] },
  { label: 'Business', sources: ['Mint','Economic Times','Inc42','CNBC TV18','The Print'] },
  { label: 'Technology', sources: ['TechCrunch','The Verge','Ars Technica','Wired','9to5Google','9to5Mac','Engadget','VentureBeat','The Next Web','Hacker News','MIT Tech Review','Indian Express','Scroll.in'] },
];

const ALL_SOURCES = SOURCE_CATEGORIES.flatMap(c => c.sources);
const DEFAULT_SOURCES: Record<string, boolean> = Object.fromEntries(ALL_SOURCES.map(s => [s, true]));
const STORAGE_KEY = '@ireader_sources';

interface SourceCtx { activeSources: Record<string, boolean>; toggleSource: (n: string) => void; resetSources: () => void; }

const SourceContext = createContext<SourceCtx>({ activeSources: DEFAULT_SOURCES, toggleSource: ()=>{}, resetSources: ()=>{} });

export function SourceProvider({ children }: { children: React.ReactNode }) {
  const [activeSources, setActiveSources] = useState(DEFAULT_SOURCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) setActiveSources({ ...DEFAULT_SOURCES, ...JSON.parse(raw) }); } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(activeSources)); } catch {}
  }, [loaded, activeSources]);

  const toggleSource = useCallback((n: string) => setActiveSources(p => ({ ...p, [n]: !p[n] })), []);
  const resetSources = useCallback(() => setActiveSources(DEFAULT_SOURCES), []);
  const value = useMemo(() => ({ activeSources, toggleSource, resetSources }), [activeSources, toggleSource, resetSources]);
  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>;
}

export function useSource() { return useContext(SourceContext); }
