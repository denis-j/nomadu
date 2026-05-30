import { ReactNode, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  Ellipse,
  FeGaussianBlur,
  Filter,
  G,
  RadialGradient as SvgRadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';

const CLOUD_COLOR = '#4DC1FF';

const PATCH_CONFIG = [
  { x: 0.18, y: 0.35, rx: 0.13, ry: 0.45 },
  { x: 0.82, y: 0.60, rx: 0.14, ry: 0.50 },
  { x: 0.50, y: 0.18, rx: 0.18, ry: 0.35 },
  { x: 0.35, y: 0.82, rx: 0.10, ry: 0.30 },
  { x: 0.65, y: 0.85, rx: 0.11, ry: 0.30 },
];

interface CloudyButtonProps {
  onPress: () => void;
  children: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  /** Haptic feedback style on press. Defaults to Medium. Pass null to disable. */
  haptic?: Haptics.ImpactFeedbackStyle | null;
}

/**
 * Primary cloud-style button — radial blue→white gradient with patchy white
 * blobs, a top chamfer highlight and a subtle press feedback. Used for the
 * key primary CTAs across the app (e.g. timeline empty state, badge unlock).
 */
export function CloudyButton({
  onPress,
  children,
  compact,
  style,
  innerStyle,
  haptic = Haptics.ImpactFeedbackStyle.Medium,
}: CloudyButtonProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const handlePress = () => {
    if (haptic !== null) Haptics.impactAsync(haptic);
    onPress();
  };

  return (
    <View style={styles.shadow}>
      <Pressable
        onPress={handlePress}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
        }}
        style={({ pressed }) => [
          styles.outer,
          compact && styles.outerCompact,
          style,
          pressed && styles.pressed,
        ]}
      >
        {size.w > 0 && (
          <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgRadialGradient
                id="cloud"
                cx={size.w / 2}
                cy={size.h / 2}
                rx={size.w * 0.55}
                ry={size.w * 0.55}
                fx={size.w / 2}
                fy={size.h / 2}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={CLOUD_COLOR} stopOpacity="1" />
                <Stop offset="0.5" stopColor="#8AD3FF" stopOpacity="1" />
                <Stop offset="0.85" stopColor="#DBF0FF" stopOpacity="1" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
              </SvgRadialGradient>
              <SvgRadialGradient id="patch" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.3" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </SvgRadialGradient>
              <Filter id="softblur" x="-10%" y="-10%" width="120%" height="120%">
                <FeGaussianBlur stdDeviation="3.5" />
              </Filter>
            </Defs>
            <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#cloud)" />
            <G filter="url(#softblur)">
              {PATCH_CONFIG.map((cfg, i) => (
                <Ellipse
                  key={i}
                  cx={size.w * cfg.x}
                  cy={size.h * cfg.y}
                  rx={size.w * cfg.rx}
                  ry={size.h * cfg.ry}
                  fill="url(#patch)"
                />
              ))}
            </G>
          </Svg>
        )}
        <LinearGradient
          colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.inner, innerStyle]}>{children}</View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    width: '100%',
    maxWidth: 360,
  },
  outer: {
    borderRadius: 999,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  outerCompact: {
    paddingVertical: 14,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
});
