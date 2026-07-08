import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleParams, Story } from '../types';
import { lighten } from '../utils/colors';
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

interface AiResult { bullets?: string[]; summary?: string; fiveWs?: string[]; eli5?: string; keyPeople?: string[]; keyCompanies?: string[]; }

// Colored/bold highlight for named entities (people/companies) — used on both
// the headline and bullet/paragraph text so a brand or person's name pops the
// same way it does in the Particle-style reference design.
function highlightTerms(text: string, terms: string[], color: string): React.ReactNode {
  if (!text) return null;
  const escaped = [...new Set(terms)]
    .filter(t => t && t.length > 2)
    .sort((a, b) => b.length - a.length)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return text;
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
  const parts = text.split(re);
  return parts.map((p, i) => i % 2 === 1
    ? <strong key={i} className="entity-pulse" style={{ color, fontWeight: 800 }}>{p}</strong>
    : <React.Fragment key={i}>{p}</React.Fragment>);
}

// Quoted text ("…") → italic gold, layered under the entity highlight above.
function renderParagraphHighlights(text: string, entities: string[], color: string, opts: { showEntities?: boolean; showQuotes?: boolean }): React.ReactNode {
  if (!text) return null;
  const showEntities = opts.showEntities !== false;
  const showQuotes = opts.showQuotes !== false;
  if (!showQuotes) return showEntities ? highlightTerms(text, entities, color) : text;
  const QUOTE_RE = /(["“][^"”]{3,}?["”])/g;
  const segments = text.split(QUOTE_RE);
  return segments.map((seg, i) => {
    if (QUOTE_RE.test(seg)) {
      QUOTE_RE.lastIndex = 0;
      return <span key={i} style={{ color: '#FFC542', fontStyle: 'italic', fontWeight: 500 }}>{seg}</span>;
    }
    QUOTE_RE.lastIndex = 0;
    return <React.Fragment key={i}>{showEntities ? highlightTerms(seg, entities, color) : seg}</React.Fragment>;
  });
}

const SKIP_NAME_WORDS = new Set([
  'January','February','March','April','May','June','July','August','September','October','November','December',
  'The','This','That','These','Those','Their','Its','His','Her','Our','Your',
  'Said','Also','After','Before','During','While','When','Where','Who','What','How','Why',
  'Spokesperson','Official','Representative','Director','Secretary','General','Deputy','Chairman',
  'New','Old','Former','Senior','Junior','Acting','Current','Late',
  'North','South','East','West','Central',
]);
const SKIP_ORG_CODES = new Set([
  'US','UK','EU','UAE','KSA','AU','NZ','IS','DE','FR','JP','CA','MX','BR','AR','ZA','EG',
  'SA','IR','IQ','SY','TR','PK','AF','BD','LK','MM','TH','VN','PH','ID','MY',
]);

function extractEntities(text: string) {
  const people: string[] = [];
  const companies: string[] = [];
  const words = text.split(/\s+/);
  words.forEach((word, i) => {
    const clean = word.replace(/[^a-zA-Z]/g, '');
    if (!clean || clean.length < 2) return;
    if (/^[A-Z]{3,10}$/.test(clean) && !SKIP_ORG_CODES.has(clean) && !companies.includes(clean)) {
      companies.push(clean);
    }
    if (i > 0) {
      const prevClean = words[i - 1]?.replace(/[^a-zA-Z]/g, '') ?? '';
      if (
        /^[A-Z][a-z]{2,}$/.test(clean) && /^[A-Z][a-z]{2,}$/.test(prevClean) &&
        !SKIP_NAME_WORDS.has(clean) && !SKIP_NAME_WORDS.has(prevClean)
      ) {
        const person = prevClean + ' ' + clean;
        if (!people.includes(person)) people.push(person);
      }
    }
  });
  return { people: people.slice(0, 5), companies: companies.slice(0, 5) };
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
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

// "24 MIN AGO" style relative stamp — falls back to a plain date past a week old.
function formatRelativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return 'JUST NOW';
  if (diffMin < 60) return `${diffMin} MIN AGO`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} HR AGO`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} DAY${diffDay > 1 ? 'S' : ''} AGO`;
  return fmtDateInline(iso).toUpperCase();
}

function splitSentences(t: string): string[] {
  const out: string[] = [];
  const sents = t.match(/[^.!?]+[.!?]+(\s|$)/g)?.map(s => s.trim()).filter(Boolean) ?? [t];
  for (let i = 0; i < sents.length; i += 2) out.push(sents.slice(i, i + 2).join(' '));
  return out;
}

export default function ArticleScreen({ params }: { params: ArticleParams }) {
  const { goBack } = useRouter();
  const {
    fontSize: fontSizeName, defaultArticleTab, summaryLength, keyPointsCount, eli5Tone, linkOpen,
    showEntityHighlights, showQuoteHighlights, fontFamily, lineHeightMode, columnWidth,
  } = useSettings();

  const fontFamilyCss = fontFamily === 'serif'
    ? "Georgia, 'Times New Roman', serif"
    : fontFamily === 'system'
      ? "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      : "'Inter', sans-serif";
  const lineHeightCss = lineHeightMode === 'tight' ? 1.45 : lineHeightMode === 'loose' ? 1.9 : 1.7;
  const columnMaxPx = columnWidth === 'narrow' ? 520 : columnWidth === 'wide' ? 820 : 660;
  const { hide, show } = useTabBar();

  useEffect(() => {
    hide();
    return () => show();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fontSizePx = FONT_SIZE_MAP[fontSizeName] ?? 17;

  const dominant = params.dominantColor;
  const accent = lighten(dominant, 0.2);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const noHero = !params.image || heroImageFailed;

  const [activeTab, setActiveTab] = useState<Tab>(defaultArticleTab as Tab);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [paragraphsLoading, setParagraphsLoading] = useState(true);
  const [paragraphsError, setParagraphsError] = useState<string | null>(null);
  const [entities, setEntities] = useState<{ people: string[]; companies: string[] }>({ people: [], companies: [] });
  const [hasBeenRead, setHasBeenRead] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const aiCache = useRef<Record<string, AiResult>>({});

  const allStories: Story[] = useMemo(() => { try { return JSON.parse(params.allStories) ?? []; } catch { return []; } }, [params.allStories]);

  useEffect(() => {
    const articleCategory = deriveCategory(params.source ?? '', params.url ?? '', params.headline ?? '');
    const storyTopic = (allStories.find(x => x.id === params.id) as any)?.category ?? '';
    trackArticleRead(params.source ?? '', articleCategory, storyTopic);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (hasBeenRead) return; const t = setTimeout(() => setHasBeenRead(true), 5000); return () => clearTimeout(t); }, []);

  // If Summary pre-warmed in cache: skip 5s gate + seed AI entities immediately
  useEffect(() => {
    const lengthMap: Record<string, number> = { short: 150, medium: 250, long: 400 };
    const maxWords = lengthMap[summaryLength] ?? 250;
    const cacheKey = `summary_v5_${params.id ?? params.url}_summary_${maxWords}_${keyPointsCount}_${eli5Tone}`;
    const hit = getCached(cacheKey, TTL.AI_SUMMARY) as { keyPeople?: string[]; keyCompanies?: string[] } | null;
    if (!hit) return;
    if (!hasBeenRead) setHasBeenRead(true);
    const people = (hit.keyPeople ?? []).filter(Boolean);
    const companies = (hit.keyCompanies ?? []).filter(Boolean);
    if (people.length > 0 || companies.length > 0) setEntities({ people, companies });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!params.url) { setParagraphs(params.summary ? [params.summary] : []); setParagraphsLoading(false); return; }
    fetch(`${API}/article?url=${encodeURIComponent(params.url)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const paras: string[] = data.paragraphs ?? data.originalParagraphs ?? (data.text ? data.text.split('\n\n').filter(Boolean) : null) ?? (params.summary ? [params.summary] : []);
        const filtered = paras.filter(Boolean);
        setParagraphs(filtered);
        setEntities(extractEntities(filtered.join(' ')));
      }).catch(e => { setParagraphsError(e.message); setParagraphs(params.summary ? [params.summary] : []); })
      .finally(() => setParagraphsLoading(false));
  }, [params.url]);

  useEffect(() => {
    const aiType = TAB_AI_TYPE[activeTab];
    if (!aiType || !hasBeenRead || paragraphsLoading || paragraphs.length === 0) return;
    const lengthMap: Record<typeof summaryLength, number> = { short: 150, medium: 250, long: 400 };
    const maxWordsForType = activeTab === 'ELI5' ? 100 : lengthMap[summaryLength];
    const cacheKey = `summary_v5_${params.id ?? params.url}_${aiType}_${maxWordsForType}_${keyPointsCount}_${eli5Tone}`;
    const tabCacheKey = `${activeTab}|${maxWordsForType}|${keyPointsCount}|${eli5Tone}`;
    if (aiCache.current[tabCacheKey]) { setAiResult(aiCache.current[tabCacheKey]!); return; }
    const cached = getCached(cacheKey, TTL.AI_SUMMARY);
    if (cached) { aiCache.current[tabCacheKey] = cached; setAiResult(cached); return; }
    let cancelled = false;
    setAiLoading(true); setAiError(null); setAiResult(null);
    trackAiUsage(aiType as 'summary' | 'fiveWs' | 'eli5');
    const body = JSON.stringify({ url: params.url, paragraphs: paragraphs.slice(0,15), type: aiType, maxWords: maxWordsForType, keyPoints: keyPointsCount, eli5Tone });
    const doFetch = () => fetch(`${API}/ai-summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    (async () => {
      let r = await doFetch();
      if (!r.ok && r.status >= 500 && r.status < 600) {
        await new Promise(res => setTimeout(res, 2000));
        if (cancelled) throw new Error('cancelled');
        r = await doFetch();
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<AiResult>;
    })()
      .then(data => { aiCache.current[tabCacheKey] = data; setCached(cacheKey, data); if (!cancelled) setAiResult(data); })
      .catch(e => { if (!cancelled) setAiError(String(e instanceof Error ? e.message : e)); })
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, paragraphsLoading, hasBeenRead, summaryLength, keyPointsCount, eli5Tone]);

  useEffect(() => {
    if (!aiResult) return;
    const people = aiResult.keyPeople?.filter(Boolean) ?? [];
    const companies = aiResult.keyCompanies?.filter(Boolean) ?? [];
    if (people.length > 0 || companies.length > 0) setEntities({ people, companies });
  }, [aiResult]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const entityList = [...entities.people, ...entities.companies];

  function renderTabContent() {
    if (activeTab === 'Long Form') {
      if (paragraphsLoading) return <Spinner />;
      return (
        <div>
          {paragraphsError && <div style={{ color: '#FF6B6B', fontSize: 12, marginBottom: 14 }}>Full text unavailable from this publisher</div>}
          {paragraphs.map((p, i) => (
            <p key={i} style={{ color: '#EDEDED', fontSize: fontSizePx, lineHeight: lineHeightCss, fontFamily: fontFamilyCss, marginBottom: 16 }}>
              {renderParagraphHighlights(p, entityList, accent, { showEntities: showEntityHighlights, showQuotes: showQuoteHighlights })}
            </p>
          ))}
          <a href={params.url}
            target={linkOpen === 'external' ? '_blank' : '_self'}
            rel="noopener noreferrer"
            style={{ display: 'block', marginTop: 8, padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Read Full Article →
          </a>
        </div>
      );
    }

    if (!hasBeenRead) {
      return <div style={{ textAlign: 'center', padding: '48px 0', color: '#555' }}>Keep reading… AI summary generating</div>;
    }
    if (aiLoading) return <Spinner />;
    if (aiError) return <div style={{ color: '#666', textAlign: 'center', paddingBlock: 40 }}>{aiError}</div>;

    if (activeTab === 'Summary') {
      const rawSummary = (aiResult?.summary ?? '').trim();
      const bulletLines = aiResult?.bullets?.length ? aiResult.bullets : (rawSummary ? splitSentences(rawSummary) : []);
      if (bulletLines.length === 0) return <div style={{ color: '#444', textAlign: 'center', paddingBlock: 40 }}>No summary available.</div>;
      return <BulletList lines={bulletLines} entities={entityList} accent={accent} />;
    }

    if (activeTab === '5 Ws') {
      const lines = aiResult?.fiveWs ?? [];
      if (!lines.length) return <div style={{ color: '#444', textAlign: 'center', paddingBlock: 40 }}>Not available.</div>;
      return (
        <div>
          {lines.map((line, i) => {
            const match = line.match(/^(WHO|WHAT|WHEN|WHERE|WHY)\s*:\s*/i);
            const label = match ? match[1].toUpperCase() : line.slice(0, 5).toUpperCase();
            const body = match ? line.slice(match[0].length) : line;
            return (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i === lines.length - 1 ? 0 : 18, alignItems: 'flex-start' }}>
                <div style={{ width: 7, height: 7, borderRadius: 4, background: accent, flexShrink: 0, marginTop: 8 }} />
                <p style={{ color: '#EDEDED', fontSize: 16.5, lineHeight: 1.6, margin: 0 }}>
                  <strong style={{ color: accent, fontWeight: 800 }}>{label}:</strong> {highlightTerms(body, entityList, accent)}
                </p>
              </div>
            );
          })}
        </div>
      );
    }

    // ELI5
    if (!aiResult?.eli5) return <div style={{ color: '#444', textAlign: 'center', paddingBlock: 40 }}>Not available.</div>;
    return <p style={{ color: '#fff', fontSize: 19, lineHeight: 1.6, fontWeight: 500, margin: 0 }}>{aiResult.eli5}</p>;
  }

  return (
    <div style={{ height: '100%', background: '#000', overflowY: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
      {/* Back button — floats over the hero, same as the reference's Safari chrome sitting over the article's featured image */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: 12, right: 12, zIndex: 10, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
        <button onClick={goBack} style={{ pointerEvents: 'auto', background: `${dominant}90`, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 22, padding: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <a href={params.url} target="_blank" rel="noopener noreferrer" style={{ pointerEvents: 'auto', background: `${dominant}90`, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 22, padding: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
        </a>
      </div>

      {/* Hero — story's dominant color washes over the image, fading fully to
          black before the headline (matches the reference: the photo/color
          bleed resolves to solid black well above the text, never behind it). */}
      <div style={{ height: 260, position: 'relative', overflow: 'hidden' }}>
        <img
          src={noHero ? FALLBACK_IMG : params.image}
          alt=""
          onError={() => setHeroImageFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: `${dominant}55` }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to bottom, transparent 0%, transparent 40%, #000 92%)`,
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '14px 18px 0', marginTop: -1 }}>
        {/* Timestamp */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12 }}>⚡</span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
            {formatRelativeTime(params.publishedAt)}
          </span>
        </div>

        {/* Headline — entity terms colored/bold, rest plain white */}
        <h1 style={{ color: '#fff', fontSize: 29, fontWeight: 800, lineHeight: 1.25, margin: '10px 0 0' }}>
          {highlightTerms(params.headline, entityList, accent)}
        </h1>

        {/* Dek */}
        {params.summary && (
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.5, margin: '10px 0 0' }}>{params.summary}</p>
        )}

        {/* Text-only tabs — no icons, no pill background */}
        <div style={{ display: 'flex', gap: 22, marginTop: 22, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {TABS.map(tab => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '2px 0 10px', whiteSpace: 'nowrap',
                  color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: 14, fontWeight: active ? 800 : 500,
                  transition: 'color 0.2s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Content card */}
        <div style={{ margin: '18px 0', maxWidth: columnMaxPx, marginInline: 'auto' }}>
          <div style={{ borderRadius: 20, padding: '20px 18px', background: 'rgba(255,255,255,0.065)' }}>
            {renderTabContent()}
          </div>
        </div>
      </div>

      {/* Bottom padding so the floating action pill never covers the last line */}
      <div style={{ height: 'calc(96px + env(safe-area-inset-bottom, 0px))' }} />

      {/* Floating action pill */}
      <div style={{
        position: 'fixed', left: 16, right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', alignItems: 'stretch', borderRadius: 999,
        background: 'rgba(20,20,24,0.85)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        zIndex: 50, padding: 4,
      }}>
        <button onClick={() => setToast('Coming soon')} style={pillBtnStyle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2 1.8-2 3.5" strokeLinecap="round" /><circle cx="12" cy="17" r="0.6" fill="#fff" /></svg>
          Ask Question
        </button>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.14)', marginBlock: 8 }} />
        <button onClick={() => setToast('Coming soon')} style={pillBtnStyle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Post Comment
        </button>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))', transform: 'translateX(-50%)',
          background: 'rgba(30,30,34,0.95)', color: '#fff', fontSize: 12.5, fontWeight: 600,
          padding: '8px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', zIndex: 60,
        }}>{toast}</div>
      )}

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes entityPulse {
          0% { background: transparent; }
          30% { background: rgba(185, 148, 255, 0.30); }
          100% { background: rgba(185, 148, 255, 0.10); }
        }
        .entity-pulse { animation: entityPulse 1.4s ease-out 0.2s both; border-radius: 3px; padding: 0 2px; }
      `}</style>
    </div>
  );
}

const pillBtnStyle: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#fff', fontSize: 13.5, fontWeight: 600, padding: '12px 0',
  WebkitTapHighlightColor: 'transparent',
};

function BulletList({ lines, entities, accent }: { lines: string[]; entities: string[]; accent: string }) {
  return (
    <div>
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i === lines.length - 1 ? 0 : 16, alignItems: 'flex-start' }}>
          <div style={{ width: 7, height: 7, borderRadius: 4, background: accent, flexShrink: 0, marginTop: 8 }} />
          <p style={{ color: '#EDEDED', fontSize: 16.5, lineHeight: 1.6, margin: 0 }}>{highlightTerms(line, entities, accent)}</p>
        </div>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingBlock: 40 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #333', borderTopColor: '#888', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}
