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
          // The trip draws its own bar over the map (back disc, morphing
          // title chip, add disc): a native header title cannot grow into
          // the travellers panel. Set here so the first frame is right.
          headerShown: false,
          headerBackTitle: 'Journeys',
          title: '',
        }}
      />
      <Stack.Screen
        name="add-stop"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="stop-info"
        options={{
          // Like a stay's sheet: the map is the header, and the sheet opens
          // full so map, stats and details are all there at once.
          headerShown: false,
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [1.0],
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
        name="accommodation"
        options={{
          headerBackButtonDisplayMode: 'minimal',
          headerLargeTitle: false,
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
          sheetAllowedDetents: [0.34],
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
