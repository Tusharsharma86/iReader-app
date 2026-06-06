import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  THEME_FAMILIES, ALL_BREAKING_THEMES,
  loadBreakingThemeMutes, setBreakingThemeMuted,
} from '../utils/breakingThemes';

const VIOLET = '#b994ff';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';

export default function BreakingThemesScreen() {
  const navigation = useNavigation();
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadBreakingThemeMutes().then(setMuted).catch(() => {});
  }, []);

  const onToggle = useCallback(async (name: string) => {
    const next = new Set(muted);
    const willMute = !next.has(name);
    if (willMute) next.add(name); else next.delete(name);
    setMuted(next);
    await setBreakingThemeMuted(name, willMute);
  }, [muted]);

  const setAllInFamily = useCallback(async (themes: { name: string }[], mute: boolean) => {
    const next = new Set(muted);
    for (const t of themes) {
      if (mute) next.add(t.name); else next.delete(t.name);
    }
    setMuted(next);
    await Promise.all(themes.map(t => setBreakingThemeMuted(t.name, mute)));
  }, [muted]);

  const totalActive = ALL_BREAKING_THEMES.length - muted.size;
  const q = search.trim().toLowerCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Breaking Themes</Text>
          <Text style={styles.subtitle}>{totalActive} of {ALL_BREAKING_THEMES.length} themes on</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Mute any theme you don&apos;t want push notifications for.
          Off → no Breaking-news push when a story matches this theme. Feeds unchanged.
        </Text>

        {THEME_FAMILIES.map((family) => {
          const visible = q ? family.themes.filter(t => t.name.toLowerCase().includes(q)) : family.themes;
          if (visible.length === 0) return null;
          const onInFamily = family.themes.filter(t => !muted.has(t.name)).length;
          return (
            <View key={family.family} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name={family.icon as React.ComponentProps<typeof Ionicons>['name']} size={14} color={VIOLET} />
                <Text style={styles.sectionTitle}>{family.family.toUpperCase()}</Text>
                <Text style={styles.sectionCount}>{onInFamily}/{family.themes.length}</Text>
                <Pressable
                  onPress={() => setAllInFamily(family.themes, onInFamily > 0)}
                  hitSlop={6}
                  style={styles.bulkBtn}
                >
                  <Text style={styles.bulkBtnText}>{onInFamily > 0 ? 'Mute all' : 'Unmute all'}</Text>
                </Pressable>
              </View>
              <View style={styles.card}>
                {visible.map((t, i) => {
                  const isMuted = muted.has(t.name);
                  return (
                    <Pressable
                      key={t.name}
                      onPress={() => onToggle(t.name)}
                      style={[styles.row, i < visible.length - 1 && styles.rowBorder]}
                    >
                      <Text style={[styles.rowText, isMuted && styles.rowTextMuted]}>{t.name}</Text>
                      <Switch
                        value={!isMuted}
                        onValueChange={() => onToggle(t.name)}
                        trackColor={{ false: '#2A2A2A', true: VIOLET + '88' }}
                        thumbColor={!isMuted ? VIOLET : '#888'}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD_BG, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 2 },
  intro: { color: '#888', fontSize: 12, lineHeight: 17, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 18 },
  section: { marginBottom: 18, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginBottom: 8 },
  sectionTitle: { color: '#9a9aa5', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  sectionCount: { color: '#555', fontSize: 11, fontWeight: '600', marginLeft: 'auto' },
  bulkBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(185,148,255,0.12)', borderWidth: 1, borderColor: 'rgba(185,148,255,0.28)' },
  bulkBtnText: { color: VIOLET, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  card: { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1F1F22' },
  rowText: { flex: 1, color: '#DDD', fontSize: 14, fontWeight: '500' },
  rowTextMuted: { color: '#555' },
});
