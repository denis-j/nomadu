import { useCallback, useMemo, useState } from 'react';
import { Alert, LayoutAnimation, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Card } from '../../../components/visaForm';
import { Dropdown } from '../../../components/Dropdown';
import { Flag } from '../../../components/Flag';
import { MissingRoute } from '../../../components/MissingRoute';
import {
  MoneyRow,
  StatusBadge,
  TextArea,
  TextRow,
  amountText,
  describeRequirements,
  parseAmount,
  parseRating,
  ratingText,
} from '../../../components/accommodationForm';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useAccommodation } from '../../../hooks/useAccommodations';
import {
  addAccommodationOption,
  deleteAccommodation,
  removeAccommodationOption,
  saveAccommodationBooking,
  selectAccommodationOption,
  setAccommodationNotes,
  setAccommodationStatus,
  startAccommodation,
  updateAccommodation,
  updateAccommodationOption,
  type LocalAccommodation,
} from '../../../lib/accommodations';
import {
  TYPE_LABELS,
  amenityLabel,
  createPlan,
  defaultStay,
  formatMoney,
  nightsBetween,
  optionNightlyPrice,
  sortOptions,
  staysMatchStop,
  type AccommodationOption,
  type AccommodationPlan,
  type AccommodationStatus,
} from '../../../lib/accommodationModel';
import { currencyForCountry } from '../../../lib/currencies';
import { parseDate } from '../../../lib/database';
import { toYmd } from '../../../lib/days';
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

/** Every write on this page: run it, keep the result, say when it failed. */
type Apply = (work: () => Promise<LocalAccommodation>, toast?: string) => Promise<void>;

const fmtShort = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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

/** "Nov 10 – 13" inside a month, "Nov 28 – Dec 2" across one, as on the itinerary. */
function fmtRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) return `${fmtShort(start)} – ${e.getDate()}`;
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}

