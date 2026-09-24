import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { CloudyButton } from '../../../components/CloudyButton';
import { ProfileEditor } from '../../../components/ProfileEditor';
import { useAuth } from '../../../hooks/useAuth';
import { getProfile, setProfile } from '../../../lib/profile';
import { avatarSeed } from '../../../lib/avatarSeed';
import { pushProfileToCloud } from '../../../lib/onboarding';
import { localChanged } from '../../../lib/syncTrigger';
import { showToast } from '../../../lib/toast';

/** Name and face after onboarding: the same editor, in a sheet. */
export default function ProfileSheet() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getProfile(user.uid).then((p) => {
      setName(p.name || user.displayName || '');
      // The face shown today, until another one is picked.
      setAvatar(p.avatar ?? avatarSeed(user.uid));
    });
  }, [user]);

  const save = async () => {
    if (!user || !avatar || !name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setProfile(user.uid, { name, avatar });
    // To the account now, and to shared trips with the next plans push.
    pushProfileToCloud(user.uid).catch(() => {});
    localChanged();
    showToast('Profile updated');
    router.back();
  };

  // Same shape as the other sheets here (agent-connect): a scroll view at the
  // root, title in the header. A flex:1 wrapper collapsed to nothing inside
  // the form sheet.
  return (
    <>
      <Stack.Screen options={{ title: 'Your profile' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {avatar ? <ProfileEditor name={name} onNameChange={setName} avatar={avatar} onAvatarChange={setAvatar} /> : null}
        <CloudyButton
          onPress={save}
          disabled={!name.trim()}
          style={[styles.cta, !name.trim() && styles.ctaDisabled]}
          innerStyle={styles.ctaInner}
        >
          <Text style={styles.ctaText}>Save</Text>
        </CloudyButton>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 24, paddingBottom: 40 },
  cta: { width: '100%' },
  ctaDisabled: { opacity: 0.5 },
  ctaInner: { justifyContent: 'center' },
  ctaText: { ...Typography.titleSmall, fontWeight: '600', color: Colors.cloudyButtonText },
});
