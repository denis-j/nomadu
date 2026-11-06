import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useCloudRefresh } from './useCloudRefresh';
import { useJourneyDocuments } from './useJourneyDocuments';
import { avatarPeople, type AvatarPerson } from '../components/TravellerAvatars';
import { getExpensesForJourney, type LocalExpense } from '../lib/expenses';
import { sortExpenses } from '../lib/expenseModel';

/**
 * The travellers of a journey as expenses name them: by their sync id,
 * with the face and the label the rest of the app draws for them, and
 * which of them is this account. "You" is made sure to exist, so the
 * owner can be the one who paid before the wallet was ever opened.
 */
export function useTravellerPeople(journeyId: number) {
  const { travellers, documents, owner, uid, loaded, refresh } = useJourneyDocuments(journeyId, { ensureSelf: true });
  const people = useMemo(() => {
    const byLocalId = new Map(travellers.map((t) => [String(t.id), t]));
    const map = new Map<string, AvatarPerson>();
    for (const p of avatarPeople(travellers, uid, owner)) {
      const t = byLocalId.get(p.key);
      if (t?.sync_id) map.set(t.sync_id, p);
    }
    return map;
  }, [travellers, uid, owner]);
  // The account's own row: the one with its uid; on an own trip the "You"
  // row before it carried one.
  const meId = useMemo(() => {
    const mine = travellers.find((t) => !!uid && t.uid === uid) ?? (owner ? null : travellers.find((t) => t.name === 'You' && !t.uid));
    return mine?.sync_id ?? null;
  }, [travellers, uid, owner]);
  const travellerIds = useMemo(() => travellers.map((t) => t.sync_id).filter((id): id is string => !!id), [travellers]);
  const nameOf = useCallback((id: string | null) => (id ? people.get(id)?.label ?? 'Someone' : 'Someone'), [people]);
  return { travellers, documents, owner, uid, loaded, refresh, people, meId, travellerIds, nameOf };
}

/**
 * What each journey's expenses looked like the last time they were read,
 * so the entry card on the trip and the page open on the right numbers in
 * their first frame (same as useJourneyActivities).
 */
const lastRead = new Map<string, LocalExpense[]>();

/** For when the journeys these ids point to are gone (another account signed in). */
export function forgetExpenses(): void {
  lastRead.clear();
}

/**
 * The expenses of one journey (its sync id), newest day first, refreshed
 * on focus and when the cloud wrote something (an agent, a friend).
 */
export function useJourneyExpenses(journeySyncId: string | null | undefined) {
  const key = journeySyncId ?? '';
  const [expenses, setExpenses] = useState<LocalExpense[]>(() => lastRead.get(key) ?? []);
  const [loaded, setLoaded] = useState(() => lastRead.has(key));

  const refresh = useCallback(async () => {
    if (!journeySyncId) {
      setLoaded(true);
      return;
    }
    try {
      const next = sortExpenses(await getExpensesForJourney(journeySyncId));
      lastRead.set(journeySyncId, next);
      setExpenses((prev) => (same(prev, next) ? prev : next));
    } catch (error) {
      console.error('Failed to load expenses:', error);
    } finally {
      setLoaded(true);
    }
  }, [journeySyncId]);

  useCloudRefresh(refresh);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return { expenses, loaded, refresh, setExpenses };
}

function same(a: LocalExpense[], b: LocalExpense[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.id === b[i].id && x.updated_at === b[i].updated_at);
}
