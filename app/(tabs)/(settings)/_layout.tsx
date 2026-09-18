import { Stack } from 'expo-router/stack';

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
          headerTransparent: true,
          headerBlurEffect: 'systemMaterial',
          headerBackButtonDisplayMode: 'minimal',
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
          presentation: 'formSheet',
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
