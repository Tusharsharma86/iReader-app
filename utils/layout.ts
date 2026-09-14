// Feed card sizing, shared by every screen that lays out StoryCards.
//
// Cards span the screen minus a 14dp gutter on each side, capped only on very
// wide displays. There is deliberately no "tablet" breakpoint that shrinks
// cards: the feed is a single column, so such a breakpoint never added
// columns — it only centred a narrow card on a big screen. A Galaxy Z Fold 8
// Ultra's unfolded panel crosses the old 768dp breakpoint, and 46% of it is
// almost exactly the folded cover-screen card width, so unfolding looked like
// no resize at all.
export const CARD_GUTTER = 28;
export const MAX_CARD_WIDTH = 960;

export function feedCardWidth(screenWidth: number): number {
  return Math.max(0, Math.round(Math.min(screenWidth - CARD_GUTTER, MAX_CARD_WIDTH)));
}
