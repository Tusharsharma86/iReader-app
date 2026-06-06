// Notification history on web. Web doesn't receive push notifications, so the
// real source of truth is the Android app's local history. We don't yet sync
// across devices (would need a pair-code flow + backend store). For now this
// screen renders an empty / "open on phone" state so the navigation is
// consistent with mobile.
import React from 'react';
import { useRouter } from '../contexts/RouterContext';

const VIOLET = '#b994ff';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';

export default function NotifHistoryScreen() {
  const { goBack } = useRouter();

  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: '#FFF', paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
        <div onClick={goBack} style={{ width: 36, height: 36, borderRadius: 18, background: CARD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Notifications</div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>Past pushes — tap to reopen</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, paddingTop: 100, paddingInline: 40, textAlign: 'center' }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.8">
          <path d="M9.354 21a1.99 1.99 0 0 0 5.292 0" />
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
        <div style={{ color: '#CCC', fontSize: 16, fontWeight: 700 }}>Available on mobile only</div>
        <div style={{ color: '#666', fontSize: 13, lineHeight: 1.5, maxWidth: 320 }}>
          Push notifications are delivered to the iReader Android app. Open the app to see the full history of breaking news, topic alerts, and digests.
        </div>
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 18px', marginTop: 18, color: '#888', fontSize: 12, maxWidth: 340 }}>
          Cross-device sync (pair code) is coming — for now the history lives on the device that received the push.
        </div>
      </div>
    </div>
  );
}
