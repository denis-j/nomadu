/**
 * Inviting friends to a trip.
 *
 * One person plans, the others come along: a shared journey is a mirror of
 * the owner's journey document at `shared_journeys/{journeyId}`, which the
 * owner's phone keeps up to date on every push and which the members'
 * phones follow live. Members read; only the owner writes; the membership
 * itself is written here, through the Admin SDK, so nobody can add
 * themselves to a trip without the invite code.
 *
 * The code is in `invites/{code}`, closed to clients. It is short enough to
 * read out at a table and long enough that guessing one is not a plan
 * (54^8, no ambiguous letters). Anyone with the code can join; that is what
 * an invite link is. Revoking is `unshareJourney`, which deletes both
 * documents, and the members' phones tombstone their copies.
 *
 * `sharePage` is the same trip as a web page, for the friend who does not
 * have the app yet: the itinerary, a button into the app, a button to the
 * store. It shows what the owner chose to share by making the link, and
 * nothing about the owner's timeline, visas or documents.
 */

import { randomInt } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { avatarSeed } from '../../lib/avatarSeed';
import { ACCOMMODATION_STATUSES } from '../../lib/accommodationModel';

const REGION = 'us-central1';
export const SHARED = 'shared_journeys';
export const INVITES = 'invites';
/**
 * Who first shared a journey id, kept after unsharing. Without it, an
 * ex-member who knows the id could create a journey of their own under it,
 * share it first, and become the owner of that id: the real owner's next
 * share then failed with "Not your trip". Closed to clients.
 */
export const SHARED_OWNERS = 'shared_owners';
export const SHARE_BASE = 'https://us-central1-nomady-dcff6.cloudfunctions.net/sharePage';
export const APP_SCHEME = 'nomady';
export const STORE_URL = 'https://nomadu.app';
const MAX_MEMBERS = 20;
/** No 0/O, 1/I/l: a code has to survive being read out loud. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;
const CODE = /^[A-Za-z0-9]{8}$/;

export function newCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function inviteUrl(code: string): string {
  return `${SHARE_BASE}/${code}`;
}

function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return uid;
}

function cleanName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : fallback;
}

function cleanCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim() : '';
  if (!CODE.test(code)) throw new HttpsError('invalid-argument', 'That is not an invite code.');
  return code;
}

function cleanId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpsError('invalid-argument', 'Unknown trip.');
  return id;
}

/** The fields of a journey document that members get to see. */
export function mirrorOf(journey: FirebaseFirestore.DocumentData) {
  return {
    title: String(journey.title ?? 'Trip'),
    legs: Array.isArray(journey.legs) ? journey.legs : [],
    travellers: Array.isArray(journey.travellers) ? journey.travellers : [],
    updated_at: journey.updated_at instanceof Timestamp ? journey.updated_at : Timestamp.now(),
    deleted: journey.deleted === true,
  };
}

async function ownerName(uid: string, given: unknown): Promise<string> {
  const profile = await getFirestore().doc(`users/${uid}`).get();
  return cleanName(given, cleanName(profile.get('displayName'), 'A friend'));
}

/** A picked face as stored on the profile: a plain DiceBear seed, or nothing. */
function cleanAvatar(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value) ? value : null;
}

/** The face someone picked in the app (a DiceBear seed), if any. */
async function profileAvatar(uid: string): Promise<string | null> {
  return cleanAvatar((await getFirestore().doc(`users/${uid}`).get()).get('avatar'));
}

interface SharedDoc {
  owner_uid: string;
  owner_name: string;
  invite_code: string;
  member_uids: string[];
  members: Record<string, { name: string; joined_at: Timestamp; avatar?: string; can_edit?: boolean }>;
  owner_avatar?: string;
  title: string;
  legs: any[];
  travellers: any[];
  updated_at: Timestamp;
  deleted: boolean;
}

// ─── The four calls ──────────────────────────────────────────────────────────
// Each is a plain function on (uid, data) so the tests can call it without
// the Functions runtime; the callables below only unwrap the request.