const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * Where to stay at one stop, on one page, drawn like the itinerary it
 * belongs to: the stop's own card on top, then the stay in the order
 * things happen, each part under a plain heading like the wallet's. Looking
 * for, options, booking, notes. Nothing opens a second screen; a field is
 * edited where it is shown and saved when it is left.
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
  // stand-in rather than `undefined`, which used to take the screen down
  // inside fromYmd.
  const complete = !!params.stopSyncId && !!params.journeySyncId && !!params.start && !!params.end;
  const today = toYmd(new Date());
  const stopSyncId = params.stopSyncId ?? '';
  const journeySyncId = params.journeySyncId ?? '';
  const { plan, loaded, setPlan } = useAccommodation(params.stopSyncId);
  const readOnly = params.readOnly === '1';

  const stop = useMemo(
    () => ({ start_date: params.start ?? today, end_date: params.end ?? today }),
    [params.start, params.end, today],
  );
  const draft = useMemo(
    () => createPlan(journeySyncId, { id: stopSyncId, ...stop }),
    [journeySyncId, stopSyncId, stop],
  );
  const view: AccommodationPlan = plan ?? draft;

  // The first write creates the row (startAccommodation returns an existing
  // one untouched, so a second write racing the first is harmless).
  const apply: Apply = useCallback(async (work, toast) => {
    try {
      if (!plan) await startAccommodation(params.journeySyncId, { sync_id: params.stopSyncId, ...stop });
      setPlan(await work());
      if (toast) showToast(toast);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not save', 'error');
    }
  }, [plan, setPlan, params.journeySyncId, params.stopSyncId, stop]);

  // Prices at this stop are in its country's currency unless the plan
  // already says otherwise.
  const currency = view.requirements.currency ?? view.options[0]?.currency ?? currencyForCountry(params.countryCode) ?? 'EUR';

  // The status moves on its own (options, a pick, a booking); the badge's
  // menu offers only what the data cannot know by itself.
  const setStatusTo = (st: AccommodationStatus) => {
    if (st !== view.status) apply(() => setAccommodationStatus(params.stopSyncId, st));
  };

  const menuPick = (id: string) => {
    if (id === 'needed') apply(() => updateAccommodation(params.stopSyncId, { needed: !view.needed }));
    if (id !== 'remove') return;
    Alert.alert('Remove this plan?', 'Requirements, options and booking details go with it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteAccommodation(params.stopSyncId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
          showToast('Plan removed');
        },
      },
    ]);
  };

  const datesDiffer = !staysMatchStop(view, stop);
  const stopStay = defaultStay(stop);
  const stopNights = nightsBetween(stopStay.check_in, stopStay.check_out);

  if (!complete) return <MissingRoute title="Stay" message="This stay is no longer here." />;

  if (!loaded) return <Stack.Screen options={{ title: `Stay in ${params.city}` }} />;

  if (readOnly) return <ReadOnlyStay plan={plan} city={params.city} country={params.country} countryCode={params.countryCode} />;

  return (
    <>
      <Stack.Screen
        options={{
          title: `Stay in ${params.city}`,
          headerRight: plan
            ? () => (
                <Dropdown
                  right
                  options={[
                    { id: 'needed', label: view.needed ? 'No place needed here' : 'Need a place here', icon: view.needed ? 'bed.double' : 'bed.double.fill' },
                    { id: 'remove', label: 'Remove this plan', icon: 'trash', destructive: true },
                  ]}
                  onPick={menuPick}
                >
                  <Ionicons name="ellipsis-horizontal-circle" size={24} color={Colors.text} />
                </Dropdown>
              )
            : undefined,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <StopCard
          city={params.city}
          country={params.country}
          countryCode={params.countryCode}
          plan={view}
          onStatus={plan && view.needed ? setStatusTo : undefined}
        />

        {datesDiffer && view.needed && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              The stop runs {fmtRange(params.start, params.end)}, {stopNights} {stopNights === 1 ? 'night' : 'nights'}.
            </Text>
            <Pressable
              onPress={() => apply(() => updateAccommodation(params.stopSyncId, stopStay), 'Dates updated')}
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.actionText}>Match</Text>
            </Pressable>
          </View>
        )}

        {!view.needed ? (
          <View style={styles.noPlace}>
            <Text style={styles.noPlaceText}>No place needed here</Text>
            <Pressable onPress={() => apply(() => updateAccommodation(params.stopSyncId, { needed: true }))} style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}>
              <Text style={styles.actionText}>Need one</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Keyed by stop: a page reused for another stop must not keep what was folded open. */}
            <RequirementsSection key={`r${params.stopSyncId}`} plan={view} apply={apply} stopId={params.stopSyncId} currency={currency} />
            <OptionsSection key={`o${params.stopSyncId}`} plan={view} apply={apply} stopId={params.stopSyncId} currency={currency} />
            <BookingSection key={`b${params.stopSyncId}`} plan={view} apply={apply} stopId={params.stopSyncId} currency={currency} />
            <Section title="Notes">
              <Card>
                <TextArea
                  value={view.notes ?? ''}
                  onCommit={(v) => apply(() => setAccommodationNotes(params.stopSyncId, v.trim() || null))}
                  placeholder="Anything to remember about staying here"
                  last
                />
              </Card>
            </Section>
          </>
        )}
      </ScrollView>
    </>
  );
}

// ─── The stop, and the spine ─────────────────────────────────────────────────

