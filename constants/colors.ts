import { Platform, PlatformColor, type ColorValue } from 'react-native';

export const Colors = {
  // Primary palette
  primary: '#000000',
  primaryLight: '#000000',
  primaryDark: '#000000',

  // Accent
  accent: '#E8976E',
  accentLight: '#F2B899',

  // Neutrals
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0F2F5',
  border: '#E5E7EB',

  // Whites, for overlays/text on dark or vivid backgrounds
  white: '#FFFFFF',
  whiteAlpha90: 'rgba(255, 255, 255, 0.9)',
  whiteAlpha75: 'rgba(255, 255, 255, 0.75)',
  whiteAlpha55: 'rgba(255, 255, 255, 0.55)',
  whiteAlpha35: 'rgba(255, 255, 255, 0.35)',

  // Brand, Cloudy
  cloudyBlue: '#4DC1FF',
  cloudyButtonText: '#0B2541', // dark navy for legible CTAs on the cloudy gradient

  // Text
  text: '#000000',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',

  // Semantic
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#FF3B30', // iOS system red, matches what we already use in most places

  // Map
  markerDefault: '#4A90A4',
  markerVisited: '#E8976E',
} as const;

/**
 * iOS system colours (UIKit's semantic names) that follow dark mode and
 * accessibility settings there. Android has no colours of these names, and
 * a PlatformColor it cannot resolve throws while the view is created: the
 * screens using them crashed on Android. There they fall back to the palette.
 */
type SystemColorName =
  | 'label'
  | 'secondaryLabel'
  | 'tertiaryLabel'
  | 'separator'
  | 'link'
  | 'placeholderText'
  | 'secondarySystemGroupedBackground'
  | 'systemGray5';

const ANDROID_SYSTEM_COLORS: Record<SystemColorName, string> = {
  label: Colors.text,
  secondaryLabel: Colors.textSecondary,
  tertiaryLabel: Colors.textTertiary,
  separator: Colors.border,
  link: '#007AFF',
  placeholderText: Colors.textTertiary,
  secondarySystemGroupedBackground: Colors.surface,
  systemGray5: '#E5E5EA',
};

export function systemColor(name: SystemColorName): ColorValue {
  return Platform.OS === 'ios' ? PlatformColor(name) : ANDROID_SYSTEM_COLORS[name];
}

/**
 * Under sheets and their headers iOS draws a glass material itself, so the
 * screens leave their own background transparent. Android draws nothing
 * there: the sheet showed the screen behind it and the header lay over the
 * list. On Android they get the app background and a solid header.
 */
export const sheetBackground = Platform.OS === 'ios' ? 'transparent' : Colors.background;
export const headerTransparent = Platform.OS === 'ios';

/**
 * For sheets that show a native header (title, back, save checkmark).
 * Android sheets draw no header at all, which left those screens without
 * their save button, so there they open as a regular page instead.
 */
export const sheetWithHeader = Platform.OS === 'ios' ? ('formSheet' as const) : ('card' as const);
