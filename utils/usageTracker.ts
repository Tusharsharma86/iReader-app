import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ireader_usage_v1';
const KEEP_DAYS = 30;
const COST_PER_AI_CALL = 0.018; // ~$0.018 per call (Claude Sonnet, avg article summary)

interface DayStats {
  articles: number;
  ai: { summary: number; fiveWs: number; eli5: number };
  sources: Record<string, number>;
}

type UsageData = Record<string, DayStats>;

function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDay(): DayStats {
  return { articles: 0, ai: { summary: 0, fiveWs: 0, eli5: 0 }, sources: {} };
}

async function loadData(): Promise<UsageData> {
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

export async function trackArticleRead(source: string): Promise<void> {
  const data = await loadData();
  const key = dateKey();
  if (!data[key]) data[key] = emptyDay();
  data[key].articles++;
  if (source) data[key].sources[source] = (data[key].sources[source] ?? 0) + 1;
  await saveData(data);
}

export async function trackAiUsage(type: 'summary' | 'fiveWs' | 'eli5'): Promise<void> {
  const data = await loadData();
  const key = dateKey();
  if (!data[key]) data[key] = emptyDay();
  data[key].ai[type]++;
  await saveData(data);
}

export interface DayData {
  date: string;
  label: string;
  articles: number;
  aiTotal: number;
}

export interface AiBreakdown {
  summary: number;
  fiveWs: number;
  eli5: number;
  total: number;
}

export interface UsageStats {
  last7Days: DayData[];
  last30Days: DayData[];
  today: { articles: number; ai: AiBreakdown };
  week: { articles: number; ai: AiBreakdown };
  month: { articles: number; ai: AiBreakdown };
  allTime: { articles: number; ai: AiBreakdown };
  topSources: { name: string; count: number }[];
  costPerAiCall: number;
}

function sumAi(d: DayStats): AiBreakdown {
  const { summary, fiveWs, eli5 } = d.ai;
  return { summary, fiveWs, eli5, total: summary + fiveWs + eli5 };
}

function addAi(a: AiBreakdown, b: AiBreakdown): AiBreakdown {
  return {
    summary: a.summary + b.summary,
    fiveWs: a.fiveWs + b.fiveWs,
    eli5: a.eli5 + b.eli5,
    total: a.total + b.total,
  };
}

const ZERO_AI: AiBreakdown = { summary: 0, fiveWs: 0, eli5: 0, total: 0 };
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function getUsageStats(): Promise<UsageStats> {
  const data = await loadData();
  const today = new Date();

  function buildDayData(offset: number): DayData {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const key = dateKey(d);
    const s = data[key] ?? emptyDay();
    return { date: key, label: DAY_LABELS[d.getDay()], articles: s.articles, aiTotal: s.ai.summary + s.ai.fiveWs + s.ai.eli5 };
  }

  const last7Days = Array.from({ length: 7 }, (_, i) => buildDayData(6 - i));
  const last30Days = Array.from({ length: 30 }, (_, i) => buildDayData(29 - i));

  const todayKey = dateKey(today);
  const todayRaw = data[todayKey] ?? emptyDay();

  const week = last7Days.reduce(
    (acc, d) => {
      const raw = data[d.date] ?? emptyDay();
      return { articles: acc.articles + raw.articles, ai: addAi(acc.ai, sumAi(raw)) };
    },
    { articles: 0, ai: { ...ZERO_AI } },
  );

  const month = last30Days.reduce(
    (acc, d) => {
      const raw = data[d.date] ?? emptyDay();
      return { articles: acc.articles + raw.articles, ai: addAi(acc.ai, sumAi(raw)) };
    },
    { articles: 0, ai: { ...ZERO_AI } },
  );

  const allTime = Object.values(data).reduce(
    (acc, raw) => ({ articles: acc.articles + raw.articles, ai: addAi(acc.ai, sumAi(raw)) }),
    { articles: 0, ai: { ...ZERO_AI } },
  );

  const sourceMap: Record<string, number> = {};
  for (const day of Object.values(data)) {
    for (const [src, cnt] of Object.entries(day.sources)) {
      sourceMap[src] = (sourceMap[src] ?? 0) + cnt;
    }
  }
  const topSources = Object.entries(sourceMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return {
    last7Days,
    last30Days,
    today: { articles: todayRaw.articles, ai: sumAi(todayRaw) },
    week,
    month,
    allTime,
    topSources,
    costPerAiCall: COST_PER_AI_CALL,
  };
}
