// react-native -> react-native-web for the design-sync web build, plus the
// iOS/Android-only APIs react-native-web doesn't export (the app guards them
// behind Platform.OS checks, so on web they only need to exist).
export * from 'react-native-web';
export const PlatformColor = (...names) => names[0];
export const DynamicColorIOS = (o) => o.light;
export const ActionSheetIOS = { showActionSheetWithOptions: () => {}, dismissActionSheet: () => {} };
export const ToastAndroid = { show: () => {}, SHORT: 0, LONG: 1 };
export const TurboModuleRegistry = { get: () => null, getEnforcing: () => ({}) };
export const requireNativeComponent = () => () => null;
export const codegenNativeComponent = () => () => null;
export const NativeModules = {};
