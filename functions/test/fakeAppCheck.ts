// Stand-ins for what lib/appCheck.ts talks to: the keychain (expo-secure-store),
// App Attest (modules/app-attest), Sentry (lib/monitoring) and the Firebase
// JS SDK's App Check (firebase/app-check). One file, mapped to all four by
// scripts/test.mjs; the test drives and inspects them through `appCheckFakes`.

type Call = { name: string; args: unknown[] };

export const appCheckFakes = {
  keychain: new Map<string, string>(),
  calls: [] as Call[],
  errors: [] as { err: unknown; where: string }[],
  initialized: [] as { getToken: () => Promise<{ token: string; expireTimeMillis: number }> }[],
  attest: {
    isSupported: true,
    keys: 0,
    /** Keys App Attest still knows; one missing makes the assertion fail, as after a restore onto another phone. */
    known: new Set<string>(),
  },
  reset() {
    this.keychain.clear();
    this.calls.length = 0;
    this.errors.length = 0;
    this.initialized.length = 0;
    this.attest.isSupported = true;
    this.attest.keys = 0;
    this.attest.known.clear();
  },
};

// ── expo-secure-store ──
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 'afterFirstUnlockThisDeviceOnly';
export async function getItemAsync(key: string): Promise<string | null> {
  return appCheckFakes.keychain.get(key) ?? null;
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  appCheckFakes.keychain.set(key, value);
}

// ── modules/app-attest ──
const attestModule = {
  get isSupported() {
    return appCheckFakes.attest.isSupported;
  },
  async generateKeyAsync() {
    const keyId = `key${++appCheckFakes.attest.keys}`;
    appCheckFakes.attest.known.add(keyId);
    appCheckFakes.calls.push({ name: 'generateKey', args: [] });
    return keyId;
  },
  async attestKeyAsync(keyId: string, challenge: string) {
    appCheckFakes.calls.push({ name: 'attestKey', args: [keyId, challenge] });
    return `attestation(${keyId},${challenge})`;
  },
  async generateAssertionAsync(keyId: string, artifact: string, challenge: string) {
    appCheckFakes.calls.push({ name: 'assert', args: [keyId, artifact, challenge] });
    if (!appCheckFakes.attest.known.has(keyId)) throw new Error('Invalid key provided');
    return `assertion(${keyId},${artifact},${challenge})`;
  },
};
export default attestModule;

// ── lib/monitoring ──
export function reportError(err: unknown, where: string): void {
  appCheckFakes.errors.push({ err, where });
}

// ── firebase/app-check ──
export class CustomProvider {
  constructor(public options: { getToken: () => Promise<{ token: string; expireTimeMillis: number }> }) {}
}
export function initializeAppCheck(_app: unknown, options: { provider: CustomProvider }): void {
  appCheckFakes.initialized.push(options.provider.options);
}
