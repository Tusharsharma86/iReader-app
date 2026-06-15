import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Story } from '../types';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';
import { getArticleColor } from '../utils/colors';
import { trackArticleOpen } from '../utils/personalization';

const API_BASE = 'https://ireader.onrender.com/api/news';

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface EntityCard {
  name: string;
  count: number;
  imageUrl?: string;
}

interface SourceCard {
  name: string;
  domain: string;
  count: number;
}

interface GroupedSearch {
  stories: FeedItem[];
  companies: EntityCard[];
  people: EntityCard[];
  places: EntityCard[];
}

// ── Entity classification ─────────────────────────────────────────────────────

const ENTITY_SKIP = new Set([
  'The','This','That','In','On','At','To','For','Of','And','Or','But','As','Is','Are',
  'Was','Were','Be','Been','By','From','With','It','Its','A','An','He','She','We',
  'They','You','I','My','His','Her','Their','Our','Your','New','Now','No','Not',
  'All','Some','Just','More','Most','After','Before','Over','Under','Since','When',
  'Where','How','Why','What','Who','Which','Here','There','Then','Than','If','So',
  'Explained','Analysis','Opinion','Watch','Read','Know','Top','Must','Also',
  'See','Get','Full','List','Check','View','Meet','Live','Update','Updates',
  'Key','Big','Major','High','Low','Look','Back','Find','Breaking',
  'Says','Said','Gets','Joins','Makes','Takes','Gives','Shows','Comes','Goes',
  'Warns','Claims','Asks','Calls','Wants','Plans','Moves','Rises','Falls',
  'Report','Reports','Sources','Source','Latest','Will','May','Can','Has','Had',
  'Set','Hits','Wins','Loses','Leads','Signs','Holds','Faces','Sees','Puts',
  'Govt','Gov','Bank','Law','Act','Deal','Talk','Plan','Move','Rise','Fall',
  'Drop','Aid','War','Tax','Fund','Bill','Vote','Poll','Case','Rule','Court',
  'Party','State','Centre','Center','Union','Group','Team','Board','Council',
  'January','February','March','April','May','June','July','August','September',
  'October','November','December','Jan','Feb','Mar','Apr','Jun','Jul','Aug','Sep',
  'Oct','Nov','Dec',
  'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
  'India','Indian','Pakistan','Pakistani','China','Chinese','Russia','Russian',
  'American','British','European','Asian','Global','International','National',
]);

const COMPANY_NAMES = new Set([
  'Apple','Google','Alphabet','Microsoft','Amazon','Meta','Netflix','Tesla','Nvidia',
  'AMD','Intel','Qualcomm','Broadcom','TSMC','Samsung','Huawei','Xiaomi',
  'OpenAI','Anthropic','DeepSeek','Mistral','Gemini',
  'TikTok','ByteDance','Snapchat','Twitter','Reddit','Pinterest','LinkedIn',
  'Uber','Lyft','Airbnb','DoorDash','Stripe','Coinbase','Binance','PayPal','Visa','Mastercard',
  'Spotify','Disney','Warner','Paramount',
  'Oracle','Salesforce','Adobe','SAP','IBM','Cisco','Dell','HP','Zoom','Slack','Dropbox',
  'JPMorgan','Goldman','BlackRock','Berkshire',
  'Reliance','Tata','Infosys','Wipro','TCS','HCL','Flipkart','Paytm','Zomato','Swiggy','Ola',
  'Adani','Bajaj','Mahindra','Maruti','HDFC','ICICI','Axis','Kotak','SBI',
  'Toyota','BMW','Mercedes','Volkswagen','Ford','GM','Hyundai','Rivian','Lucid',
  'SpaceX','Boeing','Airbus','Lockheed','Raytheon',
  'Alibaba','Baidu','Tencent','Xiaomi',
  'Pfizer','Moderna','AstraZeneca','Novartis',
  'ExxonMobil','Shell','Chevron','BP','Aramco','ONGC',
  'Block','Robinhood','Plaid','Klarna',
]);

