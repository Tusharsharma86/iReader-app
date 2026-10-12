import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Story } from '../types';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';
import { getArticleColor } from '../utils/colors';
import { trackArticleOpen } from '../utils/personalization';
import { FALLBACK_IMG } from '../utils/fallback';

const BRIEFING_API = 'https://ireader.onrender.com/api/news/briefing';
const CACHE_PREFIX = '@briefing_v2_';
const SCROLL_KEY = '@ireader_scroll_briefing';

/** Display metadata only — ranking, filtering and summarising all happen
 *  server-side now. This screen used to do all three itself, which meant six
 *  feed fetches plus thirty /ai-summary calls PER DEVICE: opening the app on a
 *  phone and a laptop spent the whole AI budget twice for identical output and
 *  took 60-120s each time. One GET now returns a briefing built once and
 *  shared by everyone (~0.2s warm). */
const AREAS = [
  { key: 'breaking', label: 'Breaking', accent: '#FF453A' },
  { key: 'india',    label: 'India',    accent: '#FF9F0A' },
  { key: 'world',    label: 'World',    accent: '#64D2FF' },
  { key: 'markets',  label: 'Markets',  accent: '#30D158' },
  { key: 'tech',     label: 'Tech',     accent: '#BF5AF2' },
  { key: 'business', label: 'Business', accent: '#5E5CE6' },
] as const;

const AREA_BY_KEY = Object.fromEntries(AREAS.map(a => [a.key, a])) as Record<string, typeof AREAS[number]>;

const WINDOW_OPTIONS = [6, 12, 24, 48, 72] as const;
type WindowHours = typeof WINDOW_OPTIONS[number];
const DEFAULT_WINDOW: WindowHours = 24;
const TARGET_COUNT = 30;

// Scoring weights, shown in the header so the ranking is legible. These mirror
// the server's constants; they are display copy, not the scoring itself.
const W_CORROBORATION = 45, W_SOURCE = 22, W_FRESHNESS = 18, W_SIGNAL = 15;

/** One scoring input, as the server computed it. */
interface Factor {
  key: 'corroboration' | 'source' | 'freshness' | 'signal';
  label: string;
  detail: string;
  points: number;
  max: number;
}

/** Exactly the shape GET /api/news/briefing returns. */
interface RankedItem {
  id: string;
  rank: number;
  area: string;
  score: number;
  factors: Factor[];
  why: string;
  outlets: number;
  hoursOld: number;
  headline: string;
  summary: string;
  imageUrl: string | null;
  publishedAt: string;
  sourceName: string;
  url: string;
  sources?: Array<{ name: string; url: string; imageUrl?: string; publishedAt: string }>;
  aiSummary: string;
  summaryFailed: boolean;
}

