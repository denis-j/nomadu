import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  StayChoice,
  StayPicker,
  describeStay,
  stayEquals,
  visaFormStyles,
} from '../../../../components/visaForm';
import { useAuth } from '../../../../hooks/useAuth';
import { getCitizenship } from '../../../../lib/onboarding';
import { getRuleForCitizen } from '../../../../constants/visaRules';
import { Colors } from '../../../../constants/colors';
import { Typography } from '../../../../constants/typography';
import { useTranslation } from '../../../../contexts/LanguageContext';
import { HeaderAction } from '../../../../components/HeaderAction';

/**
 * Step 2 of 3: how long the visa lets you stay.
 *
 * The one question that decides whether the tracker's numbers mean anything.
 * Its first answer is the rule the app already knows for this passport in this
 * country, so for a visa-free or visa-on-arrival stay the whole screen is
 * "yes, that one".
 */
export default function AddVisaStayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ code: string; name: string }>();

  const [citizenship, setCitizenship] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    getCitizenship(user.uid).then((c) => setCitizenship(c?.countryCode ?? null));
  }, [user]);

  /** What the app's own rule engine says about this passport in this country. */
  const suggestion = useMemo(() => {
    if (!citizenship) return null;
    const rule = getRuleForCitizen(citizenship, params.code);
    if (!rule || rule.allowedDays <= 0) return null;
    const choice: StayChoice = rule.ruleType === 'rolling_window'
      ? { kind: 'rolling', days: rule.allowedDays, window: rule.windowDays }
      : { kind: 'per_stay', days: rule.allowedDays };
    // The rule's own label starts with the day count, which the sentence above
    // already says. What it adds is how you get in, so name only that.
    const note = rule.ruleType === 'visa_on_arrival'
      ? t('visaForm.visaOnArrival')
      : rule.ruleType === 'rolling_window'
        ? t('visaForm.standardShortStay')
        : t('visaForm.visaFree');
    // Carried to the last step as the default name. Taking the suggestion and
    // ending up with a card that just says "Visa" throws away the one thing
    // the app knew: how you actually get in.
    const name = rule.ruleType === 'visa_on_arrival'
      ? t('visaForm.visaOnArrival')
      : rule.ruleType === 'rolling_window'
        ? t('visaForm.shortStay')
        : t('visaForm.visaExemption');
    return { choice, note, name };
  }, [citizenship, params.code, t]);

  // Nothing is selected until either the rule engine suggests something or the
  // user picks. A made-up default would sit here with a checkmark next to it,
  // looking exactly like a statement about their visa.
  const [choice, setChoice] = useState<StayChoice | null>(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (suggestion && !touched) setChoice(suggestion.choice);
  }, [suggestion, touched]);

  const goNext = () => {
    if (!choice) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    router.push({
      pathname: '/(tabs)/(stats)/visa-new/when',
      params: {
        code: params.code,
        name: params.name,
        kind: choice.kind,
        days: choice.kind === 'none' ? '' : String(choice.days),
        window: choice.kind === 'rolling' ? String(choice.window) : '',
        // Only when they kept the suggestion: naming their own visa after the
        // rule they picked off a list would be putting words in their mouth.
        suggestedName: suggestion && stayEquals(choice, suggestion.choice) ? suggestion.name : '',
      },
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: t('nav.howLongStay'), headerRight: () => <HeaderAction onPress={goNext} label={t('common.continue')} next dim={!choice} /> }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={visaFormStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <StayPicker
          suggestion={suggestion}
          countryName={params.name}
          value={choice}
          onChange={(c) => {
            setTouched(true);
            setChoice(c);
          }}
        />

        <Text style={styles.echo}>
            {choice ? describeStay(choice, t) : t('visaForm.pickHowLong')}
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  echo: { ...Typography.bodySmall, color: Colors.textSecondary, textAlign: 'center' },
});
