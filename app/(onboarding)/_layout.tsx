import { Stack } from 'expo-router/stack';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="citizenship" />
      <Stack.Screen name="residence" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="storage" />
      <Stack.Screen name="paywall" />
    </Stack>
  );
}