interface Snapshot {
  builtAt: number;
  windowHours: WindowHours;
  items: RankedItem[];
  poolSize: number;
  cached?: boolean;
  // The server now answers with the ranked list straight away and writes the
  // summaries behind it, so a response can be usable but not yet finished.
  complete?: boolean;
  filled?: number;
  total?: number;
  filling?: boolean;
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cacheKeyFor(windowHours: WindowHours) {
  return `${CACHE_PREFIX}${todayKey()}_${windowHours}h`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function agoLabel(hours: number): string {
  if (!Number.isFinite(hours)) return 'undated';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The card and the Article route both want a Story; the endpoint sends flat
 *  fields. Rebuild one rather than rewriting the navigation contract. */
function toStory(item: RankedItem): Story {
  return {
    id: item.id,
    headline: item.headline,
    summary: item.summary,
    publishedAt: item.publishedAt,
    imageUrl: item.imageUrl ?? '',
    sources: item.sources?.length
      ? item.sources
      : item.url
        ? [{ name: item.sourceName, url: item.url, publishedAt: item.publishedAt }]
        : [],
  };
}

// Lives outside the component on purpose. App.tsx keeps only FeedScreen
// mounted, so tapping into an article UNMOUNTS this screen and coming back
// remounts it from scratch — which re-ran the whole build every single time.
// A module-level copy survives that, so back-navigation is free.
let memSnapshot: { key: string; snap: Snapshot } | null = null;
// How stale the in-memory copy may be before a remount bothers to revalidate.
// The server rebuilds at most every 6h, so re-asking within minutes is waste.
const MEM_FRESH_MS = 10 * 60 * 1000;

async function fetchBriefing(windowHours: WindowHours, force: boolean, signal: AbortSignal): Promise<Snapshot> {
  const res = await fetch(`${BRIEFING_API}?window=${windowHours}${force ? '&refresh=1' : ''}`, { signal });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = ((await res.json()) as { error?: string }).error ?? detail; } catch { /* keep status */ }
    throw new Error(detail);
  }
  const data = (await res.json()) as Snapshot;
  if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('Briefing came back empty');
  return data;
}

// ---------------------------------------------------------------- components

function FactorBars({ factors }: { factors: Factor[] }) {
  return (
    <div style={{ marginTop: 11, display: 'grid', gap: 8 }}>
      {factors.map(f => {
        const pct = Math.round((f.points / f.max) * 100);
        return (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 100, flexShrink: 0, color: '#8A8A8E', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.2 }}>
              {f.label}
            </div>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: '#4A90D9' }} />
            </div>
            <div style={{ width: 126, flexShrink: 0, color: '#6E6E73', fontSize: 10, textAlign: 'right' }}>
              {f.detail}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BriefingCard({
  item, onOpen,
}: { item: RankedItem; onOpen: (item: RankedItem) => void }) {
  const [showFactors, setShowFactors] = useState(false);
  const [imgError, setImgError] = useState(false);
  const def = AREA_BY_KEY[item.area];
  const accent = def?.accent ?? '#4A90D9';
  const source = item.sourceName;
  const image = !imgError && item.imageUrl ? item.imageUrl : FALLBACK_IMG;

  return (
    <div style={{
      background: '#101010',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 20,
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      {/* Hero — the whole block opens the article, same as a Feed card */}
      <div
        onClick={() => onOpen(item)}
        role="link"
        style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
      >
        <div style={{ position: 'relative', width: '100%', height: 196, background: '#1A1A1A' }}>
          <img
            src={image}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* Legibility wash for the overlaid meta */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0.25) 62%, rgba(0,0,0,0.88) 100%)',
          }} />

          {/* Rank */}
          <div style={{
            position: 'absolute', top: 12, left: 12,
            minWidth: 42, height: 42, padding: '0 8px', borderRadius: 13,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: `1.5px solid ${accent}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            letterSpacing: -0.5,
          }}>{item.rank}</div>

          {/* Subject area */}
          <div style={{ position: 'absolute', top: 14, right: 12 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
              color: '#fff', background: `${accent}D9`,
              padding: '5px 10px', borderRadius: 999, whiteSpace: 'nowrap',
            }}>{def?.label ?? item.area}</span>
          </div>

          {/* Source + age */}
          <div style={{
            position: 'absolute', left: 14, right: 14, bottom: 11,
            display: 'flex', alignItems: 'center', gap: 7,
            color: 'rgba(255,255,255,0.88)', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
          }}>
            <span style={{ textTransform: 'uppercase' }}>{source}</span>
            {source && <span style={{ opacity: 0.5 }}>·</span>}
            <span style={{ opacity: 0.8 }}>{agoLabel(item.hoursOld)}</span>
            {item.outlets > 1 && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ opacity: 0.8 }}>{item.outlets} outlets</span>
              </>
            )}
          </div>
        </div>

        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, lineHeight: 1.26, letterSpacing: -0.35 }}>
            {item.headline}
          </div>
        </div>
      </div>

      {/* Why this rank */}
      <div style={{ padding: '12px 16px 0' }}>
        <div
          onClick={() => setShowFactors(v => !v)}
          style={{
            background: 'rgba(74,144,217,0.07)',
            border: '1px solid rgba(74,144,217,0.18)',
            borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: '#4A90D9', fontSize: 10, fontWeight: 800, letterSpacing: 0.5, flexShrink: 0 }}>
              WHY #{item.rank} · {Math.round(item.score)}/100
            </span>
            <span style={{ color: '#9A9AA0', fontSize: 12, lineHeight: 1.45, flex: 1 }}>{item.why}</span>
            <span style={{ color: '#4A90D9', fontSize: 10, flexShrink: 0 }}>{showFactors ? '▲' : '▼'}</span>
          </div>
          {showFactors && <FactorBars factors={item.factors} />}
        </div>
      </div>

      {/* AI summary */}
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{
          color: '#8A8A8E', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8,
          marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>AI SUMMARY</span>
          {!item.aiSummary && !item.summaryFailed && (
            <span style={{ color: '#4A90D9', fontSize: 9.5, fontWeight: 600, letterSpacing: 0 }}>writing…</span>
          )}
        </div>
        {item.aiSummary ? (
          <div style={{ color: '#C7C7CC', fontSize: 13.5, lineHeight: 1.62, whiteSpace: 'pre-wrap' }}>
            {item.aiSummary}
          </div>
        ) : item.summaryFailed ? (
          <div style={{ color: '#6E6E73', fontSize: 13, lineHeight: 1.6, fontStyle: 'italic' }}>
            {item.summary
              ? `${item.summary.slice(0, 260)} (source text — AI summary unavailable)`
              : 'AI summary unavailable.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 7 }}>
            {[96, 100, 88, 62].map((w, i) => (
              <div key={i} style={{
                height: 11, width: `${w}%`, borderRadius: 5,
                background: 'linear-gradient(90deg, #171717, #202020, #171717)',
                backgroundSize: '200% 100%',
                animation: 'briefShimmer 1.4s ease-in-out infinite',
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the screen

export default function BriefingScreen() {
  const { navigate } = useRouter();
  const { reportScroll } = useTabBar();

  const [windowHours, setWindowHours] = useState<WindowHours>(() => {
    const saved = Number(localStorage.getItem('@briefing_window'));
    return (WINDOW_OPTIONS as readonly number[]).includes(saved) ? (saved as WindowHours) : DEFAULT_WINDOW;
  });
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'revalidating' | 'rebuilding' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string>('all');

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll memory — this screen unmounts when you tap into an article.
  useEffect(() => {
    const saved = Number(localStorage.getItem(SCROLL_KEY));
    if (saved > 0) requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: saved, behavior: 'auto' }));
  }, []);

  useEffect(() => {
    const toTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.addEventListener('briefing-scroll-top', toTop);
    return () => window.removeEventListener('briefing-scroll-top', toTop);
  }, []);

  /** One request. The server ranks, filters, batches the summaries and caches
   *  the result for every device, so there is nothing left to orchestrate
   *  here — which is the point: this screen used to make 36 calls. */
  const load = useCallback(async (hours: WindowHours, force: boolean) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    const key = cacheKeyFor(hours);

    // Returning from an article: if the in-memory copy is recent, show it and
    // make NO request at all. This is the common path and it should be free.
    if (!force && memSnapshot?.key === key && memSnapshot.snap.complete !== false
        && Date.now() - memSnapshot.snap.builtAt < MEM_FRESH_MS) {
      setSnapshot(memSnapshot.snap);
      setPhase('done');
      return;
    }

    // Paint whatever we already have, INCLUDING during an explicit rebuild.
    // Rebuild used to clear the list first, so tapping it blanked the screen
    // for the ~20s the server takes — which reads as "it stopped", not "it is
    // working". The old briefing stays up until the new one lands.
    let painted = false;
    const fromMem = memSnapshot?.key === key ? memSnapshot.snap : null;
    if (fromMem) { setSnapshot(fromMem); painted = true; }
    else {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed: Snapshot = JSON.parse(raw);
          if (parsed.items?.length) { setSnapshot(parsed); painted = true; }
        }
      } catch { /* ignore a bad cache entry */ }
    }

    setPhase(force ? 'rebuilding' : painted ? 'revalidating' : 'loading');
    if (!painted) setSnapshot(null);

    try {
      const snap = await fetchBriefing(hours, force, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setSnapshot(snap);
      memSnapshot = { key, snap };
      try { localStorage.setItem(key, JSON.stringify(snap)); } catch { /* quota */ }
      setPhase('done');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      // A stale copy on screen beats an error page.
      if (!painted) setError(e instanceof Error ? e.message : String(e));
      setPhase('done');
    }
  }, []);

  useEffect(() => {
    load(windowHours, false);
    return () => abortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Summaries arrive after the ranking. Look again while the server says it is
  // still filling, so cards complete themselves without the reader doing
  // anything. A warm read is ~0.2s, and this stops as soon as it is done.
  useEffect(() => {
    if (!snapshot || snapshot.complete !== false) return;
    const t = setTimeout(() => { load(windowHours, false); }, 15000);
    return () => clearTimeout(t);
  }, [snapshot, windowHours, load]);

  const pickWindow = useCallback((h: WindowHours) => {
    if (h === windowHours) return;
    setWindowHours(h);
    localStorage.setItem('@briefing_window', String(h));
    load(h, false);
  }, [windowHours, load]);

  const regenerate = useCallback(() => {
    try { localStorage.removeItem(cacheKeyFor(windowHours)); } catch { /* ignore */ }
    load(windowHours, true);
  }, [windowHours, load]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Keep whatever is on screen; if a rebuild wiped it, fall back to the copy
    // held in memory so Stop can never leave the screen empty.
    setSnapshot(prev => prev ?? memSnapshot?.snap ?? null);
    setPhase('done');
  }, []);

  const openArticle = useCallback((item: RankedItem) => {
    const s = toStory(item);
    trackArticleOpen(s);
    localStorage.setItem(SCROLL_KEY, String(scrollRef.current?.scrollTop ?? 0));
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
      },
    });
  }, [navigate]);

  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of snapshot?.items ?? []) counts[it.area] = (counts[it.area] ?? 0) + 1;
    return counts;
  }, [snapshot]);

  // Ranks stay global, so a filtered view can open at #7 — that is the point:
  // the number tells you where the story sits in the whole briefing, not in
  // the slice you happen to be looking at.
  const visibleItems = useMemo(
    () => (snapshot?.items ?? []).filter(i => areaFilter === 'all' || i.area === areaFilter),
    [snapshot, areaFilter],
  );
  const busy = phase === 'loading' || phase === 'revalidating' || phase === 'rebuilding';
  const total = snapshot?.items.length ?? 0;
  const failedCount = snapshot?.items.filter(i => i.summaryFailed).length ?? 0;

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const top = (e.target as HTMLDivElement).scrollTop;
        reportScroll(top);
        localStorage.setItem(SCROLL_KEY, String(top));
      }}
      style={{
        height: '100%', background: '#080808', overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch', color: '#fff',
      }}
    >
      <style>{`
        @keyframes briefShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes briefSpin { to { transform: rotate(360deg); } }
        @keyframes briefSlide { 0% { margin-left: 0; } 50% { margin-left: 65%; } 100% { margin-left: 0; } }
      `}</style>

      <div style={{ padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 96px' }}>
        {/* Header */}
        <div style={{ padding: '6px 0 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 26, fontWeight: 800, letterSpacing: -0.6 }}>
                Briefing for the day
              </div>
              <div style={{ color: '#8A8A8E', fontSize: 12, marginTop: 3 }}>
                {greeting()} — {total || TARGET_COUNT} stories, ranked, across {AREAS.length} areas.
              </div>
            </div>
            <button
              onClick={busy ? stop : regenerate}
              style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                background: busy ? 'rgba(255,69,58,0.12)' : 'rgba(74,144,217,0.14)',
                border: `1px solid ${busy ? 'rgba(255,69,58,0.4)' : 'rgba(74,144,217,0.35)'}`,
                color: busy ? '#FF8F86' : '#4A90D9',
                borderRadius: 999, padding: '8px 13px',
                fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                display: 'inline-block', width: 11, height: 11,
                border: '2px solid currentColor', borderTopColor: busy ? 'transparent' : 'currentColor',
                borderRadius: busy ? '50%' : 3,
                animation: busy ? 'briefSpin 0.8s linear infinite' : 'none',
                opacity: 0.9,
              }} />
              {busy ? 'Stop' : 'Regenerate'}
            </button>
          </div>
        </div>

        {/* News window */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: '#6E6E73', fontSize: 8.5, fontWeight: 800, letterSpacing: 0.7, marginBottom: 7 }}>
            NEWS WINDOW
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {WINDOW_OPTIONS.map(h => {
              const active = h === windowHours;
              return (
                <button
                  key={h}
                  onClick={() => pickWindow(h)}
                  style={{
                    padding: '7px 14px', borderRadius: 999,
                    border: `1px solid ${active ? 'rgba(74,144,217,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    background: active ? 'rgba(74,144,217,0.16)' : '#0E0E0E',
                    color: active ? '#4A90D9' : '#7A7A7E',
                    fontSize: 11.5, fontWeight: 700, letterSpacing: 0.2,
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {h}h
                </button>
              );
            })}
          </div>
          <div style={{ color: '#5A5A5E', fontSize: 9.5, marginTop: 7, lineHeight: 1.45 }}>
            Only stories published inside this window are considered, and freshness is
            scored relative to it. Changing the window rebuilds the briefing.
          </div>
        </div>

        {/* Status. There is no per-summary counter to show any more: the whole
            briefing arrives in one response. A cold build takes ~45s because
            the server is batching thirty summaries, but that happens once per
            window for everyone, not once per device. */}
        {busy && (
          <div style={{
            background: '#101010', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14, padding: '12px 14px', marginBottom: 14,
          }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              {phase === 'rebuilding' ? 'Rebuilding — this takes about 20s…'
                : phase === 'revalidating' ? 'Checking for a newer briefing…'
                : 'Building today\u2019s briefing…'}
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{
                width: '35%', height: '100%', borderRadius: 2, background: '#4A90D9',
                animation: 'briefSlide 1.3s ease-in-out infinite',
              }} />
            </div>
            <div style={{ color: '#5A5A5E', fontSize: 9.5, marginTop: 8, lineHeight: 1.45 }}>
              {phase === 'rebuilding'
                ? 'The current briefing stays on screen until the new one is ready. Tap Stop to keep this one.'
                : phase === 'revalidating'
                  ? 'Showing the last copy while a fresher one is fetched.'
                  : `Ranking ${TARGET_COUNT} stories and writing every summary up front, so each card is complete before you scroll. Built once and shared — reopening is instant.`}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.25)',
            borderRadius: 14, padding: '12px 14px', marginBottom: 14,
            color: '#FF9F96', fontSize: 11.5, lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* Summaries the server could not fill even after its retry rounds. */}
        {snapshot && !busy && failedCount > 0 && (
          <div style={{
            background: 'rgba(255,159,10,0.07)', border: '1px solid rgba(255,159,10,0.25)',
            borderRadius: 14, padding: '12px 14px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, color: '#FFC56E', fontSize: 11.5, lineHeight: 1.5 }}>
              {snapshot?.complete === false
                ? `${failedCount} of ${total} summaries are still being written — they appear as they land. Those cards show the source text meanwhile.`
                : `${failedCount} of ${total} summaries didn’t come back — those cards show the source text instead.`}
            </div>
            <button
              onClick={regenerate}
              style={{
                flexShrink: 0, background: 'rgba(255,159,10,0.16)',
                border: '1px solid rgba(255,159,10,0.4)', color: '#FFC56E',
                borderRadius: 999, padding: '7px 13px', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              Rebuild
            </button>
          </div>
        )}

        {/* Categories. These were static count chips; making them filters costs
            nothing because all thirty items are already in memory, and it turns
            a label into navigation. Sticky so you can switch while scrolling. */}
        {snapshot && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 5,
            margin: '0 -16px 12px', padding: '8px 16px',
            background: 'rgba(8,8,8,0.82)',
            backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{
              display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch', paddingBottom: 2,
            }}>
              {([{ key: 'all', label: 'All', accent: '#4A90D9' }, ...AREAS] as Array<{ key: string; label: string; accent: string }>)
                .filter(a => a.key === 'all' || areaCounts[a.key])
                .map(a => {
                  const active = areaFilter === a.key;
                  const count = a.key === 'all' ? total : (areaCounts[a.key] ?? 0);
                  return (
                    <button
                      key={a.key}
                      onClick={() => {
                        setAreaFilter(a.key);
                        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      style={{
                        flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 13px', borderRadius: 999,
                        border: `1px solid ${active ? a.accent : 'rgba(255,255,255,0.09)'}`,
                        background: active ? `${a.accent}26` : '#0E0E0E',
                        color: active ? a.accent : '#8A8A8E',
                        fontSize: 11.5, fontWeight: 700, letterSpacing: 0.2,
                        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                        transition: 'background 0.18s, border-color 0.18s, color 0.18s',
                      }}
                    >
                      {a.label}
                      <span style={{
                        fontSize: 9.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                        color: active ? a.accent : '#5A5A5E',
                        background: active ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.05)',
                        borderRadius: 999, padding: '1px 6px',
                      }}>{count}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Built-at + how the ranking was scored */}
        {snapshot && !busy && (
          <div style={{
            background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 14, padding: '11px 13px', marginBottom: 14,
          }}>
            <div style={{ color: '#5A5A5E', fontSize: 9.5, lineHeight: 1.45 }}>
              Built {new Date(snapshot.builtAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} from{' '}
              {snapshot.poolSize} candidate stories · ranked on corroboration {W_CORROBORATION},
              source weight {W_SOURCE}, freshness {W_FRESHNESS}, editorial signal {W_SIGNAL}.
              Tap any “why” row to see the breakdown.
            </div>
          </div>
        )}

        {/* The list */}
        {visibleItems.map(item => (
          <BriefingCard key={`${item.id}-${item.rank}`} item={item} onOpen={openArticle} />
        ))}

        {snapshot && visibleItems.length === 0 && (
          <div style={{ color: '#6E6E73', fontSize: 12, textAlign: 'center', padding: '32px 0' }}>
            Nothing in this category for the {snapshot.windowHours}h window.
          </div>
        )}

        {!snapshot && !busy && !error && (
          <div style={{ color: '#6E6E73', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>
            Nothing to brief yet.
          </div>
        )}
      </div>
    </div>
  );
}
