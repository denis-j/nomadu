import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CloudyButton } from '../../../components/CloudyButton';
import { MissingRoute } from '../../../components/MissingRoute';
import { DetailCard, DetailNotes, DetailRow, DetailSeparator, LinkCard } from '../../../components/SheetRows';
import { StatRow, StatTile } from '../../../components/StatTile';
import { SectionLabel } from '../../../components/visaForm';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useAccommodation } from '../../../hooks/useAccommodations';
import { removeAccommodationOption, selectAccommodationOption, type LocalAccommodation } from '../../../lib/accommodations';
import { amenityLabel, formatMoney, nightsBetween, optionNightlyPrice } from '../../../lib/accommodationModel';
import { parseDate } from '../../../lib/database';
import { showToast } from '../../../lib/toast';

type Params = {
  stopSyncId: string;
  journeySyncId: string;
  optionId: string;
  start: string;
  end: string;
  countryCode: string;
  city: string;
  /** '1' on a friend's trip: look, do not touch. */
  readOnly?: string;
};

const fmtShort = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
function fmtRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) return `${fmtShort(start)} – ${e.getDate()}`;
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}

function mapsUrl(address: string): string {
  const q = encodeURIComponent(address);
  return Platform.OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`;
}

/**
 * One place found for a stay, as a sheet built like a stop's: the name,
 * three tiles, a card of facts, the way to the listing, and what to do
 * with it. Booking it is the one big button; picking, editing and removing
 * are the plain words at the end.
 */
export default function StayOptionSheet() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const readOnly = params.readOnly === '1';
  const { plan, loaded, setPlan } = useAccommodation(params.stopSyncId);

  if (!params.stopSyncId || !params.optionId) return <MissingRoute title="Place" message="This place is no longer here." />;
  if (!loaded) return <Stack.Screen options={{ headerShown: false }} />;
  const o = plan?.options.find((x) => x.id === params.optionId) ?? null;
  if (!plan || !o) return <MissingRoute title="Place" message="This place is no longer here." />;

  const picked = plan.selected_option_id === o.id;
  const booked = plan.booking?.option_id === o.id;
  const nightly = optionNightlyPrice(o);
  const nights = nightsBetween(o.check_in, o.check_out);
  const where = [o.platform, o.address].filter(Boolean).join(' · ');
  const datesDiffer = o.check_in !== plan.check_in || o.check_out !== plan.check_out;

  const apply = async (work: () => Promise<LocalAccommodation>, toast?: string) => {
    try {
      setPlan(await work());
      if (toast) showToast(toast);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not save', 'error');
    }
  };

  const pick = () => apply(() => selectAccommodationOption(params.stopSyncId, o.id), `${o.name} picked`);
  const unpick = () => apply(() => selectAccommodationOption(params.stopSyncId, null));
  const sheet = { stopSyncId: params.stopSyncId, journeySyncId: params.journeySyncId, start: params.start, end: params.end, countryCode: params.countryCode, city: params.city };
  // Swap this sheet for the form in one go, as the stop sheet does. The
  // booking form books this place; picking first is not a step anyone needs.
  const toBooking = () => router.replace({ pathname: '/(tabs)/(plans)/stay-booking', params: { ...sheet, optionId: o.id } } as any);
  const edit = () => router.replace({ pathname: '/(tabs)/(plans)/stay-option-edit', params: { ...sheet, optionId: o.id } } as any);
  const remove = () => {
    Alert.alert(`Remove ${o.name}?`, booked ? 'The booking details stay, only the place goes from the list.' : undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeAccommodationOption(params.stopSyncId, o.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
            showToast('Place removed');
          } catch (err: any) {
            showToast(err?.message ?? 'Could not remove', 'error');
          }
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{o.name}</Text>
          {where ? <Text style={styles.where}>{where}</Text> : null}
        </View>

        <StatRow style={styles.statsRow}>
          <StatTile label="Per night" value={nightly !== null && o.currency ? String(nightly) : '—'} unit={nightly !== null && o.currency ? o.currency : undefined} />
          <StatTile label={`${nights} ${nights === 1 ? 'night' : 'nights'}`} value={o.total_price !== null && o.currency ? String(o.total_price) : '—'} unit={o.total_price !== null && o.currency ? o.currency : undefined} />
          <StatTile label="Rating" value={o.rating !== null ? `★ ${o.rating}` : '—'} unit={o.rating !== null && o.rating_scale === 10 ? '/10' : undefined} />
        </StatRow>

        <View style={styles.section}>
          <SectionLabel>Details</SectionLabel>
          <DetailCard>
            {datesDiffer && (
              <>
                <DetailRow icon="calendar-outline" label="Dates" value={fmtRange(o.check_in, o.check_out)} />
                <DetailSeparator />
              </>
            )}
            {o.fees !== null && o.fees > 0 && o.currency ? (
              <>
                <DetailRow icon="cash-outline" label="Fees" value={formatMoney(o.fees, o.currency)!} />
                <DetailSeparator />
              </>
            ) : null}
            {o.cancellation_policy ? (
              <>
                <DetailRow icon="refresh-outline" label="Cancellation" value={o.cancellation_policy} />
                <DetailSeparator />
              </>
            ) : null}
            {o.review_count !== null ? (
              <>
                <DetailRow icon="chatbubble-outline" label="Reviews" value={`${o.review_count.toLocaleString('en-US')}`} />
                <DetailSeparator />
              </>
            ) : null}
            {o.amenities.length > 0 ? (
              <>
                <DetailRow icon="checkmark-circle-outline" label="Has" value={o.amenities.map(amenityLabel).join(', ')} />
                <DetailSeparator />
              </>
            ) : null}
            {o.risks ? (
              <>
                <DetailNotes icon="warning-outline" label="Risks" text={o.risks} />
                <DetailSeparator />
              </>
            ) : null}
            {o.notes ? (
              <>
                <DetailNotes text={o.notes} />
                <DetailSeparator />
              </>
            ) : null}
            <DetailRow
              icon="ribbon-outline"
              label="Your score"
              value={o.score !== null ? `${o.score} of 10` : 'Not scored'}
            />
            {o.last_checked_at ? (
              <>
                <DetailSeparator />
                <DetailRow icon="time-outline" label="Checked" value={new Date(o.last_checked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
              </>
            ) : null}
          </DetailCard>
        </View>

        <View style={styles.section}>
          {o.url ? (
            <LinkCard icon="open-outline" title={o.platform ? `Open on ${o.platform}` : 'Open the listing'} sub={o.url.replace(/^https?:\/\/(www\.)?/, '')} onPress={() => Linking.openURL(o.url!)} />
          ) : null}
          {o.address ? (
            <LinkCard icon="navigate-outline" title="Directions" sub={o.address} onPress={() => Linking.openURL(mapsUrl(o.address!))} />
          ) : null}
        </View>

        {!readOnly && !booked && (
          <View style={styles.cta}>
            <CloudyButton onPress={toBooking} style={styles.ctaButton} innerStyle={styles.ctaInner}>
              <Text style={styles.ctaText}>Book this place</Text>
            </CloudyButton>
            <Text style={styles.ctaFoot}>{picked ? 'Picked. Book it once it is confirmed.' : 'Or mark it as picked while you decide.'}</Text>
          </View>
        )}

        {!readOnly && (
          <View style={styles.actions}>
            {!booked && (
              <TouchableOpacity onPress={picked ? unpick : pick} activeOpacity={0.5}>
                <Text style={styles.actionText}>{picked ? 'Unpick' : 'Pick'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={edit} activeOpacity={0.5}>
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={remove} activeOpacity={0.5}>
              <Text style={styles.deleteText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </>
  );
}

// Same measures as the stop's sheet (stop-info.tsx).
const styles = StyleSheet.create({
  content: { paddingBottom: 60 },
  header: { alignItems: 'center', paddingTop: 32, paddingBottom: 4, paddingHorizontal: 24, gap: 2 },
  title: { ...Typography.displayMedium, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  where: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  statsRow: { marginHorizontal: 16, marginTop: 20 },
  section: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  cta: { marginHorizontal: 16, marginTop: 24, gap: 10 },
  ctaButton: { width: '100%' },
  ctaInner: { justifyContent: 'center' },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
  ctaFoot: { ...Typography.bodySmall, color: Colors.textTertiary, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginHorizontal: 16, marginTop: 16, paddingVertical: 14 },
  actionText: { ...Typography.bodyMedium, fontWeight: '600' },
  deleteText: { ...Typography.bodyMedium, color: Colors.error },
});
