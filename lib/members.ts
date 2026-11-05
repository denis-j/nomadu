/**
 * Friends on a shared trip, as travellers on the owner's journey.
 *
 * Both the server (joining, leaving, being removed) and the owner's phone
 * (lib/database.ts, syncJourneyMembers) put members into the traveller list.
 * They have to agree on the row: a member who got one id from the server
 * and another from the phone was swapped on every friend's phone, and the
 * documents assigned to them there lost their name. So the id is derived
 * from the trip and the account, the same everywhere. Plain code, no
 * imports: the Functions bundle it too.
 */

export interface MemberTraveller {
  sync_id: string;
  name: string;
  sort_order: number;
  uid?: string | null;
  avatar?: string | null;
}

/** The traveller id of a member, per trip (the local index on sync ids is global). */
export function memberTravellerId(journeyId: string, uid: string): string {
  return `member-${journeyId}-${uid}`;
}

/**
 * The traveller list with this member on it: their own row updated, or a
 * row typed in by hand under the same name taken over, or a new row at the
 * end. Returns the list unchanged (same array) when nothing differs.
 */
export function withMember<T extends MemberTraveller>(
  travellers: T[],
  journeyId: string,
  member: { uid: string; name: string; avatar?: string | null },
): T[] {
  const avatar = member.avatar ?? null;
  const own = travellers.findIndex((t) => t.uid === member.uid);
  if (own >= 0) {
    const t = travellers[own];
    if (t.name === member.name && (t.avatar ?? null) === avatar) return travellers;
    return travellers.map((x, i) => (i === own ? { ...x, name: member.name, avatar } : x));
  }
  const key = member.name.trim().toLowerCase();
  const byName = travellers.findIndex((t) => !t.uid && t.name.trim().toLowerCase() === key);
  if (byName >= 0) return travellers.map((x, i) => (i === byName ? { ...x, uid: member.uid, avatar } : x));
  const order = travellers.reduce((max, t) => Math.max(max, t.sort_order ?? 0), 0) + 1;
  return [...travellers, { sync_id: memberTravellerId(journeyId, member.uid), name: member.name, sort_order: order, uid: member.uid, avatar } as T];
}

/** The traveller list without this member. Same array when they were not on it. */
export function withoutMember<T extends MemberTraveller>(travellers: T[], uid: string): T[] {
  return travellers.some((t) => t.uid === uid) ? travellers.filter((t) => t.uid !== uid) : travellers;
}
