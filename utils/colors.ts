export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').trim();
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  if (full.length !== 6) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#0A0A0A';
  const [r, g, b] = rgb.map(c => Math.round(c * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}

export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#FFFFFF';
  const [r, g, b] = rgb.map(c => Math.round(c + (255 - c) * amount));
  return `rgb(${r},${g},${b})`;
}

// Deterministic color from article id/headline — same article always gets same color
export function getArticleColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const colors = [
    '#1A3A2A', // dark forest green
    '#0A1A3A', // deep navy blue
    '#2A1A3A', // deep purple
    '#3A1A0A', // dark burnt orange
    '#1A2A3A', // dark steel blue
    '#2A3A0A', // dark olive green
    '#3A0A1A', // deep burgundy
    '#0A3A3A', // dark teal
    '#2A2A0A', // dark khaki
    '#1A0A3A', // midnight purple
    '#3A2A0A', // dark amber
    '#0A2A1A', // dark emerald
  ];
  return colors[Math.abs(hash) % colors.length];
}
