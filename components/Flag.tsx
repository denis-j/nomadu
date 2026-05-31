import CountryFlag from 'react-native-country-flag';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface FlagProps {
  /** ISO-3166 alpha-2 country code (case-insensitive). */
  code: string;
  /** Display height in pt. Width follows the flag's aspect ratio. */
  size?: number;
  /**
   * Adds a subtle rounded corner + hairline border so the flag sits nicely
   * inside cards. Set `false` for a flat raw look (e.g. inside a circular bubble).
   */
  rounded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Centralised flag renderer. Replaces emoji flag strings — gives us crisp
 * SVG-quality on every device, and the same look in dev simulator and prod.
 *
 *   <Flag code="US" size={24} />
 *   <Flag code="th" size={18} rounded={false} />
 */
export function Flag({ code, size = 22, rounded = true, style }: FlagProps) {
  const isoCode = code?.toLowerCase() ?? '';
  if (!isoCode || isoCode.length !== 2) return null;

  return (
    <View
      style={[
        rounded && styles.rounded,
        style,
      ]}
    >
      <CountryFlag isoCode={isoCode} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  rounded: {
    borderRadius: 4,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
