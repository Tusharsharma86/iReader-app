import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

// expo-notifications requires native modules (ExpoPushTokenManager) that are
// not bundled in Expo Go. Lazy-require so the app doesn't crash in Expo Go —
// all functions below silently no-op when the module can't be loaded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let N: any = null;
try { N = require('expo-notifications'); } catch {}

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
      importance: N.AndroidImportance.DEFAULT,
      enableVibrate: false,
      showBadge: false,
    });
  } catch {}
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    if (existing === 'undetermined') {
      const { status } = await N.requestPermissionsAsync();
      return status === 'granted';
    }
    // Permission was previously denied — send user to system settings
    await Linking.openSettings();
    return false;
  } catch {
    return false;
  }
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
