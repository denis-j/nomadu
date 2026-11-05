import { useCallback, useState } from 'react';
import { Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { PlaceMap } from '../../../components/activities/PlaceMap';
import { SOURCE_MARK, categoryIcon } from '../../../components/activities/visuals';
import { TextArea, TextRow } from '../../../components/accommodationForm';
import { Card, SectionLabel } from '../../../components/visaForm';
import { DetailCard, DetailRow, DetailSeparator, LinkCard } from '../../../components/SheetRows';
import { Dropdown } from '../../../components/Dropdown';
import { MissingRoute } from '../../../components/MissingRoute';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { deleteActivity, getActivity, moveActivity, updateActivity, type LocalActivity } from '../../../lib/activities';
import { ACTIVITY_CATEGORIES, ACTIVITY_CATEGORY_LABELS, type ActivityCategory } from '../../../lib/activityModel';
import { formatMoney } from '../../../lib/accommodationModel';
import { getJourneyWithLegs, parseDate, type JourneyLeg } from '../../../lib/database';
import { showToast } from '../../../lib/toast';

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
 * One thing to do, built like a stop's sheet: the picture or the map on
 * top with a glass plate, the name centred under it, a card of facts, the
 * ways out as the same cards that lead to a stop's stay, and the plain
 * words at the end.
 */
export default function ActivitySheet() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const readOnly = params.readOnly === '1';
  const [a, setA] = useState<LocalActivity | null | undefined>(undefined);
  const [legs, setLegs] = useState<JourneyLeg[]>([]);
  const [editing, setEditing] = useState(false);
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
      showToast(err?.message ?? 'Could not save', 'error');
    }
  };

  if (a === undefined) return <Stack.Screen options={{ headerShown: false }} />;
  if (a === null) return <MissingRoute title="Things to do" message="This is no longer here." />;

  const mark = SOURCE_MARK[a.source];
  const stop = legs.find((l) => l.sync_id === a.stop_id) ?? null;
  const price = formatMoney(a.price, a.currency);
  const picture = !!a.image_url && !failed;
  const located = a.latitude !== null && a.longitude !== null;
  const set = (patch: Record<string, unknown>) => apply(() => updateActivity(a.id, patch));
  const where = [a.place && a.place !== a.title ? a.place : null, stop?.city].filter(Boolean).join(', ');

  const remove = () => {
    Alert.alert(`Delete ${a.title}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteActivity(a.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
          showToast('Deleted');
        },
      },
    ]);
  };

  const stopValue = stop ? `${stop.city}, ${fmtShort(stop.start_date)} – ${fmtShort(stop.end_date)}` : 'Not placed yet';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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

        <View style={styles.section}>
          <SectionLabel>Details</SectionLabel>
          <DetailCard>
            <DetailRow icon={categoryIcon(a.category)} label="Kind" value={ACTIVITY_CATEGORY_LABELS[a.category]} />
            <DetailSeparator />
            {readOnly ? (
              <DetailRow icon="location-outline" label="Stop" value={stopValue} />
            ) : (
              <DetailRow
                icon="location-outline"
                label="Stop"
                right={(
                  <Dropdown
                    right
                    title="Move to"
                    value={a.stop_id ?? NOT_PLACED}
                    options={[
                      ...legs.filter((l) => l.sync_id).map((l) => ({ id: l.sync_id!, label: l.city, subtitle: `${fmtShort(l.start_date)} – ${fmtShort(l.end_date)}` })),
                      { id: NOT_PLACED, label: 'Not placed yet' },
                    ]}
                    onPick={(id) => apply(() => moveActivity(a.id, id === NOT_PLACED ? null : id), 'Moved')}
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
                <DetailRow icon="map-outline" label="Address" value={a.address} />
              </>
            ) : null}
            {price ? (
              <>
                <DetailSeparator />
                <DetailRow icon="cash-outline" label="Price" value={price} />
              </>
            ) : null}
            {a.notes ? (
              <>
                <DetailSeparator />
                <View style={styles.notesRow}>
                  <View style={styles.notesLabel}>
                    <Ionicons name="create-outline" size={18} color={Colors.textTertiary} />
                    <Text style={styles.notesLabelText}>Notes</Text>
                  </View>
                  <Text selectable style={styles.notesText}>{a.notes}</Text>
                </View>
              </>
            ) : null}
          </DetailCard>
        </View>

        {/* Ways out, the same cards a stop leads to its stay with. */}
        <View style={styles.section}>
          <LinkCard icon="navigate-outline" title="Directions" sub={a.place ?? a.address ?? stop?.city ?? 'Open in Maps'} onPress={() => Linking.openURL(mapsUrl(a, stop?.city))} />
        </View>
        {a.source_url && mark ? (
          <View style={styles.section}>
            <LinkCard icon={mark.icon} title={`Open on ${mark.label}`} sub="The post it came from" onPress={() => Linking.openURL(a.source_url!)} />
          </View>
        ) : null}
        {a.url ? (
          <View style={styles.section}>
            <LinkCard icon="globe-outline" title="Website" sub={a.url.replace(/^https?:\/\/(www\.)?/, '')} onPress={() => Linking.openURL(a.url!)} />
          </View>
        ) : null}

        {!readOnly && editing ? (
          <View style={styles.section}>
            <SectionLabel>Edit</SectionLabel>
            <Card>
              <TextRow label="Title" value={a.title} onCommit={(v) => set({ title: v })} autoCapitalize="sentences" />
              <View style={styles.kindRow}>
                <Text style={styles.kindLabel}>Kind</Text>
                <Dropdown
                  right
                  value={a.category}
                  options={ACTIVITY_CATEGORIES.map((c) => ({ id: c, label: ACTIVITY_CATEGORY_LABELS[c] }))}
                  onPick={(id) => set({ category: id as ActivityCategory })}
                >
                  <View style={styles.pick}>
                    <Text style={styles.pickText}>{ACTIVITY_CATEGORY_LABELS[a.category]}</Text>
                    <Ionicons name="chevron-expand" size={14} color={Colors.textTertiary} />
                  </View>
                </Dropdown>
              </View>
              <TextRow label="Place" value={a.place ?? ''} onCommit={(v) => set({ place: v || null, latitude: null, longitude: null })} autoCapitalize="words" />
              <TextRow label="Address" value={a.address ?? ''} onCommit={(v) => set({ address: v || null, latitude: null, longitude: null })} />
              <TextRow label="Website" value={a.url ?? ''} onCommit={(v) => set({ url: v || null })} placeholder="https://" keyboardType="url" autoCapitalize="none" />
              <TextArea value={a.notes ?? ''} onCommit={(v) => set({ notes: v.trim() || null })} placeholder="Notes" last />
            </Card>
          </View>
        ) : null}

        {/* Actions, as on a stop: plain words at the end. */}
        {!readOnly && (
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => setEditing(!editing)} activeOpacity={0.5}>
              <Text style={styles.editText}>{editing ? 'Done' : 'Edit'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={remove} activeOpacity={0.5}>
              <Text style={styles.deleteText}>Delete</Text>
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
  heroTall: { height: 320 },
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
  section: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  pickText: { ...Typography.bodySmall, fontSize: 14, fontWeight: '500', flexShrink: 1 },
  notesRow: { gap: 8 },
  notesLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notesLabelText: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary },
  notesText: { ...Typography.bodySmall, fontSize: 14, lineHeight: 20 },
  kindRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  kindLabel: { ...Typography.titleSmall, fontWeight: '500' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginHorizontal: 16, marginTop: 24, paddingVertical: 14 },
  editText: { ...Typography.bodyMedium, fontWeight: '600' },
  deleteText: { ...Typography.bodyMedium, color: Colors.error },
});
