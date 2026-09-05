import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  OAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable, type FunctionsError } from 'firebase/functions';
import { auth, db, functions } from './firebase';
import { identifyUser, logOutUser } from './revenueCat';
import { clearAllData } from './database';

async function ensureUserDocument(user: User) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      createdAt: serverTimestamp(),
    });
  }
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  await identifyUser(result.user.uid);
  return result.user;
}

export async function signUpWithEmail(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await Promise.all([
    identifyUser(result.user.uid),
    ensureUserDocument(result.user),
  ]);
  return result.user;
}

export async function signInWithApple() {
  // The nonce is what stops a captured Apple identity token from being
  // replayed, so it has to be unpredictable. Math.random() is not a
  // cryptographic generator and the old 8-character slice left roughly 41 bits
  // to guess; randomUUID() is backed by the platform CSPRNG.
  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce,
  );

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  const { identityToken } = appleCredential;
  if (!identityToken) throw new Error('No identity token from Apple');

  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken: identityToken,
    rawNonce: nonce,
  });

  const result = await signInWithCredential(auth, credential);
  await Promise.all([
    identifyUser(result.user.uid),
    ensureUserDocument(result.user),
  ]);
  return result.user;
}

export async function signInWithGoogleToken(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  await Promise.all([
    identifyUser(result.user.uid),
    ensureUserDocument(result.user),
  ]);
  return result.user;
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOut() {
  await firebaseSignOut(auth);
  await logOutUser();
}

/**
 * Delete the account and everything attached to it.
 *
 * The cloud side (Firestore documents plus the Auth record) is handled by the
 * `deleteAccount` Cloud Function. It runs on the Admin SDK, which is not
 * subject to `auth/requires-recent-login` and so cannot leave the user in the
 * old broken state: data deleted, account still alive, "please sign in again".
 *
 * Local cleanup only happens once the server confirms. If the call fails,
 * nothing on this device is touched and the user can simply try again.
 */
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('No user logged in');

  try {
    const fn = httpsCallable<Record<string, never>, { deleted: boolean }>(
      functions,
      'deleteAccount',
    );
    await fn({});
  } catch (err) {
    const message = (err as FunctionsError)?.message;
    throw new Error(message || 'Your account could not be deleted. Please try again.');
  }

  // Past this point the account is gone server-side. Local cleanup must not
  // throw, or the user is left signed into an account that no longer exists.
  await clearAllData().catch(() => {});

  // Everything this app writes is either uid-scoped or "@"-prefixed. The user
  // is leaving, so both go: preferences, badge progress, notification dedup
  // keys and cached AI answers.
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.includes(user.uid) || k.startsWith('@'));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {}

  await logOutUser().catch(() => {});
  await firebaseSignOut(auth).catch(() => {});
}
