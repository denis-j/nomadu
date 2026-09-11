import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ensureSelfTraveller,
  getJourneyDocuments,
  getJourneyTravellers,
  JourneyDocument,
  JourneyTraveller,
} from '../lib/database';

/**
 * Travellers and documents of one journey, refreshed whenever the screen
 * regains focus. `ensureSelf` makes sure "You" exists as a traveller; only the
 * wallet itself passes it, the read-only entry card must not write.
 */
export function useJourneyDocuments(journeyId: number, { ensureSelf = false } = {}) {
  const [travellers, setTravellers] = useState<JourneyTraveller[]>([]);
  const [documents, setDocuments] = useState<JourneyDocument[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [t, d] = await Promise.all([
        ensureSelf ? ensureSelfTraveller(journeyId) : getJourneyTravellers(journeyId),
        getJourneyDocuments(journeyId),
      ]);
      setTravellers(t);
      setDocuments(d);
    } catch (error) {
      console.error('Failed to load journey documents:', error);
    } finally {
      setLoaded(true);
    }
  }, [journeyId, ensureSelf]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { travellers, documents, loaded, refresh };
}
