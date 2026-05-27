import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Story, CategoryTopic } from '../types';
import { StoryCard } from '../components/StoryCard';
import { useSource } from '../contexts/SourceContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';
import { loadProfile, rankStories, rankStoriesStandard } from '../utils/personalization';
import { TOPIC_SUBTOPICS, storyMatchesSubTopic } from '../utils/topics';

const API_BASE = 'https://ireader.onrender.com/api/news/feed';
const CARD_GAP = 12;
const BG_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

const CATEGORIES = [
  { topic: 'myspace' as CategoryTopic,       label: 'For You',  icon: '✨' },
  { topic: 'breaking' as CategoryTopic,      label: 'Breaking', icon: '🔴' },
  { topic: 'technology' as CategoryTopic,    label: 'Tech',     icon: '💻' },
  { topic: 'india-politics' as CategoryTopic,label: 'India',    icon: '🇮🇳' },
  { topic: 'geopolitics' as CategoryTopic,   label: 'World',    icon: '🌍' },
  { topic: 'markets' as CategoryTopic,       label: 'Markets',  icon: '📈' },
  { topic: 'business' as CategoryTopic,      label: 'Business', icon: '💼' },
] as const;

const REAL_TOPICS: CategoryTopic[] = ['breaking', 'technology', 'india-politics', 'geopolitics', 'markets', 'business'];

const PREFERRED_SOURCES = ['TechCrunch','The Verge','Ars Technica','Wired'];

const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':'techcrunch.com','The Verge':'theverge.com','Ars Technica':'arstechnica.com','Wired':'wired.com','Hacker News':'news.ycombinator.com','9to5Mac':'9to5mac.com','9to5Google':'9to5google.com','MIT Tech Review':'technologyreview.com','Engadget':'engadget.com','VentureBeat':'venturebeat.com','The Next Web':'thenextweb.com','BBC World':'bbc.co.uk','NYT World':'nytimes.com','The Guardian':'theguardian.com','NPR World':'npr.org','Al Jazeera':'aljazeera.com','NDTV':'ndtv.com','India Today':'indiatoday.in','The Print':'theprint.in','The Quint':'thequint.com','CNBC TV18':'cnbctv18.com','Scroll.in':'scroll.in','Economic Times':'economictimes.indiatimes.com','Livemint':'livemint.com','Mint':'livemint.com','Inc42':'inc42.com','Indian Express':'indianexpress.com',
};
function faviconUrl(name: string) { return `https://www.google.com/s2/favicons?domain=${SOURCE_DOMAINS[name] ?? 'google.com'}&sz=64`; }

const DEVANAGARI_RE = /[ऀ-ॿ]/;
const BLOCKED_ALWAYS_RE = /\b(promo.?codes?|coupons?|discount.?codes?|cashback|voucher|sale.?offer|deal.?alert|exclusive.?deal|special.?offer|affiliate|referral.?codes?|invite.?codes?|offer.?codes?|redeem.?codes?|flat \d+%|flash sale|best deals?|top deals?|today.{0,8}deals?|today.{0,8}offers?|limited.{0,8}offer|get \d+% off|save \d+%|\d+%\s*off|phone price|smartphone price|price drops?|price cut|price hike|lowest price|best price|launched at|starts at rs|starts at \$|goes on sale|specs leak|hands.?on review|camera test|(?:cpu|gpu|phone|device|gaming|graphics|processor)\s+benchmark|unboxing|vs comparison|budget phone|flagship phone|gadget deal|record low price|all.?time low|exchange offer)\b/i;
const BLOCKED_SPORTS_RE = /\b(cricket|ipl|bcci|test match|odi|t20i?|football|fifa|tennis|wimbledon|formula[- ]1|f1 race|chess|olympics|hockey|badminton|icc|world cup|fantasy cricket|dream11|match report|scorecard|batting|bowling|wicket|wickets|run chase|penalty kick|goal scored|transfer window)\b/i;
const BLOCKED_ENTERTAINMENT_RE = /\b(bollywood|tollywood|kollywood|movie|film|actor|actress|celebrity|box office|trailer|oscar|grammy|award show|web series|ott platform|music video|item song|album launch|concert tour|celebrity gossip|entertainment news|celebrity wedding|star spotted)\b/i;

