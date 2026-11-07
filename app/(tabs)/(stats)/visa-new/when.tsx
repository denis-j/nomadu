import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
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
import { track } from '../../../../lib/analytics';
import { useTranslation } from '../../../../contexts/LanguageContext';
import { FormField } from '../../../../components/FormField';
import { HeaderAction } from '../../../../components/HeaderAction';

/** Step 3 of 3: the dates, and a name if you want one. */
export default function AddVisaWhenScreen() {
  const { t } = useTranslation();
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
        label: label.trim() || t('visaForm.visa'),
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
      track({ name: 'visa_added' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.getParent()?.goBack();
      showToast(t('visaForm.visaAdded'));
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast(t('visaForm.couldNotSaveVisa'), 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t('nav.untilWhenValid'), headerRight: () => <HeaderAction onPress={handleSave} label={t('visaForm.addVisa')} busy={saving} /> }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={visaFormStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <VisaSummary
          country={{ name: params.name, code: params.code }}
          ruleSummary={describeStaySummary(stay, t)}
          span={expiryBadge(validTo, t)}
        />

        <ValidityPicker
          validFrom={validFrom}
          validTo={validTo}
          setValidFrom={setValidFrom}
          setValidTo={setValidTo}
        />

        <SectionLabel>{t('visaForm.nameOptional')}</SectionLabel>
        <Card>
          <FormField
            placeholder={t('visaForm.labelPlaceholder')}
            value={label}
            onChangeText={setLabel}
            returnKeyType="done"
          />
        </Card>
      </ScrollView>
    </>
  );
}
