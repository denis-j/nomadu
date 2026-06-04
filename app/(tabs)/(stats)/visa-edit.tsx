import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, type DateData } from 'react-native-calendars';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Flag } from '../../../components/Flag';
import { GlassPill } from '../../../components/GlassPill';
import { ToastContainer } from '../../../components/Toast';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};
import {
  EntriesAllowed,
  getUserVisaById,
  insertUserVisa,
  markUserVisaDeleted,
  updateUserVisa,
} from '../../../lib/userVisas';
import { consumePendingCountry } from '../../../lib/countryPickerBridge';
import { showToast } from '../../../lib/toast';
import { getCountryName } from '../../../utils/geography';

type CapType = 'rolling' | 'per_stay' | 'none';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const addYears = (ymd: string, years: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(y + years, m - 1, d);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

const RANGE_COLOR = '#000000';
const RANGE_BG = 'rgba(0,0,0,0.08)';

export default function EditVisaScreen() {
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; country?: string }>();
  const editId = params.id ? Number(params.id) : null;

  // ── State ──────────────────────────────────────────────────────────────────
  const [country, setCountry] = useState<{ name: string; code: string } | null>(
    params.country
      ? { name: getCountryName(params.country) ?? params.country, code: params.country }
      : null,
  );
  const [label, setLabel] = useState('');
  const [validFrom, setValidFrom] = useState(todayStr());
  const [validTo, setValidTo] = useState(addYears(todayStr(), 1));
  const [pickingDate, setPickingDate] = useState<'from' | 'to'>('to');
  const [capType, setCapType] = useState<CapType>('rolling');
  const [maxDays, setMaxDays] = useState('90');
  const [windowDays, setWindowDays] = useState('180');
  const [entries, setEntries] = useState<EntriesAllowed>('multiple');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Pull the selection back when the country-picker form-sheet pops.
  useFocusEffect(
    useCallback(() => {
      const picked = consumePendingCountry();
      if (picked) setCountry(picked);
    }, []),
  );

  const labelRef = useRef<TextInput>(null);
  const maxDaysRef = useRef<TextInput>(null);
  const windowDaysRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);

  // ── Load existing visa ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!editId) return;
    getUserVisaById(editId).then((uv) => {
      if (!uv) return;
      setCountry({
        name: getCountryName(uv.country_code) ?? uv.country_code,
        code: uv.country_code,
      });
      setLabel(uv.label);
      setValidFrom(uv.valid_from);
      setValidTo(uv.valid_to);
      if (uv.max_days_per_window && uv.window_days) {
        setCapType('rolling');
        setMaxDays(String(uv.max_days_per_window));
        setWindowDays(String(uv.window_days));
      } else if (uv.max_days_per_stay) {
        setCapType('per_stay');
        setMaxDays(String(uv.max_days_per_stay));
      } else {
        setCapType('none');
      }
      setEntries(uv.entries_allowed);
      setNotes(uv.notes ?? '');
    });
  }, [editId]);

  // Validation: returns the first missing/invalid field as a user-facing
  // message, or null when the form is ready to save. Used both to gate the
  // submit and to render an inline "what's missing" hint above the button.
  const validate = (): string | null => {
    if (!country) return 'Pick a country';
    if (!label.trim()) return 'Add a visa type (e.g. B1/B2, Digital Nomad)';
    if (validTo < validFrom) return 'Valid-to must be on or after valid-from';
    if (capType !== 'none') {
      const max = Number(maxDays);
      if (!max || max <= 0) return 'Max days must be greater than 0';
      if (capType === 'rolling') {
        const win = Number(windowDays);
        if (!win || win <= 0) return 'Window days must be greater than 0';
      }
    }
    return null;
  };
  const missing = validate();
  const canSave = missing === null;

  // ── Calendar marking ───────────────────────────────────────────────────────
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    if (validFrom === validTo) {
      marks[validFrom] = { startingDay: true, endingDay: true, color: RANGE_COLOR, textColor: '#fff' };
      return marks;
    }
    const [y1, m1, d1] = validFrom.split('-').map(Number);
    const [y2, m2, d2] = validTo.split('-').map(Number);
    const cursor = new Date(y1, m1 - 1, d1);
    const end = new Date(y2, m2 - 1, d2);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const isStart = key === validFrom;
      const isEnd = key === validTo;
      marks[key] = {
        startingDay: isStart,
        endingDay: isEnd,
        color: isStart || isEnd ? RANGE_COLOR : RANGE_BG,
        textColor: isStart || isEnd ? '#fff' : '#000',
      };
      cursor.setDate(cursor.getDate() + 1);
    }
    return marks;
  }, [validFrom, validTo]);

  const handleDayPress = (day: DateData) => {
    Haptics.selectionAsync();
    if (pickingDate === 'from') {
      setValidFrom(day.dateString);
      if (day.dateString > validTo) setValidTo(day.dateString);
      setPickingDate('to');
    } else {
      if (day.dateString < validFrom) {
        setValidTo(validFrom);
        setValidFrom(day.dateString);
      } else {
        setValidTo(day.dateString);
      }
    }
  };

  // ── Save / delete ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!country) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast(missing ?? 'Form is incomplete', 'error');
      return;
    }
    if (missing) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast(missing, 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        country_code: country.code,
        label: label.trim(),
        valid_from: validFrom,
        valid_to: validTo,
        max_days_per_stay: capType === 'per_stay' ? Number(maxDays) || null : null,
        max_days_per_window: capType === 'rolling' ? Number(maxDays) || null : null,
        window_days: capType === 'rolling' ? Number(windowDays) || null : null,
        entries_allowed: entries,
        notes: notes.trim() || null,
      };
      if (editId) await updateUserVisa(editId, payload);
      else await insertUserVisa(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(editId ? 'Visa updated' : 'Visa added');
      nav.goBack();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('Could not save visa', 'error');
      setSaving(false);
    }
  }, [missing, country, label, validFrom, validTo, capType, maxDays, windowDays, entries, notes, editId, nav]);

  const handleDelete = () => {
    if (!editId) return;
    Alert.alert('Delete visa', 'This visa will be removed from your tracker.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await markUserVisaDeleted(editId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast('Visa deleted');
          router.back();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: editId ? 'Edit visa' : 'Add visa',
          headerRight: () => (
            <Pressable
              onPress={handleSave}
              disabled={saving}
              hitSlop={8}
              style={{ opacity: saving ? 0.3 : canSave ? 1 : 0.5 }}
            >
              <SymbolView name="checkmark" tintColor={PlatformColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Country + Visa type — grouped Glass section */}
        <Text style={styles.sectionTitle}>Visa</Text>
        <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
          <Pressable
            style={styles.inputRowSplit}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/(tabs)/(stats)/visa-country-picker');
            }}
          >
            <Text style={styles.inputRowLabel}>Country</Text>
            <View style={styles.disclosureRight}>
              {country ? (
                <>
                  <Flag code={country.code} size={18} />
                  <Text style={styles.disclosureValue}>{country.name}</Text>
                </>
              ) : (
                <Text style={styles.disclosurePlaceholder}>Choose</Text>
              )}
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </View>
          </Pressable>
          <View style={styles.separator} />
          <Pressable onPress={() => labelRef.current?.focus()} style={styles.inputRow}>
            <TextInput
              ref={labelRef}
              style={styles.input}
              placeholder="Visa type (B1/B2, Digital Nomad, …)"
              placeholderTextColor={Colors.textTertiary}
              value={label}
              onChangeText={setLabel}
            />
          </Pressable>
        </Glass>


        {/* Validity */}
        <Text style={styles.sectionTitle}>Validity</Text>
        <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
          <Pressable
            style={[styles.inputRowSplit, pickingDate === 'from' && styles.dateRowActive]}
            onPress={() => setPickingDate('from')}
          >
            <Text style={styles.inputRowLabel}>Valid from</Text>
            <Text style={styles.dateValue}>{validFrom}</Text>
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            style={[styles.inputRowSplit, pickingDate === 'to' && styles.dateRowActive]}
            onPress={() => setPickingDate('to')}
          >
            <Text style={styles.inputRowLabel}>Valid to</Text>
            <Text style={styles.dateValue}>{validTo}</Text>
          </Pressable>
          <View style={styles.separator} />
          <View style={styles.calendarInline}>
            <Calendar
              current={pickingDate === 'from' ? validFrom : validTo}
              markingType="period"
              markedDates={markedDates}
              onDayPress={handleDayPress}
              theme={{
                calendarBackground: 'transparent',
                todayTextColor: '#000',
                arrowColor: '#000',
                textDayFontSize: 15,
                textMonthFontSize: 16,
                textMonthFontWeight: '600',
                textDayHeaderFontSize: 12,
                textDayHeaderFontWeight: '600',
              }}
            />
          </View>
        </Glass>

        {/* Day limit */}
        <Text style={styles.sectionTitle}>Day limit</Text>
        <View style={styles.pillRow}>
          {(['rolling', 'per_stay', 'none'] as CapType[]).map((t) => {
            const active = capType === t;
            return (
              <GlassPill
                key={t}
                active={active}
                onPress={() => {
                  Haptics.selectionAsync();
                  setCapType(t);
                }}
              >
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>
                  {t === 'rolling' ? 'Rolling window' : t === 'per_stay' ? 'Per stay' : 'No limit'}
                </Text>
              </GlassPill>
            );
          })}
        </View>

        {capType !== 'none' && (
          <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
            <Pressable onPress={() => maxDaysRef.current?.focus()} style={styles.inputRowSplit}>
              <Text style={styles.inputRowLabel}>Max days</Text>
              <TextInput
                ref={maxDaysRef}
                style={[styles.input, styles.numericInput]}
                value={maxDays}
                onChangeText={setMaxDays}
                keyboardType="number-pad"
                placeholder="90"
                placeholderTextColor={Colors.textTertiary}
              />
            </Pressable>
            {capType === 'rolling' && (
              <>
                <View style={styles.separator} />
                <Pressable onPress={() => windowDaysRef.current?.focus()} style={styles.inputRowSplit}>
                  <Text style={styles.inputRowLabel}>Per window (days)</Text>
                  <TextInput
                    ref={windowDaysRef}
                    style={[styles.input, styles.numericInput]}
                    value={windowDays}
                    onChangeText={setWindowDays}
                    keyboardType="number-pad"
                    placeholder="180"
                    placeholderTextColor={Colors.textTertiary}
                  />
                </Pressable>
              </>
            )}
          </Glass>
        )}

        {/* Entries */}
        <Text style={styles.sectionTitle}>Entries allowed</Text>
        <View style={styles.pillRow}>
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
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>
                  {e === 'multiple' ? 'Multiple' : 'Single'}
                </Text>
              </GlassPill>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={styles.sectionTitle}>Notes</Text>
        <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
          <Pressable onPress={() => notesRef.current?.focus()} style={styles.inputRow}>
            <TextInput
              ref={notesRef}
              style={styles.notesInput}
              placeholder="Optional notes"
              placeholderTextColor={Colors.textTertiary}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
            />
          </Pressable>
        </Glass>

        {missing && (
          <View style={styles.missingHint}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.missingHintText}>{missing}</Text>
          </View>
        )}

        {editId && (
          <Pressable style={styles.deleteRow} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
            <Text style={styles.deleteText}>Delete visa</Text>
          </Pressable>
        )}
      </ScrollView>
      {/* Sheet-level toast — sits in this sheet's view hierarchy so it
          renders above the form. The toast handler stack ensures this one
          wins while the sheet is mounted; the root container takes over
          again when we pop. */}
      <ToastContainer />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 60,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: PlatformColor('secondaryLabel'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
  },

  // Glass section pattern from auth screens
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
  inputRow: {
    paddingVertical: 16,
  },
  inputRowSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 12,
  },
  inputRowLabel: {
    ...Typography.titleSmall,
    fontWeight: '500',
  },
  input: {
    ...Typography.titleSmall,
    fontWeight: '400',
  },
  numericInput: {
    minWidth: 80,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  notesInput: {
    ...Typography.titleSmall,
    fontWeight: '400',
    minHeight: 80,
  },

  // Validity (inside Glass section, mirroring inputRowSplit)
  dateRowActive: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  dateValue: {
    ...Typography.titleSmall,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  calendarInline: {
    marginHorizontal: -12,
    paddingVertical: 4,
  },

  // Segmented pills wrap row (uses GlassPill component)
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillLabel: { ...Typography.label, fontWeight: '600' },
  pillLabelActive: { color: Colors.white },

  // Missing-fields hint (shown above Delete / bottom of form)
  missingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  missingHintText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Delete
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.error,
  },

  // Disclosure row (country)
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

