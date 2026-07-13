import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Self-hosted article typography — 'Inter' and 'Georgia' were referenced by
// name in ArticleScreen's font-family CSS but never actually loaded, so
// every device silently fell back to its own OS default font (Roboto on
// Android, SF on iOS/Mac) regardless of which the user picked in Customize.
// Georgia itself is a Microsoft-licensed font we can't redistribute, so the
// serif option uses Merriweather (SIL OFL), a similarly screen-optimized
// serif, instead.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/400-italic.css';
import '@fontsource/inter/500-italic.css';
import '@fontsource/merriweather/400.css';
import '@fontsource/merriweather/700.css';
import '@fontsource/merriweather/400-italic.css';
import '@fontsource/merriweather/500-italic.css';

// Lock to portrait — works on Android Chrome and installed PWAs
try {
  // @ts-ignore — lock() exists in Chrome/Android but not in TS DOM lib
  screen.orientation?.lock('portrait').catch(() => {});
} catch {}

// Pre-warm Render backend so by the time the user opens AI Feed / any AI
// endpoint, the dyno is already awake. Cheap fire-and-forget GET.
try {
  fetch('https://ireader.onrender.com/api/news/sources', { method: 'GET', cache: 'no-store' }).catch(() => {});
} catch {}

const root = document.getElementById('root')!;
createRoot(root).render(<App />);
