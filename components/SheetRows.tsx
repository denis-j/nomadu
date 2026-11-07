import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography, FontSize } from '../constants/typography';

const hasGlass = isLiquidGlassAvailable();
const GlassCard = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * The parts a place's page is made of (a stop, a thing to do, a stay): a
 * card of facts, one row each with a grey label and its value, a card that
 * leads somewhere (where to stay, the post an idea came from), a section
 * heading with room for one small control, a grey capsule for a status, and
 * a dashed slot for something that is not there yet.
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

/** A paragraph inside the card: the label row, the text underneath, so a long note is not squeezed to the right. */
export function DetailNotes({ icon = 'create-outline', label = 'Notes', text }: { icon?: keyof typeof Ionicons.glyphMap; label?: string; text: string }) {
  return (
    <View style={styles.notesRow}>
      <View style={styles.detailLeft}>
        <Ionicons name={icon} size={18} color={Colors.textTertiary} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text selectable style={styles.notesText}>{text}</Text>
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

/**
 * A section's heading, the same grey uppercase label as `SectionLabel`,
 * with room on the right for one small control: a sort, an "Edit".
 */
export function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

/** The small control a section head carries: a word, and a chevron when it opens a menu. */
export function SectionControl({ label, menu, onPress }: { label: string; menu?: boolean; onPress?: () => void }) {
  const body = (
    <View style={styles.sectionControl}>
      <Text style={styles.sectionControlText}>{label}</Text>
      {menu && <Ionicons name="chevron-down" size={12} color={Colors.textTertiary} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  );
}

/**
 * The grey capsule a status or a score sits in, as the "8d" pill on the
 * itinerary: black text once it means something is settled (booked,
 * done), grey while it does not. A chevron when it opens a menu.
 */
export function StatusChip({
  label,
  muted,
  icon,
  onPress,
  size = 'small',
}: {
  label: string;
  muted?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: 'regular' | 'small';
}) {
  const color = muted ? Colors.textSecondary : Colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={8}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.chip, size === 'small' && styles.chipSmall, pressed && { opacity: 0.6 }]}
    >
      {icon && <Ionicons name={icon} size={11} color={color} />}
      <Text style={[styles.chipText, { color }, size === 'small' && styles.chipTextSmall]}>{label}</Text>
      {onPress && <Ionicons name="chevron-down" size={11} color={Colors.textTertiary} />}
    </Pressable>
  );
}

/**
 * A dashed card where something is not there yet, as a suggested stop is
 * on the itinerary: a plus or an icon, a title, a grey line. Tapping it
 * starts the thing. Without `onPress` it only says what comes first.
 */
export function SlotCard({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress ? () => { Haptics.selectionAsync(); onPress(); } : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.slot, !onPress && styles.slotMuted, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.slotIcon}>
        <Ionicons name={icon} size={20} color={onPress ? Colors.text : Colors.textTertiary} />
      </View>
      <View style={styles.linkText}>
        <Text style={[styles.slotTitle, !onPress && styles.slotTitleMuted]}>{title}</Text>
        {sub ? <Text style={styles.linkSub}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 18, overflow: 'hidden' },
  cardFallback: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  separator: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { ...Typography.bodySmall, fontSize: FontSize.subheadline, color: Colors.textSecondary },
  detailValue: { ...Typography.bodySmall, fontSize: FontSize.subheadline, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  notesRow: { gap: 8 },
  notesText: { ...Typography.bodySmall, fontSize: FontSize.subheadline, lineHeight: 20 },
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

  // Same words as visaForm's SectionLabel, in a row with a control.
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 20 },
  sectionTitle: { ...Typography.sectionLabel },
  sectionControl: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionControlText: { ...Typography.label, fontWeight: '600', color: Colors.textSecondary },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: Colors.surfaceSecondary,
  },
  chipSmall: { paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { ...Typography.label, fontWeight: '600', fontVariant: ['tabular-nums'] },
  chipTextSmall: { fontSize: FontSize.caption2 },

  slot: {
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  slotMuted: { opacity: 0.7 },
  slotIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotTitle: { ...Typography.titleSmall, fontWeight: '600' },
  slotTitleMuted: { color: Colors.textSecondary },
});