/** Owner: make the trip shareable (or return the existing code). */
export async function share(uid: string, data: { journeyId?: unknown; name?: unknown }) {
  const journeyId = cleanId(data.journeyId);
  const db = getFirestore();
  const journey = await db.doc(`users/${uid}/journeys/${journeyId}`).get();
  if (!journey.exists || journey.get('deleted') === true) {
    throw new HttpsError('not-found', 'This trip is not in the cloud yet. Turn on cloud sync in Settings, then try again.');
  }
  const ref = db.collection(SHARED).doc(journeyId);
  const existing = await ref.get();
  if (existing.exists && existing.get('owner_uid') !== uid) throw new HttpsError('permission-denied', 'Not your trip.');
  const claim = db.collection(SHARED_OWNERS).doc(journeyId);
  const claimed = await claim.get();
  if (claimed.exists && claimed.get('owner_uid') !== uid) throw new HttpsError('permission-denied', 'Not your trip.');
  if (!claimed.exists) await claim.set({ owner_uid: uid, created_at: Timestamp.now() });

  const code = existing.exists && typeof existing.get('invite_code') === 'string' ? (existing.get('invite_code') as string) : newCode();
  const name = await ownerName(uid, data.name);
  const avatar = await profileAvatar(uid);
  await ref.set(
    {
      owner_uid: uid,
      owner_name: name,
      ...(avatar && { owner_avatar: avatar }),
      invite_code: code,
      member_uids: existing.exists ? existing.get('member_uids') ?? [] : [],
      members: existing.exists ? existing.get('members') ?? {} : {},
      ...mirrorOf(journey.data()!),
    },
    { merge: true },
  );
  await db.collection(INVITES).doc(code).set({ journey_id: journeyId, owner_uid: uid, created_at: Timestamp.now() }, { merge: true });
  logger.info('journey shared', { uid, journeyId });
  return { code, url: inviteUrl(code) };
}

async function loadInvite(code: string): Promise<{ journeyId: string; shared: FirebaseFirestore.DocumentSnapshot }> {
  const db = getFirestore();
  const invite = await db.collection(INVITES).doc(code).get();
  if (!invite.exists) throw new HttpsError('not-found', 'This invite is no longer valid.');
  const journeyId = String(invite.get('journey_id'));
  const shared = await db.collection(SHARED).doc(journeyId).get();
  if (!shared.exists || shared.get('deleted') === true) throw new HttpsError('not-found', 'This trip is no longer shared.');
  return { journeyId, shared };
}

/** Anyone signed in with a code: what the trip is, before joining. */
export async function preview(uid: string, data: { code?: unknown }) {
  const code = cleanCode(data.code);
  const { journeyId, shared } = await loadInvite(code);
  const x = shared.data() as SharedDoc;
  const legs = x.legs ?? [];
  const isOwner = x.owner_uid === uid;
  const isMember = (x.member_uids ?? []).includes(uid);
  return {
    // Not a secret any more: document files cannot be listed and each one
    // sits behind its own random id, which only members read from the
    // records; taking the id over after an unshare is stopped by the claim
    // in SHARED_OWNERS. Builds already out open the trip with it.
    journey_id: journeyId,
    title: x.title,
    owner_name: x.owner_name,
    // The invite screen draws the owner's face from this, the same seed the
    // trip's own traveller row uses once you are on it.
    // The invite screen draws the owner's face from this, the same seed the
    // trip's own traveller row uses once you are on it. Hashed, so the
    // invite never carries the owner's account id.
    owner_avatar: ownerAvatar(x),
    start_date: legs[0]?.start_date ?? null,
    end_date: legs.length ? legs[legs.length - 1].end_date : null,
    stops: legs.map((l: any) => ({
      city: String(l.city ?? ''),
      country_code: String(l.country_code ?? ''),
      start_date: String(l.start_date ?? ''),
      end_date: String(l.end_date ?? ''),
    })),
    members: (x.member_uids ?? []).length,
    is_owner: isOwner,
    is_member: isMember,
  };
}

