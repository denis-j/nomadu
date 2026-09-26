import { Stack } from 'expo-router/stack';
import { headerTransparent, sheetWithHeader } from '../../../constants/colors';

export default function SettingsStack() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="passport"
        options={{
          title: 'Passport',
          headerTransparent,
          headerBlurEffect: 'systemMaterial',
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          presentation: sheetWithHeader,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.75, 1.0],
        }}
      />
      <Stack.Screen
        name="agent"
        options={{
          title: 'AI agent',
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Screen
        name="agent-connect"
        options={{
          presentation: sheetWithHeader,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.72, 1.0],
        }}
      />
      <Stack.Screen
        name="debug"
        options={{
          title: 'Debug',
        }}
      />
    </Stack>
  );
}
