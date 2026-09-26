import { Platform, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

/**
 * Keeps its content above the keyboard on Android.
 *
 * The app draws edge to edge there, so the window no longer shrinks for the
 * keyboard, and KeyboardAvoidingView does not help either: React Native
 * reports the keyboard at the start of its slide-in, zero high, whenever
 * system animations are on. Reanimated follows the keyboard frame by frame.
 * On iOS this is a plain view; screens keep their own handling there.
 */
export function KeyboardLift({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const keyboard = useAnimatedKeyboard();
  const android = Platform.OS === 'android';
  // An empty style on iOS, so a paddingBottom the screen sets stays.
  const lift = useAnimatedStyle(() => (android ? { paddingBottom: keyboard.height.value } : {}));
  return <Animated.View style={[style, lift]}>{children}</Animated.View>;
}