const KNOWN_PEOPLE = new Set([
  'Musk','Altman','Zuckerberg','Bezos','Cook','Pichai','Nadella','Huang','Gates','Buffett',
  'Page','Brin','Dorsey','Amodei','Hassabis','Karpathy','Sutskever',
  'Modi','Gandhi','Shah','Kejriwal','Fadnavis','Shinde','Yogi',
  'Ambani','Adani','Sitharaman',
  'Trump','Biden','Harris','Obama','Clinton','Zelensky','Putin','Xi','Macron','Sunak','Starmer',
  'Netanyahu','Khamenei','Erdogan','Scholz','Meloni',
  'Elon Musk','Sam Altman','Tim Cook','Sundar Pichai','Satya Nadella','Jensen Huang',
  'Mark Zuckerberg','Jeff Bezos','Bill Gates','Warren Buffett',
  'Narendra Modi','Rahul Gandhi','Amit Shah','Arvind Kejriwal',
  'Mukesh Ambani','Gautam Adani','Nirmala Sitharaman',
  'Donald Trump','Joe Biden','Kamala Harris','Vladimir Putin','Xi Jinping',
  'Emmanuel Macron','Rishi Sunak','Keir Starmer','Volodymyr Zelensky','Benjamin Netanyahu',
]);

const KNOWN_PLACES = new Set([
  'China','Russia','Ukraine','Pakistan','Israel','Gaza','Iran','Iraq','Turkey','Syria',
  'France','Germany','Britain','Italy','Japan','Korea','Taiwan','Singapore',
  'Australia','Canada','Brazil','Mexico','Argentina',
  'Saudi','UAE','Qatar','Egypt','Nigeria','Ethiopia','Libya','Sudan',
  'Delhi','Mumbai','Pune','Bangalore','Chennai','Hyderabad','Kolkata','Ahmedabad',
  'Kashmir','Punjab','Gujarat','Maharashtra','Kerala','Assam','Bengal',
  'Washington','London','Beijing','Moscow','Tokyo','Berlin','Paris',
  'Dubai','Seoul','Tehran','Riyadh','Kyiv','Ankara','Islamabad',
  'Europe','Asia','Africa',
  'Middle East','South Asia','Southeast Asia',
]);

function classifyEntity(entity: string): 'company' | 'person' | 'place' | 'topic' {
  if (COMPANY_NAMES.has(entity)) return 'company';
  if (KNOWN_PLACES.has(entity)) return 'place';
  if (KNOWN_PEOPLE.has(entity)) return 'person';
  const words = entity.split(' ');
  if (
    words.length === 2 &&
    words.every(w => /^[A-Z][a-z]{2,}$/.test(w)) &&
    !ENTITY_SKIP.has(words[0]) && !ENTITY_SKIP.has(words[1])
  ) return 'person';
  return 'topic';
}

function extractEntityCounts(headlines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const re = /\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})*)\b/g;
  for (const h of headlines) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(h)) !== null) {
      const e = m[1].trim();
      if (e.split(' ').length > 3 || ENTITY_SKIP.has(e) || e.length < 3) continue;
      counts.set(e, (counts.get(e) ?? 0) + 1);
    }
  }
  return counts;
}

function scoreItem(it: FeedItem): number {
  const src = it.sourceCount ?? it.articles?.length ?? 1;
  const hrs = it.publishedAt ? (Date.now() - new Date(it.publishedAt).getTime()) / 3_600_000 : 24;
  const fresh = hrs < 1 ? 2.0 : hrs < 3 ? 1.5 : hrs < 6 ? 1.2 : hrs < 12 ? 1.0 : 0.7;
  return src * fresh;
}

