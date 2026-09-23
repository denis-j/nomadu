/**
 * Crash and error reporting.
 *
 * The app previously shipped with nothing: a render error tore down the whole
 * React tree, the user saw a white screen, and the only signal was a one-star
 * review. This wires up Sentry plus a global handler for errors that escape
 * React entirely.
 *
 * Privacy is the delicate part here. Nomadu holds location history, trip
 * timelines and passport data, so the defaults are turned down rather than
 * accepted: no PII, no console breadcrumbs (those would carry AI responses
 * containing the user's own trips), and the Firebase uid instead of an email
 * address. A uid is enough to correlate a report with a support request and
 * says nothing on its own.
 *
 * Reporting is off until `EXPO_PUBLIC_SENTRY_DSN` is set. Unlike the Gemini
 * key from F1, a Sentry DSN is meant to be public: it is a write-only ingest
 * endpoint and cannot be used to read anything back, so shipping it in the
 * bundle is the intended usage.
 *
 * ── Setup state ─────────────────────────────────────────────────────────────
 *
 * Project `nomadu/nomadu-ios`, hosted in Sentry's EU region. The DSN lives in
 * `.env.local` and the Expo config plugin is wired up in `app.json`, pointed
 * at `https://de.sentry.io/`. That URL matters: an EU-region organisation is
 * not reachable through the default `sentry.io` endpoint, and the source map
 * upload fails with a confusing 404 if it is left at the default.
 *
 * One step is still outstanding, and it needs a secret this file must not
 * contain. Source map upload during an EAS build authenticates with a token:
 *
 *   npx eas secret:create --name SENTRY_AUTH_TOKEN --value <token>
 *
 * Without it, reports still arrive but every frame points into minified
 * Hermes bytecode instead of real file names and line numbers.
 *
 * The plugin changes native configuration, so picking it up needs a new build
 * rather than an OTA update.
 */

import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/** False when no DSN is configured, in which case every call here is a no-op. */
export const monitoringEnabled = DSN.length > 0;

let initialised = false;

export function initMonitoring(): void {
  if (!monitoringEnabled || initialised) return;
  initialised = true;

  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',

    // Never attach IP addresses, device names or other identifying extras.
    sendDefaultPii: false,

    // Performance tracing is a separate cost and a separate privacy surface
    // (it records screen names and network URLs). Off until asked for.
    tracesSampleRate: 0,

    integrations: (defaults) =>
      defaults.filter((integration) => {
        // Console output includes Gemini responses, which contain the user's
        // own trip data. Those must not ride along as breadcrumbs.
        if (integration.name === 'Breadcrumbs') return false;
        return true;
      }),

    beforeSend(event) {
      // Belt and braces: strip anything that could carry an address even if a
      // future integration puts it back.
      if (event.user) {
        event.user = { id: event.user.id };
      }
      delete event.server_name;
      return event;
    },
  });
}

/**
 * Attach the signed-in user to subsequent reports, or clear it on sign-out.
 * Only the uid is sent, never the email address.
 */
export function setMonitoringUser(uid: string | null): void {
  if (!monitoringEnabled) return;
  Sentry.setUser(uid ? { id: uid } : null);
}

/**
 * Report a handled error with a label for where it came from.
 *
 * Use this for failures the app recovers from but that should not pass
 * silently, such as a sync round that threw.
 */
/**
 * Something that is not an Error, as a line worth reading. `String({})` is
 * "[object Object]", and a Sentry issue by that name says nothing at all:
 * the background location task hands over a plain object, and for a week it
 * reported 26 times without once naming the failure.
 */
function describe(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown };
    const parts = [e.code, e.message].filter((v) => typeof v === 'string' && v);
    if (parts.length) return parts.join(': ');
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

export function reportError(error: unknown, context: string): void {
  if (!monitoringEnabled) {
    if (__DEV__) console.error(`[${context}]`, error);
    return;
  }
  Sentry.withScope((scope) => {
    scope.setTag('context', context);
    Sentry.captureException(error instanceof Error ? error : new Error(describe(error)));
  });
}
