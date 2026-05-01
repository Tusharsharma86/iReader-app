import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings, FontSize } from '../contexts/SettingsContext';

const FONT_SIZES: FontSize[] = ['Small', 'Medium', 'Large', 'XLarge'];
const SOURCES = ['TechCrunch', 'The Verge', 'Ars Technica', 'Wired'] as const;

export default function SettingsScreen() {
  const {
    fontSize, setFontSize,
    activeSources, toggleSource,
    notifBreaking, setNotifBreaking,
    notifDigest, setNotifDigest,
    notifSources, setNotifSources,
    resetSettings,
  } = useSettings();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
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
            <View>
              <Text style={styles.rowLabel}>Breaking News</Text>
              <Text style={styles.rowSub}>Instant alerts for major stories</Text>
            </View>
            <Switch
              value={notifBreaking}
              onValueChange={setNotifBreaking}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={notifBreaking ? '#4A90D9' : '#444'}
            />
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <View>
              <Text style={styles.rowLabel}>Daily Digest</Text>
              <Text style={styles.rowSub}>Morning summary of top stories</Text>
            </View>
            <Switch
              value={notifDigest}
              onValueChange={setNotifDigest}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={notifDigest ? '#4A90D9' : '#444'}
            />
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <View>
              <Text style={styles.rowLabel}>New from my sources</Text>
              <Text style={styles.rowSub}>When selected sources publish</Text>
            </View>
            <Switch
              value={notifSources}
              onValueChange={setNotifSources}
              trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
              thumbColor={notifSources ? '#4A90D9' : '#444'}
            />
          </View>
        </View>

        {/* SOURCES */}
        <Text style={styles.sectionHeader}>SOURCES</Text>
        <View style={styles.card}>
          {SOURCES.map((src, i) => (
            <View key={src} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={styles.sourceRow}>
                <View style={[styles.sourceDot, { backgroundColor: activeSources[src] ? '#4A90D9' : '#333' }]} />
                <Text style={styles.rowLabel}>{src}</Text>
              </View>
              <Switch
                value={activeSources[src] ?? true}
                onValueChange={() => toggleSource(src)}
                trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
                thumbColor={activeSources[src] ? '#4A90D9' : '#444'}
              />
            </View>
          ))}
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
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={resetSettings}>
            <View style={styles.clearRow}>
              <Ionicons name="trash-outline" size={16} color="#FF4444" style={{ marginRight: 8 }} />
              <Text style={styles.clearCache}>Reset to Defaults</Text>
            </View>
          </TouchableOpacity>
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
  rowLabel: { color: '#DDD', fontSize: 15, fontWeight: '500' },
  rowSub: { color: '#555', fontSize: 12, marginTop: 2 },
  rowValue: { color: '#444', fontSize: 15 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sourceDot: { width: 8, height: 8, borderRadius: 4 },
  clearRow: { flexDirection: 'row', alignItems: 'center' },
  clearCache: { color: '#FF4444', fontSize: 15, fontWeight: '500' },
});
