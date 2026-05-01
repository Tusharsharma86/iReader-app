import React, { createContext, useContext, useState } from 'react';

export type FontSize = 'Small' | 'Medium' | 'Large' | 'XLarge';

const DEFAULT_SOURCES: Record<string, boolean> = {
  TechCrunch: true, 'The Verge': true, 'Ars Technica': true, Wired: true,
};

interface SettingsState {
  fontSize: FontSize;
  activeSources: Record<string, boolean>;
  notifBreaking: boolean;
  notifDigest: boolean;
  notifSources: boolean;
}

interface SettingsContextType extends SettingsState {
  setFontSize: (fs: FontSize) => void;
  toggleSource: (name: string) => void;
  setNotifBreaking: (v: boolean) => void;
  setNotifDigest: (v: boolean) => void;
  setNotifSources: (v: boolean) => void;
  resetSettings: () => void;
}

const defaults: SettingsState = {
  fontSize: 'Medium',
  activeSources: DEFAULT_SOURCES,
  notifBreaking: false,
  notifDigest: false,
  notifSources: false,
};

const SettingsContext = createContext<SettingsContextType>({
  ...defaults,
  setFontSize: () => {},
  toggleSource: () => {},
  setNotifBreaking: () => {},
  setNotifDigest: () => {},
  setNotifSources: () => {},
  resetSettings: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(defaults.fontSize);
  const [activeSources, setActiveSources] = useState(defaults.activeSources);
  const [notifBreaking, setNotifBreaking] = useState(false);
  const [notifDigest, setNotifDigest] = useState(false);
  const [notifSources, setNotifSources] = useState(false);

  function setFontSize(fs: FontSize) { setFontSizeState(fs); }

  function toggleSource(name: string) {
    setActiveSources(prev => ({ ...prev, [name]: !prev[name] }));
  }

  function resetSettings() {
    setFontSizeState(defaults.fontSize);
    setActiveSources(defaults.activeSources);
    setNotifBreaking(false);
    setNotifDigest(false);
    setNotifSources(false);
  }

  return (
    <SettingsContext.Provider value={{
      fontSize, activeSources, notifBreaking, notifDigest, notifSources,
      setFontSize, toggleSource, setNotifBreaking, setNotifDigest, setNotifSources, resetSettings,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
