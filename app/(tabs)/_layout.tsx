import { useEffect } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotificationCheck } from '../../hooks/useNotificationCheck';
import { requestNotificationPermissions } from '../../lib/notifications';

const { Trigger } = NativeTabs;

const NOTIF_ASKED_KEY = 'notif_permission_asked';

export default function TabLayout() {
  useNotificationCheck();

  useEffect(() => {
    const askOnce = async () => {
      const already = await AsyncStorage.getItem(NOTIF_ASKED_KEY);
      if (already) return;
      await AsyncStorage.setItem(NOTIF_ASKED_KEY, '1');
      // Small delay so the home screen is fully visible before the system dialog appears
      setTimeout(() => requestNotificationPermissions(), 1500);
    };
    askOnce();
  }, []);
  return (
    <NativeTabs minimizeBehavior="onScrollDown" iconColor={{ default: '#00000066', selected: '#000000' }} tintColor="#000000">
      <Trigger name="(map)">
        <Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} />
        <Trigger.Label>Map</Trigger.Label>
      </Trigger>
      <Trigger name="(timeline)">
        <Trigger.Icon sf={{ default: 'clock', selected: 'clock.fill' }} />
        <Trigger.Label>Timeline</Trigger.Label>
      </Trigger>
      <Trigger name="(stats)">
        <Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <Trigger.Label>Stats</Trigger.Label>
      </Trigger>
      <Trigger name="(settings)">
        <Trigger.Icon sf="gear" />
        <Trigger.Label>Settings</Trigger.Label>
      </Trigger>
    </NativeTabs>
  );
}
