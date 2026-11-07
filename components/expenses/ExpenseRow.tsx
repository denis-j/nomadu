import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { EXPENSE_CATEGORY_ICONS, formatAmount, shareOf, type Expense } from '../../lib/expenseModel';
import { useTranslation } from '../../contexts/LanguageContext';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * One expense as a row card, like a thing to do: the receipt as the
 * picture where there is one, else the category's symbol on a tile; the
 * title; a grey line with who paid and how it is split; the amount on the
 * right, and under it this person's part when it was split.
 */
export function ExpenseRow({
  expense: e,
  receiptUri,
  nameOf,
  meId,
  onPress,
}: {
  expense: Expense;
  /** The receipt picture's local uri, when there is one and it is an image. */
  receiptUri: string | null;
  /** A traveller's name as this phone shows it; "You" for the account. */
  nameOf: (travellerId: string | null) => string;
  /** The account's own traveller id, for "your part". */
  meId: string | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const payer = e.paid_by ? nameOf(e.paid_by) : t('comp.someone');
  const split = e.shares.length === 0
    ? t('expenses.notSplitLower')
    : e.shares.length === 1
      ? (e.shares[0].traveller_id === e.paid_by ? (e.paid_by === meId ? t('comp.yourOwn') : t('expenses.theirOwn')) : t('expenses.forName', { name: nameOf(e.shares[0].traveller_id) }))
      : t('expenses.splitWays', { count: e.shares.length });
  const mine = shareOf(e, meId);
  const showMine = e.shares.length > 1 && mine > 0;

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${formatAmount(e.amount)} ${e.currency}`}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
        {receiptUri ? (
          <Image source={{ uri: receiptUri }} style={styles.thumb} contentFit="cover" transition={150} />
        ) : (
          <View style={styles.iconTile}>
            <Ionicons name={EXPENSE_CATEGORY_ICONS[e.category] as keyof typeof Ionicons.glyphMap} size={20} color={Colors.text} />
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>{e.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>{e.paid_by === meId ? t('expenses.youPaid') : t('expenses.paidByName', { name: payer })} · {split}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.amount}>{formatAmount(e.amount)} <Text style={styles.currency}>{e.currency}</Text></Text>
          {showMine && <Text style={styles.mine}>{t('expenses.yourPartAmount', { amount: formatAmount(mine) })}</Text>}
        </View>
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same measures as the rows of things to do.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  cardFallback: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  thumb: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.surfaceSecondary },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { ...Typography.titleSmall, fontWeight: '600' },
  sub: { ...Typography.bodySmall, color: Colors.textSecondary },
  right: { alignItems: 'flex-end', gap: 2 },
  amount: { ...Typography.titleSmall, fontWeight: '700', fontVariant: ['tabular-nums'] },
  currency: { ...Typography.label, fontWeight: '600', color: Colors.textSecondary },
  mine: { ...Typography.caption, color: Colors.textTertiary, fontVariant: ['tabular-nums'] },
});
