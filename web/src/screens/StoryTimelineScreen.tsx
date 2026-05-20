import React, { useMemo } from 'react';
import type { Story, ArticleParams } from '../types';
import { useRouter } from '../contexts/RouterContext';
import { getArticleColor } from '../utils/colors';

type EventType = 'breaking' | 'update' | 'analysis' | 'reaction';

const EVENT_META: Record<EventType, { label: string; color: string }> = {
  breaking: { label: 'BREAKING',  color: '#FF3B30' },
  update:   { label: 'UPDATE',    color: '#4A90D9' },
  analysis: { label: 'ANALYSIS',  color: '#A29BFE' },
  reaction: { label: 'REACTION',  color: '#F5A623' },
};

function detectEventType(headline: string, summary: string): EventType {
  const t = (headline + ' ' + summary).toLowerCase();
  if (/\b(breaking|alert|urgent|emergency|just in|developing)\b/.test(t)) return 'breaking';
  if (/\b(analysis|explained|opinion|why |how it|what is|deep dive|explainer)\b/.test(t)) return 'analysis';
  if (/\b(reacts?|responds?|response|condemns?|slams?|criticis|defends?|calls for)\b/.test(t)) return 'reaction';
  return 'update';
}

function firstTwoSentences(text: string): string {
  const m = (text ?? '').match(/[^.!?]+[.!?]+/g) ?? [];
  return m.slice(0, 2).join(' ').trim() || (text?.slice(0, 200) ?? '');
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function StoryTimelineScreen({ params }: { params: { clusterId: string; headline: string; stories: string } }) {
  const { goBack, navigate } = useRouter();

  const sorted = useMemo(() => {
    let parsed: Story[] = [];
    try { parsed = JSON.parse(params.stories) as Story[]; } catch { /* ignore */ }
    return [...parsed].sort(
      (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
    );
  }, [params.stories]);

  function openArticle(story: Story) {
    const dominant = getArticleColor(story.id || story.headline);
    const ap: ArticleParams = {
      id: story.id,
      url: story.sources?.[0]?.url ?? '',
      image: story.imageUrl ?? '',
      headline: story.headline,
      summary: story.summary ?? '',
      source: story.sources?.[0]?.name ?? '',
      publishedAt: story.publishedAt,
      dominantColor: dominant,
      sources: JSON.stringify(story.sources ?? []),
      allStories: '[]',
    };
    navigate({ name: 'Article', params: ap });
  }

  return (
    <div style={{ height: '100%', background: '#080808', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, background: '#080808', borderBottom: '1px solid #141414', zIndex: 10, padding: '16px 16px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', color: '#fff', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#4A90D9', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, marginBottom: 4 }}>STORY TIMELINE</div>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, lineHeight: 1.35, letterSpacing: -0.2 }}>{params.headline}</div>
        </div>
      </div>

      {/* Events */}
      <div style={{ padding: '16px 20px 48px' }}>
        <div style={{ color: '#333', fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 20 }}>
          {sorted.length} sources · oldest first
        </div>

        {sorted.map((story, idx) => {
          const eventType = detectEventType(story.headline, story.summary ?? '');
          const meta = EVENT_META[eventType];
          const isLast = idx === sorted.length - 1;
          const snippet = firstTwoSentences(story.summary ?? '');
          const source = story.sources?.[0]?.name ?? 'Unknown';

          return (
            <div key={story.id ?? idx} style={{ display: 'flex', gap: 14 }}>
              {/* Spine */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, border: `2px solid ${meta.color}`, background: '#080808', marginTop: 3, flexShrink: 0 }} />
                {!isLast && <div style={{ width: 1, flex: 1, background: '#1A1A1A', marginTop: 4, minHeight: 24 }} />}
              </div>

              {/* Card */}
              <div
                onClick={() => openArticle(story)}
                style={{ flex: 1, paddingBottom: isLast ? 0 : 24, borderBottom: isLast ? 'none' : '1px solid #111', marginBottom: 4, cursor: 'pointer' }}
              >
                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7, flexWrap: 'wrap' }}>
                  <span style={{ color: meta.color, fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>{meta.label}</span>
                  <span style={{ color: '#2A2A2A', fontSize: 10 }}>·</span>
                  <span style={{ color: '#3A3A3A', fontSize: 11 }}>{timeAgo(story.publishedAt)}</span>
                  <span style={{ color: '#2A2A2A', fontSize: 10 }}>·</span>
                  <span style={{ color: '#444', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{source}</span>
                </div>

                {/* Content row */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#CCC', fontSize: 14, fontWeight: 600, lineHeight: 1.45, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {story.headline}
                    </div>
                    {snippet && (
                      <div style={{ color: '#4A4A4A', fontSize: 12, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {snippet}
                      </div>
                    )}
                  </div>
                  {story.imageUrl && (
                    <img src={story.imageUrl} alt="" style={{ width: 72, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                </div>

                {/* Read more */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 8 }}>
                  <span style={{ color: '#2A5A8A', fontSize: 11, fontWeight: 600 }}>Read article</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2A5A8A" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
