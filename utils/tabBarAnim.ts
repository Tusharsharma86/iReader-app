import { useCallback, useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// Shared singleton — any screen can drive this value; ParticleTabBar reads it.
// Using a module-level value avoids prop-drilling and context overhead for
// a simple translate animation.
export const tabBarTranslateY = new Animated.Value(0);

// Hook any vertical scroll container can plug into to auto-hide the tab bar.
// Returns { onScroll, restore } — pass onScroll to the ScrollView/FlatList,
// call restore in useFocusEffect cleanup to ensure bar is visible on exit.
export function useTabBarAutoHide() {
  const visibleRef = useRef(true);
  const prevYRef = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - prevYRef.current;
    prevYRef.current = y;
    if (y < 80 && !visibleRef.current) {
      visibleRef.current = true;
      Animated.timing(tabBarTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else if (dy > 10 && visibleRef.current) {
      visibleRef.current = false;
      Animated.timing(tabBarTranslateY, { toValue: 160, duration: 200, useNativeDriver: true }).start();
    } else if (dy < -8 && !visibleRef.current) {
      visibleRef.current = true;
      Animated.timing(tabBarTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }
  }, []);

  const restore = useCallback(() => {
    if (!visibleRef.current) {
      visibleRef.current = true;
      Animated.timing(tabBarTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, []);

  return { onScroll, restore };
}
