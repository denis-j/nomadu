import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Reverse funnel placeholder UID used while the user is going through the
 * onboarding flow without a Firebase account. Once they sign up at the end,
 * `migrateLocalOnboardingData` copies every `*_pending` key onto their real
 * UID so we never lose what they entered.
 */
export const LOCAL_ONBOARDING_UID = 'pending';

const ONBOARDING_COMPLETE_KEY = (uid: string) => `@onboarding_complete_${uid}`;
const CITIZENSHIP_KEY = (uid: string) => `@citizenship_${uid}`;
const FIXED_RESIDENCE_KEY = (uid: string) => `@fixed_residence_${uid}`;
const DETAILED_TRACKING_KEY = (uid: string) => `@detailed_tracking_${uid}`;
const ONBOARDING_GOAL_KEY = (uid: string) => `@onboarding_goal_${uid}`;
const EXPERIMENTALS_ENABLED_KEY = '@experimentals_enabled';

/** AsyncStorage key suffixes that the onboarding flow writes under a UID. */
const ONBOARDING_KEY_BUILDERS: ReadonlyArray<(uid: string) => string> = [
  ONBOARDING_COMPLETE_KEY,
  CITIZENSHIP_KEY,
  FIXED_RESIDENCE_KEY,
  DETAILED_TRACKING_KEY,
  ONBOARDING_GOAL_KEY,
];

export type OnboardingGoal = 'tax' | 'visa' | 'history';

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

export async function getOnboardingGoal(uid: string): Promise<OnboardingGoal | null> {
  const value = await AsyncStorage.getItem(ONBOARDING_GOAL_KEY(uid));
  if (value === 'tax' || value === 'visa' || value === 'history') return value;
  return null;
}

export async function setOnboardingGoal(
  uid: string,
  goal: OnboardingGoal,
): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_GOAL_KEY(uid), goal);
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

/**
 * Move every onboarding key written under the LOCAL_ONBOARDING_UID placeholder
 * onto the real UID returned by Firebase. Called once the user successfully
 * signs up at the end of the onboarding flow.
 *
 * Skipped if the real UID already has its own onboarding_complete flag,
 * meaning we're dealing with a returning user signing back in. In that case
 * the local data is discarded so we don't overwrite their existing answers.
 */
export async function migrateLocalOnboardingData(realUid: string): Promise<void> {
  if (realUid === LOCAL_ONBOARDING_UID) return;

  const alreadyComplete = await isOnboardingComplete(realUid);
  if (alreadyComplete) {
    await clearLocalOnboardingData();
    return;
  }

  for (const buildKey of ONBOARDING_KEY_BUILDERS) {
    const fromKey = buildKey(LOCAL_ONBOARDING_UID);
    const toKey = buildKey(realUid);
    const value = await AsyncStorage.getItem(fromKey);
    if (value !== null) {
      await AsyncStorage.setItem(toKey, value);
      await AsyncStorage.removeItem(fromKey);
    }
  }
}

/** Wipe all `*_pending` onboarding keys. Safe to call at any time. */
export async function clearLocalOnboardingData(): Promise<void> {
  const keysToClear = ONBOARDING_KEY_BUILDERS.map((b) => b(LOCAL_ONBOARDING_UID));
  await AsyncStorage.multiRemove(keysToClear);
}
