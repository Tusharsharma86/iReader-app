import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Story } from '../types';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';
import { getArticleColor } from '../utils/colors';
import { trackArticleOpen } from '../utils/personalization';

const API_BASE = 'https://ireader.onrender.com/api/news';

// ── Types ────────────────────────────────────────────────────────────────────

interface FeedItem {
  type?: string;
  headline?: string;
  clusterLabel?: string;
  summary?: string;
  imageUrl?: string;
  publishedAt?: string;
  articles?: Story[];
  sources?: { name: string; url: string; imageUrl?: string; publishedAt?: string }[];
  sourceCount?: number;
}

interface Question {
  text: string;
  accent: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const ENTITY_SKIP = new Set([
  'The','This','That','In','On','At','To','For','Of','And','Or','But','As','Is','Are',
  'Was','Were','Be','Been','By','From','With','It','Its','A','An','He','She','We',
  'They','You','I','My','His','Her','Their','Our','Your','Its','New','Now','No','Not',
  'All','Some','Just','More','Most','After','Before','Over','Under','Since','When',
  'Where','How','Why','What','Who','Which','Here','There','Then','Than','If','So',
]);

function extractEntities(headlines: string[]): string[] {
  const counts = new Map<string, number>();
  const capWordRe = /\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})*)\b/g;
  for (const h of headlines) {
    let m: RegExpExecArray | null;
    while ((m = capWordRe.exec(h)) !== null) {
      const entity = m[1].trim();
      if (entity.split(' ').length > 3) continue;
      if (ENTITY_SKIP.has(entity)) continue;
      if (entity.length < 3) continue;
      counts.set(entity, (counts.get(entity) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([e]) => e)
    .slice(0, 30);
}

// ── Topic Universes config ───────────────────────────────────────────────────

const TOPICS = [
  { label: 'Breaking', emoji: '🔴', color: '#FF3B30', tag: 'breaking' },
  { label: 'Tech',     emoji: '💻', color: '#0A84FF', tag: 'technology' },
  { label: 'India',    emoji: '🇮🇳', color: '#FF9F0A', tag: 'india-politics' },
  { label: 'World',    emoji: '🌍', color: '#30D158', tag: 'geopolitics' },
  { label: 'Markets',  emoji: '📈', color: '#64D2FF', tag: 'markets' },
  { label: 'Business', emoji: '💼', color: '#BF5AF2', tag: 'business' },
];

// ── SVG icons ────────────────────────────────────────────────────────────────

function IconRead({ size = 16, color = '#999' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconTimeline({ size = 16, color = '#999' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconDeepDive({ size = 16, color = '#999' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function IconSearch({ size = 18, color = '#555' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
      <span style={{ color: '#4A90D9', fontSize: 11, fontWeight: 700 }}>●</span>
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
        color: '#888', textTransform: 'uppercase',
      }}>{text}</span>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard({ width = 260, height = 140 }: { width?: number; height?: number }) {
  return (
    <div style={{
      width, height, borderRadius: 14, background: '#141414',
      flexShrink: 0, overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
        animation: 'shimmer 1.4s infinite',
      }} />
      <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
    </div>
  );
}

// ── Question Card ─────────────────────────────────────────────────────────────

const Q_GRADIENTS = [
  'linear-gradient(135deg, #1a0d3d 0%, #0d1a3d 100%)',
  'linear-gradient(135deg, #0d2240 0%, #0d3a2a 100%)',
  'linear-gradient(135deg, #1a1a0d 0%, #2a0d1a 100%)',
  'linear-gradient(135deg, #0d1a2a 0%, #1a0d2a 100%)',
  'linear-gradient(135deg, #2a0d0d 0%, #1a1a0d 100%)',
];

interface QuestionCardProps {
  q: Question;
  index: number;
  expanded: boolean;
  onTap: () => void;
  answer: string | null;
  loading: boolean;
}

function QuestionCard({ q, index, expanded, onTap, answer, loading }: QuestionCardProps) {
  return (
    <div
      onClick={onTap}
      style={{
        width: 260,
        minHeight: expanded ? 'auto' : 140,
        maxHeight: expanded ? 320 : 140,
        borderRadius: 14,
        background: Q_GRADIENTS[index % Q_GRADIENTS.length],
        border: `1px solid ${q.accent}30`,
        flexShrink: 0,
        padding: '16px 14px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        transition: 'max-height 0.3s ease, min-height 0.3s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: q.accent, marginBottom: 10,
        }} />
        <p style={{
          margin: 0, fontSize: 13.5, fontWeight: 700, color: '#fff',
          lineHeight: 1.45,
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 99 : 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{q.text}</p>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                border: `2px solid ${q.accent}40`, borderTop: `2px solid ${q.accent}`,
                animation: 'spin 0.7s linear infinite',
              }} />
              <span style={{ fontSize: 12, color: '#888' }}>Thinking…</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <p style={{
              margin: 0, fontSize: 12.5, color: '#ccc', lineHeight: 1.55,
              borderTop: `1px solid ${q.accent}25`, paddingTop: 10,
            }}>{answer ?? 'No answer available.'}</p>
          )}
        </div>
      )}
      {!expanded && (
        <span style={{ fontSize: 10.5, color: '#555', marginTop: 8 }}>tap to explore</span>
      )}
    </div>
  );
}

// ── Story Motion Card (2-col grid) ───────────────────────────────────────────

interface StoryMotionCardProps {
  item: FeedItem;
  onOpenArticle: (item: FeedItem) => void;
  onOpenTimeline: (item: FeedItem) => void;
  onOpenDeepDive: (item: FeedItem) => void;
}

function StoryMotionCard({ item, onOpenArticle, onOpenTimeline, onOpenDeepDive }: StoryMotionCardProps) {
  const label = item.clusterLabel || item.headline || item.articles?.[0]?.headline || '';
  const primaryArticle = item.articles?.[0];
  const imgUrl = item.imageUrl || primaryArticle?.imageUrl;
  const publishedAt = item.publishedAt || primaryArticle?.publishedAt || '';
  const sourceName = item.sources?.[0]?.name || primaryArticle?.sources?.[0]?.name || '';
  const sourceCount = item.sourceCount ?? item.sources?.length ?? item.articles?.length ?? 0;
  const accentColor = getArticleColor(label);

  return (
    <div
      onClick={() => onOpenArticle(item)}
      style={{
        background: '#0E0E0E',
        border: '1px solid #1A1A1A',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Image or gradient placeholder */}
      <div style={{
        width: '100%', height: 90,
        background: imgUrl ? undefined : accentColor,
        position: 'relative', flexShrink: 0,
      }}>
        {imgUrl ? (
          <img
            src={imgUrl} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              el.style.display = 'none';
              if (el.parentElement) el.parentElement.style.background = accentColor;
            }}
          />
        ) : null}
        {/* Source count badge */}
        {sourceCount > 1 && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            background: 'rgba(0,0,0,0.75)', borderRadius: 99,
            padding: '2px 6px',
            fontSize: 9.5, fontWeight: 700, color: '#fff',
          }}>{sourceCount} sources</div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '8px 10px 6px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Source + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: '#666', fontWeight: 600 }}>{sourceName}</span>
          {publishedAt && (
            <>
              <span style={{ color: '#333', fontSize: 10 }}>·</span>
              <span style={{ fontSize: 10, color: '#555' }}>{timeAgo(publishedAt)}</span>
            </>
          )}
        </div>

        {/* Headline */}
        <p style={{
          margin: 0, fontSize: 12.5, fontWeight: 700, color: '#eee',
          lineHeight: 1.4, flex: 1,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{label}</p>

        {/* Action strip */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 2,
            marginTop: 8, paddingTop: 6,
            borderTop: '1px solid #181818',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn
            icon={<IconRead size={13} color="#777" />}
            label="Read"
            onPress={() => onOpenArticle(item)}
          />
          {sourceCount >= 2 && (
            <ActionBtn
              icon={<IconTimeline size={13} color="#777" />}
              label="Timeline"
              onPress={() => onOpenTimeline(item)}
            />
          )}
          <ActionBtn
            icon={<IconDeepDive size={13} color="#777" />}
            label="Deep Dive"
            onPress={() => onOpenDeepDive(item)}
          />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '3px 6px', borderRadius: 6,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {icon}
      <span style={{ fontSize: 9.5, color: '#666', fontWeight: 600 }}>{label}</span>
    </button>
  );
}

// ── See It From ───────────────────────────────────────────────────────────────

function SeeItFrom({ items }: { items: FeedItem[] }) {
  // Pick the cluster with most sources
  const top = [...items].sort((a, b) => {
    const aCount = a.sourceCount ?? a.sources?.length ?? a.articles?.length ?? 0;
    const bCount = b.sourceCount ?? b.sources?.length ?? b.articles?.length ?? 0;
    return bCount - aCount;
  })[0];

  if (!top) return null;

  const sourceCount = top.sourceCount ?? top.sources?.length ?? top.articles?.length ?? 0;
  if (sourceCount < 2) return null;

  const topLabel = top.clusterLabel || top.headline || top.articles?.[0]?.headline || '';

  // Build perspective cards from articles
  const perspectives = (top.articles ?? []).slice(0, 4).map(a => ({
    source: a.sources?.[0]?.name ?? 'Unknown',
    headline: a.headline ?? '',
  }));

  if (perspectives.length < 2) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionLabel text="See It From" />
      <p style={{
        margin: '0 0 12px',
        fontSize: 12.5, color: '#666', fontWeight: 600, lineHeight: 1.4,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>{topLabel}</p>
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        paddingBottom: 4,
        msOverflowStyle: 'none', scrollbarWidth: 'none',
      }}>
        {perspectives.map((p, i) => (
          <div key={i} style={{
            minWidth: 200, maxWidth: 200,
            background: '#0E0E0E',
            border: '1px solid #1A1A1A',
            borderRadius: 10,
            padding: '10px 12px',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#4A90D9', display: 'block', marginBottom: 5 }}>
              {p.source}
            </span>
            <p style={{
              margin: 0, fontSize: 12, color: '#ccc', lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>{p.headline}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { navigate, setTab } = useRouter();
  const { show: showTabBar } = useTabBar();

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [qLoading, setQLoading] = useState(true);

  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [qAnswers, setQAnswers] = useState<Record<number, string | null>>({});
  const [qAnswerLoading, setQAnswerLoading] = useState<Record<number, boolean>>({});

  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FeedItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Show tab bar
  useEffect(() => {
    showTabBar();
  }, [showTabBar]);

  // Load feed (breaking) for Stories in Motion
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/feed?topic=breaking&limit=8`)
      .then(r => r.json())
      .then((d: any) => {
        if (cancelled) return;
        const items: FeedItem[] = [];
        const raw = d?.feed ?? d?.stories?.map((s: unknown) => ({ ...(s as object), type: 'article' })) ?? d?.clusters ?? d?.items ?? [];
        // Flatten — API may return story clusters or stories directly
        for (const item of raw) {
          if (item.articles?.length || item.headline || item.clusterLabel) {
            items.push(item);
          }
        }
        setFeedItems(items.slice(0, 4));
        // Extract entities
        const headlines: string[] = items.map((it: FeedItem) =>
          it.clusterLabel || it.headline || it.articles?.[0]?.headline || ''
        ).filter(Boolean);
        setEntities(extractEntities(headlines));
        setFeedLoading(false);
      })
      .catch(() => { if (!cancelled) setFeedLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Load questions
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/questions`)
      .then(r => r.json())
      .then((d: { questions?: Question[] }) => {
        if (cancelled) return;
        setQuestions(d.questions ?? []);
        setQLoading(false);
      })
      .catch(() => { if (!cancelled) setQLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Handle question tap → expand / collapse + fetch answer
  const handleQuestionTap = useCallback(async (index: number, q: Question) => {
    if (expandedQ === index) {
      setExpandedQ(null);
      return;
    }
    setExpandedQ(index);
    if (qAnswers[index] !== undefined) return; // already fetched
    setQAnswerLoading(prev => ({ ...prev, [index]: true }));
    try {
      const r = await fetch(`${API_BASE}/qa?q=${encodeURIComponent(q.text)}`);
      const d: { answer?: string } = await r.json();
      setQAnswers(prev => ({ ...prev, [index]: d.answer ?? null }));
    } catch {
      setQAnswers(prev => ({ ...prev, [index]: 'Unable to load answer.' }));
    } finally {
      setQAnswerLoading(prev => ({ ...prev, [index]: false }));
    }
  }, [expandedQ, qAnswers]);

  // Navigation helpers
  const openArticle = useCallback((item: FeedItem) => {
    const primary = item.articles?.[0];
    if (!primary) return;
    trackArticleOpen(primary);
    navigate({
      name: 'Article',
      params: {
        id: primary.id,
        url: primary.sources?.[0]?.url ?? '',
        image: primary.imageUrl ?? '',
        headline: primary.headline,
        summary: primary.summary ?? '',
        source: primary.sources?.[0]?.name ?? '',
        publishedAt: primary.publishedAt,
        dominantColor: getArticleColor(primary.headline),
        sources: JSON.stringify(primary.sources ?? []),
        allStories: JSON.stringify(item.articles ?? [primary]),
      },
    });
  }, [navigate]);

  const openTimeline = useCallback((item: FeedItem) => {
    const label = item.clusterLabel || item.headline || item.articles?.[0]?.headline || '';
    navigate({
      name: 'StoryTimeline',
      params: {
        clusterId: label.slice(0, 30),
        headline: label,
        stories: JSON.stringify(item.articles ?? []),
      },
    });
  }, [navigate]);

  const openDeepDive = useCallback((_item: FeedItem) => {
    setTab('aifeed');
  }, [setTab]);

  const openTopic = useCallback((tag: string) => {
    navigate({ name: 'TopicFeed', params: { tag } });
  }, [navigate]);

  // Search submit — fetch across all topics, filter client-side by keyword
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    if (!q) { setSearchQuery(''); setSearchResults([]); return; }
    setSearchQuery(q);
    setSearchLoading(true);
    setSearchResults([]);
    const kw = q.toLowerCase();
    try {
      const SEARCH_TOPICS = ['breaking', 'india-politics', 'technology', 'geopolitics', 'markets', 'business'];
      const results = await Promise.allSettled(
        SEARCH_TOPICS.map(t => fetch(`${API_BASE}/feed?topic=${t}`).then(r => r.json()))
      );
      const all: FeedItem[] = [];
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const items: FeedItem[] = r.value?.feed ?? [];
        for (const item of items) {
          const text = [
            item.clusterLabel, item.headline, item.summary,
            ...(item.articles ?? []).map(a => a.headline),
          ].join(' ').toLowerCase();
          if (text.includes(kw)) all.push(item);
        }
      }
      // Deduplicate by headline
      const seen = new Set<string>();
      const deduped = all.filter(it => {
        const key = (it.clusterLabel || it.headline || '').slice(0, 40);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      setSearchResults(deduped.slice(0, 20));
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchText]);

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%', overflowY: 'auto', background: '#080808',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{
        paddingTop: 0,
        paddingBottom: 100,
        paddingLeft: 'max(16px, env(safe-area-inset-left, 16px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 16px))',
        maxWidth: 480,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}>

        {/* ── Header ────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          paddingBottom: 12,
          minHeight: 72,
        }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            Explore
          </h1>
          <IconSearch size={20} color="#555" />
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} style={{ marginBottom: 24 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#111', border: '1px solid #1E1E1E',
            borderRadius: 10, padding: '10px 14px',
          }}>
            <IconSearch size={15} color="#444" />
            <input
              type="text"
              placeholder="Search topics, people, events…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 14, color: '#ccc', caretColor: '#4A90D9',
              }}
            />
            {searchText.length > 0 && (
              <button
                type="button"
                onClick={() => { setSearchText(''); setSearchQuery(''); setSearchResults([]); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#555', fontSize: 16, lineHeight: 1, padding: '0 2px',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >×</button>
            )}
          </div>
        </form>

        {/* ⓪ Search Results ──────────────────────────────────── */}
        {searchQuery !== '' && (
          <div style={{ marginBottom: 32 }}>
            <SectionLabel text={`Results for "${searchQuery}"`} />
            {searchLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ height: 180, borderRadius: 12, background: '#141414', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)', animation: 'shimmer 1.4s infinite' }} />
                  </div>
                ))}
              </div>
            ) : searchResults.length === 0 ? (
              <p style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                No results for "{searchQuery}"
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {searchResults.map((item, i) => (
                  <StoryMotionCard
                    key={i}
                    item={item}
                    onOpenArticle={openArticle}
                    onOpenTimeline={openTimeline}
                    onOpenDeepDive={openDeepDive}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ① Questions in the Air ───────────────────────────── */}
        {(qLoading || questions.length > 0) && (
          <div style={{ marginBottom: 32 }}>
            <SectionLabel text="Questions in the Air" />
            <div style={{
              display: 'flex', gap: 12, overflowX: 'auto',
              paddingBottom: 12,
              msOverflowStyle: 'none', scrollbarWidth: 'none',
            }}>
              <style>{`.hide-scroll::-webkit-scrollbar { display: none; }`}</style>
              {qLoading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : questions.map((q, i) => (
                <QuestionCard
                  key={i}
                  q={q}
                  index={i}
                  expanded={expandedQ === i}
                  onTap={() => handleQuestionTap(i, q)}
                  answer={qAnswers[i] ?? null}
                  loading={qAnswerLoading[i] ?? false}
                />
              ))}
            </div>
            {/* Pagination dots */}
            {!qLoading && questions.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 2 }}>
                {questions.slice(0, 5).map((_, i) => (
                  <div key={i} style={{
                    width: i === 0 ? 14 : 5, height: 5,
                    borderRadius: 99, transition: 'width 0.2s',
                    background: i === 0 ? '#4A90D9' : '#2A2A2A',
                  }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ② Stories in Motion ──────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel text="Stories in Motion" />
          {feedLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ height: 180, borderRadius: 12, background: '#141414', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)', animation: 'shimmer 1.4s infinite' }} />
                </div>
              ))}
            </div>
          ) : feedItems.length === 0 ? (
            <p style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              No stories loaded.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {feedItems.map((item, i) => (
                <StoryMotionCard
                  key={i}
                  item={item}
                  onOpenArticle={openArticle}
                  onOpenTimeline={openTimeline}
                  onOpenDeepDive={openDeepDive}
                />
              ))}
            </div>
          )}
        </div>

        {/* ③ See It From ────────────────────────────────────── */}
        {!feedLoading && feedItems.length > 0 && (
          <SeeItFrom items={feedItems} />
        )}

        {/* ④ People & Places ─────────────────────────────────── */}
        {entities.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <SectionLabel text="People & Places" />
            <div style={{
              display: 'flex', gap: 8, overflowX: 'auto',
              paddingBottom: 4,
              msOverflowStyle: 'none', scrollbarWidth: 'none',
            }}>
              {entities.map((entity, i) => (
                <button
                  key={i}
                  onClick={() => openTopic(entity)}
                  style={{
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 99,
                    padding: '6px 12px',
                    fontSize: 12.5, color: '#999', fontWeight: 600,
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entity}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ⑤ Topic Universes ────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel text="Topic Universes" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {TOPICS.map((t) => (
              <button
                key={t.tag}
                onClick={() => openTopic(t.tag)}
                style={{
                  background: '#0E0E0E',
                  border: `1px solid ${t.color}30`,
                  borderLeft: `4px solid ${t.color}`,
                  borderRadius: 10,
                  height: 72,
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0 14px',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20 }}>{t.emoji}</span>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: '#eee' }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer space for tab bar */}
        <div style={{ height: 100 }} />
      </div>
    </div>
  );
}
