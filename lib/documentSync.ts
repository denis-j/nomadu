import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { FirestoreError, Timestamp, collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { getDownloadURL, getMetadata, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';
import {
  deleteJourneyDocument,
  getAllJourneysForSync,
  getJourneyDocumentBySyncId,
  getJourneyDocuments,
  getJourneyTravellers,
  setJourneyDocumentCloudPath,
  upsertJourneyDocumentFromCloud,
  type JourneyDocument,
  type JourneyForSync,
  type JourneyTraveller,
} from './database';
import { documentUri, documentsDirectory, removeDocumentFile } from './documents';
import { reportError } from './monitoring';
import { parseSyncStamp } from './syncTime';

/**
 * Documents of a shared trip, between the phones of the people on it.
 *
 * Documents are local by design (lib/documents.ts); a shared trip is the
 * one place they leave the phone, and only as far as they must: a document
 * for everyone goes to everyone, a document for one friend goes to that
 * friend and the owner, and a document for the owner or for a name typed
 * into the wallet stays where it is, nobody else could see it anyway.
 *
 * The file goes to Storage at `shared/{journey}/{document}`, its record to
 * `shared_journeys/{journey}/documents/{document}`: title, kind, whose it
 * is (`traveller_uid`, null for everyone), who uploaded it. The rules on
 * both check the same thing the pull checks: owner sees all, a member sees
 * theirs and everyone's. Deleting is deleting: the file, then the record,
 * and the other phones drop their copy.
 */

const MAX_BYTES = 20 * 1024 * 1024;

function recordsOf(journeySyncId: string) {
  return collection(db, 'shared_journeys', journeySyncId, 'documents');
}

/**
 * Where a document's file lives: under the trip, under the trip owner, and
 * then either in `all` or in the folder of the one person it is for. The
 * storage rules read the audience straight off the path (see storage.rules),
 * because they cannot ask Firestore about it.
 */
function cloudPathFor(
  journeySyncId: string,
  ownerUid: string,
  audience: string | null,
  docSyncId: string,
  fileName: string,
): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot) : '';
  const where = audience === null ? 'all' : `u/${audience}`;
  return `shared/${journeySyncId}/${ownerUid}/${where}/${docSyncId}${ext}`;
}

/**
 * Records deleted here that the cloud may not know about yet. Firestore only
 * holds a queued write in memory, so a delete made offline was lost when the
 * app closed, and the next pull brought the document back. Kept until the
 * delete is confirmed; the push retries them, the pull does not take them.
 */
const PENDING_DELETES_KEY = 'documents:pending-deletes';

interface PendingDelete {
  journey: string;
  doc: string;
}

let pendingDeletes: PendingDelete[] | null = null;
// One read-modify-write at a time, so two deletes in a row both stay.
let pendingQueue: Promise<unknown> = Promise.resolve();

async function readPendingDeletes(): Promise<PendingDelete[]> {
  if (pendingDeletes) return pendingDeletes;
  try {
    const raw = await AsyncStorage.getItem(PENDING_DELETES_KEY);
    pendingDeletes = raw ? (JSON.parse(raw) as PendingDelete[]) : [];
  } catch {
    pendingDeletes = [];
  }
  return pendingDeletes;
}

/** Another account takes over the phone: its deletes are not ours to send. */
export async function forgetPendingDeletes(): Promise<void> {
  await pendingQueue;
  pendingDeletes = [];
  await AsyncStorage.removeItem(PENDING_DELETES_KEY);
}

function changePendingDeletes(change: (list: PendingDelete[]) => PendingDelete[]): Promise<void> {
  const run = pendingQueue.then(async () => {
    pendingDeletes = change(await readPendingDeletes());
    await AsyncStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(pendingDeletes));
  });
  pendingQueue = run.catch(() => {});
  return run;
}

