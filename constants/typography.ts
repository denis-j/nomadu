import type { TextStyle } from 'react-native';
import { Colors } from './colors';

/**
 * Typography scale for the entire app. Spread these into StyleSheets:
 *
 *   const styles = StyleSheet.create({
 *     greeting: { ...Typography.titleLarge, marginBottom: 4 },
 *   });
 *
 * Or compose inline:
 *
 *   <Text style={[Typography.body, { color: Colors.success }]}>Done</Text>
 *
 * Rules of thumb:
 * - Default to one of these. Reach for a custom fontSize only if the design
 *   genuinely needs it (oversized hero numerals, decorative outliers).
 * - For numeric displays add `fontVariant: ['tabular-nums']` so digits don't
 *   shimmer when they change. The dedicated `numericLarge` already includes it.
 * - Brand styles (Instrument Serif Italic) are *editorial accents* — use them
 *   sparingly for welcome moments, NOT for ordinary section headings.
 */

// Identity helper so each entry is typed as TextStyle without losing inference.
const T = <S extends TextStyle>(s: S): S => s;

export const Typography = {
  // ─── Brand — editorial accents only ──────────────────────────────────────
  brandDisplay: T({
    fontFamily: 'InstrumentSerif_400Regular_Italic',
    fontSize: 44,
    color: Colors.text,
  }),
  brandTitle: T({
    fontFamily: 'InstrumentSerif_400Regular_Italic',
    fontSize: 32,
    color: Colors.text,
  }),

  // ─── Display — hero numerals ─────────────────────────────────────────────
  displayLarge: T({
    fontSize: 36,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  }),
  displayMedium: T({
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.4,
  }),

  // ─── Title — section headings, card titles ──────────────────────────────
  titleLarge: T({
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  }),
  titleMedium: T({
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  }),
  titleSmall: T({
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  }),

  // ─── Body — content ─────────────────────────────────────────────────────
  bodyLarge: T({
    fontSize: 17,
    fontWeight: '400',
    color: Colors.text,
  }),
  body: T({
    fontSize: 15,
    fontWeight: '400',
    color: Colors.text,
  }),
  bodyMedium: T({
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  }),
  bodySmall: T({
    fontSize: 13,
    fontWeight: '400',
    color: Colors.text,
  }),

  // ─── Label — inline labels, metadata (sits next to a value) ─────────────
  label: T({
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  }),
  labelStrong: T({
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  }),

  // ─── Eyebrow — small uppercase tags above titles ────────────────────────
  eyebrow: T({
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  }),

  // ─── Caption — hints, helper text, fine print ───────────────────────────
  caption: T({
    fontSize: 12,
    fontWeight: '400',
    color: Colors.textTertiary,
  }),

  // ─── Button text ────────────────────────────────────────────────────────
  buttonLarge: T({
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  }),
  button: T({
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  }),

  // ─── Numeric — tabular nums for stat values ─────────────────────────────
  numericLarge: T({
    fontSize: 36,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  }),
  numericMedium: T({
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  }),
} as const;
