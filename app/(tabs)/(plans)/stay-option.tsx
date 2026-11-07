import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CloudyButton } from '../../../components/CloudyButton';
import { MissingRoute } from '../../../components/MissingRoute';
import { DetailCard, DetailNotes, DetailRow, DetailSeparator, LinkCard } from '../../../components/SheetRows';
import { StatRow, StatTile } from '../../../components/StatTile';
import { SectionLabel } from '../../../components/visaForm';
import { Colors } from '../../../constants/colors';
import { Typography, FontSize } from '../../../constants/typography';
import { useAccommodation } from '../../../hooks/useAccommodations';
import { removeAccommodationOption, selectAccommodationOption, type LocalAccommodation } from '../../../lib/accommodations';
import { formatMoney, nightsBetween, optionNightlyPrice } from '../../../lib/accommodationModel';
import { showToast } from '../../../lib/toast';
import { useTranslation } from '../../../contexts/LanguageContext';
import { appLocale } from '../../../lib/i18n/locale';
import { formatDayRange } from '../../../lib/days';

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

function fmtRange(start: string, end: string): string {
  return formatDayRange(start, end);
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
  const { t } = useTranslation();
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const readOnly = params.readOnly === '1';
  const { plan, loaded, setPlan } = useAccommodation(params.stopSyncId);

  if (!params.stopSyncId || !params.optionId) return <MissingRoute title={t('plans.place')} message={t('plans.placeGone')} />;
  if (!loaded) return <Stack.Screen options={{ headerShown: false }} />;
  const o = plan?.options.find((x) => x.id === params.optionId) ?? null;
  if (!plan || !o) return <MissingRoute title={t('plans.place')} message={t('plans.placeGone')} />;

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
      showToast(err?.message ?? t('plans.couldNotSave'), 'error');
    }
  };

  const pick = () => apply(() => selectAccommodationOption(params.stopSyncId, o.id), t('stayOption.picked', { name: o.name }));
  const unpick = () => apply(() => selectAccommodationOption(params.stopSyncId, null));
  const sheet = { stopSyncId: params.stopSyncId, journeySyncId: params.journeySyncId, start: params.start, end: params.end, countryCode: params.countryCode, city: params.city };
  // Swap this sheet for the form in one go, as the stop sheet does. The
  // booking form books this place; picking first is not a step anyone needs.
  const toBooking = () => router.replace({ pathname: '/(tabs)/(plans)/stay-booking', params: { ...sheet, optionId: o.id } } as any);
  const edit = () => router.replace({ pathname: '/(tabs)/(plans)/stay-option-edit', params: { ...sheet, optionId: o.id } } as any);
  const remove = () => {
    Alert.alert(t('stayOption.removeTitle', { name: o.name }), booked ? t('stayOption.removeBookedBody') : undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeAccommodationOption(params.stopSyncId, o.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
            showToast(t('stayOption.placeRemoved'));
          } catch (err: any) {
            showToast(err?.message ?? t('stayOption.couldNotRemove'), 'error');
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
          <StatTile label={t('plans.perNight')} value={nightly !== null && o.currency ? String(nightly) : '—'} unit={nightly !== null && o.currency ? o.currency : undefined} />
          <StatTile label={`${nights} ${nights === 1 ? t('stayOption.nightSingular') : t('stayOption.nightPlural')}`} value={o.total_price !== null && o.currency ? String(o.total_price) : '—'} unit={o.total_price !== null && o.currency ? o.currency : undefined} />
          <StatTile label={t('plans.rating')} value={o.rating !== null ? `★ ${o.rating}` : '—'} unit={o.rating !== null && o.rating_scale === 10 ? '/10' : undefined} />
        </StatRow>

        <View style={styles.section}>
          <SectionLabel>{t('stayOption.details')}</SectionLabel>
          <DetailCard>
            {datesDiffer && (
              <>
                <DetailRow icon="calendar-outline" label={t('plans.dates')} value={fmtRange(o.check_in, o.check_out)} />
                <DetailSeparator />
              </>
            )}
            {o.fees !== null && o.fees > 0 && o.currency ? (
              <>
                <DetailRow icon="cash-outline" label={t('stayOption.fees')} value={formatMoney(o.fees, o.currency)!} />
                <DetailSeparator />
              </>
            ) : null}
            {o.cancellation_policy ? (
              <>
                <DetailRow icon="refresh-outline" label={t('stayOption.cancellation')} value={o.cancellation_policy} />
                <DetailSeparator />
              </>
            ) : null}
            {o.review_count !== null ? (
              <>
                <DetailRow icon="chatbubble-outline" label={t('stayOption.reviews')} value={`${o.review_count.toLocaleString(appLocale())}`} />
                <DetailSeparator />
              </>
            ) : null}
            {o.amenities.length > 0 ? (
              <>
                <DetailRow icon="checkmark-circle-outline" label={t('stayOption.has')} value={o.amenities.map((a) => t(`amenities.${a}`)).join(', ')} />
                <DetailSeparator />
              </>
            ) : null}
            {o.risks ? (
              <>
                <DetailNotes icon="warning-outline" label={t('plans.risks')} text={o.risks} />
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
              label={t('plans.yourScore')}
              value={o.score !== null ? t('stayOption.yourScoreValue', { score: o.score }) : t('stayOption.notScored')}
            />
            {o.last_checked_at ? (
              <>
                <DetailSeparator />
                <DetailRow icon="time-outline" label={t('stayOption.checked')} value={new Date(o.last_checked_at).toLocaleDateString(appLocale(), { month: 'short', day: 'numeric' })} />
              </>
            ) : null}
          </DetailCard>
        </View>

        <View style={styles.section}>
          {o.url ? (
            <LinkCard icon="open-outline" title={o.platform ? t('stayOption.openOn', { platform: o.platform }) : t('stayOption.openListing')} sub={o.url.replace(/^https?:\/\/(www\.)?/, '')} onPress={() => Linking.openURL(o.url!)} />
          ) : null}
          {o.address ? (
            <LinkCard icon="navigate-outline" title={t('stayOption.directions')} sub={o.address} onPress={() => Linking.openURL(mapsUrl(o.address!))} />
          ) : null}
        </View>

        {!readOnly && !booked && (
          <View style={styles.cta}>
            <CloudyButton onPress={toBooking} style={styles.ctaButton} innerStyle={styles.ctaInner}>
              <Text style={styles.ctaText}>{t('plans.bookThisPlace')}</Text>
            </CloudyButton>
            <Text style={styles.ctaFoot}>{picked ? t('stayOption.pickedFoot') : t('stayOption.orPickFoot')}</Text>
          </View>
        )}

        {!readOnly && (
          <View style={styles.actions}>
            {!booked && (
              <TouchableOpacity onPress={picked ? unpick : pick} activeOpacity={0.5}>
                <Text style={styles.actionText}>{picked ? t('stayOption.unpick') : t('stayOption.pick')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={edit} activeOpacity={0.5}>
              <Text style={styles.actionText}>{t('common.edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={remove} activeOpacity={0.5}>
              <Text style={styles.deleteText}>{t('common.remove')}</Text>
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
  title: { ...Typography.displayMedium, fontSize: FontSize.title1, fontWeight: '700', textAlign: 'center' },
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
