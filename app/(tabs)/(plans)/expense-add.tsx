import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Calendar, type DateData } from 'react-native-calendars';
import * as Haptics from 'expo-haptics';
import { MoneyRow, TextArea, TextRow, amountText, parseAmount } from '../../../components/accommodationForm';
import { GlassPill } from '../../../components/GlassPill';
import { MissingRoute } from '../../../components/MissingRoute';
import { Card, ChoiceRow, Hint, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { Colors, systemColor } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useTravellerPeople } from '../../../hooks/useExpenses';
import { readReceipt } from '../../../lib/ai';
import { currencyForCountry } from '../../../lib/currencies';
import { getJourneyWithLegs, travellerLabel, type JourneyLeg, type JourneyTraveller } from '../../../lib/database';
import { formatDay, toYmd } from '../../../lib/days';
import { addExpense, getExpense, getExpensesForJourney, updateExpense, type LocalExpense } from '../../../lib/expenses';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ICONS,
  EXPENSE_CATEGORY_LABELS,
  equalShares,
  formatAmount,
  guessCategory,
  stopIdForDate,
  type ExpenseCategory,
} from '../../../lib/expenseModel';
import { consumePendingReceipt, fileReceipt, receiptImageUri, removeReceipt, type PickedReceipt, pickReceipt } from '../../../lib/receipts';
import { showToast } from '../../../lib/toast';
import { track } from '../../../lib/analytics';
import { useTranslation } from '../../../contexts/LanguageContext';

type Params = {
  journeyId: string;
  journeySyncId: string;
  /** An existing expense: the same form, filled in, and "Edit" on top. */
  id?: string;
  /** Words typed on the page that held no number: the title to start from. */
  title?: string;
  /** '1' when a receipt was photographed on the page and waits in lib/receipts. */
  receipt?: string;
};

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

/**
 * An expense, as a form like the others: how much and for what, who paid,
 * who shares, when, what kind, the receipt, notes. Saved with the
 * checkmark. A receipt photographed first is read, and what it says is
 * filled in before the form shows.
 */
export default function ExpenseAddSheet() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<Params>();
  const journeyId = Number(params.journeyId);
  const [legs, setLegs] = useState<JourneyLeg[] | null>(null);
  const [existing, setExisting] = useState<LocalExpense | null | undefined>(params.id ? undefined : null);
  const [lastCurrency, setLastCurrency] = useState<string | null | undefined>(undefined);
  const people = useTravellerPeople(journeyId);

  useEffect(() => {
    if (journeyId) getJourneyWithLegs(journeyId).then((j) => setLegs(j?.legs ?? []));
  }, [journeyId]);
  useEffect(() => {
    if (params.id) getExpense(params.id).then((e) => setExisting(e && !e.deleted ? e : null));
  }, [params.id]);
  useEffect(() => {
    if (params.journeySyncId) getExpensesForJourney(params.journeySyncId).then((list) => setLastCurrency(list[0]?.currency ?? null));
  }, [params.journeySyncId]);

  if (!params.journeySyncId || !journeyId) return <MissingRoute title="Expense" message="This trip is no longer here." />;
  if (params.id && existing === null) return <MissingRoute title="Expense" message="This expense is no longer here." />;
  if (existing === undefined || legs === null || lastCurrency === undefined || !people.loaded) {
    return <Stack.Screen options={{ title: params.id ? 'Edit expense' : 'Add an expense' }} />;
  }
  return (
    <Form
      key={existing?.id ?? 'new'}
      journeyId={journeyId}
      journeySyncId={params.journeySyncId}
      legs={legs}
      existing={existing}
      startTitle={params.title ?? ''}
      pendingReceipt={params.receipt === '1'}
      lastCurrency={lastCurrency}
      people={people}
    />
  );
}

