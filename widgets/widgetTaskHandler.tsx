import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { NewsWidget, type WidgetStory } from './NewsWidget';

const FEED_URL = 'https://ireader.onrender.com/api/news/feed?topic=breaking';
const CACHE_KEY = '@widget_breaking_v1';
const MAX_ITEMS = 12;

interface CacheShape { stories: WidgetStory[]; at: number; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapItems(raw: any): WidgetStory[] {
  const items: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.feed) ? raw.feed : [];
  const out: WidgetStory[] = [];
  for (const it of items) {
    const p = it?.primary ?? it;
    const headline = String(p?.headline ?? '').trim();
    const publishedAt = String(p?.publishedAt ?? '');
    if (!headline) continue;
    const src = Array.isArray(p?.sources) ? p.sources[0] : undefined;
    out.push({
      id: String(p?.id ?? src?.url ?? headline),
      headline,
      source: String(src?.name ?? ''),
      imageUrl: String(p?.imageUrl ?? ''),
      url: String(src?.url ?? ''),
      publishedAt,
      summary: String(p?.summary ?? ''),
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

async function readCache(): Promise<CacheShape | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheShape) : null;
  } catch { return null; }
}

async function fetchFresh(): Promise<CacheShape | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(FEED_URL, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const stories = mapItems(await r.json());
    if (stories.length === 0) return null;
    const payload: CacheShape = { stories, at: Date.now() };
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload)).catch(() => {});
    return payload;
  } catch { return null; }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetAction, renderWidget } = props;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      // Render cached content instantly so the widget is never blank, then
      // fetch fresh and re-render.
      const cached = await readCache();
      if (cached) {
        renderWidget(<NewsWidget stories={cached.stories} updatedAt={cached.at} />);
      } else {
        renderWidget(<NewsWidget stories={[]} />);
      }
      const fresh = await fetchFresh();
      if (fresh) {
        renderWidget(<NewsWidget stories={fresh.stories} updatedAt={fresh.at} />);
      }
      break;
    }
    // Row taps use clickAction "OPEN_URI" → handled natively (deep link),
    // so WIDGET_CLICK never fires here. Nothing to do for DELETED.
    default:
      break;
  }
}
