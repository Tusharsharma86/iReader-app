import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Story } from '../types';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';
import { darken, lighten, getArticleColor } from '../utils/colors';
import { trackArticleOpen } from '../utils/personalization';
import { isBlockedHeadline, sourceQualityWeight } from '../utils/contentFilters';

const FEED_API = 'https://ireader.onrender.com/api/news/feed';
const AI_SUMMARY_API = 'https://ireader.onrender.com/api/news/ai-summary';
const SNAPSHOT_KEY_PREFIX = '@digest_snapshot_';
const YESTERDAY_KEY = '@digest_yesterday_v1';

interface ApiItem {
  type?: string;
  topicTitle?: string;
  topicSummary?: string;
  articles?: Story[];
}

interface CategorySection {
  key: string;
  label: string;
  emoji: string;
  oneLiner: string;
  stories: Story[];
}

interface NumberCallout {
  value: string;
  label: string;
}

interface Snapshot {
  date: string;
  generatedAt: number;
  hero: { story: Story; bullets: string[] } | null;
  sections: CategorySection[];
  numbers: NumberCallout[];
  totalStories: number;
  totalSources: number;
  estimatedReadMin: number;
}

const CATEGORY_DEFS: Array<{ key: string; label: string; emoji: string; topic: string }> = [
  { key: 'breaking', label: 'Breaking', emoji: '🔴', topic: 'breaking' },
  { key: 'india',    label: 'India',    emoji: '🇮🇳', topic: 'india-politics' },
  { key: 'world',    label: 'World',    emoji: '🌍', topic: 'geopolitics' },
  { key: 'markets',  label: 'Markets',  emoji: '📈', topic: 'markets' },
  { key: 'tech',     label: 'Tech',     emoji: '💻', topic: 'technology' },
  { key: 'business', label: 'Business', emoji: '💼', topic: 'business' },
];

const NUMBER_RE = /(?:Rs\.?\s*|₹|\$)?[\d,]+(?:\.\d+)?\s*(?:%|million|billion|crore|lakh|trillion|°C|°F|km|kg|MW|GW|deaths|injured|killed|people|years|days|hours|points|stocks|jobs|votes|seats)/gi;

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function dateLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function wordCount(s: string) {
  return (s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

function flatten(items: ApiItem[]): Story[] {
  return items.flatMap(it => (it.type === 'cluster' ? (it.articles ?? []) : [it as unknown as Story]));
}

function extractNumber(text: string): string | null {
  const m = text.match(NUMBER_RE);
  if (!m) return null;
  return m[0].trim().replace(/^Rs\.?\s*/i, '₹').slice(0, 24);
}

// The server's own feed order is recency/velocity-heavy (~75% weight, see
// buildMixedFeed in news.ts) — right for a live scrolling feed, wrong for a
// "what actually mattered today" briefing: a product/sale post picked up by
// one blog an hour ago can outrank a story three major outlets ran this
// morning. Digest re-ranks the same pool client-side toward corroboration
// (how many distinct outlets covered it) the way an editors'-picks briefing
// (Apple News Today, Google News top stories) would, keeps a 48h window
// instead of a few hours, and drops the promotional/deal/benchmark content
// FeedScreen already filters out but Digest never did.
//
// Source quality is the third factor (user-reported: TechCrunch's coverage
// is consistently better than aggregator/consumer-gadget blogs, but they
// carried equal weight). Corroboration still dominates — a story three
// outlets ran matters more than who broke it — but among stories with EQUAL
// corroboration (the common case: most tech scoops are single-outlet),
// source tier now decides instead of falling back to pure freshness.
const DIGEST_MAX_AGE_HOURS = 48;

async function fetchTopicFeed(topic: string): Promise<Story[]> {
  try {
    const res = await fetch(`${FEED_API}?topic=${topic}`);
    if (!res.ok) return [];
    const raw = await res.json();
    const items: ApiItem[] = Array.isArray(raw) ? raw : Array.isArray(raw?.feed) ? raw.feed : [];
    const scored = items
      .map(it => {
        const stories = it.type === 'cluster' ? (it.articles ?? []) : [it as unknown as Story];
        const rep = stories.slice().sort((a, b) => (b.sources?.length ?? 0) - (a.sources?.length ?? 0))[0];
        const sourceCount = it.type === 'cluster' ? (it.articles?.length ?? 1) : (rep?.sources?.length ?? 1);
        return rep ? { rep, sourceCount } : null;
      })
      .filter((x): x is { rep: Story; sourceCount: number } => Boolean(x))
      .filter(({ rep }) => !isBlockedHeadline(rep.headline, rep.sources?.[0]?.name))
      .map(({ rep, sourceCount }) => {
        const hoursOld = rep.publishedAt ? Math.max(0, (Date.now() - new Date(rep.publishedAt).getTime()) / 3_600_000) : DIGEST_MAX_AGE_HOURS + 1;
        const freshnessMult = Math.exp(-hoursOld * Math.LN2 / 24); // half-life 24h
        const corroboration = Math.log(sourceCount + 1); // 1 src→0.69, 3→1.39, 6→1.95, 10→2.40
        const sourceQuality = sourceQualityWeight(rep.sources?.[0]?.name);
        const score = corroboration * 0.6 + sourceQuality * 0.25 + freshnessMult * 0.15;
        return { rep, hoursOld, score };
      })
      .filter(x => x.hoursOld <= DIGEST_MAX_AGE_HOURS);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10).map(x => x.rep);
  } catch { return []; }
}

async function aiBullets(text: string): Promise<string[]> {
  try {
    const res = await fetch(AI_SUMMARY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphs: [text.slice(0, 1500)], type: 'bullets', maxWords: 120 }),
    });
    if (!res.ok) return [];
    const data: { bullets?: string[]; summary?: string } = await res.json();
    if (Array.isArray(data.bullets)) return data.bullets.slice(0, 3);
    if (data.summary) return [data.summary];
  } catch {}
  return [];
}

