import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSource, SOURCE_CATEGORIES } from '../contexts/SourceContext';

const SOURCE_DOMAINS: Record<string, string> = {
  'TechCrunch':      'techcrunch.com',
  'The Verge':       'theverge.com',
  'Ars Technica':    'arstechnica.com',
  'Wired':           'wired.com',
  'Hacker News':     'news.ycombinator.com',
  '9to5Mac':         '9to5mac.com',
  '9to5Google':      '9to5google.com',
  'MIT Tech Review': 'technologyreview.com',
  'Engadget':        'engadget.com',
  'VentureBeat':     'venturebeat.com',
  'The Next Web':    'thenextweb.com',
  'BBC World':       'bbc.co.uk',
  'NYT World':       'nytimes.com',
  'The Guardian':    'theguardian.com',
  'NPR World':       'npr.org',
  'Al Jazeera':      'aljazeera.com',
  'Indian Express':  'indianexpress.com',
  'NDTV':            'ndtv.com',
  'India Today':     'indiatoday.in',
  'The Print':       'theprint.in',
  'The Quint':       'thequint.com',
  'CNBC TV18':       'cnbctv18.com',
  'Scroll.in':       'scroll.in',
  'Economic Times':  'economictimes.indiatimes.com',
  'Livemint':        'livemint.com',
  'Mint':            'livemint.com',
  'Inc42':           'inc42.com',
};

const CATEGORY_COLORS: Record<string, string> = {
  'India':      '#FF9500',
  'World':      '#4ECDC4',
  'Markets':    '#22C55E',
  'Business':   '#A29BFE',
  'Technology': '#4A90D9',
};

function faviconUrl(name: string): string {
  const domain = SOURCE_DOMAINS[name] ?? 'google.com';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

export default function SourcesScreen() {
  const navigation = useNavigation();
  const { activeSources, toggleSource } = useSource();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleCollapse(label: string) {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Sources</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.subtitle}>
          Toggle individual sources. Disabled sources are excluded from your feed.
        </Text>

        {SOURCE_CATEGORIES.map((cat) => {
          const isCollapsed = collapsed[cat.label] ?? false;
          const enabledCount = cat.sources.filter(s => activeSources[s] !== false).length;
          const allOff = enabledCount === 0;
          const partial = enabledCount > 0 && enabledCount < cat.sources.length;
          const accentColor = CATEGORY_COLORS[cat.label] ?? '#4A90D9';

          // Show up to 4 favicons in the header (enabled sources first)
          const headerSources = [
            ...cat.sources.filter(s => activeSources[s] !== false),
            ...cat.sources.filter(s => activeSources[s] === false),
          ].slice(0, 4);

          return (
            <View key={cat.label} style={styles.sourceGroup}>
              <TouchableOpacity
                style={styles.catHeader}
                onPress={() => toggleCollapse(cat.label)}
                activeOpacity={0.7}
              >
                <View style={styles.catHeaderLeft}>
                  {/* Stacked favicon preview */}
                  <View style={styles.faviconStack}>
                    {headerSources.map((src, i) => {
                      const isDisabled = activeSources[src] === false;
                      return (
                        <View
                          key={src}
                          style={[
                            styles.stackedFavicon,
                            { marginLeft: i > 0 ? -8 : 0, zIndex: 4 - i },
                            isDisabled && styles.stackedFaviconDim,
                          ]}
                        >
                          <Image
                            source={{ uri: faviconUrl(src) }}
                            style={styles.faviconImg}
                            contentFit="cover"
                          />
                        </View>
                      );
                    })}
                  </View>

                  <View>
                    <Text style={styles.catLabel}>{cat.label}</Text>
                    <Text style={[
                      styles.catCount,
                      allOff && styles.catCountOff,
                      !allOff && !partial && { color: accentColor },
                    ]}>
                      {allOff ? 'All disabled' : partial ? `${enabledCount} of ${cat.sources.length} active` : `${enabledCount} sources active`}
                    </Text>
                  </View>
                </View>

                <Ionicons
                  name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                  size={16}
                  color="#444"
                />
              </TouchableOpacity>

              {!isCollapsed && cat.sources.map((src, i) => {
                const isOn = activeSources[src] !== false;
                return (
                  <TouchableOpacity
                    key={src}
                    style={[styles.sourceRow, i === 0 && styles.sourceRowFirst]}
                    onPress={() => toggleSource(src)}
                    activeOpacity={0.7}
                  >
                    {/* Favicon */}
                    <View style={[styles.favicon, !isOn && styles.faviconOff]}>
                      <Image
                        source={{ uri: faviconUrl(src) }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                    </View>

                    {/* Source name */}
                    <Text style={[styles.srcLabel, !isOn && styles.srcLabelOff]}>{src}</Text>

                    {/* Domain hint */}
                    <Text style={styles.srcDomain} numberOfLines={1}>
                      {SOURCE_DOMAINS[src] ?? ''}
                    </Text>

                    <Switch
                      value={isOn}
                      onValueChange={() => toggleSource(src)}
                      trackColor={{ false: '#1A1A1A', true: '#1C3A6A' }}
                      thumbColor={isOn ? '#4A90D9' : '#333'}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  subtitle: { color: '#555', fontSize: 13, marginBottom: 16 },
  sourceGroup: {
    backgroundColor: '#0E0E0E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A1A1A',
    marginBottom: 10, overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  catHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  faviconStack: { flexDirection: 'row', alignItems: 'center' },
  stackedFavicon: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#0E0E0E',
    overflow: 'hidden', backgroundColor: '#1A1A1A',
  },
  stackedFaviconDim: { opacity: 0.3 },
  faviconImg: { width: '100%', height: '100%' },
  catLabel: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  catCount: { color: '#555', fontSize: 12, marginTop: 1 },
  catCountOff: { color: '#333' },
  sourceRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: '#1A1A1A',
    gap: 12,
  },
  sourceRowFirst: { borderTopColor: '#2A2A2A' },
  favicon: {
    width: 32, height: 32, borderRadius: 8,
    overflow: 'hidden', backgroundColor: '#1A1A1A',
  },
  faviconOff: { opacity: 0.25 },
  srcLabel: { color: '#DDD', fontSize: 14, fontWeight: '600', flex: 1 },
  srcLabelOff: { color: '#444' },
  srcDomain: { color: '#333', fontSize: 11, maxWidth: 120 },
});
