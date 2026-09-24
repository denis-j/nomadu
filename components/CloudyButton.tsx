import { ReactNode, useRef, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CloudBackdrop } from './CloudBackdrop';

interface CloudyButtonProps {
  /**
   * May return a promise. Until it settles, further taps are ignored, so a
   * quick double tap cannot create an account or send a reset mail twice.
   */
  onPress: () => void | Promise<unknown>;
  /** No taps at all, e.g. while the form is incomplete. */
  disabled?: boolean;
  children: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  /** Haptic feedback style on press. Defaults to Medium. Pass null to disable. */
  haptic?: Haptics.ImpactFeedbackStyle | null;
}

/**
 * Primary cloud-style button: radial blue-to-white gradient with patchy white
 * blobs, a top chamfer highlight and a subtle press feedback. Used for the
 * key primary CTAs across the app (e.g. timeline empty state, badge unlock).
 */
export function CloudyButton({
  onPress,
  disabled,
  children,
  compact,
  style,
  innerStyle,
  haptic = Haptics.ImpactFeedbackStyle.Medium,
}: CloudyButtonProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const busy = useRef(false);

  const handlePress = () => {
    if (disabled || busy.current) return;
    if (haptic !== null) Haptics.impactAsync(haptic);
    const result = onPress();
    if (result && typeof (result as Promise<unknown>).finally === 'function') {
      busy.current = true;
      (result as Promise<unknown>).catch(() => {}).finally(() => { busy.current = false; });
    }
  };

  return (
    <View style={styles.shadow}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityState={{ disabled: !!disabled }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
        }}
        style={({ pressed }) => [
          styles.outer,
          compact && styles.outerCompact,
          style,
          pressed && styles.pressed,
        ]}
      >
        <CloudBackdrop width={size.w} height={size.h} />
        <View style={[styles.inner, innerStyle]}>{children}</View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    width: '100%',
    // Capped for wide screens; without this the button would hang on the
    // left of any parent wider than the cap instead of sitting in the middle.
    maxWidth: 360,
    alignSelf: 'center',
  },
  outer: {
    borderRadius: 999,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  outerCompact: {
    paddingVertical: 14,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
});
