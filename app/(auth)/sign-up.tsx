import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import AnimatedGradientBackground from '../../components/animated-gradient-background';
import { Colors } from '../../constants/colors';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { signUpWithEmail, signInWithApple } from '../../lib/auth';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const gradientColorSets = [
  {
    colors: ['#fff4cc', '#ffe8a3', '#ffd97a'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  {
    colors: ['#fff9e6', '#fff0bf', '#ffe599'],
    start: { x: 1, y: 0 },
    end: { x: 0, y: 1 },
  },
];

export default function SignUpScreen() {
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <Animated.View
              entering={FadeIn.duration(400)}
              style={styles.titleContainer}
            >
              <Image
                source={require('../../assets/app-icon-dark.png')}
                style={styles.appIcon}
              />
              <Text style={styles.title}>Create your account</Text>
            </Animated.View>

            {/* Form */}
            <Animated.View
              entering={FadeIn.delay(100).duration(400)}
              style={styles.formContainer}
            >
              <Glass {...glassProps} style={[styles.inputContainer, !hasGlass && styles.inputFallback]}>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Glass>

              <Glass {...glassProps} style={[styles.inputContainer, !hasGlass && styles.inputFallback]}>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={Colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Glass>

              <Glass {...glassProps} style={[styles.inputContainer, !hasGlass && styles.inputFallback]}>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm Password"
                  placeholderTextColor={Colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Glass>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.continueButton, loading && styles.continueButtonDisabled]}
                onPress={handleSignUp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.continueButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>

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
                  <TouchableOpacity onPress={handleAppleSignIn} disabled={loading}>
                    <Glass {...glassProps} style={[styles.socialButton, !hasGlass && styles.socialButtonFallback]}>
                      <Ionicons name="logo-apple" size={20} color={Colors.text} />
                      <Text style={styles.socialButtonText}>Continue with Apple</Text>
                    </Glass>
                  </TouchableOpacity>
                )}

                <TouchableOpacity onPress={handleGoogleSignIn} disabled={loading}>
                  <Glass {...glassProps} style={[styles.socialButton, !hasGlass && styles.socialButtonFallback]}>
                    <Ionicons name="logo-google" size={20} color="#EA4335" />
                    <Text style={styles.socialButtonText}>Continue with Google</Text>
                  </Glass>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  appIcon: {
    width: 80,
    height: 80,
    marginBottom: 12,
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
  },
  formContainer: {
    marginBottom: 40,
  },
  inputContainer: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 16,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  inputFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
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
    backgroundColor: Colors.text,
    borderRadius: 16,
    paddingVertical: 18,
    marginTop: 20,
    borderCurve: 'continuous',
  },
  continueButtonDisabled: {
    opacity: 0.7,
  },
  continueButtonText: {
    color: '#FFF',
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
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500',
    marginTop: 24,
    opacity: 0.7,
  },
  socialContainer: {
    alignItems: 'center',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
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
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
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
