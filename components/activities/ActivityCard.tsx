import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { ACTIVITY_CATEGORY_LABELS, ACTIVITY_STATUS_LABELS, type Activity } from '../../lib/activityModel';
import { PlaceMap } from './PlaceMap';
import { SOURCE_MARK, categoryIcon } from './visuals';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * One thing to do as a cover, 3:4 (TikToks are portrait). What is on it
 * depends on what is known: the post's picture, else the place on the map
 * with its pin, else a plain card like a stop on the itinerary, the title
 * set large. Over a picture or a map the title sits on a shade at the
 * bottom; the status (once it is more than an idea) and where it came from
 * ride on top.
 */
export function ActivityCard({ activity: a, width, onPress }: { activity: Activity; width: number; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  const height = Math.round((width * 4) / 3);
  const mark = SOURCE_MARK[a.source];
  const picture = !!a.image_url && !failed;
  const located = a.latitude !== null && a.longitude !== null;
  const sub = a.place && a.place !== a.title ? a.place : ACTIVITY_CATEGORY_LABELS[a.category];

  const status = (dark: boolean) => (a.status !== 'idea' ? (
    <View style={[styles.pill, dark ? styles.pillDark : styles.pillLight]}>
      {a.status === 'done' ? <Ionicons name="checkmark" size={11} color={dark ? '#fff' : Colors.text} /> : null}
      <Text style={[styles.pillText, !dark && styles.pillTextLight]}>{ACTIVITY_STATUS_LABELS[a.status]}</Text>
    </View>
  ) : null);
  const source = (dark: boolean) => (mark ? (
    <View style={[styles.mark, dark ? styles.pillDark : styles.pillLight]}>
      <Ionicons name={mark.icon} size={12} color={dark ? '#fff' : Colors.text} />
    </View>
  ) : null);

  const press = () => { Haptics.selectionAsync(); onPress(); };

  if (!picture && !located) {
    return (
      <Pressable onPress={press} style={({ pressed }) => [{ width, height }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={a.title}>
        <Glass {...glassProps} style={[styles.plain, !hasGlass && styles.plainFallback, a.status === 'done' && styles.done]}>
          <View style={styles.plainTop}>
            <View style={styles.kind}>
              <Ionicons name={categoryIcon(a.category)} size={17} color={Colors.text} />
            </View>
            <View style={styles.plainBadges}>
              {status(false)}
              {source(false)}
            </View>
          </View>
          <View style={styles.plainBottom}>
            <Text style={styles.plainTitle} numberOfLines={4}>{a.title}</Text>
            <Text style={styles.plainSub} numberOfLines={1}>{sub}</Text>
          </View>
        </Glass>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={press} style={({ pressed }) => [{ width, height }, styles.cover, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={a.title}>
      {picture ? (
        <Image source={{ uri: a.image_url! }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <PlaceMap latitude={a.latitude!} longitude={a.longitude!} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.66)']} locations={[0.4, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.top}>
        {status(true) ?? <View />}
        {source(true)}
      </View>
      <View style={styles.coverBottom}>
        <Text style={styles.coverTitle} numberOfLines={3}>{a.title}</Text>
        <Text style={styles.coverSub} numberOfLines={1}>{sub}</Text>
      </View>
      {a.status === 'done' ? <View style={styles.veil} pointerEvents="none" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  done: { opacity: 0.55 },

  cover: {
    borderRadius: 22,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'space-between',
  },
  coverBottom: { padding: 12, gap: 3 },
  coverTitle: { ...Typography.titleSmall, color: '#fff', fontWeight: '700', letterSpacing: -0.2, lineHeight: 19 },
  coverSub: { ...Typography.caption, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.4)' },

  // Like a stop card on the itinerary.
  plain: {
    flex: 1,
    borderRadius: 22,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 14,
    justifyContent: 'space-between',
  },
  plainFallback: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  plainTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  kind: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plainBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plainBottom: { gap: 4 },
  plainTitle: { ...Typography.titleMedium, letterSpacing: -0.3, lineHeight: 23 },
  plainSub: { ...Typography.bodySmall, color: Colors.textSecondary },

  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: 10, flexShrink: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pillDark: { backgroundColor: 'rgba(0,0,0,0.42)' },
  pillLight: { backgroundColor: Colors.surfaceSecondary },
  pillText: { ...Typography.caption, color: '#fff', fontWeight: '700' },
  pillTextLight: { color: Colors.text },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
