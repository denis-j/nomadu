/**
 * Account deletion, run server-side.
 *
 * The client SDK's `deleteUser()` throws `auth/requires-recent-login` once the
 * session is more than a few minutes old, which is the normal case: nobody
 * signs in and immediately deletes their account. The old client-side flow
 * deleted every trip first and only then hit that error, leaving the user with
 * their data gone and their account still alive.
 *
 * The Admin SDK has no recent-login requirement, so doing the whole thing here
 * removes the failure mode instead of reporting it. Ordering is chosen so that
 * a partial failure is always recoverable:
 *
 *   1. Firestore data  (throws → account still exists, user can retry)
 *   2. Auth record     (last, and the least likely step to fail)
 *
 * Deleting the auth record first would strand the Firestore data: the security
 * rules key off `request.auth.uid`, so nothing could reach it afterwards.
 */

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

export const deleteAccount = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 300 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'You must be signed in to delete your account.');
    }

    const db = getFirestore();

    try {
      // Removes users/{uid} together with its trips subcollection.
      await db.recursiveDelete(db.doc(`users/${uid}`));

      // Usage counters live outside the user document.
      const usage = await db.collection('ai_usage').where('uid', '==', uid).get();
      await Promise.all(usage.docs.map((d) => d.ref.delete()));
    } catch (err) {
      logger.error('Account deletion failed while removing Firestore data', {
        uid,
        err: String(err),
      });
      throw new HttpsError(
        'internal',
        'Your data could not be deleted. Nothing was removed, please try again.',
      );
    }

    try {
      await getAuth().deleteUser(uid);
    } catch (err) {
      // The data is gone but the login remains. Surfaced loudly because it
      // needs manual cleanup: the user cannot retry into a good state alone.
      logger.error('Firestore data deleted but auth record survived', {
        uid,
        err: String(err),
      });
      throw new HttpsError(
        'internal',
        'Your data was deleted but the account could not be closed. Please contact support.',
      );
    }

    logger.info('Account deleted', { uid });
    return { deleted: true };
  },
);
