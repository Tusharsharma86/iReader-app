import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Story } from '../types';
import { useTabBarActions } from '../contexts/TabBarContext';
import { useSettings } from '../contexts/SettingsContext';
import { darken, lighten, getArticleColor } from '../utils/colors';
import { FALLBACK_IMG } from '../utils/fallback';
import { trackDeepDive } from '../utils/personalization';
import { toggleFollow, isFollowing } from '../utils/followStore';

const FEED_API_BASE = 'https://ireader.onrender.com/api/news/feed';
// Topic rotation for infinite scroll — once we run low on cards we pull the
// next topic, dedupe against existing items, and append.
const TOPIC_QUEUE = [
  'breaking',
  'technology',
  'india-politics',
  'geopolitics',
  'markets',
  'business',
];
const DEEPDIVE_API = 'https://ireader.onrender.com/api/news/deepdive';
const CACHE_PREFIX = '@deepdive_v9_'; // v9 — cache cleared
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FEED_LIST_CACHE = '@aifeed_list_v6'; // v6 — cache cleared

const DEEPDIVE_SYSTEM_PROMPT = `You are an experienced journalist and editor writing for a modern mobile news app.

Your task is to synthesize multiple articles covering the same story into a single, clear, engaging narrative.

OBJECTIVES
* Help readers understand the story
* Surface the most important facts, numbers, and implications.
* Eliminate repetition across sources.
* Present one coherent narrative instead of a source-by-source summary.

OUTPUT
1. Key Insight - As is
2. Key Metrics - Extract up to 5 of the most important numbers, dates, percentages, or facts. Only include metrics that materially improve understanding.
3. Narrative - Write a concise, flowing story. Combine context, significance, risks, and outlook naturally. Use short paragraphs optimized for mobile reading.

EDITORIAL RULES
* Prioritize facts over opinions.
* Avoid repeating entities, numbers, or concepts.
* Do not describe what each publication reported unless there is meaningful disagreement.
* Remove tangential information that does not support the central story.
* Every paragraph must add new information.
* Prefer active voice and concrete language.
* Explain why the story matters without explicitly using phrases like "Why it matters."

STYLE
* Similar to Reuters, Bloomberg, Financial Times, or The Economist.
* Clear, intelligent, and concise.
* Informative rather than sensational.
* Avoid generic AI phrases, filler, and unnecessary summaries.

QUALITY CHECK
Before returning: Is there a single dominant narrative? Have all repeated facts been removed? Are the key numbers surfaced separately? Can a reader understand the story in under one minute? Does the final paragraph leave the reader with the most important implication or likely outcome?`;

const VIOLET = '#b994ff';
const GOLD   = '#FFC542';

interface TldrSection { heading: string; bullets: string[]; }
interface StorySection { heading: string; body: string; }
interface DeepDiveData {
  tldr: string[];
  tldrSections?: TldrSection[];
  narrative: string;
  storySections?: StorySection[];
  degraded?: boolean;
  insight: string;
  keyMetrics?: string[];
  questions: string[];
  tags: string[];
  keyPeople?: string[];
  keyCompanies?: string[];
  topics?: string[];
  articlesRead?: number;
  articlesAttempted?: number;
  confidence?: number;
}

const METRIC_RE = /(?:\$[\d,.]+[BMKTbmkt]?\b|\d[\d,.]*\s*(?:billion|million|trillion|percent|%|bps|basis points)\b|\d{1,2}(?:\/\d{1,2})?(?:\/\d{2,4})|\b(?:Q[1-4]|FY)\s*\d{2,4})/gi;
function extractMetrics(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    if (!METRIC_RE.test(s)) continue;
    METRIC_RE.lastIndex = 0;
    const clean = s.replace(/\*\*/g, '').trim();
    if (clean.length > 120 || clean.length < 15) continue;
    const key = clean.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 5) break;
  }
  return out;
}

interface FeedItem {
  primary: Story;
  allStories: Story[];
  sources: { name: string; url: string }[];
  collection?: boolean; // server theme collection (browse rail), NOT a same-event cluster
}

function readCache(id: string, depth = 'standard'): DeepDiveData | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + depth + ':' + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}
function writeCache(id: string, data: DeepDiveData, depth = 'standard') {
  try { localStorage.setItem(CACHE_PREFIX + depth + ':' + id, JSON.stringify({ ...data, at: Date.now() })); } catch {}
}

// Favicon URL from source name (mapped) or first article URL.
const AIF_SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':'techcrunch.com','The Verge':'theverge.com','Ars Technica':'arstechnica.com','Wired':'wired.com','Hacker News':'news.ycombinator.com','9to5Mac':'9to5mac.com','9to5Google':'9to5google.com','MIT Tech Review':'technologyreview.com','Engadget':'engadget.com','VentureBeat':'venturebeat.com','The Next Web':'thenextweb.com','BBC World':'bbc.co.uk','NYT World':'nytimes.com','The Guardian':'theguardian.com','NPR World':'npr.org','Al Jazeera':'aljazeera.com','NDTV':'ndtv.com','India Today':'indiatoday.in','The Print':'theprint.in','The Quint':'thequint.com','CNBC TV18':'cnbctv18.com','Scroll.in':'scroll.in','Economic Times':'economictimes.indiatimes.com','Livemint':'livemint.com','Mint':'livemint.com','Inc42':'inc42.com','Indian Express':'indianexpress.com','Reuters':'reuters.com','Bloomberg':'bloomberg.com','CNN':'cnn.com',
};
function aifFaviconFromStory(name: string, url?: string): string {
  const mapped = AIF_SOURCE_DOMAINS[name];
  let fromUrl = '';
  if (url) { try { fromUrl = new URL(url).hostname.replace(/^www\./, ''); } catch {} }
  const domain = mapped || fromUrl;
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : '';
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  try {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins}M AGO`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}H AGO`;
    return `${Math.round(hrs / 24)}D AGO`;
  } catch { return ''; }
}

interface ApiItem { type?: string; articles?: Story[]; topicTitle?: string; collection?: boolean; }

// Drop Hindi/Devanagari headlines and mobile-phone discount/deal stories.
const PHONE_RE = /\b(phone|smartphone|mobile|iphone|android|samsung|xiaomi|redmi|oneplus|oppo|vivo|realme|motorola|moto|nokia|pixel|infinix|tecno|poco|nothing phone)\b/i;
const DEAL_RE = /\b(discount|deal|deals|offer|offers|sale|price drop|price cut|cashback|emi|exchange offer|bank offer|coupon|lowest price|best price|under ₹|under rs\.?|under inr|% off|percent off|flat \d+|flipkart|amazon (sale|prime day|great)|big billion)\b/i;
function isExcluded(s?: { headline?: string; summary?: string; sources?: { name?: string }[] }): boolean {
  if (!s) return false;
  const text = `${s.headline || ''} ${s.summary || ''}`;
  if (/[ऀ-ॿ]/.test(text)) return true; // Devanagari (Hindi)
  if (PHONE_RE.test(text) && DEAL_RE.test(text)) return true;
  // NYT recurring "Here's the Latest" live-briefing roundup — not a story.
  if (/nyt|new york times/i.test(s.sources?.[0]?.name ?? '') && /here.?s the latest|here are the latest/i.test(s.headline ?? '')) return true;
  return false;
}

