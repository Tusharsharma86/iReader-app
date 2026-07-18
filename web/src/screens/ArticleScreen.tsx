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
import { toggleFollowEntity, getFollowedEntities } from '../utils/entityFollowStore';

const API = 'https://ireader.onrender.com/api/news';
const TABS = ['Long Form', 'Summary', '5 Ws', 'ELI5'] as const;
type Tab = typeof TABS[number];
type AiType = 'summary' | 'fiveWs' | 'eli5';
const TAB_AI_TYPE: Partial<Record<Tab, AiType>> = { Summary: 'summary', '5 Ws': 'fiveWs', ELI5: 'eli5' };
const FONT_SIZE_MAP: Record<string, number> = { Small: 14, Medium: 17, Large: 19, XLarge: 21 };

interface AiResult { bullets?: string[]; summary?: string; fiveWs?: string[]; eli5?: string; keyPeople?: string[]; keyCompanies?: string[]; }
interface SourceEntry { name: string; url: string; imageUrl?: string; publishedAt: string; }

// Render a paragraph with two-tier highlights:
//   - quoted text ("…" or curly quotes) → italic + gold accent
//   - named entities (people/companies) → white bold
// Falls back to plain text when no matches.
function renderParagraphHighlights(
  text: string,
  entities: string[],
  _accent: string,
  opts: { showEntities?: boolean; showQuotes?: boolean } = {},
): React.ReactNode {
  if (!text) return null;
  const showEntities = opts.showEntities !== false;
  const showQuotes = opts.showQuotes !== false;
  // If quotes turned off, skip the quote pass entirely.
  if (!showQuotes) {
    return showEntities ? renderEntities(text, entities) : text;
  }
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
    return <React.Fragment key={i}>{showEntities ? renderEntities(seg, entities) : seg}</React.Fragment>;
  });
}

function renderEntities(text: string, entities: string[], color: string = '#fff'): React.ReactNode {
  if (!entities || entities.length === 0) return text;
  const escaped = [...new Set(entities)]
    .filter(e => e && e.length > 2)
    .sort((a, b) => b.length - a.length)
    .map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return text;
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
  const parts = text.split(re);
  return parts.map((p, i) => i % 2 === 1
    ? <strong key={i} className="entity-pulse" style={{ color, fontWeight: 700 }}>{p}</strong>
    : <React.Fragment key={i}>{p}</React.Fragment>);
}

// Headline entity highlight — same word-matching as renderEntities, but
// colored (accent) instead of white, matching the Particle-style headline.
function renderHeadlineHighlights(text: string, entities: string[], color: string): React.ReactNode {
  if (!entities || entities.length === 0) return text;
  const escaped = [...new Set(entities)]
    .filter(e => e && e.length > 2)
    .sort((a, b) => b.length - a.length)
    .map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return text;
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
  const parts = text.split(re);
  return parts.map((p, i) => i % 2 === 1
    ? <span key={i} style={{ color }}>{p}</span>
    : <React.Fragment key={i}>{p}</React.Fragment>);
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
    // Orgs/companies: all-caps 3-10 chars, not a country code
    if (/^[A-Z]{3,10}$/.test(clean) && !SKIP_ORG_CODES.has(clean) && !companies.includes(clean)) {
      companies.push(clean);
    }
    // People: two consecutive TitleCase words (≥3 chars each), not skip/filler words
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

// Abbreviation periods ("U.S.", "U.K.", "Mr.", "Dr.", ...) look identical to
// sentence-ending periods to a naive split — without this, "U.S. forces"
// fragments into standalone "U." and "S." bullets. Replace their periods
// with a placeholder before splitting, restore after.
const ABBREV_PERIOD_RE =
  /\b(?:[A-Z]\.){2,}|\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Gen|Sen|Rep|Gov|Capt|Lt|Col|Maj|Sgt|No|Co|Inc|Ltd|Corp)\.(?=\s|$)/g;
