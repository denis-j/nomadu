import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  Model,
  useCameraManipulator,
} from 'react-native-filament';

interface NomaduTitle3DProps {
  /** Canvas width. Wordmark scales to fit. Defaults to 300. */
  width?: number;
  /** Canvas height. Defaults to 120. */
  height?: number;
  /** Camera distance. Lower = bigger. Defaults to 8. */
  cameraZ?: number;
  /** Model scale multiplier. Defaults to 4. */
  scale?: number;
  style?: ViewStyle;
}

/**
 * 3D wordmark for the brand name "Nomadu". Renders the bundled nomadu.glb
 * with a transparent skybox so the welcome-screen gradient shows through.
 * Static by design — wordmarks shouldn't dance.
 */
export function NomaduTitle3D({
  width = 340,
  height = 180,
  cameraZ = 2.8,
  scale = 4,
  style,
}: NomaduTitle3DProps) {
  return (
    <View
      style={[styles.wrap, { width, height }, style]}
      pointerEvents="none"
    >
      <FilamentScene>
        <Scene cameraZ={cameraZ} scale={scale} />
      </FilamentScene>
    </View>
  );
}

function Scene({ cameraZ, scale }: { cameraZ: number; scale: number }) {
  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 0, cameraZ],
    targetPosition: [0, 0, 0],
    orbitSpeed: [0, 0],
  });

  const uri = useNomaduGlbUri();

  return (
    <FilamentView style={styles.filament} enableTransparentRendering>
      <Camera cameraManipulator={cameraManipulator} />
      <DefaultLight />
      {uri && (
        <Model
          source={{ uri }}
          transformToUnitCube
          scale={[scale, scale, scale]}
        />
      )}
    </FilamentView>
  );
}

/** Resolves nomadu.glb to a concrete file:// URI Filament can load. */
function useNomaduGlbUri(): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const asset = Asset.fromModule(require('../assets/glb/nomadu.glb'));
    asset
      .downloadAsync()
      .then(() => {
        if (cancelled) return;
        const resolved = asset.localUri ?? asset.uri;
        setUri(decodeURI(resolved));
      })
      .catch((e) => console.error('Failed to resolve nomadu.glb', e));
    return () => {
      cancelled = true;
    };
  }, []);
  return uri;
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
  },
  filament: { flex: 1, width: '100%', height: '100%' },
});
