import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_COMPLETE_KEY = (uid: string) => `@onboarding_complete_${uid}`;
const CITIZENSHIP_KEY = (uid: string) => `@citizenship_${uid}`;

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
