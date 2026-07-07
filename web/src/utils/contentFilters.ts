// Shared low-quality/promotional content filters. Extracted from
// FeedScreen.tsx's inline isBlocked() so other surfaces (Digest, Explore)
// can apply the exact same "not real news" rules instead of re-deriving
// their own — Digest previously had no filter at all, which is why
// promotional/deal articles ("iPhone available at X% off") were showing
// up in its Tech section. FeedScreen keeps its own copy for now (unchanged,
// zero risk); this is the version new consumers should use going forward.

export const DEVANAGARI_RE = /[ऀ-ॿ]/;
const NYT_BRIEFING_RE = /nyt|new york times/i;

export const BLOCKED_ALWAYS_RE = /\b(promo.?codes?|coupons?|discount.?codes?|cashback|voucher|sale.?offer|deal.?alert|exclusive.?deal|special.?offer|affiliate|referral.?codes?|invite.?codes?|offer.?codes?|redeem.?codes?|flat \d+%|flash sale|best deals?|top deals?|today.{0,8}deals?|today.{0,8}offers?|limited.{0,8}offer|get \d+% off|save \d+%|\d+%\s*off|phone price|smartphone price|price drops?|price cut|price hike|lowest price|best price|launched at|starts at rs|starts at \$|goes on sale|specs leak|hands.?on review|camera test|(?:cpu|gpu|phone|device|gaming|graphics|processor)\s+benchmark|unboxing|vs comparison|budget phone|flagship phone|gadget deal|record low price|all.?time low|exchange offer|buying guide|our favou?rite|we tested|best accessories|best gadgets|best gifts|perfect (?:standby|desk|travel|bedside) companion)\b/i;
// Branded recurring gear-roundup columns ("MagSafe Monday: …", "Tech Tuesday: …")
// aren't news — they're a weekly blog format. Matched only at the very start
// of the headline so a genuine story like "Fed to meet Monday on rate
// decision" is never caught (real headlines don't open "Word Weekday:").
export const RECURRING_COLUMN_RE = /^\w+\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*:/i;
export const BLOCKED_SPORTS_RE = /\b(cricket|ipl|bcci|test match|odi|t20i?|football|fifa|tennis|wimbledon|formula[- ]1|f1 race|chess|olympics|hockey|badminton|icc|world cup|fantasy cricket|dream11|match report|scorecard|batting|bowling|wicket|wickets|run chase|penalty kick|goal scored|transfer window)\b/i;
export const BLOCKED_ENTERTAINMENT_RE = /\b(bollywood|tollywood|kollywood|movie|film|actor|actress|celebrity|box office|trailer|oscar|grammy|award show|web series|ott platform|music video|item song|album launch|concert tour|celebrity gossip|entertainment news|celebrity wedding|star spotted)\b/i;

// Default (no opts) blocks sports + entertainment too — right for any
// consumer that doesn't have a dedicated sports/entertainment section
// (Digest's categories are Breaking/India/World/Markets/Tech/Business).
// FeedScreen-style consumers with a Customize toggle should pass
// allowSports/allowEntertainment from that toggle to preserve current
// per-user behaviour.
export function isBlockedHeadline(
  headline: string,
  source?: string,
  opts?: { allowSports?: boolean; allowEntertainment?: boolean },
): boolean {
  if (DEVANAGARI_RE.test(headline)) return true;
  if (BLOCKED_ALWAYS_RE.test(headline)) return true;
  if (RECURRING_COLUMN_RE.test(headline)) return true;
  if (!opts?.allowSports && BLOCKED_SPORTS_RE.test(headline)) return true;
  if (!opts?.allowEntertainment && BLOCKED_ENTERTAINMENT_RE.test(headline)) return true;
  if (source === 'India Today' && /\bdiscount\b/i.test(headline)) return true;
  if (NYT_BRIEFING_RE.test(source ?? '') && /here.?s the latest|here are the latest/i.test(headline)) return true;
  return false;
}
