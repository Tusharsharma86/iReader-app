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
    <Animated.View style={[tabStyles.bar, { paddingBottom: insets.bottom + 8, transform: [{ translateY: tabBarTranslateY }], position: 'absolute', bottom: 0, left: 0, right: 0 }]}>
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
          >
            <View style={[tabStyles.iconPill, focused && tabStyles.iconPillActive]}>
              <Ionicons
                name={focused ? item.iconActive : item.icon}
                size={22}
                color={focused ? '#FFFFFF' : '#4A4A4A'}
              />
            </View>
            <Text style={[tabStyles.tabLabel, focused && tabStyles.tabLabelActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: '#181818',
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  iconPill: {
    width: 52,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: '#1E1E1E',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4A4A4A',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: '#FFFFFF',
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
