import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import RNMapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Haptics from 'expo-haptics';
import { deleteJourneyLeg, parseDate } from '../../../lib/database';
import { Flag } from '../../../components/Flag';
import { StatusBadge, planChipText } from '../../../components/accommodationForm';
import { SectionLabel } from '../../../components/visaForm';
import { StatRow, StatTile } from '../../../components/StatTile';
import { CityTips } from '../../../components/MarkdownTips';
import { MissingRoute } from '../../../components/MissingRoute';
import { transportInfo } from '../../../components/TransportPicker';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { getRuleForCitizen, type VisaRule } from '../../../constants/visaRules';
import { useAccommodation } from '../../../hooks/useAccommodations';
import { useAuth } from '../../../hooks/useAuth';
import { countDays, toYmd } from '../../../lib/days';
import { getCitizenship } from '../../../lib/onboarding';
import { setPendingStay } from '../../../lib/accommodationBridge';
import { formatMoney, nightsBetween, primaryOption } from '../../../lib/accommodationModel';
import { showToast } from '../../../lib/toast';

type Params = {
  legId: string;
  journeyId: string;
  country: string;
  countryCode: string;
  city: string;
  start: string;
  end: string;
  transport: string;
  latitude?: string;
  longitude?: string;
  notes?: string;
  /** '1' when the start is fixed by the previous stop and only the length is chosen. */
  lockStart?: string;
  /** Sync ids: what the accommodation plan is keyed by. */
  stopSyncId?: string;
  journeySyncId?: string;
  /** '1' on a friend's trip: look, do not touch. */
  readOnly?: string;
};


const hasGlass = isLiquidGlassAvailable();
const GlassCard = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const fmtLong = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/** Where the stop stands from today: "Starts in 50 days", "Today: Day 2 of 4", "Ended 3 days ago". */
function whenStat(start: Date, end: Date, days: number): { label: string; value: string; unit?: string } {
  const today = parseDate(toYmd(new Date()));
  if (today < start) {
    const until = countDays(today, start) - 1;
    return until === 1 ? { label: 'Starts', value: 'Tomorrow' } : { label: 'Starts', value: `in ${until}`, unit: 'days' };
  }
  if (today > end) {
    const ago = countDays(end, today) - 1;
    return ago === 1 ? { label: 'Ended', value: 'Yesterday' } : { label: 'Ended', value: `${ago}`, unit: 'days ago' };
  }
  return { label: 'Today', value: `Day ${countDays(start, today)}`, unit: `of ${days}` };
}

/** The visa rule in a sentence, or what it means when there is none to track. */
function visaLabel(rule: VisaRule | null): string | null {
  if (!rule) return null;
  if (rule.ruleType === 'visa_required') return 'Visa required';
  return rule.label;
}

