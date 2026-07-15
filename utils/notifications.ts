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
const RECENT_HEADLINES_KEY = '@notif_recent_headlines_v1';
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
const TOKEN_CONFIRMED_KEY = '@expo_push_token_confirmed_v1';

export async function registerForPush(): Promise<string | null> {
  if (!N) return null;
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenRes = projectId
      ? await N.getExpoPushTokenAsync({ projectId })
      : await N.getExpoPushTokenAsync();
    const token: string | undefined = tokenRes?.data;
    if (!token) return null;

    await AsyncStorage.setItem(TOKEN_CACHE_KEY, token);

    const confirmed = await AsyncStorage.getItem(TOKEN_CONFIRMED_KEY);
    if (confirmed === token) return token;

    try {
      const res = await fetch(`${PUSH_API}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, platform: Platform.OS }),
      });
      if (res.ok) {
        await AsyncStorage.setItem(TOKEN_CONFIRMED_KEY, token);
      }
    } catch {}
    return token;
  } catch {
    return null;
  }
}

export async function updatePushPreferences(prefs: {
  breakingEnabled?: boolean;
  breakingSensitivity?: string;
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

async function send(
  channelId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  imageUrl?: string,
): Promise<void> {
  if (!N) return;
  const trigger = Platform.OS === 'android'
    ? { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId }
    : null;
  // attachments → big-picture style on iOS; Android needs a config plugin
  // for image previews on local notifs, so this is best-effort.
  const attachments = imageUrl ? [{ url: imageUrl, identifier: 'thumb' }] : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any = { title, body, data };
  if (attachments) content.attachments = attachments;
  await N.scheduleNotificationAsync({ content, trigger });
}

// Detect which of the 73 breaking themes the headline matches, returning
// the theme name or null. Used so notif titles read "Breaking · <theme>".
function detectBreakingTheme(headline: string, summary: string): string | null {
  // Lazy require to avoid a circular dep when this file is imported early.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ALL_BREAKING_THEMES } = require('./breakingThemes') as {
    ALL_BREAKING_THEMES: { name: string; pattern: RegExp }[];
  };
  const text = `${headline} ${summary}`;
  for (const t of ALL_BREAKING_THEMES) {
    if (t.pattern.test(text)) return t.name;
  }
  return null;
}

// Broad fallback when no specific theme matched — maps headline to one of the
// main feed topic labels so the notification title is never just "Breaking".
function fallbackTopicLabel(headline: string, summary: string): string | null {
  const t = `${headline} ${summary}`.toLowerCase();
  if (/\b(modi|bjp|india|delhi|mumbai|congress|parliament|minister|lok sabha|rajya|chief minister|governor|ipc|cbi|enforcement|ed |ncb|aap|nda|upa)\b/.test(t)) return 'India Politics';
  if (/\b(army|military|air force|navy|general|admiral|colonel|lieutenant|lieutenant general|major general|defence|border patrol|bsf|crpf|paramilitary)\b/.test(t)) return 'Defence';
  if (/\b(google|apple|openai|microsoft|amazon|meta|\bai\b|chip|semiconductor|software|iphone|android|startup|tech|robot|quantum)\b/.test(t)) return 'Tech';
  if (/\b(\bus\b|usa|china|russia|ukraine|nato|president|white house|ceasefire|nuclear|sanctions|united nations|\bun\b|g20|imf|world bank)\b/.test(t)) return 'World';
  if (/\b(sensex|nifty|rupee|\$|stock market|economy|rbi|inflation|rate cut|gdp|share price|crude oil|gold price)\b/.test(t)) return 'Markets';
  if (/\b(company|ceo|startup|ipo|revenue|profit|funding|acquisition|merger|valuation|listed)\b/.test(t)) return 'Business';
  return null;
}

// ── Headline similarity / follow-up detection ─────────────────────────────
const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','has','have','had','do',
  'does','did','will','would','could','should','may','might','can','shall',
  'to','of','in','for','on','with','at','by','from','as','into','about',
  'its','it','this','that','these','those','and','but','or','not','no',
  'up','out','if','then','so','than','too','very','just','also','now',
  'new','says','said','after','over','more','us','s','t','re','ve',
]);

function sigWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

interface RecentHeadline { headline: string; ts: number; }

async function getRecentHeadlines(): Promise<RecentHeadline[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_HEADLINES_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentHeadline[];
    const cutoff = Date.now() - 12 * 3_600_000;
    return list.filter(h => h.ts > cutoff);
  } catch { return []; }
}

async function pushRecentHeadline(headline: string): Promise<void> {
  try {
    const list = await getRecentHeadlines();
    list.push({ headline, ts: Date.now() });
    const trimmed = list.slice(-200);
    await AsyncStorage.setItem(RECENT_HEADLINES_KEY, JSON.stringify(trimmed));
  } catch {}
}

export type BreakingNotifKind = 'new' | 'follow-up' | 'duplicate';

export async function classifyBreakingHeadline(headline: string): Promise<BreakingNotifKind> {
  const recent = await getRecentHeadlines();
  if (recent.length === 0) return 'new';
  const words = sigWords(headline);
  let maxSim = 0;
  for (const r of recent) {
    const sim = jaccardSim(words, sigWords(r.headline));
    if (sim > maxSim) maxSim = sim;
  }
  if (maxSim >= 0.7) return 'duplicate';
  if (maxSim >= 0.3) return 'follow-up';
  return 'new';
}

export async function fireBreakingNotif(
  id: string, headline: string, summary?: string, imageUrl?: string,
  extra?: { url?: string; source?: string; publishedAt?: string },
): Promise<void> {
  const seen = await getSeenIds();
  if (seen.has(id)) return;
  const headlineKind = await classifyBreakingHeadline(headline);
  if (headlineKind === 'duplicate') { await markSeen(id); return; }
  const theme = detectBreakingTheme(headline, summary ?? '');
  const fallback = theme ? null : fallbackTopicLabel(headline, summary ?? '');
  const parts = ['Breaking'];
  if (headlineKind === 'follow-up') parts.push('Follow Up');
  if (theme) parts.push(theme);
  else if (fallback) parts.push(fallback);
  const title = parts.join(' · ');
  try {
    await send(CHANNEL_BREAKING, title, headline, {
      kind: 'breaking',
      id,
      article: {
        id,
        headline,
        summary: summary ?? '',
        imageUrl: imageUrl ?? '',
        url: extra?.url ?? '',
        source: extra?.source ?? '',
        publishedAt: extra?.publishedAt ?? '',
      },
    }, imageUrl);
  } catch {}
  await markSeen(id);
  await pushRecentHeadline(headline);
}

export async function fireFavSourceNotif(
  id: string, source: string, headline: string,
  extra?: { url?: string; summary?: string; imageUrl?: string; publishedAt?: string },
): Promise<void> {
  const seen = await getSeenIds();
  if (seen.has(id)) return;
  try {
    await send(CHANNEL_SOURCES, source, headline, {
      kind: 'source',
      source,
      id,
      article: {
        id,
        headline,
        source,
        url: extra?.url ?? '',
        summary: extra?.summary ?? '',
        imageUrl: extra?.imageUrl ?? '',
        publishedAt: extra?.publishedAt ?? '',
      },
    });
  } catch {}
  await markSeen(id);
}
