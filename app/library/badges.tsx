import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { BADGE_LIBRARY, type BadgeInfo } from '../../lib/badges';
import { getAllTripsRaw } from '../../lib/database';
import { CountryBadge3DPreview } from '../../components/CountryBadge3D';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

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
  const total = BADGE_LIBRARY.length;
  const pct = total > 0 ? (earnedCount / total) * 100 : 0;

  // Sort: earned first (so the collection feels alive on top), then locked
  const sorted = [...BADGE_LIBRARY].sort((a, b) => {
    const ae = earned.has(a.code) ? 1 : 0;
    const be = earned.has(b.code) ? 1 : 0;
    return be - ae;
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Badge Library',
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: true,
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Hero — collection progress */}
        <Glass
          {...glassProps}
          style={[styles.hero, !hasGlass && styles.heroFallback]}
        >
          <View style={styles.heroRow}>
            <View style={styles.heroText}>
              <Text style={styles.heroEyebrow}>Collected</Text>
              <View style={styles.heroValueRow}>
                <Text style={styles.heroValue}>{earnedCount}</Text>
                <Text style={styles.heroUnit}>of {total}</Text>
              </View>
            </View>
            <View style={styles.heroIconBubble}>
              <Ionicons name="medal" size={26} color={Colors.textSecondary} />
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        </Glass>

        <Text style={styles.intro}>
          Tap any badge to view it in 3D. Locked badges are countries you haven&apos;t visited yet.
        </Text>

        <View style={styles.grid}>
          {sorted.map((b) => {
            const isEarned = earned.has(b.code);
            return (
              <Pressable
                key={b.code}
                disabled={!isEarned}
                onPress={() => open(b)}
                style={({ pressed }) => [
                  styles.tileWrap,
                  pressed && isEarned && { opacity: 0.7 },
                ]}
              >
                <Glass
                  {...glassProps}
                  style={[styles.tile, !hasGlass && styles.tileFallback]}
                >
                  {!isEarned && (
                    <View style={styles.lockBubble}>
                      <Ionicons name="lock-closed" size={10} color={Colors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.tileModel}>
                    {isEarned ? (
                      <CountryBadge3DPreview countryCode={b.code} backgroundColor={Colors.surface} />
                    ) : (
                      <View style={styles.lockedPlaceholder}>
                        <Ionicons name="medal" size={48} color="rgba(0, 0, 0, 0.08)" />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.tileName,
                      !isEarned && { color: Colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {b.name}
                  </Text>
                </Glass>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

const TILE_WIDTH_PCT = '31.5%';

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 60, gap: 14 },

  // Hero card
  hero: {
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 18,
    gap: 14,
  },
  heroFallback: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroText: {
    flex: 1,
  },
  heroEyebrow: {
    ...Typography.eyebrow,
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  heroValue: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  heroIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.text,
  },

  // Intro
  intro: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    lineHeight: 19,
    paddingHorizontal: 4,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tileWrap: {
    width: TILE_WIDTH_PCT,
    aspectRatio: 0.85,
  },
  tile: {
    flex: 1,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  tileFallback: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  lockBubble: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 7,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tileModel: {
    width: '100%',
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
  },
  lockedPlaceholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 6,
  },
});
