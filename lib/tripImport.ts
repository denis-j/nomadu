import * as ImagePicker from 'expo-image-picker';
import { extractTripsFromImage, type ExtractedTrip } from './ai';
import { countryToCode, forwardGeocode } from './geocoding';
import { getAllTripsRaw, insertTripManual, type Trip } from './database';

const MAX_IMPORT_IMAGES = 10;

export interface PickedImportImage {
  uri: string;
  base64: string;
}

// Module-level handoff: timeline screen picks images, then navigates to /import which reads them here.
let pendingImages: PickedImportImage[] | null = null;

export function setPendingImportImages(images: PickedImportImage[]): void {
  pendingImages = images;
}

export function takePendingImportImages(): PickedImportImage[] | null {
  const out = pendingImages;
  pendingImages = null;
  return out;
}

/**
 * Opens the native iOS/Android photo picker. Returns picked images or null if cancelled.
 * Returns a string error key if permission denied / nothing selected.
 */
export async function pickImportImages(): Promise<
  | { ok: true; images: PickedImportImage[] }
  | { ok: false; reason: 'cancelled' | 'no-permission' | 'empty' }
> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'no-permission' };

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_IMPORT_IMAGES,
    quality: 0.7,
    base64: true,
  });
  if (res.canceled) return { ok: false, reason: 'cancelled' };

  const picked = res.assets
    .filter((a) => a.base64)
    .slice(0, MAX_IMPORT_IMAGES)
    .map((a) => ({ uri: a.uri, base64: a.base64! }));
  if (picked.length === 0) return { ok: false, reason: 'empty' };

  return { ok: true, images: picked };
}

export interface ImportCandidate {
  id: string;            // local-only id for UI keying
  city: string;
  country: string;
  countryCode: string;
  startDate: string;
  endDate: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
  duplicateOfTripId: number | null; // if matches an existing trip
  sourceImageIndex: number;          // which screenshot it came from
  selected: boolean;
}

export interface ImportResult {
  imageIndex: number;
  status: 'ok' | 'empty' | 'error';
  errorMessage?: string;
  count: number;
}

function normalizeCountryCode(extracted: ExtractedTrip): string {
  const fromAi = extracted.countryCode?.trim().toUpperCase();
  if (fromAi && fromAi.length === 2) return fromAi;
  const fromName = countryToCode(extracted.country);
  return fromName;
}

function findDuplicate(existing: Trip[], candidate: { city: string; startDate: string }): number | null {
  const cityLower = candidate.city.trim().toLowerCase();
  const match = existing.find(
    (t) => t.city.trim().toLowerCase() === cityLower && t.start_date === candidate.startDate,
  );
  return match?.id ?? null;
}

/**
 * Extracts trips from a single screenshot. Caller decides how to parallelize
 * and how to report per-image progress.
 */
export async function importFromImage(
  base64: string,
  imageIndex: number,
  existingTrips: Trip[],
): Promise<{ result: ImportResult; candidates: ImportCandidate[] }> {
  try {
    const extracted = await extractTripsFromImage(base64);
    if (extracted.length === 0) {
      return { result: { imageIndex, status: 'empty', count: 0 }, candidates: [] };
    }

    const geocoded = await Promise.all(
      extracted.map(async (e, i): Promise<ImportCandidate> => {
        const code = normalizeCountryCode(e);
        const coords = await forwardGeocode(`${e.city}, ${e.country}`).catch(() => null);
        const dup = findDuplicate(existingTrips, { city: e.city, startDate: e.startDate });
        return {
          id: `${imageIndex}-${i}-${Date.now()}`,
          city: e.city.trim(),
          country: e.country.trim(),
          countryCode: code,
          startDate: e.startDate,
          endDate: e.endDate ?? null,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          confidence: typeof e.confidence === 'number' ? e.confidence : 0.5,
          duplicateOfTripId: dup,
          sourceImageIndex: imageIndex,
          selected: dup === null,
        };
      }),
    );

    return {
      result: { imageIndex, status: 'ok', count: geocoded.length },
      candidates: geocoded,
    };
  } catch (err: any) {
    return {
      result: {
        imageIndex,
        status: 'error',
        errorMessage: err?.message ?? String(err),
        count: 0,
      },
      candidates: [],
    };
  }
}

/**
 * Inserts selected candidates into the local trips DB. Returns number inserted.
 */
export async function commitImport(candidates: ImportCandidate[]): Promise<number> {
  let inserted = 0;
  for (const c of candidates) {
    if (!c.selected) continue;
    await insertTripManual(
      c.city,
      c.country,
      c.countryCode,
      c.startDate,
      c.endDate,
      c.latitude,
      c.longitude,
    );
    inserted += 1;
  }
  return inserted;
}

export async function getExistingTripsForDedup(): Promise<Trip[]> {
  return getAllTripsRaw();
}
