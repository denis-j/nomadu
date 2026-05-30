import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

type Variant = 'pop' | 'burst' | 'wobble' | 'burstWobble' | 'none';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface BubbleIcon {
  name: IoniconName;
  color?: string;
}

interface TimelineBubblesProps {
  size?: number;
  variant?: Variant;
  /** Three icons to render: [left, center, right]. Center is the prominent / colored one. */
  icons?: [BubbleIcon, BubbleIcon, BubbleIcon];
}

const DEFAULT_ICONS: [BubbleIcon, BubbleIcon, BubbleIcon] = [
  { name: 'airplane', color: '#A6B4C2' },
  { name: 'map', color: '#4DC1FF' },
  { name: 'time', color: '#A6B4C2' },
];

export function TimelineBubbles({ size = 80, variant = 'none', icons = DEFAULT_ICONS }: TimelineBubblesProps) {
  const [left, center, right] = icons;
  return (
    <View style={[styles.wrapper, { height: size * 1.05, width: size * 2.4 }]}>
      <AnimatedBubble
        index={0}
        variant={variant}
        size={size * 0.85}
        baseRotate={-12}
        baseTranslateX={size * 0.18}
        zIndex={1}
        icon={left.name}
        iconSize={size * 0.32}
        iconColor={left.color ?? '#A6B4C2'}
      />
      <AnimatedBubble
        index={1}
        variant={variant}
        size={size}
        baseRotate={0}
        baseTranslateX={0}
        zIndex={3}
        icon={center.name}
        iconSize={size * 0.42}
        iconColor={center.color ?? '#4DC1FF'}
      />
      <AnimatedBubble
        index={2}
        variant={variant}
        size={size * 0.85}
        baseRotate={12}
        baseTranslateX={-size * 0.18}
        zIndex={1}
        icon={right.name}
        iconSize={size * 0.34}
        iconColor={right.color ?? '#A6B4C2'}
      />
    </View>
  );
}

// ─── Animated wrapper around each Bubble — switches animation based on variant ───

interface AnimatedBubbleProps {
  index: 0 | 1 | 2;
  variant: Variant;
  size: number;
  baseRotate: number; // degrees
  baseTranslateX: number;
  zIndex: number;
  icon: IoniconName;
  iconSize: number;
  iconColor: string;
}

function AnimatedBubble(props: AnimatedBubbleProps) {
  switch (props.variant) {
    case 'pop':
      return <PopBubble {...props} />;
    case 'burst':
      return <BurstBubble {...props} />;
    case 'wobble':
      return <WobbleBubble {...props} />;
    case 'burstWobble':
      return <BurstWobbleBubble {...props} />;
    default:
      return (
        <View
          style={{
            transform: [{ translateX: props.baseTranslateX }, { rotate: `${props.baseRotate}deg` }],
            zIndex: props.zIndex,
          }}
        >
          <BubbleVisual {...props} />
        </View>
      );
  }
}

// ─── Variant A: Pop-In Stagger + Idle Hover ───

