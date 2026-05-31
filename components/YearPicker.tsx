import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import type { YearFilter } from '../lib/yearFilter';

const hasGlass = isLiquidGlassAvailable();

interface YearPickerProps {
  /** Available years to choose from (newest first). */
  years: number[];
  value: YearFilter;
  onChange: (next: YearFilter) => void;
  /** Hide the "All Time" pill when you only want concrete years (e.g. tax). */
  includeAllTime?: boolean;
}

/**
 * Horizontal pill row at the top of stats-style screens to scope data to a
 * single calendar year (or "All Time"). On iOS 26+, renders as native Liquid
 * Glass pills inside a GlassContainer (so adjacent pills visually merge).
 * Falls back to flat surface pills on older devices.
 */
export function YearPicker({ years, value, onChange, includeAllTime = true }: YearPickerProps) {
  const options: { label: string; year: YearFilter }[] = [
    ...(includeAllTime ? [{ label: 'All Time', year: null as YearFilter }] : []),
    ...years.map((y) => ({ label: String(y), year: y as YearFilter })),
  ];

  const handlePress = (next: YearFilter) => {
    if (next === value) return;
    Haptics.selectionAsync();
    onChange(next);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {hasGlass ? (
        <View style={styles.glassContainer}>
          {options.map((opt) => {
            const active = opt.year === value;
            return (
              <GlassView
                key={opt.label}
                glassEffectStyle="regular"
                tintColor={active ? Colors.text : undefined}
                isInteractive
                style={styles.pillGlass}
              >
                <Pressable
                  onPress={() => handlePress(opt.year)}
                  style={styles.pillInner}
                >
                  <Text
                    style={[
                      styles.pillText,
                      active && styles.pillTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              </GlassView>
            );
          })}
        </View>
      ) : (
        <View style={styles.fallbackRow}>
          {options.map((opt) => {
            const active = opt.year === value;
            return (
              <Pressable
                key={opt.label}
                onPress={() => handlePress(opt.year)}
                style={({ pressed }) => [
                  styles.pillFallback,
                  active && styles.pillFallbackActive,
                  pressed && !active && styles.pillPressed,
                ]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
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
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fallback (non-Liquid-Glass devices)
  fallbackRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillFallback: {
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
    fontVariant: ['tabular-nums'],
  },
  pillTextActive: {
    color: Colors.white,
  },
});
