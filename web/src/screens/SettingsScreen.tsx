import React, { useMemo, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useSource, SOURCE_CATEGORIES } from '../contexts/SourceContext';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';
import type { FontSize, TopicKey } from '../types';
import { INTEREST_CATEGORIES, INTEREST_TOPICS, type InterestTopic } from '../utils/interestTopics';
import { TOPIC_SUBTOPICS } from '../utils/topics';

const FONT_SIZES: FontSize[] = ['Small', 'Medium', 'Large', 'XLarge'];
const BLUE = '#4A90D9';
const VIOLET = '#b994ff';

const TOPIC_ITEMS: { key: TopicKey; label: string; icon: string }[] = [
  { key: 'breaking',       label: 'Breaking News', icon: '🔴' },
  { key: 'technology',     label: 'Technology',    icon: '💻' },
  { key: 'india-politics', label: 'India',         icon: '🇮🇳' },
  { key: 'geopolitics',    label: 'World',         icon: '🌍' },
  { key: 'markets',        label: 'Markets',       icon: '📈' },
  { key: 'business',       label: 'Business',      icon: '💼' },
];

const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':'techcrunch.com','The Verge':'theverge.com','Ars Technica':'arstechnica.com','Wired':'wired.com','Hacker News':'news.ycombinator.com','9to5Mac':'9to5mac.com','9to5Google':'9to5google.com','MIT Tech Review':'technologyreview.com','Engadget':'engadget.com','VentureBeat':'venturebeat.com','The Next Web':'thenextweb.com','BBC World':'bbc.co.uk','NYT World':'nytimes.com','The Guardian':'theguardian.com','NPR World':'npr.org','Al Jazeera':'aljazeera.com','NDTV':'ndtv.com','India Today':'indiatoday.in','The Print':'theprint.in','The Quint':'thequint.com','CNBC TV18':'cnbctv18.com','Scroll.in':'scroll.in','Economic Times':'economictimes.indiatimes.com','Livemint':'livemint.com','Mint':'livemint.com','Inc42':'inc42.com','Indian Express':'indianexpress.com','Hindustan Times':'hindustantimes.com','Times of India':'timesofindia.indiatimes.com',
};
const faviconUrl = (name: string) => `https://www.google.com/s2/favicons?domain=${SOURCE_DOMAINS[name] ?? 'google.com'}&sz=64`;

const card: React.CSSProperties = { margin: '0 16px 14px', background: '#0E0E0E', borderRadius: 14, border: '1px solid #1A1A1A', overflow: 'hidden' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' };
const rowBorder: React.CSSProperties = { ...row, borderTop: '1px solid #1A1A1A' };
const sectionHeader: React.CSSProperties = { color: '#444', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: '0 20px 10px' };

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 51, height: 31, borderRadius: 16, background: value ? '#1C3A6A' : '#1A1A1A', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 22 : 2, width: 25, height: 25, borderRadius: 13, background: value ? BLUE : '#444', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} />
    </div>
  );
}

