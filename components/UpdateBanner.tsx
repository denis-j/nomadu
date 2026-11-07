import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloudBackdrop } from './CloudBackdrop';
import { CloudyButton } from './CloudyButton';
import { Colors } from '../constants/colors';
import { Typography, FontSize } from '../constants/typography';
import { useTranslation } from '../contexts/LanguageContext';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const ICON = 44;

interface UpdateBannerProps {
  visible: boolean;
  onApply: () => void;
}

/**
 * A glass card above the tab bar when an OTA update is staged: the small pill
 * it replaced was easy to miss. "Update now" reloads at once through the
 * host's `onApply`; "Later" hides the card, and the update still applies on
 * the next cold start.
 */
export function UpdateBanner({ visible, onApply }: UpdateBannerProps) {
  const { t } = useTranslation();
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
      <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
        <View style={styles.head}>
          <View style={styles.icon}>
            <CloudBackdrop width={ICON} height={ICON} blur={2.5} />
            <Ionicons name="sparkles" size={20} color={Colors.cloudyButtonText} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.title}>{t('comp.updateTitle')}</Text>
            <Text style={styles.body}>{t('comp.updateBody')}</Text>
          </View>
        </View>
        <CloudyButton onPress={handleApply} compact innerStyle={styles.ctaInner}>
          <Text style={styles.ctaText}>{t('comp.updateNow')}</Text>
        </CloudyButton>
        <Pressable onPress={handleDismiss} hitSlop={8} style={({ pressed }) => [styles.later, pressed && { opacity: 0.55 }]}>
          <Text style={styles.laterText}>{t('comp.later')}</Text>
        </Pressable>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 16,
    paddingBottom: 6,
    gap: 14,
    borderRadius: 26,
    borderCurve: 'continuous',
    overflow: 'hidden',
    shadowColor: '#0B2541',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
  },
  cardFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2 },
  title: { ...Typography.titleSmall, fontWeight: '700' },
  body: { ...Typography.bodySmall, fontSize: FontSize.subheadline, lineHeight: 19, color: Colors.textSecondary },
  ctaInner: { justifyContent: 'center' },
  ctaText: { ...Typography.titleSmall, fontWeight: '700', color: Colors.cloudyButtonText },
  later: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  laterText: { ...Typography.button, color: Colors.textSecondary },
});
