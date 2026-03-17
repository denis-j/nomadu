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
    </Stack>
  );
}
