import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentTrip, insertTrip, updateTripEndDate } from './database';
import { reverseGeocode } from './geocoding';
import { fireArrivalIfNew } from './notifications';
import { reportError } from './monitoring';
import { decide, MAX_ACCURACY_M, MAX_FOREGROUND_AGE_MS, type Candidate, type Fix } from './tracking';
import { track } from './analytics';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const LAST_FIX_KEY = '@tracking_last_fix_at';
const PENDING_KEY = '@tracking_pending';

// ─── Persisted state ──────────────────────────────────────────────────────────
// Both survive the process: the background task runs in a fresh JS context
// each time iOS wakes the app, and a candidate seen before a wake must still
// count after it.

async function loadState(): Promise<{ lastFixAt: number | null; pending: Candidate | null }> {
  const [last, pend] = await AsyncStorage.multiGet([LAST_FIX_KEY, PENDING_KEY]);
  const lastFixAt = last[1] ? Number(last[1]) : null;
  let pending: Candidate | null = null;
  if (pend[1]) {
    try { pending = JSON.parse(pend[1]); } catch { pending = null; }
  }
  return { lastFixAt: Number.isFinite(lastFixAt) ? lastFixAt : null, pending };
}

async function saveState(lastFixAt: number, pending: Candidate | null): Promise<void> {
  await AsyncStorage.multiSet([
    [LAST_FIX_KEY, String(lastFixAt)],
    [PENDING_KEY, pending ? JSON.stringify(pending) : ''],
  ]);
}

// ─── Serialised processing ────────────────────────────────────────────────────
// The background task and the foreground check used to run side by side: both
// read the current trip, both opened a new one, and the timeline got
// duplicates. Everything now goes through one queue.

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

function toFix(location: Location.LocationObject): Fix {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
    accuracy: location.coords.accuracy ?? null,
  };
}

/**
 * One fix, start to finish: reject what cannot be trusted, resolve the place,
 * let `decide` say what it means, write it down.
 *
 * `source` controls the "welcome to {city}" notification: only the background
 * task notifies, because the foreground path runs every time the app opens.
 */
async function processFix(fix: Fix, source: 'background' | 'foreground'): Promise<void> {
  return serialized(async () => {
    const { lastFixAt, pending } = await loadState();

    // Cheap rejections first, before spending a geocoder call.
    if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return;
    if (lastFixAt != null && fix.timestamp <= lastFixAt) return;

    const geo = await reverseGeocode(fix.latitude, fix.longitude);
    if (!geo.city || !geo.country || !geo.countryCode) {
      await saveState(fix.timestamp, pending);
      return;
    }
    const place = {
      city: geo.city,
      country: geo.country,
      countryCode: geo.countryCode,
      latitude: fix.latitude,
      longitude: fix.longitude,
    };

    const current = await getCurrentTrip();
    const { decision, pending: nextPending } = decide({ current, place, fix, pending, lastFixAt });

    const notify = () => {
      if (source !== 'background') return;
      fireArrivalIfNew(place.city, place.country, place.countryCode).catch(() => {});
    };

    switch (decision.kind) {
      case 'ignore':
        return;
      case 'start':
        await insertTrip(place.city, place.country, place.countryCode, place.latitude, place.longitude, decision.date);
        track({ name: 'trip_added', props: { method: 'tracking' } });
        notify();
        break;
      case 'extend':
        await updateTripEndDate(decision.tripId, decision.date);
        break;
      case 'switch':
        await updateTripEndDate(decision.closeTripId, decision.closeDate);
        await insertTrip(place.city, place.country, place.countryCode, place.latitude, place.longitude, decision.startDate);
        track({ name: 'trip_added', props: { method: 'tracking' } });
        notify();
        break;
      case 'pending':
        break;
    }
    await saveState(fix.timestamp, nextPending);
  });
}

// ─── Background task ───────────────────────────────────────────────────────────

