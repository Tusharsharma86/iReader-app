import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from '../contexts/SettingsContext';
import { INTEREST_CATEGORIES, INTEREST_TOPICS, type InterestTopic } from '../utils/interestTopics';
import { SettingsStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'TopicInterests'>;
const MAX_STARS = 5;

function StarRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.starRow}>
      {Array.from({ length: MAX_STARS }).map((_, i) => {
        const filled = i < value;
        const next = value === i + 1 ? 0 : i + 1;
        return (
          <Pressable key={i} onPress={() => onChange(next)} hitSlop={6} style={styles.starHit}>
            <Ionicons
              name={filled ? 'star' : 'star-outline'}
              size={20}
              color={filled ? '#FFC542' : '#3A3A3A'}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TopicInterestsScreen() {
  const navigation = useNavigation<Nav>();
  const { topicInterests, setTopicInterest } = useSettings();
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = (t: InterestTopic) =>
      !q || t.label.toLowerCase().includes(q) || t.keywords.some(k => k.includes(q));
    return INTEREST_CATEGORIES.map(cat => ({
      category: cat,
      items: INTEREST_TOPICS.filter(t => t.category === cat && filter(t)),
    })).filter(g => g.items.length > 0);
  }, [query]);

  const totalStarred = useMemo(
    () => Object.values(topicInterests).filter(v => v > 0).length,
    [topicInterests],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Topic Interests</Text>
          <Text style={styles.subtitle}>
            {totalStarred > 0
              ? `${totalStarred} topic${totalStarred === 1 ? '' : 's'} starred`
              : 'Star topics to personalise your For You feed'}
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color="#555" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search topics"
          placeholderTextColor="#555"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#555" />
          </Pressable>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {grouped.map(group => (
          <View key={group.category} style={styles.group}>
            <Text style={styles.groupHeader}>{group.category.toUpperCase()}</Text>
            <View style={styles.card}>
              {group.items.map((t, i) => (
                <View key={t.id} style={[i > 0 && styles.divider]}>
                  <View style={styles.row}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.emoji}>{t.emoji}</Text>
                      <Text style={styles.label} numberOfLines={1}>{t.label}</Text>
                    </View>
                    <StarRow
                      value={topicInterests[t.id] ?? 0}
                      onChange={(n) => setTopicInterest(t.id, n)}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#141414',
  },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#666', fontSize: 12, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#141414', borderRadius: 12, gap: 8, marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14, padding: 0 },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  group: { marginBottom: 18 },
  groupHeader: {
    color: '#666', fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: 8, marginLeft: 4,
  },
  card: { backgroundColor: '#141414', borderRadius: 14, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  emoji: { fontSize: 18 },
  label: { color: '#EEE', fontSize: 14, fontWeight: '500', flex: 1 },
  starRow: { flexDirection: 'row', gap: 2 },
  starHit: { padding: 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#222' },
});
