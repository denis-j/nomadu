import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStats } from '../../../hooks/useStats';
import { useVisaTracker } from '../../../hooks/useVisaTracker';
import { useTaxTracker } from '../../../hooks/useTaxTracker';
import { Colors } from '../../../constants/colors';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { EmptyState } from '../../../components/EmptyState';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

export default function StatsScreen() {
  const { stats, loading, refresh: refreshStats } = useStats();
  const { visaStatuses, loading: visaLoading, refresh: refreshVisa } = useVisaTracker();
  const { taxStatuses, loading: taxLoading, refresh: refreshTax } = useTaxTracker();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      Promise.all([refreshStats(), refreshVisa(), refreshTax()]),
      new Promise((r) => setTimeout(r, 800)),
    ]);
    setRefreshing(false);
  }, [refreshStats, refreshVisa, refreshTax]);

  const mostCritical = visaStatuses.length > 0 ? visaStatuses[0] : null;
  const mostCriticalTax = taxStatuses.length > 0 ? taxStatuses[0] : null;

      if (loading || visaLoading || taxLoading) return null;
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
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

      {/* Visa Tracker */}
      {!visaLoading && mostCritical && (
        <View style={styles.countriesSection}>
          <Text style={styles.sectionTitle}>Visa Tracker</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/(stats)/visa');
            }}
            style={({ pressed }) => pressed && styles.cardPressed}
          >
            <Glass {...glassProps} style={[styles.visaCard, !hasGlass && styles.cardFallback]}>
              <View style={styles.visaCardContent}>
                <View style={styles.visaInfo}>
                  <Text style={styles.visaFlag}>{mostCritical.flag}</Text>
                  <View style={styles.visaText}>
                    <Text style={styles.visaDestination}>{mostCritical.destination}</Text>
                    <Text style={styles.visaPreview}>
                      {mostCritical.daysRemaining}d left of {mostCritical.daysAllowed}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
              </View>
            </Glass>
          </Pressable>
        </View>
      )}

      {/* Tax Residence */}
      {!taxLoading && mostCriticalTax && (
        <View style={styles.countriesSection}>
          <Text style={styles.sectionTitle}>Tax Residence</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/(stats)/tax');
            }}
            style={({ pressed }) => pressed && styles.cardPressed}
          >
            <Glass {...glassProps} style={[styles.visaCard, !hasGlass && styles.cardFallback]}>
              <View style={styles.visaCardContent}>
                <View style={styles.visaInfo}>
                  <Text style={styles.visaFlag}>{mostCriticalTax.flag}</Text>
                  <View style={styles.visaText}>
                    <Text style={styles.visaDestination}>{mostCriticalTax.country}</Text>
                    <Text style={styles.visaPreview}>
                      {mostCriticalTax.daysPresent}d of {mostCriticalTax.thresholdDays} · {mostCriticalTax.daysRemaining}d left
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
              </View>
            </Glass>
          </Pressable>
        </View>
      )}

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
  cardPressed: {
    opacity: 0.7,
  },
  visaCard: {
    borderRadius: 20,
    padding: 18,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  visaCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  visaFlag: {
    fontSize: 28,
  },
  visaText: {
    flex: 1,
    gap: 2,
  },
  visaDestination: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  visaPreview: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
