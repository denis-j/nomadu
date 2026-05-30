import React, { useEffect } from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import AnimatedGradientBackground from './animated-gradient-background';

const ICON = require('../assets/app-icon-dark.png');

const gradientColorSets = [
  { colors: ['#fff4cc', '#ffe8a3', '#ffd97a'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  { colors: ['#fff9e6', '#fff0bf', '#ffe599'], start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
];

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);

interface Props {
  ready: boolean;
  onDone: () => void;
}

export default function SplashScreen({ ready, onDone }: Props) {
  const iconScale = useSharedValue(0.78);
  const iconOpacity = useSharedValue(0);
  const iconY = useSharedValue(16);
  const textOpacity = useSharedValue(0);
  const textY = useSharedValue(10);
  const containerOpacity = useSharedValue(1);

  // Smooth entry — ease-out cubic, no spring bounce
  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 380, easing: EASE_OUT });
    iconScale.value = withTiming(1, { duration: 420, easing: EASE_OUT });
    iconY.value = withTiming(0, { duration: 420, easing: EASE_OUT });

    textOpacity.value = withDelay(260, withTiming(1, { duration: 360, easing: EASE_OUT }));
    textY.value = withDelay(260, withTiming(0, { duration: 360, easing: EASE_OUT }));
  }, []);

  // Clean fade-out, no scale pulse
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 400, easing: EASE_IN }, (done) => {
        if (done) runOnJS(onDone)();
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [ready]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }, { translateY: iconY.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <AnimatedGradientBackground colorSets={gradientColorSets} duration={4000} />
      <Animated.View style={[styles.iconWrapper, iconStyle]}>
        <Image source={ICON} style={styles.icon} />
      </Animated.View>
      <Animated.View style={textStyle}>
        <Text style={styles.appName}>Nomadu</Text>
        <Text style={styles.tagline}>Your journey, tracked.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    gap: 28,
  },
  iconWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  icon: {
    width: 120,
    height: 120,
    borderRadius: 26,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1A1200',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(26,18,0,0.55)',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.1,
  },
});
