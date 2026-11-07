import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { Typography, FontSize } from '../../../constants/typography';
import { getRuleForCitizen, type VisaRule } from '../../../constants/visaRules';
import { useAccommodation } from '../../../hooks/useAccommodations';
import { useAuth } from '../../../hooks/useAuth';
import { countDays, toYmd } from '../../../lib/days';
import { getCitizenship } from '../../../lib/onboarding';
import { setPendingActivities, setPendingStay } from '../../../lib/accommodationBridge';
import { useJourneyActivities } from '../../../hooks/useActivities';
import { DetailCard, DetailRow, DetailSeparator, LinkCard } from '../../../components/SheetRows';
import { ACTIVITIES_UI } from '../../../lib/activityModel';
import { formatMoney, nightsBetween, primaryOption } from '../../../lib/accommodationModel';
import { showToast } from '../../../lib/toast';
import { useTranslation } from '../../../contexts/LanguageContext';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

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
function whenStat(start: Date, end: Date, days: number, t: TFunc): { label: string; value: string; unit?: string } {
  const today = parseDate(toYmd(new Date()));
  if (today < start) {
    const until = countDays(today, start) - 1;
    return until === 1 ? { label: t('stopInfo.starts'), value: t('stopInfo.tomorrow') } : { label: t('stopInfo.starts'), value: t('stopInfo.inDays', { count: until }), unit: t('stopInfo.days') };
  }
  if (today > end) {
    const ago = countDays(end, today) - 1;
    return ago === 1 ? { label: t('stopInfo.ended'), value: t('stopInfo.yesterday') } : { label: t('stopInfo.ended'), value: `${ago}`, unit: t('stopInfo.daysAgo') };
  }
  return { label: t('stopInfo.today'), value: t('stopInfo.dayN', { n: countDays(start, today) }), unit: t('stopInfo.ofDays', { days }) };
}

/** The visa rule in a sentence, or what it means when there is none to track. */
function visaLabel(rule: VisaRule | null, t: TFunc): string | null {
  if (!rule) return null;
  if (rule.ruleType === 'visa_required') return t('stopInfo.visaRequired');
  return rule.label;
}

