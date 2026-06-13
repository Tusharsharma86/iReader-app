import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { NavScreen, TabName, ArticleParams } from '../types';

interface RouterCtx {
  activeTab: TabName;
  currentScreen: NavScreen;
  navigate: (screen: NavScreen) => void;
  goBack: () => void;
  replace: (screen: NavScreen) => void;
  setTab: (tab: TabName) => void;
  canGoBack: boolean;
}

const RouterContext = createContext<RouterCtx>({
  activeTab: 'feed',
  currentScreen: { name: 'Feed' },
  navigate: () => {},
  goBack: () => {},
  replace: () => {},
  setTab: () => {},
  canGoBack: false,
});

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTabState] = useState<TabName>('feed');
  const [stacks, setStacks] = useState<Record<TabName, NavScreen[]>>({
    feed: [{ name: 'Feed' }],
    explore: [{ name: 'Explore' }],
    digest: [{ name: 'Digest' }],
    aifeed: [{ name: 'AIFeed' }],
    saved: [{ name: 'Saved' }],
    settings: [{ name: 'Settings' }],
  });

  const currentStack = stacks[activeTab];
  const currentScreen = currentStack[currentStack.length - 1];
  const canGoBack = currentStack.length > 1;

  // Prevent the popstate handler from double-firing when goBack() calls history.back()
  const ignorePopRef = useRef(false);

  useEffect(() => {
    // Disable browser scroll restoration — prevents the stall on history.back()
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.history.replaceState({ depth: 0 }, '');
  }, []);

  const navigate = useCallback((screen: NavScreen) => {
    setStacks(prev => {
      const tab = activeTab;
      return { ...prev, [tab]: [...prev[tab], screen] };
    });
    // Push a browser history entry so iOS swipe-back has something to pop
    window.history.pushState({ depth: window.history.length }, '');
    window.scrollTo(0, 0);
  }, [activeTab]);

  const goBack = useCallback(() => {
    setStacks(prev => {
      const tab = activeTab;
      if (prev[tab].length <= 1) return prev;
      return { ...prev, [tab]: prev[tab].slice(0, -1) };
    });
    // Pop the entry we pushed on navigate; ignore the resulting popstate
    ignorePopRef.current = true;
    window.history.back();
    window.scrollTo(0, 0);
  }, [activeTab]);

  // iOS swipe-back fires popstate — update our router stack to match
  useEffect(() => {
    const handler = () => {
      if (ignorePopRef.current) {
        ignorePopRef.current = false;
        return;
      }
      setStacks(prev => {
        const tab = activeTab;
        if (prev[tab].length <= 1) return prev;
        return { ...prev, [tab]: prev[tab].slice(0, -1) };
      });
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [activeTab]);

  const replace = useCallback((screen: NavScreen) => {
    setStacks(prev => {
      const tab = activeTab;
      return { ...prev, [tab]: [...prev[tab].slice(0, -1), screen] };
    });
  }, [activeTab]);

  const setTab = useCallback((tab: TabName) => {
    setActiveTabState(tab);
    window.scrollTo(0, 0);
  }, []);

  return (
    <RouterContext.Provider value={{ activeTab, currentScreen, navigate, goBack, replace, setTab, canGoBack }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() { return useContext(RouterContext); }