/** The stop as it is on the itinerary: flag, city, country, the stay's dates, the status where the days badge sits. */
function StopCard({
  city,
  country,
  countryCode,
  plan,
  onStatus,
}: {
  city: string;
  country: string;
  countryCode: string;
  plan: AccommodationPlan;
  onStatus?: (status: AccommodationStatus) => void;
}) {
  const nights = nightsBetween(plan.check_in, plan.check_out);
  const choices = onStatus ? statusChoices(plan) : [];
  const badge = <StatusBadge status={plan.status} size="small" onPress={onStatus && choices.length ? () => {} : undefined} />;
  return (
    <Glass {...glassProps} style={[styles.stopCard, !hasGlass && styles.stopCardFallback]}>
      <Flag code={countryCode} size={28} style={styles.stopFlag} />
      <View style={styles.stopCenter}>
        <Text style={styles.stopCity}>{city}</Text>
        <Text style={styles.stopCountry}>{country}</Text>
        <Text style={styles.stopDates}>
          {fmtRange(plan.check_in, plan.check_out)} · {nights} {nights === 1 ? 'night' : 'nights'}
        </Text>
      </View>
      <View style={styles.stopRight}>
        {!plan.needed ? null : onStatus && choices.length ? (
          <Dropdown
            title="Moves on its own as you add places, pick one and save the booking"
            options={choices.map((c) => ({ id: c.status, label: c.label, icon: c.icon, destructive: c.status === 'cancelled' }))}
            right
            onPick={(id) => onStatus(id as AccommodationStatus)}
          >
            {badge}
          </Dropdown>
        ) : badge}
      </View>
    </Glass>
  );
}

/** A part of the stay under a heading like the wallet's, with room for the sort keys on the right. */
function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

// ─── A friend's plan ─────────────────────────────────────────────────────────

