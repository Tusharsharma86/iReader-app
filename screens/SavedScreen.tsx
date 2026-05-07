import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StoryCard } from '../components/StoryCard';
import { useSaved } from '../contexts/SavedContext';

export default function SavedScreen() {
  const { width } = useWindowDimensions();
  const cardWidth = width >= 768 ? Math.round(width * 0.46) : width - 28;
  const { savedStories } = useSaved();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.screenTitle}>Saved</Text>

      {savedStories.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={52} color="#2A2A2A" />
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptySub}>Tap the bookmark on any story to save it here</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          <Text style={styles.count}>{savedStories.length} saved</Text>
          {savedStories.map(story => (
            <View key={story.id} style={styles.item}>
              <StoryCard story={story} cardWidth={cardWidth} />
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  screenTitle: {
    color: '#FFFFFF', fontSize: 28, fontWeight: '800',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20,
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  emptyTitle: { color: '#333', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: '#2A2A2A', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list: { paddingTop: 4, alignItems: 'center' },
  count: { color: '#444', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  item: { marginBottom: 16 },
});
