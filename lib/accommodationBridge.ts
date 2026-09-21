/**
 * How the stop sheet hands a stop over to the journey screen, which then
 * opens the accommodation page. Same passthrough as `countryPickerBridge`.
 *
 * The sheet cannot open the page itself: `router.replace` from a form sheet
 * to a pushed page makes react-native-screens push the page first and
 * dismiss the sheet second, so the page is laid out in the shrunken area
 * behind the sheet and stays that size, with the bottom cut off. The sheet
 * therefore only closes and leaves the stop here; the journey screen picks
 * it up on focus and pushes the page from a plain screen, the way it opens
 * the documents.
 */

export interface PendingStay {
  stopSyncId: string;
  journeySyncId: string;
  city: string;
  country: string;
  countryCode: string;
  start: string;
  end: string;
  /** A friend's trip: the page shows, nothing on it edits. */
  readOnly?: boolean;
}

let pending: PendingStay | null = null;

export function setPendingStay(value: PendingStay | null): void {
  pending = value;
}

export function consumePendingStay(): PendingStay | null {
  const v = pending;
  pending = null;
  return v;
}
