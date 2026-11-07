import { StyleSheet, Text, View } from 'react-native';
import { systemColor } from '../constants/colors';
import { useTranslation } from '../contexts/LanguageContext';
import { FontSize } from '../constants/typography';
import { appLocale } from '../lib/i18n/locale';

/**
 * Which stop a form is about, above the fields: the place on the left, the
 * length as a small badge on the right, the dates centred underneath. The
 * same strip on every step of adding a stop and on the editor, so the eye
 * finds it in the same spot each time.
 */
const fmt = (d: Date) => d.toLocaleDateString(appLocale(), { month: 'short', day: 'numeric', year: 'numeric' });

export function StopSummary({ city, country, start, end }: { city: string; country: string; start: Date; end: Date }) {
  const { t, countryName } = useTranslation();
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.place}>{city}, {countryName(country)}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('comp.daysShort', { n: days })}</Text>
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
    fontSize: FontSize.callout,
    fontWeight: '600',
    color: systemColor('label'),
    flex: 1,
  },
  badge: {
    backgroundColor: systemColor('systemGray5'),
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: FontSize.subheadline,
    fontWeight: '700',
    color: systemColor('label'),
    fontVariant: ['tabular-nums'],
  },
  range: {
    fontSize: FontSize.subheadline,
    color: systemColor('secondaryLabel'),
    textAlign: 'center',
  },
});