function relTime(ts?: string): string {
  if (!ts) return '';
  const h = (Date.now() - new Date(ts).getTime()) / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function isHindi(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}

function dedup(items: FeedItem[], limit: number): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const it of items) {
    const k = (it.clusterLabel || it.headline || '').slice(0, 40);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

// ── Topic config ──────────────────────────────────────────────────────────────

const TOPICS = [
  { label: 'Breaking',  color: '#FF453A', bg: 'rgba(255,69,58,0.15)',   tag: 'breaking',       icon: 'breaking'  },
  { label: 'Tech',      color: '#0A84FF', bg: 'rgba(10,132,255,0.15)',  tag: 'technology',     icon: 'tech'      },
  { label: 'India',     color: '#FF9F0A', bg: 'rgba(255,159,10,0.15)',  tag: 'india-politics', icon: 'india'     },
  { label: 'World',     color: '#30D158', bg: 'rgba(48,209,88,0.15)',   tag: 'geopolitics',    icon: 'world'     },
  { label: 'Markets',   color: '#64D2FF', bg: 'rgba(100,210,255,0.15)', tag: 'markets',        icon: 'markets'   },
  { label: 'Business',  color: '#BF5AF2', bg: 'rgba(191,90,242,0.15)', tag: 'business',       icon: 'business'  },
];

// Tile background palettes per category
const COMPANY_BGS = ['#0F2D52','#1A1052','#0F3860','#1A1548'];
const PEOPLE_BGS  = ['#4A2000','#5A1500','#3A2800','#4A1A10'];
const PLACE_BGS   = ['#004A20','#003A30','#0A3A10','#004030'];
const EMERGE_BGS  = ['#003A50','#004060','#002A50','#003848'];

function TopicIcon({ icon, color, size = 18 }: { icon: string; color: string; size?: number }) {
  const s = { fill: 'none' as const, stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (icon === 'breaking') return <svg width={size} height={size} viewBox="0 0 512 512" fill={color} stroke="none"><path d="M315.27 33L96 304h128l-31.51 173.23a2.81 2.81 0 005 2.17L416 208H288l31.61-173.25a2.81 2.81 0 00-4.34-2.92z" /></svg>;
  if (icon === 'tech') return <svg width={size} height={size} viewBox="0 0 24 24" {...s}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
  if (icon === 'india') return <svg width={size} height={size} viewBox="0 0 24 24" {...s}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
  if (icon === 'world') return <svg width={size} height={size} viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
  if (icon === 'markets') return <svg width={size} height={size} viewBox="0 0 24 24" {...s}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
  return <svg width={size} height={size} viewBox="0 0 24 24" {...s}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>;
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <span style={{ color: '#4A90D9', fontSize: 11, fontWeight: 700 }}>●</span>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>{text}</span>
    </div>
  );
}

function HScroll({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 10, overflowX: 'auto',
      scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
      msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch',
      paddingBottom: 4,
    }}>
      {children}
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

// ── Vertical story card (full-width) ──────────────────────────────────────────

function VerticalStoryCard({ item, onOpen, badge }: { item: FeedItem; onOpen: (item: FeedItem) => void; badge?: { text: string; color: string } }) {
  const label = item.clusterLabel || item.headline || item.articles?.[0]?.headline || '';
  const imgUrl = item.imageUrl || item.articles?.[0]?.imageUrl;
  const srcName = item.sources?.[0]?.name || item.articles?.[0]?.sources?.[0]?.name || '';
  const srcCount = item.sourceCount ?? item.articles?.length ?? 1;
  const accent = getArticleColor(label);
  const ts = relTime(item.publishedAt || item.articles?.[0]?.publishedAt);

  return (
    <div
      onClick={() => onOpen(item)}
      style={{
        width: '100%', height: 200,
        borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
        background: accent, position: 'relative', marginBottom: 10,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {imgUrl && <img src={imgUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.06) 0%, transparent 30%, rgba(0,0,0,0.88) 100%)' }} />

      {badge && (
        <div style={{ position: 'absolute', top: 10, left: 10, background: badge.color, borderRadius: 6, padding: '3px 7px', fontSize: 8.5, fontWeight: 800, color: '#fff', letterSpacing: 0.8 }}>
          {badge.text}
        </div>
      )}

      {srcCount > 1 && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '3px 8px', fontSize: 9, fontWeight: 700, color: '#fff', backdropFilter: 'blur(6px)' }}>
          {srcCount} sources
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 13px 14px' }}>
        {(srcName || ts) && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6 }}>
            {srcName && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{srcName}</span>}
            {ts && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>· {ts}</span>}
          </div>
        )}
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', letterSpacing: -0.2 }}>
          {label}
        </p>
      </div>
    </div>
  );
}