/** The second line of the stay card: nights, the pick, what it costs. */
function staySummary(plan: NonNullable<ReturnType<typeof useAccommodation>['plan']>): string {
  const nights = nightsBetween(plan.check_in, plan.check_out);
  const parts = [`${nights} ${nights === 1 ? 'night' : 'nights'}`];
  const primary = primaryOption(plan);
  const price = plan.booking ? formatMoney(plan.booking.price, plan.booking.currency) : primary ? formatMoney(primary.total_price, primary.currency) : null;
  if (price) parts.push(price);
  else if (plan.requirements.budget_per_night && plan.requirements.currency) parts.push(`up to ${formatMoney(plan.requirements.budget_per_night, plan.requirements.currency)}/night`);
  if (!primary && plan.options.length) parts.push(`${plan.options.length} to compare`);
  return parts.join(' · ');
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function StopInfoScreen() {
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<Params>();
  const { city, country, countryCode } = params;
  const complete = !!params.start && !!params.end && !!city;

  const startDate = parseDate(params.start ?? toYmd(new Date()));
  const endDate = parseDate(params.end ?? toYmd(new Date()));
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const transport = transportInfo(params.transport);

  const { plan: stay } = useAccommodation(params.stopSyncId);
  const readOnly = params.readOnly === '1';

  // The visa rule for this passport in this country, the same one the
  // itinerary's chips use.
  const { user } = useAuth();
  const [visaRule, setVisaRule] = useState<VisaRule | null>(null);
  useEffect(() => {
    if (!user?.uid || !countryCode) return;
    getCitizenship(user.uid)
      .then((c) => setVisaRule(c ? getRuleForCitizen(c.countryCode, countryCode) : null))
      .catch(() => setVisaRule(null));
  }, [user?.uid, countryCode]);
  const when = whenStat(startDate, endDate, days);
  const visa = visaLabel(visaRule);

  const handleEdit = () => {
    // Swap this sheet for the editor in one navigation update. A first version
    // dismissed and then pushed after a timer; when the dismissal was still
    // running, the editor was presented on top of it and react-native-screens
    // asserted ("modally presented controllers are being reshuffled").
    router.replace({
      pathname: '/(tabs)/(plans)/edit-stop',
      params: {
        legId: params.legId,
        journeyId: params.journeyId,
        country,
        city,
        start: params.start,
        end: params.end,
        transport: params.transport,
        ...(params.notes && { notes: params.notes }),
        ...(params.lockStart && { lockStart: params.lockStart }),
      },
    });
  };

  const openAccommodation = () => {
    if (!params.stopSyncId || !params.journeySyncId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Not a replace: the journey screen pushes the page once this sheet is
    // gone (see accommodationBridge for why).
    setPendingStay({
      stopSyncId: params.stopSyncId,
      journeySyncId: params.journeySyncId,
      city,
      country,
      countryCode,
      start: params.start,
      end: params.end,
      readOnly,
    });
    nav.goBack();
  };

  const handleDelete = () => {
    Alert.alert('Delete Stop', `Remove ${city} from this journey?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteJourneyLeg(Number(params.legId));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          nav.goBack();
          showToast('Stop removed');
        },
      },
    ]);
  };

  if (!complete) return <MissingRoute title="Stop" message="This stop is no longer here." />;

  const latitude = params.latitude ? Number(params.latitude) : null;
  const longitude = params.longitude ? Number(params.longitude) : null;
  const hasCoords = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude);

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero map, as on a stay in the timeline */}
        {hasCoords && (
          <View style={styles.mapContainer}>
            <RNMapView
              style={styles.map}
              provider={PROVIDER_DEFAULT}
              initialRegion={{ latitude: latitude!, longitude: longitude!, latitudeDelta: 0.4, longitudeDelta: 0.4 }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Marker coordinate={{ latitude: latitude!, longitude: longitude! }} />
            </RNMapView>
            <GlassCard {...glassProps} style={[styles.mapOverlay, !hasGlass && styles.mapOverlayFallback]}>
              <Flag code={countryCode} size={28} />
            </GlassCard>
          </View>
        )}

        {/* City and country */}
        <View style={[styles.header, hasCoords && styles.headerWithMap]}>
          {!hasCoords && <Flag code={countryCode} size={32} />}
          <Text style={styles.city}>{city}</Text>
          <Text style={styles.country}>{country}</Text>
        </View>

        {/* Stats: each fact once; the dates themselves are in the card below */}
        <StatRow style={styles.statsRow}>
          <StatTile label="Duration" value={`${days}`} unit={days === 1 ? 'day' : 'days'} />
          <StatTile label={when.label} value={when.value} unit={when.unit} />
          <StatTile label="Transport" value={transport.label} icon={transport.icon} />
        </StatRow>

        {/* Details */}
        <View style={styles.section}>
          <SectionLabel>Stop details</SectionLabel>
          <GlassCard {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
            <DetailRow icon="log-in-outline" label="Arrival" value={fmtLong(startDate)} />
            <View style={styles.separator} />
            <DetailRow icon="log-out-outline" label="Departure" value={fmtLong(endDate)} />
            {visa ? (
              <>
                <View style={styles.separator} />
                <DetailRow icon="document-text-outline" label="Visa" value={visa} />
              </>
            ) : null}
            {params.notes ? (
              <>
                <View style={styles.separator} />
                <View style={styles.notesRow}>
                  <View style={styles.detailLeft}>
                    <Ionicons name="create-outline" size={18} color={Colors.textTertiary} />
                    <Text style={styles.detailLabel}>Notes</Text>
                  </View>
                  <Text selectable style={styles.notesText}>{params.notes}</Text>
                </View>
              </>
            ) : null}
          </GlassCard>
        </View>

        {/* Where to stay. On a friend's trip only once they planned something. */}
        {params.stopSyncId && params.journeySyncId && (!readOnly || stay) ? (
          <Pressable onPress={openAccommodation} style={({ pressed }) => [styles.section, pressed && { opacity: 0.7 }]}>
            <GlassCard {...glassProps} style={[styles.card, styles.stayCard, !hasGlass && styles.cardFallback]}>
              <View style={styles.stayIcon}>
                <Ionicons name="bed-outline" size={20} color={Colors.text} />
              </View>
              <View style={styles.stayText}>
                {stay ? (
                  <>
                    <Text style={styles.stayTitle} numberOfLines={1}>{planChipText(stay)}</Text>
                    <Text style={styles.staySub} numberOfLines={1}>{staySummary(stay)}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.stayTitle}>Where to stay</Text>
                    <Text style={styles.staySub}>Requirements, options, the booking</Text>
                  </>
                )}
              </View>
              {stay ? <StatusBadge status={stay.status} size="small" /> : null}
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </GlassCard>
          </Pressable>
        ) : null}

        {/* Tips */}
        <View style={styles.section}>
          <SectionLabel>{`Tips for ${city}`}</SectionLabel>
          <GlassCard {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
            <CityTips city={city} country={country} />
          </GlassCard>
        </View>

        {/* Actions, as on a stay: plain words at the end */}
        {!readOnly && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleEdit} activeOpacity={0.5}>
              <Text style={styles.editText}>Edit stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleDelete} activeOpacity={0.5}>
              <Text style={styles.deleteText}>Delete stop</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLeft}>
        <Ionicons name={icon} size={18} color={Colors.textTertiary} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 60 },
  // ─── Hero map ───
  mapContainer: {
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 24,
    borderCurve: 'continuous',
  },
  map: { flex: 1 },
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  mapOverlayFallback: { backgroundColor: 'rgba(255,255,255,0.9)' },
  // ─── Header ───
  header: { alignItems: 'center', paddingTop: 28, paddingBottom: 4, gap: 2 },
  headerWithMap: { paddingTop: 20 },
  city: { ...Typography.displayMedium, fontSize: 26, fontWeight: '700' },
  country: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textSecondary, marginTop: 2 },
  // ─── Stats ───
  statsRow: { marginHorizontal: 16, marginTop: 20 },
  // ─── Cards: a grey label above each, as on the add-stop form ───
  section: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  card: { borderRadius: 16, padding: 18, overflow: 'hidden' },
  cardFallback: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  separator: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary },
  detailValue: { ...Typography.bodySmall, fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  notesRow: { gap: 8 },
  notesText: { ...Typography.bodySmall, fontSize: 14, lineHeight: 20 },
  // ─── Where to stay ───
  stayCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  stayIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stayText: { flex: 1, gap: 2 },
  stayTitle: { ...Typography.titleSmall, fontWeight: '600' },
  staySub: { ...Typography.bodySmall, color: Colors.textSecondary },
  // ─── Actions ───
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginHorizontal: 16, marginTop: 24, paddingVertical: 14 },
  actionButton: { alignItems: 'center' },
  editText: { ...Typography.bodyMedium, fontWeight: '600' },
  deleteText: { ...Typography.bodyMedium, color: Colors.error },
});
