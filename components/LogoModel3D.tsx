import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  ModelRenderer,
  RenderCallbackContext,
  useCameraManipulator,
  useFilamentContext,
  useModel,
  type FrameInfo,
} from 'react-native-filament';
import { useSharedValue, type ISharedValue } from 'react-native-worklets-core';
import { useGlbUri } from '../hooks/useGlbUri';

const LOGO = require('../assets/glb/logo.glb');

const TURN = 2 * Math.PI;
/**
 * Spin: one full turn in this many seconds. The splash is usually on screen
 * for two to four seconds; at six per turn it only got halfway and left the
 * mirrored back of the N as the last picture.
 */
const SECONDS_PER_TURN = 2.5;
/** Intro: one quick turn when the screen appears, easing out onto the front. */
const INTRO_SECONDS = 1.1;
/** Drag: radians per point of finger travel. */
const DRAG_RADIANS_PER_PT = 0.012;
/** After a flick the turn slows by this factor per second... */
const FRICTION = 3.2;
/** ...and below this speed (rad/s) it glides onto the nearest front view. */
const SETTLE_BELOW = 1.2;

export type LogoMotion =
  /** Turns on its own, forever (the splash). */
  | 'spin'
  /** One quick turn on appearing, then still; turns under a finger. */
  | 'intro';

type MotionState = {
  dragging: ISharedValue<boolean>;
  dragAngle: ISharedValue<number>;
  releaseVelocity: ISharedValue<number>;
  touched: ISharedValue<boolean>;
  angle: ISharedValue<number>;
};

/**
 * The "N in the clouds" logo in 3D. Transparent, so whatever is behind it
 * shows around it. `onReady` fires once the model is loaded, so the caller
 * can fade it in instead of showing an empty canvas while Filament starts.
 */
export function LogoModel3D({
  size,
  motion = 'spin',
  onReady,
  style,
}: {
  size: number;
  motion?: LogoMotion;
  onReady?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  // Written by the gesture (JS), read each frame on Filament's render thread.
  const state: MotionState = {
    dragging: useSharedValue(false),
    dragAngle: useSharedValue(0),
    releaseVelocity: useSharedValue(0),
    touched: useSharedValue(false),
    angle: useSharedValue(0),
  };
  const angleAtGrab = useSharedValue(0);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(motion === 'intro')
    .onBegin(() => {
      state.touched.value = true;
      angleAtGrab.value = state.angle.value;
      state.dragAngle.value = state.angle.value;
      state.dragging.value = true;
    })
    .onUpdate((e) => {
      state.dragAngle.value = angleAtGrab.value + e.translationX * DRAG_RADIANS_PER_PT;
    })
    .onFinalize((e) => {
      state.releaseVelocity.value = e.velocityX * DRAG_RADIANS_PER_PT;
      state.dragging.value = false;
    });

  return (
    <GestureHandlerRootView style={[{ width: size, height: size }, style]}>
      <GestureDetector gesture={pan}>
        <View style={styles.fill} pointerEvents={motion === 'intro' ? 'auto' : 'none'}>
          <FilamentScene>
            <LogoScene motion={motion} onReady={onReady} state={state} />
          </FilamentScene>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

function LogoScene({ motion, onReady, state }: { motion: LogoMotion; onReady?: () => void; state: MotionState }) {
  const uri = useGlbUri(LOGO);
  const cameraManipulator = useCameraManipulator({
    // Close enough that the N fills most of its square, with room left for
    // its depth as it turns.
    orbitHomePosition: [0, 0, 3.6],
    targetPosition: [0, 0, 0],
    orbitSpeed: [0, 0],
  });
  return (
    <FilamentView style={styles.fill} enableTransparentRendering>
      <Camera cameraManipulator={cameraManipulator} />
      <DefaultLight />
      {uri && <TurningLogo uri={uri} motion={motion} onReady={onReady} state={state} />}
    </FilamentView>
  );
}

function TurningLogo({ uri, motion, onReady, state }: { uri: string; motion: LogoMotion; onReady?: () => void; state: MotionState }) {
  const model = useModel({ uri });
  const { transformManager } = useFilamentContext();
  const introStart = useSharedValue(-1);
  const velocity = useSharedValue(0);
  const wasDragging = useSharedValue(false);
  const { dragging, dragAngle, releaseVelocity, touched, angle } = state;

  useEffect(() => {
    if (model.state === 'loaded') onReady?.();
  }, [model.state, onReady]);

  // Each frame, on Filament's render thread: work out the angle, fit the
  // model into a unit cube around the origin, then turn it. Filament puts a
  // rotation in front of the current transform, so the turn is around the
  // model's own centre; the other way round the N would swing around its
  // file origin. Set in full every frame, so no drift accumulates.
  // Negative angles: the front of the N turns towards the left.
  RenderCallbackContext.useRenderCallback(({ passedSeconds, timeSinceLastFrame }: FrameInfo) => {
    'worklet';
    if (model.state !== 'loaded') return;
    const dt = Math.min(timeSinceLastFrame, 0.05);
    let a = angle.value;

    if (motion === 'spin') {
      a = -(passedSeconds * TURN) / SECONDS_PER_TURN;
    } else if (dragging.value) {
      a = dragAngle.value;
      wasDragging.value = true;
    } else if (wasDragging.value) {
      // Just let go: carry the flick on from here.
      wasDragging.value = false;
      velocity.value = releaseVelocity.value;
    } else if (!touched.value) {
      // The intro turn, once, easing out onto the front.
      if (introStart.value < 0) introStart.value = passedSeconds;
      const t = Math.min((passedSeconds - introStart.value) / INTRO_SECONDS, 1);
      a = -TURN * (1 - Math.pow(1 - t, 3));
    } else if (Math.abs(velocity.value) > SETTLE_BELOW) {
      a += velocity.value * dt;
      velocity.value *= Math.exp(-FRICTION * dt);
    } else {
      // Slow enough: glide onto the nearest front view, never stop sideways.
      velocity.value = 0;
      const front = Math.round(a / TURN) * TURN;
      a += (front - a) * Math.min(1, dt * 6);
    }

    angle.value = a;
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    transformManager.setEntityRotation(model.rootEntity, a, [0, 1, 0], true);
  }, [model, transformManager, motion, dragging, dragAngle, releaseVelocity, touched, angle, introStart, velocity, wasDragging]);

  return <ModelRenderer model={model} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
