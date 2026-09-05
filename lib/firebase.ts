import { initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { secureAuthStorage } from './secureAuthStorage';


const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_GOOGLE_IOS_API_KEY,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_GOOGLE_GCM_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_GOOGLE_IOS_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Session lives in the keychain, not in AsyncStorage. See secureAuthStorage.ts
// for why the key is hashed, the value chunked, and old sessions migrated.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(secureAuthStorage),
});

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// Region must match `options.region` in functions/src/index.ts.
export const functions = getFunctions(app, 'us-central1');
