import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings, FontSize } from '../contexts/SettingsContext';
import { useSource, SOURCE_CATEGORIES } from '../contexts/SourceContext';
import { SettingsStackParamList } from '../types/navigation';
import { requestNotificationPermission, fireTestNotif, registerForPush, updatePushPreferences, getCachedPushToken } from '../utils/notifications';
import { useTabBarAutoHide } from '../utils/tabBarAnim';
import { INTEREST_CATEGORIES, INTEREST_TOPICS, type InterestTopic } from '../utils/interestTopics';
import { TOPIC_SUBTOPICS } from '../utils/topics';
import { getFollowedEntities, toggleFollowEntity, clearFollowedEntities } from '../utils/entityFollowStore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FONT_SIZES: FontSize[] = ['Small', 'Medium', 'Large', 'XLarge'];
const VIOLET = '#b994ff';
const BLUE = '#4A90D9';

const TOPIC_ITEMS = [
  { key: 'breaking',       label: 'Breaking News', icon: '🔴' },
  { key: 'technology',     label: 'Technology',    icon: '💻' },
  { key: 'india-politics', label: 'India',         icon: '🇮🇳' },
  { key: 'geopolitics',    label: 'World',         icon: '🌍' },
  { key: 'markets',        label: 'Markets',       icon: '📈' },
  { key: 'business',       label: 'Business',      icon: '💼' },
] as const;

