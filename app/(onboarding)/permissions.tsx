import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import AnimatedGradientBackground from '../../components/animated-gradient-background';
import { Colors } from '../../constants/colors';
import { requestLocationPermissions } from '../../lib/location';

function PulsingRing({ delay, size }: { delay: number; size: number }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: 0 }),
          withTiming(1, { duration: 2500, easing: Easing.out(Easing.cubic) })
        ),
        -1
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.4, { duration: 0 }),
          withTiming(0, { duration: 2500, easing: Easing.out(Easing.cubic) })
        ),
        -1
      )
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
          borderColor: Colors.primary,
        },
        style,
      ]}
    />
  );
}

function AnimatedPin() {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(8, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name="location" size={56} color={Colors.primary} />
    </Animated.View>
  );
}

export default function PermissionsScreen() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleEnable = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await requestLocationPermissions();
    } catch {
      // User denied or error — continue anyway
    } finally {
      setLoading(false);
      router.push('/(onboarding)/storage');
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(onboarding)/storage');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <AnimatedGradientBackground
        colorSets={[
          {
            colors: ['#fff4cc', '#ffe8a3', '#ffd97a'],
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
          },
          {
            colors: ['#fff9e6', '#fff0bf', '#ffe599'],
            start: { x: 1, y: 0 },
            end: { x: 0, y: 1 },
          },
        ]}
        duration={4000}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* Pulsing rings + location pin */}
          <Animated.View
            entering={FadeIn.delay(200).duration(800)}
            style={styles.visualContainer}
          >
            <View style={styles.ringsWrapper}>
              <PulsingRing delay={0} size={200} />
              <PulsingRing delay={800} size={200} />
              <PulsingRing delay={1600} size={200} />
              <AnimatedPin />
            </View>
          </Animated.View>

          {/* Text */}
          <Animated.View
            entering={FadeInUp.delay(400).duration(600).springify()}
            style={styles.textContainer}
          >
            <Text style={styles.title}>Track your journey</Text>
            <Text style={styles.description}>
              Nomad automatically logs the cities and countries you visit.
              Everything stays on your device.
            </Text>
          </Animated.View>

          {/* Feature pills */}
          <Animated.View
            entering={FadeInDown.delay(600).duration(500)}
            style={styles.features}
          >
            {[
              { icon: 'airplane' as const, text: 'Auto-detect new cities' },
              { icon: 'shield-checkmark' as const, text: 'Data stays on device' },
              { icon: 'map' as const, text: 'Build your travel map' },
            ].map((f, i) => (
              <Animated.View
                key={f.text}
                entering={FadeInDown.delay(700 + i * 100).duration(400).springify()}
              >
                <View style={styles.featureRow}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={f.icon} size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              </Animated.View>
            ))}
          </Animated.View>

          {/* Actions */}
          <Animated.View
            entering={FadeInDown.delay(1000).duration(500).springify()}
            style={styles.actions}
          >
            <TouchableOpacity
              style={[styles.enableButton, loading && styles.enableButtonDisabled]}
              onPress={handleEnable}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="location" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.enableButtonText}>Enable Location</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSkip} disabled={loading}>
              <Text style={styles.skipText}>I'll set this up later</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  visualContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  ringsWrapper: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 24,
  },
  features: {
    gap: 10,
    marginBottom: 36,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    gap: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(26, 26, 46, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  actions: {
    alignItems: 'center',
    gap: 20,
  },
  enableButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    width: '100%',
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enableButtonDisabled: {
    opacity: 0.7,
  },
  enableButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  skipText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textTertiary,
  },
});
