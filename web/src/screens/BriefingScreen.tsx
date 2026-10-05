import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Story } from '../types';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';
import { getArticleColor } from '../utils/colors';
import { trackArticleOpen } from '../utils/personalization';
import { isBlockedHeadline, sourceQualityWeight } from '../utils/contentFilters';
import { FALLBACK_IMG } from '../utils/fallback';

const FEED_API = 'https://ireader.onrender.com/api/news/feed';
const AI_SUMMARY_API = 'https://ireader.onrender.com/api/news/ai-summary';
const CACHE_PREFIX = '@briefing_v1_';
const SCROLL_KEY = '@ireader_scroll_briefing';

/** Thirty stories, spread across these six areas. */
const AREAS = [
  { key: 'breaking', label: 'Breaking', topic: 'breaking',        accent: '#FF453A' },
  { key: 'india',    label: 'India',    topic: 'india-politics',  accent: '#FF9F0A' },
  { key: 'world',    label: 'World',    topic: 'geopolitics',     accent: '#64D2FF' },
  { key: 'markets',  label: 'Markets',  topic: 'markets',         accent: '#30D158' },
  { key: 'tech',     label: 'Tech',     topic: 'technology',      accent: '#BF5AF2' },
  { key: 'business', label: 'Business', topic: 'business',        accent: '#5E5CE6' },
] as const;

const AREA_BY_KEY = Object.fromEntries(AREAS.map(a => [a.key, a])) as Record<string, typeof AREAS[number]>;

// Who gets to claim a story that appears in more than one feed. "Breaking" is
// a cross-cutting flag, not a subject area: its feed re-runs whatever India,
// World, Markets, Tech and Business are already carrying. Claiming in display
// order let it take 23 of 30 cards and collapse the spread, so the specific
// subjects claim first and Breaking keeps only what nothing else carried. The
// breaking *flag* still counts, through the editorial-signal factor below.
const CLAIM_ORDER = ['india', 'world', 'markets', 'tech', 'business', 'breaking'];

const WINDOW_OPTIONS = [6, 12, 24, 48, 72] as const;
type WindowHours = typeof WINDOW_OPTIONS[number];
const DEFAULT_WINDOW: WindowHours = 24;

const TARGET_COUNT = 30;
// Six areas, at most seven each: the cap is what makes the list a briefing
// "across subject areas" rather than thirty variations on whatever topic
// happens to be busiest today. 6 x 7 = 42, so there is always enough slack
// to reach thirty even when two areas come back thin.
const PER_AREA_CAP = 7;

// Summary length. The server clamps maxWords to at least 80 and then applies
// its own ratio guard (<=45% of the source text, floor 60 words), so asking
// for 90 lands inside the 50-100 word band the briefing wants.
const SUMMARY_MAX_WORDS = 90;
// The server sheds load above 4 concurrent generations (503 + Retry-After), but
// its own ceiling is not the binding one: Groq's free tier is ~200k tokens and
// a limited RPM per day, and a summary costs ~1.5k tokens. Three workers at
// ~2.4s each is ~75 requests a minute, which rate-limited 18 of 30 summaries
// on the first full run. Two workers plus a short gap between calls keeps the
// whole briefing inside the budget.
const SUMMARY_CONCURRENCY = 2;
const SUMMARY_GAP_MS = 400;
const SUMMARY_RETRIES = 4;
// A 502 here means every provider failed for THIS request — usually a Groq
// rate-gate pause, which clears in about a minute. Worth waiting out rather
// than leaving a blank card.
const RETRY_BACKOFF_MS = [2000, 5000, 9000, 15000];

interface ApiItem {
  type?: string;
  articles?: Story[];
}

/** One scoring input, kept separately so the card can explain the rank. */
interface Factor {
  key: 'corroboration' | 'source' | 'freshness' | 'signal';
  label: string;
  detail: string;
  points: number;   // contribution to the 0-100 score
  max: number;
}

interface RankedItem {
  id: string;
  rank: number;
  story: Story;
  area: string;
  score: number;
  factors: Factor[];
  why: string;
  outlets: number;
  hoursOld: number;
  aiSummary: string;
  summaryFailed: boolean;
}

interface Snapshot {
  builtAt: number;
  windowHours: WindowHours;
  items: RankedItem[];
  poolSize: number;
}

// ---------------------------------------------------------------- utilities

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

function identityOf(s: Story): string {
  return s.id || s.sources?.[0]?.url || s.headline;
}

