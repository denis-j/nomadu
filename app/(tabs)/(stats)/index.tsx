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
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStats } from '../../../hooks/useStats';
import { useVisaTracker } from '../../../hooks/useVisaTracker';
import { useTaxTracker } from '../../../hooks/useTaxTracker';
import { Colors } from '../../../constants/colors';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { StatsBars } from '../../../components/StatsBars';
import { BADGE_LIBRARY } from '../../../lib/badges';
import { CountryBadge3DPreview } from '../../../components/CountryBadge3D';
import { YearPicker } from '../../../components/YearPicker';
import type { YearFilter } from '../../../lib/yearFilter';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

export default function StatsScreen() {
  const [yearFilter, setYearFilter] = useState<YearFilter>(new Date().getFullYear());
  const { stats, loading, refresh: refreshStats } = useStats(yearFilter);
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

  // Re-trigger bubble animations whenever the Stats tab gains focus
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );

  if (loading || visaLoading || taxLoading) return null;

  // Truly empty (no trips at all, ever) → show the placeholder.
  // If only the current year is empty we still want to render the picker so the
  // user can switch years.
  const hasAnyData = stats.availableYears.length > 1 || stats.totalDays > 0;
  if (!hasAnyData) {
    return (
      <View style={styles.emptyContainer}>
        <StatsBars key={focusKey} size={80} variant="burstWobble" />
        <Text style={styles.emptyTitle}>No stats yet</Text>
        <Text style={styles.emptySubtitle}>
          Once you start tracking,{'\n'}your countries, cities and days will show up here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <YearPicker
        years={stats.availableYears}
        value={yearFilter}
        onChange={setYearFilter}
      />

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

      {/* Badge Library overview — always all-time, year filter does not apply */}
      <BadgesSection visitedCodes={new Set(stats.allTimeCountryCodes)} />

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

// ─── Badges section ─────────────────────────────────────────────────────────

function BadgesSection({ visitedCodes }: { visitedCodes: Set<string> }) {
  const earned = BADGE_LIBRARY.filter((b) => visitedCodes.has(b.code));
  return (
    <View style={badgeStyles.section}>
      <View style={badgeStyles.sectionHeader}>
        <Text style={badgeStyles.sectionTitle}>Badges</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/library/badges');
          }}
          hitSlop={8}
          style={({ pressed }) => [badgeStyles.linkBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={badgeStyles.linkBtnText}>
            {earned.length} / {BADGE_LIBRARY.length}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={badgeStyles.row}
      >
        {BADGE_LIBRARY.map((b) => {
          const isEarned = visitedCodes.has(b.code);
          return (
            <Pressable
              key={b.code}
              disabled={!isEarned}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/badge/${b.code}`);
              }}
              style={({ pressed }) => [
                badgeStyles.tile,
                !isEarned && badgeStyles.tileLocked,
                pressed && isEarned && { opacity: 0.7 },
              ]}
            >
              <View style={badgeStyles.tileModel}>
                {isEarned ? (
                  <CountryBadge3DPreview countryCode={b.code} backgroundColor="#FFFFFF" />
                ) : (
                  <View style={badgeStyles.lockedPlaceholder}>
                    <Ionicons name="medal-outline" size={36} color={Colors.textTertiary} />
                  </View>
                )}
              </View>
              <Text style={[badgeStyles.tileName, !isEarned && { color: Colors.textTertiary }]} numberOfLines={1}>
                {b.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  section: { gap: 10, marginTop: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingLeft: 8 },
  linkBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  row: { gap: 10, paddingHorizontal: 4 },
  tile: {
    width: 104,
    aspectRatio: 0.85,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
    overflow: 'hidden',
  },
  tileLocked: {
    backgroundColor: Colors.surfaceSecondary,
    borderColor: 'transparent',
  },
  tileModel: {
    width: '100%',
    flex: 1,
    overflow: 'hidden',
    borderRadius: 10,
    position: 'relative',
  },
  lockedPlaceholder: {
    flex: 1,
    width: '100%',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
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
