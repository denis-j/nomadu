import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Link } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoModel3D } from '../../components/LogoModel3D';
import { PRIVACY_URL, TERMS_URL, openLegal } from '../../constants/legal';
import Animated, { FadeIn } from 'react-native-reanimated';
import AnimatedGradientBackground from '../../components/animated-gradient-background';
import { CloudyButton } from '../../components/CloudyButton';
import { FormCard, FormField, FormSeparator } from '../../components/FormField';
import { KeyboardLift } from '../../components/KeyboardLift';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { googleSignInAvailable, useGoogleAuth } from '../../hooks/useGoogleAuth';
import { signUpWithEmail, signInWithApple } from '../../lib/auth';
import { showToast } from '../../lib/toast';
import { useTranslation } from '../../contexts/LanguageContext';

const LOGO_SIZE = 130;

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

// Same animated palette used on sign-in so both auth screens share the look.
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
  const { t } = useTranslation();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn: googleSignIn } = useGoogleAuth();

  const handleSignUp = async () => {
    if (!email || !password) {
      showToast(t('auth.enterBoth'), 'error');
      return;
    }
    if (password.length < 6) {
      showToast(t('auth.passwordMin'), 'error');
      return;
    }
    setLoading(true);
    try {
      await signUpWithEmail(email.trim(), password);
    } catch (e: any) {
      showToast(e.message ?? t('auth.somethingWrong'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithApple();
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') showToast(e.message ?? t('auth.appleFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await googleSignIn();
    } catch (e: any) {
      if (!e.message?.includes('cancelled')) showToast(e.message ?? t('auth.googleFailed'), 'error');
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
          <KeyboardLift style={styles.scrollContent}>
            {/* Title */}
            <Animated.View
              entering={FadeIn.duration(400)}
              style={styles.titleContainer}
            >
              {/* The logo in 3D: one quick turn on arrival, then it turns under a finger. */}
              <LogoModel3D size={LOGO_SIZE} motion="intro" style={styles.appIcon} />
              <Text style={styles.title}>{t('auth.createTitle')}</Text>
              <Text style={styles.subtitle}>{t('auth.createSubtitle')}</Text>
            </Animated.View>

            {/* Form */}
            <Animated.View
              entering={FadeIn.delay(100).duration(400)}
              style={styles.formContainer}
            >
              <FormCard>
                <FormField
                  ref={emailRef}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('auth.email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
                <FormSeparator />
                <FormField
                  ref={passwordRef}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t('auth.password')}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleSignUp}
                  trailing={
                    <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.textTertiary}
                    />
                  </TouchableOpacity>
                  }
                />
              </FormCard>

              <CloudyButton
                onPress={handleSignUp}
                disabled={loading}
                style={[styles.continueButton, loading && styles.continueButtonDisabled]}
                innerStyle={styles.continueInner}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <Text style={styles.continueButtonText}>{t('auth.createButton')}</Text>
                )}
              </CloudyButton>

              <View style={styles.signInRow}>
                <Text style={styles.signInText}>{t('auth.haveAccount')}</Text>
                <Link href="/(auth)/sign-in" asChild>
                  <TouchableOpacity hitSlop={6}>
                    <Text style={styles.signInLink}>{t('auth.signIn')}</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </Animated.View>

            {/* Social Sign In */}
            <Animated.View
              entering={FadeIn.delay(200).duration(400)}
              style={styles.socialContainer}
            >
              {/* Nothing to continue with on Android until Google is set up there. */}
              {(Platform.OS === 'ios' || googleSignInAvailable) && (
                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>{t('auth.orContinue')}</Text>
                  <View style={styles.orLine} />
                </View>
              )}

              <View style={styles.socialButtons}>
                {Platform.OS === 'ios' && (
                  <TouchableOpacity onPress={handleAppleSignIn} disabled={loading} activeOpacity={0.85}>
                    <Glass {...glassProps} style={[styles.socialButton, !hasGlass && styles.socialButtonFallback]}>
                      <Ionicons name="logo-apple" size={20} color={Colors.text} />
                      <Text style={styles.socialButtonText}>{t('auth.continueApple')}</Text>
                    </Glass>
                  </TouchableOpacity>
                )}

                {googleSignInAvailable && (
                  <TouchableOpacity onPress={handleGoogleSignIn} disabled={loading} activeOpacity={0.85}>
                    <Glass {...glassProps} style={[styles.socialButton, !hasGlass && styles.socialButtonFallback]}>
                      <Ionicons name="logo-google" size={20} color="#EA4335" />
                      <Text style={styles.socialButtonText}>{t('auth.continueGoogle')}</Text>
                    </Glass>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.legal}>
                {t('auth.legalPrefix')}
                <Text style={styles.legalLink} onPress={() => openLegal(TERMS_URL)} accessibilityRole="link">{t('auth.terms')}</Text>
                {t('auth.legalAnd')}
                <Text style={styles.legalLink} onPress={() => openLegal(PRIVACY_URL)} accessibilityRole="link">{t('auth.privacy')}</Text>.
              </Text>
            </Animated.View>
          </KeyboardLift>
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
  // Bigger than the 80pt picture it replaces, with the extra taken out of
  // the margins, so the rest of the screen stays where it was.
  appIcon: {
    marginTop: -(LOGO_SIZE - 80) / 2,
    marginBottom: 30 - (LOGO_SIZE - 80) / 2,
  },
  title: {
    ...Typography.brandDisplay,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
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
  inputRowIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputFlex: {
    flex: 1,
  },
  input: {
    ...Typography.titleSmall,
    fontWeight: '400',
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
    ...Typography.buttonLarge,
    textAlign: 'center',
  },
  legal: {
    ...Typography.bodySmall,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
  },
  legalLink: {
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  signInText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  signInLink: {
    ...Typography.bodySmall,
    fontWeight: '700',
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
    ...Typography.bodySmall,
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
    ...Typography.titleSmall,
    marginLeft: 12,
  },
});
