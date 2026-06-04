import { Stack } from 'expo-router/stack';
import { useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import AnimatedGradientBackground from '../../components/animated-gradient-background';
import { OnboardingProgress } from '../../components/OnboardingProgress';

const TOTAL_STEPS = 6;

function stepForSegment(segment: string | undefined): number | null {
  switch (segment) {
    case 'citizenship': return 1;
    case 'goal': return 2;
    case 'residence': return 3;
    case 'storage': return 4;
    case 'experimentals': return 5;
    case 'permissions': return 6;
    default: return null;
  }
}

const SHARED_GRADIENT_COLORS = [
  {
    colors: ['#4DC1FF', '#8AD3FF', '#DBF0FF'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  {
    colors: ['#8AD3FF', '#DBF0FF', '#FFFFFF'],
    start: { x: 1, y: 0 },
    end: { x: 0, y: 1 },
  },
];

export default function OnboardingLayout() {
  const segments = useSegments();
  const currentScreen = segments[1];
  const step = stepForSegment(currentScreen);

  return (
    <View style={styles.root}>
      <AnimatedGradientBackground colorSets={SHARED_GRADIENT_COLORS} duration={4000} />

      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="welcome" />
        <Stack.Screen name="citizenship" />
        <Stack.Screen name="goal" />
        <Stack.Screen name="residence" />
        <Stack.Screen name="storage" />
        <Stack.Screen name="experimentals" />
        <Stack.Screen name="permissions" />
        <Stack.Screen name="loading" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="celebrate" />
      </Stack>

      {step !== null && <OnboardingProgress step={step} total={TOTAL_STEPS} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
