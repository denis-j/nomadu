import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ExpenseRow } from '../../../components/expenses/ExpenseRow';
import { MissingRoute } from '../../../components/MissingRoute';
import { DetailCard, DetailSeparator, SectionHead } from '../../../components/SheetRows';
import { StatRow, StatTile } from '../../../components/StatTile';
import { Avatar } from '../../../components/TravellerAvatars';
import { Colors } from '../../../constants/colors';
import { Typography, FontSize } from '../../../constants/typography';
import { useJourneyExpenses, useTravellerPeople } from '../../../hooks/useExpenses';
import { currencyForCountry } from '../../../lib/currencies';
import { getJourneyWithLegs, type JourneyLeg, type JourneyWithLegs } from '../../../lib/database';
import { fromYmd, toYmd } from '../../../lib/days';
import { addExpense, type LocalExpense } from '../../../lib/expenses';
import { balances, formatAmount, guessCategory, parseQuickEntry, settleUp, shareOf, stopIdForDate, tileAmount, totals, type Transfer } from '../../../lib/expenseModel';
import { Dropdown } from '../../../components/Dropdown';
import { useTranslation } from '../../../contexts/LanguageContext';

type TFunc = (key: string, params?: Record<string, string | number>) => string;
import { pickReceipt, receiptImageUri, setPendingReceipt } from '../../../lib/receipts';
import { showToast } from '../../../lib/toast';
import { track } from '../../../lib/analytics';
import { FormCard, FormField } from '../../../components/FormField';
import { EmptyState } from '../../../components/EmptyState';
import { appLocale } from '../../../lib/i18n/locale';

type Params = {
  journeyId: string;
  journeySyncId: string;
  /** '1' on a friend's trip we may not plan: shown as it is. */
  readOnly?: string;
};


