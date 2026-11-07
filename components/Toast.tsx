import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import Animated, { Easing, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerToast, ToastData } from '../lib/toast';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useTranslation } from '../contexts/LanguageContext';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/** How long a toast stays: an error is read, a confirmation only glanced at. */
const DURATION = { success: 2400, error: 3800 };
/** Long enough for the exit animation before the overlay goes. */
const EXIT_MS = 320;

// In from a short distance with a firm spring: SlideInUp starts a whole
// screen up, and over that distance any spring overshot far past the spot.
const SPRING = { damping: 20, stiffness: 300, mass: 0.8 };
const enter = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -24 }, { scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: 160 }),
      transform: [{ translateY: withSpring(0, SPRING) }, { scale: withSpring(1, SPRING) }],
    },
  };
};
const exit = () => {
  'worklet';
  const timing = { duration: EXIT_MS - 60, easing: Easing.in(Easing.cubic) };
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, timing),
      transform: [{ translateY: withTiming(-20, timing) }, { scale: withTiming(0.96, timing) }],
    },
  };
};

/**
 * The toast at the top of the screen: a glass pill with an SF Symbol, the
 * look of the app's other glass controls. It drops in with a short, firm
 * spring and fades up and away when it goes, and a tap dismisses it at once. Each new toast
 * animates in again, also when one is still showing.
 *
 * On iOS it draws in a FullWindowOverlay, a window above everything: a native
 * sheet (formSheet) sits above the app's root view, so a toast mounted there
 * played its sound and haptic behind the sheet where nobody saw it. The
 * overlay only exists while a toast does, and passes touches outside the pill.
 */
export function ToastContainer() {
  const [toast, setToast] = useState<(ToastData & { id: number }) | null>(null);
  const [mounted, setMounted] = useState(false);
  const seq = useRef(0);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  useEffect(() => {
    // registerToast returns its unregister fn, invoke on unmount so a
    // mounted sheet-level container can pop and let the root take over again.
    return registerToast((data) => {
      seq.current += 1;
      setToast({ ...data, id: seq.current });
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!toast) {
      const t = setTimeout(() => setMounted(false), EXIT_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setToast(null), DURATION[toast.type]);
    return () => clearTimeout(t);
  }, [toast]);

  if (!mounted) return null;

  const content = (
    <View style={[styles.wrapper, { top: insets.top + 6 }]} pointerEvents="box-none">
      {toast && (
        <Animated.View
          key={toast.id}
          entering={enter}
          exiting={exit}
          style={styles.shadow}
        >
          <Pressable
            onPress={() => setToast(null)}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityHint={t('common.close')}
          >
            <Glass {...glassProps} style={[styles.pill, !hasGlass && styles.pillFallback]}>
              <SymbolView
                name={toast.type === 'error'
                  ? { ios: 'exclamationmark.circle.fill', android: 'error' }
                  : { ios: 'checkmark.circle.fill', android: 'check_circle' }}
                size={22}
                tintColor={toast.type === 'error' ? Colors.error : Colors.success}
              />
              <Text style={styles.text} numberOfLines={2}>{toast.message}</Text>
            </Glass>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
  return Platform.OS === 'ios' ? <FullWindowOverlay>{content}</FullWindowOverlay> : content;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  shadow: {
    maxWidth: '100%',
    borderRadius: 100,
    boxShadow: '0 8px 24px rgba(11, 37, 65, 0.16)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 100,
    borderCurve: 'continuous',
    paddingLeft: 14,
    paddingRight: 20,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  pillFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  text: {
    ...Typography.button,
    flexShrink: 1,
  },
});
