import { Ionicons } from '@expo/vector-icons';
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
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import AnimatedGradientBackground from '../../components/animated-gradient-background';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../hooks/useAuth';
import { setHasFixedResidence } from '../../lib/onboarding';

type ResidenceChoice = 'yes' | 'no' | null;

export default function ResidenceScreen() {
  const [selected, setSelected] = useState<ResidenceChoice>(null);
  const router = useRouter();
  const { user } = useAuth();

  const handleSelect = (choice: ResidenceChoice) => {
    if (!choice || !user) return;
    setSelected(choice);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHasFixedResidence(user.uid, choice === 'yes'); // fire & forget
    router.push('/(onboarding)/permissions');
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
          {/* Icon */}
          <Animated.View
            entering={FadeIn.duration(300)}
            style={styles.visualContainer}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="home-outline" size={48} color={Colors.primary} />
            </View>
          </Animated.View>

          {/* Text */}
          <Animated.View
            entering={FadeInUp.delay(80).duration(300)}
            style={styles.textContainer}
          >
            <Text style={styles.title}>Fixed residence?</Text>
            <Text style={styles.description}>
              Do you have a permanent home address in your home country? This affects tax residence tracking.
            </Text>
          </Animated.View>

          {/* Options */}
          <Animated.View
            entering={FadeInDown.delay(160).duration(300)}
            style={styles.options}
          >
            <TouchableOpacity
              style={[
                styles.optionCard,
                selected === 'yes' && styles.optionCardSelected,
              ]}
              onPress={() => handleSelect('yes')}
              activeOpacity={0.7}
              disabled={selected !== null}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="home" size={24} color={Colors.primary} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Yes, I have a home base</Text>
                <Text style={styles.optionDescription}>
                  You're tax resident in your home country regardless of travel.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.optionCard,
                selected === 'no' && styles.optionCardSelected,
              ]}
              onPress={() => handleSelect('no')}
              activeOpacity={0.7}
              disabled={selected !== null}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="airplane" size={24} color={Colors.primary} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>No, I'm fully nomadic</Text>
                <Text style={styles.optionDescription}>
                  Track your home country too — 183 days could trigger tax residency.
                </Text>
              </View>
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
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
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
  options: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    gap: 14,
  },
  optionCardSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 26, 46, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 3,
  },
  optionDescription: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.5,
    lineHeight: 20,
  },
});
