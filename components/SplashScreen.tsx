import { LinearGradient } from 'expo-linear-gradient';
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
import { Colors } from '../constants/colors';

const ICON = require('../assets/icons/splash-icon-cloud.png');

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);

interface Props {
  ready: boolean;
  onDone: () => void;
}

export default function SplashScreen({ ready, onDone }: Props) {
  const iconScale = useSharedValue(0.9);
  const iconOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const containerOpacity = useSharedValue(1);

  // Entry — opacity + gentle scale only, all on the UI thread.
  // No translateY fly-in: it read as "laggy" while the JS thread boots.
  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 400, easing: EASE_OUT });
    iconScale.value = withTiming(1, { duration: 500, easing: EASE_OUT });
    textOpacity.value = withDelay(240, withTiming(1, { duration: 360, easing: EASE_OUT }));
  }, []);

  // Clean fade-out once the app is ready
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 420, easing: EASE_IN }, (done) => {
        if (done) runOnJS(onDone)();
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [ready]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Static gradient — no JS-thread animation, stays smooth during boot */}
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
        <Text style={styles.tagline}>Your journey, tracked.</Text>
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
    gap: 28,
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
    fontSize: 36,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.1,
  },
});
