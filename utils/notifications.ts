import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Linking, Platform } from 'react-native';

// Skip require in Expo Go (SDK 53+ removed expo-notifications). Loads only in
// dev clients / standalone builds. All functions no-op when null.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let N: any = null;
if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  try { N = require('expo-notifications'); } catch {}
}

if (N?.setNotificationHandler) {
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {}
}

const CHANNEL_BREAKING = 'breaking-news';
const CHANNEL_SOURCES  = 'fav-sources';
const SEEN_KEY = '@notif_seen_v1';

export async function setupNotificationChannels(): Promise<void> {
  if (!N || Platform.OS !== 'android') return;
  try {
    await N.setNotificationChannelAsync(CHANNEL_BREAKING, {
      name: 'Breaking News',
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF3333',
      lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: false,
    });
    await N.setNotificationChannelAsync(CHANNEL_SOURCES, {
      name: 'Favorite Sources',
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: '#4A90D9',
      lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: false,
    });
  } catch {}
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    // Try requesting regardless of current state — Android sometimes returns
    // 'denied' on first cold launch even when the runtime prompt hasn't shown yet.
    const { status } = await N.requestPermissionsAsync();
    if (status === 'granted') return true;
    // Truly denied (or 'never_ask_again'). Send to system settings.
    await Linking.openSettings();
    return false;
  } catch {
    return false;
  }
}

// Test notification — verifies permission, channel, and handler are wired.
export async function fireTestNotif(): Promise<void> {
  if (!N) throw new Error('expo-notifications not available (Expo Go?)');
  const trigger = Platform.OS === 'android'
    ? { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: CHANNEL_BREAKING }
    : null;
  await N.scheduleNotificationAsync({
    content: {
      title: '🔔 Test Notification',
      body: 'If you see this, notifications are wired correctly.',
      data: { type: 'test' },
    },
    trigger,
  });
}

async function getSeenIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function markSeen(id: string): Promise<void> {
  try {
    const seen = await getSeenIds();
    seen.add(id);
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-1000)));
  } catch {}
}

async function send(channelId: string, title: string, body: string, data: Record<string, unknown>): Promise<void> {
  if (!N) return;
  const trigger = Platform.OS === 'android'
    ? { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId }
    : null;
  await N.scheduleNotificationAsync({ content: { title, body, data }, trigger });
}

export async function fireBreakingNotif(id: string, headline: string): Promise<void> {
  const seen = await getSeenIds();
  if (seen.has(id)) return;
  try { await send(CHANNEL_BREAKING, '🔴 Breaking News', headline, { type: 'breaking', id }); } catch {}
  await markSeen(id);
}

export async function fireFavSourceNotif(id: string, source: string, headline: string): Promise<void> {
  const seen = await getSeenIds();
  if (seen.has(id)) return;
  try { await send(CHANNEL_SOURCES, source, headline, { type: 'source', source, id }); } catch {}
  await markSeen(id);
}