/**
 * iOS raises `kCLErrorDomain` code 0 ("location unknown") whenever it cannot
 * get a fix for a moment: indoors, in a tunnel, right after a cold start. It
 * is not a failure, it is the weather, and it accounted for over a hundred
 * reported errors in a week. The next update arrives on its own.
 */
function isTransientLocationError(error: { message?: string; code?: string | number } | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ''} ${error.message ?? ''}`;
  return text.includes('kCLErrorDomain') && /\bCode=0\b/.test(text);
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    if (!isTransientLocationError(error as { message?: string; code?: string | number })) {
      reportError(error, 'location:background-task');
    }
    return;
  }

  const locations = (data as { locations: Location.LocationObject[] }).locations;
  if (!locations || locations.length === 0) return;

  // iOS batches deferred updates and does not promise an order. Oldest first,
  // and anything older than what is already booked is dropped in `decide`.
  const fixes = locations.map(toFix).sort((a, b) => a.timestamp - b.timestamp);
  for (const fix of fixes) {
    try {
      await processFix(fix, 'background');
    } catch (err) {
      // Runs with no UI attached, so this is the only way we ever hear about it.
      reportError(err, 'location:background-process');
    }
  }
});

// ─── Permissions ────────────────────────────────────────────────────────────────

export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== 'granted') return false;

  const { status: background } = await Location.requestBackgroundPermissionsAsync();
  return background === 'granted';
}

export async function checkLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
  isAlways: boolean;
}> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  return {
    foreground: fg.status === 'granted',
    background: bg.status === 'granted',
    isAlways: bg.status === 'granted',
  };
}

// ─── Background tracking ────────────────────────────────────────────────────────

export async function startBackgroundTracking(): Promise<boolean> {
  const hasPermissions = await requestLocationPermissions();
  if (!hasPermissions) return false;

  const isTracking = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isTracking) return true;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    // Low accuracy is fine, we only need city-level precision in the background.
    accuracy: Location.Accuracy.Low,
    // Only fire when the user has moved a significant distance (~3 km).
    distanceInterval: 3000,
    // Batch updates: every 6 hours. On iOS this is advisory; the OS may deliver
    // sooner when it has other location work to do.
    deferredUpdatesInterval: 6 * 60 * 60 * 1000,
    showsBackgroundLocationIndicator: false,
    // Let the OS pause updates when the device is stationary.
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.OtherNavigation,
    // iOS only: use Significant Location Change monitoring. This is the most
    // battery-efficient option: the system wakes the app only when the device
    // moves to a new cell tower (~500 m – several km), which is perfect for
    // detecting city/country changes.
    ...(Platform.OS === 'ios' && { significantChanges: true }),
  });

  return true;
}

export async function stopBackgroundTracking(): Promise<void> {
  const isTracking = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export async function isTrackingActive(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
}

// ─── Foreground location ────────────────────────────────────────────────────────

export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  try {
    // Only a check, never a request: on Android even a request for a granted
    // permission opens the system's permission screen for a moment, the app
    // leaves the foreground and comes back, and the check that runs on every
    // return asked again, in an endless loop.
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // A cached position is instant, but only worth anything if it is recent.
    // Uncapped, this handed back the fix from before a flight and booked a
    // trip back to the departure city every time the app was opened.
    const last = await Location.getLastKnownPositionAsync({
      maxAge: MAX_FOREGROUND_AGE_MS,
      requiredAccuracy: MAX_ACCURACY_M,
    });
    if (last) return last;

    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch {
    return null;
  }
}

/**
 * Perform an immediate location check and update trips. Call this when the app
 * comes to the foreground so the user always sees fresh data without waiting for
 * the next background wake-up.
 */
export async function foregroundLocationCheck(): Promise<void> {
  try {
    const location = await getCurrentLocation();
    if (!location) return;
    await processFix(toFix(location), 'foreground');
  } catch (err) {
    reportError(err, 'location:foreground-check');
  }
}
