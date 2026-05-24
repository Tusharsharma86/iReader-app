import React from 'react';
import type { TabName, NavScreen } from '../types';
import { useRouter } from '../contexts/RouterContext';
import { useTabBar } from '../contexts/TabBarContext';

type IconName = 'feed' | 'digest' | 'saved' | 'profile';

const TAB_ITEMS: Array<{ tab: TabName; screen: NavScreen; icon: IconName; label: string }> = [
  { tab: 'feed',     screen: { name: 'Feed' },     icon: 'feed',    label: 'Feed'    },
  { tab: 'digest',   screen: { name: 'Digest' },   icon: 'digest',  label: 'Digest'  },
  { tab: 'saved',    screen: { name: 'Saved' },    icon: 'saved',   label: 'Saved'   },
  { tab: 'settings', screen: { name: 'Settings' }, icon: 'profile', label: 'Profile' },
];

function TabIcon({ name, active }: { name: IconName; active: boolean }) {
  const color = active ? '#fff' : 'rgba(255,255,255,0.55)';
  const size = 22;
  // Ionicons-matched paths
  const common = {
    width: size, height: size, viewBox: '0 0 512 512',
    fill: active ? color : 'none',
    stroke: color, strokeWidth: 32,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  if (name === 'feed') {
    return (
      <svg {...common} fill="none">
        <rect x="64" y="80" width="384" height="352" rx="32" />
        <path d="M144 160h224M144 224h224M144 288h160" />
        {active && <rect x="64" y="80" width="384" height="352" rx="32" fill={color} fillOpacity="0.15" />}
      </svg>
    );
  }
  if (name === 'digest') {
    // flash / lightning bolt
    return (
      <svg {...common} fill={active ? color : 'none'}>
        <path d="M315.27 33L96 304h128l-31.51 173.23a2.81 2.81 0 005 2.17L416 208H288l31.61-173.25a2.81 2.81 0 00-4.34-2.92z" />
      </svg>
    );
  }
  if (name === 'saved') {
    // bookmark
    return (
      <svg {...common} fill={active ? color : 'none'}>
        <path d="M352 48H160a48 48 0 00-48 48v368l144-128 144 128V96a48 48 0 00-48-48z" />
      </svg>
    );
  }
  // profile / person
  return (
    <svg {...common} fill={active ? color : 'none'}>
      <path d="M344 144c-3.92 52.87-44 96-88 96s-84.15-43.12-88-96c-4-55 35-96 88-96s92 42 88 96z" />
      <path d="M256 304c-87 0-175.3 48-191.64 138.6C62.39 453.52 68.57 464 80 464h352c11.44 0 17.62-10.48 15.65-21.4C431.3 352 343 304 256 304z" />
    </svg>
  );
}

export function TabBar() {
  const { activeTab, setTab } = useRouter();
  const { visible } = useTabBar();

  return (
    <div
      style={{
        position: 'fixed',
        left: 20, right: 20,
        bottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        maxWidth: 440,
        margin: '0 auto',
        display: 'flex', justifyContent: 'center',
        transform: visible ? 'translateY(0)' : 'translateY(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s',
        zIndex: 100,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center',
          padding: '8px',
          borderRadius: 999,
          background: 'rgba(15,15,15,0.78)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}
      >
        {TAB_ITEMS.map(item => {
          const active = activeTab === item.tab;
          return (
            <button
              key={item.tab}
              onClick={() => setTab(item.tab)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label={item.label}
            >
              <div
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <TabIcon name={item.icon} active={active} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
