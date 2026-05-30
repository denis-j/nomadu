import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  completeOnboarding as completeOnboardingStorage,
  isOnboardingComplete,
} from '../lib/onboarding';

interface OnboardingContextValue {
  onboardingDone: boolean | null;
  markOnboardingComplete: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  onboardingDone: null,
  markOnboardingComplete: async () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setOnboardingDone(null);
      return;
    }
    isOnboardingComplete(user.uid).then(setOnboardingDone);
  }, [user]);

  const markOnboardingComplete = useCallback(async () => {
    if (!user) return;
    await completeOnboardingStorage(user.uid);
    setOnboardingDone(true);
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
