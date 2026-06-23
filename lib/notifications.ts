/**
 * Notification system.
 *
 * Three categories:
 *
 *   1. **Arrival**       — "Welcome to Bangkok 🇹🇭". Fired ONLY from the
 *                          background location task. Dedup'd by AsyncStorage
 *                          so two near-simultaneous triggers (e.g. background
 *                          task + race with foreground catch-up) can't fire
 *                          twice for the same city. Foreground location
 *                          checks deliberately do NOT fire arrival notifs —
 *                          the user already sees the new city inside the app.
 *
 *   2. **Usage threshold** — "Schengen 90/180: 75% used". Reactive: we fire
 *                            these whenever we recalculate visa/tax statuses
 *                            (app open, trip insert, visa edit). State-keyed
 *                            by (type, code, threshold, year) so we send each
 *                            warning once per calendar year.
 *
 *   3. **Expiry reminder** — "Your Spain DN visa expires in 7 days". Absolute
 *                            time, scheduled via OS at the exact reminder date
 *                            (30 / 7 / 1 day before valid_to). Cancelled and
 *                            rescheduled on every user_visa add/edit/delete.
 *
 * All notifications are LOCAL. No push server, no APNS/FCM. Local scheduling
 * is sufficient for the warning use case and avoids server infrastructure.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { countryCodeToFlag } from './geocoding';
import type { VisaStatus } from './visaCalculations';
import type { TaxStatus } from './taxCalculations';
import type { UserVisa } from './userVisas';

// Show notifications even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android requires a channel for Android 8+. Set up once on import.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  }).catch(() => {});
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function checkNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// ─── 1. Arrival ─────────────────────────────────────────────────────────────

const LAST_ARRIVAL_KEY = '@notif_last_arrival';

/**
 * Fire a "welcome to {city}" notification if the user has just transitioned
 * to a new city. Dedup'd by AsyncStorage so concurrent triggers (background
 * task + race) can't fire twice for the same city.
 *
 * Designed to be called from the background location task only — foreground
 * code paths should NOT call this, since the user already sees the change
 * in-app.
 */
export async function fireArrivalIfNew(
  city: string,
  country: string,
  countryCode: string,
): Promise<void> {
  if (!(await checkNotificationPermissions())) return;

  const key = `${countryCode}:${city}`.toLowerCase();
  const last = await AsyncStorage.getItem(LAST_ARRIVAL_KEY);
  if (last === key) return;

  // Record FIRST so a concurrent caller racing this function doesn't fire
  // a duplicate before we get to mark the dedup key.
  await AsyncStorage.setItem(LAST_ARRIVAL_KEY, key);

  const flag = countryCodeToFlag(countryCode);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Welcome to ${city}! ${flag}`,
      body: `You've arrived in ${country}. Have a great stay!`,
      sound: true,
      data: { type: 'arrival', countryCode, city },
    },
    trigger: null,
  });
}

// ─── 2. Usage threshold warnings ────────────────────────────────────────────

const THRESHOLDS = [75, 90, 100] as const;

function usageKey(type: 'visa' | 'tax', code: string, threshold: number): string {
  const year = new Date().getFullYear();
  return `@notif_${type}_${code}_${threshold}_${year}`;
}

async function alreadySent(key: string): Promise<boolean> {
  return (await AsyncStorage.getItem(key)) === '1';
}

async function markSent(key: string): Promise<void> {
  await AsyncStorage.setItem(key, '1');
}

/**
 * Fire any visa-usage or tax-residency threshold warnings that have been
 * crossed since the last check. Idempotent — each (entity, threshold, year)
 * tuple fires at most once. Safe to call frequently.
 */
