// Customize App — web-only screen for UI/UX tweaks.
//   FEED:     show/hide cluster summary · bias dots · meta pill · card images
//             · card density (compact/comfortable/spacious)
//   ARTICLE:  default tab · show stats card · verify dedup · referenced sources
//   AI:       summary length · key points count · show key points footer
//   BEHAVIOR: default topic · open links in-app vs external · pull-to-refresh
//   DATA:     clear caches · reset customize settings
//
// All settings persist via SettingsContext localStorage with defaults that
// match current behavior — existing users see no change until they toggle.
import React, { useCallback } from 'react';
import { useRouter } from '../contexts/RouterContext';
import {
  useSettings,
  type CardDensity, type ArticleTab, type SummaryLength, type SummaryFormat,
  type KeyPointsCount, type LinkOpen,
  type ThemeMode, type FontFamily, type LineHeightMode, type ColumnWidth,
  type Eli5Tone, type DeepDiveDepth, type TimeFormat,
} from '../contexts/SettingsContext';
import type { CategoryTopic } from '../types';

const TAB_OPTIONS = [
  { key: 'feed',     label: 'Feed' },
  { key: 'digest',   label: 'Digest' },
  { key: 'aifeed',   label: 'AI Feed' },
  { key: 'saved',    label: 'Saved' },
  { key: 'settings', label: 'Settings' },
];

const ALL_TOPIC_PILLS: { key: CategoryTopic; label: string }[] = [
  { key: 'breaking',         label: 'Breaking' },
  { key: 'technology',       label: 'Tech' },
  { key: 'india-politics',   label: 'India' },
  { key: 'geopolitics',      label: 'World' },
  { key: 'markets',          label: 'Markets' },
  { key: 'business',         label: 'Business' },
  { key: 'myspace',          label: 'My Space' },
];

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'Dark',  value: 'dark' },
  { label: 'Auto',  value: 'auto' },
  { label: 'Light', value: 'light' },
];

const FONT_OPTIONS: { label: string; value: FontFamily }[] = [
  { label: 'Inter',  value: 'inter' },
  { label: 'Serif',  value: 'serif' },
  { label: 'System', value: 'system' },
];

const LINE_HEIGHT_OPTIONS: { label: string; value: LineHeightMode }[] = [
  { label: 'Tight',  value: 'tight' },
  { label: 'Normal', value: 'normal' },
  { label: 'Loose',  value: 'loose' },
];

const COLUMN_WIDTH_OPTIONS: { label: string; value: ColumnWidth }[] = [
  { label: 'Narrow', value: 'narrow' },
  { label: 'Medium', value: 'medium' },
  { label: 'Wide',   value: 'wide' },
];

const ELI5_TONE_OPTIONS: { label: string; value: Eli5Tone }[] = [
  { label: 'Kid',    value: 'kid' },
  { label: 'Casual', value: 'casual' },
  { label: 'Plain',  value: 'plain' },
];

const DEEPDIVE_DEPTH_OPTIONS: { label: string; value: DeepDiveDepth }[] = [
  { label: 'Quick',    value: 'quick' },
  { label: 'Standard', value: 'standard' },
  { label: 'Deep',     value: 'deep' },
];

const TIME_FORMAT_OPTIONS: { label: string; value: TimeFormat }[] = [
  { label: 'Relative', value: 'relative' },
  { label: 'Absolute', value: 'absolute' },
];

const VIOLET = '#b994ff';
const CARD_BG = '#0E0E0E';
const BORDER = '#1A1A1A';

const sectionHeader: React.CSSProperties = {
  color: '#444', fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
  padding: '20px 20px 8px',
};
const card: React.CSSProperties = {
  background: CARD_BG, margin: '0 16px',
  borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden',
};
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
};
const rowBorder: React.CSSProperties = {
  borderTop: '1px solid #1F1F22',
};
const rowLabel: React.CSSProperties = {
  color: '#EEE', fontSize: 15, fontWeight: 600,
};
const rowSub: React.CSSProperties = {
  color: '#666', fontSize: 12, marginTop: 2,
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 46, height: 27, borderRadius: 14,
      background: value ? 'rgba(185,148,255,0.32)' : '#1A1A1A',
      position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
      flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: 3, left: value ? 22 : 3,
        width: 21, height: 21, borderRadius: 11,
        background: value ? VIOLET : '#666',
        transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
      }} />
    </div>
  );
}

