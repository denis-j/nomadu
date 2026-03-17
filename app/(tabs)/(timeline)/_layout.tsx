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
    </Stack>
  );
}
