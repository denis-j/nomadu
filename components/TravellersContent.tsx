import { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Avatar, avatarPeople, type AvatarPerson } from './TravellerAvatars';
import { useTranslation } from '../contexts/LanguageContext';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useJourneyDocuments } from '../hooks/useJourneyDocuments';
import { deleteJourneyTraveller, getJourneyWithLegs, renameJourneyTraveller, type Journey, type JourneyTraveller } from '../lib/database';
import { SHARE_BASE, getMemberEditors, removeMember, setMemberCanEdit } from '../lib/sharing';
import { inviteFriends, leaveTrip, stopSharing } from '../lib/shareActions';
import { showToast } from '../lib/toast';


/**
 * Everyone on the trip, inside the title chip once it has unfolded (see
 * TripMorphChip in the trip screen). The faces in a row, then at most two
 * lines: invite and stop sharing for the owner, leave for a friend. Tapping
 * a face is where the owner renames or removes someone, and lets a friend
 * plan along or stops them; a small pencil marks who may.
 */
export function TravellersContent({ journeyId, onChanged, onClose }: { journeyId: number; onChanged: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { travellers, owner, uid, refresh } = useJourneyDocuments(journeyId, { ensureSelf: true });
  const [journey, setJourney] = useState<Journey | null>(null);
  // Who may plan along, as the shared trip says. Read live, not stored: the
  // owner changes it here, and it is only ever needed while this is open.
  const [editors, setEditors] = useState<Set<string>>(new Set());
  // Friends being removed: gone from the row at once, while the server
  // (which can take a few seconds to wake up) does the actual removal.
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const syncId = journey?.sync_id ?? null;
  const sharedTrip = !!journey?.share_code || !!journey?.shared_owner_uid;

  const loadEditors = useCallback(async () => {
    if (!syncId || !sharedTrip) return;
    try {
      setEditors(await getMemberEditors(syncId));
    } catch {
      // Offline: no pencils, nothing else depends on it.
    }
  }, [syncId, sharedTrip]);

  const reload = useCallback(async () => {
    setJourney(await getJourneyWithLegs(journeyId));
    await refresh();
    await loadEditors();
    onChanged();
  }, [journeyId, refresh, onChanged, loadEditors]);

  useEffect(() => {
    getJourneyWithLegs(journeyId).then(setJourney);
  }, [journeyId]);

  useEffect(() => {
    loadEditors();
  }, [loadEditors]);

  const isOwner = !owner;
  const people = avatarPeople(travellers, uid, owner).filter((p) => !removing.has(p.key));
  const byKey = new Map(travellers.map((t) => [String(t.id), t]));
  const shared = !!journey?.share_code;
  const url = journey?.share_code ? `${SHARE_BASE}/${journey.share_code}` : null;

  const copy = async (value: string, what: string) => {
    if (requireOptionalNativeModule('ExpoClipboard')) {
      const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
      await Clipboard.setStringAsync(value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(t('comp.copied', { what }));
    } else {
      await Share.share({ message: value });
    }
  };

  const rename = (trav: JourneyTraveller) => {
    Alert.prompt(t('comp.rename'), undefined, async (name) => {
      const next = (name ?? '').trim();
      if (!next || next === trav.name) return;
      await renameJourneyTraveller(trav.id, next);
      reload();
    }, 'plain-text', trav.name === 'You' ? '' : trav.name);
  };

  const remove = (trav: JourneyTraveller, p: AvatarPerson) => {
    const isMember = !!trav.uid && trav.uid !== uid;
    Alert.alert(
      t('comp.removeNamedTitle', { name: p.label }),
      isMember ? t('comp.removeMemberBody') : t('comp.theirDocsStay'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            const hide = (on: boolean) => setRemoving((prev) => {
              const next = new Set(prev);
              if (on) next.add(p.key);
              else next.delete(p.key);
              return next;
            });
            hide(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast(t('comp.removedToast', { name: p.label }));
            try {
              if (isMember && journey?.sync_id) {
                await removeMember(journey.sync_id, trav.uid!);
                // Off the list here too, without waiting for the mirror's snapshot.
                await deleteJourneyTraveller(trav.id);
              } else {
                await deleteJourneyTraveller(trav.id);
              }
            } catch (err: any) {
              showToast(err?.message ?? t('comp.couldNotRemoveNamed', { name: p.label }), 'error');
            }
            await reload();
            hide(false);
          },
        },
      ],
    );
  };

  const toggleEditing = async (trav: JourneyTraveller, p: AvatarPerson, canEdit: boolean) => {
    if (!syncId || !trav.uid) return;
    try {
      await setMemberCanEdit(syncId, trav.uid, canEdit);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(canEdit ? t('comp.canPlanNow', { name: p.label }) : t('comp.canViewNow', { name: p.label }));
    } catch (err: any) {
      showToast(err?.message ?? t('comp.couldNotChange'), 'error');
    }
    reload();
  };

  const personMenu = (p: AvatarPerson) => {
    const trav = byKey.get(p.key);
    if (!trav || !isOwner) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const self = trav.uid === uid || (!trav.uid && trav.name === 'You');
    // Only a friend who joined through the app can be let in; a name typed
    // here has no phone to plan from.
    const member = !self && !!trav.uid && shared;
    const editing = member && editors.has(trav.uid!);
    const options = [
      t('comp.rename'),
      ...(member ? [editing ? t('comp.stopEditing') : t('comp.allowEditing')] : []),
      ...(self ? [] : [t('comp.removeFromTrip')]),
      t('common.cancel'),
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: p.label,
        message: member ? (editing ? t('comp.canAddChange') : t('comp.canView')) : undefined,
        options,
        destructiveButtonIndex: self ? undefined : options.length - 2,
        cancelButtonIndex: options.length - 1,
      },
      (i) => {
        const choice = options[i];
        if (choice === t('comp.rename')) rename(byKey.get(p.key)!);
        else if (choice === t('comp.allowEditing')) toggleEditing(byKey.get(p.key)!, p, true);
        else if (choice === t('comp.stopEditing')) toggleEditing(byKey.get(p.key)!, p, false);
        else if (choice === t('comp.removeFromTrip')) remove(byKey.get(p.key)!, p);
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
            <View>
              <Avatar person={p} size={44} animated />
              {byKey.get(p.key)?.uid && editors.has(byKey.get(p.key)!.uid!) ? (
                <View style={styles.editBadge} accessibilityLabel={t('comp.canEdit')}>
                  <Ionicons name="pencil" size={10} color="#fff" />
                </View>
              ) : null}
            </View>
            {/* First name only under a face; the full name is in the menu title. */}
            <Text style={styles.name} numberOfLines={1}>{p.label.split(/\s+/)[0]}</Text>
          </Pressable>
        ))}
        {isOwner && (
          <Pressable onPress={invite} style={({ pressed }) => [styles.person, pressed && { opacity: 0.6 }]} accessibilityLabel={t('comp.inviteFriends')}>
            <View style={styles.addDisc}>
              <Ionicons name="add" size={20} color={Colors.textSecondary} />
            </View>
            <Text style={[styles.name, styles.nameMuted]}>{t('comp.invite')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.separator} />

      {isOwner ? (
        <>
          <Row icon="paper-plane-outline" title={shared ? t('comp.shareInviteLink') : t('comp.inviteFriends')} onPress={invite} last={!shared} />
          {shared && journey?.share_code ? (
            <>
              <Pressable onPress={() => copy(url!, 'Link')} onLongPress={() => copy(journey.share_code!, 'Code')} style={({ pressed }) => [styles.codeRow, pressed && { opacity: 0.6 }]}>
                <Text style={styles.codeLabel}>{t('comp.code')}</Text>
                <Text style={styles.code} selectable>{journey.share_code}</Text>
                <Ionicons name="copy-outline" size={15} color={Colors.textTertiary} />
              </Pressable>
              <Row icon="close-circle-outline" title={t('plans.stopSharing')} destructive last onPress={() => stopSharing(journey).then(reload)} />
            </>
          ) : null}
        </>
      ) : (
        <Row icon="exit-outline" title={t('plans.leaveTrip')} destructive last onPress={() => journey && leaveTrip(journey).then(async () => { onChanged(); onClose(); })} />
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
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.text,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
