import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useNavigation } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import { Card, ChoiceRow, Hint, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { HeaderAction } from '../../../components/HeaderAction';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useTranslation } from '../../../contexts/LanguageContext';
import {
  HERO_METRICS,
  resetTrackingLayout,
  setTrackingLayout,
  useTrackingLayout,
  type HeroMetric,
  type TrackingSection,
} from '../../../hooks/useTrackingLayout';

const SECTION_ICONS: Record<TrackingSection, keyof typeof Ionicons.glyphMap> = {
  tiles: 'grid-outline',
  tracking: 'shield-checkmark-outline',
  chart: 'bar-chart-outline',
  badges: 'medal-outline',
  top: 'trophy-outline',
};

/**
 * The Tracking tab, arranged by the person using it: what the big card
 * shows, and which blocks follow in what order. Every change shows on the
 * tab at once; the checkmark only closes the sheet.
 */
export default function TrackingCustomizeSheet() {
  const { t } = useTranslation();
  const nav = useNavigation();
  const layout = useTrackingLayout();

  const sectionName: Record<TrackingSection, string> = {
    tiles: t('trackCustom.tiles'),
    tracking: t('stats.activeTracking'),
    chart: t('stats.daysAwayByMonth'),
    badges: t('stats.badges'),
    top: t('stats.topDestinations'),
  };
  const heroText: Record<HeroMetric, { title: string; subtitle: string }> = {
    away: { title: t('trackCustom.heroAway'), subtitle: t('trackCustom.heroAwaySub') },
    countries: { title: t('trackCustom.heroCountries'), subtitle: t('trackCustom.heroCountriesSub') },
    visa: { title: t('trackCustom.heroVisa'), subtitle: t('trackCustom.heroVisaSub') },
  };

  const toggle = (id: TrackingSection, on: boolean) => {
    Haptics.selectionAsync();
    setTrackingLayout({ hidden: on ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id] });
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<TrackingSection>) => {
    const on = !layout.hidden.includes(item);
    return (
      <ScaleDecorator activeScale={1.03}>
        <View style={[styles.row, isActive && styles.rowActive]}>
          <Pressable
            onPressIn={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); drag(); }}
            hitSlop={10}
            accessibilityRole="adjustable"
            accessibilityLabel={sectionName[item]}
            style={styles.handle}
          >
            <Ionicons name="reorder-three" size={22} color={Colors.textTertiary} />
          </Pressable>
          <Ionicons name={SECTION_ICONS[item]} size={18} color={on ? Colors.text : Colors.textTertiary} />
          <Text style={[styles.rowTitle, !on && styles.rowTitleOff]} numberOfLines={1}>{sectionName[item]}</Text>
          <Switch
            value={on}
            onValueChange={(v) => toggle(item, v)}
            accessibilityLabel={t('trackCustom.show', { name: sectionName[item] })}
          />
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('trackCustom.title'),
          headerRight: () => <HeaderAction onPress={() => nav.goBack()} label={t('common.done')} />,
        }}
      />
      <GestureHandlerRootView style={styles.fill}>
        <DraggableFlatList
          data={layout.order}
          keyExtractor={(id) => id}
          renderItem={renderItem}
          onDragEnd={({ data }) => setTrackingLayout({ order: data })}
          activationDistance={6}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[visaFormStyles.content, styles.content]}
          ListHeaderComponent={
            <View style={styles.header}>
              <SectionLabel>{t('trackCustom.heroLabel')}</SectionLabel>
              <Card>
                {HERO_METRICS.map((m, i) => (
                  <ChoiceRow
                    key={m}
                    title={heroText[m].title}
                    subtitle={heroText[m].subtitle}
                    selected={layout.hero === m}
                    onPress={() => setTrackingLayout({ hero: m })}
                    last={i === HERO_METRICS.length - 1}
                  />
                ))}
              </Card>
              <SectionLabel>{t('trackCustom.sectionsLabel')}</SectionLabel>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <Hint>{t('trackCustom.dragHint')}</Hint>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); resetTrackingLayout(); }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.reset, pressed && { opacity: 0.55 }]}
              >
                <Text style={styles.resetText}>{t('trackCustom.reset')}</Text>
              </Pressable>
            </View>
          }
        />
      </GestureHandlerRootView>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: 8 },
  header: { gap: 14, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: Colors.white,
  },
  rowActive: { boxShadow: '0 8px 20px rgba(11, 37, 65, 0.14)' },
  handle: { paddingHorizontal: 4, paddingVertical: 2 },
  rowTitle: { ...Typography.titleSmall, fontWeight: '500', flex: 1 },
  rowTitleOff: { color: Colors.textTertiary },
  footer: { gap: 14, marginTop: 6 },
  reset: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  resetText: { ...Typography.button, color: Colors.textSecondary },
});
