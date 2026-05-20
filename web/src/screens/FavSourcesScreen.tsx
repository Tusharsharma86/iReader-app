import React from 'react';
import { useRouter } from '../contexts/RouterContext';
import { useSettings } from '../contexts/SettingsContext';
import { SOURCE_CATEGORIES } from '../contexts/SourceContext';

const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':'techcrunch.com','The Verge':'theverge.com','Ars Technica':'arstechnica.com','Wired':'wired.com','Hacker News':'news.ycombinator.com','9to5Mac':'9to5mac.com','9to5Google':'9to5google.com','MIT Tech Review':'technologyreview.com','Engadget':'engadget.com','VentureBeat':'venturebeat.com','The Next Web':'thenextweb.com','BBC World':'bbc.co.uk','NYT World':'nytimes.com','The Guardian':'theguardian.com','NPR World':'npr.org','Al Jazeera':'aljazeera.com','NDTV':'ndtv.com','India Today':'indiatoday.in','The Print':'theprint.in','The Quint':'thequint.com','CNBC TV18':'cnbctv18.com','Scroll.in':'scroll.in','Economic Times':'economictimes.indiatimes.com','Livemint':'livemint.com','Mint':'livemint.com','Inc42':'inc42.com','Indian Express':'indianexpress.com',
};

const TOPIC_ITEMS = [
  { key: 'technology',     label: 'Technology', icon: '💻' },
  { key: 'india-politics', label: 'India',      icon: '🇮🇳' },
  { key: 'geopolitics',    label: 'World',      icon: '🌍' },
  { key: 'markets',        label: 'Markets',    icon: '📈' },
  { key: 'business',       label: 'Business',   icon: '💼' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'India': '#FF9500', 'World': '#4ECDC4', 'Markets': '#22C55E',
  'Business': '#A29BFE', 'Technology': '#4A90D9',
};

function faviconUrl(name: string) {
  const domain = SOURCE_DOMAINS[name] ?? 'google.com';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <div style={{ width: 34, height: 34, borderRadius: 17, background: active ? '#1C3A6A' : '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}>
      {active ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#4A90D9" stroke="#4A90D9" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
      )}
    </div>
  );
}

export default function FavSourcesScreen() {
  const { goBack } = useRouter();
  const { favSources, toggleFavSource, favTopics, toggleFavTopic } = useSettings();
  const totalSelected = favSources.length + favTopics.length;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', WebkitOverflowScrolling: 'touch' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px', position: 'sticky', top: 0, background: '#000', zIndex: 10 }}>
        <button onClick={goBack} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 20 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#FFF', fontSize: 18, fontWeight: 700 }}>Notify me about</div>
          {totalSelected > 0 && <div style={{ color: '#4A90D9', fontSize: 12, fontWeight: 600, marginTop: 2 }}>{totalSelected} selected</div>}
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '0 16px 40px' }}>
        <p style={{ color: '#555', fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
          Get notified when new stories arrive from your chosen topics or sources.
        </p>

        {/* Topics */}
        <div style={{ color: '#444', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 10 }}>TOPICS</div>
        <div style={{ background: '#0E0E0E', borderRadius: 14, border: '1px solid #1A1A1A', marginBottom: 24, overflow: 'hidden' }}>
          {TOPIC_ITEMS.map((item, i) => {
            const active = favTopics.includes(item.key);
            return (
              <div key={item.key} onClick={() => toggleFavTopic(item.key)}
                style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12, borderTop: i > 0 ? '1px solid #1A1A1A' : 'none', cursor: 'pointer' }}>
                <span style={{ fontSize: 18, width: 26, textAlign: 'center' }}>{item.icon}</span>
                <span style={{ flex: 1, color: active ? '#DDD' : '#555', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' }}>{item.label}</span>
                <BellIcon active={active} />
              </div>
            );
          })}
        </div>

        {/* Sources */}
        <div style={{ color: '#444', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 10 }}>SOURCES</div>
        {SOURCE_CATEGORIES.map(cat => {
          const accentColor = CATEGORY_COLORS[cat.label] ?? '#4A90D9';
          return (
            <div key={cat.label} style={{ background: '#0E0E0E', borderRadius: 14, border: '1px solid #1A1A1A', marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px 6px', color: accentColor, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{cat.label.toUpperCase()}</div>
              {cat.sources.map((src) => {
                const active = favSources.includes(src);
                return (
                  <div key={src} onClick={() => toggleFavSource(src)}
                    style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12, borderTop: '1px solid #1A1A1A', cursor: 'pointer' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, overflow: 'hidden', background: '#1A1A1A', flexShrink: 0 }}>
                      <img src={faviconUrl(src)} alt={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <span style={{ flex: 1, color: active ? '#DDD' : '#555', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' }}>{src}</span>
                    <BellIcon active={active} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
