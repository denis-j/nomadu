import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useStats } from '../../../hooks/useStats';
import { Colors } from '../../../constants/colors';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { EmptyState } from '../../../components/EmptyState';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

export default function StatsScreen() {
  const { stats } = useStats();

      if (stats.totalDays < 1) {
        return (
          <EmptyState
            icon="🫙"
            title="No stats yet"
            subtitle="Your stats will appear here once you start tracking."
          />
        );
      }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {/* Countries + Cities | Days */}
      <View style={styles.row}>
        <Glass {...glassProps} style={[styles.card, styles.cardWide, !hasGlass && styles.cardFallback]}>
          <View style={styles.combiRow}>
            <View style={styles.combiStat}>
              <Text style={styles.combiValue}>{stats.totalCountries}</Text>
              <Text style={styles.combiLabel}>Countries</Text>
            </View>
            <View style={styles.combiDivider} />
            <View style={styles.combiStat}>
              <Text style={styles.combiValue}>{stats.totalCities}</Text>
              <Text style={styles.combiLabel}>Cities</Text>
            </View>
          </View>
        </Glass>
        <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
          <Text style={styles.combiValue}>{stats.totalDays}</Text>
          <Text style={styles.combiLabel}>Days</Text>
        </Glass>
      </View>

      {/* Top countries */}
      {stats.topCountries.length > 0 && (
        <View style={styles.countriesSection}>
          <Text style={styles.sectionTitle}>Top Countries</Text>
          <View style={styles.countriesGrid}>
            {stats.topCountries.map((country, index) => (
              <Glass
                key={country.country_code + index}
                {...glassProps}
                style={[styles.countryChip, !hasGlass && styles.cardFallback]}
              >
                <Text style={styles.countryRank}>#{index + 1}</Text>
                <Text style={styles.countryFlag}>
                  {countryCodeToFlag(country.country_code)}
                </Text>
                <Text style={styles.countryName}>{country.country}</Text>
                <Text style={styles.countryDays}>{country.days}d</Text>
              </Glass>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 100,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardWide: {
    flex: 2,
  },
  combiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  combiStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  combiDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
  },
  combiValue: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  combiLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  countriesSection: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingLeft: 4,
  },
  countriesGrid: {
    gap: 8,
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  countryRank: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textTertiary,
    width: 22,
    fontVariant: ['tabular-nums'],
  },
  countryFlag: {
    fontSize: 26,
  },
  countryName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  countryDays: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
});
