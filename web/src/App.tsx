import React, { Suspense, lazy } from 'react';
import { RouterProvider, useRouter } from './contexts/RouterContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { SourceProvider } from './contexts/SourceContext';
import { SavedProvider } from './contexts/SavedContext';
import { TabBarProvider } from './contexts/TabBarContext';
import { TabBar } from './components/TabBar';

const FeedScreen       = lazy(() => import('./screens/FeedScreen'));
const ArticleScreen    = lazy(() => import('./screens/ArticleScreen'));
const AIFeedScreen     = lazy(() => import('./screens/AIFeedScreen'));
const DigestScreen     = lazy(() => import('./screens/DigestScreen'));
const SavedScreen      = lazy(() => import('./screens/SavedScreen'));
const SettingsScreen   = lazy(() => import('./screens/SettingsScreen'));
const SourcesScreen    = lazy(() => import('./screens/SourcesScreen'));
const TopicsScreen     = lazy(() => import('./screens/TopicsScreen'));
const TopicFeedScreen  = lazy(() => import('./screens/TopicFeedScreen'));
const FavSourcesScreen = lazy(() => import('./screens/FavSourcesScreen'));
const TopicInterestsScreen = lazy(() => import('./screens/TopicInterestsScreen'));
const UsageScreen           = lazy(() => import('./screens/UsageScreen'));
const StoryTimelineScreen   = lazy(() => import('./screens/StoryTimelineScreen'));
const NotificationSettingsScreen = lazy(() => import('./screens/NotificationSettingsScreen'));
const BreakingThemesScreen  = lazy(() => import('./screens/BreakingThemesScreen'));
const NotifHistoryScreen    = lazy(() => import('./screens/NotifHistoryScreen'));
const CustomizeScreen       = lazy(() => import('./screens/CustomizeScreen'));

const spinner = (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#000' }}>
    <div style={{ width: 36, height: 36, border: '3px solid #1A1A1A', borderTop: '3px solid #4A90D9', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

function ScreenRenderer() {
  const { currentScreen } = useRouter();
  const isFeed = currentScreen.name === 'Feed';

  return (
    <>
      {/* FeedScreen stays mounted at all times — visibility toggle preserves scroll
          position and rankedClusters memo, so order never reshuffles on back-nav */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: isFeed ? 'translateX(0)' : 'translateX(-100%)',
        willChange: 'transform',
        pointerEvents: isFeed ? 'auto' : 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}>
        <Suspense fallback={spinner}><FeedScreen isVisible={isFeed} /></Suspense>
      </div>

      {/* Every other screen mounts on top */}
      {!isFeed && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          <Suspense fallback={spinner}>
            {currentScreen.name === 'Article'    && <ArticleScreen params={currentScreen.params} />}
            {currentScreen.name === 'AIFeed'     && <AIFeedScreen />}
            {currentScreen.name === 'Digest'     && <DigestScreen />}
            {currentScreen.name === 'Saved'      && <SavedScreen />}
            {currentScreen.name === 'TopicFeed'  && <TopicFeedScreen tag={currentScreen.params.tag} />}
            {currentScreen.name === 'Settings'   && <SettingsScreen />}
            {currentScreen.name === 'Sources'    && <SourcesScreen />}
            {currentScreen.name === 'Topics'     && <TopicsScreen />}
            {currentScreen.name === 'FavSources' && <FavSourcesScreen />}
            {currentScreen.name === 'TopicInterests' && <TopicInterestsScreen />}
            {currentScreen.name === 'Usage'      && <UsageScreen />}
            {currentScreen.name === 'StoryTimeline' && <StoryTimelineScreen params={currentScreen.params} />}
            {currentScreen.name === 'NotificationSettings' && <NotificationSettingsScreen />}
            {currentScreen.name === 'BreakingThemes' && <BreakingThemesScreen />}
            {currentScreen.name === 'NotifHistory' && <NotifHistoryScreen />}
            {currentScreen.name === 'Customize' && <CustomizeScreen />}
          </Suspense>
        </div>
      )}
    </>
  );
}

// Customize → keyboardShortcuts. Global key listener for J/K/S/Esc.
//   J → next story · K → previous story · S → save current article · Esc → back
function KeyboardShortcuts() {
  const { keyboardShortcuts } = useSettings();
  const { goBack, canGoBack } = useRouter();
  React.useEffect(() => {
    if (!keyboardShortcuts) return;
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in an input.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'escape' && canGoBack) {
        e.preventDefault();
        goBack();
      } else if (k === 'j') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('shortcut:next'));
      } else if (k === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('shortcut:prev'));
      } else if (k === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('shortcut:save'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keyboardShortcuts, canGoBack, goBack]);
  return null;
}

function ThemeApplier({ children }: { children: React.ReactNode }) {
  // Customize → themeMode. Applies a CSS `filter: invert(1) hue-rotate(180deg)`
  // on light mode — a pragmatic stop-gap since every screen uses inline-styled
  // hex colours. Auto follows prefers-color-scheme.
  const { themeMode } = useSettings();
  const [systemLight, setSystemLight] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches,
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const h = (e: MediaQueryListEvent) => setSystemLight(e.matches);
    mq.addEventListener?.('change', h);
    return () => mq.removeEventListener?.('change', h);
  }, []);
  const lightActive = themeMode === 'light' || (themeMode === 'auto' && systemLight);
  return (
    <div style={{
      width: '100%',
      height: '100dvh',
      filter: lightActive ? 'invert(1) hue-rotate(180deg)' : 'none',
      transition: 'filter 0.25s ease',
    }}>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <SourceProvider>
        <SavedProvider>
          <TabBarProvider>
            <RouterProvider>
              <KeyboardShortcuts />
              <ThemeApplier>
                <div style={{
                  width: '100%',
                  height: '100%',
                  margin: '0 auto',
                  background: '#000',
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <ScreenRenderer />
                  <TabBar /> 
                </div>
              </ThemeApplier>
            </RouterProvider>
          </TabBarProvider>
        </SavedProvider>
      </SourceProvider>
    </SettingsProvider>
  );
}
