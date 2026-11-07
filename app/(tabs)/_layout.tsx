import { useEffect } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotificationCheck } from '../../hooks/useNotificationCheck';
import { requestNotificationPermissions } from '../../lib/notifications';
import { consumePendingInvite } from '../../lib/sharing';
import { useTranslation } from '../../contexts/LanguageContext';
import { consumeReturnToSettings, HIDEABLE_TABS, useHiddenTabs, type HideableTab } from '../../hooks/useHiddenTabs';

const { Trigger } = NativeTabs;

const NOTIF_ASKED_KEY = 'notif_permission_asked';

const GROUP: Record<HideableTab, string> = { map: '(map)', timeline: '(timeline)', plans: '(plans)', stats: '(stats)' };

export default function TabLayout() {
  useNotificationCheck();
  const router = useRouter();
  const { t } = useTranslation();
  const hidden = useHiddenTabs();
  const segments = useSegments();
  const segment = (segments as string[])[1];

  // Hiding a tab rebuilds the tab bar on its first tab. After a switch in
  // the Tabs sheet, go back there; otherwise never sit on a tab that is switched off.
  useEffect(() => {
    if (consumeReturnToSettings()) {
      // Back to Settings and the Tabs sheet the switch was in, so the next
      // switch is right there.
      // After the rebuilt tab bar has settled; earlier, the rebuild won.
      const a = setTimeout(() => router.navigate('/(tabs)/(settings)' as any), 450);
      const b = setTimeout(() => router.push('/(tabs)/(settings)/tabs' as any), 950);
      return () => { clearTimeout(a); clearTimeout(b); };
    }
    const onHidden = HIDEABLE_TABS.find((tab) => GROUP[tab] === segment && hidden.includes(tab));
    const firstVisible = HIDEABLE_TABS.find((tab) => !hidden.includes(tab));
    if (onHidden && firstVisible) router.replace(`/(tabs)/${GROUP[firstVisible]}` as any);
  }, [hidden, segment, router]);

  // An invite link opened while signed out was parked; now that the tabs
  // are up, the user is signed in, so bring the invite back.
  useEffect(() => {
    consumePendingInvite().then((code) => {
      if (code) router.push(`/join/${code}` as any);
    });
  }, [router]);

  useEffect(() => {
    // On a first launch the tabs mount for a moment before the redirect to
    // the welcome screen, and the dialog used to open over that. Leaving the
    // tabs cancels it; it is only marked as asked once it really is.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let left = false;
    AsyncStorage.getItem(NOTIF_ASKED_KEY).then((already) => {
      if (already || left) return;
      // Small delay so the home screen is fully visible before the system dialog appears
      timer = setTimeout(async () => {
        await AsyncStorage.setItem(NOTIF_ASKED_KEY, '1');
        requestNotificationPermissions();
      }, 1500);
    });
    return () => {
      left = true;
      clearTimeout(timer);
    };
  }, []);
  // `sf` draws the icons on iOS, `md` (Material Symbols) on Android. With
  // SF Symbols only, Android had no icons at all, and its bottom bar shows
  // labels only for the selected tab when there are more than three: every
  // other tab was invisible.
  return (
    <NativeTabs minimizeBehavior="onScrollDown" iconColor={{ default: '#00000066', selected: '#000000' }} tintColor="#000000">
      <Trigger name="(map)" hidden={hidden.includes('map')}>
        <Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
        <Trigger.Label>{t('tabs.map')}</Trigger.Label>
      </Trigger>
      <Trigger name="(timeline)" hidden={hidden.includes('timeline')}>
        <Trigger.Icon sf={{ default: 'clock', selected: 'clock.fill' }} md="schedule" />
        <Trigger.Label>{t('tabs.timeline')}</Trigger.Label>
      </Trigger>
      <Trigger name="(plans)" hidden={hidden.includes('plans')}>
        <Trigger.Icon sf={{ default: '1.calendar', selected: '31.calendar' }} md="calendar_month" />
        <Trigger.Label>{t('tabs.plan')}</Trigger.Label>
      </Trigger>
      <Trigger name="(stats)" hidden={hidden.includes('stats')}>
        <Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} md="bar_chart" />
        <Trigger.Label>{t('tabs.tracking')}</Trigger.Label>
      </Trigger>
      <Trigger name="(settings)">
        <Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill'}} md="settings" />
        <Trigger.Label>{t('tabs.settings')}</Trigger.Label>
      </Trigger>
    </NativeTabs>
  );
}
