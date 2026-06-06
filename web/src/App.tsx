import { Suspense, lazy } from 'react';
import { RouterProvider, useRouter } from './contexts/RouterContext';
import { SettingsProvider } from './contexts/SettingsContext';
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

export default function App() {
  return (
    <SettingsProvider>
      <SourceProvider>
        <SavedProvider>
          <TabBarProvider>
            <RouterProvider>
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
            </RouterProvider>
          </TabBarProvider>
        </SavedProvider>
      </SourceProvider>
    </SettingsProvider>
  );
}
