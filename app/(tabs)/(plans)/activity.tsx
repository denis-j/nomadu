import { useCallback, useState } from 'react';
import { Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { PlaceMap } from '../../../components/activities/PlaceMap';
import { SOURCE_MARK, statusOptions, categoryIcon } from '../../../components/activities/visuals';
import { SectionLabel } from '../../../components/visaForm';
import { DetailCard, DetailNotes, DetailRow, DetailSeparator, LinkCard } from '../../../components/SheetRows';
import { StatRow, StatTile } from '../../../components/StatTile';
import { Dropdown } from '../../../components/Dropdown';
import { MissingRoute } from '../../../components/MissingRoute';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { deleteActivity, getActivity, moveActivity, setActivityStatus, type LocalActivity } from '../../../lib/activities';
import { type ActivityStatus } from '../../../lib/activityModel';
import { getJourneyWithLegs, parseDate, type JourneyLeg } from '../../../lib/database';
import { showToast } from '../../../lib/toast';
import { useTranslation } from '../../../contexts/LanguageContext';

type Params = { id: string; journeyId: string; readOnly?: string };

const hasGlass = isLiquidGlassAvailable();
const GlassCard = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const NOT_PLACED = '__none__';
const fmtShort = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function mapsUrl(a: LocalActivity, city: string | undefined): string {
  const name = encodeURIComponent(a.place ?? a.title);
  if (a.latitude !== null && a.longitude !== null) {
    return Platform.OS === 'ios' ? `http://maps.apple.com/?ll=${a.latitude},${a.longitude}&q=${name}` : `geo:${a.latitude},${a.longitude}?q=${name}`;
  }
  const q = encodeURIComponent([a.place ?? a.title, a.address, city].filter(Boolean).join(', '));
  return Platform.OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`;
}

/**
 * One thing to do, built exactly like a stop's sheet: the picture or the
 * map on top with a glass plate, the name centred under it, three tiles
 * (the status is a menu), a card of facts, the ways out, and the plain
 * words at the end. Nothing is edited here; "Edit" opens the form.
 */
export default function ActivitySheet() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const readOnly = params.readOnly === '1';
  const [a, setA] = useState<LocalActivity | null | undefined>(undefined);
  const [legs, setLegs] = useState<JourneyLeg[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (params.id) getActivity(params.id).then((x) => setA(x && !x.deleted ? x : null));
    if (params.journeyId) getJourneyWithLegs(Number(params.journeyId)).then((j) => setLegs(j?.legs ?? []));
  }, [params.id, params.journeyId]);
  useFocusEffect(load);

  const apply = async (work: () => Promise<LocalActivity>, toast?: string) => {
    try {
      setA(await work());
      if (toast) showToast(toast);
    } catch (err: any) {
      showToast(err?.message ?? t('plans.couldNotSave'), 'error');
    }
  };

  if (a === undefined) return <Stack.Screen options={{ headerShown: false }} />;
  if (a === null) return <MissingRoute title={t('nav.thingsToDo')} message={t('activities.notHere')} />;

  const mark = SOURCE_MARK[a.source];
  const stop = legs.find((l) => l.sync_id === a.stop_id) ?? null;
  const picture = !!a.image_url && !failed;
  const located = a.latitude !== null && a.longitude !== null;
  const where = [a.place && a.place !== a.title ? a.place : null, stop?.city].filter(Boolean).join(', ');
  const stopValue = stop ? `${stop.city}, ${fmtShort(stop.start_date)} – ${fmtShort(stop.end_date)}` : t('activities.notPlacedYet');
  const website = a.url ? a.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : null;

  const edit = () => {
    // Swap the sheet for the form in one go, as the stop sheet does: a
    // sheet pushed over a sheet that is still dismissing gets reshuffled.
    router.replace({
      pathname: '/(tabs)/(plans)/activity-add',
      params: { mode: 'manual', id: a.id, journeyId: params.journeyId, journeySyncId: a.journey_id },
    });
  };

  const remove = () => {
    Alert.alert(t('activities.deleteTitle', { title: a.title }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteActivity(a.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
          showToast(t('activities.deleted'));
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero, as on a stop: the post's picture or the place on the map. */}
        {picture || located ? (
          <View style={[styles.hero, picture && styles.heroTall]}>
            {picture ? (
              <Image source={{ uri: a.image_url! }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
            ) : (
              <PlaceMap latitude={a.latitude!} longitude={a.longitude!} lift={0} style={StyleSheet.absoluteFill} />
            )}
            <GlassCard {...glassProps} style={[styles.heroPlate, !hasGlass && styles.heroPlateFallback]}>
              <Ionicons name={mark?.icon ?? categoryIcon(a.category)} size={18} color={Colors.text} />
            </GlassCard>
          </View>
        ) : null}

        <View style={[styles.header, !(picture || located) && styles.headerAlone]}>
          <Text style={styles.title}>{a.title}</Text>
          {where ? <Text style={styles.where}>{where}</Text> : null}
        </View>

        {/* Three facts, the status one a menu. */}
        <StatRow style={styles.statsRow}>
          <StatTile
            label={t('activities.status')}
            value={t(`activityStatus.${a.status}`)}
            options={readOnly ? undefined : statusOptions(t)}
            menuValue={a.status}
            onPick={readOnly ? undefined : (id) => apply(() => setActivityStatus(a.id, id as ActivityStatus))}
          />
          <StatTile label={t('activities.kind')} value={t(`activityCat.${a.category}`)} icon={categoryIcon(a.category)} />
          {a.price !== null && a.currency ? (
            <StatTile label={t('activities.price')} value={a.price === 0 ? t('activities.free') : String(a.price)} unit={a.price === 0 ? undefined : a.currency} />
          ) : (
            <StatTile label={t('activities.stop')} value={stop?.city ?? t('activities.notPlaced')} />
          )}
        </StatRow>

        <View style={styles.section}>
          <SectionLabel>{t('activities.details')}</SectionLabel>
          <DetailCard>
            {readOnly ? (
              <DetailRow icon="location-outline" label={t('activities.stop')} value={stopValue} />
            ) : (
              <DetailRow
                icon="location-outline"
                label={t('activities.stop')}
                right={(
                  <Dropdown
                    right
                    title={t('activities.moveTo')}
                    value={a.stop_id ?? NOT_PLACED}
                    options={[
                      ...legs.filter((l) => l.sync_id).map((l) => ({ id: l.sync_id!, label: l.city, subtitle: `${fmtShort(l.start_date)} – ${fmtShort(l.end_date)}` })),
                      { id: NOT_PLACED, label: t('activities.notPlacedYet') },
                    ]}
                    onPick={(id) => apply(() => moveActivity(a.id, id === NOT_PLACED ? null : id), t('activities.moved'))}
                  >
                    <View style={styles.pick}>
                      <Text style={styles.pickText} numberOfLines={1}>{stopValue}</Text>
                      <Ionicons name="chevron-expand" size={14} color={Colors.textTertiary} />
                    </View>
                  </Dropdown>
                )}
              />
            )}
            {a.address ? (
              <>
                <DetailSeparator />
                <DetailRow icon="map-outline" label={t('plans.address')} value={a.address} />
              </>
            ) : null}
            {mark ? (
              <>
                <DetailSeparator />
                <DetailRow icon={mark.icon} label={t('activities.from')} value={t(`source.${a.source}`)} />
              </>
            ) : null}
            {a.notes ? (
              <>
                <DetailSeparator />
                <DetailNotes text={a.notes} />
              </>
            ) : null}
          </DetailCard>
        </View>

        {/* Ways out, the same cards a stop leads to its stay with. */}
        <View style={styles.section}>
          <LinkCard icon="navigate-outline" title={t('activities.directions')} sub={a.place ?? a.address ?? stop?.city ?? t('activities.openInMaps')} onPress={() => Linking.openURL(mapsUrl(a, stop?.city))} />
          {a.source_url && mark ? (
            <LinkCard icon={mark.icon} title={t('activities.openOnSource', { label: t(`source.${a.source}`) })} sub={t('activities.postItCameFrom')} onPress={() => Linking.openURL(a.source_url!)} />
          ) : null}
          {a.url ? (
            <LinkCard icon="globe-outline" title={t('activities.website')} sub={website ?? undefined} onPress={() => Linking.openURL(a.url!)} />
          ) : null}
        </View>

        {/* Actions, as on a stop: plain words at the end. */}
        {!readOnly && (
          <View style={styles.actions}>
            <TouchableOpacity onPress={edit} activeOpacity={0.5}>
              <Text style={styles.editText}>{t('common.edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={remove} activeOpacity={0.5}>
              <Text style={styles.deleteText}>{t('common.delete')}</Text>
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
  hero: {
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 24,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
  heroTall: { height: 300 },
  heroPlate: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  heroPlateFallback: { backgroundColor: 'rgba(255,255,255,0.9)' },
  header: { alignItems: 'center', paddingTop: 20, paddingBottom: 4, paddingHorizontal: 24, gap: 2 },
  headerAlone: { paddingTop: 32 },
  title: { ...Typography.displayMedium, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  where: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  statsRow: { marginHorizontal: 16, marginTop: 20 },
  section: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  pickText: { ...Typography.bodySmall, fontSize: 14, fontWeight: '500', flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginHorizontal: 16, marginTop: 24, paddingVertical: 14 },
  editText: { ...Typography.bodyMedium, fontWeight: '600' },
  deleteText: { ...Typography.bodyMedium, color: Colors.error },
});
