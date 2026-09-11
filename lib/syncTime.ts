/**
 * Reading the `updated_at` stamps that last-write-wins compares.
 *
 * Two formats are in circulation and both are UTC:
 *
 *   datetime('now')   "2026-09-07 10:00:00"        every local write
 *   toISOString()     "2026-09-07T10:00:00.000Z"   anything that came from Firestore
 *
 * That mix broke the comparison twice over. Compared as text, the space at
 * position 11 sorts before the "T", so on the same calendar day a local edit
 * always looked older than the cloud copy and got overwritten on pull. And
 * `new Date("2026-09-07 10:00:00")` reads a bare string as LOCAL time, so in
 * Bangkok the same instant came out seven hours early and the push was skipped
 * as redundant. Both lost the user's edit, silently.
 *
 * Normalising the stored format would need a migration and would still leave
 * every already-synced device holding the other shape, so the parser handles
 * both instead.
 */
export function parseSyncStamp(value: string): Date {
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

/**
 * Is the local row at least as new as the cloud copy? Ties go to local, which
 * keeps an edit made in the same second as the fetch.
 */
export function localIsNewer(local: string | null, cloud: string): boolean {
  if (!local) return false;
  return parseSyncStamp(local).getTime() >= parseSyncStamp(cloud).getTime();
}
