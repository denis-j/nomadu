import { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PARTICLE_COUNT = 40;

const COLORS = [
  '#4DC1FF', // Cloudy blue
  '#8AD3FF', // light cloudy
  '#FFFFFF', // white
  '#FFD46B', // warm gold
  '#E8976E', // accent
  '#4CAF50', // success green
];

interface ParticleSpec {
  startX: number;
  delay: number;
  duration: number;
  drift: number;
  rotateAmount: number;
  color: string;
  width: number;
  height: number;
  radius: number;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function Particle({ spec }: { spec: ParticleSpec }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      spec.delay,
      withTiming(1, { duration: spec.duration, easing: Easing.in(Easing.quad) }),
    );
  }, [t, spec.delay, spec.duration]);

  const style = useAnimatedStyle(() => {
    const y = -40 + t.value * (SCREEN_HEIGHT + 80);
    const x = spec.startX + Math.sin(t.value * Math.PI * 2) * spec.drift;
    const rotate = t.value * spec.rotateAmount;
    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          backgroundColor: spec.color,
          width: spec.width,
          height: spec.height,
          borderRadius: spec.radius,
        },
        style,
      ]}
    />
  );
}

/**
 * One-shot confetti burst rained down from above the screen. Decorative only,
 * pointerEvents none so it never blocks interactions. ~40 particles with
 * randomised colour, size, drift, fall-speed and rotation for a non-uniform
 * "real" confetti feel.
 */
export function ConfettiBurst() {
  const particles = useMemo<ParticleSpec[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, () => {
        const w = rand(6, 11);
        const h = w + rand(2, 6);
        return {
          startX: rand(0, SCREEN_WIDTH),
          delay: rand(0, 700),
          duration: rand(2400, 4200),
          drift: rand(-50, 50),
          rotateAmount: rand(360, 1080) * (Math.random() < 0.5 ? -1 : 1),
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          width: w,
          height: h,
          radius: Math.random() < 0.3 ? w / 2 : 2,
        };
      }),
    [],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map((p, i) => (
        <Particle key={i} spec={p} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
  },
});
