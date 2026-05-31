import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Flag } from '../../components/Flag';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { useOnboarding } from '../../contexts/OnboardingContext';
import {
  getCitizenship,
  getOnboardingGoal,
  LOCAL_ONBOARDING_UID,
  type OnboardingGoal,
} from '../../lib/onboarding';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

interface Stage {
  /** message rendered to the user */
  text: (country: string) => string;
  /** dwell duration in ms */
  duration: number;
}

const BASE_STAGES: Stage[] = [
  { text: () => 'Setting up your tracking engine…', duration: 1100 },
  { text: () => '', duration: 1300 }, // personalized, filled in based on goal
  { text: () => 'Loading 195 visa rules…', duration: 1100 },
  { text: () => 'Ready.', duration: 700 },
];

function personalizedStage(goal: OnboardingGoal | null): Stage['text'] {
  switch (goal) {
    case 'visa':
      return (c) => `Mapping visa rules for ${c} passport…`;
    case 'history':
      return () => 'Importing world map data…';
    case 'tax':
    default:
      return (c) => `Calibrating tax rules for ${c}…`;
  }
}

const TOTAL_DURATION = BASE_STAGES.reduce((a, s) => a + s.duration, 0);

/**
 * One ring that breathes outward and fades. Stacked three deep with a stagger
 * to feel like a "signal" pulse, same DNA as the permissions location pin.
 */
function PulsingRing({ delay, size }: { delay: number; size: number }) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.4, { duration: 0 }),
          withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) }),
        ),
        -1,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.55, { duration: 0 }),
          withTiming(0, { duration: 2400, easing: Easing.out(Easing.cubic) }),
        ),
        -1,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: Colors.cloudyBlue,
        },
        style,
      ]}
    />
  );
}

export default function LoadingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { markOnboardingComplete } = useOnboarding();
  const [stageIndex, setStageIndex] = useState(0);
  const [country, setCountry] = useState('your home country');
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);

  const progress = useSharedValue(0);
  const bubbleScale = useSharedValue(1);

  useEffect(() => {
    const uid = user?.uid ?? LOCAL_ONBOARDING_UID;
    getCitizenship(uid).then((c) => {
      if (c?.country) setCountry(c.country);
      if (c?.countryCode) setCountryCode(c.countryCode);
    });
    getOnboardingGoal(uid).then(setGoal);
  }, [user]);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: TOTAL_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });

    // Subtle breathing on the center bubble so the screen never feels still.
    bubbleScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 0; i < BASE_STAGES.length; i++) {
      const t = setTimeout(() => setStageIndex(i), elapsed);
      timeouts.push(t);
      elapsed += BASE_STAGES[i].duration;
    }

    const exit = setTimeout(async () => {
      // Mark steps complete (under the pending UID when there's no user yet)
      // so a re-launch picks up on /sign-up instead of restarting citizenship.
      await markOnboardingComplete();
      router.replace('/(auth)/sign-up');
    }, TOTAL_DURATION + 300);
    timeouts.push(exit);

    return () => timeouts.forEach(clearTimeout);
  }, [router, markOnboardingComplete]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const bubbleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bubbleScale.value }],
  }));

  const stages: Stage[] = BASE_STAGES.map((s, i) =>
    i === 1 ? { ...s, text: personalizedStage(goal) } : s,
  );
  const currentStage = stages[stageIndex];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.visualContainer}>
            <View style={styles.ringWrapper}>
              <PulsingRing delay={0} size={RING_SIZE} />
              <PulsingRing delay={800} size={RING_SIZE} />
              <PulsingRing delay={1600} size={RING_SIZE} />
              <Animated.View style={bubbleAnimatedStyle}>
                <Glass
                  {...glassProps}
                  style={[styles.centerBubble, !hasGlass && styles.centerBubbleFallback]}
                >
                  {countryCode ? (
                    <Flag code={countryCode} size={36} />
                  ) : (
                    <Ionicons name="globe-outline" size={32} color={Colors.cloudyButtonText} />
                  )}
                </Glass>
              </Animated.View>
            </View>
          </View>

          <Animated.Text
            key={stageIndex}
            entering={FadeIn.duration(320)}
            exiting={FadeOut.duration(200)}
            style={styles.stageText}
          >
            {currentStage.text(country)}
          </Animated.Text>

          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, fillStyle]} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const RING_SIZE = 180;
const BUBBLE_SIZE = 84;

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  visualContainer: {
    marginBottom: 44,
  },
  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#0B2541',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  centerBubbleFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  stageText: {
    ...Typography.brandTitle,
    fontSize: 22,
    color: Colors.text,
    textAlign: 'center',
    minHeight: 32,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  progressTrack: {
    width: '55%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(11, 37, 65, 0.10)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.cloudyButtonText,
  },
});
