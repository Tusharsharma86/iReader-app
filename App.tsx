import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Animated, Pressable, Text, View, StyleSheet, Linking } from 'react-native';
import { tabBarTranslateY } from './utils/tabBarAnim';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import ArticleScreen from './screens/ArticleScreen';
import TopicFeedScreen from './screens/TopicFeedScreen';
import SavedScreen from './screens/SavedScreen';
import FeedScreen from './app/index';
import DigestScreen from './screens/DigestScreen';
import AIFeedScreen from './screens/AIFeedScreen';
import SettingsScreen from './screens/SettingsScreen';
import TopicsScreen from './screens/TopicsScreen';
import SourcesScreen from './screens/SourcesScreen';
import { SettingsProvider } from './contexts/SettingsContext';
import { SourceProvider } from './contexts/SourceContext';
import { SavedProvider } from './contexts/SavedContext';
import { FeedStackParamList, RootTabParamList, SettingsStackParamList } from './types/navigation';
import FavSourcesScreen from './screens/FavSourcesScreen';
import UsageScreen from './screens/UsageScreen';
import CostDashboardScreen from './screens/CostDashboardScreen';
import TopicInterestsScreen from './screens/TopicInterestsScreen';
import BreakingThemesScreen from './screens/BreakingThemesScreen';
import NotifHistoryScreen from './screens/NotifHistoryScreen';
import NotificationSettingsScreen from './screens/NotificationSettingsScreen';
import CustomizeScreen from './screens/CustomizeScreen';
import StoryTimelineScreen from './screens/StoryTimelineScreen';
import { setupNotificationChannels, registerForPush } from './utils/notifications';
import { trackNotifOpened, trackNotifReceived } from './utils/usageTracker';
import { pushNotifHistory, type NotifKind } from './utils/notifHistory';
import { getArticleColor } from './utils/colors';
import { loadBreakingThemeMutes, matchesMutedBreakingTheme, syncMutedThemesToBackend } from './utils/breakingThemes';

SplashScreen.preventAutoHideAsync();
setTimeout(() => SplashScreen.hideAsync(), 3000);

const navigationRef = createNavigationContainerRef<RootTabParamList>();

// Open Article (or AI Feed Deep Dive) from a tapped push payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleNotificationTap(data: any, attempt = 0) {
  // Cold start: the tap can arrive before the NavigationContainer is ready.
  // Instead of dropping it (the old bug — "sometimes opens, sometimes not"),
  // retry for up to ~6s until navigation is mounted.
  if (!navigationRef.isReady()) {
    if (attempt < 30) setTimeout(() => handleNotificationTap(data, attempt + 1), 200);
    return;
  }
  trackNotifOpened(String(data?.kind ?? 'unknown')).catch(() => {});
  const a = data?.article ?? {};
  // Deep Dive + ArticleScreen only need headline + url to render — id is an
  // internal cluster ref. Synthesize a stable id from url+headline so older
  // payloads (which may lack id, or arrived truncated) still open the same
  // screen they would today.
  const headline = String(a.headline ?? '').trim();
  const url = String(a.url ?? '').trim();
  if (!headline && !url) {
    // Truly empty payload — last resort, land on the right tab.
    if (data?.kind === 'ai-feed') navigationRef.navigate('AIFeed' as never);
    else navigationRef.navigate('Feed' as never);
    return;
  }
  const id = String(a.id ?? '').trim() || (url || headline);
  try {
    if (data?.kind === 'ai-feed') {
      AsyncStorage.setItem('@aifeed_pending_open', JSON.stringify({
        id, headline,
        summary: String(a.summary ?? ''),
        imageUrl: String(a.imageUrl ?? ''),
        url,
        source: String(a.source ?? ''),
        publishedAt: String(a.publishedAt ?? ''),
        at: Date.now(),
      })).catch(() => {});
      navigationRef.navigate('AIFeed' as never);
      return;
    }
    navigationRef.navigate('Feed', {
      screen: 'Article',
      initial: false,
      params: {
        id, url,
        image: String(a.imageUrl ?? ''),
        headline,
        summary: String(a.summary ?? ''),
        source: String(a.source ?? ''),
        publishedAt: String(a.publishedAt ?? ''),
        dominantColor: '#1A1A1A',
        sources: JSON.stringify(url ? [{ name: a.source ?? '', url }] : []),
      },
    } as never);
  } catch {}
}