/** "Today", "Yesterday", "Nov 6", "Nov 6, 2025": the heading over a day's expenses. */
function dayLabel(ymd: string, t: TFunc): string {
  const today = toYmd(new Date());
  if (ymd === today) return t('expenses.today');
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (ymd === toYmd(y)) return t('expenses.yesterday');
  const d = fromYmd(ymd);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(appLocale(), { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** What a new expense is in: what the last one was in, else the money of the stop you are at, else the first stop's. */
function defaultCurrency(expenses: LocalExpense[], legs: JourneyLeg[]): string {
  if (expenses[0]) return expenses[0].currency;
  const today = toYmd(new Date());
  const here = legs.find((l) => l.start_date <= today && today <= l.end_date) ?? legs[0];
  return currencyForCountry(here?.country_code) ?? 'EUR';
}

/**
 * What the trip costs and who owes whom, on one page: a line to type an
 * expense into (or a camera for the receipt), three tiles, the payments
 * that settle up, and the expenses by day as row cards. Built like the
 * things to do: a native header, the app's cards and tiles, every edit in
 * its own sheet.
 */
export default function ExpensesScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const nav = useNavigation();
  const journeyId = Number(params.journeyId);
  const readOnly = params.readOnly === '1';
  const [journey, setJourney] = useState<JourneyWithLegs | null | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const loadJourney = useCallback(() => {
    if (journeyId) getJourneyWithLegs(journeyId).then(setJourney);
  }, [journeyId]);
  useEffect(loadJourney, [loadJourney]);
  useFocusEffect(loadJourney);

  const { expenses, loaded, refresh } = useJourneyExpenses(params.journeySyncId);
  const { documents, loaded: peopleLoaded, people, meId, travellerIds, nameOf } = useTravellerPeople(journeyId);
  const legs = useMemo(() => journey?.legs ?? [], [journey]);
  const currency = defaultCurrency(expenses, legs);
  const receiptOf = useMemo(() => new Map(documents.map((d) => [d.sync_id, d])), [documents]);

  const sums = useMemo(() => totals(expenses), [expenses]);
  const transfers = useMemo(() => settleUp(expenses), [expenses]);
  const main = sums[0]?.currency ?? currency;
  const myPart = expenses.filter((e) => e.currency === main).reduce((s, e) => s + shareOf(e, meId), 0);
  const myNet = meId ? balances(expenses).find((b) => b.traveller_id === meId && b.currency === main)?.net ?? 0 : 0;

  const stops = useMemo(() => legs.map((l) => ({ id: l.sync_id, start_date: l.start_date, end_date: l.end_date })), [legs]);

  const openForm = useCallback((extra: Record<string, string> = {}) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/(tabs)/(plans)/expense-add', params: { journeyId: String(journeyId), journeySyncId: params.journeySyncId, ...extra } });
  }, [router, journeyId, params.journeySyncId]);

  const openExpense = (e: LocalExpense) => router.push({
    pathname: '/(tabs)/(plans)/expense',
    params: { id: e.id, journeyId: String(journeyId), ...(readOnly && { readOnly: '1' }) },
  });

  // One line, typed: what, how much, in what. Paid by you, split among
  // everyone, today; the row opens for anything else. A line without a
  // number opens the form with the words already in it.
  const quickAdd = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const parsed = parseQuickEntry(text, currency);
    if (!parsed) {
      setDraft('');
      openForm({ title: text });
      return;
    }
    setBusy(true);
    try {
      const today = toYmd(new Date());
      const title = parsed.title || t('expenses.expense');
      await addExpense(params.journeySyncId, stopIdForDate(stops, today), {
        title,
        amount: parsed.amount,
        currency: parsed.currency,
        paid_by: meId,
        split_among: travellerIds,
        date: today,
        category: guessCategory(title),
        source: 'manual',
      });
      track({ name: 'expense_added', props: { source: 'quick' } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDraft('');
      showToast(t('expenses.amountAdded', { amount: formatAmount(parsed.amount), currency: parsed.currency }));
      await refresh();
    } catch (err: any) {
      showToast(err?.message ?? t('expenses.couldNotAdd'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // The receipt first, the form after, with what the picture says filled in.
  const snap = useCallback(async (source: 'camera' | 'library') => {
    try {
      const picked = await pickReceipt(source);
      if (!picked) return;
      setPendingReceipt(picked);
      openForm({ receipt: '1' });
    } catch (err: any) {
      showToast(err?.message ?? t('expenses.couldNotOpenCamera'), 'error');
    }
  }, [openForm]);

  const chooseReceipt = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== 'ios') {
      snap('library');
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [t('expenses.takePhoto'), t('expenses.fromPhotos'), t('common.cancel')], cancelButtonIndex: 2 },
      (i) => { if (i === 0) snap('camera'); else if (i === 1) snap('library'); },
    );
  }, [snap]);

  // The + offers the same three ways in as the empty page: a photo of the
  // receipt, one from Photos, or the form.
  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: readOnly
        ? undefined
        : () => (
            <Dropdown
              right
              options={[
                { id: 'camera', label: t('expenses.snapReceipt'), icon: 'camera' },
                { id: 'library', label: t('expenses.fromPhotos'), icon: 'photo.on.rectangle' },
                { id: 'manual', label: t('expenses.addManually'), icon: 'square.and.pencil' },
              ]}
              onPick={(id) => (id === 'manual' ? openForm() : snap(id as 'camera' | 'library'))}
            >
              <View accessibilityRole="button" accessibilityLabel={t('expenses.addExpense')} style={styles.addButton}>
                <Ionicons name="add" size={26} color={Colors.text} />
              </View>
            </Dropdown>
          ),
    });
  }, [nav, readOnly, openForm, snap, t]);

  if (!params.journeySyncId || !journeyId || journey === null) return <MissingRoute title={t('nav.expenses')} message={t('documents.tripGone')} />;
  if (journey === undefined || !loaded || !peopleLoaded) return <Stack.Screen options={{ title: t('nav.expenses') }} />;

  // By day, newest first; the list is already in that order.
  const days: { date: string; items: LocalExpense[] }[] = [];
  for (const e of expenses) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else days.push({ date: e.date, items: [e] });
  }
  const others = sums.slice(1);
  const settledWord = myNet > 0.004 ? t('expenses.youGetBack') : myNet < -0.004 ? t('expenses.youOwe') : t('expenses.balance');

  if (expenses.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: t('nav.expenses') }} />
        <Empty readOnly={readOnly} owner={journey.shared_owner_name ?? null} onSnap={chooseReceipt} onManual={() => openForm()} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('nav.expenses') }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!readOnly && (
          <FormCard>
            <FormField
              value={draft}
              onChangeText={setDraft}
              placeholder={t('expenses.quickPlaceholder', { currency })}
              returnKeyType="done"
              onSubmitEditing={quickAdd}
              blurOnSubmit={false}
              editable={!busy}
              autoCorrect={false}
              trailing={busy ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} style={styles.quickButton} />
            ) : draft.trim() ? (
              <Pressable onPress={quickAdd} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('expenses.add')} style={({ pressed }) => [styles.quickButton, pressed && { opacity: 0.6 }]}>
                <Ionicons name="arrow-up-circle" size={30} color={Colors.text} />
              </Pressable>
            ) : (
              <Pressable onPress={chooseReceipt} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('expenses.addReceipt')} style={({ pressed }) => [styles.quickButton, styles.quickCamera, pressed && { opacity: 0.6 }]}>
                <Ionicons name="camera-outline" size={20} color={Colors.text} />
              </Pressable>
            )}
            />
          </FormCard>
        )}

        <StatRow>
          <StatTile label={t('expenses.total')} {...tileAmount(sums[0].total, main)} />
          <StatTile label={t('expenses.yourPart')} {...tileAmount(myPart, main)} />
          {settledWord === t('expenses.balance')
            ? <StatTile label={settledWord} value={t('expenses.settled')} />
            : <StatTile label={settledWord} {...tileAmount(Math.abs(myNet), main)} />}
        </StatRow>
        {others.length > 0 && (
          <Text style={styles.note}>{t('expenses.also', { list: others.map((s) => `${formatAmount(s.total)} ${s.currency}`).join(' · ') })}</Text>
        )}

        {transfers.length > 0 && (
          <View style={styles.section}>
            <SectionHead title={t('expenses.settleUp')} />
            <DetailCard>
              {transfers.map((t, i) => (
                <View key={`${t.from}-${t.to}-${t.currency}`}>
                  {i > 0 && <DetailSeparator />}
                  <TransferRow transfer={t} meId={meId} nameOf={nameOf} person={people.get(t.from) ?? null} />
                </View>
              ))}
            </DetailCard>
          </View>
        )}

        {days.map((day) => (
          <View key={day.date} style={styles.section}>
            <SectionHead title={dayLabel(day.date, t)} />
            <View style={styles.list}>
              {day.items.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  receiptUri={receiptImageUri(e.receipt_document_id ? receiptOf.get(e.receipt_document_id) : null)}
                  nameOf={nameOf}
                  meId={meId}
                  onPress={() => openExpense(e)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

/** "Anna owes you 30 EUR": one payment that settles part of the trip. */
function TransferRow({ transfer: t, meId, nameOf, person }: { transfer: Transfer; meId: string | null; nameOf: (id: string | null) => string; person: { label: string; account: boolean; owner: boolean; seed: string | null } | null }) {
  const { t: tr } = useTranslation();
  const text = t.from === meId ? tr('expenses.youOweName', { name: nameOf(t.to) }) : t.to === meId ? tr('expenses.nameOwesYou', { name: nameOf(t.from) }) : tr('expenses.nameOwesName', { from: nameOf(t.from), to: nameOf(t.to) });
  return (
    <View style={styles.transfer}>
      {person ? <Avatar person={person} size={26} /> : <View style={styles.transferBlank} />}
      <Text style={styles.transferText} numberOfLines={1}>{text}</Text>
      <Text style={styles.transferAmount}>{formatAmount(t.amount)} <Text style={styles.transferCurrency}>{t.currency}</Text></Text>
    </View>
  );
}

/** Nothing paid yet: what the page is for, and the two ways in. */
function Empty({ readOnly, owner, onSnap, onManual }: { readOnly: boolean; owner: string | null; onSnap: () => void; onManual: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icons={[{ name: 'card', color: '#A6B4C2' }, { name: 'receipt', color: '#4DC1FF' }, { name: 'cash', color: '#A6B4C2' }]}
      title={t('expenses.nothingPaid')}
      subtitle={readOnly ? t('expenses.friendNoExpenses', { owner: owner ?? t('expenses.yourFriend') }) : t('expenses.typeHint')}
      primary={readOnly ? undefined : { label: t('expenses.snapReceipt'), icon: 'camera-outline', onPress: onSnap }}
      secondary={readOnly ? undefined : { label: t('expenses.addManually'), icon: 'add-circle-outline', onPress: onManual }}
    />
  );
}

const styles = StyleSheet.create({
  // Same page measures as the things to do.
  content: { padding: 16, paddingBottom: 100, gap: 20 },
  addButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  // One box for the camera, the send arrow and the spinner, so the row keeps
  // its height when typing swaps one for the other.
  quickButton: { alignItems: 'center', justifyContent: 'center', width: 36, height: 36, marginVertical: -6 },
  quickCamera: { borderRadius: 12, borderCurve: 'continuous', backgroundColor: Colors.surfaceSecondary },

  note: { ...Typography.bodySmall, color: Colors.textSecondary, paddingHorizontal: 4, marginTop: -8 },
  section: { gap: 10 },
  list: { gap: 10 },

  transfer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  transferBlank: { width: 26, height: 26 },
  transferText: { ...Typography.bodySmall, fontSize: FontSize.subheadline, flex: 1 },
  transferAmount: { ...Typography.bodySmall, fontSize: FontSize.subheadline, fontWeight: '600', fontVariant: ['tabular-nums'] },
  transferCurrency: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },

});
