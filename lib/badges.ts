import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Available badges (extend as new GLB models are added to assets/glb/) ────

export type BadgeCountryCode = 'TH' | 'VN' | 'IT' | 'ES' | 'PL' | 'ID' | 'CN';

export interface BadgeInfo {
  code: BadgeCountryCode;
  name: string;
  flag: string;
}

export const BADGE_LIBRARY: BadgeInfo[] = [
  { code: 'TH', name: 'Thailand',  flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam',   flag: '🇻🇳' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'CN', name: 'China',     flag: '🇨🇳' },
  { code: 'IT', name: 'Italy',     flag: '🇮🇹' },
  { code: 'ES', name: 'Spain',     flag: '🇪🇸' },
  { code: 'PL', name: 'Poland',    flag: '🇵🇱' },
];

export function hasBadge(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return BADGE_LIBRARY.some((b) => b.code === countryCode.toUpperCase());
}

export function getBadgeInfo(countryCode: string): BadgeInfo | undefined {
  return BADGE_LIBRARY.find((b) => b.code === countryCode.toUpperCase());
}

// ─── Unlocked-badge persistence (so the unlock animation only fires once) ────

const UNLOCKED_KEY = '@badges_unlocked_v1';

async function readSet(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(UNLOCKED_KEY);
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export async function getUnlockedBadges(): Promise<Set<string>> {
  return readSet();
}

export async function isBadgeUnlocked(countryCode: string): Promise<boolean> {
  const set = await readSet();
  return set.has(countryCode.toUpperCase());
}

export async function markBadgeUnlocked(countryCode: string): Promise<void> {
  const set = await readSet();
  set.add(countryCode.toUpperCase());
  await AsyncStorage.setItem(UNLOCKED_KEY, JSON.stringify(Array.from(set)));
}

// ─── Pending-unlock queue ───────────────────────────────────────────────────
// Trip-create runs inside a form sheet; pushing the badge modal from there
// confuses RNScreens. Instead we queue the unlock and trigger it from the
// timeline screen once it regains focus.

const PENDING_KEY = '@badges_pending_unlock_v1';

export async function setPendingUnlock(countryCode: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, countryCode.toUpperCase());
}

export async function takePendingUnlock(): Promise<string | null> {
  const code = await AsyncStorage.getItem(PENDING_KEY);
  if (code) await AsyncStorage.removeItem(PENDING_KEY);
  return code;
}

export async function clearBadgeProgress(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(UNLOCKED_KEY),
    AsyncStorage.removeItem(PENDING_KEY),
  ]);
}
