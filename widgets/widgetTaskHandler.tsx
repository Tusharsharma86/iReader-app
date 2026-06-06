import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { NewsWidget, type WidgetStory } from './NewsWidget';

const FEED_URL = 'https://ireader.onrender.com/api/news/feed?topic=breaking';
const CACHE_KEY = '@widget_breaking_v1';
const MAX_ITEMS = 12;

interface CacheShape { stories: WidgetStory[]; at: number; }

// Devanagari range — catches Hindi / Marathi / Sanskrit headlines.
const DEVANAGARI = /[ऀ-ॿ]/;
// Hindi-language source names we want to exclude even if the headline is
// transliterated to English.
const HINDI_SOURCES = new Set([
  'Aaj Tak', 'NDTV India', 'Zee News Hindi', 'ABP News', 'Times Now Navbharat',
  'News18 India', 'Dainik Bhaskar', 'Amar Ujala', 'Jansatta', 'Punjab Kesari',
]);
const FRESH_MS = 90 * 60 * 1000; // 90 min — "breaking-ish" cutoff

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapItems(raw: any): WidgetStory[] {
  const items: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.feed) ? raw.feed : [];
  const now = Date.now();
  const out: WidgetStory[] = [];
  for (const it of items) {
    const p = it?.primary ?? it;
    const headline = String(p?.headline ?? '').trim();
    const summary = String(p?.summary ?? '');
    const publishedAt = String(p?.publishedAt ?? '');
    if (!headline) continue;

    // Drop Hindi headlines / Hindi sources.
    if (DEVANAGARI.test(headline) || DEVANAGARI.test(summary)) continue;
    const srcs = Array.isArray(p?.sources) ? p.sources : [];
    const src = srcs[0];
    const srcName = String(src?.name ?? '');
    if (HINDI_SOURCES.has(srcName)) continue;

    // Only TRULY breaking: server-flagged OR ≥3 sources OR fresh (<90 min).
    const count = Number(p?.sourceCount ?? srcs.length ?? 1) || 1;
    const ts = Date.parse(publishedAt);
    const fresh = Number.isFinite(ts) && now - ts < FRESH_MS;
    const flaggedBreaking = Boolean(p?.isBreaking);
    if (!flaggedBreaking && count < 3 && !fresh) continue;

    out.push({
      id: String(p?.id ?? src?.url ?? headline),
      headline,
      source: srcName,
      sourceCount: count,
      imageUrl: String(p?.imageUrl ?? ''),
      url: String(src?.url ?? ''),
      publishedAt,
      summary,
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
  const { widgetAction, renderWidget, clickAction } = props;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      // Render cached content instantly so the widget is never blank, then
      // fetch fresh and re-render.
      const cached = await readCache();
      renderWidget(<NewsWidget stories={cached?.stories ?? []} updatedAt={cached?.at} />);
      const fresh = await fetchFresh();
      if (fresh) renderWidget(<NewsWidget stories={fresh.stories} updatedAt={fresh.at} />);
      break;
    }
    case 'WIDGET_CLICK': {
      // Row/header taps use OPEN_URI (handled natively). The only in-handler
      // action is the refresh button.
      if (clickAction === 'REFRESH') {
        const fresh = await fetchFresh();
        const data = fresh ?? (await readCache());
        renderWidget(<NewsWidget stories={data?.stories ?? []} updatedAt={data?.at} />);
      }
      break;
    }
    default:
      break;
  }
}
