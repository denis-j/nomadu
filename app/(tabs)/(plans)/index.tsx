import { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { AvatarStack, avatarPeopleFromJson } from '../../../components/TravellerAvatars';
import { GuideCard, GUIDE_CARD_WIDTH } from '../../../components/GuideCard';
import { GUIDES } from '../../../constants/guides';
import { useAuth } from '../../../hooks/useAuth';
import { useJourneys } from '../../../hooks/useJourneys';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { parseDate, type Journey } from '../../../lib/database';
import { deleteJourneyWithDocuments } from '../../../lib/documents';
import { inviteFriends, leaveTrip, stopSharing } from '../../../lib/shareActions';
import { Flag } from '../../../components/Flag';

const hasGlass = isLiquidGlassAvailable();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Sep 12 – 30" inside one month, "Sep 28 – Oct 3" across. */
function fmtRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${fmtDate(start)} – ${e.getDate()}`;
  }
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function computeTotalDays(firstStart: string, lastEnd: string): number {
  const start = parseDate(firstStart);
  const end = parseDate(lastEnd);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

// ─── Journey Card ────────────────────────────────────────────────────────────

type JourneyCardData = Omit<Journey, 'countries'> & {
  leg_count: number;
  first_start: string | null;
  last_end: string | null;
  countries: string | null; // JSON array of country codes
};

function JourneyCard({
  journey,
  onDelete,
  onChanged,
}: {
  journey: JourneyCardData;
  onDelete: (id: number) => void;
  /** Sharing started, stopped or left: the list re-reads. */
  onChanged: () => void;
}) {
  const router = useRouter();

  // Parse unique country codes
  let countryCodes: string[] = [];
  try {
    if (journey.countries) {
      const parsed = JSON.parse(journey.countries);
      if (Array.isArray(parsed)) {
        countryCodes = [...new Set(parsed.filter(Boolean) as string[])];
      }
    }
  } catch {}

  const hasLegs = (journey.leg_count ?? 0) > 0;
  const dateRange =
    hasLegs && journey.first_start && journey.last_end
      ? fmtRange(journey.first_start, journey.last_end)
      : 'No dates yet';

  const totalDays =
    hasLegs && journey.first_start && journey.last_end
      ? computeTotalDays(journey.first_start, journey.last_end)
      : null;

  const stopLabel = journey.leg_count === 1 ? 'stop' : 'stops';
  const followed = !!journey.shared_owner_uid;
  const meta = totalDays !== null ? `${journey.leg_count} ${stopLabel} · ${totalDays} days` : `${journey.leg_count} ${stopLabel}`;

  // Who is on it, as faces where the word "shared" used to be. Only on a
  // trip that is actually shared: on one's own trip the single face would
  // say nothing.
  const { user } = useAuth();
  const shared = followed || !!journey.share_code;
  const people = shared ? avatarPeopleFromJson(journey.travellers, user?.uid ?? null, journey) : [];

  // A friend's trip can only be left; one's own can be shared, unshared, deleted.
  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (followed) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Leave trip', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, title: journey.title },
        (i) => { if (i === 0) leaveTrip(journey).then(onChanged); },
      );
      return;
    }
    const options = ['Invite friends', ...(journey.share_code ? ['Stop sharing'] : []), 'Delete trip', 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, destructiveButtonIndex: options.length - 2, cancelButtonIndex: options.length - 1, title: journey.title },
      (i) => {
        if (i === 0) inviteFriends(journey).then(onChanged);
        else if (journey.share_code && i === 1) stopSharing(journey).then(onChanged);
        // Same question as on the trip screen: stops and documents go with
        // it, and there is no undo.
        else if (i === options.length - 2) {
          Alert.alert('Delete this trip?', 'Stops and documents go with it.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(journey.id) },
          ]);
        }
      },
    );
  };

  const CardWrap = hasGlass ? GlassView : View;
  const cardProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

  return (
    <TouchableOpacity
      onPress={async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push(`/(tabs)/(plans)/${journey.id}` as any);
      }}
      onLongPress={handleLongPress}
      activeOpacity={0.85}
      style={styles.cardTouchable}
    >
      <CardWrap
        {...cardProps}
        style={[styles.card, !hasGlass && styles.cardFallback]}
      >
        {/* Title */}
        <Text style={styles.cardTitle} numberOfLines={1}>{journey.title}</Text>

        {/* Country flags row */}
        {countryCodes.length > 0 && (
          <View style={styles.flagsRow}>
            {countryCodes.slice(0, 8).map((code, i) => (
              <Flag key={`${code}-${i}`} code={code} size={20} />
            ))}
            {countryCodes.length > 8 && (
              <Text style={styles.flagMore}>+{countryCodes.length - 8}</Text>
            )}
          </View>
        )}

        {/* Date range + meta row */}
        <View style={styles.cardBottom}>
          <View style={styles.cardMeta}>
            <Text style={styles.cardDateRange}>{dateRange}</Text>
            {hasLegs && (
              <Text style={styles.cardMetaDot}>·</Text>
            )}
            <Text style={styles.cardMetaText}>{meta}</Text>
          </View>
          {people.length > 0 ? (
            <AvatarStack people={people} size={26} max={4} overlap={0.35} />
          ) : (
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          )}
        </View>
      </CardWrap>
    </TouchableOpacity>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function JourneysScreen() {
  const { journeys, loading, refresh } = useJourneys();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([refresh(), new Promise((r) => setTimeout(r, 600))]);
    setRefreshing(false);
  }, [refresh]);

  const openNewSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(tabs)/(plans)/create');
  }, [router]);

  const handleDelete = useCallback(async (id: number) => {
    await deleteJourneyWithDocuments(id);
    refresh();
  }, [refresh]);


  // ─── Header ───────────────────────────────────────────────────────────────

  const headerRight = useCallback(
    () => (
      <Pressable onPress={openNewSheet} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add trip">
        <Ionicons name="add" size={28} color={Colors.primary} />
      </Pressable>
    ),
    [openNewSheet],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return null;

  return (
    <>
      <Stack.Screen options={{ title: 'Plan Trips', headerRight }}></Stack.Screen>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {!loading && journeys.length === 0 ? (
          <View style={styles.inlineEmpty}>
            <Text style={styles.inlineEmptyIcon}>🗺️</Text>
            <Text style={styles.inlineEmptyTitle}>No journeys yet</Text>
            <Text style={styles.inlineEmptySub}>Plan your next adventure. Tap + to create one.</Text>
          </View>
        ) : (
          journeys.map((j) => (
            <JourneyCard
              key={j.id}
              journey={{
                ...j,
                leg_count: (j.leg_count as number) ?? 0,
                first_start: j.first_start ?? null,
                last_end: j.last_end ?? null,
                countries: j.countries ?? null,
              }}
              onDelete={handleDelete}
              onChanged={refresh}
            />
          ))
        )}


          {/* ── Destination guides ── */}
          <View style={styles.featSection}>
            <Text style={styles.featSectionTitle}>Destination Guides</Text>
            <Text style={styles.featSectionSub}>What to know before you go</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featScroll}
            decelerationRate="fast"
            snapToInterval={GUIDE_CARD_WIDTH + 12}
            snapToAlignment="start"
          >
            {GUIDES.map((guide) => (
              <GuideCard
                key={guide.id}
                guide={guide}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/(tabs)/(plans)/guide', params: { id: guide.id } } as any);
                }}
              />
            ))}
          </ScrollView>
      </ScrollView>

    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 100,
    gap: 12,
  },
  // ─── Skeleton ───
  skeletonCard: {
    height: 100,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // ─── Inline empty state ───
  inlineEmpty: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  inlineEmptyIcon: {
    fontSize: 40,
  },
  inlineEmptyTitle: {
    ...Typography.bodyLarge,
    fontWeight: '600',
  },
  inlineEmptySub: {
    ...Typography.bodySmall,
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // ─── Card ───
  cardTouchable: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  card: {
    borderRadius: 20,
    padding: 18,
    gap: 10,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    ...Typography.titleLarge,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  flagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
  },
  flagMore: {
    ...Typography.bodySmall,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  cardDateRange: {
    ...Typography.bodySmall,
    fontSize: 14,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  cardMetaDot: {
    ...Typography.bodySmall,
    fontSize: 14,
    color: Colors.textTertiary,
  },
  cardMetaText: {
    ...Typography.bodySmall,
    fontSize: 14,
    color: Colors.textTertiary,
  },
  // ─── Featured section ───
  featSection: {
    marginTop: 8,
    marginBottom: 12,
  },
  featSectionTitle: {
    ...Typography.titleLarge,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  featSectionSub: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  featScroll: {
    gap: 12,
    paddingRight: 16,
  },

});
