import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Timestamp, __get, __reset, __seed } from './fakeFirestore';
import { __storageDeleted, __storageReset } from './fakeStorage';
import { forgetUser, join, leave, mirrorOf, newCode, preview, removeMember, setMemberCanEdit, share, sharePageHtml, spreadProfile, unshare, updateShared, updateSharedStay } from '../src/share';
import { isTripFile, staleFile } from '../src/documentFiles';

const LEGS = [
  { sync_id: 's1', city: 'Hanoi', country: 'Vietnam', country_code: 'VN', start_date: '2026-11-01', end_date: '2026-11-04', transport: 'flight', notes: null, sort_order: 0 },
  { sync_id: 's2', city: 'Hue', country: 'Vietnam', country_code: 'VN', start_date: '2026-11-05', end_date: '2026-11-07', transport: 'train', notes: null, sort_order: 1 },
];

const rejects = async (work: Promise<unknown>, code: string) => {
  await assert.rejects(work, (err: any) => err.code === code, `expected ${code}`);
};

beforeEach(() => {
  __reset();
  __storageReset();
  __seed('users/owner', { displayName: 'Denis' });
  __seed('users/anna', { displayName: 'Anna' });
  __seed('users/bob', {});
  __seed('users/owner/journeys/j1', {
    title: 'Vietnam',
    legs: LEGS,
    travellers: [{ sync_id: 't1', name: 'You', sort_order: 0 }],
    updated_at: Timestamp.fromDate(new Date('2026-09-01T10:00:00Z')),
    deleted: false,
  });
});

describe('sharing', () => {
  test('codes are eight readable characters and differ', () => {
    const a = newCode();
    const b = newCode();
    assert.match(a, /^[A-HJ-NP-Za-km-z2-9]{8}$/);
    assert.notEqual(a, b);
  });

  test('the owner shares a trip and gets a code; sharing again returns the same code', async () => {
    const first = await share('owner', { journeyId: 'j1' });
    assert.match(first.code, /^[A-Za-z0-9]{8}$/);
    assert.equal(first.url, `https://us-central1-nomady-dcff6.cloudfunctions.net/sharePage/${first.code}`);
    const doc = __get('shared_journeys/j1')!;
    assert.equal(doc.owner_uid, 'owner');
    assert.equal(doc.owner_name, 'Denis');
    assert.equal(doc.title, 'Vietnam');
    assert.deepEqual(doc.member_uids, []);
    assert.equal(__get(`invites/${first.code}`)!.journey_id, 'j1');

    const second = await share('owner', { journeyId: 'j1', name: 'Denis J.' });
    assert.equal(second.code, first.code);
    assert.equal(__get('shared_journeys/j1')!.owner_name, 'Denis J.');
  });

  test('only a trip that is in the cloud can be shared, and only by its owner', async () => {
    await rejects(share('owner', { journeyId: 'nope' }), 'not-found');
    await share('owner', { journeyId: 'j1' });
    __seed('users/anna/journeys/j1', { title: 'Mine too', legs: [], travellers: [], deleted: false });
    await rejects(share('anna', { journeyId: 'j1' }), 'permission-denied');
    await rejects(share('owner', { journeyId: '../x' }), 'invalid-argument');
  });

  test('the mirror carries only what members may see', () => {
    const m = mirrorOf({ title: 'T', legs: LEGS, travellers: [], deleted: false, local_id: 4, created_by: 'agent', secret: 'x' });
    assert.deepEqual(Object.keys(m).sort(), ['deleted', 'legs', 'title', 'travellers', 'updated_at']);
  });
});

