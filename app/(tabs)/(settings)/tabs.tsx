import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card, Hint, visaFormStyles } from '../../../components/visaForm';
import { HeaderAction } from '../../../components/HeaderAction';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useTranslation } from '../../../contexts/LanguageContext';
import { HIDEABLE_TABS, setTabHidden, useHiddenTabs, type HideableTab } from '../../../hooks/useHiddenTabs';

const TAB_LABEL: Record<HideableTab, string> = { map: 'map', timeline: 'timeline', plans: 'plan', stats: 'tracking' };

/**
 * Which tabs show. Settings is not in the list: it is the way back here.
 * The last tab that is still on cannot be switched off.
 */
export default function TabsSheet() {
  const { t } = useTranslation();
  const nav = useNavigation();
  const hidden = useHiddenTabs();

  return (
    <>
      <Stack.Screen
        options={{
          title: t('settings.tabs'),
          headerRight: () => <HeaderAction onPress={() => nav.goBack()} label={t('common.done')} />,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={visaFormStyles.content}>
        <Card>
          {HIDEABLE_TABS.map((tab, i) => {
            const on = !hidden.includes(tab);
            const lastOn = on && hidden.length >= HIDEABLE_TABS.length - 1;
            return (
              <View key={tab} style={[styles.row, i < HIDEABLE_TABS.length - 1 && styles.rowLine]}>
                <Text style={styles.label}>{t(`tabs.${TAB_LABEL[tab]}`)}</Text>
                <Switch
                  value={on}
                  disabled={lastOn}
                  onValueChange={(v) => {
                    Haptics.selectionAsync();
                    setTabHidden(tab, !v);
                  }}
                />
              </View>
            );
          })}
        </Card>
        <Hint>{t('settings.tabsDesc')}</Hint>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  label: { ...Typography.titleSmall, fontWeight: '500' },
});
