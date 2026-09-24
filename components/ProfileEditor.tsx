import { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useAvatar } from '../lib/avatars';
import { AnimatedFace } from './AnimatedFace';
import { suggestedFaces } from '../lib/profile';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

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
            accessibilityLabel="Use this face"
            accessibilityState={{ selected: seed === avatar }}
            style={({ pressed }) => [styles.alt, seed === avatar && styles.altOn, pressed && { opacity: 0.7 }]}
          >
            <Face seed={seed} size={SMALL} />
          </Pressable>
        ))}
      </View>

      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={onNameChange}
          placeholder="Your name"
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={40}
          returnKeyType="done"
          autoFocus={autoFocus}
          accessibilityLabel="Your name"
        />
      </Glass>
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
  section: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 4,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  sectionFallback: { backgroundColor: 'rgba(255, 255, 255, 0.85)', borderColor: Colors.border },
  input: { ...Typography.titleSmall, fontWeight: '400', paddingVertical: 16 },
});
