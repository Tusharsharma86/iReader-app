import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from '../contexts/SettingsContext';
import { SOURCE_CATEGORIES } from '../contexts/SourceContext';

const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':        'techcrunch.com',
  'The Verge':         'theverge.com',
  'Ars Technica':      'arstechnica.com',
  'Wired':             'wired.com',
  'Hacker News':       'news.ycombinator.com',
  '9to5Mac':           '9to5mac.com',
  '9to5Google':        '9to5google.com',
  'MIT Tech Review':   'technologyreview.com',
  'Engadget':          'engadget.com',
  'VentureBeat':       'venturebeat.com',
  'The Next Web':      'thenextweb.com',
  'BBC World':         'bbc.co.uk',
  'NYT World':         'nytimes.com',
  'The Guardian':      'theguardian.com',
  'NPR World':         'npr.org',
  'Al Jazeera':        'aljazeera.com',
  'NDTV':              'ndtv.com',
  'India Today':       'indiatoday.in',
  'The Print':         'theprint.in',
  'The Quint':         'thequint.com',
  'CNBC TV18':         'cnbctv18.com',
  'Scroll.in':         'scroll.in',
  'Economic Times':    'economictimes.indiatimes.com',
  'Livemint':          'livemint.com',
  'Mint':              'livemint.com',
  'Inc42':             'inc42.com',
  'Financial Express': 'financialexpress.com',
};

const TOPIC_ITEMS = [
  { key: 'technology',     label: 'Technology',    icon: '💻' },
  { key: 'india-politics', label: 'India',         icon: '🇮🇳' },
  { key: 'geopolitics',    label: 'World',         icon: '🌍' },
  { key: 'markets',        label: 'Markets',       icon: '📈' },
  { key: 'business',       label: 'Business',      icon: '💼' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'India':      '#FF9500',
  'World':      '#4ECDC4',
  'Markets':    '#22C55E',
  'Business':   '#A29BFE',
  'Technology': '#4A90D9',
};

function faviconUrl(name: string): string {
  const domain = SOURCE_DOMAINS[name] ?? 'google.com';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

export default function FavSourcesScreen() {
  const navigation = useNavigation();
  const { favSources, toggleFavSource, favTopics, toggleFavTopic } = useSettings();

  const totalSelected = favSources.length + favTopics.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Notify me about</Text>
          {totalSelected > 0 && (
            <Text style={styles.subtitle}>{totalSelected} selected</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.hint}>
          Get notified when new stories arrive from your chosen topics or sources.
        </Text>

        {/* ── Topics ─────────────────────────── */}
        <Text style={styles.sectionLabel}>TOPICS</Text>
        <View style={styles.card}>
          {TOPIC_ITEMS.map((item, i) => {
            const active = favTopics.includes(item.key);
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.row, i > 0 && styles.rowBorder]}
                onPress={() => toggleFavTopic(item.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.topicIcon}>{item.icon}</Text>
                <Text style={[styles.rowLabel, !active && styles.rowLabelOff]}>{item.label}</Text>
                <View style={[styles.bell, active && styles.bellActive]}>
                  <Ionicons
                    name={active ? 'notifications' : 'notifications-outline'}
                    size={18}
                    color={active ? '#FFFFFF' : '#444'}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Sources ────────────────────────── */}
        <Text style={styles.sectionLabel}>SOURCES</Text>
        {SOURCE_CATEGORIES.map(cat => {
          const accentColor = CATEGORY_COLORS[cat.label] ?? '#4A90D9';
          return (
            <View key={cat.label} style={styles.card}>
              <View style={styles.catHeader}>
                <Text style={[styles.catLabel, { color: accentColor }]}>{cat.label}</Text>
              </View>
              {cat.sources.map((src, i) => {
                const active = favSources.includes(src);
                return (
                  <TouchableOpacity
                    key={src}
                    style={[styles.row, styles.rowBorder]}
                    onPress={() => toggleFavSource(src)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.favicon}>
                      <Image
                        source={{ uri: faviconUrl(src) }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                    </View>
                    <Text style={[styles.rowLabel, !active && styles.rowLabelOff]}>{src}</Text>
                    <View style={[styles.bell, active && styles.bellActive]}>
                      <Ionicons
                        name={active ? 'notifications' : 'notifications-outline'}
                        size={18}
                        color={active ? '#FFFFFF' : '#444'}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#4A90D9', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: { color: '#555', fontSize: 13, lineHeight: 18, marginBottom: 20 },

  sectionLabel: {
    color: '#444', fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
    marginBottom: 10, marginTop: 4,
  },
  card: {
    backgroundColor: '#0E0E0E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A1A1A',
    marginBottom: 16, overflow: 'hidden',
  },
  catHeader: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
  },
  catLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  topicIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  favicon: {
    width: 28, height: 28, borderRadius: 7,
    overflow: 'hidden', backgroundColor: '#1A1A1A',
  },
  rowLabel: { flex: 1, color: '#DDD', fontSize: 14, fontWeight: '500' },
  rowLabelOff: { color: '#555' },
  bell: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1A1A1A',
    alignItems: 'center', justifyContent: 'center',
  },
  bellActive: { backgroundColor: '#1C3A6A' },
});
