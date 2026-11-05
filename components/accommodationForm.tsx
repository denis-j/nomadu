import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Dropdown } from './Dropdown';
import { StatusChip } from './SheetRows';
import { currencyChoices, promptCurrency } from '../lib/currencies';
import { useTranslation } from '../contexts/LanguageContext';

type TFunc = (key: string, params?: Record<string, string | number>) => string;
import {

  primaryOption,
  type AccommodationPlan,
  type AccommodationStatus,
} from '../lib/accommodationModel';

/**
 * The rows the stay's sheets and the things-to-do form are built from,
 * inside the visa form's `Card`. Each row keeps a draft while it is being
 * typed in and hands the value over (`onCommit`) when the field is left,
 * or on every keystroke with `live`, for a form that saves with its own
 * checkmark. While a row has focus it ignores the value coming from
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
  const { t } = useTranslation();
  return <StatusChip label={t(`accStatus.${status}`)} muted={statusColor(status) !== Colors.text} size={size} onPress={onPress} />;
}

/** "Booked", "3 options", "Needs a place": the stop card's chip, short enough for one line. */
export function planChipShort(plan: AccommodationPlan, t: TFunc): string {
  if (!plan.needed) return t('accommodation.noPlaceNeeded');
  switch (plan.status) {
    case 'open':
      return t('accommodation.needsPlace');
    case 'searching':
      return t('accommodation.searching');
    case 'options_available':
    case 'deciding':
      return plan.options.length === 1 ? t('accommodation.oneOption') : t('accommodation.manyOptions', { count: plan.options.length });
    case 'selected':
      return t('accommodation.pickedChip');
    case 'booked':
      return t('accommodation.bookedChip');
    case 'checked_in':
      return t('accommodation.checkedInChip');
    case 'completed':
      return t('accommodation.stayedChip');
    case 'cancelled':
      return t('accommodation.cancelledChip');
  }
}

/** "Booked · Loft in Tay Ho", "3 options", "Needs a place": the same with the place's name, for the stop's sheet. */
export function planChipText(plan: AccommodationPlan, t: TFunc): string {
  if (!plan.needed) return t('accommodation.noPlaceNeeded');
  const primary = primaryOption(plan);
  switch (plan.status) {
    case 'open':
      return t('accommodation.needsPlace');
    case 'searching':
      return t('accommodation.searching');
    case 'options_available':
    case 'deciding':
      return plan.options.length === 1 ? t('accommodation.oneOption') : t('accommodation.manyOptions', { count: plan.options.length });
    case 'selected':
      return primary ? t('accommodation.pickedName', { name: primary.name }) : t('accommodation.pickedChip');
    case 'booked':
      return primary ? t('accommodation.bookedName', { name: primary.name }) : t('accommodation.bookedChip');
    case 'checked_in':
      return t('accommodation.checkedInChip');
    case 'completed':
      return t('accommodation.stayedChip');
    case 'cancelled':
      return t('accommodation.cancelledChip');
  }
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
 * currency is not stored. The amount is typed and commits when the field
 * is left; the currency is picked from a list and commits at once. An
 * amount typed with no currency chosen takes `suggested` (the stop's
 * country, or what the plan already uses), so nobody has to say "EUR"
 * for every price.
 */
export function MoneyRow({
  label,
  amount,
  currency,
  suggested,
  onCommit,
  live,
  last,
}: {
  label: string;
  amount: string;
  currency: string;
  /** The currency to assume when none was picked. */
  suggested?: string | null;
  onCommit: (amount: string, currency: string) => void;
  /** Commit every keystroke, for a form with its own button rather than autosave. */
  live?: boolean;
  last?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  const a = useDraft(amount);
  const c = useDraft(currency);
  const shown = c.draft || (a.draft.trim() ? suggested ?? '' : '');
  const effective = (code: string, amt: string) => code || (amt.trim() ? suggested ?? '' : '');
  const commit = () => {
    const code = effective(c.draft, a.draft);
    if (a.draft !== amount || code !== currency) onCommit(a.draft, code);
  };
  const pick = (code: string) => {
    c.setDraft(code);
    onCommit(a.draft, code);
  };
  const choices = [...currencyChoices(c.draft, suggested).map((code) => ({ id: code, label: code })), { id: 'other', label: 'Other', icon: 'ellipsis.circle' }];
  return (
    <>
      <Pressable onPress={() => ref.current?.focus()} style={s.row}>
        <Text style={s.rowLabel}>{label}</Text>
        <View style={s.moneyRight}>
          <TextInput
            ref={ref}
            style={[s.rowInput, s.moneyInput]}
            value={a.draft}
            onChangeText={(v) => { a.setDraft(v); if (live) onCommit(v, effective(c.draft, v)); }}
            onFocus={() => { a.focused.current = true; }}
            onBlur={() => { a.focused.current = false; commit(); }}
            placeholder="0"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          <Dropdown
            title="Currency"
            options={choices}
            value={shown || suggested || null}
            right
            onPick={(id) => (id === 'other' ? promptCurrency(pick) : pick(id))}
          >
            <View style={s.currencyPick}>
              <Text style={[s.currencyText, !shown && s.currencyEmpty]}>{shown || suggested || 'EUR'}</Text>
              <Ionicons name="chevron-down" size={12} color={Colors.textTertiary} />
            </View>
          </Dropdown>
        </View>
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
  currencyPick: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4 },
  currencyText: { ...Typography.titleSmall, fontWeight: '500', color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  currencyEmpty: { color: Colors.textTertiary },

  areaRow: { paddingVertical: 14, gap: 6 },
  areaLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  areaInput: { ...Typography.titleSmall, fontWeight: '400', minHeight: 44 },

  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: -20,
  },
});
