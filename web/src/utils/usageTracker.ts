const STORAGE_KEY = '@ireader_usage_v1';
const KEEP_DAYS = 30;

interface DayStats {
  articles: number;
  ai: { summary: number; fiveWs: number; eli5: number };
  sources: Record<string, number>;
  categories: Record<string, number>;
  topics: Record<string, number>;
}

type UsageData = Record<string, DayStats>;

function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDay(): DayStats {
  return { articles: 0, ai: { summary: 0, fiveWs: 0, eli5: 0 }, sources: {}, categories: {}, topics: {} };
}

function loadData(): UsageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveData(data: UsageData): void {
  const keys = Object.keys(data).sort();
  while (keys.length > KEEP_DAYS) delete data[keys.shift()!];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

export function trackArticleRead(source: string, category?: string, topic?: string): void {
  const data = loadData();
  const key = dateKey();
  if (!data[key]) data[key] = emptyDay();
  if (!data[key].categories) data[key].categories = {};
  if (!data[key].topics) data[key].topics = {};
  data[key].articles++;
  if (source) data[key].sources[source] = (data[key].sources[source] ?? 0) + 1;
  if (category) data[key].categories[category] = (data[key].categories[category] ?? 0) + 1;
  if (topic) data[key].topics[topic] = (data[key].topics[topic] ?? 0) + 1;
  saveData(data);
}

// Mark today as an "active day" (app opened) so the streak counts daily usage,
// not only days where a full article was opened. Creates today's record if
// missing; harmless no-op if it already exists.
export function trackVisit(): void {
  const data = loadData();
  const key = dateKey();
  if (!data[key]) { data[key] = emptyDay(); saveData(data); }
}

export function trackAiUsage(type: 'summary' | 'fiveWs' | 'eli5'): void {
  const data = loadData();
  const key = dateKey();
  if (!data[key]) data[key] = emptyDay();
  data[key].ai[type]++;
  saveData(data);
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
  topCategories: { name: string; count: number }[];
  topTopics: { name: string; count: number }[];
  streakDays: number;
  costPerAiCall: number;
}

function sumAi(d: DayStats): AiBreakdown {
  const { summary, fiveWs, eli5 } = d.ai;
  return { summary, fiveWs, eli5, total: summary + fiveWs + eli5 };
}

function addAi(a: AiBreakdown, b: AiBreakdown): AiBreakdown {
  return { summary: a.summary + b.summary, fiveWs: a.fiveWs + b.fiveWs, eli5: a.eli5 + b.eli5, total: a.total + b.total };
}

const ZERO_AI: AiBreakdown = { summary: 0, fiveWs: 0, eli5: 0, total: 0 };
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TOPIC_LABELS: Record<string, string> = {
  'myspace': 'My Space',
  'breaking': 'Breaking',
  'technology': 'Technology',
  'india-politics': 'India Politics',
  'geopolitics': 'Geopolitics',
  'markets': 'Markets',
  'business': 'Business',
};

export function getUsageStats(): UsageStats {
  const data = loadData();
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

  const week = last7Days.reduce((acc, d) => {
    const raw = data[d.date] ?? emptyDay();
    return { articles: acc.articles + raw.articles, ai: addAi(acc.ai, sumAi(raw)) };
  }, { articles: 0, ai: { ...ZERO_AI } });

  const month = last30Days.reduce((acc, d) => {
    const raw = data[d.date] ?? emptyDay();
    return { articles: acc.articles + raw.articles, ai: addAi(acc.ai, sumAi(raw)) };
  }, { articles: 0, ai: { ...ZERO_AI } });

  const allTime = Object.values(data).reduce(
    (acc, raw) => ({ articles: acc.articles + raw.articles, ai: addAi(acc.ai, sumAi(raw)) }),
    { articles: 0, ai: { ...ZERO_AI } },
  );

  function buildRanking(extractor: (d: DayStats) => Record<string, number>, limit: number, labelMap?: Record<string, string>) {
    const map: Record<string, number> = {};
    for (const day of Object.values(data)) {
      for (const [k, cnt] of Object.entries(extractor(day) ?? {})) {
        map[k] = (map[k] ?? 0) + cnt;
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name: labelMap?.[name] ?? name, count }));
  }

  const topSources = buildRanking(d => d.sources, 10);
  const topCategories = buildRanking(d => d.categories, 6);
  const topTopics = buildRanking(d => d.topics, 10, TOPIC_LABELS);

  // Activity streak: consecutive days (back from today) the app was used at
  // all — opened, an article read, or any AI action. A day "counts" if it has
  // a stored record (records are only created on real activity / app open).
  let streakDays = 0;
  for (let i = 0; i < KEEP_DAYS; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (data[dateKey(d)]) streakDays++;
    else break;
  }

  return { last7Days, last30Days, today: { articles: todayRaw.articles, ai: sumAi(todayRaw) }, week, month, allTime, topSources, topCategories, topTopics, streakDays, costPerAiCall: 0.018 };
}
