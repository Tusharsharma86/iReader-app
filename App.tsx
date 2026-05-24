import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Animated, Pressable, Text, View, StyleSheet } from 'react-native';
import { tabBarTranslateY } from './utils/tabBarAnim';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import ArticleScreen from './screens/ArticleScreen';
import TopicFeedScreen from './screens/TopicFeedScreen';
import SavedScreen from './screens/SavedScreen';
import FeedScreen from './app/index';
import DigestScreen from './screens/DigestScreen';
import SettingsScreen from './screens/SettingsScreen';
import TopicsScreen from './screens/TopicsScreen';
import SourcesScreen from './screens/SourcesScreen';
import { SettingsProvider } from './contexts/SettingsContext';
import { SourceProvider } from './contexts/SourceContext';
import { SavedProvider } from './contexts/SavedContext';
import { FeedStackParamList, RootTabParamList, SettingsStackParamList } from './types/navigation';
import FavSourcesScreen from './screens/FavSourcesScreen';
import UsageScreen from './screens/UsageScreen';
import TopicInterestsScreen from './screens/TopicInterestsScreen';
import StoryTimelineScreen from './screens/StoryTimelineScreen';
import { setupNotificationChannels, requestNotificationPermission } from './utils/notifications';

SplashScreen.preventAutoHideAsync();
setTimeout(() => SplashScreen.hideAsync(), 3000);

const Tab = createBottomTabNavigator<RootTabParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ITEMS: { route: keyof RootTabParamList; label: string; icon: IoniconsName; iconActive: IoniconsName }[] = [
  { route: 'Feed',     label: 'Feed',     icon: 'newspaper-outline',  iconActive: 'newspaper'  },
  { route: 'Digest',   label: 'Digest',   icon: 'flash-outline',      iconActive: 'flash'      },
  { route: 'Saved',    label: 'Saved',    icon: 'bookmark-outline',   iconActive: 'bookmark'   },
  { route: 'Settings', label: 'Settings', icon: 'settings-outline',   iconActive: 'settings'   },
];

function ParticleTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Hide tab bar when Article screen is active inside a nested stack
  const focusedRoute = state.routes[state.index];
  const nestedState = focusedRoute?.state as { routes?: { name: string }[]; index?: number } | undefined;
  const nestedRouteName = nestedState?.routes?.[nestedState.index ?? 0]?.name;
  if (nestedRouteName === 'Article') return null;

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
            <Pressable
              key={item.route}
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
              style={tabStyles.tabItem}
              hitSlop={4}
            >
              <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
                <Ionicons
                  name={focused ? item.iconActive : item.icon}
                  size={focused ? 22 : 20}
                  color={focused ? '#FFFFFF' : 'rgba(255,255,255,0.55)'}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
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
      <SettingsStack.Screen name="TopicInterests" component={TopicInterestsScreen} />
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
            // Discard state older than 24 h so cold restarts start fresh
            if (typeof ts === 'number' && !isNaN(ts) && Date.now() - ts < 86_400_000) setNavInitState(state);
          } catch {}
        }
      })
      .finally(() => {
        setNavReady(true);
        SplashScreen.hideAsync().catch(() => {});
      });

    setupNotificationChannels()
      .then(() => requestNotificationPermission())
      .catch(() => {});
  }, []);

  if (!navReady) return null;

  return (
    <SettingsProvider>
    <SourceProvider>
    <SavedProvider>
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <NavigationContainer
          initialState={navInitState}
          onStateChange={state => {
            AsyncStorage.setItem('@ireader_nav_state', JSON.stringify({ state, ts: Date.now() })).catch(() => {});
          }}
          theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: '#080808', card: '#080808' } }}>
        <Tab.Navigator
          tabBar={(props) => <ParticleTabBar {...props} />}
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#080808' } }}
        >
          <Tab.Screen name="Feed"     component={FeedNavigator} />
          <Tab.Screen name="Digest"   component={DigestScreen} />
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
