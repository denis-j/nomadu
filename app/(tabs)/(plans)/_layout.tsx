import { Stack } from 'expo-router/stack';

export default function PlansStack() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Journeys',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          headerBackTitle: 'Journeys',
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="add-stop"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.85, 1.0],
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="stop-info"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.7, 1.0],
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="edit-stop"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.85, 1.0],
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          presentation: 'formSheet',
          title: 'New Trip',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.3],
        }}
      />
    </Stack>
  );
}
