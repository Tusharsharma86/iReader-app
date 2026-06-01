import React from 'react';
import { FlexWidget, TextWidget, ImageWidget, ListWidget, type ImageWidgetSource } from 'react-native-android-widget';

export interface WidgetStory {
  id: string;
  headline: string;
  source: string;
  sourceCount: number;
  imageUrl: string;
  url: string;
  publishedAt: string;
  summary: string;
}

const BG = '#0A0B12';
const LOGO = require('../assets/header-logo.png');

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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function metaLine(s: WidgetStory): string {
  const time = timeAgo(s.publishedAt);
  if (s.sourceCount > 1) return `${s.sourceCount} articles  ·  ${time}`;
  if (s.source) return `${s.source.toUpperCase()}  ·  ${time}`;
  return time;
}

function Row({ story }: { story: WidgetStory }) {
  const hasImg = story.imageUrl?.startsWith('http');
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLink(story) }}
      style={{
        flexDirection: 'row',
        width: 'match_parent',
        paddingVertical: 9,
        alignItems: 'center',
      }}
    >
      {hasImg ? (
        <ImageWidget
          image={story.imageUrl as ImageWidgetSource}
          imageWidth={108}
          imageHeight={72}
          radius={12}
          style={{ width: 108, height: 72, marginRight: 14 }}
        />
      ) : (
        <TextWidget text="" style={{ width: 0, height: 72 }} />
      )}
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget
          text={metaLine(story)}
          style={{ fontSize: 11, fontWeight: '500', color: '#9AA0AE', marginBottom: 4, letterSpacing: 0.2 }}
        />
        <TextWidget
          text={story.headline}
          maxLines={3}
          style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

export function NewsWidget({ stories }: { stories: WidgetStory[]; updatedAt?: number }) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 28,
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 6,
        flexDirection: 'column',
      }}
    >
      {/* Header — transparent logo top-left + greeting, refresh top-right */}
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center', marginBottom: 12 }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'ireaderpro://feed' }}
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
        >
          <ImageWidget image={LOGO} imageWidth={30} imageHeight={30} style={{ width: 30, height: 30, marginRight: 10 }} />
          <TextWidget text={greeting()} style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF' }} />
        </FlexWidget>
        <FlexWidget
          clickAction="REFRESH"
          style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}
        >
          <TextWidget text="⟳" style={{ fontSize: 20, fontWeight: '500', color: '#FFFFFF' }} />
        </FlexWidget>
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
