import { ScrollView, StyleSheet, Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import type { YearFilter } from '../lib/yearFilter';

interface YearPickerProps {
  /** Available years to choose from (newest first). */
  years: number[];
  value: YearFilter;
  onChange: (next: YearFilter) => void;
  /** Hide the "All Time" pill when you only want concrete years (e.g. tax). */
  includeAllTime?: boolean;
}

/**
 * Horizontal pill row used at the top of stats-style screens to scope the
 * data to a single calendar year (or "All Time" when allowed).
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
      {options.map((opt) => {
        const active = opt.year === value;
        return (
          <Pressable
            key={opt.label}
            onPress={() => handlePress(opt.year)}
            style={({ pressed }) => [
              styles.pill,
              active && styles.pillActive,
              pressed && !active && styles.pillPressed,
            ]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
  pillActive: {
    backgroundColor: Colors.text,
  },
  pillPressed: {
    opacity: 0.6,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
});
