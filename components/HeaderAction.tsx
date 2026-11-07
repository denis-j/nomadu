import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Colors, systemColor } from '../constants/colors';

/**
 * The one way a sheet moves on: top right in its native header. A checkmark
 * saves, an arrow goes to the next step.
 *
 * `disabled` takes no taps. `dim` looks disabled but still takes them, for a
 * form that says on the tap what is missing.
 */
export function HeaderAction({
  onPress,
  label,
  next,
  disabled,
  dim,
  busy,
}: {
  onPress: () => void;
  label: string;
  next?: boolean;
  disabled?: boolean;
  dim?: boolean;
  busy?: boolean;
}) {
  if (busy) return <ActivityIndicator size="small" color={Colors.textSecondary} accessibilityLabel={label} />;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [(disabled || dim) && styles.dimmed, pressed && styles.pressed]}
    >
      <SymbolView
        name={next ? { ios: 'arrow.right', android: 'arrow_forward' } : { ios: 'checkmark', android: 'check' }}
        tintColor={systemColor('label')}
        weight="semibold"
        size={next ? 20 : 22}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
});
