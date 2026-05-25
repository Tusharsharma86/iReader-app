import React from 'react';
import { useSettings, } from '../contexts/SettingsContext';
import { useSource } from '../contexts/SourceContext';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';
import type { FontSize } from '../types';

const FONT_SIZES: FontSize[] = ['Small', 'Medium', 'Large', 'XLarge'];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 51, height: 31, borderRadius: 16, background: value ? '#1C3A6A' : '#1A1A1A', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 22 : 2, width: 25, height: 25, borderRadius: 13, background: value ? '#4A90D9' : '#444', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} />
    </div>
  );
}

const card: React.CSSProperties = { margin: '0 16px 28px', background: '#0E0E0E', borderRadius: 14, border: '1px solid #1A1A1A', overflow: 'hidden' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' };
const rowBorder: React.CSSProperties = { ...row, borderTop: '1px solid #1A1A1A' };
const sectionHeader: React.CSSProperties = { color: '#444', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: '0 20px 10px' };

export default function SettingsScreen() {
  const { navigate, goBack, canGoBack } = useRouter();
  const { fontSize, setFontSize, notifBreaking, setNotifBreaking, notifTech, setNotifTech, notifDigest, setNotifDigest, notifSources, setNotifSources, favSources, favTopics, activeTopics, resetSettings } = useSettings();
  const favCount = favSources.length + favTopics.length;
  const { resetSources } = useSource();
  const { reportScroll } = useTabBar();

  const enabledTopicsCount = Object.values(activeTopics).filter(Boolean).length;

  return (
    <div
      onScroll={(e) => reportScroll((e.target as HTMLDivElement).scrollTop)}
      style={{ height: '100%', overflowY: 'auto', background: '#000', WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 24px' }}>
        {canGoBack && (
          <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', color: '#4A90D9', fontSize: 22, lineHeight: 1 }}>‹</button>
        )}
        <div style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>Settings</div>
      </div>

      <div style={sectionHeader}>READING PREFERENCES</div>
      <div style={card}>
        <div style={{ color: '#888', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, padding: '16px 16px 10px' }}>Article Font Size</div>
        <div style={{ display: 'flex', margin: '0 12px 12px', background: '#1A1A1A', borderRadius: 10, padding: 3, gap: 2 }}>
          {FONT_SIZES.map(fs => (
            <button key={fs} onClick={() => setFontSize(fs)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: fontSize === fs ? '#4A90D9' : 'transparent', color: fontSize === fs ? '#fff' : '#555', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}>
              {fs}
            </button>
          ))}
        </div>
      </div>

      <div style={sectionHeader}>NOTIFICATIONS</div>
      <div style={card}>
        {[
          { label: 'Breaking News', sub: 'Instant alerts for major stories', val: notifBreaking, set: setNotifBreaking },
          { label: 'Tech News', sub: 'Alerts for new technology stories', val: notifTech, set: setNotifTech },
          { label: 'Daily Digest', sub: 'Morning summary of top stories', val: notifDigest, set: setNotifDigest },
          { label: 'New from my sources', sub: 'When selected sources publish', val: notifSources, set: setNotifSources },
        ].map((item, i) => (
          <div key={item.label} style={i === 0 ? row : rowBorder}>
            <div style={{ flex: 1, marginRight: 12 }}>
              <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>{item.label}</div>
              <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>{item.sub}</div>
            </div>
            <Toggle value={item.val} onChange={item.set} />
          </div>
        ))}
        <div style={{ ...rowBorder, cursor: 'pointer' }} onClick={() => navigate({ name: 'FavSources' })}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Favorite Sources & Topics</div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>
              {favCount > 0 ? `${favCount} selected — tap to change` : 'Tap to choose sources or topics'}
            </div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      <div style={sectionHeader}>FEED</div>
      <div style={card}>
        <div style={{ ...row, cursor: 'pointer' }} onClick={() => navigate({ name: 'Topics' })}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Topics</div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>{enabledTopicsCount} of 6 categories enabled</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div style={{ ...rowBorder, cursor: 'pointer' }} onClick={() => navigate({ name: 'Sources' })}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Sources</div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Manage individual news sources</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      <div style={sectionHeader}>MY STATS</div>
      <div style={card}>
        <div style={{ ...row, cursor: 'pointer' }} onClick={() => navigate({ name: 'Usage' })}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Usage & Insights</div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Articles read, AI usage, estimated cost</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      <div style={sectionHeader}>ABOUT</div>
      <div style={card}>
        <div style={row}>
          <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Version</div>
          <div style={{ color: '#444', fontSize: 15 }}>1.0.0</div>
        </div>
        <div style={rowBorder}>
          <div style={{ color: '#DDD', fontSize: 15, fontWeight: 500 }}>Platform</div>
          <div style={{ color: '#444', fontSize: 15 }}>Web (React + Vite)</div>
        </div>
        <div style={{ ...rowBorder, cursor: 'pointer' }} onClick={() => { resetSettings(); resetSources(); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
            <span style={{ color: '#FF4444', fontSize: 15, fontWeight: 500 }}>Reset to Defaults</span>
          </div>
        </div>
      </div>

      <div style={sectionHeader}>BIAS RATINGS</div>
      <div style={{ margin: '0 16px', background: '#111', borderRadius: 12, overflow: 'hidden', padding: '14px 16px' }}>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 1.6, margin: '0 0 12px' }}>
          Bias ratings are adapted from publicly available media bias resources (AllSides, Ad Fontes Media). Used for informational purposes. Not all sources rated.
        </p>
        {[
          { color: '#1E5CFF', label: 'Left / Lean Left' },
          { color: '#9B9B9B', label: 'Center' },
          { color: '#FF3B30', label: 'Right / Lean Right' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 40 }} />
    </div>
  );
}
