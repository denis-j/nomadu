import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CloudyButton } from '../../components/CloudyButton';
import { PlaneModel3D } from '../../components/PlaneModel3D';
import {
  ENTER_DURATION,
  ICON_DELAY,
  TITLE_DELAY,
  OPTION_BASE_DELAY,
} from '../../constants/onboardingAnimation';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { requestLocationPermissions } from '../../lib/location';
import { requestNotificationPermissions } from '../../lib/notifications';


export default function PermissionsScreen() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleEnable = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await requestLocationPermissions();
      await requestNotificationPermissions();
    } catch {
      // User denied or error. Continue anyway.
    } finally {
      setLoading(false);
      router.push('/(onboarding)/loading');
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(onboarding)/loading');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* 3D plane hero */}
          <Animated.View
            entering={FadeIn.delay(ICON_DELAY).duration(ENTER_DURATION)}
            style={styles.visualContainer}
          >
            <PlaneModel3D />
          </Animated.View>

          {/* Text */}
          <Animated.View
            entering={FadeIn.delay(TITLE_DELAY).duration(ENTER_DURATION)}
            style={styles.textContainer}
          >
            <Text style={styles.title}>Track your journey</Text>
            <Text style={styles.description}>
              Nomadu quietly logs every city and country you visit. No setup, no friction.
            </Text>
          </Animated.View>

          {/* Actions */}
          <Animated.View
            entering={FadeIn.delay(OPTION_BASE_DELAY + 100).duration(ENTER_DURATION)}
            style={styles.actions}
          >
            <CloudyButton
              onPress={handleEnable}
              style={[styles.enableButton, loading && styles.enableButtonDisabled]}
              innerStyle={styles.enableInner}
            >
              {loading ? (
                <ActivityIndicator color={Colors.cloudyButtonText} />
              ) : (
                <View style={styles.enableInnerRow}>
                  <Ionicons name="location" size={20} color={Colors.cloudyButtonText} />
                  <Text style={styles.enableButtonText}>Enable Location</Text>
                </View>
              )}
            </CloudyButton>

            <TouchableOpacity onPress={handleSkip} disabled={loading} hitSlop={8}>
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
    marginBottom: -12,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    ...Typography.brandDisplay,
    fontSize: 42,
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    ...Typography.bodyLarge,
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    marginTop: 36,
    alignItems: 'center',
    gap: 20,
  },
  enableButton: {
    width: '100%',
  },
  enableInner: {
    justifyContent: 'center',
  },
  enableInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  enableButtonDisabled: {
    opacity: 0.7,
  },
  enableButtonText: {
    ...Typography.buttonLarge,
    color: Colors.cloudyButtonText,
  },
  skipText: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
});
