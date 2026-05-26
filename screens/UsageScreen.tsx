import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getUsageStats, UsageStats, DayData } from '../utils/usageTracker';

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

const BLUE = '#4A90D9';
const PURPLE = '#8B5CF6';
const GREEN = '#34D399';
const AMBER = '#F59E0B';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';

// ── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ days }: { days: DayData[] }) {
  const maxA = Math.max(...days.map(d => d.articles), 1);
  const maxAi = Math.max(...days.map(d => d.aiTotal), 1);
  const maxVal = Math.max(maxA, maxAi);
  const BAR_H = 96;

  return (
    <View>
      {/* Legend */}
      <View style={chart.legend}>
        <View style={chart.legendItem}>
          <View style={[chart.dot, { backgroundColor: BLUE }]} />
          <Text style={chart.legendLabel}>Articles</Text>
        </View>
        <View style={chart.legendItem}>
          <View style={[chart.dot, { backgroundColor: PURPLE }]} />
          <Text style={chart.legendLabel}>AI uses</Text>
        </View>
      </View>

      {/* Bars */}
      <View style={[chart.barsRow, { height: BAR_H + 4 }]}>
        {days.map((d, i) => (
          <View key={i} style={chart.dayCol}>
            <View style={chart.barPair}>
              <View style={[
                chart.bar,
                { height: Math.max(3, (d.articles / maxVal) * BAR_H), backgroundColor: d.articles > 0 ? BLUE : BORDER },
              ]} />
              <View style={[
                chart.bar,
                { height: Math.max(3, (d.aiTotal / maxVal) * BAR_H), backgroundColor: d.aiTotal > 0 ? PURPLE : BORDER },
              ]} />
            </View>
          </View>
        ))}
      </View>

      {/* Day labels */}
      <View style={chart.labelsRow}>
        {days.map((d, i) => (
          <View key={i} style={chart.dayCol}>
            <Text style={chart.dayLabel}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const chart = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16, marginBottom: 12, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: '#666', fontSize: 11, fontWeight: '600' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 4 },
  dayCol: { flex: 1, alignItems: 'center' },
  barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 9, borderRadius: 3 },
  labelsRow: { flexDirection: 'row', marginTop: 8, paddingHorizontal: 4 },
  dayLabel: { color: '#555', fontSize: 10, fontWeight: '600' },
});

// ── AI breakdown bar ─────────────────────────────────────────────────────────

function AiBreakdownRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? value / total : 0;
  return (
    <View style={ab.row}>
      <Text style={ab.label}>{label}</Text>
      <View style={ab.track}>
        <View style={[ab.fill, { width: `${Math.max(pct * 100, value > 0 ? 4 : 0)}%`, backgroundColor: color }]} />
      </View>
      <Text style={ab.count}>{value}</Text>
    </View>
  );
}

const ab = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  label: { color: '#888', fontSize: 13, width: 60 },
  track: { flex: 1, height: 6, backgroundColor: '#1A1A1A', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  count: { color: '#666', fontSize: 13, width: 32, textAlign: 'right' },
});

// ── Source bar ────────────────────────────────────────────────────────────────

function SourceRow({ name, count, max }: { name: string; count: number; max: number }) {
  const pct = max > 0 ? count / max : 0;
  return (
    <View style={sr.row}>
      <Text style={sr.name} numberOfLines={1}>{name}</Text>
      <View style={sr.track}>
        <View style={[sr.fill, { width: `${Math.max(pct * 100, 4)}%` }]} />
      </View>
      <Text style={sr.count}>{count}</Text>
    </View>
  );
}

const sr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  name: { color: '#DDD', fontSize: 13, width: 110 },
  track: { flex: 1, height: 5, backgroundColor: '#1A1A1A', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: BLUE },
  count: { color: '#666', fontSize: 13, width: 28, textAlign: 'right' },
});

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ value, label, color, small }: { value: string; label: string; color: string; small?: boolean }) {
  return (
    <View style={[tile.box, { borderColor: color + '33' }]}>
      <Text style={[tile.value, { color, fontSize: small ? 20 : 24 }]}>{value}</Text>
      <Text style={tile.label}>{label}</Text>
    </View>
  );
}

const tile = StyleSheet.create({
  box: {
    flex: 1, backgroundColor: CARD_BG, borderRadius: 12,
    borderWidth: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center',
  },
  value: { fontWeight: '800', letterSpacing: -0.5 },
  label: { color: '#555', fontSize: 10, fontWeight: '600', marginTop: 4, textAlign: 'center' },
});

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: '#DDD', fontSize: 14, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: '#555', fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Main screen ───────────────────────────────────────────────────────────────

