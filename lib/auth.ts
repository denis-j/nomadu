import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  OAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
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
  const nonce = Math.random().toString(36).substring(2, 10);
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

export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('No user logged in');

  const uid = user.uid;

  // 1. Delete all Firestore trips
  const tripsSnap = await getDocs(collection(db, 'users', uid, 'trips'));
  await Promise.all(tripsSnap.docs.map((d) => deleteDoc(d.ref)));

  // 2. Delete user document
  await deleteDoc(doc(db, 'users', uid));

  // 3. Clear local SQLite data
  await clearAllData();

  // 4. Clear AsyncStorage (citizenship, preferences, sync keys)
  const keys = await AsyncStorage.getAllKeys();
  const userKeys = keys.filter((k) => k.includes(uid) || k.startsWith('@'));
  if (userKeys.length > 0) await AsyncStorage.multiRemove(userKeys);

  // 5. Delete Firebase Auth account & sign out of RevenueCat
  await logOutUser();
  await deleteUser(user);
}
