import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/**
 * The one way to type something into this app, as on the sign-in screen: a
 * glass card, a row per field, the placeholder naming the field. Do not put a
 * TextInput anywhere else; see "UI rules" in AGENTS.md.
 */
export function FormCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback, style]}>{children}</Glass>;
}

export function FormSeparator() {
  return <View style={styles.separator} />;
}

interface FormFieldProps extends TextInputProps {
  /** Only for a search: the magnifier. */
  leading?: ReactNode;
  /** One small control at the end of the row: show password, clear, send, a currency. */
  trailing?: ReactNode;
}

export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  { leading, trailing, style, multiline, ...props },
  ref,
) {
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput);
  return (
    <Pressable onPress={() => input.current?.focus()} style={[styles.row, multiline && styles.rowMultiline]}>
      {leading}
      <TextInput
        ref={input}
        placeholderTextColor={Colors.textTertiary}
        accessibilityLabel={props.placeholder}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : undefined}
        {...props}
        style={[styles.input, multiline && styles.inputMultiline, style]}
      />
      {trailing}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 4,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  cardFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderColor: Colors.border,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: -20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  rowMultiline: { alignItems: 'flex-start' },
  input: {
    ...Typography.titleSmall,
    fontWeight: '400',
    flex: 1,
    padding: 0,
  },
  inputMultiline: { minHeight: 80 },
});
