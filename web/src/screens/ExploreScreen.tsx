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

interface CrossEntity {
  entity: string;
  topics: string[];
  count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENTITY_SKIP = new Set([
  // articles / prepositions / conjunctions
  'The','This','That','In','On','At','To','For','Of','And','Or','But','As','Is','Are',
  'Was','Were','Be','Been','By','From','With','It','Its','A','An','He','She','We',
  'They','You','I','My','His','Her','Their','Our','Your','New','Now','No','Not',
  'All','Some','Just','More','Most','After','Before','Over','Under','Since','When',
  'Where','How','Why','What','Who','Which','Here','There','Then','Than','If','So',
  // news meta
  'Says','Said','Report','Reports','Sources','Source','Live','Latest','Breaking',
  // months (common false-positive entities)
  'January','February','March','April','May','June','July','August','September',
  'October','November','December','Jan','Feb','Mar','Apr','Jun','Jul','Aug','Sep',
  'Oct','Nov','Dec',
  // days
  'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
  // too-generic country/demonym
  'India','Indian','Pakistan','Pakistani','China','Chinese','Russia','Russian',
  'American','British','European','Asian',
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

const TOPIC_LABELS: Record<string, string> = {
  'breaking': 'Breaking',
  'india-politics': 'India',
  'technology': 'Tech',
  'geopolitics': 'World',
  'markets': 'Markets',
  'business': 'Business',
};

// Subtle tile accent colors — cycled by entity index
const TILE_ACCENTS = [
  { color: '#FF453A', bg: 'rgba(255,69,58,0.10)'   },
  { color: '#0A84FF', bg: 'rgba(10,132,255,0.10)'  },
  { color: '#FF9F0A', bg: 'rgba(255,159,10,0.10)'  },
  { color: '#30D158', bg: 'rgba(48,209,88,0.10)'   },
  { color: '#64D2FF', bg: 'rgba(100,210,255,0.10)' },
  { color: '#BF5AF2', bg: 'rgba(191,90,242,0.10)'  },
  { color: '#FF6B9D', bg: 'rgba(255,107,157,0.10)' },
];

// ── Topic config ─────────────────────────────────────────────────────────────

const TOPICS = [
  { label: 'Breaking',  color: '#FF453A', bg: 'rgba(255,69,58,0.15)',   tag: 'breaking',       icon: 'breaking'  },
  { label: 'Tech',      color: '#0A84FF', bg: 'rgba(10,132,255,0.15)',  tag: 'technology',     icon: 'tech'      },
  { label: 'India',     color: '#FF9F0A', bg: 'rgba(255,159,10,0.15)',  tag: 'india-politics', icon: 'india'     },
  { label: 'World',     color: '#30D158', bg: 'rgba(48,209,88,0.15)',   tag: 'geopolitics',    icon: 'world'     },
  { label: 'Markets',   color: '#64D2FF', bg: 'rgba(100,210,255,0.15)', tag: 'markets',        icon: 'markets'   },
  { label: 'Business',  color: '#BF5AF2', bg: 'rgba(191,90,242,0.15)', tag: 'business',       icon: 'business'  },
];

function TopicIcon({ icon, color, size = 18 }: { icon: string; color: string; size?: number }) {
  const s = { fill: 'none' as const, stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (icon === 'breaking') return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill={color} stroke="none">
      <path d="M315.27 33L96 304h128l-31.51 173.23a2.81 2.81 0 005 2.17L416 208H288l31.61-173.25a2.81 2.81 0 00-4.34-2.92z" />
    </svg>
  );
  if (icon === 'tech') return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
  if (icon === 'india') return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  );
  if (icon === 'world') return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
  if (icon === 'markets') return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <span style={{ color: '#4A90D9', fontSize: 11, fontWeight: 700 }}>●</span>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: '#666', textTransform: 'uppercase' }}>{text}</span>
    </div>
  );
}

