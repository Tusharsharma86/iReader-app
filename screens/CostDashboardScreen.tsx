import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

const DASHBOARD_URL = 'https://platform.claude.com/cost?range=mtd';

export default function CostDashboardScreen() {
  const navigation = useNavigation();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [progress, setProgress] = useState(0);

  const goBack = () => {
    if (canGoBack && webRef.current) {
      webRef.current.goBack();
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.title}>Anthropic Console</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{DASHBOARD_URL.replace(/^https:\/\//, '')}</Text>
        </View>
        <Pressable
          onPress={() => webRef.current?.reload()}
          hitSlop={12}
          style={styles.iconBtn}
        >
          <Ionicons name="refresh" size={18} color="#aaa" />
        </Pressable>
      </View>

      {/* Progress bar */}
      {progress > 0 && progress < 1 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
        </View>
      )}

      <WebView
        ref={webRef}
        source={{ uri: DASHBOARD_URL }}
        style={styles.webview}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onNavigationStateChange={(nav: WebViewNavigation) => setCanGoBack(nav.canGoBack)}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#b994ff" />
            <Text style={styles.loadingText}>Loading dashboard…</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A1A',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#0E0E0E',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#1A1A1A',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  subtitle: { color: '#666', fontSize: 11, fontWeight: '500', marginTop: 2 },
  progressTrack: {
    height: 2, backgroundColor: '#0E0E0E',
  },
  progressBar: { height: '100%', backgroundColor: '#b994ff' },
  webview: { flex: 1, backgroundColor: '#080808' },
  loading: {
    position: 'absolute', inset: 0,
    backgroundColor: '#080808',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: '#888', fontSize: 13 },
});
