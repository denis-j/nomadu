/**
 * Product analytics (PostHog, EU region).
 *
 * The questions this answers: where people leave the onboarding, how many
 * who see the paywall buy, whether they come back, and which parts of the
 * app get used. Nothing more.
 *
 * Privacy, the same line as monitoring.ts: the Firebase uid as the only
 * identity (never an email address or a name), no places, no dates, no
 * trip contents. Events carry counts and choices, such as the onboarding
 * goal, but never which country or city. Session replay and touch
 * autocapture stay off: they would record location history on screen.
 *
 * Off until `EXPO_PUBLIC_POSTHOG_KEY` is set, and off in development so
 * test runs do not pollute the numbers. Like the Sentry DSN, the project
 * key is a write-only ingest key and is meant to ship in the bundle.
 */

import PostHog from 'posthog-react-native';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const HOST = 'https://eu.i.posthog.com';

export const analyticsEnabled = KEY.length > 0 && !__DEV__;

/**
 * Every event the app sends, with its properties. One list, so the names
 * stay consistent and nothing personal slips into a property by accident.
 */
export type AnalyticsEvent =
  | { name: 'onboarding_started' }
  | { name: 'onboarding_profile_done' }
  | { name: 'onboarding_citizenship_done' }
  | { name: 'onboarding_goal_chosen'; props: { goal: string } }
  | { name: 'onboarding_residence_chosen'; props: { fixed_residence: boolean } }
  | { name: 'onboarding_location'; props: { choice: 'enabled' | 'skipped'; always_granted: boolean } }
  | { name: 'signed_up'; props: { method: 'email' | 'apple' | 'google' } }
  | { name: 'signed_in'; props: { method: 'email' | 'apple' | 'google' } }
  | { name: 'signed_out' }
  | { name: 'account_deleted' }
  | { name: 'paywall_viewed'; props: { source: 'onboarding' | 'app' } }
  | { name: 'purchase_completed'; props: { source: 'onboarding' | 'app' } }
  | { name: 'purchase_restored'; props: { source: 'onboarding' | 'app' } }
  | { name: 'trip_added'; props: { method: 'manual' | 'import' | 'tracking'; count?: number } }
  | { name: 'visa_added' }
  | { name: 'journey_created'; props: { from_guide: boolean } }
  | { name: 'stop_added' }
  | { name: 'document_added'; props: { kind: string } }
  | { name: 'accommodation_option_added' };

let client: PostHog | null = null;

function posthog(): PostHog | null {
  if (!analyticsEnabled) return null;
  if (!client) {
    client = new PostHog(KEY, {
      host: HOST,
      // App opened, backgrounded, installed, updated: the basis of retention.
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      // No profile for people who never sign up; the funnel still counts them.
      personProfiles: 'identified_only',
    });
  }
  return client;
}

export function track(event: AnalyticsEvent): void {
  try {
    posthog()?.capture(event.name, 'props' in event ? event.props : undefined);
  } catch {
    // Analytics never gets to break the app.
  }
}

/** A screen by its route, e.g. "/(tabs)/(plans)/[id]", never with its ids filled in. */
export function trackScreen(route: string): void {
  try {
    posthog()?.screen(route);
  } catch {
    // ignore
  }
}

/** Signed in: tie the anonymous onboarding to the account. Signed out: start over. */
export function setAnalyticsUser(uid: string | null): void {
  try {
    const ph = posthog();
    if (!ph) return;
    if (uid) ph.identify(uid);
    else ph.reset();
  } catch {
    // ignore
  }
}
