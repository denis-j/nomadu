import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

const ICON = require('../assets/icons/splash-icon-cloud.png');

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);
const EASE_SIN = Easing.inOut(Easing.sin);

interface Props {
  ready: boolean;
  onDone: () => void;
}

export default function SplashScreen({ ready, onDone }: Props) {
  const iconScale = useSharedValue(0.92);
  const iconOpacity = useSharedValue(0);
  const iconBreath = useSharedValue(1);
  const textOpacity = useSharedValue(0);
  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 380, easing: EASE_OUT });
    iconScale.value = withTiming(1, { duration: 480, easing: EASE_OUT });
    textOpacity.value = withDelay(220, withTiming(1, { duration: 340, easing: EASE_OUT }));

    // Continuous gentle breathing on the icon so the screen never feels frozen
    // while the JS bundle is booting.
    iconBreath.value = withRepeat(
      withSequence(
        withTiming(1.045, { duration: 1500, easing: EASE_SIN }),
        withTiming(1.0,   { duration: 1500, easing: EASE_SIN }),
      ),
      -1,
      true,
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 320, easing: EASE_IN }, (done) => {
        if (done) runOnJS(onDone)();
      });
    }, 280);
    return () => clearTimeout(timer);
  }, [ready]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value * iconBreath.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  // pointerEvents=none so touches pass through during the fade-out window
  // (the welcome CTA below it would otherwise be unreachable).
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, containerStyle]}
    >
      <LinearGradient
        colors={['#4DC1FF', '#8AD3FF', '#DBF0FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.iconWrapper, iconStyle]}>
        <Image source={ICON} style={styles.icon} />
      </Animated.View>
      <Animated.View style={textStyle}>
        <Text style={styles.appName}>Nomadu</Text>
        <Text style={styles.tagline}>The most beautiful way to track the world</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    gap: 24,
    paddingHorizontal: 32,
  },
  iconWrapper: {
    shadowColor: '#0A3A5C',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
  },
  icon: {
    width: 124,
    height: 124,
    borderRadius: 28,
    borderCurve: 'continuous',
  },
  appName: {
    ...Typography.brandDisplay,
    fontSize: 48,
    textAlign: 'center',
  },
  tagline: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.1,
  },
});
