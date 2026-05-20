import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = '@ireader_profile';

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

export function saveProfile(): void {
  try {
    const data = JSON.stringify({
      topicAffinity: userProfile.topicAffinity,
      sourceAffinity: userProfile.sourceAffinity,
    });
    AsyncStorage.setItem(PROFILE_KEY, data).catch(() => {});
  } catch(e) {}
}

export async function loadProfile(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      Object.assign(userProfile.topicAffinity, data.topicAffinity || {});
      Object.assign(userProfile.sourceAffinity, data.sourceAffinity || {});
    }
  } catch(e) {}
}

export function trackArticleOpen(story: any): void {
  userProfile.openedArticles.add(story.id);

  const keywords = extractKeywords(story.headline ?? '');
  keywords.forEach(kw => {
    userProfile.topicAffinity[kw] = Math.min(50, (userProfile.topicAffinity[kw] ?? 0) + 1);
  });

  const source = story.sources?.[0]?.name?.toLowerCase();
  if (source) {
    userProfile.sourceAffinity[source] = Math.min(50, (userProfile.sourceAffinity[source] ?? 0) + 1);
  }

  saveProfile();
}

export function trackSkip(story: any): void {
  const keywords = extractKeywords(story.headline ?? '');
  keywords.forEach(kw => {
    userProfile.topicAffinity[kw] = Math.max(-10, (userProfile.topicAffinity[kw] ?? 0) - 0.5);
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
      const sourceCount = story.sources?.length ?? 1;
      const importanceScore = sourceCount * 2;
      const categoryBonus: number = story._categoryBonus ?? 0;

      const hoursOld = (Date.now() - new Date(story.publishedAt ?? 0).getTime()) / 3_600_000;

      // Velocity: sources per hour — already time-aware, sits outside freshnessMult
      const velocityScore = Math.min(sourceCount / Math.max(hoursOld, 0.5), 10) * 2;

      // Two-phase decay: half-life 12h for first 24h, then steep drop-off
      const freshnessMult = hoursOld <= 24
        ? Math.exp(-hoursOld * Math.LN2 / 12)
        : Math.exp(-24 * Math.LN2 / 12) * Math.exp(-(hoursOld - 24) * Math.LN2 / 6);

      const freshBonus = Math.max(0, (6 - hoursOld) / 6) * 6;

      const affinityScore = (personalScore + sourceScore) * 0.5
        + importanceScore * 0.2
        + categoryBonus;

      const finalScore = affinityScore * freshnessMult + velocityScore + freshBonus;

      return { ...story, _score: finalScore };
    })
    .sort((a, b) => b._score - a._score);
}

export function rankStoriesStandard(stories: any[]): any[] {
  return stories
    .map(story => {
      const sourceCount = story.sources?.length ?? 1;
      const hoursOld = (Date.now() - new Date(story.publishedAt ?? 0).getTime()) / 3_600_000;

      const importanceScore = sourceCount * 3;
      const breakingBonus = story.isBreaking ? 10 : 0;
      const trendingBonus = story.isTrending ? 4 : 0;
      const velocityScore = Math.min(sourceCount / Math.max(hoursOld, 0.5), 10) * 2;

      const freshnessMult = hoursOld <= 24
        ? Math.exp(-hoursOld * Math.LN2 / 12)
        : Math.exp(-24 * Math.LN2 / 12) * Math.exp(-(hoursOld - 24) * Math.LN2 / 6);

      const freshBonus = Math.max(0, (6 - hoursOld) / 6) * 6;

      const standardScore = (importanceScore + breakingBonus + trendingBonus) * freshnessMult
        + velocityScore
        + freshBonus;

      return { ...story, _score: standardScore };
    })
    .sort((a, b) => b._score - a._score);
}
