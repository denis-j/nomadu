import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

const hasGlass = isLiquidGlassAvailable();
const GlassCard = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * The parts a place's sheet is made of (a stop, a thing to do): a card of
 * facts, one row each with a grey label and its value, and a card that
 * leads somewhere (where to stay, the things to do, the post an idea came
 * from), with its icon, a title, a grey line and a chevron.
 */

export function DetailCard({ children }: { children: React.ReactNode }) {
  return <GlassCard {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>{children}</GlassCard>;
}

export function DetailSeparator() {
  return <View style={styles.separator} />;
}

export function DetailRow({ icon, label, value, right }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLeft}>
        <Ionicons name={icon} size={18} color={Colors.textTertiary} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      {right ?? <Text selectable style={styles.detailValue}>{value}</Text>}
    </View>
  );
}

export function LinkCard({
  icon,
  title,
  sub,
  right,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  right?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <GlassCard {...glassProps} style={[styles.card, styles.linkCard, !hasGlass && styles.cardFallback]}>
        <View style={styles.linkIcon}>
          <Ionicons name={icon} size={20} color={Colors.text} />
        </View>
        <View style={styles.linkText}>
          <Text style={styles.linkTitle} numberOfLines={1}>{title}</Text>
          {sub ? <Text style={styles.linkSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {right}
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 18, overflow: 'hidden' },
  cardFallback: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  separator: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary },
  detailValue: { ...Typography.bodySmall, fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { flex: 1, gap: 2 },
  linkTitle: { ...Typography.titleSmall, fontWeight: '600' },
  linkSub: { ...Typography.bodySmall, color: Colors.textSecondary },
});