function Form({
  journeyId,
  journeySyncId,
  legs,
  existing,
  startTitle,
  pendingReceipt,
  lastCurrency,
  people,
}: {
  journeyId: number;
  journeySyncId: string;
  legs: JourneyLeg[];
  existing: LocalExpense | null;
  startTitle: string;
  pendingReceipt: boolean;
  lastCurrency: string | null;
  people: ReturnType<typeof useTravellerPeople>;
}) {
  const nav = useNavigation();
  const { travellers, documents, uid, owner, meId, travellerIds, nameOf } = people;
  const today = toYmd(new Date());
  const stops = useMemo(() => legs.map((l) => ({ id: l.sync_id, start_date: l.start_date, end_date: l.end_date })), [legs]);
  const here = legs.find((l) => l.start_date <= today && today <= l.end_date) ?? legs[0];
  const suggested = existing?.currency ?? lastCurrency ?? currencyForCountry(here?.country_code) ?? 'EUR';

  const [picked, setPicked] = useState<PickedReceipt | null>(() => (pendingReceipt ? consumePendingReceipt() : null));
  const [amount, setAmount] = useState(amountText(existing?.amount ?? null));
  const [currency, setCurrency] = useState(existing?.currency ?? '');
  const [title, setTitle] = useState(existing?.title ?? startTitle);
  const [paidBy, setPaidBy] = useState<string | null>(existing ? existing.paid_by : meId);
  const [among, setAmong] = useState<Set<string>>(() => new Set(existing ? existing.shares.map((s) => s.traveller_id) : travellerIds));
  const [date, setDate] = useState(existing?.date ?? today);
  const [pickingDate, setPickingDate] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>(existing?.category ?? 'other');
  const [kindTouched, setKindTouched] = useState(!!existing);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [dropReceipt, setDropReceipt] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const existingReceipt = existing?.receipt_document_id ? documents.find((d) => d.sync_id === existing.receipt_document_id) ?? null : null;
  const receiptUri = picked?.uri ?? (dropReceipt ? null : receiptImageUri(existingReceipt));

  // A fresh receipt is read once, and only fills in what is still empty.
  useEffect(() => {
    if (!picked?.base64 || existing || amount.trim()) return;
    let cancelled = false;
    setReading(true);
    readReceipt(picked.base64, picked.mime)
      .then((r) => {
        if (cancelled) return;
        if (!r) {
          showToast(t('expenses.couldNotReadReceiptFill'));
          return;
        }
        setAmount((v) => v.trim() || amountText(r.amount));
        if (r.currency) setCurrency((v) => v || r.currency!);
        if (r.title) setTitle((v) => v.trim() || r.title!);
        if (r.date && r.date <= today) setDate(r.date);
        if (r.category && (EXPENSE_CATEGORIES as readonly string[]).includes(r.category)) {
          setCategory(r.category as ExpenseCategory);
          setKindTouched(true);
        }
      })
      .catch((err: any) => { if (!cancelled) showToast(err?.message ?? t('expenses.couldNotReadReceipt'), 'error'); })
      .finally(() => { if (!cancelled) setReading(false); });
    return () => { cancelled = true; };
    // once, for the picture that came with the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.uri]);

  // The kind follows the words until the user picks one.
  useEffect(() => {
    if (!kindTouched) setCategory(guessCategory(title));
  }, [title, kindTouched]);

  const parsedAmount = parseAmount(amount);
  const amountOk = typeof parsedAmount === 'number' && parsedAmount > 0;
  const effectiveCurrency = currency || (amount.trim() ? suggested : '');
  const each = amountOk && among.size > 0 ? equalShares(parsedAmount, [...among])[0].amount : null;

  const toggle = (id: string) => {
    Haptics.selectionAsync();
    setAmong((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addReceipt = async (source: 'camera' | 'library') => {
    try {
      const p = await pickReceipt(source);
      if (p) {
        setPicked(p);
        setDropReceipt(false);
      }
    } catch (err: any) {
      showToast(err?.message ?? t('expenses.couldNotOpenCamera'), 'error');
    }
  };

  const save = async () => {
    if (saving || !amountOk) return;
    setSaving(true);
    try {
      const name = title.trim() || EXPENSE_CATEGORY_LABELS[category];
      const order = travellerIds.filter((id) => among.has(id));
      let receiptId = existing?.receipt_document_id ?? null;
      if (picked) {
        const doc = await fileReceipt(journeyId, name, picked, uid);
        receiptId = doc.sync_id;
      } else if (dropReceipt) {
        receiptId = null;
      }
      const input = {
        title: name,
        amount: parsedAmount,
        currency: effectiveCurrency,
        paid_by: paidBy,
        shares: amountOk ? equalShares(parsedAmount, order) : [],
        date,
        category,
        notes: notes.trim() || null,
        receipt_document_id: receiptId,
        ...(picked && { source: 'receipt' as const }),
      };
      const stop = stopIdForDate(stops, date);
      if (existing) {
        await updateExpense(existing.id, input, date !== existing.date ? stop : undefined);
        if (existingReceipt && (picked || dropReceipt)) await removeReceipt(existingReceipt, journeySyncId);
      } else {
        await addExpense(journeySyncId, stop, { ...input, source: picked ? 'receipt' : 'manual' });
        track({ name: 'expense_added', props: { source: picked ? 'receipt' : 'form' } });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.goBack();
      showToast(t('plans.saved'));
    } catch (err: any) {
      showToast(err?.message ?? t('plans.couldNotSave'), 'error');
      setSaving(false);
    }
  };

  const label = (t: JourneyTraveller) => travellerLabel(t, uid, owner);
  const listed = travellers.filter((t) => t.sync_id);

  return (
    <>
      <Stack.Screen
        options={{
          title: existing ? t('expenses.editExpense') : t('expenses.addExpense'),
          headerRight: () => (
            <Pressable onPress={save} disabled={saving || !amountOk} hitSlop={8} style={{ opacity: saving || !amountOk ? 0.4 : 1 }} accessibilityRole="button" accessibilityLabel={t('common.save')}>
              <SymbolView name={{ ios: 'checkmark', android: 'check' }} tintColor={systemColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={visaFormStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <SectionLabel>{t('expenses.howMuch')}</SectionLabel>
        <Card>
          <MoneyRow label={t('expenses.amount')} amount={amount} currency={currency} suggested={suggested} onCommit={(a, c) => { setAmount(a); setCurrency(c); }} live />
          <TextRow label={t('expenses.forLabel')} value={title} onCommit={setTitle} live placeholder={t('expenses.forPlaceholder')} autoCapitalize="sentences" last />
        </Card>
        {reading && (
          <View style={styles.reading}>
            <ActivityIndicator size="small" color={Colors.textSecondary} />
            <Text style={styles.readingText}>{t('expenses.readingReceipt')}</Text>
          </View>
        )}

        {listed.length > 0 && (
          <>
            <SectionLabel>{t('expenses.paidBy')}</SectionLabel>
            <Card>
              {listed.map((t, i) => (
                <ChoiceRow key={t.sync_id} title={label(t)} selected={paidBy === t.sync_id} onPress={() => setPaidBy(t.sync_id)} last={i === listed.length - 1} />
              ))}
            </Card>

            <SectionLabel>{t('expenses.splitAmong')}</SectionLabel>
            <Card>
              {listed.map((t, i) => (
                <ChoiceRow key={t.sync_id} title={label(t)} selected={among.has(t.sync_id!)} onPress={() => toggle(t.sync_id!)} last={i === listed.length - 1} />
              ))}
            </Card>
            <Hint>{among.size === 0 ? (nameOf(paidBy) === 'You' ? t('expenses.notSplitYours') : t('expenses.notSplitName', { name: nameOf(paidBy) })) : each !== null ? t('expenses.eachShare', { amount: formatAmount(each), currency: effectiveCurrency }) : t('expenses.equalParts')}</Hint>
          </>
        )}

        <SectionLabel>{t('expenses.when')}</SectionLabel>
        <Card>
          <Pressable style={styles.dateRow} onPress={() => { Haptics.selectionAsync(); setPickingDate((v) => !v); }}>
            <Text style={styles.dateLabel}>{t('expenses.date')}</Text>
            <View style={styles.dateRight}>
              <Text style={styles.dateValue}>{date === today ? t('expenses.today') : formatDay(date)}</Text>
              <Ionicons name={pickingDate ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textTertiary} />
            </View>
          </Pressable>
          {pickingDate && (
            <>
              <View style={styles.separator} />
              <View style={styles.calendar}>
                <Calendar
                  current={date}
                  maxDate={today}
                  markedDates={{ [date]: { selected: true, selectedColor: Colors.text } }}
                  onDayPress={(day: DateData) => { Haptics.selectionAsync(); setDate(day.dateString); setPickingDate(false); }}
                  theme={CALENDAR_THEME}
                />
              </View>
            </>
          )}
        </Card>

        <SectionLabel>{t('expenses.whatKind')}</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindsScroll} contentContainerStyle={styles.kinds} keyboardShouldPersistTaps="handled">
          {EXPENSE_CATEGORIES.map((c) => {
            const on = c === category;
            return (
              <GlassPill key={c} active={on} onPress={() => { Haptics.selectionAsync(); setCategory(c); setKindTouched(true); }}>
                <View style={styles.pillInner}>
                  <Ionicons name={EXPENSE_CATEGORY_ICONS[c] as keyof typeof Ionicons.glyphMap} size={14} color={on ? Colors.white : Colors.text} />
                  <Text style={[styles.pillLabel, on && styles.pillLabelActive]}>{EXPENSE_CATEGORY_LABELS[c]}</Text>
                </View>
              </GlassPill>
            );
          })}
        </ScrollView>

        <SectionLabel>Receipt</SectionLabel>
        {receiptUri ? (
          <Card>
            <View style={styles.pickedRow}>
              <Image source={{ uri: receiptUri }} style={styles.thumb} contentFit="cover" />
              <View style={styles.pickedText}>
                <Text style={styles.pickedName}>{picked ? t('expenses.newPhoto') : t('expenses.receipt')}</Text>
                <Text style={styles.pickedMime}>{picked ? t('expenses.savedWithExpense') : t('expenses.alreadyOnIt')}</Text>
              </View>
              <Pressable onPress={() => { setPicked(null); setDropReceipt(true); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('expenses.removeReceipt')}>
                <Ionicons name="close-circle" size={22} color={Colors.textTertiary} />
              </Pressable>
            </View>
          </Card>
        ) : (
          <Card>
            <SourceRow icon="camera-outline" title={t('expenses.takePhoto')} subtitle={t('expenses.billTicket')} onPress={() => addReceipt('camera')} />
            <View style={styles.separator} />
            <SourceRow icon="images-outline" title={t('expenses.fromPhotos')} subtitle={t('expenses.screenshotPhoto')} onPress={() => addReceipt('library')} />
          </Card>
        )}

        <SectionLabel>{t('expenses.notes')}</SectionLabel>
        <Card>
          <TextArea value={notes} onCommit={setNotes} live placeholder={t('expenses.notesPlaceholder')} last />
        </Card>
      </ScrollView>
    </>
  );
}

function SourceRow({ icon, title, subtitle, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={({ pressed }) => [styles.sourceRow, pressed && { opacity: 0.55 }]}>
      <View style={styles.thumbIcon}>
        <Ionicons name={icon} size={20} color={Colors.text} />
      </View>
      <View style={styles.pickedText}>
        <Text style={styles.pickedName}>{title}</Text>
        <Text style={styles.pickedMime}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  reading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginTop: -6 },
  readingText: { ...Typography.bodySmall, color: Colors.textSecondary },

  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, gap: 12 },
  dateLabel: { ...Typography.titleSmall, fontWeight: '500' },
  dateRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateValue: { ...Typography.titleSmall, fontWeight: '500', fontVariant: ['tabular-nums'] },
  calendar: { marginHorizontal: -12, paddingVertical: 4 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0, 0, 0, 0.08)', marginHorizontal: -20 },

  kindsScroll: { marginHorizontal: -20 },
  kinds: { paddingHorizontal: 20, gap: 8 },
  pillInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillLabel: { ...Typography.label, fontWeight: '600' },
  pillLabelActive: { color: Colors.white },

  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, minHeight: 60 },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  thumb: { width: 44, height: 56, borderRadius: 10, backgroundColor: Colors.surfaceSecondary },
  thumbIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickedText: { flex: 1, gap: 1 },
  pickedName: { ...Typography.titleSmall, fontWeight: '500' },
  pickedMime: { ...Typography.bodySmall, color: Colors.textSecondary },
});
