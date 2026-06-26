import type { Story } from '../types';
import { entityBoostScore } from './entityFollowStore';

const PROFILE_KEY = '@ireader_profile';

const userProfile = {
  topicAffinity: {} as Record<string, number>,
  sourceAffinity: {} as Record<string, number>,
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
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

export function loadProfile(): void {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      Object.assign(userProfile.topicAffinity, data.topicAffinity || {});
      Object.assign(userProfile.sourceAffinity, data.sourceAffinity || {});
    }
  } catch {}
}

function saveProfile(): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      topicAffinity: userProfile.topicAffinity,
      sourceAffinity: userProfile.sourceAffinity,
    }));
  } catch {}
}

export function trackArticleOpen(story: Story): void {
  userProfile.openedArticles.add(story.id);
  extractKeywords(story.headline ?? '').forEach(kw => {
    userProfile.topicAffinity[kw] = Math.min(50, (userProfile.topicAffinity[kw] ?? 0) + 1);
  });
  const source = story.sources?.[0]?.name?.toLowerCase();
  if (source) userProfile.sourceAffinity[source] = Math.min(50, (userProfile.sourceAffinity[source] ?? 0) + 1);
  saveProfile();
}

export function trackSkip(story: Story): void {
  extractKeywords(story.headline ?? '').forEach(kw => {
    userProfile.topicAffinity[kw] = Math.max(-10, (userProfile.topicAffinity[kw] ?? 0) - 0.5);
  });
}

// Stronger-intent signals. Opening a Deep Dive or saving a story is a much
// clearer interest signal than a tap, so they carry heavier weight.
export function trackDeepDive(story: Story): void {
  userProfile.openedArticles.add(story.id);
  extractKeywords(story.headline ?? '').forEach(kw => {
    userProfile.topicAffinity[kw] = Math.min(60, (userProfile.topicAffinity[kw] ?? 0) + 3);
  });
  const source = story.sources?.[0]?.name?.toLowerCase();
  if (source) userProfile.sourceAffinity[source] = Math.min(60, (userProfile.sourceAffinity[source] ?? 0) + 2);
  saveProfile();
}

export function trackSave(story: Story): void {
  extractKeywords(story.headline ?? '').forEach(kw => {
    userProfile.topicAffinity[kw] = Math.min(60, (userProfile.topicAffinity[kw] ?? 0) + 2.5);
  });
  saveProfile();
}

// Personalized ranking — used for "For You" tab
export function rankStories(stories: Story[]): Story[] {
  // Even with no learned profile, explicit star ratings should still rank.
  const hasInterest = stories.some(s => ((s as any)._interestBonus ?? 0) > 0);
  if (userProfile.openedArticles.size === 0 && !hasInterest) return stories;
  return stories
    .map(story => {
      const keywords = extractKeywords(story.headline ?? '');
      const personalScore = keywords.reduce((sum, kw) => sum + (userProfile.topicAffinity[kw] ?? 0), 0);
      const source = story.sources?.[0]?.name?.toLowerCase();
      const sourceScore = source ? (userProfile.sourceAffinity[source] ?? 0) : 0;
      const sourceCount = story.sources?.length ?? 1;
      const importanceScore = sourceCount * 2;
      const categoryBonus: number = (story as any)._categoryBonus ?? 0;
      const interestBonus: number = (story as any)._interestBonus ?? 0;

      const hoursOld = (Date.now() - new Date(story.publishedAt ?? 0).getTime()) / 3_600_000;
      const velocityScore = Math.min(sourceCount / Math.max(hoursOld, 0.5), 10) * 2;

      const freshnessMult = hoursOld <= 24
        ? Math.exp(-hoursOld * Math.LN2 / 12)
        : Math.exp(-24 * Math.LN2 / 12) * Math.exp(-(hoursOld - 24) * Math.LN2 / 6);

      const freshBonus = Math.max(0, (6 - hoursOld) / 6) * 6;

      const affinityScore = (personalScore + sourceScore) * 0.5
        + importanceScore * 0.2
        + categoryBonus
        + interestBonus;

      // Exploration: a small stochastic nudge + a novelty bonus for stories
      // whose keywords we have NO affinity for yet — keeps For You from
      // tunnelling into the same few topics and surfaces fresh discovery.
      const novelty = personalScore === 0 ? 4 : 0;
      const exploration = Math.random() * 4 + novelty;

      const entityBoost = entityBoostScore(story.headline ?? '', (story as any).aiSummary ?? story.summary ?? '');

      const finalScore = affinityScore * freshnessMult
        + velocityScore
        + freshBonus
        + interestBonus * 0.4
        + exploration
        + entityBoost;
      return { ...story, _score: finalScore } as any;
    })
    .sort((a: any, b: any) => b._score - a._score);
}

// Standard ranking — used for all topic tabs
export function rankStoriesStandard(stories: Story[]): Story[] {
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

      const entityBoost = entityBoostScore(story.headline ?? '', (story as any).aiSummary ?? story.summary ?? '');

      const standardScore = (importanceScore + breakingBonus + trendingBonus) * freshnessMult
        + velocityScore
        + freshBonus
        + entityBoost;

      return { ...story, _score: standardScore } as any;
    })
    .sort((a: any, b: any) => b._score - a._score);
}
