import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import type { JourneyDocument, JourneyTraveller } from '../lib/database';
import { summarizeKinds } from '../lib/documents';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * The one-line way into a journey's documents, sitting with the trip summary
 * at the top of the itinerary.
 *
 * The documents themselves live on their own screen. A first version put the
 * whole list into the itinerary's footer, where the timeline line ran through
 * it and four documents took a screen; a folder is not a stop and does not
 * belong in the timeline column.
 */
export function DocumentsEntryCard({
  journeyId,
  documents,
  travellers,
}: {
  journeyId: number;
  documents: JourneyDocument[];
  travellers: JourneyTraveller[];
}) {
  const open = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/(tabs)/(plans)/documents', params: { journeyId: String(journeyId) } });
  };

  const sub = documents.length === 0
    ? 'Tickets, visas, arrival cards'
    : summarizeKinds(documents.map((d) => d.kind))
      + (travellers.length > 1 ? ` · ${travellers.length} travellers` : '');

  return (
    <Pressable onPress={open} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
        <View style={styles.icon}>
          <Ionicons name="documents-outline" size={20} color={Colors.text} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>Documents</Text>
          <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
        </View>
        {documents.length > 0 && <Text style={styles.count}>{documents.length}</Text>}
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same radius as a stop card, the two entry cards stack 12 apart and
  // leave 16 before the timeline like the map does.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 1 },
  title: { ...Typography.titleSmall, fontWeight: '600' },
  sub: { ...Typography.bodySmall, color: Colors.textSecondary },
  count: {
    ...Typography.titleSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
