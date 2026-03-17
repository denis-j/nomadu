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
import { setCloudSyncEnabled } from '../../lib/sync';

type StorageChoice = 'local' | 'cloud' | null;

export default function StorageScreen() {
  const [selected, setSelected] = useState<StorageChoice>(null);
  const router = useRouter();
  const { user } = useAuth();

  const handleSelect = (choice: StorageChoice) => {
    if (!choice || !user) return;
    setSelected(choice);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCloudSyncEnabled(user.uid, choice === 'cloud'); // fire & forget
    router.push('/(onboarding)/paywall');
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
              <Ionicons name="cloud-outline" size={48} color={Colors.primary} />
            </View>
          </Animated.View>

          {/* Text */}
          <Animated.View
            entering={FadeInUp.delay(80).duration(300)}
            style={styles.textContainer}
          >
            <Text style={styles.title}>Store your data</Text>
            <Text style={styles.description}>
              Choose where to keep your trip history. You can change this anytime in Settings.
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
                selected === 'local' && styles.optionCardSelected,
              ]}
              onPress={() => handleSelect('local')}
              activeOpacity={0.7}
              disabled={selected !== null}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="phone-portrait-outline" size={24} color={Colors.primary} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>On Device</Text>
                <Text style={styles.optionDescription}>
                  Data stays on this device only. Fast and private.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.optionCard,
                selected === 'cloud' && styles.optionCardSelected,
              ]}
              onPress={() => handleSelect('cloud')}
              activeOpacity={0.7}
              disabled={selected !== null}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="cloud-outline" size={24} color={Colors.primary} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Cloud Sync</Text>
                <Text style={styles.optionDescription}>
                  Sync across devices. Data is backed up securely.
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