const ABBREV_PLACEHOLDER = String.fromCharCode(1);
function protectAbbreviationPeriods(text: string): string {
  return text
    .replace(ABBREV_PERIOD_RE, m => m.split('.').join(ABBREV_PLACEHOLDER))
    // Decimal numbers ("8.2 kg", "67.5%") — same fragmenting problem.
    .replace(/(\d)\.(?=\d)/g, `$1${ABBREV_PLACEHOLDER}`);
}
function splitIntoSentences(text: string): string[] {
  // Trailing close-quotes belong to the sentence they end ('…resignation."')
  // — without ["'”’]* in the match, the quote orphans onto the next bullet.
  const parts = protectAbbreviationPeriods(text).match(/[^.!?]+[.!?]+["'”’]*(\s|$)/g)
    ?.map(s => s.trim().split(ABBREV_PLACEHOLDER).join('.')).filter(Boolean) ?? [text];
  // Merge tiny fragments (broken splits) into the previous sentence.
  const out: string[] = [];
  for (const p of parts) {
    if (out.length > 0 && p.length < 20) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
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
  const {
    fontSize: fontSizeName,
    defaultArticleTab,
    showStatsCard, showArticleRssSummary, showVerifyDedup: showVerifyDedupSetting,
    showReferencedSources, showKeyPoints,
    summaryLength, summaryFormat, keyPointsCount, linkOpen,
    // Wave 2
    showEntityHighlights, showQuoteHighlights, showReadingDifficulty,
    fontFamily, lineHeightMode, columnWidth,
    eli5Tone,
  } = useSettings();

  // Customize: font / line-height / column width. Inter + Merriweather are
  // self-hosted (see main.tsx) — actually loaded, not just named and hoped
  // for. Georgia is a Microsoft-licensed font we can't redistribute, so
  // serif mode uses Merriweather (SIL OFL, same screen-reading design goal)
  // instead; it's listed as a harmless fallback for the rare device that
  // happens to have it installed.
  const fontFamilyCss = fontFamily === 'serif'
    ? "'Merriweather', Georgia, 'Times New Roman', serif"
    : fontFamily === 'system'
      ? "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      : "'Inter', sans-serif";
  const lineHeightCss = lineHeightMode === 'tight' ? 1.45 : lineHeightMode === 'loose' ? 1.9 : 1.7;
  const columnMaxPx = columnWidth === 'narrow' ? 520 : columnWidth === 'wide' ? 820 : 660;
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
  // AI Summary tab: follow the same font-size customization as Long Form
  // (was hardcoded 15/13.5px, ignoring the user's Customize setting), but
  // keep the text visibly distinct from Long Form's plain #DDD/#BBB with a
  // subtle per-topic tint instead of flat gray.
  const summaryFontSizePx = fontSizePx;
  const summarySecondaryFontSizePx = Math.max(11, fontSizePx - 1.5);
  const summaryTextColor = lighten(dominant, 0.82);
  const summarySecondaryTextColor = lighten(dominant, 0.68);
  const tabBg = darken(dominant, 0.3);
  const borderColor = lighten(dominant, 0.3);
  const articleCategory = deriveCategory(params.source ?? '', params.url ?? '', params.headline ?? '');

  // Sources that block full-text fetch (paywall / scrape protection) — hide the
  // Long Form tab entirely and default to the AI Summary. Matches all variants:
  // "NYT", "NYT World", "New York Times", "NDTV", "NDTV Profit", "Ars Technica", etc.
  const blockLongform = false;
  // Respect the user's Customize → Default tab preference unless the source
  // blocks Long Form (then we force-fall to Summary).
  const userDefaultTab = defaultArticleTab as Tab;
  const defaultTab: Tab = blockLongform
    ? (userDefaultTab === 'Long Form' ? 'Summary' : userDefaultTab)
    : userDefaultTab;
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
  const [followedEntities, setFollowedEntities] = useState<Set<string>>(() => new Set(getFollowedEntities()));
  const [hasBeenRead, setHasBeenRead] = useState(blockLongform);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiCache = useRef<Record<string, AiResult>>({});

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
  // If Summary pre-warmed in cache: skip 5s gate + seed AI entities immediately
  useEffect(() => {
    const lengthMap: Record<string, number> = { short: 200, medium: 350, long: 550 };
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
    // v3 — invalidates v2 entries that may have been poisoned by lenient
    // empty-cache guard letting bullets-only responses through.
    // Customize: summary length → backend maxWords. Cache key includes the
    // length so different settings don't collide on cached responses.
    const lengthMap: Record<typeof summaryLength, number> = { short: 200, medium: 350, long: 550 };
    const maxWordsForType = activeTab === 'ELI5' ? 100 : lengthMap[summaryLength];
    const cacheKey = `summary_v5_${params.id ?? params.url}_${aiType}_${maxWordsForType}_${keyPointsCount}_${eli5Tone}`;
    // Session tab-cache must be keyed by settings too — keyed by tab alone it
    // kept serving the old-length result after a Customize change, defeating
    // the re-fetch deps below.
    const tabCacheKey = `${activeTab}|${maxWordsForType}|${keyPointsCount}|${eli5Tone}`;
    if (aiCache.current[tabCacheKey]) { setAiResult(aiCache.current[tabCacheKey]!); return; }
    const cached = getCached(cacheKey, TTL.AI_SUMMARY);
    if (cached) { aiCache.current[tabCacheKey] = cached; setAiResult(cached); return; }
    // Cancellation: without it, a quick tab switch left two fetches racing and
    // the LAST to resolve set state for whichever tab was open (wrong content
    // or a permanent "Not available" until re-toggle).
    let cancelled = false;
    setAiLoading(true); setAiError(null); setAiResult(null);
    trackAiUsage(aiType as 'summary' | 'fiveWs' | 'eli5');
    // Render free-tier cold-starts can briefly 5xx — one retry after 2s covers it.
    const body = JSON.stringify({ url: params.url, paragraphs: paragraphs.slice(0,15), type: aiType, maxWords: maxWordsForType, keyPoints: keyPointsCount, eli5Tone, publishedAt: params.publishedAt });
    const doFetch = () => fetch(`${API}/ai-summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    (async () => {
      let r = await doFetch();
      if (!r.ok && r.status >= 500 && r.status < 600) {
        // Honor the server's Retry-After (breaker/busy hint) instead of a
        // flat 2s; cap at 10s so the UI never feels stuck.
        const ra = Number(r.headers.get('Retry-After'));
        const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 2000;
        await new Promise(res => setTimeout(res, waitMs));
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
  // Customize: re-fetch when length / key-points / ELI5 tone changes.
  }, [activeTab, paragraphsLoading, hasBeenRead, summaryLength, keyPointsCount, eli5Tone]);

  // When AI summary loads, upgrade entities with AI-extracted keyPeople/keyCompanies
  // (much higher quality than client-side regex extraction).
  useEffect(() => {
    if (!aiResult) return;
    const people = aiResult.keyPeople?.filter(Boolean) ?? [];
    const companies = aiResult.keyCompanies?.filter(Boolean) ?? [];
    if (people.length > 0 || companies.length > 0) setEntities({ people, companies });
  }, [aiResult]);

  const gradient = `linear-gradient(to bottom, ${dominant}, ${darken(dominant, 0.4)} 30%, ${darken(dominant, 0.85)} 100%)`;

  function renderTabContent() {
    const longForm = (
      <div>
        {paragraphsLoading ? <Spinner /> : (
          <>
            {paragraphsError && <div style={{ color: '#FF6B6B', fontSize: 12, marginBottom: 12 }}>Full text unavailable from this publisher</div>}
            {paragraphs.map((p, i) => (
              <p key={i} style={{ color: '#DDD', fontSize: fontSizePx, lineHeight: lineHeightCss, fontFamily: fontFamilyCss, marginBottom: 16 }}>
                {renderParagraphHighlights(p, [...entities.people, ...entities.companies], accent, {
                  showEntities: showEntityHighlights,
                  showQuotes: showQuoteHighlights,
                })}
              </p>
            ))}
            <a href={params.url}
              target={linkOpen === 'external' ? '_blank' : '_self'}
              rel="noopener noreferrer"
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
      const rawSummary = (aiResult?.summary ?? '').trim();
      const bullets = aiResult?.bullets ?? [];
      // Three states:
      // 1. Has narrative summary → render as paragraphs + KEY POINTS footer
      // 2. Only bullets (legacy v1 cache or model omitted summary) → render
      //    bullets as a proper bullet list (do NOT fake-join into prose; that
      //    produced the "shows 3 key points only" complaint).
      // 3. Nothing → empty state.
      const splitSentences = (t: string): string[] => {
        const out: string[] = [];
        const sents = splitIntoSentences(t);
        for (let i = 0; i < sents.length; i += 3) out.push(sents.slice(i, i + 3).join(' '));
        return out;
      };
      const splitToSingleSentences = (t: string): string[] => splitIntoSentences(t);
      if (summaryFormat === 'bullets' && (rawSummary || bullets.length > 0)) {
        // Customize → Summary format: "Bullets" skips the narrative prose
        // entirely and shows the takeaway list on its own. Split the SAME
        // full-length narrative (capped by summaryLength, same as paragraph
        // mode) into one bullet per sentence — do NOT use the short
        // `bullets` (KEY POINTS) array here, that's capped independently by
        // keyPointsCount and reads noticeably shorter than the narrative.
        const summaryEntities = [...entities.people, ...entities.companies];
        const lines = rawSummary ? splitToSingleSentences(rawSummary) : bullets;
        aiContent = (
          <div>
            {lines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 18, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: dominant, flexShrink: 0, marginTop: 7 }} />
                <p style={{ color: summaryTextColor, fontSize: summaryFontSizePx, lineHeight: 1.6, fontFamily: fontFamilyCss, margin: 0 }}>{renderEntities(line, summaryEntities, accent)}</p>
              </div>
            ))}
          </div>
        );
      } else if (rawSummary) {
        const summaryEntities = [...entities.people, ...entities.companies];
        const paragraphs = rawSummary.includes('\n\n')
          ? rawSummary.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
          : splitSentences(rawSummary);
        aiContent = (
          <div>
            {paragraphs.map((p, i) => (
              <p key={i} style={{ color: summarySecondaryTextColor, fontSize: summarySecondaryFontSizePx, lineHeight: 1.55, fontFamily: fontFamilyCss, margin: '0 0 14px 0' }}>{renderEntities(p, summaryEntities, accent)}</p>
            ))}
            {showKeyPoints && bullets.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10.5, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>KEY POINTS</div>
                {bullets.map((line, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: dominant, flexShrink: 0, marginTop: 7 }} />
                    <p style={{ color: summarySecondaryTextColor, fontSize: summarySecondaryFontSizePx, lineHeight: 1.55, fontFamily: fontFamilyCss, margin: 0 }}>{renderEntities(line, summaryEntities, accent)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      } else if (bullets.length > 0) {
        const summaryEntities = [...entities.people, ...entities.companies];
        aiContent = (
          <div>
            {bullets.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 18, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: dominant, flexShrink: 0, marginTop: 7 }} />
                <p style={{ color: summaryTextColor, fontSize: summaryFontSizePx, lineHeight: 1.6, fontFamily: fontFamilyCss, margin: 0 }}>{renderEntities(line, summaryEntities, accent)}</p>
              </div>
            ))}
          </div>
        );
      } else {
        aiContent = <div style={{ color: '#444', textAlign: 'center', paddingBlock: 40 }}>No summary available.</div>;
      }
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

    const inputWords = paragraphs.slice(0, 15).join(' ').slice(0, 2500).trim().split(/\s+/).filter(Boolean).length;
    const isLimitedSource = inputWords < 150;
    return (
      <div>
        <div style={{
          padding: '14px 14px', borderRadius: 12, marginBottom: 20,
          background: isLimitedSource ? 'rgba(245,158,11,0.06)' : 'rgba(0,0,0,0.3)',
          border: `1px solid ${isLimitedSource ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.08)'}`,
        }}>
          {!paragraphsLoading && inputWords > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
              {isLimitedSource && <span style={{ fontSize: 11 }}>⚠️</span>}
              <span style={{
                color: isLimitedSource ? '#f59e0b' : 'rgba(255,255,255,0.2)',
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              }}>
                {isLimitedSource
                  ? `LIMITED SOURCE · ${inputWords} words — summary may be inaccurate`
                  : `AI read ${inputWords} words`}
              </span>
            </div>
          )}
          {aiContent}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 20 }}>
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
      <div style={{ height: 320, position: 'relative', marginTop: 0, overflow: 'hidden' }}>
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
      <div style={{ padding: '4px 16px 14px', marginTop: -136, position: 'relative' }}>
        {/* Category chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '4px 10px', borderRadius: 999,
          border: `1px solid ${accent}88`, color: accent,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
          marginBottom: 14,
        }}>{articleCategory}</div>

        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: 1.33, margin: 0 }}>
          {renderHeadlineHighlights(params.headline, [...entities.people, ...entities.companies], accent)}
        </h1>

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
              {showReadingDifficulty && difficulty != null && (
                <>
                  <span style={{ color: lighten(dominant, 0.35), fontSize: 12 }}>·</span>
                  <span style={{ color: diffColor, fontSize: 12, fontWeight: 600 }}>{difficulty}</span>
                </>
              )}
            </div>
          );
        })()}

        {showArticleRssSummary && params.summary && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10.5, lineHeight: 1.55, margin: '14px 0 0' }}>{params.summary}</p>}

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
        {(blockLongform ? TABS.filter(t => t !== 'Long Form') : TABS).map(tab => {
          const active = activeTab === tab;
          const color = active ? '#fff' : 'rgba(255,255,255,0.4)';
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={active ? 'tab-active-pill' : undefined}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: active ? lighten(dominant, 0.05) : 'transparent',
                color,
                fontSize: 10.5, fontWeight: 600, letterSpacing: 0.2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                transition: 'all 0.2s',
                WebkitTapHighlightColor: 'transparent',
              }}>
              <TabIcon tab={tab} color={color} />
              <span>{tab}</span>
            </button>
          );
        })}
      </div>

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

      {/* Tab body. Customize → columnWidth controls max-width on big screens. */}
      <div style={{ padding: '8px 20px 24px', maxWidth: columnMaxPx, margin: '0 auto' }}>{renderTabContent()}</div>

      {/* Stats card + Verify Dedup — last section, after the article body.
          Both controlled by Customize → showStatsCard / showVerifyDedup. */}
      {showStatsCard && (() => {
        const preText = originalParagraphs.join(' ');
        const postText = paragraphs.join(' ');
        const preWords = wordCount(preText);
        const postWords = wordCount(postText);

        if (activeTab === 'Long Form') {
          if (preWords === 0) return null;
          const reduction = preWords > postWords ? Math.round(((preWords - postWords) / preWords) * 100) : 0;
          const paraReduction = originalParagraphs.length > paragraphs.length ? originalParagraphs.length - paragraphs.length : 0;
          return (
            <div style={{ margin: '0 0 24px' }}>
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
              {showVerifyDedupSetting && (
                <button
                  onClick={() => setDedupModalVisible(true)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    margin: '0 16px', padding: '10px 14px',
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
              )}
            </div>
          );
        }

        // AI tabs: original → distilled
        const originalWords = postWords || preWords;
        if (originalWords === 0) return null;
        let aiText = '';
        if (activeTab === 'Summary') aiText = aiResult?.summary?.trim()
          ? aiResult.summary
          : (aiResult?.bullets?.join(' ') ?? '');
        else if (activeTab === '5 Ws') aiText = (aiResult?.fiveWs ?? []).join(' ');
        else if (activeTab === 'ELI5') aiText = aiResult?.eli5 ?? '';
        const aiWords = wordCount(aiText);
        if (aiWords === 0) return null;
        const reduction = Math.max(0, Math.round(((originalWords - aiWords) / originalWords) * 100));
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            margin: '0 16px 24px', padding: '14px',
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

      {/* Referenced sources */}
      {showReferencedSources && referencedSources.length > 0 && (
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

      {/* Entities — tappable follow pills */}
      {(entities.people.length > 0 || entities.companies.length > 0) && (
        <div style={{ margin: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {entities.people.length > 0 && (
            <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(15,15,22,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ color: '#666', fontSize: 9, fontWeight: 800, letterSpacing: 1.4, marginBottom: 10 }}>KEY PEOPLE</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entities.people.map(p => {
                  const isOn = followedEntities.has(p.toLowerCase());
                  return (
                    <span key={p} onClick={() => {
                      const on = toggleFollowEntity(p);
                      setFollowedEntities(prev => { const s = new Set(prev); on ? s.add(p.toLowerCase()) : s.delete(p.toLowerCase()); return s; });
                    }} style={{
                      padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: isOn ? 'rgba(52,199,89,0.18)' : 'rgba(255,255,255,0.05)',
                      border: isOn ? '1px solid #34C759' : '1px solid rgba(255,255,255,0.1)',
                      color: isOn ? '#34C759' : '#e8e8e8',
                      fontSize: 11.5, fontWeight: isOn ? 700 : 500,
                      transition: 'background 0.18s, border-color 0.18s, color 0.18s',
                    }}>
                      {isOn && <span style={{ fontSize: 10 }}>✓</span>}
                      👤 {p}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {entities.companies.length > 0 && (
            <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(15,15,22,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ color: '#666', fontSize: 9, fontWeight: 800, letterSpacing: 1.4, marginBottom: 10 }}>KEY ORGANIZATIONS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entities.companies.map(c => {
                  const isOn = followedEntities.has(c.toLowerCase());
                  return (
                    <span key={c} onClick={() => {
                      const on = toggleFollowEntity(c);
                      setFollowedEntities(prev => { const s = new Set(prev); on ? s.add(c.toLowerCase()) : s.delete(c.toLowerCase()); return s; });
                    }} style={{
                      padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: isOn ? 'rgba(52,199,89,0.18)' : 'rgba(255,255,255,0.05)',
                      border: isOn ? '1px solid #34C759' : '1px solid rgba(255,255,255,0.1)',
                      color: isOn ? '#34C759' : '#e8e8e8',
                      fontSize: 11.5, fontWeight: isOn ? 700 : 500,
                      transition: 'background 0.18s, border-color 0.18s, color 0.18s',
                    }}>
                      {isOn && <span style={{ fontSize: 10 }}>✓</span>}
                      🏢 {c}
                    </span>
                  );
                })}
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
  const common = { width: 13, height: 13, viewBox: '0 0 512 512', fill: 'none', stroke: color, strokeWidth: 34, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
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
