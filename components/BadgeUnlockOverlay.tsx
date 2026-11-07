import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { CountryBadge3D } from './CountryBadge3D';
import { CloudyButton } from './CloudyButton';
import { Colors } from '../constants/colors';
import { Typography, FontSize } from '../constants/typography';
import { getBadgeInfo, markBadgeUnlocked } from '../lib/badges';
import { playCollectSound } from '../lib/sound';
import { useTranslation } from '../contexts/LanguageContext';

function formatTodayShort(language: string): string {
  return new Date().toLocaleDateString(language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface BadgeUnlockOverlayProps {
  countryCode: string;
  onClose: () => void;
}

/**
 * Full-screen inline overlay shown when a badge is unlocked. Uses an
 * absolute-positioned View instead of a modal route to avoid the
 * RNScreens form-sheet detent issue when transitioning from the create flow.
 */
export function BadgeUnlockOverlay({ countryCode, onClose }: BadgeUnlockOverlayProps) {
  const { t, language, countryName } = useTranslation();
  const info = getBadgeInfo(countryCode);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markBadgeUnlocked(countryCode).catch(() => {});
  }, [countryCode]);

  const handleCollect = () => {
    playCollectSound();
    onClose();
  };

  if (!info) {
    onClose();
    return null;
  }

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <CountryBadge3D countryCode={countryCode} />

        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View pointerEvents="none" style={styles.topBlock}>
            <Text style={styles.eyebrow}>{t('badge.reward')}</Text>
            <Text style={styles.title}>{countryName(info.name)}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{t('badge.earned', { date: formatTodayShort(language) })}</Text>
            </View>
          </View>

          <View pointerEvents="box-none" style={styles.bottomBlock}>
            <CloudyButton onPress={handleCollect} haptic={Haptics.ImpactFeedbackStyle.Medium}>
              <View style={styles.ctaContent}>
                <Ionicons name="sparkles" size={20} color={Colors.cloudyButtonText} />
                <Text style={styles.ctaText}>{t('badge.collect')}</Text>
              </View>
            </CloudyButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    zIndex: 1000,
    elevation: 1000,
  },
  topBlock: {
    paddingTop: 84,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 10,
  },
  eyebrow: { ...Typography.sectionLabel },
  title: { ...Typography.displayMedium, fontSize: FontSize.title1, fontWeight: '700', textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaText: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textSecondary },
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
    color: Colors.cloudyButtonText,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
