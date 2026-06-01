import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import { getUsageStats, type UsageStats, type DayData } from '../utils/usageTracker';

const BLUE = '#4A90D9';
const VIOLET = '#b994ff';
const GREEN = '#34D399';
const PINK = '#F472B6';
const CARD = '#0E0E0E';
const BORDER = '#1A1A1A';
const MUTED = '#666';

type Range = '7d' | '30d' | 'all';
interface GroqQuota {
  requestsPerDay?: string | null; requestsRemaining?: string | null; requestsReset?: string | null;
  tokensPerMin?: string | null; tokensRemaining?: string | null; tokensReset?: string | null;
}

export default function UsageScreen() {
  const { goBack } = useRouter();
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [range, setRange] = useState<Range>('7d');
  const [quota, setQuota] = useState<GroqQuota | null>(null);
  const [quotaErr, setQuotaErr] = useState(false);

  useEffect(() => { setStats(getUsageStats()); }, []);

  useEffect(() => {
    fetch('https://ireader.onrender.com/api/news/groq-quota')
      .then(r => r.json())
      .then((d: { limits?: GroqQuota }) => { if (d?.limits) setQuota(d.limits); else setQuotaErr(true); })
      .catch(() => setQuotaErr(true));
  }, []);

  const bucket = useMemo(() => {
    if (!stats) return null;
    return range === '7d' ? stats.week : range === '30d' ? stats.month : stats.allTime;
  }, [stats, range]);

  if (!stats || !bucket) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: MUTED }}>Loading…</div>
    );
  }

  const trend = range === '7d' ? stats.last7Days : stats.last30Days;
  const hasAny = stats.allTime.articles > 0 || stats.allTime.ai.total > 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#050505', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px', paddingTop: 'calc(16px + env(safe-area-inset-top,0px))' }}>
        <button onClick={goBack} style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: CARD, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ color: '#FFF', fontSize: 22, fontWeight: 800 }}>Your Usage</div>
      </div>

      <div style={{ padding: '0 16px 60px' }}>
        {/* Streak hero */}
        <div style={{ padding: 18, background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ color: VIOLET, fontSize: 10, fontWeight: 800, letterSpacing: 1.6 }}>READING STREAK</div>
          <div style={{ color: '#FFF', fontSize: 48, fontWeight: 900, lineHeight: 1.1 }}>{stats.streakDays}</div>
          <div style={{ color: MUTED, fontSize: 12 }}>{stats.streakDays === 1 ? 'day' : 'days'} in a row</div>
        </div>

        {/* Range picker */}
        <div style={{ display: 'flex', gap: 4, background: CARD, borderRadius: 12, padding: 4, marginBottom: 14 }}>
          {(['7d', '30d', 'all'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: range === r ? '#1f1f24' : 'transparent', color: range === r ? '#FFF' : '#555', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              {r === '7d' ? '7 DAYS' : r === '30d' ? '30 DAYS' : 'ALL TIME'}
            </button>
          ))}
        </div>

        {/* KPI grid — web omits notification stats (no push on web) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <KPI color={BLUE} value={bucket.articles} label="Articles Read" />
          <KPI color={VIOLET} value={bucket.ai.total} label="AI Summaries" />
        </div>

        {trend.some(d => d.articles > 0 || d.aiTotal > 0) && (
          <Section title="ACTIVITY TREND"><BarChart days={trend} compact={range === '30d'} /></Section>
        )}

        {bucket.ai.total > 0 && (
          <Section title="AI USAGE BREAKDOWN">
            <SplitBar items={[
              { label: 'Summary', value: bucket.ai.summary, color: BLUE },
              { label: 'Five Ws', value: bucket.ai.fiveWs, color: GREEN },
              { label: 'ELI5', value: bucket.ai.eli5, color: PINK },
            ]} />
          </Section>
        )}

        {stats.topTopics.length > 0 && (
          <Section title="TOP TOPICS · ALL TIME"><RankedList items={stats.topTopics} color={VIOLET} /></Section>
        )}
        {stats.topSources.length > 0 && (
          <Section title="TOP SOURCES · ALL TIME"><RankedList items={stats.topSources} color={BLUE} /></Section>
        )}

        {/* AI engine quota (Groq) — live daily limits. Web-only for now. */}
        {(quota || quotaErr) && (
          <Section title="AI ENGINE · GROQ DAILY QUOTA">
            {quota ? <GroqQuotaCard q={quota} /> : (
              <div style={{ color: MUTED, fontSize: 12 }}>Couldn't load live quota.</div>
            )}
          </Section>
        )}

        {!hasAny && (
          <div style={{ textAlign: 'center', padding: 40, color: MUTED }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div style={{ color: '#888', fontSize: 14, fontWeight: 600 }}>No usage yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Read an article or open a Deep Dive to start tracking.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function GroqQuotaCard({ q }: { q: GroqQuota }) {
  const limit = Number(q.requestsPerDay) || 0;
  const remaining = Number(q.requestsRemaining);
  const hasReq = limit > 0 && Number.isFinite(remaining);
  const used = hasReq ? Math.max(0, limit - remaining) : 0;
  const pct = hasReq ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 90 ? PINK : pct >= 70 ? '#F59E0B' : GREEN;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ color: '#FFF', fontSize: 13, fontWeight: 700 }}>Requests today</span>
        <span style={{ color: MUTED, fontSize: 12 }}>
          {hasReq ? `${used.toLocaleString()} / ${limit.toLocaleString()}` : '—'}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: '#1A1A1A', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ color: barColor, fontSize: 11, fontWeight: 700 }}>{hasReq ? `${remaining.toLocaleString()} left` : ''}</span>
        {q.requestsReset && <span style={{ color: MUTED, fontSize: 11 }}>resets in {q.requestsReset}</span>}
      </div>

      <div style={{ height: 1, background: BORDER, margin: '14px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ color: '#FFF', fontSize: 13, fontWeight: 700 }}>Tokens / min</span>
        <span style={{ color: MUTED, fontSize: 12 }}>
          {q.tokensRemaining != null && q.tokensPerMin != null
            ? `${Number(q.tokensRemaining).toLocaleString()} / ${Number(q.tokensPerMin).toLocaleString()} left`
            : '—'}
        </span>
      </div>
      <div style={{ color: '#444', fontSize: 10, marginTop: 10 }}>
        Live from Groq · model llama-4-scout · falls back to local clustering if exhausted
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ color: '#555', fontSize: 11, fontWeight: 700, letterSpacing: 1.4, marginBottom: 8, marginLeft: 4 }}>{title}</div>
      <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>{children}</div>
    </div>
  );
}

