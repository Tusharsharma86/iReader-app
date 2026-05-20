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
}

export type NavScreen =
  | { name: 'Feed' }
  | { name: 'Article'; params: ArticleParams }
  | { name: 'TopicFeed'; params: { tag: string } }
  | { name: 'StoryTimeline'; params: { clusterId: string; headline: string; stories: string } }
  | { name: 'Saved' }
  | { name: 'Settings' }
  | { name: 'Topics' }
  | { name: 'Sources' }
  | { name: 'FavSources' }
  | { name: 'Usage' };

export type TabName = 'feed' | 'saved' | 'settings';
