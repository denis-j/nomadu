import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Typography, FontSize } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { LOCAL_ONBOARDING_UID, OnboardingGoal, setOnboardingGoal } from '../../lib/onboarding';
import { playCardTapSound } from '../../lib/sound';
import {
  ENTER_DURATION,
  TITLE_DELAY,
  OPTION_BASE_DELAY,
  OPTION_STAGGER,
} from '../../constants/onboardingAnimation';
import { track } from '../../lib/analytics';
import { useTranslation } from '../../contexts/LanguageContext';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

interface Option {
  goal: OnboardingGoal;
  icon: keyof typeof Ionicons.glyphMap;
}

const OPTIONS: Option[] = [
  { goal: 'tax', icon: 'shield-checkmark' },
  { goal: 'visa', icon: 'airplane' },
  { goal: 'history', icon: 'map' },
];

export default function GoalScreen() {
  const [selected, setSelected] = useState<OnboardingGoal | null>(null);
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const handleSelect = (goal: OnboardingGoal) => {
    if (selected) return;
    setSelected(goal);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playCardTapSound();
    const uid = user?.uid ?? LOCAL_ONBOARDING_UID;
    setOnboardingGoal(uid, goal);
    track({ name: 'onboarding_goal_chosen', props: { goal } });
    router.push('/(onboarding)/residence');
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
            <Text style={styles.title}>{t('onboarding.goal.title')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.goal.subtitle')}</Text>
          </Animated.View>

          <View style={styles.options}>
            {OPTIONS.map((opt, i) => (
              <Animated.View
                key={opt.goal}
                entering={FadeIn.delay(OPTION_BASE_DELAY + i * OPTION_STAGGER).duration(ENTER_DURATION)}
              >
                <TouchableOpacity
                  onPress={() => handleSelect(opt.goal)}
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
                      <Text style={styles.optionTitle}>{t(`onboarding.goal.${opt.goal}.title`)}</Text>
                      <Text style={styles.optionDescription}>{t(`onboarding.goal.${opt.goal}.description`)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                  </Glass>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>

          <Animated.View
            entering={FadeIn.delay(OPTION_BASE_DELAY + 3 * OPTION_STAGGER + 80).duration(ENTER_DURATION)}
            style={styles.footer}
          >
            <Text style={styles.footerText}>{t('onboarding.goal.footer')}</Text>
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
    fontSize: FontSize.callout,
    fontWeight: '600',
    marginBottom: 3,
  },
  optionDescription: {
    ...Typography.bodySmall,
    fontSize: FontSize.footnote,
    color: Colors.textTertiary,
    lineHeight: 19,
  },
  footer: {
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    ...Typography.bodySmall,
    fontSize: FontSize.footnote,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
