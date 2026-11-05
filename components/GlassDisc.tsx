import { Pressable, StyleSheet, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '../constants/colors';

const hasGlass = isLiquidGlassAvailable();
const Shell = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const, isInteractive: true } : {};

export const DISC_SIZE = 44;

/**
 * A 44pt glass disc with one symbol: the back and add buttons of a bar
 * drawn over a page's own header (the trip, things to do). Without
 * `onPress` it is only the look, for a disc a menu wraps.
 */
export function GlassDisc({ icon, size, onPress, label }: { icon: keyof typeof Ionicons.glyphMap; size: number; onPress?: () => void; label: string }) {
  const disc = (
    <Shell {...glassProps} style={[styles.disc, !hasGlass && styles.fallback]}>
      <Ionicons name={icon} size={size} color={Colors.text} />
    </Shell>
  );
  if (!onPress) return disc;
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {disc}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Same as the trip's title chip without glass.
  fallback: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
});
