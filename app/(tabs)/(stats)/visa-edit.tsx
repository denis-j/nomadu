import { useCallback, useEffect, useState } from 'react';
import { Alert, PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ToastContainer } from '../../../components/Toast';
import {
  EntriesFields,
  IdentityFields,
  NotesField,
  SectionLabel,
  StayChoice,
  StayPicker,
  ValidityPicker,
  VisaSummary,
  addMonths,
  stayRuleLabel,
  expiryBadge,
  todayStr,
  visaFormStyles,
} from '../../../components/visaForm';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
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

/**
 * Editing one visa, everything on a single screen.
 *
 * Adding goes through `visa-new/`, which asks the same questions three
 * screens at a time. The split is deliberate: a wizard is the right shape when
 * you are answering questions for the first time and the wrong one when you
 * came here to change a single date.
 */
export default function EditVisaScreen() {
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; country?: string }>();
  const editId = params.id ? Number(params.id) : null;

  const [country, setCountry] = useState<{ name: string; code: string } | null>(
    params.country
      ? { name: getCountryName(params.country) ?? params.country, code: params.country }
      : null,
  );
  const [label, setLabel] = useState('');
  const [validFrom, setValidFrom] = useState(todayStr());
  const [validTo, setValidTo] = useState(addMonths(todayStr(), 12));
  const [stay, setStay] = useState<StayChoice | null>({ kind: 'rolling', days: 90, window: 180 });
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
        setStay({ kind: 'rolling', days: uv.max_days_per_window, window: uv.window_days });
      } else if (uv.max_days_per_stay) {
        setStay({ kind: 'per_stay', days: uv.max_days_per_stay });
      } else {
        setStay({ kind: 'none' });
      }
      setEntries(uv.entries_allowed);
      setNotes(uv.notes ?? '');
    });
  }, [editId]);

  // First missing or invalid field as a user-facing message, or null when the
  // form is ready. Gates the save and renders as a hint above the button.
  const missing = (() => {
    if (!country) return 'Pick a country';
    if (!label.trim()) return 'Add a visa type (e.g. B1/B2, Digital Nomad)';
    if (validTo < validFrom) return 'Valid-to must be on or after valid-from';
    if (!stay) return 'Say how long you can stay';
    return null;
  })();
  const canSave = missing === null;

  const handleSave = useCallback(async () => {
    if (missing || !country) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast(missing ?? 'Form is incomplete', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        country_code: country.code,
        label: label.trim(),
        valid_from: validFrom,
        valid_to: validTo,
        max_days_per_stay: stay?.kind === 'per_stay' ? stay.days : null,
        max_days_per_window: stay?.kind === 'rolling' ? stay.days : null,
        window_days: stay?.kind === 'rolling' ? stay.window : null,
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
  }, [missing, country, label, validFrom, validTo, stay, entries, notes, editId, nav]);

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
              accessibilityRole="button"
              accessibilityLabel="Save visa"
              style={{ opacity: saving ? 0.3 : canSave ? 1 : 0.5 }}
            >
              <SymbolView name="checkmark" tintColor={PlatformColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={visaFormStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <VisaSummary
          country={country}
          ruleSummary={stay ? stayRuleLabel(label, stay) : label.trim() || 'Visa'}
          span={expiryBadge(validTo)}
        />

        <SectionLabel>Visa</SectionLabel>
        <IdentityFields
          country={country}
          onPickCountry={() => {
            Haptics.selectionAsync();
            router.push('/(tabs)/(stats)/visa-country-picker');
          }}
          label={label}
          setLabel={setLabel}
        />

        <ValidityPicker
          validFrom={validFrom}
          validTo={validTo}
          setValidFrom={setValidFrom}
          setValidTo={setValidTo}
        />

        <StayPicker value={stay} onChange={setStay} />

        <SectionLabel>Entries allowed</SectionLabel>
        <EntriesFields entries={entries} setEntries={setEntries} />

        <SectionLabel>Notes</SectionLabel>
        <NotesField notes={notes} setNotes={setNotes} />

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
      {/* Sheet-level toast, sits in this sheet's view hierarchy so it renders
          above the form. The toast handler stack ensures this one wins while
          the sheet is mounted; the root container takes over again on pop. */}
      <ToastContainer />
    </>
  );
}

const styles = StyleSheet.create({
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
});
