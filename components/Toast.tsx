import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeOut, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerToast, ToastData } from '../lib/toast';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

export function ToastContainer() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // registerToast returns its unregister fn — invoke on unmount so a
    // mounted sheet-level container can pop and let the root take over again.
    return registerToast((data) => setToast(data));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const isError = toast.type === 'error';

  return (
    <View style={[styles.wrapper, { top: insets.top + 8 }]} pointerEvents="none">
      <Animated.View
        entering={SlideInUp.duration(400).easing(Easing.out(Easing.cubic))}
        exiting={FadeOut.duration(300)}
        style={[styles.pill, isError && styles.pillError]}
      >
        <Text style={styles.icon}>{isError ? '✕' : '✓'}</Text>
        <Text style={styles.text}>{toast.message}</Text>
      </Animated.View>
    </View>
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
    gap: 8,
    backgroundColor: Colors.text,
    borderRadius: 100,
    paddingHorizontal: 18,
    paddingVertical: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  pillError: {
    backgroundColor: Colors.error,
  },
  icon: {
    ...Typography.bodySmall,
    fontWeight: '700',
    color: Colors.white,
  },
  text: {
    ...Typography.button,
    color: Colors.white,
  },
});
