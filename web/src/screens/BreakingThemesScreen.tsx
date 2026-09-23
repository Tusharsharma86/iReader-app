import React, { useEffect, useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import {
  THEME_FAMILIES, ALL_BREAKING_THEMES,
  loadBreakingThemeMutes, setBreakingThemeMuted,
} from '../utils/breakingThemes';

const VIOLET = '#b994ff';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 26, borderRadius: 13, background: value ? 'rgba(185,148,255,0.32)' : '#1A1A1A', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 20, height: 20, borderRadius: 10, background: value ? VIOLET : '#666', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} />
    </div>
  );
}

export default function BreakingThemesScreen() {
  const { goBack } = useRouter();
  const [muted, setMuted] = useState<Set<string>>(new Set());
  useEffect(() => { setMuted(loadBreakingThemeMutes()); }, []);

  const toggle = (name: string) => {
    const next = setBreakingThemeMuted(name, !muted.has(name));
    setMuted(new Set(next));
  };

  const setAll = (themes: { name: string }[], mute: boolean) => {
    let next = loadBreakingThemeMutes();
    for (const t of themes) {
      if (mute) next.add(t.name); else next.delete(t.name);
    }
    setBreakingThemeMuted(themes[0].name, next.has(themes[0].name)); // triggers save
    // Save full set
    try { localStorage.setItem('ireader_breaking_theme_mutes_v1', JSON.stringify(Array.from(next))); } catch {}
    setMuted(next);
  };

  const totalActive = ALL_BREAKING_THEMES.length - muted.size;

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#050505', color: '#FFF', paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
        <div onClick={goBack} style={{ width: 36, height: 36, borderRadius: 18, background: CARD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Breaking Themes</div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{totalActive} of {ALL_BREAKING_THEMES.length} themes on</div>
        </div>
      </div>

      <div style={{ color: '#888', fontSize: 12, lineHeight: 1.5, padding: '4px 20px 18px' }}>
        Mute themes you don&apos;t want push notifications for. Applies to both Main Breaking and AI Feed Breaking.
      </div>

      {THEME_FAMILIES.map(family => {
        const onCount = family.themes.filter(t => !muted.has(t.name)).length;
        return (
          <div key={family.family} style={{ padding: '0 16px', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>{family.icon}</span>
              <span style={{ color: '#9a9aa5', fontSize: 11, fontWeight: 700, letterSpacing: 1.2 }}>{family.family.toUpperCase()}</span>
              <span style={{ color: '#555', fontSize: 11, marginLeft: 'auto' }}>{onCount}/{family.themes.length}</span>
              <span onClick={() => setAll(family.themes, onCount > 0)} style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(185,148,255,0.12)', border: '1px solid rgba(185,148,255,0.28)', color: VIOLET, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                {onCount > 0 ? 'Mute all' : 'Unmute all'}
              </span>
            </div>
            <div style={{ background: CARD_BG, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              {family.themes.map((t, i) => {
                const isMuted = muted.has(t.name);
                return (
                  <div key={t.name} onClick={() => toggle(t.name)} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderTop: i > 0 ? '1px solid #1F1F22' : 'none', cursor: 'pointer' }}>
                    <span style={{ flex: 1, color: isMuted ? '#555' : '#DDD', fontSize: 14, fontWeight: 500 }}>{t.name}</span>
                    <Toggle value={!isMuted} onChange={() => toggle(t.name)} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