const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':'techcrunch.com','The Verge':'theverge.com','Ars Technica':'arstechnica.com','Wired':'wired.com','Hacker News':'news.ycombinator.com','9to5Mac':'9to5mac.com','9to5Google':'9to5google.com','MIT Tech Review':'technologyreview.com','Engadget':'engadget.com','VentureBeat':'venturebeat.com','The Next Web':'thenextweb.com','BBC World':'bbc.co.uk','NYT World':'nytimes.com','The Guardian':'theguardian.com','NPR World':'npr.org','Al Jazeera':'aljazeera.com','NDTV':'ndtv.com','India Today':'indiatoday.in','The Print':'theprint.in','The Quint':'thequint.com','CNBC TV18':'cnbctv18.com','Scroll.in':'scroll.in','Economic Times':'economictimes.indiatimes.com','Livemint':'livemint.com','Mint':'livemint.com','Inc42':'inc42.com','Indian Express':'indianexpress.com',
};
function faviconUrl(name: string) {
  const domain = SOURCE_DOMAINS[name] ?? 'google.com';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

// ── Collapsible section ────────────────────────────────────────────────────
function Collapsible({ icon, title, subtitle, children, defaultOpen }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const rotate = React.useRef(new Animated.Value(open ? 1 : 0)).current;
  const toggle = useCallback(() => {
    LayoutAnimation.configureNext({ duration: 220, update: { type: 'easeInEaseOut' } });
    Animated.timing(rotate, { toValue: open ? 0 : 1, duration: 200, useNativeDriver: true }).start();
    setOpen(o => !o);
  }, [open, rotate]);
  const deg = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  return (
    <View style={styles.card}>
      <Pressable onPress={toggle} style={styles.row}>
        <View style={styles.collapsibleIcon}>
          <Ionicons name={icon} size={16} color={VIOLET} />
        </View>
        <View style={styles.rowTextCol}>
          <Text style={styles.rowLabel}>{title}</Text>
          {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
        </View>
        <Animated.View style={{ transform: [{ rotate: deg }] }}>
          <Ionicons name="chevron-forward" size={18} color="#666" />
        </Animated.View>
      </Pressable>
      {open && <View style={styles.collapsibleBody}>{children}</View>}
    </View>
  );
}

// ── Star row for Topic Interests ────────────────────────────────────────────
function StarRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 0 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < value;
        const next = value === i + 1 ? 0 : i + 1;
        return (
          <Pressable key={i} onPress={() => onChange(next)} hitSlop={4} style={{ padding: 2 }}>
            <Ionicons name={filled ? 'star' : 'star-outline'} size={18} color={filled ? '#FFC542' : '#3A3A3A'} />
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Inline Topic Interests ──────────────────────────────────────────────────
export function InlineTopicInterests() {
  const { topicInterests, setTopicInterest } = useSettings();
  const [q, setQ] = useState('');
  const grouped = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const f = (t: InterestTopic) => !qq || t.label.toLowerCase().includes(qq) || t.keywords.some(k => k.includes(qq));
    return INTEREST_CATEGORIES.map(cat => ({
      category: cat,
      items: INTEREST_TOPICS.filter(t => t.category === cat && f(t)),
    })).filter(g => g.items.length > 0);
  }, [q]);
  return (
    <View>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color="#555" />
        <TextInput
          value={q} onChangeText={setQ}
          placeholder="Search topics"
          placeholderTextColor="#555"
          style={styles.searchInput}
          autoCapitalize="none" autoCorrect={false}
        />
      </View>
      {grouped.map(group => (
        <View key={group.category} style={{ marginTop: 12 }}>
          <Text style={styles.miniHeader}>{group.category.toUpperCase()}</Text>
          {group.items.map((t, i) => (
            <View key={t.id} style={[styles.miniRow, i > 0 && styles.miniDivider]}>
              <Text style={{ fontSize: 16 }}>{t.emoji}</Text>
              <Text style={styles.miniLabel} numberOfLines={1}>{t.label}</Text>
              <StarRow value={topicInterests[t.id] ?? 0} onChange={(n) => setTopicInterest(t.id, n)} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Inline Favorite Sources / Topics ────────────────────────────────────────
export function InlineFavorites() {
  const { favSources, toggleFavSource } = useSettings();
  return (
    <View>
      <Text style={styles.miniHint}>When set, topic alerts are limited to these publications. Leave empty for all sources. Tap to toggle.</Text>
      {SOURCE_CATEGORIES.map(cat => (
        <View key={cat.label} style={{ marginTop: 10 }}>
          <Text style={styles.miniSubHeader}>{cat.label}</Text>
          <View style={styles.chipWrap}>
            {cat.sources.map(s => {
              const on = favSources.includes(s);
              return (
                <Pressable key={s} onPress={() => toggleFavSource(s)} style={[styles.srcChip, on && styles.srcChipActive]}>
                  <Image source={{ uri: faviconUrl(s) }} style={styles.favicon} />
                  <Text style={[styles.chipText, on && styles.chipTextActive]} numberOfLines={1}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Inline Followed Entities ────────────────────────────────────────────────
function InlineFollowedEntities() {
  const [entities, setEntities] = React.useState<string[]>([]);
  useFocusEffect(useCallback(() => { setEntities(getFollowedEntities()); }, []));
  if (!entities.length) {
    return <Text style={[styles.miniHint, { paddingVertical: 8 }]}>No followed people, companies, or topics yet. Tap pills in Deep Dive to follow.</Text>;
  }
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 }}>
        {entities.map((name, i) => (
          <Pressable key={i} onPress={() => {
            toggleFollowEntity(name);
            setEntities(prev => prev.filter(e => e !== name));
          }} style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
            backgroundColor: 'rgba(52,199,89,0.15)', borderWidth: 1, borderColor: '#34C759',
          }}>
            <Text style={{ color: '#34C759', fontSize: 12, fontWeight: '700' }}>{name}</Text>
            <Ionicons name="close" size={12} color="#34C759" />
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => {
        clearFollowedEntities();
        setEntities([]);
      }} style={{ marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,59,48,0.1)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)' }}>
        <Ionicons name="trash-outline" size={13} color="#FF3B30" />
        <Text style={{ color: '#FF3B30', fontSize: 12, fontWeight: '700' }}>Reset all follows</Text>
      </Pressable>
    </View>
  );
}

// ── Inline Active Topics ────────────────────────────────────────────────────
function InlineActiveTopics() {
  const { activeTopics, toggleTopic, activeSubTopics, toggleSubTopic, showSports, setShowSports, showEntertainment, setShowEntertainment } = useSettings();
  return (
    <View>
      <Text style={styles.miniHint}>Toggle categories. Tap sub-topic pills to refine.</Text>
      {TOPIC_ITEMS.map(item => {
        const on = activeTopics[item.key] !== false;
        const subs = TOPIC_SUBTOPICS[item.key] ?? [];
        return (
          <View key={item.key} style={{ marginTop: 14 }}>
            <View style={styles.miniRow}>
              <Text style={{ fontSize: 16 }}>{item.icon}</Text>
              <Text style={[styles.miniLabel, !on && { color: '#555' }]}>{item.label}</Text>
              <Switch
                value={on}
                onValueChange={() => toggleTopic(item.key)}
                trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
                thumbColor={on ? BLUE : '#444'}
              />
            </View>
            {on && subs.length > 0 && (
              <View style={[styles.chipWrap, { marginTop: 8 }]}>
                {subs.map(sub => {
                  const isSpecial = (item.key === 'breaking' || item.key === 'india-politics') && (sub === 'Sports' || sub === 'Entertainment');
                  const subKey = `${item.key}:${sub}`;
                  const subOn = isSpecial
                    ? (sub === 'Sports' ? showSports : showEntertainment)
                    : activeSubTopics[subKey] !== false;
                  const press = () => {
                    if (isSpecial) {
                      if (sub === 'Sports') setShowSports(!showSports);
                      else setShowEntertainment(!showEntertainment);
                    } else {
                      toggleSubTopic(subKey);
                    }
                  };
                  return (
                    <Pressable key={sub} onPress={press} style={[styles.chip, subOn && styles.chipActive]}>
                      <Text style={[styles.chipText, subOn && styles.chipTextActive]}>{sub}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Inline Sources ──────────────────────────────────────────────────────────
function InlineSources() {
  const { activeSources, toggleSource } = useSource();
  const [q, setQ] = useState('');
  return (
    <View>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color="#555" />
        <TextInput
          value={q} onChangeText={setQ}
          placeholder="Search sources"
          placeholderTextColor="#555"
          style={styles.searchInput}
          autoCapitalize="none" autoCorrect={false}
        />
      </View>
      {SOURCE_CATEGORIES.map(cat => {
        const items = q
          ? cat.sources.filter(s => s.toLowerCase().includes(q.toLowerCase()))
          : cat.sources;
        if (items.length === 0) return null;
        return (
          <View key={cat.label} style={{ marginTop: 12 }}>
            <Text style={styles.miniSubHeader}>{cat.label}</Text>
            {items.map((src, i) => {
              const on = activeSources[src] !== false;
              return (
                <View key={src} style={[styles.miniRow, i > 0 && styles.miniDivider]}>
                  <Image source={{ uri: faviconUrl(src) }} style={styles.favicon} />
                  <Text style={styles.miniLabel} numberOfLines={1}>{src}</Text>
                  <Switch
                    value={on}
                    onValueChange={() => toggleSource(src)}
                    trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
                    thumbColor={on ? BLUE : '#444'}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const {
    fontSize, setFontSize,
    notifBreaking, setNotifBreaking,
    notifAiFeed, setNotifAiFeed,
    notifTech, setNotifTech,
    notifDigest, setNotifDigest,
    favSources,
    activeTopics,
    topicInterests,
    resetSettings,
  } = useSettings();
  const { resetSources } = useSource();
  const [targetingOpen, setTargetingOpen] = useState(false);
  const { onScroll, restore } = useTabBarAutoHide();
  useFocusEffect(useCallback(() => () => restore(), [restore]));

  // Build keyword|Label|stars pairs for backend.
  const starredKeywords = useMemo(() => {
    const starred = INTEREST_TOPICS.filter(t => (topicInterests[t.id] ?? 0) > 0);
    const pairs: string[] = [];
    const seen = new Set<string>();
    for (const t of starred) {
      const stars = Math.max(1, Math.min(5, topicInterests[t.id] ?? 0));
      for (const kw of t.keywords) {
        const key = kw.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push(`${kw}|${t.label}|${stars}`);
      }
    }
    // No 30-cap: previously the first ~3 Technology topics ate all 30 slots,
    // silently dropping every India/World/Markets/Business topic. Send all
    // (sanity ceiling 500 so a pathological list can't bloat the payload).
    return pairs.slice(0, 500);
  }, [topicInterests]);

  const handleNotifToggle = useCallback(async (value: boolean, setter: (v: boolean) => void, prefKey?: 'breaking' | 'topics' | 'digest' | 'aiFeed') => {
    const FALLBACK_KWS = ['tech', 'ai', 'apple', 'google', 'meta', 'openai', 'microsoft', 'amazon', 'startup', 'software', 'chip', 'iphone', 'android', 'app', 'cyber', 'crypto'];
    const kws = starredKeywords.length > 0 ? starredKeywords : FALLBACK_KWS;
    if (!value) {
      setter(false);
      if (prefKey === 'breaking') updatePushPreferences({ breakingEnabled: false });
      if (prefKey === 'aiFeed') updatePushPreferences({ aiFeedEnabled: false });
      if (prefKey === 'topics') updatePushPreferences({ topicsEnabled: false });
      if (prefKey === 'digest') updatePushPreferences({ digestEnabled: false, digestEveningEnabled: false });
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) return;
    setter(true);
    registerForPush().then(() => {
      if (prefKey === 'breaking') updatePushPreferences({ breakingEnabled: true });
      if (prefKey === 'aiFeed') updatePushPreferences({ aiFeedEnabled: true });
      if (prefKey === 'topics') updatePushPreferences({ topicsEnabled: true, topicsKeywords: kws });
      if (prefKey === 'digest') {
        const offsetMin = new Date().getTimezoneOffset();
        const toUTC = (h: number, m: number) => {
          const total = h * 60 + m + offsetMin;
          const norm = ((total % 1440) + 1440) % 1440;
          return { hour: Math.floor(norm / 60), minute: norm % 60 };
        };
        const morning = toUTC(8, 0);
        const evening = toUTC(18, 0);
        updatePushPreferences({
          digestEnabled: true,
          digestHour: morning.hour, digestMinute: morning.minute,
          digestEveningEnabled: true,
          digestEveningHour: evening.hour, digestEveningMinute: evening.minute,
        });
      }
    });
  }, [starredKeywords]);

  useEffect(() => {
    updatePushPreferences({
      favSourcesEnabled: favSources.length > 0,
      favSources,
    });
  }, [favSources]);

  useEffect(() => {
    if (notifTech && starredKeywords.length > 0) {
      updatePushPreferences({ topicsEnabled: true, topicsKeywords: starredKeywords });
    }
  }, [starredKeywords, notifTech]);

  const starredCount = Object.values(topicInterests).filter(v => v > 0).length;
  const enabledTopicsCount = Object.values(activeTopics).filter(Boolean).length;
  const [followedEntityCount, setFollowedEntityCount] = useState(() => getFollowedEntities().length);
  useFocusEffect(useCallback(() => { setFollowedEntityCount(getFollowedEntities().length); }, []));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        <Text style={styles.screenTitle}>Settings</Text>

        {/* READING */}
        <Text style={styles.sectionHeader}>READING</Text>
        <View style={styles.card}>
          <Text style={styles.settingLabel}>Article Font Size</Text>
          <View style={styles.segmented}>
            {FONT_SIZES.map(fs => (
              <TouchableOpacity key={fs}
                style={[styles.segment, fontSize === fs && styles.segmentActive]}
                onPress={() => setFontSize(fs)}>
                <Text style={[styles.segmentLabel, fontSize === fs && styles.segmentLabelActive]}>{fs}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* NOTIFICATIONS — master toggle + entry into dedicated sub-screen.
            The full notif config (Main Breaking, AI Feed Breaking, Themes,
            Topic Alerts, Daily Digest, History) lives in NotificationSettings. */}
        <Text style={styles.sectionHeader}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Notifications</Text>
              <Text style={styles.rowSub}>{(notifBreaking || notifTech || notifDigest || notifAiFeed) ? 'Master switch — off silences everything' : 'Off — no pushes will be sent'}</Text>
            </View>
            <Switch
              value={notifBreaking || notifTech || notifDigest || notifAiFeed}
              onValueChange={async (v) => {
                if (!v) {
                  setNotifBreaking(false); setNotifTech(false); setNotifDigest(false); setNotifAiFeed(false);
                  updatePushPreferences({ breakingEnabled: false, aiFeedEnabled: false, topicsEnabled: false, digestEnabled: false, digestEveningEnabled: false });
                } else {
                  await handleNotifToggle(true, setNotifBreaking, 'breaking');
                }
              }}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={(notifBreaking || notifTech || notifDigest || notifAiFeed) ? BLUE : '#444'} />
          </View>
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => navigation.navigate('NotificationSettings')}>
            <View style={styles.collapsibleIcon}>
              <Ionicons name="options" size={16} color={VIOLET} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Notification Settings</Text>
              <Text style={styles.rowSub}>Breaking, themes, topics, digest, history</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        {/* APPEARANCE — Customize sub-screen */}
        <Text style={styles.sectionHeader}>APPEARANCE</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Customize')}>
            <View style={styles.collapsibleIcon}>
              <Ionicons name="color-palette" size={16} color={VIOLET} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Customize</Text>
              <Text style={styles.rowSub}>UI density, defaults, summary length, hide/show sections</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>FEED</Text>
        <Collapsible icon="grid" title="Active Topics" subtitle={`${enabledTopicsCount} of 6 categories on`}>
          <InlineActiveTopics />
        </Collapsible>
        <Collapsible icon="newspaper" title="Sources" subtitle="Enable / disable individual publications">
          <InlineSources />
        </Collapsible>
        <Collapsible icon="star" title="Followed in Deep Dive" subtitle={followedEntityCount > 0 ? `${followedEntityCount} people, companies & topics` : 'None yet'}>
          <InlineFollowedEntities />
        </Collapsible>

        {/* STATS */}
        <Text style={styles.sectionHeader}>STATS</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Usage')}>
            <View style={styles.collapsibleIcon}>
              <Ionicons name="bar-chart" size={16} color={VIOLET} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Usage & Insights</Text>
              <Text style={styles.rowSub}>Articles read, AI usage, notif open rate, streak</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        {/* ADVANCED */}
        <Text style={styles.sectionHeader}>ADVANCED</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={async () => {
            const ok = await requestNotificationPermission();
            if (!ok) { Alert.alert('Permission needed', 'Enable notifications in system settings.'); return; }
            try { await fireTestNotif(); Alert.alert('Sent', 'Test notification scheduled.'); }
            catch (e) { Alert.alert('Failed', String(e instanceof Error ? e.message : e)); }
          }}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Send Test Notification</Text>
              <Text style={styles.rowSub}>Verifies permission + channel</Text>
            </View>
            <Ionicons name="notifications-outline" size={18} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={async () => {
            const t = await getCachedPushToken();
            if (!t) { Alert.alert('No token', 'Enable a notification toggle first.'); return; }
            await Share.share({ message: t }).catch(() => {});
          }}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Share Push Token</Text>
              <Text style={styles.rowSub}>For testing via expo.dev/notifications</Text>
            </View>
            <Ionicons name="share-outline" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        {/* AI ENGINE */}
        <Text style={styles.sectionHeader}>AI ENGINE</Text>
        <View style={styles.card}>
          {[
            {
              icon: '✦',
              label: 'Deep Dive',
              model: 'Llama 4 Scout 17B',
              why: 'Multi-source narrative synthesis — falls back to Qwen 3 32B if Scout errors',
              warn: false,
            },
            {
              icon: '⚡',
              label: 'Summaries & Q&A',
              model: 'Qwen 3 32B',
              why: 'Foreground, user-facing: article summaries, follow-up Q&A',
              warn: false,
            },
            {
              icon: '⟲',
              label: 'Feed processing',
              model: 'Llama 3.1 8B',
              why: 'Background bulk: clustering, cluster headlines, card pre-warm, themes',
              warn: false,
            },
          ].map((item, i) => (
            <View key={i} style={[{ paddingHorizontal: 16, paddingVertical: 14 }, i > 0 && styles.rowBorder]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: '#b994ff', fontSize: 14 }}>{item.icon}</Text>
                  <Text style={{ color: '#DDD', fontSize: 14, fontWeight: '600' }}>{item.label}</Text>
                </View>
                <View style={{ backgroundColor: item.warn ? 'rgba(245,158,11,0.1)' : 'rgba(185,148,255,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: item.warn ? '#F59E0B' : '#b994ff', fontSize: 11, fontWeight: '700' }}>{item.model}{item.warn ? ' ⚠' : ''}</Text>
                </View>
              </View>
              <Text style={{ color: '#555', fontSize: 12, lineHeight: 18 }}>{item.why}</Text>
            </View>
          ))}
          <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }, styles.rowBorder]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34D399' }} />
            <Text style={{ color: '#555', fontSize: 12 }}>Provider: Groq · free tier · resets daily (UTC)</Text>
          </View>
        </View>

        {/* ABOUT */}
        <Text style={styles.sectionHeader}>ABOUT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>1.0.0</Text>
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.rowLabel}>Build</Text>
            <Text style={styles.rowValue}>Expo SDK 54</Text>
          </View>
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => {
            Alert.alert('Reset?', 'This clears all settings + source preferences.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => { resetSettings(); resetSources(); } },
            ]);
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="trash-outline" size={16} color="#FF4444" style={{ marginRight: 8 }} />
              <Text style={{ color: '#FF4444', fontSize: 15, fontWeight: '500' }}>Reset to Defaults</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  screenTitle: { color: '#FFF', fontSize: 28, fontWeight: '800', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  sectionHeader: { color: '#444', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 20, paddingBottom: 10 },
  card: { marginHorizontal: 16, backgroundColor: '#0E0E0E', borderRadius: 14, borderWidth: 1, borderColor: '#1A1A1A', marginBottom: 18, overflow: 'hidden' },

  settingLabel: { color: '#888', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  segmented: { flexDirection: 'row', margin: 12, marginTop: 0, backgroundColor: '#1A1A1A', borderRadius: 10, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: BLUE },
  segmentLabel: { color: '#555', fontSize: 12, fontWeight: '600' },
  segmentLabelActive: { color: '#FFF' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  rowTextCol: { flex: 1 },
  rowLabel: { color: '#DDD', fontSize: 15, fontWeight: '500' },
  rowSub: { color: '#555', fontSize: 12, marginTop: 2 },
  rowValue: { color: '#444', fontSize: 15 },

  nestedRow: { backgroundColor: '#0a0a0a', paddingLeft: 28 },
  nestedLabel: { color: '#bbb', fontSize: 14, fontWeight: '500' },
  nestedBody: { backgroundColor: '#0a0a0a', paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: '#161616' },
  nestedHeader: { color: VIOLET, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 14 },
  nestedHint: { color: '#555', fontSize: 11, marginTop: 3, marginBottom: 2 },
  collapsibleIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(185,148,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  collapsibleBody: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 16, borderTopWidth: 1, borderTopColor: '#161616' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#1a1a1f', borderRadius: 10, marginTop: 8 },
  searchInput: { flex: 1, color: '#FFF', fontSize: 13, padding: 0 },

  miniHeader: { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  miniSubHeader: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  miniHint: { color: '#555', fontSize: 11, marginBottom: 8 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  miniDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1a1a1a' },
  miniLabel: { flex: 1, color: '#DDD', fontSize: 13, fontWeight: '500' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: '#1a1a1f', borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: 'rgba(74,144,217,0.18)', borderColor: BLUE },
  chipText: { color: '#999', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  srcChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14, backgroundColor: '#1a1a1f', borderWidth: 1, borderColor: 'transparent', maxWidth: '48%' },
  srcChipActive: { backgroundColor: 'rgba(74,144,217,0.18)', borderColor: BLUE },
  favicon: { width: 14, height: 14, borderRadius: 3 },
});
