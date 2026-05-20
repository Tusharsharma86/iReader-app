import { Animated } from 'react-native';

// Shared singleton — FeedScreen drives this value; ParticleTabBar reads it.
// Using a module-level value avoids prop-drilling and context overhead for
// a simple translate animation.
export const tabBarTranslateY = new Animated.Value(0);