// Open from a widget tap deep link: `ireaderpro://story?p=<encoded json>` or
// `ireaderpro://feed`. Parsed manually (RN's URL polyfill is unreliable for
// custom schemes) and routed through the same handler as push taps.
function handleWidgetUrl(url: string | null) {
  if (!url || !url.startsWith('ireaderpro://')) return;
  const rest = url.slice('ireaderpro://'.length);
  const [path, query = ''] = rest.split('?');
  if (path.startsWith('feed')) {
    const go = (attempt = 0): void => {
      if (!navigationRef.isReady()) { if (attempt < 30) setTimeout(() => go(attempt + 1), 200); return; }
      try { navigationRef.navigate('Feed' as never); } catch {}
    };
    go();
    return;
  }
  if (path.startsWith('story')) {
    const kv = query.split('&').find((p) => p.startsWith('p='));
    if (!kv) return;
    try {
      const article = JSON.parse(decodeURIComponent(kv.slice(2)));
      handleNotificationTap({ kind: 'widget', article });
    } catch {}
  }
}

const Tab = createBottomTabNavigator<RootTabParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ITEMS: { route: keyof RootTabParamList; label: string; icon: IoniconsName; iconActive: IoniconsName }[] = [
  { route: 'Feed',     label: 'Feed',     icon: 'newspaper-outline',  iconActive: 'newspaper'  },
  { route: 'Digest',   label: 'Digest',   icon: 'flash-outline',      iconActive: 'flash'      },
  { route: 'AIFeed',   label: 'AI Feed',  icon: 'sparkles-outline',   iconActive: 'sparkles'   },
  { route: 'Saved',    label: 'Saved',    icon: 'bookmark-outline',   iconActive: 'bookmark'   },
  { route: 'Settings', label: 'Settings', icon: 'settings-outline',   iconActive: 'settings'   },
];

function ParticleTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Hide tab bar when on Article screen, or on any Settings sub-screen
  // (anything beyond SettingsHome inside the Settings stack).
  const focusedRoute = state.routes[state.index];
  const nestedState = focusedRoute?.state as { routes?: { name: string }[]; index?: number } | undefined;
  const nestedRouteName = nestedState?.routes?.[nestedState.index ?? 0]?.name;
  if (nestedRouteName === 'Article') return null;
  const SETTINGS_SUB = new Set(['Topics', 'Sources', 'FavSources', 'Usage', 'CostDashboard', 'TopicInterests']);
  if (focusedRoute?.name === 'Settings' && nestedRouteName && SETTINGS_SUB.has(nestedRouteName)) return null;

  return (
    <Animated.View
      style={[
        tabStyles.floatWrap,
        {
          bottom: Math.max(insets.bottom + 8, 16),
          transform: [{ translateY: tabBarTranslateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={tabStyles.pill}>
        {/* Subtle inner border + glassy tint for depth */}
        <View style={tabStyles.pillBorder} pointerEvents="none" />
        {TAB_ITEMS.map((item, index) => {
          const focused = state.index === index;
          return (
            <TabItem
              key={item.route}
              focused={focused}
              item={item}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: state.routes[index]?.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(item.route);
                }
              }}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

function TabItem({ focused, item, onPress }: {
  focused: boolean;
  item: { route: keyof RootTabParamList; label: string; icon: IoniconsName; iconActive: IoniconsName };
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.92)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: focused ? 1.15 : 0.92, duration: 140, useNativeDriver: true }),
      Animated.spring(scale, { toValue: focused ? 1 : 0.92, friction: 4, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [focused, scale]);
  return (
    <Pressable onPress={onPress} style={tabStyles.tabItem} hitSlop={4}>
      <Animated.View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive, { transform: [{ scale }] }]}>
        <Ionicons
          name={focused ? item.iconActive : item.icon}
          size={focused ? 22 : 20}
          color={focused ? '#FFFFFF' : 'rgba(255,255,255,0.55)'}
        />
      </Animated.View>
    </Pressable>
  );
}

const tabStyles = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: 'hidden',
    // Dark translucent pill — gives the glassy floating feel without needing
    // a native blur view (which mismatches the Expo Go bundled module version).
    backgroundColor: 'rgba(15,15,15,0.92)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});

function FeedNavigator() {
  return (
    <FeedStack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#080808' } }}
    >
      <FeedStack.Screen name="FeedHome" component={FeedScreen} />
      <FeedStack.Screen name="TopicFeed" component={TopicFeedScreen} />
      <FeedStack.Screen name="StoryTimeline" component={StoryTimelineScreen} />
      <FeedStack.Screen name="Article" component={ArticleScreen} />
    </FeedStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#080808' } }}
    >
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
      <SettingsStack.Screen name="Topics" component={TopicsScreen} />
      <SettingsStack.Screen name="Sources" component={SourcesScreen} />
      <SettingsStack.Screen name="FavSources" component={FavSourcesScreen} />
      <SettingsStack.Screen name="Usage" component={UsageScreen} />
      <SettingsStack.Screen name="CostDashboard" component={CostDashboardScreen} />
      <SettingsStack.Screen name="TopicInterests" component={TopicInterestsScreen} />
      <SettingsStack.Screen name="BreakingThemes" component={BreakingThemesScreen} />
      <SettingsStack.Screen name="NotifHistory" component={NotifHistoryScreen} />
      <SettingsStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <SettingsStack.Screen name="Customize" component={CustomizeScreen} />
    </SettingsStack.Navigator>
  );
}

function NavBarFill() {
  const insets = useSafeAreaInsets();
  if (insets.bottom === 0) return null;
  return (
    <View style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      height: insets.bottom,
      backgroundColor: '#080808',
    }} />
  );
}

export default function App() {
  const [navReady, setNavReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [navInitState, setNavInitState] = useState<any>(undefined);

  useEffect(() => {
    // Load saved nav state before rendering — restores user to exact screen
    // (ArticleScreen, FeedHome, etc.) after fold/unfold Activity recreation.
    AsyncStorage.getItem('@ireader_nav_state')
      .then(raw => {
        if (raw) {
          try {
            const { state, ts } = JSON.parse(raw);
            if (typeof ts !== 'number' || isNaN(ts) || Date.now() - ts >= 86_400_000) return;
            // Strip any Article screens from saved state — prevents the
            // "back closes app" bug when restoration places Article without
            // FeedHome underneath.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stripArticle = (s: any): any => {
              if (!s || !Array.isArray(s.routes)) return s;
              const cleaned = s.routes
                .map((r: any) => ({ ...r, state: r.state ? stripArticle(r.state) : r.state }))
                .filter((r: any) => r.name !== 'Article');
              if (cleaned.length === 0) return undefined;
              const safeIndex = Math.min(s.index ?? 0, cleaned.length - 1);
              return { ...s, routes: cleaned, index: safeIndex };
            };
            setNavInitState(stripArticle(state));
          } catch {}
        }
      })
      .finally(() => {
        setNavReady(true);
        SplashScreen.hideAsync().catch(() => {});
      });

    setupNotificationChannels()
      .then(() => registerForPush())
      .catch(() => {});

    // Wire push-tap → open article. Handles both cold start (app launched by
    // tap) and warm (app already running). Dynamic require so Expo Go is safe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let N: any = null;
    try { N = require('expo-notifications'); } catch {}
    if (!N) return;
    const sub = N.addNotificationResponseReceivedListener((response: { notification: { request: { content: { data: unknown } } } }) => {
      handleNotificationTap(response.notification.request.content.data);
    });
    // Track every push delivered to this device (foreground + background).
    // Also snapshot the full payload into NotifHistory so the user can revisit
    // any past push from the History screen — even backend-sent ones the local
    // fireBreakingNotif path never sees.
    // Pre-load breaking-theme mute set so the listener can synchronously
    // dismiss muted-theme pushes.
    loadBreakingThemeMutes().then(() => {
      // Sync to backend so background/killed pushes are gated server-side.
      // Server-side mute is authoritative; the listener dismiss is just a
      // belt-and-braces fallback for foreground races.
      syncMutedThemesToBackend().catch(() => {});
    }).catch(() => {});
    const recvSub = N.addNotificationReceivedListener?.(async (n: {
      request?: {
        identifier?: string;
        content?: {
          title?: string;
          body?: string;
          data?: {
            kind?: string;
            clusterId?: string;
            article?: {
              id?: string;
              headline?: string;
              summary?: string;
              imageUrl?: string;
              url?: string;
              source?: string;
              publishedAt?: string;
            };
          };
        };
      };
    }) => {
      const data = n?.request?.content?.data ?? {};
      const kind = String(data.kind ?? 'unknown');
      const a = data.article ?? {};
      const id = a.id ?? data.clusterId ?? `notif-${Date.now()}`;
      const headline = a.headline ?? n?.request?.content?.body ?? n?.request?.content?.title ?? '';

      // Theme mute applies to BOTH Main Breaking and AI Feed Breaking pushes.
      // Dismiss the visible notification, drop the history write, no usage
      // ping. The user effectively never saw it.
      if ((kind === 'breaking' || kind === 'ai-feed') && headline) {
        const muted = matchesMutedBreakingTheme(headline, a.summary ?? '');
        if (muted) {
          const ident = n?.request?.identifier;
          if (ident) {
            try { await N.dismissNotificationAsync?.(ident); } catch {}
          }
          return;
        }
      }

      trackNotifReceived(kind).catch(() => {});
      if (!headline) return;
      const kindMap: Record<string, NotifKind> = {
        breaking: 'breaking', source: 'source', topic: 'topic',
        'ai-feed': 'aiFeed', digest: 'digest', streak: 'streak',
      };
      pushNotifHistory({
        id,
        kind: kindMap[kind] ?? 'breaking',
        firedAt: Date.now(),
        headline,
        summary: a.summary ?? '',
        imageUrl: a.imageUrl ?? '',
        url: a.url ?? '',
        source: a.source ?? '',
        publishedAt: a.publishedAt ?? new Date().toISOString(),
        dominantColor: getArticleColor(id || headline),
      }).catch(() => {});
    });
    // Cold start path — if app was launched by tapping a notification.
    N.getLastNotificationResponseAsync?.().then((resp: unknown) => {
      const r = resp as { notification?: { request?: { content?: { data?: unknown } } } } | null;
      const d = r?.notification?.request?.content?.data;
      if (d) setTimeout(() => handleNotificationTap(d), 400);
    });

    // Widget tap deep links (ireaderpro://…) — warm + cold start.
    const linkSub = Linking.addEventListener('url', ({ url }) => handleWidgetUrl(url));
    Linking.getInitialURL().then((url) => { if (url) setTimeout(() => handleWidgetUrl(url), 400); }).catch(() => {});

    return () => { try { sub?.remove?.(); } catch {} try { recvSub?.remove?.(); } catch {} try { linkSub?.remove?.(); } catch {} };
  }, []);

  if (!navReady) return null;

  return (
    <SettingsProvider>
    <SourceProvider>
    <SavedProvider>
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <NavigationContainer
          ref={navigationRef}
          initialState={navInitState}
          onStateChange={state => {
            // Strip Article from any persisted stack so restoring the app never
            // lands on a stuck Article with no parent (back exits app).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stripArticle = (s: any): any => {
              if (!s || !Array.isArray(s.routes)) return s;
              const cleaned = s.routes
                .map((r: any) => ({ ...r, state: r.state ? stripArticle(r.state) : r.state }))
                .filter((r: any) => r.name !== 'Article');
              if (cleaned.length === 0) return undefined;
              const safeIndex = Math.min(s.index ?? 0, cleaned.length - 1);
              return { ...s, routes: cleaned, index: safeIndex };
            };
            const safeState = stripArticle(state);
            AsyncStorage.setItem('@ireader_nav_state', JSON.stringify({ state: safeState, ts: Date.now() })).catch(() => {});
          }}
          theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: '#080808', card: '#080808' } }}>
        <Tab.Navigator
          tabBar={(props) => <ParticleTabBar {...props} />}
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#080808' } }}
        >
          <Tab.Screen name="Feed"     component={FeedNavigator} />
          <Tab.Screen name="Digest"   component={DigestScreen} />
          <Tab.Screen name="AIFeed"   component={AIFeedScreen} />
          <Tab.Screen name="Saved"    component={SavedScreen} />
          <Tab.Screen name="Settings" component={SettingsNavigator} />
        </Tab.Navigator>
      </NavigationContainer>
      {/* Always-dark fill behind the system navigation bar so the grey never
          shows when the tab bar slides away during scroll */}
      <NavBarFill />
    </SafeAreaProvider>
    </SavedProvider>
    </SourceProvider>
    </SettingsProvider>
  );
}
