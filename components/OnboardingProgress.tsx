import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Colors } from '../constants/colors';

interface OnboardingProgressProps {
  /** 1-indexed current step */
  step: number;
  /** Total number of steps in the onboarding */
  total: number;
}

/**
 * Thin floating progress bar pinned to the top of every onboarding screen.
 * Drives the Zeigarnik effect — users see how close they are to the finish.
 */
export function OnboardingProgress({ step, total }: OnboardingProgressProps) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const target = Math.min(1, Math.max(0, step / total));

  useEffect(() => {
    progress.value = withTiming(target, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [target]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { paddingTop: insets.top + 8 }]}
    >
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 32,
    zIndex: 100,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(11, 37, 65, 0.10)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
});
