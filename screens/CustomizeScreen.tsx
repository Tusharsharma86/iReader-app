// Android Customize sub-screen — mirror of web/src/screens/CustomizeScreen.tsx
// with React Native primitives. Same 18 settings, persisted via SettingsContext.
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useSettings,
  type CardDensity, type ArticleTab, type SummaryLength,
  type KeyPointsCount, type Eli5Tone, type DeepDiveDepth, type TimeFormat,
} from '../contexts/SettingsContext';

const VIOLET = '#b994ff';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';

interface SegmentedOption<T> { label: string; value: T; }

function Segmented<T extends string | number>({ options, value, onChange }: {
  options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)}
            style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RowToggle({ label, sub, value, onChange, border }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; border?: boolean;
}) {
  return (
    <View style={[styles.row, border && styles.rowBorder]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange}
        trackColor={{ false: '#1A1A1A', true: 'rgba(185,148,255,0.32)' }}
        thumbColor={value ? VIOLET : '#666'} />
    </View>
  );
}

function RowSegmented<T extends string | number>({ label, sub, options, value, onChange, border }: {
  label: string; sub?: string; options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; border?: boolean;
}) {
  return (
    <View style={[{ paddingHorizontal: 16, paddingVertical: 14 }, border && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      <Segmented options={options} value={value} onChange={onChange} />
    </View>
  );
}

const DENSITY: SegmentedOption<CardDensity>[] = [
  { label: 'Compact', value: 'compact' },
  { label: 'Comfortable', value: 'comfortable' },
  { label: 'Spacious', value: 'spacious' },
];
const TABS: SegmentedOption<ArticleTab>[] = [
  { label: 'Full', value: 'Long Form' },
  { label: 'Summary', value: 'Summary' },
  { label: '5 Ws', value: '5 Ws' },
  { label: 'ELI5', value: 'ELI5' },
];
const SUMMARY_LEN: SegmentedOption<SummaryLength>[] = [
  { label: 'Short', value: 'short' },
  { label: 'Medium', value: 'medium' },
  { label: 'Long', value: 'long' },
];
const KP_COUNT: SegmentedOption<KeyPointsCount>[] = [
  { label: '3', value: 3 }, { label: '5', value: 5 }, { label: '7', value: 7 },
];
const ELI5: SegmentedOption<Eli5Tone>[] = [
  { label: 'Kid', value: 'kid' }, { label: 'Casual', value: 'casual' }, { label: 'Plain', value: 'plain' },
];
const DEPTH: SegmentedOption<DeepDiveDepth>[] = [
  { label: 'Quick', value: 'quick' }, { label: 'Standard', value: 'standard' }, { label: 'Deep', value: 'deep' },
];
const TIME_FMT: SegmentedOption<TimeFormat>[] = [
  { label: 'Relative', value: 'relative' }, { label: 'Absolute', value: 'absolute' },
];

export default function CustomizeScreen() {
  const navigation = useNavigation();
  const s = useSettings();

  const clearCaches = useCallback(async () => {
    Alert.alert('Clear all caches?', 'Removes cached feed, AI summaries, deep dives, scroll positions. Saved articles are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        try {
          const keys = await AsyncStorage.getAllKeys();
          const keep = new Set(['@ireader_settings', '@ireader_saved', '@ireader_push_token', '@breaking_theme_mutes_v1', '@notif_history_v1']);
          const toDelete = keys.filter(k =>
            !keep.has(k) && (
              // Actual key formats: '@ireader_cache_summary_v5_…' (utils/cache.ts
              // AS_PREFIX) and '@feed_v3_<topic>' (utils/feedCache.ts). The old
              // 'summary_' / '@feed_cache_' prefixes matched nothing.
              k.startsWith('@ireader_cache_') || k.startsWith('@feed_v3_') || k.startsWith('@aifeed_cache') ||
              k.startsWith('@aifeed_prefetch') ||
              k.startsWith('@deepdive_') || k.startsWith('@ireader_scroll_') || k.startsWith('@ireader_active_topic')
            )
          );
          if (toDelete.length) await AsyncStorage.multiRemove(toDelete);
          Alert.alert('Done', `Cleared ${toDelete.length} cache entries.`);
        } catch (e) {
          Alert.alert('Failed', String(e instanceof Error ? e.message : e));
        }
      } },
    ]);
  }, []);

  const resetAll = useCallback(() => {
    Alert.alert('Reset Customize?', 'Restore all Customize options to defaults.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => s.resetCustomize() },
    ]);
  }, [s]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Customize</Text>
          <Text style={styles.subtitle}>UI tweaks · defaults · density</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* FEED */}
        <Text style={styles.sectionHeader}>FEED</Text>
        <View style={styles.card}>
          <RowToggle label="Cluster summary" sub="Show the AI summary text under cluster headlines."
            value={s.showClusterSummary} onChange={s.setShowClusterSummary} />
          <RowToggle border label="Bias dots" sub="Show the source-bias colour dot on cards."
            value={s.showBiasDots} onChange={s.setShowBiasDots} />
          <RowToggle border label="Meta pill" sub="Show TREND/BREAKING/N stories pill."
            value={s.showMetaPill} onChange={s.setShowMetaPill} />
          <RowToggle border label="Card images" sub="Hide for a text-only feed."
            value={s.showCardImages} onChange={s.setShowCardImages} />
          <RowSegmented border label="Card density" sub="Vertical spacing between cards."
            options={DENSITY} value={s.cardDensity} onChange={s.setCardDensity} />
          <RowSegmented border label="Time format" sub="Relative (2h ago) vs absolute (10:42 AM)."
            options={TIME_FMT} value={s.timeFormat} onChange={s.setTimeFormat} />
        </View>

        {/* ARTICLE */}
        <Text style={styles.sectionHeader}>ARTICLE READER</Text>
        <View style={styles.card}>
          <RowSegmented label="Default tab" sub="Which tab opens first when you tap an article."
            options={TABS} value={s.defaultArticleTab} onChange={s.setDefaultArticleTab} />
          <RowToggle border label="Stats card" sub="ORIGINAL → DISTILLED card at the bottom."
            value={s.showStatsCard} onChange={s.setShowStatsCard} />
          <RowToggle border label="Verify Dedup button"
            value={s.showVerifyDedup} onChange={s.setShowVerifyDedup} />
          <RowToggle border label="Referenced sources" sub="Related-articles list below the body."
            value={s.showReferencedSources} onChange={s.setShowReferencedSources} />
          <RowToggle border label="Entity highlights" sub="Bold people/companies in article body."
            value={s.showEntityHighlights} onChange={s.setShowEntityHighlights} />
          <RowToggle border label="Reading difficulty" sub="Show the Hard/Medium/Easy pill."
            value={s.showReadingDifficulty} onChange={s.setShowReadingDifficulty} />
          <RowToggle border label="Quote highlights" sub="Highlight quoted passages in article body."
            value={s.showQuoteHighlights} onChange={s.setShowQuoteHighlights} />
        </View>

        {/* BEHAVIOR */}
        <Text style={styles.sectionHeader}>BEHAVIOR</Text>
        <View style={styles.card}>
          <RowToggle label="Auto mark-as-read" sub="Stories scrolled past 80% are marked read automatically."
            value={s.autoMarkRead} onChange={s.setAutoMarkRead} />
        </View>

        {/* AI */}
        <Text style={styles.sectionHeader}>AI SUMMARIES</Text>
        <View style={styles.card}>
          <RowSegmented label="Summary length" sub="Word count target for narrative."
            options={SUMMARY_LEN} value={s.summaryLength} onChange={s.setSummaryLength} />
          <RowSegmented border label="Key points count" sub="Bullets requested from the model."
            options={KP_COUNT} value={s.keyPointsCount} onChange={s.setKeyPointsCount} />
          <RowToggle border label="Show KEY POINTS footer"
            value={s.showKeyPoints} onChange={s.setShowKeyPoints} />
          <RowSegmented border label="ELI5 tone"
            options={ELI5} value={s.eli5Tone} onChange={s.setEli5Tone} />
          <RowSegmented border label="Deep Dive depth"
            options={DEPTH} value={s.deepDiveDepth} onChange={s.setDeepDiveDepth} />
          <RowToggle border label="Deep Dive: Entities" value={s.showDeepDiveEntities} onChange={s.setShowDeepDiveEntities} />
          <RowToggle border label="Deep Dive: Curious Cats" value={s.showDeepDiveCurious} onChange={s.setShowDeepDiveCurious} />
        </View>

        {/* DATA */}
        <Text style={styles.sectionHeader}>DATA</Text>
        <View style={styles.card}>
          <Pressable onPress={clearCaches} style={styles.row}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.rowLabel}>Clear all caches</Text>
              <Text style={styles.rowSub}>Removes feed, AI, deep dive, scroll. Saved kept.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </Pressable>
          <Pressable onPress={resetAll} style={[styles.row, styles.rowBorder]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.rowLabel, { color: '#FF6B6B' }]}>Reset Customize</Text>
              <Text style={styles.rowSub}>Restore all options to defaults.</Text>
            </View>
            <Ionicons name="refresh" size={18} color="#FF6B6B" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD_BG, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 2 },
  sectionHeader: { color: '#444', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  card: { backgroundColor: CARD_BG, marginHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1F1F22' },
  rowLabel: { color: '#EEE', fontSize: 15, fontWeight: '600' },
  rowSub: { color: '#666', fontSize: 12, marginTop: 2, lineHeight: 16 },
  segmented: { flexDirection: 'row', backgroundColor: '#0A0A0A', borderRadius: 10, padding: 3, gap: 2, marginTop: 10, borderWidth: 1, borderColor: '#1A1A1A' },
  segmentBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: VIOLET },
  segmentText: { color: '#888', fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 },
  segmentTextActive: { color: '#000' },
});
