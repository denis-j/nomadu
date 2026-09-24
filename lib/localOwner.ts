import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, Paths } from 'expo-file-system';
import { getMeta, setMeta, wipeLocalDatabase } from './database';
import { resetPrefetchCaches } from './prefetch';
import { resetSyncState } from './sync';
import { clearBadgeProgress } from './badges';
import {
  rescheduleVisaExpiryReminders,
  resetArrivalState,
  resetUsageThresholdState,
} from './notifications';
import { forgetAccommodationPlans } from '../hooks/useAccommodations';
import { reportError } from './monitoring';
import { cloudChanged } from './syncTrigger';
import { resetProfileCache } from './profile';

/**
 * Which account the data on this phone belongs to.
 *
 * SQLite is one database per install, not per account, and the sync pushes
 * whatever it finds there. Without an owner, signing into a second account
 * uploaded the first account's trips, visas, journeys and documents into it.
 * The owner is stored next to the data (not in AsyncStorage) so the two can
 * never disagree.
 */
const OWNER_KEY = 'owner_uid';

/**
 * Device state that describes the previous account's data but is not keyed
 * by its uid. Preferences that belong to the phone (disclaimers seen,
 * a pending invite link) stay.
 */
const ACCOUNT_BOUND_KEYS = [
  '@tracking_pending',
  '@tracking_last_fix_at',
  '@timeline_repair_hidden',
  '@entitlement_snapshot_v1',
];

let pending: { uid: string; promise: Promise<boolean> } | null = null;

/**
 * Make the local data this account's before anything reads or syncs it.
 *
 * - Nobody owns it yet (fresh install, or an install from before owners
 *   existed, or data tracked during onboarding): it becomes this account's.
 * - This account owns it: nothing to do.
 * - Another account owns it: it is wiped. That account's copy lives in its
 *   own cloud collections, and sign-out pushes it once more on the way out.
 *
 * Concurrent callers for the same uid share one run, so the sync and the
 * prefetch cannot both decide on their own. Resolves to true when data was
 * wiped, so a caller holding caches knows to reload them.
 */
export function ensureLocalDataOwner(uid: string): Promise<boolean> {
  if (pending?.uid === uid) return pending.promise;
  const promise = claim(uid).catch((err) => {
    if (pending?.promise === promise) pending = null;
    throw err;
  });
  pending = { uid, promise };
  return promise;
}

async function claim(uid: string): Promise<boolean> {
  const owner = await getMeta(OWNER_KEY);
  if (owner === uid) return false;
  const wipe = owner !== null;
  if (wipe) await wipeLocalData();
  await setMeta(OWNER_KEY, uid);
  return wipe;
}

/**
 * Everything on this phone that came from or describes an account: every
 * table, the document files, the in-memory caches, the account-bound keys
 * and the scheduled visa reminders. Used when another account takes over and
 * after the account is deleted.
 */
export async function wipeLocalData(): Promise<void> {
  pending = null;
  resetSyncState();
  await wipeLocalDatabase();
  resetPrefetchCaches();
  forgetAccommodationPlans();
  resetProfileCache();

  // The rest is cleanup around the data, which is already gone. A failure
  // here must not stop the new account from signing in.
  const steps: [string, () => Promise<unknown>][] = [
    ['documents', async () => {
      const dir = new Directory(Paths.document, 'documents');
      if (dir.exists) dir.delete();
    }],
    ['storage', () => AsyncStorage.multiRemove(ACCOUNT_BOUND_KEYS)],
    ['badges', () => clearBadgeProgress()],
    ['notif-dedup', () => resetUsageThresholdState()],
    ['notif-arrival', () => resetArrivalState()],
    ['notif-expiry', () => rescheduleVisaExpiryReminders([])],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      reportError(err, `local-owner:${name}`);
    }
  }
  // Screens still showing the previous account's data re-read the empty
  // tables now, not when they next come into focus.
  cloudChanged();
}
