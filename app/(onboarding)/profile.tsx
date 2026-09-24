import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { ENTER_DURATION, OPTION_BASE_DELAY, TITLE_DELAY } from '../../constants/onboardingAnimation';
import { CloudyButton } from '../../components/CloudyButton';
import { ProfileEditor } from '../../components/ProfileEditor';
import { useAuth } from '../../hooks/useAuth';
import { LOCAL_ONBOARDING_UID } from '../../lib/onboarding';
import { getProfile, randomAvatarSeed, setProfile } from '../../lib/profile';

/**
 * Onboarding step 1: a name and a face. A face is suggested straight away;
 * the name is needed, because it is what friends see on a shared trip and
 * what an invite says. Stored under the onboarding placeholder until there
 * is an account (see lib/profile.ts).
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid ?? LOCAL_ONBOARDING_UID;
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(randomAvatarSeed);

  // Coming back to this step shows what was picked before.
  useEffect(() => {
    getProfile(uid).then((p) => {
      if (p.name) setName(p.name);
      if (p.avatar) setAvatar(p.avatar);
    });
  }, [uid]);

  const canContinue = name.trim().length > 0;

  const next = async () => {
    if (!canContinue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setProfile(uid, { name, avatar });
    router.push('/(onboarding)/citizenship');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeIn.delay(TITLE_DELAY).duration(ENTER_DURATION)} style={styles.header}>
              <Text style={styles.title}>{"Who's traveling?"}</Text>
              <Text style={styles.subtitle}>
                {"Pick a face and tell us your name. It's how friends see you on a shared trip."}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(OPTION_BASE_DELAY).duration(ENTER_DURATION)}>
              <ProfileEditor name={name} onNameChange={setName} avatar={avatar} onAvatarChange={setAvatar} />
            </Animated.View>

            <Animated.View entering={FadeIn.delay(OPTION_BASE_DELAY + 120).duration(ENTER_DURATION)} style={styles.footer}>
              <CloudyButton
                onPress={next}
                disabled={!canContinue}
                style={[styles.cta, !canContinue && styles.ctaDisabled]}
                innerStyle={styles.ctaInner}
              >
                <Text style={styles.ctaText}>Continue</Text>
              </CloudyButton>
              <Text style={styles.footerText}>You can change both later in Settings.</Text>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', paddingVertical: 24 },
  header: { alignItems: 'center', marginBottom: 28, paddingHorizontal: 8 },
  title: { ...Typography.brandDisplay, marginBottom: 8, textAlign: 'center' },
  subtitle: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  footer: { marginTop: 28, gap: 14, alignItems: 'stretch' },
  cta: { width: '100%' },
  ctaDisabled: { opacity: 0.5 },
  ctaInner: { justifyContent: 'center' },
  ctaText: { ...Typography.titleSmall, fontWeight: '600', color: Colors.cloudyButtonText },
  footerText: { ...Typography.bodySmall, fontSize: 13, color: Colors.textTertiary, textAlign: 'center' },
});
