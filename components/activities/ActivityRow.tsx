import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { StatusChip } from '../SheetRows';
import { type Activity } from '../../lib/activityModel';
import { formatMoney } from '../../lib/accommodationModel';
import { SOURCE_MARK, categoryIcon } from './visuals';
import { useTranslation } from '../../contexts/LanguageContext';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * One thing to do as a row card, built like the cards that lead into a
 * trip's pages (documents, things to do): a square picture from the post
 * where there is one, else the kind's symbol on a tile; the title; a grey
 * line with the place, the kind and the price; and the status as a grey
 * capsule on the right. The capsule only says; the status is changed on
 * the sheet, where the tile is big enough to hit. A done one fades, as a
 * finished stop does.
 */
export function ActivityRow({ activity: a, onPress }: { activity: Activity; onPress: () => void }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const mark = SOURCE_MARK[a.source];
  const picture = !!a.image_url && !failed;
  const done = a.status === 'done';
  const price = a.price === 0 ? t('activities.free') : formatMoney(a.price, a.currency);
  const sub = [a.place && a.place !== a.title ? a.place : null, t(`activityCat.${a.category}`), price].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={a.title}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
        {picture ? (
          <Image source={{ uri: a.image_url! }} style={[styles.thumb, done && styles.faded]} contentFit="cover" transition={150} onError={() => setFailed(true)} />
        ) : (
          <View style={[styles.iconTile, done && styles.faded]}>
            <Ionicons name={categoryIcon(a.category)} size={20} color={Colors.text} />
          </View>
        )}
        <View style={[styles.text, done && styles.faded]}>
          <Text style={styles.title} numberOfLines={2}>{a.title}</Text>
          <View style={styles.subRow}>
            {mark && <Ionicons name={mark.icon} size={12} color={Colors.textTertiary} />}
            <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
          </View>
        </View>
        {/* An idea is the default and says nothing; the others earn a capsule. */}
        {a.status !== 'idea' && (
          <StatusChip label={t(`activityStatus.${a.status}`)} muted={done} icon={done ? 'checkmark' : undefined} />
        )}
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same measures as the entry cards at the top of the itinerary.
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
  faded: { opacity: 0.55 },
  text: { flex: 1, gap: 2 },
  title: { ...Typography.titleSmall, fontWeight: '600' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sub: { ...Typography.bodySmall, color: Colors.textSecondary, flexShrink: 1 },
});
