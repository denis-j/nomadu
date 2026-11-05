import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ExpenseRow } from '../../../components/expenses/ExpenseRow';
import { CloudyButton } from '../../../components/CloudyButton';
import { MissingRoute } from '../../../components/MissingRoute';
import { DetailCard, DetailSeparator, SectionHead } from '../../../components/SheetRows';
import { StatRow, StatTile } from '../../../components/StatTile';
import { Avatar } from '../../../components/TravellerAvatars';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useJourneyExpenses, useTravellerPeople } from '../../../hooks/useExpenses';
import { currencyForCountry } from '../../../lib/currencies';
import { getJourneyWithLegs, type JourneyLeg, type JourneyWithLegs } from '../../../lib/database';
import { fromYmd, toYmd } from '../../../lib/days';
import { addExpense, type LocalExpense } from '../../../lib/expenses';
import { balances, formatAmount, guessCategory, parseQuickEntry, settleUp, shareOf, stopIdForDate, totals, type Transfer } from '../../../lib/expenseModel';
import { pickReceipt, receiptImageUri, setPendingReceipt } from '../../../lib/receipts';
import { showToast } from '../../../lib/toast';
import { track } from '../../../lib/analytics';

type Params = {
  journeyId: string;
  journeySyncId: string;
  /** '1' on a friend's trip we may not plan: shown as it is. */
  readOnly?: string;
};

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/** "Today", "Yesterday", "Nov 6", "Nov 6, 2025": the heading over a day's expenses. */
function dayLabel(ymd: string): string {
  const today = toYmd(new Date());
  if (ymd === today) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (ymd === toYmd(y)) return 'Yesterday';
  const d = fromYmd(ymd);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
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
      const title = parsed.title || 'Expense';
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
      showToast(`${formatAmount(parsed.amount)} ${parsed.currency} added`);
      await refresh();
    } catch (err: any) {
      showToast(err?.message ?? 'Could not add', 'error');
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
      showToast(err?.message ?? 'Could not open the camera', 'error');
    }
  }, [openForm]);

  const chooseReceipt = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== 'ios') {
      snap('library');
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Take a photo', 'From Photos', 'Cancel'], cancelButtonIndex: 2 },
      (i) => { if (i === 0) snap('camera'); else if (i === 1) snap('library'); },
    );
  }, [snap]);

  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: readOnly
        ? undefined
        : () => (
            <Pressable hitSlop={12} onPress={() => openForm()} accessibilityRole="button" accessibilityLabel="Add an expense">
              <Ionicons name="add" size={26} color={Colors.text} />
            </Pressable>
          ),
    });
  }, [nav, readOnly, openForm]);

  if (!params.journeySyncId || !journeyId || journey === null) return <MissingRoute title="Expenses" message="This trip is no longer here." />;
  if (journey === undefined || !loaded || !peopleLoaded) return <Stack.Screen options={{ title: 'Expenses' }} />;

  // By day, newest first; the list is already in that order.
  const days: { date: string; items: LocalExpense[] }[] = [];
  for (const e of expenses) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else days.push({ date: e.date, items: [e] });
  }
  const others = sums.slice(1);
  const settledWord = myNet > 0.004 ? 'You get back' : myNet < -0.004 ? 'You owe' : 'Balance';

  return (
    <>
      <Stack.Screen options={{ title: 'Expenses' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!readOnly && (
          <Glass {...glassProps} style={[styles.quick, !hasGlass && styles.quickFallback]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`Dinner 42, Taxi 12.50 ${currency}…`}
              placeholderTextColor={Colors.textTertiary}
              style={styles.quickInput}
              returnKeyType="done"
              onSubmitEditing={quickAdd}
              blurOnSubmit={false}
              editable={!busy}
              autoCorrect={false}
            />
            {busy ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} style={styles.quickButton} />
            ) : draft.trim() ? (
              <Pressable onPress={quickAdd} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add" style={({ pressed }) => [styles.quickButton, pressed && { opacity: 0.6 }]}>
                <Ionicons name="arrow-up-circle" size={30} color={Colors.text} />
              </Pressable>
            ) : (
              <Pressable onPress={chooseReceipt} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add a receipt" style={({ pressed }) => [styles.quickButton, styles.quickCamera, pressed && { opacity: 0.6 }]}>
                <Ionicons name="camera-outline" size={20} color={Colors.text} />
              </Pressable>
            )}
          </Glass>
        )}

        {expenses.length === 0 ? (
          <Empty readOnly={readOnly} owner={journey.shared_owner_name ?? null} onSnap={chooseReceipt} onManual={() => openForm()} />
        ) : (
          <>
            <StatRow>
              <StatTile label="Total" value={formatAmount(sums[0].total)} unit={main} />
              <StatTile label="Your part" value={formatAmount(myPart)} unit={main} />
              <StatTile label={settledWord} value={settledWord === 'Balance' ? 'Settled' : formatAmount(Math.abs(myNet))} unit={settledWord === 'Balance' ? undefined : main} />
            </StatRow>
            {others.length > 0 && (
              <Text style={styles.note}>Also {others.map((s) => `${formatAmount(s.total)} ${s.currency}`).join(' · ')}</Text>
            )}

            {transfers.length > 0 && (
              <View style={styles.section}>
                <SectionHead title="Settle up" />
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
                <SectionHead title={dayLabel(day.date)} />
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
          </>
        )}
      </ScrollView>
    </>
  );
}

