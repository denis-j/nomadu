import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useTranslation } from '../contexts/LanguageContext';
import { Flag } from './Flag';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * The parts the Visa and the Tax page share, so the two read as one place:
 * the passport they are counted for, a card per country, the days left in
 * it, and the small print at the end.
 */

/** "Passport 🇪🇹 Ethiopia ›": what the page counts for, and the way to change it. */
export function PassportLine({ code, country, onPress }: { code: string; country: string; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      hitSlop={6}
      accessibilityRole="button"
      style={({ pressed }) => [styles.passport, pressed && { opacity: 0.55 }]}
    >
      <Text style={styles.passportLabel}>{t('tracker.passport')}</Text>
      <Flag code={code} size={14} />
      <Text style={styles.passportCountry} numberOfLines={1}>{country}</Text>
      <Ionicons name="chevron-forward" size={13} color={Colors.textTertiary} />
    </Pressable>
  );
}

/** One country or zone: flag, name, an optional grey line, the status pill, then what is inside. */
export function TrackerCard({
  code,
  name,
  subtitle,
  status,
  onPress,
  children,
}: {
  code: string;
  name: string;
  subtitle?: string;
  status: { label: string; color: string };
  onPress?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
      <View style={styles.head}>
        <Flag code={code} size={24} />
        <View style={styles.titles}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
        <View style={[styles.pill, { backgroundColor: status.color + '1A' }]}>
          <Text style={[styles.pillText, { color: status.color }]}>{status.label}</Text>
        </View>
        {onPress && <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />}
      </View>
      {children}
    </Glass>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>
      {body}
    </Pressable>
  );
}

/**
 * The days that matter, big ("178 days left"), the bar in the status color,
 * and a grey line with the count and what it is counted over.
 */
export function DaysMeter({ used, allowed, detail, color }: { used: number; allowed: number; detail?: string; color: string }) {
  const { t } = useTranslation();
  const left = allowed - used;
  const headline = left < 0
    ? t('tracker.daysOver', { days: -left })
    : left === 1 ? t('tracker.dayLeft') : t('tracker.daysLeft', { days: left });
  const width = allowed > 0 ? Math.min(100, (used / allowed) * 100) : 0;
  const count = t('tracker.ofDays', { used, allowed });
  return (
    <View style={styles.meter}>
      <Text style={styles.headline}>{headline}</Text>
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${Math.max(width, used > 0 ? 2 : 0)}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.detail}>{detail ? `${count} · ${detail}` : count}</Text>
    </View>
  );
}

/** A grey line inside a card, for a card that has no days to count. */
export function CardNote({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

/** The small print at the end of the page, with one link for more. */
export function Footnote({ text, link, url }: { text: string; link: string; url: string }) {
  return (
    <View style={styles.footnote}>
      <Text style={styles.footnoteText}>{text}</Text>
      <Pressable onPress={() => Linking.openURL(url)} hitSlop={6} style={({ pressed }) => [styles.footnoteLink, pressed && { opacity: 0.55 }]}>
        <Text style={styles.footnoteLinkText}>{link}</Text>
        <Ionicons name="open-outline" size={12} color={Colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  passport: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 2 },
  passportLabel: { ...Typography.cardSubtitle },
  passportCountry: { ...Typography.cardSubtitle, fontWeight: '600', color: Colors.text, flexShrink: 1 },

  card: { borderRadius: 20, borderCurve: 'continuous', padding: 18, gap: 16, overflow: 'hidden' },
  cardFallback: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titles: { flex: 1, gap: 2 },
  name: { ...Typography.cardTitle },
  subtitle: { ...Typography.cardSubtitle },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderCurve: 'continuous' },
  pillText: { ...Typography.caption, fontWeight: '700' },

  meter: { gap: 8 },
  headline: { ...Typography.cardValue },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.surfaceSecondary, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },
  detail: { ...Typography.cardMeta },

  note: { ...Typography.cardSubtitle, lineHeight: 20 },

  footnote: { marginTop: 12, paddingHorizontal: 4, gap: 8 },
  footnoteText: { ...Typography.caption, lineHeight: 17 },
  footnoteLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  footnoteLinkText: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },
});
