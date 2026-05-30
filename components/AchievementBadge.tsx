import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, {
  ClipPath,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient as SvgRadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

export type BadgeTier = 'gold' | 'silver' | 'bronze';

interface AchievementBadgeProps {
  size?: number;
  flag: string;
  title: string;
  days?: number;
  subtitle?: string;
  tier?: BadgeTier;
  /** Front face enamel colors [top, middle, bottom] */
  enamelColors?: [string, string, string];
}

interface MetalColors {
  rimLight: string;
  rimMid: string;
  rimDark: string;
  divider: string;
  textShadow: string;
}

const METAL: Record<BadgeTier, MetalColors> = {
  gold: {
    rimLight: '#FFEFAE',
    rimMid: '#D9A92E',
    rimDark: '#5E3D08',
    divider: '#F1C24C',
    textShadow: '#5E3D08',
  },
  silver: {
    rimLight: '#FAFCFE',
    rimMid: '#A6B0BC',
    rimDark: '#3B4452',
    divider: '#D9DFE7',
    textShadow: '#3B4452',
  },
  bronze: {
    rimLight: '#F4C39A',
    rimMid: '#B16332',
    rimDark: '#4A220B',
    divider: '#D78250',
    textShadow: '#4A220B',
  },
};

const DEFAULT_ENAMEL: [string, string, string] = ['#F33D72', '#3FBBD9', '#86C547'];
const BACK_ENAMEL: [string, string, string] = ['#7A4FCC', '#3FBBD9', '#86C547'];

export function AchievementBadge({
  size = 200,
  flag,
  title,
  days,
  subtitle,
  tier = 'gold',
  enamelColors = DEFAULT_ENAMEL,
}: AchievementBadgeProps) {
  const rotateY = useSharedValue(0);
  const rotateX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startX = useSharedValue(0);

  const tap = Gesture.Tap()
    .maxDuration(220)
    .onEnd(() => {
      rotateY.value = withSpring(rotateY.value + 180, {
        damping: 14, stiffness: 90, mass: 0.9,
      });
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      startY.value = rotateY.value;
      startX.value = rotateX.value;
    })
    .onUpdate((e) => {
      rotateY.value = startY.value + e.translationX * 0.6;
      const nextX = startX.value - e.translationY * 0.4;
      rotateX.value = Math.max(-45, Math.min(45, nextX));
    })
    .onEnd((e) => {
      const velocityBonus = e.velocityX * 0.15;
      const target = Math.round((rotateY.value + velocityBonus) / 180) * 180;
      rotateY.value = withSpring(target, { damping: 16, stiffness: 110, mass: 0.9 });
      rotateX.value = withSpring(0, { damping: 14, stiffness: 90 });
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
    ],
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value + 180}deg` },
    ],
  }));

  const metal = METAL[tier];

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.container, { width: size, height: size * 1.12 }]}>
        {/* Soft ground shadow */}
        <View
          style={[
            styles.shadow,
            {
              width: size * 0.78,
              height: size * 0.16,
              borderRadius: size,
              top: size * 0.95,
              left: (size - size * 0.78) / 2,
            },
          ]}
        />

        <Animated.View style={[styles.face, frontStyle]}>
          <HexBadgeFace size={size} metal={metal} enamel={enamelColors}>
            <Text style={[styles.frontFlag, { fontSize: size * 0.32 }]}>{flag}</Text>
            <Text
              style={[
                styles.frontTitle,
                {
                  fontSize: size * 0.07,
                  color: '#FFFFFF',
                  textShadowColor: metal.textShadow,
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </HexBadgeFace>
        </Animated.View>

        <Animated.View style={[styles.face, styles.absoluteFace, backStyle]}>
          <HexBadgeFace size={size} metal={metal} enamel={BACK_ENAMEL}>
            <Text
              style={[
                styles.backTitle,
                {
                  fontSize: size * 0.085,
                  color: '#FFFFFF',
                  textShadowColor: metal.textShadow,
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                },
              ]}
              numberOfLines={2}
            >
              {title}
            </Text>
            {days !== undefined && (
              <View style={styles.daysRow}>
                <Text style={[styles.daysValue, { fontSize: size * 0.2, color: '#FFFFFF', textShadowColor: metal.textShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]}>
                  {days}
                </Text>
                <Text style={[styles.daysUnit, { fontSize: size * 0.07, color: '#FFFFFF', textShadowColor: metal.textShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]}>
                  days
                </Text>
              </View>
            )}
            {subtitle && (
              <Text style={[styles.backSubtitle, { fontSize: size * 0.055, color: 'rgba(255,255,255,0.9)' }]} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </HexBadgeFace>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// ─── Hex badge visual ─────────────────────────────────────────────────────────
// Renders a clean hexagonal medal: outer metal rim → enamel bands clipped to inner hex.
// `backfaceVisibility: hidden` is on the OUTER face wrapper (the rotating Animated.View),
// not the inner SVG, so the back face stays hidden when rotated past 90°.

function HexBadgeFace({
  size,
  metal,
  enamel,
  children,
}: {
  size: number;
  metal: MetalColors;
  enamel: [string, string, string];
  children: React.ReactNode;
}) {
  const id = `b-${size}-${metal.rimMid}-${enamel[0]}-${enamel[1]}-${enamel[2]}`;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 1;
  const innerR = outerR * 0.86;

  const SQRT3 = Math.sqrt(3);

  // Pointy-top hex point list, R = radius
  const hexPath = (r: number) => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return `M ${pts[0][0]},${pts[0][1]} ` +
      pts.slice(1).map((p) => `L ${p[0]},${p[1]}`).join(' ') +
      ' Z';
  };

  // Inner hex dimensions for the bands
  const innerTop = cy - innerR;
  const innerBottom = cy + innerR;
  const innerSideTopY = cy - innerR / 2;
  const innerSideBotY = cy + innerR / 2;
  const innerWidth = innerR * SQRT3; // edge-to-edge width

  // Two divider Y positions (split into 3 horizontal bands)
  const band1End = cy - innerR * 0.4;
  const band2End = cy + innerR * 0.25;

  // Band fill rects (full width — they'll be clipped to the hex)
  const bandLeft = cx - innerR * SQRT3 / 2 - 2;
  const bandFullWidth = innerR * SQRT3 + 4;

  return (
    <View style={styles.faceInner}>
      <Svg width={size} height={size}>
        <Defs>
          {/* Outer rim: vertical metallic gradient */}
          <SvgLinearGradient id={`${id}-rim`} x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0" stopColor={metal.rimLight} />
            <Stop offset="0.45" stopColor={metal.rimMid} />
            <Stop offset="1" stopColor={metal.rimDark} />
          </SvgLinearGradient>

          {/* Enamel gradients per band, each with vertical 3D tint */}
          {enamel.map((c, i) => (
            <SvgLinearGradient key={i} id={`${id}-e${i}`} x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor={tintColor(c, 0.5)} />
              <Stop offset="0.55" stopColor={c} />
              <Stop offset="1" stopColor={tintColor(c, -0.25)} />
            </SvgLinearGradient>
          ))}

          {/* Inner hex used as a clip path so bands are confined to the hex shape */}
          <ClipPath id={`${id}-clip`}>
            <Path d={hexPath(innerR)} />
          </ClipPath>

          {/* Top glossy highlight */}
          <SvgRadialGradient
            id={`${id}-glint`}
            cx={cx}
            cy={cy * 0.3}
            rx={outerR * 0.9}
            ry={outerR * 0.4}
            fx={cx}
            fy={cy * 0.3}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="rgba(255,255,255,0.85)" />
            <Stop offset="1" stopColor="rgba(255,255,255,0)" />
          </SvgRadialGradient>
        </Defs>

        {/* Outer metallic hex frame */}
        <Path d={hexPath(outerR)} fill={`url(#${id}-rim)`} />

        {/* Inner backdrop (gold/silver divider color) — gaps between bands will show this */}
        <Path d={hexPath(innerR)} fill={metal.divider} />

        {/* Enamel bands, all clipped to the inner hex */}
        <G clipPath={`url(#${id}-clip)`}>
          <Rect x={bandLeft} y={innerTop - 2} width={bandFullWidth} height={band1End - innerTop + 2} fill={`url(#${id}-e0)`} />
          <Rect x={bandLeft} y={band1End + 1.5} width={bandFullWidth} height={band2End - band1End - 3} fill={`url(#${id}-e1)`} />
          <Rect x={bandLeft} y={band2End + 1.5} width={bandFullWidth} height={innerBottom - band2End + 2} fill={`url(#${id}-e2)`} />
        </G>

        {/* Inner border between rim and enamel — adds depth */}
        <Path d={hexPath(innerR)} stroke={metal.rimDark} strokeOpacity={0.5} strokeWidth={1} fill="none" />
        {/* Outer dark line at the rim edge */}
        <Path d={hexPath(outerR)} stroke={metal.rimDark} strokeOpacity={0.75} strokeWidth={1} fill="none" />

        {/* Top glossy highlight */}
        <Path d={hexPath(outerR)} fill={`url(#${id}-glint)`} />
      </Svg>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function tintColor(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const mix = (ch: number) =>
    amount >= 0
      ? Math.round(ch + (255 - ch) * amount)
      : Math.round(ch * (1 + amount));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  shadow: {
    position: 'absolute',
    backgroundColor: '#000',
    opacity: 0.22,
  },
  face: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // CRITICAL: hide the back side of the rotating element so the other face only shows when facing camera
    backfaceVisibility: 'hidden',
  },
  absoluteFace: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  faceInner: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 2,
  },
  frontFlag: {},
  frontTitle: {
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  backTitle: {
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  daysValue: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  daysUnit: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  backSubtitle: {
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
});
