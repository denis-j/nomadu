import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { BADGE_LIBRARY, type BadgeInfo } from '../../lib/badges';
import { getAllTripsRaw } from '../../lib/database';
import { CountryBadge3DPreview } from '../../components/CountryBadge3D';

export default function BadgeLibraryScreen() {
  const router = useRouter();
  const [earned, setEarned] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAllTripsRaw().then((trips) => {
      setEarned(new Set(trips.map((t) => t.country_code.toUpperCase())));
    });
  }, []);

  const open = useCallback(
    (info: BadgeInfo) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/badge/${info.code}`);
    },
    [router],
  );

  const earnedCount = BADGE_LIBRARY.filter((b) => earned.has(b.code)).length;

  return (
    <>
      <Stack.Screen options={{ title: 'Badge Library', headerBackTitle: 'Back' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Your Collection</Text>
          <Text style={styles.heading2}>
            {earnedCount} / {BADGE_LIBRARY.length}
          </Text>
        </View>
        <Text style={styles.intro}>
          Tap any badge to view it in 3D. Locked badges are countries you haven&apos;t visited yet.
        </Text>

        <View style={styles.grid}>
          {BADGE_LIBRARY.map((b) => {
            const isEarned = earned.has(b.code);
            return (
              <Pressable
                key={b.code}
                disabled={!isEarned}
                onPress={() => open(b)}
                style={({ pressed }) => [
                  styles.tile,
                  !isEarned && styles.tileLocked,
                  pressed && isEarned && { opacity: 0.7 },
                ]}
              >
                <View style={styles.tileTop}>
                  {isEarned ? (
                    <CountryBadge3DPreview countryCode={b.code} backgroundColor="#FFFFFF" />
                  ) : (
                    <View style={styles.lockedPlaceholder}>
                      <Ionicons name="medal-outline" size={40} color={Colors.textTertiary} />
                    </View>
                  )}
                </View>
                <Text style={[styles.tileName, !isEarned && styles.tileNameLocked]} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={[styles.tileStatus, !isEarned && styles.tileStatusLocked]}>
                  {isEarned ? 'Earned' : 'Locked'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 60, gap: 14 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.4,
  },
  heading2: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  intro: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '31.5%',
    aspectRatio: 0.85,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileLocked: {
    backgroundColor: Colors.surfaceSecondary,
    borderColor: 'transparent',
  },
  tileTop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 10,
    position: 'relative',
  },
  lockedPlaceholder: {
    flex: 1,
    width: '100%',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 6,
  },
  tileNameLocked: { color: Colors.textTertiary },
  tileStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  tileStatusLocked: { color: Colors.textTertiary },
});
