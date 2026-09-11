import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, PlatformColor } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, type DateData } from 'react-native-calendars';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Flag } from './Flag';
import { GlassPill } from './GlassPill';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { NO_EXPIRY, hasNoExpiry, type EntriesAllowed } from '../lib/userVisas';

/**
 * The pieces the visa form is built from.
 *
 * They live here because two screens need them: the three-step add flow in
 * `visa-new/`, which asks one question at a time, and `visa-edit.tsx`, which
 * puts everything on one screen because when you are correcting a single field
 * you do not want to walk through a wizard to reach it.
 */

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

// ─── Date helpers ───────────────────────────────────────────────────────────

export const todayStr = (): string => toYmd(new Date());

export const toYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addMonths = (ymd: string, months: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  return toYmd(new Date(y, m - 1 + months, d));
};

/** "6 Sep 2026". The raw YYYY-MM-DD was accurate and unreadable. */
const formatHuman = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

const daysInclusive = (from: string, to: string): number => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const ms = new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime();
  return Math.round(ms / 86400000) + 1;
};

// ─── Content ────────────────────────────────────────────────────────────────

/**
 * The badge in the summary row.
 *
 * "Valid" matters: next to "max 30d/stay" a bare "1 year" reads as a
 * contradiction, when the two answer different questions.
 */
const ENTRY_HINT: Record<EntriesAllowed, string> = {
  multiple: 'You can leave and come back as often as you like while the visa is valid.',
  single: 'Used up as soon as you leave the country. A new entry needs a new visa.',
};

// ─── Stay rules, in sentences ───────────────────────────────────────────────

/**
 * What a visa lets you do, as one of three shapes.
 *
 * The add flow never says "rolling window" or "per stay" to anyone. Those are
 * the words the database uses. A person reads what is printed on their visa
 * and picks the sentence that matches it.
 */
export type StayChoice =
  | { kind: 'none' }
  | { kind: 'per_stay'; days: number }
  | { kind: 'rolling'; days: number; window: number };

export function describeStay(choice: StayChoice): string {
  if (choice.kind === 'none') return 'No day limit';
  if (choice.kind === 'per_stay') return `${choice.days} days each time you enter`;
  return `${choice.days} days in any ${choice.window}`;
}

export function stayEquals(a: StayChoice, b: StayChoice): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'per_stay' && b.kind === 'per_stay') return a.days === b.days;
  if (a.kind === 'rolling' && b.kind === 'rolling') {
    return a.days === b.days && a.window === b.window;
  }
  return true;
}

/** The stay rule as the visa card will label it. */
export function stayRuleLabel(name: string, choice: StayChoice): string {
  const base = name.trim() || 'Visa';
  if (choice.kind === 'per_stay') return `${base} · max ${choice.days}d/stay`;
  if (choice.kind === 'rolling') return `${base} · ${choice.days}/${choice.window}`;
  return base;
}

// ─── Building blocks ────────────────────────────────────────────────────────

/** A tappable row in a single-choice list. Checkmark on the selected one. */
export function ChoiceRow({
  title,
  subtitle,
  selected,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
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
        accessibilityState={{ selected }}
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        style={({ pressed }) => [s.choiceRow, pressed && { opacity: 0.55 }]}
      >
        <View style={s.choiceText}>
          <Text style={s.choiceTitle}>{title}</Text>
          {subtitle ? <Text style={s.choiceSub}>{subtitle}</Text> : null}
        </View>
        {/* Always rendered, only faded. The icon glyph is a couple of points
            taller than the 16pt label, so mounting it on selection nudged the
            whole row. Its state is on the Pressable for VoiceOver. */}
        <Ionicons
          name="checkmark"
          size={20}
          color={Colors.text}
          style={selected ? undefined : s.checkHidden}
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
      </Pressable>
      {!last && <View style={s.separator} />}
    </>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <Glass {...glassProps} style={[s.section, !hasGlass && s.sectionFallback]}>
      {children}
    </Glass>
  );
}


