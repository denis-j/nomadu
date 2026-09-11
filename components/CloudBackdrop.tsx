import { StyleSheet } from 'react-native';
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

export const CLOUD_COLOR = '#4DC1FF';

/** Soft white patches, as fractions of the surface, so they scale with it. */
export interface CloudPatch {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** The button's arrangement: a low, wide strip of cloud. */
export const BUTTON_PATCHES: CloudPatch[] = [
  { x: 0.18, y: 0.35, rx: 0.13, ry: 0.45 },
  { x: 0.82, y: 0.60, rx: 0.14, ry: 0.50 },
  { x: 0.50, y: 0.18, rx: 0.18, ry: 0.35 },
  { x: 0.35, y: 0.82, rx: 0.10, ry: 0.30 },
  { x: 0.65, y: 0.85, rx: 0.11, ry: 0.30 },
];

/**
 * The cloud surface behind the primary button, as a reusable backdrop.
 *
 * Radial blue-to-white gradient, a handful of blurred white ellipses and a
 * top highlight. This is the brand's texture; a card that wants to feel like
 * part of Nomadu rather than a generic dashboard tile paints itself with it.
 * Absolutely positioned: give the parent `overflow: hidden` and a measured
 * size, and put the content after it.
 */
export function CloudBackdrop({
  width,
  height,
  patches = BUTTON_PATCHES,
  blur = 3.5,
}: {
  width: number;
  height: number;
  patches?: CloudPatch[];
  blur?: number;
}) {
  if (width <= 0 || height <= 0) return null;
  return (
    <>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgRadialGradient
            id="cloud"
            cx={width / 2}
            cy={height / 2}
            rx={width * 0.55}
            ry={width * 0.55}
            fx={width / 2}
            fy={height / 2}
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
            <FeGaussianBlur stdDeviation={blur} />
          </Filter>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#cloud)" />
        <G filter="url(#softblur)">
          {patches.map((cfg, i) => (
            <Ellipse
              key={i}
              cx={width * cfg.x}
              cy={height * cfg.y}
              rx={width * cfg.rx}
              ry={height * cfg.ry}
              fill="url(#patch)"
            />
          ))}
        </G>
      </Svg>
      <LinearGradient
        colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}
