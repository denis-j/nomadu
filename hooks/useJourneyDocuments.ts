import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ensureSelfTraveller,
  getJourneyDocuments,
  getJourneyTravellers,
  getJourneyWithLegs,
  JourneyDocument,
  JourneyTraveller,
} from '../lib/database';
import { useAuth } from './useAuth';
import { onDocumentsChanged } from '../lib/sync';

/**
 * Travellers and documents of one journey, refreshed whenever the screen
 * regains focus. `ensureSelf` makes sure "You" exists as a traveller; only the
 * wallet itself passes it, the read-only entry card must not write. `owner`
 * is set when the trip is a friend's: their travellers, not editable here.
 */
export function useJourneyDocuments(journeyId: number, { ensureSelf = false } = {}) {
  const { user } = useAuth();
  const [travellers, setTravellers] = useState<JourneyTraveller[]>([]);
  const [documents, setDocuments] = useState<JourneyDocument[]>([]);
  const [owner, setOwner] = useState<{ shared_owner_uid: string | null; shared_owner_name: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [t, d, j] = await Promise.all([
        ensureSelf ? ensureSelfTraveller(journeyId, user?.uid ?? null) : getJourneyTravellers(journeyId),
        getJourneyDocuments(journeyId),
        getJourneyWithLegs(journeyId),
      ]);
      setTravellers(t);
      setDocuments(d);
      setOwner(j && j.shared_owner_uid ? { shared_owner_uid: j.shared_owner_uid, shared_owner_name: j.shared_owner_name } : null);
    } catch (error) {
      console.error('Failed to load journey documents:', error);
    } finally {
      setLoaded(true);
    }
  }, [journeyId, ensureSelf, user?.uid]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // A friend's document arriving while the wallet is open.
  useEffect(() => onDocumentsChanged(refresh), [refresh]);

  return { travellers, documents, owner, uid: user?.uid ?? null, loaded, refresh };
}
