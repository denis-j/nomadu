import { cityCoords, forwardGeocode } from './geocoding';
import { updateActivity, type LocalActivity } from './activities';

/** Ids looked up in this session, found or not: the geocoder is rate-limited and never asked twice. */
const tried = new Set<string>();

/** Closer than this to the city's own point, a result is the city, not the place. */
const CITY_CENTRE_M = 400;

function metres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * Where the named places are, for the activities that have a name or an
 * address but no point yet (typed in, suggested, read out of a post). The
 * system geocoder answers, one after the other; what it finds is stored on
 * the activity, so it syncs and is never looked up again. A result that is
 * just the middle of the city means the place was not known, and is not
 * kept: a pin on the town hall would be worse than none.
 *
 * Calls `onFound` after each one, so the page can show the map as it lands.
 */
export async function locateActivities(
  list: LocalActivity[],
  stopOf: (a: LocalActivity) => { city: string; country: string; country_code: string | null } | null,
  onFound: () => void,
): Promise<void> {
  for (const a of list) {
    if (a.latitude !== null || a.followed || tried.has(a.id)) continue;
    const name = a.place ?? a.address;
    const stop = stopOf(a);
    if (!name || !stop) continue;
    tried.add(a.id);
    const query = [a.place, a.address, stop.city, stop.country].filter(Boolean).join(', ');
    const found = await forwardGeocode(query);
    if (!found) continue;
    const centre = await cityCoords(stop.city, stop.country, stop.country_code ?? '');
    if (centre && metres(found, centre) < CITY_CENTRE_M) continue;
    // The city's own result for a place in another city (a Pattaya post on
    // a Bangkok stop) is fine: it is where the place is.
    try {
      await updateActivity(a.id, { latitude: found.latitude, longitude: found.longitude });
      onFound();
    } catch {
      // Gone meanwhile, or not ours to change: the next look tries nothing.
    }
  }
}