describe('joining', () => {
  test('a friend previews, joins under a name, and is a member once', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    const p = await preview('anna', { code });
    assert.equal(p.title, 'Vietnam');
    assert.equal(p.owner_name, 'Denis');
    assert.equal(p.start_date, '2026-11-01');
    assert.equal(p.end_date, '2026-11-07');
    assert.deepEqual(p.stops.map((s) => s.city), ['Hanoi', 'Hue']);
    assert.equal(p.is_member, false);

    const j = await join('anna', { code });
    assert.equal(j.journey_id, 'j1');
    let doc = __get('shared_journeys/j1')!;
    assert.deepEqual(doc.member_uids, ['anna']);
    assert.equal((doc.members as any).anna.name, 'Anna');

    await join('anna', { code, name: 'Anna B.' });
    doc = __get('shared_journeys/j1')!;
    assert.deepEqual(doc.member_uids, ['anna']);
    assert.equal((doc.members as any).anna.name, 'Anna B.');
    assert.equal((await preview('anna', { code })).is_member, true);

    // No display name anywhere: still a name.
    await join('bob', { code });
    assert.equal((__get('shared_journeys/j1')!.members as any).bob.name, 'Friend');
  });

  test('bad or dead codes, and the owner joining their own trip, are refused', async () => {
    await rejects(preview('anna', { code: 'nope' }), 'invalid-argument');
    await rejects(join('anna', { code: 'AAAAAAAA' }), 'not-found');
    const { code } = await share('owner', { journeyId: 'j1' });
    await rejects(join('owner', { code }), 'failed-precondition');
    assert.equal((await preview('owner', { code })).is_owner, true);
  });

  test('members leave; the owner leaving means unsharing', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code });
    await join('bob', { code });
    await leave('anna', { journeyId: 'j1' });
    assert.deepEqual(__get('shared_journeys/j1')!.member_uids, ['bob']);
    assert.equal('anna' in (__get('shared_journeys/j1')!.members as any), false);

    await leave('owner', { journeyId: 'j1' });
    assert.equal(__get('shared_journeys/j1'), undefined);
    assert.equal(__get(`invites/${code}`), undefined);
    await rejects(preview('bob', { code }), 'not-found');
  });

  test('the owner can remove a friend, nobody else can, and not themselves', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code });
    await join('bob', { code });
    await rejects(removeMember('anna', { journeyId: 'j1', memberUid: 'bob' }), 'permission-denied');
    await rejects(removeMember('owner', { journeyId: 'j1', memberUid: 'owner' }), 'failed-precondition');
    const removed = await removeMember('owner', { journeyId: 'j1', memberUid: 'anna' });
    assert.deepEqual(__get('shared_journeys/j1')!.member_uids, ['bob']);
    assert.equal('anna' in (__get('shared_journeys/j1')!.members as any), false);
    // Removed means removed: the link she has is dead, a new one replaces it.
    assert.notEqual(removed.code, code);
    assert.equal(__get('shared_journeys/j1')!.invite_code, removed.code);
    assert.equal(__get(`invites/${code}`), undefined);
    await rejects(join('anna', { code }), 'not-found');
    // The owner can still invite, with the new code.
    await join('anna', { code: removed.code });
    assert.deepEqual(__get('shared_journeys/j1')!.member_uids, ['bob', 'anna']);
  });

  test('unsharing removes the documents and their files too', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code });
    __seed('shared_journeys/j1/documents/d1', { title: 'Passport', path: 'shared/j1/owner/all/d1.jpg', uploader_uid: 'owner' });
    __seed('shared_journeys/j1/documents/d2', { title: 'Ticket', path: 'shared/j1/owner/u/anna/d2.pdf', uploader_uid: 'anna' });
    await unshare('owner', { journeyId: 'j1' });
    assert.equal(__get('shared_journeys/j1'), undefined);
    assert.equal(__get('shared_journeys/j1/documents/d1'), undefined);
    assert.equal(__get('shared_journeys/j1/documents/d2'), undefined);
    assert.deepEqual(__storageDeleted(), ['shared/j1/owner/*']);
  });

  test('unsharing is the owner\'s alone', async () => {
    await share('owner', { journeyId: 'j1' });
    await rejects(unshare('anna', { journeyId: 'j1' }), 'permission-denied');
    assert.ok(__get('shared_journeys/j1'));
  });

  test('a deleted account disappears from every trip', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code });
    __seed('users/anna/journeys/a1', { title: 'Anna\'s', legs: [], travellers: [], deleted: false });
    const mine = await share('anna', { journeyId: 'a1' });
    await join('owner', { code: mine.code });

    __seed('shared_journeys/a1/documents/x1', { title: 'Visa', path: 'shared/a1/anna/all/x1.jpg', uploader_uid: 'anna' });
    __seed('shared_journeys/j1/documents/d1', { title: 'Her passport', path: 'shared/j1/owner/all/d1.jpg', uploader_uid: 'anna' });
    __seed('shared_journeys/j1/documents/d2', { title: 'Owner ticket', path: 'shared/j1/owner/all/d2.jpg', uploader_uid: 'owner' });
    __seed('shared_journeys/j1/documents/d3', { title: 'Bad path', path: 'shared/other/x/all/../../z.jpg', uploader_uid: 'anna' });

    await forgetUser('anna');
    assert.equal(__get('shared_journeys/a1'), undefined);
    assert.equal(__get('shared_journeys/a1/documents/x1'), undefined);
    assert.equal(__get(`invites/${mine.code}`), undefined);
    assert.deepEqual(__get('shared_journeys/j1')!.member_uids, []);
    // What she put on the owner's trip goes with her; the owner's stays.
    assert.equal(__get('shared_journeys/j1/documents/d1'), undefined);
    assert.equal(__get('shared_journeys/j1/documents/d3'), undefined);
    assert.ok(__get('shared_journeys/j1/documents/d2'));
    // Files: her own trip wholesale, her upload on the owner's trip, and
    // nothing outside that trip even when a record points there.
    assert.deepEqual(__storageDeleted().sort(), ['shared/a1/anna/*', 'shared/j1/owner/all/d1.jpg']);
  });
});

