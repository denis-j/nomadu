import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import {
  STATUS_LABELS,
  TYPE_LABELS,
  amenityLabel,
  formatMoney,
  nightsBetween,
  primaryOption,
  type AccommodationPlan,
  type AccommodationRequirements,
  type AccommodationStatus,
} from '../lib/accommodationModel';

/**
 * The rows the accommodation page is built from, inside the visa form's
 * `Card`. There is no save button anywhere: every row keeps a draft while
 * it is being typed in and hands the value over (`onCommit`) when the
 * field is left, so the page reads like a card that happens to be
 * editable. While a row has focus it ignores the value coming from
 * outside, so a save of the previous row never wipes what is being typed.
 */

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * Two shades, no traffic light: black once there is a place (picked,
 * booked, stayed), grey while there is not. The app says things in black
 * and grey; colour is for the visa and tax warnings and nothing else.
 */
export function statusColor(status: AccommodationStatus): string {
  switch (status) {
    case 'selected':
    case 'booked':
    case 'checked_in':
    case 'completed':
      return Colors.text;
    default:
      return Colors.textSecondary;
  }
}

/** The status as the "8d" pill on the itinerary: grey capsule, short word. */
export function StatusBadge({ status, size = 'regular', onPress }: { status: AccommodationStatus; size?: 'regular' | 'small'; onPress?: () => void }) {
  const color = statusColor(status);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={8}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [s.badge, size === 'small' && s.badgeSmall, pressed && { opacity: 0.6 }]}
    >
      <Text style={[s.badgeText, { color }, size === 'small' && s.badgeTextSmall]}>{STATUS_LABELS[status]}</Text>
      {onPress && <Ionicons name="chevron-down" size={11} color={Colors.textTertiary} />}
    </Pressable>
  );
}

/** "Booked · Loft in Tay Ho", "3 options", "Needs a place": the itinerary chip. */
export function planChipText(plan: AccommodationPlan): string {
  if (!plan.needed) return 'No place needed';
  const primary = primaryOption(plan);
  switch (plan.status) {
    case 'open':
      return 'Needs a place';
    case 'searching':
      return 'Searching';
    case 'options_available':
    case 'deciding':
      return plan.options.length === 1 ? '1 option' : `${plan.options.length} options`;
    case 'selected':
      return primary ? `Picked · ${primary.name}` : 'Picked';
    case 'booked':
      return primary ? `Booked · ${primary.name}` : 'Booked';
    case 'checked_in':
      return 'Checked in';
    case 'completed':
      return 'Stayed';
    case 'cancelled':
      return 'Cancelled';
  }
}

/** The requirements in two or three lines, for the collapsed card. */
export function describeRequirements(req: AccommodationRequirements, plan: { check_in: string; check_out: string }): string[] {
  const lines: string[] = [];
  const nights = nightsBetween(plan.check_in, plan.check_out);
  const head: string[] = [];
  if (req.type) head.push(TYPE_LABELS[req.type]);
  head.push(`${nights} ${nights === 1 ? 'night' : 'nights'}`);
  const perNight = formatMoney(req.budget_per_night, req.currency);
  const total = formatMoney(req.budget_total, req.currency);
  if (perNight) head.push(`up to ${perNight}/night`);
  else if (total) head.push(`up to ${total}`);
  lines.push(head.join(' · '));
  if (req.areas.length) lines.push(`In ${req.areas.join(', ')}`);
  if (req.amenities.length) lines.push(req.amenities.map(amenityLabel).join(', '));
  if (req.work_requirements) lines.push(`Work: ${req.work_requirements}`);
  if (req.min_requirements) lines.push(req.min_requirements);
  if (req.dates_flexible) lines.push('Dates are flexible');
  return lines;
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

/** A field's own copy of the value: follows the outside value until the field is focused. */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return { draft, setDraft, focused };
}

// ─── Rows ────────────────────────────────────────────────────────────────────