/** The record deleted in the cloud; once confirmed, or when it never can be, it is forgotten. */
async function deleteRecord(p: PendingDelete): Promise<void> {
  try {
    await deleteDoc(doc(recordsOf(p.journey), p.doc));
  } catch (err) {
    // Not ours to delete (another account on this phone now): trying again will not help.
    if (!(err instanceof FirestoreError && err.code === 'permission-denied')) throw err;
  }
  await changePendingDeletes((list) => list.filter((x) => x.doc !== p.doc));
}

/** Not awaited: offline the write waits for the network, and the push with it. */
async function retryPendingDeletes(): Promise<void> {
  for (const p of await readPendingDeletes()) {
    deleteRecord(p).catch((err) => reportError(err, 'documents:delete-record'));
  }
}

async function isPendingDelete(id: string): Promise<boolean> {
  return (await readPendingDeletes()).some((x) => x.doc === id);
}

interface Party {
  journey: JourneyForSync;
  /** Followed here (a member) or shared from here (the owner). */
  member: boolean;
  travellers: JourneyTraveller[];
}

/** Every trip whose documents leave this phone or arrive on it. */
async function parties(): Promise<Party[]> {
  const journeys = (await getAllJourneysForSync()).filter((j) => !j.deleted && (j.share_code || j.shared_owner_uid));
  const out: Party[] = [];
  for (const journey of journeys) {
    out.push({ journey, member: !!journey.shared_owner_uid, travellers: await getJourneyTravellers(journey.id) });
  }
  return out;
}

/** The account a document is for, or null for everyone; undefined when it may not leave the phone. */
function audienceOf(d: JourneyDocument, party: Party, uid: string): string | null | undefined {
  if (d.traveller_id === null) return null;
  const t = party.travellers.find((x) => x.id === d.traveller_id);
  if (!t?.uid) return undefined;
  if (party.member) return t.uid === uid ? uid : undefined;
  return t.uid === uid ? undefined : t.uid;
}

/** Push what may leave: new files uploaded, records of changed ones rewritten. */
export async function pushDocumentsToCloud(uid: string): Promise<void> {
  await retryPendingDeletes();
  for (const party of await parties()) {
    const records = new Map<string, DocumentData>();
    try {
      // Members may only list what is theirs; the owner sees the lot.
      const snaps = party.member
        ? await Promise.all([
            getDocs(query(recordsOf(party.journey.sync_id), where('traveller_uid', '==', uid))),
            getDocs(query(recordsOf(party.journey.sync_id), where('traveller_uid', '==', null))),
          ])
        : [await getDocs(recordsOf(party.journey.sync_id))];
      for (const snap of snaps) snap.forEach((d) => records.set(d.id, d.data()));
    } catch (err) {
      reportError(err, 'documents:push-list');
      continue;
    }
    // The owner of the trip: this phone on its own trip, the friend on a
    // followed one. It is part of every path the rules check.
    const ownerUid = party.journey.shared_owner_uid ?? uid;
    for (const d of await getJourneyDocuments(party.journey.id)) {
      if (!d.sync_id) continue;
      // Not ours to rewrite: a document that came from someone else.
      if (d.uploader_uid && d.uploader_uid !== uid) continue;
      const record = records.get(d.sync_id);
      const audience = audienceOf(d, party, uid);
      if (audience === undefined) {
        // No longer for anyone else (given to yourself, or to a name without
        // an account): the cloud copy goes, where it used to stay visible to
        // whoever it had been for. The function deletes the file.
        if (record && (record.uploader_uid ?? uid) === uid) {
          try {
            await deleteDoc(doc(recordsOf(party.journey.sync_id), d.sync_id));
            await setJourneyDocumentCloudPath(d.id, null);
          } catch (err) {
            reportError(err, 'documents:unshare');
          }
        }
        continue;
      }
      // Where the file has to be for its current audience. A document moved
      // to someone else lives in their folder now; left in the old one, the
      // new person was refused and the old one kept access.
      const wanted = cloudPathFor(party.journey.sync_id, ownerUid, audience, d.sync_id, d.file_name);
      const localStamp = d.updated_at ? parseSyncStamp(d.updated_at) : new Date(0);
      if (record && record.updated_at instanceof Timestamp && record.updated_at.toDate() >= localStamp) continue;
      try {
        // The file may already be up there: a record with a path means the
        // upload happened, on this phone or another. Uploading again is an
        // overwrite, which the storage rules refuse, and the attempt was
        // repeated on every sync.
        let cloudPath = d.cloud_path === wanted ? d.cloud_path : null;
        if (!cloudPath && record?.path === wanted) {
          cloudPath = record.path;
          await setJourneyDocumentCloudPath(d.id, cloudPath);
        }
        if (!cloudPath) {
          const file = new File(documentUri(d.file_name));
          if (!file.exists) continue;
          if ((file.size ?? 0) > MAX_BYTES) continue;
          cloudPath = wanted;
          // An earlier attempt may have uploaded the file and then failed on
          // the record: the file is there, only the record is missing.
          const target = ref(storage, cloudPath);
          const uploaded = await getMetadata(target).then(() => true, () => false);
          if (!uploaded) {
            const blob = await (await fetch(file.uri)).blob();
            await uploadBytes(target, blob, { contentType: d.mime ?? undefined });
          }
        }
        await setDoc(doc(recordsOf(party.journey.sync_id), d.sync_id), {
          title: d.title,
          kind: d.kind,
          mime: d.mime,
          file_name: d.file_name,
          traveller_uid: audience,
          uploader_uid: uid,
          path: cloudPath,
          updated_at: Timestamp.fromDate(localStamp.getTime() > 0 ? localStamp : new Date()),
        });
        // Only now, with the record written. The pull reads "a cloud path
        // but no record" as "deleted on another phone" and drops the row and
        // its file; set right after the upload, a record write that failed
        // (no signal, the app closed during a large scan) cost the owner the
        // document on the next sync.
        if (d.cloud_path !== cloudPath) await setJourneyDocumentCloudPath(d.id, cloudPath);
      } catch (err) {
        reportError(err, 'documents:push');
      }
    }
  }
}

