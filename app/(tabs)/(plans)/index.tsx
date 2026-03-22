import { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  ImageBackground,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useJourneys } from '../../../hooks/useJourneys';
import { Colors } from '../../../constants/colors';
import { deleteJourney, insertJourney, insertJourneyLeg, parseDate, TransportType } from '../../../lib/database';
import { countryCodeToFlag } from '../../../lib/geocoding';

const hasGlass = isLiquidGlassAvailable();

// ─── Featured destinations data ───────────────────────────────────────────────

const FAVICON = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

function addDays(base: Date, n: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TemplateLeg {
  city: string;
  country: string;
  countryCode: string;
  startOffset: number; // days from today
  endOffset: number;
  transport: TransportType;
  latitude: number;
  longitude: number;
}

interface FeaturedDestination {
  id: string;
  flag: string;
  country: string;
  tagline: string;
  image: string;
  apps: { name: string; domain: string }[];
  tips: string[];
  legs: TemplateLeg[];
}

const FEATURED: FeaturedDestination[] = [
  {
    id: 'thailand',
    flag: '🇹🇭',
    country: 'Thailand',
    tagline: 'Visa on arrival · Nomad-friendly · Beach + jungle',
    image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=800&q=80',
    apps: [
      { name: 'Grab', domain: 'grab.com' },
      { name: 'LINE', domain: 'line.me' },
      { name: 'Agoda', domain: 'agoda.com' },
      { name: 'Klook', domain: 'klook.com' },
    ],
    tips: ['SIM at airport (AIS / DTAC)', 'Cash still king outside cities', 'Scooter rental in Chiang Mai'],
    legs: [
      { city: 'Bangkok',     country: 'Thailand', countryCode: 'TH', startOffset: 1,  endOffset: 7,  transport: 'flight', latitude: 13.7563, longitude: 100.5018 },
      { city: 'Chiang Mai',  country: 'Thailand', countryCode: 'TH', startOffset: 9,  endOffset: 14, transport: 'flight', latitude: 18.7883, longitude: 98.9853  },
      { city: 'Koh Samui',   country: 'Thailand', countryCode: 'TH', startOffset: 16, endOffset: 21, transport: 'flight', latitude: 9.5120,  longitude: 100.0136 },
    ],
  },
  {
    id: 'china',
    flag: '🇨🇳',
    country: 'China',
    tagline: 'Install VPN before landing · WeChat everything',
    image: 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?auto=format&fit=crop&w=800&q=80',
    apps: [
      { name: 'ExpressVPN', domain: 'expressvpn.com' },
      { name: 'WeChat', domain: 'wechat.com' },
      { name: 'Alipay', domain: 'alipay.com' },
      { name: 'DiDi', domain: 'didiglobal.com' },
    ],
    tips: ['VPN must be installed before arrival', 'Alipay / WeChat Pay for everything', 'Google Maps offline maps essential'],
    legs: [
      { city: 'Shanghai', country: 'China', countryCode: 'CN', startOffset: 1,  endOffset: 6,  transport: 'flight', latitude: 31.2304, longitude: 121.4737 },
      { city: 'Beijing',  country: 'China', countryCode: 'CN', startOffset: 8,  endOffset: 13, transport: 'train',  latitude: 39.9042, longitude: 116.4074 },
      { city: "Xi'an",    country: 'China', countryCode: 'CN', startOffset: 15, endOffset: 18, transport: 'train',  latitude: 34.3416, longitude: 108.9398 },
    ],
  },
  {
    id: 'japan',
    flag: '🇯🇵',
    country: 'Japan',
    tagline: 'Bullet trains · World-class food · Ultra-fast wifi',
    image: 'https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=800&q=80',
    apps: [
      { name: 'Google Maps', domain: 'maps.google.com' },
      { name: 'Google Translate', domain: 'translate.google.com' },
      { name: 'Navitime', domain: 'navitime.co.jp' },
      { name: 'PayPay', domain: 'paypay.ne.jp' },
    ],
    tips: ['Buy Suica IC card at the airport', 'Many restaurants cash only', '7-Eleven ATMs accept foreign cards'],
    legs: [
      { city: 'Tokyo',  country: 'Japan', countryCode: 'JP', startOffset: 1,  endOffset: 7,  transport: 'flight', latitude: 35.6762, longitude: 139.6503 },
      { city: 'Kyoto',  country: 'Japan', countryCode: 'JP', startOffset: 9,  endOffset: 13, transport: 'train',  latitude: 35.0116, longitude: 135.7681 },
      { city: 'Osaka',  country: 'Japan', countryCode: 'JP', startOffset: 15, endOffset: 18, transport: 'train',  latitude: 34.6937, longitude: 135.5023 },
    ],
  },
  {
    id: 'portugal',
    flag: '🇵🇹',
    country: 'Portugal',
    tagline: "Europe's nomad capital · English everywhere",
    image: 'https://images.unsplash.com/photo-1558370781-d6196949e317?auto=format&fit=crop&w=800&q=80',
    apps: [
      { name: 'Bolt', domain: 'bolt.eu' },
      { name: 'Revolut', domain: 'revolut.com' },
      { name: 'Airbnb', domain: 'airbnb.com' },
      { name: 'Wise', domain: 'wise.com' },
    ],
    tips: ['NHR tax regime for new residents', 'Schengen — max 90 / 180 days', 'Fibre wifi standard in Airbnbs'],
    legs: [
      { city: 'Lisbon', country: 'Portugal', countryCode: 'PT', startOffset: 1,  endOffset: 8,  transport: 'flight', latitude: 38.7169, longitude: -9.1399  },
      { city: 'Porto',  country: 'Portugal', countryCode: 'PT', startOffset: 10, endOffset: 14, transport: 'train',  latitude: 41.1579, longitude: -8.6291  },
      { city: 'Algarve', country: 'Portugal', countryCode: 'PT', startOffset: 16, endOffset: 20, transport: 'car',  latitude: 37.0179, longitude: -7.9307  },
    ],
  },
];

// ─── Featured card ────────────────────────────────────────────────────────────

function FeaturedCard({
  item,
  onPress,
}: {
  item: FeaturedDestination;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.featCard} onPress={onPress} activeOpacity={0.92}>
      <ImageBackground
        source={{ uri: item.image }}
        style={styles.featImage}
        imageStyle={styles.featImageStyle}
      >
        {/* Dark filter over whole image */}
        <View style={styles.featFilter} />

        {/* Gradient: stronger at top and bottom, lighter in middle */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.95)']}
          locations={[0, 0.3, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Top: flag + title + tips */}
        <View style={styles.featTop}>
          <Text style={styles.featFlag}>{item.flag}</Text>
          <Text style={styles.featCountry} numberOfLines={1}>{item.country}</Text>
          <Text style={styles.featTagline} numberOfLines={2}>{item.tagline}</Text>
          <View style={styles.featTips}>
            {item.tips.map((tip, i) => (
              <Text key={i} style={styles.featTip} numberOfLines={1}>· {tip}</Text>
            ))}
          </View>
        </View>

        {/* Bottom: apps + CTA */}
        <View style={styles.featContent}>

          {/* Apps grid */}
          <View style={styles.featAppsSection}>
            <Text style={styles.featAppsLabel}>ESSENTIAL APPS</Text>
            <View style={styles.featAppsRow}>
              {item.apps.map((app) => (
                <View key={app.name} style={styles.featAppItem}>
                  <View style={styles.featAppIconWrap}>
                    <Image
                      source={{ uri: FAVICON(app.domain) }}
                      style={styles.featAppIcon}
                    />
                  </View>
                  <Text style={styles.featAppName} numberOfLines={1}>{app.name}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* CTA */}
          <View style={styles.featCta}>
            <Text style={styles.featCtaText}>Start planning</Text>
            <Ionicons name="arrow-forward" size={15} color="#000" />
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function computeTotalDays(firstStart: string, lastEnd: string): number {
  const start = parseDate(firstStart);
  const end = parseDate(lastEnd);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

// ─── Journey Card ────────────────────────────────────────────────────────────

interface JourneyCardData {
  id: number;
  title: string;
  leg_count: number;
  first_start: string | null;
  last_end: string | null;
  countries: string | null; // JSON array of country codes
}

function JourneyCard({
  journey,
  onDelete,
}: {
  journey: JourneyCardData;
  onDelete: (id: number) => void;
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
      ? `${fmtDate(journey.first_start)} – ${fmtDate(journey.last_end)}`
      : 'No dates yet';

  const totalDays =
    hasLegs && journey.first_start && journey.last_end
      ? computeTotalDays(journey.first_start, journey.last_end)
      : null;

  const stopLabel = journey.leg_count === 1 ? 'stop' : 'stops';
  const meta =
    totalDays !== null
      ? `${journey.leg_count} ${stopLabel} · ${totalDays} days`
      : `${journey.leg_count} ${stopLabel}`;

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Delete trip', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
        title: journey.title,
      },
      (i) => {
        if (i === 0) onDelete(journey.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
              <Text key={`${code}-${i}`} style={styles.flagEmoji}>
                {countryCodeToFlag(code)}
              </Text>
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
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
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
    await deleteJourney(id);
    refresh();
  }, [refresh]);

  const handleFeaturedPress = useCallback(async (dest: FeaturedDestination) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Create Trip',
      `Create a new trip to ${dest.country}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          style: 'default',
          onPress: async () => {
            const today = new Date();
            const id = await insertJourney(`${dest.flag} ${dest.country} Trip`);
            await Promise.all(
              dest.legs.map((leg, i) =>
                insertJourneyLeg(
                  id,
                  leg.city, leg.country, leg.countryCode,
                  addDays(today, leg.startOffset),
                  addDays(today, leg.endOffset),
                  leg.transport, null, i,
                  leg.latitude, leg.longitude,
                )
              )
            );
            refresh();
            router.push(`/(tabs)/(plans)/${id}` as any);
          },
        },
      ]
    );
  }, [refresh, router]);
  // ─── Header ───────────────────────────────────────────────────────────────

  const headerRight = useCallback(
    () => (
      <Pressable onPress={openNewSheet} hitSlop={8}>
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
            <Text style={styles.inlineEmptySub}>Plan your next adventure — tap + to create one.</Text>
          </View>
        ) : (
          journeys.map((j) => (
            <JourneyCard
              key={j.id}
              journey={{
                id: j.id,
                title: j.title,
                leg_count: (j.leg_count as number) ?? 0,
                first_start: j.first_start ?? null,
                last_end: j.last_end ?? null,
                countries: j.countries ?? null,
              }}
              onDelete={handleDelete}
            />
          ))
        )}


          {/* ── Featured destinations ── */}
          <View style={styles.featSection}>
            <Text style={styles.featSectionTitle}>Destination Guides</Text>
            <Text style={styles.featSectionSub}>Handpicked for digital nomads</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featScroll}
            decelerationRate="fast"
            snapToInterval={296}
            snapToAlignment="start"
          >
            {FEATURED.map((dest) => (
              <FeaturedCard
                key={dest.id}
                item={dest}
                onPress={() => handleFeaturedPress(dest)}
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
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  inlineEmptySub: {
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
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  flagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
  },
  flagEmoji: {
    fontSize: 22,
  },
  flagMore: {
    fontSize: 14,
    color: Colors.textTertiary,
    fontWeight: '600',
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
    fontSize: 14,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  cardMetaDot: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
  cardMetaText: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
  // ─── Featured section ───
  featSection: {
    marginTop: 8,
    marginBottom: 12,
  },
  featSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  featSectionSub: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  featScroll: {
    gap: 12,
    paddingRight: 16,
  },
  featCard: {
    width: 300,
    height: 440,
    borderRadius: 20,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  featImage: {
    flex: 1,
    justifyContent: 'space-between',
  },
  featFilter: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  featTop: {
    padding: 16,
    paddingBottom: 0,
    gap: 4,
  },
  featImageStyle: {
    borderRadius: 20,
  },
  featContent: {
    padding: 16,
    paddingTop: 12,
    gap: 10,
  },
  featFlag: {
    fontSize: 36,
    lineHeight: 40,
  },
  featCountry: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  featTagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    lineHeight: 16,
  },
  featTips: {
    gap: 2,
    marginTop: 6,
  },
  featTip: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    lineHeight: 17,
  },
  featAppsSection: {
    gap: 8,
  },
  featAppsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8,
  },
  featAppsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  featAppItem: {
    alignItems: 'center',
    gap: 5,
    width: 52,
  },
  featAppIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featAppIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  featAppName: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  featCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 2,
  },
  featCtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },

});