/** A one-line text field: label left, value right. Commits when left. */
export function TextRow({
  label,
  value,
  onCommit,
  live,
  placeholder,
  keyboardType,
  autoCapitalize,
  last,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  /** Commit every keystroke, for a form with its own button rather than autosave. */
  live?: boolean;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  last?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  const { draft, setDraft, focused } = useDraft(value);
  return (
    <>
      <Pressable onPress={() => ref.current?.focus()} style={s.row}>
        <Text style={s.rowLabel}>{label}</Text>
        <TextInput
          ref={ref}
          style={s.rowInput}
          value={draft}
          onChangeText={(v) => { setDraft(v); if (live) onCommit(v); }}
          onFocus={() => { focused.current = true; }}
          onBlur={() => {
            focused.current = false;
            if (draft !== value) onCommit(draft);
          }}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType="done"
        />
      </Pressable>
      {!last && <View style={s.separator} />}
    </>
  );
}

/** A paragraph field: label above, text below. Commits when left. */
export function TextArea({
  label,
  value,
  onCommit,
  live,
  placeholder,
  last,
}: {
  label?: string;
  value: string;
  onCommit: (v: string) => void;
  /** Commit every keystroke, for a form with its own button rather than autosave. */
  live?: boolean;
  placeholder?: string;
  last?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  const { draft, setDraft, focused } = useDraft(value);
  return (
    <>
      <Pressable onPress={() => ref.current?.focus()} style={s.areaRow}>
        {label ? <Text style={s.areaLabel}>{label}</Text> : null}
        <TextInput
          ref={ref}
          style={s.areaInput}
          value={draft}
          onChangeText={(v) => { setDraft(v); if (live) onCommit(v); }}
          onFocus={() => { focused.current = true; }}
          onBlur={() => {
            focused.current = false;
            if (draft !== value) onCommit(draft);
          }}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          multiline
          textAlignVertical="top"
        />
      </Pressable>
      {!last && <View style={s.separator} />}
    </>
  );
}

/**
 * An amount and its currency in one row, because a price without a
 * currency is not stored. Commits when either field is left, with both
 * values; the caller decides what to do with an amount that has no
 * currency yet.
 */
export function MoneyRow({
  label,
  amount,
  currency,
  onCommit,
  live,
  last,
}: {
  label: string;
  amount: string;
  currency: string;
  onCommit: (amount: string, currency: string) => void;
  /** Commit every keystroke, for a form with its own button rather than autosave. */
  live?: boolean;
  last?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  const a = useDraft(amount);
  const c = useDraft(currency);
  const commit = () => {
    if (a.draft !== amount || c.draft !== currency) onCommit(a.draft, c.draft);
  };
  const missingCurrency = a.draft.trim() !== '' && c.draft.trim() === '';
  return (
    <>
      <Pressable onPress={() => ref.current?.focus()} style={s.row}>
        <Text style={s.rowLabel}>{label}</Text>
        <View style={s.moneyRight}>
          <TextInput
            ref={ref}
            style={[s.rowInput, s.moneyInput]}
            value={a.draft}
            onChangeText={(v) => { a.setDraft(v); if (live) onCommit(v, c.draft); }}
            onFocus={() => { a.focused.current = true; }}
            onBlur={() => { a.focused.current = false; commit(); }}
            placeholder="0"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          <TextInput
            style={[s.rowInput, s.currencyInput, missingCurrency && s.currencyMissing]}
            value={c.draft}
            onChangeText={(v) => {
              const code = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
              c.setDraft(code);
              if (live) onCommit(a.draft, code);
            }}
            onFocus={() => { c.focused.current = true; }}
            onBlur={() => { c.focused.current = false; commit(); }}
            placeholder="EUR"
            placeholderTextColor={missingCurrency ? Colors.warning : Colors.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={3}
            returnKeyType="done"
          />
        </View>
      </Pressable>
      {!last && <View style={s.separator} />}
    </>
  );
}

/** A row that opens or closes something underneath: title, optional summary, chevron. */
export function DisclosureRow({
  title,
  lines,
  open,
  onPress,
  last,
}: {
  title: string;
  lines?: string[];
  open: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
      >
        <View style={s.rowText}>
          <Text style={s.rowLabel}>{title}</Text>
          {lines?.map((line, i) => (
            <Text key={i} style={s.rowSub} numberOfLines={2}>{line}</Text>
          ))}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textTertiary} />
      </Pressable>
      {!last && <View style={s.separator} />}
    </>
  );
}

// ─── Parsing what the fields hold ────────────────────────────────────────────

/** "1,200.50" or "1200,50" as a number; empty as null. Bad text stays a string so the model can refuse it. */
export function parseAmount(text: string): number | null | string {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : t;
}

export function amountText(value: number | null): string {
  return value === null ? '' : String(value);
}

/** "4.8" on a 5-point platform, "8.6/10" on a 10-point one. */
export function ratingText(rating: number | null, scale: 5 | 10): string {
  if (rating === null) return '';
  return scale === 10 ? `${rating}/10` : String(rating);
}

/**
 * One field for a rating and its scale: "4.8", "8.6/10", "9 / 10". A bare
 * number above 5 can only be out of 10. Anything else is handed on as it
 * is, so the model can say what is wrong with it.
 */
export function parseRating(text: string, scale: 5 | 10): { rating: number | null | string; rating_scale: 5 | 10 } {
  const t = text.trim();
  if (!t) return { rating: null, rating_scale: scale };
  const m = /^(\d+(?:[.,]\d+)?)\s*(?:\/\s*(5|10))?$/.exec(t);
  if (!m) return { rating: t, rating_scale: scale };
  const rating = Number(m[1].replace(',', '.'));
  const rating_scale = m[2] ? (Number(m[2]) as 5 | 10) : rating > 5 ? 10 : scale;
  return { rating, rating_scale };
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: Colors.surfaceSecondary,
  },
  badgeSmall: { paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { ...Typography.label, fontWeight: '600' },
  badgeTextSmall: { fontSize: 11 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    minHeight: 52,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { ...Typography.titleSmall, fontWeight: '500' },
  rowSub: { ...Typography.bodySmall, color: Colors.textSecondary },
  rowInput: {
    ...Typography.titleSmall,
    fontWeight: '400',
    flex: 1,
    textAlign: 'right',
    minWidth: 80,
  },
  moneyRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' },
  moneyInput: { fontVariant: ['tabular-nums'], flex: 0, minWidth: 90 },
  currencyInput: { flex: 0, minWidth: 48, textAlign: 'left', color: Colors.textSecondary },
  currencyMissing: { color: Colors.warning },

  areaRow: { paddingVertical: 14, gap: 6 },
  areaLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  areaInput: { ...Typography.titleSmall, fontWeight: '400', minHeight: 44 },

  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: -20,
  },

});
