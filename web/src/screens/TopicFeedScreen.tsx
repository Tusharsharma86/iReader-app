import React, { useEffect, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import { StoryCard } from '../components/StoryCard';
import type { Story } from '../types';

const API_BASE = 'https://ireader.onrender.com/api/news/feed';
const TOPICS = ['breaking', 'technology', 'india-politics', 'geopolitics', 'markets', 'business'] as const;

export default function TopicFeedScreen({ tag }: { tag: string }) {
  const { goBack } = useRouter();
  const keyword = tag.replace(/^#/, '').toLowerCase();
  const cardWidth = Math.min(window.innerWidth - 28, 452);

  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const results = await Promise.allSettled(
        TOPICS.map(t =>
          fetch(`${API_BASE}?topic=${t}&limit=30`)
            .then(r => r.json())
            .then((d: { stories: Story[] }) => d.stories ?? []),
        ),
      );
      if (cancelled) return;
      const all: Story[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value);
      }
      const seen = new Set<string>();
      const matched = all.filter(s => {
        if (seen.has(s.id)) return false;
        const matches =
          s.headline.toLowerCase().includes(keyword) ||
          (s.summary?.toLowerCase().includes(keyword) ?? false);
        if (matches) seen.add(s.id);
        return matches;
      });
      matched.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      setStories(matched);
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [keyword]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', WebkitOverflowScrolling: 'touch' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', position: 'sticky', top: 0, background: '#000', zIndex: 10 }}>
        <button
          onClick={goBack}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 20, padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ color: '#FFF', fontSize: 22, fontWeight: 800, flex: 1 }}>{tag}</span>
        {!loading && <span style={{ color: '#555', fontSize: 13, fontWeight: 500 }}>{stories.length} stories</span>}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #1A1A1A', borderTop: '3px solid #4A90D9', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : stories.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <span style={{ color: '#555', fontSize: 15 }}>No stories found for {tag}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 40px' }}>
          {stories.map(story => (
            <div key={story.id} style={{ marginBottom: 16 }}>
              <StoryCard story={story} cardWidth={cardWidth} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