async function buildSnapshot(): Promise<Snapshot> {
  const sectionsRaw = await Promise.all(
    CATEGORY_DEFS.map(async def => ({ def, stories: await fetchTopicFeed(def.topic) })),
  );

  const allStories: Story[] = [];
  const sources = new Set<string>();
  for (const s of sectionsRaw) {
    for (const story of s.stories) {
      allStories.push(story);
      story.sources?.forEach(src => sources.add(src.name));
    }
  }

  const heroPool = sectionsRaw[0]?.stories.length ? sectionsRaw[0].stories : allStories;
  const heroStory = heroPool.slice().sort((a, b) => (b.sources?.length ?? 0) - (a.sources?.length ?? 0))[0];
  let heroBullets: string[] = [];
  if (heroStory) {
    heroBullets = await aiBullets(`${heroStory.headline}. ${heroStory.summary ?? ''}`);
    if (heroBullets.length === 0 && heroStory.summary) heroBullets = [heroStory.summary];
  }

  const sections: CategorySection[] = sectionsRaw
    .map(({ def, stories }) => ({
      key: def.key,
      label: def.label,
      emoji: def.emoji,
      oneLiner: stories[0]?.summary?.slice(0, 140) ?? '',
      stories: stories.slice(0, 5),
    }))
    .filter(s => s.stories.length > 0);

  const numbers: NumberCallout[] = [];
  const seen = new Set<string>();
  for (const s of allStories.slice(0, 30)) {
    const n = extractNumber(`${s.headline} ${s.summary ?? ''}`);
    if (n && !seen.has(n)) {
      seen.add(n);
      const labelWords = s.headline.split(/\s+/).filter(w => /^[A-Z]/.test(w) && w.length > 2).slice(0, 2).join(' ');
      numbers.push({ value: n, label: (labelWords || s.sources?.[0]?.name || '').toUpperCase().slice(0, 20) });
      if (numbers.length >= 3) break;
    }
  }

  const totalWords = wordCount(heroBullets.join(' ')) +
    sections.reduce((sum, sec) => sum + sec.stories.reduce((s, st) => s + wordCount(st.summary ?? '') / 3, 0), 0);

  return {
    date: todayKey(),
    generatedAt: Date.now(),
    hero: heroStory ? { story: heroStory, bullets: heroBullets } : null,
    sections,
    numbers,
    totalStories: allStories.length,
    totalSources: sources.size,
    estimatedReadMin: Math.max(3, Math.round(totalWords / 200)),
  };
}

