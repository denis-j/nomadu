import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Timestamp, __get, __reset, __seed } from './fakeFirestore';
import { forgetUser, join, leave, mirrorOf, newCode, preview, removeMember, share, sharePageHtml, unshare } from '../src/share';

const LEGS = [
  { sync_id: 's1', city: 'Hanoi', country: 'Vietnam', country_code: 'VN', start_date: '2026-11-01', end_date: '2026-11-04', transport: 'flight', notes: null, sort_order: 0 },
  { sync_id: 's2', city: 'Hue', country: 'Vietnam', country_code: 'VN', start_date: '2026-11-05', end_date: '2026-11-07', transport: 'train', notes: null, sort_order: 1 },
];

const rejects = async (work: Promise<unknown>, code: string) => {
  await assert.rejects(work, (err: any) => err.code === code, `expected ${code}`);
};

beforeEach(() => {
  __reset();
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
    await removeMember('owner', { journeyId: 'j1', memberUid: 'anna' });
    assert.deepEqual(__get('shared_journeys/j1')!.member_uids, ['bob']);
    assert.equal('anna' in (__get('shared_journeys/j1')!.members as any), false);
    // Removed, but the link still works: she can come back.
    await join('anna', { code });
    assert.deepEqual(__get('shared_journeys/j1')!.member_uids, ['bob', 'anna']);
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

    await forgetUser('anna');
    assert.equal(__get('shared_journeys/a1'), undefined);
    assert.equal(__get(`invites/${mine.code}`), undefined);
    assert.deepEqual(__get('shared_journeys/j1')!.member_uids, []);
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
