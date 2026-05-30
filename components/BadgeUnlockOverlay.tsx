import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CountryBadge3D } from './CountryBadge3D';
import { CloudyButton } from './CloudyButton';
import { getBadgeInfo, markBadgeUnlocked } from '../lib/badges';
import { playCollectSound } from '../lib/sound';

const BLACK_BG = '#000000';

function formatTodayShort(): string {
  return new Date()
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();
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
        <CountryBadge3D countryCode={countryCode} backgroundColor={BLACK_BG} />

        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View pointerEvents="none" style={styles.topBlock}>
            <Text style={styles.eyebrow}>Reward</Text>
            <Text style={styles.title}>{info.name}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Earned on: {formatTodayShort()}</Text>
            </View>
          </View>

          <View pointerEvents="box-none" style={styles.bottomBlock}>
            <CloudyButton onPress={handleCollect} haptic={Haptics.ImpactFeedbackStyle.Medium}>
              <View style={styles.ctaContent}>
                <Ionicons name="sparkles" size={20} color="#0B2541" />
                <Text style={styles.ctaText}>Collect</Text>
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
    backgroundColor: BLACK_BG,
    zIndex: 1000,
    elevation: 1000,
  },
  topBlock: {
    paddingTop: 84,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 3.2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 44,
    fontWeight: '800',
    color: '#FFFFFF',
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
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  metaText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
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
    color: '#0B2541',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
