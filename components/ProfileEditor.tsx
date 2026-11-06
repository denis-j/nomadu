import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { useAvatar } from '../lib/avatars';
import { AnimatedFace } from './AnimatedFace';
import { FormCard, FormField } from './FormField';
import { suggestedFaces } from '../lib/profile';
import { useTranslation } from '../contexts/LanguageContext';

const BIG = 132;
const SMALL = 48;

/**
 * Name and face, as friends on a shared trip see them. A face is suggested;
 * the row below offers a few more to tap. Used in
 * onboarding and, unchanged, when editing the profile from Settings.
 */
export function ProfileEditor({
  name,
  onNameChange,
  avatar,
  onAvatarChange,
  autoFocus,
}: {
  name: string;
  onNameChange: (name: string) => void;
  avatar: string;
  onAvatarChange: (seed: string) => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  // Saved and fetched ahead (prefetchSuggestedFaces), so they show at once.
  const alternatives = useMemo(suggestedFaces, []);

  const pick = (seed: string) => {
    Haptics.selectionAsync();
    onAvatarChange(seed);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.faceRow}>
        <View style={styles.faceBox}>
          <View style={styles.bigShadow}>
            <Face seed={avatar} size={BIG} />
          </View>
        </View>
      </View>

      <View style={styles.alternatives}>
        {alternatives.map((seed) => (
          <Pressable
            key={seed}
            onPress={() => pick(seed)}
            accessibilityRole="button"
            accessibilityLabel={t('comp.useThisFace')}
            accessibilityState={{ selected: seed === avatar }}
            style={({ pressed }) => [styles.alt, seed === avatar && styles.altOn, pressed && { opacity: 0.7 }]}
          >
            <Face seed={seed} size={SMALL} />
          </Pressable>
        ))}
      </View>

      <FormCard>
        <FormField
          value={name}
          onChangeText={onNameChange}
          placeholder={t('comp.yourName')}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={40}
          returnKeyType="done"
          autoFocus={autoFocus}
        />
      </FormCard>
    </View>
  );
}

/** A face on a white disc, blinking and swaying; a soft white until the picture is there. */
function Face({ seed, size }: { seed: string; size: number }) {
  const uri = useAvatar(seed);
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} /> : null}
      <AnimatedFace seed={seed} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20, alignItems: 'stretch' },
  faceRow: { alignItems: 'center', justifyContent: 'center', height: BIG + 16 },
  bigShadow: {
    shadowColor: '#0B2541',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  disc: { backgroundColor: 'rgba(255,255,255,0.9)', overflow: 'hidden' },
  faceBox: { width: BIG, height: BIG },
  alternatives: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  alt: { borderRadius: SMALL / 2 + 3, padding: 2, borderWidth: 2, borderColor: 'transparent' },
  altOn: { borderColor: Colors.text },
});
