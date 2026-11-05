import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ActivityCard } from '../../../components/activities/ActivityCard';
import { categoryIcon } from '../../../components/activities/visuals';
import { locateActivities } from '../../../lib/activityPlaces';
import { Dropdown } from '../../../components/Dropdown';
import { Flag } from '../../../components/Flag';
import { GlassDisc, DISC_SIZE } from '../../../components/GlassDisc';
import { MissingRoute } from '../../../components/MissingRoute';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useJourneyActivities } from '../../../hooks/useActivities';
import { addActivity, type LocalActivity } from '../../../lib/activities';
import { ACTIVITY_CATEGORY_LABELS } from '../../../lib/activityModel';
import { suggestActivities, type ActivitySuggestion } from '../../../lib/ai';
import { getJourneyWithLegs, parseDate, type JourneyWithLegs, type JourneyLeg } from '../../../lib/database';
import { showToast } from '../../../lib/toast';
import { track } from '../../../lib/analytics';

type Params = {
  /** The journey's local id, for its stops. */
  journeyId: string;
  journeySyncId: string;
  /** One stop only; without it, the whole trip. */
  stopSyncId?: string;
  /** '1' on a friend's trip we may not plan: shown as it is. */
  readOnly?: string;
};

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const PAD = 16;
const GAP = 12;
/** Cards in a stop's row on the whole-trip page. */
const ROW_CARD = 148;

const fmtShort = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtRange = (a: string, b: string) => `${fmtShort(a)} – ${fmtShort(b)}`;
const countText = (n: number) => (n === 0 ? 'Nothing saved yet' : n === 1 ? '1 saved' : `${n} saved`);

/**
 * Things to do, drawn like the trip they belong to: a big header with the
 * place, glass discs over it, and every activity as a cover (the TikTok's
 * picture, or the kind's emoji on its sky). One stop is a grid; the whole
 * trip is a row of covers per stop. Adding happens in a sheet (a link, or
 * by hand); a cover opens its own sheet.
 *
 * Activities that are not on a stop of this trip (never placed, or their
 * stop was removed) gather under "Not placed yet".
 */
