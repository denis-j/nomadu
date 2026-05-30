import { Stack } from 'expo-router/stack';

export default function StatsStack() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Stats',
          headerLargeTitle: true,
        }}

      />
      <Stack.Screen
        name="visa"
        options={{
          title: 'Visa Tracker',
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: true
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
