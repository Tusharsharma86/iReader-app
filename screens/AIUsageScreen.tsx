import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

const VIOLET = '#b994ff';
const GREEN = '#34D399';
const AMBER = '#F59E0B';
const RED = '#EF4444';
const BLUE = '#4A90D9';
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
function healthColor(p: number | null | undefined): string {
  if (p == null) return MUTED;
  return p >= 95 ? GREEN : p >= 80 ? AMBER : RED;
}

export default function AIUsageScreen() {
  const navigation = useNavigation();
  const [ai, setAi] = useState<AiUsage | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('https://ireader.onrender.com/api/news/ai-usage')
      .then(r => r.json())
      .then((d: AiUsage) => { if (Array.isArray(d?.models)) { setAi(d); setErr(false); } else setErr(true); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = (ai?.models ?? []).filter(m => m.calls > 0);
  const idle = (ai?.models ?? []).filter(m => m.calls === 0);
  const hourly = ai?.models?.length
    ? Array.from({ length: 24 }, (_, h) => ai.models.reduce((s, m) => s + (m.hourly?.[h] ?? 0), 0))
    : [];
  const peak = Math.max(1, ...hourly);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#DDD" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>AI Engine</Text>
          <Text style={styles.subtitle}>{ai?.day ?? '—'} · resets daily (UTC)</Text>
        </View>
        <Pressable onPress={load} disabled={loading} style={[styles.refreshBtn, loading && { opacity: 0.5 }]}>
          {loading ? <ActivityIndicator size="small" color={VIOLET} />
                   : <Text style={styles.refreshText}>Refresh</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {err && <View style={styles.card}><Text style={styles.muted}>Couldn&apos;t load AI usage. The backend may be waking up — tap Refresh.</Text></View>}

        {ai && (
          <>
            {/* KPIs */}
            <View style={styles.kpiGrid}>
              <Kpi label="REQUESTS TODAY" value={String(ai.totalCalls ?? 0)} accent={VIOLET}
                   sub={`${ai.activeModels ?? 0} model${(ai.activeModels ?? 0) === 1 ? '' : 's'} active`} />
              <Kpi label="SUCCESS RATE" value={ai.successPct != null ? `${ai.successPct}%` : '—'}
                   accent={healthColor(ai.successPct)} sub={`${ai.totalErrors ?? 0} errors`} />
              <Kpi label="AVG RESPONSE" value={ai.avgMs != null ? `${(ai.avgMs / 1000).toFixed(1)}s` : '—'}
                   accent={BLUE} sub="successful calls" />
              <Kpi label="TOKENS" value={fmt(ai.totalTokens)} accent={GREEN}
                   sub={ai.totalCost ? `$${ai.totalCost.toFixed(2)} spend` : 'all free tier'} />
            </View>

            {/* Activity */}
            {hourly.some(v => v > 0) && (
              <Section title="ACTIVITY (UTC)">
                <View style={styles.spark}>
                  {hourly.map((v, h) => (
                    <View key={h} style={{
                      flex: 1, marginHorizontal: 1, borderRadius: 2,
                      height: Math.max(2, (v / peak) * 56),
                      backgroundColor: v > 0 ? VIOLET : '#1E1E1E',
                      opacity: v > 0 ? 0.35 + 0.65 * (v / peak) : 1,
                    }} />
                  ))}
                </View>
                <View style={styles.sparkAxis}>
                  <Text style={styles.axisText}>00:00</Text>
                  <Text style={styles.axisText}>12:00</Text>
                  <Text style={styles.axisText}>23:00</Text>
                </View>
              </Section>
            )}

            {/* Models */}
            <Section title={`MODELS · ${active.length} ACTIVE`}>
              {active.length === 0 ? (
                <Text style={styles.muted}>No AI calls yet today.</Text>
              ) : (
                <View style={{ gap: 12 }}>
                  {active.map(m => (
                    <ModelCard key={m.model} m={m} open={open === m.model}
                               onToggle={() => setOpen(open === m.model ? null : m.model)} />
                  ))}
                </View>
              )}
              {idle.length > 0 && (
                <View style={styles.idleBlock}>
                  <Text style={styles.miniHeader}>STANDING BY</Text>
                  {idle.map(m => (
                    <View key={m.model} style={styles.idleRow}>
                      <Text style={styles.idleName} numberOfLines={1}>{m.model}</Text>
                      <Text style={styles.idleTier}>{m.tier ? TIER_LABEL[m.tier] ?? m.tier : 'idle'}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* Task rollup */}
            {ai.tasks && ai.tasks.length > 0 && (
              <Section title="WHERE AI WORK GOES">
                {(() => {
                  const max = Math.max(...ai.tasks!.map(t => t.calls), 1);
                  return ai.tasks!.map(t => (
                    <View key={t.task} style={{ marginBottom: 12 }}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.taskLabel} numberOfLines={1}>{t.label}</Text>
                        <Text style={styles.taskMeta}>
                          {t.calls} · {fmt(t.tokens)}{t.errors > 0 ? ` · ${t.errors} err` : ''}
                        </Text>
                      </View>
                      <View style={styles.track}>
                        <View style={{ width: `${(t.calls / max) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: t.errors > 0 ? AMBER : VIOLET }} />
                      </View>
                    </View>
                  ));
                })()}
              </Section>
            )}

            <Text style={styles.footnote}>
              {ai.note ?? ''} Counters live in server memory and reset when the backend restarts,
              so treat these as a running snapshot rather than an audited total.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: accent }]}>{value}</Text>
      {!!sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Bar({ pct, color, label, right }: { pct: number; color: string; label: string; right: string }) {
  return (
    <View style={{ marginTop: 10 }}>
      <View style={styles.rowBetween}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barLabel}>{right}</Text>
      </View>
      <View style={styles.track}>
        <View style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginRight: 18 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ModelCard({ m, open, onToggle }: { m: AiModel; open: boolean; onToggle: () => void }) {
  const pc = PROVIDER_COLOR[m.provider ?? ''] ?? VIOLET;
  return (
    <View style={styles.modelCard}>
      <Pressable onPress={onToggle} style={{ padding: 14 }}>
        <View style={styles.modelTopRow}>
          {!!m.provider && (
            <View style={[styles.pill, { backgroundColor: `${pc}1A` }]}>
              <Text style={[styles.pillText, { color: pc }]}>{m.provider.toUpperCase()}</Text>
            </View>
          )}
          {!!m.tier && m.tier !== '—' && (
            <View style={styles.tierPill}><Text style={styles.tierText}>{TIER_LABEL[m.tier] ?? m.tier}</Text></View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={[styles.health, { color: healthColor(m.successPct) }]}>
            {m.successPct != null ? `${m.successPct}% ok` : '—'}
          </Text>
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color="#555" style={{ marginLeft: 6 }} />
        </View>
        <Text style={styles.modelName}>{m.model}</Text>
        <Text style={styles.modelRole}>{m.role}</Text>

        <View style={styles.statRow}>
          <Stat label="calls" value={String(m.calls)} />
          <Stat label="tokens" value={fmt(m.tokensUsed)} />
          <Stat label="avg time" value={m.avgMs != null ? `${(m.avgMs / 1000).toFixed(1)}s` : '—'} />
          <Stat label="avg tokens" value={m.avgTokens != null ? String(m.avgTokens) : '—'} />
          {!m.free && <Stat label="cost" value={`$${(m.costUsd ?? 0).toFixed(3)}`} />}
        </View>

        {!!m.requestsLimit && (
          <Bar pct={m.requestsPct ?? 0} color={pc} label="Daily requests"
               right={`${m.calls} / ${m.requestsLimit.toLocaleString()}`} />
        )}
        {!!m.tokensLimit && (
          <Bar pct={m.pct ?? 0} color={GREEN} label="Daily tokens"
               right={`${fmt(m.tokensUsed)} / ${fmt(m.tokensLimit)}`} />
        )}
      </Pressable>

      {open && m.tasks.length > 0 && (
        <View style={styles.taskPanel}>
          <Text style={styles.miniHeader}>BY TASK</Text>
          {m.tasks.map(t => (
            <View key={t.task} style={styles.taskRow}>
              <Text style={styles.taskName} numberOfLines={1}>{t.label}</Text>
              <Text style={styles.taskMeta}>
                {t.calls} · {fmt(t.tokens)}
                {t.avgMs != null ? ` · ${(t.avgMs / 1000).toFixed(1)}s` : ''}
                {t.errors > 0 ? ` · ${t.errors} err` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A1A',
  },
  backBtn: { padding: 2 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  subtitle: { color: MUTED, fontSize: 11, marginTop: 1 },
  refreshBtn: {
    backgroundColor: 'rgba(185,148,255,0.1)', borderWidth: 1, borderColor: 'rgba(185,148,255,0.25)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 68, alignItems: 'center',
  },
  refreshText: { color: VIOLET, fontSize: 12, fontWeight: '600' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: {
    flexGrow: 1, flexBasis: '46%', backgroundColor: '#0E0E0E',
    borderWidth: 1, borderColor: '#1A1A1A', borderRadius: 14, padding: 13,
  },
  kpiLabel: { color: MUTED, fontSize: 9.5, fontWeight: '700', letterSpacing: 1 },
  kpiValue: { fontSize: 24, fontWeight: '800', marginTop: 6 },
  kpiSub: { color: '#555', fontSize: 11, marginTop: 3 },

  sectionHeader: { color: MUTED, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10 },
  card: { backgroundColor: '#0E0E0E', borderWidth: 1, borderColor: '#1A1A1A', borderRadius: 14, padding: 16 },
  muted: { color: MUTED, fontSize: 13 },

  spark: { flexDirection: 'row', alignItems: 'flex-end', height: 60 },
  sparkAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { color: MUTED, fontSize: 10 },

  modelCard: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1A1A1A', borderRadius: 12, overflow: 'hidden' },
  modelTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  pillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },
  tierPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#2A2A2A' },
  tierText: { color: '#777', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  health: { fontSize: 11, fontWeight: '700' },
  modelName: { color: '#EEE', fontSize: 14, fontWeight: '600' },
  modelRole: { color: MUTED, fontSize: 11, marginTop: 2 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  statValue: { color: '#EEE', fontSize: 15, fontWeight: '700' },
  statLabel: { color: '#555', fontSize: 10, letterSpacing: 0.4 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  barLabel: { color: '#888', fontSize: 11 },
  track: { height: 5, backgroundColor: '#161616', borderRadius: 3, overflow: 'hidden' },

  taskPanel: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1A1A1A', padding: 14, backgroundColor: '#0C0C0C' },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: 10 },
  taskName: { color: '#BBB', fontSize: 12, flexShrink: 1 },
  taskLabel: { color: '#DDD', fontSize: 13, flexShrink: 1 },
  taskMeta: { color: MUTED, fontSize: 11 },
  miniHeader: { color: MUTED, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },

  idleBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1A1A1A' },
  idleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 10 },
  idleName: { color: '#777', fontSize: 12, flexShrink: 1 },
  idleTier: { color: '#444', fontSize: 11 },

  footnote: { color: '#444', fontSize: 11, lineHeight: 17, marginTop: 20, paddingHorizontal: 4 },
});
