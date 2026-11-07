import { ScrollView } from 'react-native';
import { Stack, useNavigation } from 'expo-router';
import { Card, Hint, SwitchRow, visaFormStyles } from '../../../components/visaForm';
import { HeaderAction } from '../../../components/HeaderAction';
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
            return (
              <SwitchRow
                key={tab}
                title={t(`tabs.${TAB_LABEL[tab]}`)}
                value={on}
                // The last tab that is still on cannot go.
                disabled={on && hidden.length >= HIDEABLE_TABS.length - 1}
                onChange={(v) => setTabHidden(tab, !v)}
                last={i === HIDEABLE_TABS.length - 1}
              />
            );
          })}
        </Card>
        <Hint>{t('settings.tabsDesc')}</Hint>
      </ScrollView>
    </>
  );
}

