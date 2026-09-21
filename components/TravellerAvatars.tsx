import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useAvatar } from '../lib/avatars';
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
  /** What the face is drawn from: the account, or the traveller row's id. */
  seed: string | null;
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
    return { key: String(t.id), label, account: !!t.uid || owner, owner, seed: t.uid ?? t.sync_id };
  });
  return people.sort((a, b) => Number(b.owner) - Number(a.owner));
}

export function Avatar({
  person,
  size = 40,
  style,
}: {
  person: Pick<AvatarPerson, 'label' | 'account' | 'owner' | 'seed'>;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const fontSize = Math.round(size * 0.36);
  const face = useAvatar(person.seed);
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
        <Image source={{ uri: face }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <Text style={[styles.initials, { fontSize }, !person.account && styles.initialsMuted]}>{initialsOf(person.label)}</Text>
      )}
    </Glass>
  );
}

/** Up to `max` discs overlapping, then "+N". */
export function AvatarStack({ people, size = 36, max = 4 }: { people: AvatarPerson[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <View style={styles.stack}>
      {shown.map((p, i) => (
        <Avatar key={p.key} person={p} size={size} style={i > 0 ? { marginLeft: -size * 0.3 } : undefined} />
      ))}
      {rest > 0 && (
        <View style={[styles.more, { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.3 }]}>
          <Text style={styles.moreText}>+{rest}</Text>
        </View>
      )}
    </View>
  );
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