/** Come along: become a member, under the name the others will see. */
export async function join(uid: string, data: { code?: unknown; name?: unknown }) {
  const code = cleanCode(data.code);
  const { journeyId, shared } = await loadInvite(code);
  const x = shared.data() as SharedDoc;
  if (x.owner_uid === uid) throw new HttpsError('failed-precondition', 'This is your own trip.');
  const profile = await getFirestore().doc(`users/${uid}`).get();
  const avatar = await profileAvatar(uid);
  // Read and write in one transaction: two people joining at the same moment
  // each wrote the member list they had read, and one of them vanished from
  // it; parallel joins could also go past MAX_MEMBERS.
  await getFirestore().runTransaction(async (tx) => {
    const fresh = (await tx.get(shared.ref)).data() as SharedDoc | undefined;
    if (!fresh) throw new HttpsError('not-found', 'This trip is no longer shared.');
    const uids = [...(fresh.member_uids ?? [])];
    const members = { ...(fresh.members ?? {}) };
    if (!uids.includes(uid)) {
      if (uids.length >= MAX_MEMBERS) throw new HttpsError('resource-exhausted', 'This trip is full.');
      uids.push(uid);
    }
    members[uid] = {
      name: cleanName(data.name, cleanName(profile.get('displayName'), 'Friend')),
      joined_at: members[uid]?.joined_at ?? Timestamp.now(),
      ...(avatar && { avatar }),
      // Opening the link again must not take away what the owner granted.
      ...(members[uid]?.can_edit === true && { can_edit: true }),
    };
    tx.update(shared.ref, { member_uids: uids, members });
  });
  logger.info('journey joined', { uid, journeyId });
  return { journey_id: journeyId, title: x.title, owner_name: x.owner_name };
}

/** Member: step off. Owner: stop sharing altogether. */
export async function leave(uid: string, data: { journeyId?: unknown }) {
  const journeyId = cleanId(data.journeyId);
  const ref = getFirestore().collection(SHARED).doc(journeyId);
  const shared = await ref.get();
  if (!shared.exists) return { ok: true };
  const x = shared.data() as SharedDoc;
  if (x.owner_uid === uid) return unshare(uid, { journeyId });
  const members = { ...(x.members ?? {}) };
  delete members[uid];
  await ref.update({ member_uids: (x.member_uids ?? []).filter((m) => m !== uid), members });
  return { ok: true };
}

/**
 * A shared trip, gone for good: the mirror, its document records and every
 * file uploaded to it. Deleting only the mirror left the `documents`
 * subcollection and the files (passports, tickets) behind, still readable
 * by anyone who had been on the trip.
 */
async function purgeShared(journeyId: string, ownerUid: string): Promise<void> {
  const db = getFirestore();
  await db.recursiveDelete(db.collection(SHARED).doc(journeyId));
  try {
    await getStorage().bucket().deleteFiles({ prefix: `shared/${journeyId}/${ownerUid}/` });
  } catch (err) {
    // The records are gone, so the app no longer points at the files; they
    // are orphans now, which is worth a loud log but not a failed unshare.
    logger.error('shared files not deleted', { journeyId, err: String(err) });
  }
}

/**
 * What a member put on someone else's trip, for when they leave it for good
 * (account deletion): their document records and the files behind them.
 */
async function purgeUploads(journeyId: string, uid: string): Promise<void> {
  const db = getFirestore();
  const mine = await db.collection(`${SHARED}/${journeyId}/documents`).where('uploader_uid', '==', uid).get();
  for (const d of mine.docs) {
    const path = d.get('path');
    // Only files of this trip: the path is written by a client.
    if (typeof path === 'string' && path.startsWith(`shared/${journeyId}/`) && !path.includes('..')) {
      try {
        await getStorage().bucket().file(path).delete();
      } catch (err) {
        logger.error('uploaded file not deleted', { journeyId, err: String(err) });
      }
    }
    await d.ref.delete();
  }
}

