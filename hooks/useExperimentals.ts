import { useEffect, useState } from 'react';
import {
  getExperimentalsEnabled,
  subscribeExperimentalsEnabled,
} from '../lib/onboarding';

export function useExperimentals() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    getExperimentalsEnabled().then(setEnabled);
    return subscribeExperimentalsEnabled(setEnabled);
  }, []);

  return enabled;
}
