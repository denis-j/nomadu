import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CloudyButton } from '../../../../components/CloudyButton';
import {
  Card,
  SectionLabel,
  StayChoice,
  describeStaySummary,
  ValidityPicker,
  VisaSummary,
  addMonths,
  expiryBadge,
  todayStr,
  visaFormStyles,
} from '../../../../components/visaForm';
import { insertUserVisa } from '../../../../lib/userVisas';
import { showToast } from '../../../../lib/toast';
import { Colors } from '../../../../constants/colors';
import { Typography } from '../../../../constants/typography';

/** Step 3 of 3: the dates, and a name if you want one. */
export default function AddVisaWhenScreen() {
  const nav = useNavigation();
  const params = useLocalSearchParams<{
    code: string; name: string; kind: string; days: string;
    window: string; suggestedName?: string;
  }>();

  const stay: StayChoice = params.kind === 'rolling'
    ? { kind: 'rolling', days: Number(params.days), window: Number(params.window) }
    : params.kind === 'per_stay'
      ? { kind: 'per_stay', days: Number(params.days) }
      : { kind: 'none' };

  const [validFrom, setValidFrom] = useState(todayStr());
  const [validTo, setValidTo] = useState(addMonths(todayStr(), 12));
  const [label, setLabel] = useState(params.suggestedName ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await insertUserVisa({
        country_code: params.code,
        // Naming a visa is optional. "Visa" reads fine under the country name
        // on the card, and it can be renamed later.
        label: label.trim() || 'Visa',
        valid_from: validFrom,
        valid_to: validTo,
        max_days_per_stay: stay.kind === 'per_stay' ? stay.days : null,
        max_days_per_window: stay.kind === 'rolling' ? stay.days : null,
        window_days: stay.kind === 'rolling' ? stay.window : null,
        // Single-entry visas are rare and consequential, so they are set when
        // editing rather than guessed here.
        entries_allowed: 'multiple',
        notes: null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.getParent()?.goBack();
      showToast('Visa added');
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('Could not save visa', 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Until when is it valid?' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={visaFormStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <VisaSummary
          country={{ name: params.name, code: params.code }}
          ruleSummary={describeStaySummary(stay)}
          span={expiryBadge(validTo)}
        />

        <ValidityPicker
          validFrom={validFrom}
          validTo={validTo}
          setValidFrom={setValidFrom}
          setValidTo={setValidTo}
        />

        <SectionLabel>Name (optional)</SectionLabel>
        <Card>
          <Pressable style={styles.nameRow}>
            <TextInput
              style={styles.nameInput}
              placeholder="DTV, D7, B1/B2 …"
              placeholderTextColor={Colors.textTertiary}
              value={label}
              onChangeText={setLabel}
              returnKeyType="done"
            />
          </Pressable>
        </Card>

        <View style={styles.footer}>
          <CloudyButton onPress={handleSave} style={styles.cta} innerStyle={styles.ctaInner}>
            <Text style={styles.ctaText}>{saving ? 'Adding…' : 'Add visa'}</Text>
          </CloudyButton>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  caption: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    paddingHorizontal: 4,
    marginTop: -4,
  },
  nameRow: { paddingVertical: 16 },
  nameInput: { ...Typography.titleSmall, fontWeight: '400' },
  footer: { marginTop: 10, gap: 10 },
  cta: { width: '100%' },
  ctaInner: { justifyContent: 'center' },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
});