function IconSearch({ size = 16, color = '#444' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ── Search Result Card ────────────────────────────────────────────────────────

function ResultCard({ item, onOpen }: { item: FeedItem; onOpen: (item: FeedItem) => void }) {
  const label = item.clusterLabel || item.headline || item.articles?.[0]?.headline || '';
  const primaryArticle = item.articles?.[0];
  const imgUrl = item.imageUrl || primaryArticle?.imageUrl;
  const sourceName = item.sources?.[0]?.name || primaryArticle?.sources?.[0]?.name || '';
  const sourceCount = item.sourceCount ?? item.sources?.length ?? item.articles?.length ?? 0;
  const accentColor = getArticleColor(label);

  return (
    <div
      onClick={() => onOpen(item)}
      style={{
        background: '#0E0E0E', border: '1px solid #1A1A1A', borderRadius: 12,
        overflow: 'hidden', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ width: '100%', height: 80, background: imgUrl ? undefined : accentColor, position: 'relative', flexShrink: 0 }}>
        {imgUrl && (
          <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; if (el.parentElement) el.parentElement.style.background = accentColor; }} />
        )}
        {sourceCount > 1 && (
          <div style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.75)', borderRadius: 99, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#fff' }}>
            {sourceCount} sources
          </div>
        )}
      </div>
      <div style={{ padding: '7px 10px 9px' }}>
        <div style={{ fontSize: 9.5, color: '#555', fontWeight: 600, marginBottom: 4 }}>{sourceName}</div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#eee', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {label}
        </p>
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { navigate, setTab } = useRouter();
  const { show: showTabBar } = useTabBar();

  // Cross-topic trending entities
  const [crossEntities, setCrossEntities] = useState<CrossEntity[]>([]);
  // People & Places entities from breaking feed
  const [entities, setEntities] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Search
  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FeedItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { showTabBar(); }, [showTabBar]);

  // Load cross-topic entities — the core differentiator
  useEffect(() => {
    let cancelled = false;
    const CROSS_TOPICS = ['breaking', 'india-politics', 'technology', 'geopolitics', 'markets', 'business'];

    Promise.allSettled(
      CROSS_TOPICS.map(t =>
        fetch(`${API_BASE}/feed?topic=${t}`)
          .then(r => r.json())
          .then((d: any) => ({ topic: t, items: (d?.feed ?? []) as FeedItem[] }))
      )
    ).then(results => {
      if (cancelled) return;

      // Extract entities per topic
      const entityTopics = new Map<string, Set<string>>();
      const allHeadlines: string[] = [];

      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { topic, items } = r.value;
        const headlines = items
          .map((it: FeedItem) => it.clusterLabel || it.headline || it.articles?.[0]?.headline || '')
          .filter(Boolean);
        allHeadlines.push(...headlines);
        const topicEntities = extractEntities(headlines).slice(0, 20);
        for (const entity of topicEntities) {
          if (!entityTopics.has(entity)) entityTopics.set(entity, new Set());
          entityTopics.get(entity)!.add(topic);
        }
      }

      // Entities in 2+ topics = genuinely cross-cutting
      const cross: CrossEntity[] = [...entityTopics.entries()]
        .filter(([, topics]) => topics.size >= 2)
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 14)
        .map(([entity, topics]) => ({ entity, topics: [...topics], count: topics.size }));

      // People & Places from all headlines (single-topic entities)
      const allEntities = extractEntities(allHeadlines).slice(0, 12);

      setCrossEntities(cross);
      setEntities(allEntities);
      setDataLoading(false);
    }).catch(() => { if (!cancelled) setDataLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // Shared search logic
  const doSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    setSearchLoading(true);
    setSearchResults([]);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
          const text = [item.clusterLabel, item.headline, item.summary,
            ...(item.articles ?? []).map(a => a.headline)].join(' ').toLowerCase();
          if (text.includes(kw)) all.push(item);
        }
      }
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
  }, []);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    if (!q) { setSearchQuery(''); setSearchResults([]); return; }
    await doSearch(q);
  }, [searchText, doSearch]);

  const triggerSearch = useCallback(async (term: string) => {
    setSearchText(term);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    await doSearch(term);
  }, [doSearch]);

  // Navigation
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

  const openTopic = useCallback((tag: string) => {
    navigate({ name: 'TopicFeed', params: { tag } });
  }, [navigate]);

  return (
    <div
      ref={scrollRef}
      style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', background: '#080808', WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{
        paddingLeft: 'max(16px, env(safe-area-inset-left, 16px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 16px))',
        paddingBottom: 110,
        maxWidth: 480, margin: '0 auto', boxSizing: 'border-box',
      }}>

        {/* Header + Search */}
        <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: 16 }}>
          <h1 style={{ margin: '0 0 14px', fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>Explore</h1>
          <form onSubmit={handleSearch}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#111', border: '1px solid #1E1E1E',
              borderRadius: 12, padding: '10px 14px',
            }}>
              <IconSearch size={15} color="#444" />
              <input
                type="text"
                placeholder="Search any topic, person, event…"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                autoCorrect="off" autoCapitalize="none" spellCheck={false} autoComplete="off"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 14, color: '#ccc', caretColor: '#4A90D9' }}
              />
              {searchText.length > 0 && (
                <button type="button"
                  onClick={() => { setSearchText(''); setSearchQuery(''); setSearchResults([]); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 18, lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}>×</button>
              )}
            </div>
          </form>
        </div>

        {/* Search Results */}
        {searchQuery !== '' && (
          <div style={{ marginBottom: 32 }}>
            <SectionLabel text={`Results for "${searchQuery}"`} />
            {searchLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ height: 160, borderRadius: 12, background: '#141414', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)', animation: 'shimmer 1.4s infinite' }} />
                    <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
                  </div>
                ))}
              </div>
            ) : searchResults.length === 0 ? (
              <p style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No results for "{searchQuery}"</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {searchResults.map((item, i) => (
                  <ResultCard key={i} item={item} onOpen={openArticle} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ① Trending Across Topics — 2-col colored tiles */}
        {(dataLoading || crossEntities.length > 0) && searchQuery === '' && (
          <div style={{ marginBottom: 28 }}>
            <SectionLabel text="Trending Across Topics" />
            {dataLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ height: 80, borderRadius: 14, background: '#141414', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)', animation: 'shimmer 1.4s infinite' }} />
                    <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {crossEntities.map((ce, i) => {
                  const accent = TILE_ACCENTS[i % TILE_ACCENTS.length];
                  return (
                    <button
                      key={i}
                      onClick={() => triggerSearch(ce.entity)}
                      style={{
                        background: accent.bg,
                        border: `1px solid ${accent.color}22`,
                        borderRadius: 14, padding: '12px 14px',
                        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                        textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#eee', lineHeight: 1.2 }}>{ce.entity}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {ce.topics.slice(0, 3).map(t => (
                          <span key={t} style={{
                            fontSize: 9, fontWeight: 700, color: accent.color,
                            background: `${accent.color}18`, borderRadius: 4,
                            padding: '2px 6px', whiteSpace: 'nowrap',
                          }}>
                            {TOPIC_LABELS[t] ?? t}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ② Browse Topics */}
        {searchQuery === '' && (
          <div style={{ marginBottom: 28 }}>
            <SectionLabel text="Browse Topics" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {TOPICS.map(t => (
                <button
                  key={t.tag}
                  onClick={() => openTopic(t.tag)}
                  style={{
                    background: '#0E0E0E', border: '1px solid #1A1A1A',
                    borderRadius: 14, height: 64,
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '0 14px', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent', textAlign: 'left',
                  }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <TopicIcon icon={t.icon} color={t.color} size={18} />
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#eee' }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ③ People & Places */}
        {entities.length > 0 && searchQuery === '' && (
          <div style={{ marginBottom: 28 }}>
            <SectionLabel text="People & Places" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {entities.slice(0, 8).map((entity, i) => (
                <button
                  key={i}
                  onClick={() => triggerSearch(entity)}
                  style={{
                    background: '#0E0E0E', border: '1px solid #1E1E1E',
                    borderRadius: 10, height: 56,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 14px', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>{entity}</span>
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
