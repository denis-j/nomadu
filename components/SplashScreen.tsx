import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { LogoModel3D } from './LogoModel3D';

const LOGO_SIZE = 280;
/** Once the logo shows, it stays at least this long, so it is seen turning. */
const MIN_LOGO_MS = 700;
/** The splash never waits longer than this for the logo; the app comes first. */
const MAX_WAIT_MS = 1500;

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
  const containerOpacity = useSharedValue(1);

  const mountedAt = useRef(Date.now());
  const [logoShownAt, setLogoShownAt] = useState<number | null>(null);

  // The 3D logo fades in once Filament has loaded it, not before: an empty
  // canvas fading in first would read as a blank square.
  const onLogoReady = useCallback(() => {
    setLogoShownAt((at) => at ?? Date.now());
    iconOpacity.value = withTiming(1, { duration: 380, easing: EASE_OUT });
    iconScale.value = withTiming(1, { duration: 480, easing: EASE_OUT });
  }, [iconOpacity, iconScale]);

  useEffect(() => {

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
    // Leave once the app is ready and the logo has been seen for a moment;
    // if it has not appeared by MAX_WAIT_MS, leave anyway.
    const now = Date.now();
    const untilSeen = logoShownAt != null ? logoShownAt + MIN_LOGO_MS - now : mountedAt.current + MAX_WAIT_MS - now;
    const hold = Math.min(Math.max(untilSeen, 0), mountedAt.current + MAX_WAIT_MS - now);
    const timer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 320, easing: EASE_IN }, (done) => {
        if (done) runOnJS(onDone)();
      });
    }, 280 + Math.max(hold, 0));
    return () => clearTimeout(timer);
  }, [ready, logoShownAt]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value * iconBreath.value }],
  }));

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
      <Animated.View style={iconStyle}>
        <LogoModel3D size={LOGO_SIZE} onReady={onLogoReady} />
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
});
