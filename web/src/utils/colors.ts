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

export function saturate(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = rgb[0]/255, g = rgb[1]/255, b = rgb[2]/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max+min)/2;
  const d = max-min;
  let h = 0, s = 0;
  if (d > 0) {
    s = d / (1-Math.abs(2*l-1));
    if (max===r) h = (((g-b)/d)%6+6)%6;
    else if (max===g) h = (b-r)/d+2;
    else h = (r-g)/d+4;
    h *= 60;
  }
  s = Math.min(1, s+amount);
  const c = (1-Math.abs(2*l-1))*s;
  const x = c*(1-Math.abs((h/60)%2-1));
  const m = l-c/2;
  let r1=0,g1=0,b1=0;
  if (h<60){r1=c;g1=x;}
  else if(h<120){r1=x;g1=c;}
  else if(h<180){g1=c;b1=x;}
  else if(h<240){g1=x;b1=c;}
  else if(h<300){r1=x;b1=c;}
  else{r1=c;b1=x;}
  const toHex = (v:number) => Math.round((v+m)*255).toString(16).padStart(2,'0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

export function getArticleColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const colors = [
    '#1A3A2A', '#0A1A3A', '#2A1A3A', '#3A1A0A',
    '#1A2A3A', '#2A3A0A', '#3A0A1A', '#0A3A3A',
    '#2A2A0A', '#1A0A3A', '#3A2A0A', '#0A2A1A',
  ];
  return colors[Math.abs(hash) % colors.length];
}
