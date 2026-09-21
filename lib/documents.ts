import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import type { Ionicons } from '@expo/vector-icons';
import { deleteJourney, getJourneyDocuments } from './database';

/**
 * Travel documents: the files a trip needs at the border and the desk.
 *
 * Files live in the app's own document directory, which iOS includes in the
 * device backup. They are deliberately NOT part of the Firestore sync: a
 * passport scan is not something to push through a database sync without a
 * decision about it, so for now a document exists on the phone it was added
 * on. Metadata lives in SQLite (`journey_documents`); this module owns the
 * bytes.
 */

export type DocumentKind =
  | 'ticket'
  | 'visa'
  | 'arrival'
  | 'booking'
  | 'insurance'
  | 'other';

export const DOCUMENT_KINDS: {
  kind: DocumentKind;
  /** The sentence in the picker. */
  label: string;
  /** One word for tiles and counts: "2 tickets". */
  short: string;
  plural: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Accent for the kind pill on tiles, so a wallet scans by colour. */
  color: string;
}[] = [
  { kind: 'ticket', label: 'Flight or train ticket', short: 'Ticket', plural: 'tickets', icon: 'airplane-outline', color: '#2F80ED' },
  { kind: 'visa', label: 'Visa or eVisa', short: 'Visa', plural: 'visas', icon: 'document-text-outline', color: '#27AE60' },
  { kind: 'arrival', label: 'Arrival card', short: 'Arrival card', plural: 'arrival cards', icon: 'card-outline', color: '#F2994A' },
  { kind: 'booking', label: 'Hotel or booking', short: 'Booking', plural: 'bookings', icon: 'bed-outline', color: '#9B51E0' },
  { kind: 'insurance', label: 'Insurance', short: 'Insurance', plural: 'insurances', icon: 'shield-checkmark-outline', color: '#0FA3B1' },
  { kind: 'other', label: 'Something else', short: 'Other', plural: 'others', icon: 'folder-outline', color: '#8E8E93' },
];

/** "2 tickets · 1 visa · 1 booking", in the picker's order. */
export function summarizeKinds(kinds: string[]): string {
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  return DOCUMENT_KINDS
    .filter((k) => counts.has(k.kind))
    .map((k) => {
      const n = counts.get(k.kind)!;
      return `${n} ${n === 1 ? k.short.toLowerCase() : k.plural}`;
    })
    .join(' · ');
}

export function kindMeta(kind: string) {
  return DOCUMENT_KINDS.find((k) => k.kind === kind) ?? DOCUMENT_KINDS[DOCUMENT_KINDS.length - 1];
}

/** Everything under one folder, so a future "export all" is one directory. */
export function documentsDirectory(): Directory {
  return documentsDir();
}

function documentsDir(): Directory {
  const dir = new Directory(Paths.document, 'documents');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/**
 * Copy a picked file into the app's own storage.
 *
 * Pickers hand out temporary URIs that the system reclaims, so the bytes
 * are copied under a fresh name that keeps only the extension. The stored
 * name is relative: the document directory's absolute path is not stable
 * across app updates on iOS.
 */
export function importDocumentFile(sourceUri: string, originalName?: string | null): string {
  const ext = extensionOf(originalName ?? sourceUri);
  const fileName = `${Crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
  const target = new File(documentsDir(), fileName);
  new File(sourceUri).copy(target);
  return fileName;
}

export function documentUri(fileName: string): string {
  return new File(documentsDir(), fileName).uri;
}

export function documentExists(fileName: string): boolean {
  return new File(documentsDir(), fileName).exists;
}

export function removeDocumentFile(fileName: string): void {
  const file = new File(documentsDir(), fileName);
  if (file.exists) file.delete();
}

export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith('image/');
}

export function isPdfMime(mime: string | null | undefined): boolean {
  return mime === 'application/pdf';
}

function extensionOf(name: string): string {
  const clean = name.split('?')[0];
  const dot = clean.lastIndexOf('.');
  if (dot < 0 || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Delete a trip together with the files its documents point to. The rows go
 * by cascade; the bytes in the documents folder would not, and a deleted
 * trip's boarding passes are not something to keep around unlisted.
 */
export async function deleteJourneyWithDocuments(journeyId: number): Promise<void> {
  const docs = await getJourneyDocuments(journeyId);
  for (const d of docs) {
    try {
      removeDocumentFile(d.file_name);
    } catch (err) {
      console.warn('[documents] could not remove file', d.file_name, err);
    }
  }
  await deleteJourney(journeyId);
}
