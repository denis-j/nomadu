import { useEffect, useState } from 'react';
import { getJourneyWithLegs } from '../lib/database';

/**
 * False once it is known that there is no such trip, true or null otherwise.
 *
 * For screens that are reached by link with a trip id: the id may be made up
 * or belong to a trip deleted meanwhile, and the screen then showed an empty,
 * working trip or wallet that saved into nothing. Screens keep rendering at
 * once while this looks it up, so a real trip shows no extra loading state.
 */
export function useJourneyExists(journeyId: number): boolean | null {
  const valid = Number.isFinite(journeyId) && journeyId > 0;
  const [exists, setExists] = useState<boolean | null>(valid ? null : false);
  useEffect(() => {
    if (!valid) {
      setExists(false);
      return;
    }
    let cancelled = false;
    getJourneyWithLegs(journeyId)
      .then((j) => { if (!cancelled) setExists(!!j && !j.deleted); })
      .catch(() => { if (!cancelled) setExists(false); });
    return () => { cancelled = true; };
  }, [journeyId, valid]);
  return exists;
}
