/**
 * Tiny module-level passthrough used by the visa-country-picker form-sheet
 * to return the user's selection to the screen that opened it. The picker is
 * pushed as its own route (not a React Native Modal) so it gets the native
 * iOS Liquid Glass header, but expo-router has no built-in return-value
 * channel, so we stash the result here and pop it on focus.
 */

type CountrySelection = { name: string; code: string };

let pending: CountrySelection | null = null;

export function setPendingCountry(value: CountrySelection | null): void {
  pending = value;
}

export function consumePendingCountry(): CountrySelection | null {
  const v = pending;
  pending = null;
  return v;
}
