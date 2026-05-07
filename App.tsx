import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ArticleScreen from './screens/ArticleScreen';
import TopicFeedScreen from './screens/TopicFeedScreen';
import SavedScreen from './screens/SavedScreen';
import FeedScreen from './app/index';
import SettingsScreen from './screens/SettingsScreen';
import { SettingsProvider } from './contexts/SettingsContext';
import { SourceProvider } from './contexts/SourceContext';
import { SavedProvider } from './contexts/SavedContext';
import { FeedStackParamList, RootTabParamList } from './types/navigation';

SplashScreen.preventAutoHideAsync();
setTimeout(() => SplashScreen.hideAsync(), 3000);

const Tab = createBottomTabNavigator<RootTabParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();

function FeedNavigator() {
  return (
    <FeedStack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}
    >
      <FeedStack.Screen name="FeedHome" component={FeedScreen} />
      <FeedStack.Screen name="TopicFeed" component={TopicFeedScreen} />
      <FeedStack.Screen name="Article" component={ArticleScreen} />
    </FeedStack.Navigator>
  );
}

export default function App() {
  useEffect(() => { SplashScreen.hideAsync(); }, []);
  return (
    <SettingsProvider>
    <SourceProvider>
    <SavedProvider>
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#000000',
              borderTopColor: '#1A1A1A',
              borderTopWidth: 1,
            },
            tabBarActiveTintColor: '#4A90D9',
            tabBarInactiveTintColor: '#333333',
          }}
        >
          <Tab.Screen
            name="Feed"
            component={FeedNavigator}
            options={{
              tabBarLabel: 'Feed',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="newspaper-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Saved"
            component={SavedScreen}
            options={{
              tabBarLabel: 'Saved',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="bookmark-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              tabBarLabel: 'Settings',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="settings-outline" size={size} color={color} />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
    </SavedProvider>
    </SourceProvider>
    </SettingsProvider>
  );
}