// Trust the server — same clustering logic as the main feed. A server cluster
// (multiple outlets on one event) becomes one card with its articles intact.
// A singleton article becomes one card. NO client-side merging, no headline-
// similarity dedupe, no cross-topic gather — those have caused every clustering
// bug in this feed. Theme collections (browse rails) are filtered out at the
// load site because the AI Feed UI doesn't fit them; they live on the main feed.
function parseServerFeed(items: ApiItem[]): FeedItem[] {
  const out: FeedItem[] = [];
  for (const it of items) {
    if (it.type === 'cluster' && Array.isArray(it.articles) && it.articles.length > 0) {
      const primary = it.articles[0];
      const sources = dedupeSources(it.articles.flatMap(a => a.sources ?? []));
      out.push({ primary, allStories: it.articles, sources, collection: Boolean(it.collection) });
    } else {
      const s = it as unknown as Story;
      if (s.headline) out.push({ primary: s, allStories: [s], sources: dedupeSources(s.sources ?? []), collection: false });
    }
  }
  return out;
}

function rankFeedItems(items: FeedItem[]): FeedItem[] {
  if (items.length === 0) return items;
  return items
    .map(it => {
      const sourceCount = it.sources.length || 1;
      const hoursOld = (Date.now() - new Date(it.primary.publishedAt ?? 0).getTime()) / 3_600_000;
      const importanceScore = sourceCount * 3;
      const breakingBonus = it.primary.isBreaking ? 10 : 0;
      const clusterBonus = it.allStories.length >= 3 ? 4 : it.allStories.length >= 2 ? 2 : 0;
      const velocityScore = Math.min(sourceCount / Math.max(hoursOld, 0.5), 10) * 2;
      const freshnessMult = hoursOld <= 24
        ? Math.exp(-hoursOld * Math.LN2 / 12)
        : Math.exp(-24 * Math.LN2 / 12) * Math.exp(-(hoursOld - 24) * Math.LN2 / 6);
      const freshBonus = Math.max(0, (6 - hoursOld) / 6) * 6;
      const score = (importanceScore + breakingBonus + clusterBonus) * freshnessMult
        + velocityScore + freshBonus;
      return { item: it, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);
}

function dedupeSources(arr: { name: string; url: string }[]): { name: string; url: string }[] {
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  for (const s of arr) {
    const k = (s.name || '').toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: s.name, url: s.url });
  }
  return out;
}

