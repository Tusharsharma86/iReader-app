import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleParams, Story, BiasRating } from '../types';
import { BIAS_CONFIG } from '../types';
import { darken, lighten, getArticleColor } from '../utils/colors';
import { useRouter } from '../contexts/RouterContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTabBar } from '../contexts/TabBarContext';
import { getCached, setCached, TTL } from '../utils/cache';
import { trackArticleRead, trackAiUsage } from '../utils/usageTracker';
import { FALLBACK_IMG } from '../utils/fallback';

const API = 'https://ireader.onrender.com/api/news';
const TABS = ['Long Form', 'Summary', '5 Ws', 'ELI5'] as const;
type Tab = typeof TABS[number];
type AiType = 'summary' | 'fiveWs' | 'eli5';
const TAB_AI_TYPE: Partial<Record<Tab, AiType>> = { Summary: 'summary', '5 Ws': 'fiveWs', ELI5: 'eli5' };
const FONT_SIZE_MAP: Record<string, number> = { Small: 14, Medium: 17, Large: 19, XLarge: 21 };

interface AiResult { bullets?: string[]; summary?: string; fiveWs?: string[]; eli5?: string; }
interface SourceEntry { name: string; url: string; imageUrl?: string; publishedAt: string; }

// Render a paragraph with two-tier highlights:
//   - quoted text ("…" or curly quotes) → italic + gold accent
//   - named entities (people/companies) → white bold
// Falls back to plain text when no matches.
function renderParagraphHighlights(text: string, entities: string[], _accent: string): React.ReactNode {
  if (!text) return null;
  // First pass: split on quotes (straight + curly). Capture group includes the quotes.
  const QUOTE_RE = /(["“][^"”]{3,}?["”])/g;
  const segments = text.split(QUOTE_RE);
  return segments.map((seg, i) => {
    if (QUOTE_RE.test(seg)) {
      // Reset lastIndex (global regex state)
      QUOTE_RE.lastIndex = 0;
      return (
        <span key={i} style={{ color: '#FFC542', fontStyle: 'italic', fontWeight: 500 }}>{seg}</span>
      );
    }
    QUOTE_RE.lastIndex = 0;
    return <React.Fragment key={i}>{renderEntities(seg, entities)}</React.Fragment>;
  });
}

function renderEntities(text: string, entities: string[]): React.ReactNode {
  if (!entities || entities.length === 0) return text;
  const escaped = [...new Set(entities)]
    .filter(e => e && e.length > 2)
    .sort((a, b) => b.length - a.length)
    .map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return text;
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
  const parts = text.split(re);
  return parts.map((p, i) => i % 2 === 1
    ? <strong key={i} className="entity-pulse" style={{ color: '#fff', fontWeight: 700 }}>{p}</strong>
    : <React.Fragment key={i}>{p}</React.Fragment>);
}

function extractEntities(text: string) {
  const people: string[] = []; const companies: string[] = [];
  const words = text.split(/\s+/);
  words.forEach((word, i) => {
    const clean = word.replace(/[^a-zA-Z]/g, '');
    if (!clean || clean.length < 2) return;
    if (/^[A-Z]{2,}$/.test(clean) && !companies.includes(clean)) companies.push(clean);
    if (i > 0 && /^[A-Z][a-z]+$/.test(clean) && /^[A-Z][a-z]+$/.test(words[i-1]?.replace(/[^a-zA-Z]/g,''))) {
      const person = words[i-1].replace(/[^a-zA-Z]/g,'') + ' ' + clean;
      if (!people.includes(person)) people.push(person);
    }
  });
  return { people: people.slice(0,5), companies: companies.slice(0,5) };
}

function faviconFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch { return ''; }
}

function deriveCategory(source: string, url: string, headline: string): string {
  const s = (source || '').toLowerCase();
  const u = (url || '').toLowerCase();
  const h = (headline || '').toLowerCase();
  if (/techcrunch|verge|ars technica|wired|9to5|venturebeat|tech\b/.test(s + ' ' + u) ||
      /\b(ai|tech|startup|app|software|chip|robot)\b/.test(h)) return 'Tech';
  if (/economic times|moneycontrol|livemint|mint|cnbc|markets|bloomberg/.test(s) ||
      /\b(stock|sensex|nifty|market|ipo|fund|rupee|inflation)\b/.test(h)) return 'Markets';
  if (/bbc|reuters|guardian|al jazeera|world/.test(s) ||
      /\b(ukraine|russia|israel|gaza|china|nato|biden|trump|putin)\b/.test(h)) return 'World';
  if (/ndtv|india today|times of india|hindu|indian express|the print|quint/.test(s) ||
      /\b(modi|bjp|congress|delhi|mumbai|india)\b/.test(h)) return 'India';
  return 'News';
}

function fmtDateInline(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date}  ·  ${time}`;
  } catch { return ''; }
}

function wordCount(s: string): number {
  return (s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

function extractEntityTokens(text: string): string[] {
  if (!text) return [];
  const results: string[] = [];
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].replace(/[^a-zA-Z]/g,''); const w2 = words[i+1].replace(/[^a-zA-Z]/g,'');
    if (w1.length > 1 && w2.length > 1 && /^[A-Z]/.test(w1) && /^[A-Z]/.test(w2)) results.push((w1+' '+w2).toLowerCase());
    if (/^[A-Z]{2,}$/.test(w1) && w1.length > 2) results.push(w1.toLowerCase());
  }
  return [...new Set(results)].slice(0,6);
}

export default function ArticleScreen({ params }: { params: ArticleParams }) {
  const { goBack, navigate } = useRouter();
  const { fontSize: fontSizeName } = useSettings();
  const { hide, show } = useTabBar();

  // Hide bottom tab bar while reading an article; restore on back
  useEffect(() => {
    hide();
    return () => show();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fontSizePx = FONT_SIZE_MAP[fontSizeName] ?? 17;

  const dominant = params.dominantColor;
  const accent = lighten(dominant, 0.45);
  const tabBg = darken(dominant, 0.3);
  const borderColor = lighten(dominant, 0.3);
  const articleCategory = deriveCategory(params.source ?? '', params.url ?? '', params.headline ?? '');

  const BLOCKED_LONGFORM_SOURCES = ['NYT World', 'NDTV'];
  const defaultTab: Tab = BLOCKED_LONGFORM_SOURCES.includes(params.source ?? '') ? 'Summary' : 'Long Form';
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [originalParagraphs, setOriginalParagraphs] = useState<string[]>([]);
  const [dedupedFlag, setDedupedFlag] = useState(false);
  const [dedupModalVisible, setDedupModalVisible] = useState(false);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const noHero = !params.image || heroImageFailed;
  const [paragraphsLoading, setParagraphsLoading] = useState(true);
  const [paragraphsError, setParagraphsError] = useState<string | null>(null);
  const [readingTimeMinutes, setReadingTimeMinutes] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [biasModalVisible, setBiasModalVisible] = useState(false);
  const [entities, setEntities] = useState<{ people: string[]; companies: string[] }>({ people: [], companies: [] });
  const [hasBeenRead, setHasBeenRead] = useState(BLOCKED_LONGFORM_SOURCES.includes(params.source ?? ''));
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiCache = useRef<Partial<Record<Tab, AiResult>>>({});

  const allStories: Story[] = useMemo(() => { try { return JSON.parse(params.allStories) ?? []; } catch { return []; } }, [params.allStories]);
  const allSources: SourceEntry[] = useMemo(() => { try { return JSON.parse(params.sources); } catch { return [{ name: params.source, url: params.url, publishedAt: params.publishedAt }]; } }, [params.sources]);
  const referencedSources = allSources.slice(1);

  const related = useMemo(() => {
    try {
      const currentEntities = extractEntityTokens((params.headline||'')+' '+(params.summary||''));
      const currentCategory = (allStories.find((x: any) => x.id === params.id) as any)?.category;
      const sameCategory = allStories.filter(s => s.id !== params.id && s.sources?.[0]?.name !== params.source && (!currentCategory || (s as any).category === currentCategory));
      const result = sameCategory.map(s => {
        const sEntities = extractEntityTokens((s.headline||'')+' '+(s.summary||''));
        const entityOverlap = sEntities.filter(e => currentEntities.includes(e)).length;
        const hoursOld = (Date.now() - new Date(s.publishedAt||0).getTime()) / 3600000;
        return { story: s, score: entityOverlap*3 + Math.max(0,1-hoursOld/48), entityOverlap };
      }).filter(s => s.entityOverlap > 0 && s.story?.imageUrl).sort((a,b) => b.score-a.score).slice(0,6).map(s=>s.story);
      return result.length >= 2 ? result : [];
    } catch { return []; }
  }, [allStories, params.id, params.headline, params.summary, params.source]);

  useEffect(() => {
    const storyTopic = (allStories.find(x => x.id === params.id) as any)?.category ?? '';
    trackArticleRead(params.source ?? '', articleCategory, storyTopic);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (hasBeenRead) return; const t = setTimeout(() => setHasBeenRead(true), 5000); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (!params.url) { setParagraphs(params.summary ? [params.summary] : []); setParagraphsLoading(false); return; }
    fetch(`${API}/article?url=${encodeURIComponent(params.url)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const paras: string[] = data.paragraphs ?? data.originalParagraphs ?? (data.text ? data.text.split('\n\n').filter(Boolean) : null) ?? (params.summary ? [params.summary] : []);
        const filtered = paras.filter(Boolean);
        const origRaw: string[] = (data.originalParagraphs ?? paras) as string[];
        setOriginalParagraphs((origRaw || []).filter(Boolean));
        setDedupedFlag(Boolean(data.deduped));
        setParagraphs(filtered);
        setEntities(extractEntities(filtered.join(' ')));
        const fullText = filtered.join(' ');
        if (data.readingTimeMinutes) {
          setReadingTimeMinutes(data.readingTimeMinutes);
        } else {
          const wc = fullText.trim().split(/\s+/).filter(Boolean).length;
          setReadingTimeMinutes(Math.max(1, Math.round(wc / 200)));
        }
        if (data.difficulty) {
          setDifficulty(data.difficulty);
        } else {
          const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 0);
          const words = fullText.trim().split(/\s+/).filter(Boolean);
          if (sentences.length && words.length) {
            let syl = 0;
            for (const w of words) {
              const c = w.toLowerCase().replace(/[^a-z]/g, '');
              if (c.length <= 3) { syl += 1; continue; }
              const m = c.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
              syl += m ? m.length : 1;
            }
            const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syl / words.length);
            setDifficulty(score >= 70 ? 'Easy' : score >= 50 ? 'Medium' : 'Hard');
          }
        }
      }).catch(e => { setParagraphsError(e.message); setParagraphs(params.summary ? [params.summary] : []); })
      .finally(() => setParagraphsLoading(false));
  }, [params.url]);

  useEffect(() => {
    const aiType = TAB_AI_TYPE[activeTab];
    if (!aiType || !hasBeenRead || paragraphsLoading || paragraphs.length === 0) return;
    if (aiCache.current[activeTab]) { setAiResult(aiCache.current[activeTab]!); return; }
    const cacheKey = `summary_${params.id ?? params.url}_${aiType}`;
    const cached = getCached(cacheKey, TTL.AI_SUMMARY);
    if (cached) { aiCache.current[activeTab] = cached; setAiResult(cached); return; }
    setAiLoading(true); setAiError(null); setAiResult(null);
    trackAiUsage(aiType as 'summary' | 'fiveWs' | 'eli5');
    fetch(`${API}/ai-summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: params.url, paragraphs: paragraphs.slice(0,15), type: aiType, maxWords: activeTab === 'ELI5' ? 100 : 250 }) })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { aiCache.current[activeTab] = data; setCached(cacheKey, data); setAiResult(data); })
      .catch(e => setAiError(e.message)).finally(() => setAiLoading(false));
  }, [activeTab, paragraphsLoading, hasBeenRead]);

  const gradient = `linear-gradient(to bottom, ${dominant}, ${darken(dominant, 0.4)} 30%, ${darken(dominant, 0.85)} 100%)`;

  function renderTabContent() {
    const longForm = (
      <div>
        {paragraphsLoading ? <Spinner /> : (
          <>
            {paragraphsError && <div style={{ color: '#FF6B6B', fontSize: 12, marginBottom: 12 }}>Full text unavailable from this publisher</div>}
            {paragraphs.map((p, i) => (
              <p key={i} style={{ color: '#DDD', fontSize: fontSizePx, lineHeight: 1.7, marginBottom: 16 }}>
                {renderParagraphHighlights(p, [...entities.people, ...entities.companies], accent)}
              </p>
            ))}
            <a href={params.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', marginTop: 20, padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', textAlign: 'center', color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
              Read Full Article →
            </a>
          </>
        )}
      </div>
    );
    if (activeTab === 'Long Form') return longForm;

    let aiContent: React.ReactNode;
    if (!hasBeenRead) {
      aiContent = <div style={{ textAlign: 'center', padding: '48px 0', color: '#444' }}>Keep reading… AI summary generating</div>;
    } else if (aiLoading) {
      aiContent = <Spinner />;
    } else if (aiError) {
      aiContent = <div style={{ color: '#666', textAlign: 'center', paddingBlock: 40 }}>{aiError}</div>;
    } else if (activeTab === 'Summary') {
      const bullets = aiResult?.bullets ?? (aiResult?.summary ? [aiResult.summary] : []);
      aiContent = !bullets.length ? <div style={{ color: '#444', textAlign: 'center', paddingBlock: 40 }}>No summary available.</div> : (
        <div>{bullets.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 18, alignItems: 'flex-start' }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: dominant, flexShrink: 0, marginTop: 7 }} />
            <p style={{ color: '#DDD', fontSize: 15, lineHeight: 1.6, margin: 0 }}>{line}</p>
          </div>
        ))}</div>
      );
    } else if (activeTab === '5 Ws') {
      const lines = aiResult?.fiveWs ?? [];
      aiContent = !lines.length ? <div style={{ color: '#444', textAlign: 'center', paddingBlock: 40 }}>Not available.</div> : (
        <div>{lines.map((line, i) => {
          const match = line.match(/^(WHO|WHAT|WHEN|WHERE|WHY)\s*:\s*/i);
          const label = match ? match[1].toUpperCase() : line.slice(0,5).toUpperCase();
          const body = match ? line.slice(match[0].length) : line;
          return (<div key={i} style={{ marginBottom: 20 }}><div style={{ color: accent, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, marginBottom: 5 }}>{label}</div><p style={{ color: '#DDD', fontSize: 15, lineHeight: 1.53, margin: 0 }}>{body}</p></div>);
        })}</div>
      );
    } else {
      aiContent = !aiResult?.eli5 ? <div style={{ color: '#444', textAlign: 'center', paddingBlock: 40 }}>Not available.</div> : (
        <p style={{ color: '#fff', fontSize: 20, lineHeight: 1.6, fontWeight: 500, margin: 0 }}>{aiResult.eli5}</p>
      );
    }

    return (
      <div>
        {aiContent}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 28, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: `${lighten(dominant, 0.3)}40` }} />
          <span style={{ color: accent, fontSize: 10, fontWeight: 800, letterSpacing: 1.5 }}>FULL ARTICLE</span>
          <div style={{ flex: 1, height: 1, background: `${lighten(dominant, 0.3)}40` }} />
        </div>
        {longForm}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', background: gradient, overflowY: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
      {/* Back + share — float over hero, scroll away naturally */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 20px)', left: 12, right: 12, zIndex: 10, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
        <button onClick={goBack} style={{ pointerEvents: 'auto', background: `${dominant}90`, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 22, padding: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <a href={params.url} target="_blank" rel="noopener noreferrer" style={{ pointerEvents: 'auto', background: `${dominant}90`, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 22, padding: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
        </a>
      </div>

      {/* Hero — image variant OR typographic fallback */}
      <div style={{ height: 280, position: 'relative', marginTop: 0, overflow: 'hidden' }}>
        {noHero ? (
          <>
            <div style={{ position: 'absolute', inset: 0, background: '#05060c' }} />
            <img src={FALLBACK_IMG} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(135deg, ${dominant}33 0%, transparent 45%, ${accent}1f 100%)`,
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(to bottom, transparent 0%, transparent 55%, ${darken(dominant, 0.4)} 100%)`,
            }} />
          </>
        ) : (
          <>
            <img
              src={params.image}
              alt=""
              onError={() => setHeroImageFailed(true)}
              className="hero-zoom-in"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: `${dominant}33` }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(to bottom, transparent 0%, transparent 55%, ${darken(dominant, 0.4)} 100%)`,
            }} />
          </>
        )}
      </div>

      {/* Meta — pulled up to overlap hero fade */}
      <div style={{ padding: '4px 16px 14px', marginTop: -32, position: 'relative' }}>
        {/* Category chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '4px 10px', borderRadius: 999,
          border: `1px solid ${accent}88`, color: accent,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
          marginBottom: 14,
        }}>{articleCategory}</div>

        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: 1.33, margin: 0 }}>{params.headline}</h1>

        {/* Primary source row: avatar + name + verified */}
        {allSources.length > 0 && (() => {
          const primary = allSources[0];
          const faviconUri = primary.url ? faviconFromUrl(primary.url) : '';
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 15,
                border: `2px solid ${dominant}`,
                overflow: 'hidden',
                background: lighten(dominant, 0.2),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {faviconUri ? (
                  <img src={faviconUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span style={{ color: accent, fontSize: 12, fontWeight: 800 }}>{primary.name.charAt(0)}</span>
                )}
              </div>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{primary.name}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#3B9EFF">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" fill="none" stroke="#3B9EFF" strokeWidth="2"/>
                <circle cx="12" cy="12" r="10" fill="#3B9EFF" />
                <path d="M9 12l2 2 4-4" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {params.sourceBias && params.sourceBias !== 'unknown' && (() => {
                const cfg = BIAS_CONFIG[params.sourceBias as BiasRating];
                return (
                  <button onClick={() => setBiasModalVisible(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, display: 'flex', alignItems: 'center', padding: 0 }}>
                    <div className="bias-dot-in" style={{ width: 8, height: 8, borderRadius: 4, background: cfg?.color, flexShrink: 0, boxShadow: `0 0 8px ${cfg?.color}99` }} />
                  </button>
                );
              })()}
              {allSources.length > 1 && (
                <span style={{ marginLeft: 4, color: lighten(dominant, 0.4), fontSize: 11, fontWeight: 600 }}>
                  +{allSources.length - 1}
                </span>
              )}
            </div>
          );
        })()}

        {/* Inline meta: date · time · reading · difficulty */}
        {(() => {
          const diffColor = { Easy: '#34C759', Medium: '#FF9500', Hard: '#FF3B30' }[difficulty ?? 'Medium'] ?? '#FF9500';
          return (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              <span style={{ color: lighten(dominant, 0.35), fontSize: 12, fontWeight: 500 }}>
                {fmtDateInline(params.publishedAt)}
              </span>
              {readingTimeMinutes != null && (
                <>
                  <span style={{ color: lighten(dominant, 0.35), fontSize: 12 }}>·</span>
                  <span style={{ color: lighten(dominant, 0.35), fontSize: 12, fontWeight: 500 }}>
                    {readingTimeMinutes} min read
                  </span>
                </>
              )}
              {difficulty != null && (
                <>
                  <span style={{ color: lighten(dominant, 0.35), fontSize: 12 }}>·</span>
                  <span style={{ color: diffColor, fontSize: 12, fontWeight: 600 }}>{difficulty}</span>
                </>
              )}
            </div>
          );
        })()}

        {params.summary && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.55, margin: '14px 0 0' }}>{params.summary}</p>}

        {biasModalVisible && params.sourceBias && params.sourceBias !== 'unknown' && (() => {
          const cfg = BIAS_CONFIG[params.sourceBias as BiasRating];
          const label = params.sourceBias.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
          return (
            <div onClick={() => setBiasModalVisible(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <div onClick={e => e.stopPropagation()} style={{ background: '#1A1A1A', borderRadius: 16, padding: 20, maxWidth: 320, width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: cfg?.color }} />
                  <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Rated: {label}</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                  This source is rated based on publicly available media bias data (AllSides, Ad Fontes Media). Ratings are reference points, not endorsements.
                </p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.55, margin: '8px 0 0' }}>
                  Consider reading multiple perspectives for a complete picture.
                </p>
                <button onClick={() => setBiasModalVisible(false)} style={{ marginTop: 16, width: '100%', background: '#222', border: 'none', borderRadius: 10, padding: '10px 0', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Got it</button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Tab bar — icon + label in outlined pill */}
      <div style={{
        display: 'flex', margin: '0 16px 16px',
        background: tabBg, borderRadius: 999, padding: 4,
        border: `1px solid ${borderColor}55`,
      }}>
        {(BLOCKED_LONGFORM_SOURCES.includes(params.source ?? '') ? TABS.filter(t => t !== 'Long Form') : TABS).map(tab => {
          const active = activeTab === tab;
          const color = active ? '#fff' : 'rgba(255,255,255,0.4)';
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={active ? 'tab-active-pill' : undefined}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: active ? lighten(dominant, 0.05) : 'transparent',
                color,
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'all 0.2s',
                WebkitTapHighlightColor: 'transparent',
              }}>
              <TabIcon tab={tab} color={color} />
              <span>{tab}</span>
            </button>
          );
        })}
      </div>

      {/* Redundancy stats card */}
      {(() => {
        const preText = originalParagraphs.join(' ');
        const postText = paragraphs.join(' ');
        const preWords = wordCount(preText);
        const postWords = wordCount(postText);

        if (activeTab === 'Long Form') {
          if (preWords === 0) return null;
          const reduction = preWords > postWords ? Math.round(((preWords - postWords) / preWords) * 100) : 0;
          const paraReduction = originalParagraphs.length > paragraphs.length ? originalParagraphs.length - paragraphs.length : 0;
          return (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                margin: '0 16px 12px', padding: '14px',
                borderRadius: 14, border: `1px solid ${borderColor}55`,
                background: 'rgba(0,0,0,0.25)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16,
                  border: `1px solid ${accent}88`, background: `${dominant}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                }}>📄</div>
                <StatCell value={preWords} label="BEFORE" accent={accent} />
                <span style={{ color: accent, fontSize: 14 }}>→</span>
                <StatCell value={postWords} label="AFTER" accent={accent} />
                <div style={{ width: 1, height: 28, background: `${borderColor}55`, margin: '0 4px' }} />
                <span style={{ fontSize: 16, color: reduction > 0 ? '#34C759' : 'rgba(255,255,255,0.4)' }}>↘</span>
                <StatCell value={`${reduction}%`} label={dedupedFlag ? (paraReduction > 0 ? `LESS (-${paraReduction} ¶)` : 'LESS') : 'NO DEDUP'} accent={accent} />
              </div>
              <button
                onClick={() => setDedupModalVisible(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  margin: '0 16px 16px', padding: '8px 14px',
                  borderRadius: 999, border: `1px solid ${borderColor}55`,
                  background: 'rgba(0,0,0,0.18)', color: accent,
                  fontSize: 10, fontWeight: 700, letterSpacing: 1.2, cursor: 'pointer',
                  width: 'calc(100% - 32px)',
                }}
              >
                <span>{'</>'}</span>
                VERIFY DEDUP · VIEW RAW FETCH
                <span>›</span>
              </button>
            </div>
          );
        }

        // AI tabs: original → distilled
        const originalWords = postWords || preWords;
        if (originalWords === 0) return null;
        let aiText = '';
        if (activeTab === 'Summary') aiText = aiResult?.bullets?.join(' ') ?? aiResult?.summary ?? '';
        else if (activeTab === '5 Ws') aiText = (aiResult?.fiveWs ?? []).join(' ');
        else if (activeTab === 'ELI5') aiText = aiResult?.eli5 ?? '';
        const aiWords = wordCount(aiText);
        if (aiWords === 0) return null;
        const reduction = Math.max(0, Math.round(((originalWords - aiWords) / originalWords) * 100));
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            margin: '0 16px 16px', padding: '14px',
            borderRadius: 14, border: `1px solid ${borderColor}55`,
            background: 'rgba(0,0,0,0.25)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16,
              border: `1px solid ${accent}88`, background: `${dominant}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            }}>✨</div>
            <StatCell value={originalWords} label="ORIGINAL" accent={accent} />
            <span style={{ color: accent, fontSize: 14 }}>→</span>
            <StatCell value={aiWords} label="DISTILLED" accent={accent} />
            <div style={{ width: 1, height: 28, background: `${borderColor}55`, margin: '0 4px' }} />
            <span style={{ fontSize: 16, color: '#34C759' }}>↘</span>
            <StatCell value={`${reduction}%`} label="LESS" accent={accent} />
          </div>
        );
      })()}

      {/* Dedup validation modal */}
      {dedupModalVisible && (
        <DedupModal
          onClose={() => setDedupModalVisible(false)}
          originalParagraphs={originalParagraphs}
          paragraphs={paragraphs}
          dedupedFlag={dedupedFlag}
          apiUrl={params.url ? `${API}/article?url=${encodeURIComponent(params.url)}` : ''}
        />
      )}

      {/* Tab body */}
      <div style={{ padding: '8px 20px 24px' }}>{renderTabContent()}</div>

      {/* Referenced sources */}
      {referencedSources.length > 0 && (
        <div style={{ margin: '24px 20px 0' }}>
          <div style={{ color: accent, fontSize: 18, fontWeight: 800, letterSpacing: -0.3, marginBottom: 16 }}>{allSources.length} Articles</div>
          {referencedSources.map((src, i) => {
            const faviconUri = src.url ? faviconFromUrl(src.url) : '';
            return (
            <a key={i} href={src.url || undefined} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBlock: 12, borderTop: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: lighten(dominant, 0.2), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: accent, flexShrink: 0, overflow: 'hidden' }}>
                {faviconUri
                  ? <img src={faviconUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : src.name.charAt(0)
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: accent, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{src.name.toUpperCase()}</div>
                <div style={{ color: '#DDD', fontSize: 14, fontWeight: 500, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{params.headline}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
            );
          })}
        </div>
      )}

      {/* Entities */}
      {(entities.people.length > 0 || entities.companies.length > 0) && (
        <div style={{ margin: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {entities.people.length > 0 && (
            <div>
              <div style={{ color: accent, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, marginBottom: 10 }}>KEY PEOPLE</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {entities.people.map(p => <span key={p} style={{ padding: '7px 12px', borderRadius: 20, border: `1px solid ${accent}55`, background: 'rgba(255,255,255,0.06)', color: '#DDD', fontSize: 13, fontWeight: 500 }}>👤 {p}</span>)}
              </div>
            </div>
          )}
          {entities.companies.length > 0 && (
            <div>
              <div style={{ color: accent, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, marginBottom: 10 }}>KEY COMPANIES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {entities.companies.map(c => <span key={c} style={{ padding: '7px 12px', borderRadius: 20, border: `1px solid ${accent}55`, background: 'rgba(255,255,255,0.06)', color: '#DDD', fontSize: 13, fontWeight: 500 }}>🏢 {c}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Related stories */}
      {related.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, padding: '0 16px', marginBottom: 12 }}>Related Stories</div>
          <div style={{ display: 'flex', overflowX: 'auto', padding: '0 16px', gap: 10, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {related.map((s: any, idx) => {
              const color = getArticleColor(s.id || s.headline);
              return (
                <div key={s.id || idx} onClick={() => navigate({ name: 'Article', params: { id: s.id, url: s.sources?.[0]?.url ?? '', image: s.imageUrl ?? '', headline: s.headline, summary: s.summary ?? '', source: s.sources?.[0]?.name ?? '', publishedAt: s.publishedAt ?? '', dominantColor: color, sources: JSON.stringify(s.sources ?? []), allStories: params.allStories } })}
                  style={{ width: 180, background: '#111', borderRadius: 14, overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}>
                  <img src={s.imageUrl || FALLBACK_IMG} alt="" style={{ width: 180, height: 100, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: 10 }}>
                    <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, lineHeight: 1.42, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.headline}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4 }}>{s.sources?.[0]?.name}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ height: 'calc(24px + env(safe-area-inset-bottom, 0px))' }} />
    </div>
  );
}

function formatPublishedAt(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingBlock: 48 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #333', borderTopColor: '#888', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes heroZoomIn { from { transform: scale(1.12); opacity: 0.4; } to { transform: scale(1); opacity: 1; } }
        .hero-zoom-in { animation: heroZoomIn 0.6s cubic-bezier(0.22, 1, 0.36, 1); transform-origin: center 35%; }
        @keyframes entityPulse {
          0% { background: transparent; }
          30% { background: rgba(185, 148, 255, 0.30); }
          100% { background: rgba(185, 148, 255, 0.10); }
        }
        .entity-pulse { animation: entityPulse 1.4s ease-out 0.4s both; border-radius: 3px; padding: 0 2px; }
        @keyframes biasDotIn {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.6); opacity: 1; }
          80% { transform: scale(0.92); }
          100% { transform: scale(1); opacity: 1; }
        }
        .bias-dot-in { animation: biasDotIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both; }
        @keyframes tabActiveSlide { from { transform: scaleX(0.85); opacity: 0.6; } to { transform: scaleX(1); opacity: 1; } }
        .tab-active-pill { animation: tabActiveSlide 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
      `}</style>
    </div>
  );
}

function TabIcon({ tab, color }: { tab: string; color: string }) {
  // Ionicons-matched SVGs: reader-outline / document-text-outline / list-outline / happy-outline
  const common = { width: 15, height: 15, viewBox: '0 0 512 512', fill: 'none', stroke: color, strokeWidth: 32, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (tab === 'Long Form') {
    return (
      <svg {...common}>
        <path d="M256 160c16-63.16 76.43-95.41 208-96a15.94 15.94 0 0116 16v288a16 16 0 01-16 16c-128 0-177.45 25.81-208 64-30.37-38-80-64-208-64-9.88 0-16-8.05-16-17.93V80a15.94 15.94 0 0116-16c131.57.59 192 32.84 208 96zM256 160v288" />
      </svg>
    );
  }
  if (tab === 'Summary') {
    return (
      <svg {...common}>
        <path d="M416 221.25V416a48 48 0 01-48 48H144a48 48 0 01-48-48V96a48 48 0 0148-48h140.75a32 32 0 0122.62 9.37l141.26 141.26a32 32 0 019.37 22.62z" />
        <path d="M256 56v120a32 32 0 0032 32h120M176 288h160M176 368h160" />
      </svg>
    );
  }
  if (tab === '5 Ws') {
    return (
      <svg {...common}>
        <path d="M160 144h288M160 256h288M160 368h288" />
        <circle cx="80" cy="144" r="16" fill={color} stroke="none" />
        <circle cx="80" cy="256" r="16" fill={color} stroke="none" />
        <circle cx="80" cy="368" r="16" fill={color} stroke="none" />
      </svg>
    );
  }
  // ELI5 — happy face
  return (
    <svg {...common}>
      <path d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192z" />
      <path d="M168 320c20 32 49 48 88 48s68-16 88-48" />
      <circle cx="184" cy="208" r="20" fill={color} stroke="none" />
      <circle cx="328" cy="208" r="20" fill={color} stroke="none" />
    </svg>
  );
}

function StatCell({ value, label, accent }: { value: number | string; label: string; accent: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ color: accent, fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>{value}</span>
      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, marginTop: 2 }}>
        {label}
      </span>
    </div>
  );
}

function DedupModal({ onClose, originalParagraphs, paragraphs, dedupedFlag, apiUrl }: {
  onClose: () => void;
  originalParagraphs: string[];
  paragraphs: string[];
  dedupedFlag: boolean;
  apiUrl: string;
}) {
  const wc = (s: string) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
  const preText = originalParagraphs.join(' ');
  const postText = paragraphs.join(' ');
  const preWords = wc(preText);
  const postWords = wc(postText);
  const wordsReduction = preWords > 0 ? Math.max(0, Math.round(((preWords - postWords) / preWords) * 100)) : 0;
  const paraReduction = originalParagraphs.length > 0
    ? Math.max(0, Math.round(((originalParagraphs.length - paragraphs.length) / originalParagraphs.length) * 100))
    : 0;
  const finalNorm = new Set(paragraphs.map(p => p.trim()));
  const removed = originalParagraphs.filter(p => !finalNorm.has(p.trim()));

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0E0E0E', borderRadius: 14, border: '1px solid #222',
        padding: 16, maxWidth: 480, width: '100%', maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: 1.4 }}>DEDUP VALIDATION</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <Cell label="SERVER FLAG" value={dedupedFlag ? 'deduped: true' : 'deduped: false'} color={dedupedFlag ? '#34C759' : '#FF9500'} />
          <Cell label="WORDS" value={`${preWords} → ${postWords}  (${wordsReduction}% less)`} />
          <Cell label="PARAGRAPHS" value={`${originalParagraphs.length} → ${paragraphs.length}  (${paraReduction}% less)`} />
          <Cell label="REMOVED COUNT" value={String(removed.length)} />
        </div>

        <Label text="API ENDPOINT" />
        <a href={apiUrl || '#'} target="_blank" rel="noopener noreferrer" style={{
          display: 'block', textDecoration: 'none',
          background: '#161616', borderRadius: 8, padding: 10,
          border: '1px solid #222', marginBottom: 16,
        }}>
          <div style={{ color: '#9AD0FF', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.4, wordBreak: 'break-all' }}>
            {apiUrl || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, color: '#3B9EFF', fontSize: 10, fontWeight: 800, letterSpacing: 1.2 }}>
            OPEN RAW JSON ↗
          </div>
        </a>

        {removed.length > 0 && (
          <>
            <Label text={`REMOVED / MERGED PARAGRAPHS (${removed.length})`} />
            {removed.map((p, i) => (
              <DiffRow key={i} type="removed" text={p} />
            ))}
          </>
        )}

        <Label text={`KEPT PARAGRAPHS (${paragraphs.length})`} />
        {paragraphs.map((p, i) => (
          <DiffRow key={i} type="kept" text={p} />
        ))}
      </div>
    </div>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#161616', borderRadius: 8, padding: 10, border: '1px solid #222' }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color ?? '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: 1.4, marginTop: 16, marginBottom: 8 }}>
      {text}
    </div>
  );
}

function DiffRow({ type, text }: { type: 'removed' | 'kept'; text: string }) {
  const isRemoved = type === 'removed';
  return (
    <div style={{
      display: 'flex', gap: 8,
      background: isRemoved ? 'rgba(255,59,48,0.08)' : 'rgba(52,199,89,0.06)',
      borderLeft: `2px solid ${isRemoved ? '#FF3B30' : '#34C759'}`,
      padding: 8, marginBottom: 6, borderRadius: 4,
    }}>
      <span style={{ color: isRemoved ? '#FF3B30' : '#34C759', fontFamily: 'monospace', fontWeight: 800, fontSize: 13 }}>
        {isRemoved ? '−' : '+'}
      </span>
      <span style={{ flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}
