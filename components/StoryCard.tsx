import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { darken, lighten, getArticleColor } from '../utils/colors';
import { FeedStackParamList } from '../types/navigation';
import { useSaved } from '../contexts/SavedContext';
import { trackArticleOpen } from '../utils/personalization';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_CARD_WIDTH = Math.round(SCREEN_WIDTH * (SCREEN_WIDTH >= 768 ? 0.46 : 0.82));
const IMAGE_HEIGHT = 220;

export interface Story {
  id: string;
  headline: string;
  summary: string;
  publishedAt: string;
  imageUrl: string;
  sources: { name: string; url: string; imageUrl?: string; publishedAt: string }[];
  summaries?: { fiveWs?: string[]; eli5?: string; keyHighlights?: string };
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

interface Props {
  story: Story;
  compact?: boolean;
  cardWidth?: number;
}

function StoryCardInner({ story, compact, cardWidth = DEFAULT_CARD_WIDTH }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<FeedStackParamList, 'FeedHome'>>();
  const { toggleSave, isSaved } = useSaved();
  const [imageError, setImageError] = React.useState(false);
  const saved = isSaved(story.id);

  const dominant = getArticleColor(story.id || story.headline);
  const accent = lighten(dominant, 0.55);
  const textBg = darken(dominant, 0.3);
  const source = story.sources?.[0]?.name ?? 'Unknown';
  const articleCount = story.sources?.length ?? 1;

  const handleBookmark = useCallback(() => { toggleSave(story); }, [story, toggleSave]);

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
    });
  }, [story, dominant, navigation]);

  return (
    <Pressable
      style={[styles.outerCard, { width: cardWidth, shadowColor: dominant, backgroundColor: dominant }]}
      onPress={handlePress}
    >
      <View style={styles.innerCard}>

        {/* Image section */}
        <View style={styles.imageSection}>
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
          {/* Single combined overlay: tint + bottom fade */}
          <LinearGradient
            colors={[dominant + '55', dominant + '99', dominant + 'EE']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          {/* Source pill — FIX 2: bigger, bolder */}
          <View style={[styles.sourcePill, { backgroundColor: dominant + '88', shadowColor: dominant }]}>
            <Text style={styles.sourcePillText}>{source.toUpperCase()}</Text>
          </View>

          {/* Bookmark */}
          <Pressable style={styles.bookmarkBtn} onPress={handleBookmark} hitSlop={10}>
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={17}
              color={saved ? accent : '#FFFFFF'}
            />
          </Pressable>

          {/* Meta */}
          <View style={styles.imageOverlayBottom}>
            <Text style={styles.metaText}>
              {'⚡ '}{timeAgo(story.publishedAt)}{'  ·  '}{articleCount}{' '}{articleCount === 1 ? 'ARTICLE' : 'ARTICLES'}
            </Text>
          </View>
        </View>

        {/* Text section — hidden in compact (topic carousel) mode */}
        {!compact && (
          <View style={[styles.textSection, { backgroundColor: textBg }]}>
            <HeadlineWithEntities text={story.headline} accentColor={accent} />
            <Text style={styles.summary} numberOfLines={3}>
              {story.summary}
            </Text>
          </View>
        )}

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
  },
  innerCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  imageSection: {
    width: '100%',
    height: IMAGE_HEIGHT,
  },
  sourcePill: {
    position: 'absolute',
    top: 12,
    left: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  sourcePillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  bookmarkBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 18,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  imageOverlayBottom: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
  },
  metaText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.7,
  },
  textSection: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headline: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 27,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  summary: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 20,
  },
});
