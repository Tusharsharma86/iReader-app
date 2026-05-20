import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings, TopicKey } from '../contexts/SettingsContext';
import { TOPIC_SUBTOPICS } from '../utils/topics';

const TOPIC_ITEMS: { key: TopicKey; label: string; icon: string }[] = [
  { key: 'breaking',       label: 'Breaking News', icon: '🔴' },
  { key: 'technology',     label: 'Technology',    icon: '💻' },
  { key: 'india-politics', label: 'India',         icon: '🇮🇳' },
  { key: 'geopolitics',    label: 'World',         icon: '🌍' },
  { key: 'markets',        label: 'Markets',       icon: '📈' },
  { key: 'business',       label: 'Business',      icon: '💼' },
];

export default function TopicsScreen() {
  const navigation = useNavigation();
  const { activeTopics, toggleTopic, activeSubTopics, toggleSubTopic, showSports, setShowSports, showEntertainment, setShowEntertainment } = useSettings();

  function isSpecialPill(topicKey: string, sub: string): boolean {
    return (topicKey === 'breaking' || topicKey === 'india-politics') &&
      (sub === 'Sports' || sub === 'Entertainment');
  }
  function specialPillActive(sub: string): boolean {
    return sub === 'Sports' ? showSports : showEntertainment;
  }
  function toggleSpecialPill(sub: string): void {
    if (sub === 'Sports') setShowSports(!showSports);
    else setShowEntertainment(!showEntertainment);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Topics</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.hint}>Toggle topics on/off. Tap sub-topic pills to filter what you see.</Text>

        {TOPIC_ITEMS.map(item => {
          const topicOn = activeTopics[item.key] !== false;
          const subs = TOPIC_SUBTOPICS[item.key] ?? [];

          return (
            <View key={item.key} style={styles.section}>
              {/* Topic header row with switch */}
              <View style={styles.topicRow}>
                <Text style={styles.topicIcon}>{item.icon}</Text>
                <Text style={[styles.topicLabel, !topicOn && styles.topicLabelOff]}>
                  {item.label}
                </Text>
                <Switch
                  value={topicOn}
                  onValueChange={() => toggleTopic(item.key)}
                  trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
                  thumbColor={topicOn ? '#4A90D9' : '#444'}
                />
              </View>

              {/* Sub-topic pills */}
              {topicOn && subs.length > 0 && (
                <View style={styles.pillRow}>
                  {subs.map(sub => {
                    const special = isSpecialPill(item.key, sub);
                    const active = special ? specialPillActive(sub) : activeSubTopics[`${item.key}:${sub}`] !== false;
                    return (
                      <TouchableOpacity
                        key={sub}
                        onPress={() => special ? toggleSpecialPill(sub) : toggleSubTopic(`${item.key}:${sub}`)}
                        activeOpacity={0.7}
                        style={[styles.pill, active ? styles.pillActive : styles.pillOff]}
                      >
                        <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextOff]}>
                          {sub}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {/* ── Content Filters ──────────────────────────────────────── */}
        <Text style={[styles.hint, { marginTop: 24, marginBottom: 12, color: '#666', fontWeight: '700', letterSpacing: 1 }]}>
          CONTENT FILTERS
        </Text>

        <View style={styles.section}>
          <View style={styles.topicRow}>
            <Text style={styles.topicIcon}>⚽</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.topicLabel, !showSports && { color: '#555' }]}>Sports</Text>
              <Text style={styles.filterSub}>Cricket, football, tennis, F1 and more</Text>
            </View>
            <Switch
              value={showSports}
              onValueChange={setShowSports}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={showSports ? '#4A90D9' : '#444'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.topicRow}>
            <Text style={styles.topicIcon}>🎬</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.topicLabel, !showEntertainment && { color: '#555' }]}>Entertainment</Text>
              <Text style={styles.filterSub}>Bollywood, movies, celebrity, awards</Text>
            </View>
            <Switch
              value={showEntertainment}
              onValueChange={setShowEntertainment}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={showEntertainment ? '#4A90D9' : '#444'}
            />
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: { color: '#444', fontSize: 12, marginBottom: 20, lineHeight: 18 },

  section: {
    backgroundColor: '#0E0E0E',
    borderRadius: 14, borderWidth: 1, borderColor: '#1A1A1A',
    marginBottom: 12, overflow: 'hidden',
  },
  topicRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  topicIcon: { fontSize: 20, marginRight: 12 },
  topicLabel: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '700' },
  topicLabelOff: { color: '#444' },

  pillRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingBottom: 16,
  },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1,
  },
  pillActive: { backgroundColor: '#0D2B1A', borderColor: '#22C55E' },
  pillOff:    { backgroundColor: '#111', borderColor: '#252525' },
  pillText: { fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: '#22C55E' },
  pillTextOff:    { color: '#383838' },

  filterSub: { color: '#555', fontSize: 12, marginTop: 2 },
});
