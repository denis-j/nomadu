import { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, LayoutAnimation, Linking, PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, SectionLabel } from '../../../components/visaForm';
import {
  DisclosureRow,
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
  ACCOMMODATION_STATUSES,
  STATUS_LABELS,
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
} from '../../../lib/accommodationModel';
import { parseDate } from '../../../lib/database';
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

const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * Where to stay at one stop, on one page. Top to bottom it follows the
 * order things happen in: what it should be like, what was found, which
 * one, the booking, notes. Nothing opens a second screen; a field is
 * edited where it is shown and saved when it is left, so the page reads
 * like a card that happens to be editable.
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
  const { plan, loaded, setPlan } = useAccommodation(params.stopSyncId);
  const readOnly = params.readOnly === '1';

  const stop = useMemo(() => ({ start_date: params.start, end_date: params.end }), [params.start, params.end]);
  const draft = useMemo(
    () => createPlan(params.journeySyncId, { id: params.stopSyncId, ...stop }),
    [params.journeySyncId, params.stopSyncId, stop],
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

  const pickStatus = () => {
    Haptics.selectionAsync();
    const options = [...ACCOMMODATION_STATUSES.map((st) => STATUS_LABELS[st]), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Status', options, cancelButtonIndex: options.length - 1 },
      (i) => {
        const st = ACCOMMODATION_STATUSES[i];
        if (st && st !== view.status) apply(() => setAccommodationStatus(params.stopSyncId, st));
      },
    );
  };

  const menu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [view.needed ? 'No place needed here' : 'Need a place here', 'Remove this plan', 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (i) => {
        if (i === 0) apply(() => updateAccommodation(params.stopSyncId, { needed: !view.needed }));
        if (i !== 1) return;
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
      },
    );
  };

  const nights = nightsBetween(view.check_in, view.check_out);
  const datesDiffer = !staysMatchStop(view, stop);

  if (!loaded) return <Stack.Screen options={{ title: `Stay in ${params.city}` }} />;

  if (readOnly) return <ReadOnlyStay plan={plan} city={params.city} />;

  return (
    <>
      <Stack.Screen
        options={{
          title: `Stay in ${params.city}`,
          headerRight: plan
            ? () => (
                <Pressable onPress={menu} hitSlop={10} accessibilityLabel="More">
                  <Ionicons name="ellipsis-horizontal-circle" size={24} color={Colors.text} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.header}>
          <Text style={styles.dates}>
            {fmtShort(view.check_in)} – {fmtShort(view.check_out)} · {nights} {nights === 1 ? 'night' : 'nights'}
          </Text>
          <StatusBadge status={view.status} onPress={pickStatus} />
        </View>

        {datesDiffer && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>The stop is now {fmtShort(params.start)} – {fmtShort(params.end)}.</Text>
            <Pressable
              onPress={() => apply(() => updateAccommodation(params.stopSyncId, defaultStay(stop)), 'Dates updated')}
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.actionText}>Use these dates</Text>
            </Pressable>
          </View>
        )}

        {!view.needed ? (
          <Card>
            <View style={styles.noPlace}>
              <Text style={styles.noPlaceText}>No place needed here</Text>
              <Pressable onPress={() => apply(() => updateAccommodation(params.stopSyncId, { needed: true }))} style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}>
                <Text style={styles.actionText}>Need one</Text>
              </Pressable>
            </View>
          </Card>
        ) : (
          <>
            {/* Keyed by stop: a page reused for another stop must not keep what was folded open. */}
            <RequirementsSection key={`r${params.stopSyncId}`} plan={view} apply={apply} stopId={params.stopSyncId} />
            <OptionsSection key={`o${params.stopSyncId}`} plan={view} apply={apply} stopId={params.stopSyncId} />
            {(view.options.length > 0 || view.booking) && <BookingSection key={`b${params.stopSyncId}`} plan={view} apply={apply} stopId={params.stopSyncId} />}
          </>
        )}

        <SectionLabel>Notes</SectionLabel>
        <Card>
          <TextArea
            value={view.notes ?? ''}
            onCommit={(v) => apply(() => setAccommodationNotes(params.stopSyncId, v.trim() || null))}
            placeholder="Anything to remember about staying here"
            last
          />
        </Card>
      </ScrollView>
    </>
  );
}

// ─── A friend's plan ─────────────────────────────────────────────────────────

