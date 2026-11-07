import { Platform, PlatformColor, type ColorValue } from 'react-native';

export const Colors = {
  // Primary palette
  primary: '#000000',

  // Accent
  accent: '#E8976E',

  // Neutrals
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0F2F5',
  border: '#E5E7EB',

  // Whites, for overlays/text on dark or vivid backgrounds
  white: '#FFFFFF',
  whiteAlpha75: 'rgba(255, 255, 255, 0.75)',
  whiteAlpha55: 'rgba(255, 255, 255, 0.55)',

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
 * Every sheet has this solid ground, on both platforms: with a transparent
 * one the screen behind shone through and its text lay under the form.
 * Set it as `contentStyle` on anything presented as a sheet, and on the inner
 * stack of a sheet that has one.
 */
export const sheetBackground = Colors.background;

/** iOS draws its header as glass over the content, Android as a solid bar. */
export const headerTransparent = Platform.OS === 'ios';

/**
 * For sheets that show a native header (title, back, save checkmark).
 * Android sheets draw no header at all, which left those screens without
 * their save button, so there they open as a regular page instead.
 */
export const sheetWithHeader = Platform.OS === 'ios' ? ('formSheet' as const) : ('card' as const);