export async function runUsageThresholdCheck(
  visaStatuses: VisaStatus[],
  taxStatuses: TaxStatus[],
): Promise<void> {
  if (!(await checkNotificationPermissions())) return;

  for (const visa of visaStatuses) {
    // visa_needed and expired states have no day count → no usage threshold.
    if (visa.status === 'visa_needed' || visa.status === 'expired') continue;

    for (const threshold of THRESHOLDS) {
      if (visa.percentUsed < threshold) continue;
      const key = usageKey('visa', visa.destinationCode, threshold);
      if (await alreadySent(key)) continue;
      await markSent(key);

      const exceeded = threshold === 100;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: exceeded
            ? `Visa overstay: ${visa.destination} ${visa.flag}`
            : `Visa ${threshold >= 90 ? 'warning' : 'heads-up'}: ${visa.destination} ${visa.flag}`,
          body: exceeded
            ? `You've used all ${visa.daysAllowed} allowed days. Leave as soon as possible.`
            : `${visa.daysRemaining}d left of ${visa.daysAllowed}d.${threshold >= 90 ? ' Plan your exit soon.' : ''}`,
          sound: true,
          data: { type: 'visa-threshold', code: visa.destinationCode, threshold },
        },
        trigger: null,
      });
    }
  }

  for (const tax of taxStatuses) {
    for (const threshold of THRESHOLDS) {
      if (tax.percentUsed < threshold) continue;
      const key = usageKey('tax', tax.countryCode, threshold);
      if (await alreadySent(key)) continue;
      await markSent(key);

      const isResident = threshold === 100;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: isResident
            ? `Tax residency reached: ${tax.country} ${tax.flag}`
            : `Tax residency alert: ${tax.country} ${tax.flag}`,
          body: isResident
            ? `You've hit ${tax.thresholdDays} days in ${tax.country}. You may now be considered a tax resident. Consult a tax advisor.`
            : `${tax.daysPresent} of ${tax.thresholdDays} days used (${Math.round(tax.percentUsed)}%).${threshold >= 90 ? ' Consider leaving soon.' : ''}`,
          sound: true,
          data: { type: 'tax-threshold', code: tax.countryCode, threshold },
        },
        trigger: null,
      });
    }
  }
}

// ─── 3. Visa expiry reminders ───────────────────────────────────────────────

const EXPIRY_REMINDER_DAYS = [30, 7, 1] as const;
const EXPIRY_ID_PREFIX = 'visa-expiry-';

function expiryIdentifier(visaId: number, daysBefore: number): string {
  return `${EXPIRY_ID_PREFIX}${visaId}-${daysBefore}`;
}

/**
 * Parse a YYYY-MM-DD string as a Date at 9:00 AM local time. 9am keeps the
 * reminder from arriving in the middle of the night.
 */
function parseExpiryDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0);
}

/**
 * Cancel ALL previously-scheduled visa expiry notifications and reschedule
 * fresh ones from the current user_visas list. Call this whenever the user
 * adds, edits, or deletes a visa.
 *
 * Schedules three reminders per visa: 30, 7, and 1 day before valid_to.
 * Reminders whose trigger time has already passed are skipped.
 */
export async function rescheduleVisaExpiryReminders(
  userVisas: UserVisa[],
): Promise<void> {
  if (!(await checkNotificationPermissions())) return;

  // Cancel any existing visa-expiry notifications. We use a known identifier
  // prefix so we can cleanly nuke ours without touching arrival/threshold ones.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(EXPIRY_ID_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  const now = new Date();

  for (const visa of userVisas) {
    if (visa.deleted) continue;
    const validTo = parseExpiryDate(visa.valid_to);
    if (validTo < now) continue; // already expired, skip

    for (const daysBefore of EXPIRY_REMINDER_DAYS) {
      const trigger = new Date(validTo.getTime() - daysBefore * 24 * 60 * 60 * 1000);
      if (trigger < now) continue;

      const flag = countryCodeToFlag(visa.country_code);
      const isLast = daysBefore === 1;

      await Notifications.scheduleNotificationAsync({
        identifier: expiryIdentifier(visa.id, daysBefore),
        content: {
          title: isLast
            ? `Visa expires tomorrow: ${visa.label} ${flag}`
            : `Visa expires in ${daysBefore} days: ${visa.label} ${flag}`,
          body: isLast
            ? `${visa.label} for ${visa.country_code} expires on ${visa.valid_to}. Make sure you've left or renewed.`
            : `${visa.label} for ${visa.country_code} expires on ${visa.valid_to}.`,
          sound: true,
          data: { type: 'visa-expiry', userVisaId: visa.id, daysBefore },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger,
        },
      });
    }
  }
}

// ─── Dev / Debug helpers ────────────────────────────────────────────────────

/** Wipe ALL dedup keys so threshold warnings can be re-tested. */
export async function resetUsageThresholdState(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const toRemove = keys.filter(
    (k) => k.startsWith('@notif_visa_') || k.startsWith('@notif_tax_'),
  );
  if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
}

/** Wipe the arrival dedup key so the next location update will notify again. */
export async function resetArrivalState(): Promise<void> {
  await AsyncStorage.removeItem(LAST_ARRIVAL_KEY);
}
