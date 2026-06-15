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
const DIVIDER = '#16182A';
const META_COLOR = '#6B7280';
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

function Row({ story, showDivider }: { story: WidgetStory; showDivider: boolean }) {
  const hasImg = story.imageUrl?.startsWith('http');
  return (
    <FlexWidget
      style={{ flexDirection: 'column', width: 'match_parent' }}
    >
      {showDivider && (
        <FlexWidget style={{ height: 1, width: 'match_parent', backgroundColor: DIVIDER, marginVertical: 1 }} />
      )}
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: deepLink(story) }}
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          paddingVertical: 10,
          alignItems: 'center',
        }}
      >
        {/* Thumbnail */}
        <FlexWidget
          style={{
            width: 52, height: 52, borderRadius: 8, marginRight: 12,
            backgroundColor: '#1A1D2E', overflow: 'hidden',
          }}
        >
          {hasImg ? (
            <ImageWidget
              image={story.imageUrl as ImageWidgetSource}
              imageWidth={52}
              imageHeight={52}
              radius={8}
              style={{ width: 52, height: 52 }}
            />
          ) : (
            <TextWidget text="" style={{ width: 52, height: 52 }} />
          )}
        </FlexWidget>

        {/* Text */}
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget
            text={metaLine(story)}
            style={{ fontSize: 10, fontWeight: '600', color: META_COLOR, marginBottom: 4, letterSpacing: 0.3 }}
          />
          <TextWidget
            text={story.headline}
            maxLines={2}
            style={{ fontSize: 13, fontWeight: '700', color: '#F0F0F5', lineHeight: 18 }}
          />
        </FlexWidget>
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
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 8,
        flexDirection: 'column',
      }}
    >
      {/* Header strip */}
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center', marginBottom: 10 }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'ireaderpro://feed' }}
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
        >
          {/* Circular logo background */}
          <FlexWidget
            style={{
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: '#1C1E30',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ImageWidget image={LOGO} imageWidth={20} imageHeight={20} style={{ width: 20, height: 20 }} />
          </FlexWidget>
          <TextWidget
            text={greeting()}
            style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 }}
          />
        </FlexWidget>

        {/* Refresh */}
        <FlexWidget
          clickAction="REFRESH"
          style={{
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: '#1C1E30',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <TextWidget text="↺" style={{ fontSize: 16, fontWeight: '700', color: '#9AA0AE' }} />
        </FlexWidget>
      </FlexWidget>

      {/* Thin separator under header */}
      <FlexWidget style={{ height: 1, width: 'match_parent', backgroundColor: DIVIDER, marginBottom: 2 }} />

      {stories.length === 0 ? (
        <FlexWidget style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}>
          <TextWidget text="Tap to open iReader" style={{ fontSize: 13, color: '#4A5060' }} />
        </FlexWidget>
      ) : (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
          {stories.map((s, i) => <Row key={s.id} story={s} showDivider={i > 0} />)}
        </ListWidget>
      )}
    </FlexWidget>
  );
}
