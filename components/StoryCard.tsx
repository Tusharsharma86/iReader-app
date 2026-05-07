import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { darken, lighten, getArticleColor } from '../utils/colors';
import { FeedStackParamList } from '../types/navigation';
import { useSaved } from '../contexts/SavedContext';
import { trackArticleOpen } from '../utils/personalization';

const CARD_HEIGHT = 420;

export interface Story {
  id: string;
  headline: string;
  summary: string;
  publishedAt: string;
  imageUrl: string;
  sources: { name: string; url: string; imageUrl?: string; publishedAt: string }[];
  summaries?: { fiveWs?: string[]; eli5?: string; keyHighlights?: string };
  isTrending?: boolean;
  isBreaking?: boolean;
  isDeveloping?: boolean;
}

export function extractChips(text: string): string[] {
  const stopWords = new Set([
    'the','a','an','is','are','was','were','be','been',
    'has','have','had','will','would','could','should',
    'this','that','with','from','for','and','but','or',
    'in','on','at','to','of','its','it','as','by','says',
    'said','after','over','new','more','than','into','out',
  ]);
  const wordCount: Record<string, number> = {};
  text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(' ')
    .filter(w => w.length > 3 && !stopWords.has(w))
    .forEach(w => { wordCount[w] = (wordCount[w] || 0) + 1; });
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}HR AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
}

function HeadlineWithEntities({ text, accentColor }: { text: string; accentColor: string }) {
  const words = text.split(' ');
  return (
    <Text style={styles.headline} numberOfLines={2}>
      {words.map((word, i) => {
        const isEntity = i > 0 && /^[A-Z]/.test(word) && word.length > 1;
        return (
          <Text key={i} style={isEntity ? { color: accentColor } : { color: '#FFFFFF' }}>
            {word}{i < words.length - 1 ? ' ' : ''}
          </Text>
        );
      })}
    </Text>
  );
}

function getSourceDomain(name: string): string {
  const domains: Record<string, string> = {
    'TechCrunch': 'techcrunch.com', 'The Verge': 'theverge.com',
    'Ars Technica': 'arstechnica.com', 'Wired': 'wired.com',
    'NDTV': 'ndtv.com', 'Times of India': 'timesofindia.com',
    'Zee News': 'zeenews.com', 'India Today': 'indiatoday.in',
    'Republic': 'republicworld.com', 'Economic Times': 'economictimes.com',
    'The Hindu': 'thehindu.com', 'Indian Express': 'indianexpress.com',
    'BBC': 'bbc.com', 'Reuters': 'reuters.com', 'AP': 'apnews.com',
  };
  return domains[name] || 'google.com';
}

interface Props {
  story: Story;
  compact?: boolean;
  cardWidth?: number;
  allStories?: Story[];
}

