import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import AnimatedGradientBackground from '../../components/animated-gradient-background';
import { CloudyButton } from '../../components/CloudyButton';
import { Colors } from '../../constants/colors';
import { resetPassword } from '../../lib/auth';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

// CloudyButton palette: deep sky blue → light blue → icy → white
const gradientColorSets = [
  {
    colors: ['#4DC1FF', '#8AD3FF', '#DBF0FF'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  {
    colors: ['#8AD3FF', '#DBF0FF', '#FFFFFF'],
    start: { x: 1, y: 0 },
    end: { x: 0, y: 1 },
  },
];

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    setError(null);
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AnimatedGradientBackground colorSets={gradientColorSets} duration={4000} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.backWrap}>
          {hasGlass ? (
            <GlassView style={styles.backBtnGlass} isInteractive>
              <Pressable
                onPress={() => router.back()}
                hitSlop={12}
                style={({ pressed }) => [styles.backInner, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="chevron-back" size={22} color={Colors.text} />
              </Pressable>
            </GlassView>
          ) : (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => [styles.backBtnFallback, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </Pressable>
          )}
        </View>

        <View style={styles.scrollContent}>
          {/* Title */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.titleContainer}>
            <Image
              source={require('../../assets/icons/nomadu_cloud_text.png')}
              style={styles.appIcon}
              resizeMode="contain"
            />
            <Text style={styles.title}>Forgot password</Text>
            <Text style={styles.subtitle}>
              Enter your email and we&rsquo;ll send you a reset link
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.formContainer}>
            <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
              <Pressable onPress={() => emailRef.current?.focus()} style={styles.inputRow}>
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  onSubmitEditing={handleReset}
                  editable={!sent}
                />
              </Pressable>
            </Glass>

            {error && <Text style={styles.errorText}>{error}</Text>}
            {sent && (
              <Text style={styles.successText}>
                Reset email sent — check your inbox.
              </Text>
            )}

            {sent ? (
              <CloudyButton onPress={() => router.back()} style={styles.continueButton} innerStyle={styles.continueInner}>
                <Text style={styles.continueButtonText}>Back to sign in</Text>
              </CloudyButton>
            ) : (
              <CloudyButton
                onPress={handleReset}
                style={[styles.continueButton, loading && styles.continueButtonDisabled]}
                innerStyle={styles.continueInner}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <Text style={styles.continueButtonText}>Send reset link</Text>
                )}
              </CloudyButton>
            )}
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  backWrap: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginLeft: 20,
  },
  backBtnGlass: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  backInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 44,
  },
  appIcon: {
    width: 150,
    height: 32,
    marginBottom: 30,
  },
  title: {
    fontFamily: 'InstrumentSerif_400Regular_Italic',
    fontSize: 46,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  formContainer: {
    marginBottom: 48,
  },
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
  sectionFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderColor: Colors.border,
  },
  inputRow: {
    paddingVertical: 16,
  },
  input: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '400',
  },
  errorText: {
    fontSize: 13,
    color: '#E53E3E',
    marginTop: 8,
  },
  successText: {
    fontSize: 13,
    color: '#38A169',
    marginTop: 8,
  },
  continueButton: {
    marginTop: 16,
  },
  continueInner: {
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.7,
  },
  continueButtonText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});
