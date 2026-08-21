import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Story, CategoryTopic } from '../types';
import { StoryCard } from '../components/StoryCard';
import { useSource } from '../contexts/SourceContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';
import { loadProfile, rankStories, rankStoriesStandard } from '../utils/personalization';
import { scoreClusterInterest } from '../utils/interestTopics';
import { trackVisit } from '../utils/usageTracker';
import { annotateUpdates, unfollow, markSeen } from '../utils/followStore';
import { TOPIC_SUBTOPICS, storyMatchesSubTopic } from '../utils/topics';
import { getCached, setCached, TTL } from '../utils/cache';
import { isBlockedHeadline } from '../utils/contentFilters';

const API_BASE = 'https://ireader.onrender.com/api/news/feed';
const CARD_GAP = 12;
const BG_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

const CATEGORIES = [
  { topic: 'myspace' as CategoryTopic,        label: 'For You',  icon: 'for-you'  },
  { topic: 'breaking' as CategoryTopic,       label: 'Breaking', icon: 'breaking' },
  { topic: 'technology' as CategoryTopic,     label: 'Tech',     icon: 'tech'     },
  { topic: 'india-politics' as CategoryTopic, label: 'India',    icon: 'india'    },
  { topic: 'geopolitics' as CategoryTopic,    label: 'World',    icon: 'world'    },
  { topic: 'markets' as CategoryTopic,        label: 'Markets',  icon: 'markets'  },
  { topic: 'business' as CategoryTopic,       label: 'Business', icon: 'business' },
] as const;

type CategoryIconName = typeof CATEGORIES[number]['icon'];

function CategoryIcon({ name, active }: { name: CategoryIconName; active: boolean }) {
  const c = active ? '#000' : '#888';
  const s = 13;
  if (name === 'for-you') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
  if (name === 'breaking') return (
    <svg width={s} height={s} viewBox="0 0 512 512" fill={c}>
      <path d="M315.27 33L96 304h128l-31.51 173.23a2.81 2.81 0 005 2.17L416 208H288l31.61-173.25a2.81 2.81 0 00-4.34-2.92z" />
    </svg>
  );
  if (name === 'tech') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
  if (name === 'india') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
  if (name === 'world') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
  if (name === 'markets') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
  // business
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

const REAL_TOPICS: CategoryTopic[] = ['breaking', 'technology', 'india-politics', 'geopolitics', 'markets', 'business'];

const PREFERRED_SOURCES = ['TechCrunch','The Verge','Ars Technica','Wired'];

const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':'techcrunch.com','The Verge':'theverge.com','Ars Technica':'arstechnica.com','Wired':'wired.com','Hacker News':'news.ycombinator.com','9to5Mac':'9to5mac.com','9to5Google':'9to5google.com','MIT Tech Review':'technologyreview.com','Engadget':'engadget.com','VentureBeat':'venturebeat.com','The Next Web':'thenextweb.com','BBC World':'bbc.co.uk','NYT World':'nytimes.com','The Guardian':'theguardian.com','NPR World':'npr.org','Al Jazeera':'aljazeera.com','NDTV':'ndtv.com','India Today':'indiatoday.in','The Print':'theprint.in','The Quint':'thequint.com','CNBC TV18':'cnbctv18.com','Scroll.in':'scroll.in','Economic Times':'economictimes.indiatimes.com','Livemint':'livemint.com','Mint':'livemint.com','Inc42':'inc42.com','Indian Express':'indianexpress.com',
};
function faviconUrl(name: string) { return `https://www.google.com/s2/favicons?domain=${SOURCE_DOMAINS[name] ?? 'google.com'}&sz=64`; }


function greeting() { const h = new Date().getHours(); if (h < 12) return 'Good Morning'; if (h < 17) return 'Good Afternoon'; return 'Good Evening'; }

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
  collection?: boolean; // theme collection (different stories, same subject) vs same-event cluster
  biasBreakdown?: { left: number; center: number; right: number; unknown: number; diversity: boolean };
  _category?: string;
}

