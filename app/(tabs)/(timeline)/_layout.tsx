import { Stack } from 'expo-router/stack';

export default function TimelineStack() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Timeline',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.75, 1.0],
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