// ── Vibrant entity tile (2-col grid) ─────────────────────────────────────────

function EntityTile({ entity, accent, bgColor, onTap }: { entity: EntityCard; accent: string; bgColor: string; onTap: (name: string) => void }) {
  return (
    <button
      onClick={() => onTap(entity.name)}
      style={{
        display: 'block', width: '100%', height: 96,
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        background: bgColor, position: 'relative', border: 'none',
        padding: 0, WebkitTapHighlightColor: 'transparent',
      }}
    >
      {entity.imageUrl && (
        <img src={entity.imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${bgColor}CC 0%, rgba(0,0,0,0.7) 100%)` }} />
      <div style={{ position: 'absolute', inset: 0, padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: accent, marginBottom: 4, letterSpacing: 0.5 }}>{entity.count} {entity.count === 1 ? 'story' : 'stories'}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1.2, textAlign: 'left', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{entity.name}</div>
      </div>
    </button>
  );
}

// ── Source chip (for grid) ────────────────────────────────────────────────────

function SourceChip({ src, onTap }: { src: SourceCard; onTap: (name: string) => void }) {
  const faviconUrl = src.domain ? `https://www.google.com/s2/favicons?domain=${src.domain}&sz=32` : '';
  return (
    <button
      onClick={() => onTap(src.name)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        background: '#0E0E0E', border: '1px solid #1A1A1A',
        borderRadius: 12, padding: '12px 8px 10px', width: '100%',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      {faviconUrl ? (
        <img src={faviconUrl} alt="" width={24} height={24} style={{ borderRadius: 6 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <div style={{ width: 24, height: 24, borderRadius: 6, background: '#222' }} />
      )}
      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#999', textAlign: 'center', lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{src.name}</span>
      <span style={{ fontSize: 8.5, color: '#444', fontWeight: 600 }}>{src.count}</span>
    </button>
  );
}

// ── Skeleton placeholders ─────────────────────────────────────────────────────

const SHIMMER = 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)';
const SHIMMER_CSS = `@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`;

function VerticalCardSkeleton() {
  return (
    <div>
      {[0,1,2].map(i => (
        <div key={i} style={{ width: '100%', height: 200, borderRadius: 16, background: '#141414', overflow: 'hidden', position: 'relative', marginBottom: 10 }}>
          <div style={{ position: 'absolute', inset: 0, background: SHIMMER, animation: 'shimmer 1.4s infinite' }} />
        </div>
      ))}
    </div>
  );
}

function TileSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {[0,1,2,3,4,5].map(i => (
        <div key={i} style={{ height: 96, borderRadius: 14, background: '#141414', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: SHIMMER, animation: 'shimmer 1.4s infinite' }} />
        </div>
      ))}
    </div>
  );
}

function SourceGridSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {[0,1,2,3,4,5].map(i => (
        <div key={i} style={{ height: 88, borderRadius: 12, background: '#141414', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: SHIMMER, animation: 'shimmer 1.4s infinite' }} />
        </div>
      ))}
    </div>
  );
}

// ── Search result card (compact) ──────────────────────────────────────────────

function SearchStoryCard({ item, onOpen }: { item: FeedItem; onOpen: (item: FeedItem) => void }) {
  const label = item.clusterLabel || item.headline || item.articles?.[0]?.headline || '';
  const imgUrl = item.imageUrl || item.articles?.[0]?.imageUrl;
  const srcName = item.sources?.[0]?.name || item.articles?.[0]?.sources?.[0]?.name || '';
  const srcCount = item.sourceCount ?? item.articles?.length ?? 1;
  const accent = getArticleColor(label);

  return (
    <div onClick={() => onOpen(item)} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#0E0E0E', border: '1px solid #1A1A1A', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', marginBottom: 8, WebkitTapHighlightColor: 'transparent' }}>
      <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: accent }}>
        {imgUrl && <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, color: '#555', fontWeight: 600, marginBottom: 3 }}>{srcName}{srcCount > 1 ? ` · ${srcCount} sources` : ''}</div>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#eee', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{label}</p>
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { navigate } = useRouter();
  const { show: showTabBar } = useTabBar();

  const [trendingStories, setTrendingStories] = useState<FeedItem[]>([]);
  const [deepDives, setDeepDives] = useState<FeedItem[]>([]);
  const [companies, setCompanies] = useState<EntityCard[]>([]);
  const [people, setPeople] = useState<EntityCard[]>([]);
  const [places, setPlaces] = useState<EntityCard[]>([]);
  const [emergingTopics, setEmergingTopics] = useState<EntityCard[]>([]);
  const [sources, setSources] = useState<SourceCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GroupedSearch>({ stories: [], companies: [], people: [], places: [] });
  const [searchLoading, setSearchLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const allItemsRef = useRef<FeedItem[]>([]);

  useEffect(() => { showTabBar(); }, [showTabBar]);

  useEffect(() => {
    let cancelled = false;
    const FEED_TOPICS = ['breaking', 'india-politics', 'technology', 'geopolitics', 'markets', 'business'];

    Promise.allSettled(
      FEED_TOPICS.map(t =>
        fetch(`${API_BASE}/feed?topic=${t}`).then(r => r.json())
          .then((d: any) => ({ topic: t, items: (d?.feed ?? []) as FeedItem[] }))
      )
    ).then(results => {
      if (cancelled) return;

      const allItems: FeedItem[] = results.flatMap(r => r.status === 'fulfilled' ? r.value.items : []);
      allItemsRef.current = allItems;

      // ① Trending — score by sources × freshness, dedup; skip Hindi headlines
      const noHindi = (it: FeedItem) => {
        const h = it.clusterLabel || it.headline || it.articles?.[0]?.headline || '';
        return !isHindi(h);
      };
      const trending = dedup(
        [...allItems].filter(noHindi).sort((a, b) => scoreItem(b) - scoreItem(a)),
        20
      );

      // ② Deep Dives — 3+ sources
      const ddItems = dedup(
        [...allItems].filter(noHindi).filter(it => (it.sourceCount ?? it.articles?.length ?? 1) >= 3)
          .sort((a, b) => scoreItem(b) - scoreItem(a)),
        12
      );

      // ③ Entity classification
      const allHeadlines = allItems.map(it => it.clusterLabel || it.headline || it.articles?.[0]?.headline || '').filter(Boolean);
      const entityCounts = extractEntityCounts(allHeadlines);

      // Build image map per entity
      const entityImages = new Map<string, string>();
      for (const [entity] of entityCounts.entries()) {
        const low = entity.toLowerCase();
        const match = allItems.find(it => {
          const t = [it.clusterLabel, it.headline, ...(it.articles ?? []).map(a => a.headline)].join(' ').toLowerCase();
          return t.includes(low) && (it.imageUrl || it.articles?.[0]?.imageUrl);
        });
        const img = match?.imageUrl || match?.articles?.[0]?.imageUrl;
        if (img) entityImages.set(entity, img);
      }

      // Cross-topic entity tracking for emerging topics
      const entityTopicSets = new Map<string, Set<string>>();
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { topic, items } = r.value;
        const headlines = items.map((it: FeedItem) => it.clusterLabel || it.headline || '').filter(Boolean);
        for (const [entity] of extractEntityCounts(headlines).entries()) {
          if (!entityTopicSets.has(entity)) entityTopicSets.set(entity, new Set());
          entityTopicSets.get(entity)!.add(topic);
        }
      }

      const compList: EntityCard[] = [];
      const personList: EntityCard[] = [];
      const placeList: EntityCard[] = [];

      for (const [name, count] of entityCounts.entries()) {
        if (count < 2) continue;
        const ec: EntityCard = { name, count, imageUrl: entityImages.get(name) };
        const type = classifyEntity(name);
        if (type === 'company') compList.push(ec);
        else if (type === 'person') personList.push(ec);
        else if (type === 'place') placeList.push(ec);
      }
      compList.sort((a, b) => b.count - a.count);
      personList.sort((a, b) => b.count - a.count);
      placeList.sort((a, b) => b.count - a.count);

      // Emerging = entities in 2+ topic feeds
      const emerging: EntityCard[] = [...entityTopicSets.entries()]
        .filter(([, s]) => s.size >= 2)
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 16)
        .map(([name, s]) => ({ name, count: s.size, imageUrl: entityImages.get(name) }));

      // ④ Sources
      const srcMap = new Map<string, { domain: string; count: number }>();
      for (const it of allItems) {
        const srcs = [...(it.sources ?? []), ...(it.articles ?? []).flatMap(a => a.sources ?? [])];
        for (const s of srcs) {
          if (!s.name) continue;
          if (!srcMap.has(s.name)) {
            let domain = '';
            try { domain = new URL(s.url ?? '').hostname.replace(/^www\./, ''); } catch {}
            srcMap.set(s.name, { domain, count: 0 });
          }
          srcMap.get(s.name)!.count++;
        }
      }
      const srcList: SourceCard[] = [...srcMap.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 18)
        .map(([name, { domain, count }]) => ({ name, domain, count }));

      setTrendingStories(trending);
      setDeepDives(ddItems);
      setCompanies(compList.slice(0, 24));
      setPeople(personList.slice(0, 24));
      setPlaces(placeList.slice(0, 20));
      setEmergingTopics(emerging);
      setSources(srcList);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const doSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    setSearchLoading(true);
    setSearchResults({ stories: [], companies: [], people: [], places: [] });
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    const kw = q.toLowerCase();

    const storyMatches = dedup(
      allItemsRef.current.filter(it => {
        const srcNames = [
          ...(it.sources ?? []).map(s => s.name),
          ...(it.articles ?? []).flatMap(a => (a.sources ?? []).map(s => s.name)),
        ];
        const text = [it.clusterLabel, it.headline, it.summary, ...(it.articles ?? []).map(a => a.headline), ...srcNames].join(' ').toLowerCase();
        return text.includes(kw);
      }),
      20
    );
    const compMatches = companies.filter(c => c.name.toLowerCase().includes(kw));
    const personMatches = people.filter(p => p.name.toLowerCase().includes(kw));
    const placeMatches = places.filter(p => p.name.toLowerCase().includes(kw));

    setSearchResults({ stories: storyMatches, companies: compMatches, people: personMatches, places: placeMatches });
    setSearchLoading(false);
  }, [companies, people, places]);

  const triggerSearch = useCallback((term: string) => {
    setSearchText(term);
    doSearch(term);
  }, [doSearch]);

  const openArticle = useCallback((item: FeedItem) => {
    const articleWithId = item.articles?.find(a => a.id);
    const firstArticle = item.articles?.[0];
    const primary = articleWithId ?? firstArticle ?? (item as unknown as Story);
    const headline = primary.headline ?? item.headline ?? item.clusterLabel ?? '';
    const allSources = (primary.sources?.length ? primary.sources : item.sources) ?? [];
    const url = allSources[0]?.url ?? '';
    if (!headline) return;
    trackArticleOpen({ ...primary, headline } as Story);
    navigate({
      name: 'Article',
      params: {
        id: (primary as Story).id ?? '',
        url,
        image: primary.imageUrl ?? item.imageUrl ?? '',
        headline,
        summary: primary.summary ?? item.summary ?? '',
        source: allSources[0]?.name ?? '',
        publishedAt: primary.publishedAt ?? item.publishedAt,
        dominantColor: getArticleColor(headline),
        sources: JSON.stringify(allSources),
        allStories: JSON.stringify(item.articles ?? [primary]),
      },
    });
  }, [navigate]);

  const openTopic = useCallback((tag: string) => {
    navigate({ name: 'TopicFeed', params: { tag } });
  }, [navigate]);

  const hasSearchResults = searchResults.stories.length > 0 || searchResults.companies.length > 0 ||
    searchResults.people.length > 0 || searchResults.places.length > 0;

  return (
    <div
      ref={scrollRef}
      style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', background: '#080808', WebkitOverflowScrolling: 'touch' }}
    >
      <style>{SHIMMER_CSS}</style>
      <div style={{
        paddingLeft: 'max(16px, env(safe-area-inset-left, 16px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 16px))',
        paddingBottom: 110,
        maxWidth: 480, margin: '0 auto', boxSizing: 'border-box',
      }}>

        {/* Header + Search */}
        <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: 16 }}>
          <h1 style={{ margin: '0 0 14px', fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>Explore</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111', border: '1px solid #1E1E1E', borderRadius: 12, padding: '10px 14px' }}>
            <IconSearch size={15} color="#444" />
            <input
              type="search"
              placeholder="Search stories, companies, people…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const q = searchText.trim(); if (q) doSearch(q); else { setSearchQuery(''); setSearchResults({ stories: [], companies: [], people: [], places: [] }); } } }}
              autoCorrect="off" autoCapitalize="none" spellCheck={false} autoComplete="off"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 16, color: '#ccc', caretColor: '#4A90D9' }}
            />
            {searchText.length > 0 && (
              <button type="button" onClick={() => { setSearchText(''); setSearchQuery(''); setSearchResults({ stories: [], companies: [], people: [], places: [] }); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 18, lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}>×</button>
            )}
          </div>
        </div>

        {/* ── SEARCH RESULTS ─────────────────────────────────────────────── */}
        {searchQuery !== '' && (
          <div style={{ marginBottom: 32 }}>
            {searchLoading ? (
              <div style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Searching…</div>
            ) : !hasSearchResults ? (
              <p style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>No results for "{searchQuery}"</p>
            ) : (
              <>
                {searchResults.stories.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <SectionLabel text="Stories" />
                    {searchResults.stories.map((item, i) => <SearchStoryCard key={i} item={item} onOpen={openArticle} />)}
                  </div>
                )}
                {searchResults.companies.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <SectionLabel text="Companies" />
                    <HScroll>
                      {searchResults.companies.map((c, i) => (
                        <button key={i} onClick={() => triggerSearch(c.name)}
                          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, background: '#111', border: '1px solid #1E1E1E', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', scrollSnapAlign: 'start' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd', whiteSpace: 'nowrap' }}>{c.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#0A84FF', background: '#0A84FF18', borderRadius: 4, padding: '2px 5px' }}>{c.count}</span>
                        </button>
                      ))}
                    </HScroll>
                  </div>
                )}
                {searchResults.people.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <SectionLabel text="People" />
                    <HScroll>
                      {searchResults.people.map((p, i) => (
                        <button key={i} onClick={() => triggerSearch(p.name)}
                          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, background: '#111', border: '1px solid #1E1E1E', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', scrollSnapAlign: 'start' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd', whiteSpace: 'nowrap' }}>{p.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#FF9F0A', background: '#FF9F0A18', borderRadius: 4, padding: '2px 5px' }}>{p.count}</span>
                        </button>
                      ))}
                    </HScroll>
                  </div>
                )}
                {searchResults.places.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <SectionLabel text="Places" />
                    <HScroll>
                      {searchResults.places.map((p, i) => (
                        <button key={i} onClick={() => triggerSearch(p.name)}
                          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, background: '#111', border: '1px solid #1E1E1E', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', scrollSnapAlign: 'start' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd', whiteSpace: 'nowrap' }}>{p.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#30D158', background: '#30D15818', borderRadius: 4, padding: '2px 5px' }}>{p.count}</span>
                        </button>
                      ))}
                    </HScroll>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── DISCOVERY SECTIONS ─────────────────────────────────────────── */}
        {searchQuery === '' && (
          <>

            {/* 1. Trending Stories */}
            <div style={{ marginBottom: 28 }}>
              <SectionLabel text="Trending Stories" />
              {loading ? <VerticalCardSkeleton /> : (
                <div>
                  {trendingStories.slice(0, 8).map((item, i) => (
                    <VerticalStoryCard key={i} item={item} onOpen={openArticle} />
                  ))}
                </div>
              )}
            </div>

            {/* 2. AI Deep Dives */}
            {(loading || deepDives.length > 0) && (
              <div style={{ marginBottom: 28 }}>
                <SectionLabel text="AI Deep Dives" />
                {loading ? <VerticalCardSkeleton /> : (
                  <div>
                    {deepDives.slice(0, 5).map((item, i) => (
                      <VerticalStoryCard key={i} item={item} onOpen={openArticle} badge={{ text: '✦ DEEP DIVE', color: '#7C3AED' }} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. Companies */}
            {(loading || companies.length > 0) && (
              <div style={{ marginBottom: 28 }}>
                <SectionLabel text="Companies" />
                {loading ? <TileSkeleton /> : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {companies.slice(0, 10).map((c, i) => (
                      <EntityTile key={i} entity={c} accent="#0A84FF" bgColor={COMPANY_BGS[i % 4]} onTap={triggerSearch} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. People */}
            {(loading || people.length > 0) && (
              <div style={{ marginBottom: 28 }}>
                <SectionLabel text="People" />
                {loading ? <TileSkeleton /> : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {people.slice(0, 10).map((p, i) => (
                      <EntityTile key={i} entity={p} accent="#FF9F0A" bgColor={PEOPLE_BGS[i % 4]} onTap={triggerSearch} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 5. Places */}
            {(loading || places.length > 0) && (
              <div style={{ marginBottom: 28 }}>
                <SectionLabel text="Places" />
                {loading ? <TileSkeleton /> : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {places.slice(0, 10).map((p, i) => (
                      <EntityTile key={i} entity={p} accent="#30D158" bgColor={PLACE_BGS[i % 4]} onTap={triggerSearch} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 6. Browse Topics */}
            <div style={{ marginBottom: 28 }}>
              <SectionLabel text="Browse Topics" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {TOPICS.map(t => (
                  <button key={t.tag} onClick={() => openTopic(t.tag)}
                    style={{ background: '#0E0E0E', border: '1px solid #1A1A1A', borderRadius: 14, height: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <TopicIcon icon={t.icon} color={t.color} size={18} />
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#eee' }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 7. Source Explorer */}
            {(loading || sources.length > 0) && (
              <div style={{ marginBottom: 28 }}>
                <SectionLabel text="Source Explorer" />
                {loading ? <SourceGridSkeleton /> : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {sources.slice(0, 12).map((src, i) => <SourceChip key={i} src={src} onTap={triggerSearch} />)}
                  </div>
                )}
              </div>
            )}

            {/* 8. Emerging Topics */}
            {(loading || emergingTopics.length > 0) && (
              <div style={{ marginBottom: 28 }}>
                <SectionLabel text="Emerging Topics" />
                {loading ? <TileSkeleton /> : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {emergingTopics.slice(0, 10).map((t, i) => (
                      <EntityTile key={i} entity={t} accent="#64D2FF" bgColor={EMERGE_BGS[i % 4]} onTap={triggerSearch} />
                    ))}
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
