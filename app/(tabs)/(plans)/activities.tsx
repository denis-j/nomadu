import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ActivityRow } from '../../../components/activities/ActivityRow';
import { CITY_SPAN, PLACE_SPAN, PinsMap, type MapPin } from '../../../components/activities/PinsMap';
import { categoryIcon } from '../../../components/activities/visuals';
import { CloudyButton } from '../../../components/CloudyButton';
import { Dropdown } from '../../../components/Dropdown';
import { Flag } from '../../../components/Flag';
import { MissingRoute } from '../../../components/MissingRoute';
import { PillRow, type PillOption } from '../../../components/PillRow';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useJourneyActivities } from '../../../hooks/useActivities';
import { addActivity, type LocalActivity } from '../../../lib/activities';
import { ACTIVITY_CATEGORY_LABELS } from '../../../lib/activityModel';
import { locateActivities } from '../../../lib/activityPlaces';
import { suggestActivities, type ActivitySuggestion } from '../../../lib/ai';
import { getJourneyWithLegs, parseDate, type JourneyLeg, type JourneyWithLegs } from '../../../lib/database';
import { showToast } from '../../../lib/toast';
import { track } from '../../../lib/analytics';

type Params = {
  /** The journey's local id, for its stops. */
  journeyId: string;
  journeySyncId: string;
  /** Opened for one stop: its pill is on when the page comes up. */
  stopSyncId?: string;
  /** '1' on a friend's trip we may not plan: shown as it is. */
  readOnly?: string;
};

/** 'all', 'unplaced' or a stop's sync id. */
type Filter = 'all' | 'unplaced' | string;

const hasGlass = isLiquidGlassAvailable();
const PillShell = hasGlass ? GlassView : View;
const GlassCard = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const fmtShort = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** "Nov 6 – 13" inside a month, "Nov 28 – Dec 2" across one, as on the itinerary. */
function fmtRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) return `${fmtShort(start)} – ${e.getDate()}`;
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}

/**
 * The things to do on a trip, on one page: a row of pills to narrow it to
 * a stop, the places on a map as on the stay's page (the stops themselves
 * while nothing is placed), then the activities as row cards, under a small
 * heading per stop while everything is shown. Below one stop's list sit the
 * ideas for that city, folded away until asked for, in the same dashed
 * cards the itinerary uses for a stop that is not there yet.
 */
