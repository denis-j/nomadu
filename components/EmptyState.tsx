import { useCallback, useState, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { CloudyButton } from './CloudyButton';
import { StatsBars } from './StatsBars';
import { TimelineBubbles, type BubbleIcon } from './TimelineBubbles';

interface EmptyAction {
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

interface EmptyStateProps {
  /** Three icons for the bubbles: left, centre (the blue one), right. */
  icons?: [BubbleIcon, BubbleIcon, BubbleIcon];
  /** The growing bars instead of the bubbles, for the tracking numbers. */
  bars?: boolean;
  title: string;
  subtitle: string;
  /** The way in, when there is something to do here. */
  primary?: EmptyAction;
  /** A second way in, under the first. */
  secondary?: EmptyAction;
  /** Something follows it on the page (guides, ideas), which keeps clear of the tab bar itself. */
  inline?: boolean;
  /** On a tab root with a large title: iOS runs the screen on behind it, so keep clear of it to stay centred. */
  belowLargeTitle?: boolean;
}

/**
 * The one way to say that nothing is here yet: the moving picture, a bold
 * title, a grey line, and the way in as a cloud button when there is one. Do
 * not build another; see "UI rules" in AGENTS.md. Inside a ScrollView give the
 * content container `flexGrow: 1` to centre it.
 */
export function EmptyState({ icons, bars, title, subtitle, primary, secondary, inline, belowLargeTitle }: EmptyStateProps) {
  const insets = useSafeAreaInsets();
  // A new key each time the screen gains focus plays the picture again.
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );

  return (
    <View style={[styles.container, inline && styles.inline, belowLargeTitle && Platform.OS === 'ios' && { paddingTop: insets.top + LARGE_HEADER_HEIGHT + 32 }]}>
      {bars ? (
        <StatsBars key={focusKey} size={80} variant="burstWobble" />
      ) : (
        <TimelineBubbles key={focusKey} size={70} variant="burstWobble" icons={icons} />
      )}

      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.subtitle, primary && styles.subtitleBeforeButton]}>{subtitle}</Text>

      {primary && (
        <CloudyButton onPress={primary.onPress} innerStyle={styles.primaryInner}>
          {primary.icon && <Ionicons name={primary.icon} size={22} color={Colors.cloudyButtonText} />}
          <Text style={styles.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{primary.label}</Text>
        </CloudyButton>
      )}

      {secondary && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            secondary.onPress();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
        >
          {secondary.icon && <Ionicons name={secondary.icon} size={20} color={Colors.text} />}
          <Text style={styles.secondaryText}>{secondary.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** The bar and the large title on iOS, below the status bar. */
const LARGE_HEADER_HEIGHT = 96;

const styles = StyleSheet.create({
  // The screen runs on under the floating tab bar: the extra space at the
  // bottom centres the content in what can be seen.
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 116, gap: 14 },
  inline: { paddingBottom: 32 },
  title: { ...Typography.titleLarge, textAlign: 'center', letterSpacing: -0.4, marginTop: 8 },
  subtitle: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  subtitleBeforeButton: { marginBottom: 12 },
  primaryInner: { justifyContent: 'center', gap: 10 },
  primaryText: { ...Typography.titleSmall, fontWeight: '700', color: Colors.cloudyButtonText, flexShrink: 1 },
  secondary: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Colors.border,
  },
  secondaryPressed: { opacity: 0.55 },
  secondaryText: { ...Typography.button },
});
