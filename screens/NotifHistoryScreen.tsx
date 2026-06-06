import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  loadNotifHistory, clearNotifHistory, subscribeNotifHistory,
  groupByDay, syncNotifHistoryFromBackend,
  type NotifHistoryEntry, type NotifKind,
} from '../utils/notifHistory';
import { getCachedPushToken } from '../utils/notifications';

const VIOLET = '#b994ff';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';

const KIND_META: Record<NotifKind, { label: string; color: string }> = {
  breaking: { label: 'BREAKING', color: '#FF5555' },
  source:   { label: 'SOURCE',   color: '#4A90D9' },
  topic:    { label: 'TOPIC',    color: VIOLET },
  aiFeed:   { label: 'AI FEED',  color: '#F5A623' },
  digest:   { label: 'DIGEST',   color: '#888' },
  streak:   { label: 'STREAK',   color: '#5ac890' },
};

function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function NotifHistoryScreen() {
  // The "Article" route is registered in FeedStack. NotifHistory lives in
  // SettingsStack — we hop to the parent tab navigator and target Feed.
  const navigation = useNavigation();
  const [entries, setEntries] = useState<NotifHistoryEntry[]>([]);

  const reload = useCallback(() => {
    loadNotifHistory().then(setEntries).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const unsub = subscribeNotifHistory(reload);
    return () => { unsub(); };
  }, [reload]);

  // On focus: pull backend log via the device's push token and merge into
  // local history. Catches notifs that arrived while the app was killed
  // (Expo's receivedListener doesn't fire in that state).
  useFocusEffect(useCallback(() => {
    reload();
    getCachedPushToken().then(tk => {
      if (!tk) return;
      syncNotifHistoryFromBackend(tk).then(added => {
        if (added > 0) reload();
      }).catch(() => {});
    }).catch(() => {});
  }, [reload]));

  const sections = groupByDay(entries);

  const openEntry = (e: NotifHistoryEntry) => {
    // Hop from SettingsStack → Feed tab → FeedStack.Article.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parent = (navigation as any).getParent?.();
    if (!parent) return;
    parent.navigate('Feed', {
      screen: 'Article',
      params: {
        id: e.id,
        url: e.url ?? '',
        image: e.imageUrl ?? '',
        headline: e.headline,
        summary: e.summary ?? '',
        source: e.source ?? '',
        publishedAt: e.publishedAt ?? new Date(e.firedAt).toISOString(),
        dominantColor: e.dominantColor ?? '#222',
        sources: JSON.stringify(e.url ? [{ name: e.source ?? '', url: e.url, publishedAt: e.publishedAt ?? '' }] : []),
        allStories: '[]',
      },
    } as never);
  };

  const onClear = () => {
    Alert.alert('Clear history?', 'This removes the local notification log. Your live feeds are unaffected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearNotifHistory().then(reload) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>{entries.length} entries · tap to reopen</Text>
        </View>
        {entries.length > 0 && (
          <Pressable onPress={onClear} hitSlop={10} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={40} color="#333" />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>Anything we push will land here so you can revisit it later — even weeks back.</Text>
          </View>
        ) : sections.map(sec => (
          <View key={sec.label} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.label.toUpperCase()}</Text>
            <View style={styles.card}>
              {sec.entries.map((e, i) => {
                const meta = KIND_META[e.kind] ?? KIND_META.breaking;
                return (
                  <Pressable
                    key={`${e.id}-${e.firedAt}`}
                    onPress={() => openEntry(e)}
                    style={[styles.row, i < sec.entries.length - 1 && styles.rowBorder]}
                  >
                    {e.imageUrl ? (
                      <Image source={{ uri: e.imageUrl }} style={styles.thumb} contentFit="cover" />
                    ) : (
                      <View style={[styles.thumb, { backgroundColor: e.dominantColor ?? '#222', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="newspaper-outline" size={18} color="rgba(255,255,255,0.4)" />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={styles.metaRow}>
                        <Text style={[styles.kindPill, { color: meta.color }]}>{meta.label}</Text>
                        <Text style={styles.dot}>·</Text>
                        <Text style={styles.time}>{timeOfDay(e.firedAt)}</Text>
                        {e.source ? (
                          <>
                            <Text style={styles.dot}>·</Text>
                            <Text style={styles.source} numberOfLines={1}>{e.source}</Text>
                          </>
                        ) : null}
                      </View>
                      <Text style={styles.headline} numberOfLines={3}>{e.headline}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
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
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#2A2A2A' },
  clearBtnText: { color: '#999', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyTitle: { color: '#CCC', fontSize: 16, fontWeight: '700' },
  emptyBody: { color: '#666', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  section: { marginBottom: 16, paddingHorizontal: 16 },
  sectionTitle: { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 4 },
  card: { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1F1F22' },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  kindPill: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  dot: { color: '#333', fontSize: 9 },
  time: { color: '#666', fontSize: 11, fontWeight: '500' },
  source: { color: '#555', fontSize: 11, maxWidth: 100 },
  headline: { color: '#DDD', fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
});