/**
 * Owner: one friend off the trip. Their phone drops it the moment the
 * document changes. The invite code is replaced as well: the old one is in
 * their app and in their link, and with it they could simply join again.
 * The owner's phones pick the new code up from the mirror.
 */
export async function removeMember(uid: string, data: { journeyId?: unknown; memberUid?: unknown }) {
  const journeyId = cleanId(data.journeyId);
  const memberUid = typeof data.memberUid === 'string' && data.memberUid.trim() ? data.memberUid.trim() : '';
  if (!memberUid) throw new HttpsError('invalid-argument', 'Whom?');
  const ref = getFirestore().collection(SHARED).doc(journeyId);
  const shared = await ref.get();
  if (!shared.exists) throw new HttpsError('not-found', 'This trip is not shared.');
  const x = shared.data() as SharedDoc;
  if (x.owner_uid !== uid) throw new HttpsError('permission-denied', 'Not your trip.');
  if (memberUid === uid) throw new HttpsError('failed-precondition', 'You cannot remove yourself; stop sharing instead.');
  const members = { ...(x.members ?? {}) };
  delete members[memberUid];
  const db = getFirestore();
  const code = newCode();
  await db.collection(INVITES).doc(code).set({ journey_id: journeyId, owner_uid: uid, created_at: Timestamp.now() });
  await ref.update({ member_uids: (x.member_uids ?? []).filter((m) => m !== memberUid), members, invite_code: code });
  if (typeof x.invite_code === 'string') await db.collection(INVITES).doc(x.invite_code).delete();
  logger.info('member removed', { uid, journeyId });
  return { ok: true, code, url: inviteUrl(code) };
}

// ─── Friends who plan along ─────────────────────────────────────────────────
// By default a member follows the trip. The owner can let one of them plan
// too, after they joined: that member's phone then edits the trip like its
// own, and sends each change here. The owner's journey document is the one
// written, as the agent API does, so the owner's phones take it over on
// their next pull; the mirror gets it at once for everyone else. Inviting,
// removing, granting and stopping the sharing stay the owner's.

const MAX_LEGS = 80;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Owner: let a member plan along, or stop them. */
export async function setMemberCanEdit(uid: string, data: { journeyId?: unknown; memberUid?: unknown; canEdit?: unknown }) {
  const journeyId = cleanId(data.journeyId);
  const memberUid = typeof data.memberUid === 'string' ? data.memberUid.trim() : '';
  if (!memberUid) throw new HttpsError('invalid-argument', 'Whom?');
  if (typeof data.canEdit !== 'boolean') throw new HttpsError('invalid-argument', 'Yes or no?');
  const canEdit = data.canEdit;
  const ref = getFirestore().collection(SHARED).doc(journeyId);
  await getFirestore().runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() as SharedDoc | undefined;
    if (!fresh) throw new HttpsError('not-found', 'This trip is not shared.');
    if (fresh.owner_uid !== uid) throw new HttpsError('permission-denied', 'Not your trip.');
    const me = fresh.members?.[memberUid];
    if (!me || !(fresh.member_uids ?? []).includes(memberUid)) throw new HttpsError('not-found', 'They are not on this trip.');
    const entry = { ...me };
    if (canEdit) entry.can_edit = true;
    else delete entry.can_edit;
    tx.update(ref, { members: { ...fresh.members, [memberUid]: entry } });
  });
  logger.info('member edit right changed', { uid, journeyId, canEdit });
  return { ok: true, can_edit: canEdit };
}

