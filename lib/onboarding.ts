import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db } from './firebase';
import { PROFILE_AVATAR_KEY, PROFILE_NAME_KEY, getProfile, resetProfileCache, setProfile } from './profile';

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
const ONBOARDING_GOAL_KEY = (uid: string) => `@onboarding_goal_${uid}`;

/** AsyncStorage key suffixes that the onboarding flow writes under a UID. */
const ONBOARDING_KEY_BUILDERS: ReadonlyArray<(uid: string) => string> = [
  ONBOARDING_COMPLETE_KEY,
  CITIZENSHIP_KEY,
  FIXED_RESIDENCE_KEY,
  ONBOARDING_GOAL_KEY,
  PROFILE_NAME_KEY,
  PROFILE_AVATAR_KEY,
];

export type OnboardingGoal = 'tax' | 'visa' | 'history';

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
  pushProfileToCloud(uid).catch(() => {});
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
  pushProfileToCloud(uid).catch(() => {});
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
  // The cached profile was the placeholder's; the real uid reads it fresh.
  resetProfileCache();
}

/** Wipe all `*_pending` onboarding keys. Safe to call at any time. */
export async function clearLocalOnboardingData(): Promise<void> {
  const keysToClear = ONBOARDING_KEY_BUILDERS.map((b) => b(LOCAL_ONBOARDING_UID));
  await AsyncStorage.multiRemove(keysToClear);
}

/**
 * Mirror the profile into the user document. Citizenship and residence live
 * in AsyncStorage on the phone; the visa and tax arithmetic needs them, and
 * so does the server when an agent asks for those numbers. Best effort and
 * idempotent; the sync calls it on every run as a backfill.
 */
export async function pushProfileToCloud(uid: string): Promise<void> {
  const [citizenship, hasFixedResidence, profile] = await Promise.all([
    getCitizenship(uid),
    getHasFixedResidence(uid),
    getProfile(uid),
  ]);
  if (!citizenship && hasFixedResidence === null && !profile.name && !profile.avatar) return;
  // The account's display name is what an invite shows and what a friend's
  // trip calls this person; it comes from the name picked in onboarding.
  if (profile.name && auth.currentUser?.uid === uid && auth.currentUser.displayName !== profile.name) {
    await updateProfile(auth.currentUser, { displayName: profile.name }).catch(() => {});
  }
  await setDoc(
    doc(db, 'users', uid),
    {
      ...(citizenship && { citizenship }),
      ...(hasFixedResidence !== null && { hasFixedResidence }),
      ...(profile.name && { displayName: profile.name }),
      ...(profile.avatar && { avatar: profile.avatar }),
      // So the agent API counts days up to the user's today, not the
      // server's: in UTC+7 before 07:00 the server is still on yesterday.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    { merge: true },
  );
}

/**
 * Name and face from the account, for a phone that has none yet: a new
 * device, or a reinstall. Never overwrites what was chosen on this phone.
 */
export async function pullProfileFromCloud(uid: string): Promise<void> {
  const local = await getProfile(uid);
  if (local.name && local.avatar) return;
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.data() ?? {};
  const name = local.name || (typeof data.displayName === 'string' ? data.displayName : '') || auth.currentUser?.displayName || '';
  const avatar = local.avatar || (typeof data.avatar === 'string' ? data.avatar : null);
  if (name !== local.name || avatar !== local.avatar) await setProfile(uid, { name, avatar });
}
