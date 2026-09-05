import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

interface UpdateBannerProps {
  visible: boolean;
  onApply: () => void;
}

/**
 * Non-blocking floating pill that surfaces a staged OTA update. Sits above the
 * tab bar so it doesn't cover the active screen's primary content. "Now"
 * triggers an immediate reload via the host's `onApply`; "Later" just hides
 * the pill — the staged update still applies on the next cold start.
 */
export function UpdateBanner({ visible, onApply }: UpdateBannerProps) {
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  const handleApply = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onApply();
  };

  const handleDismiss = () => {
    Haptics.selectionAsync();
    setDismissed(true);
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      entering={SlideInDown.duration(380).springify()}
      exiting={FadeOut.duration(200)}
      style={[styles.wrapper, { bottom: Math.max(insets.bottom, 16) + 92 }]}
    >
      <Glass {...glassProps} style={[styles.pill, !hasGlass && styles.pillFallback]}>
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles" size={14} color={Colors.cloudyButtonText} />
        </View>
        <Text style={styles.text}>Update ready</Text>
        <Pressable onPress={handleDismiss} hitSlop={6} style={styles.laterBtn}>
          <Text style={styles.laterText}>Later</Text>
        </Pressable>
        <Pressable onPress={handleApply} hitSlop={6} style={styles.applyBtn}>
          <Text style={styles.applyText}>Now</Text>
        </Pressable>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: '#0B2541',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  pillFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: Colors.border,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(77, 193, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...Typography.button,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginRight: 4,
  },
  laterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  laterText: {
    ...Typography.button,
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  applyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.text,
  },
  applyText: {
    ...Typography.button,
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.white,
  },
});