export default function ActivitiesScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const nav = useNavigation();
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

  // The pill that is on. A link to one stop turns that stop's pill on; a
  // pill for a stop that is gone falls back to everything.
  const [filter, setFilter] = useState<Filter>(params.stopSyncId ?? 'all');
  useEffect(() => { if (params.stopSyncId) setFilter(params.stopSyncId); }, [params.stopSyncId]);
  useEffect(() => {
    if (!journey || filter === 'all') return;
    if (filter === 'unplaced' ? unplaced.length === 0 && loaded : !legs.some((l) => l.sync_id === filter)) setFilter('all');
  }, [journey, legs, filter, unplaced.length, loaded]);

  // Named places get their point on the map, so the sheet can show it.
  useEffect(() => {
    if (readOnly || legs.length === 0 || activities.length === 0) return;
    const stops = new Map(legs.map((l) => [l.sync_id, l]));
    locateActivities(activities, (a) => (a.stop_id ? stops.get(a.stop_id) ?? null : null), refresh);
  }, [activities, legs, readOnly, refresh]);

  const filterLeg = legs.find((l) => l.sync_id === filter) ?? null;
  // The ideas are for one city: the stop that is picked, or the only one.
  const ideasLeg = filterLeg ?? (legs.length === 1 && filter === 'all' ? legs[0] : null);

  const openAdd = useCallback((mode: 'link' | 'manual') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(tabs)/(plans)/activity-add',
      params: { mode, journeyId: String(journeyId), journeySyncId: params.journeySyncId, ...(ideasLeg?.sync_id && { stopSyncId: ideasLeg.sync_id }) },
    });
  }, [router, journeyId, params.journeySyncId, ideasLeg?.sync_id]);

  const openActivity = (a: LocalActivity) => router.push({
    pathname: '/(tabs)/(plans)/activity',
    params: { id: a.id, journeyId: String(journeyId), ...(readOnly && { readOnly: '1' }) },
  });

  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: readOnly
        ? undefined
        : () => (
            <Dropdown
              right
              options={[
                { id: 'link', label: 'Paste a link', icon: 'link' },
                { id: 'manual', label: 'Add manually', icon: 'square.and.pencil' },
              ]}
              onPick={(id) => openAdd(id as 'link' | 'manual')}
            >
              <View hitSlop={12} accessibilityRole="button" accessibilityLabel="Add something to do">
                <Ionicons name="add" size={26} color={Colors.text} />
              </View>
            </Dropdown>
          ),
    });
  }, [nav, readOnly, openAdd]);

  if (!params.journeySyncId || !journeyId || journey === null) return <MissingRoute title="Things to do" message="This trip is no longer here." />;
  if (journey === undefined || !loaded) return <Stack.Screen options={{ title: 'Things to do' }} />;

  // One group per stop while everything is shown, the unplaced ones last;
  // one group, without its heading, once a pill narrows it down.
  const groups: { key: string; leg: JourneyLeg | null; items: LocalActivity[] }[] = [];
  if (filter === 'all') {
    for (const leg of legs) {
      const items = leg.sync_id ? byStop.get(leg.sync_id) ?? [] : [];
      if (items.length) groups.push({ key: leg.sync_id ?? String(leg.id), leg, items });
    }
    if (unplaced.length) groups.push({ key: 'unplaced', leg: null, items: unplaced });
  } else if (filter === 'unplaced') {
    groups.push({ key: 'unplaced', leg: null, items: unplaced });
  } else if (filterLeg) {
    groups.push({ key: filter, leg: filterLeg, items: byStop.get(filter) ?? [] });
  }
  const headed = filter === 'all' && (groups.length > 1 || unplaced.length > 0);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const pills = legs.length > 1 || unplaced.length > 0;

  // The map on top: the places in view that have a point; while none has,
  // the stops themselves, so the page always opens on where this is.
  const placed: MapPin[] = groups
    .flatMap((g) => g.items)
    .filter((a) => a.latitude !== null && a.longitude !== null)
    .map((a) => ({ latitude: a.latitude!, longitude: a.longitude! }));
  const stopPins: MapPin[] = (filterLeg ? [filterLeg] : legs)
    .filter((l) => l.latitude !== null && l.longitude !== null)
    .map((l) => ({ latitude: l.latitude!, longitude: l.longitude! }));
  const pins = placed.length ? placed : stopPins;
  const hero = filter !== 'unplaced' && pins.length > 0;

  const pillOptions: PillOption[] = [
    { key: 'all', label: 'All', active: filter === 'all', onPress: () => setFilter('all') },
    ...legs.filter((l) => l.sync_id).map((l) => ({
      key: l.sync_id!,
      label: l.city,
      leading: <Flag code={l.country_code} size={18} />,
      active: filter === l.sync_id,
      onPress: () => setFilter(l.sync_id!),
    })),
    ...(unplaced.length > 0
      ? [{ key: 'unplaced', label: 'Not placed', icon: 'pin-outline' as const, active: filter === 'unplaced', onPress: () => setFilter('unplaced') }]
      : []),
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Things to do' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {pills && <PillRow options={pillOptions} />}

        {hero && (
          <View style={styles.mapContainer}>
            <PinsMap pins={pins} singleSpan={placed.length ? PLACE_SPAN : CITY_SPAN} style={StyleSheet.absoluteFill} />
            <GlassCard {...glassProps} style={[styles.mapPlate, !hasGlass && styles.mapPlateFallback]}>
              {filterLeg ? <Flag code={filterLeg.country_code} size={22} /> : <Ionicons name="sparkles-outline" size={18} color={Colors.text} />}
              <Text style={styles.mapPlateText} numberOfLines={1}>{filterLeg ? filterLeg.city : journey.title}</Text>
            </GlassCard>
          </View>
        )}

        {shown === 0 ? (
          <Empty
            city={filterLeg?.city ?? (legs.length === 1 ? legs[0].city : null)}
            readOnly={readOnly}
            owner={journey.shared_owner_name ?? null}
            onLink={() => openAdd('link')}
            onManual={() => openAdd('manual')}
          />
        ) : (
          groups.map((g) => (
            <View key={g.key} style={styles.group}>
              {headed && (
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setFilter(g.leg?.sync_id ?? 'unplaced'); }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.groupHead, pressed && { opacity: 0.6 }]}
                >
                  {g.leg ? <Flag code={g.leg.country_code} size={18} /> : <Ionicons name="pin-outline" size={16} color={Colors.textSecondary} />}
                  <Text style={styles.groupTitle}>{g.leg ? g.leg.city : 'Not placed yet'}</Text>
                  <Text style={styles.groupMeta}>{g.leg ? fmtRange(g.leg.start_date, g.leg.end_date) : 'Open one to put it on a stop'}</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
                </Pressable>
              )}
              <View style={styles.list}>
                {g.items.map((a) => (
                  <ActivityRow key={a.id} activity={a} onPress={() => openActivity(a)} />
                ))}
              </View>
            </View>
          ))
        )}

        {ideasLeg && !readOnly && (
          <Ideas
            key={ideasLeg.sync_id ?? ideasLeg.id}
            leg={ideasLeg}
            existing={(ideasLeg.sync_id ? byStop.get(ideasLeg.sync_id) ?? [] : []).map((a) => a.title)}
            journeySyncId={params.journeySyncId}
            onAdded={refresh}
          />
        )}
      </ScrollView>
    </>
  );
}

