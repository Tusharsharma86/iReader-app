import React, { useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import { useSource, SOURCE_CATEGORIES } from '../contexts/SourceContext';

const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':      'techcrunch.com',
  'The Verge':       'theverge.com',
  'Ars Technica':    'arstechnica.com',
  'Wired':           'wired.com',
  'Hacker News':     'news.ycombinator.com',
  '9to5Mac':         '9to5mac.com',
  '9to5Google':      '9to5google.com',
  'MIT Tech Review': 'technologyreview.com',
  'Engadget':        'engadget.com',
  'VentureBeat':     'venturebeat.com',
  'The Next Web':    'thenextweb.com',
  'BBC World':       'bbc.co.uk',
  'NYT World':       'nytimes.com',
  'The Guardian':    'theguardian.com',
  'NPR World':       'npr.org',
  'Al Jazeera':      'aljazeera.com',
  'NDTV':            'ndtv.com',
  'India Today':     'indiatoday.in',
  'The Print':       'theprint.in',
  'The Quint':       'thequint.com',
  'CNBC TV18':       'cnbctv18.com',
  'Scroll.in':       'scroll.in',
  'Hindustan Times': 'hindustantimes.com',
  'Times of India':  'timesofindia.com',
  'Economic Times':  'economictimes.indiatimes.com',
  'Livemint':        'livemint.com',
  'Mint':            'livemint.com',
  'Inc42':           'inc42.com',
  'Indian Express':  'indianexpress.com',
};

const CATEGORY_COLORS: Record<string, string> = {
  'India':      'var(--warn)',
  'World':      'var(--info)',
  'Markets':    'var(--success)',
  'Business':   'var(--topic)',
  'Technology': 'var(--accent-2)',
};

function faviconUrl(name: string): string {
  const domain = SOURCE_DOMAINS[name] ?? 'google.com';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{ width: 51, height: 31, borderRadius: 16, background: value ? '#1C3A6A' : 'var(--line)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 22 : 2, width: 25, height: 25, borderRadius: 13, background: value ? 'var(--accent-2)' : 'var(--muted-5)', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(var(--shadow-rgb),0.5)' }} />
    </div>
  );
}

export default function SourcesScreen() {
  const { goBack } = useRouter();
  const { activeSources, toggleSource } = useSource();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleCollapse(label: string) {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg)', WebkitOverflowScrolling: 'touch' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 16px', paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10 }}>
        <button onClick={goBack} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 20 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>Sources</span>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '0 16px 40px' }}>
        <p style={{ color: 'var(--muted-4)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          Toggle individual sources. Disabled sources are excluded from your feed.
        </p>

        {SOURCE_CATEGORIES.map((cat) => {
          const isCollapsed = collapsed[cat.label] ?? false;
          const enabledCount = cat.sources.filter(s => activeSources[s] !== false).length;
          const allOff = enabledCount === 0;
          const partial = enabledCount > 0 && enabledCount < cat.sources.length;
          const accentColor = CATEGORY_COLORS[cat.label] ?? 'var(--accent-2)';

          const headerSources = [
            ...cat.sources.filter(s => activeSources[s] !== false),
            ...cat.sources.filter(s => activeSources[s] === false),
          ].slice(0, 4);

          const countColor = allOff ? 'var(--muted-5)' : partial ? 'var(--muted-4)' : accentColor;
          const countText = allOff ? 'All disabled' : partial ? `${enabledCount} of ${cat.sources.length} active` : `${enabledCount} sources active`;

          return (
            <div key={cat.label} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--line)', marginBottom: 10, overflow: 'hidden' }}>
              {/* Category header */}
              <div onClick={() => toggleCollapse(cat.label)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Stacked favicons */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {headerSources.map((src, i) => (
                      <div key={src} style={{ width: 26, height: 26, borderRadius: 13, border: '2px solid var(--surface)', overflow: 'hidden', background: 'var(--line)', marginLeft: i > 0 ? -8 : 0, zIndex: 4 - i, position: 'relative', opacity: activeSources[src] === false ? 0.3 : 1 }}>
                        <img src={faviconUrl(src)} alt={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ color: 'var(--text)', fontSize: 15, fontWeight: 700 }}>{cat.label}</div>
                    <div style={{ color: countColor, fontSize: 12, marginTop: 1 }}>{countText}</div>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted-5)" strokeWidth="2">
                  {isCollapsed
                    ? <polyline points="9 18 15 12 9 6"/>
                    : <polyline points="6 9 12 15 18 9"/>}
                </svg>
              </div>

              {/* Source rows */}
              {!isCollapsed && cat.sources.map((src, i) => {
                const isOn = activeSources[src] !== false;
                return (
                  <div key={src} style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', borderTop: i === 0 ? '1px solid #2A2A2A' : '1px solid #1A1A1A', gap: 12, cursor: 'pointer' }} onClick={() => toggleSource(src)}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', background: 'var(--line)', flexShrink: 0, opacity: isOn ? 1 : 0.25 }}>
                      <img src={faviconUrl(src)} alt={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <span style={{ color: isOn ? 'var(--text-3)' : 'var(--muted-5)', fontSize: 14, fontWeight: 600, flex: 1 }}>{src}</span>
                    <span style={{ color: 'var(--muted-5)', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{SOURCE_DOMAINS[src] ?? ''}</span>
                    <Toggle value={isOn} onChange={() => toggleSource(src)} />
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