describe('the invite preview', () => {
  test('carries a face for the owner, never their account id', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    const seen = await preview('anna', { code });
    assert.match(seen.owner_avatar, /^[0-9a-f]{16}$/);
    assert.notEqual(seen.owner_avatar, 'owner');
    assert.equal(JSON.stringify(seen).includes('"owner"'), false);
  });
});

describe('the page', () => {
  test('shows the trip, the app link and nothing else', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    const html = sharePageHtml(code, __get('shared_journeys/j1') as any);
    assert.match(html, /Denis invites you along/);
    assert.match(html, /<h1>Vietnam<\/h1>/);
    assert.match(html, /Hanoi/);
    assert.match(html, /🇻🇳/);
    assert.match(html, new RegExp(`href="nomady://join/${code}"`));
    // The owner's face, drawn from the hashed seed and not from their account id.
    assert.match(html, /api\.dicebear\.com\/10\.x\/thumbs\/svg\?seed=[0-9a-f]{16}&animationVariant=medium&backgroundColor=4dc1ff/);
    assert.doesNotMatch(html, /owner_uid|owner/);
  });

  test('escapes what the owner typed', async () => {
    __seed('users/owner/journeys/j2', { title: '<script>alert(1)</script>', legs: [], travellers: [], deleted: false });
    const { code } = await share('owner', { journeyId: 'j2' });
    const html = sharePageHtml(code, __get('shared_journeys/j2') as any);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
  });
});

describe('who a journey id belongs to', () => {
  test('an ex-member cannot take over a trip id after it was unshared', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code });
    await unshare('owner', { journeyId: 'j1' });
    // Anna knows the id and makes a journey of her own under it.
    __seed('users/anna/journeys/j1', { title: 'Mine now', legs: [], travellers: [], deleted: false });
    await rejects(share('anna', { journeyId: 'j1' }), 'permission-denied');
    // The owner can share it again.
    await share('owner', { journeyId: 'j1' });
    assert.equal(__get('shared_journeys/j1')!.owner_uid, 'owner');
  });


  test('a deleted account gives up its claims', async () => {
    await share('owner', { journeyId: 'j1' });
    assert.ok(__get('shared_owners/j1'));
    await forgetUser('owner');
    assert.equal(__get('shared_owners/j1'), undefined);
  });
});

describe('files of shared documents', () => {
  test('a deleted record or a new path frees the old file, nothing else does', () => {
    const rec = { path: 'shared/j1/owner/all/d1.jpg', title: 'Passport' };
    assert.equal(staleFile(rec, undefined, 'j1'), 'shared/j1/owner/all/d1.jpg');
    assert.equal(staleFile(rec, { ...rec, path: 'shared/j1/owner/u/anna/d1.jpg' }, 'j1'), 'shared/j1/owner/all/d1.jpg');
    assert.equal(staleFile(rec, { ...rec, title: 'Renamed' }, 'j1'), null);
    assert.equal(staleFile(undefined, rec, 'j1'), null);
  });
  test('only files of that trip, whatever a record claims', () => {
    assert.equal(isTripFile('shared/j1/owner/all/d1.jpg', 'j1'), true);
    assert.equal(isTripFile('shared/j2/owner/all/d1.jpg', 'j1'), false);
    assert.equal(isTripFile('shared/j1/../j2/owner/all/d1.jpg', 'j1'), false);
    assert.equal(isTripFile(42, 'j1'), false);
  });
});