export default function AIFeedScreen() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedItem, setOpenedItem] = useState<FeedItem | null>(null);
  const [topicCursor, setTopicCursor] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string>(TOPIC_QUEUE[0]);
  const { reportScroll, hide: hideTabBar, show: showTabBar } = useTabBarActions();


  // Deep Dive is an in-page overlay (not a route), and its z-index can't beat
  // the TabBar because the bar lives in a higher root stacking context. So
  // explicitly hide the bar while the overlay is open (same pattern as the
  // Article reader), and restore it on close.
  useEffect(() => {
    if (openedItem) hideTabBar();
    else showTabBar();
  }, [openedItem, hideTabBar, showTabBar]);

  // Listen for AI Feed tab-tap → jump to first card.
  useEffect(() => {
    const handler = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.addEventListener('aifeed-scroll-top', handler);
    return () => window.removeEventListener('aifeed-scroll-top', handler);
  }, []);
  // useTabBarActions returns a stable reference — calling reportScroll on every
  // scroll tick no longer re-renders this component (only TabBar consumes visible).
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<FeedItem[]>([]);
  itemsRef.current = items;

  // Load one topic — same as main feed: trust the server's clusters as-is,
  // dedupe only by article ID (so the same article doesn't appear twice on
  // load-more), drop theme collections (browse rails don't fit the AI Feed UX).
  // No client-side merging. No cross-topic gather. No fuzzy headline dedupe.
  const loadTopic = useCallback(async (topicIdx: number, isInitial: boolean) => {
    const topic = TOPIC_QUEUE[topicIdx % TOPIC_QUEUE.length];
    if (isInitial) setLoading(true); else setLoadingMore(true);
    try {
      const r = await fetch(`${FEED_API_BASE}?topic=${topic}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = await r.json();
      const rawItems: ApiItem[] = Array.isArray(raw) ? raw : Array.isArray(raw?.feed) ? raw.feed : [];
      const incoming = parseServerFeed(rawItems)
        .filter(it => !it.collection) // theme collections live on the main feed only
        .filter(it => it.primary.headline && it.primary.publishedAt)
        .filter(it => !isExcluded(it.primary) && !it.allStories.every(isExcluded));

      const existingIds = new Set(itemsRef.current.map(it => it.primary.id));
      const newOnes = incoming.filter(it => !existingIds.has(it.primary.id));
      if (newOnes.length === 0 && !isInitial) { setExhausted(true); return; }

      setItems(prev => {
        const next = isInitial ? rankFeedItems(newOnes) : [...prev, ...newOnes];
        if (isInitial) { try { localStorage.setItem(FEED_LIST_CACHE, JSON.stringify({ items: next, at: Date.now() })); } catch {} }
        return next;
      });
      if (isInitial) setError(null);
    } catch (e) {
      if (isInitial) setError(String(e));
    } finally {
      if (isInitial) setLoading(false); else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    // Pre-warm Render
    try { fetch('https://ireader.onrender.com/api/news/sources', { cache: 'no-store' }).catch(() => {}); } catch {}
    // Stale-while-revalidate: render cached list instantly (any age), refresh
    // in background if older than 10 min. Avoids a skeleton on every visit.
    try {
      const raw = localStorage.getItem(FEED_LIST_CACHE);
      if (raw) {
        const c = JSON.parse(raw) as { items: FeedItem[]; at: number };
        if (Array.isArray(c.items) && c.items.length > 0) {
          setItems(c.items);
          setLoading(false);
          if (Date.now() - c.at > 10 * 60_000) setTimeout(() => loadTopic(0, false), 300);
          return;
        }
      }
    } catch {}
    loadTopic(0, true);
  }, [loadTopic]);

  // ── Pull-to-refresh ─────────────────────────────────────────────────────
  const PULL_THRESHOLD = 80;
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0 || refreshing) return;
    pullStartY.current = e.touches[0].clientY;
  }, [refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullStartY.current == null) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0) {
      // dampen so it feels like rubber
      setPull(Math.min(120, dy * 0.5));
      // Stop snap-scroll from intercepting once we're clearly pulling
      if (dy > 10 && e.cancelable) e.preventDefault();
    } else {
      // User reversed direction — abandon the pull, let snap take over
      pullStartY.current = null;
      setPull(0);
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (pullStartY.current == null) return;
    const triggered = pull >= PULL_THRESHOLD;
    pullStartY.current = null;
    if (triggered) {
      setExhausted(false);
      setRefreshing(true);
      setItems([]);
      const idx = Math.max(0, TOPIC_QUEUE.indexOf(activeTopic));
      await loadTopic(idx, true);
      setRefreshing(false);
    }
    setPull(0);
  }, [pull, loadTopic, activeTopic]);

  // Tab-bar visibility runs every frame (cheap — stable callback, no rerenders).
  // Infinite-scroll bottom check throttled to 200ms.
  const lastScrollCheck = useRef(0);
  const handleFeedScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    reportScroll(el.scrollTop);
    if (loadingMore || exhausted) return;
    const now = Date.now();
    if (now - lastScrollCheck.current < 200) return;
    lastScrollCheck.current = now;
    const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight);
    if (remaining < el.clientHeight * 3) {
      // Stay within the user's selected topic — no auto-cycle into others.
      loadTopic(topicCursor, false);
    }
  }, [reportScroll, loadingMore, exhausted, topicCursor, loadTopic]);

  return (
    <div style={{
      height: '100%', position: 'relative',
      background: 'radial-gradient(at 0% 0%, #1a1a2e44 0%, transparent 50%), #050507',
      color: '#fff',
      overflow: 'hidden',
    }}>
      {/* Header — pill is now a dropdown for topic filtering */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px)) 16px 14px',
        background: 'linear-gradient(180deg, rgba(5,5,7,0.85) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 10,
        paddingRight: 76, /* leave room for the per-card counter at top-right */
      }}>
        <TopicPill
          current={activeTopic}
          onChange={(t) => {
            setActiveTopic(t);
            setItems([]);
            const idx = TOPIC_QUEUE.indexOf(t) >= 0 ? TOPIC_QUEUE.indexOf(t) : 0;
            setTopicCursor(idx);
            setExhausted(false);
            loadTopic(idx, true);
          }}
        />
      </div>

      {/* Pull-to-refresh indicator (renders during pull/refresh, fades out otherwise) */}
      {(pull > 0 || refreshing) && (
        <div style={{
          position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
          left: 0, right: 0, zIndex: 6,
          display: 'flex', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 999,
            background: 'rgba(20,20,28,0.75)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
            transform: `scale(${Math.min(1, pull / PULL_THRESHOLD || 1)})`,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.15)', borderTopColor: VIOLET,
              animation: refreshing ? 'aifspin 0.8s linear infinite' : 'none',
              transform: !refreshing ? `rotate(${(pull / PULL_THRESHOLD) * 360}deg)` : undefined,
              transition: refreshing ? undefined : 'transform 0.05s linear',
            }} />
            {refreshing ? 'REFRESHING…' : pull >= PULL_THRESHOLD ? 'RELEASE TO REFRESH' : 'PULL TO REFRESH'}
          </div>
        </div>
      )}

      {loading ? (
        <CenteredLoading text="Loading breaking news…" />
      ) : error ? (
        <CenteredError text={error} />
      ) : items.length === 0 ? (
        <CenteredLoading text="No stories available." />
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleFeedScroll}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            height: '100%', overflowY: 'auto',
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
            background: '#080808',
            // Block Chrome's native pull-to-refresh from intercepting our gesture
            overscrollBehaviorY: 'contain',
            transform: `translateY(${pull}px)`,
            transition: pullStartY.current == null ? 'transform 0.25s ease-out' : 'none',
            willChange: 'transform',
          }}
        >
          {items.map((item, i) => (
            <FullPreviewCard
              key={item.primary.id}
              item={item}
              index={i}
              total={items.length}
              onOpen={() => { setOpenedItem(item); trackDeepDive(item.primary); }}
            />
          ))}
          {loadingMore && (
            <div style={{
              height: '100%', minHeight: '100%',
              scrollSnapAlign: 'start',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12,
              background: '#050507',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.08)', borderTopColor: VIOLET,
                animation: 'aifspin 0.8s linear infinite',
              }} />
              <div style={{ color: '#888', fontSize: 12, fontWeight: 600, letterSpacing: 0.4 }}>
                Loading more stories…
              </div>
            </div>
          )}
          {exhausted && (
            <div style={{
              height: '100%', minHeight: '100%',
              scrollSnapAlign: 'start',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8, padding: 24, textAlign: 'center',
              background: '#050507',
            }}>
              <div className="aif-celebrate" style={{ fontSize: 38 }}>🎉</div>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>You're all caught up</div>
              <div style={{ color: '#666', fontSize: 12 }}>Swipe back to revisit any story.</div>
            </div>
          )}
        </div>
      )}

      {/* Full-screen deep dive overlay */}
      {openedItem && (
        <DeepDiveOverlay
          key={openedItem.primary.id}
          item={openedItem}
          onClose={() => setOpenedItem(null)}
          onOpenRelated={(s) => setOpenedItem({ primary: s, allStories: [s], sources: dedupeSources(s.sources ?? []) })}
        />
      )}

      <style>{`
        @keyframes aifTextBounce { 0% { transform: translateY(24px); opacity: 0; } 60% { transform: translateY(-4px); opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
        .aif-text-bounce { animation: aifTextBounce 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        /* Tap feedback — dim + tiny scale on press. CSS-only so no React rerenders.
           Skip off-screen card paint with content-visibility. */
        .aif-card { transition: filter 0.18s ease, transform 0.18s cubic-bezier(0.4, 0, 0.2, 1); content-visibility: auto; contain-intrinsic-size: calc(100vh - 80px); }
        .aif-card:active { filter: brightness(0.88); transform: scale(0.992); }
        @keyframes aifCelebrate { 0% { transform: scale(0.5) rotate(-20deg); opacity: 0; } 60% { transform: scale(1.25) rotate(8deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        .aif-celebrate { animation: aifCelebrate 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @keyframes aifCounterPop { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        .aif-counter-pop { animation: aifCounterPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
      `}</style>
    </div>
  );
}

// ── Full-bleed image card — one per swipe, whole card tappable ──────────────

function FullPreviewCard({ item, index, total, onOpen }: {
  item: FeedItem; index: number; total: number; onOpen: () => void;
}) {
  const story = item.primary;
  const dominant = useMemo(() => getArticleColor(story.id || story.headline), [story.id, story.headline]);
  const accent = useMemo(() => lighten(dominant, 0.55), [dominant]);
  const sourceName = item.sources[0]?.name ?? story.sources?.[0]?.name ?? 'Unknown';
  const extraSources = Math.max(0, item.sources.length - 1);
  const hasCachedDeepDive = !!readCache(story.id);

  // Track touch displacement so a vertical swipe doesn't fire a tap.
  const touchRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, moved: false };
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - touchRef.current.x);
    const dy = Math.abs(t.clientY - touchRef.current.y);
    if (dx > 10 || dy > 10) touchRef.current.moved = true;
  }, []);
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (touchRef.current?.moved) {
      e.preventDefault();
      e.stopPropagation();
      touchRef.current = null;
      return;
    }
    try { navigator.vibrate?.(10); } catch {}
    onOpen();
  }, [onOpen]);

  return (
    <div
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      className="aif-card"
      style={{
        height: 'calc(100vh - 80px)', minHeight: 'calc(100vh - 80px)',
        scrollSnapAlign: 'start', scrollSnapStop: 'always',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        background: dominant,
        cursor: 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Full-bleed image (or gradient fallback) */}
      {story.imageUrl ? (
        <img
          src={story.imageUrl}
          alt=""
          loading={index < 2 ? 'eager' : 'lazy'}
          decoding="async"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover',
          }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: '#05060c' }}>
          <img src={FALLBACK_IMG} alt="" loading={index < 2 ? 'eager' : 'lazy'} decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(135deg, ${dominant}33 0%, transparent 45%, ${accent}1f 100%)`,
          }} />
        </div>
      )}

      {/* Scrim — dark at top + heavier at bottom for text readability */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.1) 25%, rgba(0,0,0,0.15) 50%, rgba(5,5,7,0.75) 80%, rgba(5,5,7,0.95) 100%)',
      }} />

      {/* Counter pill — solid rgba so we skip backdrop-filter cost while scrolling */}
      <div key={`counter-${index}`} className="aif-counter-pop" style={{
        position: 'absolute', top: 'max(14px, calc(env(safe-area-inset-top, 0px) + 10px))', right: 14, zIndex: 5,
        padding: '5px 10px', borderRadius: 999,
        background: 'rgba(15,15,20,0.78)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
      }}>
        {index + 1} / {total}
      </div>

      {/* Cached badge — top-left if deep dive ready */}
      {hasCachedDeepDive && (
        <div style={{
          position: 'absolute', top: 'max(14px, calc(env(safe-area-inset-top, 0px) + 10px))', left: 14, zIndex: 5,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 10px', borderRadius: 999,
          background: 'rgba(20,50,30,0.78)',
          border: '1px solid rgba(34,197,94,0.4)',
          color: '#86efac', fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
        }}>
          <SparkleIcon color="#86efac" size={9} /> READY
        </div>
      )}

      {/* Text overlay — bottom */}
      <div className="aif-text-bounce" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '0 22px 110px',
        display: 'flex', flexDirection: 'column', gap: 12,
        zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, color: accent, fontSize: 11, fontWeight: 800, letterSpacing: 1.4 }}>
          <span>{sourceName.toUpperCase()}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>·</span>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>{timeAgo(story.publishedAt)}</span>
        </div>

        <h2 style={{
          margin: 0, color: '#fff', fontSize: 26, fontWeight: 800,
          lineHeight: 1.2, letterSpacing: -0.5,
          textShadow: '0 4px 24px rgba(0,0,0,0.7)',
        }}>{story.headline}</h2>

        {story.summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {story.summary.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3).map((bullet, bi) => (
              <div key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                <div style={{ width: 4, height: 4, borderRadius: 2, marginTop: 6, background: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
                <p style={{
                  margin: 0, color: '#e5e5e5', fontSize: 12, lineHeight: 1.5,
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  textShadow: '0 2px 12px rgba(0,0,0,0.55)',
                }}>{bullet.trim()}</p>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Swipe hint — bottom centered, very subtle */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 18,
        textAlign: 'center', zIndex: 2,
        color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
      }}>↑ SWIPE FOR NEXT</div>
    </div>
  );
}

// ── Deep dive overlay (renders only on tap) ──────────────────────────────────

function DeepDiveOverlay({ item, onClose, onOpenRelated }: { item: FeedItem; onClose: () => void; onOpenRelated?: (s: Story) => void }) {
  const story = item.primary;
  // Customize → Deep Dive section toggles + depth.
  const { showDeepDiveEntities, showDeepDiveCurious, deepDiveDepth, fontSize: globalFontSize } = useSettings();
  // Scale Deep Dive body text by the user's Article font size. Headers/labels
  // stay branded; only reading content scales.
  const ddScale = globalFontSize === 'Small' ? 0.88
    : globalFontSize === 'Large' ? 1.12
    : globalFontSize === 'XLarge' ? 1.24
    : 1;
  const dominant = useMemo(() => getArticleColor(story.id || story.headline), [story.id, story.headline]);
  const accent = useMemo(() => lighten(dominant, 0.55), [dominant]);
  const [data, setData] = useState<DeepDiveData | null>(() => readCache(story.id, deepDiveDepth));
  const [stage, setStage] = useState<'generating' | 'done' | 'error'>(data ? 'done' : 'generating');
  const [error, setError] = useState<string | null>(null);
  const [showColdHint, setShowColdHint] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [following, setFollowing] = useState(() => isFollowing(story.id));

  // Re-trigger the Deep Dive fetch (after a failure). data is still null on
  // error, so bumping reloadKey re-runs the load effect.
  const reload = useCallback(() => {
    setError(null);
    setShowColdHint(false);
    setStage('generating');
    setReloadKey(k => k + 1);
  }, []);

  // Pre-highlight TL;DR + full story ONCE per data load. Without this, the
  // swipe-down drag (setState on every touch-move) re-ran highlightEntities
  // over the whole long story each frame → black/laggy/unresponsive overlay.
  const tagList = useMemo(
    () => [...(data?.tags ?? []), ...(data?.keyPeople ?? []), ...(data?.keyCompanies ?? [])],
    [data],
  );
  const metrics = useMemo(() => {
    if (!data) return [];
    if (data.keyMetrics && data.keyMetrics.length > 0) return data.keyMetrics.slice(0, 5);
    const pool = [
      ...(data.tldr ?? []),
      ...(data.tldrSections?.flatMap(s => s.bullets) ?? []),
      data.narrative ?? '',
    ].join(' ');
    return extractMetrics(pool);
  }, [data]);
  const tldrBody = useMemo(() => {
    if (!data) return null;
    if (data.tldrSections && data.tldrSections.length > 0) {
      return data.tldrSections.map((section, si) => (
        <div key={si} style={{ marginTop: si > 0 ? 20 : 0, paddingTop: si > 0 ? 16 : 0, borderTop: si > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 800, letterSpacing: 1.4, marginBottom: 8, textTransform: 'uppercase' }}>{section.heading}</div>
          {section.bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '7px 0', alignItems: 'flex-start' }}>
              <div style={{ width: 6, height: 6, borderRadius: 4, marginTop: 9, background: VIOLET, flexShrink: 0 }} />
              <div style={{ flex: 1, color: '#cfcfd8', fontSize: 15.5 * ddScale, lineHeight: 1.6 }}>{highlightEntities(b, tagList, accent)}</div>
            </div>
          ))}
        </div>
      ));
    }
    return data.tldr.map((b, i) => (
      <div key={i} style={{ display: 'flex', gap: 12, padding: '7px 0', alignItems: 'flex-start' }}>
        <div style={{ width: 6, height: 6, borderRadius: 4, marginTop: 9, background: VIOLET, flexShrink: 0 }} />
        <div style={{ flex: 1, color: '#cfcfd8', fontSize: 15.5 * ddScale, lineHeight: 1.6 }}>{highlightEntities(b, tagList, accent)}</div>
      </div>
    ));
  }, [data, tagList, accent, ddScale]);
  const narrativeBody = useMemo(() => {
    if (!data) return null;
    const para = (p: string, key: string) => (
      <p key={key} style={{ margin: '0 0 16px', color: '#c8c8d4', fontSize: 16 * ddScale, lineHeight: 1.7, letterSpacing: 0.05 }}>{highlightEntities(p, tagList, accent)}</p>
    );
    // Use narrative field — designed as flowing prose. Fall back to
    // concatenated section bodies if narrative is missing or too short.
    const narrativeText = data.narrative && data.narrative.trim().length > 200 ? data.narrative : null;
    if (narrativeText) {
      return narrativeText.split(/\n\n+/).filter(Boolean).map((p, i) => para(p, String(i)));
    }
    if (data.storySections && data.storySections.length > 0) {
      return data.storySections.flatMap((sec, si) =>
        sec.body.split(/\n\n+/).filter(Boolean).map((p, pi) => para(p, `${si}-${pi}`))
      );
    }
    if (!data.narrative) return null;
    return data.narrative.split(/\n\n+/).map((p, i) => para(p, String(i)));
  }, [data, tagList, accent, ddScale]);

  useEffect(() => {
    if (data) return;
    let cancelled = false;
    const startedAt = Date.now();
    (async () => {
      try {
        setError(null);
        setStage('generating');
        // eslint-disable-next-line no-console
        console.log('[AIFeed] deepdive →', story.headline.slice(0, 60), `(${item.allStories.length} source${item.allStories.length === 1 ? '' : 's'})`);
        // Combine context from all clustered stories — richer prompt
        // For theme collections (browse rails of DIFFERENT stories on a topic),
        // treat as a single-article deep dive — never synthesize unrelated
        // articles into one narrative. Only event clusters (multiple outlets on
        // the SAME story) feed all sources to the synthesis.
        const paragraphs = [story.headline + '. ' + (story.summary ?? story.headline)];
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 95000);
        let dd: Response;
        try {
          dd = await fetch(DEEPDIVE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: story.sources?.[0]?.url ?? '',
              headline: story.headline,
              paragraphs,
              // For event clusters: read every source in full. For theme collections:
              // only the lead article (others are different stories on the same topic).
              sourceUrls: [story.sources?.[0]?.url].filter(Boolean) as string[],
              depth: deepDiveDepth,
              publishedAt: story.publishedAt,
              systemPrompt: DEEPDIVE_SYSTEM_PROMPT,
            }),
            signal: ctrl.signal,
          });
        } finally { clearTimeout(t); }
        // eslint-disable-next-line no-console
        console.log('[AIFeed] response', dd.status, `${Date.now() - startedAt}ms`);
        if (!dd.ok) throw new Error(`Deep Dive ${dd.status}`);
        const json: DeepDiveData = await dd.json();
        if (cancelled) return;
        setData(json);
        if (!json.degraded) writeCache(story.id, json, deepDiveDepth); // never cache the non-AI fallback
        setStage('done');
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error && e.name === 'AbortError'
          ? 'Timed out. Backend may be warming up — try again in a few seconds.'
          : String(e instanceof Error ? e.message : e);
        setError(msg);
        setStage('error');
      }
    })();
    return () => { cancelled = true; };
  }, [data, reloadKey, story.id, story.summary, story.headline, story.sources, item.allStories]);

  useEffect(() => {
    if (stage !== 'generating') { setShowColdHint(false); return; }
    const t = setTimeout(() => setShowColdHint(true), 5000);
    return () => clearTimeout(t);
  }, [stage]);

  // Close on ESC + browser/system back-swipe (push history entry on open,
  // close when popstate fires from the user popping it).
  useEffect(() => {
    // Push a synthetic history entry so back-swipe / Android back button
    // has something to pop without leaving the app.
    window.history.pushState({ deepdive: true }, '');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onPop = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      // If the overlay was closed via the X button (not popstate), pop the
      // synthetic entry so history depth stays consistent.
      if (window.history.state?.deepdive) {
        window.history.back();
      }
    };
  }, [onClose]);

  const sourceName = item.sources[0]?.name ?? story.sources?.[0]?.name ?? 'Unknown';
  const extraSources = Math.max(0, item.sources.length - 1);
  const bgGradient = `radial-gradient(at 0% 0%, ${dominant}55, transparent 60%), linear-gradient(180deg, #050507 0%, #08080c 50%, #050507 100%)`;

  // Swipe-down-to-close: track drag only when scroll is at top.
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; active: boolean } | null>(null);
  const [dragY, setDragY] = useState(0);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if ((overlayRef.current?.scrollTop ?? 0) > 0) return;
    dragRef.current = { startY: e.touches[0].clientY, active: true };
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current?.active) return;
    const dy = e.touches[0].clientY - dragRef.current.startY;
    if (dy > 0) setDragY(dy);
  }, []);
  const onTouchEnd = useCallback(() => {
    if (!dragRef.current?.active) return;
    if (dragY > 130) {
      try { navigator.vibrate?.(12); } catch {}
      // On a failed Deep Dive, pull-down RETRIES instead of closing.
      if (stage === 'error') { setDragY(0); reload(); }
      else onClose();
    } else setDragY(0);
    dragRef.current = null;
  }, [dragY, onClose, stage, reload]);

  // On error, the pull gesture is a refresh — don't fade/shrink the overlay.
  const dragOpacity = stage === 'error' ? 1 : Math.max(0, 1 - dragY / 500);
  const dragScale = stage === 'error' ? 1 : Math.max(0.92, 1 - dragY / 1800);

  return (
    <div
      ref={overlayRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: bgGradient,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        animation: dragY === 0 ? 'ddOverlayIn 0.25s ease-out' : undefined,
        transform: `translateY(${dragY}px) scale(${dragScale})`,
        opacity: dragOpacity,
        transition: dragRef.current?.active ? 'none' : 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease',
        transformOrigin: 'center top',
        borderRadius: dragY > 8 ? 24 : 0,
        overflow: dragY > 8 ? 'hidden' : 'auto',
      }}>
      <style>{`@keyframes ddOverlayIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Pull-to-refresh indicator — only while pulling on a failed Deep Dive */}
      {stage === 'error' && dragY > 4 && (
        <div style={{
          position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 6px)', left: 0, right: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          color: accent, fontSize: 11, fontWeight: 800, letterSpacing: 0.6,
          pointerEvents: 'none',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.4"
            style={{ transform: `rotate(${Math.min(dragY, 130) / 130 * 180}deg)`, transition: 'transform 0.05s linear' }}>
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {dragY > 130 ? 'RELEASE TO RETRY' : 'PULL TO RETRY'}
        </div>
      )}

      {/* Top bar — floats over the hero (absolute, not sticky) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 14px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
        pointerEvents: 'none',
      }}>
        <button onClick={onClose} style={{
          pointerEvents: 'auto',
          width: 38, height: 38, borderRadius: 19,
          background: 'rgba(20,20,28,0.7)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {(() => {
            const circle = (active: boolean): React.CSSProperties => ({
              width: 40, height: 40, borderRadius: 20, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? `${accent}26` : 'rgba(20,20,28,0.7)',
              border: `1px solid ${active ? accent : 'rgba(255,255,255,0.1)'}`,
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            });
            return (<>
              <button onClick={() => setFollowing(toggleFollow({ id: story.id, headline: story.headline, imageUrl: story.imageUrl }))}
                title={following ? 'Following' : 'Follow this story'} style={circle(following)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={following ? accent : 'none'} stroke={following ? accent : '#fff'} strokeWidth="2"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21 8 14 2 9.4h7.6z"/></svg>
              </button>
            </>);
          })()}
        </div>
      </div>

      {/* Hero image — starts at y=0, full bleed (image goes under status bar) */}
      <div style={{
        position: 'relative', height: '42vh', minHeight: 280,
        overflow: 'hidden',
      }}>
        {story.imageUrl ? (
          <img src={story.imageUrl} alt="" className="dd-hero-in" style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            filter: 'brightness(0.85)',
          }} />
        ) : (
          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#05060c' }}>
            <img src={FALLBACK_IMG} alt="" className="dd-hero-in" style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'brightness(0.85)',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(135deg, ${dominant}33 0%, transparent 45%, ${accent}1f 100%)`,
            }} />
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 25%, transparent 55%, rgba(5,5,7,0.6) 88%, #050507 100%)',
        }} />
        {/* Tags overlay */}
        {data && data.tags.length > 0 && (
          <div style={{
            position: 'absolute', left: 16, right: 16, bottom: 18,
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {data.tags.slice(0, 4).map(t => (
              <span key={t} style={{
                padding: '5px 11px', borderRadius: 999,
                background: 'rgba(20,20,28,0.75)',
                border: '1px solid rgba(255,255,255,0.18)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                color: '#eee', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '4px 20px 80px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{
          margin: 0, color: '#fff', fontSize: 24, fontWeight: 800,
          lineHeight: 1.22, letterSpacing: -0.4,
        }}>{story.headline}</h1>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, color: accent, fontSize: 10, fontWeight: 800, letterSpacing: 1.4 }}>
          <span>{sourceName.toUpperCase()}</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
          <span>{timeAgo(story.publishedAt)}</span>
        </div>

        {stage === 'generating' ? (
          <InlineLoader accent={accent} showColdHint={showColdHint} />
        ) : stage === 'error' ? (
          <InlineError text={error || 'Failed'} onRetry={reload} accent={accent} />
        ) : data ? (
          <div className="dd-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(data.tldrSections && data.tldrSections.length > 0) || data.tldr.length > 0 ? (
              <div style={{
                background: 'rgba(15,15,22,0.5)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16, padding: '20px 22px',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                boxShadow: `0 6px 24px ${dominant}22`,
                borderTop: `2px solid ${VIOLET}`,
              }}>
                {data.confidence != null && (() => {
                  const score = data.confidence!;
                  const barColor = score >= 80 ? '#4ade80' : score >= 60 ? '#f59e0b' : '#f87171';
                  const label = score >= 80 ? 'HIGH CONFIDENCE' : score >= 60 ? 'MEDIUM CONFIDENCE' : 'LOW CONFIDENCE';
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 800, letterSpacing: 1.4 }}>AI ACCURACY</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: barColor, fontSize: 11, fontWeight: 800 }}>{score}%</span>
                          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: 700, letterSpacing: 0.8 }}>{label}</span>
                        </div>
                      </div>
                      <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${score}%`, background: barColor, borderRadius: 99, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
                      </div>
                    </div>
                  );
                })()}
                <div style={{ height: 1, background: `${VIOLET}33`, marginBottom: 14 }} />
                {tldrBody}
              </div>
            ) : null}

            {data.insight && (
              <div style={{
                position: 'relative',
                padding: '20px 20px 20px 26px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(255,197,66,0.10) 0%, rgba(15,15,22,0.7) 70%)',
                border: '1px solid rgba(255,197,66,0.18)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 14, bottom: 14, width: 3,
                  background: 'linear-gradient(180deg, #FFC542, #FF9A00)',
                  borderRadius: 999,
                }} />
                <div style={{ color: '#FFC542', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, marginBottom: 8 }}>
                  KEY INSIGHT
                </div>
                <p style={{
                  margin: 0, color: '#fff', fontSize: 15.5 * ddScale, lineHeight: 1.55,
                  fontWeight: 500, fontStyle: 'italic',
                }}>{data.insight}</p>
              </div>
            )}

            {metrics.length > 0 && (
              <div style={{
                background: 'rgba(15,15,22,0.5)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14, padding: '18px 20px',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              }}>
                <div style={{
                  color: '#4A90D9', fontSize: 9, fontWeight: 800, letterSpacing: 1.6,
                  marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>KEY METRICS</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(74,144,217,0.2)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {metrics.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', alignItems: 'flex-start', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <div style={{ width: 5, height: 5, borderRadius: 3, marginTop: 8, background: '#4A90D9', flexShrink: 0 }} />
                      <div style={{ flex: 1, color: '#d4d4dc', fontSize: 14 * ddScale, lineHeight: 1.55 }}>{highlightEntities(m, tagList, accent)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(data.narrative || (data.storySections && data.storySections.length > 0)) && (
              <div style={{ marginTop: 4 }}>
                <div style={{
                  color: VIOLET, fontSize: 10, fontWeight: 800, letterSpacing: 2,
                  marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>THE STORY</span>
                  <div style={{ flex: 1, height: 1, background: `${VIOLET}33` }} />
                </div>
                {narrativeBody}
              </div>
            )}

            {/* ── Follow the Story — entity index (violet accents) ──────── */}
            {showDeepDiveEntities && (data.keyPeople?.length || data.keyCompanies?.length || data.topics?.length) ? (
              <div style={{ marginTop: 4 }}>
                <div style={{ color: VIOLET, fontSize: 10, fontWeight: 800, letterSpacing: 1.8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SparkleIcon color={VIOLET} size={10} /> FOLLOW THE STORY
                </div>
                {data.keyPeople && data.keyPeople.length > 0 && (
                  <EntityBlock label="KEY PEOPLE" items={data.keyPeople} accent={VIOLET} dominant={dominant} />
                )}
                {data.keyCompanies && data.keyCompanies.length > 0 && (
                  <EntityBlock label="KEY ORGANIZATIONS" items={data.keyCompanies} accent={VIOLET} dominant={dominant} />
                )}
                {data.topics && data.topics.length > 0 && (
                  <EntityBlock label="TOPICS" items={data.topics} accent={VIOLET} dominant={dominant} subtle />
                )}
              </div>
            ) : null}

            {/* ── Curious? — Q&A in violet ─────────────────────────────── */}
            {showDeepDiveCurious && data.questions.length > 0 && (
              <Section label="CURIOUS?" accent={VIOLET}>
                <QuestionsList
                  questions={data.questions}
                  story={story}
                  narrative={data.narrative}
                  accent={VIOLET}
                  scale={ddScale}
                />
              </Section>
            )}

            {/* ── Earlier in Story ─────────────────────────────────────── */}
            {item.allStories.length > 1 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ color: VIOLET, fontSize: 10, fontWeight: 800, letterSpacing: 1.8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>EARLIER IN STORY</span>
                  <div style={{ flex: 1, height: 1, background: `${VIOLET}33` }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {item.allStories.slice(1, 6).map((s, i) => {
                    const srcUrl = s.sources?.[0]?.url ?? null;
                    const srcName = s.sources?.[0]?.name ?? 'Source';
                    return (
                      <button key={i} onClick={() => onOpenRelated ? onOpenRelated(s) : srcUrl && window.open(srcUrl, '_blank')} style={{
                        display: 'flex', flexDirection: 'column',
                        borderRadius: 14,
                        background: 'rgba(185,148,255,0.05)',
                        border: '1px solid rgba(185,148,255,0.12)',
                        textAlign: 'left', cursor: 'pointer',
                        width: '100%', overflow: 'hidden',
                        marginBottom: 2,
                      }}>
                        {s.imageUrl ? (
                          <img src={s.imageUrl} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: 100, background: `linear-gradient(135deg, ${dominant}44 0%, #0a0a10 100%)` }} />
                        )}
                        <div style={{ padding: '12px 14px 14px' }}>
                          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 800, letterSpacing: 1.2, marginBottom: 6 }}>{srcName.toUpperCase()}</div>
                          <div style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 700, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{s.headline}</div>
                          {s.summary && s.summary.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3).map((bullet, bi) => (
                            <div key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
                              <div style={{ width: 5, height: 5, borderRadius: 3, marginTop: 5, background: VIOLET, flexShrink: 0 }} />
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{bullet.trim()}</div>
                            </div>
                          ))}
                          <div style={{ marginTop: 10, color: VIOLET, fontSize: 10, fontWeight: 800, letterSpacing: 0.8 }}>DEEP DIVE ›</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
      <style>{`
        @keyframes ddFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .dd-stagger > * { animation: ddFadeIn 0.45s cubic-bezier(0.4, 0, 0.2, 1) both; }
        .dd-stagger > *:nth-child(1) { animation-delay: 0ms; }
        .dd-stagger > *:nth-child(2) { animation-delay: 80ms; }
        .dd-stagger > *:nth-child(3) { animation-delay: 160ms; }
        .dd-stagger > *:nth-child(4) { animation-delay: 240ms; }
        .dd-stagger > *:nth-child(5) { animation-delay: 320ms; }
        .dd-stagger > *:nth-child(6) { animation-delay: 400ms; }
        @keyframes ddHeroIn { from { transform: scale(1.10); opacity: 0.55; } to { transform: scale(1); opacity: 1; } }
        .dd-hero-in { animation: ddHeroIn 0.55s cubic-bezier(0.22, 1, 0.36, 1); transform-origin: center 40%; }
        @keyframes typingDot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-5px); opacity: 1; } }
        .typing-dots { display: inline-flex; gap: 4px; align-items: center; }
        .typing-dots span { width: 6px; height: 6px; border-radius: 50%; background: #b994ff; animation: typingDot 1.1s ease-in-out infinite; }
        .typing-dots span:nth-child(2) { animation-delay: 0.18s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.36s; }
        @keyframes ddEntityPulse {
          0% { background: transparent; }
          30% { background: rgba(185, 148, 255, 0.32); }
          100% { background: rgba(185, 148, 255, 0.08); }
        }
        .dd-entity-pulse { animation: ddEntityPulse 1.5s ease-out 0.5s both; border-radius: 3px; padding: 0 2px; }
      `}</style>
    </div>
  );
}

