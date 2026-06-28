import React, { useState } from 'react';

function breakingTier(publishedAt: string | undefined, isBreaking: boolean): 'live' | 'breaking' | 'developing' | null {
  if (!isBreaking || !publishedAt) return null;
  const ageMin = (Date.now() - new Date(publishedAt).getTime()) / 60000;
  if (ageMin < 30) return 'live';
  if (ageMin < 120) return 'breaking';
  if (ageMin < 360) return 'developing';
  return null;
}
import type { Story, ArticleParams, BiasRating } from '../types';
import { BIAS_CONFIG } from '../types';
import { getArticleColor, lighten, darken } from '../utils/colors';
import { useRouter } from '../contexts/RouterContext';
import { useSaved } from '../contexts/SavedContext';
import { useSettings } from '../contexts/SettingsContext';
import { trackArticleOpen } from '../utils/personalization';
import { FALLBACK_IMG } from '../utils/fallback';
import { isRead, markRead, subscribeRead } from '../utils/readStore';

const CARD_HEIGHT_BASE = 420;
const DENSITY_HEIGHT: Record<string, number> = { compact: 320, comfortable: 420, spacious: 500 };


function clientReadingTime(text: string): number {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function clientDifficulty(text: string): 'Easy' | 'Medium' | 'Hard' {
  const sentences = (text ?? '').split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!sentences.length || !words.length) return 'Medium';
  let syl = 0;
  for (const w of words) {
    const c = w.toLowerCase().replace(/[^a-z]/g, '');
    if (c.length <= 3) { syl += 1; continue; }
    const m = c.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
    syl += m ? m.length : 1;
  }
  const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syl / words.length);
  return score >= 70 ? 'Easy' : score >= 50 ? 'Medium' : 'Hard';
}

const DIFFICULTY_COLORS: Record<string, string> = { Easy: '#34C759', Medium: '#FF9500', Hard: '#FF3B30' };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}HR AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
}
// Absolute clock format, e.g. "10:42 AM".
function timeAbs(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':'techcrunch.com','The Verge':'theverge.com','Ars Technica':'arstechnica.com','Wired':'wired.com','Hacker News':'news.ycombinator.com','9to5Mac':'9to5mac.com','9to5Google':'9to5google.com','MIT Tech Review':'technologyreview.com','Engadget':'engadget.com','VentureBeat':'venturebeat.com','The Next Web':'thenextweb.com','BBC World':'bbc.co.uk','NYT World':'nytimes.com','The Guardian':'theguardian.com','NPR World':'npr.org','Al Jazeera':'aljazeera.com','NDTV':'ndtv.com','India Today':'indiatoday.in','The Print':'theprint.in','The Quint':'thequint.com','CNBC TV18':'cnbctv18.com','Scroll.in':'scroll.in','Economic Times':'economictimes.indiatimes.com','Livemint':'livemint.com','Mint':'livemint.com','Inc42':'inc42.com','Financial Express':'financialexpress.com',
};

