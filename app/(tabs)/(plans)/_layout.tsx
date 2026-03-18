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
    </Stack>
  );
}
