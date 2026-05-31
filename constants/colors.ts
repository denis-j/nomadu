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

  // Whites — for overlays/text on dark or vivid backgrounds
  white: '#FFFFFF',
  whiteAlpha90: 'rgba(255, 255, 255, 0.9)',
  whiteAlpha75: 'rgba(255, 255, 255, 0.75)',
  whiteAlpha55: 'rgba(255, 255, 255, 0.55)',
  whiteAlpha35: 'rgba(255, 255, 255, 0.35)',

  // Brand — Cloudy
  cloudyBlue: '#4DC1FF',
  cloudyButtonText: '#0B2541', // dark navy for legible CTAs on the cloudy gradient

  // Text
  text: '#000000',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',

  // Semantic
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#FF3B30', // iOS system red — matches what we already use in most places

  // Map
  markerDefault: '#4A90A4',
  markerVisited: '#E8976E',

  // Dark mode
  dark: {
    background: '#0F1419',
    surface: '#1A1F25',
    surfaceSecondary: '#252B33',
    border: '#2F3740',
    text: '#F1F3F5',
    textSecondary: '#8B95A1',
    textTertiary: '#5C6773',
  },
} as const;