/** A member who may plan: the shared trip and its owner, or an error. */
async function editableBy(uid: string, journeyId: string): Promise<SharedDoc> {
  const shared = await getFirestore().collection(SHARED).doc(journeyId).get();
  if (!shared.exists || shared.get('deleted') === true) throw new HttpsError('not-found', 'This trip is no longer shared.');
  const x = shared.data() as SharedDoc;
  if (!(x.member_uids ?? []).includes(uid)) throw new HttpsError('permission-denied', 'You are not on this trip.');
  if (x.members?.[uid]?.can_edit !== true) throw new HttpsError('permission-denied', 'Only the owner can change this trip.');
  return x;
}

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The stops as a phone sends them, reduced to the known fields and checked. */
export function cleanLegs(value: unknown): any[] {
  if (!Array.isArray(value) || value.length > MAX_LEGS) throw new HttpsError('invalid-argument', 'Those are not stops.');
  return value.map((l: any, i) => {
    const syncId = str(l?.sync_id, 64);
    const start = str(l?.start_date, 10);
    const end = str(l?.end_date, 10);
    const city = str(l?.city, 120);
    if (!syncId || !city || !start || !end || !YMD.test(start) || !YMD.test(end) || end < start) {
      throw new HttpsError('invalid-argument', `Stop ${i + 1} is incomplete.`);
    }
    return {
      sync_id: syncId,
      city,
      country: str(l.country, 120) ?? '',
      country_code: (str(l.country_code, 2) ?? '').toUpperCase(),
      latitude: num(l.latitude),
      longitude: num(l.longitude),
      start_date: start,
      end_date: end,
      transport: str(l.transport, 30),
      notes: str(l.notes, 2000),
      sort_order: num(l.sort_order) ?? i,
    };
  });
}

function stampOf(value: unknown): Date {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new HttpsError('invalid-argument', 'When?');
  // A phone clock far ahead would win every later conflict.
  const limit = Date.now() + 5 * 60 * 1000;
  return date.getTime() > limit ? new Date(limit) : date;
}

/**
 * A member with the right: the title and the stops, as their phone has them
 * now. Older than what the owner has is refused as stale; the phone then
 * takes the newer version from the mirror. The travellers stay the owner's.
 */
export async function updateShared(uid: string, data: { journeyId?: unknown; title?: unknown; legs?: unknown; updatedAt?: unknown }) {
  const journeyId = cleanId(data.journeyId);
  const x = await editableBy(uid, journeyId);
  const title = cleanName(data.title, x.title).slice(0, 80);
  const legs = cleanLegs(data.legs);
  const updatedAt = Timestamp.fromDate(stampOf(data.updatedAt));
  const db = getFirestore();
  const own = db.doc(`users/${x.owner_uid}/journeys/${journeyId}`);
  const mirror = db.collection(SHARED).doc(journeyId);
  const result = await db.runTransaction(async (tx) => {
    const current = await tx.get(own);
    if (!current.exists || current.get('deleted') === true) throw new HttpsError('not-found', 'This trip is gone.');
    const theirs = current.get('updated_at');
    if (theirs instanceof Timestamp && theirs.toMillis() >= updatedAt.toMillis()) return { ok: false, stale: true };
    tx.update(own, { title, legs, updated_at: updatedAt, synced_at: FieldValue.serverTimestamp() });
    tx.update(mirror, { title, legs, updated_at: updatedAt });
    return { ok: true, stale: false };
  });
  logger.info('shared trip edited by member', { uid, journeyId, stale: result.stale });
  return result;
}

