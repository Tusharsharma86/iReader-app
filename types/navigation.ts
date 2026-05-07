export type FeedStackParamList = {
  FeedHome: undefined;
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
    sources?: string; // JSON-stringified array of { name, url, imageUrl?, publishedAt }
    allStories?: string; // JSON-stringified Story[] slice for related stories
  };
};

export type RootTabParamList = {
  Feed: undefined;
  Saved: undefined;
  Settings: undefined;
};

// Legacy alias used by ArticleScreen
export type RootStackParamList = FeedStackParamList;
