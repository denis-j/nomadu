/**
 * Keychain-backed storage for the Firebase auth session.
 *
 * Firebase persists the signed-in user, including the refresh token, through
 * whatever storage it is handed. That used to be AsyncStorage, which is a
 * plain unencrypted SQLite file in the app container: readable from an
 * unencrypted device backup or a jailbroken device, and enough to take over
 * the account. This moves it into the iOS keychain / Android keystore.
 *
 * Three things make SecureStore awkward as a drop-in, and all three are
 * handled below:
 *
 *   1. Keys may only contain `A-Za-z0-9._-`, while Firebase's look like
 *      `firebase:authUser:<apiKey>:[DEFAULT]`. Keys are hashed.
 *   2. Values are capped (SecureStore warns past 2048 bytes and Android can
 *      refuse outright). A measured e-mail session is already 1747 bytes, and
 *      a Google or Apple login adds displayName and photoURL on top, so values
 *      are split into chunks.
 *   3. Existing installs have the session in AsyncStorage. Without a migration
 *      every signed-in user would be logged out by the update, so the first
 *      read falls back to AsyncStorage and moves what it finds.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Keychain accessibility.
 *
 * `AFTER_FIRST_UNLOCK` rather than `WHEN_UNLOCKED` because this app is woken
 * in the background for location updates, and `lib/location.ts` reads
 * `auth.currentUser` on that path. With a when-unlocked item the read fails
 * whenever the phone is locked, which is most of the time a background wake
 * happens. `THIS_DEVICE_ONLY` keeps the session out of iCloud keychain sync
 * and encrypted backups: a session token should not follow the user onto a
 * restored device.
 */
const ACCESSIBLE = SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

const PREFIX = 'fbauth_';

/** Comfortably under SecureStore's 2048 byte guidance. */
const CHUNK_SIZE = 1600;

/** Suffix holding the chunk count for a key. */
const COUNT = '.n';

const options = { keychainAccessible: ACCESSIBLE } as const;

/**
 * Map an arbitrary Firebase key onto the character set SecureStore accepts.
 * Hashed rather than escaped so the result is always a fixed, legal length.
 */
async function safeKey(key: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);
  return PREFIX + hash.slice(0, 32);
}

function chunk(value: string): string[] {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    parts.push(value.slice(i, i + CHUNK_SIZE));
  }
  // An empty string still needs one chunk, otherwise it reads back as absent.
  return parts.length > 0 ? parts : [''];
}

async function writeChunks(base: string, value: string): Promise<void> {
  const parts = chunk(value);
  // Chunks first, count last. A write interrupted halfway leaves no count, so
  // the next read reports "nothing stored" rather than reassembling a
  // truncated session.
  for (let i = 0; i < parts.length; i++) {
    await SecureStore.setItemAsync(`${base}.${i}`, parts[i], options);
  }
  await SecureStore.setItemAsync(`${base}${COUNT}`, String(parts.length), options);
}

async function readChunks(base: string): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(`${base}${COUNT}`, options);
  if (raw === null) return null;

  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) return null;

  let value = '';
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${base}.${i}`, options);
    // A missing chunk means the stored value is incomplete. Better to report
    // no session than to hand Firebase a corrupted one.
    if (part === null) return null;
    value += part;
  }
  return value;
}

async function deleteChunks(base: string): Promise<void> {
  const raw = await SecureStore.getItemAsync(`${base}${COUNT}`, options);
  // Count first, so an interrupted delete cannot leave a count pointing at
  // chunks that are already gone.
  await SecureStore.deleteItemAsync(`${base}${COUNT}`, options);

  const count = Number(raw);
  if (!Number.isInteger(count)) return;
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(`${base}.${i}`, options);
  }
}

/**
 * Storage adapter in the shape Firebase's `getReactNativePersistence` expects.
 */
export const secureAuthStorage = {
  async setItem(key: string, value: string): Promise<void> {
    await writeChunks(await safeKey(key), value);
  },

  async getItem(key: string): Promise<string | null> {
    const base = await safeKey(key);

    const stored = await readChunks(base);
    if (stored !== null) return stored;

    // Nothing in the keychain yet. On an app that updated from a build using
    // AsyncStorage the session is still there, so adopt it once and clear the
    // insecure copy. The AsyncStorage delete only happens after the keychain
    // write succeeded, so a failure here costs nothing but a retry next launch.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy === null) return null;

    await writeChunks(base, legacy);
    await AsyncStorage.removeItem(key);
    return legacy;
  },

  async removeItem(key: string): Promise<void> {
    const base = await safeKey(key);
    await deleteChunks(base);
    // Clear any pre-migration copy too, so signing out really removes it.
    await AsyncStorage.removeItem(key);
  },
};
