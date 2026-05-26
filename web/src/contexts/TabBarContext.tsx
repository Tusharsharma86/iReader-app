import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface TabBarCtx {
  visible: boolean;
  reportScroll: (scrollTop: number) => void;
  show: () => void;
  hide: () => void;
}

const TabBarContext = createContext<TabBarCtx>({ visible: true, reportScroll: () => {}, show: () => {}, hide: () => {} });

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const lastScrollRef = useRef(0);
  // When a screen calls hide() explicitly (e.g. Article reader), it locks the
  // bar off so background scroll events from the Feed don't pop it back into view.
  const forceHiddenRef = useRef(false);

  const reportScroll = useCallback((scrollTop: number) => {
    if (forceHiddenRef.current) return;          // locked off by an open screen
    const delta = scrollTop - lastScrollRef.current;
    lastScrollRef.current = scrollTop;
    if (scrollTop < 80) { setVisible(true); return; }
    if (delta > 8) setVisible(false);
    else if (delta < -8) setVisible(true);
  }, []);

  const show = useCallback(() => {
    forceHiddenRef.current = false;
    setVisible(true);
  }, []);
  const hide = useCallback(() => {
    forceHiddenRef.current = true;
    setVisible(false);
  }, []);

  return (
    <TabBarContext.Provider value={{ visible, reportScroll, show, hide }}>
      {children}
    </TabBarContext.Provider>
  );
}

export const useTabBar = () => useContext(TabBarContext);
