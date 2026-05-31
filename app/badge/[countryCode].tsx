import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { CountryBadge3D, hasCountryBadge } from '../../components/CountryBadge3D';
import { CloudyButton } from '../../components/CloudyButton';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { getBadgeInfo, markBadgeUnlocked } from '../../lib/badges';
import { playCollectSound } from '../../lib/sound';

const BLACK_BG = '#000000';
const hasGlass = isLiquidGlassAvailable();

function formatTodayShort(): string {
  return new Date()
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();
}

export default function BadgeFullscreenScreen() {
  const router = useRouter();
  const { countryCode, unlock } = useLocalSearchParams<{ countryCode: string; unlock?: string }>();
  const code = (countryCode ?? '').toUpperCase();
  const info = getBadgeInfo(code);
  const isUnlock = unlock === '1' || unlock === 'true';

  useEffect(() => {
    if (isUnlock && code) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      markBadgeUnlocked(code).catch(() => {});
    }
  }, [isUnlock, code]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleCollect = () => {
    playCollectSound();
    handleClose();
  };

  if (!hasCountryBadge(code) || !info) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No badge for "{code}"</Text>
          <Pressable onPress={handleClose} style={styles.errorClose}>
            <Text style={styles.errorCloseText}>Close</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <CountryBadge3D countryCode={code} backgroundColor={BLACK_BG} />

        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {/* Close button — top right, liquid glass on black */}
          <View style={styles.closeWrap}>
            {hasGlass ? (
              <GlassView style={styles.closeBtnGlass} isInteractive>
                <Pressable
                  onPress={handleClose}
                  hitSlop={12}
                  style={({ pressed }) => [styles.closeInner, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="close" size={20} color={Colors.white} />
                </Pressable>
              </GlassView>
            ) : (
              <Pressable
                onPress={handleClose}
                hitSlop={12}
                style={({ pressed }) => [styles.closeBtnFallback, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="close" size={20} color={Colors.white} />
              </Pressable>
            )}
          </View>

          {/* Title block — same trio as unlock overlay */}
          <View pointerEvents="none" style={styles.topBlock}>
            <Text style={styles.eyebrow}>Reward</Text>
            <Text style={styles.title}>{info.name}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Earned {formatTodayShort()}</Text>
            </View>
          </View>

          {/* Bottom CTA for unlock mode only */}
          {isUnlock && (
            <View pointerEvents="box-none" style={styles.bottomBlock}>
              <CloudyButton onPress={handleCollect} haptic={Haptics.ImpactFeedbackStyle.Medium}>
                <View style={styles.ctaContent}>
                  <Ionicons name="sparkles" size={20} color={Colors.cloudyButtonText} />
                  <Text style={styles.ctaText}>Collect</Text>
                </View>
              </CloudyButton>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BLACK_BG,
  },
  closeWrap: {
    position: 'absolute',
    top: 56,
    right: 20,
  },
  closeBtnGlass: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  closeInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBlock: {
    paddingTop: 84,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 10,
  },
  eyebrow: {
    ...Typography.eyebrow,
    color: Colors.whiteAlpha55,
    letterSpacing: 3.2,
  },
  title: {
    ...Typography.displayLarge,
    fontSize: 44,
    color: Colors.white,
    letterSpacing: -1.2,
    textAlign: 'center',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.whiteAlpha55,
    letterSpacing: 1.6,
  },
  bottomBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 56,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flex: 1,
  },
  ctaText: {
    ...Typography.titleSmall,
    fontWeight: '700',
    color: Colors.cloudyButtonText,
    letterSpacing: 0.3,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: BLACK_BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: {
    ...Typography.bodySmall,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  errorClose: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  errorCloseText: {
    ...Typography.bodySmall,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
});