/** A member with the right: one stop's accommodation plan, the same way. */
export async function updateSharedStay(uid: string, data: { journeyId?: unknown; plan?: unknown }) {
  const journeyId = cleanId(data.journeyId);
  const x = await editableBy(uid, journeyId);
  const p = (data.plan ?? {}) as Record<string, unknown>;
  const stopId = cleanId(p.stop_id ?? p.id);
  if (!(x.legs ?? []).some((l: any) => l?.sync_id === stopId)) throw new HttpsError('not-found', 'That stop is not on this trip.');
  const checkIn = str(p.check_in, 10);
  const checkOut = str(p.check_out, 10);
  if (!checkIn || !checkOut || !YMD.test(checkIn) || !YMD.test(checkOut)) throw new HttpsError('invalid-argument', 'Dates?');
  const plan = {
    journey_id: journeyId,
    stop_id: stopId,
    needed: p.needed !== false,
    status: (ACCOMMODATION_STATUSES as readonly string[]).includes(p.status as string) ? p.status : 'open',
    check_in: checkIn,
    check_out: checkOut,
    requirements: p.requirements && typeof p.requirements === 'object' ? p.requirements : {},
    options: Array.isArray(p.options) ? p.options.slice(0, 40) : [],
    selected_option_id: str(p.selected_option_id, 64),
    booking: p.booking && typeof p.booking === 'object' ? p.booking : null,
    notes: str(p.notes, 4000),
    deleted: p.deleted === true,
  };
  if (JSON.stringify(plan).length > 200_000) throw new HttpsError('invalid-argument', 'That plan is too big.');
  const updatedAt = Timestamp.fromDate(stampOf(p.updated_at));
  const db = getFirestore();
  const own = db.doc(`users/${x.owner_uid}/accommodations/${stopId}`);
  const mirror = db.collection(SHARED).doc(journeyId);
  const result = await db.runTransaction(async (tx) => {
    // Firestore wants every read of a transaction before its first write.
    const current = await tx.get(own);
    const fresh = (await tx.get(mirror)).data() ?? {};
    const theirs = current.exists ? current.get('updated_at') : null;
    if (theirs instanceof Timestamp && theirs.toMillis() >= updatedAt.toMillis()) return { ok: false, stale: true };
    tx.set(own, { ...plan, updated_at: updatedAt, synced_at: FieldValue.serverTimestamp() });
    const map = { ...((fresh.accommodations ?? {}) as Record<string, unknown>) };
    if (plan.deleted) delete map[stopId];
    else map[stopId] = { ...plan, id: stopId, updated_at: updatedAt.toDate().toISOString() };
    tx.update(mirror, { accommodations: map });
    return { ok: true, stale: false };
  });
  logger.info('shared stay edited by member', { uid, journeyId, stale: result.stale });
  return result;
}

/** Owner: the trip is private again. Members' phones tombstone their copy. */
export async function unshare(uid: string, data: { journeyId?: unknown }) {
  const journeyId = cleanId(data.journeyId);
  const db = getFirestore();
  const ref = db.collection(SHARED).doc(journeyId);
  const shared = await ref.get();
  if (!shared.exists) return { ok: true };
  if (shared.get('owner_uid') !== uid) throw new HttpsError('permission-denied', 'Not your trip.');
  const code = shared.get('invite_code');
  if (typeof code === 'string') await db.collection(INVITES).doc(code).delete();
  // Trips shared before the claim existed get it now, while the owner is
  // still known: after this the mirror is gone.
  await db.collection(SHARED_OWNERS).doc(journeyId).set({ owner_uid: uid, created_at: Timestamp.now() });
  await purgeShared(journeyId, uid);
  logger.info('journey unshared', { uid, journeyId });
  return { ok: true };
}

/** Everything a user owns or belongs to, for account deletion. */
export async function forgetUser(uid: string): Promise<void> {
  const db = getFirestore();
  const owned = await db.collection(SHARED).where('owner_uid', '==', uid).get();
  for (const d of owned.docs) {
    const code = d.get('invite_code');
    if (typeof code === 'string') await db.collection(INVITES).doc(code).delete();
    await purgeShared(d.id, uid);
  }
  const claims = await db.collection(SHARED_OWNERS).where('owner_uid', '==', uid).get();
  for (const d of claims.docs) await d.ref.delete();
  const memberOf = await db.collection(SHARED).where('member_uids', 'array-contains', uid).get();
  for (const d of memberOf.docs) {
    await purgeUploads(d.id, uid);
    const members = { ...(d.get('members') ?? {}) };
    delete members[uid];
    await d.ref.update({ member_uids: (d.get('member_uids') as string[]).filter((m) => m !== uid), members });
  }
}

/**
 * Someone changed their name or face: every shared trip shows the new one.
 * As a member, their entry in the member list and their traveller row in
 * the mirror the others follow (the owner's phone takes the list over on
 * its next sync, the mirror covers the time until then). As an owner, the
 * name and face the invite shows. Only what changed is written, so the
 * name someone gave when joining stays until they change it.
 */
