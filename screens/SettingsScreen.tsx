import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings, FontSize } from '../contexts/SettingsContext';
import { useSource } from '../contexts/SourceContext';
import { SettingsStackParamList } from '../types/navigation';
import { requestNotificationPermission, fireTestNotif, registerForPush, updatePushPreferences, getCachedPushToken } from '../utils/notifications';
import { Share } from 'react-native';
import { useTabBarAutoHide } from '../utils/tabBarAnim';

const FONT_SIZES: FontSize[] = ['Small', 'Medium', 'Large', 'XLarge'];

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const {
    fontSize, setFontSize,
    notifBreaking, setNotifBreaking,
    notifTech, setNotifTech,
    notifDigest, setNotifDigest,
    notifSources, setNotifSources,
    favSources, favTopics,
    activeTopics,
    resetSettings,
  } = useSettings();

  const favCount = favSources.length + favTopics.length;

  const { resetSources } = useSource();

  const handleNotifToggle = useCallback(async (value: boolean, setter: (v: boolean) => void, prefKey?: 'breaking' | 'topics' | 'digest') => {
    const TECH_KWS = ['tech', 'ai', 'apple', 'google', 'meta', 'openai', 'microsoft', 'amazon', 'startup', 'software', 'chip', 'iphone', 'android', 'app', 'cyber', 'crypto'];
    if (!value) {
      setter(false);
      if (prefKey === 'breaking') updatePushPreferences({ breakingEnabled: false });
      if (prefKey === 'topics') updatePushPreferences({ topicsEnabled: false });
      if (prefKey === 'digest') updatePushPreferences({ digestEnabled: false });
      return;
    }
    const granted = await requestNotificationPermission();
    if (granted) {
      setter(true);
      registerForPush().then(() => {
        if (prefKey === 'breaking') updatePushPreferences({ breakingEnabled: true });
        if (prefKey === 'topics') updatePushPreferences({ topicsEnabled: true, topicsKeywords: TECH_KWS });
        if (prefKey === 'digest') updatePushPreferences({ digestEnabled: true, digestHour: 8, digestMinute: 0 });
      });
    }
  }, []);

  // Sync favSources to backend whenever the user changes their favorites list.
  useEffect(() => {
    updatePushPreferences({
      favSourcesEnabled: favSources.length > 0,
      favSources,
    });
  }, [favSources]);

  const enabledTopicsCount = Object.values(activeTopics).filter(Boolean).length;
  const { onScroll, restore } = useTabBarAutoHide();
  useFocusEffect(useCallback(() => () => restore(), [restore]));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        <Text style={styles.screenTitle}>Settings</Text>

        {/* READING PREFERENCES */}
        <Text style={styles.sectionHeader}>READING PREFERENCES</Text>
        <View style={styles.card}>
          <Text style={styles.settingLabel}>Article Font Size</Text>
          <View style={styles.segmented}>
            {FONT_SIZES.map(fs => (
              <TouchableOpacity
                key={fs}
                style={[styles.segment, fontSize === fs && styles.segmentActive]}
                onPress={() => setFontSize(fs)}
              >
                <Text style={[styles.segmentLabel, fontSize === fs && styles.segmentLabelActive]}>
                  {fs}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* NOTIFICATIONS */}
        <Text style={styles.sectionHeader}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Breaking News</Text>
              <Text style={styles.rowSub}>Instant alerts for major stories</Text>
            </View>
            <Switch value={notifBreaking} onValueChange={v => handleNotifToggle(v, setNotifBreaking, 'breaking')}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={notifBreaking ? '#4A90D9' : '#444'} />
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Tech News</Text>
              <Text style={styles.rowSub}>Alerts for new technology stories</Text>
            </View>
            <Switch value={notifTech} onValueChange={v => handleNotifToggle(v, setNotifTech, 'topics')}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={notifTech ? '#4A90D9' : '#444'} />
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Daily Digest</Text>
              <Text style={styles.rowSub}>Morning summary of top stories</Text>
            </View>
            <Switch value={notifDigest} onValueChange={v => handleNotifToggle(v, setNotifDigest, 'digest')}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={notifDigest ? '#4A90D9' : '#444'} />
          </View>
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => navigation.navigate('FavSources')}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Favorite Sources & Topics</Text>
              <Text style={styles.rowSub}>
                {favCount > 0 ? `${favCount} selected — tap to change` : 'Tap to choose sources or topics'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#444" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.rowBorder]}
            onPress={async () => {
              const ok = await requestNotificationPermission();
              if (!ok) { Alert.alert('Permission needed', 'Enable notifications in system settings.'); return; }
              try { await fireTestNotif(); Alert.alert('Sent', 'Test notification scheduled — should appear shortly.'); }
              catch (e) { Alert.alert('Failed', String(e instanceof Error ? e.message : e)); }
            }}
          >
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Send Test Notification</Text>
              <Text style={styles.rowSub}>Verifies permission, channel, and handler</Text>
            </View>
            <Ionicons name="notifications-outline" size={18} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.rowBorder]}
            onPress={async () => {
              const t = await getCachedPushToken();
              if (!t) { Alert.alert('No token', 'Enable a notification toggle first.'); return; }
              await Share.share({ message: t }).catch(() => {});
            }}
          >
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Share Push Token</Text>
              <Text style={styles.rowSub}>For testing via expo.dev/notifications</Text>
            </View>
            <Ionicons name="share-outline" size={18} color="#888" />
          </TouchableOpacity>
        </View>

        {/* FEED */}
        <Text style={styles.sectionHeader}>FEED</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('TopicInterests')}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Topic Interests ★</Text>
              <Text style={styles.rowSub}>Star topics to personalise For You feed</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#444" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => navigation.navigate('Topics')}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Topics</Text>
              <Text style={styles.rowSub}>{enabledTopicsCount} of 6 categories enabled</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#444" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => navigation.navigate('Sources')}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Sources</Text>
              <Text style={styles.rowSub}>Manage individual news sources</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#444" />
          </TouchableOpacity>
        </View>

        {/* MY STATS */}
        <Text style={styles.sectionHeader}>MY STATS</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Usage')}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Usage & Insights</Text>
              <Text style={styles.rowSub}>Articles read, AI usage, estimated cost</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#444" />
          </TouchableOpacity>
        </View>

        {/* ABOUT */}
        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>ABOUT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>1.0.0</Text>
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.rowLabel}>Build</Text>
            <Text style={styles.rowValue}>Expo SDK 54</Text>
          </View>
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => { resetSettings(); resetSources(); }}>
            <View style={styles.clearRow}>
              <Ionicons name="trash-outline" size={16} color="#FF4444" style={{ marginRight: 8 }} />
              <Text style={styles.clearCache}>Reset to Defaults</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>BIAS RATINGS</Text>
        <View style={styles.card}>
          <Text style={styles.biasAttribution}>
            Bias ratings are adapted from publicly available media bias resources (AllSides, Ad Fontes Media). Used for informational purposes. Not all sources rated.
          </Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {[
              { color: '#1E5CFF', label: 'Left / Lean Left' },
              { color: '#9B9B9B', label: 'Center' },
              { color: '#FF3B30', label: 'Right / Lean Right' },
            ].map(({ color, label }) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                <Text style={styles.biasLegendText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  screenTitle: {
    color: '#FFFFFF', fontSize: 28, fontWeight: '800',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24,
  },
  sectionHeader: {
    color: '#444444', fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
    paddingHorizontal: 20, paddingBottom: 10,
  },
  card: {
    marginHorizontal: 16, backgroundColor: '#0E0E0E',
    borderRadius: 14, borderWidth: 1, borderColor: '#1A1A1A',
    marginBottom: 28, overflow: 'hidden',
  },
  settingLabel: {
    color: '#888', fontSize: 12, fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
  },
  segmented: {
    flexDirection: 'row', margin: 12, marginTop: 0,
    backgroundColor: '#1A1A1A', borderRadius: 10, padding: 3,
  },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: '#4A90D9' },
  segmentLabel: { color: '#555', fontSize: 12, fontWeight: '600' },
  segmentLabelActive: { color: '#FFF' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  rowTextCol: { flex: 1, marginRight: 12 },
  rowLabel: { color: '#DDD', fontSize: 15, fontWeight: '500' },
  rowSub: { color: '#555', fontSize: 12, marginTop: 2 },
  rowValue: { color: '#444', fontSize: 15 },

  clearRow: { flexDirection: 'row', alignItems: 'center' },
  clearCache: { color: '#FF4444', fontSize: 15, fontWeight: '500' },
  biasAttribution: { color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 18 },
  biasLegendText: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
});
