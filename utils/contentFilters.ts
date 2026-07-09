// Shared low-quality/promotional content filters + source-quality weighting
// for Digest ranking. Ported from web/src/utils/contentFilters.ts — see that
// file's history for the full story: Digest previously had no filter at all
// (promotional/deal articles showed up in Tech), then a recurring-column gap
// let a weekly gear-roundup blog post ("MagSafe Monday: …") outrank real news
// because corroboration ties (common in scoop-heavy Tech coverage) fell back
// to pure recency, then source quality was added as a third ranking factor
// per user feedback that TechCrunch's coverage beats aggregator blogs.

export const DEVANAGARI_RE = /[ऀ-ॿ]/;
const NYT_BRIEFING_RE = /nyt|new york times/i;

export const BLOCKED_ALWAYS_RE = /\b(promo.?codes?|coupons?|discounts?|discount.?codes?|cashback|voucher|sale.?offer|deal.?alert|exclusive.?deal|special.?offer|affiliate|referral.?codes?|invite.?codes?|offer.?codes?|redeem.?codes?|flat \d+%|flash sale|best deals?|top deals?|today.{0,8}deals?|today.{0,8}offers?|limited.{0,8}offer|get \d+% off|save \d+%|\d+%\s*off|\$\d+(?:\.\d+)?\s*off|phone price|smartphone price|price drops?|price cut|price hike|lowest price|best price|launched at|starts at rs|starts at \$|goes on sale|specs leak|hands.?on review|camera test|(?:cpu|gpu|phone|device|gaming|graphics|processor)\s+benchmark|unboxing|vs comparison|budget phone|flagship phone|gadget deal|record low price|all.?time low|exchange offer|now cheaper|gets? cheaper|now available (?:for|in india|at)|available (?:for purchase|to buy)|buying guide|our favou?rite|we tested|best accessories|best gadgets|best gifts|perfect (?:standby|desk|travel|bedside) companion)\b/i;
// Branded recurring gear-roundup columns ("MagSafe Monday: …", "Tech Tuesday: …")
// aren't news — they're a weekly blog format. Matched only at the very start
// of the headline so a genuine story like "Fed to meet Monday on rate
// decision" is never caught (real headlines don't open "Word Weekday:").
export const RECURRING_COLUMN_RE = /^\w+\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*:/i;
// "Deals: AirPods 4, rare discounts on…" — a deals-roundup headline format,
// matched only at the very start so a real story like "Deals fall through as
// talks collapse" is never caught.
export const DEALS_ROUNDUP_RE = /^deals?\s*:/i;
export const BLOCKED_SPORTS_RE = /\b(cricket|ipl|bcci|test match|odi|t20i?|football|fifa|tennis|wimbledon|formula[- ]1|f1 race|chess|olympics|hockey|badminton|icc|world cup|fantasy cricket|dream11|match report|scorecard|batting|bowling|wicket|wickets|run chase|penalty kick|goal scored|transfer window)\b/i;
export const BLOCKED_ENTERTAINMENT_RE = /\b(bollywood|tollywood|kollywood|movie|film|actor|actress|celebrity|box office|trailer|oscar|grammy|award show|web series|ott platform|music video|item song|album launch|concert tour|celebrity gossip|entertainment news|celebrity wedding|star spotted)\b/i;

// Default (no opts) blocks sports + entertainment too — right for Digest,
// whose categories are Breaking/India/World/Markets/Tech/Business (no
// dedicated sports/entertainment section).
export function isBlockedHeadline(
  headline: string,
  source?: string,
  opts?: { allowSports?: boolean; allowEntertainment?: boolean },
): boolean {
  if (DEVANAGARI_RE.test(headline)) return true;
  if (BLOCKED_ALWAYS_RE.test(headline)) return true;
  if (RECURRING_COLUMN_RE.test(headline)) return true;
  if (DEALS_ROUNDUP_RE.test(headline)) return true;
  if (!opts?.allowSports && BLOCKED_SPORTS_RE.test(headline)) return true;
  if (!opts?.allowEntertainment && BLOCKED_ENTERTAINMENT_RE.test(headline)) return true;
  if (source === 'India Today' && /\bdiscount\b/i.test(headline)) return true;
  if (NYT_BRIEFING_RE.test(source ?? '') && /here.?s the latest|here are the latest/i.test(headline)) return true;
  return false;
}

// Source-quality weighting — TechCrunch's coverage is consistently better
// than aggregator/consumer-gadget blogs (9to5Mac, Engadget, VentureBeat), but
// they carried equal weight in ranking. Tiers roughly mirror the backend's
// credibilityScore (api-server news.ts, used for Deep Dive confidence) but
// keyed by the display NAME Digest actually has (Story.sources[].name)
// rather than domain.
const SOURCE_TIER_1 = new Set([
  'Reuters', 'Bloomberg', 'AP', 'Associated Press', 'BBC', 'BBC World',
  'The New York Times', 'NYT World', 'The Guardian', 'Financial Times',
  'The Economist', 'The Washington Post', 'WSJ',
]);
const SOURCE_TIER_2 = new Set([
  'TechCrunch', 'The Verge', 'Ars Technica', 'Wired', 'CNBC', 'CNBC TV18',
  'CNN', 'Al Jazeera', 'NPR', 'NPR World', 'Forbes', 'Time',
  'NDTV', 'Hindustan Times', 'The Hindu', 'Indian Express', 'Economic Times',
  'Livemint', 'Mint', 'The Print', 'Scroll.in', 'India Today',
]);
// Not a blocklist — outlets outside tier 1/2 (9to5Mac, Engadget, VentureBeat,
// aggregator blogs, etc.) just get the lowest weight so they no longer win
// ties against better-sourced coverage of the same story.
export function sourceQualityWeight(name?: string): number {
  if (!name) return 0.3;
  if (SOURCE_TIER_1.has(name)) return 1.0;
  if (SOURCE_TIER_2.has(name)) return 0.7;
  return 0.3;
}