export default function ActivitiesScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const journeyId = Number(params.journeyId);
  const readOnly = params.readOnly === '1';
  const [journey, setJourney] = useState<JourneyWithLegs | null | undefined>(undefined);

  const loadJourney = useCallback(() => {
    if (journeyId) getJourneyWithLegs(journeyId).then(setJourney);
  }, [journeyId]);
  useEffect(loadJourney, [loadJourney]);
  useFocusEffect(loadJourney);

  const legs = useMemo(() => journey?.legs ?? [], [journey]);
  const stopIds = useMemo(() => legs.map((l) => l.sync_id), [legs]);
  const { activities, byStop, unplaced, loaded, refresh } = useJourneyActivities(params.journeySyncId, stopIds);

  const oneStop = params.stopSyncId ? legs.find((l) => l.sync_id === params.stopSyncId) ?? null : null;

  // Named places get their point on the map, so their card can show it.
  useEffect(() => {
    if (readOnly || legs.length === 0 || activities.length === 0) return;
    const stops = new Map(legs.map((l) => [l.sync_id, l]));
    locateActivities(activities, (a) => (a.stop_id ? stops.get(a.stop_id) ?? null : null), refresh);
  }, [activities, legs, readOnly, refresh]);

  const openAdd = (mode: 'link' | 'manual') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(tabs)/(plans)/activity-add',
      params: { mode, journeyId: String(journeyId), journeySyncId: params.journeySyncId, ...(oneStop?.sync_id && { stopSyncId: oneStop.sync_id }) },
    });
  };
  const openActivity = (a: LocalActivity) => router.push({
    pathname: '/(tabs)/(plans)/activity',
    params: { id: a.id, journeyId: String(journeyId), ...(readOnly && { readOnly: '1' }) },
  });
  const openStop = (leg: JourneyLeg) => {
    if (!leg.sync_id) return;
    Haptics.selectionAsync();
    router.push({
      pathname: '/(tabs)/(plans)/activities',
      params: { journeyId: String(journeyId), journeySyncId: params.journeySyncId, stopSyncId: leg.sync_id, ...(readOnly && { readOnly: '1' }) },
    });
  };

  if (!params.journeySyncId || !journeyId || journey === null) return <MissingRoute title="Things to do" message="This trip is no longer here." />;
  if (journey === undefined || !loaded) return <Stack.Screen options={{ headerShown: false }} />;
  if (params.stopSyncId && !oneStop) return <MissingRoute title="Things to do" message="This stop is no longer here." />;

  const mine = oneStop ? byStop.get(oneStop.sync_id!) ?? [] : activities;
  const cardWidth = (width - PAD * 2 - GAP) / 2;
  const barTop = insets.top;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, { paddingTop: barTop + DISC_SIZE + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* The place, big, the way the trip names its stops. */}
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Things to do</Text>
          <View style={styles.heroRow}>
            {oneStop ? <Flag code={oneStop.country_code ?? ''} size={30} /> : null}
            <Text style={styles.heroTitle} numberOfLines={2}>{oneStop ? oneStop.city : journey.title}</Text>
          </View>
          <Text style={styles.heroSub}>
            {oneStop
              ? `${fmtRange(oneStop.start_date, oneStop.end_date)} · ${countText(mine.length)}`
              : `${countText(activities.length)} · ${legs.length} ${legs.length === 1 ? 'stop' : 'stops'}`}
          </Text>
        </View>

        {oneStop ? (
          <>
            {mine.length > 0 ? (
              <View style={styles.grid}>
                {mine.map((a) => <ActivityCard key={a.id} activity={a} width={cardWidth} onPress={() => openActivity(a)} />)}
              </View>
            ) : (
              <EmptyStop city={oneStop.city} readOnly={readOnly} onLink={() => openAdd('link')} onManual={() => openAdd('manual')} />
            )}
            {!readOnly && (
              <Ideas
                leg={oneStop}
                existing={mine.map((a) => a.title)}
                journeySyncId={params.journeySyncId}
                onAdded={refresh}
              />
            )}
          </>
        ) : (
          <>
            {legs.map((leg) => {
              const list = leg.sync_id ? byStop.get(leg.sync_id) ?? [] : [];
              return (
                <View key={leg.id} style={styles.stop}>
                  <Pressable onPress={() => openStop(leg)} style={({ pressed }) => [styles.stopHead, pressed && { opacity: 0.6 }]}>
                    <Flag code={leg.country_code ?? ''} size={22} />
                    <View style={styles.stopTitles}>
                      <Text style={styles.stopCity}>{leg.city}</Text>
                      <Text style={styles.stopSub}>{fmtRange(leg.start_date, leg.end_date)} · {countText(list.length)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                  </Pressable>
                  {list.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.rowScroll}>
                      {list.map((a) => <ActivityCard key={a.id} activity={a} width={ROW_CARD} onPress={() => openActivity(a)} />)}
                    </ScrollView>
                  ) : !readOnly ? (
                    <Pressable onPress={() => openStop(leg)} style={({ pressed }) => [styles.softRow, pressed && { opacity: 0.6 }]}>
                      <Ionicons name="sparkles-outline" size={18} color={Colors.textSecondary} />
                      <Text style={styles.softText}>Find ideas for {leg.city}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {unplaced.length > 0 && (
              <View style={styles.stop}>
                <View style={styles.stopHead}>
                  <View style={styles.unplacedIcon}>
                    <Ionicons name="pin-outline" size={18} color={Colors.text} />
                  </View>
                  <View style={styles.stopTitles}>
                    <Text style={styles.stopCity}>Not placed yet</Text>
                    <Text style={styles.stopSub}>Open one to put it on a stop</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.rowScroll}>
                  {unplaced.map((a) => <ActivityCard key={a.id} activity={a} width={ROW_CARD} onPress={() => openActivity(a)} />)}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* The bar, as on the trip: a soft fade under two glass discs. */}
      <LinearGradient
        colors={[Colors.background, Colors.background + '00']}
        locations={[0.55, 1]}
        style={[styles.fade, { height: barTop + DISC_SIZE + 24 }]}
        pointerEvents="none"
      />
      <View style={[styles.bar, { top: barTop }]} pointerEvents="box-none">
        <GlassDisc icon="chevron-back" size={24} onPress={() => router.back()} label="Back" />
        {!readOnly && (
          <Dropdown
            right
            options={[
              { id: 'link', label: 'Paste a TikTok or Instagram link', icon: 'link' },
              { id: 'manual', label: 'Add one yourself', icon: 'square.and.pencil' },
            ]}
            onPick={(id) => openAdd(id as 'link' | 'manual')}
          >
            <GlassDisc icon="add" size={28} label="Add" />
          </Dropdown>
        )}
      </View>
    </View>
  );
}

// ─── Empty ───────────────────────────────────────────────────────────────────

function EmptyStop({ city, readOnly, onLink, onManual }: { city: string; readOnly: boolean; onLink: () => void; onManual: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcons}>
        {(['restaurant-outline', 'camera-outline', 'leaf-outline'] as const).map((icon) => (
          <View key={icon} style={styles.emptyIcon}>
            <Ionicons name={icon} size={22} color={Colors.text} />
          </View>
        ))}
      </View>
      <Text style={styles.emptyTitle}>{readOnly ? `Nothing planned in ${city} yet` : `What do you want to do in ${city}?`}</Text>
      {!readOnly && (
        <>
          <Text style={styles.emptyText}>Save the TikToks you found, add places yourself, or let the ideas below get you started.</Text>
          <View style={styles.emptyActions}>
            <Pill icon="logo-tiktok" label="Paste a link" onPress={onLink} strong />
            <Pill icon="create-outline" label="Add yourself" onPress={onManual} />
          </View>
        </>
      )}
    </View>
  );
}

function Pill({ icon, label, onPress, strong, busy }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; strong?: boolean; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [styles.pill, strong && styles.pillStrong, pressed && { opacity: 0.7 }]}>
      {busy ? <ActivityIndicator size="small" color={strong ? Colors.white : Colors.text} /> : <Ionicons name={icon} size={16} color={strong ? Colors.white : Colors.text} />}
      <Text style={[styles.pillText, strong && styles.pillTextStrong]}>{label}</Text>
    </Pressable>
  );
}

// ─── Ideas ───────────────────────────────────────────────────────────────────

/** Suggestions for the city as a row to swipe through; each taken with one tap. */
function Ideas({ leg, existing, journeySyncId, onAdded }: { leg: JourneyLeg; existing: string[]; journeySyncId: string; onAdded: () => Promise<void> }) {
  const [items, setItems] = useState<ActivitySuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const load = async () => {
    Haptics.selectionAsync();
    setLoading(true);
    try {
      const next = await suggestActivities(
        { city: leg.city, country: leg.country, startDate: leg.start_date, endDate: leg.end_date },
        [...existing, ...(items ?? []).map((s) => s.title)],
      );
      track({ name: 'activity_suggestions_loaded' });
      setItems(next);
    } catch (err: any) {
      showToast(err?.message ?? 'No ideas right now', 'error');
    } finally {
      setLoading(false);
    }
  };

  const take = async (s: ActivitySuggestion) => {
    if (!leg.sync_id) return;
    setAdding(s.title);
    try {
      await addActivity(journeySyncId, leg.sync_id, { title: s.title, category: s.category, place: s.place, notes: s.why, source: 'ai' });
      track({ name: 'activity_added', props: { source: 'ai' } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setItems((prev) => (prev ?? []).filter((x) => x !== s));
      await onAdded();
    } catch (err: any) {
      showToast(err?.message ?? 'Could not add', 'error');
    } finally {
      setAdding(null);
    }
  };

  return (
    <View style={styles.ideas}>
      <View style={styles.ideasHead}>
        <Text style={styles.ideasTitle}>Ideas for {leg.city}</Text>
        {items ? (
          <Pressable onPress={load} disabled={loading} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            {loading ? <ActivityIndicator size="small" color={Colors.textSecondary} /> : <Ionicons name="refresh" size={20} color={Colors.textSecondary} />}
          </Pressable>
        ) : null}
      </View>
      {!items ? (
        <Pressable onPress={load} disabled={loading} style={({ pressed }) => pressed && { opacity: 0.8 }}>
          <LinearGradient colors={['#A9DBFF', '#5AB8F5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ideasCta}>
            <View style={styles.ideasCtaIcon}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </View>
            <View style={styles.ideasCtaText}>
              <Text style={styles.ideasCtaTitle}>{loading ? 'Finding ideas…' : `Get ideas for ${leg.city}`}</Text>
              <Text style={styles.ideasCtaSub}>Picked for {fmtRange(leg.start_date, leg.end_date)}</Text>
            </View>
            {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-forward" size={20} color="#fff" />}
          </LinearGradient>
        </Pressable>
      ) : items.length === 0 ? (
        <Text style={styles.ideasNone}>Nothing new right now. Try again in a bit.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.rowScroll}>
          {items.map((s) => {
            return (
              <Glass key={s.title} {...glassProps} style={[styles.idea, !hasGlass && styles.ideaFallback]}>
                <View style={styles.ideaBadge}>
                  <Ionicons name={categoryIcon(s.category)} size={18} color={Colors.text} />
                </View>
                <Text style={styles.ideaTitle} numberOfLines={2}>{s.title}</Text>
                <Text style={styles.ideaMeta} numberOfLines={1}>
                  {[ACTIVITY_CATEGORY_LABELS[s.category], s.price_hint].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.ideaWhy} numberOfLines={3}>{s.why}</Text>
                <View style={styles.ideaSpacer} />
                <Pressable
                  onPress={() => take(s)}
                  disabled={adding !== null}
                  style={({ pressed }) => [styles.ideaAdd, pressed && { opacity: 0.7 }]}
                  accessibilityLabel={`Add ${s.title}`}
                >
                  {adding === s.title ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="add" size={16} color={Colors.white} />}
                  <Text style={styles.ideaAddText}>Save</Text>
                </Pressable>
              </Glass>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: PAD, paddingBottom: 140, gap: 22 },

  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    height: DISC_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  hero: { gap: 6 },
  eyebrow: { ...Typography.eyebrow, color: Colors.textSecondary },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTitle: { ...Typography.displayMedium, flexShrink: 1 },
  heroSub: { ...Typography.body, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },

  stop: { gap: 12 },
  stopHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stopTitles: { flex: 1, gap: 1 },
  stopCity: { ...Typography.titleMedium },
  stopSub: { ...Typography.bodySmall, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  unplacedIcon: { width: 22, alignItems: 'center' },
  rowScroll: { marginHorizontal: -PAD },
  row: { paddingHorizontal: PAD, gap: GAP },
  softRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
  },
  softText: { ...Typography.titleSmall, color: Colors.textSecondary, fontWeight: '500' },

  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12, gap: 10 },
  emptyIcons: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...Typography.titleLarge, textAlign: 'center' },
  emptyText: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  pillStrong: { backgroundColor: Colors.text, borderColor: Colors.text },
  pillText: { ...Typography.label, fontWeight: '700' },
  pillTextStrong: { color: Colors.white },

  ideas: { gap: 12, marginTop: 6 },
  ideasHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ideasTitle: { ...Typography.titleMedium },
  ideasCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 22,
    borderCurve: 'continuous',
  },
  ideasCtaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  ideasCtaText: { flex: 1, gap: 2 },
  ideasCtaTitle: { ...Typography.titleSmall, color: '#fff', fontWeight: '700' },
  ideasCtaSub: { ...Typography.bodySmall, color: 'rgba(255,255,255,0.9)' },
  ideasNone: { ...Typography.body, color: Colors.textSecondary },
  idea: {
    width: 220,
    minHeight: 236,
    padding: 14,
    gap: 6,
    borderRadius: 22,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  ideaFallback: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  ideaBadge: { width: 38, height: 38, borderRadius: 12, borderCurve: 'continuous', backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  ideaTitle: { ...Typography.titleSmall, fontWeight: '700', lineHeight: 20 },
  ideaMeta: { ...Typography.caption, color: Colors.textTertiary, fontWeight: '600' },
  ideaWhy: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 18 },
  ideaSpacer: { flex: 1 },
  ideaAdd: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Colors.text,
    marginTop: 8,
  },
  ideaAddText: { ...Typography.label, color: Colors.white, fontWeight: '700' },
});
