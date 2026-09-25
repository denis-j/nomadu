import {
  getJourneyDocuments,
  getJourneyTravellers,
  getJourneyWithLegs,
  type JourneyDocument,
  type JourneyTraveller,
  type JourneyWithLegs,
} from './database';
import { prefetchJourneyAccommodations } from '../hooks/useAccommodations';

/**
 * The last known state of each journey's detail screen: the journey with its
 * stops, its travellers and its documents.
 *
 * The screen read all three from SQLite after it had mounted, so its first
 * frames had no stops (no map, the list showing through the glass header),
 * then a map that appeared, then faces that widened the title capsule: the
 * whole header flickered on every opening. With this, the first frame is the
 * last one the user saw, or what start-up read ahead; the reads that follow
 * only replace it when something changed.
 */

interface Detail {
  journey?: JourneyWithLegs | null;
  travellers?: JourneyTraveller[];
  documents?: JourneyDocument[];
}

const details = new Map<number, Detail>();

export function journeyDetail(id: number): Detail | undefined {
  return details.get(id);
}

export function rememberJourney(id: number, journey: JourneyWithLegs | null): void {
  details.set(id, { ...details.get(id), journey });
}

export function rememberJourneyDocuments(id: number, travellers: JourneyTraveller[], documents: JourneyDocument[]): void {
  details.set(id, { ...details.get(id), travellers, documents });
}

/** Forget everything, for when the data it came from is gone (another account). */
export function resetJourneyDetails(): void {
  details.clear();
}

/** Read the given journeys ahead, at start-up, with their plans; a handful of small queries each. */
export async function prefetchJourneyDetails(ids: number[]): Promise<void> {
  await Promise.all(ids.map(async (id) => {
    const [journey, travellers, documents] = await Promise.all([
      getJourneyWithLegs(id),
      getJourneyTravellers(id),
      getJourneyDocuments(id),
      prefetchJourneyAccommodations(id),
    ]);
    rememberJourney(id, journey);
    rememberJourneyDocuments(id, travellers, documents);
  }));
}
