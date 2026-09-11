import { Stack } from 'expo-router/stack';

export default function StatsStack() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Tracking',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="visa"
        options={{
          title: 'Visa',
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Screen
        name="visa-edit"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      {/* Three-step add flow. Its own stack supplies the per-step headers,
          so the sheet itself shows none. Same setup as the trip-create sheet. */}
      <Stack.Screen
        name="visa-new"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="visa-country-picker"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Screen
        name="tax"
        options={{
          title: 'Tax Residence',
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: true
        }}
      />
    </Stack>
  );
}
