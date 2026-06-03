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
const CHANNEL_STREAK   = 'streak-reminders';
const SEEN_KEY = '@notif_seen_v1';
const STREAK_NUDGE_ID_KEY = '@streak_nudge_notif_id';

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
    await N.setNotificationChannelAsync(CHANNEL_STREAK, {
      name: 'Streak Reminders',
      importance: N.AndroidImportance.DEFAULT,
      lightColor: '#b994ff',
      lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: false,
      showBadge: true,
    });
  } catch {}
}

// Daily streak nudge — a single local notification at ~8 PM reminding the user
// to read so their streak survives. Repeats daily; rescheduled on each app open
// so the streak count in the copy stays fresh. Cancels the prior one first so
// we never stack duplicates. Fully local — no server / push token needed.
export async function scheduleStreakNudge(streakDays: number): Promise<void> {
  if (!N) return;
  try {
    const prevId = await AsyncStorage.getItem(STREAK_NUDGE_ID_KEY);
    if (prevId) { try { await N.cancelScheduledNotificationAsync(prevId); } catch {} }
    const body = streakDays > 0
      ? `Read a story today to keep your ${streakDays}-day streak alive.`
      : 'Catch up on today’s top stories and start a reading streak.';
    const trigger = Platform.OS === 'android'
      ? { type: N.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0, channelId: CHANNEL_STREAK }
      : { type: N.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0 };
    const id = await N.scheduleNotificationAsync({
      content: { title: 'Your reading streak', body, data: { type: 'streak-nudge' } },
      trigger,
    });
    if (id) await AsyncStorage.setItem(STREAK_NUDGE_ID_KEY, id);
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

// ── Expo push token registration ───────────────────────────────────────────
const PUSH_API = 'https://ireader.onrender.com/api/push';
const TOKEN_CACHE_KEY = '@expo_push_token_v1';

export async function registerForPush(): Promise<string | null> {
  if (!N) return null;
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;

    // Expo SDK 49+ wants the projectId explicitly.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenRes = projectId
      ? await N.getExpoPushTokenAsync({ projectId })
      : await N.getExpoPushTokenAsync();
    const token: string | undefined = tokenRes?.data;
    if (!token) return null;

    // Cache locally to avoid hitting the backend on every cold launch.
    const cached = await AsyncStorage.getItem(TOKEN_CACHE_KEY);
    if (cached === token) return token;

    await fetch(`${PUSH_API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Platform.OS }),
    }).catch(() => {});
    await AsyncStorage.setItem(TOKEN_CACHE_KEY, token);
    return token;
  } catch {
    return null;
  }
}

export async function updatePushPreferences(prefs: {
  breakingEnabled?: boolean;
  aiFeedEnabled?: boolean;
  topicsEnabled?: boolean;
  topicsKeywords?: string[];
  digestEnabled?: boolean;
  digestHour?: number;
  digestMinute?: number;
  digestEveningEnabled?: boolean;
  digestEveningHour?: number;
  digestEveningMinute?: number;
  favSourcesEnabled?: boolean;
  favSources?: string[];
}): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_CACHE_KEY);
    if (!token) return;
    await fetch(`${PUSH_API}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...prefs }),
    }).catch(() => {});
  } catch {}
}

export async function getCachedPushToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(TOKEN_CACHE_KEY); } catch { return null; }
}

export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_CACHE_KEY);
    if (!token) return;
    await fetch(`${PUSH_API}/unregister`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => {});
    await AsyncStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {}
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
