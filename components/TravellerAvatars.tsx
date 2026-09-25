import { useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useAvatar } from '../lib/avatars';
import { AnimatedFace } from './AnimatedFace';
import { avatarSeed } from '../lib/avatarSeed';
import { myAvatarSeed } from '../lib/profile';
import { travellerLabel, type JourneyTraveller } from '../lib/database';
import { myName } from '../lib/sharing';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * Who is on a trip, as faces: a glass disc per traveller with a cartoon
 * face drawn from their id (see lib/avatars.ts), or their initials until
 * the face is there. The owner wears a thin ring; a name someone typed in
 * for the documents gets grey initials. Same discs everywhere: stacked in
 * the trip's title chip, laid out with names in the travellers panel.
 */

/** "Denis Jurkovsek" is DJ, "Anna" is A, "You" is the account's own initials. */
export function initialsOf(label: string): string {
  const source = label === 'You' ? myName() || 'You' : label;
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export interface AvatarPerson {
  key: string;
  label: string;
  /** In the app, not just a name. */
  account: boolean;
  owner: boolean;
  /** What the face is drawn from: see lib/avatarSeed.ts. */
  seed: string | null;
}

/**
 * The faces for a row read straight from the trip list's query, which
 * carries its travellers as `[name, uid, sync_id, avatar]` rows rather than as
 * rows (see getAllJourneys). Same shape as `avatarPeople`, without a
 * second read per card.
 */
export function avatarPeopleFromJson(
  json: string | null | undefined,
  uid: string | null,
  journey: { shared_owner_uid: string | null; shared_owner_name: string | null } | null,
): AvatarPerson[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const travellers: JourneyTraveller[] = raw
    .filter((t): t is [string, string | null, string | null, string | null] => Array.isArray(t) && typeof t[0] === 'string')
    .map((t, i) => ({ id: i, journey_id: 0, name: t[0], sort_order: i, uid: t[1] ?? null, sync_id: t[2] ?? null, avatar: t[3] ?? null }));
  return avatarPeople(travellers, uid, journey);
}

/** The travellers of a journey as the avatar row wants them, owner first. */
export function avatarPeople(
  travellers: JourneyTraveller[],
  uid: string | null,
  journey: { shared_owner_uid: string | null; shared_owner_name: string | null } | null,
): AvatarPerson[] {
  const ownerUid = journey?.shared_owner_uid ?? uid;
  const people = travellers.map((t) => {
    const label = travellerLabel(t, uid, journey);
    // The owner's own row is "You" on their phone and carries no uid until
    // the wallet was opened once; treat a uid-less "You" as the owner too.
    const owner = journey?.shared_owner_uid
      ? t.uid === journey.shared_owner_uid || (!t.uid && t.name === 'You')
      : t.uid === ownerUid || (!t.uid && t.name === 'You');
    // Whose face: this account's own pick for its own row, the pick that
    // came with a friend's row, else the default drawn from the id.
    const isMe = !!uid && (t.uid === uid || (!journey?.shared_owner_uid && owner && !t.uid));
    const seed = (isMe ? myAvatarSeed(uid) : null) ?? t.avatar ?? avatarSeed(t.uid ?? t.sync_id);
    return { key: String(t.id), label, account: !!t.uid || owner, owner, seed };
  });
  return people.sort((a, b) => Number(b.owner) - Number(a.owner));
}

export function Avatar({
  person,
  size = 40,
  style,
  animated,
}: {
  person: Pick<AvatarPerson, 'label' | 'account' | 'owner' | 'seed'>;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Blink and sway (AnimatedFace), for a face shown on its own rather than in a stack. */
  animated?: boolean;
}) {
  const fontSize = Math.round(size * 0.36);
  const face = useAvatar(person.seed);
  // A face already there when the disc appears shows at once; only one that
  // arrives later fades in. A fade on every mount read as a flicker.
  const hadFace = useRef(!!face);
  return (
    <Glass
      {...glassProps}
      style={[
        styles.disc,
        { width: size, height: size, borderRadius: size / 2 },
        !hasGlass && styles.discFallback,
        person.owner && styles.discOwner,
        style,
      ]}
    >
      {face ? (
        <>
          <Image source={{ uri: face }} style={StyleSheet.absoluteFill} contentFit="cover" transition={hadFace.current ? 0 : 150} />
          {animated ? <AnimatedFace seed={person.seed} size={size} /> : null}
        </>
      ) : (
        <Text style={[styles.initials, { fontSize }, !person.account && styles.initialsMuted]}>{initialsOf(person.label)}</Text>
      )}
    </Glass>
  );
}

/** Up to `max` discs overlapping, then "+N". */
export function AvatarStack({ people, size = 36, max = 4, overlap = 0.3 }: { people: AvatarPerson[]; size?: number; max?: number; overlap?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <View style={styles.stack}>
      {shown.map((p, i) => (
        <Avatar key={p.key} person={p} size={size} style={i > 0 ? { marginLeft: -size * overlap } : undefined} />
      ))}
      {rest > 0 && (
        <View style={[styles.more, { width: size, height: size, borderRadius: size / 2, marginLeft: -size * overlap }]}>
          <Text style={styles.moreText}>+{rest}</Text>
        </View>
      )}
    </View>
  );
}

/** How wide a stack of `n` people comes out, for layouts that reserve room for it. */
export function avatarStackWidth(n: number, size: number, max: number, overlap = 0.3): number {
  const discs = Math.min(n, max) + (n > max ? 1 : 0);
  return discs > 0 ? size + (discs - 1) * size * (1 - overlap) : 0;
}

const styles = StyleSheet.create({
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  discFallback: {
    backgroundColor: Colors.surfaceSecondary,
  },
  discOwner: {
    borderColor: Colors.text,
  },
  initials: {
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  initialsMuted: {
    color: Colors.textTertiary,
    fontWeight: '600',
  },
  stack: { flexDirection: 'row', alignItems: 'center' },
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  moreText: { ...Typography.caption, fontWeight: '700', color: Colors.textSecondary },

});
