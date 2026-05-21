import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { darken, lighten, getArticleColor } from '../utils/colors';
import { FeedStackParamList } from '../types/navigation';
import { trackArticleOpen } from '../utils/personalization';

export type BiasRating = 'left' | 'lean-left' | 'center' | 'lean-right' | 'right' | 'unknown';

export const BIAS_CONFIG: Record<BiasRating, { color: string; label: string }> = {
  'left':       { color: '#1E5CFF', label: 'L' },
  'lean-left':  { color: '#4D9EFF', label: 'LL' },
  'center':     { color: '#9B9B9B', label: 'C' },
  'lean-right': { color: '#FF7A4D', label: 'LR' },
  'right':      { color: '#FF3B30', label: 'R' },
  'unknown':    { color: 'transparent', label: '' },
};

export function BiasDot({ bias, size = 7 }: { bias?: BiasRating; size?: number }) {
  if (!bias || bias === 'unknown') return null;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: BIAS_CONFIG[bias].color }} />
  );
}

export interface BiasBreakdown {
  left: number;
  center: number;
  right: number;
  unknown: number;
  diversity: boolean;
}

export function BiasSpectrum({ breakdown }: { breakdown?: BiasBreakdown }) {
  if (!breakdown) return null;
  const total = breakdown.left + breakdown.center + breakdown.right;
  if (total === 0) return null;
  return (
    <View style={{ flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', width: 60 }}>
      <View style={{ flex: breakdown.left || 0.001, backgroundColor: '#1E5CFF' }} />
      <View style={{ flex: breakdown.center || 0.001, backgroundColor: '#9B9B9B' }} />
      <View style={{ flex: breakdown.right || 0.001, backgroundColor: '#FF3B30' }} />
    </View>
  );
}

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
  readingTimeMinutes?: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  sourceBias?: BiasRating;
  sourceCredibility?: 'high' | 'medium' | 'low' | 'unknown';
  biasBreakdown?: BiasBreakdown;
}



function clientReadingTime(text: string): number {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function clientDifficulty(text: string): 'Easy' | 'Medium' | 'Hard' {
  const sentences = (text ?? '').split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!sentences.length || !words.length) return 'Medium';
  let syllables = 0;
  for (const w of words) {
    const clean = w.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.length <= 3) { syllables += 1; continue; }
    const m = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
    syllables += m ? m.length : 1;
  }
  const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
  return score >= 70 ? 'Easy' : score >= 50 ? 'Medium' : 'Hard';
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
  const cardWidth = cardWidthProp ?? (width >= 768 ? Math.round(width * 0.46) : width - 28);
  // Image takes ~72% of card width in height (slightly wider than square)
  const imageHeight = Math.round(cardWidth * 0.72);

  const navigation = useNavigation<NativeStackNavigationProp<FeedStackParamList, 'FeedHome'>>();
  const [imageError, setImageError] = React.useState(false);

  const dominant = getArticleColor(story.id || story.headline);
  const accent = lighten(dominant, 0.55);
  const textBg = darken(dominant, 0.5);
  const source = story.sources?.[0]?.name ?? 'Unknown';
  const sourceCount = story.sources?.length ?? 1;
  const ageMs = Date.now() - new Date(story.publishedAt).getTime();
  const isTrending = story.isTrending ?? sourceCount >= 3;
  const isBreakingBadge = story.isBreaking || ageMs < 60 * 60 * 1000;
  const isOngoing = story.isDeveloping ?? (sourceCount >= 4 && ageMs < 6 * 60 * 60 * 1000);
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
      sourceBias: story.sourceBias,
    });
  }, [story, dominant, navigation, allStories]);

  return (
    <Pressable
      style={[styles.card, { width: cardWidth, shadowColor: dominant }]}
      onPress={handlePress}
    >
      {/* ── IMAGE ─────────────────────────────────── */}
      <View style={{ height: imageHeight }}>
        <Image
          source={imageError || !story.imageUrl
            ? require('../assets/news-placeholder.jpg')
            : { uri: story.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onError={() => setImageError(true)}
        />

        {/* Gradient blends image bottom into the text section color */}
        <LinearGradient
          colors={['transparent', textBg]}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />

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
      </View>

      {/* ── TEXT ──────────────────────────────────── */}
      <View style={[styles.textSection, { backgroundColor: textBg }]}>
        {/* Article count · time · badges */}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{source.toUpperCase()}  ·  {timeAgo(story.publishedAt)}</Text>
          <BiasDot bias={story.sourceBias} size={6} />
          {isBreakingBadge && <Text style={styles.breakingText}>·  BREAKING</Text>}
          {isTrending && !isBreakingBadge && <Text style={styles.badge}>🔥</Text>}
          {isOngoing && <Text style={styles.badge}>📍</Text>}
        </View>

        <HeadlineWithEntities text={story.headline} accentColor={accent} />

        {(() => {
          const text = story.summary ?? story.headline ?? '';
          const mins = story.readingTimeMinutes ?? clientReadingTime(text);
          const diff = story.difficulty ?? clientDifficulty(text);
          return (
            <Text style={styles.cardReadingMeta}>{mins} min  ·  {diff}</Text>
          );
        })()}

        {!compact && (
          <Text style={styles.summary} numberOfLines={2}>{story.summary}</Text>
        )}
      </View>
    </Pressable>
  );
}

export const StoryCard = React.memo(StoryCardInner);

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    alignSelf: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
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
  textSection: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  metaLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  breakingText: {
    color: '#FF3B30',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    lineHeight: 14,
  },
  badge: { fontSize: 12 },
  cardReadingMeta: { color: 'rgba(255,255,255,0.28)', fontSize: 11, fontWeight: '500', marginTop: 3, marginBottom: 2 },
  headline: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 27,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  summary: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 17,
  },
});
