/**
 * Shared entrance-animation timing for every onboarding setup screen
 * (goal, residence, permissions). Single source of truth so the rhythm
 * is identical screen-to-screen.
 *
 * KEPT INTENTIONALLY SIMPLE — pure FadeIn (opacity only, no Y transform,
 * no custom easing chain). Reanimated layout animations with chained
 * .easing() can stutter; pure fade is the smoothest reliable primitive.
 *
 * Sequence: icon → title → option 1 → option 2 → option 3 → …
 */
export const ENTER_DURATION = 380;

export const ICON_DELAY = 0;
export const TITLE_DELAY = 80;
export const OPTION_BASE_DELAY = 180;
export const OPTION_STAGGER = 70;
