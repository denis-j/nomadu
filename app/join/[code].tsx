import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CloudyButton } from '../../components/CloudyButton';
import { Flag } from '../../components/Flag';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { useSync } from '../../contexts/SyncContext';
import { getJourneyBySyncId, parseDate } from '../../lib/database';
import { joinJourney, myName, previewInvite, setPendingInvite, type InvitePreview } from '../../lib/sharing';
import { pullSharedJourneysFromCloud } from '../../lib/sync';
import { showToast } from '../../lib/toast';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const fmt = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
  const { cloudSyncEnabled, setCloudSyncEnabled } = useSync();

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
      // A followed trip lives in the cloud, so the phone has to be on it.
      if (cloudSyncEnabled !== true) await setCloudSyncEnabled(true);
      await joinJourney(code!, name.trim());
      await pullSharedJourneysFromCloud(user.uid);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`You are on ${preview.title}`);
      await openTrip(preview.journey_id);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not join', 'error');
      setBusy(false);
    }
  };

  const countries = preview ? [...new Set(preview.stops.map((s) => s.country_code).filter(Boolean))] : [];
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
            <Text style={styles.who}>{preview.owner_name} invites you along</Text>
            <Text style={styles.title}>{preview.title}</Text>
            <Text style={styles.span}>
              {preview.start_date && preview.end_date ? `${fmt(preview.start_date)} – ${fmt(preview.end_date)} · ${nights} days` : 'No dates yet'}
              {preview.stops.length ? ` · ${preview.stops.length} ${preview.stops.length === 1 ? 'stop' : 'stops'}` : ''}
            </Text>
            {countries.length > 0 && (
              <View style={styles.flags}>
                {countries.slice(0, 8).map((c) => <Flag key={c} code={c} size={22} />)}
              </View>
            )}

            <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
              {preview.stops.slice(0, 6).map((s, i) => (
                <View key={i} style={styles.stopRow}>
                  <Flag code={s.country_code} size={18} />
                  <Text style={styles.stopCity} numberOfLines={1}>{s.city}</Text>
                </View>
              ))}
              {preview.stops.length > 6 && <Text style={styles.more}>and {preview.stops.length - 6} more</Text>}
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
  content: { padding: 24, paddingTop: 36, gap: 12, paddingBottom: 60 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  hint: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  who: { ...Typography.bodySmall, color: Colors.textSecondary },
  title: { ...Typography.titleLarge, marginTop: -6 },
  span: { ...Typography.body, color: Colors.textSecondary, fontVariant: ['tabular-nums'], marginTop: -8 },
  flags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  card: {
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  cardFallback: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  stopCity: { ...Typography.titleSmall, fontWeight: '500', flex: 1 },
  more: { ...Typography.bodySmall, color: Colors.textTertiary, paddingVertical: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  nameLabel: { ...Typography.titleSmall, fontWeight: '500' },
  nameInput: { ...Typography.titleSmall, fontWeight: '400', flex: 1, textAlign: 'right' },
  cta: { width: '100%', marginTop: 6 },
  ctaInner: { justifyContent: 'center' },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
  foot: { ...Typography.bodySmall, color: Colors.textTertiary, textAlign: 'center', paddingHorizontal: 12 },
  close: { position: 'absolute', top: 14, right: 20 },
});
