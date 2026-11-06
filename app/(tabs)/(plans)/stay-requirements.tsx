import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { MoneyRow, TextArea, TextRow, amountText, parseAmount } from '../../../components/accommodationForm';
import { GlassPill } from '../../../components/GlassPill';
import { MissingRoute } from '../../../components/MissingRoute';
import { Card, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { Colors, systemColor } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useAccommodation } from '../../../hooks/useAccommodations';
import { startAccommodation, updateAccommodation, type LocalAccommodation } from '../../../lib/accommodations';
import { ACCOMMODATION_TYPES, EMPTY_REQUIREMENTS, KNOWN_AMENITIES, type AccommodationType } from '../../../lib/accommodationModel';
import { currencyForCountry } from '../../../lib/currencies';
import { showToast } from '../../../lib/toast';
import { useTranslation } from '../../../contexts/LanguageContext';

type Params = {
  stopSyncId: string;
  journeySyncId: string;
  start: string;
  end: string;
  countryCode: string;
  city: string;
};

/**
 * What the place should be like, as a form like the others: the kind as
 * pills, the budget and the area, what it needs, a note. Saved with the
 * checkmark; the plan is created on the first save if there is none.
 */
export default function StayRequirementsSheet() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<Params>();
  const complete = !!params.stopSyncId && !!params.journeySyncId && !!params.start && !!params.end;
  const { plan, loaded } = useAccommodation(params.stopSyncId);

  if (!complete) return <MissingRoute title={t('nav.lookingFor')} message={t('plans.stayGone')} />;
  if (!loaded) return <Stack.Screen options={{ title: t('nav.lookingFor') }} />;
  return <Form key={plan?.updated_at ?? 'new'} plan={plan} params={params} />;
}

function Form({ plan, params }: { plan: LocalAccommodation | null; params: Params }) {
  const { t } = useTranslation();
  const nav = useNavigation();
  const req = plan?.requirements ?? EMPTY_REQUIREMENTS;
  const suggested = req.currency ?? currencyForCountry(params.countryCode) ?? 'EUR';

  const [type, setType] = useState<AccommodationType | null>(req.type);
  const [budget, setBudget] = useState(amountText(req.budget_per_night));
  const [currency, setCurrency] = useState(req.currency ?? '');
  const [areas, setAreas] = useState(req.areas.join(', '));
  const [amenities, setAmenities] = useState<string[]>(req.amenities);
  const [notes, setNotes] = useState(req.notes ?? '');
  const [saving, setSaving] = useState(false);

  const toggleAmenity = (key: string) => {
    Haptics.selectionAsync();
    setAmenities((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!plan) await startAccommodation(params.journeySyncId, { sync_id: params.stopSyncId, start_date: params.start, end_date: params.end });
      // Only what this form asks; what an agent filed beyond it stays.
      await updateAccommodation(params.stopSyncId, {
        requirements: {
          type,
          budget_per_night: parseAmount(budget),
          currency: currency.trim() || null,
          areas,
          amenities,
          notes: notes.trim() || null,
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.goBack();
      showToast(t('plans.saved'));
    } catch (err: any) {
      showToast(err?.message ?? t('plans.couldNotSave'), 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('nav.lookingFor'),
          headerRight: () => (
            <Pressable onPress={save} disabled={saving} hitSlop={8} style={{ opacity: saving ? 0.4 : 1 }} accessibilityRole="button" accessibilityLabel={t('common.save')}>
              <SymbolView name={{ ios: 'checkmark', android: 'check' }} tintColor={systemColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={visaFormStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <SectionLabel>{t('plans.kindOfPlace')}</SectionLabel>
        <View style={styles.pillRow}>
          <GlassPill active={type === null} onPress={() => { Haptics.selectionAsync(); setType(null); }}>
            <Text style={[styles.pillLabel, type === null && styles.pillLabelActive]}>{t('plans.anything')}</Text>
          </GlassPill>
          {ACCOMMODATION_TYPES.map((ty) => (
            <GlassPill key={ty} active={type === ty} onPress={() => { Haptics.selectionAsync(); setType(ty); }}>
              <Text style={[styles.pillLabel, type === ty && styles.pillLabelActive]}>{t(`accType.${ty}`)}</Text>
            </GlassPill>
          ))}
        </View>

        <SectionLabel>{t('plans.budgetArea')}</SectionLabel>
        <Card>
          <MoneyRow label={t('plans.perNight')} amount={budget} currency={currency} suggested={suggested} onCommit={(a, c) => { setBudget(a); setCurrency(c); }} live />
          <TextRow label={t('plans.area')} value={areas} onCommit={setAreas} live autoCapitalize="words" last />
        </Card>

        <SectionLabel>{t('plans.needs')}</SectionLabel>
        <View style={styles.pillRow}>
          {KNOWN_AMENITIES.map((a) => {
            const on = amenities.includes(a.key);
            return (
              <GlassPill key={a.key} active={on} onPress={() => toggleAmenity(a.key)}>
                <Text style={[styles.pillLabel, on && styles.pillLabelActive]}>{a.label}</Text>
              </GlassPill>
            );
          })}
        </View>
        <SectionLabel>{t('plans.whatMatters')}</SectionLabel>
        <Card>
          <TextArea value={notes} onCommit={setNotes} live placeholder={t('plans.whatMattersPlaceholder')} last />
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillLabel: { ...Typography.label, fontWeight: '600' },
  pillLabelActive: { color: Colors.white },
});