// ── Q&A list with inline expandable answers ─────────────────────────────────

const ASK_API = 'https://ireader.onrender.com/api/news/ask';
const ASK_CACHE_PREFIX = '@ask_v1_';

function readAskCache(key: string): string | null {
  try {
    const raw = localStorage.getItem(ASK_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.answer;
  } catch { return null; }
}
function writeAskCache(key: string, answer: string) {
  try { localStorage.setItem(ASK_CACHE_PREFIX + key, JSON.stringify({ answer, at: Date.now() })); } catch {}
}
function askKey(headline: string, question: string): string {
  // simple djb2-ish hash for cache key length sanity
  let h = 5381;
  const s = headline + '::' + question;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function QuestionsList({ questions, story, narrative, accent, scale = 1 }: {
  questions: string[]; story: Story; narrative?: string; accent: string; scale?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {questions.slice(0, 4).map((q, i) => (
        <QuestionItem
          key={i}
          question={q}
          story={story}
          narrative={narrative}
          accent={accent}
          scale={scale}
        />
      ))}
    </div>
  );
}

function QuestionItem({ question, story, narrative, accent, scale = 1 }: {
  question: string; story: Story; narrative?: string; accent: string; scale?: number;
}) {
  const key = useMemo(() => askKey(story.headline, question), [story.headline, question]);
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<string | null>(() => readAskCache(key));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnswer = useCallback(async () => {
    if (answer || loading) return;
    setLoading(true);
    setError(null);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch(ASK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          headline: story.headline,
          summary: story.summary,
          narrative,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: { answer?: string } = await r.json();
      if (!data.answer) throw new Error('No answer');
      setAnswer(data.answer);
      writeAskCache(key, data.answer);
    } catch (e) {
      setError(e instanceof Error && e.name === 'AbortError'
        ? 'Timed out — try again.'
        : String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [answer, key, loading, narrative, question, story.headline, story.summary]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !answer && !loading) fetchAnswer();
  };

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <button
        onClick={toggle}
        style={{
          width: '100%', textAlign: 'left',
          padding: '12px 14px',
          background: 'transparent', border: 'none',
          color: '#e8e8e8', fontSize: 13 * scale, lineHeight: 1.4, fontWeight: 500,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <SparkleIcon color={accent} size={12} />
        <span style={{ flex: 1 }}>{question}</span>
        <span style={{
          color: accent, fontSize: 16, transition: 'transform 0.2s',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>›</span>
      </button>

      {open && (
        <div style={{
          padding: '0 14px 14px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 12,
        }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#aaa', fontSize: 12 }}>
              <span className="typing-dots"><span /><span /><span /></span>
              Thinking…
            </div>
          ) : error ? (
            <div style={{ color: '#ff8888', fontSize: 12 }}>
              {error}
              <button onClick={() => { setError(null); fetchAnswer(); }} style={{
                marginLeft: 8, padding: '2px 8px', borderRadius: 999,
                background: 'transparent', border: '1px solid rgba(255,136,136,0.4)',
                color: '#ff8888', fontSize: 10, fontWeight: 700, cursor: 'pointer',
              }}>RETRY</button>
            </div>
          ) : answer ? (
            <p style={{
              margin: 0, color: '#cfcfd8', fontSize: 13.5 * scale, lineHeight: 1.6,
            }}>{answer}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Atoms ────────────────────────────────────────────────────────────────────

function EntityBlock({ label, items, accent, dominant, subtle }: {
  label: string; items: string[]; accent: string; dominant: string; subtle?: boolean;
}) {
  return (
    <div style={{
      marginBottom: 12,
      padding: '14px 16px', borderRadius: 14,
      background: 'rgba(15,15,22,0.5)',
      border: '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    }}>
      <div style={{ color: '#666', fontSize: 9, fontWeight: 800, letterSpacing: 1.4, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((it, i) => (
          <span key={i} style={{
            padding: '5px 11px', borderRadius: 999,
            background: subtle ? `${accent}1a` : 'rgba(255,255,255,0.05)',
            border: subtle
              ? `1px solid ${accent}33`
              : '1px solid rgba(255,255,255,0.1)',
            color: subtle ? accent : '#e8e8e8',
            fontSize: 11.5, fontWeight: subtle ? 700 : 500,
            letterSpacing: subtle ? 0.3 : 0,
          }}>{it}</span>
        ))}
      </div>
    </div>
  );
}

function Section({ label, accent, dominant, children }: { label: string; accent: string; dominant?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(15,15,22,0.6)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16, padding: '16px 18px',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      boxShadow: dominant ? `0 6px 24px ${dominant}22` : undefined,
    }}>
      <div style={{
        color: accent, fontSize: 9, fontWeight: 800, letterSpacing: 1.6,
        marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <SparkleIcon color={accent} size={10} /> {label}
      </div>
      {children}
    </div>
  );
}

function SparkleIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 0l1.5 5.5L19 7l-5.5 1.5L12 14l-1.5-5.5L5 7l5.5-1.5L12 0z M20 14l.8 2.7L23 17.5l-2.2.8L20 21l-.8-2.7L17 17.5l2.2-.8L20 14z" />
    </svg>
  );
}

const TOPIC_LABELS: Record<string, string> = {
  breaking: 'BREAKING',
  technology: 'TECHNOLOGY',
  'india-politics': 'INDIA',
  geopolitics: 'WORLD',
  markets: 'MARKETS',
  business: 'BUSINESS',
};

function TopicPill({ current, onChange }: { current: string; onChange: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 999,
          background: 'rgba(20,20,28,0.65)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
          cursor: 'pointer',
        }}
      >
        <SparkleIcon color="#b994ff" size={12} />
        AI FEED · {TOPIC_LABELS[current] ?? current.toUpperCase()}
        <span style={{ fontSize: 9, marginLeft: 2, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20,
            minWidth: 180, padding: 4, borderRadius: 12,
            background: 'rgba(15,15,20,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            {Object.entries(TOPIC_LABELS).map(([key, label]) => {
              const active = key === current;
              return (
                <button
                  key={key}
                  onClick={() => { onChange(key); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none',
                    background: active ? 'rgba(185,148,255,0.15)' : 'transparent',
                    color: active ? '#b994ff' : '#fff',
                    fontSize: 12, fontWeight: 700, letterSpacing: 1, textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>{label}</span>
                  {active && <span style={{ fontSize: 12 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function CenteredLoading({ text }: { text: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* full-screen shimmer card skeleton */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg, #0d0d12 0%, #0a0a0e 100%)',
      }}>
        <div className="aif-skel-shimmer" style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, rgba(185,148,255,0.06) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }} />
        {/* fake content blocks */}
        <div style={{ position: 'absolute', left: 22, right: 22, bottom: 110, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 14, width: '40%', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ height: 28, width: '90%', borderRadius: 6, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ height: 28, width: '70%', borderRadius: 6, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ height: 12, width: '55%', borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginTop: 6 }} />
        </div>
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#aaa',
      }}>
        <span className="typing-dots" style={{ transform: 'scale(1.4)' }}><span /><span /><span /></span>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{text}</div>
      </div>
      <style>{`
        @keyframes aifspin{to{transform:rotate(360deg)}}
        @keyframes aifShimmerSweep { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .aif-skel-shimmer { animation: aifShimmerSweep 1.6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function CenteredError({ text }: { text: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 8, color: '#ff8888', padding: 32, textAlign: 'center',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Couldn't load</div>
      <div style={{ color: '#666', fontSize: 12 }}>{text}</div>
    </div>
  );
}

// Tick-up number: animates from 0 → `to` over `dur` ms on mount.
function TickNumber({ to, dur = 600 }: { to: number; dur?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, dur]);
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>;
}

function InlineLoader({ accent, showColdHint }: { accent: string; showColdHint: boolean }) {
  return (
    <div style={{
      padding: 18, borderRadius: 14, position: 'relative', overflow: 'hidden',
      background: 'rgba(15,15,22,0.7)',
      border: '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Gradient sweep progress bar (top) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${accent} 30%, ${accent}cc 50%, ${accent} 70%, transparent 100%)`,
        backgroundSize: '50% 100%',
        animation: 'progSweep 1.6s ease-in-out infinite',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="typing-dots" style={{ transform: 'scale(1.2)' }}><span style={{ background: accent }} /><span style={{ background: accent }} /><span style={{ background: accent }} /></span>
        <div style={{ color: '#ccc', fontSize: 12, fontWeight: 500 }}>Distilling story…</div>
      </div>
      <style>{`@keyframes progSweep { 0% { background-position: -100% 0; } 100% { background-position: 200% 0; } }`}</style>
      {showColdHint && (
        <div style={{
          color: '#888', fontSize: 11, lineHeight: 1.5,
          paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          Backend warming up (Render free tier). First request after idle takes ~20s.
        </div>
      )}
    </div>
  );
}

function InlineError({ text, onRetry, accent }: { text: string; onRetry?: () => void; accent?: string }) {
  const c = accent || '#b994ff';
  return (
    <div style={{
      padding: 18, borderRadius: 14,
      background: 'rgba(40,20,20,0.4)', border: '1px solid rgba(255,80,80,0.15)',
      color: '#ff8888', fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Couldn't generate</div>
      <div style={{ color: '#aaa', fontSize: 11, marginBottom: onRetry ? 16 : 0 }}>{text}</div>
      {onRetry && (
        <>
          <button onClick={onRetry} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '12px 16px', borderRadius: 12,
            background: `${c}1f`, border: `1px solid ${c}66`,
            color: c, fontSize: 13, fontWeight: 800, letterSpacing: 0.5, cursor: 'pointer',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            RETRY
          </button>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 10, letterSpacing: 0.3 }}>
            or pull down to refresh
          </div>
        </>
      )}
    </div>
  );
}

// Editorial-style entity bolding (Curious Cats reference): named entities
// render in white bold within the surrounding paragraph rather than a colored tint.
function highlightEntities(text: string, tags: string[], _color: string): React.ReactNode {
  // First pass: strip and capture **bold** markdown from AI output.
  const boldRe = /\*\*([^*]+)\*\*/g;
  const segments: Array<{ text: string; bold: boolean }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), bold: false });
    segments.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  if (segments.length === 0) segments.push({ text, bold: false });

  // Second pass: highlight known tags inside each non-bold segment.
  const sorted = tags && tags.length > 0
    ? [...tags].sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : [];
  const re = sorted.length > 0 ? new RegExp(`\\b(${sorted.join('|')})\\b`, 'gi') : null;

  return segments.map((seg, si) => {
    if (seg.bold) {
      return <strong key={`b${si}`} className="dd-entity-pulse" style={{ color: '#fff', fontWeight: 700 }}>{seg.text}</strong>;
    }
    if (!re) return <React.Fragment key={`t${si}`}>{seg.text}</React.Fragment>;
    const parts = seg.text.split(re);
    return parts.map((p, i) => i % 2 === 1
      ? <strong key={`t${si}-${i}`} className="dd-entity-pulse" style={{ color: '#fff', fontWeight: 700 }}>{p}</strong>
      : <React.Fragment key={`t${si}-${i}`}>{p}</React.Fragment>);
  });
}
