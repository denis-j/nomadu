import { Stack } from 'expo-router/stack';

export default function CreateTripStack() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerTransparent: true,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  );
}
