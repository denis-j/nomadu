import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { WebView } from 'react-native-webview';
import { useAvatarSvg } from '../lib/avatars';

/**
 * DiceBear's animated face (a blink, a sway), laid over the still picture
 * the caller already draws. React Native does not run the CSS animation in
 * the SVG, so it plays in a small transparent web view that only appears
 * once it has drawn, so there is never a blank frame. Nothing to tap:
 * touches go through to whatever sits underneath.
 *
 * Only the still picture shows with Reduce Motion on, or while the SVG is
 * not on disk yet.
 */
export function AnimatedFace({ seed, size }: { seed: string | null; size: number }) {
  const reduceMotion = useReducedMotion();
  const svg = useAvatarSvg(reduceMotion ? null : seed);
  const [shown, setShown] = useState<string | null>(null);
  if (!svg || reduceMotion) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: shown === svg ? 1 : 0 }]}>
      <WebView
        key={seed ?? ''}
        source={{ html: page(svg, size) }}
        originWhitelist={['*']}
        style={[styles.web, { width: size, height: size }]}
        containerStyle={styles.web}
        onLoadEnd={() => setShown(svg)}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

/** The SVG at exactly `size` points; a device-width viewport would draw it far larger and show only a corner. */
function page(svg: string, size: number): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=${size},initial-scale=1,maximum-scale=1,user-scalable=no"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:${size}px;height:${size}px}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`;
}

const styles = StyleSheet.create({
  web: { backgroundColor: 'transparent', flex: 0 },
});