describe('chosen faces', () => {
  test('the owner\'s and a member\'s picked avatars travel with the trip', async () => {
    __seed('users/owner', { displayName: 'Denis', avatar: 'ownerface1' });
    __seed('users/anna', { displayName: 'Anna', avatar: 'annaface2' });
    const { code } = await share('owner', { journeyId: 'j1' });
    assert.equal((await preview('bob', { code })).owner_avatar, 'ownerface1');
    await join('anna', { code });
    assert.equal((__get('shared_journeys/j1')!.members as any).anna.avatar, 'annaface2');
  });
  test('without a pick, the default face is drawn from the id, never the id itself', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    const seen = await preview('bob', { code });
    assert.match(seen.owner_avatar, /^[0-9a-f]{16}$/);
  });
  test('a new face and name reach the trips someone is on, and the ones they share', async () => {
    __seed('users/anna', { displayName: 'Anna', avatar: 'annaface2' });
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code });
    const shared = __get('shared_journeys/j1')!;
    __seed('shared_journeys/j1', { ...shared, travellers: [{ sync_id: 't1', name: 'Anna', uid: 'anna', avatar: 'annaface2' }, { sync_id: 't0', name: 'You', uid: 'owner' }] });

    await spreadProfile('anna', { displayName: 'Anna', avatar: 'annaface2' }, { displayName: 'Anna B', avatar: 'annaface3' });
    const after = __get('shared_journeys/j1')! as any;
    assert.equal(after.members.anna.avatar, 'annaface3');
    assert.equal(after.members.anna.name, 'Anna B');
    assert.deepEqual(after.travellers[0], { sync_id: 't1', name: 'Anna B', uid: 'anna', avatar: 'annaface3' });
    assert.deepEqual(after.travellers[1], { sync_id: 't0', name: 'You', uid: 'owner' });

    await spreadProfile('owner', { displayName: 'Denis' }, { displayName: 'Denis', avatar: 'ownerface9' });
    assert.equal((await preview('bob', { code })).owner_avatar, 'ownerface9');
    assert.equal(__get('shared_journeys/j1')!.owner_name, 'Denis');
  });
  test('an unrelated profile change leaves the trips alone, including the name given on joining', async () => {
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code, name: 'Annie' });
    await spreadProfile('anna', { displayName: 'Anna', citizenship: 'DE' }, { displayName: 'Anna', citizenship: 'FR' });
    assert.equal((__get('shared_journeys/j1')!.members as any).anna.name, 'Annie');
  });
  test('an avatar value that is not a plain seed is ignored', async () => {
    __seed('users/owner', { displayName: 'Denis', avatar: 'x"><script>' });
    const { code } = await share('owner', { journeyId: 'j1' });
    assert.match((await preview('bob', { code })).owner_avatar, /^[0-9a-f]{16}$/);
  });
});