/** The same page with nothing to touch: where the friend sleeps, as they planned it. */
function ReadOnlyStay({ plan, city }: { plan: LocalAccommodation | null; city: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const nights = plan ? nightsBetween(plan.check_in, plan.check_out) : 0;
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
            <View style={styles.header}>
              <Text style={styles.dates}>
                {fmtShort(plan.check_in)} – {fmtShort(plan.check_out)} · {nights} {nights === 1 ? 'night' : 'nights'}
              </Text>
              <StatusBadge status={plan.status} />
            </View>

            <SectionLabel>Looking for</SectionLabel>
            <Card>
              <View style={styles.readBlock}>
                {describeRequirements(plan.requirements, plan).map((line, i) => (
                  <Text key={i} style={i === 0 ? styles.readTitle : styles.readLine}>{line}</Text>
                ))}
                {plan.requirements.notes ? <Text style={styles.readLine}>{plan.requirements.notes}</Text> : null}
              </View>
            </Card>

            {plan.options.length > 0 && (
              <>
                <SectionLabel>{`${plan.options.length} ${plan.options.length === 1 ? 'option' : 'options'}`}</SectionLabel>
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
              </>
            )}

            {b && (
              <>
                <SectionLabel>Booking</SectionLabel>
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
              </>
            )}

            {plan.notes ? (
              <>
                <SectionLabel>Notes</SectionLabel>
                <Card>
                  <Text style={[styles.readLine, styles.readBlock]} selectable>{plan.notes}</Text>
                </Card>
              </>
            ) : null}
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

function RequirementsSection({ plan, apply, stopId }: { plan: AccommodationPlan; apply: Apply; stopId: string }) {
  const req = plan.requirements;
  const setReq = (patch: Record<string, unknown>) => apply(() => updateAccommodation(stopId, { requirements: patch }));

  const commitBudget = (amount: string, currency: string) => {
    if (amount.trim() && !currency.trim()) {
      showToast('Add a currency next to the budget, like EUR', 'error');
      return;
    }
    setReq({ budget_per_night: parseAmount(amount), currency: currency.trim() || null });
  };

  const summary = describeRequirements(req, plan);
  const blank = !req.type && req.budget_per_night === null && req.budget_total === null && req.amenities.length === 0
    && req.areas.length === 0 && !req.work_requirements && !req.min_requirements && !req.notes;
  // Open for the first visit, folded to a summary once something is in it.
  const [open, setOpen] = useState(blank);

  // What an agent filed as separate fields. Read here, written through the API.
  const filed = [
    req.type ? TYPE_LABELS[req.type] : null,
    req.amenities.length ? req.amenities.map(amenityLabel).join(', ') : null,
    req.areas.length ? `In ${req.areas.join(', ')}` : null,
    req.work_requirements,
    req.min_requirements,
    req.dates_flexible ? 'Flexible dates' : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <SectionLabel>What you need</SectionLabel>
      <Card>
        <DisclosureRow
          title={open ? 'What to look for' : blank ? 'Budget, and what matters' : summary[0]}
          lines={open || blank ? undefined : summary.slice(1, 3)}
          open={open}
          onPress={() => { animate(); setOpen(!open); }}
          last={!open}
        />
        {open && (
          <>
            <MoneyRow label="Budget per night" amount={amountText(req.budget_per_night)} currency={req.currency ?? ''} onCommit={commitBudget} />
            <TextArea
              value={req.notes ?? ''}
              onCommit={(v) => setReq({ notes: v.trim() || null })}
              placeholder="Hotel or apartment near Asok, fast wifi, a desk, quiet at night"
              last={!filed}
            />
            {filed ? <Text style={styles.filed}>{filed}</Text> : null}
          </>
        )}
      </Card>
    </>
  );
}

// ─── Options ─────────────────────────────────────────────────────────────────

function OptionsSection({ plan, apply, stopId }: { plan: AccommodationPlan; apply: Apply; stopId: string }) {
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Sorting is the comparison: the best by the chosen key is simply first.
  const sorted = useMemo(() => sortOptions(plan.options, sortBy), [plan.options, sortBy]);
  const count = plan.options.length;

  return (
    <>
      <View style={styles.sectionHead}>
        <SectionLabel>{count ? `${count} ${count === 1 ? 'option' : 'options'}` : 'Options'}</SectionLabel>
        {count > 1 && (
          <View style={styles.sortRow}>
            {(['score', 'price', 'rating'] as SortKey[]).map((k) => (
              <Pressable key={k} onPress={() => { Haptics.selectionAsync(); setSortBy(k); }} hitSlop={6}>
                <Text style={[styles.sortKey, sortBy === k && styles.sortKeyActive]}>{k === 'score' ? 'Score' : k === 'price' ? 'Price' : 'Rating'}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {sorted.map((o) => (
        <OptionItem
          key={o.id}
          option={o}
          plan={plan}
          apply={apply}
          stopId={stopId}
          expanded={expanded === o.id}
          onToggle={() => { animate(); setExpanded(expanded === o.id ? null : o.id); }}
        />
      ))}

      <Card>
        <DisclosureRow
          title="Add a place"
          open={adding}
          onPress={() => { animate(); setAdding(!adding); }}
          last={!adding}
        />
        {adding && (
          <AddOptionForm
            currency={plan.requirements.currency ?? plan.options[0]?.currency ?? ''}
            onAdd={async (input) => {
              await apply(() => addAccommodationOption(stopId, input), 'Option added');
              animate();
              setAdding(false);
            }}
          />
        )}
      </Card>
    </>
  );
}

function AddOptionForm({ currency: initialCurrency, onAdd }: { currency: string; onAdd: (input: Record<string, unknown>) => Promise<void> }) {
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
      <MoneyRow label="Per night" amount={perNight} currency={currency} onCommit={(a, c) => { setPerNight(a); setCurrency(c); }} live />
      <Pressable onPress={add} style={({ pressed }) => [styles.inlineButton, pressed && { opacity: 0.6 }]}>
        <Ionicons name="add" size={18} color={Colors.text} />
        <Text style={styles.inlineButtonText}>Add</Text>
      </Pressable>
    </>
  );
}

function OptionItem({
  option: o,
  plan,
  apply,
  stopId,
  expanded,
  onToggle,
  readOnly = false,
}: {
  option: AccommodationOption;
  plan: AccommodationPlan;
  apply: Apply;
  stopId: string;
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
          <View style={styles.optionTitle}>
            <Text style={styles.optionName} numberOfLines={expanded ? undefined : 1}>{o.name}</Text>
            {line ? <Text style={styles.optionSub} numberOfLines={1}>{line}</Text> : null}
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
              <MoneyRow label="Per night" amount={amountText(o.price_per_night)} currency={o.currency ?? ''} onCommit={commitMoney('price_per_night')} />
              <MoneyRow label="Total" amount={amountText(o.total_price)} currency={o.currency ?? ''} onCommit={commitMoney('total_price')} />
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

function BookingSection({ plan, apply, stopId }: { plan: AccommodationPlan; apply: Apply; stopId: string }) {
  const [open, setOpen] = useState(false);
  const b = plan.booking;
  const primary = plan.options.find((o) => o.id === (b?.option_id ?? plan.selected_option_id)) ?? null;
  const showForm = !!b || open;
  const afterStay = plan.status === 'checked_in' || plan.status === 'completed' || (b?.review_rating ?? null) !== null;

  const set = (patch: Record<string, unknown>) => apply(() => saveAccommodationBooking(stopId, patch));
  const commitMoney = (field: 'price', currencyField: 'currency') => (amount: string, currency: string) => {
    if (amount.trim() && !currency.trim()) {
      showToast('Add a currency next to the amount, like EUR', 'error');
      return;
    }
    set({ [field]: parseAmount(amount), [currencyField]: currency.trim() || null });
  };

  return (
    <>
      <SectionLabel>Booking</SectionLabel>
      <Card>
        {!showForm && (
          <DisclosureRow
            title="Add booking details"
            open={false}
            onPress={() => { animate(); setOpen(true); }}
            last
          />
        )}
        {showForm && (
          <>
            {primary && (
              <View style={styles.bookingPlace}>
                <Ionicons name="bed-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.bookingPlaceText} numberOfLines={1}>{primary.name}</Text>
              </View>
            )}
            <TextRow label="Reference" value={b?.booking_reference ?? ''} onCommit={(v) => set({ booking_reference: v || null })} placeholder="Confirmation number" autoCapitalize="characters" />
            <MoneyRow label="Paid" amount={amountText(b?.price ?? null)} currency={b?.currency ?? primary?.currency ?? ''} onCommit={commitMoney('price', 'currency')} />
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
          </>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  dates: { ...Typography.body, color: PlatformColor('secondaryLabel'), fontVariant: ['tabular-nums'] },
  noPlace: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  noPlaceText: { ...Typography.titleSmall, fontWeight: '500' },

  warn: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  warnText: { ...Typography.bodySmall, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  filed: { ...Typography.bodySmall, color: Colors.textSecondary, paddingBottom: 14, marginTop: -6 },

  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sortRow: { flexDirection: 'row', gap: 12, paddingBottom: 1 },
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
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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

  inlineButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14 },
  inlineButtonText: { ...Typography.titleSmall, fontWeight: '600' },

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
