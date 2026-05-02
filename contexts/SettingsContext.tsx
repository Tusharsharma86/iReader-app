import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type FontSize = 'Small' | 'Medium' | 'Large' | 'XLarge';

interface SettingsContextType {
  fontSize: FontSize;
  setFontSize: (fs: FontSize) => void;
  notifBreaking: boolean;
  setNotifBreaking: (v: boolean) => void;
  notifDigest: boolean;
  setNotifDigest: (v: boolean) => void;
  notifSources: boolean;
  setNotifSources: (v: boolean) => void;
  resetSettings: () => void;
}

const STORAGE_KEY = '@ireader_settings';

const DEFAULTS = {
  fontSize: 'Medium' as FontSize,
  notifBreaking: false,
  notifDigest: false,
  notifSources: false,
};

const SettingsContext = createContext<SettingsContextType>({
  ...DEFAULTS,
  setFontSize: () => {},
  setNotifBreaking: () => {},
  setNotifDigest: () => {},
  setNotifSources: () => {},
  resetSettings: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(DEFAULTS.fontSize);
  const [notifBreaking, setNotifBreakingState] = useState(DEFAULTS.notifBreaking);
  const [notifDigest, setNotifDigestState] = useState(DEFAULTS.notifDigest);
  const [notifSources, setNotifSourcesState] = useState(DEFAULTS.notifSources);
  const [loaded, setLoaded] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (saved.fontSize) setFontSizeState(saved.fontSize);
          if (typeof saved.notifBreaking === 'boolean') setNotifBreakingState(saved.notifBreaking);
          if (typeof saved.notifDigest === 'boolean') setNotifDigestState(saved.notifDigest);
          if (typeof saved.notifSources === 'boolean') setNotifSourcesState(saved.notifSources);
        } catch {}
      }
    }).finally(() => setLoaded(true));
  }, []);

  // Persist whenever any setting changes (after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      fontSize, notifBreaking, notifDigest, notifSources,
    })).catch(() => {});
  }, [loaded, fontSize, notifBreaking, notifDigest, notifSources]);

  const setFontSize = useCallback((fs: FontSize) => setFontSizeState(fs), []);

  const setNotifBreaking = useCallback((v: boolean) => setNotifBreakingState(v), []);
  const setNotifDigest = useCallback((v: boolean) => setNotifDigestState(v), []);
  const setNotifSources = useCallback((v: boolean) => setNotifSourcesState(v), []);

  const resetSettings = useCallback(() => {
    setFontSizeState(DEFAULTS.fontSize);
    setNotifBreakingState(DEFAULTS.notifBreaking);
    setNotifDigestState(DEFAULTS.notifDigest);
    setNotifSourcesState(DEFAULTS.notifSources);
  }, []);

  const value = useMemo(() => ({
    fontSize, setFontSize,
    notifBreaking, setNotifBreaking,
    notifDigest, setNotifDigest,
    notifSources, setNotifSources,
    resetSettings,
  }), [fontSize, notifBreaking, notifDigest, notifSources, setFontSize, setNotifBreaking, setNotifDigest, setNotifSources, resetSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
