import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getCurrentTrip, insertTrip, insertVisit, updateTripEndDate } from './database';
import { reverseGeocode } from './geocoding';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Define the background task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  const locations = (data as { locations: Location.LocationObject[] }).locations;
  if (!locations || locations.length === 0) return;

  const location = locations[locations.length - 1];
  const { latitude, longitude } = location.coords;

  try {
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
      // New city - close current trip and start new one
      await updateTripEndDate(currentTrip.id);
      await insertTrip(geo.city, geo.country, geo.countryCode, latitude, longitude);
    } else {
      // Same city - update end date
      await updateTripEndDate(currentTrip.id);
    }
  } catch (err) {
    console.error('Error processing background location:', err);
  }
});

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

export async function startBackgroundTracking(): Promise<boolean> {
  const hasPermissions = await requestLocationPermissions();
  if (!hasPermissions) return false;

  const isTracking = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isTracking) return true;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 500, // meters
    deferredUpdatesInterval: 5 * 60 * 1000, // 5 minutes
    showsBackgroundLocationIndicator: false,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.OtherNavigation,
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
