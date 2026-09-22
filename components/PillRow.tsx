import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

const hasGlass = isLiquidGlassAvailable();

export interface PillOption {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Drawn where the icon would be, for a pill that leads with a face. */
  leading?: ReactNode;
  active?: boolean;
  onPress: () => void;
  /** Secondary actions on the pill (rename, remove). Fires on active pills too. */
  onLongPress?: () => void;
}

/**
 * Horizontal row of pills, the app's filter control (years on the stats
 * screens, travellers in the document wallet). On iOS 26+ each pill is a
 * Liquid Glass capsule, tinted when active; older devices get flat surface
 * pills. Tapping an already active pill is a no-op, so callers can treat
 * onPress as "became active".
 */
export function PillRow({ options, tabular = false }: { options: PillOption[]; tabular?: boolean }) {
  const press = (opt: PillOption) => {
    if (opt.active) return;
    Haptics.selectionAsync();
    opt.onPress();
  };

  const content = (opt: PillOption) => (
    <>
      {opt.leading}
      {opt.icon && (
        <Ionicons name={opt.icon} size={15} color={opt.active ? Colors.white : Colors.text} />
      )}
      <Text
        style={[
          styles.pillText,
          tabular && styles.pillTextTabular,
          opt.active && styles.pillTextActive,
        ]}
      >
        {opt.label}
      </Text>
    </>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {hasGlass ? (
        <View style={styles.glassContainer}>
          {options.map((opt) => (
            <GlassView
              key={opt.key}
              glassEffectStyle="regular"
              tintColor={opt.active ? Colors.text : undefined}
              isInteractive
              style={styles.pillGlass}
            >
              <Pressable onPress={() => press(opt)} onLongPress={opt.onLongPress} style={[styles.pillInner, !!opt.leading && styles.pillWithFace]}>
                {content(opt)}
              </Pressable>
            </GlassView>
          ))}
        </View>
      ) : (
        <View style={styles.fallbackRow}>
          {options.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => press(opt)}
              onLongPress={opt.onLongPress}
              style={({ pressed }) => [
                styles.pillFallback,
                !!opt.leading && styles.pillWithFace,
                opt.active && styles.pillFallbackActive,
                pressed && !opt.active && styles.pillPressed,
              ]}
            >
              {content(opt)}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  glassContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  pillGlass: {
    borderRadius: 999,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  // A face is taller than the text it sits next to; keep the capsule from
  // growing around it.
  pillWithFace: { paddingLeft: 6, paddingVertical: 5 },
  fallbackRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
  pillFallbackActive: {
    backgroundColor: Colors.text,
  },
  pillPressed: {
    opacity: 0.6,
  },
  pillText: {
    ...Typography.label,
    fontWeight: '600',
  },
  pillTextTabular: {
    fontVariant: ['tabular-nums'],
  },
  pillTextActive: {
    color: Colors.white,
  },
});
