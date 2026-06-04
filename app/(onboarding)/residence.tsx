import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { LOCAL_ONBOARDING_UID, setHasFixedResidence } from '../../lib/onboarding';
import { playCardTapSound } from '../../lib/sound';
import {
  ENTER_DURATION,
  TITLE_DELAY,
  OPTION_BASE_DELAY,
  OPTION_STAGGER,
} from '../../constants/onboardingAnimation';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

type ResidenceChoice = 'yes' | 'no' | null;

interface Option {
  choice: 'yes' | 'no';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const OPTIONS: Option[] = [
  {
    choice: 'yes',
    icon: 'home',
    title: 'Yes, I have a home base',
    description: "You're tax resident in your home country regardless of travel.",
  },
  {
    choice: 'no',
    icon: 'airplane',
    title: "No, I'm fully nomadic",
    description: 'Track your home country too. 183 days could trigger tax residency.',
  },
];

export default function ResidenceScreen() {
  const [selected, setSelected] = useState<ResidenceChoice>(null);
  const router = useRouter();
  const { user } = useAuth();

  const handleSelect = (choice: ResidenceChoice) => {
    if (!choice) return;
    setSelected(choice);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playCardTapSound();
    const uid = user?.uid ?? LOCAL_ONBOARDING_UID;
    setHasFixedResidence(uid, choice === 'yes');
    router.push('/(onboarding)/storage');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Animated.View
            entering={FadeIn.delay(TITLE_DELAY).duration(ENTER_DURATION)}
            style={styles.header}
          >
            <Text style={styles.title}>Fixed residence?</Text>
            <Text style={styles.subtitle}>
              Whether you keep a permanent home shapes how we track your tax residence.
            </Text>
          </Animated.View>

          <View style={styles.options}>
            {OPTIONS.map((opt, i) => (
              <Animated.View
                key={opt.choice}
                entering={FadeIn.delay(OPTION_BASE_DELAY + i * OPTION_STAGGER).duration(ENTER_DURATION)}
              >
                <TouchableOpacity
                  onPress={() => handleSelect(opt.choice)}
                  activeOpacity={0.85}
                  disabled={selected !== null}
                >
                  <Glass
                    {...glassProps}
                    style={[styles.optionRow, !hasGlass && styles.optionRowFallback]}
                  >
                    <View style={styles.optionIcon}>
                      <Ionicons name={opt.icon} size={24} color={Colors.cloudyButtonText} />
                    </View>
                    <View style={styles.optionTextWrap}>
                      <Text style={styles.optionTitle}>{opt.title}</Text>
                      <Text style={styles.optionDescription}>{opt.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                  </Glass>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>

          <Animated.View
            entering={FadeIn.delay(OPTION_BASE_DELAY + 2 * OPTION_STAGGER + 80).duration(ENTER_DURATION)}
            style={styles.footer}
          >
            <Text style={styles.footerText}>You can change this anytime in Settings.</Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  title: {
    ...Typography.brandDisplay,
    fontSize: 44,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  options: {
    gap: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    gap: 14,
  },
  optionRowFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: Colors.border,
  },
  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(77, 193, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: { flex: 1 },
  optionTitle: {
    ...Typography.titleSmall,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 3,
  },
  optionDescription: {
    ...Typography.bodySmall,
    fontSize: 13.5,
    color: Colors.textTertiary,
    lineHeight: 19,
  },
  footer: {
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    ...Typography.bodySmall,
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
