import { Stack } from 'expo-router/stack';
import { sheetBackground, sheetWithHeader } from '../../../constants/colors';

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
          contentStyle: { backgroundColor: sheetBackground },
        }}
      />
      <Stack.Screen
        name="import"
        options={{
          presentation: sheetWithHeader,
          title: 'Import Trips',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: sheetBackground },
        }}
      />
    </Stack>
  );
}
