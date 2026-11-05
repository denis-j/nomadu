import { useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { MoneyRow, TextArea, TextRow, amountText, parseAmount, parseRating, ratingText } from '../../../components/accommodationForm';
import { MissingRoute } from '../../../components/MissingRoute';
import { Card, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { systemColor } from '../../../constants/colors';
import { useAccommodation } from '../../../hooks/useAccommodations';
import { addAccommodationOption, startAccommodation, updateAccommodationOption, type LocalAccommodation } from '../../../lib/accommodations';
import type { AccommodationOption } from '../../../lib/accommodationModel';
import { currencyForCountry } from '../../../lib/currencies';
import { showToast } from '../../../lib/toast';
import { track } from '../../../lib/analytics';
import { useTranslation } from '../../../contexts/LanguageContext';

type Params = {
  stopSyncId: string;
  journeySyncId: string;
  start: string;
  end: string;
  countryCode: string;
  city: string;
  /** An existing option: the same form, filled in. */
  optionId?: string;
};

/**
 * A place found, as a form like the others: what and where, what it costs,
 * how it is rated, notes. Saved with the checkmark; the plan is created on
 * the first save if there is none.
 */
export default function StayOptionEditSheet() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<Params>();
  const complete = !!params.stopSyncId && !!params.journeySyncId && !!params.start && !!params.end;
  const { plan, loaded } = useAccommodation(params.stopSyncId);
  const existing = params.optionId ? plan?.options.find((o) => o.id === params.optionId) ?? null : null;

  if (!complete) return <MissingRoute title={t('plans.place')} message={t('plans.stayGone')} />;
  if (!loaded) return <Stack.Screen options={{ title: params.optionId ? t('plans.editPlace') : t('plans.addPlace') }} />;
  if (params.optionId && !existing) return <MissingRoute title={t('plans.place')} message={t('plans.placeGone')} />;
  return <Form key={existing?.id ?? 'new'} plan={plan} existing={existing} params={params} />;
}

function Form({ plan, existing, params }: { plan: LocalAccommodation | null; existing: AccommodationOption | null; params: Params }) {
  const { t } = useTranslation();
  const nav = useNavigation();
  const suggested = existing?.currency ?? plan?.requirements.currency ?? currencyForCountry(params.countryCode) ?? 'EUR';

  const [name, setName] = useState(existing?.name ?? '');
  const [platform, setPlatform] = useState(existing?.platform ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [perNight, setPerNight] = useState(amountText(existing?.price_per_night ?? null));
  const [total, setTotal] = useState(amountText(existing?.total_price ?? null));
  const [currency, setCurrency] = useState(existing?.currency ?? '');
  const [rating, setRating] = useState(existing ? ratingText(existing.rating, existing.rating_scale) : '');
  const [score, setScore] = useState(amountText(existing?.score ?? null));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [risks, setRisks] = useState(existing?.risks ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!name.trim()) {
      showToast(t('plans.giveNameError'), 'error');
      return;
    }
    setSaving(true);
    try {
      const input = {
        name,
        platform: platform.trim() || null,
        url: url.trim() || null,
        address: address.trim() || null,
        price_per_night: parseAmount(perNight),
        total_price: parseAmount(total),
        currency: currency.trim() || null,
        ...parseRating(rating, existing?.rating_scale ?? 5),
        score: parseAmount(score),
        notes: notes.trim() || null,
        risks: risks.trim() || null,
        last_checked_at: new Date().toISOString(),
      };
      if (!plan) await startAccommodation(params.journeySyncId, { sync_id: params.stopSyncId, start_date: params.start, end_date: params.end });
      if (existing) {
        await updateAccommodationOption(params.stopSyncId, existing.id, input);
      } else {
        await addAccommodationOption(params.stopSyncId, input);
        track({ name: 'accommodation_option_added' });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.goBack();
      showToast(existing ? t('plans.saved') : t('plans.placeAdded'));
    } catch (err: any) {
      showToast(err?.message ?? t('plans.couldNotSave'), 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: existing ? t('plans.editPlace') : t('plans.addPlace'),
          headerRight: () => (
            <Pressable onPress={save} disabled={saving || !name.trim()} hitSlop={8} style={{ opacity: saving || !name.trim() ? 0.4 : 1 }} accessibilityRole="button" accessibilityLabel={t('common.save')}>
              <SymbolView name={{ ios: 'checkmark', android: 'check' }} tintColor={systemColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={visaFormStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <SectionLabel>{t('plans.place')}</SectionLabel>
        <Card>
          <TextRow label={t('plans.name')} value={name} onCommit={setName} live placeholder={t('plans.namePlaceholder')} autoCapitalize="words" />
          <TextRow label={t('plans.whereListed')} value={platform} onCommit={setPlatform} live placeholder={t('plans.whereListedPlaceholder')} autoCapitalize="words" />
          <TextRow label={t('plans.link')} value={url} onCommit={setUrl} live placeholder={t('plans.httpsPlaceholder')} keyboardType="url" autoCapitalize="none" />
          <TextRow label={t('plans.address')} value={address} onCommit={setAddress} live placeholder={t('plans.addressPlaceholder')} last />
        </Card>

        {/* What a person compares by. Fees, reviews and cancellation stay what an agent filed. */}
        <SectionLabel>{t('plans.priceRating')}</SectionLabel>
        <Card>
          <MoneyRow label={t('plans.perNight')} amount={perNight} currency={currency} suggested={suggested} onCommit={(a, c) => { setPerNight(a); setCurrency(c); }} live />
          <MoneyRow label={t('plans.total')} amount={total} currency={currency} suggested={suggested} onCommit={(a, c) => { setTotal(a); setCurrency(c); }} live />
          <TextRow label={t('plans.rating')} value={rating} onCommit={setRating} live placeholder={t('plans.ratingPlaceholder')} keyboardType="numbers-and-punctuation" />
          <TextRow label={t('plans.yourScore')} value={score} onCommit={setScore} live placeholder={t('plans.yourScorePlaceholder')} keyboardType="decimal-pad" last />
        </Card>

        <SectionLabel>{t('plans.notes')}</SectionLabel>
        <Card>
          <TextArea label={t('plans.notes')} value={notes} onCommit={setNotes} live placeholder={t('plans.notesPlaceholder')} />
          <TextArea label={t('plans.risks')} value={risks} onCommit={setRisks} live placeholder={t('plans.risksPlaceholder')} last />
        </Card>
      </ScrollView>
    </>
  );
}
