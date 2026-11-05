import * as Crypto from 'expo-crypto';
import { getDatabase } from './database';
import { localIsNewer } from './syncTime';
import { localChanged } from './syncTrigger';
import { toYmd } from './days';
import {
  normalizeExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseShare,
  type ExpenseSource,
} from './expenseModel';

/**
 * Expenses, on the phone.
 *
 * The rules live in `expenseModel.ts`; this file reads expenses out of
 * SQLite and writes them back, the way `activities.ts` does for things to
 * do. Every write bumps `updated_at`, which is what the sync compares, one
 * expense at a time (`lib/sync.ts`). On a friend's trip we may plan, a
 * write is kept as theirs (`followed`) and marked `dirty`, so the push
 * hands it to the owner.
 */

export interface LocalExpense extends Expense {
  local_id: number;
  /** Came with a friend's trip: read here, owned there. */
  followed: boolean;
}

interface ExpenseRow {
  id: number;
  sync_id: string;
  journey_sync_id: string;
  stop_sync_id: string | null;
  title: string;
  amount: number;
  currency: string;
  paid_by: string | null;
  shares: string;
  date: string;
  category: ExpenseCategory;
  notes: string | null;
  receipt_document_id: string | null;
  source: ExpenseSource;
  updated_at: string;
  deleted: number;
  followed: number;
  dirty: number;
}

function parseShares(text: string | null): ExpenseShare[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed)
      ? parsed.filter((s) => s && typeof s.traveller_id === 'string' && typeof s.amount === 'number')
      : [];
  } catch {
    return [];
  }
}

function fromRow(row: ExpenseRow): LocalExpense {
  return {
    local_id: row.id,
    id: row.sync_id,
    journey_id: row.journey_sync_id,
    stop_id: row.stop_sync_id,
    title: row.title,
    amount: row.amount,
    currency: row.currency,
    paid_by: row.paid_by,
    shares: parseShares(row.shares),
    date: row.date,
    category: row.category,
    notes: row.notes,
    receipt_document_id: row.receipt_document_id,
    source: row.source,
    updated_at: row.updated_at,
    deleted: row.deleted === 1,
    followed: row.followed === 1,
  };
}

const nowIso = () => new Date().toISOString();

export async function getExpensesForJourney(journeySyncId: string): Promise<LocalExpense[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpenseRow>(
    'SELECT * FROM expenses WHERE journey_sync_id = ? AND deleted = 0 ORDER BY date DESC, updated_at DESC',
    [journeySyncId],
  );
  return rows.map(fromRow);
}

export async function getExpense(syncId: string): Promise<LocalExpense | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ExpenseRow>('SELECT * FROM expenses WHERE sync_id = ?', [syncId]);
  return row ? fromRow(row) : null;
}

