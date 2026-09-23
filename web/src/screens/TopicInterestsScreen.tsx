import React, { useMemo, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import { useSettings } from '../contexts/SettingsContext';
import { INTEREST_CATEGORIES, INTEREST_TOPICS, type InterestTopic } from '../utils/interestTopics';

const MAX_STARS = 5;

function Star({ filled, onClick }: { filled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', padding: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      aria-label={filled ? 'starred' : 'unstarred'}
    >
      <svg width="20" height="20" viewBox="0 0 24 24"
        fill={filled ? '#FFC542' : 'none'}
        stroke={filled ? '#FFC542' : '#3A3A3A'}
        strokeWidth="1.8" strokeLinejoin="round">
        <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
      </svg>
    </button>
  );
}

function StarRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {Array.from({ length: MAX_STARS }).map((_, i) => {
        const filled = i < value;
        const next = value === i + 1 ? 0 : i + 1;
        return <Star key={i} filled={filled} onClick={() => onChange(next)} />;
      })}
    </div>
  );
}

export default function TopicInterestsScreen() {
  const { goBack } = useRouter();
  const { topicInterests, setTopicInterest } = useSettings();
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = (t: InterestTopic) =>
      !q || t.label.toLowerCase().includes(q) || t.keywords.some(k => k.includes(q));
    return INTEREST_CATEGORIES.map(cat => ({
      category: cat,
      items: INTEREST_TOPICS.filter(t => t.category === cat && filter(t)),
    })).filter(g => g.items.length > 0);
  }, [query]);

  const totalStarred = useMemo(
    () => Object.values(topicInterests).filter(v => v > 0).length,
    [topicInterests],
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#080808', WebkitOverflowScrolling: 'touch' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '16px 16px', paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
        position: 'sticky', top: 0, background: '#080808', zIndex: 10,
      }}>
        <button onClick={goBack} style={{
          width: 36, height: 36, borderRadius: 18, border: 'none',
          background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#FFF', fontSize: 22, fontWeight: 800 }}>Topic Interests</div>
          <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
            {totalStarred > 0
              ? `${totalStarred} topic${totalStarred === 1 ? '' : 's'} starred · more stars = stronger weight`
              : 'Star topics to personalise your For You feed'}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        margin: '0 16px 12px', padding: '10px 12px',
        background: '#141414', borderRadius: 12,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topics"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#FFF', fontSize: 14, padding: 0,
          }}
        />
        {query.length > 0 && (
          <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#555"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15" stroke="#141414" strokeWidth="2"/><line x1="9" y1="9" x2="15" y2="15" stroke="#141414" strokeWidth="2"/></svg>
          </button>
        )}
      </div>

      <div style={{ padding: '0 16px 48px' }}>
        {grouped.map(group => (
          <div key={group.category} style={{ marginBottom: 18 }}>
            <div style={{ color: '#666', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
              {group.category.toUpperCase()}
            </div>
            <div style={{ background: '#141414', borderRadius: 14, overflow: 'hidden' }}>
              {group.items.map((t, i) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', gap: 12,
                  borderTop: i > 0 ? '1px solid #222' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 18 }}>{t.emoji}</span>
                    <span style={{ color: '#EEE', fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                  </div>
                  <StarRow
                    value={topicInterests[t.id] ?? 0}
                    onChange={(n) => setTopicInterest(t.id, n)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
