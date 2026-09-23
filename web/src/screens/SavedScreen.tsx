import React from 'react';
import { useSaved } from '../contexts/SavedContext';
import { useTabBar } from '../contexts/TabBarContext';
import { StoryCard } from '../components/StoryCard';

export default function SavedScreen() {
  const { savedStories } = useSaved();
  const { reportScroll } = useTabBar();
  const cardWidth = Math.min(window.innerWidth - 28, 452);

  return (
    <div
      onScroll={(e) => reportScroll((e.target as HTMLDivElement).scrollTop)}
      style={{ height: '100%', overflowY: 'auto', background: '#000', WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ color: '#fff', fontSize: 28, fontWeight: 800, padding: '16px 20px 20px' }}>Saved</div>

      {savedStories.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12, padding: '0 40px' }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#2A2A2A" strokeWidth="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          <div style={{ color: '#333', fontSize: 18, fontWeight: 700, textAlign: 'center' }}>Nothing saved yet</div>
          <div style={{ color: '#2A2A2A', fontSize: 14, textAlign: 'center', lineHeight: 1.5 }}>Tap the bookmark on any story to save it here</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
          <div style={{ color: '#444', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>{savedStories.length} saved</div>
          {savedStories.map(story => (
            <div key={story.id} style={{ marginBottom: 16 }}>
              <StoryCard story={story} cardWidth={cardWidth} />
            </div>
          ))}
          <div style={{ height: 40 }} />
        </div>
      )}
    </div>
  );
}
