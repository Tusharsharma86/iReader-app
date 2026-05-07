import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Story, StoryCard } from '../components/StoryCard';
import { FeedStackParamList } from '../types/navigation';

const CARD_GAP = 16;
const API_BASE = 'https://ireader.onrender.com/api/news/feed';
const TOPICS = ['breaking', 'technology', 'india-politics', 'geopolitics', 'markets', 'business'] as const;

export default function TopicFeedScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<FeedStackParamList, 'TopicFeed'>>();
  const { tag } = route.params;
  const keyword = tag.replace(/^#/, '').toLowerCase();

  const { width } = useWindowDimensions();
  const cardWidth = Math.round(width * (width >= 768 ? 0.46 : 0.88));

  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      const results = await Promise.allSettled(
        TOPICS.map(t =>
          fetch(`${API_BASE}?topic=${t}&limit=30`)
            .then(r => r.json())
            .then((d: { stories: Story[] }) => d.stories ?? []),
        ),
      );
      const all: Story[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value);
      }
      const seen = new Set<string>();
      const matched = all.filter(s => {
        if (seen.has(s.id)) return false;
        const matches = s.headline.toLowerCase().includes(keyword) ||
          s.summary?.toLowerCase().includes(keyword);
        if (matches) seen.add(s.id);
        return matches;
      });
      matched.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      setStories(matched);
      setLoading(false);
    }
    fetchAll();
  }, [keyword]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.title}>{tag}</Text>
        <Text style={styles.count}>{loading ? '' : `${stories.length} stories`}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4A90D9" />
        </View>
      ) : stories.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No stories found for {tag}</Text>
        </View>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={s => s.id}
          contentContainerStyle={[styles.list, { paddingHorizontal: (width - cardWidth) / 2 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ marginBottom: CARD_GAP }}>
              <StoryCard story={item} cardWidth={cardWidth} />
            </View>
          )}
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, padding: 6,
  },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800', flex: 1 },
  count: { color: '#555', fontSize: 13, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#555', fontSize: 15 },
  list: { paddingTop: 8 },
});
