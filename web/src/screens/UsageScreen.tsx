import React, { useEffect, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import { getUsageStats, UsageStats, DayData } from '../utils/usageTracker';

const BLUE = '#4A90D9';
const PURPLE = '#8B5CF6';
const GREEN = '#34D399';
const AMBER = '#F59E0B';
const CARD = { background: '#0E0E0E', border: '1px solid #1A1A1A', borderRadius: 14, padding: '14px 16px', marginBottom: 24 } as const;

// ── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ days }: { days: DayData[] }) {
  const maxA = Math.max(...days.map(d => d.articles), 1);
  const maxAi = Math.max(...days.map(d => d.aiTotal), 1);
  const maxVal = Math.max(maxA, maxAi);
  const BAR_H = 90;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        {[{ color: BLUE, label: 'Articles' }, { color: PURPLE, label: 'AI uses' }].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: l.color }} />
            <span style={{ color: '#666', fontSize: 11, fontWeight: 600 }}>{l.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: BAR_H + 4, gap: 0 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 3 }}>
            <div style={{ width: 9, height: Math.max(3, (d.articles / maxVal) * BAR_H), background: d.articles > 0 ? BLUE : '#1A1A1A', borderRadius: '3px 3px 0 0' }} />
            <div style={{ width: 9, height: Math.max(3, (d.aiTotal / maxVal) * BAR_H), background: d.aiTotal > 0 ? PURPLE : '#1A1A1A', borderRadius: '3px 3px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 8 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', color: '#555', fontSize: 10, fontWeight: 600 }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

// ── Progress bar rows ─────────────────────────────────────────────────────────

function ProgressRow({ label, value, total, color, labelWidth = 70 }: { label: string; value: number; total: number; color: string; labelWidth?: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
      <span style={{ color: '#888', fontSize: 13, width: labelWidth, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: '#1A1A1A', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(pct, value > 0 ? 4 : 0)}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ color: '#555', fontSize: 13, width: 28, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ flex: 1, background: '#0E0E0E', borderRadius: 12, border: `1px solid ${color}33`, padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <span style={{ color, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{value}</span>
      <span style={{ color: '#555', fontSize: 10, fontWeight: 600, textAlign: 'center' }}>{label}</span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <div style={{ color: '#444', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: '0 20px 10px' }}>{title}</div>;
}

function Divider() {
  return <div style={{ height: 1, background: '#1A1A1A' }} />;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function UsageScreen() {
  const { goBack } = useRouter();
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => { setStats(getUsageStats()); }, []);

  const fmt$ = (n: number) => n === 0 ? '$0.00' : n < 0.10 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', WebkitOverflowScrolling: 'touch' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 24px' }}>
        <button onClick={goBack} style={{ width: 36, height: 36, borderRadius: 10, background: '#0E0E0E', border: '1px solid #1A1A1A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>My Stats</span>
      </div>

      {!stats ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          <div style={{ width: 32, height: 32, border: '3px solid #1A1A1A', borderTopColor: BLUE, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <>
          {/* TODAY */}
          <SectionHeader title="TODAY" />
          <div style={{ display: 'flex', gap: 8, margin: '0 16px 24px' }}>
            <StatTile value={String(stats.today.articles)} label="Articles" color={BLUE} />
            <StatTile value={String(stats.today.ai.total)} label="AI Uses" color={PURPLE} />
            <StatTile value={fmt$(stats.today.ai.total * stats.costPerAiCall)} label="Est. Cost" color={GREEN} />
          </div>

          {/* LAST 7 DAYS CHART */}
          <SectionHeader title="LAST 7 DAYS" />
          <div style={{ ...CARD, margin: '0 16px 24px' }}>
            <BarChart days={stats.last7Days} />
          </div>

          {/* THIS WEEK */}
          <SectionHeader title="THIS WEEK" />
          <div style={{ display: 'flex', gap: 8, margin: '0 16px 24px' }}>
            <StatTile value={String(stats.week.articles)} label="Articles" color={BLUE} />
            <StatTile value={String(stats.week.ai.total)} label="AI Uses" color={PURPLE} />
            <StatTile value={fmt$(stats.week.ai.total * stats.costPerAiCall)} label="Est. Cost" color={GREEN} />
          </div>

          {/* THIS MONTH */}
          <SectionHeader title="THIS MONTH" />
          <div style={{ display: 'flex', gap: 8, margin: '0 16px 24px' }}>
            <StatTile value={String(stats.month.articles)} label="Articles" color={BLUE} />
            <StatTile value={String(stats.month.ai.total)} label="AI Uses" color={PURPLE} />
            <StatTile value={fmt$(stats.month.ai.total * stats.costPerAiCall)} label="Est. Cost" color={GREEN} />
          </div>

          {/* AI USAGE BREAKDOWN */}
          <SectionHeader title="AI USAGE BREAKDOWN" />
          <div style={{ ...CARD, margin: '0 16px 24px' }}>
            {stats.allTime.ai.total === 0 ? (
              <div style={{ color: '#444', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>No AI features used yet.</div>
            ) : (
              <>
                <ProgressRow label="Summary" value={stats.allTime.ai.summary} total={stats.allTime.ai.total} color={PURPLE} />
                <Divider />
                <ProgressRow label="5 Ws" value={stats.allTime.ai.fiveWs} total={stats.allTime.ai.total} color={AMBER} />
                <Divider />
                <ProgressRow label="ELI5" value={stats.allTime.ai.eli5} total={stats.allTime.ai.total} color={GREEN} />
              </>
            )}
          </div>

          {/* READING MOST */}
          <SectionHeader title="READING MOST" />
          <div style={{ ...CARD, margin: '0 16px 24px' }}>
            {stats.topSources.length === 0 ? (
              <div style={{ color: '#444', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Start reading to see your top sources.</div>
            ) : (
              stats.topSources.map((src, i) => (
                <React.Fragment key={src.name}>
                  {i > 0 && <Divider />}
                  <ProgressRow label={src.name} value={src.count} total={stats.topSources[0].count} color={BLUE} labelWidth={110} />
                </React.Fragment>
              ))
            )}
          </div>

          {/* ALL TIME */}
          <SectionHeader title="ALL TIME" />
          <div style={{ display: 'flex', gap: 8, margin: '0 16px 24px' }}>
            <StatTile value={String(stats.allTime.articles)} label="Articles Read" color={BLUE} />
            <StatTile value={String(stats.allTime.ai.total)} label="AI Requests" color={PURPLE} />
            <StatTile value={fmt$(stats.allTime.ai.total * stats.costPerAiCall)} label="Total Est." color={AMBER} />
          </div>

          <div style={{ color: '#333', fontSize: 11, textAlign: 'center', padding: '0 24px 48px', lineHeight: 1.5 }}>
            Est. cost ~$0.016–0.018 per AI request (Claude Sonnet: ~3k input + ~500 output tokens).
          </div>
        </>
      )}
    </div>
  );
}
