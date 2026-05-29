export type BiasRating = 'left' | 'lean-left' | 'center' | 'lean-right' | 'right' | 'unknown';

export const BIAS_CONFIG: Record<BiasRating, { color: string; label: string }> = {
  'left':       { color: '#1E5CFF', label: 'L' },
  'lean-left':  { color: '#4D9EFF', label: 'LL' },
  'center':     { color: '#9B9B9B', label: 'C' },
  'lean-right': { color: '#FF7A4D', label: 'LR' },
  'right':      { color: '#FF3B30', label: 'R' },
  'unknown':    { color: 'transparent', label: '' },
};

export interface BiasBreakdown {
  left: number;
  center: number;
  right: number;
  unknown: number;
  diversity: boolean;
}

export interface Story {
  id: string;
  headline: string;
  summary: string;
  publishedAt: string;
  imageUrl: string;
  category?: string;
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

export interface TopicGroup {
  id: string;
  headline: string;
  summary: string;
  imageUrl: string;
  publishedAt: string;
  sources: { name: string; url: string; imageUrl?: string; publishedAt: string }[];
}

export type CategoryTopic = 'myspace' | 'breaking' | 'technology' | 'india-politics' | 'geopolitics' | 'markets' | 'business';
export type TopicKey = CategoryTopic;
export type FontSize = 'Small' | 'Medium' | 'Large' | 'XLarge';

export interface ArticleParams {
  id: string;
  url: string;
  image: string;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string;
  dominantColor: string;
  sources: string; // JSON array of SourceEntry
  allStories: string; // JSON array of Story (up to 30)
  sourceBias?: string;
}

export type NavScreen =
  | { name: 'Feed' }
  | { name: 'Digest' }
  | { name: 'AIFeed' }
  | { name: 'Article'; params: ArticleParams }
  | { name: 'TopicFeed'; params: { tag: string } }
  | { name: 'StoryTimeline'; params: { clusterId: string; headline: string; stories: string } }
  | { name: 'Saved' }
  | { name: 'Settings' }
  | { name: 'Topics' }
  | { name: 'Sources' }
  | { name: 'FavSources' }
  | { name: 'TopicInterests' }
  | { name: 'Usage' };

export type TabName = 'feed' | 'digest' | 'aifeed' | 'saved' | 'settings';
