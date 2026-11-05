import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { MoneyRow, TextArea, TextRow, amountText, parseAmount } from '../../../components/accommodationForm';
import { MissingRoute } from '../../../components/MissingRoute';
import { Card, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { Colors, systemColor } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useAccommodation } from '../../../hooks/useAccommodations';
import { saveAccommodationBooking, type LocalAccommodation } from '../../../lib/accommodations';
import { primaryOption } from '../../../lib/accommodationModel';
import { currencyForCountry } from '../../../lib/currencies';
import { showToast } from '../../../lib/toast';
import { useTranslation } from '../../../contexts/LanguageContext';

type Params = {
  stopSyncId: string;
  journeySyncId: string;
  countryCode: string;
  city: string;
  /** The place being booked; without it, the one already picked or booked. */
  optionId?: string;
};

/**
 * What was booked, as a form like the others: the reference and what was
 * paid, what you need at the door, and once you have stayed, how it was.
 * Saving marks the plan as booked, at the place this form was opened for.
 */
export default function StayBookingSheet() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<Params>();
  const { plan, loaded } = useAccommodation(params.stopSyncId);

  if (!params.stopSyncId) return <MissingRoute title={t('nav.booking')} message={t('plans.stayGone')} />;
  if (!loaded) return <Stack.Screen options={{ title: t('nav.booking') }} />;
  if (!plan) return <MissingRoute title={t('nav.booking')} message={t('plans.pickPlaceFirst')} />;
  return <Form key={plan.updated_at} plan={plan} params={params} />;
}

function Form({ plan, params }: { plan: LocalAccommodation; params: Params }) {
  const { t } = useTranslation();
  const nav = useNavigation();
  const b = plan.booking;
  const primary = (params.optionId ? plan.options.find((o) => o.id === params.optionId) : null) ?? primaryOption(plan);
  // Booking a different place than before: its own price and address, not the old booking's.
  const fresh = !!params.optionId && b?.option_id !== params.optionId;
  const suggested = b?.currency ?? primary?.currency ?? plan.requirements.currency ?? currencyForCountry(params.countryCode) ?? 'EUR';
  const afterStay = plan.status === 'checked_in' || plan.status === 'completed' || (b?.review_rating ?? null) !== null;

  const [reference, setReference] = useState(fresh ? '' : b?.booking_reference ?? '');
  const [url, setUrl] = useState(fresh ? primary?.url ?? '' : b?.booking_url ?? '');
  const [price, setPrice] = useState(amountText(fresh ? primary?.total_price ?? null : b?.price ?? primary?.total_price ?? null));
  const [currency, setCurrency] = useState(fresh ? primary?.currency ?? '' : b?.currency ?? primary?.currency ?? '');
  const [address, setAddress] = useState(fresh ? primary?.address ?? '' : b?.address ?? primary?.address ?? '');
  const [checkIn, setCheckIn] = useState(b?.check_in_info ?? '');
  const [checkOut, setCheckOut] = useState(b?.check_out_info ?? '');
  const [contact, setContact] = useState(b?.provider_contact ?? '');
  const [notes, setNotes] = useState(b?.notes ?? '');
  const [reviewRating, setReviewRating] = useState(amountText(b?.review_rating ?? null));
  const [reviewText, setReviewText] = useState(b?.review_text ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveAccommodationBooking(params.stopSyncId, {
        ...(params.optionId && { option_id: params.optionId }),
        booking_reference: reference.trim() || null,
        booking_url: url.trim() || null,
        price: parseAmount(price),
        currency: currency.trim() || null,
        address: address.trim() || null,
        check_in_info: checkIn.trim() || null,
        check_out_info: checkOut.trim() || null,
        provider_contact: contact.trim() || null,
        notes: notes.trim() || null,
        ...(afterStay && { review_rating: parseAmount(reviewRating), review_text: reviewText.trim() || null }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.goBack();
      showToast(b && !fresh ? t('plans.saved') : t('plans.booked'));
    } catch (err: any) {
      showToast(err?.message ?? t('plans.couldNotSave'), 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: b && !fresh ? t('plans.editBooking') : t('plans.bookThisPlace'),
          headerRight: () => (
            <Pressable onPress={save} disabled={saving} hitSlop={8} style={{ opacity: saving ? 0.4 : 1 }} accessibilityRole="button" accessibilityLabel={t('common.save')}>
              <SymbolView name={{ ios: 'checkmark', android: 'check' }} tintColor={systemColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={visaFormStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {primary && (
          <>
            <SectionLabel>{t('plans.place')}</SectionLabel>
            <Card>
              <View style={styles.placeRow}>
                <View style={styles.placeIcon}>
                  <Ionicons name="bed-outline" size={20} color={Colors.text} />
                </View>
                <View style={styles.placeText}>
                  <Text style={styles.placeName} numberOfLines={1}>{primary.name}</Text>
                  {primary.platform ? <Text style={styles.placeSub} numberOfLines={1}>{primary.platform}</Text> : null}
                </View>
              </View>
            </Card>
          </>
        )}

        <SectionLabel>{t('nav.booking')}</SectionLabel>
        <Card>
          <TextRow label={t('plans.reference')} value={reference} onCommit={setReference} live placeholder={t('plans.confirmationNumber')} autoCapitalize="characters" />
          <MoneyRow label={t('plans.paid')} amount={price} currency={currency} suggested={suggested} onCommit={(a, c) => { setPrice(a); setCurrency(c); }} live />
          <TextRow label={t('plans.link')} value={url} onCommit={setUrl} live placeholder={t('plans.httpsPlaceholder')} keyboardType="url" autoCapitalize="none" last />
        </Card>

        <SectionLabel>{t('plans.atTheDoor')}</SectionLabel>
        <Card>
          <TextRow label={t('plans.address')} value={address} onCommit={setAddress} live placeholder={t('plans.streetPlaceholder')} />
          <TextArea label={t('plans.checkIn')} value={checkIn} onCommit={setCheckIn} live placeholder={t('plans.checkInPlaceholder')} />
          <TextArea label={t('plans.checkOut')} value={checkOut} onCommit={setCheckOut} live placeholder={t('plans.checkOutPlaceholder')} />
          <TextRow label={t('plans.contact')} value={contact} onCommit={setContact} live placeholder={t('plans.contactPlaceholder')} last />
        </Card>

        {afterStay && (
          <>
            <SectionLabel>{t('plans.howWasIt')}</SectionLabel>
            <Card>
              <TextRow label={t('plans.ratingOutOf5')} value={reviewRating} onCommit={setReviewRating} live placeholder={t('plans.ratingExample')} keyboardType="decimal-pad" />
              <TextArea value={reviewText} onCommit={setReviewText} live placeholder={t('plans.stayAgainPlaceholder')} last />
            </Card>
          </>
        )}

        <SectionLabel>{t('plans.notes')}</SectionLabel>
        <Card>
          <TextArea value={notes} onCommit={setNotes} live placeholder={t('plans.anythingElse')} last />
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  placeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: { flex: 1, gap: 1 },
  placeName: { ...Typography.titleSmall, fontWeight: '500' },
  placeSub: { ...Typography.bodySmall, color: Colors.textSecondary },
});
