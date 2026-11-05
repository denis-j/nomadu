import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, LayoutAnimation, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { PlaceMap } from '../../../components/activities/PlaceMap';
import { Dropdown } from '../../../components/Dropdown';
import { Flag } from '../../../components/Flag';
import { MissingRoute } from '../../../components/MissingRoute';
import { DetailCard, DetailNotes, DetailRow, DetailSeparator, LinkCard, SectionControl, SectionHead, SlotCard, StatusChip } from '../../../components/SheetRows';
import { StatRow, StatTile } from '../../../components/StatTile';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useAccommodation } from '../../../hooks/useAccommodations';
import {
  deleteAccommodation,
  setAccommodationStatus,
  startAccommodation,
  updateAccommodation,
  type LocalAccommodation,
} from '../../../lib/accommodations';
import {
  STATUS_LABELS,
  TYPE_LABELS,
  amenityLabel,
  createPlan,
  defaultStay,
  formatMoney,
  nightsBetween,
  optionNightlyPrice,
  primaryOption,
  sortOptions,
  staysMatchStop,
  type AccommodationOption,
  type AccommodationPlan,
  type AccommodationRequirements,
  type AccommodationStatus,
} from '../../../lib/accommodationModel';
import { parseDate } from '../../../lib/database';
import { toYmd } from '../../../lib/days';
import { cityCoords, forwardGeocode } from '../../../lib/geocoding';
import { showToast } from '../../../lib/toast';

type Params = {
  stopSyncId: string;
  journeySyncId: string;
  city: string;
  country: string;
  countryCode: string;
  start: string;
  end: string;
  /** '1' on a friend's trip: their plan, shown as it is. */
  readOnly?: string;
};

type SortKey = 'score' | 'price' | 'rating';
const SORT_LABELS: Record<SortKey, string> = { score: 'Score', price: 'Price', rating: 'Rating' };

/** The status in a third of the width: the two long names shortened, the rest as they are. */
const TILE_STATUS: Record<AccommodationStatus, string> = { ...STATUS_LABELS, options_available: 'Options', checked_in: 'Checked in' };

/** Every write on this page: run it, keep the result, say when it failed. */
type Apply = (work: () => Promise<LocalAccommodation>, toast?: string) => Promise<void>;

const hasGlass = isLiquidGlassAvailable();
const GlassCard = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const fmtShort = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Nov 10 – 13" inside a month, "Nov 28 – Dec 2" across one, as on the itinerary. */
function fmtRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) return `${fmtShort(start)} – ${e.getDate()}`;
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}

/** What a person can still say about the status that the plan's data does not already: arrived, stayed, called off, or back on. */
function statusChoices(plan: AccommodationPlan): { label: string; status: AccommodationStatus; icon: string }[] {
  const st = plan.status;
  if (st === 'cancelled') {
    const back: AccommodationStatus = plan.booking ? 'booked' : plan.selected_option_id ? 'selected' : plan.options.length ? 'options_available' : 'open';
    return [{ label: 'Plan this stay again', status: back, icon: 'arrow.uturn.backward' }];
  }
  const out: { label: string; status: AccommodationStatus; icon: string }[] = [];
  if (st === 'booked') out.push({ label: 'Checked in', status: 'checked_in', icon: 'key' });
  if (st === 'booked' || st === 'checked_in') out.push({ label: 'Stayed', status: 'completed', icon: 'checkmark.circle' });
  if (st !== 'completed') out.push({ label: 'Cancel this stay', status: 'cancelled', icon: 'xmark.circle' });
  return out;
}

/** "Airbnb · 85 EUR/night · ★ 4.8": the grey line under a place's name. */
function optionLine(o: AccommodationOption): string {
  const nightly = optionNightlyPrice(o);
  return [
    o.platform,
    nightly !== null && o.currency ? `${formatMoney(nightly, o.currency)}/night` : null,
    o.rating !== null ? `★ ${o.rating}${o.rating_scale === 10 ? '/10' : ''}` : null,
  ].filter(Boolean).join(' · ');
}

