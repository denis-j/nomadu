import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { setJourneyShareCode, type Journey } from './database';
import { localChanged } from './syncTrigger';

/**
 * Inviting friends to a trip, the app's side of functions/src/share.ts.
 *
 * One person plans, the others come along: the owner makes a link, a friend
 * opens it, and from then on the trip is on the friend's phone too, live
 * and read-only. The heavy lifting (the code, the mirror, who is a member)
 * is the server's; here is only what the screens need.
 */

export const SHARE_BASE = 'https://us-central1-nomady-dcff6.cloudfunctions.net/sharePage';
const PENDING_INVITE_KEY = '@pending_invite';

/** What the sharing calls need of a trip: its local id, its cloud id, its name. */
export type ShareableJourney = Pick<Journey, 'id' | 'sync_id' | 'title'>;

export interface InvitePreview {
  journey_id: string;
  title: string;
  owner_name: string;
  start_date: string | null;
  end_date: string | null;
  stops: { city: string; country_code: string }[];
  members: number;
  is_owner: boolean;
  is_member: boolean;
}

const call = <I, O>(name: string) => httpsCallable<I, O>(functions, name);

/** The name friends see: the account's, or nothing, and the caller asks. */
export function myName(): string {
  return auth.currentUser?.displayName?.trim() ?? '';
}

/** Owner: get (or make) the invite link for a trip and remember its code. */
export async function shareJourney(journey: ShareableJourney): Promise<{ code: string; url: string }> {
  if (!journey.sync_id) throw new Error('This trip has not synced yet.');
  const res = await call<{ journeyId: string; name?: string }, { code: string; url: string }>('shareJourney')({
    journeyId: journey.sync_id,
    ...(myName() && { name: myName() }),
  });
  await setJourneyShareCode(journey.id, res.data.code);
  // The mirror the server made has the stops; the next push adds the plans.
  localChanged();
  return res.data;
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  return (await call<{ code: string }, InvitePreview>('previewInvite')({ code })).data;
}

export async function joinJourney(code: string, name: string): Promise<{ journey_id: string; title: string; owner_name: string }> {
  return (await call<{ code: string; name: string }, { journey_id: string; title: string; owner_name: string }>('joinJourney')({ code, name })).data;
}

/** Owner: a friend off the trip. The link stays valid; they can come back. */
export async function removeMember(journeySyncId: string, memberUid: string): Promise<void> {
  await call<{ journeyId: string; memberUid: string }, { ok: boolean }>('removeJourneyMember')({ journeyId: journeySyncId, memberUid });
}

export async function leaveJourney(journeySyncId: string): Promise<void> {
  await call<{ journeyId: string }, { ok: boolean }>('leaveJourney')({ journeyId: journeySyncId });
}

export async function unshareJourney(journey: ShareableJourney): Promise<void> {
  if (!journey.sync_id) return;
  await call<{ journeyId: string }, { ok: boolean }>('unshareJourney')({ journeyId: journey.sync_id });
  await setJourneyShareCode(journey.id, null);
}

/** The link, and only the link, in the system share sheet; the page it opens says the rest. */
export async function presentInvite(_journey: ShareableJourney, url: string): Promise<void> {
  await Share.share({ url });
}

/** An invite opened before signing in is kept until the tabs are up. */
export async function setPendingInvite(code: string | null): Promise<void> {
  if (code) await AsyncStorage.setItem(PENDING_INVITE_KEY, code);
  else await AsyncStorage.removeItem(PENDING_INVITE_KEY);
}

export async function consumePendingInvite(): Promise<string | null> {
  const code = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (code) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return code;
}