export async function spreadProfile(uid: string, before: FirebaseFirestore.DocumentData | undefined, after: FirebaseFirestore.DocumentData | undefined): Promise<void> {
  if (!after) return;
  const name = cleanName(after.displayName, '');
  const avatar = cleanAvatar(after.avatar);
  const nameChanged = !!name && name !== cleanName(before?.displayName, '');
  const avatarChanged = avatar !== cleanAvatar(before?.avatar);
  if (!nameChanged && !avatarChanged) return;
  const db = getFirestore();

  const memberOf = await db.collection(SHARED).where('member_uids', 'array-contains', uid).get();
  for (const d of memberOf.docs) {
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(d.ref)).data() as SharedDoc | undefined;
      const me = fresh?.members?.[uid];
      if (!fresh || !me) return;
      const members = { ...fresh.members };
      const entry: SharedDoc['members'][string] = { ...me };
      if (nameChanged) entry.name = name;
      if (avatarChanged) {
        if (avatar) entry.avatar = avatar;
        else delete entry.avatar;
      }
      members[uid] = entry;
      const travellers = (fresh.travellers ?? []).map((t: any) => (t?.uid === uid
        ? { ...t, ...(nameChanged && { name }), ...(avatarChanged && { avatar: avatar ?? null }) }
        : t));
      tx.update(d.ref, { members, travellers });
    });
  }

  const owned = await db.collection(SHARED).where('owner_uid', '==', uid).get();
  for (const d of owned.docs) {
    await d.ref.update({
      ...(nameChanged && { owner_name: name }),
      // Empty: back to the default face (ownerAvatar).
      ...(avatarChanged && { owner_avatar: avatar ?? '' }),
    });
  }
  logger.info('profile spread to shared trips', { uid, member: memberOf.size, owner: owned.size });
}

export const sharedProfiles = onDocumentWritten({ document: 'users/{uid}', region: REGION }, (event) =>
  spreadProfile(event.params.uid, event.data?.before.data(), event.data?.after.data()));

const opts = { region: REGION };
export const shareJourney = onCall(opts, (request) => share(requireUid(request), request.data ?? {}));
export const previewInvite = onCall(opts, (request) => preview(requireUid(request), request.data ?? {}));
export const joinJourney = onCall(opts, (request) => join(requireUid(request), request.data ?? {}));
export const leaveJourney = onCall(opts, (request) => leave(requireUid(request), request.data ?? {}));
export const removeJourneyMember = onCall(opts, (request) => removeMember(requireUid(request), request.data ?? {}));
export const unshareJourney = onCall(opts, (request) => unshare(requireUid(request), request.data ?? {}));
export const setJourneyMemberCanEdit = onCall(opts, (request) => setMemberCanEdit(requireUid(request), request.data ?? {}));
export const updateSharedJourney = onCall(opts, (request) => updateShared(requireUid(request), request.data ?? {}));
export const updateSharedAccommodation = onCall(opts, (request) => updateSharedStay(requireUid(request), request.data ?? {}));

// ─── The page ────────────────────────────────────────────────────────────────

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function flag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function humanDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * The same cartoon face the app draws for this account, from the same
 * hashed seed (see lib/avatarSeed.ts). The account id itself never reaches
 * this page or the avatar service.
 */
const AVATAR_URL = (seed: string) =>
  `https://api.dicebear.com/10.x/thumbs/svg?seed=${encodeURIComponent(seed)}&animationVariant=medium&${AVATAR_PARAMS}`;
/** The app's colours for the faces; keep in step with AVATAR_PARAMS in lib/avatars.ts. */
const AVATAR_PARAMS =
  'backgroundColor=4dc1ff,8ad3ff,2fa8e8&shapeColor=ffffff,f2faff&eyesColor=0b2541&mouthColor=0b2541';

/** The owner's face: the one they picked, or the default drawn from their id. */
function ownerAvatar(x: { owner_uid: string; owner_avatar?: unknown }): string {
  return typeof x.owner_avatar === 'string' && x.owner_avatar ? x.owner_avatar : avatarSeed(x.owner_uid);
}

