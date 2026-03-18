import { NativeTabs } from 'expo-router/unstable-native-tabs';

const { Trigger } = NativeTabs;

export default function TabLayout() {
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
