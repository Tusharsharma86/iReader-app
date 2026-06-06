// Notification Settings sub-screen — web port. Mirrors Android structure:
//   BREAKING:    Main Breaking toggle + AI Feed Breaking toggle + Themes
//   TOPIC:       Topic Alerts toggle + Topics & Sources (inline)
//   DAILY:       Daily Digest toggle
//   HISTORY:     Link to NotifHistoryScreen
//
// Web doesn't fire local notifications, so the toggles here are stored in
// settings (synced with backend push prefs) but actual delivery only happens
// on the mobile app. UI parity is the goal.
import React from 'react';
import { useRouter } from '../contexts/RouterContext';
import { useSettings } from '../contexts/SettingsContext';

const VIOLET = '#b994ff';
const BLUE = '#4A90D9';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';

function Toggle({ value, onChange, accent = BLUE }: { value: boolean; onChange: (v: boolean) => void; accent?: string }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 51, height: 31, borderRadius: 16, background: value ? (accent === VIOLET ? 'rgba(185,148,255,0.32)' : '#1C3A6A') : '#1A1A1A', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 22 : 2, width: 25, height: 25, borderRadius: 13, background: value ? accent : '#444', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} />
    </div>
  );
}

const sectionHeader: React.CSSProperties = { color: '#444', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: '16px 20px 8px' };
const card: React.CSSProperties = { background: CARD_BG, margin: '0 16px', borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 12 };
const rowBorder: React.CSSProperties = { ...row, borderTop: '1px solid #1F1F22' };
const rowLabel: React.CSSProperties = { color: '#EEE', fontSize: 15, fontWeight: 600 };
const rowSub: React.CSSProperties = { color: '#666', fontSize: 12, marginTop: 2 };

export default function NotificationSettingsScreen() {
  const { goBack, navigate } = useRouter();
  const {
    notifBreaking, setNotifBreaking,
    notifAiFeed, setNotifAiFeed,
    notifTech, setNotifTech,
    notifDigest, setNotifDigest,
    favSources,
    topicInterests,
  } = useSettings();

  const starredCount = Object.values(topicInterests).filter(v => v > 0).length;

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#050505', color: '#FFF', paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
        <div onClick={goBack} style={{ width: 36, height: 36, borderRadius: 18, background: CARD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Notifications</div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>Pushes, themes, digest, history</div>
        </div>
      </div>

      {/* BREAKING */}
      <div style={sectionHeader}>BREAKING</div>
      <div style={card}>
        <div style={row}>
          <div style={{ flex: 1 }}>
            <div style={rowLabel}>Main Breaking</div>
            <div style={rowSub}>3+ source confirmation</div>
          </div>
          <Toggle value={notifBreaking} onChange={setNotifBreaking} />
        </div>
        <div style={rowBorder}>
          <div style={{ flex: 1 }}>
            <div style={rowLabel}>AI Feed Breaking</div>
            <div style={rowSub}>Tap opens Deep Dive</div>
          </div>
          <Toggle value={notifAiFeed} onChange={setNotifAiFeed} accent={VIOLET} />
        </div>
        <div onClick={() => navigate({ name: 'BreakingThemes' })} style={{ ...rowBorder, paddingLeft: 36, cursor: 'pointer' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#CCC', fontSize: 14, fontWeight: 500 }}>Themes</div>
            <div style={rowSub}>Mute themes — applies to Main + AI Feed</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      {/* TOPIC ALERTS */}
      <div style={sectionHeader}>TOPIC ALERTS</div>
      <div style={card}>
        <div style={row}>
          <div style={{ flex: 1 }}>
            <div style={rowLabel}>Topic Alerts</div>
            <div style={rowSub}>{starredCount > 0 ? `${starredCount} topics starred · ${favSources.length} fav sources` : 'Alerts for topics you star'}</div>
          </div>
          <Toggle value={notifTech} onChange={setNotifTech} />
        </div>
        <div onClick={() => navigate({ name: 'TopicInterests' })} style={{ ...rowBorder, paddingLeft: 36, cursor: 'pointer' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#CCC', fontSize: 14, fontWeight: 500 }}>Topics & Sources</div>
            <div style={rowSub}>Choose what triggers your alerts</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      {/* DAILY DIGEST */}
      <div style={sectionHeader}>DAILY DIGEST</div>
      <div style={card}>
        <div style={row}>
          <div style={{ flex: 1 }}>
            <div style={rowLabel}>Daily Digest</div>
            <div style={rowSub}>8am + 6pm summary</div>
          </div>
          <Toggle value={notifDigest} onChange={setNotifDigest} />
        </div>
      </div>

      {/* HISTORY */}
      <div style={sectionHeader}>HISTORY</div>
      <div style={card}>
        <div onClick={() => navigate({ name: 'NotifHistory' })} style={{ ...row, cursor: 'pointer' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(185,148,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={VIOLET} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={rowLabel}>Notification History</div>
            <div style={rowSub}>Past pushes — tap to reopen</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </div>
  );
}
