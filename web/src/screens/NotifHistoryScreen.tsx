// Web notif history. Synced with Android via per-token pair code.
// User pastes their Android push token (from Android: Notifications →
// History → Pair Code → Share) → web saves it in localStorage → polls
// /api/news/notif-history on focus + once-per-minute background.
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import type { ArticleParams } from '../types';
import { getArticleColor } from '../utils/colors';

const VIOLET = '#b994ff';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';
const API_BASE = 'https://ireader.onrender.com/api/news';
const PAIR_KEY = 'ireader_notif_pair_token_v1';
const KIND_META: Record<string, { label: string; color: string }> = {
  breaking: { label: 'BREAKING', color: '#FF5555' },
  source:   { label: 'SOURCE',   color: '#4A90D9' },
  topic:    { label: 'TOPIC',    color: VIOLET },
  'ai-feed':{ label: 'AI FEED',  color: '#F5A623' },
  aiFeed:   { label: 'AI FEED',  color: '#F5A623' },
  digest:   { label: 'DIGEST',   color: '#888' },
  streak:   { label: 'STREAK',   color: '#5ac890' },
};

interface RemoteEntry {
  id: string; kind: string; firedAt: number;
  headline?: string; summary?: string; imageUrl?: string;
  url?: string; source?: string; publishedAt?: string;
}

function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function groupByDay(entries: RemoteEntry[]): { label: string; items: RemoteEntry[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const buckets = new Map<string, RemoteEntry[]>();
  const order: string[] = [];
  for (const e of entries) {
    let label: string;
    if (e.firedAt >= startOfToday) label = 'Today';
    else if (e.firedAt >= startOfYesterday) label = 'Yesterday';
    else label = new Date(e.firedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (!buckets.has(label)) { buckets.set(label, []); order.push(label); }
    buckets.get(label)!.push(e);
  }
  return order.map(label => ({ label, items: buckets.get(label)! }));
}

export default function NotifHistoryScreen() {
  const { goBack, navigate } = useRouter();
  const [token, setToken] = useState<string>(() => {
    try { return localStorage.getItem(PAIR_KEY) ?? ''; } catch { return ''; }
  });
  const [pendingToken, setPendingToken] = useState('');
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (tk: string) => {
    if (!tk) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_BASE}/notif-history?token=${encodeURIComponent(tk)}&limit=200`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as { entries?: RemoteEntry[] };
      setEntries(data.entries ?? []);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchHistory(token);
  }, [token, fetchHistory]);

  // Background refresh every 60s while screen mounted.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => fetchHistory(token), 60 * 1000);
    return () => clearInterval(id);
  }, [token, fetchHistory]);

  const savePair = () => {
    const tk = pendingToken.trim();
    if (!tk) return;
    try { localStorage.setItem(PAIR_KEY, tk); } catch {}
    setToken(tk);
    setPendingToken('');
  };

  const unpair = () => {
    try { localStorage.removeItem(PAIR_KEY); } catch {}
    setToken('');
    setEntries([]);
  };

  const openEntry = (e: RemoteEntry) => {
    const params: ArticleParams = {
      id: e.id,
      url: e.url ?? '',
      image: e.imageUrl ?? '',
      headline: e.headline ?? '',
      summary: e.summary ?? '',
      source: e.source ?? '',
      publishedAt: e.publishedAt ?? new Date(e.firedAt).toISOString(),
      dominantColor: getArticleColor(e.id || e.headline || ''),
      sources: JSON.stringify(e.url ? [{ name: e.source ?? '', url: e.url, publishedAt: e.publishedAt ?? '' }] : []),
      allStories: '[]',
    };
    navigate({ name: 'Article', params });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: '#FFF', paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
        <div onClick={goBack} style={{ width: 36, height: 36, borderRadius: 18, background: CARD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Notifications</div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{token ? `${entries.length} entries · synced from phone` : 'Pair phone to sync'}</div>
        </div>
        {token && (
          <div onClick={unpair} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #2A2A2A', color: '#999', fontSize: 11, fontWeight: 700, letterSpacing: 0.6, cursor: 'pointer' }}>Unpair</div>
        )}
      </div>

      {!token ? (
        <div style={{ padding: '30px 20px' }}>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(185,148,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={VIOLET} strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </div>
              <div style={{ color: '#FFF', fontSize: 17, fontWeight: 700 }}>Pair with phone</div>
            </div>
            <div style={{ color: '#999', fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
              On Android: <b style={{ color: '#CCC' }}>Settings → Notifications → Notification Settings → History → Pair Code</b> → tap Share → copy.
            </div>
            <input
              value={pendingToken}
              onChange={e => setPendingToken(e.target.value)}
              placeholder="Paste your pair code (ExponentPushToken[...])"
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, background: '#0A0A0A', border: `1px solid ${BORDER}`, color: '#FFF', fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
            />
            <div onClick={savePair} style={{ marginTop: 12, padding: '11px 0', borderRadius: 10, background: pendingToken.trim() ? VIOLET : '#222', color: pendingToken.trim() ? '#000' : '#666', textAlign: 'center', fontSize: 14, fontWeight: 700, cursor: pendingToken.trim() ? 'pointer' : 'not-allowed' }}>
              Save & Sync
            </div>
            <div style={{ marginTop: 14, color: '#555', fontSize: 11, lineHeight: 1.5 }}>
              Token lives in this browser only. Backend stores 200 most-recent pushes per device.
            </div>
          </div>
        </div>
      ) : loading && entries.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666' }}>Syncing…</div>
      ) : error ? (
        <div style={{ padding: '20px' }}>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, color: '#FF6B6B', fontSize: 13 }}>{error}</div>
        </div>
      ) : entries.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 13, lineHeight: 1.5 }}>
          No notifications recorded yet for this device.<br/>
          New pushes appear here within ~60 seconds.
        </div>
      ) : groupByDay(entries).map(sec => (
        <div key={sec.label} style={{ marginBottom: 16, padding: '0 16px' }}>
          <div style={{ color: '#666', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, marginBottom: 8, paddingLeft: 4 }}>{sec.label.toUpperCase()}</div>
          <div style={{ background: CARD_BG, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            {sec.items.map((e, i) => {
              const meta = KIND_META[e.kind] ?? KIND_META.breaking;
              return (
                <div key={`${e.id}-${e.firedAt}`} onClick={() => openEntry(e)} style={{ display: 'flex', alignItems: 'center', padding: 12, gap: 12, borderTop: i > 0 ? '1px solid #1F1F22' : 'none', cursor: 'pointer' }}>
                  {e.imageUrl ? (
                    <img src={e.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} onError={ev => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 10, background: getArticleColor(e.id || e.headline || ''), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/></svg>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <span style={{ color: meta.color, fontSize: 9, fontWeight: 800, letterSpacing: 0.8 }}>{meta.label}</span>
                      <span style={{ color: '#333', fontSize: 9 }}>·</span>
                      <span style={{ color: '#666', fontSize: 11 }}>{timeOfDay(e.firedAt)}</span>
                      {e.source && (
                        <>
                          <span style={{ color: '#333', fontSize: 9 }}>·</span>
                          <span style={{ color: '#555', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{e.source}</span>
                        </>
                      )}
                    </div>
                    <div style={{ color: '#DDD', fontSize: 13.5, fontWeight: 600, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.headline ?? ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
