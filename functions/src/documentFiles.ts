/**
 * Files of shared documents follow their records.
 *
 * Clients may add files to Storage but never overwrite or delete them
 * (storage.rules): the path is all those rules can see, and anyone who had
 * once been on a trip knew enough of it to wipe or swap a boarding pass.
 * Who may remove a document is decided on its Firestore record, where the
 * rules do check membership. This trigger does the rest: a record that is
 * deleted, or moved to another audience and so to another path, takes its
 * old file with it.
 */

import { getStorage } from 'firebase-admin/storage';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';

/** Only a file of this very trip; the path is written by a client. */
export function isTripFile(path: unknown, journeyId: string): path is string {
  return typeof path === 'string' && path.startsWith(`shared/${journeyId}/`) && !path.includes('..');
}

/** The file to delete after a record changed, if any. */
export function staleFile(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, journeyId: string): string | null {
  const old = before?.path;
  if (!isTripFile(old, journeyId)) return null;
  if (after && after.path === old) return null;
  return old;
}

export const sharedDocumentFiles = onDocumentWritten(
  { document: 'shared_journeys/{journeyId}/documents/{docId}', region: 'us-central1' },
  async (event) => {
    const path = staleFile(event.data?.before.data(), event.data?.after.data(), event.params.journeyId);
    if (!path) return;
    try {
      await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
    } catch (err) {
      logger.error('shared file not deleted', { path, err: String(err) });
    }
  },
);
