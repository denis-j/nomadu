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