function ageHours(publishedAt?: string): number {
  if (!publishedAt) return Number.POSITIVE_INFINITY;
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

function agoLabel(hours: number): string {
  if (!Number.isFinite(hours)) return 'undated';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function tierLabel(weight: number): string {
  if (weight >= 1) return 'wire/major outlet';
  if (weight >= 0.7) return 'established outlet';
  return 'smaller outlet';
}

// ---------------------------------------------------------------- the ranking
//
// Everything on screen under "why this rank" comes out of this function, so
// the explanation can never drift from the score that actually ordered the
// list. Weights sum to 100.
//
// Corroboration leads: how many distinct outlets independently ran a story is
// the strongest available proxy for "this actually mattered", and it is the
// signal a reader cannot see for themselves from a single card.

const W_CORROBORATION = 45;
const W_SOURCE = 22;
const W_FRESHNESS = 18;
const W_SIGNAL = 15;

function scoreStory(story: Story, outlets: number, windowHours: WindowHours) {
  const hours = ageHours(story.publishedAt);

  // log scale, saturating around ten outlets — the 1->3 jump should matter far
  // more than 8->10.
  const corrobNorm = Math.min(1, Math.log(outlets + 1) / Math.log(11));
  const qualityWeight = sourceQualityWeight(story.sources?.[0]?.name);
  // Half-life is half the chosen window, so "fresh" means fresh *relative to
  // what you asked for* — in a 72h briefing a 12h-old story is still new.
  const freshNorm = Number.isFinite(hours)
    ? Math.exp(-hours * Math.LN2 / Math.max(1, windowHours / 2))
    : 0;
  const signalNorm = story.isBreaking ? 1 : story.isDeveloping ? 0.6 : story.isTrending ? 0.4 : 0;

  const factors: Factor[] = [
    {
      key: 'corroboration',
      label: 'Corroboration',
      detail: outlets === 1 ? 'single outlet so far' : `${outlets} outlets running it`,
      points: corrobNorm * W_CORROBORATION,
      max: W_CORROBORATION,
    },
    {
      key: 'source',
      label: 'Source weight',
      detail: `${story.sources?.[0]?.name ?? 'unknown source'} — ${tierLabel(qualityWeight)}`,
      points: qualityWeight * W_SOURCE,
      max: W_SOURCE,
    },
    {
      key: 'freshness',
      label: 'Freshness',
      detail: `${agoLabel(hours)}, in a ${windowHours}h window`,
      points: freshNorm * W_FRESHNESS,
      max: W_FRESHNESS,
    },
    {
      key: 'signal',
      label: 'Editorial signal',
      detail: story.isBreaking ? 'flagged breaking'
        : story.isDeveloping ? 'flagged developing'
        : story.isTrending ? 'trending'
        : 'no special flag',
      points: signalNorm * W_SIGNAL,
      max: W_SIGNAL,
    },
  ];

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, factors, outlets, hoursOld: hours };
}

/** A sentence built from whichever factors actually carried this story, so the
 *  explanation can never disagree with the score that produced the order. */
function whySentence(factors: Factor[], rank: number, story: Story, outlets: number, hours: number): string {
  const ordered = factors.slice().sort((a, b) => b.points - a.points);
  const strong = (f: Factor): string => {
    switch (f.key) {
      case 'corroboration':
        return outlets === 1
          ? 'just one outlet has it so far'
          : `${outlets} outlets are running it independently`;
      case 'source':
        return `${story.sources?.[0]?.name ?? 'the source'} is a ${tierLabel(sourceQualityWeight(story.sources?.[0]?.name))}`;
      case 'freshness':
        return `it broke ${agoLabel(hours)}`;
      case 'signal':
        return story.isBreaking ? 'it is flagged breaking'
          : story.isDeveloping ? 'it is still developing'
          : story.isTrending ? 'it is trending'
          : 'it carries no urgency flag';
    }
  };
  const weak = (f: Factor): string => {
    switch (f.key) {
      case 'corroboration': return 'no second outlet has picked it up yet';
      case 'source': return `${story.sources?.[0]?.name ?? 'the source'} is a ${tierLabel(sourceQualityWeight(story.sources?.[0]?.name))}`;
      case 'freshness': return `it is already ${agoLabel(hours)}`;
      case 'signal': return 'it carries no urgency flag';
    }
  };

  const lead = ordered[0];
  const second = ordered[1];
  const weakest = ordered[ordered.length - 1];
  // Only call out a limiter when one really is dragging the score down, and
  // never repeat the factor we just credited.
  const limiter = weakest.points < weakest.max * 0.2 && weakest.key !== lead.key && weakest.key !== second.key
    ? ` Not higher because ${weak(weakest)}.`
    : '';
  return `${strong(lead)}, and ${strong(second)}.${limiter}`;
}

// ---------------------------------------------------------------- data access

interface Candidate { story: Story; outlets: number }

async function fetchArea(topic: string): Promise<Candidate[]> {
  try {
    const res = await fetch(`${FEED_API}?topic=${topic}`);
    if (!res.ok) return [];
    const raw = await res.json();
    const items: ApiItem[] = Array.isArray(raw) ? raw : Array.isArray(raw?.feed) ? raw.feed : [];
    return items.flatMap<Candidate>(it => {
      const stories = it.type === 'cluster' ? (it.articles ?? []) : [it as unknown as Story];
      if (stories.length === 0) return [];
      // A cluster IS the corroboration: one event, several outlets. Collapse it
      // to its best-sourced member for display, but count distinct outlet names
      // across the whole cluster — reading sources.length off the single
      // representative reported 1 for almost everything, which flattened the
      // top weight to a constant and left the order effectively arbitrary.
      const rep = stories.slice().sort((a, b) => (b.sources?.length ?? 0) - (a.sources?.length ?? 0))[0];
      if (!rep) return [];
      const names = new Set<string>();
      for (const st of stories) for (const src of st.sources ?? []) if (src.name) names.add(src.name);
      return [{ story: rep, outlets: Math.max(1, names.size) }];
    });
  } catch {
    return [];
  }
}

function sourceTextFor(story: Story): string[] {
  const parts: string[] = [`${story.headline}. ${story.summary ?? ''}`.trim()];
  if (story.summaries?.keyHighlights) parts.push(story.summaries.keyHighlights);
  if (story.aiSummary) parts.push(story.aiSummary);
  return parts.filter(Boolean);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** 50-100 word summary. Retries the server's deliberate 503 load-shedding. */
async function fetchSummary(story: Story, signal: AbortSignal): Promise<string> {
  const url = story.sources?.[0]?.url || story.id || story.headline;
  for (let attempt = 0; attempt <= SUMMARY_RETRIES; attempt++) {
    if (signal.aborted) return '';
    try {
      const res = await fetch(AI_SUMMARY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          paragraphs: sourceTextFor(story),
          type: 'summary',
          maxWords: SUMMARY_MAX_WORDS,
          keyPoints: 3,
          publishedAt: story.publishedAt,
        }),
        signal,
      });
      if (res.status >= 500 || res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const wait = retryAfter ? retryAfter * 1000 : RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
        await sleep(wait);
        continue;
      }
      if (!res.ok) return '';
      const data: { summary?: string; bullets?: string[] } = await res.json();
      const text = (data.summary ?? '').trim();
      if (text) return text;
      if (data.bullets?.length) return data.bullets.slice(0, 2).join(' ');
      return '';
    } catch {
      if (signal.aborted) return '';
      await sleep(RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]);
    }
  }
  return '';
}