export default function DigestScreen() {
  const { navigate } = useRouter();
  const { reportScroll } = useTabBar();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [yesterdaySnapshot, setYesterdaySnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Scroll-position memory — same pattern as FeedScreen.tsx/ExploreScreen.tsx.
  // Digest unmounts when you tap into an Article and remounts on back, so
  // without this the scroll silently resets to the top every time.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollOffsetRef = useRef(0);
  const isFirstLoadDone = useRef(false);
  const SCROLL_RESTORE_MAX_AGE_MS = 30 * 60 * 1000; // 30 min
  useEffect(() => {
    if (loading || isFirstLoadDone.current) return;
    isFirstLoadDone.current = true;
    const saved = localStorage.getItem('@ireader_scroll_digest');
    let offset = 0;
    if (saved) {
      try {
        const p = JSON.parse(saved) as { y?: number; at?: number };
        if (typeof p?.y === 'number' && typeof p?.at === 'number' && Date.now() - p.at < SCROLL_RESTORE_MAX_AGE_MS) offset = p.y;
      } catch { /* ignore */ }
    }
    if (offset > 0) requestAnimationFrame(() => { scrollRef.current?.scrollTo({ top: offset, behavior: 'auto' }); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  useEffect(() => {
    const save = () => { localStorage.setItem('@ireader_scroll_digest', JSON.stringify({ y: scrollOffsetRef.current, at: Date.now() })); };
    window.addEventListener('beforeunload', save);
    return () => { save(); window.removeEventListener('beforeunload', save); };
  }, []);

  const load = useCallback(async (force = false) => {
    setError(null);
    const dateKey = todayKey();
    const cacheKey = SNAPSHOT_KEY_PREFIX + dateKey;
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed: Snapshot = JSON.parse(cached);
          if (parsed.date === dateKey) {
            setSnapshot(parsed);
            setLoading(false);
            return;
          }
        }
      } catch {}
    }
    try {
      const snap = await buildSnapshot();
      if (snap.sections.length === 0 && !snap.hero) throw new Error('Empty digest');
      setSnapshot(snap);
      try { localStorage.setItem(cacheKey, JSON.stringify(snap)); } catch {}
      try { localStorage.setItem(YESTERDAY_KEY, JSON.stringify(snap)); } catch {}
    } catch (e) {
      setError(`Could not build digest: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    try {
      const raw = localStorage.getItem(YESTERDAY_KEY);
      if (raw) {
        const parsed: Snapshot = JSON.parse(raw);
        if (parsed.date && parsed.date !== todayKey()) setYesterdaySnapshot(parsed);
      }
    } catch {}
  }, [load]);

  const openArticle = useCallback((s: Story) => {
    trackArticleOpen(s);
    navigate({
      name: 'Article',
      params: {
        id: s.id,
        url: s.sources?.[0]?.url ?? '',
        image: s.imageUrl,
        headline: s.headline,
        summary: s.summary,
        source: s.sources?.[0]?.name ?? '',
        publishedAt: s.publishedAt,
        dominantColor: getArticleColor(s.id || s.headline),
        sources: JSON.stringify(s.sources ?? []),
        allStories: '[]',
        sourceBias: s.sourceBias,
      },
    });
  }, [navigate]);

  const toggleSection = (key: string) =>
    setCollapsed(c => ({ ...c, [key]: !c[key] }));

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const top = (e.target as HTMLDivElement).scrollTop;
        reportScroll(top);
        scrollOffsetRef.current = top;
      }}
      style={{
        height: '100%', background: '#080808', overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch', color: '#fff',
      }}
    >
      <div style={{ padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px 90px' }}>
        {/* Header */}
        <div style={{ padding: '8px 0 16px' }}>
          <div style={{ color: '#fff', fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>
            {greeting()}.
          </div>
          <div style={{ color: '#888', fontSize: 14, marginTop: 4 }}>
            Your daily digest, distilled.
          </div>
        </div>

        {/* Quick stats */}
        {snapshot && (
          <div style={{
            display: 'flex', alignItems: 'center',
            background: '#141414', borderRadius: 14,
            padding: '14px 10px', marginBottom: 20,
          }}>
            <Stat value={snapshot.estimatedReadMin} label="MIN READ" />
            <Divider />
            <Stat value={snapshot.totalStories} label="STORIES" />
            <Divider />
            <Stat value={snapshot.totalSources} label="SOURCES" />
            <Divider />
            <button
              onClick={() => load(true)}
              style={{
                flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
              }}
            >
              <span style={{ fontSize: 22 }}>↻</span>
              <span>REFRESH</span>
            </button>
          </div>
        )}

        {/* Loading / error */}
        {loading && !snapshot && (
          <div style={{ textAlign: 'center', padding: '56px 0' }}>
            <div style={{ width: 28, height: 28, border: '3px solid #222', borderTopColor: '#888', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ color: '#666', fontSize: 12, marginTop: 12 }}>Building today's digest…</div>
          </div>
        )}
        {error && !snapshot && (
          <div style={{ textAlign: 'center', padding: '56px 0', color: '#666', fontSize: 12 }}>
            {error}
            <div>
              <button onClick={() => load(true)} style={{
                marginTop: 12, background: 'none', color: '#fff',
                border: '1px solid #2A2A2A', borderRadius: 999,
                padding: '10px 18px', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
              }}>RETRY</button>
            </div>
          </div>
        )}

        {/* Hero */}
        {snapshot?.hero && (() => {
          const { story, bullets } = snapshot.hero;
          const dominant = getArticleColor(story.id || story.headline);
          const accent = lighten(dominant, 0.45);
          return (
            <div onClick={() => openArticle(story)} style={{
              borderRadius: 16, overflow: 'hidden', marginBottom: 24,
              background: darken(dominant, 0.3), cursor: 'pointer',
            }}>
              <div style={{ height: 180, position: 'relative', background: '#1A1A1A' }}>
                {story.imageUrl ? (
                  <img src={story.imageUrl} alt="" style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                  }} />
                ) : (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: `linear-gradient(135deg, ${lighten(dominant, 0.2)}, ${dominant}, ${darken(dominant, 0.3)})`,
                  }} />
                )}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: `linear-gradient(to bottom, transparent 40%, ${darken(dominant, 0.3)} 100%)`,
                }} />
                <div style={{
                  position: 'absolute', top: 12, left: 12,
                  background: 'rgba(0,0,0,0.6)',
                  padding: '4px 8px', borderRadius: 999,
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#FFD166', fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
                }}>
                  ⭐ TOP STORY
                </div>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: accent, fontSize: 11, fontWeight: 700, letterSpacing: 1.2 }}>
                  {(story.sources?.[0]?.name ?? '').toUpperCase()}
                </div>
                <div style={{ color: '#fff', fontSize: 19, fontWeight: 800, lineHeight: 1.3, letterSpacing: -0.2 }}>
                  {story.headline}
                </div>
                {bullets.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                    {bullets.slice(0, 3).map((b, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 5, height: 5, borderRadius: 3, background: accent, marginTop: 8, flexShrink: 0 }} />
                        <div style={{ flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.5 }}>{b}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Numbers */}
        {snapshot && snapshot.numbers.length > 0 && (
          <>
            <SectionLabel text="NUMBERS OF THE DAY" />
            <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
              {snapshot.numbers.map((n, i) => (
                <div key={i} style={{
                  flex: 1, padding: 12, borderRadius: 12,
                  background: '#141414', border: '1px solid #222',
                }}>
                  <div style={{ color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>{n.value}</div>
                  <div style={{ color: '#666', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {n.label || '—'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Category sections */}
        {snapshot?.sections.map(section => {
          const isCollapsed = collapsed[section.key];
          return (
            <div key={section.key} style={{
              marginBottom: 22, borderRadius: 14,
              background: '#0E0E0E', border: '1px solid #1A1A1A', overflow: 'hidden',
            }}>
              <div
                onClick={() => toggleSection(section.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '14px 16px', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 16 }}>{section.emoji}</span>
                <span style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: 800 }}>{section.label}</span>
                <span style={{
                  color: '#666', fontSize: 11, fontWeight: 700,
                  background: '#141414', padding: '3px 8px', borderRadius: 999,
                }}>{section.stories.length}</span>
                <span style={{ color: '#666', fontSize: 14 }}>{isCollapsed ? '▾' : '▴'}</span>
              </div>
              {!isCollapsed && (
                <>
                  {section.oneLiner && (
                    <div style={{
                      padding: '0 16px 12px', color: '#999', fontSize: 13,
                      lineHeight: 1.4, fontStyle: 'italic',
                    }}>{section.oneLiner}</div>
                  )}
                  {section.stories.map((s, i) => (
                    <div key={s.id} onClick={() => openArticle(s)} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: 14, cursor: 'pointer',
                      borderBottom: i < section.stories.length - 1 ? '1px solid #1A1A1A' : 'none',
                    }}>
                      <span style={{ color: '#444', fontSize: 11, fontWeight: 800, letterSpacing: 0.6, width: 22, marginTop: 2 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#888', fontSize: 10, fontWeight: 700, letterSpacing: 1.2 }}>
                          {(s.sources?.[0]?.name ?? '').toUpperCase()}
                        </div>
                        <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, lineHeight: 1.35, marginTop: 4 }}>
                          {s.headline}
                        </div>
                        {s.summary && (
                          <div style={{ color: '#777', fontSize: 12, lineHeight: 1.45, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {s.summary}
                          </div>
                        )}
                      </div>
                      {s.imageUrl ? (
                        <img src={s.imageUrl} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', background: '#1A1A1A' }} />
                      ) : (
                        <div style={{ width: 60, height: 60, borderRadius: 8, background: getArticleColor(s.id) }} />
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}

        {/* Yesterday recap */}
        {yesterdaySnapshot && yesterdaySnapshot.hero && (
          <div style={{ marginBottom: 22 }}>
            <SectionLabel text="WHAT YOU MISSED YESTERDAY" />
            <div onClick={() => yesterdaySnapshot.hero && openArticle(yesterdaySnapshot.hero.story)} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: 14, background: '#0E0E0E',
              borderRadius: 14, border: '1px solid #1A1A1A',
              cursor: 'pointer',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>
                  {new Date(yesterdaySnapshot.generatedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div style={{ color: '#555', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, marginTop: 2 }}>
                  {yesterdaySnapshot.totalStories} stories
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#555', fontSize: 9, fontWeight: 800, letterSpacing: 1.2 }}>TOP STORY</div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {yesterdaySnapshot.hero.story.headline}
                </div>
              </div>
              <span style={{ color: '#444', fontSize: 16 }}>›</span>
            </div>
          </div>
        )}

        {/* Footer */}
        {snapshot && (
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <div style={{ color: '#444', fontSize: 11 }}>
              Generated {new Date(snapshot.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · Next auto-refresh at 7 AM tomorrow
            </div>
            <button onClick={() => load(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 12, padding: '10px 18px', borderRadius: 999,
              background: '#1A1A1A', border: 'none', color: '#fff',
              fontSize: 10, fontWeight: 800, letterSpacing: 1.4, cursor: 'pointer',
            }}>
              ↻ REGENERATE NOW
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{value}</span>
      <span style={{ color: '#666', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, marginTop: 2 }}>{label}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 28, background: '#2A2A2A' }} />;
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      color: '#555', fontSize: 10, fontWeight: 800,
      letterSpacing: 1.4, marginBottom: 10, marginLeft: 4,
    }}>{text}</div>
  );
}
