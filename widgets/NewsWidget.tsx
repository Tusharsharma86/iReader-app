import React from 'react';
import { FlexWidget, TextWidget, ImageWidget, ListWidget, type ImageWidgetSource } from 'react-native-android-widget';

export interface WidgetStory {
  id: string;
  headline: string;
  source: string;
  imageUrl: string;
  url: string;
  publishedAt: string;
  summary: string;
}

const BG = '#0A0B12';
const CARD = '#12131C';
const ACCENT = '#B994FF';
const FALLBACK_THUMB = 'https://ireader-pro-fresh.vercel.app/fallback.jpg';

function deepLink(s: WidgetStory): string {
  const payload = JSON.stringify({
    id: s.id, headline: s.headline, url: s.url,
    imageUrl: s.imageUrl, source: s.source, publishedAt: s.publishedAt, summary: s.summary,
  });
  return `ireaderpro://story?p=${encodeURIComponent(payload)}`;
}

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Row({ story }: { story: WidgetStory }) {
  const meta = [story.source.toUpperCase(), timeAgo(story.publishedAt)].filter(Boolean).join('  ·  ');
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLink(story) }}
      style={{
        flexDirection: 'row',
        width: 'match_parent',
        backgroundColor: CARD,
        borderRadius: 14,
        padding: 10,
        marginBottom: 8,
        alignItems: 'center',
      }}
    >
      <ImageWidget
        image={(story.imageUrl?.startsWith('http') ? story.imageUrl : FALLBACK_THUMB) as ImageWidgetSource}
        imageWidth={64}
        imageHeight={64}
        radius={10}
        style={{ width: 64, height: 64, marginRight: 12 }}
      />
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget
          text={story.headline}
          maxLines={3}
          style={{ fontSize: 13.5, fontWeight: '600', color: '#FFFFFF' }}
        />
        {meta ? (
          <TextWidget
            text={meta}
            style={{ fontSize: 10, fontWeight: '700', color: ACCENT, marginTop: 4, letterSpacing: 0.4 }}
          />
        ) : <TextWidget text="" style={{ fontSize: 0 }} />}
      </FlexWidget>
    </FlexWidget>
  );
}

export function NewsWidget({ stories, updatedAt }: { stories: WidgetStory[]; updatedAt?: number }) {
  const updated = updatedAt ? timeAgo(new Date(updatedAt).toISOString()) : '';
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 22,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 6,
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'ireaderpro://feed' }}
        style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center', marginBottom: 10 }}
      >
        <TextWidget text="●" style={{ fontSize: 12, color: ACCENT, marginRight: 6 }} />
        <TextWidget
          text="IREADER · BREAKING"
          style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 }}
        />
        <FlexWidget style={{ flex: 1 }} />
        {updated ? (
          <TextWidget text={`${updated} ago`} style={{ fontSize: 9, fontWeight: '600', color: '#66FFFFFF' }} />
        ) : <TextWidget text="" style={{ fontSize: 0 }} />}
      </FlexWidget>

      {stories.length === 0 ? (
        <FlexWidget style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}>
          <TextWidget text="Tap to open iReader" style={{ fontSize: 13, color: '#80FFFFFF' }} />
        </FlexWidget>
      ) : (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
          {stories.map((s) => <Row key={s.id} story={s} />)}
        </ListWidget>
      )}
    </FlexWidget>
  );
}