type Range = 'mtd' | '7d' | '30d';

export default function UsageScreen() {
  const navigation = useNavigation();
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [range, setRange] = useState<Range>('mtd');
  const [serverUsage, setServerUsage] = useState<ServerUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    getUsageStats().then(setStats);
  }, []);

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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#DDD" />
        </Pressable>
        <Text style={styles.title}>My Stats</Text>
      </View>

      {!stats ? (
        <View style={styles.loading}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

          {/* ── ACTUAL ANTHROPIC COST (server-side aggregate) ── */}
          <View style={styles.costHeaderRow}>
            <Text style={styles.sectionHeader}>ACTUAL CLAUDE COST</Text>
            <View style={styles.rangeTabs}>
              {(['mtd','7d','30d'] as Range[]).map(r => (
                <Pressable key={r} onPress={() => setRange(r)}
                  style={[styles.rangeTab, range === r && styles.rangeTabActive]}>
                  <Text style={[styles.rangeTabLabel, range === r && styles.rangeTabLabelActive]}>
                    {r === 'mtd' ? 'MONTH' : r.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.card}>
            {usageLoading ? (
              <ActivityIndicator color={GREEN} style={{ paddingVertical: 16 }} />
            ) : usageError ? (
              <Text style={styles.empty}>Could not load cost: {usageError}</Text>
            ) : !serverUsage ? (
              <Text style={styles.empty}>No data.</Text>
            ) : (
              <>
                <View style={styles.bigCostRow}>
                  <Text style={styles.bigCostValue}>${serverUsage.totals.cost.toFixed(2)}</Text>
                  <View>
                    <Text style={styles.bigCostLabel}>{serverUsage.totals.calls} calls</Text>
                    <Text style={styles.bigCostSub}>
                      {serverUsage.range.start} → {serverUsage.range.end}
                    </Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.miniGrid}>
                  <MiniStat label="INPUT TOK" value={fmtTokens(serverUsage.totals.inputTokens)} />
                  <MiniStat label="OUTPUT TOK" value={fmtTokens(serverUsage.totals.outputTokens)} />
                  <MiniStat label="CACHE READ" value={fmtTokens(serverUsage.totals.cacheReadTokens)} />
                </View>
                {Object.keys(serverUsage.byModel).length > 0 && (
                  <>
                    <View style={styles.divider} />
                    {Object.entries(serverUsage.byModel)
                      .sort((a, b) => b[1].cost - a[1].cost)
                      .slice(0, 3)
                      .map(([model, v]) => (
                        <View key={model} style={styles.modelRow}>
                          <Text style={styles.modelName} numberOfLines={1}>
                            {model.replace(/^claude-/, '').replace(/-\d{8}$/, '')}
                          </Text>
                          <Text style={styles.modelCost}>${v.cost.toFixed(2)}</Text>
                          <Text style={styles.modelCalls}>{v.calls}</Text>
                        </View>
                      ))}
                  </>
                )}
              </>
            )}
          </View>

          {/* Open Anthropic dashboard inside the app (in-app WebView) */}
          <Pressable
            onPress={() => (navigation as any).navigate('CostDashboard')}
            style={styles.linkRow}
          >
            <Ionicons name="bar-chart-outline" size={16} color={BLUE} />
            <Text style={styles.linkText}>Anthropic Cost Dashboard</Text>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </Pressable>

          {/* ── TODAY ── */}
          <SectionHeader title="TODAY" />
          <View style={styles.tilesRow}>
            <StatTile value={String(stats.today.articles)} label="Articles" color={BLUE} />
            <StatTile value={String(stats.today.ai.total)} label="AI Uses" color={PURPLE} />
            <StatTile value={fmt$(stats.today.ai.total * stats.costPerAiCall)} label="Est. Cost" color={GREEN} small />
          </View>

          {/* ── LAST 7 DAYS CHART ── */}
          <SectionHeader title="LAST 7 DAYS" />
          <View style={styles.card}>
            <BarChart days={stats.last7Days} />
          </View>

          {/* ── THIS WEEK ── */}
          <SectionHeader title="THIS WEEK" />
          <View style={styles.tilesRow}>
            <StatTile value={String(stats.week.articles)} label="Articles" color={BLUE} />
            <StatTile value={String(stats.week.ai.total)} label="AI Uses" color={PURPLE} />
            <StatTile value={fmt$(stats.week.ai.total * stats.costPerAiCall)} label="Est. Cost" color={GREEN} small />
          </View>

          {/* ── THIS MONTH ── */}
          <SectionHeader title="THIS MONTH" />
          <View style={styles.tilesRow}>
            <StatTile value={String(stats.month.articles)} label="Articles" color={BLUE} />
            <StatTile value={String(stats.month.ai.total)} label="AI Uses" color={PURPLE} />
            <StatTile value={fmt$(stats.month.ai.total * stats.costPerAiCall)} label="Est. Cost" color={GREEN} small />
          </View>

          {/* ── AI USAGE BREAKDOWN ── */}
          <SectionHeader title="AI USAGE BREAKDOWN" />
          <View style={styles.card}>
            {stats.allTime.ai.total === 0 ? (
              <Text style={styles.empty}>No AI features used yet.</Text>
            ) : (
              <>
                <AiBreakdownRow label="Summary" value={stats.allTime.ai.summary} total={stats.allTime.ai.total} color={PURPLE} />
                <View style={styles.divider} />
                <AiBreakdownRow label="5 Ws" value={stats.allTime.ai.fiveWs} total={stats.allTime.ai.total} color={AMBER} />
                <View style={styles.divider} />
                <AiBreakdownRow label="ELI5" value={stats.allTime.ai.eli5} total={stats.allTime.ai.total} color={GREEN} />
              </>
            )}
          </View>

          {/* ── READING MOST ── */}
          <SectionHeader title="READING MOST" />
          <View style={styles.card}>
            {stats.topSources.length === 0 ? (
              <Text style={styles.empty}>Start reading to see your top sources.</Text>
            ) : (
              stats.topSources.map((src, i) => (
                <React.Fragment key={src.name}>
                  {i > 0 && <View style={styles.divider} />}
                  <SourceRow name={src.name} count={src.count} max={stats.topSources[0].count} />
                </React.Fragment>
              ))
            )}
          </View>

          {/* ── ALL TIME ── */}
          <SectionHeader title="ALL TIME" />
          <View style={styles.tilesRow}>
            <StatTile value={String(stats.allTime.articles)} label="Articles Read" color={BLUE} />
            <StatTile value={String(stats.allTime.ai.total)} label="AI Requests" color={PURPLE} />
            <StatTile value={fmt$(stats.allTime.ai.total * stats.costPerAiCall)} label="Total Est." color={AMBER} small />
          </View>

          {/* cost note */}
          <Text style={styles.costNote}>
            Est. cost ~$0.016–0.018 per AI request (Claude Sonnet: ~3k input + ~500 output tokens).
          </Text>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#FFF', fontSize: 24, fontWeight: '800' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: {
    color: '#444', fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
    paddingHorizontal: 20, paddingBottom: 10, paddingTop: 4,
  },
  tilesRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 24 },
  card: {
    marginHorizontal: 16, backgroundColor: CARD_BG,
    borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 24,
  },
  divider: { height: 1, backgroundColor: BORDER },
  empty: { color: '#444', fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  costNote: {
    color: '#333', fontSize: 11, textAlign: 'center',
    marginHorizontal: 24, marginTop: -12, lineHeight: 16,
  },
  costHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10,
  },
  rangeTabs: {
    flexDirection: 'row', gap: 4,
    backgroundColor: CARD_BG, borderRadius: 999,
    borderWidth: 1, borderColor: BORDER, padding: 3,
  },
  rangeTab: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  rangeTabActive: { backgroundColor: GREEN + '22' },
  rangeTabLabel: { color: '#555', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  rangeTabLabelActive: { color: GREEN },
  bigCostRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 6 },
  bigCostValue: { color: GREEN, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  bigCostLabel: { color: '#DDD', fontSize: 14, fontWeight: '700' },
  bigCostSub: { color: '#555', fontSize: 10, fontWeight: '600', letterSpacing: 0.4, marginTop: 2 },
  miniGrid: { flexDirection: 'row', paddingVertical: 12 },
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, gap: 12,
  },
  modelName: { flex: 1, color: '#BBB', fontSize: 12, fontWeight: '600' },
  modelCost: { color: GREEN, fontSize: 13, fontWeight: '700' },
  modelCalls: { color: '#555', fontSize: 11, width: 36, textAlign: 'right' },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 24,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
  },
  linkText: { flex: 1, color: BLUE, fontSize: 13, fontWeight: '700' },
});
