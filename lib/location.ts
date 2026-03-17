import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getCurrentTrip, insertTrip, insertVisit, updateTripEndDate } from './database';
import { reverseGeocode } from './geocoding';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

/**
 * Shared logic for processing a location update (used by both background task
 * and foreground check). Reverse-geocodes the coordinates, logs a visit, and
 * creates / updates the current trip.
 */
async function processLocationUpdate(latitude: number, longitude: number): Promise<void> {
  const geo = await reverseGeocode(latitude, longitude);
  await insertVisit(latitude, longitude, geo.city, geo.country, geo.countryCode);

  const currentTrip = await getCurrentTrip();

  if (!currentTrip) {
    // First trip ever
    if (geo.city && geo.country && geo.countryCode) {
      await insertTrip(geo.city, geo.country, geo.countryCode, latitude, longitude);
    }
  } else if (
    geo.city &&
    geo.country &&
    geo.countryCode &&
    (currentTrip.city !== geo.city || currentTrip.country !== geo.country)
  ) {
    // New city — close current trip and start new one
    await updateTripEndDate(currentTrip.id);
    await insertTrip(geo.city, geo.country, geo.countryCode, latitude, longitude);
  } else {
    // Same city — update end date
    await updateTripEndDate(currentTrip.id);
  }
}

// ─── Background task ───────────────────────────────────────────────────────────

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  const locations = (data as { locations: Location.LocationObject[] }).locations;
  if (!locations || locations.length === 0) return;

  const location = locations[locations.length - 1];
  try {
    await processLocationUpdate(location.coords.latitude, location.coords.longitude);
  } catch (err) {
    console.error('Error processing background location:', err);
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
    // Low accuracy is fine — we only need city-level precision in the background.
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
    // iOS only — use Significant Location Change monitoring. This is the most
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
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
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
    await processLocationUpdate(location.coords.latitude, location.coords.longitude);
  } catch (err) {
    console.error('Foreground location check failed:', err);
  }
}
