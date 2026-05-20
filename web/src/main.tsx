import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Lock to portrait — works on Android Chrome and installed PWAs
try {
  // @ts-ignore — lock() exists in Chrome/Android but not in TS DOM lib
  screen.orientation?.lock('portrait').catch(() => {});
} catch {}

const root = document.getElementById('root')!;
createRoot(root).render(<App />);