/** Identity strip: which visa is being built, and how long it runs. */
export function VisaSummary({
  country,
  ruleSummary,
  span,
}: {
  country: { name: string; code: string } | null;
  ruleSummary: string;
  span: string;
}) {
  return (
    <View style={s.summaryRow}>
      <View style={s.summaryLeft}>
        {country ? (
          <Flag code={country.code} size={26} />
        ) : (
          <View style={s.summaryFlagEmpty}>
            <Ionicons name="document-text-outline" size={15} color={Colors.textTertiary} />
          </View>
        )}
        <View style={s.summaryText}>
          <Text style={s.summaryTitle} numberOfLines={1}>{country?.name ?? 'New visa'}</Text>
          <Text style={s.summarySub} numberOfLines={1}>{ruleSummary}</Text>
        </View>
      </View>
      <View style={s.daysBubble}>
        <Text style={s.daysText}>{span}</Text>
      </View>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

export function Hint({ children }: { children: string }) {
  return <Text style={s.hint}>{children}</Text>;
}

/** Country row plus the visa-type field and its tap-to-fill chips. */
export function IdentityFields({
  country,
  onPickCountry,
  label,
  setLabel,
}: {
  country: { name: string; code: string } | null;
  onPickCountry: () => void;
  label: string;
  setLabel: (v: string) => void;
}) {
  const labelRef = useRef<TextInput>(null);
  return (
    <>
      <Glass {...glassProps} style={[s.section, !hasGlass && s.sectionFallback]}>
        <Pressable style={s.inputRowSplit} onPress={onPickCountry}>
          <Text style={s.inputRowLabel}>Country</Text>
          <View style={s.disclosureRight}>
            {country ? (
              <>
                <Flag code={country.code} size={18} />
                <Text style={s.disclosureValue}>{country.name}</Text>
              </>
            ) : (
              <Text style={s.disclosurePlaceholder}>Choose</Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </View>
        </Pressable>
        <View style={s.separator} />
        <Pressable onPress={() => labelRef.current?.focus()} style={s.inputRow}>
          <TextInput
            ref={labelRef}
            style={s.input}
            placeholder="Visa type (B1/B2, Digital Nomad, …)"
            placeholderTextColor={Colors.textTertiary}
            value={label}
            onChangeText={setLabel}
            returnKeyType="done"
          />
        </Pressable>
      </Glass>

    </>
  );
}

/**
 * "How long can you stay?", answered in sentences.
 *
 * Replaces what used to be three pills, a row of preset chips and two number
 * fields. Each row is a complete answer, picking one is a single tap, and the
 * words "rolling window" and "per stay" never reach the screen.
 *
 * When a `suggestion` is passed it goes on top under its own heading: that is
 * the rule the app already knows for this passport in this country, which for
 * most visa-free and visa-on-arrival cases is the whole answer.
 */
export function StayPicker({
  suggestion,
  countryName,
  value,
  onChange,
}: {
  suggestion?: { choice: StayChoice; note: string } | null;
  countryName?: string;
  value: StayChoice | null;
  onChange: (choice: StayChoice | null) => void;
}) {
  const PRESETS: StayChoice[] = [
    { kind: 'per_stay', days: 30 },
    { kind: 'per_stay', days: 60 },
    { kind: 'per_stay', days: 90 },
    { kind: 'per_stay', days: 180 },
    { kind: 'rolling', days: 90, window: 180 },
    { kind: 'none' },
  ];

  const isPreset = (c: StayChoice | null) =>
    !!c && (PRESETS.some((p) => stayEquals(p, c)) ||
      (!!suggestion && stayEquals(suggestion.choice, c)));

  // An existing visa can hold any number, so open the custom card on a value
  // that no row can represent.
  const [customOpen, setCustomOpen] = useState(!!value && !isPreset(value));
  const [customDays, setCustomDays] = useState(
    value && value.kind !== 'none' ? String(value.days) : '',
  );
  const [customPeriodic, setCustomPeriodic] = useState(value?.kind === 'rolling');
  const [customWindow, setCustomWindow] = useState(
    value?.kind === 'rolling' ? String(value.window) : '',
  );

  const pick = (next: StayChoice) => {
    setCustomOpen(false);
    onChange(next);
  };

  const pushCustom = (days: string, periodic: boolean, window: string) => {
    const d = Number(days);
    if (!d) return onChange(null);
    if (!periodic) return onChange({ kind: 'per_stay', days: d });
    const w = Number(window);
    onChange(w ? { kind: 'rolling', days: d, window: w } : null);
  };

  const alternatives = PRESETS.filter(
    (p) => !suggestion || !stayEquals(p, suggestion.choice),
  );

  return (
    <>
      {suggestion && (
        <>
          <SectionLabel>{`Usually for ${countryName ?? 'this country'}`}</SectionLabel>
          <Card>
            <ChoiceRow
              title={describeStay(suggestion.choice)}
              subtitle={suggestion.note}
              selected={!customOpen && !!value && stayEquals(value, suggestion.choice)}
              onPress={() => pick(suggestion.choice)}
              last
            />
          </Card>
          <Text style={s.caption}>
            What your passport normally gets. If your visa says something else, pick it below.
          </Text>
        </>
      )}

      <SectionLabel>{suggestion ? 'Or' : 'What your visa allows'}</SectionLabel>
      <Card>
        {alternatives.map((alt) => (
          <ChoiceRow
            key={`${alt.kind}-${alt.kind === 'none' ? 0 : alt.days}-${alt.kind === 'rolling' ? alt.window : 0}`}
            title={describeStay(alt)}
            selected={!customOpen && !!value && stayEquals(value, alt)}
            onPress={() => pick(alt)}
          />
        ))}
        <ChoiceRow
          title="Something else"
          selected={customOpen}
          onPress={() => {
            setCustomOpen(true);
            pushCustom(customDays, customPeriodic, customWindow);
          }}
          last
        />
      </Card>

      {customOpen && (
        <Card>
          <View style={s.customRow}>
            <Text style={s.inputRowLabel}>Days</Text>
            <TextInput
              style={s.customInput}
              value={customDays}
              onChangeText={(v) => {
                setCustomDays(v);
                pushCustom(v, customPeriodic, customWindow);
              }}
              keyboardType="number-pad"
              placeholder="45"
              placeholderTextColor={Colors.textTertiary}
            />
          </View>
          <View style={s.customPills}>
            <GlassPill
              active={!customPeriodic}
              onPress={() => {
                Haptics.selectionAsync();
                setCustomPeriodic(false);
                pushCustom(customDays, false, customWindow);
              }}
            >
              <Text style={[s.pillLabel, !customPeriodic && s.pillLabelActive]}>each entry</Text>
            </GlassPill>
            <GlassPill
              active={customPeriodic}
              onPress={() => {
                Haptics.selectionAsync();
                setCustomPeriodic(true);
                pushCustom(customDays, true, customWindow);
              }}
            >
              <Text style={[s.pillLabel, customPeriodic && s.pillLabelActive]}>in a period</Text>
            </GlassPill>
            {customPeriodic && (
              <TextInput
                style={[s.customInput, s.windowInput]}
                value={customWindow}
                onChangeText={(v) => {
                  setCustomWindow(v);
                  pushCustom(customDays, true, v);
                }}
                keyboardType="number-pad"
                placeholder="180 days"
                placeholderTextColor={Colors.textTertiary}
              />
            )}
          </View>
        </Card>
      )}
    </>
  );
}

/** How the stay rule reads in the summary row, in plain words. */
export function describeStaySummary(stay: StayChoice): string {
  if (stay.kind === 'per_stay') return `Stay up to ${stay.days} days per entry`;
  if (stay.kind === 'rolling') return `Stay up to ${stay.days} days in any ${stay.window}`;
  return 'No day limit';
}

/** The badge: the date the document runs out, which is the fact people want. */
export function expiryBadge(validTo: string): string {
  return hasNoExpiry(validTo) ? 'No expiry' : `Until ${formatHuman(validTo)}`;
}

const VALIDITY_PRESETS: { label: string; months: number }[] = [
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
  { label: '2 years', months: 24 },
];

/**
 * When the visa was issued and how long it runs.
 *
 * This used to be two date rows, six chips and a three-line paragraph
 * explaining that "1 year" and "30 days per stay" are not in conflict. Needing
 * a paragraph is the tell: people describe a visa by its length ("a one-year
 * DTV"), so the length is the choice and the expiry date is what falls out.
 * The date shows up in the summary badge, where it answers the question
 * instead of arguing with it.
 */
export function ValidityPicker({
  validFrom,
  validTo,
  setValidFrom,
  setValidTo,
}: {
  validFrom: string;
  validTo: string;
  setValidFrom: (v: string) => void;
  setValidTo: (v: string) => void;
}) {
  const noExpiry = hasNoExpiry(validTo);
  const matchedPreset = VALIDITY_PRESETS.find((p) => validTo === addMonths(validFrom, p.months));
  const isCustomDate = !noExpiry && !matchedPreset;

  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const openCalendar = (which: 'from' | 'to') => {
    Haptics.selectionAsync();
    setPicking((current) => (current === which ? null : which));
  };

  const handleDayPress = (day: DateData) => {
    Haptics.selectionAsync();
    if (picking === 'from') {
      setValidFrom(day.dateString);
      if (!noExpiry && day.dateString > validTo) setValidTo(day.dateString);
      setPicking(null);
    } else {
      if (day.dateString < validFrom) setValidFrom(day.dateString);
      setValidTo(day.dateString);
    }
  };

  const marked: Record<string, any> = {};
  const selected = picking === 'from' ? validFrom : validTo;
  if (picking && !(picking === 'to' && noExpiry)) {
    marked[selected] = { selected: true, selectedColor: Colors.text };
  }

  return (
    <>
      <SectionLabel>Issued</SectionLabel>
      <Card>
        <Pressable
          style={[s.inputRowSplit, picking === 'from' && s.dateRowActive]}
          onPress={() => openCalendar('from')}
        >
          <Text style={s.inputRowLabel}>Issued on</Text>
          <View style={s.disclosureRight}>
            <Text style={s.dateValue}>{formatHuman(validFrom)}</Text>
            <Ionicons
              name={picking === 'from' ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={Colors.textTertiary}
            />
          </View>
        </Pressable>
        {picking === 'from' && (
          <>
            <View style={s.separator} />
            <View style={s.calendarInline}>
              <Calendar
                current={validFrom}
                markedDates={marked}
                onDayPress={handleDayPress}
                theme={CALENDAR_THEME}
              />
            </View>
          </>
        )}
      </Card>

      <SectionLabel>Valid for</SectionLabel>
      <Card>
        {VALIDITY_PRESETS.map((preset) => (
          <ChoiceRow
            key={preset.label}
            title={preset.label}
            selected={matchedPreset?.label === preset.label}
            onPress={() => {
              setPicking(null);
              setValidTo(addMonths(validFrom, preset.months));
            }}
          />
        ))}
        <ChoiceRow
          title="No expiry date"
          selected={noExpiry}
          onPress={() => {
            setPicking(null);
            setValidTo(NO_EXPIRY);
          }}
        />
        <ChoiceRow
          title="Until a specific date"
          subtitle={isCustomDate ? formatHuman(validTo) : undefined}
          selected={isCustomDate}
          onPress={() => {
            if (noExpiry) setValidTo(addMonths(validFrom, 12));
            setPicking('to');
          }}
          last
        />
        {picking === 'to' && (
          <>
            <View style={s.separator} />
            <View style={s.calendarInline}>
              <Calendar
                current={noExpiry ? validFrom : validTo}
                markedDates={marked}
                onDayPress={handleDayPress}
                theme={CALENDAR_THEME}
              />
            </View>
          </>
        )}
      </Card>
    </>
  );
}

const CALENDAR_THEME = {
  calendarBackground: 'transparent',
  todayTextColor: Colors.text,
  arrowColor: Colors.text,
  textDayFontSize: 15,
  textMonthFontSize: 16,
  textMonthFontWeight: '600' as const,
  textDayHeaderFontSize: 12,
  textDayHeaderFontWeight: '600' as const,
};

export function EntriesFields({
  entries,
  setEntries,
}: {
  entries: EntriesAllowed;
  setEntries: (v: EntriesAllowed) => void;
}) {
  return (
    <>
      <View style={s.pillRow}>
        {(['multiple', 'single'] as EntriesAllowed[]).map((e) => {
          const active = entries === e;
          return (
            <GlassPill
              key={e}
              active={active}
              onPress={() => {
                Haptics.selectionAsync();
                setEntries(e);
              }}
            >
              <Text style={[s.pillLabel, active && s.pillLabelActive]}>
                {e === 'multiple' ? 'Multiple' : 'Single'}
              </Text>
            </GlassPill>
          );
        })}
      </View>
      <Hint>{ENTRY_HINT[entries]}</Hint>
    </>
  );
}

export function NotesField({ notes, setNotes }: { notes: string; setNotes: (v: string) => void }) {
  const notesRef = useRef<TextInput>(null);
  return (
    <Glass {...glassProps} style={[s.section, !hasGlass && s.sectionFallback]}>
      <Pressable onPress={() => notesRef.current?.focus()} style={s.inputRow}>
        <TextInput
          ref={notesRef}
          style={s.notesInput}
          placeholder="Optional notes"
          placeholderTextColor={Colors.textTertiary}
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
        />
      </Pressable>
    </Glass>
  );
}

export const visaFormStyles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 14,
    // Room for the floating tab bar, which overlays the bottom of the sheet
    // and would otherwise sit on top of the primary button.
    paddingBottom: 110,
  },
});

const s = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 2,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  summaryFlagEmpty: {
    width: 26,
    height: 20,
    borderRadius: 4,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSecondary,
  },
  summaryText: { flex: 1, gap: 1 },
  summaryTitle: { ...Typography.titleSmall, fontWeight: '600' },
  summarySub: { ...Typography.bodySmall, color: Colors.textSecondary },
  daysBubble: {
    backgroundColor: PlatformColor('systemGray5'),
    borderRadius: 20,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  daysText: {
    fontSize: 13,
    fontWeight: '700',
    color: PlatformColor('label'),
    fontVariant: ['tabular-nums'],
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: PlatformColor('secondaryLabel'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  hint: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    paddingHorizontal: 4,
    marginTop: -4,
  },
  calendarHint: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingTop: 12,
  },

  section: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 4,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  sectionFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderColor: Colors.border,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: -20,
  },
  inputRow: { paddingVertical: 16 },
  inputRowSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 12,
  },
  inputRowLabel: { ...Typography.titleSmall, fontWeight: '500' },
  input: { ...Typography.titleSmall, fontWeight: '400' },
  numericInput: { minWidth: 80, textAlign: 'right', fontVariant: ['tabular-nums'] },
  notesInput: { ...Typography.titleSmall, fontWeight: '400', minHeight: 80 },

  dateRowActive: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  dateValue: { ...Typography.titleSmall, fontWeight: '500', fontVariant: ['tabular-nums'] },
  dateValueMuted: { color: Colors.textSecondary },
  calendarInline: { marginHorizontal: -12, paddingVertical: 4 },

  caption: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    paddingHorizontal: 4,
    marginTop: -4,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  customInput: {
    ...Typography.titleSmall,
    minWidth: 90,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  windowInput: { minWidth: 110 },
  customPills: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 14 },

  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 15,
    // Pins the height so no glyph metric can move the row. Rows with a
    // subtitle grow past it on their own.
    minHeight: 52,
  },
  checkHidden: { opacity: 0 },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { ...Typography.titleSmall, fontWeight: '500' },
  choiceSub: { ...Typography.bodySmall, color: Colors.textSecondary },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillLabel: { ...Typography.label, fontWeight: '600' },
  pillLabelActive: { color: Colors.white },

  disclosureRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  disclosureValue: { ...Typography.titleSmall, fontWeight: '500' },
  disclosurePlaceholder: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textTertiary },
});
