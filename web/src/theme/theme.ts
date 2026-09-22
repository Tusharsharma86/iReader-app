// ── Design tokens ────────────────────────────────────────────────────────────
// Every screen styles inline with hex literals, so theming works by mapping
// those literals onto CSS custom properties and swapping the property values.
// Two ramps: text (foreground) and surface (backgrounds, borders, shadows).
//
// This replaces an older `filter: invert(1) hue-rotate(180deg)` light mode,
// which also inverted photographs — news images came out as negatives.

export type ThemeSkin = 'midnight' | 'oled' | 'daylight' | 'paper' | 'auto';
export type AccentPreset = 'violet' | 'cyan' | 'amber' | 'rose' | 'mono' | 'dynamic';
export type MotionLevel = 'full' | 'subtle' | 'off';
export type FeedLayout = 'magazine' | 'standard' | 'list';

export interface TokenSet {
  bg: string; surface: string; surface2: string; surface3: string;
  line: string; line2: string; line3: string;
  text: string; text2: string; text3: string; text4: string;
  muted: string; muted2: string; muted3: string; muted4: string; muted5: string;
  pill: string; pillText: string;
  // Status + topic hues. Saturated neons read fine on near-black but collapse
  // to ~1.5:1 on paper, so light skins carry darkened variants.
  danger: string; success: string; warn: string; star: string; info: string; topic: string;
  fgRgb: string; shadowRgb: string;
  scrim: string;
}

const MIDNIGHT: TokenSet = {
  bg: '#080808', surface: '#0E0E0E', surface2: '#111111', surface3: '#141414',
  line: '#1A1A1A', line2: '#222222', line3: '#2A2A2A',
  text: '#FFFFFF', text2: '#EEEEEE', text3: '#DDDDDD', text4: '#CCCCCC',
  muted: '#999999', muted2: '#888888', muted3: '#666666', muted4: '#555555', muted5: '#444444',
  pill: '#FFFFFF', pillText: '#000000',
  danger: '#FF3B30', success: '#34C759', warn: '#FF9500',
  star: '#FFC542', info: '#4ECDC4', topic: '#A29BFE',
  fgRgb: '255,255,255', shadowRgb: '0,0,0',
  scrim: 'rgba(0,0,0,0.6)',
};

const OLED: TokenSet = {
  ...MIDNIGHT,
  bg: '#000000', surface: '#080808', surface2: '#0C0C0C', surface3: '#101010',
  line: '#181818', line2: '#202020', line3: '#282828',
};

// Light ramps invert the relationship: "muted" stays low-contrast against a
// light ground, so the numbers climb rather than fall.
const DAYLIGHT: TokenSet = {
  bg: '#FFFFFF', surface: '#F7F7F8', surface2: '#F1F1F3', surface3: '#ECECEF',
  line: '#E3E3E7', line2: '#D8D8DE', line3: '#C9C9D1',
  text: '#0B0B0C', text2: '#17171A', text3: '#2A2A30', text4: '#3D3D45',
  muted: '#5A5A66', muted2: '#6B6B77', muted3: '#84848F', muted4: '#9A9AA4', muted5: '#B0B0B9',
  pill: '#111111', pillText: '#FFFFFF',
  danger: '#C0231A', success: '#1B7F3B', warn: '#A85A00',
  star: '#8A6400', info: '#0E7C74', topic: '#5A4BC4',
  fgRgb: '0,0,0', shadowRgb: '0,0,0',
  scrim: 'rgba(0,0,0,0.45)',
};

const PAPER: TokenSet = {
  ...DAYLIGHT,
  bg: '#F4F1EA', surface: '#EFEBE2', surface2: '#E9E4D9', surface3: '#E3DDD1',
  line: '#DCD5C7', line2: '#D0C8B7', line3: '#BEB4A0',
  text: '#1F1B14', text2: '#2A251C', text3: '#3A3428', text4: '#4A4234',
  muted: '#6B6252', muted2: '#7A7160', muted3: '#8E8474', muted4: '#A29886', muted5: '#B5AB99',
  pill: '#1F1B14', pillText: '#F4F1EA',
};

export const SKINS: Record<Exclude<ThemeSkin, 'auto'>, TokenSet> = {
  midnight: MIDNIGHT, oled: OLED, daylight: DAYLIGHT, paper: PAPER,
};

export function isLightSkin(skin: Exclude<ThemeSkin, 'auto'>): boolean {
  return skin === 'daylight' || skin === 'paper';
}

export const ACCENTS: Record<Exclude<AccentPreset, 'dynamic'>, { accent: string; accent2: string }> = {
  violet: { accent: '#B994FF', accent2: '#4A90D9' },
  cyan:   { accent: '#22D3EE', accent2: '#3B82F6' },
  amber:  { accent: '#FBBF24', accent2: '#F97316' },
  rose:   { accent: '#FB7185', accent2: '#E879F9' },
  mono:   { accent: '#D4D4D8', accent2: '#A1A1AA' },
};

// Time-of-day ambience. A slight hue wash over the page so early morning and
// late night don't look identical. Deliberately subtle — it should register
// as atmosphere, never as a colour cast on photographs.
export function ambienceTint(hour: number, light: boolean): string {
  const a = light ? 0.05 : 0.09;
  if (hour < 6)  return `rgba(60,80,170,${a})`;      // night — cool blue
  if (hour < 11) return `rgba(255,170,90,${a * 0.8})`; // morning — warm sun
  if (hour < 17) return 'transparent';                 // midday — neutral
  if (hour < 21) return `rgba(255,120,60,${a * 0.9})`; // evening — amber
  return `rgba(70,60,160,${a})`;                       // late — indigo
}

export const MOTION_SCALE: Record<MotionLevel, number> = { full: 1, subtle: 0.5, off: 0 };

export interface ApplyThemeArgs {
  skin: Exclude<ThemeSkin, 'auto'>;
  accent: string;
  accent2: string;
  ambience: boolean;
  motion: MotionLevel;
  hour?: number;
}

export function applyTheme({ skin, accent, accent2, ambience, motion, hour }: ApplyThemeArgs): void {
  if (typeof document === 'undefined') return;
  const t = SKINS[skin];
  const light = isLightSkin(skin);
  const s = document.documentElement.style;
  const set = (k: string, v: string) => s.setProperty(k, v);

  set('--bg', t.bg); set('--surface', t.surface); set('--surface-2', t.surface2); set('--surface-3', t.surface3);
  set('--line', t.line); set('--line-2', t.line2); set('--line-3', t.line3);
  set('--text', t.text); set('--text-2', t.text2); set('--text-3', t.text3); set('--text-4', t.text4);
  set('--muted', t.muted); set('--muted-2', t.muted2); set('--muted-3', t.muted3);
  set('--muted-4', t.muted4); set('--muted-5', t.muted5);
  set('--pill', t.pill); set('--pill-text', t.pillText);
  set('--danger', t.danger); set('--success', t.success); set('--warn', t.warn);
  set('--star', t.star); set('--info', t.info); set('--topic', t.topic);
  set('--fg-rgb', t.fgRgb); set('--shadow-rgb', t.shadowRgb); set('--scrim', t.scrim);
  set('--accent', accent); set('--accent-2', accent2);
  set('--ambience', ambience ? ambienceTint(hour ?? new Date().getHours(), light) : 'transparent');
  set('--motion', String(MOTION_SCALE[motion]));
  set('--dur-fast', `${Math.round(140 * MOTION_SCALE[motion])}ms`);
  set('--dur-base', `${Math.round(240 * MOTION_SCALE[motion])}ms`);

  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  document.documentElement.style.colorScheme = light ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bg);
}
