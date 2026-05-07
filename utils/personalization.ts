// In-memory user profile — resets on app restart (no persistence needed for MVP)
const userProfile = {
  topicAffinity: {} as Record<string, number>,
  sourceAffinity: {} as Record<string, number>,
  skippedTopics: new Set<string>(),
  openedArticles: new Set<string>(),
};

const STOP_WORDS = new Set([
  'the','a','an','in','on','at','to','for','of','and','or','but','is','are',
  'was','were','be','been','being','have','has','had','do','does','did','will',
  'would','could','should','may','might','shall','can','need','dare','ought',
  'used','with','as','by','from','into','through','during','before','after',
  'above','below','between','out','off','over','under','again','further','then',
  'once','it','its','this','that','these','those','i','you','he','she','we',
  'they','what','which','who','whom','when','where','why','how','all','both',
  'each','few','more','most','other','some','such','no','not','only','same',
  'so','than','too','very','just','up','down','about','says','said',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

export function trackArticleOpen(story: any): void {
  userProfile.openedArticles.add(story.id);

  const keywords = extractKeywords(story.headline ?? '');
  keywords.forEach(kw => {
    userProfile.topicAffinity[kw] = (userProfile.topicAffinity[kw] ?? 0) + 1;
  });

  const source = story.sources?.[0]?.name?.toLowerCase();
  if (source) {
    userProfile.sourceAffinity[source] = (userProfile.sourceAffinity[source] ?? 0) + 1;
  }
}

export function trackSkip(story: any): void {
  const keywords = extractKeywords(story.headline ?? '');
  keywords.forEach(kw => {
    userProfile.topicAffinity[kw] = (userProfile.topicAffinity[kw] ?? 0) - 0.5;
  });
}

export function rankStories(stories: any[]): any[] {
  if (userProfile.openedArticles.size === 0) {
    // No profile yet — preserve server order
    return stories;
  }

  return stories
    .map(story => {
      const keywords = extractKeywords(story.headline ?? '');
      const personalScore = keywords.reduce(
        (sum, kw) => sum + (userProfile.topicAffinity[kw] ?? 0),
        0,
      );
      const source = story.sources?.[0]?.name?.toLowerCase();
      const sourceScore = source ? (userProfile.sourceAffinity[source] ?? 0) : 0;
      const globalScore = (story.sources?.length ?? 1) * 2;
      const finalScore = (personalScore + sourceScore) * 0.7 + globalScore * 0.3;
      return { ...story, _score: finalScore };
    })
    .sort((a, b) => b._score - a._score);
}
