import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Dropdown } from '../../../components/Dropdown';
import { MissingRoute } from '../../../components/MissingRoute';
import { DetailCard, DetailNotes, DetailRow, DetailSeparator, LinkCard } from '../../../components/SheetRows';
import { StatRow, StatTile } from '../../../components/StatTile';
import { Avatar } from '../../../components/TravellerAvatars';
import { SectionLabel } from '../../../components/visaForm';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useTravellerPeople } from '../../../hooks/useExpenses';
import { getJourneyWithLegs, parseDate, type JourneyLeg } from '../../../lib/database';
import { formatDay } from '../../../lib/days';
import { deleteExpense, getExpense, updateExpense, type LocalExpense } from '../../../lib/expenses';
import { EXPENSE_CATEGORY_ICONS, EXPENSE_CATEGORY_LABELS, formatAmount } from '../../../lib/expenseModel';
import { receiptImageUri, removeReceipt } from '../../../lib/receipts';
import { showToast } from '../../../lib/toast';

type Params = { id: string; journeyId: string; readOnly?: string };

const hasGlass = isLiquidGlassAvailable();
const GlassCard = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const NO_STOP = '__none__';
const fmtShort = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * One expense, built like a thing to do's sheet: the receipt on top with a
 * glass plate, the title centred under it, three tiles, a card of facts,
 * who pays what, and the plain words at the end. Nothing is edited here;
 * "Edit" opens the form.
 */
