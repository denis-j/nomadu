import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { BubbleVisual, type BubbleVisualProps } from './TimelineBubbles';

interface FloatingBubbleConfig {
  /** 0..1, fraction of container width */
  x: number;
  /** 0..1, fraction of container height */
  y: number;
  /** Bubble visual size in px */
  size: number;
  icon: BubbleVisualProps['icon'];
  iconColor?: string;
  /** Drift amplitudes in px */
  ampX: number;
  ampY: number;
  /** Angular speed (rad/s) */
  speed: number;
  /** Starting phase in radians */
  phase: number;
  /** Overall opacity, 0..1 */
  opacity?: number;
}

const DEFAULT_BUBBLES: FloatingBubbleConfig[] = [
  { x: 0.12, y: 0.18, size: 46, icon: 'airplane',        iconColor: '#A6B4C2', ampX: 18, ampY: 12, speed: 0.45, phase: 0.0, opacity: 0.85 },
  { x: 0.82, y: 0.12, size: 38, icon: 'map',             iconColor: '#4DC1FF', ampX: 14, ampY: 18, speed: 0.55, phase: 1.2, opacity: 0.9 },
  { x: 0.18, y: 0.62, size: 52, icon: 'image',           iconColor: '#A6B4C2', ampX: 22, ampY: 14, speed: 0.35, phase: 2.4, opacity: 0.8 },
  { x: 0.78, y: 0.55, size: 44, icon: 'document-text',   iconColor: '#4DC1FF', ampX: 16, ampY: 22, speed: 0.5,  phase: 3.6, opacity: 0.9 },
  { x: 0.5,  y: 0.85, size: 36, icon: 'time',            iconColor: '#A6B4C2', ampX: 20, ampY: 14, speed: 0.4,  phase: 4.8, opacity: 0.75 },
  { x: 0.32, y: 0.32, size: 32, icon: 'location',        iconColor: '#A6B4C2', ampX: 12, ampY: 18, speed: 0.6,  phase: 0.7, opacity: 0.7 },
  { x: 0.68, y: 0.78, size: 30, icon: 'calendar',        iconColor: '#A6B4C2', ampX: 14, ampY: 16, speed: 0.5,  phase: 1.8, opacity: 0.7 },
];

interface FloatingBubblesProps {
  width: number;
  height: number;
  bubbles?: FloatingBubbleConfig[];
}

export const FloatingBubbles = memo(function FloatingBubbles({
  width,
  height,
  bubbles = DEFAULT_BUBBLES,
}: FloatingBubblesProps) {
  const t = useSharedValue(0);
  useFrameCallback((frame) => {
    t.value = frame.timeSinceFirstFrame / 1000;
  });

  return (
    <View style={[styles.layer, { width, height }]} pointerEvents="none">
      {bubbles.map((b, i) => (
        <Drifter key={i} t={t} width={width} height={height} config={b} />
      ))}
    </View>
  );
});

const Drifter = memo(function Drifter({
  t,
  width,
  height,
  config,
}: {
  t: ReturnType<typeof useSharedValue<number>>;
  width: number;
  height: number;
  config: FloatingBubbleConfig;
}) {
  const baseX = config.x * width - config.size / 2;
  const baseY = config.y * height - config.size / 2;

  const style = useAnimatedStyle(() => {
    const a = t.value * config.speed + config.phase;
    return {
      transform: [
        { translateX: Math.sin(a) * config.ampX },
        { translateY: Math.cos(a * 0.9) * config.ampY },
        { rotate: `${Math.sin(a * 0.7) * 6}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.bubble,
        { left: baseX, top: baseY, opacity: config.opacity ?? 1 },
        style,
      ]}
    >
      <BubbleVisual
        size={config.size}
        icon={config.icon}
        iconSize={config.size * 0.42}
        iconColor={config.iconColor ?? '#A6B4C2'}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
