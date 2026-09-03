import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';

const VIOLET = '#b994ff';
const GREEN = '#34D399';
const AMBER = '#F59E0B';
const RED = '#EF4444';
const BLUE = '#4A90D9';
const CARD = '#0E0E0E';
const BORDER = '#1A1A1A';
const MUTED = '#666';

interface AiTask { task: string; label: string; tokens: number; calls: number; errors: number; avgMs?: number | null; }
interface AiModel {
  model: string; provider?: string; tier?: string; role: string;
  tokensUsed: number; tokensLimit: number | null; pct: number | null;
  calls: number; requestsLimit?: number; requestsPct?: number | null;
  errors: number; successPct?: number | null; avgMs?: number | null;
  avgTokens?: number | null; costUsd?: number; free?: boolean;
  hourly?: number[]; tasks: AiTask[];
}
interface AiUsage {
  day: string; totalTokens: number; totalCalls?: number; totalErrors?: number;
  totalCost?: number; successPct?: number | null; avgMs?: number | null;
  activeModels?: number; tasks?: AiTask[]; models: AiModel[]; note?: string;
}

const PROVIDER_COLOR: Record<string, string> = { Gemini: BLUE, Groq: VIOLET, SambaNova: GREEN };
const TIER_LABEL: Record<string, string> = { primary: 'PRIMARY', fallback: 'FALLBACK', background: 'BACKGROUND' };

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function healthColor(successPct: number | null | undefined): string {
  if (successPct == null) return MUTED;
  if (successPct >= 95) return GREEN;
  if (successPct >= 80) return AMBER;
  return RED;
}