/** The trip as a page: what the link shows to someone without the app. */
export function sharePageHtml(code: string, x: SharedDoc): string {
  const legs = x.legs ?? [];
  const span = legs.length ? `${humanDate(legs[0].start_date)} – ${humanDate(legs[legs.length - 1].end_date)}` : '';
  const stops = legs
    .map((l: any) => `<li><span class="flag">${flag(String(l.country_code ?? ''))}</span><span class="city">${escape(String(l.city ?? ''))}</span><span class="dates">${escape(humanDate(String(l.start_date)))} – ${escape(humanDate(String(l.end_date)))}</span></li>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(x.title)} · Nomadu</title>
<meta property="og:title" content="${escape(x.title)}">
<meta property="og:description" content="${escape(x.owner_name)} invites you along${span ? `, ${escape(span)}` : ''}. Open in Nomadu to come with.">
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #F8F9FA; color: #000; font: 17px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, Arial, sans-serif; }
  main { max-width: 440px; margin: 0 auto; padding: 48px 20px 64px; }
  .who { color: #6B7280; font-size: 15px; margin: 0 0 6px; }
  .from { display: flex; align-items: center; gap: 14px; margin-bottom: 4px; }
  .from img { width: 56px; height: 56px; border-radius: 28px; background: #F0F2F5; }
  .from .who { margin: 0 0 2px; }
  h1 { font-size: 30px; letter-spacing: -0.5px; margin: 0 0 4px; }
  .span { color: #6B7280; margin: 0 0 28px; font-variant-numeric: tabular-nums; }
  ul { list-style: none; padding: 0; margin: 0 0 32px; background: #fff; border: 1px solid #E5E7EB; border-radius: 18px; overflow: hidden; }
  li { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-top: 1px solid #E5E7EB; }
  li:first-child { border-top: 0; }
  .flag { font-size: 22px; width: 28px; }
  .city { flex: 1; font-weight: 600; }
  .dates { color: #6B7280; font-size: 14px; font-variant-numeric: tabular-nums; }
  a.button { display: block; text-align: center; padding: 15px; border-radius: 14px; text-decoration: none; font-weight: 600; margin-bottom: 10px; }
  a.primary { background: #000; color: #fff; }
  a.secondary { background: #F0F2F5; color: #000; }
  .code { text-align: center; color: #9CA3AF; font-size: 13px; margin-top: 24px; }
</style>
</head>
<body>
<main>
  <div class="from">
    <img src="${AVATAR_URL(ownerAvatar(x))}" alt="" width="56" height="56">
    <div>
      <p class="who">${escape(x.owner_name)} invites you along</p>
      <h1>${escape(x.title)}</h1>
    </div>
  </div>
  <p class="span">${escape(span)}${legs.length ? ` · ${legs.length} ${legs.length === 1 ? 'stop' : 'stops'}` : ''}</p>
  <ul>${stops}</ul>
  <a class="button primary" href="${APP_SCHEME}://join/${escape(code)}">Open in Nomadu</a>
  <a class="button secondary" href="${STORE_URL}">Get Nomadu</a>
  <p class="code">Invite code ${escape(code)}</p>
</main>
</body>
</html>`;
}

export const sharePage = onRequest({ region: REGION, memory: '256MiB' }, async (req, res) => {
  const code = req.path.replace(/^\/+|\/+$/g, '');
  res.set('Cache-Control', 'no-store');
  if (!CODE.test(code)) {
    res.status(404).set('Content-Type', 'text/plain').send('Not a Nomadu invite.');
    return;
  }
  try {
    const { shared } = await loadInvite(code);
    res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(sharePageHtml(code, shared.data() as SharedDoc));
  } catch (err) {
    if (err instanceof HttpsError) {
      res.status(404).set('Content-Type', 'text/plain').send('This invite is no longer valid.');
      return;
    }
    logger.error('share page failed', { code, err: String(err) });
    res.status(500).set('Content-Type', 'text/plain').send('Something went wrong.');
  }
});
