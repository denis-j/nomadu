import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

/**
 * The build every list card shares, taken from the Verlauf card: a row on
 * top with the flag and a badge on the right, then the name, the grey line
 * that names more, and the dates. Used by the Verlauf (TripCard), the trips
 * in the Plan and the stops of a trip, so the three cannot drift apart again.
 * Each screen keeps its own extras (avatars, chips, a note) below that.
 */
export const listCardStyles = StyleSheet.create({
  /** Corner and padding of the card itself; the screen adds glass or fill. */
  shell: { borderRadius: 14, borderCurve: 'continuous', padding: 14, overflow: 'hidden' },
  /** Flag on the left, badge on the right. */
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...Typography.cardTitle, marginBottom: 2 },
  subtitle: { ...Typography.cardSubtitle, marginBottom: 8 },
  /** A card without a subtitle starts its dates this far below the title. */
  metaAfterTitle: { marginTop: 6 },
  meta: { ...Typography.cardMeta },
  badge: { backgroundColor: Colors.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderCurve: 'continuous' },
  badgeText: { ...Typography.cardMeta, fontWeight: '700', color: Colors.primary },
  badgeWarn: { backgroundColor: Colors.error + '18' },
  badgeWarnText: { color: Colors.error },
});

/** "7d" in the top right of a list card. `warn` for a stay that overlaps another. */
export function DaysBadge({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <View style={[listCardStyles.badge, warn && listCardStyles.badgeWarn]}>
      <Text style={[listCardStyles.badgeText, warn && listCardStyles.badgeWarnText]}>{label}</Text>
    </View>
  );
}
