// Hero transition: the tapped card's photo morphs into the article header
// instead of the screens hard-cutting.
//
// Uses the View Transitions API where available (Chromium, Safari 18+) and
// simply navigates everywhere else — the feature is decorative, so it must
// never gate navigation. React renders asynchronously, so the state update is
// flushed synchronously inside the callback; otherwise the API snapshots the
// old DOM twice and nothing animates.
import { flushSync } from 'react-dom';

type VTDocument = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

export const HERO_NAME = 'hero-active';

export function withHeroTransition(el: HTMLElement | null, run: () => void, enabled = true): void {
  const doc = document as VTDocument;
  if (!enabled || typeof doc.startViewTransition !== 'function') { run(); return; }

  // The name must be unique while the transition runs, so it's applied to the
  // one element being tapped and removed as soon as the animation settles.
  if (el) el.style.viewTransitionName = HERO_NAME;
  let transition: { finished: Promise<void> };
  try {
    transition = doc.startViewTransition(() => { flushSync(run); });
  } catch {
    if (el) el.style.viewTransitionName = '';
    run();
    return;
  }
  transition.finished
    .catch(() => {})
    .finally(() => { if (el) el.style.viewTransitionName = ''; });
}
