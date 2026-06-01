import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  Image,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CloudyButton } from '../../components/CloudyButton';
import { ConfettiBurst } from '../../components/ConfettiBurst';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { setCelebrating } from '../../lib/celebration';
import { getOnboardingGoal } from '../../lib/onboarding';
import { playAirHornSound } from '../../lib/sound';

function landingRouteForGoal(goal: Awaited<ReturnType<typeof getOnboardingGoal>>): string {
  switch (goal) {
    case 'tax': return '/(tabs)/(stats)/tax';
    case 'visa': return '/(tabs)/(stats)/visa';
    case 'history': return '/(tabs)/(timeline)';
    default: return '/(tabs)';
  }
}

export default function CelebrateScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useSubscription();
  const { markOnboardingComplete } = useOnboarding();

  useEffect(() => {
    playAirHornSound();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    // Finalise async work (subscription refresh + onboarding flag) while the
    // confetti plays. We're still flagged as celebrating, so RootNavigator
    // won't redirect us mid-way.
    refresh().catch(() => {});
    markOnboardingComplete().catch(() => {});

    return () => {
      // If the screen unmounts for any reason, release RootNavigator so it's
      // not stuck blocking navigation forever.
      setCelebrating(false);
    };
  }, []);

  const handleContinue = async () => {
    const goal = user ? await getOnboardingGoal(user.uid) : null;
    setCelebrating(false);
    router.replace(landingRouteForGoal(goal) as never);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient
        colors={['#4DC1FF', '#8AD3FF', '#DBF0FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ConfettiBurst />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Animated.View
            entering={FadeIn.delay(80).duration(500)}
            style={styles.heart}
          >
            <Image
              source={require('../../assets/icons/heart.png')}
              style={styles.heartImage}
              resizeMode="contain"
            />
          </Animated.View>
          <Animated.Text
            entering={FadeIn.delay(220).duration(500)}
            style={styles.title}
          >
            Welcome aboard
          </Animated.Text>
          <Animated.Text
            entering={FadeIn.delay(360).duration(500)}
            style={styles.subtitle}
          >
            The world is yours to track.
          </Animated.Text>
        </View>
        <Animated.View
          entering={FadeIn.delay(800).duration(500)}
          style={styles.actions}
        >
          <CloudyButton
            onPress={handleContinue}
            style={styles.cta}
            innerStyle={styles.ctaInner}
          >
            <Text style={styles.ctaText}>Let&rsquo;s go</Text>
          </CloudyButton>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  safeArea: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  heart: {
    marginBottom: 24,
  },
  heartImage: {
    width: 140,
    height: 140,
  },
  title: {
    ...Typography.brandDisplay,
    fontSize: 52,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
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
});
