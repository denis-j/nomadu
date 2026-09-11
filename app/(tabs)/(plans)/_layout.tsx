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
          // Static header setup lives here so the first frame already has it;
          // set from inside the screen it arrived a frame late and flickered.
          headerBackTitle: 'Journeys',
          headerLargeTitle: false,
          headerTransparent: true,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          title: '',
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
        name="documents"
        options={{
          headerBackButtonDisplayMode: 'minimal',
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="add-document"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="document"
        options={{
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Screen
        name="journey-map"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.92, 1.0],
          headerBackButtonDisplayMode: 'minimal',
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
