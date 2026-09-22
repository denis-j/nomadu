import { useEffect, useState } from 'react';
import { Image, ImageBackground, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { CloudyButton } from '../../../components/CloudyButton';
import { Flag } from '../../../components/Flag';
import { StatRow, StatTile } from '../../../components/StatTile';
import { TRANSPORTS } from '../../../components/TransportPicker';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { getRuleForCitizen, type VisaRule } from '../../../constants/visaRules';
import { appIconUrl, guideById, guideDays } from '../../../constants/guides';
import { useAuth } from '../../../hooks/useAuth';
import { getCitizenship } from '../../../lib/onboarding';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * One destination, before the trip exists: what the country is like to
 * arrive in, what it means for your passport, which apps everyone there
 * uses, and a route worth copying.
 *
 * The visa line is not part of the guide's text: it is the app's own
 * arithmetic for the passport in onboarding, so the guide says the same
 * thing the itinerary's chips will say later.
 */
export default function GuideScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = guideById(id);

  const { user } = useAuth();
  const [visa, setVisa] = useState<VisaRule | null>(null);
  useEffect(() => {
    if (!user?.uid || !guide) return;
    getCitizenship(user.uid)
      .then((c) => setVisa(c ? getRuleForCitizen(c.countryCode, guide.countryCode) : null))
      .catch(() => setVisa(null));
  }, [user?.uid, guide]);

  if (!guide) {
    return (
      <>
        <Stack.Screen options={{ title: 'Guide' }} />
        <View style={styles.missing}>
          <Text style={styles.missingText}>This guide is no longer here.</Text>
        </View>
      </>
    );
  }

  const days = guideDays(guide);
  const visaValue = visa
    ? visa.ruleType === 'visa_required'
      ? { value: 'Required', unit: undefined }
      : { value: `${visa.allowedDays}`, unit: 'days' }
    : { value: 'Check', unit: undefined };

  const plan = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/(tabs)/(plans)/guide-start', params: { id: guide.id } } as any);
  };

  return (
    <>
      <Stack.Screen options={{ title: guide.country, headerBackButtonDisplayMode: 'minimal' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {/* Hero: the place, and what it is known for */}
        <ImageBackground source={{ uri: guide.image }} style={styles.hero} imageStyle={styles.heroImage}>
          <LinearGradient
            colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroText}>
            <Flag code={guide.countryCode} size={28} />
            <Text style={styles.heroCountry}>{guide.country}</Text>
            <Text style={styles.heroTagline}>{guide.tagline}</Text>
          </View>
        </ImageBackground>

        {/* The trip in numbers, the visa one from your own passport */}
        <StatRow style={styles.stats}>
          <StatTile label="Route" value={`${days}`} unit="days" />
          <StatTile label="Stops" value={`${guide.legs.length}`} />
          <StatTile label="Visa" value={visaValue.value} unit={visaValue.unit} />
        </StatRow>
        {visa ? <Text style={styles.visaNote}>{visa.label} on your passport</Text> : null}

        <Section title="Good to know">
          <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
            {guide.tips.map((tip, i) => (
              <View key={i}>
                {i > 0 && <View style={styles.separator} />}
                <View style={styles.tipRow}>
                  <Ionicons name="ellipse" size={5} color={Colors.textTertiary} style={styles.bullet} />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              </View>
            ))}
          </Glass>
        </Section>

        <Section title="Apps everyone uses">
          <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
            {guide.apps.map((app, i) => (
              <View key={app.name}>
                {i > 0 && <View style={styles.separator} />}
                <Pressable
                  onPress={() => Linking.openURL(`https://${app.domain}`)}
                  style={({ pressed }) => [styles.appRow, pressed && { opacity: 0.6 }]}
                >
                  <Image source={{ uri: appIconUrl(app.domain) }} style={styles.appIcon} />
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text style={styles.appDomain} numberOfLines={1}>{app.domain}</Text>
                  <Ionicons name="open-outline" size={15} color={Colors.textTertiary} />
                </Pressable>
              </View>
            ))}
          </Glass>
        </Section>

        <Section title="A route to start from">
          <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
            {guide.legs.map((leg, i) => {
              const nights = leg.endOffset - leg.startOffset + 1;
              const transport = TRANSPORTS.find((t) => t.type === leg.transport) ?? TRANSPORTS[0];
              return (
                <View key={leg.city}>
                  {i > 0 && <View style={styles.separator} />}
                  <View style={styles.legRow}>
                    <View style={styles.legIcon}>
                      <Ionicons name={transport.icon} size={15} color={Colors.textSecondary} />
                    </View>
                    <Text style={styles.legCity} numberOfLines={1}>{leg.city}</Text>
                    <Text style={styles.legDays}>{nights} {nights === 1 ? 'day' : 'days'}</Text>
                  </View>
                </View>
              );
            })}
          </Glass>
        </Section>

        <View style={styles.ctaWrap}>
          <CloudyButton onPress={plan} style={styles.cta} innerStyle={styles.ctaInner}>
            <Text style={styles.ctaText}>Plan this trip</Text>
          </CloudyButton>
        </View>
        <Text style={styles.foot}>Creates a trip with these {guide.legs.length} stops. Everything stays editable.</Text>
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 60 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  missingText: { ...Typography.body, color: Colors.textSecondary },

  hero: { height: 240, justifyContent: 'flex-end', marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', borderCurve: 'continuous', backgroundColor: Colors.surfaceSecondary },
  heroImage: { borderRadius: 20 },
  heroText: { padding: 20, gap: 4 },
  heroCountry: { ...Typography.displayMedium, fontSize: 30, color: Colors.white, letterSpacing: -0.6 },
  heroTagline: { ...Typography.bodySmall, color: Colors.whiteAlpha75, fontWeight: '600' },

  stats: { marginHorizontal: 16, marginTop: 16 },
  visaNote: { ...Typography.caption, color: Colors.textTertiary, marginHorizontal: 20, marginTop: 8 },

  section: { marginHorizontal: 16, marginTop: 22, gap: 10 },
  sectionTitle: { ...Typography.titleMedium, paddingHorizontal: 4 },
  card: { borderRadius: 18, borderCurve: 'continuous', paddingHorizontal: 16, overflow: 'hidden', backgroundColor: Colors.surface },
  cardFallback: { borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },

  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 13 },
  bullet: { marginTop: 7 },
  tipText: { ...Typography.body, flex: 1, lineHeight: 21 },

  appRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  appIcon: { width: 28, height: 28, borderRadius: 7 },
  appName: { ...Typography.titleSmall, fontWeight: '500' },
  appDomain: { ...Typography.bodySmall, color: Colors.textTertiary, flex: 1, textAlign: 'right' },

  legRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  legIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legCity: { ...Typography.titleSmall, fontWeight: '500', flex: 1 },
  legDays: { ...Typography.bodySmall, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },

  ctaWrap: { marginHorizontal: 16, marginTop: 26 },
  cta: { width: '100%' },
  ctaInner: { justifyContent: 'center' },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
  foot: { ...Typography.bodySmall, color: Colors.textTertiary, textAlign: 'center', marginTop: 10, marginHorizontal: 32 },
});
