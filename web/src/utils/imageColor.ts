// Samples a story's own photo for its dominant colour.
//
// Done in the browser rather than on the server: the backend has no image
// decoder, and adding one to a pnpm workspace with a frozen lockfile risks the
// deploy. Canvas reads throw on cross-origin images that don't send CORS
// headers, so this is progressive enhancement — publishers whose CDNs allow it
// get a real colour, everyone else keeps the hashed palette. The browser
// already has these images in cache, so sampling costs no extra download.

const memo = new Map<string, string>();
// Hosts that refused a CORS read. Sampling one of their images costs a second
// download (the crossOrigin request fails, then the browser fetches again for
// display) and logs a console error, so each host is tried once and then
// skipped for good.
const blockedHosts = new Set<string>();
const LS_KEY = '@ireader_img_colors';
const LS_BLOCKED = '@ireader_img_cors_blocked';
const MAX_PERSISTED = 400;
let loaded = false;

function hydrate(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) memo.set(k, v);
    }
    const blocked = localStorage.getItem(LS_BLOCKED);
    if (blocked) for (const h of JSON.parse(blocked) as string[]) blockedHosts.add(h);
  } catch { /* private mode or corrupt payload — sampling still works */ }
}

let persistTimer: number | null = null;
function persist(): void {
  if (persistTimer != null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      const entries = [...memo.entries()].slice(-MAX_PERSISTED);
      localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* quota — in-memory cache still serves this session */ }
  }, 1200);
}

export function cachedImageColor(url?: string): string | null {
  if (!url) return null;
  hydrate();
  return memo.get(url) ?? null;
}

function hostOf(url: string): string {
  try { return new URL(url, location.href).host; } catch { return ''; }
}

function markHostBlocked(host: string): void {
  if (!host || blockedHosts.has(host)) return;
  blockedHosts.add(host);
  try { localStorage.setItem(LS_BLOCKED, JSON.stringify([...blockedHosts].slice(-80))); } catch { /* quota */ }
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// Cards are dark surfaces with light text, so a bright photo colour has to be
// pulled down in luminance while keeping its hue and some saturation.
function toCardColor(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    if (max === rr) h = (((gg - bb) / d) % 6 + 6) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  const targetL = 0.23;
  const targetS = Math.min(0.72, Math.max(0.42, s));
  const c = (1 - Math.abs(2 * targetL - 1)) * targetS;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = targetL - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return toHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

export function sampleImageColor(url?: string): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  hydrate();
  const hit = memo.get(url);
  if (hit) return Promise.resolve(hit);
  const host = hostOf(url);
  if (blockedHosts.has(host)) return Promise.resolve(null);

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const S = 24;
        const canvas = document.createElement('canvas');
        canvas.width = S; canvas.height = S;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, S, S);
        const { data } = ctx.getImageData(0, 0, S, S);  // throws when tainted

        // Bucket into a 4×4×4 cube and score by frequency × saturation, so a
        // large flat sky doesn't beat the subject's actual colour.
        const buckets = new Map<number, { n: number; r: number; g: number; b: number; sat: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx < 28 || mn > 232) continue;            // skip near-black / near-white
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
          const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sat: 0 };
          e.n++; e.r += r; e.g += g; e.b += b; e.sat += sat;
          buckets.set(key, e);
        }
        let best: { n: number; r: number; g: number; b: number; sat: number } | null = null;
        let bestScore = -1;
        for (const e of buckets.values()) {
          const score = e.n * (0.35 + (e.sat / e.n));
          if (score > bestScore) { bestScore = score; best = e; }
        }
        if (!best) return resolve(null);
        const hex = toCardColor(best.r / best.n, best.g / best.n, best.b / best.n);
        memo.set(url, hex);
        persist();
        resolve(hex);
      } catch {
        markHostBlocked(host);   // tainted canvas — don't retry this host
        resolve(null);
      }
    };
    img.onerror = () => { markHostBlocked(host); resolve(null); };
    img.src = url;
  });
}