/** What was asked for, in two or three lines: the head line, then one line each for the rest. */
function describeRequirements(req: AccommodationRequirements): string[] {
  const head = [
    req.type ? TYPE_LABELS[req.type] : null,
    req.budget_per_night !== null && req.currency ? `up to ${formatMoney(req.budget_per_night, req.currency)} a night` : req.budget_total !== null && req.currency ? `up to ${formatMoney(req.budget_total, req.currency)}` : null,
    req.areas.length ? `in ${req.areas.join(', ')}` : null,
  ].filter(Boolean).join(' · ');
  return [
    head,
    req.amenities.length ? req.amenities.map(amenityLabel).join(', ') : null,
    req.work_requirements ? `For work: ${req.work_requirements}` : null,
    req.min_requirements ? `Must have: ${req.min_requirements}` : null,
    req.dates_flexible ? 'Dates are flexible' : null,
    req.notes,
  ].filter((x): x is string => !!x);
}

function mapsUrl(address: string): string {
  const q = encodeURIComponent(address);
  return Platform.OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`;
}

const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));

// ─── Where the place is ──────────────────────────────────────────────────────

type Point = { latitude: number; longitude: number };
/** A street or two around a place; a city and its surroundings around a stop, as on the stop's sheet. */
const PLACE_SPAN = 0.012;
const CITY_SPAN = 0.4;
/** Closer than this to the city's own point, a result is the city, not the place. */
const CITY_CENTRE_M = 400;

/** Answers kept for the session: the geocoder is rate-limited and an address does not move. */
const points = new Map<string, Point | null>();

function metres(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * The point for the map on top: the place's address where there is one and
 * the geocoder knows it, else the city. A result that is just the middle of
 * the city means the street was not known, and the city view is the honest
 * picture then.
 */
function useHeroPoint(address: string | null, city: string, country: string, countryCode: string): { point: Point; span: number } | null {
  const [hero, setHero] = useState<{ point: Point; span: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cityKey = `city:${city}|${countryCode}`;
      const cityPoint = points.has(cityKey) ? points.get(cityKey)! : await cityCoords(city, country, countryCode);
      points.set(cityKey, cityPoint);
      let place: Point | null = null;
      if (address) {
        const key = `addr:${address}|${city}`;
        place = points.has(key) ? points.get(key)! : await forwardGeocode(`${address}, ${city}, ${country}`);
        points.set(key, place);
        if (place && cityPoint && metres(place, cityPoint) < CITY_CENTRE_M) place = null;
      }
      if (cancelled) return;
      if (place) setHero({ point: place, span: PLACE_SPAN });
      else if (cityPoint) setHero({ point: cityPoint, span: CITY_SPAN });
      else setHero(null);
    })();
    return () => { cancelled = true; };
  }, [address, city, country, countryCode]);
  return hero;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

/**
 * Where to stay at one stop, built like the stop's own sheet: the place on
 * the map with a glass plate, its name centred under it, three tiles, then
 * only as much as the moment needs. Booked: what you need at the door; the
 * places looked at are folded away. Not yet: the places found, with one
 * tap to book, and what you were looking for in a few lines. Nothing is
 * typed into this page; each part has its own sheet.
 *
 * Until the first change the plan exists only on this screen (`createPlan`
 * in memory); the first write stores it. Opening the page and closing it
 * again leaves nothing behind.
 *
 * Everything here is planning. Nothing on this page writes to the
 * timeline; a booked place becomes a stay only when the phone is there.
 */
export default function AccommodationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  // A link from outside can be missing any of these; the hooks below run
  // before the guard further down can bail out, so they get a harmless
  // stand-in rather than `undefined`.
  const complete = !!params.stopSyncId && !!params.journeySyncId && !!params.start && !!params.end;
  const today = toYmd(new Date());
  const stopSyncId = params.stopSyncId ?? '';
  const journeySyncId = params.journeySyncId ?? '';
  const { plan, loaded, setPlan } = useAccommodation(params.stopSyncId);
  const readOnly = params.readOnly === '1';
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [othersOpen, setOthersOpen] = useState(false);

  const stop = useMemo(
    () => ({ start_date: params.start ?? today, end_date: params.end ?? today }),
    [params.start, params.end, today],
  );
  const draft = useMemo(
    () => createPlan(journeySyncId, { id: stopSyncId, ...stop }),
    [journeySyncId, stopSyncId, stop],
  );
  const view: AccommodationPlan = plan ?? draft;
  const primary = primaryOption(view);
  const booking = view.booking;
  const booked = !!booking && !!primary;
  const hero = useHeroPoint(primary ? booking?.address ?? primary.address : null, params.city ?? '', params.country ?? '', params.countryCode ?? '');

  // The first write creates the row (startAccommodation returns an existing
  // one untouched, so a second write racing the first is harmless).
  const apply: Apply = useCallback(async (work, toast) => {
    try {
      if (!plan) await startAccommodation(journeySyncId, { sync_id: stopSyncId, ...stop });
      setPlan(await work());
      if (toast) showToast(toast);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not save', 'error');
    }
  }, [plan, setPlan, journeySyncId, stopSyncId, stop]);

  const setStatusTo = (st: string) => {
    if (st !== view.status) apply(() => setAccommodationStatus(stopSyncId, st as AccommodationStatus));
  };

  const menuPick = (id: string) => {
    if (id === 'booking') {
      openBooking();
      return;
    }
    if (id !== 'remove') return;
    Alert.alert('Remove this plan?', 'Requirements, options and booking details go with it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteAccommodation(stopSyncId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
          showToast('Plan removed');
        },
      },
    ]);
  };

  // The sheets this page opens; each gets what it needs to create the plan
  // if there is none yet.
  const sheet = { stopSyncId, journeySyncId, start: params.start, end: params.end, countryCode: params.countryCode, city: params.city };
  const go = (pathname: string, extra: Record<string, string> = {}) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname, params: { ...sheet, ...extra } } as any);
  };
  const openRequirements = () => go('/(tabs)/(plans)/stay-requirements');
  const openOption = (o: AccommodationOption) => go('/(tabs)/(plans)/stay-option', { optionId: o.id, ...(readOnly && { readOnly: '1' }) });
  const addOption = () => go('/(tabs)/(plans)/stay-option-edit');
  const openBooking = (o?: AccommodationOption) => go('/(tabs)/(plans)/stay-booking', o ? { optionId: o.id } : {});

  if (!complete) return <MissingRoute title="Stay" message="This stay is no longer here." />;
  if (!loaded) return <Stack.Screen options={{ title: `Stay in ${params.city}` }} />;

  const req = view.requirements;
  const nights = nightsBetween(view.check_in, view.check_out);
  const others = sortOptions(view.options.filter((o) => o.id !== primary?.id), sortBy);
  const choices = plan && !readOnly ? statusChoices(view) : [];
  const datesDiffer = !staysMatchStop(view, stop);
  const stopStay = defaultStay(stop);
  const stopNights = nightsBetween(stopStay.check_in, stopStay.check_out);
  const reqLines = describeRequirements(req);
  const address = booking?.address ?? primary?.address ?? null;

  // The title under the map: the place once there is one, the city before.
  const title = primary ? primary.name : params.city;
  const subtitle = primary
    ? [primary.platform, address].filter(Boolean).join(' · ')
    : `${params.country} · ${nights} ${nights === 1 ? 'night' : 'nights'}`;

  // The third tile: what this stay costs, as far as that is known.
  const nightly = primary ? optionNightlyPrice(primary) : null;
  const money = booking && booking.price !== null && booking.currency
    ? { label: 'Paid', value: String(booking.price), unit: booking.currency }
    : primary && nightly !== null && primary.currency
      ? { label: 'Per night', value: String(nightly), unit: primary.currency }
      : req.budget_per_night !== null && req.currency
        ? { label: 'Budget', value: String(req.budget_per_night), unit: `${req.currency}/night` }
        : { label: 'Budget', value: 'Open' };

  // The booking, one row each; only what is filled in. The address is on
  // the map and in Directions, what was paid is in the tile. A long check-in
  // note is a paragraph, not a right-aligned column.
  const bookingRows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [];
  if (booking?.booking_reference) bookingRows.push({ icon: 'receipt-outline', label: 'Reference', value: booking.booking_reference });
  if (booking?.check_in_info) bookingRows.push({ icon: 'log-in-outline', label: 'Check-in', value: booking.check_in_info });
  if (booking?.check_out_info) bookingRows.push({ icon: 'log-out-outline', label: 'Check-out', value: booking.check_out_info });
  if (booking?.provider_contact) bookingRows.push({ icon: 'call-outline', label: 'Contact', value: booking.provider_contact });
  const long = (v: string) => v.length > 28;

  const optionRow = (o: AccommodationOption) => (
    <LinkCard
      key={o.id}
      icon="bed-outline"
      title={o.name}
      sub={optionLine(o) || o.address || undefined}
      right={o.score !== null ? <StatusChip label={String(o.score)} /> : undefined}
      onPress={() => openOption(o)}
    />
  );
  const sortControl = others.length > 1 ? (
    <Dropdown right title="Sort by" value={sortBy} options={(['score', 'price', 'rating'] as SortKey[]).map((k) => ({ id: k, label: SORT_LABELS[k] }))} onPick={(id) => { Haptics.selectionAsync(); setSortBy(id as SortKey); }}>
      <SectionControl label={SORT_LABELS[sortBy]} menu />
    </Dropdown>
  ) : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          title: `Stay in ${params.city}`,
          // The menu: the booking's form once there is one, and the way out.
          // Whether a place is needed at all stays an agent's call.
          headerRight: plan && !readOnly
            ? () => (
                <Dropdown
                  right
                  options={[
                    ...(booked ? [{ id: 'booking', label: 'Edit booking', icon: 'square.and.pencil' }] : []),
                    { id: 'remove', label: 'Remove this plan', icon: 'trash', destructive: true },
                  ]}
                  onPick={menuPick}
                >
                  <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
                </Dropdown>
              )
            : undefined,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {!view.needed ? (
          <View style={styles.section}>
            <DetailCard>
              <DetailRow icon="bed-outline" label="Place" value="None needed at this stop" />
            </DetailCard>
            {!readOnly && (
              <TouchableOpacity onPress={() => apply(() => updateAccommodation(stopSyncId, { needed: true }))} activeOpacity={0.5} style={styles.textAction}>
                <Text style={styles.textActionLabel}>Need a place here</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Hero map, as on the stop's sheet: the place once there is one, the city before. */}
            <View style={styles.mapContainer}>
              {hero && <PlaceMap latitude={hero.point.latitude} longitude={hero.point.longitude} delta={hero.span} lift={0} style={StyleSheet.absoluteFill} />}
              <GlassCard {...glassProps} style={[styles.mapOverlay, !hasGlass && styles.mapOverlayFallback]}>
                {primary ? <Ionicons name="bed-outline" size={22} color={Colors.text} /> : <Flag code={params.countryCode} size={28} />}
              </GlassCard>
            </View>

            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            {/* Three facts, as under the title of a stop's sheet. */}
            <StatRow style={styles.statsRow}>
              <StatTile
                label="Status"
                value={TILE_STATUS[view.status]}
                options={choices.length ? choices.map((c) => ({ id: c.status, label: c.label, icon: c.icon, destructive: c.status === 'cancelled' })) : undefined}
                menuTitle="Moves on its own as you add places and book one"
                onPick={choices.length ? setStatusTo : undefined}
              />
              <StatTile label="Nights" value={`${nights}`} unit={fmtRange(view.check_in, view.check_out)} />
              <StatTile label={money.label} value={money.value} unit={money.unit} />
            </StatRow>

            {datesDiffer && (
              <Text style={styles.note}>
                The stop runs {fmtRange(params.start, params.end)}, {stopNights} {stopNights === 1 ? 'night' : 'nights'}.
                {!readOnly && (
                  <Text style={styles.noteLink} onPress={() => apply(() => updateAccommodation(stopSyncId, stopStay), 'Dates updated')}> Match the dates</Text>
                )}
              </Text>
            )}

            {booked ? (
              <>
                {/* Booked: what you need at the door. Everything else is history. */}
                <Section title="Booking">
                  {bookingRows.length > 0 || booking!.notes ? (
                    <DetailCard>
                      {bookingRows.map((r, i) => (
                        <View key={r.label}>
                          {i > 0 && <DetailSeparator />}
                          {long(r.value) ? <DetailNotes icon={r.icon} label={r.label} text={r.value} /> : <DetailRow icon={r.icon} label={r.label} value={r.value} />}
                        </View>
                      ))}
                      {booking!.notes ? (
                        <>
                          {bookingRows.length > 0 && <DetailSeparator />}
                          <DetailNotes text={booking!.notes} />
                        </>
                      ) : null}
                    </DetailCard>
                  ) : null}
                  {booking!.booking_url ? (
                    <LinkCard icon="receipt-outline" title="Open the reservation" sub={booking!.booking_url.replace(/^https?:\/\/(www\.)?/, '')} onPress={() => Linking.openURL(booking!.booking_url!)} />
                  ) : null}
                  {address ? (
                    <LinkCard icon="navigate-outline" title="Directions" sub={address} onPress={() => Linking.openURL(mapsUrl(address))} />
                  ) : null}
                  <LinkCard icon="bed-outline" title="The listing" sub={optionLine(primary!) || 'Price, rating, notes'} onPress={() => openOption(primary!)} />
                </Section>

                {others.length > 0 && (
                  <Section
                    title={others.length === 1 ? 'Also looked at 1 place' : `Also looked at ${others.length} places`}
                    right={<SectionControl label={othersOpen ? 'Hide' : 'Show'} onPress={() => { Haptics.selectionAsync(); animate(); setOthersOpen((v) => !v); }} />}
                  >
                    {othersOpen && others.map(optionRow)}
                  </Section>
                )}
              </>
            ) : (
              <>
                {/* Not booked yet: the places found come first, one tap from booking. */}
                {primary && (
                  <Section title="Picked">
                    {!readOnly && <SlotCard icon="receipt-outline" title="Book it" sub="Save the reference and how to get in" onPress={() => openBooking(primary)} />}
                    <LinkCard icon="bed-outline" title="The listing" sub={optionLine(primary) || 'Price, rating, notes'} onPress={() => openOption(primary)} />
                  </Section>
                )}

                {(others.length > 0 || !readOnly) && (
                  <Section
                    title={primary ? (others.length === 1 ? '1 other place' : `${others.length} other places`) : others.length ? `${others.length} ${others.length === 1 ? 'place found' : 'places found'}` : 'Places'}
                    right={sortControl}
                  >
                    {others.map(optionRow)}
                    {!readOnly && (
                      <SlotCard icon="add" title="Add a place" sub={view.options.length ? 'One more to compare' : 'A hotel, a flat, anything you found'} onPress={addOption} />
                    )}
                  </Section>
                )}

                {(reqLines.length > 0 || !readOnly) && (
                  <Section title="Looking for" right={reqLines.length > 0 && !readOnly ? <SectionControl label="Edit" onPress={openRequirements} /> : undefined}>
                    {reqLines.length > 0 ? (
                      <DetailCard>
                        <View style={styles.lines}>
                          {reqLines.map((line, i) => (
                            <Text key={i} selectable style={i === 0 ? styles.lineHead : styles.line}>{line}</Text>
                          ))}
                        </View>
                      </DetailCard>
                    ) : (
                      <SlotCard icon="search-outline" title="Say what you need" sub="Budget, area, a desk, quiet at night" onPress={openRequirements} />
                    )}
                  </Section>
                )}
              </>
            )}

            {view.notes ? (
              <Section title="Notes">
                <DetailCard>
                  <Text selectable style={styles.notesText}>{view.notes}</Text>
                </DetailCard>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

/** A part of the stay under a grey heading, as the sections of a stop's sheet. */
function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHead title={title} right={right} />
      {children}
    </View>
  );
}

// Same measures as the stop's sheet (stop-info.tsx).
const styles = StyleSheet.create({
  content: { paddingBottom: 120 },
  mapContainer: {
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 16,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
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
  header: { alignItems: 'center', paddingTop: 20, paddingBottom: 4, paddingHorizontal: 24, gap: 2 },
  title: { ...Typography.displayMedium, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtitle: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  statsRow: { marginHorizontal: 16, marginTop: 20 },
  section: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  note: { ...Typography.bodySmall, color: Colors.textSecondary, marginHorizontal: 20, marginTop: 10, lineHeight: 18 },
  noteLink: { fontWeight: '600', color: Colors.text },
  notesText: { ...Typography.bodySmall, fontSize: 14, lineHeight: 20 },
  lines: { gap: 4 },
  lineHead: { ...Typography.titleSmall, fontWeight: '600' },
  line: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  textAction: { alignSelf: 'center', paddingVertical: 10 },
  textActionLabel: { ...Typography.bodyMedium, fontWeight: '600' },
});