/** "Anna owes you 30 EUR": one payment that settles part of the trip. */
function TransferRow({ transfer: t, meId, nameOf, person }: { transfer: Transfer; meId: string | null; nameOf: (id: string | null) => string; person: { label: string; account: boolean; owner: boolean; seed: string | null } | null }) {
  const text = t.from === meId ? `You owe ${nameOf(t.to)}` : t.to === meId ? `${nameOf(t.from)} owes you` : `${nameOf(t.from)} owes ${nameOf(t.to)}`;
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
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="receipt-outline" size={26} color={Colors.text} />
      </View>
      <Text style={styles.emptyTitle}>Nothing paid yet</Text>
      <Text style={styles.emptyText}>
        {readOnly
          ? `${owner ?? 'Your friend'} has not added any expenses yet.`
          : 'Type what and how much above, like Dinner 42. It is split among everyone on the trip, and you can change that on the expense.'}
      </Text>
      {!readOnly && (
        <>
          <CloudyButton onPress={onSnap} style={styles.emptyCta} innerStyle={styles.emptyCtaInner}>
            <Ionicons name="camera-outline" size={20} color={Colors.cloudyButtonText} />
            <Text style={styles.emptyCtaText}>Snap a receipt</Text>
          </CloudyButton>
          <Pressable onPress={onManual} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.55 }]}>
            <Ionicons name="add-circle-outline" size={20} color={Colors.text} />
            <Text style={styles.secondaryText}>Add manually</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same page measures as the things to do.
  content: { padding: 16, paddingBottom: 100, gap: 20 },

  // The line to type into, as the link field: a glass row with one button.
  quick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 56,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  quickFallback: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  quickInput: { ...Typography.bodyLarge, flex: 1, color: Colors.text, paddingVertical: 14 },
  quickButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  quickCamera: { borderRadius: 12, borderCurve: 'continuous', backgroundColor: Colors.surfaceSecondary, width: 36, height: 36 },

  note: { ...Typography.bodySmall, color: Colors.textSecondary, paddingHorizontal: 4, marginTop: -8 },
  section: { gap: 10 },
  list: { gap: 10 },

  transfer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  transferBlank: { width: 26, height: 26 },
  transferText: { ...Typography.bodySmall, fontSize: 14, flex: 1 },
  transferAmount: { ...Typography.bodySmall, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  transferCurrency: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },

  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12, gap: 10 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { ...Typography.titleLarge, textAlign: 'center', letterSpacing: -0.4 },
  emptyText: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 10 },
  emptyCta: { width: '100%' },
  emptyCtaInner: { justifyContent: 'center', gap: 10 },
  emptyCtaText: { ...Typography.titleSmall, fontWeight: '700', color: Colors.cloudyButtonText },
  secondary: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Colors.border,
  },
  secondaryText: { ...Typography.button },
});
