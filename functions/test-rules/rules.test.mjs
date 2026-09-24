import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, listAll, deleteObject } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Rules tests against the Firestore and Storage emulators, with the repo's own
// rules files. Run with `npm run test:rules` (needs Java for the emulators).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const env = await initializeTestEnvironment({
  projectId: 'demo-nomadu',
  firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8181 },
  storage: { rules: readFileSync(resolve(root, 'storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
});
let failed = 0;
const check = async (name, p, shouldPass) => {
  try { await (shouldPass ? assertSucceeds(p) : assertFails(p)); console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, String(e).slice(0, 160)); }
};
const J = 'shared_journeys/j1';
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, J), { owner_uid: 'owner', owner_name: 'O', member_uids: ['anna', 'bob'], members: {}, title: 'Trip', legs: [], travellers: [], updated_at: 1, deleted: false });
  await setDoc(doc(db, `${J}/documents/d1`), { title: 'Anna pass', uploader_uid: 'anna', traveller_uid: null, path: 'shared/j1/owner/all/d1.jpg' });
  await setDoc(doc(db, `${J}/documents/d9`), { title: 'Bob private', uploader_uid: 'owner', traveller_uid: 'bob', path: 'shared/j1/owner/u/bob/d9.pdf' });
  const st = ctx.storage();
  await uploadBytes(ref(st, 'shared/j1/owner/all/d1.jpg'), new Uint8Array([1, 2]), { contentType: 'image/jpeg' });
  await uploadBytes(ref(st, 'shared/j1/owner/u/bob/d9.pdf'), new Uint8Array([1]), { contentType: 'application/pdf' });
});
const as = (uid) => env.authenticatedContext(uid);
const fsOf = (uid) => as(uid).firestore();
const stOf = (uid) => as(uid).storage();

// ── Firestore: document records
await check('member creates record for everyone with the right path', setDoc(doc(fsOf('anna'), `${J}/documents/d2`), { title: 'T', uploader_uid: 'anna', traveller_uid: null, path: 'shared/j1/owner/all/d2.jpg' }), true);
await check('member creates record for self in own folder', setDoc(doc(fsOf('anna'), `${J}/documents/d3`), { title: 'T', uploader_uid: 'anna', traveller_uid: 'anna', path: 'shared/j1/owner/u/anna/d3.pdf' }), true);
await check('record pointing into another trip is refused', setDoc(doc(fsOf('anna'), `${J}/documents/d4`), { title: 'T', uploader_uid: 'anna', traveller_uid: null, path: 'shared/j2/owner/all/d4.jpg' }), false);
await check('record for everyone with a private folder path is refused', setDoc(doc(fsOf('anna'), `${J}/documents/d5`), { title: 'T', uploader_uid: 'anna', traveller_uid: null, path: 'shared/j1/owner/u/bob/d5.jpg' }), false);
await check('record with a path of another id is refused', setDoc(doc(fsOf('anna'), `${J}/documents/d6`), { title: 'T', uploader_uid: 'anna', traveller_uid: null, path: 'shared/j1/owner/all/d1.jpg' }), false);
await check('path with a slash in the extension is refused', setDoc(doc(fsOf('anna'), `${J}/documents/d7`), { title: 'T', uploader_uid: 'anna', traveller_uid: null, path: 'shared/j1/owner/all/d7.x/../y' }), false);
await check('member renames own record', updateDoc(doc(fsOf('anna'), `${J}/documents/d1`), { title: 'New' }), true);
await check('member cannot repoint own record elsewhere', updateDoc(doc(fsOf('anna'), `${J}/documents/d1`), { path: 'shared/j1/owner/all/other.jpg' }), false);
await check('member reads a record for everyone', getDoc(doc(fsOf('bob'), `${J}/documents/d1`)), true);
await check('member cannot read a record for someone else', getDoc(doc(fsOf('anna'), `${J}/documents/d9`)), false);
await check('stranger cannot read records', getDoc(doc(fsOf('eve'), `${J}/documents/d1`)), false);
await check('owner cannot hand the trip to another uid', updateDoc(doc(fsOf('owner'), J), { owner_uid: 'eve' }), false);
await check('owner updates the title', updateDoc(doc(fsOf('owner'), J), { title: 'Trip 2' }), true);
// Anna is removed from the trip.
await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), J), { member_uids: ['bob'] }); });
await check('removed member can no longer rewrite her record', updateDoc(doc(fsOf('anna'), `${J}/documents/d1`), { title: 'Gotcha' }), false);
await check('removed member can no longer delete her record', deleteDoc(doc(fsOf('anna'), `${J}/documents/d1`)), false);
await check('removed member can no longer read records', getDoc(doc(fsOf('anna'), `${J}/documents/d1`)), false);
await check('owner deletes any record', deleteDoc(doc(fsOf('owner'), `${J}/documents/d1`)), true);

// ── Storage (Anna has been removed above; Bob is still on the trip)
const jpg = { contentType: 'image/jpeg' };
await check('member fetches a file of the trip', getBytes(ref(stOf('bob'), 'shared/j1/owner/u/bob/d9.pdf')), true);
await check('stranger cannot fetch a file even with its full path', getBytes(ref(stOf('eve'), 'shared/j1/owner/all/d1.jpg')), false);
await check('removed member cannot fetch a file even with its full path', getBytes(ref(stOf('anna'), 'shared/j1/owner/all/d1.jpg')), false);
await check('stranger cannot upload under a made-up trip', uploadBytes(ref(stOf('eve'), 'shared/nope/eve/all/x.jpg'), new Uint8Array([1]), jpg), false);
await check('stranger cannot upload to a real trip', uploadBytes(ref(stOf('eve'), 'shared/j1/owner/all/x.jpg'), new Uint8Array([1]), jpg), false);
await check('path naming the wrong owner is refused', uploadBytes(ref(stOf('bob'), 'shared/j1/bob/all/x.jpg'), new Uint8Array([1]), jpg), false);
await check('nobody can list a trip folder', listAll(ref(stOf('bob'), 'shared/j1/owner/all')), false);
await check('member uploads a new image for everyone', uploadBytes(ref(stOf('bob'), 'shared/j1/owner/all/n1.jpg'), new Uint8Array([1]), jpg), true);
await check('uploading a non-document type is refused', uploadBytes(ref(stOf('bob'), 'shared/j1/owner/all/n2.html'), new Uint8Array([1]), { contentType: 'text/html' }), false);
await check('overwriting an existing file is refused', uploadBytes(ref(stOf('bob'), 'shared/j1/owner/all/n1.jpg'), new Uint8Array([9]), jpg), false);
await check('clients cannot delete files', deleteObject(ref(stOf('owner'), 'shared/j1/owner/all/n1.jpg')), false);
await check('private folder: the person themself uploads', uploadBytes(ref(stOf('bob'), 'shared/j1/owner/u/bob/n3.pdf'), new Uint8Array([1]), { contentType: 'application/pdf' }), true);
await check('private folder: someone else cannot upload', uploadBytes(ref(stOf('anna'), 'shared/j1/owner/u/bob/n4.pdf'), new Uint8Array([1]), { contentType: 'application/pdf' }), false);
await check('private folder: someone else cannot read', getBytes(ref(stOf('anna'), 'shared/j1/owner/u/bob/d9.pdf')), false);
await check('private folder: the owner can read', getBytes(ref(stOf('owner'), 'shared/j1/owner/u/bob/d9.pdf')), true);
await check('outside shared/: nothing', uploadBytes(ref(stOf('bob'), 'elsewhere/x.jpg'), new Uint8Array([1]), jpg), false);

await env.cleanup();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
