import { useSyncExternalStore } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { signOut } from '../lib/auth';

interface AuthState {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// One listener for the whole app. Each caller used to attach its own, five
// of them on the first screen alone, each keeping its own copy of the user.
//
// It starts from the user Firebase already knows once it has restored the
// session: starting from null made every screen spend its first render
// signed out, caches keyed by the uid missed, and the journey list showed
// its cards without their visa chips, which then popped in.
let current: User | null = auth.currentUser;
let resolved = !!current;
const subscribers = new Set<() => void>();

onAuthStateChanged(auth, (user) => {
  current = user;
  resolved = true;
  subscribers.forEach((notify) => notify());
});

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

const getUser = () => current;
const getLoading = () => !resolved;

export function useAuth(): AuthState {
  const user = useSyncExternalStore(subscribe, getUser);
  const loading = useSyncExternalStore(subscribe, getLoading);
  return { user, loading, signOut };
}
