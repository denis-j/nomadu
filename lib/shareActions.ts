import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { forgetFollowedJourney } from './database';
import { leaveJourney, presentInvite, shareJourney, unshareJourney, type ShareableJourney } from './sharing';
import { showToast } from './toast';

/**
 * The three things the trip menus do about friends, with their dialogs.
 * Used from the trip list and from the trip itself, so the words are the
 * same in both places.
 */

/** Make (or reuse) the invite link and hand it to the share sheet. */
export async function inviteFriends(journey: ShareableJourney): Promise<void> {
  try {
    const { url } = await shareJourney(journey);
    await presentInvite(journey, url);
  } catch (err: any) {
    showToast(err?.message ?? 'Could not make an invite link', 'error');
  }
}

/** Owner: the trip is private again; the friends' copies disappear. */
export function stopSharing(journey: ShareableJourney): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert('Stop sharing?', 'The trip disappears from your friends’ phones. The invite link stops working.', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
      {
        text: 'Stop sharing',
        style: 'destructive',
        onPress: async () => {
          try {
            await unshareJourney(journey);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast('No longer shared');
          } catch (err: any) {
            showToast(err?.message ?? 'Could not stop sharing', 'error');
          }
          resolve();
        },
      },
    ]);
  });
}

/** Member: off the trip, on this phone and for the owner. */
export function leaveTrip(journey: ShareableJourney): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(`Leave ${journey.title}?`, 'It disappears from your phone. You can come back with the invite link.', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            if (journey.sync_id) {
              await leaveJourney(journey.sync_id);
              await forgetFollowedJourney(journey.sync_id);
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast('You left the trip');
          } catch (err: any) {
            showToast(err?.message ?? 'Could not leave', 'error');
          }
          resolve();
        },
      },
    ]);
  });
}
