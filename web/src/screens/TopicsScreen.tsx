import React from 'react';
import { useRouter } from '../contexts/RouterContext';
import { useSettings } from '../contexts/SettingsContext';
import type { TopicKey } from '../types';
import { TOPIC_SUBTOPICS } from '../utils/topics';

const TOPIC_ITEMS: { key: TopicKey; label: string; icon: string }[] = [
  { key: 'breaking',       label: 'Breaking News', icon: '🔴' },
  { key: 'technology',     label: 'Technology',    icon: '💻' },
  { key: 'india-politics', label: 'India',         icon: '🇮🇳' },
  { key: 'geopolitics',    label: 'World',         icon: '🌍' },
  { key: 'markets',        label: 'Markets',       icon: '📈' },
  { key: 'business',       label: 'Business',      icon: '💼' },
];

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{ width: 51, height: 31, borderRadius: 16, background: value ? '#1C3A6A' : '#1A1A1A', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 22 : 2, width: 25, height: 25, borderRadius: 13, background: value ? '#4A90D9' : '#444', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} />
    </div>
  );
}

export default function TopicsScreen() {
  const { goBack } = useRouter();
  const { activeTopics, toggleTopic, activeSubTopics, toggleSubTopic, showSports, setShowSports, showEntertainment, setShowEntertainment } = useSettings();

  function isSpecialPill(topicKey: string, sub: string): boolean {
    return (topicKey === 'breaking' || topicKey === 'india-politics') &&
      (sub === 'Sports' || sub === 'Entertainment');
  }
  function specialPillActive(sub: string): boolean {
    return sub === 'Sports' ? showSports : showEntertainment;
  }
  function toggleSpecialPill(sub: string): void {
    if (sub === 'Sports') setShowSports(!showSports);
    else setShowEntertainment(!showEntertainment);
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', WebkitOverflowScrolling: 'touch' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px', position: 'sticky', top: 0, background: '#000', zIndex: 10 }}>
        <button onClick={goBack} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 20 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ color: '#FFF', fontSize: 18, fontWeight: 700 }}>Topics</span>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '0 16px 40px' }}>
        <p style={{ color: '#444', fontSize: 12, marginBottom: 20, lineHeight: 1.5 }}>
          Toggle topics on/off. Tap sub-topic pills to filter what you see.
        </p>

        {TOPIC_ITEMS.map(item => {
          const topicOn = activeTopics[item.key] !== false;
          const subs = TOPIC_SUBTOPICS[item.key] ?? [];

          return (
            <div key={item.key} style={{ background: '#0E0E0E', borderRadius: 14, border: '1px solid #1A1A1A', marginBottom: 12, overflow: 'hidden' }}>
              {/* Topic row */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px' }}>
                <span style={{ fontSize: 20, marginRight: 12 }}>{item.icon}</span>
                <span style={{ flex: 1, color: topicOn ? '#FFF' : '#444', fontSize: 15, fontWeight: 700, transition: 'color 0.2s' }}>
                  {item.label}
                </span>
                <Toggle value={topicOn} onChange={() => toggleTopic(item.key)} />
              </div>

              {/* Sub-topic pills */}
              {topicOn && subs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 16px' }}>
                  {subs.map(sub => {
                    const special = isSpecialPill(item.key, sub);
                    const active = special ? specialPillActive(sub) : activeSubTopics[`${item.key}:${sub}`] !== false;
                    return (
                      <button
                        key={sub}
                        onClick={() => special ? toggleSpecialPill(sub) : toggleSubTopic(`${item.key}:${sub}`)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 999,
                          border: `1px solid ${active ? '#22C55E' : '#252525'}`,
                          background: active ? '#0D2B1A' : '#111',
                          color: active ? '#22C55E' : '#383838',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {sub}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Content Filters */}
        <p style={{ color: '#666', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginTop: 24, marginBottom: 12 }}>
          CONTENT FILTERS
        </p>

        <div style={{ background: '#0E0E0E', borderRadius: 14, border: '1px solid #1A1A1A', marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px' }}>
            <span style={{ fontSize: 20, marginRight: 12 }}>⚽</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: showSports ? '#FFF' : '#555', fontSize: 15, fontWeight: 700, transition: 'color 0.2s' }}>Sports</div>
              <div style={{ color: '#444', fontSize: 12, marginTop: 2 }}>Cricket, football, tennis, F1 and more</div>
            </div>
            <Toggle value={showSports} onChange={() => setShowSports(!showSports)} />
          </div>
        </div>

        <div style={{ background: '#0E0E0E', borderRadius: 14, border: '1px solid #1A1A1A', marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px' }}>
            <span style={{ fontSize: 20, marginRight: 12 }}>🎬</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: showEntertainment ? '#FFF' : '#555', fontSize: 15, fontWeight: 700, transition: 'color 0.2s' }}>Entertainment</div>
              <div style={{ color: '#444', fontSize: 12, marginTop: 2 }}>Bollywood, movies, celebrity, awards</div>
            </div>
            <Toggle value={showEntertainment} onChange={() => setShowEntertainment(!showEntertainment)} />
          </div>
        </div>

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
