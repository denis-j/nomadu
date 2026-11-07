import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from '../../contexts/LanguageContext';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { CountryBadge3D, hasCountryBadge } from '../../components/CountryBadge3D';
import { CloudyButton } from '../../components/CloudyButton';
import { MissingRoute } from '../../components/MissingRoute';
import { Colors } from '../../constants/colors';
import { Typography, FontSize } from '../../constants/typography';
import { getBadgeInfo, markBadgeUnlocked } from '../../lib/badges';
import { playCollectSound } from '../../lib/sound';

function formatTodayShort(language: string): string {
  return new Date().toLocaleDateString(language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * One badge, built like the app's other sheets: native title, the coin on a
 * square stage (a fixed size: flex collapses inside a form sheet), and the
 * name centred under it as on a trip's sheet.
 */
export default function BadgeSheet() {
  const { t, language, countryName } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { countryCode, unlock } = useLocalSearchParams<{ countryCode: string; unlock?: string }>();
  const code = (countryCode ?? '').toUpperCase();
  const info = getBadgeInfo(code);
  // The unlock mode marks the badge as earned. The app itself never links
  // here with it, and the scheme is public, so any link could hand out
  // badges; only development builds honour it.
  const isUnlock = __DEV__ && (unlock === '1' || unlock === 'true');

  useEffect(() => {
    if (isUnlock && code) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      markBadgeUnlocked(code).catch(() => {});
    }
  }, [isUnlock, code]);

  const handleCollect = () => {
    playCollectSound();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  if (!hasCountryBadge(code) || !info) {
    return <MissingRoute title={t('badge.reward')} message={t('badge.noBadge', { code })} />;
  }

  return (
    <>
      <Stack.Screen options={{ title: t('badge.reward') }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} scrollEnabled={false}>
        <CountryBadge3D countryCode={code} height={width} />
        <View style={styles.header}>
          <Text style={styles.name}>{countryName(info.name)}</Text>
          <Text style={styles.earned}>{t('badge.earned', { date: formatTodayShort(language) })}</Text>
        </View>
        {isUnlock && (
          <View style={styles.cta}>
            <CloudyButton onPress={handleCollect} haptic={Haptics.ImpactFeedbackStyle.Medium} innerStyle={styles.ctaInner}>
              <Ionicons name="sparkles" size={20} color={Colors.cloudyButtonText} />
              <Text style={styles.ctaText}>{t('badge.collect')}</Text>
            </CloudyButton>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  header: { alignItems: 'center', gap: 2, paddingHorizontal: 24 },
  name: { ...Typography.displayMedium, fontSize: FontSize.title1, fontWeight: '700', textAlign: 'center' },
  earned: { ...Typography.titleSmall, fontWeight: '400', color: Colors.textSecondary, marginTop: 2 },
  cta: { paddingHorizontal: 24, paddingTop: 24 },
  ctaInner: { justifyContent: 'center', gap: 10 },
  ctaText: { ...Typography.titleSmall, fontWeight: '700', color: Colors.cloudyButtonText },
});
