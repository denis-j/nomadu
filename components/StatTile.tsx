import { Children } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Dropdown, type DropdownOption } from './Dropdown';

const hasGlass = isLiquidGlassAvailable();
const Shell = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * One fact in a small glass tile: a grey label, a bold value, an optional
 * unit in grey after it. Three of them in a row sit under the title of the
 * stop and trip sheets and the stay page. `onPress` makes the tile a
 * control and adds a small chevron to say so; `options` makes it a menu
 * (a status to change) with the same chevron, the system's own pull-down
 * anchored to the tile.
 */
export function StatTile({
  label,
  value,
  unit,
  icon,
  onPress,
  options,
  menuValue,
  menuTitle,
  onPick,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  /** The choices of the menu the tile opens; with these it needs no `onPress`. */
  options?: DropdownOption[];
  menuValue?: string | null;
  menuTitle?: string;
  onPick?: (id: string) => void;
}) {
  const control = !!onPress || !!options;
  const body = (
    <Shell {...glassProps} style={[styles.tile, !hasGlass && styles.tileFallback]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        {icon && <Ionicons name={icon} size={16} color={Colors.text} />}
        <Text style={styles.value} numberOfLines={1}>
          {value}
          {unit && <Text style={styles.unit}> {unit}</Text>}
        </Text>
        {control && <Ionicons name="chevron-down" size={12} color={Colors.textTertiary} />}
      </View>
    </Shell>
  );
  if (options && onPick) {
    return (
      <Dropdown right title={menuTitle} options={options} value={menuValue} onPick={onPick} style={styles.menu}>
        {body}
      </Dropdown>
    );
  }
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.7 }]}>
      {body}
    </Pressable>
  );
}

/**
 * The row three tiles share. Each tile sits in its own equal cell: the
 * system menu's native view took less than its share when it was a flex
 * child of the row itself, so the row no longer asks it to be one.
 */
export function StatRow({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.row, style]}>
      {Children.map(children, (child) => (child ? <View style={styles.cell}>{child}</View> : null))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, minWidth: 0 },
  pressable: { flex: 1 },
  menu: { flex: 1, alignSelf: 'stretch' },
  tile: { flex: 1, borderRadius: 14, padding: 14, gap: 4, overflow: 'hidden' },
  tileFallback: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  label: { fontSize: 11, fontWeight: '600', color: Colors.textTertiary, marginBottom: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  value: { ...Typography.bodyLarge, fontWeight: '700', flexShrink: 1 },
  unit: { ...Typography.label, color: Colors.textSecondary },
});
