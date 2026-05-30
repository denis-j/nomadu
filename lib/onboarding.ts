import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_COMPLETE_KEY = (uid: string) => `@onboarding_complete_${uid}`;
const CITIZENSHIP_KEY = (uid: string) => `@citizenship_${uid}`;
const FIXED_RESIDENCE_KEY = (uid: string) => `@fixed_residence_${uid}`;
const DETAILED_TRACKING_KEY = (uid: string) => `@detailed_tracking_${uid}`;
const EXPERIMENTALS_ENABLED_KEY = '@experimentals_enabled';

type ExperimentalsListener = (enabled: boolean) => void;
const experimentalsListeners = new Set<ExperimentalsListener>();

export async function getExperimentalsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(EXPERIMENTALS_ENABLED_KEY);
  return value === 'true';
}

export async function setExperimentalsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(EXPERIMENTALS_ENABLED_KEY, String(enabled));
  experimentalsListeners.forEach((l) => l(enabled));
}

export function subscribeExperimentalsEnabled(listener: ExperimentalsListener): () => void {
  experimentalsListeners.add(listener);
  return () => {
    experimentalsListeners.delete(listener);
  };
}

export async function isOnboardingComplete(uid: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY(uid));
  return value === 'true';
}

export async function completeOnboarding(uid: string): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY(uid), 'true');
}

export async function getCitizenship(
  uid: string
): Promise<{ country: string; countryCode: string } | null> {
  const value = await AsyncStorage.getItem(CITIZENSHIP_KEY(uid));
  if (!value) return null;
  return JSON.parse(value);
}

export async function setCitizenship(
  uid: string,
  country: string,
  countryCode: string
): Promise<void> {
  await AsyncStorage.setItem(
    CITIZENSHIP_KEY(uid),
    JSON.stringify({ country, countryCode })
  );
}

export async function getHasFixedResidence(uid: string): Promise<boolean | null> {
  const value = await AsyncStorage.getItem(FIXED_RESIDENCE_KEY(uid));
  if (value === null) return null;
  return value === 'true';
}

export async function setHasFixedResidence(
  uid: string,
  hasFixedResidence: boolean,
): Promise<void> {
  await AsyncStorage.setItem(FIXED_RESIDENCE_KEY(uid), String(hasFixedResidence));
}

/**
 * Detailed tracking: when enabled, tracks districts/neighborhoods within cities.
 * When disabled (default), only tracks at city level — better battery life and
 * cleaner timeline.
 */
export async function getDetailedTracking(uid: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(DETAILED_TRACKING_KEY(uid));
  return value === 'true'; // default false
}

export async function setDetailedTracking(
  uid: string,
  enabled: boolean,
): Promise<void> {
  await AsyncStorage.setItem(DETAILED_TRACKING_KEY(uid), String(enabled));
}
