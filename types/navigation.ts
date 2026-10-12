export type FeedStackParamList = {
  FeedHome: undefined;
  TopicFeed: { tag: string };
  StoryTimeline: { clusterId: string; headline: string; stories: string };
  Article: {
    id: string;
    url: string;
    image: string;
    headline: string;
    summary: string;
    source: string;
    publishedAt: string;
    dominantColor: string;
    sources?: string; // JSON-stringified array of { name, url, imageUrl?, publishedAt }
    allStories?: string; // JSON-stringified Story[] slice for related stories
    sourceBias?: string;
  };
};

export type RootTabParamList = {
  Briefing: undefined;
  Feed: undefined;
  Digest: undefined;
  AIFeed: undefined;
  Explore: undefined;
  Saved: undefined;
  Settings: undefined;
};

export type ExploreStackParamList = {
  ExploreHome: undefined;
  TopicFeed: { tag: string };
  Article: {
    id: string;
    url: string;
    image: string;
    headline: string;
    summary: string;
    source: string;
    publishedAt: string;
    dominantColor: string;
    sources?: string;
    allStories?: string;
    sourceBias?: string;
  };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Topics: undefined;
  Sources: undefined;
  FavSources: undefined;
  Usage: undefined;
  AIUsage: undefined;
  CostDashboard: undefined;
  TopicInterests: undefined;
  BreakingThemes: undefined;
  NotifHistory: undefined;
  NotificationSettings: undefined;
  Customize: undefined;
};

// Legacy alias used by ArticleScreen
export type RootStackParamList = FeedStackParamList;

// Briefing pushes Article on top of itself, so it needs its own stack rather
// than borrowing Feed's — otherwise tapping a card would leave you inside the
// Feed tab when you navigate back.
export type BriefingStackParamList = {
  BriefingHome: undefined;
  Article: FeedStackParamList['Article'];
};
