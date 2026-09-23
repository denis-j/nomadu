import { File } from 'expo-file-system';
import { Timestamp, collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
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
      const audience = audienceOf(d, party, uid);
      if (audience === undefined) continue;
      // Not ours to rewrite: a document that came from someone else.
      if (d.uploader_uid && d.uploader_uid !== uid) continue;
      const record = records.get(d.sync_id);
      const localStamp = d.updated_at ? parseSyncStamp(d.updated_at) : new Date(0);
      if (record && record.updated_at instanceof Timestamp && record.updated_at.toDate() >= localStamp) continue;
      try {
        // The file may already be up there: a record with a path means the
        // upload happened, on this phone or another. Uploading again is an
        // overwrite, which the storage rules refuse, and the attempt was
        // repeated on every sync.
        let cloudPath = d.cloud_path;
        if (!cloudPath && typeof record?.path === 'string' && record.path) {
          cloudPath = record.path;
          await setJourneyDocumentCloudPath(d.id, cloudPath);
        }
        if (!cloudPath) {
          const file = new File(documentUri(d.file_name));
          if (!file.exists) continue;
          if ((file.size ?? 0) > MAX_BYTES) continue;
          cloudPath = cloudPathFor(party.journey.sync_id, ownerUid, audience, d.sync_id, d.file_name);
          const blob = await (await fetch(file.uri)).blob();
          await uploadBytes(ref(storage, cloudPath), blob, { contentType: d.mime ?? undefined });
          await setJourneyDocumentCloudPath(d.id, cloudPath);
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
      } catch (err) {
        reportError(err, 'documents:push');
      }
    }
  }
}

/** One cloud record into the wallet: the file fetched once, the row kept in step. */
async function takeRecord(party: Party, id: string, x: DocumentData): Promise<void> {
  const existing = await getJourneyDocumentBySyncId(id);
  const travellerUid = typeof x.traveller_uid === 'string' ? x.traveller_uid : null;
  const traveller = travellerUid ? party.travellers.find((t) => t.uid === travellerUid) ?? null : null;
  // A friend we cannot place yet (their traveller row is still on its way): next time.
  if (travellerUid && !traveller) return;
  const path = String(x.path ?? '');
  const updatedAt = x.updated_at instanceof Timestamp ? x.updated_at.toDate().toISOString() : new Date().toISOString();
  let fileName = existing?.file_name;
  if (!fileName) {
    const dot = path.lastIndexOf('.');
    fileName = `${id}${dot >= 0 ? path.slice(dot) : ''}`;
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
          await takeRecord(party, d.id, d.data());
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
            else await takeRecord(party, change.doc.id, change.doc.data());
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

/** Delete on this phone and, if it was shared, in the cloud: file first, then the record. */
export async function deleteDocumentEverywhere(d: JourneyDocument, journeySyncId: string | null): Promise<void> {
  if (d.cloud_path && d.sync_id && journeySyncId) {
    try {
      await deleteObject(ref(storage, d.cloud_path));
    } catch (err) {
      reportError(err, 'documents:delete-file');
    }
    try {
      await deleteDoc(doc(recordsOf(journeySyncId), d.sync_id));
    } catch (err) {
      reportError(err, 'documents:delete-record');
    }
  }
  await deleteJourneyDocument(d.id);
  removeDocumentFile(d.file_name);
}
