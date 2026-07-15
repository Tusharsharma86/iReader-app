// Notification Settings — dedicated sub-screen owning every notif toggle.
// Mirrors the previous inline NOTIFICATIONS card from SettingsScreen with the
// addition that breaking-theme mutes apply to BOTH Main Breaking AND AI Feed
// Breaking pushes.
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings, BreakingSensitivity } from '../contexts/SettingsContext';
import {
  getCachedPushToken,
  registerForPush, requestNotificationPermission, updatePushPreferences,
} from '../utils/notifications';
import { INTEREST_TOPICS } from '../utils/interestTopics';
import { InlineTopicInterests, InlineFavorites } from './SettingsScreen';

const VIOLET = '#b994ff';
const BLUE = '#5a9bd9';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';

export default function NotificationSettingsScreen() {
  const navigation = useNavigation();
  const {
    notifBreaking, setNotifBreaking,
    notifAiFeed, setNotifAiFeed,
    breakingSensitivity, setBreakingSensitivity,
    notifTech, setNotifTech,
    notifDigest, setNotifDigest,
    favSources,
    topicInterests,
  } = useSettings();
  const [targetingOpen, setTargetingOpen] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  useEffect(() => { getCachedPushToken().then(setPushToken).catch(() => {}); }, []);

  const copyPairCode = useCallback(async () => {
    if (!pushToken) {
      Alert.alert('Pair code unavailable', 'Turn on at least one notification toggle first.');
      return;
    }
    // Use Share so the user can pick "Copy" or paste directly into the web
    // app. Avoids adding the expo-clipboard dependency.
    try {
      await Share.share({
        message: pushToken,
        title: 'iReader pair code',
      });
    } catch { /* user cancelled */ }
  }, [pushToken]);

  const starredKeywords = useMemo(() => {
    const starred = INTEREST_TOPICS.filter(t => (topicInterests[t.id] ?? 0) > 0);
    const pairs: string[] = [];
    const seen = new Set<string>();
    for (const t of starred) {
      const stars = Math.max(1, Math.min(5, topicInterests[t.id] ?? 0));
      for (const kw of t.keywords) {
        const key = kw.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push(`${kw}|${t.label}|${stars}`);
      }
    }
    return pairs.slice(0, 500);
  }, [topicInterests]);

  const handleNotifToggle = useCallback(async (
    value: boolean,
    setter: (v: boolean) => void,
    prefKey?: 'breaking' | 'topics' | 'digest' | 'aiFeed',
  ) => {
    const FALLBACK_KWS = ['tech', 'ai', 'apple', 'google', 'meta', 'openai', 'microsoft', 'amazon', 'startup', 'software', 'chip', 'iphone', 'android', 'app', 'cyber', 'crypto'];
    const kws = starredKeywords.length > 0 ? starredKeywords : FALLBACK_KWS;
    if (!value) {
      setter(false);
      if (prefKey === 'breaking') updatePushPreferences({ breakingEnabled: false });
      if (prefKey === 'aiFeed') updatePushPreferences({ aiFeedEnabled: false });
      if (prefKey === 'topics') updatePushPreferences({ topicsEnabled: false });
      if (prefKey === 'digest') updatePushPreferences({ digestEnabled: false, digestEveningEnabled: false });
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) return;
    setter(true);
    registerForPush().then(() => {
      if (prefKey === 'breaking') updatePushPreferences({ breakingEnabled: true });
      if (prefKey === 'aiFeed') updatePushPreferences({ aiFeedEnabled: true });
      if (prefKey === 'topics') updatePushPreferences({ topicsEnabled: true, topicsKeywords: kws });
      if (prefKey === 'digest') {
        const offsetMin = new Date().getTimezoneOffset();
        const toUTC = (h: number, m: number) => {
          const total = h * 60 + m + offsetMin;
          const norm = ((total % 1440) + 1440) % 1440;
          return { hour: Math.floor(norm / 60), minute: norm % 60 };
        };
        const morning = toUTC(8, 0);
        const evening = toUTC(18, 0);
        updatePushPreferences({
          digestEnabled: true,
          digestHour: morning.hour, digestMinute: morning.minute,
          digestEveningEnabled: true,
          digestEveningHour: evening.hour, digestEveningMinute: evening.minute,
        });
      }
    });
  }, [starredKeywords]);

  useEffect(() => {
    updatePushPreferences({ favSourcesEnabled: favSources.length > 0, favSources });
  }, [favSources]);

  useEffect(() => {
    if (notifTech && starredKeywords.length > 0) {
      updatePushPreferences({ topicsEnabled: true, topicsKeywords: starredKeywords });
    }
  }, [starredKeywords, notifTech]);

  const starredCount = Object.values(topicInterests).filter(v => v > 0).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Pushes, themes, digest, history</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* ── BREAKING ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>BREAKING</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Main Breaking</Text>
              <Text style={styles.rowSub}>3+ source confirmation</Text>
            </View>
            <Switch
              value={notifBreaking}
              onValueChange={v => handleNotifToggle(v, setNotifBreaking, 'breaking')}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={notifBreaking ? BLUE : '#444'} />
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>AI Feed Breaking</Text>
              <Text style={styles.rowSub}>Tap opens Deep Dive</Text>
            </View>
            <Switch
              value={notifAiFeed}
              onValueChange={v => handleNotifToggle(v, setNotifAiFeed, 'aiFeed')}
              trackColor={{ false: '#1A1A1A', true: '#3a2270' }}
              thumbColor={notifAiFeed ? VIOLET : '#444'} />
          </View>
          {/* Sensitivity picker */}
          <View style={[styles.row, styles.rowBorder, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
            <Text style={[styles.rowLabel, { fontSize: 13 }]}>Sensitivity</Text>
            <View style={{ flexDirection: 'row', gap: 6, width: '100%' }}>
              {([
                { key: 'all' as BreakingSensitivity, label: 'All', desc: 'Every breaking story' },
                { key: 'important' as BreakingSensitivity, label: 'Important', desc: '2+ sources confirming' },
                { key: 'critical' as BreakingSensitivity, label: 'Critical', desc: '3+ sources confirming' },
                { key: 'super-critical' as BreakingSensitivity, label: 'Super Critical', desc: '6+ sources within 30 min' },
              ]).map(opt => {
                const active = breakingSensitivity === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      setBreakingSensitivity(opt.key);
                      // Was local-only — the backend never learned which
                      // level the user picked, so every level behaved
                      // identically (always the server's hardcoded 3+
                      // bar). Sync it so it actually changes what fires.
                      updatePushPreferences({ breakingSensitivity: opt.key });
                    }}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 8,
                      backgroundColor: active ? '#1C3A6A' : '#1A1A1A',
                      alignItems: 'center',
                    }}>
                    <Text style={{ color: active ? '#FFF' : '#888', fontSize: 12, fontWeight: '700' }}>{opt.label}</Text>
                    <Text style={{ color: active ? '#AAC' : '#555', fontSize: 9, marginTop: 2 }}>{opt.desc}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {/* Theme mutes — apply to BOTH Main + AI Feed breaking. */}
          <TouchableOpacity
            style={[styles.row, styles.rowBorder, styles.nestedRow]}
            onPress={() => (navigation as { navigate: (route: string) => void }).navigate('BreakingThemes')}>
            <View style={styles.rowTextCol}>
              <Text style={styles.nestedLabel}>Themes</Text>
              <Text style={styles.rowSub}>Mute themes — applies to Main + AI Feed</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </TouchableOpacity>
        </View>

        {/* ── TOPIC ALERTS ───────────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>TOPIC ALERTS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Topic Alerts</Text>
              <Text style={styles.rowSub}>
                {starredCount > 0 ? `${starredCount} topics starred · ${favSources.length} fav sources` : 'Alerts for topics you star'}
              </Text>
            </View>
            <Switch
              value={notifTech}
              onValueChange={v => handleNotifToggle(v, setNotifTech, 'topics')}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={notifTech ? BLUE : '#444'} />
          </View>
          <Pressable
            onPress={() => setTargetingOpen(o => !o)}
            style={[styles.row, styles.rowBorder, styles.nestedRow]}>
            <View style={styles.rowTextCol}>
              <Text style={styles.nestedLabel}>Topics & Sources</Text>
              <Text style={styles.rowSub}>Choose what triggers your alerts</Text>
            </View>
            <Ionicons
              name="chevron-forward" size={16} color="#666"
              style={{ transform: [{ rotate: targetingOpen ? '90deg' : '0deg' }] }} />
          </Pressable>
          {targetingOpen && (
            <View style={styles.nestedBody}>
              <Text style={styles.nestedHeader}>TOPIC INTERESTS</Text>
              <Text style={styles.nestedHint}>Star 1-5 — higher = higher alert priority + feed weight.</Text>
              <InlineTopicInterests />
              <View style={{ height: 18 }} />
              <Text style={styles.nestedHeader}>FAVORITE SOURCES</Text>
              <Text style={styles.nestedHint}>Optional — limit topic alerts to chosen publications.</Text>
              <InlineFavorites />
            </View>
          )}
        </View>

        {/* ── DAILY DIGEST ───────────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>DAILY DIGEST</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Daily Digest</Text>
              <Text style={styles.rowSub}>8am + 6pm summary</Text>
            </View>
            <Switch
              value={notifDigest}
              onValueChange={v => handleNotifToggle(v, setNotifDigest, 'digest')}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={notifDigest ? BLUE : '#444'} />
          </View>
        </View>

        {/* ── HISTORY ────────────────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>HISTORY</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => (navigation as { navigate: (route: string) => void }).navigate('NotifHistory')}>
            <View style={styles.collapsibleIcon}>
              <Ionicons name="time-outline" size={16} color={VIOLET} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Notification History</Text>
              <Text style={styles.rowSub}>Past pushes — tap to reopen</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1F1F22' }]}
            onPress={copyPairCode}>
            <View style={styles.collapsibleIcon}>
              <Ionicons name="link" size={16} color={VIOLET} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Pair Code (for web)</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {pushToken ? `${pushToken.slice(0, 18)}…  · tap to copy` : 'Enable notifs first'}
              </Text>
            </View>
            <Ionicons name="copy-outline" size={18} color={pushToken ? VIOLET : '#444'} />
          </TouchableOpacity>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1F1F22' },
  rowTextCol: { flex: 1 },
  rowLabel: { color: '#EEE', fontSize: 14, fontWeight: '600' },
  rowSub: { color: '#666', fontSize: 11.5, marginTop: 2, lineHeight: 15 },
  nestedRow: { paddingLeft: 28 },
  nestedLabel: { color: '#CCC', fontSize: 13, fontWeight: '500' },
  nestedBody: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18, backgroundColor: '#0A0A0A' },
  nestedHeader: { color: '#666', fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  nestedHint: { color: '#555', fontSize: 11.5, lineHeight: 16, marginBottom: 8 },
  collapsibleIcon: { width: 24, alignItems: 'center' },
});