/** Fetch, filter, score, spread across areas, number 1..30. */
async function buildRanking(windowHours: WindowHours): Promise<{ items: RankedItem[]; poolSize: number }> {
  const perArea = await Promise.all(AREAS.map(async a => ({ area: a.key, stories: await fetchArea(a.topic) })));

  // The same event can cluster independently under two areas (an Apple
  // earnings story under both Tech and Business). CLAIM_ORDER decides the
  // winner, so a story keeps its subject area rather than its urgency flag.
  const seen = new Set<string>();
  const pool: Array<{ story: Story; area: string; outlets: number }> = [];
  const byClaim = perArea.slice().sort(
    (a, b) => CLAIM_ORDER.indexOf(a.area) - CLAIM_ORDER.indexOf(b.area));
  for (const { area, stories } of byClaim) {
    for (const { story, outlets } of stories) {
      if (isBlockedHeadline(story.headline, story.sources?.[0]?.name)) continue;
      const hours = ageHours(story.publishedAt);
      if (!Number.isFinite(hours) || hours > windowHours) continue;
      const id = identityOf(story);
      if (seen.has(id)) continue;
      seen.add(id);
      pool.push({ story, area, outlets });
    }
  }

  const scored = pool
    .map(({ story, area, outlets }) => ({ story, area, ...scoreStory(story, outlets, windowHours) }))
    .sort((a, b) => b.score - a.score);

  // Pass one honours the per-area cap; pass two tops the list up from whatever
  // is left if the caps kept us short.
  const chosen: typeof scored = [];
  const areaCount: Record<string, number> = {};
  for (const cand of scored) {
    if (chosen.length >= TARGET_COUNT) break;
    const n = areaCount[cand.area] ?? 0;
    if (n >= PER_AREA_CAP) continue;
    areaCount[cand.area] = n + 1;
    chosen.push(cand);
  }
  if (chosen.length < TARGET_COUNT) {
    for (const cand of scored) {
      if (chosen.length >= TARGET_COUNT) break;
      if (chosen.includes(cand)) continue;
      chosen.push(cand);
    }
  }

  const items: RankedItem[] = chosen.map((c, i) => ({
    id: identityOf(c.story),
    rank: i + 1,
    story: c.story,
    area: c.area,
    score: c.score,
    factors: c.factors,
    why: whySentence(c.factors, i + 1, c.story, c.outlets, c.hoursOld),
    outlets: c.outlets,
    hoursOld: c.hoursOld,
    aiSummary: '',
    summaryFailed: false,
  }));

  return { items, poolSize: pool.length };
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
}: { item: RankedItem; onOpen: (s: Story) => void }) {
  const [showFactors, setShowFactors] = useState(false);
  const [imgError, setImgError] = useState(false);
  const def = AREA_BY_KEY[item.area];
  const accent = def?.accent ?? '#4A90D9';
  const source = item.story.sources?.[0]?.name ?? '';
  const image = !imgError && item.story.imageUrl ? item.story.imageUrl : FALLBACK_IMG;

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
        onClick={() => onOpen(item.story)}
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
            {item.story.headline}
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
            {item.story.summary
              ? `${item.story.summary.slice(0, 260)} (source text — AI summary unavailable)`
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
  const [phase, setPhase] = useState<'idle' | 'ranking' | 'summarising' | 'done'>('idle');
  const [written, setWritten] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  /** Fill in summaries for the given items, a couple at a time, writing each
   *  one through to state as it lands so the list fills in rather than blocking. */
  const generateSummaries = useCallback(async (all: RankedItem[], todo: RankedItem[], signal: AbortSignal) => {
    setPhase('summarising');
    const alreadyDone = all.length - todo.length;
    setWritten(alreadyDone);
    let done = alreadyDone;
    let cursor = 0;

    const worker = async () => {
      for (;;) {
        if (signal.aborted) return;
        const index = cursor++;
        if (index >= todo.length) return;
        const item = todo[index];
        const text = await fetchSummary(item.story, signal);
        if (signal.aborted) return;
        item.aiSummary = text;
        item.summaryFailed = !text;
        done++;
        setWritten(done);
        setSnapshot(prev => (prev ? { ...prev, items: [...prev.items] } : prev));
        await sleep(SUMMARY_GAP_MS);
      }
    };

    await Promise.all(Array.from({ length: SUMMARY_CONCURRENCY }, worker));
    if (signal.aborted) return;
    setPhase('done');
  }, []);

  const build = useCallback(async (hours: WindowHours, force: boolean) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);

    if (!force) {
      try {
        const raw = localStorage.getItem(cacheKeyFor(hours));
        if (raw) {
          const parsed: Snapshot = JSON.parse(raw);
          if (parsed.items?.length) {
            setSnapshot(parsed);
            setWritten(parsed.items.filter(i => i.aiSummary || i.summaryFailed).length);
            setPhase('done');
            return;
          }
        }
      } catch { /* fall through to a fresh build */ }
    }

    setPhase('ranking');
    setSnapshot(null);
    try {
      const { items, poolSize } = await buildRanking(hours);
      if (ctrl.signal.aborted) return;
      if (items.length === 0) {
        setError(`No stories published in the last ${hours}h cleared the filters. Try a longer window.`);
        setPhase('done');
        return;
      }
      const snap: Snapshot = { builtAt: Date.now(), windowHours: hours, items, poolSize };
      setSnapshot(snap);
      await generateSummaries(items, items, ctrl.signal);
      if (ctrl.signal.aborted) return;
      try { localStorage.setItem(cacheKeyFor(hours), JSON.stringify({ ...snap, items })); } catch { /* quota */ }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(`Could not build the briefing: ${e instanceof Error ? e.message : String(e)}`);
        setPhase('done');
      }
    }
  }, [generateSummaries]);

  useEffect(() => {
    build(windowHours, false);
    return () => abortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickWindow = useCallback((h: WindowHours) => {
    if (h === windowHours) return;
    setWindowHours(h);
    localStorage.setItem('@briefing_window', String(h));
    build(h, false);
  }, [windowHours, build]);

  /** Top up only the blanks. A full rebuild re-spends the AI budget on the
   *  summaries that already worked; this does not. */
  const retryFailed = useCallback(async () => {
    const snap = snapshot;
    if (!snap) return;
    const todo = snap.items.filter(i => i.summaryFailed);
    if (todo.length === 0) return;
    for (const i of todo) i.summaryFailed = false;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await generateSummaries(snap.items, todo, ctrl.signal);
    if (ctrl.signal.aborted) return;
    try { localStorage.setItem(cacheKeyFor(snap.windowHours), JSON.stringify(snap)); } catch { /* quota */ }
  }, [snapshot, generateSummaries]);

  /** Abort the run in flight and keep whatever already landed. A generation
   *  takes a couple of minutes and spends real AI budget, so being unable to
   *  call it off is worse than a half-filled list. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('done');
    setSnapshot(prev => {
      if (!prev) return prev;
      for (const i of prev.items) if (!i.aiSummary) i.summaryFailed = true;
      try { localStorage.setItem(cacheKeyFor(prev.windowHours), JSON.stringify(prev)); } catch { /* quota */ }
      return { ...prev, items: [...prev.items] };
    });
  }, []);

  const regenerate = useCallback(() => {
    try { localStorage.removeItem(cacheKeyFor(windowHours)); } catch { /* ignore */ }
    build(windowHours, true);
  }, [windowHours, build]);

  const openArticle = useCallback((s: Story) => {
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
        sourceBias: s.sourceBias,
      },
    });
  }, [navigate]);

  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of snapshot?.items ?? []) counts[it.area] = (counts[it.area] ?? 0) + 1;
    return counts;
  }, [snapshot]);

  const busy = phase === 'ranking' || phase === 'summarising';
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

        {/* Progress / status */}
        {busy && (
          <div style={{
            background: '#101010', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14, padding: '12px 14px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {phase === 'ranking' ? 'Ranking stories…' : 'Writing AI summaries…'}
              </span>
              <span style={{ color: '#6E6E73', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                {phase === 'summarising' ? `${written} / ${total}` : ''}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{
                width: phase === 'ranking' ? '12%' : `${total ? Math.round((written / total) * 100) : 0}%`,
                height: '100%', borderRadius: 2, background: '#4A90D9',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ color: '#5A5A5E', fontSize: 9.5, marginTop: 8, lineHeight: 1.45 }}>
              All {total || TARGET_COUNT} summaries are written up front, so every card is
              complete before you scroll. Two at a time, to stay inside the AI rate limit.
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

        {/* Summaries that never came back */}
        {snapshot && !busy && failedCount > 0 && (
          <div style={{
            background: 'rgba(255,159,10,0.07)', border: '1px solid rgba(255,159,10,0.25)',
            borderRadius: 14, padding: '12px 14px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, color: '#FFC56E', fontSize: 11.5, lineHeight: 1.5 }}>
              {failedCount} of {total} summaries didn’t come back — the AI provider rate-limited
              them. Retrying only re-requests those {failedCount}.
            </div>
            <button
              onClick={retryFailed}
              style={{
                flexShrink: 0, background: 'rgba(255,159,10,0.16)',
                border: '1px solid rgba(255,159,10,0.4)', color: '#FFC56E',
                borderRadius: 999, padding: '7px 13px', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              Retry {failedCount}
            </button>
          </div>
        )}

        {/* Spread + built-at */}
        {snapshot && !busy && (
          <div style={{
            background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 14, padding: '11px 13px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {AREAS.filter(a => areaCounts[a.key]).map(a => (
                <span key={a.key} style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                  color: a.accent, background: `${a.accent}14`,
                  border: `1px solid ${a.accent}30`,
                  padding: '3px 8px', borderRadius: 999,
                }}>
                  {a.label} {areaCounts[a.key]}
                </span>
              ))}
            </div>
            <div style={{ color: '#5A5A5E', fontSize: 9.5, lineHeight: 1.45 }}>
              Built {new Date(snapshot.builtAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} from{' '}
              {snapshot.poolSize} candidate stories · ranked on corroboration {W_CORROBORATION},
              source weight {W_SOURCE}, freshness {W_FRESHNESS}, editorial signal {W_SIGNAL}.
              Tap any “why” row to see the breakdown.
            </div>
          </div>
        )}

        {/* The list */}
        {snapshot?.items.map(item => (
          <BriefingCard key={`${item.id}-${item.rank}`} item={item} onOpen={openArticle} />
        ))}

        {!snapshot && !busy && !error && (
          <div style={{ color: '#6E6E73', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>
            Nothing to brief yet.
          </div>
        )}
      </div>
    </div>
  );
}
