import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBtsZRmh9baTmXjsrc1HpRMRDZAzS8IpFg',
  projectId: 'nomady-dcff6',
  storageBucket: 'nomady-dcff6.firebasestorage.app',
  messagingSenderId: '1044287572548',
  appId: '1:1044287572548:ios:b7817ab3f028e3d58c0a11',
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
