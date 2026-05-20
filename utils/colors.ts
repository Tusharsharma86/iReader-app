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
    '#1A4A8A', // vivid navy blue
    '#8A1A2A', // vivid crimson
    '#1A6A4A', // vivid emerald
    '#7A3A0A', // vivid amber
    '#3A1A7A', // vivid indigo
    '#0A5A6A', // vivid teal
    '#6A1A5A', // vivid magenta
    '#1A5A2A', // vivid forest
    '#7A4A0A', // vivid burnt orange
    '#0A3A7A', // vivid cobalt
    '#5A0A1A', // vivid ruby
    '#2A5A6A', // vivid cyan slate
  ];
  return colors[Math.abs(hash) % colors.length];
}
