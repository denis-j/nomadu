import * as Haptics from 'expo-haptics';
import { Link, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  Dimensions,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BackgroundClouds } from '../../components/BackgroundClouds';
import { CloudyButton } from '../../components/CloudyButton';
import { PlaneModel3D } from '../../components/PlaneModel3D';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { playCollectSound } from '../../lib/sound';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PLANE_WIDTH = 240;
const FLIGHT_DURATION_MS = 11000;

// Transition timing. Total visible white-flash window is FLASH_IN + FLASH_OUT.
// Navigation happens at the peak (FLASH_IN end) so the next screen mounts
// hidden under the flash and is revealed as it fades.
const FLASH_IN_MS = 320;
const FLASH_OUT_MS = 420;

export default function WelcomeScreen() {
  const router = useRouter();

  const flight = useSharedValue(0);
  useEffect(() => {
    flight.value = withRepeat(
      withTiming(1, { duration: FLIGHT_DURATION_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [flight]);

  const flightStyle = useAnimatedStyle(() => {
    const startX = SCREEN_WIDTH;
    const endX = -PLANE_WIDTH;
    const x = startX + flight.value * (endX - startX);
    const y = Math.sin(flight.value * Math.PI * 4) * 4;
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  // Transition shared values
  const flash = useSharedValue(0);
  const contentFade = useSharedValue(1);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentFade.value,
    transform: [{ translateY: (1 - contentFade.value) * -30 }],
  }));

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playCollectSound();

    contentFade.value = withTiming(0, {
      duration: FLASH_IN_MS,
      easing: Easing.in(Easing.cubic),
    });
    flash.value = withSequence(
      withTiming(0.95, { duration: FLASH_IN_MS, easing: Easing.in(Easing.cubic) }),
      withTiming(0, { duration: FLASH_OUT_MS, easing: Easing.out(Easing.cubic) }),
    );

    setTimeout(() => {
      router.push('/(onboarding)/citizenship');
    }, FLASH_IN_MS);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <BackgroundClouds />

      <Animated.View
        pointerEvents="none"
        style={[styles.flyingPlaneWrap, flightStyle]}
      >
        <PlaneModel3D />
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.content, contentStyle]}>
          <Animated.View
            entering={FadeIn.delay(200).duration(600)}
            style={styles.header}
          >
            <Text style={styles.title}>Welcome to Nomadu</Text>
            <Text style={styles.subtitle}>
              The most beautiful way to track the world
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(500).duration(500)}
            style={styles.actions}
          >
            <CloudyButton
              onPress={handleStart}
              style={styles.cta}
              innerStyle={styles.ctaInner}
            >
              <Text style={styles.ctaText}>Get started</Text>
            </CloudyButton>

            <View style={styles.signInRow}>
              <Text style={styles.signInText}>Already have an account? </Text>
              <Link href="/(auth)/sign-in" asChild>
                <TouchableOpacity hitSlop={8}>
                  <Text style={styles.signInLink}>Sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </Animated.View>
        </Animated.View>
      </SafeAreaView>

      <Animated.View
        pointerEvents="none"
        style={[styles.flash, flashStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  flyingPlaneWrap: {
    position: 'absolute',
    top: 70,
    left: 0,
  },
  flash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 8,
    marginTop: 260,
  },
  title: {
    ...Typography.brandDisplay,
    fontSize: 44,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    ...Typography.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    alignItems: 'center',
    gap: 20,
  },
  cta: {
    width: '100%',
  },
  ctaInner: {
    justifyContent: 'center',
  },
  ctaText: {
    ...Typography.buttonLarge,
    color: Colors.cloudyButtonText,
    textAlign: 'center',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  signInLink: {
    ...Typography.bodySmall,
    color: Colors.text,
    fontWeight: '600',
  },
});