function greeting() { const h = new Date().getHours(); if (h < 12) return 'Good Morning'; if (h < 17) return 'Good Afternoon'; return 'Good Evening'; }
function formattedDate() { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }

const LABEL_SKIP = new Set([
  'a','an','the','in','on','at','to','for','of','and','or','but','as','is','are','was','were',
  'be','been','by','from','with','that','this','it','its','amid','after','over','into','says',
  'said','new','india','indian','world','major','big','key','latest','how','why','what','when',
  'who','where',
]);

interface StoryCluster {
  id: string;
  topicLabel: string;
  subtitle: string;
  stories: Story[];
  isBreaking: boolean;
  biasBreakdown?: { left: number; center: number; right: number; unknown: number; diversity: boolean };
}

function generateTopicLabel(headline: string): string {
  const words = headline.split(/[\s,;:–—\-]+/);
  const picked: string[] = [];
  for (const w of words) {
    const clean = w.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length > 1 && !LABEL_SKIP.has(clean.toLowerCase())) {
      picked.push(clean);
      if (picked.length >= 3) break;
    }
  }
  return picked.join(' ') || headline.slice(0, 28).trim();
}

// ── Cluster Section ────────────────────────────────────────────────────────────
function ClusterSection({ cluster, soloCardWidth, allStories }: {
  cluster: StoryCluster; soloCardWidth: number; allStories: Story[];
}) {
  const { navigate } = useRouter();
  const isBreaking = cluster.isBreaking;
  const canTimeline = cluster.stories.length >= 3;

  function openTimeline() {
    navigate({ name: 'StoryTimeline', params: { clusterId: cluster.id, headline: cluster.topicLabel, stories: JSON.stringify(cluster.stories) } });
  }
  const clusterCardWidth = Math.min(Math.round(window.innerWidth * 0.78), 360);
  // CSS calc uses the actual container width (not window.innerWidth) — matches standalone centering
  const sideMargin = `max(0px, calc((100% - ${soloCardWidth}px) / 2))`;
  const snapInterval = clusterCardWidth + CARD_GAP;
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const idx = Math.round(scrollRef.current.scrollLeft / snapInterval);
    setActiveIdx(Math.max(0, Math.min(idx, cluster.stories.length - 1)));
  }, [snapInterval, cluster.stories.length]);

  if (cluster.stories.length === 1) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <StoryCard story={cluster.stories[0]} cardWidth={soloCardWidth} allStories={allStories} />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Topic label */}
      <div style={{ paddingLeft: sideMargin, paddingRight: sideMargin, marginBottom: 12 }}>
        <div
          onClick={canTimeline ? openTimeline : undefined}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4, cursor: canTimeline ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            {canTimeline && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3A3A3A" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            )}
            <div style={{ color: '#fff', fontSize: 21, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.2 }}>
              {cluster.topicLabel}
            </div>
            {isBreaking && (
              <span style={{ color: '#FF3B30', fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>BREAKING</span>
            )}
          </div>
          <span style={{
            color: '#888', fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            whiteSpace: 'nowrap', marginTop: 2,
          }}>
            {cluster.stories.length} stories
          </span>
        </div>
        {cluster.subtitle && (
          <div style={{ color: '#666', fontSize: 13, lineHeight: 1.4, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {cluster.subtitle}
          </div>
        )}
        {(() => {
          const bd = cluster.biasBreakdown;
          const hasBias = bd && (bd.left + bd.center + bd.right) > 0;
          const hasDiversity = bd?.diversity;
          if (!hasBias && !hasDiversity) return null;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {hasBias && (
                <div style={{ display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden', width: 60 }}>
                  <div style={{ flex: bd!.left || 0.001, background: '#1E5CFF' }} />
                  <div style={{ flex: bd!.center || 0.001, background: '#9B9B9B' }} />
                  <div style={{ flex: bd!.right || 0.001, background: '#FF3B30' }} />
                </div>
              )}
              {hasDiversity && (
                <span style={{ color: 'rgba(100,200,100,0.8)', fontSize: 10, fontWeight: 700, letterSpacing: 0.3, padding: '2px 7px', borderRadius: 99, border: '1px solid rgba(100,200,100,0.2)', background: 'rgba(100,180,100,0.1)' }}>
                  Multi-perspective
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Horizontal carousel — narrower cards, next card peeks */}
      <div ref={scrollRef} onScroll={handleScroll}
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', paddingLeft: sideMargin, paddingRight: sideMargin, gap: CARD_GAP, scrollbarWidth: 'none' }}>
        {cluster.stories.map(story => (
          <div key={story.id} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
            <StoryCard story={story} cardWidth={clusterCardWidth} allStories={allStories} suppressBreaking={isBreaking} />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
        {cluster.stories.map((_, i) => (
          <div key={i} style={{ height: 6, borderRadius: 3, background: i === activeIdx ? '#fff' : '#333', width: i === activeIdx ? 18 : 6, transition: 'all 0.2s' }} />
        ))}
      </div>
    </div>
  );
}

// ── Main Feed Screen ───────────────────────────────────────────────────────────
// Server feed item types (from /api/news/feed?topic=X)
type ServerFeedItem =
  | { type: 'cluster'; topicTitle: string; topicSummary: string; articles: Story[] }
  | (Story & { type: 'article' });

// Module-level cache — survives FeedScreen unmount/remount (navigation)
const feedCache = new Map<CategoryTopic, { data: ServerFeedItem[]; ts: number }>();

function normalizeStory(a: Record<string, unknown>): Story {
  return { ...(a as unknown as Story), imageUrl: (a.imageUrl as string | null | undefined) ?? '' };
}

function parseServerFeed(raw: unknown[]): ServerFeedItem[] {
  return (raw as Array<Record<string, unknown>>).map(item => {
    if (item.type === 'cluster') {
      const articles = Array.isArray(item.articles)
        ? (item.articles as Array<Record<string, unknown>>).map(normalizeStory)
        : [];
      return { type: 'cluster' as const, topicTitle: String(item.topicTitle ?? ''), topicSummary: String(item.topicSummary ?? ''), articles };
    }
    return { ...normalizeStory(item), type: 'article' as const };
  });
}

function storyIsBreaking(s: Story): boolean {
  return s.isBreaking || (Date.now() - new Date(s.publishedAt).getTime()) < 60 * 60 * 1000;
}

function serverItemToCluster(item: ServerFeedItem): StoryCluster | null {
  if (item.type === 'cluster') {
    if (item.articles.length === 0) return null;
    return {
      id: `cluster-${item.articles[0].id}`,
      topicLabel: item.topicTitle,
      subtitle: item.topicSummary || (item.articles[0].summary ?? ''),
      stories: item.articles,
      isBreaking: item.articles.some(storyIsBreaking),
      biasBreakdown: (item.articles[0] as any).biasBreakdown,
    };
  }
  return {
    id: item.id,
    topicLabel: generateTopicLabel(item.headline),
    subtitle: item.summary ?? '',
    stories: [item],
    isBreaking: storyIsBreaking(item),
  };
}

export default function FeedScreen({ isVisible = true }: { isVisible?: boolean }) {
  const { activeSources } = useSource();
  const { activeTopics, activeSubTopics, showSports, showEntertainment } = useSettings();
  const { navigate } = useRouter();
  const { reportScroll } = useTabBar();
  const isVisibleRef = useRef(isVisible);
  useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);

  const [cardWidth, setCardWidth] = useState(() => Math.min(window.innerWidth - 28, 452));
  useEffect(() => {
    const update = () => setCardWidth(Math.min(window.innerWidth - 28, 452));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const [activeTopic, setActiveTopic] = useState<CategoryTopic>(() => {
    return (localStorage.getItem('@ireader_active_topic') as CategoryTopic) ?? 'breaking';
  });
  const [allFeed, setAllFeed] = useState<ServerFeedItem[]>(() => feedCache.get(activeTopic)?.data ?? []);
  const [pendingFeed, setPendingFeed] = useState<ServerFeedItem[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(() => !feedCache.has(activeTopic));
  const [refreshing, setRefreshing] = useState(false);
  const [techSourceFilter, setTechSourceFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeTopicRef = useRef(activeTopic);
  const lastFetchRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstLoadDone = useRef(false);

  useEffect(() => { loadProfile(); }, []);

  // Restore scroll position on first load after mount (returning from ArticleScreen)
  useEffect(() => {
    if (loading || isFirstLoadDone.current) return;
    isFirstLoadDone.current = true;
    const saved = localStorage.getItem(`@ireader_scroll_${activeTopicRef.current}`);
    const offset = saved ? parseFloat(saved) : 0;
    if (offset > 0) requestAnimationFrame(() => { containerRef.current?.scrollTo({ top: offset, behavior: 'auto' }); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  useEffect(() => { activeTopicRef.current = activeTopic; }, [activeTopic]);
  useEffect(() => { localStorage.setItem('@ireader_active_topic', activeTopic); }, [activeTopic]);

  // When returning to feed, check if backgroundRefresh updated the cache while hidden
  useEffect(() => {
    if (!isVisible) return;
    const cached = feedCache.get(activeTopicRef.current);
    if (!cached) return;
    const currentIds = new Set(feedToStories(allFeed).map(s => s.id));
    const brandNew = feedToStories(cached.data).filter(s => !currentIds.has(s.id));
    if (brandNew.length > 0) { setPendingFeed(cached.data); setNewCount(brandNew.length); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  function isBlocked(headline: string, source?: string): boolean {
    if (DEVANAGARI_RE.test(headline)) return true;
    if (BLOCKED_ALWAYS_RE.test(headline)) return true;
    if (!showSports && BLOCKED_SPORTS_RE.test(headline)) return true;
    if (!showEntertainment && BLOCKED_ENTERTAINMENT_RE.test(headline)) return true;
    if (source === 'India Today' && /\bdiscount\b/i.test(headline)) return true;
    return false;
  }

  function filterFeedItems(feed: ServerFeedItem[], topic: CategoryTopic): ServerFeedItem[] {
    // myspace aggregates all topics — only apply blocked/source filters, not sub-topic filters
    const subs = topic === 'myspace' ? [] : (TOPIC_SUBTOPICS[topic] ?? []);
    const disabledSubs = subs.filter(s => activeSubTopics[`${topic}:${s}`] === false);

    const out: ServerFeedItem[] = [];
    for (const item of feed) {
      if (item.type === 'cluster') {
        const filtered = item.articles.filter(a => {
          if (isBlocked(a.headline, a.sources?.[0]?.name)) return false;
          if (activeSources[a.sources?.[0]?.name ?? ''] === false) return false;
          if (disabledSubs.length > 0 && disabledSubs.some(sub => storyMatchesSubTopic(a.headline, a.summary ?? '', sub))) return false;
          return true;
        });
        if (filtered.length > 0) out.push(filtered.length !== item.articles.length ? { ...item, articles: filtered } : item);
      } else {
        if (isBlocked(item.headline, item.sources?.[0]?.name)) continue;
        if (activeSources[item.sources?.[0]?.name ?? ''] === false) continue;
        if (disabledSubs.length > 0 && disabledSubs.some(sub => storyMatchesSubTopic(item.headline, item.summary ?? '', sub))) continue;
        out.push(item);
      }
    }
    return out;
  }

  // Extract all story objects from a feed for "allStories" (used by StoryCard related)
  function feedToStories(feed: ServerFeedItem[]): Story[] {
    return feed.flatMap(item => item.type === 'cluster' ? item.articles : [item]);
  }

  async function fetchFeed(topic: CategoryTopic, force = false): Promise<ServerFeedItem[]> {
    if (topic === 'myspace') {
      const forceParam = force ? '&force=1' : '';
      const results = await Promise.all(
        REAL_TOPICS.map(t =>
          fetch(`${API_BASE}?topic=${t}${forceParam}`)
            .then(r => r.ok ? r.json() : { feed: [] })
            .then((d: { feed?: unknown[]; stories?: unknown[] }) => {
              const raw = d.feed ?? d.stories?.map(s => ({ ...(s as object), type: 'article' })) ?? [];
              return parseServerFeed(raw).map(item => ({ ...item, _category: t }));
            })
            .catch(() => [] as ServerFeedItem[])
        )
      );
      return results.flat();
    }
    const forceParam = force ? '&force=1' : '';
    const res = await fetch(`${API_BASE}?topic=${topic}${forceParam}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { feed?: unknown[]; stories?: unknown[] };
    const rawItems = data.feed ?? data.stories?.map(s => ({ ...(s as object), type: 'article' })) ?? [];
    return parseServerFeed(rawItems);
  }

  async function backgroundRefresh(topic: CategoryTopic, currentFeed: ServerFeedItem[]) {
    try {
      const fresh = await fetchFeed(topic);
      lastFetchRef.current = Date.now();
      feedCache.set(topic, { data: fresh, ts: Date.now() });
      // Don't trigger re-renders while hidden — apply when visible again
      if (!isVisibleRef.current) return;
      const currentIds = new Set(feedToStories(currentFeed).map(s => s.id));
      const brandNew = feedToStories(fresh).filter(s => !currentIds.has(s.id));
      if (brandNew.length > 0) { setPendingFeed(fresh); setNewCount(brandNew.length); }
    } catch {}
  }

  // Topic change: serve from cache instantly, fetch in background if stale
  useEffect(() => {
    setPendingFeed(null); setNewCount(0); setTechSourceFilter(null);

    let cancelled = false;
    const cached = feedCache.get(activeTopic);
    if (cached) {
      setAllFeed(cached.data);
      setLoading(false);
      const stale = Date.now() - cached.ts > BG_REFRESH_THRESHOLD_MS;
      if (stale) backgroundRefresh(activeTopic, cached.data);
    } else {
      setLoading(true);
      setAllFeed([]);
      fetchFeed(activeTopic)
        .then(feed => {
          if (cancelled) return;
          setAllFeed(feed);
          feedCache.set(activeTopic, { data: feed, ts: Date.now() });
          lastFetchRef.current = Date.now();
        })
        .catch(e => { if (!cancelled) setError(e.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopic]);


  // Save scroll offset on scroll + drive tab-bar auto-hide
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    scrollOffsetRef.current = el.scrollTop;
    reportScroll(el.scrollTop);
    const elapsed = Date.now() - lastFetchRef.current;
    if (el.scrollTop === 0 && elapsed > BG_REFRESH_THRESHOLD_MS) {
      backgroundRefresh(activeTopicRef.current, allFeed);
    }
  }, [allFeed, reportScroll]);

  // Save offset when navigating away / closing
  useEffect(() => {
    const save = () => { localStorage.setItem(`@ireader_scroll_${activeTopicRef.current}`, String(scrollOffsetRef.current)); };
    window.addEventListener('beforeunload', save);
    return () => { save(); window.removeEventListener('beforeunload', save); };
  }, []);

  // Tapping Feed tab while already on Feed → scroll to top
  useEffect(() => {
    const scrollTop = () => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.addEventListener('feed-scroll-top', scrollTop);
    return () => window.removeEventListener('feed-scroll-top', scrollTop);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); setPendingFeed(null); setNewCount(0);
    try {
      const feed = await fetchFeed(activeTopic, true);
      setAllFeed(feed);
      feedCache.set(activeTopic, { data: feed, ts: Date.now() });
      lastFetchRef.current = Date.now();
    } catch {} finally { setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopic]);

  const applyPending = useCallback(() => {
    if (!pendingFeed) return;
    setAllFeed(pendingFeed);
    feedCache.set(activeTopic, { data: pendingFeed, ts: Date.now() });
    setPendingFeed(null); setNewCount(0);
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pendingFeed, activeTopic]);

  const filteredFeed = useMemo(
    () => filterFeedItems(allFeed, activeTopic),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFeed, activeSources, activeTopic, activeSubTopics, showSports, showEntertainment],
  );

  const visibleStories = useMemo(() => feedToStories(filteredFeed), [filteredFeed]);

  const storyClusters = useMemo((): StoryCluster[] => {
    return filteredFeed.flatMap(item => {
      const cluster = serverItemToCluster(item);
      return cluster ? [cluster] : [];
    });
  }, [filteredFeed]);

  const filteredClusters = useMemo(() => {
    if (activeTopic !== 'technology' || !techSourceFilter) return storyClusters;
    return storyClusters.filter(c => c.stories.some(s => s.sources?.[0]?.name === techSourceFilter));
  }, [storyClusters, activeTopic, techSourceFilter]);

  // Re-rank clusters — personalized for "For You", standard scoring for topic tabs
  const rankedClusters = useMemo(() => {
    if (filteredClusters.length === 0) return filteredClusters;
    const proxies = filteredClusters.map((c, i) => ({
      id: c.id,
      headline: c.topicLabel,
      summary: c.subtitle,
      sources: c.stories[0]?.sources ?? [],
      publishedAt: c.stories[0]?.publishedAt ?? '',
      imageUrl: c.stories[0]?.imageUrl ?? '',
      isBreaking: c.isBreaking,
      isTrending: c.stories.length >= 3,
      _i: i,
      _category: (c as any)._category,
      _categoryBonus: 0,
    }));

    if (activeTopic === 'myspace') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ranked = (rankStories(proxies as any) as any[]).map((p: any) => filteredClusters[p._i]);
      // Diversity floor: no single category contributes more than 8 cards in top 30
      const catCount: Record<string, number> = {};
      const result: typeof filteredClusters = [];
      for (const cluster of ranked) {
        const cat = (cluster as any)._category ?? 'unknown';
        const count = catCount[cat] ?? 0;
        if (result.length < 30 && count >= 8) continue;
        catCount[cat] = count + 1;
        result.push(cluster);
      }
      return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rankStoriesStandard(proxies as any) as any[]).map((p: any) => filteredClusters[p._i]);
  }, [filteredClusters, activeTopic]);

  const techSources = useMemo(() => {
    if (activeTopic !== 'technology') return [];
    const seen = new Map<string, string>();
    for (const s of visibleStories) {
      const name = s.sources?.[0]?.name;
      if (name && !seen.has(name)) { const fav = faviconUrl(name); if (fav) seen.set(name, fav); }
    }
    const result: { name: string; favicon: string }[] = [];
    for (const pref of PREFERRED_SOURCES) { if (seen.has(pref)) result.push({ name: pref, favicon: seen.get(pref)! }); }
    for (const [name, favicon] of seen) { if (!PREFERRED_SOURCES.includes(name)) result.push({ name, favicon }); }
    return result;
  }, [visibleStories, activeTopic]);

  const visibleCategories = useMemo(
    () => CATEGORIES.filter(c => c.topic === 'myspace' || activeTopics[c.topic as keyof typeof activeTopics] !== false),
    [activeTopics],
  );
  return (
    <div ref={containerRef} onScroll={handleScroll}
      style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', background: '#000', WebkitOverflowScrolling: 'touch', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}>
        <img src="/icons/icon-192.png" alt="iReader" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'contain' }} />
        <div>
          <div style={{ color: '#fff', fontSize: 26, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 }}>{greeting()}</div>
          <div style={{ color: '#555', fontSize: 13, fontWeight: 500, marginTop: 2 }}>{formattedDate()}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={onRefresh} disabled={refreshing}
            style={{ background: 'none', border: 'none', width: 38, height: 38, borderRadius: '50%', cursor: refreshing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: refreshing ? 0.3 : 1, transition: 'opacity 0.2s' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: refreshing ? 'spin 0.9s linear infinite' : 'none' }}>
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
            </svg>
          </button>
          <button onClick={() => navigate({ name: 'Settings' })}
            style={{ background: 'none', border: 'none', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', padding: '0 16px', gap: 8, marginBottom: 8, scrollbarWidth: 'none', height: 48, alignItems: 'center' }}>
        {visibleCategories.map(cat => {
          const active = cat.topic === activeTopic;
          return (
            <button key={cat.topic} onClick={() => { if (cat.topic === activeTopic) { onRefresh(); containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); } else { containerRef.current?.scrollTo({ top: 0, behavior: 'auto' }); setActiveTopic(cat.topic); } }}
              style={{ flexShrink: 0, padding: '7px 16px', borderRadius: 999, background: active ? '#fff' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer' }}>
              <span style={{ color: active ? '#000' : '#aaa', fontSize: 13, fontWeight: 700, letterSpacing: 0.2 }}>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tech source filter bar */}
      {activeTopic === 'technology' && techSources.length > 0 && (
        <div style={{ display: 'flex', overflowX: 'auto', padding: '0 16px 10px', gap: 10, scrollbarWidth: 'none', alignItems: 'center' }}>
          <button onClick={() => setTechSourceFilter(null)}
            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 99, background: !techSourceFilter ? '#fff' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', color: !techSourceFilter ? '#000' : '#888', fontSize: 12, fontWeight: 700 }}>
            All
          </button>
          {techSources.map(src => {
            const active = techSourceFilter === src.name;
            return (
              <button key={src.name} onClick={() => setTechSourceFilter(active ? null : src.name)}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 99, background: active ? '#fff' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer' }}>
                <img src={src.favicon} alt="" style={{ width: 16, height: 16, borderRadius: 4 }} />
                <span style={{ color: active ? '#000' : '#aaa', fontSize: 12, fontWeight: 600 }}>{src.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* New stories banner */}
      {newCount > 0 && (
        <div onClick={applyPending} style={{ margin: '0 20px 8px', padding: '8px 16px', borderRadius: 20, background: '#1A3A5C', textAlign: 'center', cursor: 'pointer' }}>
          <span style={{ color: '#4A90D9', fontSize: 13, fontWeight: 700, letterSpacing: 0.2 }}>↑ {newCount} new {newCount === 1 ? 'story' : 'stories'} — tap to refresh</span>
        </div>
      )}

      {/* Feed content */}
      {loading ? (
        <div style={{ padding: '0 16px' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skel-card" style={{
              height: 180, borderRadius: 20, marginBottom: 16,
              background: 'linear-gradient(90deg, #0E0E0E 0%, #1A1A1A 50%, #0E0E0E 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s ease-in-out infinite',
            }} />
          ))}
          <div style={{ height: 14, width: '40%', borderRadius: 4, marginBottom: 10, background: '#1A1A1A', animation: 'shimmer 1.4s ease-in-out infinite' }} />
          <div style={{ height: 12, width: '70%', borderRadius: 4, background: '#161616', animation: 'shimmer 1.4s ease-in-out infinite' }} />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Failed to load</div>
          <div style={{ color: '#555', fontSize: 13 }}>{error}</div>
        </div>
      ) : (
        <>
          {rankedClusters.map(cluster => (
            <ClusterSection key={cluster.id} cluster={cluster} soloCardWidth={cardWidth} allStories={visibleStories} />
          ))}
          <div style={{ height: 40 }} />
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
