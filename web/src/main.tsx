import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

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
