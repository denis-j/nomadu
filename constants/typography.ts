import type { TextStyle } from 'react-native';
import { Colors, systemColor } from './colors';

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
 * The scale. Every size in the app is one of these, close to Apple's own
 * text styles so the app reads as native:
 *
 *   52  hero number        34  large display       28  tile number, display
 *   22  large title        20  title               17  card title, value, body
 *   16  callout            15  card subtitle, body 13  meta, labels, footnote
 *   12  caption            11  smallest tag
 *
 * 14, 13.5, 14.5, 32, 36 and the like are not on it: pick the step next to it.
 *
 * Pick by role, not by size:
 * - Something in a list card (a stop in the Verlauf, a trip in the Plan, a
 *   stop in a trip, a country on the Visa or Tax page): `cardTitle` for its
 *   name, `cardSubtitle` for the grey line that names more (the country),
 *   `cardMeta` for dates, counts and rules, `cardValue` for a number in it.
 *   Cards that do the same job look the same on every tab.
 * - A tile whose number is the content (Tracking): `tileNumber`, its label
 *   `tileLabel`. Small fact tiles (`StatTile`) take `cardValue` + `tileLabel`.
 * - At most one `heroNumber` per screen: the one figure the page is about.
 * - Numbers are bold (700) like everything else; 800 stays for the brand lines.
 * - A quiet section heading (grey, uppercase, above a card or list) is always
 *   `sectionLabel`; never rebuild it from `eyebrow` or from its own values.
 * - Stand out with weight or color before size. Overriding `fontWeight` or
 *   `color` on a role is fine; a `fontSize` of your own is not (lint warns).
 *   A screen that truly needs a new size adds a role here first.
 * - For numeric displays add `fontVariant: ['tabular-nums']` so digits don't
 *   shimmer when they change. The dedicated `numericLarge` already includes it.
 * - Brand styles are the big welcome lines; use them for those moments,
 *   not for ordinary section headings.
 */

/**
 * The scale as numbers, named after Apple's text styles. For a size that
 * belongs to no role (a chart label, an emoji, a size that changes on
 * press): `fontSize: FontSize.subheadline`. Prefer a role from `Typography`
 * whenever one fits; never write the number itself.
 */
export const FontSize = {
  hero: 52,
  largeTitle: 34,
  title1: 28,
  title2: 22,
  title3: 20,
  body: 17,
  callout: 16,
  subheadline: 15,
  footnote: 13,
  caption1: 12,
  caption2: 11,
} as const;

// Identity helper so each entry is typed as TextStyle without losing inference.
const T = <S extends TextStyle>(s: S): S => s;

export const Typography = {
  // ─── Brand: the big welcome lines ───────────────────────────────────────
  // Once Instrument Serif Italic; the app is set in the system sans
  // everywhere else, and a second face only on the sign-in and onboarding
  // screens read as a different product. Same voice now, just bigger.
  brandDisplay: T({
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.9,
    lineHeight: 40,
    color: Colors.text,
  }),
  brandTitle: T({
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: Colors.text,
  }),

  // ─── Display, hero numerals ─────────────────────────────────────────────
  displayLarge: T({
    fontSize: 34,
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

  // ─── Title, section headings, card titles ──────────────────────────────
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

  // ─── Body, content ─────────────────────────────────────────────────────
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

  // ─── Label, inline labels, metadata (sits next to a value) ─────────────
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

  // ─── Eyebrow, small uppercase tags above titles ────────────────────────
  eyebrow: T({
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  }),

  /** A quiet section heading: in Settings, in every sheet, above a list. */
  sectionLabel: T({
    fontSize: 13,
    fontWeight: '600',
    color: systemColor('secondaryLabel'),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  }),

  // ─── Cards: one look for every list card, whichever tab it is on ──────
  /** The name in a list card: Berlin, Thailand, Italien. Apple's Headline. */
  cardTitle: T({
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  }),
  /** The grey line under the name that names more: the country, a visa's name. */
  cardSubtitle: T({
    fontSize: 15,
    fontWeight: '400',
    color: Colors.textSecondary,
  }),
  /** Dates, counts, the rule a number follows: "Nov 7 – 25 · 3 Stopps". */
  cardMeta: T({
    fontSize: 13,
    fontWeight: '400',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  }),
  /** A number inside a card or a small fact tile: never larger than the card's title. */
  cardValue: T({
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  }),

  // ─── Tiles and heroes: where the number is the content ─────────────────
  /** The label over a tile's number: Länder, Dauer, Gesamt. */
  tileLabel: T({
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  }),
  /** The number in a dashboard tile (Tracking). */
  tileNumber: T({
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  }),
  /** The one figure a screen is about. At most one per screen. */
  heroNumber: T({
    fontSize: 52,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -1.5,
    lineHeight: 58,
    fontVariant: ['tabular-nums'],
  }),

  // ─── Caption, hints, helper text, fine print ───────────────────────────
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

  // ─── Numeric, tabular nums for stat values ─────────────────────────────
  numericLarge: T({
    fontSize: 34,
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