// ─── Empty ───────────────────────────────────────────────────────────────────

/** Nothing here yet: what the page is for, and the two ways in, as the timeline's empty state offers them. */
function Empty({ city, readOnly, owner, onLink, onManual }: { city: string | null; readOnly: boolean; owner: string | null; onLink: () => void; onManual: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="sparkles-outline" size={26} color={Colors.text} />
      </View>
      <Text style={styles.emptyTitle}>{city ? `Nothing in ${city} yet` : 'Nothing planned yet'}</Text>
      <Text style={styles.emptyText}>
        {readOnly
          ? `${owner ?? 'Your friend'} has not saved anything here yet.`
          : city
            ? 'Save a post you found, add a place yourself, or open the ideas below.'
            : 'Save the posts you found, add places yourself, or pick a stop for ideas.'}
      </Text>
      {!readOnly && (
        <>
          <CloudyButton onPress={onLink} style={styles.emptyCta} innerStyle={styles.emptyCtaInner}>
            <Ionicons name="logo-tiktok" size={20} color={Colors.cloudyButtonText} />
            <Text style={styles.emptyCtaText}>Paste a TikTok or Instagram link</Text>
          </CloudyButton>
          <Pressable onPress={onManual} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.55 }]}>
            <Ionicons name="add-circle-outline" size={20} color={Colors.text} />
            <Text style={styles.secondaryText}>Add manually</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ─── Ideas ───────────────────────────────────────────────────────────────────

/**
 * Suggestions for one city, folded under a glass pill like the itinerary's
 * AI suggestions. Nothing is asked for until the pill is opened; each idea
 * is a dashed card and one tap saves it.
 */
function Ideas({ leg, existing, journeySyncId, onAdded }: { leg: JourneyLeg; existing: string[]; journeySyncId: string; onAdded: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ActivitySuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const chevron = useSharedValue(-90);
  useEffect(() => {
    chevron.value = withSpring(open ? 0 : -90, { damping: 18, stiffness: 200 });
  }, [open, chevron]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevron.value}deg` }] }));

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const next = await suggestActivities(
        { city: leg.city, country: leg.country, startDate: leg.start_date, endDate: leg.end_date },
        [...existing, ...(items ?? []).map((s) => s.title)],
      );
      track({ name: 'activity_suggestions_loaded' });
      setItems(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !open;
    setOpen(next);
    if (next && items === null && !loading) load();
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
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <PillShell {...(hasGlass ? { glassEffectStyle: 'regular' as const } : {})} style={[styles.ideasPill, !hasGlass && styles.ideasPillFallback]}>
            <Ionicons name="sparkles" size={12} color={Colors.text} />
            <Text style={styles.ideasPillText}>Ideas for {leg.city}</Text>
            <Animated.View style={chevronStyle}>
              <Ionicons name="chevron-down" size={13} color={Colors.textSecondary} />
            </Animated.View>
          </PillShell>
        </Pressable>
        {open && (loading ? (
          <Text style={styles.ideasStatus}>Finding ideas…</Text>
        ) : items ? (
          <Pressable onPress={load} hitSlop={10} accessibilityRole="button" accessibilityLabel="New ideas">
            <Ionicons name="refresh" size={16} color={Colors.textSecondary} />
          </Pressable>
        ) : null)}
      </View>

      {open && (
        <View style={styles.list}>
          {error && !loading && (
            <Pressable onPress={load} style={({ pressed }) => [styles.idea, styles.ideaError, pressed && { opacity: 0.6 }]}>
              <Ionicons name="cloud-offline-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.ideaWhy}>Could not reach the AI. Tap to try again.</Text>
            </Pressable>
          )}
          {loading && !items && (
            <>
              <IdeaSkeleton />
              <IdeaSkeleton />
            </>
          )}
          {items && items.length === 0 && !loading && (
            <Text style={styles.ideasNone}>Nothing new right now. Try again in a bit.</Text>
          )}
          {items?.map((s) => (
            <Pressable
              key={s.title}
              onPress={() => take(s)}
              disabled={adding !== null}
              accessibilityRole="button"
              accessibilityLabel={`Add ${s.title}`}
              style={({ pressed }) => [styles.idea, pressed && { opacity: 0.6 }, adding !== null && adding !== s.title && { opacity: 0.5 }]}
            >
              <View style={styles.ideaIcon}>
                {adding === s.title ? <ActivityIndicator size="small" color={Colors.text} /> : <Ionicons name={categoryIcon(s.category)} size={18} color={Colors.text} />}
              </View>
              <View style={styles.ideaText}>
                <Text style={styles.ideaTitle}>{s.title}</Text>
                <Text style={styles.ideaMeta}>{[ACTIVITY_CATEGORY_LABELS[s.category], s.place, s.price_hint].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.ideaWhy}>{s.why}</Text>
                <View style={styles.ideaAdd}>
                  <Ionicons name="add" size={14} color={Colors.text} />
                  <Text style={styles.ideaAddText}>Add this</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function IdeaSkeleton() {
  return (
    <View style={styles.idea}>
      <View style={[styles.ideaIcon, { backgroundColor: Colors.border }]} />
      <View style={styles.ideaText}>
        <View style={[styles.skeletonBar, { width: '55%' }]} />
        <View style={[styles.skeletonBar, { width: '35%' }]} />
        <View style={[styles.skeletonBar, { width: '80%', marginTop: 8 }]} />
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Same page measures as the wallet.
  content: { padding: 16, paddingBottom: 100, gap: 20 },

  // The map, as on the stay's page; the plate as the Map tab's chip.
  mapContainer: {
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
  mapPlate: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
    maxWidth: '70%',
  },
  mapPlateFallback: { backgroundColor: 'rgba(255,255,255,0.9)' },
  mapPlateText: { ...Typography.titleSmall, fontWeight: '600', flexShrink: 1 },

  group: { gap: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  groupTitle: { ...Typography.eyebrow, fontSize: 13, color: Colors.textSecondary },
  groupMeta: { ...Typography.caption, color: Colors.textTertiary, flex: 1, fontVariant: ['tabular-nums'] },
  list: { gap: 10 },

  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12, gap: 10 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { ...Typography.titleLarge, textAlign: 'center', letterSpacing: -0.4 },
  emptyText: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 10 },
  emptyCta: { width: '100%' },
  emptyCtaInner: { justifyContent: 'center', gap: 10 },
  emptyCtaText: { ...Typography.titleSmall, fontWeight: '700', color: Colors.cloudyButtonText },
  secondary: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Colors.border,
  },
  secondaryText: { ...Typography.button },

  // The ideas, headed like the itinerary's AI suggestions.
  ideas: { gap: 12 },
  ideasHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ideasPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 7,
    overflow: 'hidden',
    gap: 6,
  },
  ideasPillFallback: { backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.border },
  ideasPillText: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  ideasStatus: { ...Typography.caption, color: Colors.textSecondary },
  ideasNone: { ...Typography.bodySmall, color: Colors.textSecondary, paddingHorizontal: 4 },
  // A dashed card, as a suggested stop on the itinerary.
  idea: {
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ideaError: { alignItems: 'center' },
  ideaIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ideaText: { flex: 1, gap: 2 },
  ideaTitle: { ...Typography.titleSmall, fontWeight: '600' },
  ideaMeta: { ...Typography.bodySmall, color: Colors.textSecondary },
  ideaWhy: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 18, marginTop: 4, flexShrink: 1 },
  ideaAdd: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  ideaAddText: { ...Typography.caption, fontWeight: '700', color: Colors.text },
  skeletonBar: { height: 10, borderRadius: 5, backgroundColor: Colors.border, marginTop: 6 },
});
