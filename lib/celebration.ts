/**
 * Module-level flag that signals "we're showing the post-purchase celebration
 * screen, do NOT route the user away yet". RootNavigator reads this at the
 * top of its routing effect and bails out while it's true.
 *
 * Without this, the Purchases SDK's customer-info listener fires faster than
 * our `router.replace('/(onboarding)/celebrate')` and the navigator yanks the
 * user straight to /(tabs), skipping the confetti screen entirely.
 */

let _celebrating = false;

export function setCelebrating(value: boolean): void {
  _celebrating = value;
}

export function isCelebrating(): boolean {
  return _celebrating;
}
