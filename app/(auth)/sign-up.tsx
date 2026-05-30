import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Link } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import AnimatedGradientBackground from '../../components/animated-gradient-background';
import { CloudyButton } from '../../components/CloudyButton';
import { Colors } from '../../constants/colors';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { signUpWithEmail, signInWithApple } from '../../lib/auth';

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

export default function SignUpScreen() {
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn: googleSignIn, ready: googleReady } = useGoogleAuth();

  const handleSignUp = async () => {
    setError(null);
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUpWithEmail(email.trim(), password);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithApple();
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') setError(e.message ?? 'Apple sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await googleSignIn();
    } catch (e: any) {
      if (!e.message?.includes('cancelled')) setError(e.message ?? 'Google sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AnimatedGradientBackground
        colorSets={gradientColorSets}
        duration={4000}
      />

      <SafeAreaView style={styles.safeArea}>
          <View style={styles.scrollContent}>
            {/* Title */}
            <Animated.View
              entering={FadeIn.duration(400)}
              style={styles.titleContainer}
            >
              <Image
                source={require('../../assets/icons/nomadu_cloud_text.png')}
                style={styles.appIcon}
                resizeMode="contain"
              />
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>Sign up to start your journey</Text>
            </Animated.View>

            {/* Form */}
            <Animated.View
              entering={FadeIn.delay(100).duration(400)}
              style={styles.formContainer}
            >
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
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </Pressable>
                <View style={styles.separator} />
                <Pressable onPress={() => passwordRef.current?.focus()} style={styles.inputRow}>
                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={Colors.textTertiary}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="next"
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  />
                </Pressable>
                <View style={styles.separator} />
                <Pressable onPress={() => confirmPasswordRef.current?.focus()} style={styles.inputRow}>
                  <TextInput
                    ref={confirmPasswordRef}
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm Password"
                    placeholderTextColor={Colors.textTertiary}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={handleSignUp}
                  />
                </Pressable>
              </Glass>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <CloudyButton
                onPress={handleSignUp}
                style={[styles.continueButton, loading && styles.continueButtonDisabled]}
                innerStyle={styles.continueInner}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <Text style={styles.continueButtonText}>Create account</Text>
                )}
              </CloudyButton>

              <View style={styles.footerLinks}>
                <Link href="/(auth)/sign-in" asChild>
                  <TouchableOpacity>
                    <Text style={styles.footerLink}>Already have an account? Sign in</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </Animated.View>

            {/* Social Sign In */}
            <Animated.View
              entering={FadeIn.delay(200).duration(400)}
              style={styles.socialContainer}
            >
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or continue with</Text>
                <View style={styles.orLine} />
              </View>

              <View style={styles.socialButtons}>
                {Platform.OS === 'ios' && (
                  <TouchableOpacity onPress={handleAppleSignIn} disabled={loading} activeOpacity={0.85}>
                    <Glass {...glassProps} style={[styles.socialButton, !hasGlass && styles.socialButtonFallback]}>
                      <Ionicons name="logo-apple" size={20} color={Colors.text} />
                      <Text style={styles.socialButtonText}>Continue with Apple</Text>
                    </Glass>
                  </TouchableOpacity>
                )}

                <TouchableOpacity onPress={handleGoogleSignIn} disabled={loading} activeOpacity={0.85}>
                  <Glass {...glassProps} style={[styles.socialButton, !hasGlass && styles.socialButtonFallback]}>
                    <Ionicons name="logo-google" size={20} color="#EA4335" />
                    <Text style={styles.socialButtonText}>Continue with Google</Text>
                  </Glass>
                </TouchableOpacity>
              </View>
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
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: -20,
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
  footerLinks: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  footerLink: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '400',
    marginTop: 20,
  },
  socialContainer: {
    alignItems: 'center',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  orLine: {
    height: 1,
    width: 40,
    backgroundColor: 'rgba(26, 26, 46, 0.2)',
  },
  orText: {
    color: Colors.text,
    fontSize: 14,
    opacity: 0.5,
  },
  socialButtons: {
    width: '100%',
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 16,
    paddingHorizontal: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  socialButtonFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 12,
  },
});