/** The second line of the stay card: nights, the pick, what it costs. */
function staySummary(plan: NonNullable<ReturnType<typeof useAccommodation>['plan']>, t: TFunc): string {
  const nights = nightsBetween(plan.check_in, plan.check_out);
  const parts = [`${nights} ${nights === 1 ? t('stopInfo.nightSingular') : t('stopInfo.nightPlural')}`];
  const primary = primaryOption(plan);
  const price = plan.booking ? formatMoney(plan.booking.price, plan.booking.currency) : primary ? formatMoney(primary.total_price, primary.currency) : null;
  if (price) parts.push(price);
  else if (plan.requirements.budget_per_night && plan.requirements.currency) parts.push(t('stopInfo.upToNight', { amount: formatMoney(plan.requirements.budget_per_night, plan.requirements.currency)! }));
  if (!primary && plan.options.length) parts.push(t('stopInfo.toCompare', { count: plan.options.length }));
  return parts.join(' · ');
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function StopInfoScreen() {
  const { t, countryName } = useTranslation();
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
  const stopIds = useMemo(() => [params.stopSyncId ?? null], [params.stopSyncId]);
  const { byStop: activitiesByStop } = useJourneyActivities(params.journeySyncId, stopIds);
  const things = params.stopSyncId ? activitiesByStop.get(params.stopSyncId) ?? [] : [];
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
  const when = whenStat(startDate, endDate, days, t);
  const visa = visaLabel(visaRule, t);

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

  const openActivities = () => {
    if (!params.stopSyncId || !params.journeySyncId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingActivities({ stopSyncId: params.stopSyncId, journeySyncId: params.journeySyncId, readOnly });
    nav.goBack();
  };

  const handleDelete = () => {
    Alert.alert(t('stopInfo.deleteStopTitle'), t('stopInfo.removeFromJourney', { city: city ?? '' }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteJourneyLeg(Number(params.legId));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          nav.goBack();
          showToast(t('stopInfo.stopRemoved'));
        },
      },
    ]);
  };

  if (!complete) return <MissingRoute title={t('stopInfo.stop')} message={t('plans.stopGone')} />;

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
          <Text style={styles.country}>{countryName(country)}</Text>
        </View>

        {/* Stats: each fact once; the dates themselves are in the card below */}
        <StatRow style={styles.statsRow}>
          <StatTile label={t('stopInfo.duration')} value={`${days}`} unit={days === 1 ? t('stopInfo.day') : t('stopInfo.days')} />
          <StatTile label={when.label} value={when.value} unit={when.unit} />
          <StatTile label={t('plans.transport')} value={t(`transport.${transport.type}`)} icon={transport.icon} />
        </StatRow>

        {/* Details */}
        <View style={styles.section}>
          <SectionLabel>{t('stopInfo.stopDetails')}</SectionLabel>
          <DetailCard>
            <DetailRow icon="log-in-outline" label={t('stopInfo.arrival')} value={fmtLong(startDate)} />
            <DetailSeparator />
            <DetailRow icon="log-out-outline" label={t('stopInfo.departure')} value={fmtLong(endDate)} />
            {visa ? (
              <>
                <DetailSeparator />
                <DetailRow icon="document-text-outline" label={t('stopInfo.visa')} value={visa} />
              </>
            ) : null}
            {params.notes ? (
              <>
                <DetailSeparator />
                <View style={styles.notesRow}>
                  <View style={styles.detailLeft}>
                    <Ionicons name="create-outline" size={18} color={Colors.textTertiary} />
                    <Text style={styles.detailLabel}>{t('plans.notes')}</Text>
                  </View>
                  <Text selectable style={styles.notesText}>{params.notes}</Text>
                </View>
              </>
            ) : null}
          </DetailCard>
        </View>

        {/* Where to stay. On a friend's trip only once they planned something. */}
        {params.stopSyncId && params.journeySyncId && (!readOnly || stay) ? (
          <View style={styles.section}>
            <LinkCard
              icon="bed-outline"
              // The place by name once there is one; the badge says how far it is.
              title={stay ? primaryOption(stay)?.name ?? planChipText(stay, t) : t('stopInfo.whereToStay')}
              sub={stay ? staySummary(stay, t) : t('stopInfo.reqOptionsBooking')}
              right={stay && stay.needed ? <StatusBadge status={stay.status} size="small" /> : undefined}
              onPress={openAccommodation}
            />
          </View>
        ) : null}

        {/* Things to do, the same way in. */}
        {ACTIVITIES_UI && params.stopSyncId && params.journeySyncId && (!readOnly || things.length > 0) ? (
          <View style={styles.section}>
            <LinkCard
              icon="sparkles-outline"
              title={things.length === 0 ? t('nav.thingsToDo') : things.length === 1 ? t('stopInfo.oneThing') : t('stopInfo.manyThings', { count: things.length })}
              sub={things.length === 0 ? t('stopInfo.ideasSuggestions') : things.slice(0, 3).map((a) => a.title).join(', ')}
              onPress={openActivities}
            />
          </View>
        ) : null}

        {/* Tips */}
        <View style={styles.section}>
          <SectionLabel>{t('stopInfo.tipsFor', { city: city ?? '' })}</SectionLabel>
          <GlassCard {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
            <CityTips city={city} country={country} />
          </GlassCard>
        </View>

        {/* Actions, as on a stay: plain words at the end */}
        {!readOnly && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleEdit} activeOpacity={0.5}>
              <Text style={styles.editText}>{t('stopInfo.editStop')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleDelete} activeOpacity={0.5}>
              <Text style={styles.deleteText}>{t('stopInfo.deleteStop')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </>
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
  city: { ...Typography.displayMedium, fontSize: FontSize.title1, fontWeight: '700' },
  country: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textSecondary, marginTop: 2 },
  // ─── Stats ───
  statsRow: { marginHorizontal: 16, marginTop: 20 },
  // ─── Cards: a grey label above each, as on the add-stop form ───
  section: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  card: { borderRadius: 16, padding: 18, overflow: 'hidden' },
  cardFallback: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { ...Typography.bodySmall, fontSize: FontSize.subheadline, color: Colors.textSecondary },
  notesRow: { gap: 8 },
  notesText: { ...Typography.bodySmall, fontSize: FontSize.subheadline, lineHeight: 20 },
  // ─── Actions ───
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginHorizontal: 16, marginTop: 24, paddingVertical: 14 },
  actionButton: { alignItems: 'center' },
  editText: { ...Typography.bodyMedium, fontWeight: '600' },
  deleteText: { ...Typography.bodyMedium, color: Colors.error },
});
