import { PlatformColor, StyleSheet, Text, View } from 'react-native';

/**
 * Which stop a form is about, above the fields: the place on the left, the
 * length as a small badge on the right, the dates centred underneath. The
 * same strip on every step of adding a stop and on the editor, so the eye
 * finds it in the same spot each time.
 */
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function StopSummary({ city, country, start, end }: { city: string; country: string; start: Date; end: Date }) {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.place}>{city}, {country}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{days}d</Text>
        </View>
      </View>
      <Text style={styles.range}>
        {fmt(start)} – {fmt(end)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  place: {
    fontSize: 16,
    fontWeight: '600',
    color: PlatformColor('label'),
    flex: 1,
  },
  badge: {
    backgroundColor: PlatformColor('systemGray5'),
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: PlatformColor('label'),
    fontVariant: ['tabular-nums'],
  },
  range: {
    fontSize: 14,
    color: PlatformColor('secondaryLabel'),
    textAlign: 'center',
  },
});