function PopBubble({ index, size, baseRotate, baseTranslateX, zIndex, ...rest }: AnimatedBubbleProps) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const hover = useSharedValue(0);

  useEffect(() => {
    // Center (index 1) pops first, sides after a short delay
    const delay = index === 1 ? 0 : 140;
    opacity.value = withDelay(delay, withTiming(1, { duration: 220 }));
    scale.value = withDelay(delay, withSpring(1, { damping: 9, stiffness: 130, mass: 0.6 }));

    // Start hover bobbing after pop-in settles
    hover.value = withDelay(
      900 + index * 200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: baseTranslateX },
      { translateY: hover.value * 4 - 2 }, // -2..+2 px
      { rotate: `${baseRotate}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={[{ zIndex }, style]}>
      <BubbleVisual size={size} {...rest} />
    </Animated.View>
  );
}

// ─── Variant B: Burst Reveal (from center, scale + slide out + rotate overshoot) ───

function BurstBubble({ index, size, baseRotate, baseTranslateX, zIndex, ...rest }: AnimatedBubbleProps) {
  const progress = useSharedValue(0); // 0 = collapsed at center, 1 = in place

  useEffect(() => {
    // Slight stagger + slow timing with back easing for a visible overshoot burst
    progress.value = withDelay(
      120 + index * 40,
      withTiming(1, { duration: 950, easing: Easing.out(Easing.back(1.8)) }),
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: Math.min(1, p * 2.5),
      transform: [
        { translateX: baseTranslateX * p },
        { rotate: `${baseRotate * p}deg` },
        { scale: 0.1 + 0.9 * p },
      ],
    };
  });

  return (
    <Animated.View style={[{ zIndex }, style]}>
      <BubbleVisual size={size} {...rest} />
    </Animated.View>
  );
}

// ─── Combined: Burst Reveal → settles into Subtle Wobble ───

function BurstWobbleBubble({ index, size, baseRotate, baseTranslateX, zIndex, ...rest }: AnimatedBubbleProps) {
  const progress = useSharedValue(0); // 0 = collapsed in center, 1 = in place
  const t = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      120 + index * 40,
      withTiming(1, { duration: 950, easing: Easing.out(Easing.back(1.8)) }),
    );
  }, []);

  useFrameCallback((frame) => {
    t.value = frame.timeSinceFirstFrame / 1000;
  });

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const phase = index * 2.1;
    // Wobble only kicks in once the burst has nearly landed (>70% progress)
    const wobbleStrength = Math.max(0, Math.min(1, (p - 0.7) / 0.3));
    const wobbleRot = Math.sin(t.value * 1.0 + phase) * 1.5 * wobbleStrength;
    const wobbleY = Math.cos(t.value * 0.7 + phase) * 2 * wobbleStrength;

    return {
      opacity: Math.min(1, p * 2.5),
      transform: [
        { translateX: baseTranslateX * p },
        { translateY: wobbleY },
        { rotate: `${baseRotate * p + wobbleRot}deg` },
        { scale: 0.1 + 0.9 * p },
      ],
    };
  });

  return (
    <Animated.View style={[{ zIndex }, style]}>
      <BubbleVisual size={size} {...rest} />
    </Animated.View>
  );
}

// ─── Variant C: Subtle Continuous Wobble (no entry pop) ───

function WobbleBubble({ index, size, baseRotate, baseTranslateX, zIndex, ...rest }: AnimatedBubbleProps) {
  const t = useSharedValue(0);
  useFrameCallback((frame) => {
    t.value = frame.timeSinceFirstFrame / 1000;
  });

  const style = useAnimatedStyle(() => {
    const phase = (index * 2.1);
    const wobbleRot = Math.sin(t.value * 1.0 + phase) * 1.5; // ±1.5°
    const wobbleY = Math.cos(t.value * 0.7 + phase) * 2;     // ±2 px
    return {
      transform: [
        { translateX: baseTranslateX },
        { translateY: wobbleY },
        { rotate: `${baseRotate + wobbleRot}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[{ zIndex }, style]}>
      <BubbleVisual size={size} {...rest} />
    </Animated.View>
  );
}

// ─── Pure visual (no animation, no positioning) ───

export interface BubbleVisualProps {
  size: number;
  icon: IoniconName;
  iconSize: number;
  iconColor: string;
}

export function BubbleVisual({ size, icon, iconSize, iconColor }: BubbleVisualProps) {
  const radius = size * 0.28;
  return (
    <View
      style={[
        styles.shadowWrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          shadowColor: '#1F2937',
          shadowOpacity: 0.35,
          shadowRadius: size * 0.35,
          shadowOffset: { width: 0, height: size * 0.18 },
        },
      ]}
    >
      <View
        style={[
          styles.shadowWrap,
          {
            width: size,
            height: size,
            borderRadius: radius,
            shadowColor: '#1F2937',
            shadowOpacity: 0.25,
            shadowRadius: size * 0.12,
            shadowOffset: { width: 0, height: size * 0.06 },
          },
        ]}
      >
        <View style={[styles.bubbleClip, { borderRadius: radius }]}>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient
                id={`dome-${size}`}
                cx={size * 0.5}
                cy={-size * 0.2}
                rx={size * 1.1}
                ry={size * 1.1}
                fx={size * 0.5}
                fy={-size * 0.2}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="0.55" stopColor="#F5F7FA" stopOpacity="1" />
                <Stop offset="0.82" stopColor="#CCD3DB" stopOpacity="1" />
                <Stop offset="0.94" stopColor="#A3ACB7" stopOpacity="1" />
                <Stop offset="1" stopColor="#8A95A2" stopOpacity="1" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width={size} height={size} fill={`url(#dome-${size})`} />
          </Svg>
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(31,41,55,0.18)']}
            start={{ x: 0.5, y: 0.7 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.25 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={iconSize} color={iconColor} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadowWrap: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
  },
  bubbleClip: {
    flex: 1,
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(31,41,55,0.12)',
  },
  iconWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