/** The same page with nothing to touch: where the friend sleeps, as they planned it. */
function ReadOnlyStay({ plan, city, country, countryCode }: { plan: LocalAccommodation | null; city: string; country: string; countryCode: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const b = plan?.booking ?? null;
  const primary = plan ? plan.options.find((o) => o.id === (b?.option_id ?? plan.selected_option_id)) ?? null : null;
  const noop: Apply = async () => {};
  return (
    <>
      <Stack.Screen options={{ title: `Stay in ${city}` }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {!plan || !plan.needed ? (
          <Text style={styles.readEmpty}>{plan ? 'No place needed here.' : 'Nothing planned here yet.'}</Text>
        ) : (
          <>
            <StopCard city={city} country={country} countryCode={countryCode} plan={plan} />

            <>
              <Section title="Looking for">
                <Card>
                  <View style={styles.readBlock}>
                    {describeRequirements(plan.requirements, plan).map((line, i) => (
                      <Text key={i} style={i === 0 ? styles.readTitle : styles.readLine}>{line}</Text>
                    ))}
                    {plan.requirements.notes ? <Text style={styles.readLine}>{plan.requirements.notes}</Text> : null}
                  </View>
                </Card>
              </Section>

              {plan.options.length > 0 && (
                <Section title={`${plan.options.length} ${plan.options.length === 1 ? 'option' : 'options'}`}>
                  {sortOptions(plan.options, 'score').map((o) => (
                    <OptionItem
                      key={o.id}
                      option={o}
                      plan={plan}
                      apply={noop}
                      stopId={plan.id}
                      expanded={expanded === o.id}
                      onToggle={() => { animate(); setExpanded(expanded === o.id ? null : o.id); }}
                      readOnly
                    />
                  ))}
                </Section>
              )}

              {b && (
                <Section title="Booking">
                  <Card>
                    {primary && <ReadRow label="Place" value={primary.name} />}
                    {b.booking_reference ? <ReadRow label="Reference" value={b.booking_reference} /> : null}
                    {formatMoney(b.price, b.currency) ? <ReadRow label="Paid" value={formatMoney(b.price, b.currency)!} /> : null}
                    {b.address ? <ReadRow label="Address" value={b.address} /> : null}
                    {b.check_in_info ? <ReadRow label="Check-in" value={b.check_in_info} /> : null}
                    {b.check_out_info ? <ReadRow label="Check-out" value={b.check_out_info} /> : null}
                    {b.provider_contact ? <ReadRow label="Contact" value={b.provider_contact} /> : null}
                    {b.booking_url ? (
                      <Pressable onPress={() => Linking.openURL(b.booking_url!)} style={styles.readLink}>
                        <Text style={styles.actionText}>Open the reservation</Text>
                      </Pressable>
                    ) : null}
                  </Card>
                </Section>
              )}

              {plan.notes ? (
                <Section title="Notes">
                  <Card>
                    <Text style={[styles.readLine, styles.readBlock]} selectable>{plan.notes}</Text>
                  </Card>
                </Section>
              ) : null}
            </>
          </>
        )}
      </ScrollView>
    </>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readRow}>
      <Text style={styles.readRowLabel}>{label}</Text>
      <Text style={styles.readRowValue} selectable>{value}</Text>
    </View>
  );
}

// ─── What you need ───────────────────────────────────────────────────────────

function RequirementsSection({ plan, apply, stopId, currency }: { plan: AccommodationPlan; apply: Apply; stopId: string; currency: string }) {
  const req = plan.requirements;
  const setReq = (patch: Record<string, unknown>) => apply(() => updateAccommodation(stopId, { requirements: patch }));

  const commitBudget = (amount: string, currency: string) => {
    if (amount.trim() && !currency.trim()) {
      showToast('Add a currency next to the budget, like EUR', 'error');
      return;
    }
    setReq({ budget_per_night: parseAmount(amount), currency: currency.trim() || null });
  };

  // What an agent filed as separate fields. Read here, written through the API.
  const filed = [
    req.type ? TYPE_LABELS[req.type] : null,
    req.amenities.length ? req.amenities.map(amenityLabel).join(', ') : null,
    req.areas.length ? `In ${req.areas.join(', ')}` : null,
    req.work_requirements,
    req.min_requirements,
    req.dates_flexible ? 'Flexible dates' : null,
  ].filter(Boolean).join(' · ');

  // Two fields, always there: the budget and what matters in words. What an
  // agent filed beyond that is read back in grey underneath.
  return (
    <Section title="Looking for">
      <Card>
        <MoneyRow label="Budget per night" amount={amountText(req.budget_per_night)} currency={req.currency ?? ''} suggested={currency} onCommit={commitBudget} />
        <TextArea
          value={req.notes ?? ''}
          onCommit={(v) => setReq({ notes: v.trim() || null })}
          placeholder="Area, wifi, a desk, quiet at night"
          last={!filed}
        />
        {filed ? <Text style={styles.filed}>{filed}</Text> : null}
      </Card>
    </Section>
  );
}

// ─── Options ─────────────────────────────────────────────────────────────────

function OptionsSection({ plan, apply, stopId, currency }: { plan: AccommodationPlan; apply: Apply; stopId: string; currency: string }) {
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Sorting is the comparison: the best by the chosen key is simply first.
  const sorted = useMemo(() => sortOptions(plan.options, sortBy), [plan.options, sortBy]);
  const count = plan.options.length;

  const sort = count > 1 ? (
    <View style={styles.sortRow}>
      {(['score', 'price', 'rating'] as SortKey[]).map((k) => (
        <Pressable key={k} onPress={() => { Haptics.selectionAsync(); setSortBy(k); }} hitSlop={6}>
          <Text style={[styles.sortKey, sortBy === k && styles.sortKeyActive]}>{k === 'score' ? 'Score' : k === 'price' ? 'Price' : 'Rating'}</Text>
        </Pressable>
      ))}
    </View>
  ) : undefined;

  return (
    <Section title={count ? `${count} ${count === 1 ? 'option' : 'options'}` : 'Options'} right={sort}>
      {sorted.map((o) => (
        <OptionItem
          key={o.id}
          option={o}
          plan={plan}
          apply={apply}
          stopId={stopId}
          currency={currency}
          expanded={expanded === o.id}
          onToggle={() => { animate(); setExpanded(expanded === o.id ? null : o.id); }}
        />
      ))}

      {/* A place that is not there yet, as a suggested stop is on the itinerary: dashed. */}
      {adding ? (
        <Card>
          <AddOptionForm
            currency={currency}
            onCancel={() => { animate(); setAdding(false); }}
            onAdd={async (input) => {
              await apply(() => addAccommodationOption(stopId, input), 'Option added');
              animate();
              setAdding(false);
            }}
          />
        </Card>
      ) : (
        <Pressable onPress={() => { Haptics.selectionAsync(); animate(); setAdding(true); }} style={({ pressed }) => [styles.slot, pressed && { opacity: 0.6 }]}>
          <View style={styles.slotIcon}>
            <Ionicons name="add" size={20} color={Colors.text} />
          </View>
          <View style={styles.optionTitle}>
            <Text style={styles.slotTitle}>Add a place</Text>
            <Text style={styles.optionSub}>{count ? 'One more to compare' : 'A hotel, a flat, anything you found'}</Text>
          </View>
        </Pressable>
      )}
    </Section>
  );
}

function AddOptionForm({ currency: initialCurrency, onAdd, onCancel }: { currency: string; onAdd: (input: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [perNight, setPerNight] = useState('');
  const [currency, setCurrency] = useState(initialCurrency);

  const add = () => {
    if (!name.trim()) {
      showToast('Give the place a name', 'error');
      return;
    }
    if (perNight.trim() && !currency.trim()) {
      showToast('Add a currency next to the price, like EUR', 'error');
      return;
    }
    onAdd({
      name,
      url: url || null,
      price_per_night: parseAmount(perNight),
      currency: currency || null,
      last_checked_at: new Date().toISOString(),
    });
  };

  return (
    <>
      <TextRow label="Name" value={name} onCommit={setName} live placeholder="Loft in Tay Ho" autoCapitalize="words" />
      <TextRow label="Link" value={url} onCommit={setUrl} live placeholder="https://" keyboardType="url" autoCapitalize="none" />
      <MoneyRow label="Per night" amount={perNight} currency={currency} suggested={initialCurrency} onCommit={(a, c) => { setPerNight(a); setCurrency(c); }} live />
      <View style={styles.inlineButtons}>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.inlineButton, pressed && { opacity: 0.6 }]}>
          <Text style={styles.inlineButtonMuted}>Cancel</Text>
        </Pressable>
        <Pressable onPress={add} style={({ pressed }) => [styles.inlineButton, pressed && { opacity: 0.6 }]}>
          <Ionicons name="add" size={18} color={Colors.text} />
          <Text style={styles.inlineButtonText}>Add</Text>
        </Pressable>
      </View>
    </>
  );
}

function OptionItem({
  option: o,
  plan,
  apply,
  stopId,
  currency: suggested,
  expanded,
  onToggle,
  readOnly = false,
}: {
  option: AccommodationOption;
  plan: AccommodationPlan;
  apply: Apply;
  stopId: string;
  currency?: string;
  expanded: boolean;
  onToggle: () => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const picked = plan.selected_option_id === o.id;
  const booked = plan.booking?.option_id === o.id;

  const nightly = optionNightlyPrice(o);
  const nights = nightsBetween(o.check_in, o.check_out);
  // One grey line under the name: where, what it costs a night, how it is rated.
  const rating = o.rating !== null ? `★ ${o.rating}${o.rating_scale === 10 ? '/10' : ''}` : null;
  const line = [
    o.platform,
    nightly !== null && o.currency ? `${formatMoney(nightly, o.currency)}/night` : null,
    rating,
  ].filter(Boolean).join(' · ');
  const detail = [
    formatMoney(o.total_price, o.currency) ? `${formatMoney(o.total_price, o.currency)} for ${nights} ${nights === 1 ? 'night' : 'nights'}` : null,
    o.fees !== null && o.fees > 0 && o.currency ? `${formatMoney(o.fees, o.currency)} fees` : null,
    o.review_count !== null ? `${o.review_count} reviews` : null,
    o.cancellation_policy,
    o.address,
  ].filter(Boolean).join(' · ');
  const tag = booked ? 'Booked' : picked ? 'Picked' : null;

  const set = (patch: Record<string, unknown>) => apply(() => updateAccommodationOption(stopId, o.id, patch));
  const commitMoney = (field: 'total_price' | 'price_per_night') => (amount: string, currency: string) => {
    if (amount.trim() && !currency.trim()) {
      showToast('Add a currency next to the price, like EUR', 'error');
      return;
    }
    set({ [field]: parseAmount(amount), currency: currency.trim() || null });
  };

  const pick = () => apply(() => selectAccommodationOption(stopId, picked ? null : o.id), picked ? undefined : `${o.name} picked`);

  const remove = () => {
    Alert.alert(`Remove ${o.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => apply(() => removeAccommodationOption(stopId, o.id), 'Option removed') },
    ]);
  };

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); if (editing) setEditing(false); onToggle(); }}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      style={({ pressed }) => pressed && !expanded && { opacity: 0.75 }}
    >
      <Glass {...glassProps} style={[styles.option, !hasGlass && styles.optionFallback, (picked || booked) && styles.optionPicked]}>
        <View style={styles.optionTop}>
          <View style={[styles.optionBubble, (picked || booked) && styles.optionBubbleOn]}>
            <Ionicons name={booked ? 'receipt-outline' : picked ? 'checkmark' : 'bed-outline'} size={18} color={picked || booked ? Colors.white : Colors.text} />
          </View>
          <View style={styles.optionTitle}>
            <Text style={styles.optionName} numberOfLines={expanded ? undefined : 1}>{o.name}</Text>
            {line ? <Text style={styles.optionSub} numberOfLines={2}>{line}</Text> : null}
          </View>
          {tag && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          )}
          {o.score !== null && (
            <View style={styles.score}>
              <Text style={styles.scoreText}>{o.score}</Text>
            </View>
          )}
        </View>

        {expanded && (
          <View style={styles.optionDetails}>
            {detail ? <Text style={styles.optionDetailText}>{detail}</Text> : null}
            {o.amenities.length > 0 && <Text style={styles.optionDetailText}>{o.amenities.map(amenityLabel).join(', ')}</Text>}
            {o.risks ? <Text style={styles.optionDetailText}>Risk: {o.risks}</Text> : null}
            {o.notes ? <Text style={styles.optionDetailText}>{o.notes}</Text> : null}
            {o.last_checked_at ? <Text style={styles.optionChecked}>Checked {new Date(o.last_checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text> : null}

            {readOnly && o.url ? (
              <Pressable onPress={() => Linking.openURL(o.url!)} style={({ pressed }) => [styles.actionButton, styles.actionSelf, pressed && { opacity: 0.7 }]}>
                <Text style={styles.actionText}>Open</Text>
              </Pressable>
            ) : null}
            {!readOnly && (
            <View style={styles.optionActions}>
              <Pressable onPress={pick} style={({ pressed }) => [styles.actionButton, picked && styles.actionButtonActive, pressed && { opacity: 0.7 }]}>
                <Text style={[styles.actionText, picked && styles.actionTextActive]}>{picked ? 'Picked' : 'Pick'}</Text>
              </Pressable>
              {o.url ? (
                <Pressable onPress={() => Linking.openURL(o.url!)} style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.actionText}>Open</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => { Haptics.selectionAsync(); animate(); setEditing(!editing); }} style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}>
                <Text style={styles.actionText}>{editing ? 'Done' : 'Edit'}</Text>
              </Pressable>
              <Pressable onPress={remove} style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]} accessibilityLabel="Remove">
                <Ionicons name="trash-outline" size={15} color={Colors.textSecondary} />
              </Pressable>
            </View>
            )}

          {editing && (
            <View style={styles.optionEditor}>
              <TextRow label="Name" value={o.name} onCommit={(v) => set({ name: v })} autoCapitalize="words" />
              <TextRow label="Link" value={o.url ?? ''} onCommit={(v) => set({ url: v || null })} placeholder="https://" keyboardType="url" autoCapitalize="none" />
              <MoneyRow label="Per night" amount={amountText(o.price_per_night)} currency={o.currency ?? ''} suggested={suggested} onCommit={commitMoney('price_per_night')} />
              <MoneyRow label="Total" amount={amountText(o.total_price)} currency={o.currency ?? ''} suggested={suggested} onCommit={commitMoney('total_price')} />
              <TextRow label="Rating" value={ratingText(o.rating, o.rating_scale)} onCommit={(v) => set(parseRating(v, o.rating_scale))} placeholder="4.8 or 8.6/10" />
              <TextRow label="Your score" value={amountText(o.score)} onCommit={(v) => set({ score: parseAmount(v) })} placeholder="out of 10" keyboardType="decimal-pad" />
              <TextArea value={o.notes ?? ''} onCommit={(v) => set({ notes: v.trim() || null })} placeholder="Notes" last />
            </View>
          )}
          </View>
        )}
      </Glass>
    </Pressable>
  );
}

// ─── Booking ─────────────────────────────────────────────────────────────────

function BookingSection({ plan, apply, stopId, currency }: { plan: AccommodationPlan; apply: Apply; stopId: string; currency: string }) {
  const b = plan.booking;
  const primary = plan.options.find((o) => o.id === (b?.option_id ?? plan.selected_option_id)) ?? null;
  const afterStay = plan.status === 'checked_in' || plan.status === 'completed' || (b?.review_rating ?? null) !== null;

  const set = (patch: Record<string, unknown>) => apply(() => saveAccommodationBooking(stopId, patch));
  const commitMoney = (field: 'price', currencyField: 'currency') => (amount: string, currency: string) => {
    if (amount.trim() && !currency.trim()) {
      showToast('Add a currency next to the amount, like EUR', 'error');
      return;
    }
    set({ [field]: parseAmount(amount), [currencyField]: currency.trim() || null });
  };

  // Until there is a place, the phase is a dashed slot that says what comes
  // first; a booking form about nothing helped nobody.
  if (!b && !primary) {
    return (
      <Section title="Booking">
        <View style={[styles.slot, styles.slotMuted]}>
          <View style={styles.slotIcon}>
            <Ionicons name="receipt-outline" size={18} color={Colors.textTertiary} />
          </View>
          <View style={styles.optionTitle}>
            <Text style={[styles.slotTitle, styles.slotTitleMuted]}>Nothing booked yet</Text>
            <Text style={styles.optionSub}>Pick a place above first</Text>
          </View>
        </View>
      </Section>
    );
  }

  return (
    <Section title="Booking">
      <Card>
        {primary && (
          <View style={styles.bookingPlace}>
            <Ionicons name="bed-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.bookingPlaceText} numberOfLines={1}>{primary.name}</Text>
          </View>
        )}
        <TextRow label="Reference" value={b?.booking_reference ?? ''} onCommit={(v) => set({ booking_reference: v || null })} placeholder="Confirmation number" autoCapitalize="characters" />
        <MoneyRow label="Paid" amount={amountText(b?.price ?? null)} currency={b?.currency ?? primary?.currency ?? ''} suggested={primary?.currency ?? currency} onCommit={commitMoney('price', 'currency')} />
        <TextRow label="Address" value={b?.address ?? primary?.address ?? ''} onCommit={(v) => set({ address: v || null })} placeholder="Street, building, floor" />
        <TextArea label="Check-in" value={b?.check_in_info ?? ''} onCommit={(v) => set({ check_in_info: v.trim() || null })} placeholder="From 15:00, lockbox code" />
        <TextRow label="Contact" value={b?.provider_contact ?? ''} onCommit={(v) => set({ provider_contact: v || null })} placeholder="Host or reception" />
        {afterStay ? (
          <>
            <TextRow label="Your rating out of 5" value={amountText(b?.review_rating ?? null)} onCommit={(v) => set({ review_rating: parseAmount(v) })} placeholder="4.5" keyboardType="decimal-pad" />
            <TextArea label="How was it" value={b?.review_text ?? ''} onCommit={(v) => set({ review_text: v.trim() || null })} placeholder="Would you stay again?" last />
          </>
        ) : (
          <TextArea label="Notes" value={b?.notes ?? ''} onCommit={(v) => set({ notes: v.trim() || null })} placeholder="Anything else" last />
        )}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  noPlace: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  noPlaceText: { ...Typography.titleSmall, fontWeight: '500' },

  // ─── The stop, as on the itinerary ───
  stopCard: {
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  stopCardFallback: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  stopFlag: { marginTop: 2 },
  stopCenter: { flex: 1, gap: 2 },
  stopCity: { ...Typography.bodyLarge, fontWeight: '700', letterSpacing: -0.2 },
  stopCountry: { ...Typography.bodySmall, color: Colors.textSecondary },
  stopDates: { ...Typography.bodySmall, color: Colors.textSecondary, fontVariant: ['tabular-nums'], marginTop: 2 },
  stopRight: { alignItems: 'flex-end', gap: 6 },

  // ─── Sections, headed like the wallet's ───
  section: { gap: 10, marginTop: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { ...Typography.titleMedium },

  // ─── Dashed slot, as a suggested stop ───
  slot: {
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  slotMuted: { opacity: 0.7 },
  slotIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotTitle: { ...Typography.titleSmall, fontWeight: '600' },
  slotTitleMuted: { color: Colors.textSecondary },

  warn: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  warnText: { ...Typography.bodySmall, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  filed: { ...Typography.bodySmall, color: Colors.textSecondary, paddingBottom: 14, marginTop: -6 },

  sortRow: { flexDirection: 'row', gap: 12, paddingBottom: 3 },
  sortKey: { ...Typography.label, color: Colors.textTertiary, fontWeight: '600' },
  sortKeyActive: { color: Colors.text },

  // Same card as a stop on the itinerary.
  option: {
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: 16,
    gap: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionFallback: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  optionPicked: { borderColor: Colors.text },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBubbleOn: { backgroundColor: Colors.text },
  optionTitle: { flex: 1, gap: 2 },
  optionName: { ...Typography.titleSmall, fontWeight: '600' },
  optionSub: { ...Typography.bodySmall, color: Colors.textSecondary },
  score: {
    backgroundColor: Colors.primary + '14',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scoreText: { ...Typography.caption, fontWeight: '700', color: Colors.primary, fontVariant: ['tabular-nums'] },
  tag: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },

  optionDetails: { gap: 6 },
  optionDetailText: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 18 },
  optionChecked: { ...Typography.caption, color: Colors.textTertiary },
  optionActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
  actionButtonActive: { backgroundColor: Colors.text },
  actionText: { ...Typography.label, fontWeight: '600' },
  actionTextActive: { color: Colors.white },
  // The rows draw their separators 20pt out to the sides, the card's own
  // padding; inside the option card there are 16, so pull them in.
  optionEditor: { paddingHorizontal: 4, marginTop: 4 },

  inlineButtons: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  inlineButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14 },
  inlineButtonText: { ...Typography.titleSmall, fontWeight: '600' },
  inlineButtonMuted: { ...Typography.titleSmall, fontWeight: '500', color: Colors.textSecondary },

  actionSelf: { alignSelf: 'flex-start', marginTop: 6 },
  readEmpty: { ...Typography.body, color: Colors.textSecondary, paddingHorizontal: 4 },
  readBlock: { paddingVertical: 14, gap: 3 },
  readTitle: { ...Typography.titleSmall, fontWeight: '600' },
  readLine: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 18 },
  readRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 13 },
  readRowLabel: { ...Typography.titleSmall, fontWeight: '500' },
  readRowValue: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textSecondary, flex: 1, textAlign: 'right' },
  readLink: { paddingVertical: 14 },
  bookingPlace: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 2 },
  bookingPlaceText: { ...Typography.bodySmall, color: Colors.textSecondary, flex: 1 },
});
