import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

// Visible context — only the TabBar consumes this. Changes on every show/hide.
const VisibleCtx = createContext<boolean>(true);

// Actions context — stable identity, so consumers (FeedScreen, AIFeedScreen) that
// only need reportScroll/hide/show don't rerender on visibility toggles.
interface Actions {
  reportScroll: (scrollTop: number) => void;
  show: () => void;
  hide: () => void;
}
const ActionsCtx = createContext<Actions>({ reportScroll: () => {}, show: () => {}, hide: () => {} });

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const lastScrollRef = useRef(0);
  // When a screen calls hide() explicitly (e.g. Article reader), lock the bar off
  // so background scroll events from the Feed don't pop it back into view.
  const forceHiddenRef = useRef(false);

  const reportScroll = useCallback((scrollTop: number) => {
    if (forceHiddenRef.current) return;
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

  // Stable Actions reference — keeps reportScroll consumers from re-rendering.
  const actions = useMemo<Actions>(() => ({ reportScroll, show, hide }), [reportScroll, show, hide]);

  return (
    <ActionsCtx.Provider value={actions}>
      <VisibleCtx.Provider value={visible}>
        {children}
      </VisibleCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export const useTabBarActions = () => useContext(ActionsCtx);
export const useTabBarVisible = () => useContext(VisibleCtx);

// Back-compat: returns merged shape for legacy callers.
export function useTabBar() {
  const visible = useTabBarVisible();
  const actions = useTabBarActions();
  return { visible, ...actions };
}
