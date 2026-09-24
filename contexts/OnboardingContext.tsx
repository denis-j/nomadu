import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  completeOnboarding as completeOnboardingStorage,
  isOnboardingComplete,
  LOCAL_ONBOARDING_UID,
  migrateLocalOnboardingData,
} from '../lib/onboarding';

interface OnboardingContextValue {
  onboardingDone: boolean | null;
  markOnboardingComplete: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  onboardingDone: null,
  markOnboardingComplete: async () => {},
});

/**
 * Tracks whether the onboarding setup steps have been completed.
 *
 * In the reverse-funnel flow there is no Firebase user until the very end, so
 * the user-visible answers are stored under {@link LOCAL_ONBOARDING_UID}.
 * The moment a real user materialises (sign-up succeeds), we migrate the
 * `*_pending` keys onto the real UID before computing `onboardingDone`.
 */
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  // Stored with the account it was read for. A value for another account is
  // not an answer yet: right after signing out or deleting, the layout would
  // otherwise route on the old account's "done" before the effect below
  // has run (children's effects run first) and send the user to sign-up
  // instead of welcome.
  const [state, setState] = useState<{ uid: string; done: boolean } | null>(null);
  const { user } = useAuth();
  const currentUid = user?.uid ?? LOCAL_ONBOARDING_UID;
  const onboardingDone = state?.uid === currentUid ? state.done : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        const done = await isOnboardingComplete(LOCAL_ONBOARDING_UID);
        if (!cancelled) setState({ uid: LOCAL_ONBOARDING_UID, done });
        return;
      }
      await migrateLocalOnboardingData(user.uid);
      const done = await isOnboardingComplete(user.uid);
      if (!cancelled) setState({ uid: user.uid, done });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const markOnboardingComplete = useCallback(async () => {
    const uid = user?.uid ?? LOCAL_ONBOARDING_UID;
    await completeOnboardingStorage(uid);
    setState({ uid, done: true });
  }, [user]);

  return (
    <OnboardingContext.Provider value={{ onboardingDone, markOnboardingComplete }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
