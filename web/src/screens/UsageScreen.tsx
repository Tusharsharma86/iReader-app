import React, { useEffect, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import { getUsageStats, UsageStats, DayData } from '../utils/usageTracker';

const BLUE = '#4A90D9';
const PURPLE = '#8B5CF6';
const GREEN = '#34D399';
const AMBER = '#F59E0B';
const CARD = { background: '#0E0E0E', border: '1px solid #1A1A1A', borderRadius: 14, padding: '14px 16px', marginBottom: 24 } as const;
const USAGE_API = 'https://ireader.onrender.com/api/news/usage';
const CONSOLE_URL = 'https://platform.claude.com/cost?range=mtd';

interface ServerUsage {
  range: { start: string; end: string; key: string };
  totals: { cost: number; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreateTokens: number };
  days: Array<{ day: string; cost: number; calls: number }>;
  byModel: Record<string, { cost: number; calls: number }>;
  byFeature: Record<string, { cost: number; calls: number }>;
  byApp: Record<string, { cost: number; calls: number }>;
}

type Range = 'mtd' | '7d' | '30d';

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

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
  const [range, setRange] = useState<Range>('mtd');
  const [serverUsage, setServerUsage] = useState<ServerUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => { setStats(getUsageStats()); }, []);

  useEffect(() => {
    setUsageLoading(true);
    setUsageError(null);
    fetch(`${USAGE_API}?range=${range}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((d: ServerUsage) => setServerUsage(d))
      .catch(e => setUsageError(String(e)))
      .finally(() => setUsageLoading(false));
  }, [range]);

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
          {/* ACTUAL CLAUDE COST (server aggregate) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 10px' }}>
            <span style={{ color: '#444', fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>ACTUAL CLAUDE COST</span>
            <div style={{ display: 'flex', gap: 4, background: '#0E0E0E', border: '1px solid #1A1A1A', borderRadius: 999, padding: 3 }}>
              {(['mtd','7d','30d'] as Range[]).map(r => (
                <button key={r} onClick={() => setRange(r)} style={{
                  padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: range === r ? GREEN + '22' : 'transparent',
                  color: range === r ? GREEN : '#555',
                  fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
                }}>
                  {r === 'mtd' ? 'MONTH' : r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div style={{ ...CARD, margin: '0 16px 12px' }}>
            {usageLoading ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ width: 24, height: 24, border: '3px solid #222', borderTopColor: GREEN, borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
              </div>
            ) : usageError ? (
              <div style={{ color: '#444', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Could not load cost: {usageError}</div>
            ) : !serverUsage ? (
              <div style={{ color: '#444', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>No data.</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}>
                  <span style={{ color: GREEN, fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>
                    ${serverUsage.totals.cost.toFixed(2)}
                  </span>
                  <div>
                    <div style={{ color: '#DDD', fontSize: 14, fontWeight: 700 }}>{serverUsage.totals.calls} calls</div>
                    <div style={{ color: '#555', fontSize: 10, fontWeight: 600, marginTop: 2 }}>
                      {serverUsage.range.start} → {serverUsage.range.end}
                    </div>
                  </div>
                </div>
                <Divider />
                <div style={{ display: 'flex', padding: '12px 0' }}>
                  {[
                    ['INPUT TOK', fmtTokens(serverUsage.totals.inputTokens)],
                    ['OUTPUT TOK', fmtTokens(serverUsage.totals.outputTokens)],
                    ['CACHE READ', fmtTokens(serverUsage.totals.cacheReadTokens)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ color: '#DDD', fontSize: 14, fontWeight: 700 }}>{value}</div>
                      <div style={{ color: '#555', fontSize: 9, fontWeight: 700, letterSpacing: 1.1, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
                {Object.keys(serverUsage.byModel).length > 0 && (
                  <>
                    <Divider />
                    {Object.entries(serverUsage.byModel)
                      .sort((a, b) => b[1].cost - a[1].cost)
                      .slice(0, 3)
                      .map(([model, v]) => (
                        <div key={model} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                          <span style={{ flex: 1, color: '#BBB', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {model.replace(/^claude-/, '').replace(/-\d{8}$/, '')}
                          </span>
                          <span style={{ color: GREEN, fontSize: 13, fontWeight: 700 }}>${v.cost.toFixed(2)}</span>
                          <span style={{ color: '#555', fontSize: 11, width: 36, textAlign: 'right' }}>{v.calls}</span>
                        </div>
                      ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Open live console dashboard */}
          <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            margin: '0 16px 24px', padding: '14px 16px',
            borderRadius: 12, background: '#0E0E0E',
            border: '1px solid #1A1A1A', textDecoration: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
            <span style={{ flex: 1, color: BLUE, fontSize: 13, fontWeight: 700 }}>Open Anthropic Console</span>
            <span style={{ color: '#444', fontSize: 16 }}>›</span>
          </a>

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
