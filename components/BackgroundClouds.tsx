import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface CloudDef {
  size: number;
  /** Color with alpha, rgba string. */
  color: string;
  /** Absolute position. */
  top: number;
  left?: number;
  right?: number;
  /** Horizontal drift amplitude in px. */
  drift: number;
  /** Drift cycle duration in ms. */
  duration: number;
  /** Animation phase offset 0..1 so multiple clouds aren't perfectly in sync. */
  phase: number;
}

// Kept deliberately small + low opacity. The wordmark + plane are the hero;
// these are background texture only. Top edge gets the heaviest dusting so
// the sky feels populated; mid + bottom keep just enough to balance.
const CLOUDS: CloudDef[] = [
  // Top band — more dense to make the sky feel alive
  { size: 50, color: 'rgba(255, 255, 255, 0.45)', top: 50,  left: -14, drift: 22, duration: 19000, phase: 0    },
  { size: 32, color: 'rgba(255, 255, 255, 0.35)', top: 70,  right: 30, drift: 16, duration: 22000, phase: 0.3  },
  { size: 26, color: 'rgba(255, 255, 255, 0.30)', top: 110, left: 60,  drift: 14, duration: 24000, phase: 0.55 },
  { size: 42, color: 'rgba(255, 255, 255, 0.40)', top: 130, right: -14, drift: 20, duration: 20000, phase: 0.15 },
  { size: 28, color: 'rgba(255, 255, 255, 0.30)', top: 180, left: 30,  drift: 14, duration: 23000, phase: 0.7  },
  { size: 36, color: 'rgba(255, 255, 255, 0.32)', top: 200, right: 70, drift: 16, duration: 25000, phase: 0.45 },
  // Mid band
  { size: 24, color: 'rgba(255, 255, 255, 0.22)', top: 300, left: -10, drift: 12, duration: 27000, phase: 0.2  },
  // Bottom band
  { size: 44, color: 'rgba(255, 255, 255, 0.25)', top: 540, left: -16, drift: 24, duration: 24000, phase: 0.2  },
  { size: 32, color: 'rgba(255, 255, 255, 0.28)', top: 600, right: 12, drift: 18, duration: 21000, phase: 0.7  },
  { size: 24, color: 'rgba(255, 255, 255, 0.20)', top: 660, left: 50,  drift: 12, duration: 17000, phase: 0.55 },
];

function DriftingCloud({ cloud }: { cloud: CloudDef }) {
  const t = useSharedValue(cloud.phase);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(cloud.phase + 1, {
        duration: cloud.duration,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  }, [cloud.duration, cloud.phase, t]);

  const style = useAnimatedStyle(() => {
    // map t through sin to get smooth back-and-forth
    const x = Math.sin(t.value * Math.PI * 2) * cloud.drift;
    return { transform: [{ translateX: x }] };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cloud,
        {
          top: cloud.top,
          left: cloud.left,
          right: cloud.right,
        },
        style,
      ]}
    >
      <Ionicons name="cloud" size={cloud.size} color={cloud.color} />
    </Animated.View>
  );
}

/**
 * Soft white cloud silhouettes drifting horizontally behind the welcome
 * content. Decorative only, pointerEvents none so they never intercept taps.
 */
export function BackgroundClouds() {
  return (
    <>
      {CLOUDS.map((c, i) => (
        <DriftingCloud key={i} cloud={c} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  cloud: {
    position: 'absolute',
  },
});