describe('friends who plan along', () => {
  const later = (iso: string) => ({ updatedAt: iso });
  const moved = [{ ...LEGS[0] }, { ...LEGS[1], city: 'Hoi An', sync_id: 's2' }, { ...LEGS[1], sync_id: 's3', start_date: '2026-11-08', end_date: '2026-11-10', city: 'Da Nang' }];

  async function sharedWithAnna() {
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code });
    return code;
  }

  test('a member follows by default and cannot change the trip', async () => {
    await sharedWithAnna();
    assert.equal((__get('shared_journeys/j1')!.members as any).anna.can_edit, undefined);
    await rejects(updateShared('anna', { journeyId: 'j1', title: 'X', legs: moved, ...later('2026-09-02T10:00:00Z') }), 'permission-denied');
  });

  test('only the owner grants and takes back the right, and only to members', async () => {
    await sharedWithAnna();
    await rejects(setMemberCanEdit('anna', { journeyId: 'j1', memberUid: 'anna', canEdit: true }), 'permission-denied');
    await rejects(setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'bob', canEdit: true }), 'not-found');
    await rejects(setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: 'yes' }), 'invalid-argument');
    await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
    assert.equal((__get('shared_journeys/j1')!.members as any).anna.can_edit, true);
    await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: false });
    assert.equal((__get('shared_journeys/j1')!.members as any).anna.can_edit, undefined);
  });

  test('opening the invite again keeps the right', async () => {
    const code = await sharedWithAnna();
    await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
    await join('anna', { code, name: 'Annie' });
    const anna = (__get('shared_journeys/j1')!.members as any).anna;
    assert.equal(anna.can_edit, true);
    assert.equal(anna.name, 'Annie');
  });

  test('a member with the right changes the stops in the owner\'s trip and in the mirror', async () => {
    await sharedWithAnna();
    await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
    const res = await updateShared('anna', { journeyId: 'j1', title: 'Vietnam 2026', legs: moved, ...later('2026-09-02T10:00:00Z') });
    assert.deepEqual(res, { ok: true, stale: false });
    const own = __get('users/owner/journeys/j1')! as any;
    assert.equal(own.title, 'Vietnam 2026');
    assert.deepEqual(own.legs.map((l: any) => l.city), ['Hanoi', 'Hoi An', 'Da Nang']);
    assert.ok(own.synced_at, 'the owner\'s pull must see the change');
    assert.equal(own.travellers.length, 1, 'travellers stay the owner\'s');
    const mirror = __get('shared_journeys/j1')! as any;
    assert.deepEqual(mirror.legs.map((l: any) => l.city), ['Hanoi', 'Hoi An', 'Da Nang']);
  });

  test('an older edit is refused as stale and changes nothing', async () => {
    await sharedWithAnna();
    await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
    const res = await updateShared('anna', { journeyId: 'j1', title: 'Old', legs: moved, ...later('2026-08-01T10:00:00Z') });
    assert.deepEqual(res, { ok: false, stale: true });
    assert.equal((__get('users/owner/journeys/j1')! as any).title, 'Vietnam');
  });

  test('stops are checked: no junk fields, no broken dates', async () => {
    await sharedWithAnna();
    await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
    await rejects(updateShared('anna', { journeyId: 'j1', legs: [{ sync_id: 'x', city: 'A', start_date: '2026-11-05', end_date: '2026-11-01' }], ...later('2026-09-02T10:00:00Z') }), 'invalid-argument');
    await rejects(updateShared('anna', { journeyId: 'j1', legs: 'nope', ...later('2026-09-02T10:00:00Z') }), 'invalid-argument');
    await updateShared('anna', { journeyId: 'j1', legs: [{ ...LEGS[0], owner_uid: 'anna', secret: 1 }], ...later('2026-09-02T10:00:00Z') });
    const leg = (__get('users/owner/journeys/j1')! as any).legs[0];
    assert.equal(leg.secret, undefined);
    assert.equal(leg.owner_uid, undefined);
  });

  test('a member who was removed loses the right with it', async () => {
    await sharedWithAnna();
    await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
    await removeMember('owner', { journeyId: 'j1', memberUid: 'anna' });
    await rejects(updateShared('anna', { journeyId: 'j1', legs: moved, ...later('2026-09-02T10:00:00Z') }), 'permission-denied');
  });

  test('a member with the right plans where to stay at a stop of the trip', async () => {
    await sharedWithAnna();
    const plan = { stop_id: 's1', status: 'options', check_in: '2026-11-01', check_out: '2026-11-04', options: [{ id: 'o1', name: 'Hanoi Loft' }], updated_at: '2026-09-02T10:00:00Z' };
    await rejects(updateSharedStay('anna', { journeyId: 'j1', plan }), 'permission-denied');
    await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
    await rejects(updateSharedStay('anna', { journeyId: 'j1', plan: { ...plan, stop_id: 'elsewhere' } }), 'not-found');
    assert.deepEqual(await updateSharedStay('anna', { journeyId: 'j1', plan }), { ok: true, stale: false });
    const own = __get('users/owner/accommodations/s1')! as any;
    assert.equal(own.journey_id, 'j1');
    assert.equal(own.options[0].name, 'Hanoi Loft');
    assert.ok(own.synced_at);
    assert.equal((__get('shared_journeys/j1')! as any).accommodations.s1.options[0].name, 'Hanoi Loft');
    assert.deepEqual(await updateSharedStay('anna', { journeyId: 'j1', plan: { ...plan, updated_at: '2026-09-01T10:00:00Z' } }), { ok: false, stale: true });
  });
});