export default function ExpenseSheet() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const readOnly = params.readOnly === '1';
  const journeyId = Number(params.journeyId);
  const [e, setE] = useState<LocalExpense | null | undefined>(undefined);
  const [legs, setLegs] = useState<JourneyLeg[]>([]);
  const [failed, setFailed] = useState(false);
  const { documents, people, meId, nameOf } = useTravellerPeople(journeyId);

  const load = useCallback(() => {
    if (params.id) getExpense(params.id).then((x) => setE(x && !x.deleted ? x : null));
    if (journeyId) getJourneyWithLegs(journeyId).then((j) => setLegs(j?.legs ?? []));
  }, [params.id, journeyId]);
  useFocusEffect(load);

  const receipt = useMemo(() => (e?.receipt_document_id ? documents.find((d) => d.sync_id === e.receipt_document_id) ?? null : null), [documents, e?.receipt_document_id]);

  if (e === undefined) return <Stack.Screen options={{ headerShown: false }} />;
  if (e === null) return <MissingRoute title="Expense" message="This expense is no longer here." />;

  const picture = receiptImageUri(receipt);
  const stop = legs.find((l) => l.sync_id === e.stop_id) ?? null;
  const icon = EXPENSE_CATEGORY_ICONS[e.category] as keyof typeof Ionicons.glyphMap;
  const payer = nameOf(e.paid_by);
  const stopValue = stop ? `${stop.city}, ${fmtShort(stop.start_date)} – ${fmtShort(stop.end_date)}` : 'No stop';

  const move = async (id: string) => {
    try {
      setE(await updateExpense(e.id, {}, id === NO_STOP ? null : id));
      showToast('Moved');
    } catch (err: any) {
      showToast(err?.message ?? 'Could not save', 'error');
    }
  };

  const edit = () => {
    // Swap the sheet for the form in one go, as the stop sheet does.
    router.replace({ pathname: '/(tabs)/(plans)/expense-add', params: { id: e.id, journeyId: params.journeyId, journeySyncId: e.journey_id } });
  };

  const remove = () => {
    Alert.alert(`Delete ${e.title}?`, receipt ? 'The receipt goes with it.' : undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(e.id);
            if (receipt) await removeReceipt(receipt, e.journey_id);
          } catch (err: any) {
            showToast(err?.message ?? 'Could not delete', 'error');
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
          showToast('Deleted');
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        {picture && !failed ? (
          <View style={styles.hero}>
            <Image source={{ uri: picture }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
            <GlassCard {...glassProps} style={[styles.heroPlate, !hasGlass && styles.heroPlateFallback]}>
              <Ionicons name={icon} size={18} color={Colors.text} />
            </GlassCard>
          </View>
        ) : null}

        <View style={[styles.header, !picture && styles.headerAlone]}>
          <Text style={styles.title}>{e.title}</Text>
          <Text style={styles.where}>{payer === 'You' ? 'You paid' : `${payer} paid`} · {formatDay(e.date)}</Text>
        </View>

        <StatRow style={styles.statsRow}>
          <StatTile label="Amount" value={formatAmount(e.amount)} unit={e.currency} />
          <StatTile label="Paid by" value={payer} />
          <StatTile label="Split" value={e.shares.length === 0 ? 'Not split' : `${e.shares.length}`} unit={e.shares.length === 0 ? undefined : e.shares.length === 1 ? 'person' : 'people'} />
        </StatRow>

        <View style={styles.section}>
          <SectionLabel>Details</SectionLabel>
          <DetailCard>
            <DetailRow icon="calendar-outline" label="Date" value={formatDay(e.date)} />
            <DetailSeparator />
            {readOnly || legs.length === 0 ? (
              <DetailRow icon="location-outline" label="Stop" value={stopValue} />
            ) : (
              <DetailRow
                icon="location-outline"
                label="Stop"
                right={(
                  <Dropdown
                    right
                    title="Move to"
                    value={e.stop_id ?? NO_STOP}
                    options={[
                      ...legs.filter((l) => l.sync_id).map((l) => ({ id: l.sync_id!, label: l.city, subtitle: `${fmtShort(l.start_date)} – ${fmtShort(l.end_date)}` })),
                      { id: NO_STOP, label: 'No stop' },
                    ]}
                    onPick={move}
                  >
                    <View style={styles.pick}>
                      <Text style={styles.pickText} numberOfLines={1}>{stopValue}</Text>
                      <Ionicons name="chevron-expand" size={14} color={Colors.textTertiary} />
                    </View>
                  </Dropdown>
                )}
              />
            )}
            <DetailSeparator />
            <DetailRow icon={icon} label="Kind" value={EXPENSE_CATEGORY_LABELS[e.category]} />
            {e.notes ? (
              <>
                <DetailSeparator />
                <DetailNotes text={e.notes} />
              </>
            ) : null}
          </DetailCard>
        </View>

        {e.shares.length > 0 && (
          <View style={styles.section}>
            <SectionLabel>Who pays what</SectionLabel>
            <DetailCard>
              {e.shares.map((s, i) => {
                const person = people.get(s.traveller_id) ?? null;
                return (
                  <View key={s.traveller_id}>
                    {i > 0 && <DetailSeparator />}
                    <View style={styles.shareRow}>
                      {person ? <Avatar person={person} size={26} /> : <View style={styles.shareBlank} />}
                      <Text style={[styles.shareName, s.traveller_id === meId && styles.shareMine]} numberOfLines={1}>
                        {nameOf(s.traveller_id)}{s.traveller_id === e.paid_by ? ' · paid' : ''}
                      </Text>
                      <Text style={styles.shareAmount}>{formatAmount(s.amount)} <Text style={styles.shareCurrency}>{e.currency}</Text></Text>
                    </View>
                  </View>
                );
              })}
            </DetailCard>
          </View>
        )}

        {receipt ? (
          <View style={styles.section}>
            <LinkCard icon="receipt-outline" title="Receipt" sub={picture ? 'The photo, full size' : 'The file'} onPress={() => router.push({ pathname: '/(tabs)/(plans)/document', params: { id: String(receipt.id) } })} />
          </View>
        ) : null}

        {!readOnly && (
          <View style={styles.actions}>
            <TouchableOpacity onPress={edit} activeOpacity={0.5}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={remove} activeOpacity={0.5}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </>
  );
}

// Same measures as the stop's sheet (stop-info.tsx).
const styles = StyleSheet.create({
  content: { paddingBottom: 60 },
  hero: {
    height: 300,
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 24,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
  heroPlate: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  heroPlateFallback: { backgroundColor: 'rgba(255,255,255,0.9)' },
  header: { alignItems: 'center', paddingTop: 20, paddingBottom: 4, paddingHorizontal: 24, gap: 2 },
  headerAlone: { paddingTop: 32 },
  title: { ...Typography.displayMedium, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  where: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  statsRow: { marginHorizontal: 16, marginTop: 20 },
  section: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  pickText: { ...Typography.bodySmall, fontSize: 14, fontWeight: '500', flexShrink: 1 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareBlank: { width: 26, height: 26 },
  shareName: { ...Typography.bodySmall, fontSize: 14, flex: 1 },
  shareMine: { fontWeight: '600' },
  shareAmount: { ...Typography.bodySmall, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  shareCurrency: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginHorizontal: 16, marginTop: 24, paddingVertical: 14 },
  editText: { ...Typography.bodyMedium, fontWeight: '600' },
  deleteText: { ...Typography.bodyMedium, color: Colors.error },
});
