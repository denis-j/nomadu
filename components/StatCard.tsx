import { StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

const hasGlass = isLiquidGlassAvailable();
const CardShell = hasGlass ? GlassView : View;

interface StatCardProps {
  value: number | string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
  large?: boolean;
}

export function StatCard({ value, label, icon, accent = Colors.primary, large }: StatCardProps) {
  return (
    <CardShell
      {...(hasGlass ? { glassEffectStyle: 'regular' as const } : {})}
      style={[styles.card, large && styles.cardLarge, !hasGlass && styles.cardFallback]}
    >
      <View style={styles.topRow}>
        {icon && (
          <View style={[styles.iconBubble, { backgroundColor: accent + '15' }]}>
            <Ionicons name={icon} size={large ? 22 : 18} color={accent} />
          </View>
        )}
      </View>
      <View style={styles.bottom}>
        <Text style={[styles.value, large && styles.valueLarge, { color: accent }]}>
          {value}
        </Text>
        <Text style={[styles.label, large && styles.labelLarge]}>{label}</Text>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    flex: 1,
    gap: 14,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  cardLarge: {
    padding: 22,
    gap: 18,
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topRow: {
    flexDirection: 'row',
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  bottom: {
    gap: 2,
  },
  value: {
    ...Typography.numericLarge,
  },
  valueLarge: {
    fontSize: 52,
  },
  label: {
    ...Typography.label,
  },
  labelLarge: {
    fontSize: 15,
  },
});
