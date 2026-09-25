import * as WebBrowser from 'expo-web-browser';

/**
 * The legal pages, served by Firebase Hosting from `web/`. The same two
 * links belong in App Store Connect (privacy policy URL) and in the
 * RevenueCat paywall; Apple wants both reachable from inside the app for a
 * subscription.
 */
const SITE = 'https://nomady-dcff6.web.app';
export const PRIVACY_URL = `${SITE}/privacy`;
export const TERMS_URL = `${SITE}/terms`;
/** German law wants the provider's details reachable from the app too. */
export const IMPRINT_URL = `${SITE}/impressum`;

/** Opened in the in-app browser, so the user stays in the app. */
export function openLegal(url: string): void {
  WebBrowser.openBrowserAsync(url).catch(() => {});
}