function faviconUrl(name: string) {
  const domain = SOURCE_DOMAINS[name] ?? 'google.com';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function domainFromUrl(url: string | undefined): string {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function faviconFromStory(name: string, url: string | undefined): string {
  const mapped = SOURCE_DOMAINS[name];
  const fromUrl = domainFromUrl(url);
  const domain = mapped || fromUrl;
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : '';
}

interface Props {
  story: Story;
  compact?: boolean;
  cardWidth?: number;
  allStories?: Story[];
  suppressBreaking?: boolean;
  clusterCard?: boolean;
}

export function StoryCard({ story, compact, cardWidth: cwProp, allStories, suppressBreaking, clusterCard }: Props) {
  const { navigate } = useRouter();
  const { toggleSave, isSaved } = useSaved();
  const { showClusterSummary, showBiasDots, showCardImages, cardDensity, timeFormat, autoMarkRead } = useSettings();
  const [imgError, setImgError] = useState(false);
  const saved = isSaved(story.id);

  const cardWidth = cwProp ?? Math.min(window.innerWidth - 28, 452);
  const dominant = getArticleColor(story.id || story.headline);
  const accent = lighten(dominant, 0.55);

  const source = story.sources?.[0]?.name ?? 'Unknown';
  const sourceCount = story.sources?.length ?? 1;
  const ageMs = Date.now() - new Date(story.publishedAt).getTime();
  const isTrending = story.isTrending ?? sourceCount >= 3;
  const isBreakingBadge = story.isBreaking ?? false;
  const isOngoing = story.isDeveloping ?? (sourceCount >= 4 && ageMs < 6 * 60 * 60 * 1000);


  const handleClick = () => {
    trackArticleOpen(story);
    markRead(story.id);
    const params: ArticleParams = {
      id: story.id,
      url: story.sources?.[0]?.url ?? '',
      image: story.imageUrl,
      headline: story.headline,
      summary: story.aiSummary || story.summary,
      source: story.sources?.[0]?.name ?? '',
      publishedAt: story.publishedAt,
      dominantColor: dominant,
      sources: JSON.stringify(story.sources ?? []),
      allStories: JSON.stringify((allStories ?? []).slice(0, 30)),
      sourceBias: story.sourceBias,
    };
    navigate({ name: 'Article', params });
  };

  const gradient = `linear-gradient(to bottom, transparent 0%, ${dominant}55 25%, ${dominant}CC 60%, ${dominant} 100%)`;

  const [pressed, setPressed] = useState(false);

  // Customize → autoMarkRead. When ON, mark this story as read once it
  // becomes 80%-visible for ~1.2s. Visited stories are also marked
  // immediately via handleClick.
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const [readState, setReadState] = React.useState<boolean>(() => isRead(story.id));
  React.useEffect(() => {
    const unsub = subscribeRead(() => setReadState(isRead(story.id)));
    return unsub;
  }, [story.id]);
  React.useEffect(() => {
    if (!autoMarkRead || readState || !cardRef.current) return;
    let t: number | null = null;
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.some(e => e.isIntersecting && e.intersectionRatio >= 0.8);
      if (visible && t == null) {
        t = window.setTimeout(() => { markRead(story.id); }, 1200);
      } else if (!visible && t != null) {
        clearTimeout(t); t = null;
      }
    }, { threshold: [0.8] });
    obs.observe(cardRef.current);
    return () => { if (t != null) clearTimeout(t); obs.disconnect(); };
  }, [autoMarkRead, readState, story.id]);

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      onPointerDown={() => { setPressed(true); try { navigator.vibrate?.(8); } catch {} }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        width: cardWidth, height: DENSITY_HEIGHT[cardDensity] ?? CARD_HEIGHT_BASE, borderRadius: 20, overflow: 'hidden',
        opacity: readState ? 0.55 : 1,
        position: 'relative', flexShrink: 0, cursor: 'pointer',
        // Particle-style colour bleed: bright accent halo + layered dominant
        // glow. Numbers tuned to push the colour ~80-100 px past the card
        // edge so adjacent cards/background pick up the tint.
        boxShadow: `
          0 8px 22px rgba(0,0,0,0.55),
          0 0 ${pressed ? 110 : 90}px ${accent}${pressed ? 'aa' : '88'},
          0 0 ${pressed ? 70 : 56}px ${dominant}${pressed ? 'cc' : 'aa'},
          0 22px 70px ${dominant}99
        `,
        WebkitTapHighlightColor: 'transparent',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: 'transform 0.16s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.24s ease, opacity 0.3s ease',
      }}
    >
      {/* Background image or typographic fallback. Hidden when Customize →
          showCardImages is off (text-only feed mode). */}
      {showCardImages && !imgError && story.imageUrl ? (
        <img src={story.imageUrl} alt="" onError={() => setImgError(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, background: '#05060c',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={FALLBACK_IMG} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(135deg, ${dominant}33 0%, transparent 45%, ${accent}1f 100%)`,
          }} />
        </div>
      )}

      {/* Gradient overlay */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '80%', background: gradient }} />


      {/* Source circles top-right */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex' }}>
        {story.sources.slice(0, 3).map((src, i) => (
          <div key={i} style={{ width: 28, height: 28, borderRadius: 14, border: '2px solid #000', overflow: 'hidden', background: dominant, marginLeft: i > 0 ? -8 : 0 }}>
            <img src={faviconUrl(src.name)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}
      </div>

      {/* Content overlay bottom */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, paddingLeft: clusterCard ? 20 : 14 }}>
        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {source.charAt(0).toUpperCase()}
          </div>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600 }}>{source.toUpperCase()}</span>
          {showBiasDots && story.sourceBias && story.sourceBias !== 'unknown' && (
            <div style={{ width: 6, height: 6, borderRadius: 3, background: BIAS_CONFIG[story.sourceBias as BiasRating]?.color, flexShrink: 0 }} />
          )}
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>·</span>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600 }}>{timeFormat === 'absolute' ? timeAbs(story.publishedAt) : timeAgo(story.publishedAt)}</span>
          {isBreakingBadge && !suppressBreaking && (() => {
            const tier = breakingTier(story.publishedAt, true);
            const dot = <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>·</span>;
            if (tier === 'live') return <><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF3B30', display: 'inline-block' }} /><span style={{ color: '#FF3B30', fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>LIVE</span></span></>;
            if (tier === 'developing') return <>{dot}<span style={{ color: '#FF9500', fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>DEVELOPING</span></>;
            return <>{dot}<span style={{ color: '#FF3B30', fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>BREAKING</span></>;
          })()}
          {isTrending && !isBreakingBadge && <span style={{ fontSize: 12 }}>🔥</span>}
          {isOngoing && <span style={{ fontSize: 12 }}>📍</span>}
          <div style={{ flex: 1 }} />
          <button onClick={e => { e.stopPropagation(); try { navigator.vibrate?.(10); } catch {} toggleSave(story); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: saved ? '#4A90D9' : 'rgba(255,255,255,0.7)', fontSize: 18, lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}>
            <svg key={saved ? 'on' : 'off'} width="19" height="19" viewBox="0 0 24 24" fill={saved ? '#4A90D9' : 'none'} stroke={saved ? '#4A90D9' : 'rgba(255,255,255,0.7)'} strokeWidth="2"
              style={{ display: 'block', animation: saved ? 'bookPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none' }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </button>
          <style>{`@keyframes bookPop { 0% { transform: scale(0.7); } 60% { transform: scale(1.35); } 100% { transform: scale(1); } }`}</style>
        </div>

        {/* Headline */}
        <div style={{ color: '#fff', fontSize: 17, fontWeight: 800, lineHeight: 1.3, letterSpacing: -0.2, marginBottom: compact ? 0 : 5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {story.headline}
        </div>

        {/* Reading-time + difficulty REMOVED from card. The card-level estimate (computed
            from the summary alone) disagreed with the article-screen estimate (computed
            from the full body) — confusing the reader. Article screen still shows it. */}

        {/* Summary (non-compact) — prefer the 25-word AI summary when present.
            Hidden when Customize → showClusterSummary is off. */}
        {!compact && showClusterSummary && (() => {
          const raw = story.aiSummary || story.summary;
          if (!raw) return null;
          const words = raw.split(/\s+/);
          const text = words.length > 25 ? words.slice(0, 25).join(' ') + '…' : raw;
          return <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10.5, lineHeight: 1.5 }}>{text}</div>;
        })()}
      </div>
    </div>
  );
}