const TOPIC_META_WEB: Record<string, { label: string; color: string }> = {
  'breaking':       { label: 'Breaking', color: '#FF5555' },
  'technology':     { label: 'Tech',     color: '#4A90D9' },
  'india-politics': { label: 'India',    color: '#FF9500' },
  'geopolitics':    { label: 'World',    color: '#4ECDC4' },
  'markets':        { label: 'Markets',  color: '#22C55E' },
  'business':       { label: 'Business', color: '#A29BFE' },
};

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
  const { showMetaPill, showClusterSummary, cardDensity: density } = useSettings();
  const clusterGap = density === 'compact' ? 14 : density === 'spacious' ? 44 : 28;
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
    const clusterStory = {
      ...cluster.stories[0],
      headline: cluster.topicLabel || cluster.stories[0].headline,
      summary: cluster.subtitle || cluster.stories[0].summary,
    };
    return (
      <div style={{ marginBottom: clusterGap }}>
        {showMetaPill && (() => {
          const tier = breakingTier(cluster.stories[0]?.publishedAt, isBreaking);
          if (!tier) return null;
          const color = tier === 'developing' ? '#FF9500' : '#FF3B30';
          const bg = tier === 'developing' ? 'rgba(255,149,0,0.12)' : 'rgba(255,59,48,0.12)';
          const border = tier === 'developing' ? 'rgba(255,149,0,0.3)' : 'rgba(255,59,48,0.3)';
          return (
            <div style={{ padding: '0 20px', marginBottom: 6 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', borderRadius: 999,
                background: bg, border: `1px solid ${border}`,
              }}>
                {tier === 'live' && <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />}
                <span style={{ color, fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>
                  {tier === 'live' ? 'LIVE' : tier === 'developing' ? 'DEVELOPING' : 'BREAKING'}
                </span>
              </span>
            </div>
          );
        })()}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {/* suppressBreaking: singleton cards already show the tier pill above — showing
              it again inline in the card's meta row would duplicate it. */}
          <StoryCard story={clusterStory} cardWidth={soloCardWidth} allStories={allStories} suppressBreaking />
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: clusterGap }}>
      {/* Topic label */}
      <div
        onClick={canTimeline ? openTimeline : undefined}
        style={{ paddingLeft: sideMargin, paddingRight: sideMargin, marginBottom: 12, cursor: canTimeline ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}
      >
        {/* TREND / BREAKING pills — own row above headline */}
        {showMetaPill && (cluster.collection || isBreaking) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {cluster.collection && cluster.stories.length >= 3 && (
              <span style={{
                color: '#b994ff', fontSize: 9, fontWeight: 800, letterSpacing: 1,
                padding: '2px 7px', borderRadius: 999,
                background: 'rgba(185,148,255,0.12)', border: '1px solid rgba(185,148,255,0.28)',
              }}>TREND</span>
            )}
            {isBreaking && (() => {
              const tier = breakingTier(cluster.stories[0]?.publishedAt, isBreaking);
              if (tier === 'live') return (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF3B30', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ color: '#FF3B30', fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>LIVE</span>
                </span>
              );
              if (tier === 'developing') return (
                <span style={{ color: '#FF9500', fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,149,0,0.12)', border: '1px solid rgba(255,149,0,0.3)' }}>DEVELOPING</span>
              );
              if (tier === 'breaking') return (
                <span style={{ color: '#FF3B30', fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.3)' }}>BREAKING</span>
              );
              return null;
            })()}
          </div>
        )}
        {/* Headline row: clock prefix + text + stories pill inline */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: 1, minWidth: 0 }}>
            {canTimeline && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5A5A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 4 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            )}
            <div style={{
              color: '#fff', fontSize: 15.5, fontWeight: 800, letterSpacing: -0.2, lineHeight: 1.3,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {cluster.topicLabel}
            </div>
          </div>
          {showMetaPill && cluster.stories.length > 1 && (
            <span style={{
              flexShrink: 0, marginTop: 2,
              color: '#888', fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
              padding: '3px 9px', borderRadius: 999,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              whiteSpace: 'nowrap',
            }}>
              {cluster.stories.length} stories
            </span>
          )}
        </div>
        {/* Cluster subtitle removed — headline alone reads cleaner; stories speak for themselves. */}
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
        {cluster.stories.map((story, idx) => (
          <div key={story.id} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
            <StoryCard story={story} cardWidth={clusterCardWidth} allStories={allStories} clusterCard={idx === 0} />
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

function breakingTier(publishedAt: string | undefined, isBreaking: boolean): 'live' | 'breaking' | 'developing' | null {
  if (!isBreaking || !publishedAt) return null;
  const ageMin = (Date.now() - new Date(publishedAt).getTime()) / 60000;
  if (ageMin < 30) return 'live';
  if (ageMin < 120) return 'breaking';
  if (ageMin < 360) return 'developing';
  return null;
}

// ── MySpace Topic Zone ────────────────────────────────────────────────────────
function MyspaceTopicZone({ clusters, category, cardWidth, allStories }: {
  clusters: StoryCluster[]; category: string; cardWidth: number; allStories: Story[];
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOPIC_META_WEB[category] ?? { label: category || 'News', color: '#888888' };
  const PREVIEW = 3;
  const visible = expanded ? clusters : clusters.slice(0, PREVIEW);
  const remaining = clusters.length - PREVIEW;

  return (
    <div>
      <div onClick={() => setExpanded(e => !e)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', cursor: 'pointer', marginTop: 12,
        WebkitTapHighlightColor: 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 18, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: 0.8 }}>{meta.label.toUpperCase()}</span>
          <span style={{ color: '#666', fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.07)', padding: '2px 7px', borderRadius: 10 }}>{clusters.length}</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {expanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
        </svg>
      </div>
      {visible.map(cluster => (
        <ClusterSection key={cluster.id} cluster={cluster} soloCardWidth={cardWidth} allStories={allStories} />
      ))}
      {!expanded && remaining > 0 && (
        <div onClick={() => setExpanded(true)} style={{
          margin: '4px 20px 12px', padding: '11px 0', borderRadius: 12,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}>
          <span style={{ color: '#888', fontSize: 12, fontWeight: 600 }}>Show {remaining} more</span>
        </div>
      )}
    </div>
  );
}

// ── Main Feed Screen ───────────────────────────────────────────────────────────
// Server feed item types (from /api/news/feed?topic=X)
type ServerFeedItem =
  | { type: 'cluster'; topicTitle: string; topicSummary: string; articles: Story[]; collection?: boolean; _category?: string }
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
      return { type: 'cluster' as const, topicTitle: String(item.topicTitle ?? ''), topicSummary: String(item.topicSummary ?? ''), articles, collection: Boolean(item.collection), _category: item._category as string | undefined };
    }
    return { ...normalizeStory(item), type: 'article' as const };
  });
}

function storyIsBreaking(s: Story): boolean {
  return s.isBreaking ?? false;
}

function capToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= max ? text.trim() : words.slice(0, max).join(' ') + '…';
}

function serverItemToCluster(item: ServerFeedItem): StoryCluster | null {
  if (item.type === 'cluster') {
    if (item.articles.length === 0) return null;
    // Prefer AI-generated topicTitle — it describes the story the cluster covers.
    // Only fall back to article headline if AI returned nothing useful.
    const label = (item.topicTitle && item.topicTitle.trim().length > 8)
      ? item.topicTitle
      : (item.articles[0].headline ?? item.topicTitle);
    const rawSummary = item.topicSummary || (item.articles[0].summary ?? '');
    return {
      id: `cluster-${item.articles[0].id}`,
      topicLabel: label,
      subtitle: rawSummary ? capToWords(rawSummary, 25) : '',
      _category: item._category,
      stories: item.articles,
      isBreaking: !item.collection && item.articles.some(storyIsBreaking),
      collection: item.collection,
      biasBreakdown: item.collection ? undefined : (item.articles[0] as any).biasBreakdown,
    };
  }
  return {
    id: item.id,
    topicLabel: item.headline,   // full headline — never a 3-word fragment
    subtitle: item.summary ?? '',
    stories: [item],
    isBreaking: storyIsBreaking(item),
  };
}

export default function FeedScreen({ isVisible = true }: { isVisible?: boolean }) {
  const { activeSources } = useSource();
  const {
    activeTopics, activeSubTopics, showSports, showEntertainment, topicInterests,
    showClusterSummary, showBiasDots, showMetaPill, showCardImages, cardDensity,
    defaultTopic, pullToRefresh, hiddenTopics,
    summaryLength, keyPointsCount, eli5Tone,
  } = useSettings();
  const { navigate } = useRouter();
  const { reportScroll } = useTabBar();
  const isVisibleRef = useRef(isVisible);
  useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);
  useEffect(() => { try { trackVisit(); } catch {} }, []);
  const [followV, setFollowV] = useState(0);

  const [cardWidth, setCardWidth] = useState(() => Math.min(window.innerWidth - 28, 452));
  useEffect(() => {
    const update = () => setCardWidth(Math.min(window.innerWidth - 28, 452));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const [activeTopic, setActiveTopic] = useState<CategoryTopic>(() => {
    // Restore last topic if present, else fall back to the user's Customize
    // → defaultTopic preference (breaking by default).
    return (localStorage.getItem('@ireader_active_topic') as CategoryTopic) ?? defaultTopic;
  });
  const [allFeed, setAllFeed] = useState<ServerFeedItem[]>(() => feedCache.get(activeTopic)?.data ?? []);
  const [pendingFeed, setPendingFeed] = useState<ServerFeedItem[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(() => !feedCache.has(activeTopic));
  const [refreshing, setRefreshing] = useState(false);
  const [techSourceFilter, setTechSourceFilter] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTopicRef = useRef(activeTopic);
  const lastFetchRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstLoadDone = useRef(false);

  useEffect(() => { loadProfile(); }, []);

  // Restore scroll position on first load after mount — ONLY if it was saved
  // recently (i.e. you tapped an article and came straight back). On a fresh
  // open after a long time the saved position is stale, so we start at the top
  // instead of landing mid-feed.
  const SCROLL_RESTORE_MAX_AGE_MS = 30 * 60 * 1000; // 30 min
  useEffect(() => {
    if (loading || isFirstLoadDone.current) return;
    isFirstLoadDone.current = true;
    const saved = localStorage.getItem(`@ireader_scroll_${activeTopicRef.current}`);
    let offset = 0;
    if (saved) {
      try {
        const p = JSON.parse(saved) as { y?: number; at?: number };
        if (typeof p?.y === 'number' && typeof p?.at === 'number' && Date.now() - p.at < SCROLL_RESTORE_MAX_AGE_MS) offset = p.y;
      } catch { /* legacy plain-number value → ignore, start at top */ }
    }
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
    return isBlockedHeadline(headline, source, { allowSports: showSports, allowEntertainment: showEntertainment });
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
    setPendingFeed(null); setNewCount(0); setTechSourceFilter(new Set());
    // Clear any prior error when switching topics so a stale "Failed to load"
    // from a previous topic doesn't linger on a healthy one.
    setError(null);

    let cancelled = false;
    const cached = feedCache.get(activeTopic);
    if (cached) {
      setAllFeed(cached.data);
      setLoading(false);
      // Mark this as the last successful fetch so handleScroll's bg-refresh
      // trigger doesn't fire immediately (lastFetchRef stays at 0 otherwise,
      // making elapsed huge and forcing a refresh on every scroll-to-top).
      lastFetchRef.current = cached.ts;
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
    const save = () => { localStorage.setItem(`@ireader_scroll_${activeTopicRef.current}`, JSON.stringify({ y: scrollOffsetRef.current, at: Date.now() })); };
    window.addEventListener('beforeunload', save);
    return () => { save(); window.removeEventListener('beforeunload', save); };
  }, []);

  // Tapping Feed tab while already on Feed → scroll to top
  useEffect(() => {
    const scrollTop = () => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.addEventListener('feed-scroll-top', scrollTop);
    return () => window.removeEventListener('feed-scroll-top', scrollTop);
  }, []);

  // Customize → keyboard shortcuts: J/K scroll next/prev cluster.
  useEffect(() => {
    const STEP = 360;
    const next = () => containerRef.current?.scrollBy({ top: STEP, behavior: 'smooth' });
    const prev = () => containerRef.current?.scrollBy({ top: -STEP, behavior: 'smooth' });
    window.addEventListener('shortcut:next', next);
    window.addEventListener('shortcut:prev', prev);
    return () => {
      window.removeEventListener('shortcut:next', next);
      window.removeEventListener('shortcut:prev', prev);
    };
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

  // Pull-to-refresh
  const [pullProgress, setPullProgress] = useState(0);
  const touchStartYRef = useRef(0);
  const PULL_THRESHOLD = 80;
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!pullToRefresh || refreshing) return;
    if ((containerRef.current?.scrollTop ?? 1) > 0) return;
    touchStartYRef.current = e.touches[0].clientY;
  }, [pullToRefresh, refreshing]);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pullToRefresh || refreshing || touchStartYRef.current === 0) return;
    const dy = e.touches[0].clientY - touchStartYRef.current;
    setPullProgress(dy <= 0 ? 0 : Math.min(1, dy / PULL_THRESHOLD));
  }, [pullToRefresh, refreshing]);
  const onTouchEnd = useCallback(() => {
    if (!pullToRefresh) return;
    const prog = pullProgress;
    touchStartYRef.current = 0;
    setPullProgress(0);
    if (prog >= 1) onRefresh();
  }, [pullToRefresh, pullProgress, onRefresh]);

  const applyPending = useCallback(() => {
    if (!pendingFeed) return;
    setAllFeed(pendingFeed);
    feedCache.set(activeTopic, { data: pendingFeed, ts: Date.now() });
    setPendingFeed(null); setNewCount(0);
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pendingFeed, activeTopic]);

  // Pre-warm AI summaries for top 10 articles (Gemini free tier: 10 req/min —
  // bigger prewarms starve live taps and trip provider breakers)
  const prewarmQueuedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (allFeed.length === 0) return;
    // Must match ArticleScreen's lengthMap exactly — mismatched maxWords made
    // every prewarm a cache miss (client AND server key include maxWords).
    const lengthMap: Record<string, number> = { short: 200, medium: 350, long: 550 };
    const maxWords = lengthMap[summaryLength] ?? 250;
    const API = 'https://ireader.onrender.com/api/news';
    const targets = rankedClusters.slice(0, 10).flatMap(c => {
      const story = c.stories[0];
      if (!story) return [];
      const url = story.sources?.[0]?.url ?? '';
      if (!url) return [];
      const id = story.id;
      const cacheKey = `summary_v5_${id ?? url}_summary_${maxWords}_${keyPointsCount}_${eli5Tone}`;
      if (getCached(cacheKey, TTL.AI_SUMMARY) || prewarmQueuedRef.current.has(cacheKey)) return [];
      return [{ url, cacheKey, publishedAt: story.publishedAt }];
    });
    if (targets.length === 0) return;
    let cancelled = false;
    // 3 parallel workers (server caps at 4 concurrent generations — leave one
    // slot for a user's live tap). Ranked order, so the articles most likely
    // to be opened warm first. ~40 articles in ~30-45s vs 2+ min serial.
    const timer = setTimeout(() => {
      let next = 0;
      const worker = async () => {
        while (!cancelled) {
          const idx = next++;
          if (idx >= targets.length) return;
          const { url, cacheKey, publishedAt } = targets[idx];
          prewarmQueuedRef.current.add(cacheKey);
          try {
            const articleRes = await fetch(`${API}/article?url=${encodeURIComponent(url)}`);
            if (!articleRes.ok || cancelled) continue; // one bad article ≠ dead queue
            const articleData = await articleRes.json() as { paragraphs?: string[] };
            const paragraphs = (articleData.paragraphs ?? []).slice(0, 15);
            if (paragraphs.length < 2) continue;
            const summaryRes = await fetch(`${API}/ai-summary`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url, paragraphs, type: 'summary', maxWords, keyPoints: keyPointsCount, eli5Tone, publishedAt, background: true }),
            });
            if (cancelled) return;
            if (summaryRes.ok) { setCached(cacheKey, await summaryRes.json()); continue; }
            // Server shedding load (503 breaker/busy) — back off, don't hammer
            if (summaryRes.status === 503) await new Promise(r => setTimeout(r, 10_000));
          } catch { /* ignore individual failures */ }
          // Brief pause after any failure path so error storms stay gentle
          if (!cancelled) await new Promise(r => setTimeout(r, 1500));
        }
      };
      for (let w = 0; w < 1; w++) void worker();
    }, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFeed]);

  const filteredFeed = useMemo(
    () => filterFeedItems(allFeed, activeTopic),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFeed, activeSources, activeTopic, activeSubTopics, showSports, showEntertainment],
  );

  const visibleStories = useMemo(() => feedToStories(filteredFeed), [filteredFeed]);

  const storyClusters = useMemo((): StoryCluster[] => {
    return filteredFeed.flatMap(item => {
      const cluster = serverItemToCluster(item);
      if (!cluster) return [];
      if (activeTopic === 'breaking') {
        return [{ ...cluster, isBreaking: true, stories: cluster.stories.map(s => ({ ...s, isBreaking: true })) }];
      }
      return [cluster];
    });
  }, [filteredFeed, activeTopic]);

  const filteredClusters = useMemo(() => {
    if (activeTopic !== 'technology' || techSourceFilter.size === 0) return storyClusters;
    return storyClusters
      .map(c => ({
        ...c,
        stories: c.stories.filter(s => techSourceFilter.has(s.sources?.[0]?.name ?? '')),
      }))
      .filter(c => c.stories.length > 0);
  }, [storyClusters, activeTopic, techSourceFilter]);

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
      const proxiesWithInterest = proxies.map(p => ({
        ...p,
        _interestBonus: scoreClusterInterest(
          filteredClusters[p._i].topicLabel ?? '',
          filteredClusters[p._i].subtitle ?? '',
          topicInterests,
        ),
      }));
      // Caps removed by request — return every ranked cluster, no per-category
      // diversity cap.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (rankStories(proxiesWithInterest as any) as any[]).map((p: any) => filteredClusters[p._i]);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rankStoriesStandard(proxies as any) as any[]).map((p: any) => filteredClusters[p._i]);
  }, [filteredClusters, activeTopic, topicInterests]);



  const visibleCategories = useMemo(
    // Customize → hiddenTopics overlays the existing activeTopics gate.
    () => CATEGORIES.filter(c =>
      !hiddenTopics.includes(c.topic)
      && (c.topic === 'myspace' || activeTopics[c.topic as keyof typeof activeTopics] !== false)
    ),
    [activeTopics],
  );
  return (
    <div ref={containerRef} onScroll={handleScroll}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', background: '#000', WebkitOverflowScrolling: 'touch' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}>
        <img src="/icons/header-logo.png" alt="iReader" style={{ width: 82, height: 82, objectFit: 'contain', background: 'transparent', margin: '-12px -8px -12px -8px' }} />
        <div>
          <div style={{ color: '#fff', fontSize: 26, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 }}>{greeting()}</div>
          <div style={{ color: '#444', fontSize: 12, fontWeight: 500, marginTop: 3 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Pull-to-refresh / refreshing indicator — inline, no text, no overlap */}
      {(refreshing || pullProgress > 0.1) && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          height: 28,
          opacity: refreshing ? 1 : pullProgress,
          transition: refreshing ? 'opacity 0.15s' : 'none',
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.08)',
            borderTop: `2px solid ${pullProgress >= 1 && !refreshing ? '#fff' : 'rgba(255,255,255,0.45)'}`,
            animation: refreshing ? 'spin 0.7s linear infinite' : 'none',
            transform: refreshing ? undefined : `rotate(${pullProgress * 360}deg)`,
          }} />
        </div>
      )}

      {/* Category tabs + optional filter toggle */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: filterOpen && activeTopic === 'technology' ? 0 : 8 }}>
        <div style={{ flex: 1, display: 'flex', overflowX: 'auto', padding: '0 16px', gap: 7, scrollbarWidth: 'none', height: 44, alignItems: 'center' }}>
          {visibleCategories.map(cat => {
            const active = cat.topic === activeTopic;
            return (
              <button
                key={cat.topic}
                onClick={() => { if (cat.topic === activeTopic) { onRefresh(); containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); } else { containerRef.current?.scrollTo({ top: 0, behavior: 'auto' }); setActiveTopic(cat.topic); setFilterOpen(false); } }}
                style={{
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: active ? '#fff' : 'rgba(255,255,255,0.06)',
                  border: active ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                <CategoryIcon name={cat.icon as CategoryIconName} active={active} />
                <span style={{ color: active ? '#000' : '#aaa', fontSize: 12.5, fontWeight: 700, letterSpacing: 0.1 }}>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filter toggle — only on Tech tab */}
        {activeTopic === 'technology' && techSources.length > 0 && (
          <button
            onClick={() => setFilterOpen(v => !v)}
            style={{
              flexShrink: 0, marginRight: 14, position: 'relative',
              width: 32, height: 32, borderRadius: '50%',
              background: filterOpen || techSourceFilter.size > 0 ? 'rgba(74,144,217,0.18)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${filterOpen || techSourceFilter.size > 0 ? '#4A90D9' : 'rgba(255,255,255,0.12)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={filterOpen || techSourceFilter.size > 0 ? '#4A90D9' : '#888'} strokeWidth="2.5">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            {techSourceFilter.size > 0 && (
              <div style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: '#4A90D9', border: '1.5px solid #0a0a0f' }} />
            )}
          </button>
        )}
      </div>

      {/* Tech source filter bar — collapsible, icon-only */}
      {activeTopic === 'technology' && techSources.length > 0 && filterOpen && (
        <div style={{ display: 'flex', overflowX: 'auto', padding: '6px 16px 10px', gap: 10, scrollbarWidth: 'none', alignItems: 'center' }}>
          {/* All */}
          <button onClick={() => setTechSourceFilter(new Set())} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: techSourceFilter.size === 0 ? 'rgba(74,144,217,0.15)' : 'rgba(255,255,255,0.07)', border: `2px solid ${techSourceFilter.size === 0 ? '#4A90D9' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={techSourceFilter.size === 0 ? '#4A90D9' : '#666'} strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
          {techSources.map(src => {
            const active = techSourceFilter.has(src.name);
            return (
              <button key={src.name} onClick={() => setTechSourceFilter(prev => { const next = new Set(prev); if (next.has(src.name)) next.delete(src.name); else next.add(src.name); return next; })}
                style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: active ? 'rgba(74,144,217,0.15)' : 'rgba(255,255,255,0.07)', border: `2px solid ${active ? '#4A90D9' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                <img src={src.favicon} alt={src.name} style={{ width: 20, height: 20, borderRadius: 5 }} />
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
          {activeTopic === 'myspace' && (() => {
            const followed = annotateUpdates(rankedClusters.map(c => ({ id: c.id, headline: c.topicLabel })));
            void followV;
            if (followed.length === 0) return null;
            return (
              <div style={{ padding: '4px 16px 14px' }}>
                <div style={{ color: '#666', fontSize: 11, fontWeight: 800, letterSpacing: 1.4, marginBottom: 10 }}>FOLLOWING</div>
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                  {followed.map(f => {
                    const target = rankedClusters.find(c => c.id === (f.latestId ?? f.id));
                    return (
                      <div key={f.id} style={{
                        flexShrink: 0, width: 200, padding: '10px 12px', borderRadius: 14,
                        background: f.hasUpdate ? 'rgba(185,148,255,0.12)' : '#0E0E0E',
                        border: `1px solid ${f.hasUpdate ? 'rgba(185,148,255,0.4)' : '#1A1A1A'}`,
                        cursor: target ? 'pointer' : 'default', position: 'relative',
                      }}
                        onClick={() => {
                          if (!target) return;
                          markSeen(f.id, target.id, target.topicLabel);
                          navigate({ name: 'StoryTimeline', params: { clusterId: target.id, headline: target.topicLabel, stories: JSON.stringify(target.stories) } });
                        }}>
                        {f.hasUpdate && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 800, color: '#b994ff', background: 'rgba(185,148,255,0.2)', padding: '2px 6px', borderRadius: 8 }}>🆕 NEW</div>}
                        <div style={{ color: '#ddd', fontSize: 13, fontWeight: 600, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: f.hasUpdate ? 44 : 0 }}>
                          {f.hasUpdate && f.latestHeadline ? f.latestHeadline : f.headline}
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); unfollow(f.id); setFollowV(v => v + 1); }}
                          style={{ marginTop: 8, color: '#666', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-block' }}>
                          Unfollow
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {activeTopic === 'myspace' ? (() => {
            const groups = new Map<string, StoryCluster[]>();
            const catOrder: string[] = [];
            for (const c of rankedClusters) {
              const cat = c._category ?? 'other';
              if (!groups.has(cat)) { groups.set(cat, []); catOrder.push(cat); }
              groups.get(cat)!.push(c);
            }
            return catOrder.map(cat => (
              <MyspaceTopicZone key={cat} clusters={groups.get(cat)!} category={cat} cardWidth={cardWidth} allStories={visibleStories} />
            ));
          })() : rankedClusters.map(cluster => (
            <ClusterSection key={cluster.id} cluster={cluster} soloCardWidth={cardWidth} allStories={visibleStories} />
          ))}
          <div style={{ height: 40 }} />
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes livepulse { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }
        .live-dot { animation: livepulse 1.2s ease-in-out infinite; }`}</style>
    </div>
  );
}