/** One expense into its row, inserted or replaced whole. */
async function writeRow(e: Expense, updatedAt: string, followed: boolean, dirty: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO expenses
       (sync_id, journey_sync_id, stop_sync_id, title, amount, currency, paid_by, shares, date, category, notes,
        receipt_document_id, source, updated_at, deleted, followed, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sync_id) DO UPDATE SET
       journey_sync_id = excluded.journey_sync_id, stop_sync_id = excluded.stop_sync_id, title = excluded.title,
       amount = excluded.amount, currency = excluded.currency, paid_by = excluded.paid_by, shares = excluded.shares,
       date = excluded.date, category = excluded.category, notes = excluded.notes,
       receipt_document_id = excluded.receipt_document_id, source = excluded.source, updated_at = excluded.updated_at,
       deleted = excluded.deleted, followed = excluded.followed, dirty = excluded.dirty`,
    [
      e.id, e.journey_id, e.stop_id, e.title, e.amount, e.currency, e.paid_by, JSON.stringify(e.shares), e.date, e.category, e.notes,
      e.receipt_document_id, e.source, updatedAt, e.deleted ? 1 : 0, followed ? 1 : 0, dirty ? 1 : 0,
    ],
  );
}

async function isFollowedTrip(journeySyncId: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM journeys WHERE sync_id = ? AND shared_owner_uid IS NOT NULL', [journeySyncId]);
  return !!row;
}

/** A write from this phone (never from a pull): the sync should push soon. */
async function writeLocal(e: Expense): Promise<LocalExpense> {
  const followed = await isFollowedTrip(e.journey_id);
  await writeRow(e, nowIso(), followed, followed);
  localChanged();
  return (await getExpense(e.id))!;
}

/** A new expense. Throws the model's error on bad input. */
export async function addExpense(journeySyncId: string, stopSyncId: string | null, input: unknown): Promise<LocalExpense> {
  const fields = normalizeExpense(input, null, { today: toYmd(new Date()) });
  return writeLocal({
    ...fields,
    id: Crypto.randomUUID(),
    journey_id: journeySyncId,
    stop_id: stopSyncId,
    updated_at: nowIso(),
    deleted: false,
  });
}

/** Changed fields on top of what is there; `stop_id` in the input moves it. */
export async function updateExpense(syncId: string, input: unknown, stopSyncId?: string | null): Promise<LocalExpense> {
  const current = await getExpense(syncId);
  if (!current) throw new Error('That expense is gone.');
  return writeLocal({ ...current, ...normalizeExpense(input, current), ...(stopSyncId !== undefined && { stop_id: stopSyncId }) });
}

/** Tombstone: gone here and, through the sync, for the agent and the friends. */
export async function deleteExpense(syncId: string): Promise<void> {
  const current = await getExpense(syncId);
  if (!current) return;
  await writeLocal({ ...current, deleted: true });
}

// ─── Sync ────────────────────────────────────────────────────────────────────
// One cloud document per expense, compared by updated_at.

export interface ExpenseForSync extends Expense {
  local_id: number;
}

/** This account's own expenses, tombstones included; a friend's are not ours to push. */
export async function getAllExpensesForSync(): Promise<ExpenseForSync[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpenseRow>('SELECT * FROM expenses WHERE followed = 0 ORDER BY id ASC');
  return rows.map(fromRow);
}

/** A cloud expense into the local database. Newer side wins; a tombstone tombstones. */
export async function upsertExpenseFromCloud(remote: Expense): Promise<void> {
  const existing = await getExpense(remote.id);
  if (existing && localIsNewer(existing.updated_at, remote.updated_at)) return;
  if (!existing && remote.deleted) return;
  await writeRow(remote, remote.updated_at, false, false);
}

/**
 * The expenses that came with a friend's trip, as the mirror has them
 * now. One the owner removed is no longer in the list and is tombstoned
 * here. Where the owner lets us plan (`keepEdits`), one changed here that
 * has not reached them yet waits for the push instead.
 */
export async function replaceFollowedExpenses(journeySyncId: string, list: Expense[], keepEdits = false): Promise<void> {
  const db = await getDatabase();
  const keep = new Set(list.map((e) => e.id));
  const dirty = new Set(
    keepEdits
      ? (await db.getAllAsync<{ sync_id: string }>('SELECT sync_id FROM expenses WHERE journey_sync_id = ? AND followed = 1 AND dirty = 1', [journeySyncId])).map((r) => r.sync_id)
      : [],
  );
  if (!keepEdits) await db.runAsync('UPDATE expenses SET dirty = 0 WHERE journey_sync_id = ? AND followed = 1', [journeySyncId]);
  const local = await db.getAllAsync<{ sync_id: string }>('SELECT sync_id FROM expenses WHERE journey_sync_id = ? AND followed = 1 AND deleted = 0', [journeySyncId]);
  for (const row of local) {
    if (!keep.has(row.sync_id) && !dirty.has(row.sync_id)) {
      await db.runAsync('UPDATE expenses SET deleted = 1, updated_at = ? WHERE sync_id = ?', [nowIso(), row.sync_id]);
    }
  }
  for (const e of list) {
    if (!dirty.has(e.id)) await writeRow(e, e.updated_at, true, false);
  }
}

/** Expenses of a friend's trip changed here and not yet with the owner, tombstones included. */
export async function getDirtyFollowedExpenses(journeySyncId: string): Promise<ExpenseForSync[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpenseRow>('SELECT * FROM expenses WHERE journey_sync_id = ? AND followed = 1 AND dirty = 1', [journeySyncId]);
  return rows.map(fromRow);
}

/** The edit reached the owner (or was refused as stale). Only if unchanged here since. */
export async function clearExpenseDirty(syncId: string, updatedAt: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE expenses SET dirty = 0 WHERE sync_id = ? AND updated_at = ?', [syncId, updatedAt]);
}
