import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
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
import { Colors } from '../../constants/colors';

const THAILAND_GLB = require('../../assets/glb/thailand.glb');
const VIETNAM_GLB = require('../../assets/glb/vietnam.glb');

// Match the app's page background exactly so the canvas blends in.
const PAGE_BG = Colors.background; // '#F8F9FA'

export default function BadgesDebugScreen() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Badges (Debug)', headerBackTitle: 'Back' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.label}>Thailand</Text>
        <View style={styles.canvasWrap}>
          <FilamentScene>
            <Scene source={THAILAND_GLB} />
          </FilamentScene>
        </View>

        <Text style={styles.label}>Vietnam</Text>
        <View style={styles.canvasWrap}>
          <FilamentScene>
            <Scene source={VIETNAM_GLB} />
          </FilamentScene>
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

function Scene({ source }: { source: number }) {
  // Skybox matching the page bg → seamless white canvas.
  useSkybox({ color: PAGE_BG, envIntensity: 1.2 });

  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 0, 8],
    targetPosition: [0, 0, 0],
    orbitSpeed: [0.006, 0.006],
  });

  const [viewSize, setViewSize] = useState({ w: 1, h: 1 });

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
        style={styles.filamentView}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setViewSize({ w: width, h: height });
        }}
      >
        <Camera cameraManipulator={cameraManipulator} />
        <DefaultLight />
        <Model source={source} scale={[2, 2, 2]} />
      </FilamentView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  content: {
    padding: 20,
    paddingBottom: 60,
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 4,
  },
  canvasWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: PAGE_BG,
  },
  filamentView: { flex: 1 },
});
