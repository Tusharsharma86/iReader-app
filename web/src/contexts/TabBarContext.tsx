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

  const reportScroll = useCallback((scrollTop: number) => {
    const delta = scrollTop - lastScrollRef.current;
    lastScrollRef.current = scrollTop;
    // Always show at the very top
    if (scrollTop < 80) { setVisible(true); return; }
    // Hide when scrolling down >8px, show when scrolling up >8px
    if (delta > 8) setVisible(false);
    else if (delta < -8) setVisible(true);
  }, []);

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  return (
    <TabBarContext.Provider value={{ visible, reportScroll, show, hide }}>
      {children}
    </TabBarContext.Provider>
  );
}

export const useTabBar = () => useContext(TabBarContext);
