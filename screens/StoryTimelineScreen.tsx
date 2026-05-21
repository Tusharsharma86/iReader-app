import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedStackParamList } from '../types/navigation';
import { Story, BiasDot, type BiasRating } from '../components/StoryCard';

type EventType = 'breaking' | 'update' | 'analysis' | 'reaction';

const EVENT_META: Record<EventType, { label: string; color: string }> = {
  breaking: { label: 'BREAKING',  color: '#FF3B30' },
  update:   { label: 'UPDATE',    color: '#4A90D9' },
  analysis: { label: 'ANALYSIS',  color: '#A29BFE' },
  reaction: { label: 'REACTION',  color: '#F5A623' },
};

function detectEventType(headline: string, summary: string): EventType {
  const t = (headline + ' ' + summary).toLowerCase();
  if (/\b(breaking|alert|urgent|emergency|just in|developing)\b/.test(t)) return 'breaking';
  if (/\b(analysis|explained|opinion|why |how it|what is|deep dive|explainer)\b/.test(t)) return 'analysis';
  if (/\b(reacts?|responds?|response|condemns?|slams?|criticis|defends?|calls for)\b/.test(t)) return 'reaction';
  return 'update';
}

function firstTwoSentences(text: string): string {
  const m = (text ?? '').match(/[^.!?]+[.!?]+/g) ?? [];
  return m.slice(0, 2).join(' ').trim() || (text?.slice(0, 200) ?? '');
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function StoryTimelineScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FeedStackParamList>>();
  const route = useRoute<RouteProp<FeedStackParamList, 'StoryTimeline'>>();
  const { headline, stories: storiesJson } = route.params;

  const sorted = useMemo(() => {
    let parsed: Story[] = [];
    try { parsed = JSON.parse(storiesJson) as Story[]; } catch { /* ignore */ }
    return [...parsed].sort(
      (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
    );
  }, [storiesJson]);

  function openArticle(story: Story) {
    navigation.navigate('Article', {
      id: story.id,
      url: story.sources?.[0]?.url ?? '',
      image: story.imageUrl ?? '',
      headline: story.headline,
      summary: story.summary ?? '',
      source: story.sources?.[0]?.name ?? '',
      publishedAt: story.publishedAt,
      dominantColor: '#1A1A2E',
      sources: JSON.stringify(story.sources ?? []),
      sourceBias: (story as any).sourceBias,
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Story Timeline</Text>
          <Text style={styles.clusterHeadline} numberOfLines={2}>{headline}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.eventCount}>{sorted.length} sources · oldest first</Text>

        {sorted.map((story, idx) => {
          const eventType = detectEventType(story.headline, story.summary ?? '');
          const meta = EVENT_META[eventType];
          const isLast = idx === sorted.length - 1;
          const snippet = firstTwoSentences(story.summary ?? '');
          const source = story.sources?.[0]?.name ?? 'Unknown';
          const thumb = story.imageUrl;

          return (
            <View key={story.id ?? idx} style={styles.eventRow}>
              {/* Timeline spine */}
              <View style={styles.spine}>
                <View style={[styles.dot, { borderColor: meta.color }]} />
                {!isLast && <View style={styles.line} />}
              </View>

              {/* Card */}
              <TouchableOpacity
                style={[styles.card, isLast && styles.cardLast]}
                activeOpacity={0.75}
                onPress={() => openArticle(story)}
              >
                <View style={styles.metaRow}>
                  <Text style={[styles.typeBadge, { color: meta.color }]}>{meta.label}</Text>
                  <Text style={styles.sep}>·</Text>
                  <Text style={styles.timeText}>{timeAgo(story.publishedAt)}</Text>
                  <Text style={styles.sep}>·</Text>
                  <Text style={styles.sourceText} numberOfLines={1}>{source}</Text>
                  <BiasDot bias={(story as any).sourceBias as BiasRating} size={6} />
                </View>

                <View style={styles.contentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventHeadline} numberOfLines={3}>{story.headline}</Text>
                    {!!snippet && (
                      <Text style={styles.snippet} numberOfLines={2}>{snippet}</Text>
                    )}
                  </View>
                  {!!thumb && (
                    <Image
                      source={{ uri: thumb }}
                      style={styles.thumb}
                      contentFit="cover"
                    />
                  )}
                </View>

                <View style={styles.readMore}>
                  <Text style={styles.readMoreText}>Read article</Text>
                  <Ionicons name="chevron-forward" size={11} color="#2A5A8A" />
                </View>
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#141414',
  },
  backBtn: { paddingTop: 2 },
  screenTitle: { color: '#4A90D9', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  clusterHeadline: { color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 22, letterSpacing: -0.2 },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  eventCount: { color: '#333', fontSize: 11, fontWeight: '600', letterSpacing: 0.4, marginBottom: 20 },

  eventRow: { flexDirection: 'row', gap: 14 },
  spine: { alignItems: 'center', width: 14 },
  dot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#080808', borderWidth: 2, marginTop: 3,
  },
  line: { flex: 1, width: 1, backgroundColor: '#1A1A1A', marginTop: 4, minHeight: 24 },

  card: {
    flex: 1, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: '#111',
    marginBottom: 4,
  },
  cardLast: { paddingBottom: 0, borderBottomWidth: 0 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 7, flexWrap: 'wrap' },
  typeBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  sep: { color: '#2A2A2A', fontSize: 10 },
  timeText: { color: '#3A3A3A', fontSize: 11, fontWeight: '500' },
  sourceText: { color: '#444', fontSize: 11, fontWeight: '500', flexShrink: 1 },

  contentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  eventHeadline: { color: '#CCC', fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 4 },
  snippet: { color: '#4A4A4A', fontSize: 12, lineHeight: 17 },
  thumb: {
    width: 72, height: 56, borderRadius: 8,
    backgroundColor: '#111', flexShrink: 0,
  },

  readMore: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  readMoreText: { color: '#2A5A8A', fontSize: 11, fontWeight: '600' },
});