function KPI({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <div style={{ flex: 1, minWidth: '46%', background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      </div>
      <div style={{ color: '#FFF', fontSize: 24, fontWeight: 800 }}>{value.toLocaleString()}</div>
      <div style={{ color: MUTED, fontSize: 11, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function BarChart({ days, compact }: { days: DayData[]; compact?: boolean }) {
  const max = Math.max(...days.map(d => Math.max(d.articles, d.aiTotal)), 1);
  const BAR_H = compact ? 60 : 84;
  const barW = compact ? 5 : 12;
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
        <Legend color={BLUE} label="Read" />
        <Legend color={VIOLET} label="AI" />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: BAR_H + 22 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: BAR_H }}>
              <div style={{ width: barW, height: Math.max(d.articles > 0 ? 2 : 0, (d.articles / max) * BAR_H), background: BLUE, borderRadius: 2 }} />
              <div style={{ width: barW, height: Math.max(d.aiTotal > 0 ? 2 : 0, (d.aiTotal / max) * BAR_H), background: VIOLET, borderRadius: 2 }} />
            </div>
            {!compact && <div style={{ color: '#555', fontSize: 9, fontWeight: 600 }}>{d.label}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
      <span style={{ color: '#999', fontSize: 11, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function SplitBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', background: '#1a1a1f', height: 10 }}>
        {items.map((it, i) => <div key={i} style={{ flex: it.value / total, background: it.color }} />)}
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: it.color }} />
              <span style={{ color: '#CCC', fontSize: 13 }}>{it.label}</span>
            </div>
            <span style={{ color: '#FFF', fontSize: 13, fontWeight: 700 }}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedList({ items, color }: { items: { name: string; count: number }[]; color: string }) {
  const max = items[0]?.count ?? 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ color: '#555', fontSize: 12, fontWeight: 700, width: 18 }}>{i + 1}</span>
            <span style={{ flex: 1, color: '#DDD', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
            <span style={{ color: '#FFF', fontSize: 13, fontWeight: 700 }}>{it.count}</span>
          </div>
          <div style={{ height: 4, background: '#1a1a1f', borderRadius: 2, overflow: 'hidden', marginLeft: 28 }}>
            <div style={{ height: 4, borderRadius: 2, background: color, width: `${(it.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
