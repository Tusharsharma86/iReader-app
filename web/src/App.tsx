import React, { Suspense, lazy } from 'react';
import { applyTheme, ACCENTS, type ThemeSkin } from './theme/theme';
import { RouterProvider, useRouter } from './contexts/RouterContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { SourceProvider } from './contexts/SourceContext';
import { SavedProvider } from './contexts/SavedContext';
import { TabBarProvider } from './contexts/TabBarContext';
import { TabBar } from './components/TabBar';
// AI Feed prewarm DISABLED — free-tier AI quotas (Gemini 1500/day, 10/min)
// can't fund speculative deep dives; on-demand generation + 7-day server
// cache keeps opens fast enough.
// import('./screens/AIFeedScreen').then(m => m.startAIFeedPreWarm());

const FeedScreen       = lazy(() => import('./screens/FeedScreen'));
const ExploreScreen    = lazy(() => import('./screens/ExploreScreen'));
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
const AIUsageScreen         = lazy(() => import('./screens/AIUsageScreen'));
const StoryTimelineScreen   = lazy(() => import('./screens/StoryTimelineScreen'));
const NotificationSettingsScreen = lazy(() => import('./screens/NotificationSettingsScreen'));
const BreakingThemesScreen  = lazy(() => import('./screens/BreakingThemesScreen'));
const NotifHistoryScreen    = lazy(() => import('./screens/NotifHistoryScreen'));
const CustomizeScreen       = lazy(() => import('./screens/CustomizeScreen'));

const spinner = (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg)' }}>
    <div style={{ width: 36, height: 36, border: '3px solid var(--line)', borderTop: '3px solid var(--accent-2)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
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
            {currentScreen.name === 'Explore'    && <ExploreScreen />}
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
            {currentScreen.name === 'AIUsage'    && <AIUsageScreen />}
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
  // Applies the design tokens in src/theme/theme.ts as CSS custom properties.
  // This replaced a whole-page `filter: invert(1) hue-rotate(180deg)` light
  // mode, which also inverted photographs.
  const { themeSkin, accentPreset, ambience, motionLevel, uiStyle } = useSettings();
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

  // Ambience drifts with the clock, so re-apply on the hour rather than only
  // when a setting changes.
  const [hour, setHour] = React.useState(() => new Date().getHours());
  React.useEffect(() => {
    if (!ambience) return;
    const id = setInterval(() => setHour(new Date().getHours()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [ambience]);

  const skin: Exclude<ThemeSkin, 'auto'> =
    themeSkin === 'auto' ? (systemLight ? 'daylight' : 'midnight') : themeSkin;

  React.useEffect(() => {
    // 'dynamic' follows the open story's colour; screens override --accent
    // themselves, so fall back to violet for the chrome until one does.
    const a = accentPreset === 'dynamic' ? ACCENTS.violet : ACCENTS[accentPreset];
    applyTheme({ skin, style: uiStyle, accent: a.accent, accent2: a.accent2, ambience, motion: motionLevel, hour });
  }, [skin, uiStyle, accentPreset, ambience, motionLevel, hour]);

  return (
    <div style={{
      width: '100%',
      height: '100dvh',
      background: 'var(--bg)',
      transition: 'background var(--dur-base) ease',
    }}>
      {children}
      {ambience && (
        <div
          aria-hidden
          style={{
            position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 3,
            background: 'var(--ambience)',
            mixBlendMode: 'soft-light',
            transition: 'background 1.2s ease',
          }}
        />
      )}
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
                  background: 'var(--bg)',
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
