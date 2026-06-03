import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getUsageStats, type UsageStats, type DayData, type NotifBreakdown, type AiBreakdown } from '../utils/usageTracker';

const BLUE = '#4A90D9';
const VIOLET = '#b994ff';
const GREEN = '#34D399';
const AMBER = '#F59E0B';
const PINK = '#F472B6';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';
const MUTED = '#666';

type Range = '7d' | '30d' | 'all';

interface AiTask { task: string; label: string; tokens: number; calls: number; errors: number; }
interface AiModel { model: string; role: string; tokensUsed: number; tokensLimit: number | null; pct: number | null; calls: number; requestsLimit?: number; errors: number; tasks: AiTask[]; }
interface AiUsage { day: string; totalTokens: number; models: AiModel[]; }

export default function UsageScreen() {
  const navigation = useNavigation();
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [range, setRange] = useState<Range>('7d');
  const [ai, setAi] = useState<AiUsage | null>(null);
  const [aiErr, setAiErr] = useState(false);

  useEffect(() => {
    getUsageStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('https://ireader.onrender.com/api/news/ai-usage')
      .then(r => r.json())
      .then((d: AiUsage) => { if (Array.isArray(d?.models)) setAi(d); else setAiErr(true); })
      .catch(() => setAiErr(true));
  }, []);

  if (!stats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}><Text style={{ color: MUTED }}>Loading…</Text></View>
      </SafeAreaView>
    );
  }

  const bucket = range === '7d' ? stats.week : range === '30d' ? stats.month : stats.allTime;
  const trend = range === '7d' ? stats.last7Days : stats.last30Days;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.title}>Your Usage</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Streak hero */}
        <View style={styles.streakCard}>
          <Text style={styles.streakLabel}>READING STREAK</Text>
          <Text style={styles.streakNum}>{stats.streakDays}</Text>
          <Text style={styles.streakSub}>{stats.streakDays === 1 ? 'day' : 'days'} in a row</Text>
        </View>

        {/* Range picker */}
        <View style={styles.rangePicker}>
          {(['7d', '30d', 'all'] as Range[]).map(r => (
            <Pressable key={r} onPress={() => setRange(r)} style={[styles.rangeBtn, range === r && styles.rangeBtnActive]}>
              <Text style={[styles.rangeBtnText, range === r && styles.rangeBtnTextActive]}>
                {r === '7d' ? '7 DAYS' : r === '30d' ? '30 DAYS' : 'ALL TIME'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* KPI grid */}
        <View style={styles.kpiGrid}>
          <KPI icon="newspaper" color={BLUE} value={bucket.articles} label="Articles Read" />
          <KPI icon="sparkles" color={VIOLET} value={bucket.ai.total} label="AI Summaries" />
          <KPI icon="notifications" color={AMBER} value={bucket.notifsOpened.total} label="Notifs Opened" />
          <KPI icon="trending-up" color={GREEN} value={bucket.notifsReceived.total} label="Notifs Received" />
        </View>

        {/* Activity trend */}
        {trend.some(d => d.articles > 0 || d.aiTotal > 0 || d.notifsOpened > 0) && (
          <Section title="ACTIVITY TREND">
            <BarChart days={trend} compact={range === '30d'} />
          </Section>
        )}

        {/* AI breakdown */}
        {bucket.ai.total > 0 && (
          <Section title="AI USAGE BREAKDOWN">
            <SplitBar
              items={[
                { label: 'Deep Dive', value: bucket.ai.deepDive, color: VIOLET },
                { label: 'Summary', value: bucket.ai.summary, color: BLUE },
                { label: 'Five Ws', value: bucket.ai.fiveWs, color: GREEN },
                { label: 'ELI5', value: bucket.ai.eli5, color: PINK },
              ]}
            />
          </Section>
        )}

        {/* Notifications breakdown */}
        {(bucket.notifsReceived.total > 0 || bucket.notifsOpened.total > 0) && (
          <Section title="NOTIFICATIONS">
            <NotifBlock label="Received" data={bucket.notifsReceived} muted />
            <View style={{ height: 12 }} />
            <NotifBlock label="Opened" data={bucket.notifsOpened} />
            <View style={styles.notifRate}>
              <Text style={styles.notifRateText}>
                Open rate · {bucket.notifsReceived.total > 0
                  ? `${Math.round((bucket.notifsOpened.total / bucket.notifsReceived.total) * 100)}%`
                  : '—'}
              </Text>
            </View>
          </Section>
        )}

        {/* Top topics (all-time) */}
        {stats.topTopics.length > 0 && (
          <Section title="TOP TOPICS · ALL TIME">
            <RankedList items={stats.topTopics} color={VIOLET} />
          </Section>
        )}

        {/* Top sources (all-time) */}
        {stats.topSources.length > 0 && (
          <Section title="TOP SOURCES · ALL TIME">
            <RankedList items={stats.topSources} color={BLUE} />
          </Section>
        )}

        {/* AI engine usage — per model + per task, today (live from Groq). */}
        {(ai || aiErr) && (
          <Section title={`AI ENGINE · TODAY${ai ? ` · ${ai.totalTokens.toLocaleString()} tokens` : ''}`}>
            {!ai ? (
              <Text style={styles.aiMutedText}>Couldn&apos;t load AI usage.</Text>
            ) : ai.models.length === 0 ? (
              <Text style={styles.aiMutedText}>No AI calls yet today.</Text>
            ) : (
              <View style={{ gap: 16 }}>
                {ai.models.map(m => <AiModelBlock key={m.model} m={m} />)}
                <Text style={styles.aiFootnote}>Live from Groq · per-model daily token budgets are independent · figures reset on server restart (approx).</Text>
              </View>
            )}
          </Section>
        )}

        {stats.allTime.articles === 0 && stats.allTime.ai.total === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={36} color="#333" />
            <Text style={styles.emptyText}>No usage yet</Text>
            <Text style={styles.emptySub}>Read an article or open a Deep Dive to start tracking.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Components ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function KPI({ icon, color, value, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; value: number; label: string }) {
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value.toLocaleString()}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function BarChart({ days, compact }: { days: DayData[]; compact?: boolean }) {
  const max = Math.max(...days.map(d => Math.max(d.articles, d.aiTotal, d.notifsOpened)), 1);
  const BAR_H = compact ? 60 : 84;
  const barW = compact ? 6 : 14;

  return (
    <View>
      <View style={styles.legend}>
        <LegendDot color={BLUE} label="Read" />
        <LegendDot color={VIOLET} label="AI" />
        <LegendDot color={AMBER} label="Notif" />
      </View>
      <View style={[styles.barRow, { height: BAR_H + 24 }]}>
        {days.map((d, i) => {
          const aH = (d.articles / max) * BAR_H;
          const aiH = (d.aiTotal / max) * BAR_H;
          const nH = (d.notifsOpened / max) * BAR_H;
          return (
            <View key={i} style={styles.barCol}>
              <View style={[styles.barStack, { height: BAR_H, width: barW * 3 + 4 }]}>
                <View style={[styles.bar, { height: Math.max(aH, d.articles > 0 ? 2 : 0), backgroundColor: BLUE, width: barW }]} />
                <View style={[styles.bar, { height: Math.max(aiH, d.aiTotal > 0 ? 2 : 0), backgroundColor: VIOLET, width: barW }]} />
                <View style={[styles.bar, { height: Math.max(nH, d.notifsOpened > 0 ? 2 : 0), backgroundColor: AMBER, width: barW }]} />
              </View>
              {!compact && <Text style={styles.barLabel}>{d.label}</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: '#999', fontSize: 11, fontWeight: '600', letterSpacing: 0.4 }}>{label}</Text>
    </View>
  );
}

function SplitBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <View>
      <View style={styles.splitBar}>
        {items.map((it, i) => (
          <View key={i} style={{ flex: it.value / total, backgroundColor: it.color, height: 10 }} />
        ))}
      </View>
      <View style={{ marginTop: 12, gap: 8 }}>
        {items.map((it, i) => (
          <View key={i} style={styles.splitRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.color }} />
              <Text style={styles.splitLabel}>{it.label}</Text>
            </View>
            <Text style={styles.splitValue}>{it.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NotifBlock({ label, data, muted }: { label: string; data: NotifBreakdown; muted?: boolean }) {
  const total = data.total || 1;
  const chips: { label: string; value: number; color: string }[] = [
    { label: 'Breaking', value: data.breaking, color: '#FF6B6B' },
    { label: 'Topic', value: data.topic, color: VIOLET },
    { label: 'AI Feed', value: data.aiFeed, color: BLUE },
    { label: 'Fav Source', value: data.favSource, color: GREEN },
  ];
  return (
    <View>
      <View style={styles.notifHeader}>
        <Text style={[styles.notifLabel, muted && { color: '#777' }]}>{label.toUpperCase()}</Text>
        <Text style={[styles.notifTotal, muted && { color: '#888' }]}>{data.total}</Text>
      </View>
      <View style={styles.splitBar}>
        {chips.map((c, i) => (
          <View key={i} style={{ flex: (c.value || 0.001) / total, backgroundColor: muted ? c.color + '55' : c.color, height: 8 }} />
        ))}
      </View>
      <View style={styles.notifChipRow}>
        {chips.map((c, i) => c.value > 0 && (
          <View key={i} style={styles.notifChip}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
            <Text style={styles.notifChipText}>{c.label} {c.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RankedList({ items, color }: { items: { name: string; count: number }[]; color: string }) {
  const max = items[0]?.count ?? 1;
  return (
    <View style={{ gap: 10 }}>
      {items.map((it, i) => (
        <View key={i}>
          <View style={styles.rankRow}>
            <Text style={styles.rankRankNum}>{i + 1}</Text>
            <Text style={styles.rankName} numberOfLines={1}>{it.name}</Text>
            <Text style={styles.rankCount}>{it.count}</Text>
          </View>
          <View style={styles.rankBarBg}>
            <View style={[styles.rankBarFill, { width: `${(it.count / max) * 100}%`, backgroundColor: color }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function shortModel(m: string): string {
  return m.replace(/^meta-llama\//, '').replace(/^openai\//, '');
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.aiBarBg}>
      <View style={[styles.aiBarFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

function AiModelBlock({ m }: { m: AiModel }) {
  const pct = m.pct ?? 0;
  const color = pct >= 90 ? PINK : pct >= 70 ? AMBER : GREEN;
  const rPct = m.requestsLimit ? Math.min(100, Math.round((m.calls / m.requestsLimit) * 100)) : 0;
  return (
    <View style={styles.aiModelCard}>
      {/* Model header */}
      <View style={styles.aiModelHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiModelName}>{shortModel(m.model)}</Text>
          <Text style={styles.aiModelRole}>{m.role.toUpperCase()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.aiModelTokens}>{m.tokensUsed.toLocaleString()}</Text>
          <Text style={styles.aiModelTokensSub}>{m.tokensLimit ? `/ ${m.tokensLimit.toLocaleString()} tokens` : 'tokens'}</Text>
        </View>
      </View>
      {/* Token budget bar */}
      {m.tokensLimit != null && (
        <>
          <View style={{ marginTop: 8 }}><Bar pct={pct} color={color} /></View>
          <View style={styles.aiBarMeta}>
            <Text style={[styles.aiBarMetaStrong, { color }]}>{pct}% of daily tokens</Text>
            <Text style={styles.aiBarMetaRight}>{m.errors > 0 ? `${m.errors} rate-limited` : 'resets daily (UTC)'}</Text>
          </View>
        </>
      )}
      {/* Requests/day bar */}
      {m.requestsLimit ? (
        <View style={{ marginTop: 8 }}>
          <Bar pct={rPct} color={rPct >= 90 ? PINK : rPct >= 70 ? AMBER : BLUE} />
          <View style={styles.aiBarMeta}>
            <Text style={styles.aiBarMetaRight}>Requests</Text>
            <Text style={styles.aiBarMetaRight}>{m.calls.toLocaleString()} / {m.requestsLimit.toLocaleString()}/day</Text>
          </View>
        </View>
      ) : null}
      {/* Per-task breakdown */}
      <View style={{ marginTop: 12, gap: 6 }}>
        {m.tasks.map(t => (
          <View key={t.task} style={styles.aiTaskRow}>
            <Text style={styles.aiTaskLabel}>{t.label}</Text>
            <Text style={styles.aiTaskVal}>{t.tokens.toLocaleString()} tok · {t.calls}×{t.errors > 0 ? ` · ${t.errors}⚠` : ''}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD_BG, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800' },

  streakCard: { marginHorizontal: 16, padding: 18, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: BORDER, alignItems: 'center', gap: 4, marginBottom: 18 },
  streakLabel: { color: VIOLET, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  streakNum: { color: '#FFF', fontSize: 48, fontWeight: '900', lineHeight: 52 },
  streakSub: { color: MUTED, fontSize: 12 },

  rangePicker: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 14, backgroundColor: CARD_BG, borderRadius: 12, padding: 4, gap: 4 },
  rangeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  rangeBtnActive: { backgroundColor: '#1f1f24' },
  rangeBtnText: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  rangeBtnTextActive: { color: '#FFF' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 18 },
  kpi: { flex: 1, minWidth: '46%', backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14, gap: 6 },
  kpiIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { color: '#FFF', fontSize: 24, fontWeight: '800' },
  kpiLabel: { color: MUTED, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },

  section: { marginHorizontal: 16, marginBottom: 18 },
  sectionHeader: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14 },

  legend: { flexDirection: 'row', gap: 14, marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barCol: { alignItems: 'center', gap: 4, flex: 1 },
  barStack: { flexDirection: 'row', gap: 2, alignItems: 'flex-end' },
  bar: { borderRadius: 2 },
  barLabel: { color: '#555', fontSize: 9, fontWeight: '600', letterSpacing: 0.4 },

  splitBar: { flexDirection: 'row', borderRadius: 4, overflow: 'hidden', backgroundColor: '#1a1a1f' },
  splitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  splitLabel: { color: '#CCC', fontSize: 13 },
  splitValue: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  notifLabel: { color: '#AAA', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  notifTotal: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  notifChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  notifChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#1a1a1f', borderRadius: 8 },
  notifChipText: { color: '#CCC', fontSize: 11, fontWeight: '600' },
  notifRate: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#222', alignItems: 'center' },
  notifRateText: { color: VIOLET, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  rankRankNum: { color: '#555', fontSize: 12, fontWeight: '700', width: 18 },
  rankName: { flex: 1, color: '#DDD', fontSize: 13, fontWeight: '500' },
  rankCount: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  rankBarBg: { height: 4, backgroundColor: '#1a1a1f', borderRadius: 2, overflow: 'hidden', marginLeft: 28 },
  rankBarFill: { height: 4, borderRadius: 2 },

  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { color: '#888', fontSize: 14, fontWeight: '600' },
  emptySub: { color: MUTED, fontSize: 12, textAlign: 'center' },

  // AI engine dashboard
  aiMutedText: { color: MUTED, fontSize: 12 },
  aiFootnote: { color: '#444', fontSize: 10, lineHeight: 15 },
  aiModelCard: { backgroundColor: '#121218', borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14 },
  aiModelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  aiModelName: { color: '#FFF', fontSize: 13.5, fontWeight: '800' },
  aiModelRole: { color: VIOLET, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 },
  aiModelTokens: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  aiModelTokensSub: { color: MUTED, fontSize: 10 },
  aiBarBg: { height: 8, borderRadius: 4, backgroundColor: '#1A1A1A', overflow: 'hidden' },
  aiBarFill: { height: 8, borderRadius: 4 },
  aiBarMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  aiBarMetaStrong: { fontSize: 10.5, fontWeight: '700' },
  aiBarMetaRight: { color: MUTED, fontSize: 10.5 },
  aiTaskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  aiTaskLabel: { color: '#bbb', fontSize: 12 },
  aiTaskVal: { color: MUTED, fontSize: 11 },
});

// Re-export types used by importers (back-compat).
export type { UsageStats, DayData, AiBreakdown };
