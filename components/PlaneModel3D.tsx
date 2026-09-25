import { useEffect } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  Model,
  useCameraManipulator,
} from 'react-native-filament';
import { useGlbUri } from '../hooks/useGlbUri';

const PLANE = require('../assets/glb/plane.glb');

interface PlaneModel3DProps {
  /** Canvas width/height. Defaults to 240×200. */
  width?: number;
  height?: number;
  /** Camera distance. Lower = bigger plane. Defaults to 11. */
  cameraZ?: number;
  /** Optional wrapper style override. */
  style?: ViewStyle;
}

/**
 * The 3D plane that banks gently left/right with a small hover bob. Used as a
 * brand visual on the welcome and permissions screens. Renders with a
 * transparent skybox so the screen's background gradient shines through.
 */
export function PlaneModel3D({
  width = 240,
  height = 200,
  cameraZ = 11,
  style,
}: PlaneModel3DProps) {
  const tilt = useSharedValue(0);

  useEffect(() => {
    tilt.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [tilt]);

  const animatedStyle = useAnimatedStyle(() => {
    const t = tilt.value * 2 - 1;
    return {
      transform: [
        { rotateZ: `${t * 8}deg` },
        { translateY: -t * 6 },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.wrap, { width, height }, animatedStyle, style]}
      pointerEvents="none"
    >
      <FilamentScene>
        <PlaneScene cameraZ={cameraZ} />
      </FilamentScene>
    </Animated.View>
  );
}

function PlaneScene({ cameraZ }: { cameraZ: number }) {
  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 0, cameraZ],
    targetPosition: [0, 0, 0],
    orbitSpeed: [0, 0],
  });

  const uri = useGlbUri(PLANE);

  return (
    <FilamentView style={styles.filament} enableTransparentRendering>
      <Camera cameraManipulator={cameraManipulator} />
      <DefaultLight />
      {uri && <Model source={{ uri }} scale={[4, 4, 4]} />}
    </FilamentView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
  },
  filament: { flex: 1, width: '100%', height: '100%' },
});
