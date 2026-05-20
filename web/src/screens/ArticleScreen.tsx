import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleParams, Story } from '../types';
import { darken, lighten, getArticleColor } from '../utils/colors';
import { useRouter } from '../contexts/RouterContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTabBar } from '../contexts/TabBarContext';
import { getCached, setCached, TTL } from '../utils/cache';
import { trackArticleRead, trackAiUsage } from '../utils/usageTracker';

const API = 'https://ireader.onrender.com/api/news';
const TABS = ['Long Form', 'Summary', '5 Ws', 'ELI5'] as const;
type Tab = typeof TABS[number];
type AiType = 'summary' | 'fiveWs' | 'eli5';
const TAB_AI_TYPE: Partial<Record<Tab, AiType>> = { Summary: 'summary', '5 Ws': 'fiveWs', ELI5: 'eli5' };
const FONT_SIZE_MAP: Record<string, number> = { Small: 14, Medium: 17, Large: 19, XLarge: 21 };

interface AiResult { bullets?: string[]; summary?: string; fiveWs?: string[]; eli5?: string; }
interface SourceEntry { name: string; url: string; imageUrl?: string; publishedAt: string; }

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

  const BLOCKED_LONGFORM_SOURCES = ['NYT World', 'NDTV'];
  const defaultTab: Tab = BLOCKED_LONGFORM_SOURCES.includes(params.source ?? '') ? 'Summary' : 'Long Form';
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [paragraphsLoading, setParagraphsLoading] = useState(true);
  const [paragraphsError, setParagraphsError] = useState<string | null>(null);
  const [readingTimeMinutes, setReadingTimeMinutes] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
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

  useEffect(() => { trackArticleRead(params.source ?? ''); }, []);
  useEffect(() => { if (hasBeenRead) return; const t = setTimeout(() => setHasBeenRead(true), 5000); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (!params.url) { setParagraphs(params.summary ? [params.summary] : []); setParagraphsLoading(false); return; }
    fetch(`${API}/article?url=${encodeURIComponent(params.url)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const paras: string[] = data.paragraphs ?? (data.text ? data.text.split('\n\n').filter(Boolean) : null) ?? (params.summary ? [params.summary] : []);
        const filtered = paras.filter(Boolean);
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
            {paragraphs.map((p, i) => <p key={i} style={{ color: '#DDD', fontSize: fontSizePx, lineHeight: 1.65, marginBottom: 16 }}>{p}</p>)}
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

      {/* Hero image */}
      <div style={{ height: 280, position: 'relative', marginTop: 0 }}>
        {params.image ? <img src={params.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', background: darken(dominant, 0.3) }} />}
        <div style={{ position: 'absolute', inset: 0, background: `${dominant}4D` }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 40%, ${dominant}CC 75%, ${dominant} 100%)` }} />
      </div>

      {/* Meta */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 500, marginBottom: 8 }}>{formatPublishedAt(params.publishedAt)}</div>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: 1.33, margin: 0 }}>{params.headline}</h1>
        {params.summary && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.55, margin: '10px 0 0' }}>{params.summary}</p>}

        {/* Source icons */}
        {allSources.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
            {allSources.slice(0,5).map((src, i) => {
              const faviconUri = src.url ? faviconFromUrl(src.url) : '';
              return (
                <div key={i} style={{ width: 36, height: 36, borderRadius: 18, border: `2px solid ${dominant}`, overflow: 'hidden', marginLeft: i > 0 ? -12 : 0, background: lighten(dominant, 0.2), zIndex: 5-i, position: 'relative' }}>
                  {faviconUri
                    ? <img src={faviconUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, fontSize: 14, fontWeight: 800 }}>{src.name.charAt(0)}</div>
                  }
                </div>
              );
            })}
            <span style={{ marginLeft: 10, color: lighten(dominant, 0.4), fontSize: 12, fontWeight: 600 }}>{allSources.slice(0,5).map(s=>s.name).join('  ·  ')}</span>
          </div>
        )}
      </div>

      {/* Reading meta */}
      {(readingTimeMinutes != null || difficulty != null) && (() => {
        const color = { Easy: '#34C759', Medium: '#FF9500', Hard: '#FF3B30' }[difficulty ?? 'Medium'] ?? '#FF9500';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px 14px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{readingTimeMinutes} min read</span>
            {difficulty != null && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>·</span>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                <span style={{ color, fontSize: 12, fontWeight: 500 }}>{difficulty}</span>
              </>
            )}
          </div>
        );
      })()}

      {/* Tab bar */}
      <div style={{ display: 'flex', margin: '0 16px 20px', background: tabBg, borderRadius: 999, padding: 4 }}>
        {(BLOCKED_LONGFORM_SOURCES.includes(params.source ?? '') ? TABS.filter(t => t !== 'Long Form') : TABS).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', cursor: 'pointer', background: activeTab === tab ? '#fff' : 'transparent', color: activeTab === tab ? '#000' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}>
            {tab}
          </button>
        ))}
      </div>

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
                  {s.imageUrl ? <img src={s.imageUrl} alt="" style={{ width: 180, height: 100, objectFit: 'cover', display: 'block' }} /> : <div style={{ width: 180, height: 100, background: '#222' }} />}
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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