/** One cloud record into the wallet: the file fetched once, the row kept in step. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * The record's file path, if it is where a document of this trip belongs:
 * this trip, its owner, a folder for everyone or for one account, the
 * record's own id and a plain extension. Returns the extension to name the
 * local copy with. Records are written by other phones, and a path pointing
 * into another trip, or an extension with a slash in it, used to be followed
 * as given, the latter writing outside the documents folder.
 */
export function checkedDocumentPath(path: string, journeyId: string, ownerUid: string, docId: string): { ext: string } | null {
  if (![journeyId, ownerUid, docId].every((part) => SAFE_ID.test(part))) return null;
  const m = new RegExp(`^shared/${journeyId}/${ownerUid}/(?:all|u/[A-Za-z0-9]+)/${docId}(\\.[a-z0-9]{1,5})?$`).exec(path);
  return m ? { ext: m[1] ?? '' } : null;
}

async function takeRecord(party: Party, id: string, x: DocumentData, uid: string): Promise<void> {
  // Deleted here, the cloud not told yet: not a new document.
  if (await isPendingDelete(id)) return;
  const existing = await getJourneyDocumentBySyncId(id);
  const travellerUid = typeof x.traveller_uid === 'string' ? x.traveller_uid : null;
  const traveller = travellerUid ? party.travellers.find((t) => t.uid === travellerUid) ?? null : null;
  // A friend we cannot place yet (their traveller row is still on its way): next time.
  if (travellerUid && !traveller) return;
  const path = String(x.path ?? '');
  const checked = checkedDocumentPath(path, party.journey.sync_id, party.journey.shared_owner_uid ?? uid, id);
  if (!checked) {
    reportError(new Error('Shared document with an unexpected path'), 'documents:path');
    return;
  }
  const updatedAt = x.updated_at instanceof Timestamp ? x.updated_at.toDate().toISOString() : new Date().toISOString();
  let fileName = existing?.file_name;
  if (!fileName) {
    fileName = `${id}${checked.ext}`;
    const url = await getDownloadURL(ref(storage, path));
    await File.downloadFileAsync(url, new File(documentsDirectory(), fileName), { idempotent: true });
  }
  await upsertJourneyDocumentFromCloud({
    sync_id: id,
    journey_id: party.journey.id,
    traveller_id: traveller?.id ?? null,
    kind: String(x.kind ?? 'other'),
    title: String(x.title ?? 'Document'),
    file_name: fileName,
    mime: typeof x.mime === 'string' ? x.mime : null,
    cloud_path: path,
    uploader_uid: typeof x.uploader_uid === 'string' ? x.uploader_uid : null,
    updated_at: updatedAt,
  });
}

