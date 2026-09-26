import { insertJourney, insertJourneyLeg } from './database';
import { showToast } from './toast';
import type { DestinationGuide } from '../constants/guides';
import { track } from './analytics';

/**
 * A guide's suggested route as a real trip, from the day the user picked.
 *
 * The offsets in the guide are relative (day 1, day 7), so the whole route
 * simply shifts; the stops keep their order and their length, and from
 * here on it is an ordinary trip, editable like any other.
 */
export async function createTripFromGuide(guide: DestinationGuide, start: Date): Promise<number> {
  const day = (offset: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + offset - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const id = await insertJourney(`${guide.flag} ${guide.country}`);
  track({ name: 'journey_created', props: { from_guide: true } });
  for (const leg of guide.legs) {
    await insertJourneyLeg(
      id,
      leg.city, leg.country, leg.countryCode,
      day(leg.startOffset), day(leg.endOffset),
      leg.transport, null,
      leg.latitude, leg.longitude,
    );
  }
  showToast('Trip created');
  return id;
}
