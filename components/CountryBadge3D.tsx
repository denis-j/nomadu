import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  Model,
  useCameraManipulator,
  useSkybox,
} from 'react-native-filament';
import { Colors } from '../constants/colors';

/**
 * Resolves a `require(...)`'d GLB module to a concrete local `file://` URI.
 *
 * In dev, react-native-filament can load the metro http URL directly, but in a
 * production build there is no metro server — the bundled asset has to be
 * resolved to its on-device file path. expo-asset's downloadAsync() unpacks the
 * embedded asset and gives us `localUri`, which Filament's loader accepts via
 * its `file://` branch.
 */
function useGlbUri(moduleId: number): string | null {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const asset = Asset.fromModule(moduleId);
    asset
      .downloadAsync()
      .then(() => {
        if (cancelled) return;
        const resolved = asset.localUri ?? asset.uri;
        // expo-asset returns a percent-encoded URI (e.g. "Application%20Support").
        // react-native-filament's native loader does NOT percent-decode the path
        // before NSData reads it, so "%20" is treated literally and the file is not
        // found in release builds. Decode it back to real spaces here.
        setUri(decodeURI(resolved));
      })
      .catch((e) => {
        console.error('Failed to resolve GLB asset', e);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  return uri;
}

// Country-code → GLB module. Add new badges here as you create the assets.
const COUNTRY_BADGES: Record<string, number> = {
  TH: require('../assets/glb/thailand.glb'),
  VN: require('../assets/glb/vietnam.glb'),
  IT: require('../assets/glb/italy.glb'),
  ES: require('../assets/glb/spain.glb'),
  PL: require('../assets/glb/poland.glb'),
  ID: require('../assets/glb/indonesia.glb'),
  CN: require('../assets/glb/china.glb'),
};

export function hasCountryBadge(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return !!COUNTRY_BADGES[countryCode.toUpperCase()];
}

interface CountryBadge3DProps {
  countryCode: string;
  /** Fixed height in px. Omit (or pass undefined) to fill the parent (flex: 1). */
  height?: number;
  /** Background color of the canvas — defaults to the app background so it blends seamlessly */
  backgroundColor?: string;
}

export function CountryBadge3D({
  countryCode,
  height,
  backgroundColor = Colors.background,
}: CountryBadge3DProps) {
  const source = COUNTRY_BADGES[countryCode.toUpperCase()];
  if (!source) return null;

  const sizingStyle = height != null ? { height } : { flex: 1 };

  return (
    <GestureHandlerRootView style={[styles.wrap, sizingStyle, { backgroundColor }]}>
      <FilamentScene>
        <Scene source={source} backgroundColor={backgroundColor} />
      </FilamentScene>
    </GestureHandlerRootView>
  );
}

function Scene({
  source,
  backgroundColor,
}: {
  source: number;
  backgroundColor: string;
}) {
  // Match the surrounding view's bg so the canvas blends in seamlessly
  useSkybox({ color: backgroundColor, envIntensity: 1.2 });

  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 0, 11],
    targetPosition: [0, 0, 0],
    orbitSpeed: [0.006, 0.006],
  });

  const [viewSize, setViewSize] = useState({ w: 1, h: 1 });
  const uri = useGlbUri(source);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => cameraManipulator?.grabBegin(e.x, e.y, false))
    .onUpdate((e) => cameraManipulator?.grabUpdate(e.x, e.y))
    .onEnd(() => cameraManipulator?.grabEnd());

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((e) => {
      const delta = (1 - e.scale) * 2;
      cameraManipulator?.scroll(viewSize.w / 2, viewSize.h / 2, delta);
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  return (
    <GestureDetector gesture={gesture}>
      <FilamentView
        style={styles.filament}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setViewSize({ w: width, h: height });
        }}
      >
        <Camera cameraManipulator={cameraManipulator} />
        <DefaultLight />
        {uri && <Model source={{ uri }} scale={[2.2, 2.2, 2.2]} />}
      </FilamentView>
    </GestureDetector>
  );
}

// ─── Lightweight non-interactive preview ────────────────────────────────────
// Used inside small tiles (stats badges row, library grid). No gestures,
// fixed camera, blends with the surrounding tile via backgroundColor.

interface CountryBadge3DPreviewProps {
  countryCode: string;
  /** Tile background — Filament needs an opaque colour for the skybox to blend cleanly. */
  backgroundColor?: string;
  /** Model scale multiplier — default 2.7 fills small tile previews nicely. */
  scale?: number;
}

export function CountryBadge3DPreview({
  countryCode,
  backgroundColor = '#FFFFFF',
  scale = 3.5,
}: CountryBadge3DPreviewProps) {
  const source = COUNTRY_BADGES[countryCode.toUpperCase()];
  if (!source) return null;

  return (
    <View style={[styles.previewWrap, { backgroundColor }]} pointerEvents="none">
      {/* interval: 60 → roughly 1fps. Badge previews never animate, so we don't need 60fps
          per tile — this drops GPU load by ~60x while still keeping the model rendered. */}
      <FilamentScene frameRateOptions={{ interval: 60 }}>
        <PreviewScene source={source} backgroundColor={backgroundColor} scale={scale} />
      </FilamentScene>
    </View>
  );
}

function PreviewScene({
  source,
  backgroundColor,
  scale,
}: {
  source: number;
  backgroundColor: string;
  scale: number;
}) {
  // envIntensity: 0 → skybox renders as the exact color we pass (no IBL warm cast).
  // The model is still lit by <DefaultLight /> below.
  useSkybox({ color: backgroundColor, envIntensity: 0 });

  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 0, 11],
    targetPosition: [0, 0, 0],
    orbitSpeed: [0, 0],
  });

  const uri = useGlbUri(source);

  return (
    <FilamentView style={styles.filament}>
      <Camera cameraManipulator={cameraManipulator} />
      <DefaultLight />
      {uri && <Model source={{ uri }} scale={[scale, scale, scale]} />}
    </FilamentView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  filament: { flex: 1 },
  previewWrap: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
});
