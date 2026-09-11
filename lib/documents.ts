import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import type { Ionicons } from '@expo/vector-icons';

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
}[] = [
  { kind: 'ticket', label: 'Flight or train ticket', short: 'Ticket', plural: 'tickets', icon: 'airplane-outline' },
  { kind: 'visa', label: 'Visa or eVisa', short: 'Visa', plural: 'visas', icon: 'document-text-outline' },
  { kind: 'arrival', label: 'Arrival card', short: 'Arrival card', plural: 'arrival cards', icon: 'card-outline' },
  { kind: 'booking', label: 'Hotel or booking', short: 'Booking', plural: 'bookings', icon: 'bed-outline' },
  { kind: 'insurance', label: 'Insurance', short: 'Insurance', plural: 'insurances', icon: 'shield-checkmark-outline' },
  { kind: 'other', label: 'Something else', short: 'Other', plural: 'others', icon: 'folder-outline' },
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
