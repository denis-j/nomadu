import * as ImagePicker from 'expo-image-picker';
import { addJourneyDocument, getJourneyDocument, type JourneyDocument } from './database';
import { documentUri, importDocumentFile, isImageMime } from './documents';
import { deleteDocumentEverywhere } from './documentSync';

/**
 * Receipts: the photo behind an expense.
 *
 * A receipt is a journey document of kind "receipt" (lib/documents.ts), so
 * its bytes live where the tickets do, go to the friends on a shared trip
 * the same way, and leave with the trip. The wallet does not list them;
 * each one belongs to its expense. This file is the little that is
 * specific to receipts: taking or picking the picture, filing it, and
 * handing its bytes to the reader.
 */

export interface PickedReceipt {
  uri: string;
  mime: string;
  /** For the reader; the picker hands it over with the picture. */
  base64: string | null;
}

/** Small enough to send to the reader; a receipt is legible well below full resolution. */
const QUALITY = 0.6;

/** A picture from the camera or the library, or null when the user backed out. */
export async function pickReceipt(source: 'camera' | 'library'): Promise<PickedReceipt | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access is off in Settings');
  }
  const res = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ quality: QUALITY, base64: true })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: QUALITY, base64: true });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mime: a.mimeType ?? 'image/jpeg', base64: a.base64 ?? null };
}

/**
 * A picture taken on the expenses page, on its way to the form. Too big
 * for a route param; handed over like a pending stay (accommodationBridge).
 */
let pending: PickedReceipt | null = null;

export function setPendingReceipt(value: PickedReceipt | null): void {
  pending = value;
}

export function consumePendingReceipt(): PickedReceipt | null {
  const v = pending;
  pending = null;
  return v;
}

/** The picture filed as the expense's receipt, for everyone on the trip. */
export async function fileReceipt(journeyId: number, title: string, picked: PickedReceipt, uploaderUid: string | null): Promise<JourneyDocument> {
  const fileName = importDocumentFile(picked.uri, picked.uri);
  const id = await addJourneyDocument({
    journey_id: journeyId,
    traveller_id: null,
    kind: 'receipt',
    title: title.trim() || 'Receipt',
    file_name: fileName,
    mime: picked.mime,
    uploader_uid: uploaderUid,
  });
  return (await getJourneyDocument(id))!;
}

/** The receipt's picture, when the document is one. */
export function receiptImageUri(doc: JourneyDocument | null | undefined): string | null {
  return doc && isImageMime(doc.mime) ? documentUri(doc.file_name) : null;
}

/** Gone with its expense, here and in the cloud. */
export async function removeReceipt(doc: JourneyDocument, journeySyncId: string | null): Promise<void> {
  await deleteDocumentEverywhere(doc, journeySyncId);
}
