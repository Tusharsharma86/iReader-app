import React, { useEffect, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import { getUsageStats, UsageStats, DayData } from '../utils/usageTracker';

const BLUE = '#4A90D9';
const PURPLE = '#8B5CF6';
const GREEN = '#10B981';
const AMBER = '#F59E0B';
const PINK = '#EC4899';
const TEAL = '#14B8A6';

const CATEGORY_COLORS: Record<string, string> = {
  Tech: BLUE,
  Markets: GREEN,
  World: PURPLE,
  India: AMBER,
  News: TEAL,
};

const TOPIC_COLORS = [BLUE, PURPLE, GREEN, AMBER, PINK, TEAL, '#F97316', '#6366F1'];

// ── Activity chart ────────────────────────────────────────────────────────────

function ActivityChart({ days }: { days: DayData[] }) {
  const maxVal = Math.max(...days.map(d => d.articles), 1);
  const BAR_H = 70;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: BAR_H + 4, gap: 0 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
            <span style={{ color: d.articles > 0 ? BLUE : 'transparent', fontSize: 9, fontWeight: 700 }}>{d.articles > 0 ? d.articles : ''}</span>
            <div style={{
              width: '60%',
              height: Math.max(4, (d.articles / maxVal) * BAR_H),
              background: d.articles > 0 ? `linear-gradient(to top, ${BLUE}88, ${BLUE})` : '#1A1A2E',
              borderRadius: '4px 4px 0 0',
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 8 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', color: '#3A3A55', fontSize: 10, fontWeight: 700 }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

// ── Progress bar row ──────────────────────────────────────────────────────────

function ProgressRow({ label, value, maxVal, color, rank }: {
  label: string; value: number; maxVal: number; color: string; rank?: number;
}) {
  const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
      {rank !== undefined && (
        <div style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, color,
        }}>{rank}</div>
      )}
      <span style={{ color: '#888', fontSize: 13, minWidth: 80, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ width: 100, height: 5, background: '#1A1A2E', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{
          height: '100%',
          width: `${Math.max(pct, value > 0 ? 6 : 0)}%`,
          background: `linear-gradient(90deg, ${color}66, ${color})`,
          borderRadius: 99,
        }} />
      </div>
      <span style={{ color: color, fontSize: 13, fontWeight: 800, width: 28, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  );
}

// ── Big stat ──────────────────────────────────────────────────────────────────

function BigStat({ value, label, sub, color }: { value: string | number; label: string; sub?: string; color: string }) {
  return (
    <div style={{
      flex: 1, borderRadius: 16,
      background: 'linear-gradient(145deg, #0E0E1C, #0B0B16)',
      border: `1px solid ${color}22`,
      padding: '16px 10px 12px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      boxShadow: `0 4px 20px ${color}0A`,
    }}>
      <span style={{ color, fontSize: 28, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>{value}</span>
      <span style={{ color: '#AAA', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{label}</span>
      {sub && <span style={{ color: '#3A3A5A', fontSize: 10, textAlign: 'center' }}>{sub}</span>}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ text, accent }: { text: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px' }}>
      <div style={{ width: 3, height: 13, borderRadius: 2, background: accent }} />
      <span style={{ color: '#3A3A5A', fontSize: 10, fontWeight: 800, letterSpacing: 1.8 }}>{text}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#10101E' }} />;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      margin: '0 16px 22px', borderRadius: 18,
      background: 'linear-gradient(145deg, #0E0E1A, #0A0A14)',
      border: '1px solid #12122A', padding: '4px 16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ color: '#2A2A45', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>{text}</div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function UsageScreen() {
  const { goBack } = useRouter();
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => { setStats(getUsageStats()); }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#080810', WebkitOverflowScrolling: 'touch' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div>
          <div style={{ color: '#FFF', fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Reading Stats</div>
          <div style={{ color: '#3A3A5A', fontSize: 11, fontWeight: 600, marginTop: 1 }}>Articles · Categories · Topics</div>
        </div>
      </div>

      {!stats ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          <div style={{ width: 28, height: 28, border: `3px solid #1E1E2E`, borderTopColor: BLUE, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div style={{ animation: 'fadeUp 0.3s ease' }}>

          {/* ── ALL TIME hero ── */}
          <div style={{
            margin: '0 16px 20px', borderRadius: 20,
            background: 'linear-gradient(135deg, #0E0E1E 0%, #111128 100%)',
            border: '1px solid #1A1A35',
            padding: '20px',
          }}>
            <div style={{ color: '#3A3A5A', fontSize: 10, fontWeight: 800, letterSpacing: 1.8, marginBottom: 12 }}>ALL TIME</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 4 }}>
              <span style={{ color: BLUE, fontSize: 52, fontWeight: 900, letterSpacing: -3, lineHeight: 1 }}>{stats.allTime.articles}</span>
              <span style={{ color: '#555', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>articles read</span>
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
              {[
                { label: 'TODAY', value: stats.today.articles, color: GREEN },
                { label: 'THIS WEEK', value: stats.week.articles, color: PURPLE },
                { label: 'THIS MONTH', value: stats.month.articles, color: AMBER },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ color, fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>{value}</div>
                  <div style={{ color: '#2A2A45', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── ACTIVITY CHART ── */}
          <SectionLabel text="LAST 7 DAYS" accent={BLUE} />
          <Card style={{ padding: '16px' }}>
            <ActivityChart days={stats.last7Days} />
          </Card>

          {/* ── CATEGORIES ── */}
          <SectionLabel text="TOP CATEGORIES" accent={PURPLE} />
          <Card>
            {stats.topCategories.length === 0 ? (
              <EmptyState text="Read articles to see your top categories." />
            ) : (
              stats.topCategories.map((cat, i) => (
                <React.Fragment key={cat.name}>
                  {i > 0 && <Divider />}
                  <ProgressRow
                    label={cat.name}
                    value={cat.count}
                    maxVal={stats.topCategories[0].count}
                    color={CATEGORY_COLORS[cat.name] ?? PURPLE}
                    rank={i + 1}
                  />
                </React.Fragment>
              ))
            )}
          </Card>

          {/* ── TOPICS ── */}
          <SectionLabel text="TOP TOPICS" accent={TEAL} />
          <Card>
            {stats.topTopics.length === 0 ? (
              <EmptyState text="Read articles to see your top topics." />
            ) : (
              stats.topTopics.map((topic, i) => (
                <React.Fragment key={topic.name}>
                  {i > 0 && <Divider />}
                  <ProgressRow
                    label={topic.name}
                    value={topic.count}
                    maxVal={stats.topTopics[0].count}
                    color={TOPIC_COLORS[i % TOPIC_COLORS.length]}
                    rank={i + 1}
                  />
                </React.Fragment>
              ))
            )}
          </Card>

          {/* ── TOP SOURCES ── */}
          <SectionLabel text="TOP SOURCES" accent={GREEN} />
          <Card>
            {stats.topSources.length === 0 ? (
              <EmptyState text="Start reading to see your top sources." />
            ) : (
              stats.topSources.map((src, i) => (
                <React.Fragment key={src.name}>
                  {i > 0 && <Divider />}
                  <ProgressRow
                    label={src.name}
                    value={src.count}
                    maxVal={stats.topSources[0].count}
                    color={TOPIC_COLORS[i % TOPIC_COLORS.length]}
                    rank={i + 1}
                  />
                </React.Fragment>
              ))
            )}
          </Card>

          {/* ── PERIOD BREAKDOWN ── */}
          <SectionLabel text="BY PERIOD" accent={AMBER} />
          <div style={{ display: 'flex', gap: 8, margin: '0 16px 22px' }}>
            <BigStat value={stats.today.articles} label="Today" color={GREEN} />
            <BigStat value={stats.week.articles} label="Week" color={PURPLE} />
            <BigStat value={stats.month.articles} label="Month" color={AMBER} />
          </div>

          <div style={{ color: '#1A1A30', fontSize: 11, textAlign: 'center', padding: '4px 24px 56px', lineHeight: 1.6 }}>
            Stats stored locally · last 30 days
          </div>
        </div>
      )}
    </div>
  );
}
