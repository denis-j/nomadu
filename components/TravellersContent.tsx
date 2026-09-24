import { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Avatar, avatarPeople, type AvatarPerson } from './TravellerAvatars';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useJourneyDocuments } from '../hooks/useJourneyDocuments';
import { deleteJourneyTraveller, getJourneyWithLegs, renameJourneyTraveller, type Journey, type JourneyTraveller } from '../lib/database';
import { SHARE_BASE, removeMember } from '../lib/sharing';
import { inviteFriends, leaveTrip, stopSharing } from '../lib/shareActions';
import { showToast } from '../lib/toast';


/**
 * Everyone on the trip, inside the title chip once it has unfolded (see
 * TripMorphChip in the trip screen). The faces in a row, then at most two
 * lines: invite and stop sharing for the owner, leave for a friend. Tapping
 * a face is where the owner renames or removes someone.
 */
export function TravellersContent({ journeyId, onChanged, onClose }: { journeyId: number; onChanged: () => void; onClose: () => void }) {
  const { travellers, owner, uid, refresh } = useJourneyDocuments(journeyId, { ensureSelf: true });
  const [journey, setJourney] = useState<Journey | null>(null);

  const reload = useCallback(async () => {
    setJourney(await getJourneyWithLegs(journeyId));
    await refresh();
    onChanged();
  }, [journeyId, refresh, onChanged]);

  useEffect(() => {
    getJourneyWithLegs(journeyId).then(setJourney);
  }, [journeyId]);

  const isOwner = !owner;
  const people = avatarPeople(travellers, uid, owner);
  const byKey = new Map(travellers.map((t) => [String(t.id), t]));
  const shared = !!journey?.share_code;
  const url = journey?.share_code ? `${SHARE_BASE}/${journey.share_code}` : null;

  const copy = async (value: string, what: string) => {
    if (requireOptionalNativeModule('ExpoClipboard')) {
      const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
      await Clipboard.setStringAsync(value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`${what} copied`);
    } else {
      await Share.share({ message: value });
    }
  };

  const rename = (t: JourneyTraveller) => {
    Alert.prompt('Rename', undefined, async (name) => {
      const next = (name ?? '').trim();
      if (!next || next === t.name) return;
      await renameJourneyTraveller(t.id, next);
      reload();
    }, 'plain-text', t.name === 'You' ? '' : t.name);
  };

  const remove = (t: JourneyTraveller, p: AvatarPerson) => {
    const isMember = !!t.uid && t.uid !== uid;
    Alert.alert(
      `Remove ${p.label}?`,
      isMember ? 'The trip disappears from their phone. The invite link keeps working, so they can come back.' : 'Their documents stay, just without a name on them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isMember && journey?.sync_id) await removeMember(journey.sync_id, t.uid!);
              else await deleteJourneyTraveller(t.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast(`${p.label} removed`);
            } catch (err: any) {
              showToast(err?.message ?? 'Could not remove', 'error');
            }
            reload();
          },
        },
      ],
    );
  };

  const personMenu = (p: AvatarPerson) => {
    const t = byKey.get(p.key);
    if (!t || !isOwner) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const self = t.uid === uid || (!t.uid && t.name === 'You');
    const options = self ? ['Rename', 'Cancel'] : ['Rename', 'Remove from trip', 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: p.label, options, destructiveButtonIndex: self ? undefined : 1, cancelButtonIndex: options.length - 1 },
      (i) => {
        if (i === 0) rename(t);
        else if (!self && i === 1) remove(t, p);
      },
    );
  };

  const invite = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (journey) inviteFriends(journey).then(reload);
  };

  return (
    <View style={styles.content}>
      <View style={styles.faces}>
        {people.map((p) => (
          <Pressable key={p.key} onPress={() => personMenu(p)} disabled={!isOwner} style={({ pressed }) => [styles.person, pressed && { opacity: 0.6 }]}>
            <Avatar person={p} size={44} />
            {/* First name only under a face; the full name is in the menu title. */}
            <Text style={styles.name} numberOfLines={1}>{p.label.split(/\s+/)[0]}</Text>
          </Pressable>
        ))}
        {isOwner && (
          <Pressable onPress={invite} style={({ pressed }) => [styles.person, pressed && { opacity: 0.6 }]} accessibilityLabel="Invite friends">
            <View style={styles.addDisc}>
              <Ionicons name="add" size={20} color={Colors.textSecondary} />
            </View>
            <Text style={[styles.name, styles.nameMuted]}>Invite</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.separator} />

      {isOwner ? (
        <>
          <Row icon="paper-plane-outline" title={shared ? 'Share the invite link' : 'Invite friends'} onPress={invite} last={!shared} />
          {shared && journey?.share_code ? (
            <>
              <Pressable onPress={() => copy(url!, 'Link')} onLongPress={() => copy(journey.share_code!, 'Code')} style={({ pressed }) => [styles.codeRow, pressed && { opacity: 0.6 }]}>
                <Text style={styles.codeLabel}>Code</Text>
                <Text style={styles.code} selectable>{journey.share_code}</Text>
                <Ionicons name="copy-outline" size={15} color={Colors.textTertiary} />
              </Pressable>
              <Row icon="close-circle-outline" title="Stop sharing" destructive last onPress={() => stopSharing(journey).then(reload)} />
            </>
          ) : null}
        </>
      ) : (
        <Row icon="exit-outline" title="Leave trip" destructive last onPress={() => journey && leaveTrip(journey).then(async () => { onChanged(); onClose(); })} />
      )}
    </View>
  );
}

function Row({ icon, title, onPress, destructive, last }: { icon: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void; destructive?: boolean; last?: boolean }) {
  return (
    <>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
        <Ionicons name={icon} size={18} color={destructive ? Colors.error : Colors.text} />
        <Text style={[styles.rowTitle, destructive && { color: Colors.error }]}>{title}</Text>
      </Pressable>
      {!last && <View style={styles.separator} />}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  faces: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, paddingBottom: 12 },
  person: { width: 64, alignItems: 'center', gap: 6 },
  name: { ...Typography.caption, fontWeight: '600', textAlign: 'center' },
  nameMuted: { color: Colors.textSecondary, fontWeight: '500' },
  addDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowTitle: { ...Typography.titleSmall, fontWeight: '500', flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0, 0, 0, 0.1)', marginHorizontal: -16 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingLeft: 30 },
  codeLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  code: { ...Typography.titleSmall, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: 1.5, flex: 1 },
});
