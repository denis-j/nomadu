import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { CloudyButton } from '../../components/CloudyButton';
import { Flag } from '../../components/Flag';
import { StatRow, StatTile } from '../../components/StatTile';
import { Avatar } from '../../components/TravellerAvatars';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { getJourneyBySyncId, parseDate } from '../../lib/database';
import { joinJourney, myName, previewInvite, setPendingInvite, type InvitePreview } from '../../lib/sharing';
import { pullSharedJourneysFromCloud } from '../../lib/sync';
import { showToast } from '../../lib/toast';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const fmt = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Nov 10 – 13" inside a month, "Nov 28 – Dec 2" across one, as on the itinerary. */
function fmtRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) return `${fmt(start)} – ${e.getDate()}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

/** "in 49 days", "Tomorrow", "Under way": when the trip starts, from today. */
function startsIn(start: string | null): { label: string; value: string; unit?: string } {
  if (!start) return { label: 'Starts', value: 'No dates' };
  const days = Math.round((parseDate(start).getTime() - parseDate(new Date().toISOString().slice(0, 10)).getTime()) / 86_400_000);
  if (days < 0) return { label: 'Trip', value: 'Under way' };
  if (days === 0) return { label: 'Starts', value: 'Today' };
  if (days === 1) return { label: 'Starts', value: 'Tomorrow' };
  return { label: 'Starts', value: `in ${days}`, unit: 'days' };
}

/**
 * The end of an invite link: `nomady://join/{code}`.
 *
 * What the trip is, who is asking, and one button. The name field is the
 * only question, because it is what the others will see in the wallet and
 * an email account has no name on it. Signed out, the code is kept and the
 * sheet comes back once the tabs are up (see the tabs layout).
 */
export default function JoinTripScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(myName());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setPendingInvite(code ?? null);
      return;
    }
    if (!code) return;
    previewInvite(code)
      .then(setPreview)
      .catch((err: any) => setError(err?.message ?? 'This invite is no longer valid.'));
  }, [code, user, authLoading]);

  // Close this sheet first and push once it is gone: a page pushed while
  // a sheet is still up is laid out in the space behind the sheet.
  const openTrip = async (syncId: string) => {
    const local = await getJourneyBySyncId(syncId);
    router.back();
    setTimeout(() => router.push((local ? `/(tabs)/(plans)/${local.id}` : '/(tabs)/(plans)') as any), 350);
  };

  const join = async () => {
    if (!user || !preview || busy) return;
    if (!name.trim()) {
      showToast('Tell the others your name', 'error');
      return;
    }
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const joined = await joinJourney(code!, name.trim());
      await pullSharedJourneysFromCloud(user.uid);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`You are on ${preview.title}`);
      await openTrip(joined.journey_id);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not join', 'error');
      setBusy(false);
    }
  };

  const starts = startsIn(preview?.start_date ?? null);
  const nights = preview?.start_date && preview.end_date
    ? Math.round((parseDate(preview.end_date).getTime() - parseDate(preview.start_date).getTime()) / 86_400_000) + 1
    : 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        {!user && !authLoading && (
          <Text style={styles.hint}>Sign in to come along.</Text>
        )}
        {error && (
          <View style={styles.center}>
            <Ionicons name="link-outline" size={28} color={Colors.textTertiary} />
            <Text style={styles.hint}>{error}</Text>
          </View>
        )}
        {user && !preview && !error && (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.textTertiary} />
          </View>
        )}
        {preview && (
          <>
            {/* The inviter, with the face they carry on the trip itself. */}
            <View style={styles.whoRow}>
              <Avatar person={{ label: preview.owner_name, account: true, owner: true, seed: preview.owner_avatar }} size={44} />
              <View style={styles.whoText}>
                <Text style={styles.who}>{preview.owner_name} invites you along</Text>
                <Text style={styles.title}>{preview.title}</Text>
              </View>
            </View>
            {/* The trip in three numbers, as on a stop's sheet */}
            <StatRow style={styles.stats}>
              <StatTile label="Duration" value={`${nights}`} unit={nights === 1 ? 'day' : 'days'} />
              <StatTile label="Stops" value={`${preview.stops.length}`} />
              <StatTile {...starts} />
            </StatRow>

            <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
              {preview.stops.slice(0, 6).map((s, i) => (
                <View key={i}>
                  {i > 0 && <View style={styles.separator} />}
                  <View style={styles.stopRow}>
                    <Flag code={s.country_code} size={20} />
                    <Text style={styles.stopCity} numberOfLines={1}>{s.city}</Text>
                    {s.start_date && s.end_date ? (
                      <Text style={styles.stopDates}>{fmtRange(s.start_date, s.end_date)}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
              {preview.stops.length > 6 && (
                <>
                  <View style={styles.separator} />
                  <Text style={styles.more}>and {preview.stops.length - 6} more</Text>
                </>
              )}
            </Glass>

            {preview.is_owner || preview.is_member ? (
              <CloudyButton onPress={() => openTrip(preview.journey_id)} style={styles.cta} innerStyle={styles.ctaInner}>
                <Text style={styles.ctaText}>{preview.is_owner ? 'This is your trip' : 'Open the trip'}</Text>
              </CloudyButton>
            ) : (
              <>
                <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
                  <View style={styles.nameRow}>
                    <Text style={styles.nameLabel}>Your name</Text>
                    <TextInput
                      style={styles.nameInput}
                      value={name}
                      onChangeText={setName}
                      placeholder="For the others"
                      placeholderTextColor={Colors.textTertiary}
                      autoCapitalize="words"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={join}
                    />
                  </View>
                </Glass>
                <CloudyButton onPress={join} style={styles.cta} innerStyle={styles.ctaInner}>
                  <Text style={styles.ctaText}>{busy ? 'Joining…' : 'Come along'}</Text>
                </CloudyButton>
                <Text style={styles.foot}>
                  The trip shows up under Plans, on your phone, and follows what {preview.owner_name} changes.
                </Text>
              </>
            )}
          </>
        )}
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 32, gap: 14, paddingBottom: 60 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  hint: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 32 },
  whoText: { flex: 1, gap: 1 },
  who: { ...Typography.bodySmall, color: Colors.textSecondary },
  title: { ...Typography.titleLarge },
  stats: { marginTop: 2 },
  card: {
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  cardFallback: { borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 30 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  stopCity: { ...Typography.titleSmall, fontWeight: '500', flex: 1 },
  stopDates: { ...Typography.bodySmall, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  more: { ...Typography.bodySmall, color: Colors.textTertiary, paddingVertical: 13 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  nameLabel: { ...Typography.titleSmall, fontWeight: '500' },
  nameInput: { ...Typography.titleSmall, fontWeight: '400', flex: 1, textAlign: 'right' },
  cta: { width: '100%', marginTop: 6 },
  ctaInner: { justifyContent: 'center' },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
  foot: { ...Typography.bodySmall, color: Colors.textTertiary, textAlign: 'center', paddingHorizontal: 12 },
  close: { position: 'absolute', top: 14, right: 20 },
});