/** A record that is gone: so is our copy, if it came from the cloud. */
async function dropRecord(id: string): Promise<void> {
  const existing = await getJourneyDocumentBySyncId(id);
  if (!existing || !existing.cloud_path) return;
  await deleteJourneyDocument(existing.id);
  try {
    removeDocumentFile(existing.file_name);
  } catch {}
}

export async function pullDocumentsFromCloud(uid: string): Promise<void> {
  for (const party of await parties()) {
    try {
      const snaps = party.member
        ? await Promise.all([
            getDocs(query(recordsOf(party.journey.sync_id), where('traveller_uid', '==', uid))),
            getDocs(query(recordsOf(party.journey.sync_id), where('traveller_uid', '==', null))),
          ])
        : [await getDocs(recordsOf(party.journey.sync_id))];
      const seen = new Set<string>();
      for (const snap of snaps) {
        for (const d of snap.docs) {
          seen.add(d.id);
          await takeRecord(party, d.id, d.data(), uid);
        }
      }
      // Ours that are no longer there: removed on another phone.
      for (const d of await getJourneyDocuments(party.journey.id)) {
        if (d.sync_id && d.cloud_path && !seen.has(d.sync_id) && audienceOf(d, party, uid) !== undefined) await dropRecord(d.sync_id);
      }
    } catch (err) {
      reportError(err, 'documents:pull');
    }
  }
}

/**
 * Live: a document a friend adds shows up while the wallet is open. One
 * listener per shared trip and audience; `refresh` is called whenever a
 * record lands or goes, so the screen can re-read.
 */
export async function watchDocuments(uid: string, refresh: () => void): Promise<Unsubscribe> {
  const subs: Unsubscribe[] = [];
  for (const party of await parties()) {
    const queries = party.member
      ? [query(recordsOf(party.journey.sync_id), where('traveller_uid', '==', uid)), query(recordsOf(party.journey.sync_id), where('traveller_uid', '==', null))]
      : [query(recordsOf(party.journey.sync_id))];
    for (const q of queries) {
      subs.push(onSnapshot(q, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
          try {
            if (change.type === 'removed') await dropRecord(change.doc.id);
            else await takeRecord(party, change.doc.id, change.doc.data(), uid);
          } catch (err) {
            reportError(err, 'documents:realtime');
          }
        }
        if (snapshot.docChanges().length) refresh();
      }, (err) => reportError(err, 'documents:listen')));
    }
  }
  return () => subs.forEach((u) => u());
}

/**
 * Delete on this phone and, if it was shared, in the cloud. Only the record
 * is deleted from here: clients may not delete files (storage.rules), the
 * `sharedDocumentFiles` function removes the file once the record is gone.
 *
 * Returns once the phone is done. The cloud part runs on its own: offline,
 * Firestore holds the write until it is back and the promise did not settle
 * until then, so the screen hung. Remembered first, so a closed app or a
 * failed write is retried by the next push.
 */
export async function deleteDocumentEverywhere(d: JourneyDocument, journeySyncId: string | null): Promise<void> {
  if (d.cloud_path && d.sync_id && journeySyncId) {
    const pending = { journey: journeySyncId, doc: d.sync_id };
    try {
      await changePendingDeletes((list) => [...list.filter((x) => x.doc !== pending.doc), pending]);
    } catch (err) {
      reportError(err, 'documents:delete-pending');
    }
    deleteRecord(pending).catch((err) => reportError(err, 'documents:delete-record'));
  }
  await deleteJourneyDocument(d.id);
  removeDocumentFile(d.file_name);
}