export default function AIUsageScreen() {
  const { goBack } = useRouter();
  const [ai, setAi] = useState<AiUsage | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openModel, setOpenModel] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('https://ireader.onrender.com/api/news/ai-usage')
      .then(r => r.json())
      .then((d: AiUsage) => {
        if (Array.isArray(d?.models)) { setAi(d); setErr(false); } else setErr(true);
      })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = (ai?.models ?? []).filter(m => m.calls > 0);
  const idle = (ai?.models ?? []).filter(m => m.calls === 0);
  const peakHour = ai?.models?.length
    ? Array.from({ length: 24 }, (_, h) => ai.models.reduce((s, m) => s + (m.hourly?.[h] ?? 0), 0))
    : [];
  const peakMax = Math.max(1, ...peakHour);

  return (
    <div style={{ minHeight: '100vh', background: '#080808', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'rgba(8,8,8,0.94)',
        backdropFilter: 'blur(12px)', borderBottom: `1px solid ${BORDER}`,
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={goBack} aria-label="Back" style={{
          background: 'none', border: 'none', color: '#DDD', cursor: 'pointer',
          fontSize: 22, lineHeight: 1, padding: 0,
        }}>‹</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontSize: 17, fontWeight: 700 }}>AI Engine</div>
          <div style={{ color: MUTED, fontSize: 11 }}>{ai?.day ?? '—'} · resets daily (UTC)</div>
        </div>
        <button onClick={load} disabled={loading} style={{
          background: 'rgba(185,148,255,0.1)', border: `1px solid rgba(185,148,255,0.25)`,
          color: VIOLET, borderRadius: 8, padding: '6px 12px', fontSize: 12,
          fontWeight: 600, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
        }}>{loading ? '…' : 'Refresh'}</button>
      </div>

      {err && (
        <div style={{ margin: 18, padding: 16, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, color: MUTED, fontSize: 13 }}>
          Couldn&apos;t load AI usage. The backend may be waking up — try Refresh.
        </div>
      )}

      {ai && (
        <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── Headline KPIs ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Kpi label="Requests today" value={String(ai.totalCalls ?? 0)} accent={VIOLET}
                 sub={`${ai.activeModels ?? 0} model${(ai.activeModels ?? 0) === 1 ? '' : 's'} active`} />
            <Kpi label="Success rate" value={ai.successPct != null ? `${ai.successPct}%` : '—'}
                 accent={healthColor(ai.successPct)}
                 sub={`${ai.totalErrors ?? 0} error${(ai.totalErrors ?? 0) === 1 ? '' : 's'}`} />
            <Kpi label="Avg response" value={ai.avgMs != null ? `${(ai.avgMs / 1000).toFixed(1)}s` : '—'}
                 accent={BLUE} sub="successful calls" />
            <Kpi label="Tokens" value={fmt(ai.totalTokens)} accent={GREEN}
                 sub={ai.totalCost ? `$${ai.totalCost.toFixed(2)} spend` : 'all free tier'} />
          </div>

          {/* ── Activity by hour ── */}
          {peakHour.some(v => v > 0) && (
            <Section title="ACTIVITY (UTC)">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60, padding: '4px 2px' }}>
                {peakHour.map((v, h) => (
                  <div key={h} title={`${h}:00 — ${v} calls`} style={{
                    flex: 1, height: `${Math.max(2, (v / peakMax) * 100)}%`,
                    background: v > 0 ? VIOLET : '#1E1E1E',
                    opacity: v > 0 ? 0.35 + 0.65 * (v / peakMax) : 1,
                    borderRadius: 2, minHeight: 2,
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: MUTED, fontSize: 10, marginTop: 4 }}>
                <span>00:00</span><span>12:00</span><span>23:00</span>
              </div>
            </Section>
          )}

          {/* ── Models ── */}
          <Section title={`MODELS · ${active.length} ACTIVE`}>
            {active.length === 0 ? (
              <div style={{ color: MUTED, fontSize: 13, padding: '8px 0' }}>No AI calls yet today.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {active.map(m => (
                  <ModelCard key={m.model} m={m}
                             open={openModel === m.model}
                             onToggle={() => setOpenModel(openModel === m.model ? null : m.model)} />
                ))}
              </div>
            )}
            {idle.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, marginBottom: 8 }}>STANDING BY</div>
                {idle.map(m => (
                  <div key={m.model} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                    <span style={{ color: '#777', fontSize: 12 }}>{m.model}</span>
                    <span style={{ color: '#444', fontSize: 11 }}>{m.tier ? TIER_LABEL[m.tier] ?? m.tier : 'idle'}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── Where AI work goes ── */}
          {ai.tasks && ai.tasks.length > 0 && (
            <Section title="WHERE AI WORK GOES">
              {(() => {
                const max = Math.max(...ai.tasks!.map(t => t.calls), 1);
                return ai.tasks!.map(t => (
                  <div key={t.task} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ color: '#DDD', fontSize: 13 }}>{t.label}</span>
                      <span style={{ color: MUTED, fontSize: 12 }}>
                        {t.calls} · {fmt(t.tokens)} tok{t.errors > 0 ? ` · ${t.errors} err` : ''}
                      </span>
                    </div>
                    <div style={{ height: 5, background: '#161616', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${(t.calls / max) * 100}%`, height: '100%',
                        background: t.errors > 0 ? AMBER : VIOLET, borderRadius: 3,
                      }} />
                    </div>
                  </div>
                ));
              })()}
            </Section>
          )}

          <div style={{ color: '#444', fontSize: 11, lineHeight: 1.6, padding: '0 4px' }}>
            {ai.note ?? ''} Counters live in server memory and reset when the backend restarts,
            so treat these as a running snapshot rather than an audited total.
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '13px 14px' }}>
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>{label.toUpperCase()}</div>
      <div style={{ color: accent, fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 800, letterSpacing: 1.4, marginBottom: 10 }}>{title}</div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>{children}</div>
    </div>
  );
}

function Bar({ pct, color, label, right }: { pct: number; color: string; label: string; right: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#888', fontSize: 11 }}>{label}</span>
        <span style={{ color: '#888', fontSize: 11 }}>{right}</span>
      </div>
      <div style={{ height: 5, background: '#161616', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function ModelCard({ m, open, onToggle }: { m: AiModel; open: boolean; onToggle: () => void }) {
  const pc = PROVIDER_COLOR[m.provider ?? ''] ?? VIOLET;
  const health = healthColor(m.successPct);
  return (
    <div style={{ background: '#111', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ padding: 14, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          {m.provider && (
            <span style={{ color: pc, fontSize: 10, fontWeight: 800, letterSpacing: 0.8, background: `${pc}1A`, padding: '2px 7px', borderRadius: 5 }}>
              {m.provider.toUpperCase()}
            </span>
          )}
          {m.tier && m.tier !== '—' && (
            <span style={{ color: '#777', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, border: `1px solid #2A2A2A`, padding: '2px 6px', borderRadius: 5 }}>
              {TIER_LABEL[m.tier] ?? m.tier}
            </span>
          )}
          <span style={{ marginLeft: 'auto', color: health, fontSize: 11, fontWeight: 700 }}>
            {m.successPct != null ? `${m.successPct}% ok` : '—'}
          </span>
          <span style={{ color: '#555', fontSize: 13 }}>{open ? '▾' : '▸'}</span>
        </div>
        <div style={{ color: '#EEE', fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>{m.model}</div>
        <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{m.role}</div>

        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <Stat label="calls" value={String(m.calls)} />
          <Stat label="tokens" value={fmt(m.tokensUsed)} />
          <Stat label="avg time" value={m.avgMs != null ? `${(m.avgMs / 1000).toFixed(1)}s` : '—'} />
          <Stat label="avg tokens" value={m.avgTokens != null ? String(m.avgTokens) : '—'} />
          {!m.free && <Stat label="cost" value={`$${(m.costUsd ?? 0).toFixed(3)}`} />}
        </div>

        {m.requestsLimit ? (
          <Bar pct={m.requestsPct ?? 0} color={pc} label="Daily requests"
               right={`${m.calls} / ${m.requestsLimit.toLocaleString()}`} />
        ) : null}
        {m.tokensLimit ? (
          <Bar pct={m.pct ?? 0} color={GREEN} label="Daily tokens"
               right={`${fmt(m.tokensUsed)} / ${fmt(m.tokensLimit)}`} />
        ) : null}
      </div>

      {open && m.tasks.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 14px', background: '#0C0C0C' }}>
          <div style={{ color: MUTED, fontSize: 9, fontWeight: 800, letterSpacing: 1.2, marginBottom: 8 }}>BY TASK</div>
          {m.tasks.map(t => (
            <div key={t.task} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span style={{ color: '#BBB', fontSize: 12 }}>{t.label}</span>
              <span style={{ color: MUTED, fontSize: 11 }}>
                {t.calls} · {fmt(t.tokens)}
                {t.avgMs != null ? ` · ${(t.avgMs / 1000).toFixed(1)}s` : ''}
                {t.errors > 0 ? ` · ${t.errors} err` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: '#EEE', fontSize: 15, fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#555', fontSize: 10, letterSpacing: 0.4 }}>{label}</div>
    </div>
  );
}
