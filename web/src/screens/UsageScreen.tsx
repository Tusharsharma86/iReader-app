import React, { useEffect, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import { getUsageStats, UsageStats, DayData } from '../utils/usageTracker';

const BLUE = '#4A90D9';
const PURPLE = '#8B5CF6';
const GREEN = '#10B981';
const AMBER = '#F59E0B';
const PINK = '#EC4899';
const USAGE_API = 'https://ireader.onrender.com/api/news/usage';
const CONSOLE_URL = 'https://console.groq.com/dashboard/usage';

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

function SpinnerRing({ color }: { color: string }) {
  return (
    <>
      <div style={{ width: 28, height: 28, border: `3px solid #1E1E2E`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({ value, label, color, icon }: { value: string; label: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, borderRadius: 16,
      background: 'linear-gradient(145deg, #111118, #0D0D15)',
      border: `1px solid ${color}28`,
      padding: '14px 10px 12px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      boxShadow: `0 4px 24px ${color}10`,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: `${color}18`, display: 'flex',
        alignItems: 'center', justifyContent: 'center', marginBottom: 2,
      }}>
        {icon}
      </div>
      <span style={{ color, fontSize: 20, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 }}>{value}</span>
      <span style={{ color: '#4A4A5A', fontSize: 10, fontWeight: 600, textAlign: 'center', letterSpacing: 0.3 }}>{label}</span>
    </div>
  );
}

// ── Activity Bar Chart ────────────────────────────────────────────────────────

function ActivityChart({ days }: { days: DayData[] }) {
  const maxA = Math.max(...days.map(d => d.articles), 1);
  const maxAi = Math.max(...days.map(d => d.aiTotal), 1);
  const maxVal = Math.max(maxA, maxAi);
  const BAR_H = 80;

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        {[{ color: BLUE, label: 'Articles' }, { color: PURPLE, label: 'AI Uses' }].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
            <span style={{ color: '#5A5A6E', fontSize: 11, fontWeight: 600 }}>{l.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: BAR_H + 4, gap: 0 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 3 }}>
            <div style={{
              width: 10,
              height: Math.max(3, (d.articles / maxVal) * BAR_H),
              background: d.articles > 0 ? `linear-gradient(to top, ${BLUE}AA, ${BLUE})` : '#1A1A2E',
              borderRadius: '3px 3px 0 0',
            }} />
            <div style={{
              width: 10,
              height: Math.max(3, (d.aiTotal / maxVal) * BAR_H),
              background: d.aiTotal > 0 ? `linear-gradient(to top, ${PURPLE}AA, ${PURPLE})` : '#1A1A2E',
              borderRadius: '3px 3px 0 0',
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 10 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', color: '#3A3A4E', fontSize: 10, fontWeight: 700 }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

// ── Progress Row ──────────────────────────────────────────────────────────────

function ProgressRow({ label, value, total, color, count, labelWidth = 70 }: {
  label: string; value: number; total: number; color: string; count?: number; labelWidth?: number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const displayCount = count ?? value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <span style={{ color: '#888', fontSize: 13, width: labelWidth, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: '#1A1A2E', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.max(pct, value > 0 ? 5 : 0)}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 99,
        }} />
      </div>
      <span style={{ color: '#5A5A6E', fontSize: 12, fontWeight: 700, width: 28, textAlign: 'right', flexShrink: 0 }}>{displayCount}</span>
    </div>
  );
}

// ── Token Pill ────────────────────────────────────────────────────────────────

function TokenPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ color: '#CCC', fontSize: 15, fontWeight: 800 }}>{value}</div>
      <div style={{ color: '#3A3A4E', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ── Period Tab Row ────────────────────────────────────────────────────────────

function PeriodTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer', borderRadius: 8,
      background: active ? '#1E1E2E' : 'transparent',
      color: active ? '#FFF' : '#3A3A4E',
      fontSize: 11, fontWeight: 800, letterSpacing: 1,
      transition: 'all 0.15s',
    }}>
      {label}
    </button>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: '#12121E' }} />;
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionLabel({ text, accent }: { text: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px' }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: accent }} />
      <span style={{ color: '#3A3A5A', fontSize: 10, fontWeight: 800, letterSpacing: 1.8 }}>{text}</span>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

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

  const RANGE_LABELS: Record<Range, string> = { mtd: 'MONTH', '7d': '7 DAYS', '30d': '30 DAYS' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#080810', WebkitOverflowScrolling: 'touch' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px 20px',
        paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
      }}>
        <button onClick={goBack} style={{
          width: 36, height: 36, borderRadius: 10, background: '#0E0E1A',
          border: '1px solid #1A1A2E', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div>
          <div style={{ color: '#FFF', fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>My Stats</div>
          <div style={{ color: '#3A3A5A', fontSize: 11, fontWeight: 600, marginTop: 1 }}>Usage & Insights</div>
        </div>
      </div>

      {!stats ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          <SpinnerRing color={BLUE} />
        </div>
      ) : (
        <div style={{ animation: 'fadeUp 0.3s ease' }}>

          {/* ── HERO COST CARD ── */}
          <div style={{ margin: '0 16px 20px', borderRadius: 20, overflow: 'hidden', background: 'linear-gradient(135deg, #0E0E1E 0%, #121228 100%)', border: '1px solid #1A1A35', boxShadow: `0 8px 40px #0004` }}>
            {/* Range Selector */}
            <div style={{ display: 'flex', padding: '12px 12px 0', gap: 4 }}>
              {(['mtd', '7d', '30d'] as Range[]).map(r => (
                <PeriodTab key={r} label={RANGE_LABELS[r]} active={range === r} onClick={() => setRange(r)} />
              ))}
            </div>

            <div style={{ padding: '16px 20px 20px' }}>
              {usageLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                  <SpinnerRing color={GREEN} />
                </div>
              ) : usageError ? (
                <div style={{ color: '#3A3A5A', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Could not load cost data</div>
              ) : !serverUsage ? (
                <div style={{ color: '#3A3A5A', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No data available</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ color: '#3A3A5A', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>ACTUAL COST</div>
                      <div style={{ color: GREEN, fontSize: 42, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>
                        ${serverUsage.totals.cost.toFixed(2)}
                      </div>
                      <div style={{ color: '#3A3A5A', fontSize: 11, marginTop: 6 }}>
                        {serverUsage.range.start} → {serverUsage.range.end}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#DDD', fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{serverUsage.totals.calls}</div>
                      <div style={{ color: '#3A3A5A', fontSize: 10, fontWeight: 700, letterSpacing: 1.2 }}>API CALLS</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', background: '#0A0A18', borderRadius: 12, padding: '12px 0', marginBottom: 14 }}>
                    <TokenPill label="INPUT TOK" value={fmtTokens(serverUsage.totals.inputTokens)} />
                    <div style={{ width: 1, background: '#1A1A2E' }} />
                    <TokenPill label="OUTPUT TOK" value={fmtTokens(serverUsage.totals.outputTokens)} />
                    <div style={{ width: 1, background: '#1A1A2E' }} />
                    <TokenPill label="CACHE READ" value={fmtTokens(serverUsage.totals.cacheReadTokens)} />
                  </div>

                  {Object.keys(serverUsage.byModel).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Object.entries(serverUsage.byModel)
                        .sort((a, b) => b[1].cost - a[1].cost)
                        .slice(0, 3)
                        .map(([model, v], idx) => (
                          <div key={model} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', borderRadius: 10,
                            background: '#0A0A18', border: '1px solid #12122A',
                          }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                              background: [GREEN, BLUE, PURPLE][idx] + '22',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 800, color: [GREEN, BLUE, PURPLE][idx],
                            }}>
                              {idx + 1}
                            </div>
                            <span style={{ flex: 1, color: '#AAA', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {model.replace(/^claude-/, '').replace(/-\d{8}$/, '')}
                            </span>
                            <span style={{ color: GREEN, fontSize: 13, fontWeight: 800 }}>${v.cost.toFixed(2)}</span>
                            <span style={{ color: '#3A3A5A', fontSize: 11, fontWeight: 600 }}>{v.calls}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Open Console link */}
            <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 20px', borderTop: '1px solid #12122A', textDecoration: 'none',
              background: '#0A0A18',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
              <span style={{ flex: 1, color: BLUE, fontSize: 12, fontWeight: 700 }}>Open Groq Console</span>
              <span style={{ color: '#2A2A4A', fontSize: 16 }}>›</span>
            </a>
          </div>

          {/* ── TODAY ── */}
          <SectionLabel text="TODAY" accent={AMBER} />
          <div style={{ display: 'flex', gap: 8, margin: '0 16px 22px' }}>
            <MetricCard value={String(stats.today.articles)} label="Articles" color={BLUE} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            } />
            <MetricCard value={String(stats.today.ai.total)} label="AI Uses" color={PURPLE} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PURPLE} strokeWidth="2"><path d="M12 2a10 10 0 110 20 10 10 0 010-20z"/><path d="M12 8v4l3 3"/></svg>
            } />
            <MetricCard value={fmt$(stats.today.ai.total * stats.costPerAiCall)} label="Est. Cost" color={GREEN} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            } />
          </div>

          {/* ── ACTIVITY CHART ── */}
          <SectionLabel text="LAST 7 DAYS" accent={BLUE} />
          <div style={{
            margin: '0 16px 22px', borderRadius: 18,
            background: 'linear-gradient(145deg, #0E0E1A, #0A0A15)',
            border: '1px solid #12122A', padding: '16px',
          }}>
            <ActivityChart days={stats.last7Days} />
          </div>

          {/* ── THIS WEEK ── */}
          <SectionLabel text="THIS WEEK" accent={PURPLE} />
          <div style={{ display: 'flex', gap: 8, margin: '0 16px 22px' }}>
            <MetricCard value={String(stats.week.articles)} label="Articles" color={BLUE} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            } />
            <MetricCard value={String(stats.week.ai.total)} label="AI Uses" color={PURPLE} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PURPLE} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            } />
            <MetricCard value={fmt$(stats.week.ai.total * stats.costPerAiCall)} label="Est. Cost" color={GREEN} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            } />
          </div>

          {/* ── THIS MONTH ── */}
          <SectionLabel text="THIS MONTH" accent={GREEN} />
          <div style={{ display: 'flex', gap: 8, margin: '0 16px 22px' }}>
            <MetricCard value={String(stats.month.articles)} label="Articles" color={BLUE} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            } />
            <MetricCard value={String(stats.month.ai.total)} label="AI Uses" color={PURPLE} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PURPLE} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            } />
            <MetricCard value={fmt$(stats.month.ai.total * stats.costPerAiCall)} label="Est. Cost" color={GREEN} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            } />
          </div>

          {/* ── AI USAGE BREAKDOWN ── */}
          <SectionLabel text="AI USAGE BREAKDOWN" accent={PURPLE} />
          <div style={{
            margin: '0 16px 22px', borderRadius: 18,
            background: 'linear-gradient(145deg, #0E0E1A, #0A0A15)',
            border: '1px solid #12122A', padding: '4px 16px',
          }}>
            {stats.allTime.ai.total === 0 ? (
              <div style={{ color: '#3A3A5A', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No AI features used yet.</div>
            ) : (
              <>
                <ProgressRow label="Summary" value={stats.allTime.ai.summary} total={stats.allTime.ai.total} color={PURPLE} />
                <Divider />
                <ProgressRow label="5 Ws" value={stats.allTime.ai.fiveWs} total={stats.allTime.ai.total} color={AMBER} />
                <Divider />
                <ProgressRow label="ELI5" value={stats.allTime.ai.eli5} total={stats.allTime.ai.total} color={PINK} />
              </>
            )}
          </div>

          {/* ── TOP SOURCES ── */}
          <SectionLabel text="READING MOST" accent={BLUE} />
          <div style={{
            margin: '0 16px 22px', borderRadius: 18,
            background: 'linear-gradient(145deg, #0E0E1A, #0A0A15)',
            border: '1px solid #12122A', padding: '4px 16px',
          }}>
            {stats.topSources.length === 0 ? (
              <div style={{ color: '#3A3A5A', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Start reading to see top sources.</div>
            ) : (
              stats.topSources.map((src, i) => (
                <React.Fragment key={src.name}>
                  {i > 0 && <Divider />}
                  <ProgressRow label={src.name} value={src.count} total={stats.topSources[0].count} color={BLUE} labelWidth={110} />
                </React.Fragment>
              ))
            )}
          </div>

          {/* ── ALL TIME ── */}
          <SectionLabel text="ALL TIME" accent={AMBER} />
          <div style={{ display: 'flex', gap: 8, margin: '0 16px 22px' }}>
            <MetricCard value={String(stats.allTime.articles)} label="Articles Read" color={BLUE} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
            } />
            <MetricCard value={String(stats.allTime.ai.total)} label="AI Requests" color={PURPLE} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PURPLE} strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            } />
            <MetricCard value={fmt$(stats.allTime.ai.total * stats.costPerAiCall)} label="Total Est." color={AMBER} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            } />
          </div>

          <div style={{ color: '#22223A', fontSize: 11, textAlign: 'center', padding: '4px 24px 56px', lineHeight: 1.6 }}>
            Est. ~$0.016–0.018 per AI request · Claude Sonnet ~3k input + ~500 output tokens
          </div>
        </div>
      )}
    </div>
  );
}
