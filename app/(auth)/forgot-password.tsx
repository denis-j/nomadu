import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import AnimatedGradientBackground from '../../components/animated-gradient-background';
import { CloudyButton } from '../../components/CloudyButton';
import { FormCard, FormField } from '../../components/FormField';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { resetPassword } from '../../lib/auth';
import { showToast } from '../../lib/toast';
import { useTranslation } from '../../contexts/LanguageContext';

const hasGlass = isLiquidGlassAvailable();

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
  const { t } = useTranslation();
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email) {
      showToast(t('auth.enterEmail'), 'error');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (e: any) {
      showToast(e.message ?? t('auth.resetFailed'), 'error');
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
                accessibilityRole="button"
                accessibilityLabel={t('auth.back')}
                style={({ pressed }) => [styles.backInner, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="chevron-back" size={22} color={Colors.text} />
              </Pressable>
            </GlassView>
          ) : (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('auth.back')}
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
              source={require('../../assets/icons/app-icon.png')}
              style={styles.appIcon}
              resizeMode="contain"
            />
            <Text style={styles.title}>{t('auth.forgotTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.forgotSubtitle')}
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.formContainer}>
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
                returnKeyType="done"
                onSubmitEditing={handleReset}
                editable={!sent}
              />
            </FormCard>

            {sent && (
              <Text style={styles.successText}>
                {t('auth.resetSent')}
              </Text>
            )}

            {sent ? (
              <CloudyButton onPress={() => router.back()} style={styles.continueButton} innerStyle={styles.continueInner}>
                <Text style={styles.continueButtonText}>{t('auth.backToSignIn')}</Text>
              </CloudyButton>
            ) : (
              <CloudyButton
                onPress={handleReset}
                disabled={loading}
                style={[styles.continueButton, loading && styles.continueButtonDisabled]}
                innerStyle={styles.continueInner}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <Text style={styles.continueButtonText}>{t('auth.sendResetLink')}</Text>
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
    width: 80,
    height: 80,
    marginBottom: 30,
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
  successText: {
    ...Typography.bodySmall,
    color: Colors.success,
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
    ...Typography.buttonLarge,
    textAlign: 'center',
  },
});
