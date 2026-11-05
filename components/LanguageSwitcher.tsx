import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Dropdown } from './Dropdown';
import { Colors } from '../constants/colors';
import {
  LANGUAGE_LABELS,
  LANGUAGE_SHORT,
  SUPPORTED_LANGUAGES,
  type Language,
} from '../lib/i18n/translations';
import { useTranslation } from '../contexts/LanguageContext';

/**
 * Language picker backed by the native pull-down menu.
 *
 * - `pill`: a small, transparent control for overlaying on a screen (used
 *   top-right on the first onboarding screen).
 * - `inline`: a borderless control that shows the full language name, for
 *   sitting at the right edge of a settings row.
 */
export function LanguageSwitcher({
  variant = 'pill',
  style,
}: {
  variant?: 'pill' | 'inline';
  style?: StyleProp<ViewStyle>;
}) {
  const { language, setLanguage, t } = useTranslation();

  const options = SUPPORTED_LANGUAGES.map((code: Language) => ({
    id: code,
    label: LANGUAGE_LABELS[code],
  }));

  return (
    <Dropdown
      title={t('language.title')}
      options={options}
      value={language}
      onPick={(id) => setLanguage(id as Language)}
      right
      style={style}
    >
      {variant === 'pill' ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>{LANGUAGE_SHORT[language]}</Text>
          <Ionicons name="chevron-down" size={12} color={Colors.textSecondary} />
        </View>
      ) : (
        <View style={styles.inline}>
          <Text style={styles.inlineText}>{LANGUAGE_LABELS[language]}</Text>
          <Ionicons name="chevron-expand" size={16} color={Colors.textTertiary} />
        </View>
      )}
    </Dropdown>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.whiteAlpha55,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.whiteAlpha75,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: Colors.textSecondary,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
