import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ireader_usage_v2';
const LEGACY_KEY = '@ireader_usage_v1';
const KEEP_DAYS = 90;

interface DayStats {
  articles: number;
  ai: { summary: number; fiveWs: number; eli5: number; deepDive: number };
  sources: Record<string, number>;
  topics: Record<string, number>;
  notifsReceived: Record<string, number>; // by kind: breaking, topic, ai-feed, fav-source
  notifsOpened: Record<string, number>;
}

type UsageData = Record<string, DayStats>;

function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDay(): DayStats {
  return {
    articles: 0,
    ai: { summary: 0, fiveWs: 0, eli5: 0, deepDive: 0 },
    sources: {},
    topics: {},
    notifsReceived: {},
    notifsOpened: {},
  };
}

// Migrate v1 → v2 on first read. v1 lacked topics/notifs but had articles/ai/sources.
async function migrateIfNeeded(): Promise<void> {
  try {
    const v2 = await AsyncStorage.getItem(STORAGE_KEY);
    if (v2) return;
    const v1 = await AsyncStorage.getItem(LEGACY_KEY);
    if (!v1) return;
    const old = JSON.parse(v1) as Record<string, { articles: number; ai: { summary: number; fiveWs: number; eli5: number }; sources: Record<string, number> }>;
    const migrated: UsageData = {};
    for (const [k, v] of Object.entries(old)) {
      migrated[k] = {
        articles: v.articles ?? 0,
        ai: { summary: v.ai?.summary ?? 0, fiveWs: v.ai?.fiveWs ?? 0, eli5: v.ai?.eli5 ?? 0, deepDive: 0 },
        sources: v.sources ?? {},
        topics: {},
        notifsReceived: {},
        notifsOpened: {},
      };
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  } catch {}
}

async function loadData(): Promise<UsageData> {
  await migrateIfNeeded();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveData(data: UsageData): Promise<void> {
  const keys = Object.keys(data).sort();
  while (keys.length > KEEP_DAYS) delete data[keys.shift()!];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
}

async function bump(mutator: (d: DayStats) => void): Promise<void> {
  const data = await loadData();
  const key = dateKey();
  if (!data[key]) data[key] = emptyDay();
  mutator(data[key]);
  await saveData(data);
}

export async function trackArticleRead(source: string, topic?: string): Promise<void> {
  await bump((d) => {
    d.articles++;
    if (source) d.sources[source] = (d.sources[source] ?? 0) + 1;
    if (topic) d.topics[topic] = (d.topics[topic] ?? 0) + 1;
  });
}

export async function trackAiUsage(type: 'summary' | 'fiveWs' | 'eli5' | 'deepDive'): Promise<void> {
  await bump((d) => { d.ai[type]++; });
}

export async function trackNotifReceived(kind: string): Promise<void> {
  await bump((d) => { d.notifsReceived[kind] = (d.notifsReceived[kind] ?? 0) + 1; });
}

export async function trackNotifOpened(kind: string): Promise<void> {
  await bump((d) => { d.notifsOpened[kind] = (d.notifsOpened[kind] ?? 0) + 1; });
}

export interface DayData {
  date: string;
  label: string;
  articles: number;
  aiTotal: number;
  notifsOpened: number;
}

export interface AiBreakdown {
  summary: number;
  fiveWs: number;
  eli5: number;
  deepDive: number;
  total: number;
}

export interface NotifBreakdown {
  breaking: number;
  topic: number;
  aiFeed: number;
  favSource: number;
  total: number;
}

export interface UsageStats {
  last7Days: DayData[];
  last30Days: DayData[];
  today: { articles: number; ai: AiBreakdown; notifsOpened: NotifBreakdown; notifsReceived: NotifBreakdown };
  week: { articles: number; ai: AiBreakdown; notifsOpened: NotifBreakdown; notifsReceived: NotifBreakdown };
  month: { articles: number; ai: AiBreakdown; notifsOpened: NotifBreakdown; notifsReceived: NotifBreakdown };
  allTime: { articles: number; ai: AiBreakdown; notifsOpened: NotifBreakdown; notifsReceived: NotifBreakdown };
  topSources: { name: string; count: number }[];
  topTopics: { name: string; count: number }[];
  streakDays: number; // consecutive days with at least one article
}

function sumAi(d: DayStats): AiBreakdown {
  const { summary, fiveWs, eli5, deepDive } = d.ai;
  return { summary, fiveWs, eli5, deepDive, total: summary + fiveWs + eli5 + deepDive };
}
function addAi(a: AiBreakdown, b: AiBreakdown): AiBreakdown {
  return {
    summary: a.summary + b.summary,
    fiveWs: a.fiveWs + b.fiveWs,
    eli5: a.eli5 + b.eli5,
    deepDive: a.deepDive + b.deepDive,
    total: a.total + b.total,
  };
}
function sumNotifs(rec: Record<string, number>): NotifBreakdown {
  return {
    breaking: rec.breaking ?? 0,
    topic: rec.topic ?? 0,
    aiFeed: rec['ai-feed'] ?? 0,
    favSource: rec['fav-source'] ?? 0,
    total: Object.values(rec).reduce((s, n) => s + n, 0),
  };
}
function addNotifs(a: NotifBreakdown, b: NotifBreakdown): NotifBreakdown {
  return {
    breaking: a.breaking + b.breaking,
    topic: a.topic + b.topic,
    aiFeed: a.aiFeed + b.aiFeed,
    favSource: a.favSource + b.favSource,
    total: a.total + b.total,
  };
}

const ZERO_AI: AiBreakdown = { summary: 0, fiveWs: 0, eli5: 0, deepDive: 0, total: 0 };
const ZERO_NOTIF: NotifBreakdown = { breaking: 0, topic: 0, aiFeed: 0, favSource: 0, total: 0 };
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function getUsageStats(): Promise<UsageStats> {
  const data = await loadData();
  const today = new Date();

  function buildDayData(offset: number): DayData {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const key = dateKey(d);
    const s = data[key] ?? emptyDay();
    return {
      date: key,
      label: DAY_LABELS[d.getDay()],
      articles: s.articles,
      aiTotal: sumAi(s).total,
      notifsOpened: sumNotifs(s.notifsOpened).total,
    };
  }

  const last7Days = Array.from({ length: 7 }, (_, i) => buildDayData(6 - i));
  const last30Days = Array.from({ length: 30 }, (_, i) => buildDayData(29 - i));

  const todayKey = dateKey(today);
  const todayRaw = data[todayKey] ?? emptyDay();

  function bucket(daysList: DayData[]) {
    return daysList.reduce(
      (acc, d) => {
        const raw = data[d.date] ?? emptyDay();
        return {
          articles: acc.articles + raw.articles,
          ai: addAi(acc.ai, sumAi(raw)),
          notifsOpened: addNotifs(acc.notifsOpened, sumNotifs(raw.notifsOpened)),
          notifsReceived: addNotifs(acc.notifsReceived, sumNotifs(raw.notifsReceived)),
        };
      },
      { articles: 0, ai: { ...ZERO_AI }, notifsOpened: { ...ZERO_NOTIF }, notifsReceived: { ...ZERO_NOTIF } },
    );
  }

  const week = bucket(last7Days);
  const month = bucket(last30Days);

  const allTime = Object.values(data).reduce(
    (acc, raw) => ({
      articles: acc.articles + raw.articles,
      ai: addAi(acc.ai, sumAi(raw)),
      notifsOpened: addNotifs(acc.notifsOpened, sumNotifs(raw.notifsOpened)),
      notifsReceived: addNotifs(acc.notifsReceived, sumNotifs(raw.notifsReceived)),
    }),
    { articles: 0, ai: { ...ZERO_AI }, notifsOpened: { ...ZERO_NOTIF }, notifsReceived: { ...ZERO_NOTIF } },
  );

  const sourceMap: Record<string, number> = {};
  const topicMap: Record<string, number> = {};
  for (const day of Object.values(data)) {
    for (const [src, cnt] of Object.entries(day.sources)) sourceMap[src] = (sourceMap[src] ?? 0) + cnt;
    for (const [t, cnt] of Object.entries(day.topics)) topicMap[t] = (topicMap[t] ?? 0) + cnt;
  }
  const topSources = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  const topTopics = Object.entries(topicMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

  // Reading streak: walk back from today, count consecutive days with >=1 article.
  let streakDays = 0;
  for (let i = 0; i < KEEP_DAYS; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dateKey(d);
    const s = data[k];
    if (s && s.articles > 0) streakDays++;
    else if (i > 0) break;
  }

  return {
    last7Days,
    last30Days,
    today: { articles: todayRaw.articles, ai: sumAi(todayRaw), notifsOpened: sumNotifs(todayRaw.notifsOpened), notifsReceived: sumNotifs(todayRaw.notifsReceived) },
    week,
    month,
    allTime,
    topSources,
    topTopics,
    streakDays,
  };
}
