import { requireOptionalNativeModule } from 'expo';

interface AppAttestModule {
  isSupported: boolean;
  generateKeyAsync(): Promise<string>;
  /** `challenge` base64; returns the attestation object, base64. */
  attestKeyAsync(keyId: string, challenge: string): Promise<string>;
  /** `artifact` and `challenge` base64; returns the assertion, base64. */
  generateAssertionAsync(keyId: string, artifact: string, challenge: string): Promise<string>;
}

/** Null in a build without the module (Expo Go, a dev client built before it existed, Android). */
export default requireOptionalNativeModule<AppAttestModule>('AppAttest');
