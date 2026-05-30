import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

type Variant = 'burstWobble' | 'none';

interface StatsBarsProps {
  size?: number;
  variant?: Variant;
}

const PRIMARY = '#4DC1FF';
const MUTED = '#B7C0CC';

export function StatsBars({ size = 80, variant = 'none' }: StatsBarsProps) {
  const barWidth = size * 0.26;
  const gap = size * 0.07;
  const totalWidth = barWidth * 3 + gap * 2;
  const maxHeight = size * 1.05;

  // Bar heights (relative to maxHeight): left = 0.55, center = 1.0, right = 0.78
  const bars = [
    { index: 0 as const, height: maxHeight * 0.55, color: MUTED },
    { index: 1 as const, height: maxHeight * 1.0, color: PRIMARY },
    { index: 2 as const, height: maxHeight * 0.78, color: MUTED },
  ];

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: totalWidth,
          height: maxHeight * 1.02,
          gap,
        },
      ]}
    >
      {bars.map((b) => (
        <AnimatedBar
          key={b.index}
          index={b.index}
          variant={variant}
          width={barWidth}
          height={b.height}
          color={b.color}
        />
      ))}
    </View>
  );
}

interface AnimatedBarProps {
  index: 0 | 1 | 2;
  variant: Variant;
  width: number;
  height: number;
  color: string;
}

function AnimatedBar(props: AnimatedBarProps) {
  if (props.variant === 'burstWobble') return <BurstWobbleBar {...props} />;
  return (
    <View>
      <BarVisual width={props.width} height={props.height} color={props.color} />
    </View>
  );
}

function BurstWobbleBar({ index, width, height, color }: AnimatedBarProps) {
  const progress = useSharedValue(0); // 0 = collapsed at base, 1 = full height
  const t = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      120 + index * 80,
      withTiming(1, { duration: 850, easing: Easing.out(Easing.back(1.4)) }),
    );
  }, []);

  useFrameCallback((frame) => {
    t.value = frame.timeSinceFirstFrame / 1000;
  });

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    // Wobble kicks in after the bar has grown most of the way
    const wobbleStrength = Math.max(0, Math.min(1, (p - 0.7) / 0.3));
    const phase = index * 1.7;
    const wobbleScale = 1 + Math.sin(t.value * 1.2 + phase) * 0.015 * wobbleStrength;
    const wobbleY = Math.cos(t.value * 0.8 + phase) * 1.5 * wobbleStrength;

    return {
      opacity: Math.min(1, p * 2),
      transform: [
        { translateY: wobbleY },
        { scaleY: p * wobbleScale },
      ],
    };
  });

  // transformOrigin so the bar grows from the bottom
  return (
    <Animated.View style={[{ transformOrigin: 'bottom' }, style]}>
      <BarVisual width={width} height={height} color={color} />
    </Animated.View>
  );
}

// ─── Pure bar visual ───

interface BarVisualProps {
  width: number;
  height: number;
  color: string;
}

function BarVisual({ width, height, color }: BarVisualProps) {
  const radius = width * 0.42;
  // Derive light/dark tints from the base color for the 3D gradient
  const isColored = color === PRIMARY;
  const topLight = isColored ? '#E5F4FF' : '#FAFBFC';
  const bottomDark = isColored ? '#1B95E0' : '#7C8997';
  const midColor = color;
  const id = `bar-${width}-${height}-${color}`;

  return (
    <View
      style={[
        styles.shadowOuter,
        {
          width,
          height,
          borderRadius: radius,
          shadowColor: '#1F2937',
          shadowOpacity: 0.32,
          shadowRadius: width * 0.6,
          shadowOffset: { width: 0, height: width * 0.35 },
        },
      ]}
    >
      <View
        style={[
          styles.shadowInner,
          {
            width,
            height,
            borderRadius: radius,
            shadowColor: '#1F2937',
            shadowOpacity: 0.22,
            shadowRadius: width * 0.2,
            shadowOffset: { width: 0, height: width * 0.1 },
          },
        ]}
      >
        <View style={[styles.clip, { borderRadius: radius }]}>
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient
                id={id}
                cx={width * 0.5}
                cy={-height * 0.05}
                rx={width * 0.9}
                ry={height * 0.95}
                fx={width * 0.5}
                fy={-height * 0.05}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={topLight} stopOpacity="1" />
                <Stop offset="0.45" stopColor={midColor} stopOpacity="1" />
                <Stop offset="0.9" stopColor={midColor} stopOpacity="1" />
                <Stop offset="1" stopColor={bottomDark} stopOpacity="1" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
          </Svg>
          {/* Bottom inner shadow for "tucked in" claymorphic feel */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(15,23,32,0.22)']}
            start={{ x: 0.5, y: 0.75 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Top glossy highlight */}
          <LinearGradient
            colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.25 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  shadowOuter: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
  },
  shadowInner: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
  },
  clip: {
    flex: 1,
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(31,41,55,0.12)',
  },
});