function Segmented<T extends string | number>({ options, value, onChange }: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{
      display: 'flex', background: '#0A0A0A', borderRadius: 10,
      padding: 3, gap: 2, marginTop: 10, border: '1px solid #1A1A1A',
    }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, padding: '8px 6px', borderRadius: 8, border: 'none',
              cursor: 'pointer',
              background: active ? VIOLET : 'transparent',
              color: active ? '#000' : '#888',
              fontSize: 11.5, fontWeight: 700, letterSpacing: 0.2,
              transition: 'all 0.15s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RowToggle({ label, sub, value, onChange, border }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; border?: boolean;
}) {
  return (
    <div style={border ? { ...row, ...rowBorder } : row}>
      <div style={{ flex: 1 }}>
        <div style={rowLabel}>{label}</div>
        {sub && <div style={rowSub}>{sub}</div>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function RowSegmented<T extends string | number>({ label, sub, options, value, onChange, border }: {
  label: string; sub?: string;
  options: { label: string; value: T }[];
  value: T; onChange: (v: T) => void; border?: boolean;
}) {
  return (
    <div style={{ ...(border ? rowBorder : {}), padding: '14px 16px' }}>
      <div style={rowLabel}>{label}</div>
      {sub && <div style={rowSub}>{sub}</div>}
      <Segmented options={options} value={value} onChange={onChange} />
    </div>
  );
}

const TOPIC_OPTIONS: { label: string; value: CategoryTopic }[] = [
  { label: 'Breaking',  value: 'breaking' },
  { label: 'Tech',      value: 'technology' },
  { label: 'India',     value: 'india-politics' },
  { label: 'World',     value: 'geopolitics' },
  { label: 'Markets',   value: 'markets' },
  { label: 'Business',  value: 'business' },
  { label: 'My Space',  value: 'myspace' },
];

const ARTICLE_TAB_OPTIONS: { label: string; value: ArticleTab }[] = [
  { label: 'Full',    value: 'Long Form' },
  { label: 'Summary', value: 'Summary' },
  { label: '5 Ws',    value: '5 Ws' },
  { label: 'ELI5',    value: 'ELI5' },
];

const DENSITY_OPTIONS: { label: string; value: CardDensity }[] = [
  { label: 'Compact',     value: 'compact' },
  { label: 'Comfortable', value: 'comfortable' },
  { label: 'Spacious',    value: 'spacious' },
];

const SUMMARY_LENGTH_OPTIONS: { label: string; value: SummaryLength }[] = [
  { label: 'Short',  value: 'short' },
  { label: 'Medium', value: 'medium' },
  { label: 'Long',   value: 'long' },
];

const SUMMARY_FORMAT_OPTIONS: { label: string; value: SummaryFormat }[] = [
  { label: 'Paragraph', value: 'paragraph' },
  { label: 'Bullets',   value: 'bullets' },
];

const KEY_POINTS_OPTIONS: { label: string; value: KeyPointsCount }[] = [
  { label: '3', value: 3 },
  { label: '5', value: 5 },
  { label: '7', value: 7 },
];

const LINK_OPEN_OPTIONS: { label: string; value: LinkOpen }[] = [
  { label: 'In app',    value: 'in-app' },
  { label: 'External',  value: 'external' },
];

export default function CustomizeScreen() {
  const { goBack } = useRouter();
  const s = useSettings();

  const clearCaches = useCallback(() => {
    if (!confirm('Clear all client caches?\nThis removes cached feed, AI summaries, deep dives, and scroll positions. Saved articles are preserved.')) return;
    try {
      // Remove only iReader-related keys; leave settings + auth alone.
      const KEEP = new Set(['@ireader_settings', 'ireader_notif_pair_token_v1']);
      const toDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (KEEP.has(k)) continue;
        if (k.startsWith('summary_') || k.startsWith('@ireader_') || k.startsWith('ireader_') || k.startsWith('aifeed_') || k.startsWith('deepdive_')) {
          toDelete.push(k);
        }
      }
      toDelete.forEach(k => localStorage.removeItem(k));
      alert(`Cleared ${toDelete.length} cache entries.`);
    } catch (e) {
      alert('Failed to clear caches: ' + String(e));
    }
  }, []);

  const resetAll = useCallback(() => {
    if (!confirm('Reset Customize settings to defaults?')) return;
    s.resetCustomize();
  }, [s]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#050505', color: '#FFF', paddingBottom: 80 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px 12px',
      }}>
        <div onClick={goBack} style={{
          width: 36, height: 36, borderRadius: 18, background: CARD_BG,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Customize</div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>UI tweaks · defaults · density</div>
        </div>
      </div>

      {/* FEED */}
      <div style={sectionHeader}>FEED</div>
      <div style={card}>
        <RowToggle label="Cluster summary"
          sub="Show the AI summary text under cluster headlines."
          value={s.showClusterSummary} onChange={s.setShowClusterSummary} />
        <RowToggle border label="Bias dots"
          sub="Show the source-bias colour dot on cards."
          value={s.showBiasDots} onChange={s.setShowBiasDots} />
        <RowToggle border label="Meta pill"
          sub="Show the TREND/BREAKING/N stories pill above headlines."
          value={s.showMetaPill} onChange={s.setShowMetaPill} />
        <RowToggle border label="Card images"
          sub="Hide images for a text-only feed."
          value={s.showCardImages} onChange={s.setShowCardImages} />
        <RowSegmented border label="Card density"
          sub="Vertical spacing between cards."
          options={DENSITY_OPTIONS}
          value={s.cardDensity} onChange={s.setCardDensity} />
      </div>

      {/* ARTICLE */}
      <div style={sectionHeader}>ARTICLE READER</div>
      <div style={card}>
        <RowSegmented label="Default tab"
          sub="Which tab opens first when you tap an article."
          options={ARTICLE_TAB_OPTIONS}
          value={s.defaultArticleTab} onChange={s.setDefaultArticleTab} />
        <RowToggle border label="Stats card"
          sub="Show the ORIGINAL → DISTILLED redundancy card at the bottom."
          value={s.showStatsCard} onChange={s.setShowStatsCard} />
        <RowToggle border label="RSS summary"
          sub="Publisher's own blurb below the headline."
          value={s.showArticleRssSummary} onChange={s.setShowArticleRssSummary} />
        <RowToggle border label="Verify Dedup button"
          sub="Show the </> VERIFY DEDUP button at the bottom of Long Form."
          value={s.showVerifyDedup} onChange={s.setShowVerifyDedup} />
        <RowToggle border label="Referenced sources"
          sub="Show the related-articles list below the body."
          value={s.showReferencedSources} onChange={s.setShowReferencedSources} />
      </div>

      {/* AI */}
      <div style={sectionHeader}>AI SUMMARIES</div>
      <div style={card}>
        <RowSegmented label="Summary length"
          sub="Target word count for the narrative summary."
          options={SUMMARY_LENGTH_OPTIONS}
          value={s.summaryLength} onChange={s.setSummaryLength} />
        <RowSegmented border label="Summary format"
          sub="Paragraph prose, or straight to the bullet points."
          options={SUMMARY_FORMAT_OPTIONS}
          value={s.summaryFormat} onChange={s.setSummaryFormat} />
        <RowSegmented border label="Key points count"
          sub="Number of takeaway bullets requested from the model."
          options={KEY_POINTS_OPTIONS}
          value={s.keyPointsCount} onChange={s.setKeyPointsCount} />
        <RowToggle border label="Show KEY POINTS footer"
          sub="The bullet list below the narrative summary."
          value={s.showKeyPoints} onChange={s.setShowKeyPoints} />
      </div>

      {/* BEHAVIOR */}
      <div style={sectionHeader}>BEHAVIOR</div>
      <div style={card}>
        <RowSegmented label="Default topic"
          sub="Which feed loads when the app opens."
          options={TOPIC_OPTIONS.slice(0, 4)}
          value={s.defaultTopic} onChange={s.setDefaultTopic} />
        <RowSegmented border label="Open external links"
          sub="In the in-app overlay or jump to the publisher site."
          options={LINK_OPEN_OPTIONS}
          value={s.linkOpen} onChange={s.setLinkOpen} />
        <RowToggle border label="Pull to refresh"
          sub="Swipe down on the feed to reload."
          value={s.pullToRefresh} onChange={s.setPullToRefresh} />
      </div>

      {/* ── WAVE 2 ─────────────────────────────────────────────────────── */}

      {/* APPEARANCE */}
      <div style={sectionHeader}>APPEARANCE</div>
      <div style={card}>
        <RowSegmented label="Theme"
          sub="Dark (default), Auto (follows system), Light."
          options={THEME_OPTIONS}
          value={s.themeMode} onChange={s.setThemeMode} />
        <RowToggle border label="Entity highlights"
          sub="Highlight people / companies in article body."
          value={s.showEntityHighlights} onChange={s.setShowEntityHighlights} />
        <RowToggle border label="Quote highlights"
          sub="Show quoted passages in accent colour."
          value={s.showQuoteHighlights} onChange={s.setShowQuoteHighlights} />
        <RowToggle border label="Reading difficulty"
          sub="Show the Hard / Medium / Easy pill on articles."
          value={s.showReadingDifficulty} onChange={s.setShowReadingDifficulty} />
        <RowSegmented border label="Time format"
          sub="Relative (2h ago) vs absolute (12:45 PM)."
          options={TIME_FORMAT_OPTIONS}
          value={s.timeFormat} onChange={s.setTimeFormat} />
      </div>

      {/* READING (article reader) */}
      <div style={sectionHeader}>READING</div>
      <div style={card}>
        <RowSegmented label="Font family"
          sub="Inter (sans), Serif (Georgia), or System default."
          options={FONT_OPTIONS}
          value={s.fontFamily} onChange={s.setFontFamily} />
        <RowSegmented border label="Line height"
          sub="Tighter / looser vertical spacing in article body."
          options={LINE_HEIGHT_OPTIONS}
          value={s.lineHeightMode} onChange={s.setLineHeightMode} />
        <RowSegmented border label="Reading column"
          sub="Narrower or wider article column on big screens."
          options={COLUMN_WIDTH_OPTIONS}
          value={s.columnWidth} onChange={s.setColumnWidth} />
      </div>

      {/* AI (wave 2 — tone + depth + DD sections) */}
      <div style={sectionHeader}>AI · MORE</div>
      <div style={card}>
        <RowSegmented label="ELI5 tone"
          sub="Kid (very simple), Casual (friendly), Plain (just clear)."
          options={ELI5_TONE_OPTIONS}
          value={s.eli5Tone} onChange={s.setEli5Tone} />
        <RowSegmented border label="Deep Dive depth"
          sub="Quick (short), Standard, or Deep (longest)."
          options={DEEPDIVE_DEPTH_OPTIONS}
          value={s.deepDiveDepth} onChange={s.setDeepDiveDepth} />
        <RowToggle border label="Deep Dive: Q&A section"
          value={s.showDeepDiveQA} onChange={s.setShowDeepDiveQA} />
        <RowToggle border label="Deep Dive: Entities section"
          value={s.showDeepDiveEntities} onChange={s.setShowDeepDiveEntities} />
        <RowToggle border label="Deep Dive: Curious Cats"
          value={s.showDeepDiveCurious} onChange={s.setShowDeepDiveCurious} />
      </div>

      {/* NAVIGATION — hide/show tabs and topic pills */}
      <div style={sectionHeader}>NAVIGATION</div>
      <div style={card}>
        <div style={{ padding: '14px 16px' }}>
          <div style={rowLabel}>Tabs</div>
          <div style={rowSub}>Untick to hide from the bottom bar. Feed and Settings always stay.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {TAB_OPTIONS.map(t => {
              const hidden = s.hiddenTabs.includes(t.key);
              const locked = t.key === 'feed' || t.key === 'settings';
              return (
                <div key={t.key}
                  onClick={() => !locked && s.toggleHiddenTab(t.key)}
                  style={{
                    padding: '7px 14px', borderRadius: 999,
                    border: `1px solid ${hidden ? '#222' : 'rgba(185,148,255,0.4)'}`,
                    background: hidden ? '#0A0A0A' : 'rgba(185,148,255,0.14)',
                    color: hidden ? '#555' : VIOLET,
                    fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    opacity: locked ? 0.45 : 1,
                  }}
                >
                  {t.label}{locked && ' 🔒'}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ ...rowBorder, padding: '14px 16px' }}>
          <div style={rowLabel}>Topic pills</div>
          <div style={rowSub}>Untick to hide a topic from the feed.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {ALL_TOPIC_PILLS.map(t => {
              const hidden = s.hiddenTopics.includes(t.key);
              return (
                <div key={t.key}
                  onClick={() => s.toggleHiddenTopic(t.key)}
                  style={{
                    padding: '7px 14px', borderRadius: 999,
                    border: `1px solid ${hidden ? '#222' : 'rgba(185,148,255,0.4)'}`,
                    background: hidden ? '#0A0A0A' : 'rgba(185,148,255,0.14)',
                    color: hidden ? '#555' : VIOLET,
                    fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* BEHAVIOR (wave 2 extras) */}
      <div style={sectionHeader}>BEHAVIOR · MORE</div>
      <div style={card}>
        <RowToggle label="Auto mark-as-read on scroll"
          sub="Stories you scroll past stop showing as new."
          value={s.autoMarkRead} onChange={s.setAutoMarkRead} />
        <RowToggle border label="Keyboard shortcuts"
          sub="J / K next & previous · S save · Esc back."
          value={s.keyboardShortcuts} onChange={s.setKeyboardShortcuts} />
      </div>

      {/* DATA */}
      <div style={sectionHeader}>DATA</div>
      <div style={card}>
        <div onClick={clearCaches} style={{ ...row, cursor: 'pointer' }}>
          <div style={{ flex: 1 }}>
            <div style={rowLabel}>Clear all caches</div>
            <div style={rowSub}>Removes cached feed, AI summaries, scroll positions. Saved articles are kept.</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
        <div onClick={resetAll} style={{ ...row, ...rowBorder, cursor: 'pointer' }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...rowLabel, color: '#FF6B6B' }}>Reset Customize</div>
            <div style={rowSub}>Restore all Customize options to defaults.</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