function StoryCardInner({ story, compact, cardWidth: cardWidthProp, allStories }: Props) {
  const { width: hookWidth } = useWindowDimensions();
  const [dimWidth, setDimWidth] = useState(() => Dimensions.get('window').width);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDimWidth(window.width));
    return () => sub.remove();
  }, []);
  const width = Math.abs(hookWidth - dimWidth) < 1 ? hookWidth : dimWidth;
  // If parent passes explicit cardWidth, use it; otherwise compute reactively from current window width
  const cardWidth = cardWidthProp ?? (width >= 768 ? Math.round(width * 0.46) : width - 28);
  const navigation = useNavigation<NativeStackNavigationProp<FeedStackParamList, 'FeedHome'>>();
  const [imageError, setImageError] = React.useState(false);

  const dominant = getArticleColor(story.id || story.headline);
  const accent = lighten(dominant, 0.55);
  const source = story.sources?.[0]?.name ?? 'Unknown';
  const sourceCount = story.sources?.length ?? 1;
  const ageMs = Date.now() - new Date(story.publishedAt).getTime();
  // Prefer server-computed flags; fall back to local computation
  const isTrending = story.isTrending ?? sourceCount >= 3;
  const isBreakingBadge = story.isBreaking ?? (sourceCount >= 2 && ageMs < 2 * 60 * 60 * 1000);
  const isOngoing = story.isDeveloping ?? (sourceCount >= 4 && ageMs < 6 * 60 * 60 * 1000);
  const chips = useMemo(
    () => extractChips(story.headline + ' ' + (story.summary || '')),
    [story.headline, story.summary],
  );

  const handlePress = useCallback(() => {
    trackArticleOpen(story);
    navigation.navigate('Article', {
      id: story.id,
      url: story.sources?.[0]?.url ?? '',
      image: story.imageUrl,
      headline: story.headline,
      summary: story.summary,
      source: story.sources?.[0]?.name ?? '',
      publishedAt: story.publishedAt,
      dominantColor: dominant,
      sources: JSON.stringify(story.sources ?? []),
      allStories: JSON.stringify((allStories ?? []).slice(0, 30)),
    });
  }, [story, dominant, navigation, allStories]);

  return (
    <Pressable
      style={[styles.outerCard, { width: cardWidth, shadowColor: dominant }]}
      onPress={handlePress}
    >
      <View style={styles.innerCard}>

        {/* Full-bleed image */}
        {imageError || !story.imageUrl ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: darken(dominant, 0.2) }]} />
        ) : (
          <Image
            source={{ uri: story.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onError={() => setImageError(true)}
          />
        )}

        {/* Gradient overlay — bottom 70% */}
        <LinearGradient
          colors={['transparent', dominant + '88', dominant]}
          locations={[0, 0.45, 1]}
          style={styles.gradientOverlay}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />

        {/* Topic chips — top-left */}
        {chips.length > 0 && (
          <View style={styles.chipsTopLeft}>
            {chips.map(chip => (
              <Pressable
                key={chip}
                onPress={() => navigation.navigate('TopicFeed', { tag: chip })}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{chip}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Source favicon circles — top-right */}
        <View style={styles.sourceCircles}>
          {story.sources.slice(0, 3).map((src, i) => (
            <View
              key={i}
              style={[styles.sourceCircle, { backgroundColor: dominant, marginLeft: i > 0 ? -8 : 0 }]}
            >
              <Image
                source={{ uri: `https://www.google.com/s2/favicons?domain=${getSourceDomain(src.name)}&sz=64` }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </View>
          ))}
        </View>

        {/* Content overlay — bottom */}
        <View style={styles.contentOverlay}>

          {/* Source · time · badges */}
          <View style={styles.metaRow}>
            <View style={styles.faviconCircle}>
              <Text style={styles.faviconText}>{source.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.metaLabel}>{source.toUpperCase()}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaLabel}>{timeAgo(story.publishedAt)}</Text>
            {isBreakingBadge && (
              <View style={styles.breakingPill}>
                <View style={styles.breakingDot} />
                <Text style={styles.breakingText}>BREAKING</Text>
              </View>
            )}
            {isTrending && !isBreakingBadge && (
              <Text style={styles.trendingIcon}>🔥</Text>
            )}
            {isOngoing && (
              <Text style={styles.trendingIcon}>📍</Text>
            )}
          </View>

          {/* Headline */}
          <HeadlineWithEntities text={story.headline} accentColor={accent} />

          {/* Summary — hidden in compact mode */}
          {!compact && (
            <Text style={styles.summary} numberOfLines={2}>{story.summary}</Text>
          )}

        </View>

      </View>
    </Pressable>
  );
}

export const StoryCard = React.memo(StoryCardInner);

const styles = StyleSheet.create({
  outerCard: {
    borderRadius: 20,
    alignSelf: 'center',
    elevation: 4,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    height: CARD_HEIGHT,
  },
  innerCard: {
    borderRadius: 20,
    overflow: 'hidden',
    flex: 1,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
  },
  chipsTopLeft: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: '70%',
  },
  chip: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sourceCircles: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
  },
  sourceCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#000',
    overflow: 'hidden',
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  faviconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faviconText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  metaLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
  },
  metaDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
  breakingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,0,0,0.2)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  breakingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF0000',
  },
  breakingText: {
    color: '#FF4444',
    fontSize: 10,
    fontWeight: '700',
  },
  trendingIcon: {
    fontSize: 12,
  },
  headline: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 27,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  summary: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 20,
  },
});
