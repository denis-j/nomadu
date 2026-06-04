import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { Colors } from '../constants/colors';

const hasGlass = isLiquidGlassAvailable();

interface GlassPillProps {
  active?: boolean;
  onPress?: () => void;
  children: ReactNode;
  /** Override the active-state tint. Defaults to Colors.text (near-black). */
  activeTint?: string;
}

/**
 * Single Liquid-Glass pill used in horizontal/wrap-row segmented controls.
 * Active state fills with `activeTint`. On older iOS, falls back to a flat
 * surface pill. Same DNA as the YearPicker pills on the Tracking screen.
 */
export function GlassPill({ active, onPress, children, activeTint = Colors.text }: GlassPillProps) {
  if (hasGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={active ? activeTint : undefined}
        isInteractive
        style={styles.glass}
      >
        <Pressable onPress={onPress} style={styles.inner}>
          {children}
        </Pressable>
      </GlassView>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fallback,
        active && { backgroundColor: activeTint },
        pressed && !active && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 999,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  inner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
  pressed: {
    opacity: 0.6,
  },
});
