/**
 * Per-user, per-day call budget.
 *
 * Moving the key server-side stops strangers from spending it, but it does not
 * stop a signed-up user from looping the screenshot import a thousand times.
 * Each operation gets its own daily allowance, counted in Firestore under
 * `ai_usage/{uid}_{YYYY-MM-DD}`.
 *
 * That collection sits outside `/users/{userId}`, so the catch-all deny in
 * firestore.rules already blocks every client from reading or writing it. Only
 * the Admin SDK in these functions touches it.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export type Operation = 'suggestStops' | 'cityTips' | 'extractTrips';

/** Daily allowance per user. Vision is the expensive one, so it gets the least. */
const DAILY_LIMIT: Record<Operation, number> = {
  suggestStops: 40,
  cityTips: 60,
  extractTrips: 30,
};

/** Usage docs are only interesting for the day they cover. */
const TTL_DAYS = 3;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Count one call against the user's budget, or throw if they are out.
 *
 * Runs as a transaction so parallel calls (the import screen fires several
 * screenshots at once) cannot slip past the limit by reading the same value.
 */
export async function consumeQuota(uid: string, operation: Operation): Promise<void> {
  const db = getFirestore();
  const ref = db.collection('ai_usage').doc(`${uid}_${today()}`);
  const limit = DAILY_LIMIT[operation];

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used: number = snap.exists ? (snap.data()?.[operation] ?? 0) : 0;

    if (used >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        `You have reached today's limit for this feature (${limit} per day). It resets at midnight UTC.`,
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TTL_DAYS);

    tx.set(
      ref,
      {
        [operation]: FieldValue.increment(1),
        uid,
        // Set a Firestore TTL policy on this field to have old docs deleted
        // automatically: Firestore console → TTL → collection `ai_usage`,
        // field `expiresAt`.
        expiresAt,
      },
      { merge: true },
    );
  });
}