function Collapsible({ icon, title, subtitle, children }: { icon: string; title: string; subtitle?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={card}>
      <div onClick={() => setOpen(o => !o)} style={{ ...row, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(185,148,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>{title}</div>
            {subtitle && <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      {open && <div style={{ padding: '4px 14px 16px', borderTop: '1px solid #161616' }}>{children}</div>}
    </div>
  );
}

function Star({ filled, onClick }: { filled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 3, cursor: 'pointer', display: 'flex' }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill={filled ? '#FFC542' : 'none'} stroke={filled ? '#FFC542' : '#3A3A3A'} strokeWidth="1.8" strokeLinejoin="round">
        <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
      </svg>
    </button>
  );
}

const miniHeader: React.CSSProperties = { color: '#666', fontSize: 10, fontWeight: 800, letterSpacing: 1.2, margin: '14px 0 8px' };
const miniHint: React.CSSProperties = { color: '#555', fontSize: 11, marginBottom: 8 };
const chip = (on: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 16, background: on ? 'rgba(74,144,217,0.18)' : '#1a1a1f', border: `1px solid ${on ? BLUE : 'transparent'}`, color: on ? '#fff' : '#999', fontSize: 12, fontWeight: 600, cursor: 'pointer' });

// ── Inline: Topic Interests (stars) ──────────────────────────────────────────
function InlineTopicInterests() {
  const { topicInterests, setTopicInterest } = useSettings();
  const [q, setQ] = useState('');
  const grouped = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const f = (t: InterestTopic) => !qq || t.label.toLowerCase().includes(qq) || t.keywords.some(k => k.includes(qq));
    return INTEREST_CATEGORIES.map(cat => ({ category: cat, items: INTEREST_TOPICS.filter(t => t.category === cat && f(t)) })).filter(g => g.items.length > 0);
  }, [q]);
  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search topics" style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '10px 12px', background: '#1a1a1f', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
      {grouped.map(group => (
        <div key={group.category}>
          <div style={miniHeader}>{group.category.toUpperCase()}</div>
          {group.items.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i > 0 ? '1px solid #1a1a1a' : 'none' }}>
              <span style={{ fontSize: 16 }}>{t.emoji}</span>
              <span style={{ flex: 1, color: '#DDD', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
              <div style={{ display: 'flex' }}>
                {[0, 1, 2, 3, 4].map(idx => {
                  const v = topicInterests[t.id] ?? 0;
                  return <Star key={idx} filled={idx < v} onClick={() => setTopicInterest(t.id, v === idx + 1 ? 0 : idx + 1)} />;
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Inline: Favorite Sources (+ topics) ──────────────────────────────────────
function InlineFavorites() {
  const { favSources, toggleFavSource, favTopics, toggleFavTopic } = useSettings();
  return (
    <div>
      <div style={miniHeader}>FAVORITE TOPICS</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {TOPIC_ITEMS.map(t => (
          <span key={t.key} onClick={() => toggleFavTopic(t.key)} style={chip(favTopics.includes(t.key))}>
            <span style={{ fontSize: 13 }}>{t.icon}</span>{t.label}
          </span>
        ))}
      </div>
      <div style={miniHeader}>FAVORITE SOURCES</div>
      <div style={miniHint}>Topic alerts are limited to these publications. Tap to toggle.</div>
      {SOURCE_CATEGORIES.map(cat => (
        <div key={cat.label} style={{ marginTop: 10 }}>
          <div style={{ color: '#888', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{cat.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cat.sources.map(s => (
              <span key={s} onClick={() => toggleFavSource(s)} style={{ ...chip(favSources.includes(s)), maxWidth: '47%' }}>
                <img src={faviconUrl(s)} alt="" style={{ width: 14, height: 14, borderRadius: 3 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Inline: Active Topics (+ sub-topic pills) ────────────────────────────────
function InlineActiveTopics() {
  const { activeTopics, toggleTopic, activeSubTopics, toggleSubTopic, showSports, setShowSports, showEntertainment, setShowEntertainment } = useSettings();
  return (
    <div>
      <div style={{ ...miniHint, marginTop: 8 }}>Toggle categories. Tap sub-topic pills to refine.</div>
      {TOPIC_ITEMS.map(item => {
        const on = activeTopics[item.key] !== false;
        const subs = TOPIC_SUBTOPICS[item.key] ?? [];
        return (
          <div key={item.key} style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span style={{ flex: 1, color: on ? '#DDD' : '#555', fontSize: 14, fontWeight: 500 }}>{item.label}</span>
              <Toggle value={on} onChange={() => toggleTopic(item.key)} />
            </div>
            {on && subs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {subs.map(sub => {
                  const special = (item.key === 'breaking' || item.key === 'india-politics') && (sub === 'Sports' || sub === 'Entertainment');
                  const subOn = special ? (sub === 'Sports' ? showSports : showEntertainment) : activeSubTopics[`${item.key}:${sub}`] !== false;
                  const press = () => {
                    if (special) { if (sub === 'Sports') setShowSports(!showSports); else setShowEntertainment(!showEntertainment); }
                    else toggleSubTopic(`${item.key}:${sub}`);
                  };
                  return <span key={sub} onClick={press} style={chip(subOn)}>{sub}</span>;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Inline: Sources (feed visibility) ────────────────────────────────────────
function InlineSources() {
  const { activeSources, toggleSource } = useSource();
  const [q, setQ] = useState('');
  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search sources" style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '10px 12px', background: '#1a1a1f', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
      {SOURCE_CATEGORIES.map(cat => {
        const items = q ? cat.sources.filter(s => s.toLowerCase().includes(q.toLowerCase())) : cat.sources;
        if (items.length === 0) return null;
        return (
          <div key={cat.label} style={{ marginTop: 12 }}>
            <div style={{ color: '#888', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{cat.label}</div>
            {items.map((src, i) => (
              <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i > 0 ? '1px solid #1a1a1a' : 'none' }}>
                <img src={faviconUrl(src)} alt="" style={{ width: 16, height: 16, borderRadius: 3 }} />
                <span style={{ flex: 1, color: '#DDD', fontSize: 13, fontWeight: 500 }}>{src}</span>
                <Toggle value={activeSources[src] !== false} onChange={() => toggleSource(src)} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function SettingsScreen() {
  const { navigate, goBack, canGoBack } = useRouter();
  const { fontSize, setFontSize, notifBreaking, setNotifBreaking, notifTech, setNotifTech, notifDigest, setNotifDigest, favSources, favTopics, activeTopics, topicInterests, resetSettings } = useSettings();
  const { resetSources } = useSource();
  const { reportScroll } = useTabBar();
  const [targetingOpen, setTargetingOpen] = useState(false);

  const starredCount = Object.values(topicInterests).filter(v => v > 0).length;
  const enabledTopicsCount = Object.values(activeTopics).filter(Boolean).length;

  return (
    <div onScroll={e => reportScroll((e.target as HTMLDivElement).scrollTop)} style={{ height: '100%', overflowY: 'auto', background: '#000', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 24px' }}>
        {canGoBack && <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', color: BLUE, fontSize: 22, lineHeight: 1 }}>‹</button>}
        <div style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>Settings</div>
      </div>

      {/* READING */}
      <div style={sectionHeader}>READING</div>
      <div style={card}>
        <div style={{ color: '#888', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, padding: '16px 16px 10px' }}>Article Font Size</div>
        <div style={{ display: 'flex', margin: '0 12px 12px', background: '#1A1A1A', borderRadius: 10, padding: 3, gap: 2 }}>
          {FONT_SIZES.map(fs => (
            <button key={fs} onClick={() => setFontSize(fs)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: fontSize === fs ? BLUE : 'transparent', color: fontSize === fs ? '#fff' : '#555', fontSize: 12, fontWeight: 600 }}>{fs}</button>
          ))}
        </div>
      </div>

      {/* NOTIFICATIONS — Topic Alerts has a nested targeting sub-screen */}
      <div style={sectionHeader}>NOTIFICATIONS</div>
      <div style={card}>
        <div style={row}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Breaking News</div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Major stories with 3+ source confirmation</div>
          </div>
          <Toggle value={notifBreaking} onChange={setNotifBreaking} />
        </div>

        <div style={rowBorder}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Topic Alerts</div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>{starredCount > 0 ? `${starredCount} topics starred · ${favSources.length} fav sources` : 'Alerts for topics you star'}</div>
          </div>
          <Toggle value={notifTech} onChange={setNotifTech} />
        </div>
        {/* Nested targeting sub-screen */}
        <div onClick={() => setTargetingOpen(o => !o)} style={{ ...rowBorder, cursor: 'pointer', paddingLeft: 28, background: '#0a0a0a' }}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ color: '#bbb', fontSize: 14, fontWeight: 500 }}>Topics &amp; Sources</div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Choose what triggers your alerts</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" style={{ transform: targetingOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        {targetingOpen && (
          <div style={{ background: '#0a0a0a', padding: '4px 16px 16px', borderTop: '1px solid #161616' }}>
            <div style={{ color: VIOLET, fontSize: 10, fontWeight: 800, letterSpacing: 1.2, marginTop: 14 }}>TOPIC INTERESTS</div>
            <div style={{ color: '#555', fontSize: 11, marginTop: 3 }}>Star 1-5 — higher = higher alert priority + feed weight.</div>
            <InlineTopicInterests />
            <div style={{ color: VIOLET, fontSize: 10, fontWeight: 800, letterSpacing: 1.2, marginTop: 18 }}>FAVORITE SOURCES</div>
            <div style={{ color: '#555', fontSize: 11, marginTop: 3 }}>Optional — limit topic alerts to chosen publications.</div>
            <InlineFavorites />
          </div>
        )}

        <div style={rowBorder}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Daily Digest</div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Morning + evening summary</div>
          </div>
          <Toggle value={notifDigest} onChange={setNotifDigest} />
        </div>
      </div>

      {/* FEED */}
      <div style={sectionHeader}>FEED</div>
      <Collapsible icon="▦" title="Active Topics" subtitle={`${enabledTopicsCount} of 6 categories on`}>
        <InlineActiveTopics />
      </Collapsible>
      <Collapsible icon="📰" title="Sources" subtitle="Enable / disable individual publications">
        <InlineSources />
      </Collapsible>

      {/* STATS */}
      <div style={{ ...sectionHeader, marginTop: 14 }}>MY STATS</div>
      <div style={card}>
        <div style={{ ...row, cursor: 'pointer' }} onClick={() => navigate({ name: 'Usage' })}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Usage & Insights</div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Articles read, AI usage, top topics & sources</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      {/* ABOUT */}
      <div style={{ ...sectionHeader, marginTop: 14 }}>ABOUT</div>
      <div style={card}>
        <div style={row}>
          <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Version</div>
          <div style={{ color: '#444', fontSize: 15 }}>1.0.0</div>
        </div>
        <div style={rowBorder}>
          <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Platform</div>
          <div style={{ color: '#444', fontSize: 15 }}>Web (React + Vite)</div>
        </div>
        <div style={{ ...rowBorder, cursor: 'pointer' }} onClick={() => { resetSettings(); resetSources(); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
            <span style={{ color: '#FF4444', fontSize: 15, fontWeight: 500 }}>Reset to Defaults</span>
          </div>
        </div>
      </div>

      {/* BIAS RATINGS */}
      <div style={{ ...sectionHeader, marginTop: 14 }}>BIAS RATINGS</div>
      <div style={{ margin: '0 16px', background: '#111', borderRadius: 12, overflow: 'hidden', padding: '14px 16px' }}>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 1.6, margin: '0 0 12px' }}>
          Bias ratings are adapted from publicly available media bias resources (AllSides, Ad Fontes Media). Used for informational purposes. Not all sources rated.
        </p>
        {[
          { color: '#1E5CFF', label: 'Left / Lean Left' },
          { color: '#9B9B9B', label: 'Center' },
          { color: '#FF3B30', label: 'Right / Lean Right' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 40 }} />
    </div>
  );
}
